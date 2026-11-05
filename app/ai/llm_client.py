import json
import logging
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

async def call_gemini_categorizer(
    transactions: List[Dict[str, Any]],
    categories: List[str],
    api_key: str,
    model: str = "gemini-2.5-flash"
) -> List[Dict[str, Any]]:
    """
    Calls Google Gemini REST API directly with structured output prompt.
    Batch processes multiple transactions to minimize API calls and latency.
    """
    if not api_key:
        return []

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    # Prepare batch payload
    items_to_classify = [
        {"id": t.get("id", idx), "description": t.get("description", ""), "amount": t.get("amount", 0), "type": t.get("type", "expense")}
        for idx, t in enumerate(transactions)
    ]

    prompt = f"""Bạn là chuyên gia phân loại chi tiêu và tài chính cá nhân cho người dùng Việt Nam.
Dưới đây là danh sách các giao dịch từ sao kê ngân hàng và danh sách các danh mục hợp lệ:

DANH MỤC HỢP LỆ:
{json.dumps(categories, ensure_ascii=False)}

QUY TẮC PHÂN LOẠI:
- Phân tích nội dung giao dịch (chú ý tên quán, dịch vụ, viết tắt tiếng Việt không dấu như: shopeefood, grab, be, winmart, highlands, tien dien, hoc phi, luong, v.v.).
- Trả về kết quả dưới dạng JSON Array, mỗi phần tử gồm:
  {{"id": <id>, "category": "<tên danh mục chính xác từ danh sách trên>", "confidence": <số từ 0.0 đến 1.0>}}

GIAO DỊCH CẦN PHÂN LOẠI:
{json.dumps(items_to_classify, ensure_ascii=False)}

CHỈ TRẢ VỀ DUY NHẤT MẢNG JSON HỢP LỆ, KHÔNG KÈM GIẢI THÍCH HAY MARKDOWN.
"""

    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json"
        }
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                logger.error(f"Gemini API error: {resp.status_code} - {resp.text}")
                return []

            data = resp.json()
            text_resp = data["candidates"][0]["content"]["parts"][0]["text"]
            
            # Clean possible markdown block
            text_resp = text_resp.strip()
            if text_resp.startswith("```json"):
                text_resp = text_resp[7:]
            if text_resp.startswith("```"):
                text_resp = text_resp[3:]
            if text_resp.endswith("```"):
                text_resp = text_resp[:-3]

            result_list = json.loads(text_resp.strip())
            return result_list if isinstance(result_list, list) else []

    except Exception as e:
        logger.error(f"Failed to query Gemini API: {e}")
        return []

async def call_openai_categorizer(
    transactions: List[Dict[str, Any]],
    categories: List[str],
    api_key: str,
    base_url: str = "https://api.openai.com/v1",
    model: str = "gpt-4o-mini"
) -> List[Dict[str, Any]]:
    """
    Calls OpenAI / Ollama compatible endpoint for categorization.
    """
    items_to_classify = [
        {"id": t.get("id", idx), "description": t.get("description", ""), "amount": t.get("amount", 0), "type": t.get("type", "expense")}
        for idx, t in enumerate(transactions)
    ]

    prompt = f"""Bạn là trợ lý tài chính thông minh phân loại chi tiêu ngân hàng Việt Nam.
Danh mục: {json.dumps(categories, ensure_ascii=False)}

Hãy phân loại danh sách sau và trả về JSON Array [ {{"id": ..., "category": "...", "confidence": 0.9}} ]:
{json.dumps(items_to_classify, ensure_ascii=False)}
"""

    headers = {
        "Content-Type": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a Vietnamese financial categorization AI. Respond only in pure JSON."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"} if "gpt-4" in model else None
    }

    try:
        endpoint = f"{base_url.rstrip('/')}/chat/completions"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(endpoint, headers=headers, json=payload)
            if resp.status_code != 200:
                logger.error(f"OpenAI error: {resp.status_code} - {resp.text}")
                return []

            data = resp.json()
            content = data["choices"][0]["message"]["content"].strip()
            
            # Clean markdown
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]

            parsed = json.loads(content.strip())
            if isinstance(parsed, list):
                return parsed
            elif isinstance(parsed, dict):
                for val in parsed.values():
                    if isinstance(val, list):
                        return val
            return []
    except Exception as e:
        logger.error(f"Failed to query OpenAI API: {e}")
        return []
