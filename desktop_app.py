import os
import sys
import io
import time

# Handle pythonw.exe environment where stdout/stderr are None
class DummyStream(io.StringIO):
    def isatty(self):
        return False
    def write(self, s):
        pass
    def flush(self):
        pass

if sys.stdout is None:
    sys.stdout = DummyStream()
if sys.stderr is None:
    sys.stderr = DummyStream()

APP_DIR = os.path.dirname(os.path.abspath(__file__))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)
try:
    os.chdir(APP_DIR)
except Exception:
    pass

DEBUG_LOG = os.path.join(APP_DIR, "app_debug.log")
def log_step(msg):
    try:
        with open(DEBUG_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%X')}] {msg}\n")
            f.flush()
    except Exception:
        pass
import socket
import asyncio
import threading
import logging
import ctypes
import traceback

def global_excepthook(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, (SystemExit, KeyboardInterrupt)):
        return
    err = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))
    log_step(f"UNCAUGHT GLOBAL EXCEPTION:\n{err}")
    try:
        with open(os.path.join(APP_DIR, "desktop_crash.txt"), "w", encoding="utf-8") as f:
            f.write(err)
        ctypes.windll.user32.MessageBoxW(0, f"Finance Crash:\n{err}", "Finance Error", 0x10)
    except Exception:
        pass

sys.excepthook = global_excepthook
threading.excepthook = lambda args: global_excepthook(args.exc_type, args.exc_value, args.exc_traceback)

log_step(f"Starting desktop_app.py. Executable: {sys.executable}, argv: {sys.argv}")
try:
    crash_file = os.path.join(APP_DIR, "desktop_crash.txt")
    if os.path.exists(crash_file):
        os.remove(crash_file)
except Exception:
    pass

def show_fatal_error(msg):
    log_step(f"FATAL ERROR: {msg}")
    if any(k in msg for k in ("SystemExit", "KeyboardInterrupt")):
        return
    try:
        with open(os.path.join(APP_DIR, "desktop_crash.txt"), "w", encoding="utf-8") as f:
            f.write(msg)
        ctypes.windll.user32.MessageBoxW(0, msg, "Finance Error", 0x10)
    except Exception:
        pass

# Ensure safe UTF-8 encoding
if sys.stdout is not None:
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if sys.stderr is not None:
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Set AppUserModelID so Windows identifies this as a unique app with its own taskbar icon
try:
    myappid = 'finance.expensetracker.banknote500k.real'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception:
    pass

# Enable Per-Monitor V2 DPI awareness to prevent Windows from misplacing or distorting the window on wake/sleep
try:
    ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4)) # DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
except Exception:
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2) # PROCESS_PER_MONITOR_DPI_AWARE
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass

try:
    import uvicorn
    import webview
    from app.main import app
    from app.database import init_db
except Exception as import_err:
    show_fatal_error(f"Lỗi nạp thư viện:\n{import_err}\n\n{traceback.format_exc()}")
    sys.exit(1)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Finance-Desktop")

def find_available_port(start_port=8000, max_attempts=50):
    for p in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('0.0.0.0', p))
                return p
        except OSError:
            continue
    return 8000

class ServerThread(threading.Thread):
    def __init__(self, host, port):
        super().__init__(daemon=True)
        self.host = host
        self.port = port
        self.server = None

    def run(self):
        try:
            log_step(f"ServerThread: starting uvicorn server on {self.host}:{self.port}...")
            config = uvicorn.Config(app, host=self.host, port=self.port, log_config=None, access_log=False)
            self.server = uvicorn.Server(config)
            log_step("ServerThread: calling asyncio.run(self.server.serve())...")
            asyncio.run(self.server.serve())
            log_step("ServerThread: server.serve() finished normally.")
        except (SystemExit, KeyboardInterrupt) as e:
            log_step(f"ServerThread shutdown: {type(e).__name__} ({e})")
        except BaseException as e:
            if isinstance(e, (SystemExit, KeyboardInterrupt)) or "SystemExit" in type(e).__name__:
                log_step(f"ServerThread shutdown: {type(e).__name__} ({e})")
                return
            log_step(f"ServerThread CRITICAL BASE EXCEPTION: {type(e).__name__}: {e}\n{traceback.format_exc()}")
            show_fatal_error(f"Lỗi Server uvicorn:\n{type(e).__name__}: {e}")

    def stop(self):
        if self.server:
            self.server.should_exit = True

def wait_for_server(host, port, timeout=10.0):
    start = time.time()
    attempt = 0
    while time.time() - start < timeout:
        attempt += 1
        try:
            with socket.create_connection((host, port), timeout=0.2):
                log_step(f"wait_for_server: successfully connected on attempt {attempt} ({time.time() - start:.2f}s)")
                return True
        except BaseException:
            time.sleep(0.05)
    log_step(f"wait_for_server: timeout reached after {attempt} attempts")
    return False

