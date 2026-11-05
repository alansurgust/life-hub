import csv
import io
import logging
from typing import List, Dict, Any, Optional
from app.parsers.normalizer import (
    parse_vietnamese_date,
    parse_vietnamese_amount,
    extract_merchant_summary,
    is_valid_date_cell,
    clean_vietnamese_text
)
from app.parsers.excel_parser import match_header_columns, extract_with_col_map, extract_with_pattern_scanner

logger = logging.getLogger(__name__)

def parse_csv_statement(content_bytes: bytes, default_month: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Parses a CSV bank statement.
    Attempts multiple encodings and delimiters, uses both header matching and pattern fallback.
    """
    decoded = ""
    for enc in ['utf-8-sig', 'utf-8', 'cp1258', 'latin-1']:
        try:
            decoded = content_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue

    if not decoded:
        return []

    lines = [line.strip() for line in decoded.splitlines() if line.strip()]
    if not lines:
        return []

    # Detect delimiter
    sample = "\n".join(lines[:10])
    delimiter = ','
    try:
        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(sample, delimiters=',;\t|')
        delimiter = dialect.delimiter
    except Exception:
        if '\t' in lines[0]:
            delimiter = '\t'
        elif ';' in lines[0]:
            delimiter = ';'

    reader = csv.reader(io.StringIO(decoded), delimiter=delimiter)
    all_rows = list(reader)

    if not all_rows:
        return []

    # Try header detection
    best_header_idx = -1
    best_col_map = {}
    max_matched_cols = 0

    for idx, row in enumerate(all_rows[:60]):
        col_map = match_header_columns(row)
        has_date = col_map.get("date") is not None
        has_financial = any(col_map.get(k) is not None for k in ["out", "in", "amount"])
        matched_count = len(col_map)
        if has_date and has_financial and matched_count > max_matched_cols:
            max_matched_cols = matched_count
            best_header_idx = idx
            best_col_map = col_map

    if best_header_idx != -1 and max_matched_cols >= 2:
        txs = extract_with_col_map(all_rows[best_header_idx + 1:], best_col_map)
        if txs:
            return txs

    # Fallback pattern scanner
    return extract_with_pattern_scanner(all_rows)
