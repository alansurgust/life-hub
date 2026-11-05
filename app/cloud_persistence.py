import os
import json
import logging
import asyncio
import threading
from typing import Optional

logger = logging.getLogger("life_hub.cloud_storage")

def _load_env_fallback():
    env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if os.path.exists(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k and k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass

_load_env_fallback()

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
GITHUB_GIST_ID = os.environ.get("GITHUB_GIST_ID", "a8045f8ff3498cbf7fe7356493f6f632").strip()

_push_timer = None
_timer_lock = threading.Lock()

def get_token() -> str:
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        return token
    # On local Windows machine, try reading from Credential Manager as fallback
    try:
        import ctypes
        from ctypes import wintypes

        class CREDENTIAL(ctypes.Structure):
            _fields_ = [
                ('Flags', wintypes.DWORD),
                ('Type', wintypes.DWORD),
                ('TargetName', wintypes.LPWSTR),
                ('Comment', wintypes.LPWSTR),
                ('LastWritten', wintypes.FILETIME),
                ('CredentialBlobSize', wintypes.DWORD),
                ('CredentialBlob', ctypes.POINTER(ctypes.c_byte)),
                ('Persist', wintypes.DWORD),
                ('AttributeCount', wintypes.DWORD),
                ('Attributes', ctypes.c_void_p),
                ('TargetAlias', wintypes.LPWSTR),
                ('UserName', wintypes.LPWSTR),
            ]

        Advapi32 = ctypes.WinDLL('Advapi32.dll')
        p_cred = ctypes.POINTER(CREDENTIAL)()
        res = Advapi32.CredReadW('git:https://alansurgust@github.com', 1, 0, ctypes.byref(p_cred))
        if res:
            raw = ctypes.string_at(p_cred.contents.CredentialBlob, p_cred.contents.CredentialBlobSize)
            return raw.decode('utf-16le', errors='ignore').strip() or raw.decode('utf-8', errors='ignore').strip()
    except Exception:
        pass
    return ""

def _get_github_headers(token: str) -> dict:
    auth = f"Bearer {token}" if (token.startswith("gho_") or token.startswith("github_pat_") or token.startswith("ghp_")) else f"token {token}"
    return {
        "Authorization": auth,
        "Accept": "application/vnd.github+json",
        "User-Agent": "LifeHubApp/1.0"
    }

def load_data_from_gist() -> Optional[dict]:
    token = get_token()
    if not token or not GITHUB_GIST_ID:
        logger.info("[Gist-Storage] GITHUB_TOKEN or GITHUB_GIST_ID not set. Skipping cloud restore.")
        return None

    import httpx
    try:
        url = f"https://api.github.com/gists/{GITHUB_GIST_ID}"
        headers = _get_github_headers(token)
        res = httpx.get(url, headers=headers, timeout=15.0)
        if res.status_code == 200:
            gist_data = res.json()
            files = gist_data.get("files", {})
            file_obj = files.get("life_hub_data.json")
            if file_obj and file_obj.get("content"):
                data = json.loads(file_obj["content"])
                logger.info("[Gist-Storage] Successfully loaded latest state from GitHub Gist!")
                return data
        else:
            logger.warning(f"[Gist-Storage] Gist fetch failed HTTP {res.status_code}: {res.text}")
    except Exception as e:
        logger.error(f"[Gist-Storage] Error loading from Gist: {e}")
    return None

def save_data_to_gist_sync(data_dict: dict) -> bool:
    token = get_token()
    if not token or not GITHUB_GIST_ID:
        return False

    import httpx
    try:
        url = f"https://api.github.com/gists/{GITHUB_GIST_ID}"
        headers = _get_github_headers(token)
        headers["Content-Type"] = "application/json"
        payload = {
            "files": {
                "life_hub_data.json": {
                    "content": json.dumps(data_dict, ensure_ascii=False, indent=2)
                }
            }
        }
        res = httpx.patch(url, headers=headers, json=payload, timeout=20.0)
        if res.status_code == 200:
            logger.info("[Gist-Storage] Successfully backed up state to GitHub Gist!")
            return True
        else:
            logger.warning(f"[Gist-Storage] Gist patch failed HTTP {res.status_code}: {res.text}")
    except Exception as e:
        logger.error(f"[Gist-Storage] Error saving to Gist: {e}")
    return False

def schedule_gist_backup(export_fn, delay_sec: float = 2.0):
    """Debounced background backup to Gist that works from ANY thread (sync FastAPI threadpool, async loop, or background task)."""
    token = get_token()
    if not token or not GITHUB_GIST_ID:
        logger.debug("[Gist-Storage] Cannot schedule backup: token or GIST_ID missing.")
        return

    global _push_timer
    with _timer_lock:
        if _push_timer is not None:
            try:
                _push_timer.cancel()
            except Exception:
                pass

        def _do_backup():
            try:
                logger.info("[Gist-Storage] Executing background Gist backup...")
                data = export_fn()
                success = save_data_to_gist_sync(data)
                if success:
                    logger.info("⚡ [Gist-Storage] Gist backup completed successfully!")
            except Exception as e:
                logger.error(f"[Gist-Storage] Background backup error: {e}")

        _push_timer = threading.Timer(delay_sec, _do_backup)
        _push_timer.daemon = True
        _push_timer.start()
        logger.debug(f"[Gist-Storage] Gist backup scheduled in {delay_sec}s")