def apply_window_icon():
    ico_path = os.path.join(APP_DIR, "Finance_500k.ico")
    if not os.path.exists(ico_path):
        ico_path = os.path.join(APP_DIR, "FinAI_500k.ico")

    if not os.path.exists(ico_path):
        return

    try:
        user32 = ctypes.windll.user32
        user32.LoadImageW.restype = ctypes.c_void_p
        user32.LoadImageW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_uint, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
        user32.FindWindowW.restype = ctypes.c_void_p
        user32.FindWindowW.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p]
        user32.SendMessageW.restype = ctypes.c_void_p
        user32.SendMessageW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]

        # Load 16x16 (small) and 32x32 (large) icons directly from .ico
        hIconSmall = user32.LoadImageW(None, ico_path, 1, 16, 16, 0x00000010 | 0x00008000)
        hIconBig = user32.LoadImageW(None, ico_path, 1, 32, 32, 0x00000010 | 0x00008000)

        WM_SETICON = 0x0080
        SW_MAXIMIZE = 3
        for _ in range(50):
            hwnd = user32.FindWindowW(None, "Finance & Life Hub - Quản Lý Cá Nhân All-in-One")
            if not hwnd:
                hwnd = user32.FindWindowW(None, "Finance - Quản Lý & Thống Kê Chi Tiêu AI")
            if hwnd:
                if hIconSmall:
                    user32.SendMessageW(hwnd, WM_SETICON, 0, hIconSmall)
                if hIconBig:
                    user32.SendMessageW(hwnd, WM_SETICON, 1, hIconBig)
                user32.ShowWindow(hwnd, SW_MAXIMIZE)
                user32.SetForegroundWindow(hwnd)
                log_step(f"apply_window_icon: Successfully set WM_SETICON and SW_MAXIMIZE on hwnd {hwnd}")
                break
            time.sleep(0.2)
    except Exception as e:
        log_step(f"apply_window_icon warning: {e}")

def check_single_instance():
    try:
        user32 = ctypes.windll.user32
        for title in [
            "Finance & Life Hub - Quản Lý Cá Nhân All-in-One",
            "Finance - Quản Lý & Thống Kê Chi Tiêu AI"
        ]:
            hwnd = user32.FindWindowW(None, title)
            if hwnd:
                user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                user32.SetForegroundWindow(hwnd)
                log_step(f"check_single_instance: Found existing window hwnd {hwnd}, brought to front.")
                return True
    except Exception as e:
        log_step(f"check_single_instance error: {e}")
    return False

def main():
    try:
        log_step("main() entered.")
        if check_single_instance():
            log_step("App is already open. Exiting duplicate instance.")
            return

        init_db()
        log_step("init_db() done.")

        port = find_available_port(8000)
        server_host = "0.0.0.0" # Listen on all network interfaces to allow mobile connection on local Wi-Fi
        local_url = f"http://127.0.0.1:{port}"
        log_step(f"Server starting on 0.0.0.0:{port} (local webview: {local_url})")

        server_thread = ServerThread(server_host, port)
        server_thread.start()

        if not wait_for_server("127.0.0.1", port, timeout=10.0):
            log_step("Failed waiting for server!")
            show_fatal_error("Lỗi: Không thể kết nối đến máy chủ nội bộ trong 10 giây.")
            sys.exit(1)
        log_step("Server is up and responding.")

        # Determine screen work area to set optimal centered coordinates and prevent bottom-right drift
        from ctypes import wintypes
        rect = wintypes.RECT()
        ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0) # SPI_GETWORKAREA
        screen_w = max(1024, rect.right - rect.left)
        screen_h = max(700, rect.bottom - rect.top)

        # Restored window dimensions (comfortably centered, never overflowing screen)
        win_w = min(1366, max(960, int(screen_w * 0.90)))
        win_h = min(800, max(600, int(screen_h * 0.88)))
        pos_x = rect.left + max(0, (screen_w - win_w) // 2)
        pos_y = rect.top + max(0, (screen_h - win_h) // 2)

        # Create native Windows desktop application window (starts MAXIMIZED fit to window)
        window = webview.create_window(
            title="Finance & Life Hub - Quản Lý Cá Nhân All-in-One",
            url=local_url,
            width=win_w,
            height=win_h,
            x=pos_x,
            y=pos_y,
            min_size=(900, 580),
            maximized=True,
            background_color="#F7F2E8",
            text_select=True
        )
        log_step(f"webview.create_window returned: {window}")

        ico_path = os.path.join(APP_DIR, "Finance_500k.ico")
        if not os.path.exists(ico_path):
            ico_path = os.path.join(APP_DIR, "FinAI_500k.ico")

        # Start background thread to ensure WM_SETICON is also set directly on Win32 HWND
        threading.Thread(target=apply_window_icon, daemon=True).start()

        try:
            log_step(f"Calling webview.start(icon='{ico_path}')...")
            webview.start(icon=ico_path)
            log_step("webview.start() finished normally.")
        finally:
            log_step("Exiting: stopping server_thread.")
            server_thread.stop()
            os._exit(0)

    except BaseException as ex:
        log_step(f"main() CRITICAL BASE EXCEPTION: {type(ex).__name__}: {ex}\n{traceback.format_exc()}")
        show_fatal_error(f"Lỗi khởi động Finance:\n{ex}\n\n{traceback.format_exc()}")
        sys.exit(1)

if __name__ == "__main__":
    main()
