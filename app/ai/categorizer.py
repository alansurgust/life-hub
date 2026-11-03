import re
import logging
from typing import List, Dict, Any, Tuple
from app.database import get_db_connection
from app.ai.llm_client import call_gemini_categorizer, call_openai_categorizer

logger = logging.getLogger(__name__)

# Heuristic patterns for Vietnamese transactions
# (Pattern regex, Category, Confidence)
VIETNAMESE_PATTERNS: List[Tuple[str, str, float]] = [
    # 1. Ăn uống (Food & Dining)
    (r'(antrandainghia|an tran dai nghia)', 'Ăn uống', 0.99),
    (r'(shopeefood|baemin|grabfood|befood|foody|loship)', 'Ăn uống', 0.98),
    (r'(highlands|coffee|cafe|the coffee house|starbucks|phuc long|phúc long|trung nguyen|katinat|cheesecake)', 'Ăn uống', 0.95),
    (r'(kfc|lotteria|jollibee|mcdonald|texas chicken|pizza|domino|hut|burger)', 'Ăn uống', 0.95),
    (r'(tra sua|trà sữa|ding tea|gong cha|tocotoco|koi the|mixue|tiger sugar)', 'Ăn uống', 0.95),
    (r'(com tam|cơm tấm|pho |phở |bun |bún |banh mi|bánh mì|an trua|ăn trưa|an sang|ăn sáng|an toi|ăn tối)', 'Ăn uống', 0.92),
    (r'(nha hang|nhà hàng|quan an|quán ăn|lau |lẩu|nuong|nướng|bbq|haidilao|gogi|kichi)', 'Ăn uống', 0.93),
    (r'(bia |beer|pub|bar|nhau |nhậu)', 'Ăn uống', 0.90),

    # 2. Mua sắm (Shopping & Groceries)
    (r'(wincommerce|winmart|maxvalu|coopmart|co.op|bach hoa xanh|bách hoá xanh|big c|tops market|mega market|lotte mart|aeon)', 'Mua sắm', 0.98),
    (r'(circle k|circlek|7-eleven|family mart|ministop|gs25|bs mart)', 'Mua sắm', 0.98),
    (r'(shopee|lazada|tiki|tiktok shop|sendo)', 'Mua sắm', 0.96),
    (r'(uniqlo|zara|h&m|canifa|yame|routine|coolmate|owen|viettien)', 'Mua sắm', 0.92),
    (r'(the gioi di dong|tgdd|fpt shop|cellphones|hoang ha|di dong viet|phong vu)', 'Mua sắm', 0.92),
    (r'(my pham|mỹ phẩm|hasaki|guardian|watsons|innisfree|the face shop)', 'Mua sắm', 0.92),
    (r'(sieu thi|siêu thị|mua sam|mua sắm|tap hoa|tạp hoá)', 'Mua sắm', 0.88),

    # 3. Di chuyển (Transport)
    (r'(grab(?!food)|be(?!food)|xanh sm|gojek|uber)', 'Di chuyển', 0.96),
    (r'(mai linh|vina sun|taxiam|taxi)', 'Di chuyển', 0.94),
    (r'(xang|xăng|petrolimex|pvoil|caltex|do xang|đổ xăng)', 'Di chuyển', 0.95),
    (r'(vietnam airlines|vietjet|bamboo|airasia|ve may bay|vé máy bay)', 'Di chuyển', 0.96),
    (r'(ve tau|vé tàu|ve xe|vé xe|phuong trang|thanh buoi|vexere)', 'Di chuyển', 0.95),
    (r'(gui xe|gửi xe|giu xe|giữ xe|phi do xe|phí đỗ xe|rua xe|rửa xe)', 'Di chuyển', 0.92),
    (r'(epass|vetc|thu phi khong dung|phí cầu đường|bot )', 'Di chuyển', 0.95),

    # 4. Hóa đơn & Tiện ích (Bills & Utilities)
    (r'(tien dien|tiền điện|evn|dien luc|điện lực)', 'Hóa đơn & Tiện ích', 0.98),
    (r'(tien nuoc|tiền nước|cap nuoc|cấp nước|hawaco|sawaco)', 'Hóa đơn & Tiện ích', 0.98),
    (r'(internet|vnpt|viettel telecom|fpt telecom|cap quang|truyen hinh|truyền hình)', 'Hóa đơn & Tiện ích', 0.95),
    (r'(nap dt|nạp đt|topup|vina|mobi|viettel pay|nap tien dien thoai)', 'Hóa đơn & Tiện ích', 0.93),

    # 5. Nhà ở & Sinh hoạt (Housing)
    (r'(tien nha|tiền nhà|thue nha|thuê nhà|tien phong|tiền phòng)', 'Nhà ở & Sinh hoạt', 0.95),
    (r'(chung cu|chung cư|phi quan ly|phí quản lý|ban quan ly|bql)', 'Nhà ở & Sinh hoạt', 0.93),
    (r'(dien may xanh|nguyen kim|dien may|noi that|nội thất|sua nha|sửa nhà)', 'Nhà ở & Sinh hoạt', 0.90),

    # 6. Sức khỏe & Y tế (Health & Medical)
    (r'(benh vien|bệnh viện|phong kham|phòng khám|nha khoa|rang ham mat)', 'Sức khỏe & Y tế', 0.95),
    (r'(pharmacity|long chau|long châu|an khang|nha thuoc|nhà thuốc|thuoc |thuốc )', 'Sức khỏe & Y tế', 0.95),
    (r'(xet nghiem|xét nghiệm|kham benh|khám bệnh|tiem chung|tiêm chủng)', 'Sức khỏe & Y tế', 0.92),
    (r'(bao hiem|bảo hiểm|manulife|prudential|dai-ichi|chubb|aia)', 'Sức khỏe & Y tế', 0.90),

    # 7. Giáo dục & Học tập (Education)
    (r'(hoc phi|học phí|khoa hoc|khóa học|truong hoc|trường học|dai hoc|đại học)', 'Giáo dục & Học tập', 0.95),
    (r'(sach|sách|fahasa|nha sach|nhà sách)', 'Giáo dục & Học tập', 0.92),
    (r'(toeic|ielts|tieng anh|tiếng anh|udemy|coursera|gia su|gia sư)', 'Giáo dục & Học tập', 0.93),

    # 8. Giải trí & Du lịch (Entertainment & Travel)
    (r'(netflix|spotify|youtube premium|apple\.com/bill|itunes|google play|steam|playstation|nintendo)', 'Giải trí & Du lịch', 0.96),
    (r'(cgv|lotte cinema|bhd|galaxy cinema|rap chieu phim|rạp chiếu phim|xem phim)', 'Giải trí & Du lịch', 0.95),
    (r'(khach san|khách sạn|hotel|resort|homestay|booking\.com|agoda|traveloka|klook)', 'Giải trí & Du lịch', 0.93),
    (r'(du lich|du lịch|tour|ve tham quan|vé tham quan)', 'Giải trí & Du lịch', 0.92),

    # 9. Gia đình & Cá nhân (Family & Personal)
    (r'(bim|bỉm|sua bot|sữa bột|me va be|mẹ và bé|concung|con cưng)', 'Gia đình & Cá nhân', 0.93),
    (r'(bieu bo me|biếu bố mẹ|gui me|gửi mẹ|gui ba|gửi ba|tien tieu vat)', 'Gia đình & Cá nhân', 0.92),
    (r'(mung cuoi|mừng cưới|dam cuoi|đám cưới|hieu hi|hiếu hỉ|sinh nhat|sinh nhật)', 'Gia đình & Cá nhân', 0.90),

    # 10. Đầu tư & Tiết kiệm (Investment & Savings)
    (r'(vao tk tich luy|tich luy nh u y|tk tich luy|tích luỹ|tich luy)', 'Đầu tư & Tiết kiệm', 0.99),
    (r'(tiet kiem|tiết kiệm|gui tiet kiem|gửi tiết kiệm|so tiet kiem)', 'Đầu tư & Tiết kiệm', 0.96),
    (r'(chung khoan|chứng khoán|vps|ssi|vndirect|tcbs|hsc|mirae asset)', 'Đầu tư & Tiết kiệm', 0.95),
    (r'(mua vang|vàng|pnj|doji|sjc|bao tin minh chau)', 'Đầu tư & Tiết kiệm', 0.92),
    (r'(binance|remitano|crypto|bybit|okx)', 'Đầu tư & Tiết kiệm', 0.92),

    # 11. Thu nhập / Lương (Income)
    (r'(luong|lương|salary|payroll|tra luong|trả lương)', 'Lương & Thu nhập', 0.98),
    (r'(thuong|thưởng|bonus|hoa hong|hoa hồng|commission)', 'Thưởng & Hoa hồng', 0.95),
    (r'(hoan tien|hoàn tiền|cashback|lai tien gui|lãi tiền gửi|lai tiet kiem)', 'Thu nhập khác', 0.92),
]

