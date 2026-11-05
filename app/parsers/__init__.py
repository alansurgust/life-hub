# Lazy exports or direct imports to prevent loading heavy PDF/Excel parsers on boot
from app.parsers.normalizer import parse_vietnamese_date, parse_vietnamese_amount, extract_merchant_summary, is_duplicate_transaction

def parse_csv_statement(*args, **kwargs):
    from app.parsers.csv_parser import parse_csv_statement as _fn
    return _fn(*args, **kwargs)

def parse_excel_statement(*args, **kwargs):
    from app.parsers.excel_parser import parse_excel_statement as _fn
    return _fn(*args, **kwargs)

def parse_pdf_statement(*args, **kwargs):
    from app.parsers.pdf_parser import parse_pdf_statement as _fn
    return _fn(*args, **kwargs)

def parse_raw_text_statement(*args, **kwargs):
    from app.parsers.text_parser import parse_raw_text_statement as _fn
    return _fn(*args, **kwargs)
