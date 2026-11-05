import re
from datetime import datetime, date
from typing import Tuple, Optional, Any, Dict, List

def clean_vietnamese_text(text: Any) -> str:
    """Removes excessive whitespace and standardizes text."""
    if text is None:
        return ""
    # Replace non-breaking spaces and zero-width spaces
    text_str = str(text).replace('\xa0', ' ').replace('\u202f', ' ').replace('\u200b', '')
    return re.sub(r'\s+', ' ', text_str).strip()

def parse_vietnamese_date(raw_date: Any) -> Tuple[str, str, str]:
    """
    Parses various date formats and returns (date_iso, month, week)
    Accepts datetime, date, excel serial number, or strings.
    """
    today = datetime.now()
    default_iso = today.strftime("%Y-%m-%d")
    default_m = today.strftime("%Y-%m")
    default_w = f"{today.year}-W{today.isocalendar()[1]:02d}"

    if raw_date is None or raw_date == "":
        return default_iso, default_m, default_w

    # Case 1: Already a datetime or date object (common in openpyxl / pandas)
    if isinstance(raw_date, datetime):
        return raw_date.strftime("%Y-%m-%d"), raw_date.strftime("%Y-%m"), f"{raw_date.year}-W{raw_date.isocalendar()[1]:02d}"
    if isinstance(raw_date, date):
        return raw_date.strftime("%Y-%m-%d"), raw_date.strftime("%Y-%m"), f"{raw_date.year}-W{raw_date.isocalendar()[1]:02d}"

    # Case 2: Excel float/int serial date (e.g. 45000 = year ~2023, 46300 = year ~2026)
    if isinstance(raw_date, (int, float)):
        try:
            # Excel base date is 1899-12-30
            dt = datetime.fromordinal(datetime(1899, 12, 30).toordinal() + int(raw_date))
            if 2000 <= dt.year <= 2035:
                return dt.strftime("%Y-%m-%d"), dt.strftime("%Y-%m"), f"{dt.year}-W{dt.isocalendar()[1]:02d}"
        except Exception:
            pass

    cleaned = clean_vietnamese_text(raw_date)
    if not cleaned:
        return default_iso, default_m, default_w

    # Try standard string date formats
    date_part = cleaned.split()[0] if ' ' in cleaned else cleaned

    formats = [
        "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
        "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d",
        "%d/%m/%y", "%d-%m-%y", "%d.%m.%y",
        "%d %b %Y", "%d %B %Y",
        "%d%m%Y", "%Y%m%d"
    ]

    dt = None
    for fmt in formats:
        try:
            dt = datetime.strptime(date_part, fmt)
            break
        except ValueError:
            pass

    # Regex extraction if exact match failed
    if dt is None:
        # Match dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
        m = re.search(r'(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})', cleaned)
        if m:
            day, month, year = m.groups()
            if len(year) == 2:
                year = "20" + year
            try:
                dt = datetime(int(year), int(month), int(day))
            except ValueError:
                pass

    if dt is None:
        # Match yyyy-mm-dd
        m2 = re.search(r'(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})', cleaned)
        if m2:
            year, month, day = m2.groups()
            try:
                dt = datetime(int(year), int(month), int(day))
            except ValueError:
                pass

    if dt is None:
        return default_iso, default_m, default_w

    return dt.strftime("%Y-%m-%d"), dt.strftime("%Y-%m"), f"{dt.year}-W{dt.isocalendar()[1]:02d}"

def is_valid_date_cell(val: Any) -> bool:
    """Checks if a cell represents a date."""
    if val is None or val == "":
        return False
    if isinstance(val, (datetime, date)):
        return True
    if isinstance(val, (int, float)) and 35000 <= val <= 55000: # Valid Excel serial date range (1995-2050)
        return True
    val_str = clean_vietnamese_text(val)
    if re.search(r'\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b', val_str):
        return True
    if re.search(r'\b\d{4}[/.-]\d{1,2}[/.-]\d{1,2}\b', val_str):
        return True
    return False

