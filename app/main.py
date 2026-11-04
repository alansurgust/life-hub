import os
import io
import csv
import json
import socket
import logging
import datetime
import calendar
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, Query, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse

from app.database import get_db_connection, init_db
from app.models import (
    TransactionCreate, TransactionUpdate, SettingsUpdate, RawTextUpload, UserRuleCreate, CategoryUpdate,
    TodoCreate, TodoUpdate, TodoStatusUpdate, HabitCreate, HabitUpdate, JournalEntryCreate, NoteCreate, NoteUpdate
)
from app.parsers.csv_parser import parse_csv_statement
from app.parsers.excel_parser import parse_excel_statement
from app.parsers.pdf_parser import parse_pdf_statement
from app.parsers.text_parser import parse_raw_text_statement
from app.parsers.normalizer import parse_vietnamese_date, is_duplicate_transaction
from app.ai.categorizer import batch_categorize_transactions, learn_user_rule

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize DB on start
init_db()

app = FastAPI(title="Finance - Quản Lý & Thống Kê Chi Tiêu AI", version="2.0.0")

# Enable CORS for flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")

# ----------------- STATS APIS -----------------

@app.get("/api/stats/overview")
def get_stats_overview(month: Optional[str] = Query(None)):
    """Returns overview KPI metrics for the selected month or all time."""
    conn = get_db_connection()
    c = conn.cursor()

    # Get available months list
    c.execute("SELECT DISTINCT month FROM transactions ORDER BY month DESC")
    available_months = [row["month"] for row in c.fetchall()]

    # If no month specified, default to latest month in DB
    selected_month = month
    if not selected_month and available_months:
        selected_month = available_months[0]

    where_clause = ""
    params = []
    if selected_month and selected_month != "all":
        where_clause = "WHERE month = ?"
        params = [selected_month]

    # Calculate Total Income
    c.execute(f"SELECT COALESCE(SUM(amount), 0) FROM transactions {where_clause} {'AND' if where_clause else 'WHERE'} type = 'income'", params)
    total_income = c.fetchone()[0]

    # Calculate Total Expense
    c.execute(f"SELECT COALESCE(SUM(amount), 0) FROM transactions {where_clause} {'AND' if where_clause else 'WHERE'} type = 'expense'", params)
    total_expense = c.fetchone()[0]

    # Transaction count
    c.execute(f"SELECT COUNT(*) FROM transactions {where_clause}", params)
    total_transactions = c.fetchone()[0]

    # Top spending category
    c.execute(f"""
        SELECT category, SUM(amount) as cat_total 
        FROM transactions 
        {where_clause} {'AND' if where_clause else 'WHERE'} type = 'expense'
        GROUP BY category 
        ORDER BY cat_total DESC 
        LIMIT 1
    """, params)
    top_cat_row = c.fetchone()
    top_category = {
        "name": top_cat_row["category"] if top_cat_row else "Chưa có",
        "amount": top_cat_row["cat_total"] if top_cat_row else 0,
        "percentage": round((top_cat_row["cat_total"] / total_expense * 100), 1) if (top_cat_row and total_expense > 0) else 0
    }

    net_balance = total_income - total_expense
    savings_rate = round((net_balance / total_income * 100), 1) if total_income > 0 else 0.0

    conn.close()

    return {
        "selected_month": selected_month or "all",
        "available_months": available_months,
        "total_income": total_income,
        "total_expense": total_expense,
        "net_balance": net_balance,
        "savings_rate": savings_rate,
        "total_transactions": total_transactions,
        "top_category": top_category
    }

@app.get("/api/stats/monthly")
def get_stats_monthly():
    """Returns monthly income, expense and balance timeline for charts."""
    conn = get_db_connection()
    c = conn.cursor()

    c.execute("""
        SELECT 
            month,
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
        FROM transactions
        GROUP BY month
        ORDER BY month ASC
    """)
    rows = c.fetchall()
    conn.close()

    result = []
    for r in rows:
        inc = r["income"] or 0
        exp = r["expense"] or 0
        result.append({
            "month": r["month"],
            "income": inc,
            "expense": exp,
            "balance": inc - exp
        })
    return result

@app.get("/api/stats/weekly")
def get_stats_weekly(month: Optional[str] = Query(None)):
    """Returns weekly expense and income breakdown for a selected month."""
    conn = get_db_connection()
    c = conn.cursor()

    # If no month specified, pick latest
    if not month or month == "all":
        c.execute("SELECT month FROM transactions ORDER BY month DESC LIMIT 1")
        m_row = c.fetchone()
        month = m_row["month"] if m_row else ""

    if not month:
        conn.close()
        return []

    c.execute("""
        SELECT 
            week,
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense,
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
            COUNT(*) as count
        FROM transactions
        WHERE month = ?
        GROUP BY week
        ORDER BY week ASC
    """, (month,))
    rows = c.fetchall()
    conn.close()

    result = []
    for idx, r in enumerate(rows, start=1):
        result.append({
            "week_label": f"Tuần {idx}",
            "week_code": r["week"],
            "expense": r["expense"] or 0,
            "income": r["income"] or 0,
            "count": r["count"]
        })
    return result

@app.get("/api/stats/categories")
def get_stats_categories(month: Optional[str] = Query(None), type: str = "expense"):
    """Returns category breakdown with percentages and colors for Pie / Donut Chart."""
    conn = get_db_connection()
    c = conn.cursor()

    where_clause = "WHERE t.type = ?"
    params = [type]

    if month and month != "all":
        where_clause += " AND t.month = ?"
        params.append(month)

    query = f"""
        SELECT 
            t.category,
            COALESCE(c.color, '#64748b') as color,
            COALESCE(c.icon, 'tag') as icon,
            SUM(t.amount) as total_amount,
            COUNT(t.id) as count
        FROM transactions t
        LEFT JOIN categories c ON t.category = c.name
        {where_clause}
        GROUP BY t.category
        ORDER BY total_amount DESC
    """
    c.execute(query, params)
    rows = c.fetchall()

    total_sum = sum(r["total_amount"] for r in rows) if rows else 0.0

    result = []
    for r in rows:
        amt = r["total_amount"]
        pct = round((amt / total_sum * 100), 1) if total_sum > 0 else 0.0
        result.append({
            "category": r["category"],
            "color": r["color"],
            "icon": r["icon"],
            "amount": amt,
            "count": r["count"],
            "percentage": pct
        })

    conn.close()
    return {"total": total_sum, "breakdown": result}

# ----------------- TRANSACTIONS APIS -----------------

@app.get("/api/transactions")
def get_transactions(
    month: Optional[str] = Query(None),
    week: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = 100,
    offset: int = 0
):
    conn = get_db_connection()
    c = conn.cursor()

    filters = []
    params = []

    if month and month != "all":
        filters.append("t.month = ?")
        params.append(month)
    if week and week != "all":
        filters.append("t.week = ?")
        params.append(week)
    if category and category != "all":
        filters.append("t.category = ?")
        params.append(category)
    if type and type != "all":
        filters.append("t.type = ?")
        params.append(type)
    if search:
        filters.append("(t.description LIKE ? OR t.raw_description LIKE ? OR t.ref_no LIKE ?)")
        s_pat = f"%{search}%"
        params.extend([s_pat, s_pat, s_pat])

    where_str = ("WHERE " + " AND ".join(filters)) if filters else ""

    # Count total
    c.execute(f"SELECT COUNT(*) FROM transactions t {where_str}", params)
    total_count = c.fetchone()[0]

    # Select transactions
    query = f"""
        SELECT 
            t.id, t.statement_id, t.date, t.month, t.week, t.type,
            t.amount, t.category, t.description, t.raw_description,
            t.ref_no, t.balance, t.ai_confidence, t.is_manual_category,
            COALESCE(c.color, '#64748b') as color,
            COALESCE(c.icon, 'tag') as icon
        FROM transactions t
        LEFT JOIN categories c ON t.category = c.name
        {where_str}
        ORDER BY t.date DESC, t.id DESC
        LIMIT ? OFFSET ?
    """
    c.execute(query, params + [limit, offset])
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    return {"total": total_count, "items": rows}

@app.post("/api/transactions")
def create_transaction(item: TransactionCreate):
    date_iso, month_iso, week_iso = parse_vietnamese_date(item.date)

    conn = get_db_connection()
    c = conn.cursor()
    trans_uid = f"{date_iso}||{item.amount}||{item.type}||{item.description}"
    c.execute("DELETE FROM deleted_records WHERE table_name = 'transactions' AND record_uid = ?", (trans_uid,))
    c.execute("""
        INSERT INTO transactions (
            date, month, week, type, amount, category, 
            description, raw_description, ref_no, is_manual_category, ai_confidence, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1.0, CURRENT_TIMESTAMP)
    """, (
        date_iso, month_iso, week_iso, item.type, item.amount, item.category,
        item.description, item.raw_description or item.description, item.ref_no or ""
    ))
    new_id = c.lastrowid
    conn.commit()
    conn.close()

    learn_user_rule(item.description, item.category)
    return {"status": "success", "id": new_id}

