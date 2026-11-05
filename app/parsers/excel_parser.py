import io
import re
import logging
from typing import List, Dict, Any, Optional

from app.parsers.normalizer import (
    parse_vietnamese_date,
    parse_vietnamese_amount,
    extract_merchant_summary,
    is_valid_date_cell,
    clean_vietnamese_text
)

logger = logging.getLogger(__name__)

def match_header_columns(row: List[Any]) -> Dict[str, int]:
    """
    Matches cell text to transaction column roles using precise regex.
    Prioritizes specific terms (like 'số tham chiếu') before generic terms (like 'nợ' or 'số tiền').
    """
    col_map = {}
    row_clean = [clean_vietnamese_text(c).lower() for c in row]

    # Pass 1: Identify Reference & Date & Balance columns first (to avoid collision)
    for c_idx, cell in enumerate(row_clean):
        if not cell:
            continue
        if "ref" not in col_map and re.search(r'(số tham chiếu|tham chiếu|mã gd|mã giao dịch|ref|reference|trans id|stt|số ct|số chứng từ|seq no)', cell):
            col_map["ref"] = c_idx
        elif "date" not in col_map and re.search(r'(ngày|date|ngay gd|ngày giao dịch|ngày hạch toán|thời gian|posting date|trans date|val date|ngày ct)', cell):
            col_map["date"] = c_idx
        elif "balance" not in col_map and re.search(r'(số dư|balance|so du|số dư sau gd|số dư cuối|số dư hiện tại|closing balance)', cell):
            col_map["balance"] = c_idx

    # Pass 2: Identify Debit (Out), Credit (In), Amount, and Description
    for c_idx, cell in enumerate(row_clean):
        if not cell or c_idx in col_map.values():
            continue

        if "out" not in col_map and re.search(r'(ghi nợ|phát sinh nợ|ps nợ|tiền ra|tiền chi|số tiền ghi nợ|rút tiền|rút ra|debit|\bnợ\b)', cell):
            col_map["out"] = c_idx
        elif "in" not in col_map and re.search(r'(ghi có|phát sinh có|ps có|tiền vào|tiền thu|số tiền ghi có|nạp tiền|nộp vào|credit|\bcó\b)', cell):
            col_map["in"] = c_idx
        elif "amount" not in col_map and re.search(r'(số tiền|amount|so tien|giá trị|phát sinh|biến động|biến động số dư|thay đổi)', cell):
            col_map["amount"] = c_idx
        elif "desc" not in col_map and re.search(r'(nội dung|diễn giải|description|chi tiết|memo|payee|thông tin giao dịch|chi tiết giao dịch|lý do|narrative|particulars)', cell):
            col_map["desc"] = c_idx

    return col_map

def extract_with_col_map(data_rows: List[List[Any]], col_map: Dict[str, int]) -> List[Dict[str, Any]]:
    """Extracts transactions using detected column indices."""
    col_date = col_map.get("date")
    col_desc = col_map.get("desc")
    col_out = col_map.get("out")
    col_in = col_map.get("in")
    col_amount = col_map.get("amount")
    col_ref = col_map.get("ref")
    col_balance = col_map.get("balance")

    transactions = []

    for row in data_rows:
        if not row or col_date is None or col_date >= len(row):
            continue

        raw_date_cell = row[col_date]
        if not is_valid_date_cell(raw_date_cell):
            continue

        date_iso, month_iso, week_iso = parse_vietnamese_date(raw_date_cell)

        raw_desc = row[col_desc] if (col_desc is not None and col_desc < len(row) and row[col_desc] is not None) else "Chi tiêu"
        clean_desc = extract_merchant_summary(raw_desc)
        ref_no = str(row[col_ref]).strip() if (col_ref is not None and col_ref < len(row) and row[col_ref] is not None) else ""
        balance = parse_vietnamese_amount(row[col_balance]) if (col_balance is not None and col_balance < len(row) and row[col_balance] is not None) else None

        amount = 0.0
        trans_type = "expense"

        if col_out is not None and col_out < len(row) and row[col_out] not in [None, ""]:
            out_val = parse_vietnamese_amount(row[col_out])
            if abs(out_val) > 0:
                amount = abs(out_val)
                trans_type = "expense"

        if col_in is not None and col_in < len(row) and row[col_in] not in [None, ""]:
            in_val = parse_vietnamese_amount(row[col_in])
            if abs(in_val) > 0:
                amount = abs(in_val)
                trans_type = "income"

        if amount == 0 and col_amount is not None and col_amount < len(row) and row[col_amount] not in [None, ""]:
            amt_val = parse_vietnamese_amount(row[col_amount])
            if amt_val < 0:
                amount = abs(amt_val)
                trans_type = "expense"
            elif amt_val > 0:
                d_lower = str(raw_desc).lower()
                if any(w in d_lower for w in ['luong', 'lương', 'thu nhap', 'hoan tien', 'lai tien gui', 'nhan tien', '+']):
                    trans_type = "income"
                else:
                    trans_type = "expense"
                amount = amt_val

        if amount <= 0:
            continue

        transactions.append({
            "date": date_iso,
            "month": month_iso,
            "week": week_iso,
            "type": trans_type,
            "amount": amount,
            "description": clean_desc,
            "raw_description": str(raw_desc),
            "ref_no": ref_no,
            "balance": balance
        })

    return transactions