def parse_vietnamese_amount(amount_val: Any) -> float:
    """
    Parses amount formatted in VN or US styles, ints, floats, or strings:
    Handles: 1.500.000, 1,500,000, 1500000, -50000, (50,000), 1 500 000, 1500000.00
    """
    if amount_val is None or amount_val == "":
        return 0.0

    if isinstance(amount_val, (int, float)):
        return float(amount_val)

    raw = clean_vietnamese_text(amount_val).upper()
    if not raw:
        return 0.0

    is_negative = '-' in raw or ('(' in raw and ')' in raw) or 'CR' in raw

    # Remove currency words and symbols
    raw = re.sub(r'[VND|USD|đ|Đ|\$|\s|\(|\)|DR|CR]', '', raw)

    # Check dots and commas
    if '.' in raw and ',' in raw:
        if raw.rfind(',') > raw.rfind('.'):
            # VN style: 1.250.000,50
            raw = raw.replace('.', '').replace(',', '.')
        else:
            # US style: 1,250,000.50
            raw = raw.replace(',', '')
    elif '.' in raw:
        parts = raw.split('.')
        if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3):
            # Thousand separators
            raw = raw.replace('.', '')
    elif ',' in raw:
        parts = raw.split(',')
        if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3):
            raw = raw.replace(',', '')
        else:
            raw = raw.replace(',', '.')

    # Extract valid float
    match = re.search(r'[-+]?\d*\.?\d+', raw)
    if not match:
        return 0.0

    val = float(match.group())
    return -abs(val) if is_negative else abs(val)

def extract_merchant_summary(raw_desc: Any) -> str:
    """
    Cleans noisy bank transaction strings into human readable summary.
    """
    if not raw_desc:
        return "Giao dịch không tên"

    text = clean_vietnamese_text(raw_desc)
    
    # Remove prefix transaction tracking IDs like 'MBVCB.12345.', 'FT24123456.', 'Trace 12345'
    text = re.sub(r'^(MBVCB|FT|IB|MB|VCB|TCB|ACB|BIDV|VPB|VIB|TPB)[\.\s\d\-]+', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(GD|GIAO DICH|TT|THANH TOAN|CHUYEN TIEN)[\s\:\-]+', '', text, flags=re.IGNORECASE)
    text = re.sub(r'QR\s+ORDER[\s\d\-]+', 'QR ', text, flags=re.IGNORECASE)
    text = re.sub(r'[\*\_]', ' ', text)
    
    cleaned = clean_vietnamese_text(text)
    return cleaned if len(cleaned) > 2 else clean_vietnamese_text(raw_desc)[:60]

def normalize_text_for_comparison(text: Any) -> str:
    """Standardizes text to purely alphanumeric characters for duplicate comparison."""
    if not text:
        return ""
    cleaned = re.sub(r'[^a-zA-Z0-9\sáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđĐ]', '', str(text).lower())
    return re.sub(r'\s+', '', cleaned)

def is_duplicate_transaction(candidate: Dict[str, Any], existing_rows: List[Dict[str, Any]]) -> bool:
    """
    Determines if candidate transaction is already present in existing database rows for that date.
    """
    cand_amount = float(candidate.get("amount", 0))
    cand_type = candidate.get("type", "expense")
    cand_ref = str(candidate.get("ref_no", "")).strip().lower()
    cand_desc = normalize_text_for_comparison(candidate.get("raw_description") or candidate.get("description"))
    cand_bal = candidate.get("balance")

    for ex in existing_rows:
        ex_amount = float(ex.get("amount", 0))
        ex_type = ex.get("type", "expense")
        if ex_type != cand_type:
            continue
        if abs(ex_amount - cand_amount) > 0.5:
            continue

        # 1. Exact reference match (if ref exists and is meaningful)
        ex_ref = str(ex.get("ref_no", "")).strip().lower()
        if cand_ref and ex_ref and len(cand_ref) >= 4 and cand_ref == ex_ref:
            return True

        # 2. Balance match if available
        ex_bal = ex.get("balance")
        if cand_bal is not None and ex_bal is not None and abs(float(cand_bal) - float(ex_bal)) < 0.5:
            return True

        # 3. Description text match (exact or substring)
        ex_desc = normalize_text_for_comparison(ex.get("raw_description") or ex.get("description"))
        if cand_desc and ex_desc:
            if cand_desc == ex_desc or cand_desc in ex_desc or ex_desc in cand_desc:
                return True

        # 4. If amounts match and no special desc difference on the same date
        if not cand_desc and not ex_desc:
            return True

    return False
