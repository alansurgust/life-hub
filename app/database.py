import os
import sqlite3
from typing import List, Dict, Any, Optional

DB_PATH = os.environ.get("DB_PATH")
if not DB_PATH:
    DATA_DIR = r"D:\Finance"
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
    except Exception:
        pass

    if os.path.exists(DATA_DIR):
        DB_PATH = os.path.join(DATA_DIR, "expense_data.db")
    else:
        DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "expense_data.db")
else:
    # Ensure parent dir exists for custom DB_PATH (e.g. /data/expense_data.db in Docker/Cloud Run)
    try:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    except Exception:
        pass

DEFAULT_CATEGORIES = [
    # Expense categories (Vintage Palette Design System)
    {"name": "Ăn uống", "type": "expense", "color": "#C3651F", "icon": "utensils"},
    {"name": "Mua sắm", "type": "expense", "color": "#B14720", "icon": "shopping-bag"},
    {"name": "Di chuyển", "type": "expense", "color": "#5F7465", "icon": "car"},
    {"name": "Hóa đơn & Tiện ích", "type": "expense", "color": "#D39526", "icon": "zap"},
    {"name": "Nhà ở & Sinh hoạt", "type": "expense", "color": "#663B1B", "icon": "home"},
    {"name": "Sức khỏe & Y tế", "type": "expense", "color": "#7C3929", "icon": "heart-pulse"},
    {"name": "Giáo dục & Học tập", "type": "expense", "color": "#626037", "icon": "book-open"},
    {"name": "Giải trí & Du lịch", "type": "expense", "color": "#5F7465", "icon": "film"},
    {"name": "Gia đình & Cá nhân", "type": "expense", "color": "#552F26", "icon": "users"},
    {"name": "Đầu tư & Tiết kiệm", "type": "expense", "color": "#626037", "icon": "trending-up"},
    {"name": "Chưa phân loại", "type": "expense", "color": "#D39526", "icon": "help-circle"},
    {"name": "Khác", "type": "expense", "color": "#8E8275", "icon": "circle-ellipsis"},
    # Income categories
    {"name": "Lương & Thu nhập", "type": "income", "color": "#5F7465", "icon": "wallet"},
    {"name": "Thưởng & Hoa hồng", "type": "income", "color": "#D39526", "icon": "gift"},
    {"name": "Thu nhập khác", "type": "income", "color": "#626037", "icon": "arrow-down-left"},
]

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Statements table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS statements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        bank_name TEXT DEFAULT 'Ngân hàng',
        statement_month TEXT NOT NULL, -- YYYY-MM
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_in REAL DEFAULT 0,
        total_out REAL DEFAULT 0,
        transaction_count INTEGER DEFAULT 0
    )
    """)

    # Transactions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        statement_id INTEGER REFERENCES statements(id) ON DELETE CASCADE,
        date TEXT NOT NULL, -- YYYY-MM-DD
        month TEXT NOT NULL, -- YYYY-MM
        week TEXT NOT NULL, -- YYYY-Www
        type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        raw_description TEXT,
        ref_no TEXT,
        balance REAL,
        ai_confidence REAL DEFAULT 0.8,
        is_manual_category INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Categories table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
        color TEXT DEFAULT '#3b82f6',
        icon TEXT DEFAULT 'tag'
    )
    """)

    # User Learned Rules (e.g. pattern -> category)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # System Settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    # Insert default categories if table is empty or missing
    cursor.execute("SELECT COUNT(*) FROM categories")
    if cursor.fetchone()[0] == 0:
        for cat in DEFAULT_CATEGORIES:
            cursor.execute(
                "INSERT INTO categories (name, type, color, icon) VALUES (?, ?, ?, ?)",
                (cat["name"], cat["type"], cat["color"], cat["icon"])
            )
    else:
        for cat in DEFAULT_CATEGORIES:
            cursor.execute(
                "INSERT OR IGNORE INTO categories (name, type, color, icon) VALUES (?, ?, ?, ?)",
                (cat["name"], cat["type"], cat["color"], cat["icon"])
            )

    # Insert default settings if missing
    default_settings = {
        "ai_provider": "gemini", # gemini, openai, ollama, or none
        "gemini_api_key": "",
        "gemini_model": "gemini-2.5-flash",
        "openai_api_key": "",
        "openai_model": "gpt-4o-mini",
        "ollama_endpoint": "http://localhost:11434"
    }
    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

    # Create indexes for fast filtering and statistics
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_month ON transactions(month)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_date ON transactions(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_category ON transactions(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_type ON transactions(type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_manual_conf ON transactions(is_manual_category, ai_confidence)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_month_type ON transactions(month, type)")

    # ----------------- SECTION 2: TO-DO & TASKS (Super Productivity & Vikunja) -----------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        due_date TEXT NOT NULL, -- YYYY-MM-DD
        priority TEXT DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
        category TEXT DEFAULT 'Công việc',
        pomodoro_est INTEGER DEFAULT 1,
        pomodoro_done INTEGER DEFAULT 0,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_todos_status_due ON todos(status, due_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority)")

    # ----------------- SECTION 3: HABITS & STREAKS (Habitica) -----------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT DEFAULT 'sparkles',
        color TEXT DEFAULT '#5F7465',
        target_days INTEGER DEFAULT 7,
        streak INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS habit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
        date TEXT NOT NULL, -- YYYY-MM-DD
        status INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(habit_id, date)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date)")

    # ----------------- SECTION 4: JOURNAL & MOOD (AppFlowy) -----------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS journal_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL, -- YYYY-MM-DD
        title TEXT DEFAULT '',
        content TEXT DEFAULT '',
        mood TEXT DEFAULT 'good' CHECK (mood IN ('great', 'good', 'neutral', 'tired', 'stressed')),
        gratitude TEXT DEFAULT '',
        improvement TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date)")

    # ----------------- SECTION 5: NOTES & SECOND BRAIN (AppFlowy & Vikunja) -----------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT DEFAULT '',
        category TEXT DEFAULT 'Ý tưởng',
        is_pinned INTEGER DEFAULT 0,
        color TEXT DEFAULT '#FFFDF9',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned, updated_at)")

    # Seed initial sample data if tables are empty
    _seed_initial_life_hub_data(cursor)

    conn.commit()
    conn.close()

