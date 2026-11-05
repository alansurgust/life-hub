from pydantic import BaseModel, Field
from typing import Optional, List

class TransactionCreate(BaseModel):
    date: str
    amount: float
    type: str = "expense"
    category: str
    description: str
    raw_description: Optional[str] = None
    ref_no: Optional[str] = None

class TransactionUpdate(BaseModel):
    date: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    is_manual_category: Optional[int] = 1

class SettingsUpdate(BaseModel):
    ai_provider: Optional[str] = None
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = None
    ollama_endpoint: Optional[str] = None

class RawTextUpload(BaseModel):
    text: str
    bank_name: Optional[str] = "Ngân hàng"
    statement_month: Optional[str] = None

class CategoryUpdate(BaseModel):
    category: str

class UserRuleCreate(BaseModel):
    pattern: str
    category: str

# ----------------- SECTION 2: TO-DO MODELS -----------------
class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    due_date: str
    priority: Optional[str] = "normal"
    category: Optional[str] = "Công việc"
    pomodoro_est: Optional[int] = 1

class TodoStatusUpdate(BaseModel):
    status: str

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    pomodoro_est: Optional[int] = None
    pomodoro_done: Optional[int] = None

# ----------------- SECTION 3: HABIT MODELS -----------------
class HabitCreate(BaseModel):
    name: str
    icon: Optional[str] = "sparkles"
    color: Optional[str] = "#5F7465"
    target_days: Optional[int] = 7

class HabitUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    target_days: Optional[int] = None

# ----------------- SECTION 4: JOURNAL MODELS -----------------
class JournalEntryCreate(BaseModel):
    date: str
    title: Optional[str] = ""
    content: Optional[str] = ""
    mood: Optional[str] = "good"
    gratitude: Optional[str] = ""
    improvement: Optional[str] = ""

# ----------------- SECTION 5: NOTE MODELS -----------------
class NoteCreate(BaseModel):
    title: str
    content: Optional[str] = ""
    category: Optional[str] = "Ý tưởng"
    is_pinned: Optional[int] = 0
    color: Optional[str] = "#FFFDF9"

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    is_pinned: Optional[int] = None
    color: Optional[str] = None