def load_user_rules() -> Dict[str, str]:
    """Loads custom user pattern -> category rules from database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT pattern, category FROM user_rules")
    rules = {row["pattern"].lower(): row["category"] for row in cursor.fetchall()}
    conn.close()
    return rules

def categorize_single_transaction(
    trans: Dict[str, Any],
    user_rules: Dict[str, str]
) -> Tuple[str, float]:
    """
    Applies Layer 1 (User Rules) and Layer 2 (Heuristics)
    Returns (category_name, confidence)
    """
    desc = (trans.get("description", "") + " " + trans.get("raw_description", "")).lower()
    trans_type = trans.get("type", "expense")

    # Layer 1: User custom rules (Learned memory)
    for pattern, cat in user_rules.items():
        if pattern in desc:
            return cat, 1.0

    # If it's an income transaction, match income categories first
    if trans_type == "income":
        for pat, cat, conf in VIETNAMESE_PATTERNS:
            if cat in ['Lương & Thu nhập', 'Thưởng & Hoa hồng', 'Thu nhập khác']:
                if re.search(pat, desc, re.IGNORECASE):
                    return cat, conf
        return "Thu nhập khác", 0.7

    # Layer 2: Built-in Vietnamese Heuristic Patterns
    for pat, cat, conf in VIETNAMESE_PATTERNS:
        if cat not in ['Lương & Thu nhập', 'Thưởng & Hoa hồng', 'Thu nhập khác']:
            if re.search(pat, desc, re.IGNORECASE):
                return cat, conf

    # Default fallback
    return "Khác", 0.3

async def batch_categorize_transactions(
    transactions: List[Dict[str, Any]],
    use_ai: bool = True
) -> List[Dict[str, Any]]:
    """
    Categorizes a batch of transactions using:
    1. User Rules
    2. Heuristics
    3. AI LLM (Gemini / OpenAI) for transactions that ended up as 'Khác' or low confidence (< 0.75)
    """
    user_rules = load_user_rules()
    
    # Get available categories from database
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT name FROM categories")
    valid_categories = [row["name"] for row in c.fetchall()]
    
    # Load settings for AI
    c.execute("SELECT key, value FROM settings")
    settings = {row["key"]: row["value"] for row in c.fetchall()}
    conn.close()

    categorized = []
    needs_ai = []

    for t in transactions:
        t_copy = dict(t)
        # If user explicitly set category manually already, keep it
        if t_copy.get("is_manual_category", 0) == 1:
            t_copy["ai_confidence"] = 1.0
            categorized.append(t_copy)
            continue

        cat, conf = categorize_single_transaction(t_copy, user_rules)
        t_copy["category"] = cat
        t_copy["ai_confidence"] = conf

        # If low confidence or classified as "Khác", queue for AI
        if conf < 0.75 or cat == "Khác":
            needs_ai.append(t_copy)
        
        categorized.append(t_copy)

    # Layer 3: Call LLM if enabled and we have pending items
    if use_ai and needs_ai:
        ai_provider = settings.get("ai_provider", "gemini")
        gemini_key = settings.get("gemini_api_key", "").strip()
        openai_key = settings.get("openai_api_key", "").strip()

        ai_results = []
        if ai_provider == "gemini" and gemini_key:
            model = settings.get("gemini_model", "gemini-2.5-flash")
            ai_results = await call_gemini_categorizer(needs_ai, valid_categories, gemini_key, model)
        elif ai_provider in ["openai", "ollama"] and (openai_key or ai_provider == "ollama"):
            base_url = settings.get("ollama_endpoint", "http://localhost:11434/v1") if ai_provider == "ollama" else "https://api.openai.com/v1"
            model = settings.get("openai_model", "gpt-4o-mini")
            ai_results = await call_openai_categorizer(needs_ai, valid_categories, openai_key, base_url, model)

        # Merge AI results back
        if ai_results:
            ai_map = {res.get("id"): res for res in ai_results if "id" in res}
            for item in categorized:
                item_id = item.get("id")
                if item_id in ai_map:
                    ai_cat = ai_map[item_id].get("category")
                    ai_conf = ai_map[item_id].get("confidence", 0.9)
                    if ai_cat in valid_categories:
                        item["category"] = ai_cat
                        item["ai_confidence"] = float(ai_conf)

    return categorized

def learn_user_rule(description: str, category: str):
    """
    Extracts a representative keyword/phrase from description and learns it as a user rule.
    """
    if not description or not category:
        return

    # Extract dominant merchant keyword
    cleaned = re.sub(r'[^a-zA-Z0-9\sáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđĐ]', ' ', description)
    words = [w.strip() for w in cleaned.split() if len(w.strip()) > 2]
    
    if not words:
        return

    # Take first 1-3 prominent words as pattern
    pattern = " ".join(words[:2]).lower()

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO user_rules (pattern, category)
    VALUES (?, ?)
    ON CONFLICT(pattern) DO UPDATE SET category = excluded.category
    """, (pattern, category))
    conn.commit()
    conn.close()
