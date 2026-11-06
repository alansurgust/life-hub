import os
import sqlite3
from typing import List, Dict, Any, Optional

DB_PATH = os.environ.get("DB_PATH")
if not DB_PATH:
    DATA_DIR = r"D:\app\finance"
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
    {"name": "Ăn uống", "type": "expense", "color": "#D05D0A", "icon": "utensils"},
    {"name": "Mua sắm", "type": "expense", "color": "#D05D0A", "icon": "shopping-bag"},
    {"name": "Di chuyển", "type": "expense", "color": "#6F7C6B", "icon": "car"},
    {"name": "Hóa đơn & Tiện ích", "type": "expense", "color": "#E7A366", "icon": "zap"},
    {"name": "Nhà ở & Sinh hoạt", "type": "expense", "color": "#D05D0A", "icon": "home"},
    {"name": "Sức khỏe & Y tế", "type": "expense", "color": "#B34E06", "icon": "heart-pulse"},
    {"name": "Giáo dục & Học tập", "type": "expense", "color": "#3E5247", "icon": "book-open"},
    {"name": "Giải trí & Du lịch", "type": "expense", "color": "#6F7C6B", "icon": "film"},
    {"name": "Gia đình & Cá nhân", "type": "expense", "color": "#3E5247", "icon": "users"},
    {"name": "Đầu tư & Tiết kiệm", "type": "expense", "color": "#3E5247", "icon": "trending-up"},
    {"name": "Chưa phân loại", "type": "expense", "color": "#E7A366", "icon": "help-circle"},
    {"name": "Khác", "type": "expense", "color": "#9BA59D", "icon": "circle-ellipsis"},
    # Income categories
    {"name": "Lương & Thu nhập", "type": "income", "color": "#6F7C6B", "icon": "wallet"},
    {"name": "Thưởng & Hoa hồng", "type": "income", "color": "#E7A366", "icon": "gift"},
    {"name": "Thu nhập khác", "type": "income", "color": "#3E5247", "icon": "arrow-down-left"},
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Categories table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
        color TEXT DEFAULT '#3E5247',
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        color TEXT DEFAULT '#6F7C6B',
        target_days INTEGER DEFAULT 7,
        streak INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        color TEXT DEFAULT '#FFF9F6',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned, updated_at)")

    # ----------------- SECTION 6: SYNC DELETION TRACKING (Tombstones) -----------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS deleted_records (
        table_name TEXT NOT NULL,
        record_uid TEXT NOT NULL,
        deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (table_name, record_uid)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_del_rec ON deleted_records(table_name, record_uid)")

    # Safe schema migration for updated_at in all tables
    for tbl in ["todos", "habits", "transactions"]:
        try:
            cursor.execute(f"ALTER TABLE {tbl} ADD COLUMN updated_at DATETIME")
        except Exception:
            pass

    try:
        cursor.execute("UPDATE todos SET updated_at = COALESCE(completed_at, created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL")
        cursor.execute("UPDATE habits SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL")
        cursor.execute("UPDATE transactions SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL")
        cursor.execute("UPDATE notes SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL")
        cursor.execute("UPDATE journal_entries SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL")
    except Exception:
        pass

    # Seed initial sample data if tables are empty
    _seed_initial_life_hub_data(cursor)

    conn.commit()
    conn.close()

def _seed_initial_life_hub_data(cursor):
    import json
    import datetime

    # 1. If initial_seed.json exists and database is fresh, populate full authentic seed
    seed_file = os.path.join(os.path.dirname(__file__), "data", "initial_seed.json")
    if os.path.exists(seed_file):
        cursor.execute("SELECT COUNT(*) FROM transactions")
        tx_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM habits")
        hb_count = cursor.fetchone()[0]
        if tx_count == 0 and hb_count == 0:
            try:
                with open(seed_file, "r", encoding="utf-8") as f:
                    seed_data = json.load(f)

                # Transactions
                for t in seed_data.get("transactions", []):
                    cursor.execute("""
                        INSERT INTO transactions (date, month, week, type, amount, category, description, raw_description, ref_no, balance, is_manual_category, ai_confidence)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        t.get("date"), t.get("month"), t.get("week"), t.get("type"), t.get("amount"),
                        t.get("category"), t.get("description"), t.get("raw_description"), t.get("ref_no"),
                        t.get("balance"), t.get("is_manual_category", 1), t.get("ai_confidence", 1.0)
                    ))

                # Habits
                habit_id_map = {}
                for h in seed_data.get("habits", []):
                    cursor.execute("INSERT INTO habits (name, icon, color, streak, best_streak) VALUES (?, ?, ?, ?, ?)",
                                   (h.get("name"), h.get("icon", "flame"), h.get("color", "#6F7C6B"), h.get("streak", 0), h.get("best_streak", 0)))
                    habit_id_map[h.get("id")] = cursor.lastrowid

                # Habit logs
                for hl in seed_data.get("habit_logs", []):
                    new_h_id = habit_id_map.get(hl.get("habit_id"))
                    if new_h_id:
                        cursor.execute("INSERT OR IGNORE INTO habit_logs (habit_id, date, status) VALUES (?, ?, ?)",
                                       (new_h_id, hl.get("date"), hl.get("status", 1)))

                # Todos
                for item in seed_data.get("todos", []):
                    cursor.execute("""
                        INSERT INTO todos (title, description, due_date, priority, status, category, pomodoro_est, pomodoro_done, completed_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        item.get("title"), item.get("description", ""), item.get("due_date"),
                        item.get("priority", "normal"), item.get("status", "pending"),
                        item.get("category", "Công việc"), item.get("pomodoro_est", 1),
                        item.get("pomodoro_done", 0), item.get("completed_at")
                    ))

                # Journal
                for j in seed_data.get("journal_entries", []):
                    cursor.execute("""
                        INSERT INTO journal_entries (date, title, mood, gratitude, improvement, content)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (j.get("date"), j.get("title"), j.get("mood"), j.get("gratitude"), j.get("improvement"), j.get("content")))

                # Notes
                for n in seed_data.get("notes", []):
                    cursor.execute("INSERT INTO notes (title, content, category, is_pinned, color) VALUES (?, ?, ?, ?, ?)",
                                   (n.get("title"), n.get("content"), n.get("category"), n.get("is_pinned", 0), n.get("color", "#6F7C6B")))
                return
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Lỗi nạp initial_seed.json: {e}", exc_info=True)

    # No fake habit seeding - authentic habits only

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at", DB_PATH)