@app.put("/api/transactions/{trans_id}")
def update_transaction(trans_id: int, item: TransactionUpdate):
    conn = get_db_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM transactions WHERE id = ?", (trans_id,))
    current = c.fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found")

    date_iso = current["date"]
    month_iso = current["month"]
    week_iso = current["week"]
    if item.date:
        date_iso, month_iso, week_iso = parse_vietnamese_date(item.date)

    new_amount = item.amount if item.amount is not None else current["amount"]
    new_type = item.type if item.type is not None else current["type"]
    new_category = item.category if item.category is not None else current["category"]
    new_desc = item.description if item.description is not None else current["description"]
    is_manual = item.is_manual_category if item.is_manual_category is not None else current["is_manual_category"]

    c.execute("""
        UPDATE transactions
        SET date = ?, month = ?, week = ?, amount = ?, type = ?, category = ?, description = ?, is_manual_category = ?, ai_confidence = 1.0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (date_iso, month_iso, week_iso, new_amount, new_type, new_category, new_desc, is_manual, trans_id))
    conn.commit()
    conn.close()

    # Automatically learn from user category correction
    if item.category and item.category != current["category"]:
        learn_user_rule(new_desc, item.category)

    return {"status": "success"}

@app.put("/api/transactions/{trans_id}/category")
def update_transaction_category(trans_id: int, payload: CategoryUpdate):
    new_category = payload.category
    if not new_category:
        raise HTTPException(status_code=400, detail="Category is required")

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM transactions WHERE id = ?", (trans_id,))
    current = c.fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found")

    c.execute("""
        UPDATE transactions
        SET category = ?, is_manual_category = 1, ai_confidence = 1.0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (new_category, trans_id))
    conn.commit()

    # Re-fetch updated row with category color & icon
    c.execute("""
        SELECT t.*, COALESCE(c.color, '#64748b') as color, COALESCE(c.icon, 'tag') as icon
        FROM transactions t
        LEFT JOIN categories c ON t.category = c.name
        WHERE t.id = ?
    """, (trans_id,))
    updated_row = dict(c.fetchone())
    conn.close()

    # Learn user rule
    desc = updated_row.get("description") or updated_row.get("raw_description") or ""
    learn_user_rule(desc, new_category)

    target_column = "other" if new_category == "Khác" else "categorized"

    return {
        "status": "success",
        "id": trans_id,
        "category": new_category,
        "target_column": target_column,
        "transaction": updated_row
    }

