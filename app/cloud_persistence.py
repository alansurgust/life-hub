import os
import json
import logging
import asyncio
from typing import Optional

logger = logging.getLogger("life_hub.cloud_storage")

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
GITHUB_GIST_ID = os.environ.get("GITHUB_GIST_ID", "a8045f8ff3498cbf7fe7356493f6f632").strip()

_push_timer: Optional[asyncio.TimerHandle] = None
_is_pushing = False

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

def load_data_from_gist() -> Optional[dict]:
    token = get_token()
    if not token or not GITHUB_GIST_ID:
        logger.info("[Gist-Storage] GITHUB_TOKEN or GITHUB_GIST_ID not set. Skipping cloud restore.")
        return None

    import httpx
    try:
        url = f"https://api.github.com/gists/{GITHUB_GIST_ID}"
        headers = {
            "Authorization": f"token {token}",
            "User-Agent": "LifeHubApp/1.0"
        }
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
        headers = {
            "Authorization": f"token {token}",
            "Content-Type": "application/json",
            "User-Agent": "LifeHubApp/1.0"
        }
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

def schedule_gist_backup(export_fn, delay_sec: float = 3.0):
    """Debounced background backup to Gist so frequent clicks don't spam GitHub API."""
    token = get_token()
    if not token:
        return

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return

    global _push_timer

    def _execute():
        async def _async_backup():
            try:
                data = export_fn()
                await asyncio.to_thread(save_data_to_gist_sync, data)
            except Exception as e:
                logger.debug(f"[Gist-Storage] Scheduled backup error: {e}")

        asyncio.create_task(_async_backup())

    if _push_timer:
        _push_timer.cancel()
    _push_timer = loop.call_later(delay_sec, _execute)