def _seed_initial_life_hub_data(cursor):
    import datetime
    today_str = datetime.date.today().isoformat()
    yesterday_str = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    # Do not auto-seed dummy todos; user manages their own authentic tasks.

    # Seed Habits
    cursor.execute("SELECT COUNT(*) FROM habits")
    if cursor.fetchone()[0] == 0:
        sample_habits = [
            ("Uống đủ 2L nước mỗi ngày", "droplet", "#5F7465", 7, 6, 14),
            ("Đọc sách 30 phút", "book-open", "#D39526", 7, 4, 10),
            ("Tập thể dục 30 phút", "activity", "#B14720", 7, 3, 7),
            ("Ghi chép thu chi mỗi ngày", "wallet", "#264653", 7, 7, 21),
            ("Ngủ trước 23h tối", "moon", "#626037", 7, 5, 9),
        ]
        for h in sample_habits:
            cursor.execute("INSERT INTO habits (name, icon, color, target_days, streak, best_streak) VALUES (?, ?, ?, ?, ?, ?)", h)
            habit_id = cursor.lastrowid
            # Log completion for the last 5 days
            for d in range(5):
                past_date = (datetime.date.today() - datetime.timedelta(days=d)).isoformat()
                cursor.execute("INSERT OR IGNORE INTO habit_logs (habit_id, date, status) VALUES (?, ?, 1)", (habit_id, past_date))

    # Seed Journal
    cursor.execute("SELECT COUNT(*) FROM journal_entries")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO journal_entries (date, title, content, mood, gratitude, improvement)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            today_str,
            "Khởi đầu mới với Hệ điều hành cá nhân All-in-One",
            "Hôm nay là một ngày nhiều năng lượng. Toàn bộ dữ liệu tài chính đã được dọn sang ổ D:\\Finance an toàn và ứng dụng bắt đầu được mở rộng thành một hệ thống cá nhân toàn diện gồm To-Do, Thói quen, Nhật ký và Ghi chú.",
            "great",
            "Biết ơn sức khỏe tốt, tinh thần tập trung và sự tiến bộ rõ rệt trong việc tự động hóa công việc.",
            "Cần duy trì việc uống nước đều đặn hơn trong lúc ngồi làm việc lâu."
        ))

    # Seed Notes
    cursor.execute("SELECT COUNT(*) FROM notes")
    if cursor.fetchone()[0] == 0:
        sample_notes = [
            ("Quy tắc 50/30/20 trong quản trị tài chính cá nhân", "• 50% Nhu cầu thiết yếu: Ăn uống, sinh hoạt, tiền nhà, hóa đơn.\n• 30% Mong muốn cá nhân: Mua sắm, giải trí, cà phê, du lịch.\n• 20% Tiết kiệm & Tích lũy: Quỹ khẩn cấp 3-6 tháng, quỹ đầu tư dài hạn.", "Tài chính", 1, "#FFFDF9"),
            ("Kỹ thuật Pomodoro tăng năng suất làm việc", "1. Chọn 1 công việc cụ thể cần hoàn thành.\n2. Bấm giờ 25 phút tập trung tuyệt đối, không đa nhiệm.\n3. Nghỉ giải lao ngắn 5 phút (vươn vai, uống nước).\n4. Cứ sau 4 chu kỳ Pomodoro thì nghỉ dài 15 - 30 phút.", "Công việc", 1, "#FFFDF9"),
            ("Danh sách sách phát triển bản thân quý 4", "1. Atomic Habits (Thay Đổi Tí Hon) - James Clear\n2. The Psychology of Money (Tâm Lý Học Về Tiền) - Morgan Housel\n3. Deep Work (Làm Ra Làm, Chơi Ra Chơi) - Cal Newport", "Học tập", 0, "#FFFDF9"),
            ("Ý tưởng phát triển hệ sinh thái Life OS", "• Tích hợp liên kết chéo: Việc cần làm có thể đính kèm khoản tiền dự chi trong mục Tài chính.\n• Báo cáo năng suất cá nhân tổng hợp vào cuối tuần (Weekly Review).", "Ý tưởng", 0, "#FFFDF9"),
        ]
        for n in sample_notes:
            cursor.execute("INSERT INTO notes (title, content, category, is_pinned, color) VALUES (?, ?, ?, ?, ?)", n)

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at", DB_PATH)