def extract_with_pattern_scanner(rows: List[List[Any]]) -> List[Dict[str, Any]]:
    """
    Pattern-based scanner that doesn't depend on headers:
    Finds rows that contain a Date cell and at least one Currency Amount cell.
    """
    candidates = []

    for r_idx, row in enumerate(rows):
        if not row:
            continue

        date_col = None
        amounts_found = []
        texts_found = []

        for c_idx, cell in enumerate(row):
            if cell is None or str(cell).strip() == "":
                continue

            if date_col is None and is_valid_date_cell(cell):
                date_col = c_idx
            else:
                amt = parse_vietnamese_amount(cell)
                cell_str = clean_vietnamese_text(cell)
                # Financial transaction in VND is usually >= 1,000 VND and not a year like 2026
                if abs(amt) >= 1000 and amt not in [2023, 2024, 2025, 2026, 2027]:
                    amounts_found.append((c_idx, amt, cell_str))
                elif len(cell_str) >= 3 and not cell_str.isdigit():
                    texts_found.append((c_idx, cell_str))

        if date_col is not None and amounts_found:
            raw_date = row[date_col]
            date_iso, month_iso, week_iso = parse_vietnamese_date(raw_date)

            primary_amt = amounts_found[0][1]
            desc = texts_found[0][1] if texts_found else "Giao dịch ngân hàng"
            clean_desc = extract_merchant_summary(desc)

            trans_type = "expense"
            if primary_amt < 0:
                trans_type = "expense"
                primary_amt = abs(primary_amt)
            else:
                desc_lower = desc.lower()
                if any(w in desc_lower for w in ['luong', 'lương', 'thu nhap', 'hoan tien', 'nhan tien', '+', 'cr']):
                    trans_type = "income"

            candidates.append({
                "date": date_iso,
                "month": month_iso,
                "week": week_iso,
                "type": trans_type,
                "amount": abs(primary_amt),
                "description": clean_desc,
                "raw_description": desc,
                "ref_no": "",
                "balance": amounts_found[-1][1] if len(amounts_found) > 1 else None
            })

    return candidates

def parse_sheet_rows(rows: List[List[Any]]) -> List[Dict[str, Any]]:
    """Parses a 2D matrix of row cells into structured transactions."""
    if not rows or len(rows) < 2:
        return []

    # Strategy A: Header Row Search (scan rows 0 to 60)
    best_header_idx = -1
    best_col_map = {}
    max_matched_cols = 0

    for idx, row in enumerate(rows[:60]):
        col_map = match_header_columns(row)
        has_date = col_map.get("date") is not None
        has_financial = any(col_map.get(k) is not None for k in ["out", "in", "amount"])
        has_desc = col_map.get("desc") is not None

        matched_count = len(col_map)
        if has_date and (has_financial or has_desc) and matched_count > max_matched_cols:
            max_matched_cols = matched_count
            best_header_idx = idx
            best_col_map = col_map

    if best_header_idx != -1 and max_matched_cols >= 2:
        txs = extract_with_col_map(rows[best_header_idx + 1:], best_col_map)
        if txs:
            return txs

    # Strategy B: Pattern-Based Smart Fallback
    return extract_with_pattern_scanner(rows)

def parse_excel_statement(content_bytes: bytes, default_month: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Ultra-resilient Excel statement parser:
    1. Tries OpenPyXL (for XLSX)
    2. Tries XLRD (for binary XLS)
    3. Tries HTML/XML parser (for bank statements exported as HTML table with .xls extension)
    4. Searches all sheets and applies Header Detection + Pattern-Based Fallback
    """
    raw_sheets_data = []

    # Method 1: Try openpyxl
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content_bytes), data_only=True)
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            sheet_rows = []
            for row in ws.iter_rows(values_only=True):
                if any(c is not None and str(c).strip() != "" for c in row):
                    sheet_rows.append(list(row))
            if sheet_rows:
                raw_sheets_data.append((sheet_name, sheet_rows))
    except Exception as e1:
        logger.debug(f"OpenPyXL load failed, trying XLRD: {e1}")

    # Method 2: Try xlrd if openpyxl found nothing
    if not raw_sheets_data:
        try:
            import xlrd
            wb_xls = xlrd.open_workbook(file_contents=content_bytes)
            for sheet_idx in range(wb_xls.nsheets):
                sh = wb_xls.sheet_by_index(sheet_idx)
                sheet_rows = []
                for r_idx in range(sh.nrows):
                    row_vals = [sh.cell_value(r_idx, c_idx) for c_idx in range(sh.ncols)]
                    if any(c is not None and str(c).strip() != "" for c in row_vals):
                        sheet_rows.append(row_vals)
                if sheet_rows:
                    raw_sheets_data.append((sh.name, sheet_rows))
        except Exception as e2:
            logger.debug(f"XLRD load failed, trying HTML/XML table: {e2}")

    # Method 3: Try HTML table parser (very common for bank exports with .xls extension)
    if not raw_sheets_data:
        try:
            text_str = ""
            for enc in ['utf-8', 'utf-8-sig', 'cp1258', 'latin-1']:
                try:
                    text_str = content_bytes.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue

            if text_str and ('<table' in text_str.lower() or '<html' in text_str.lower() or 'xmlns' in text_str.lower()):
                import lxml.html
                doc = lxml.html.fromstring(text_str)
                tables = doc.xpath('//table')
                for t_idx, table in enumerate(tables):
                    table_rows = []
                    for tr in table.xpath('.//tr'):
                        cells = [clean_vietnamese_text(td.text_content()) for td in tr.xpath('.//td|.//th')]
                        if any(cells):
                            table_rows.append(cells)
                    if table_rows:
                        raw_sheets_data.append((f"Table_{t_idx}", table_rows))
        except Exception as e3:
            logger.debug(f"HTML table parse failed: {e3}")

    if not raw_sheets_data:
        logger.warning("No readable sheets or tables found in Excel file.")
        return []

    # Process all sheets and collect transactions
    all_transactions = []
    for sheet_name, rows in raw_sheets_data:
        txs = parse_sheet_rows(rows)
        if txs:
            all_transactions.extend(txs)

    return all_transactions
