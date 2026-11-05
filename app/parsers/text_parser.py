import re
from typing import List, Dict, Any, Optional
from app.parsers.normalizer import parse_vietnamese_date, parse_vietnamese_amount, extract_merchant_summary

def parse_raw_text_statement(raw_text: str, default_month: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Parses arbitrary bank text, such as:
    - Multi-line copy/paste from mobile banking apps or web portals
    - SMS banking messages (Vietcombank, MB, Techcom, VPBank, etc.)
    - Tab or comma separated lines
    """
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    if not lines:
        return []

    date_regex = re.compile(r'(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})')
    # Amount with optional + or - or VND
    amt_regex = re.compile(r'([+-]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*(?:VND|đ|Đ)?)')

    parsed = []

    for line in lines:
        date_match = date_regex.search(line)
        d_iso, m_iso, w_iso = parse_vietnamese_date(date_match.group(1) if date_match else None)

        # Detect amount
        lower = line.lower()
        is_income = any(k in lower for k in ['+', 'nhan tien', 'nhận tiền', 'gd co', 'ghi co', 'luong', 'lương', 'hoan tien']) and not any(k in lower for k in ['-', 'gd no', 'ghi no', 'thanh toan', 'chuyen tien'])

        # Find numbers
        candidates = []
        for m in re.finditer(r'[-+]?\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\b|\b\d{4,9}\b', line):
            cand = m.group()
            val = parse_vietnamese_amount(cand)
            if val >= 1000:
                candidates.append((cand, val))

        if not candidates:
            continue

        primary_amt = candidates[0][1]

        # Clean description
        desc = line
        if date_match:
            desc = desc.replace(date_match.group(1), ' ')
        for cand, _ in candidates:
            desc = desc.replace(cand, ' ')

        # Clean common banking prefixes
        desc = re.sub(r'(TK\s*\d+|SD\s*[\d\.,]+|VND|luc\s*\d+:\d+|ND:?|ref:?|GD:?)', ' ', desc, flags=re.IGNORECASE)
        clean_desc = extract_merchant_summary(desc)

        parsed.append({
            "date": d_iso,
            "month": m_iso,
            "week": w_iso,
            "type": "income" if is_income else "expense",
            "amount": primary_amt,
            "description": clean_desc,
            "raw_description": line,
            "ref_no": "",
            "balance": candidates[1][1] if len(candidates) > 1 else None
        })

    return parsed
