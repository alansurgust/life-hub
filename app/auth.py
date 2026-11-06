import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
import sqlite3
from fastapi import Request, HTTPException, status, Header, Depends

def hash_password(password: str) -> Tuple[str, str]:
    """Hashes a password with a random salt using PBKDF2-HMAC-SHA256 (100k iterations)."""
    salt = secrets.token_hex(16)
    pw_hash = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), 100000
    ).hex()
    return pw_hash, salt

def verify_password(password: str, pw_hash: str, salt: str) -> bool:
    """Verifies a plain password against the stored PBKDF2 hash and salt."""
    if not password or not pw_hash or not salt:
        return False
    try:
        check_hash = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt), 100000
        ).hex()
        return hmac.compare_digest(pw_hash, check_hash)
    except Exception:
        return False

def init_auth_schema(conn: sqlite3.Connection):
    """Initializes users and sessions tables, migrates user_id column, and seeds alansurgust."""
    c = conn.cursor()

    # 1. Users table
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        full_name TEXT DEFAULT '',
        avatar TEXT DEFAULT '',
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 2. Sessions table
    c.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
    )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token_exp ON sessions(token, expires_at)")

    # 3. Add user_id column to existing data tables
    data_tables = [
        "transactions", "statements", "todos", "habits", 
        "journal_entries", "notes", "categories", "user_rules"
    ]
    for tbl in data_tables:
        try:
            c.execute(f"ALTER TABLE {tbl} ADD COLUMN user_id INTEGER DEFAULT 1")
        except Exception:
            pass  # Already exists

    # 4. Seed or update primary user: alansurgust / 230607
    c.execute("SELECT id, username FROM users WHERE LOWER(username) = 'alansurgust'")
    row = c.fetchone()
    pw_hash, salt = hash_password("230607")
    if not row:
        c.execute("""
        INSERT INTO users (id, username, password_hash, salt, full_name, role)
        VALUES (1, 'alansurgust', ?, ?, 'Alan Surgust', 'admin')
        """, (pw_hash, salt))
        primary_user_id = 1
    else:
        primary_user_id = row["id"]
        c.execute("""
        UPDATE users SET password_hash = ?, salt = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """, (pw_hash, salt, primary_user_id))

    # 5. Ensure all existing rows belong to primary user (user_id = 1)
    for tbl in data_tables:
        try:
            c.execute(f"UPDATE {tbl} SET user_id = ? WHERE user_id IS NULL OR user_id = 0", (primary_user_id,))
        except Exception:
            pass

    # 6. Create indexes for user_id on critical queries
    try:
        c.execute("CREATE INDEX IF NOT EXISTS idx_trans_user_month ON transactions(user_id, month)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_todos_user_status ON todos(user_id, status)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_journal_user_date ON journal_entries(user_id, date)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_notes_user_pinned ON notes(user_id, is_pinned)")
    except Exception:
        pass

    conn.commit()

def create_session(conn: sqlite3.Connection, user_id: int, days_valid: int = 30) -> str:
    """Creates a random 64-char hex session token for a user with expiration."""
    token = secrets.token_hex(32)
    expires_at = (datetime.now() + timedelta(days=days_valid)).strftime("%Y-%m-%d %H:%M:%S")
    c = conn.cursor()
    c.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", (token, user_id, expires_at))
    conn.commit()
    return token

def validate_session(conn: sqlite3.Connection, token: str) -> Optional[Dict[str, Any]]:
    """Validates session token, returning user dict or None if invalid/expired."""
    if not token or len(token) < 20:
        return None
    c = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute("""
        SELECT u.id, u.username, u.full_name, u.role, u.avatar, s.expires_at
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > ?
    """, (token, now_str))
    row = c.fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "username": row["username"],
        "full_name": row["full_name"],
        "role": row["role"],
        "avatar": row["avatar"]
    }

def delete_session(conn: sqlite3.Connection, token: str):
    """Deletes a session token on logout."""
    if not token:
        return
    c = conn.cursor()
    c.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()

def extract_token_from_request(request: Request) -> Optional[str]:
    """Extracts bearer token from Authorization header, X-Auth-Token, Cookie or Query param."""
    # 1. Authorization header: Bearer <token>
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1].strip()

    # 2. X-Auth-Token custom header
    x_token = request.headers.get("X-Auth-Token") or request.headers.get("x-auth-token")
    if x_token:
        return x_token.strip()

    # 3. Cookie
    cookie_token = request.cookies.get("life_hub_token")
    if cookie_token:
        return cookie_token.strip()

    # 4. Query param
    q_token = request.query_params.get("token")
    if q_token:
        return q_token.strip()

    return None