@app.get("/api/transactions/columns")
def get_transaction_columns(
    month: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    """
    Returns transactions organized into 3 columns:
    1. 'categorized' (Đã phân loại): category NOT IN ('Khác', 'Chưa phân loại') AND (is_manual_category = 1 OR ai_confidence >= 0.65)
    2. 'unclassified' (Chưa phân loại): (is_manual_category = 0 AND (ai_confidence < 0.65 OR category = 'Chưa phân loại'))
    3. 'other' (Khác): category = 'Khác' AND (is_manual_category = 1 OR ai_confidence >= 0.65)
    """
    conn = get_db_connection()
    c = conn.cursor()

    base_filters = []
    base_params = []

    if month and month != "all":
        base_filters.append("t.month = ?")
        base_params.append(month)
    if type and type != "all":
        base_filters.append("t.type = ?")
        base_params.append(type)
    if search:
        base_filters.append("(t.description LIKE ? OR t.raw_description LIKE ? OR t.ref_no LIKE ?)")
        s_pat = f"%{search}%"
        base_params.extend([s_pat, s_pat, s_pat])

    filter_sql = (" AND " + " AND ".join(base_filters)) if base_filters else ""

    select_clause = """
        SELECT 
            t.id, t.statement_id, t.date, t.month, t.week, t.type,
            t.amount, t.category, t.description, t.raw_description,
            t.ref_no, t.balance, t.ai_confidence, t.is_manual_category,
            COALESCE(c.color, '#64748b') as color,
            COALESCE(c.icon, 'tag') as icon
        FROM transactions t
        LEFT JOIN categories c ON t.category = c.name
    """

    # 1. Categorized
    q_cat = f"{select_clause} WHERE (t.category NOT IN ('Khác', 'Chưa phân loại') AND (t.is_manual_category = 1 OR t.ai_confidence >= 0.65)) {filter_sql} ORDER BY t.date DESC, t.id DESC"
    c.execute(q_cat, base_params)
    categorized_items = [dict(r) for r in c.fetchall()]

    # 2. Unclassified (< 65% confidence or unassigned)
    q_unclass = f"{select_clause} WHERE (t.is_manual_category = 0 AND (t.ai_confidence < 0.65 OR t.category = 'Chưa phân loại')) {filter_sql} ORDER BY t.date DESC, t.id DESC"
    c.execute(q_unclass, base_params)
    unclassified_items = [dict(r) for r in c.fetchall()]

    # 3. Other ('Khác' that user confirmed or AI high confidence)
    q_other = f"{select_clause} WHERE (t.category = 'Khác' AND (t.is_manual_category = 1 OR t.ai_confidence >= 0.65)) {filter_sql} ORDER BY t.date DESC, t.id DESC"
    c.execute(q_other, base_params)
    other_items = [dict(r) for r in c.fetchall()]

    conn.close()

    cat_total = sum(x["amount"] for x in categorized_items if x["type"] == "expense")
    unclass_total = sum(x["amount"] for x in unclassified_items if x["type"] == "expense")
    other_total = sum(x["amount"] for x in other_items if x["type"] == "expense")

    return {
        "categorized": categorized_items,
        "unclassified": unclassified_items,
        "other": other_items,
        "stats": {
            "categorized_count": len(categorized_items),
            "categorized_amount": cat_total,
            "unclassified_count": len(unclassified_items),
            "unclassified_amount": unclass_total,
            "other_count": len(other_items),
            "other_amount": other_total,
            "total_count": len(categorized_items) + len(unclassified_items) + len(other_items)
        }
    }

@app.delete("/api/transactions/{trans_id}")
def delete_transaction(trans_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT date, amount, type, description FROM transactions WHERE id = ?", (trans_id,))
    row = c.fetchone()
    if row:
        uid = f"{row['date']}||{row['amount']}||{row['type']}||{row['description']}"
        c.execute("INSERT OR REPLACE INTO deleted_records (table_name, record_uid) VALUES ('transactions', ?)", (uid,))
        c.execute("DELETE FROM transactions WHERE id = ?", (trans_id,))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Đã xóa giao dịch thành công"}

# ----------------- UPLOAD & STATEMENT INGESTION APIS -----------------

@app.post("/api/upload/statement")
async def upload_statement(
    file: UploadFile = File(...),
    bank_name: str = Form("Ngân hàng"),
    statement_month: Optional[str] = Form(None)
):
    """
    Accepts PDF, Excel (.xlsx, .xls), or CSV bank statement file.
    Parses and auto-categorizes via AI rules + LLM fallback.
    """
    content = await file.read()
    filename = file.filename.lower()

    parsed = []
    try:
        if filename.endswith(".csv"):
            parsed = parse_csv_statement(content, default_month=statement_month)
        elif filename.endswith((".xlsx", ".xls")):
            parsed = parse_excel_statement(content, default_month=statement_month)
        elif filename.endswith(".pdf"):
            parsed = parse_pdf_statement(content, default_month=statement_month)
        else:
            parsed = parse_raw_text_statement(content.decode("utf-8", errors="ignore"), default_month=statement_month)
    except Exception as parse_err:
        logger.error(f"Error in primary parser for {filename}: {parse_err}")

    # Fallback: If primary parser failed or returned 0 items on an Excel/CSV file,
    # try decoding text and using raw text parser
    if not parsed:
        try:
            text_candidate = ""
            for enc in ['utf-8', 'utf-8-sig', 'cp1258', 'latin-1']:
                try:
                    text_candidate = content.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            if text_candidate:
                parsed = parse_raw_text_statement(text_candidate, default_month=statement_month)
        except Exception:
            pass

    if not parsed:
        raise HTTPException(
            status_code=400, 
            detail=f"Không phát hiện giao dịch nào từ file '{file.filename}'. Vui lòng kiểm tra file có đúng bảng sao kê (chứa cột Ngày và Số tiền) hoặc dùng tab 'Dán tin nhắn / SMS' để dán trực tiếp nội dung sao kê."
        )

    # Deduce date range & statement month
    dates = [t["date"] for t in parsed if t.get("date")]
    min_date = min(dates) if dates else "2026-11-01"
    max_date = max(dates) if dates else "2026-11-02"
    min_month = min_date[:7]
    max_month = max_date[:7]
    statement_range = f"{min_month} ~ {max_month}" if min_month != max_month else min_month

    # Connect to DB and check for duplicate transactions
    conn = get_db_connection()
    c = conn.cursor()

    c.execute("""
        SELECT id, date, type, amount, description, raw_description, ref_no, balance 
        FROM transactions 
        WHERE date >= ? AND date <= ?
    """, (min_date, max_date))
    existing_rows = [dict(r) for r in c.fetchall()]

    existing_by_date = {}
    for ex in existing_rows:
        d = ex["date"]
        existing_by_date.setdefault(d, []).append(ex)

    # Filter out duplicates
    new_transactions = []
    duplicate_count = 0

    for t in parsed:
        d = t.get("date", "")
        day_existing = existing_by_date.get(d, [])
        if is_duplicate_transaction(t, day_existing):
            duplicate_count += 1
        else:
            new_transactions.append(t)
            day_existing.append(t)
            existing_by_date[d] = day_existing

    # If all items were duplicates
    if not new_transactions:
        conn.close()
        return {
            "status": "warning",
            "message": f"Tất cả {duplicate_count} giao dịch trong file sao kê này đã được lưu từ trước (đã tự động bỏ qua để tránh trùng lặp).",
            "transaction_count": 0,
            "duplicate_count": duplicate_count,
            "month": statement_range,
            "total_in": 0,
            "total_out": 0
        }

    # AI Auto-Categorize batch ONLY for newly detected transactions
    categorized = await batch_categorize_transactions(new_transactions, use_ai=True)

    total_in = sum(t["amount"] for t in categorized if t["type"] == "income")
    total_out = sum(t["amount"] for t in categorized if t["type"] == "expense")

    c.execute("""
        INSERT INTO statements (filename, bank_name, statement_month, total_in, total_out, transaction_count)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (file.filename, bank_name, statement_range, total_in, total_out, len(categorized)))
    statement_id = c.lastrowid

    for t in categorized:
        c.execute("""
            INSERT INTO transactions (
                statement_id, date, month, week, type, amount, category, 
                description, raw_description, ref_no, balance, ai_confidence, is_manual_category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            statement_id, t["date"], t["month"], t["week"], t["type"], t["amount"], t["category"],
            t["description"], t.get("raw_description", ""), t.get("ref_no", ""),
            t.get("balance"), t.get("ai_confidence", 0.8), t.get("is_manual_category", 0)
        ))

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "statement_id": statement_id,
        "filename": file.filename,
        "month": statement_range,
        "transaction_count": len(categorized),
        "duplicate_count": duplicate_count,
        "total_in": total_in,
        "total_out": total_out,
        "message": f"Đã thêm {len(categorized)} giao dịch mới ({duplicate_count} giao dịch trùng lặp đã tự động bỏ qua)."
    }

@app.post("/api/upload/text")
async def upload_raw_text(payload: RawTextUpload):
    """Parses pasted raw SMS / bank notifications text with duplicate check."""
    parsed = parse_raw_text_statement(payload.text, default_month=payload.statement_month)
    if not parsed:
        raise HTTPException(status_code=400, detail="Không tìm thấy giao dịch hợp lệ trong đoạn văn bản.")

    dates = [t["date"] for t in parsed if t.get("date")]
    min_date = min(dates) if dates else "2026-11-01"
    max_date = max(dates) if dates else "2026-11-02"
    min_month = min_date[:7]
    max_month = max_date[:7]
    stmt_month = f"{min_month} ~ {max_month}" if min_month != max_month else min_month

    conn = get_db_connection()
    c = conn.cursor()

    c.execute("""
        SELECT id, date, type, amount, description, raw_description, ref_no, balance 
        FROM transactions 
        WHERE date >= ? AND date <= ?
    """, (min_date, max_date))
    existing_rows = [dict(r) for r in c.fetchall()]

    existing_by_date = {}
    for ex in existing_rows:
        d = ex["date"]
        existing_by_date.setdefault(d, []).append(ex)

    new_transactions = []
    duplicate_count = 0

    for t in parsed:
        d = t.get("date", "")
        day_existing = existing_by_date.get(d, [])
        if is_duplicate_transaction(t, day_existing):
            duplicate_count += 1
        else:
            new_transactions.append(t)
            day_existing.append(t)
            existing_by_date[d] = day_existing

    if not new_transactions:
        conn.close()
        return {
            "status": "warning",
            "message": f"Tất cả {duplicate_count} giao dịch này đã tồn tại trong hệ thống (đã bỏ qua trùng lặp).",
            "transaction_count": 0,
            "duplicate_count": duplicate_count,
            "month": stmt_month,
            "total_in": 0,
            "total_out": 0
        }

    categorized = await batch_categorize_transactions(new_transactions, use_ai=True)

    total_in = sum(t["amount"] for t in categorized if t["type"] == "income")
    total_out = sum(t["amount"] for t in categorized if t["type"] == "expense")

    c.execute("""
        INSERT INTO statements (filename, bank_name, statement_month, total_in, total_out, transaction_count)
        VALUES (?, ?, ?, ?, ?, ?)
    """, ("Văn bản dán trực tiếp", payload.bank_name or "Ngân hàng", stmt_month, total_in, total_out, len(categorized)))
    statement_id = c.lastrowid

    for t in categorized:
        c.execute("""
            INSERT INTO transactions (
                statement_id, date, month, week, type, amount, category, 
                description, raw_description, ref_no, balance, ai_confidence, is_manual_category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            statement_id, t["date"], t["month"], t["week"], t["type"], t["amount"], t["category"],
            t["description"], t.get("raw_description", ""), t.get("ref_no", ""),
            t.get("balance"), t.get("ai_confidence", 0.8), 0
        ))

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "statement_id": statement_id,
        "month": stmt_month,
        "transaction_count": len(categorized),
        "duplicate_count": duplicate_count,
        "total_in": total_in,
        "total_out": total_out,
        "message": f"Đã thêm {len(categorized)} giao dịch mới ({duplicate_count} giao dịch trùng lặp đã tự động bỏ qua)."
    }

@app.post("/api/reset-all")
def reset_all_data():
    """Resets all transactions and uploaded statements cleanly."""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM transactions")
    c.execute("DELETE FROM statements")
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Đã xóa sạch toàn bộ giao dịch và sao kê trong hệ thống."}

@app.post("/api/ai/categorize-pending")
async def categorize_pending():
    """Forces AI re-categorization on any transaction labeled 'Khác' or low confidence."""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        SELECT id, description, raw_description, amount, type, category, is_manual_category
        FROM transactions
        WHERE is_manual_category = 0 AND (category = 'Khác' OR ai_confidence < 0.75)
        LIMIT 50
    """)
    rows = [dict(r) for r in c.fetchall()]
    if not rows:
        conn.close()
        return {"status": "success", "updated_count": 0, "message": "Tất cả giao dịch đã được phân loại chính xác!"}

    updated = await batch_categorize_transactions(rows, use_ai=True)

    count = 0
    for item in updated:
        if item["category"] != "Khác":
            c.execute("""
                UPDATE transactions 
                SET category = ?, ai_confidence = ?
                WHERE id = ?
            """, (item["category"], item.get("ai_confidence", 0.9), item["id"]))
            count += 1

    conn.commit()
    conn.close()
    return {"status": "success", "updated_count": count}

# ----------------- SETTINGS & CATEGORIES & RULES APIS -----------------

@app.get("/api/categories")
def get_categories():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM categories ORDER BY type DESC, name ASC")
    cats = [dict(r) for r in c.fetchall()]
    conn.close()
    return cats

@app.get("/api/rules")
def get_rules():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM user_rules ORDER BY created_at DESC")
    rules = [dict(r) for r in c.fetchall()]
    conn.close()
    return rules

@app.post("/api/rules")
def add_rule(rule: UserRuleCreate):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO user_rules (pattern, category)
        VALUES (?, ?)
        ON CONFLICT(pattern) DO UPDATE SET category = excluded.category
    """, (rule.pattern.lower().strip(), rule.category))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.delete("/api/rules/{rule_id}")
def delete_rule(rule_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM user_rules WHERE id = ?", (rule_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.get("/api/settings")
def get_settings():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT key, value FROM settings")
    settings = {r["key"]: r["value"] for r in c.fetchall()}
    conn.close()
    # Mask API keys for security in UI display
    masked = dict(settings)
    if masked.get("gemini_api_key"):
        k = masked["gemini_api_key"]
        masked["gemini_api_key_masked"] = k[:4] + "..." + k[-4:] if len(k) > 8 else "***"
    if masked.get("openai_api_key"):
        k = masked["openai_api_key"]
        masked["openai_api_key_masked"] = k[:4] + "..." + k[-4:] if len(k) > 8 else "***"
    return masked

@app.post("/api/settings")
def update_settings(payload: SettingsUpdate):
    conn = get_db_connection()
    c = conn.cursor()
    updates = payload.dict(exclude_unset=True)
    for k, v in updates.items():
        if v is not None:
            c.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (k, v))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.get("/api/statements")
def get_statements():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM statements ORDER BY uploaded_at DESC")
    stmts = [dict(r) for r in c.fetchall()]
    conn.close()
    return stmts

@app.delete("/api/statements/{statement_id}")
def delete_statement(statement_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    # Delete transactions associated with statement
    c.execute("DELETE FROM transactions WHERE statement_id = ?", (statement_id,))
    c.execute("DELETE FROM statements WHERE id = ?", (statement_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

# ----------------- SEED SAMPLE DEMO DATA -----------------

@app.post("/api/seed-sample-data")
async def seed_sample_data():
    """Generates realistic Vietnamese banking data across 3 consecutive months for testing."""
    sample_records = [
        # Tháng 11/2026
        {"date": "2026-11-01", "type": "income", "amount": 28000000, "category": "Lương & Thu nhập", "description": "CONG TY TECH VN TRA LUONG T10/2026", "raw": "VCB.10293.CONG TY TECH VN TRA LUONG T10/2026"},
        {"date": "2026-11-02", "type": "expense", "amount": 6500000, "category": "Nhà ở & Sinh hoạt", "description": "TIEN NHA THANG 11 CHUNG CU ECOPARK", "raw": "MB.9381.TIEN NHA THANG 11 CHUNG CU ECOPARK"},
        {"date": "2026-11-03", "type": "expense", "amount": 1250000, "category": "Hóa đơn & Tiện ích", "description": "TIEN DIEN EVN T10", "raw": "TT TIEN DIEN EVN T10 MA KH PE02001928"},
        {"date": "2026-11-04", "type": "expense", "amount": 85000, "category": "Ăn uống", "description": "TT QR SHOPEEFOOD COM TAM", "raw": "TT QR SHOPEEFOOD COM TAM DEM 1029"},
        {"date": "2026-11-05", "type": "expense", "amount": 55000, "category": "Ăn uống", "description": "HIGHLANDS COFFEE HO GUOM", "raw": "POS HIGHLANDS COFFEE HO GUOM 1289"},
        {"date": "2026-11-06", "type": "expense", "amount": 420000, "category": "Mua sắm", "description": "WINMART+ THUC PHAM TUOI", "raw": "WINMART+ THUC PHAM TUOI SO GD 9182"},
        {"date": "2026-11-07", "type": "expense", "amount": 75000, "category": "Di chuyển", "description": "GRAB RIDE DI LAM", "raw": "GRAB*VN*RIDE 918237"},
        {"date": "2026-11-08", "type": "expense", "amount": 650000, "category": "Ăn uống", "description": "NHA HANG LAU HAIDILAO", "raw": "POS HAIDILAO HOTPOT VINCOM"},
        {"date": "2026-11-10", "type": "expense", "amount": 260000, "category": "Giải trí & Du lịch", "description": "NETFLIX.COM MONTHLY SUB", "raw": "NETFLIX.COM LUXEMBOURG"},
        {"date": "2026-11-12", "type": "expense", "amount": 500000, "category": "Di chuyển", "description": "PETROLIMEX DO XANG OTO", "raw": "PETROLIMEX CTY XANG DAU SO 1"},
        {"date": "2026-11-14", "type": "expense", "amount": 1800000, "category": "Mua sắm", "description": "UNIQLO AO KHOAC VA SO MI", "raw": "UNIQLO VINCOM TRAN DUY HUNG"},
        {"date": "2026-11-16", "type": "income", "amount": 3500000, "category": "Thưởng & Hoa hồng", "description": "THUONG DU AN KPI Q3", "raw": "CTY TECH VN THUONG DU AN KPI"},
        {"date": "2026-11-18", "type": "expense", "amount": 350000, "category": "Sức khỏe & Y tế", "description": "PHARMACITY THUOC VA VITAMIN", "raw": "NHA THUOC PHARMACITY CHI NHANH 24"},
        {"date": "2026-11-20", "type": "expense", "amount": 1200000, "category": "Giáo dục & Học tập", "description": "KHOA HOC TIENG ANH TOEIC", "raw": "CHUYEN KHOAN HOC PHI TIENG ANH"},
        {"date": "2026-11-22", "type": "expense", "amount": 5000000, "category": "Đầu tư & Tiết kiệm", "description": "GUI TIET KIEM ONLINE KY HAN 6T", "raw": "VCB TIET KIEM TRUC TUYEN"},
        {"date": "2026-11-24", "type": "expense", "amount": 250000, "category": "Hóa đơn & Tiện ích", "description": "INTERNET FPT TELECOM T11", "raw": "FPT TELECOM CUC THUE MA KH HNI128"},
        {"date": "2026-11-26", "type": "expense", "amount": 95000, "category": "Ăn uống", "description": "PHUC LONG TEA & COFFEE", "raw": "PHUC LONG VINCOM NG CHI THANH"},
        {"date": "2026-11-28", "type": "expense", "amount": 1500000, "category": "Gia đình & Cá nhân", "description": "BIEU BO ME TIEN TIEU VAT", "raw": "CHUYEN KHOAN BIEU BO ME"},

        # Tháng 10/2026
        {"date": "2026-10-01", "type": "income", "amount": 27500000, "category": "Lương & Thu nhập", "description": "CONG TY TECH VN TRA LUONG T9/2026", "raw": "VCB.8812.CONG TY TECH VN TRA LUONG"},
        {"date": "2026-10-02", "type": "expense", "amount": 6500000, "category": "Nhà ở & Sinh hoạt", "description": "TIEN NHA THANG 10 CHUNG CU ECOPARK", "raw": "MB.7712.TIEN NHA THANG 10"},
        {"date": "2026-10-03", "type": "expense", "amount": 1180000, "category": "Hóa đơn & Tiện ích", "description": "TIEN DIEN EVN T9", "raw": "EVN HANOI TIEN DIEN SINH HOAT"},
        {"date": "2026-10-06", "type": "expense", "amount": 2300000, "category": "Mua sắm", "description": "SHOPEE DON HANG DO GIA DUNG", "raw": "SHOPEEPAY THANH TOAN DON HANG 8291"},
        {"date": "2026-10-10", "type": "expense", "amount": 1400000, "category": "Giải trí & Du lịch", "description": "CGV CINEMA VA AN TOI CUOI TUAN", "raw": "CGV VINCOM BA TRIEU VE XEM PHIM"},
        {"date": "2026-10-15", "type": "expense", "amount": 800000, "category": "Di chuyển", "description": "XANH SM TAXI DI SAN BAY NOI BAI", "raw": "XANH SM CAR CHUYEN DI SAN BAY"},
        {"date": "2026-10-20", "type": "expense", "amount": 1850000, "category": "Ăn uống", "description": "TIEC SINH NHAT BAN BE GOGI HOUSE", "raw": "GOGI HOUSE BBQ NGUYEN THAI HOC"},
        {"date": "2026-10-25", "type": "expense", "amount": 6000000, "category": "Đầu tư & Tiết kiệm", "description": "MUA CHUNG KHOAN TCBS", "raw": "NAP TIEN VAO TK CHUNG KHOAN TCBS"},

        # Tháng 09/2026
        {"date": "2026-09-01", "type": "income", "amount": 27500000, "category": "Lương & Thu nhập", "description": "CONG TY TECH VN TRA LUONG T8/2026", "raw": "VCB.5543.LUONG THANG 8"},
        {"date": "2026-09-02", "type": "expense", "amount": 6500000, "category": "Nhà ở & Sinh hoạt", "description": "TIEN NHA THANG 9 CHUNG CU ECOPARK", "raw": "MB.6621.TIEN NHA THANG 9"},
        {"date": "2026-09-05", "type": "expense", "amount": 3200000, "category": "Giải trí & Du lịch", "description": "VE MAY BAY VIETJET DA NANG", "raw": "VIETJET AIR BOOKING RES 9182"},
        {"date": "2026-09-12", "type": "expense", "amount": 1600000, "category": "Mua sắm", "description": "BACH HOA XANH THUC PHAM", "raw": "BHX SIEU THI THUC PHAM THANG 9"},
        {"date": "2026-09-18", "type": "expense", "amount": 750000, "category": "Ăn uống", "description": "AN UONG CUOI TUAN QUAN NGON", "raw": "QUAN AN NGON 18 PHAN BOI CHAU"},
        {"date": "2026-09-25", "type": "expense", "amount": 5000000, "category": "Đầu tư & Tiết kiệm", "description": "GUI TIET KIEM VCB 6 THANG", "raw": "VCB TIET KIEM ONLINE"},
    ]

    conn = get_db_connection()
    c = conn.cursor()

    # Clear existing data for a clean seed
    c.execute("DELETE FROM transactions")
    c.execute("DELETE FROM statements")

    # Insert statements for the 3 months
    c.execute("INSERT INTO statements (filename, bank_name, statement_month, total_in, total_out, transaction_count) VALUES (?, ?, ?, ?, ?, ?)",
              ("Sao_ke_mau_T11_2026.xlsx", "Vietcombank", "2026-11", 31500000, 20620000, 18))
    s1_id = c.lastrowid
    c.execute("INSERT INTO statements (filename, bank_name, statement_month, total_in, total_out, transaction_count) VALUES (?, ?, ?, ?, ?, ?)",
              ("Sao_ke_mau_T10_2026.pdf", "Techcombank", "2026-10", 27500000, 20030000, 8))
    s2_id = c.lastrowid
    c.execute("INSERT INTO statements (filename, bank_name, statement_month, total_in, total_out, transaction_count) VALUES (?, ?, ?, ?, ?, ?)",
              ("Sao_ke_mau_T09_2026.csv", "MBBank", "2026-09", 27500000, 17050000, 6))
    s3_id = c.lastrowid

    for r in sample_records:
        d_iso, m_iso, w_iso = parse_vietnamese_date(r["date"])
        stmt_id = s1_id if m_iso == "2026-11" else (s2_id if m_iso == "2026-10" else s3_id)
        c.execute("""
            INSERT INTO transactions (
                statement_id, date, month, week, type, amount, category, 
                description, raw_description, ai_confidence, is_manual_category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.95, 0)
        """, (stmt_id, d_iso, m_iso, w_iso, r["type"], r["amount"], r["category"], r["description"], r["raw"]))

    conn.commit()
    conn.close()

    return {"status": "success", "message": "Đã nạp thành công 32 giao dịch mẫu thực tế qua 3 tháng!"}

# ----------------- CSV EXPORT -----------------

@app.get("/api/export/csv")
def export_csv(month: Optional[str] = Query(None)):
    conn = get_db_connection()
    c = conn.cursor()
    where = "WHERE month = ?" if month and month != "all" else ""
    params = [month] if month and month != "all" else []

    c.execute(f"""
        SELECT date, month, week, type, amount, category, description, raw_description, ref_no
        FROM transactions
        {where}
        ORDER BY date DESC
    """, params)
    rows = c.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Ngày", "Tháng", "Tuần", "Loại", "Số tiền (VND)", "Danh mục", "Mô tả", "Nội dung gốc", "Mã GD"])
    for r in rows:
        writer.writerow([r["date"], r["month"], r["week"], "Thu nhập" if r["type"] == "income" else "Chi tiêu", r["amount"], r["category"], r["description"], r["raw_description"], r["ref_no"]])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue().encode('utf-8-sig')]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=bao_cao_chi_tieu_{month or 'all'}.csv"}
    )

# =========================================================================
# SECTION 0: DASHBOARD / EXECUTIVE SUMMARY (All-in-One Life Overview)
# =========================================================================

@app.get("/api/system/network-info")
def get_network_info():
    """Returns the local network IP and cloud URL for mobile linking."""
    lan_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        lan_ip = s.getsockname()[0]
        s.close()
    except Exception:
        try:
            lan_ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            pass

    cloud_url = ""
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT value FROM settings WHERE key = 'cloud_run_url'")
        row = c.fetchone()
        conn.close()
        if row and row["value"]:
            cloud_url = row["value"].strip()
    except Exception:
        pass

    primary_url = cloud_url if cloud_url else f"http://{lan_ip}:8000"
    return {
        "lan_ip": lan_ip,
        "port": 8000,
        "url": primary_url,
        "cloud_url": cloud_url,
        "local_url": f"http://{lan_ip}:8000"
    }

@app.get("/api/dashboard")
def get_dashboard_summary():
    """Returns an integrated overview covering all 5 life modules."""
    conn = get_db_connection()
    c = conn.cursor()
    today = datetime.date.today()
    today_str = today.isoformat()

    # Weekdays in Vietnamese
    weekday_names = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]
    today_formatted = f"{weekday_names[today.weekday()]}, {today.strftime('%d/%m/%Y')}"

    # Current hour greeting
    hour = datetime.datetime.now().hour
    if 5 <= hour < 12:
        greeting = "Chào buổi sáng!"
    elif 12 <= hour < 18:
        greeting = "Chào buổi chiều!"
    else:
        greeting = "Chào buổi tối!"

    # 1. Finance Snapshot
    c.execute("SELECT DISTINCT month FROM transactions ORDER BY month DESC")
    available_months = [row["month"] for row in c.fetchall()]
    latest_month = available_months[0] if available_months else today.strftime("%Y-%m")
    month_parts = latest_month.split("-")
    month_label = f"Tháng {month_parts[1]}/{month_parts[0]}" if len(month_parts) == 2 else "Toàn thời gian"

    c.execute("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE month = ? AND type = 'income'", (latest_month,))
    fin_income = c.fetchone()[0]
    c.execute("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE month = ? AND type = 'expense'", (latest_month,))
    fin_expense = c.fetchone()[0]
    fin_balance = fin_income - fin_expense
    savings_rate = round((fin_balance / fin_income) * 100) if fin_income > 0 else 0

    c.execute("""
        SELECT id, date, description, amount, category, type
        FROM transactions
        ORDER BY date DESC, id DESC
        LIMIT 4
    """)
    recent_transactions = [dict(r) for r in c.fetchall()]

    # 2. To-Do & Productivity Snapshot (Today's active workload + Rollover)
    c.execute("""
        SELECT COUNT(*) FROM todos 
        WHERE status = 'completed' 
          AND (date(completed_at) = ? OR (completed_at IS NULL AND due_date = ?))
    """, (today_str, today_str))
    completed_todos_count = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM todos WHERE due_date <= ? AND status != 'completed'", (today_str,))
    pending_todos_count = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM todos WHERE due_date < ? AND status != 'completed'", (today_str,))
    rollover_todos_count = c.fetchone()[0]

    total_todos = pending_todos_count + completed_todos_count
    todo_rate = round((completed_todos_count / total_todos) * 100) if total_todos > 0 else 0

    c.execute("""
        SELECT id, title, priority, due_date, category, status, pomodoro_done, pomodoro_est
        FROM todos
        WHERE status != 'completed'
        ORDER BY 
            CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
            due_date ASC, id ASC
        LIMIT 3
    """)
    top_todos = [dict(r) for r in c.fetchall()]

    # 3. Habits Snapshot (Today's status)
    c.execute("""
        SELECT h.id, h.name, h.icon, h.color, h.streak, h.best_streak,
            (SELECT COUNT(*) FROM habit_logs hl WHERE hl.habit_id = h.id AND hl.date = ? AND hl.status = 1) as completed_today
        FROM habits h
        ORDER BY h.id ASC
    """, (today_str,))
    habits = [dict(r) for r in c.fetchall()]
    habits_done_today = sum(1 for h in habits if h["completed_today"])
    habits_rate = round((habits_done_today / len(habits)) * 100) if habits else 0

    # 4. Journal Snapshot
    c.execute("SELECT date, title, mood, gratitude, improvement, content FROM journal_entries WHERE date = ?", (today_str,))
    j_row = c.fetchone()
    today_journal = dict(j_row) if j_row else None
    if not today_journal:
        c.execute("SELECT date, title, mood, gratitude, improvement, content FROM journal_entries ORDER BY date DESC LIMIT 1")
        j_lat = c.fetchone()
        today_journal = dict(j_lat) if j_lat else None

    # 5. Notes Snapshot (Pinned or recent)
    c.execute("""
        SELECT id, title, content, category, is_pinned, color, updated_at
        FROM notes
        ORDER BY is_pinned DESC, updated_at DESC
        LIMIT 3
    """)
    recent_notes = [dict(r) for r in c.fetchall()]

    conn.close()

    return {
        "greeting": greeting,
        "today_str": today_str,
        "today_formatted": today_formatted,
        "finance": {
            "month_label": month_label,
            "total_income": fin_income,
            "total_expense": fin_expense,
            "balance": fin_balance,
            "savings_rate": savings_rate,
            "recent_transactions": recent_transactions
        },
        "todos": {
            "pending_count": pending_todos_count,
            "completed_count": completed_todos_count,
            "rollover_count": rollover_todos_count,
            "total": total_todos,
            "rate": todo_rate,
            "top_todos": top_todos
        },
        "habits": {
            "total": len(habits),
            "completed_today": habits_done_today,
            "rate": habits_rate,
            "items": habits
        },
        "journal": today_journal,
        "notes": recent_notes
    }

# =========================================================================
# SECTION 2: TO-DO & PRODUCTIVITY TRACKING (Vikunja & Super Productivity)
# =========================================================================

@app.get("/api/todos")
def get_todos(
    filter_by: str = "all",
    category: Optional[str] = None,
    status: Optional[str] = None
):
    conn = get_db_connection()
    c = conn.cursor()
    today_str = datetime.date.today().isoformat()
    week_end = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()

    query = "SELECT * FROM todos WHERE 1=1"
    params = []

    if filter_by == "today":
        # Today includes:
        # 1. Planned for today: due_date = today_str
        # 2. Rollover uncompleted from past days: due_date < today_str AND status != 'completed'
        # 3. Tasks completed today: status = 'completed' AND (date(completed_at) = today_str OR (completed_at IS NULL AND due_date = today_str))
        query += """ AND (
            due_date = ?
            OR (due_date < ? AND status != 'completed')
            OR (status = 'completed' AND (date(completed_at) = ? OR (completed_at IS NULL AND due_date = ?)))
        )"""
        params.extend([today_str, today_str, today_str, today_str])
    elif filter_by == "week":
        week_start = (datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday())).isoformat()
        query += """ AND (
            (due_date >= ? AND due_date <= ?)
            OR (due_date < ? AND status != 'completed')
            OR (status = 'completed' AND (date(completed_at) >= ? OR (completed_at IS NULL AND due_date >= ?)))
        )"""
        params.extend([week_start, week_end, week_start, week_start, week_start])
    elif filter_by == "urgent":
        query += " AND priority = 'urgent'"
    elif filter_by == "completed":
        query += " AND status = 'completed'"
    elif filter_by == "pending":
        query += " AND status != 'completed'"

    if status and filter_by != "completed" and filter_by != "pending":
        query += " AND status = ?"
        params.append(status)

    if category and category != "all":
        query += " AND category = ?"
        params.append(category)

    query += """
        ORDER BY 
            CASE status WHEN 'completed' THEN 2 ELSE 1 END,
            CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
            due_date ASC, id DESC
    """
    c.execute(query, params)
    todos = [dict(row) for row in c.fetchall()]
    conn.close()
    return todos

@app.post("/api/todos")
def create_todo(item: TodoCreate):
    conn = get_db_connection()
    c = conn.cursor()
    uid = f"{item.title}||{item.due_date}"
    c.execute("DELETE FROM deleted_records WHERE table_name = 'todos' AND record_uid = ?", (uid,))
    c.execute("""
        INSERT INTO todos (title, description, due_date, priority, category, pomodoro_est, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    """, (item.title, item.description or "", item.due_date, item.priority or "normal", item.category or "Công việc", item.pomodoro_est or 1))
    new_id = c.lastrowid
    conn.commit()
    c.execute("SELECT * FROM todos WHERE id = ?", (new_id,))
    created = dict(c.fetchone())
    conn.close()
    return created

@app.put("/api/todos/{todo_id}")
def update_todo(todo_id: int, item: TodoUpdate):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
    existing = c.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy việc cần làm")

    updates = []
    params = []
    for field, val in item.dict(exclude_unset=True).items():
        updates.append(f"{field} = ?")
        params.append(val)
        if field == "status" and val == "completed":
            updates.append("completed_at = CURRENT_TIMESTAMP")
        elif field == "status" and val != "completed":
            updates.append("completed_at = NULL")

    if updates:
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(todo_id)
        c.execute(f"UPDATE todos SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    c.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
    updated = dict(c.fetchone())
    conn.close()
    return updated

@app.patch("/api/todos/{todo_id}/toggle")
def toggle_todo(todo_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
    todo = c.fetchone()
    if not todo:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy việc cần làm")

    new_status = "pending" if todo["status"] == "completed" else "completed"
    if new_status == "completed":
        c.execute("UPDATE todos SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (todo_id,))
    else:
        c.execute("UPDATE todos SET status = 'pending', completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (todo_id,))

    conn.commit()
    c.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
    updated = dict(c.fetchone())
    conn.close()
    return updated

@app.patch("/api/todos/{todo_id}/status")
def update_todo_status(todo_id: int, item: TodoStatusUpdate):
    if item.status not in ["pending", "in_progress", "completed"]:
        raise HTTPException(status_code=400, detail="Trạng thái không hợp lệ")
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy việc cần làm")

    if item.status == "completed":
        c.execute("UPDATE todos SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (item.status, todo_id))
    else:
        c.execute("UPDATE todos SET status = ?, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (item.status, todo_id))
    conn.commit()
    c.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
    updated = dict(c.fetchone())
    conn.close()
    return updated

@app.post("/api/todos/{todo_id}/pomodoro-done")
def increment_todo_pomodoro(todo_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy việc cần làm")

    c.execute("UPDATE todos SET pomodoro_done = COALESCE(pomodoro_done, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (todo_id,))
    conn.commit()
    c.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
    updated = dict(c.fetchone())
    conn.close()
    return updated

@app.delete("/api/todos/completed/clear")
def clear_completed_todos():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT title, due_date FROM todos WHERE status = 'completed'")
    rows = c.fetchall()
    for row in rows:
        uid = f"{row['title']}||{row['due_date']}"
        c.execute("INSERT OR REPLACE INTO deleted_records (table_name, record_uid) VALUES ('todos', ?)", (uid,))
    c.execute("DELETE FROM todos WHERE status = 'completed'")
    deleted = len(rows)
    conn.commit()
    conn.close()
    return {"success": True, "deleted_count": deleted}

@app.delete("/api/todos/{todo_id}")
def delete_todo(todo_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT title, due_date FROM todos WHERE id = ?", (todo_id,))
    row = c.fetchone()
    if row:
        uid = f"{row['title']}||{row['due_date']}"
        c.execute("INSERT OR REPLACE INTO deleted_records (table_name, record_uid) VALUES ('todos', ?)", (uid,))
        c.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Đã xóa việc thành công"}

@app.get("/api/todos/stats")
def get_todo_stats():
    conn = get_db_connection()
    c = conn.cursor()
    today = datetime.date.today()
    today_str = today.isoformat()

    # 1. Completed today: tasks marked completed today
    c.execute("""
        SELECT COUNT(*) FROM todos 
        WHERE status = 'completed' 
          AND (date(completed_at) = ? OR (completed_at IS NULL AND due_date = ?))
    """, (today_str, today_str))
    today_completed = c.fetchone()[0]

    # 2. Pending today: tasks due today OR uncompleted tasks rolled over from past
    c.execute("SELECT COUNT(*) FROM todos WHERE due_date <= ? AND status != 'completed'", (today_str,))
    today_pending = c.fetchone()[0]

    # 3. Rollover from previous days (uncompleted from before today)
    c.execute("SELECT COUNT(*) FROM todos WHERE due_date < ? AND status != 'completed'", (today_str,))
    rollover_count = c.fetchone()[0]

    # 4. Planned specifically for today
    c.execute("SELECT COUNT(*) FROM todos WHERE due_date = ?", (today_str,))
    today_planned = c.fetchone()[0]

    # Today's active total workload:
    today_total = today_completed + today_pending
    today_rate = round((today_completed / today_total * 100), 1) if today_total > 0 else 0

    c.execute("SELECT COUNT(*) FROM todos WHERE priority = 'urgent' AND status != 'completed'")
    urgent_count = c.fetchone()[0]

    seven_days_ago = (today - datetime.timedelta(days=6)).isoformat()
    c.execute("SELECT COUNT(*) FROM todos WHERE status = 'completed' AND (completed_at >= ? OR (due_date >= ? AND completed_at IS NOT NULL))", (seven_days_ago, seven_days_ago))
    week_completed = c.fetchone()[0]

    daily_labels = []
    completed_series = []
    created_series = []
    day_names = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]

    for i in range(6, -1, -1):
        d = today - datetime.timedelta(days=i)
        d_str = d.isoformat()
        day_label = f"{day_names[d.weekday()]} ({d.strftime('%d/%m')})"
        daily_labels.append(day_label)

        c.execute("""
            SELECT COUNT(*) FROM todos 
            WHERE status = 'completed' AND (date(completed_at) = ? OR (due_date = ? AND completed_at IS NOT NULL))
        """, (d_str, d_str))
        completed_series.append(c.fetchone()[0])

        c.execute("""
            SELECT COUNT(*) FROM todos 
            WHERE (date(created_at) = ? AND (due_date >= ? OR due_date IS NULL))
               OR (date(created_at) > ? AND due_date = ?)
        """, (d_str, d_str, d_str, d_str))
        created_series.append(c.fetchone()[0])

    c.execute("SELECT category, COUNT(*) as count FROM todos GROUP BY category ORDER BY count DESC")
    categories_breakdown = [{"category": row["category"], "count": row["count"]} for row in c.fetchall()]

    conn.close()
    return {
        "today_total": today_total,
        "today_completed": today_completed,
        "today_pending": today_pending,
        "today_planned": today_planned,
        "rollover_count": rollover_count,
        "today_rate": today_rate,
        "urgent_count": urgent_count,
        "week_completed": week_completed,
        "chart": {
            "labels": daily_labels,
            "completed": completed_series,
            "created": created_series
        },
        "categories": categories_breakdown
    }

# =========================================================================
# SECTION 3: HABITS & STREAKS (Habitica)
# =========================================================================

@app.get("/api/habits")
def get_habits(month: Optional[str] = None):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM habits ORDER BY id ASC")
    habits = [dict(row) for row in c.fetchall()]

    today = datetime.date.today()
    today_str = today.isoformat()

    # Determine target month (YYYY-MM)
    if not month or month == "current":
        month = today.strftime("%Y-%m")

    try:
        year, m_num = map(int, month.split("-"))
    except Exception:
        year, m_num = today.year, today.month
        month = today.strftime("%Y-%m")

    num_days = calendar.monthrange(year, m_num)[1]
    start_date = f"{year:04d}-{m_num:02d}-01"
    end_date = f"{year:04d}-{m_num:02d}-{num_days:02d}"
    first_weekday = datetime.date(year, m_num, 1).weekday() # 0 = Monday (T2), 6 = Sunday (CN)

    # Get list of available months with habit records
    c.execute("SELECT DISTINCT substr(date, 1, 7) as ym FROM habit_logs WHERE date IS NOT NULL ORDER BY ym DESC")
    available_months = [row["ym"] for row in c.fetchall()]
    curr_ym = today.strftime("%Y-%m")
    if curr_ym not in available_months:
        available_months.insert(0, curr_ym)
    prev_ym = (today.replace(day=1) - datetime.timedelta(days=1)).strftime("%Y-%m")
    if prev_ym not in available_months:
        available_months.append(prev_ym)
    available_months = sorted(list(set(available_months)), reverse=True)

    result = []
    for h in habits:
        h_id = h["id"]
        c.execute("""
            SELECT date FROM habit_logs 
            WHERE habit_id = ? AND date BETWEEN ? AND ?
        """, (h_id, start_date, end_date))
        logged_dates = {row["date"] for row in c.fetchall()}

        month_days = []
        for d in range(1, num_days + 1):
            d_str = f"{year:04d}-{m_num:02d}-{d:02d}"
            d_obj = datetime.date(year, m_num, d)
            month_days.append({
                "date": d_str,
                "day": d,
                "weekday": d_obj.weekday(),
                "completed": d_str in logged_dates,
                "is_today": d_str == today_str,
                "is_past": d_str < today_str,
                "is_future": d_str > today_str
            })

        h["month_days"] = month_days
        h["month_completed_count"] = len(logged_dates)
        h["completed_today"] = today_str in logged_dates
        result.append(h)

    # Monthly Daily Completion curve for Area Chart
    chart_labels = []
    chart_completed = []
    for d in range(1, num_days + 1):
        d_str = f"{year:04d}-{m_num:02d}-{d:02d}"
        chart_labels.append(f"{d:02d}/{m_num:02d}")
        c.execute("SELECT COUNT(DISTINCT habit_id) FROM habit_logs WHERE date = ?", (d_str,))
        count = c.fetchone()[0]
        chart_completed.append(count)

    chart_data = {
        "labels": chart_labels,
        "completed": chart_completed,
        "total_habits": len(habits),
        "month_label": f"Tháng {m_num:02d}/{year}",
        "days_in_month": num_days
    }

    conn.close()
    return {
        "habits": result,
        "selected_month": month,
        "month_label": f"Tháng {m_num:02d}/{year}",
        "available_months": available_months,
        "first_weekday": first_weekday,
        "days_in_month": num_days,
        "chart": chart_data
    }

@app.post("/api/habits")
def create_habit(item: HabitCreate):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM deleted_records WHERE table_name = 'habits' AND record_uid = ?", (item.name,))
    c.execute("""
        INSERT INTO habits (name, icon, color, target_days, streak, best_streak, updated_at)
        VALUES (?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP)
    """, (item.name, item.icon or "sparkles", item.color or "#5F7465", item.target_days or 7))
    new_id = c.lastrowid
    conn.commit()
    c.execute("SELECT * FROM habits WHERE id = ?", (new_id,))
    habit = dict(c.fetchone())
    conn.close()
    return habit

@app.post("/api/habits/{habit_id}/toggle")
def toggle_habit_log(habit_id: int, date: Optional[str] = None):
    target_date = date or datetime.date.today().isoformat()
    conn = get_db_connection()
    c = conn.cursor()

    c.execute("SELECT name FROM habits WHERE id = ?", (habit_id,))
    h_row = c.fetchone()
    h_name = h_row["name"] if h_row else str(habit_id)
    log_uid = f"{h_name}||{target_date}"

    c.execute("SELECT id FROM habit_logs WHERE habit_id = ? AND date = ?", (habit_id, target_date))
    existing = c.fetchone()
    if existing:
        c.execute("DELETE FROM habit_logs WHERE habit_id = ? AND date = ?", (habit_id, target_date))
        c.execute("INSERT OR REPLACE INTO deleted_records (table_name, record_uid) VALUES ('habit_logs', ?)", (log_uid,))
    else:
        c.execute("DELETE FROM deleted_records WHERE table_name = 'habit_logs' AND record_uid = ?", (log_uid,))
        c.execute("INSERT OR IGNORE INTO habit_logs (habit_id, date, status) VALUES (?, ?, 1)", (habit_id, target_date))

    c.execute("SELECT date FROM habit_logs WHERE habit_id = ? ORDER BY date DESC", (habit_id,))
    all_dates = {row["date"] for row in c.fetchall()}

    streak = 0
    check_day = datetime.date.today()
    if check_day.isoformat() not in all_dates:
        check_day = check_day - datetime.timedelta(days=1)

    while check_day.isoformat() in all_dates:
        streak += 1
        check_day = check_day - datetime.timedelta(days=1)

    c.execute("SELECT best_streak FROM habits WHERE id = ?", (habit_id,))
    row = c.fetchone()
    best_streak = max(row["best_streak"] if row else 0, streak)

    c.execute("UPDATE habits SET streak = ?, best_streak = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (streak, best_streak, habit_id))
    conn.commit()
    conn.close()
    return {"success": True, "habit_id": habit_id, "streak": streak, "best_streak": best_streak}

@app.put("/api/habits/{habit_id}")
def update_habit(habit_id: int, item: HabitUpdate):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM habits WHERE id = ?", (habit_id,))
    existing = c.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy thói quen")

    updates = []
    params = []
    for f, v in item.dict(exclude_unset=True).items():
        if v is not None:
            updates.append(f"{f} = ?")
            params.append(v)

    if updates:
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(habit_id)
        c.execute(f"UPDATE habits SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    c.execute("SELECT * FROM habits WHERE id = ?", (habit_id,))
    updated = dict(c.fetchone())
    conn.close()
    return updated

@app.delete("/api/habits/{habit_id}")
def delete_habit(habit_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT name FROM habits WHERE id = ?", (habit_id,))
    row = c.fetchone()
    if row:
        c.execute("INSERT OR REPLACE INTO deleted_records (table_name, record_uid) VALUES ('habits', ?)", (row['name'],))
        c.execute("DELETE FROM habits WHERE id = ?", (habit_id,))
    conn.commit()
    conn.close()
    return {"success": True}

# =========================================================================
# SECTION 4: JOURNAL & MOOD (AppFlowy)
# =========================================================================

@app.get("/api/journal")
def get_journal(date: Optional[str] = None, limit: int = 15):
    conn = get_db_connection()
    c = conn.cursor()

    if date:
        c.execute("SELECT * FROM journal_entries WHERE date = ?", (date,))
        row = c.fetchone()
        entry = dict(row) if row else None
        conn.close()
        return {"entry": entry}

    c.execute("SELECT * FROM journal_entries ORDER BY date DESC LIMIT ?", (limit,))
    entries = [dict(row) for row in c.fetchall()]
    conn.close()
    return {"entries": entries}

@app.post("/api/journal")
def save_journal(entry: JournalEntryCreate):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO journal_entries (date, title, content, mood, gratitude, improvement, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(date) DO UPDATE SET
            title = excluded.title,
            content = excluded.content,
            mood = excluded.mood,
            gratitude = excluded.gratitude,
            improvement = excluded.improvement,
            updated_at = CURRENT_TIMESTAMP
    """, (entry.date, entry.title or "", entry.content or "", entry.mood or "good", entry.gratitude or "", entry.improvement or ""))
    conn.commit()

    c.execute("SELECT * FROM journal_entries WHERE date = ?", (entry.date,))
    saved = dict(c.fetchone())
    conn.close()
    return saved

@app.delete("/api/journal/{entry_id}")
def delete_journal(entry_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM journal_entries WHERE id = ?", (entry_id,))
    conn.commit()
    conn.close()
    return {"success": True}

# =========================================================================
# SECTION 5: NOTES & SECOND BRAIN (AppFlowy & Vikunja)
# =========================================================================

@app.get("/api/notes")
def get_notes(category: Optional[str] = None, q: Optional[str] = None):
    conn = get_db_connection()
    c = conn.cursor()
    query = "SELECT * FROM notes WHERE 1=1"
    params = []

    if category and category != "all":
        query += " AND category = ?"
        params.append(category)

    if q:
        query += " AND (title LIKE ? OR content LIKE ?)"
        params.extend([f"%{q}%", f"%{q}%"])

    query += " ORDER BY is_pinned DESC, updated_at DESC"
    c.execute(query, params)
    notes = [dict(row) for row in c.fetchall()]
    conn.close()
    return notes

@app.post("/api/notes")
def create_note(item: NoteCreate):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM deleted_records WHERE table_name = 'notes' AND record_uid = ?", (item.title,))
    c.execute("""
        INSERT INTO notes (title, content, category, is_pinned, color, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (item.title, item.content or "", item.category or "Ý tưởng", item.is_pinned or 0, item.color or "#FFFDF9"))
    new_id = c.lastrowid
    conn.commit()
    c.execute("SELECT * FROM notes WHERE id = ?", (new_id,))
    created = dict(c.fetchone())
    conn.close()
    return created

@app.put("/api/notes/{note_id}")
def update_note(note_id: int, item: NoteUpdate):
    conn = get_db_connection()
    c = conn.cursor()
    updates = []
    params = []
    for f, v in item.dict(exclude_unset=True).items():
        updates.append(f"{f} = ?")
        params.append(v)

    if updates:
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(note_id)
        c.execute(f"UPDATE notes SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    c.execute("SELECT * FROM notes WHERE id = ?", (note_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy ghi chú")
    return dict(row)

@app.patch("/api/notes/{note_id}/pin")
def toggle_pin_note(note_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT is_pinned FROM notes WHERE id = ?", (note_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy ghi chú")

    new_pin = 0 if row["is_pinned"] == 1 else 1
    c.execute("UPDATE notes SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_pin, note_id))
    conn.commit()
    conn.close()
    return {"success": True, "note_id": note_id, "is_pinned": new_pin}

@app.delete("/api/notes/{note_id}")
def delete_note(note_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT title FROM notes WHERE id = ?", (note_id,))
    row = c.fetchone()
    if row:
        c.execute("INSERT OR REPLACE INTO deleted_records (table_name, record_uid) VALUES ('notes', ?)", (row['title'],))
        c.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()
    return {"success": True}

# =========================================================================
# SECTION 7: TWO-WAY CLOUD RUN SYNC
# =========================================================================

@app.get("/api/sync/export-data")
def export_sync_data():
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM transactions")
        transactions = [dict(r) for r in c.fetchall()]

        c.execute("SELECT * FROM todos")
        todos = [dict(r) for r in c.fetchall()]

        c.execute("SELECT * FROM habits")
        habits = [dict(r) for r in c.fetchall()]

        c.execute("""
            SELECT hl.*, h.name as habit_name 
            FROM habit_logs hl 
            LEFT JOIN habits h ON hl.habit_id = h.id
        """)
        habit_logs = [dict(r) for r in c.fetchall()]

        c.execute("SELECT * FROM journal_entries")
        journal_entries = [dict(r) for r in c.fetchall()]

        c.execute("SELECT * FROM notes")
        notes = [dict(r) for r in c.fetchall()]

        c.execute("SELECT table_name, record_uid, deleted_at FROM deleted_records")
        deleted_records = [dict(r) for r in c.fetchall()]

        return {
            "timestamp": datetime.datetime.now().isoformat(),
            "deleted_records": deleted_records,
            "transactions": transactions,
            "todos": todos,
            "habits": habits,
            "habit_logs": habit_logs,
            "journal_entries": journal_entries,
            "notes": notes
        }
    finally:
        conn.close()

@app.post("/api/sync/import-data")
def import_sync_data(payload: dict):
    conn = get_db_connection()
    changes_count = 0
    try:
        c = conn.cursor()

        # Build local habit name -> local habit id map early for tombstone handling
        c.execute("SELECT id, name FROM habits")
        local_habit_name_to_id = {row["name"]: row["id"] for row in c.fetchall()}
        valid_local_habit_ids = set(local_habit_name_to_id.values())

        # 0. Sync and apply tombstones (deleted records)
        for dr in payload.get("deleted_records", []):
            t_name = dr.get("table_name")
            uid = dr.get("record_uid")
            if not t_name or not uid:
                continue
            c.execute("INSERT OR REPLACE INTO deleted_records (table_name, record_uid, deleted_at) VALUES (?, ?, ?)",
                      (t_name, uid, dr.get("deleted_at") or datetime.datetime.now().isoformat()))
            if t_name == "todos":
                parts = uid.split("||", 1)
                if len(parts) == 2:
                    c.execute("DELETE FROM todos WHERE title = ? AND due_date = ?", (parts[0], parts[1]))
                else:
                    c.execute("DELETE FROM todos WHERE title = ?", (parts[0],))
            elif t_name == "notes":
                c.execute("DELETE FROM notes WHERE title = ?", (uid,))
            elif t_name == "habits":
                c.execute("DELETE FROM habits WHERE name = ?", (uid,))
            elif t_name == "habit_logs":
                parts = uid.split("||", 1)
                if len(parts) == 2:
                    h_id = local_habit_name_to_id.get(parts[0])
                    if h_id:
                        c.execute("DELETE FROM habit_logs WHERE habit_id = ? AND date = ?", (h_id, parts[1]))
            elif t_name == "transactions":
                parts = uid.split("||", 3)
                if len(parts) == 4:
                    try:
                        c.execute("DELETE FROM transactions WHERE date = ? AND amount = ? AND type = ? AND description = ?",
                                  (parts[0], float(parts[1]), parts[2], parts[3]))
                    except Exception:
                        pass

        # Load active deleted records
        c.execute("SELECT table_name, record_uid FROM deleted_records")
        del_records = {(row["table_name"], row["record_uid"]) for row in c.fetchall()}

        # 1. Transactions merge (with Last-Write-Wins updated_at check and created_at preservation)
        for t in payload.get("transactions", []):
            trans_uid = f"{t.get('date')}||{t.get('amount')}||{t.get('type')}||{t.get('description')}"
            if ("transactions", trans_uid) in del_records:
                continue
            c.execute("""
                SELECT id, category, is_manual_category, updated_at, created_at FROM transactions 
                WHERE date = ? AND amount = ? AND type = ? AND description = ?
            """, (t.get("date"), t.get("amount"), t.get("type"), t.get("description")))
            row = c.fetchone()
            if not row:
                c.execute("""
                    INSERT INTO transactions (date, month, week, type, amount, category, description, raw_description, ref_no, balance, is_manual_category, ai_confidence, updated_at, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    t.get("date"), t.get("month"), t.get("week"), t.get("type"), t.get("amount"),
                    t.get("category"), t.get("description"), t.get("raw_description"), t.get("ref_no"),
                    t.get("balance"), t.get("is_manual_category", 1), t.get("ai_confidence", 1.0),
                    t.get("updated_at") or t.get("created_at") or datetime.datetime.now().isoformat(),
                    t.get("created_at") or datetime.datetime.now().isoformat()
                ))
                changes_count += 1
            else:
                inc_created = t.get("created_at")
                if inc_created and row["created_at"] and inc_created < row["created_at"]:
                    c.execute("UPDATE transactions SET created_at = ? WHERE id = ?", (inc_created, row["id"]))
                    changes_count += 1
                rem_up = str(t.get("updated_at") or "")
                loc_up = str(row["updated_at"] or "")
                if rem_up and loc_up and rem_up < loc_up:
                    continue
                if t.get("is_manual_category") == 1 and (row["category"] != t.get("category") or row["is_manual_category"] == 0):
                    c.execute("UPDATE transactions SET category = ?, is_manual_category = 1, updated_at = ? WHERE id = ?",
                              (t.get("category"), rem_up or datetime.datetime.now().isoformat(), row["id"]))
                    changes_count += 1

        # 2. Todos merge (with Last-Write-Wins updated_at check and created_at preservation)
        for item in payload.get("todos", []):
            todo_uid = f"{item.get('title')}||{item.get('due_date')}"
            if ("todos", todo_uid) in del_records:
                continue

            c.execute("SELECT id, status, updated_at, created_at FROM todos WHERE title = ? AND due_date = ?", (item.get("title"), item.get("due_date")))
            row = c.fetchone()
            if not row:
                c.execute("""
                    INSERT INTO todos (title, description, due_date, priority, status, category, pomodoro_est, pomodoro_done, completed_at, updated_at, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    item.get("title"), item.get("description", ""), item.get("due_date"),
                    item.get("priority", "normal"), item.get("status", "pending"),
                    item.get("category", "Công việc"), item.get("pomodoro_est", 1),
                    item.get("pomodoro_done", 0), item.get("completed_at"),
                    item.get("updated_at") or item.get("completed_at") or item.get("created_at") or datetime.datetime.now().isoformat(),
                    item.get("created_at") or datetime.datetime.now().isoformat()
                ))
                changes_count += 1
            else:
                inc_created = item.get("created_at")
                if inc_created and row["created_at"] and inc_created < row["created_at"]:
                    c.execute("UPDATE todos SET created_at = ? WHERE id = ?", (inc_created, row["id"]))
                    changes_count += 1

                rem_up = str(item.get("updated_at") or item.get("completed_at") or "")
                loc_up = str(row["updated_at"] or "")
                if rem_up and loc_up and rem_up < loc_up:
                    # Local was modified more recently on this device; do NOT overwrite!
                    continue

                remote_status = item.get("status", "pending")
                if remote_status != row["status"]:
                    c.execute("UPDATE todos SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?",
                              (remote_status, item.get("completed_at"), rem_up or datetime.datetime.now().isoformat(), row["id"]))
                    changes_count += 1

        # Remote habit id -> name lookup map
        remote_habit_id_to_name = {
            h.get("id"): h.get("name")
            for h in payload.get("habits", [])
            if h.get("id") and h.get("name")
        }

        # 3. Habits merge (with Last-Write-Wins updated_at check)
        for h in payload.get("habits", []):
            name = h.get("name")
            if not name or ("habits", name) in del_records:
                continue
            c.execute("SELECT id, streak, best_streak, updated_at FROM habits WHERE name = ?", (name,))
            row = c.fetchone()
            if not row:
                c.execute("INSERT INTO habits (name, icon, color, target_days, streak, best_streak, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                          (name, h.get("icon", "flame"), h.get("color", "#5F7465"), h.get("target_days", 7), h.get("streak", 0), h.get("best_streak", 0),
                           h.get("updated_at") or datetime.datetime.now().isoformat()))
            else:
                rem_up = str(h.get("updated_at") or "")
                loc_up = str(row["updated_at"] or "")
                if rem_up and loc_up and rem_up < loc_up:
                    continue
                new_streak = max(row["streak"], h.get("streak", 0))
                new_best = max(row["best_streak"], h.get("best_streak", 0))
                c.execute("UPDATE habits SET streak = ?, best_streak = ?, updated_at = ? WHERE id = ?",
                          (new_streak, new_best, rem_up or datetime.datetime.now().isoformat(), row["id"]))

        # Refresh local habit map after inserting any new habits
        c.execute("SELECT id, name FROM habits")
        local_habit_name_to_id = {row["name"]: row["id"] for row in c.fetchall()}
        valid_local_habit_ids = set(local_habit_name_to_id.values())

        # 4. Habit logs merge (safe merge respecting tombstones without wiping local records)
        for hl in payload.get("habit_logs", []):
            h_name = hl.get("habit_name") or remote_habit_id_to_name.get(hl.get("habit_id"))
            local_h_id = local_habit_name_to_id.get(h_name)
            if not local_h_id and hl.get("habit_id") in valid_local_habit_ids:
                local_h_id = hl.get("habit_id")

            if local_h_id and h_name:
                log_uid = f"{h_name}||{hl.get('date')}"
                if ("habit_logs", log_uid) in del_records:
                    continue
                c.execute("INSERT OR IGNORE INTO habit_logs (habit_id, date, status) VALUES (?, ?, ?)",
                          (local_h_id, hl.get("date"), hl.get("status", 1)))
                if c.rowcount > 0:
                    changes_count += 1

        # 5. Journal entries merge (with Last-Write-Wins updated_at check)
        for j in payload.get("journal_entries", []):
            c.execute("SELECT id, updated_at FROM journal_entries WHERE date = ?", (j.get("date"),))
            row = c.fetchone()
            if not row:
                c.execute("INSERT INTO journal_entries (date, title, mood, gratitude, improvement, content, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                          (j.get("date"), j.get("title"), j.get("mood"), j.get("gratitude"), j.get("improvement"), j.get("content"),
                           j.get("updated_at") or datetime.datetime.now().isoformat()))
            else:
                rem_up = str(j.get("updated_at") or "")
                loc_up = str(row["updated_at"] or "")
                if rem_up and loc_up and rem_up < loc_up:
                    continue
                c.execute("""
                    UPDATE journal_entries SET title = COALESCE(?, title), mood = COALESCE(?, mood),
                    gratitude = COALESCE(?, gratitude), improvement = COALESCE(?, improvement), content = COALESCE(?, content), updated_at = ?
                    WHERE date = ?
                """, (j.get("title"), j.get("mood"), j.get("gratitude"), j.get("improvement"), j.get("content"),
                      rem_up or datetime.datetime.now().isoformat(), j.get("date")))

        # 6. Notes merge (with Last-Write-Wins updated_at check)
        for n in payload.get("notes", []):
            title = n.get("title")
            if not title or ("notes", title) in del_records:
                continue
            c.execute("SELECT id, updated_at FROM notes WHERE title = ?", (title,))
            row = c.fetchone()
            if not row:
                c.execute("INSERT INTO notes (title, content, category, is_pinned, color, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                          (n.get("title"), n.get("content"), n.get("category"), n.get("is_pinned", 0), n.get("color", "#5F7465"),
                           n.get("updated_at") or datetime.datetime.now().isoformat()))
            else:
                rem_up = str(n.get("updated_at") or "")
                loc_up = str(row["updated_at"] or "")
                if rem_up and loc_up and rem_up < loc_up:
                    continue
                c.execute("UPDATE notes SET content = ?, category = ?, is_pinned = ?, color = ?, updated_at = ? WHERE title = ?",
                          (n.get("content"), n.get("category"), n.get("is_pinned", 0), n.get("color", "#5F7465"),
                           rem_up or datetime.datetime.now().isoformat(), title))

        conn.commit()
        return {"success": True, "message": "Đã nhập dữ liệu đồng bộ thành công", "changes_count": changes_count}
    finally:
        conn.close()

@app.post("/api/sync/push")
def push_to_cloud(payload: dict = None):
    payload = payload or {}
    cloud_url = payload.get("cloud_url", "").strip().rstrip("/")
    if not cloud_url:
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("SELECT value FROM settings WHERE key = 'cloud_run_url'")
            row = c.fetchone()
            if row and row["value"]:
                cloud_url = row["value"].strip().rstrip("/")
        finally:
            conn.close()

    if not cloud_url:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp Cloud Run / Render URL")

    local_data = export_sync_data()
    import httpx
    try:
        r_push = httpx.post(f"{cloud_url}/api/sync/import-data", json=local_data, timeout=60.0)
        if r_push.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Lỗi đẩy dữ liệu lên Cloud: {r_push.text}")

        conn = get_db_connection()
        try:
            c = conn.cursor()
            now_str = datetime.datetime.now().strftime("%H:%M - %d/%m/%Y")
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_run_url', ?)", (cloud_url,))
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_cloud_sync', ?)", (now_str,))
            conn.commit()
        finally:
            conn.close()

        return {
            "success": True,
            "message": "Đã tải dữ liệu lên Cloud thành công!",
            "last_synced": now_str,
            "counts": {
                "transactions": len(local_data.get("transactions", [])),
                "todos": len(local_data.get("todos", [])),
                "habits": len(local_data.get("habits", []))
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Không thể kết nối Cloud Run: {str(e)}")

@app.post("/api/sync/pull")
def pull_from_cloud(payload: dict = None):
    payload = payload or {}
    cloud_url = payload.get("cloud_url", "").strip().rstrip("/")
    if not cloud_url:
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("SELECT value FROM settings WHERE key = 'cloud_run_url'")
            row = c.fetchone()
            if row and row["value"]:
                cloud_url = row["value"].strip().rstrip("/")
        finally:
            conn.close()

    if not cloud_url:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp Cloud Run / Render URL")

    import httpx
    try:
        r_pull = httpx.get(f"{cloud_url}/api/sync/export-data", timeout=60.0)
        if r_pull.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Lỗi lấy dữ liệu từ Cloud: {r_pull.text}")

        cloud_data = r_pull.json()
        import_sync_data(cloud_data)

        conn = get_db_connection()
        try:
            c = conn.cursor()
            now_str = datetime.datetime.now().strftime("%H:%M - %d/%m/%Y")
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_run_url', ?)", (cloud_url,))
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_cloud_sync', ?)", (now_str,))
            conn.commit()
        finally:
            conn.close()

        return {
            "success": True,
            "message": "Đã lấy dữ liệu từ Cloud thành công!",
            "last_synced": now_str
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Không thể kết nối Cloud Run: {str(e)}")

@app.post("/api/sync/trigger")
def trigger_cloud_sync(payload: dict = None):
    payload = payload or {}
    cloud_url = payload.get("cloud_url", "").strip().rstrip("/")
    if not cloud_url:
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("SELECT value FROM settings WHERE key = 'cloud_run_url'")
            row = c.fetchone()
            if row and row["value"]:
                cloud_url = row["value"].strip().rstrip("/")
        finally:
            conn.close()

    if not cloud_url:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp Cloud Run / Render URL")

    import httpx
    try:
        # 1. Export local data (contains user's latest mutations on this machine)
        local_data = export_sync_data()

        # 2. Push local data to Cloud Run FIRST so any fresh local edits arrive at Cloud immediately
        r_push = httpx.post(f"{cloud_url}/api/sync/import-data", json=local_data, timeout=60.0)
        if r_push.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Lỗi đẩy dữ liệu lên Cloud: {r_push.text}")

        # 3. Pull latest cloud data into local database (incorporates any mobile additions/changes)
        pulled_changes = False
        try:
            r_pull = httpx.get(f"{cloud_url}/api/sync/export-data", timeout=60.0)
            if r_pull.status_code == 200:
                cloud_data = r_pull.json()
                import_res = import_sync_data(cloud_data)
                pulled_changes = import_res.get("changes_count", 0) > 0
        except Exception as pull_err:
            logger.warning(f"Pull step warning: {pull_err}")

        # Update last_cloud_sync in settings
        conn = get_db_connection()
        try:
            c = conn.cursor()
            now_str = datetime.datetime.now().strftime("%H:%M - %d/%m/%Y")
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_run_url', ?)", (cloud_url,))
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_cloud_sync', ?)", (now_str,))
            conn.commit()
        finally:
            conn.close()

        return {
            "success": True,
            "message": "Đồng bộ 2 chiều thành công!",
            "last_synced": now_str,
            "pulled_changes": pulled_changes
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Không thể kết nối Cloud Run: {str(e)}")

@app.get("/api/sync/status")
def get_sync_status():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT key, value FROM settings WHERE key IN ('cloud_run_url', 'last_cloud_sync')")
    res = {row["key"]: row["value"] for row in c.fetchall()}
    conn.close()
    return {
        "cloud_run_url": res.get("cloud_run_url", ""),
        "last_cloud_sync": res.get("last_cloud_sync", "")
    }


# ----------------- STATIC FILES & SPA ROUTING -----------------

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "AI Expense Tracker API is running. Static files not yet mounted."}
