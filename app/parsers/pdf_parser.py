import io
import re
from typing import List, Dict, Any, Optional
from app.parsers.normalizer import parse_vietnamese_date, parse_vietnamese_amount, extract_merchant_summary

def parse_pdf_statement(content_bytes: bytes, default_month: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Parses PDF bank statements (VCB, MB, Techcombank, VPBank, ACB, etc.)
    Extracts text page by page, groups lines into transaction blocks starting with dates.
    """
    import pypdf
    reader = pypdf.PdfReader(io.BytesIO(content_bytes))
    full_text_lines = []

    for page in reader.pages:
        text = page.extract_text()
        if text:
            for line in text.splitlines():
                line_str = line.strip()
                if line_str:
                    full_text_lines.append(line_str)

    if not full_text_lines:
        return []

    # Regex to detect date at start of line: 01/10/2026, 01-10-2026, 01.10.2026, 2026-10-01
    date_regex = re.compile(r'^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2})')
    
    # Regex to detect currency amount like 100,000 or 1.000.000 or 1500000
    amount_regex = re.compile(r'[-+]?\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\b')

    transaction_blocks = []
    current_block = []

    for line in full_text_lines:
        if date_regex.match(line):
            if current_block:
                transaction_blocks.append(" ".join(current_block))
            current_block = [line]
        else:
            if current_block:
                current_block.append(line)

    if current_block:
        transaction_blocks.append(" ".join(current_block))

    parsed_transactions = []

    for block in transaction_blocks:
        date_match = date_regex.search(block)
        if not date_match:
            continue

        raw_date = date_match.group(1)
        date_iso, month_iso, week_iso = parse_vietnamese_date(raw_date)

        # Remove date part from block
        remainder = block[date_match.end():].strip()

        # Find all amounts in the remainder
        # In statements, often there are [Debit, Credit, Balance] or [Amount, Balance]
        amounts_found = []
        for m in amount_regex.finditer(remainder):
            candidate = m.group()
            # Must look like real money (not 2026 or a single digit or account number)
            num = parse_vietnamese_amount(candidate)
            if num >= 1000: # Typical VND min transaction is 1000+
                amounts_found.append((m.start(), m.end(), candidate, num))

        if not amounts_found:
            continue

        # Check for indicators of income vs expense in text
        lower_block = block.lower()
        is_income = any(w in lower_block for w in [
            'ghi có', 'gd có', '+', 'nhan tien', 'nhận tiền', 'luong', 'lương',
            'hoan tien', 'hoàn tiền', 'lai tiet kiem', 'credit'
        ]) and not any(w in lower_block for w in ['ghi nợ', 'gd nợ', 'debit'])

        # In most PDF rows, the primary transaction amount is the first or second large number
        # If there are 2 numbers: often [Amount, Balance]
        # If there are 3 numbers: often [Debit/Credit, Fee, Balance]
        primary_amt = amounts_found[0][3]
        balance = amounts_found[-1][3] if len(amounts_found) > 1 else None

        # Build clean description by stripping out the detected date and amounts
        desc_text = remainder
        for _, _, raw_cand, _ in sorted(amounts_found, key=lambda x: -len(x[2])):
            desc_text = desc_text.replace(raw_cand, ' ')

        desc_clean = extract_merchant_summary(desc_text)

        parsed_transactions.append({
            "date": date_iso,
            "month": month_iso,
            "week": week_iso,
            "type": "income" if is_income else "expense",
            "amount": primary_amt,
            "description": desc_clean,
            "raw_description": block,
            "ref_no": "",
            "balance": balance
        })

    return parsed_transactions
