import os, shutil, subprocess, ctypes
from ctypes import wintypes

repo_dir = r"C:\Users\Admin\.gemini\antigravity\brain\1ee838d5-f2e5-4932-87e0-f5ff280cf260\scratch\life-hub-repo"
update_dir = r"D:\app\finance\update"
git_exe = r"C:\Users\Admin\.gemini\tools\mingit\cmd\git.exe"

# Read token from Windows Credential Manager
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
if not res:
    print("Cannot read credentials from Windows Credential Manager")
    exit(1)

raw = ctypes.string_at(p_cred.contents.CredentialBlob, p_cred.contents.CredentialBlobSize)
token = raw.decode('utf-16le', errors='ignore').strip() or raw.decode('utf-8', errors='ignore').strip()
remote_url = f"https://alansurgust:{token}@github.com/alansurgust/life-hub.git"

subprocess.run([git_exe, "-C", repo_dir, "config", "user.name", "alansurgust"], check=True)
subprocess.run([git_exe, "-C", repo_dir, "config", "user.email", "nguyentuan23062306@gmail.com"], check=True)

# Pull latest remote changes first
subprocess.run([git_exe, "-C", repo_dir, "pull", "--rebase", remote_url, "main"])

# Copy all files from D:\app\finance\update into scratch repo
for root, dirs, files in os.walk(update_dir):
    rel_path = os.path.relpath(root, update_dir)
    dest_dir = os.path.join(repo_dir, rel_path) if rel_path != "." else repo_dir
    os.makedirs(dest_dir, exist_ok=True)
    for f in files:
        src_file = os.path.join(root, f)
        dest_file = os.path.join(dest_dir, f)
        shutil.copy2(src_file, dest_file)

subprocess.run([git_exe, "-C", repo_dir, "add", "-A"], check=True)
status = subprocess.run([git_exe, "-C", repo_dir, "status", "--porcelain"], capture_output=True, text=True, check=True)

if status.stdout.strip():
    subprocess.run([git_exe, "-C", repo_dir, "commit", "-m", "update: sync changes from D:\\app\\finance"], check=True)

# Push to remote
push_res = subprocess.run([git_exe, "-C", repo_dir, "push", remote_url, "main"])
if push_res.returncode == 0:
    print("[OK] Da tu dong dong bo va push len GitHub thanh cong!")
else:
    # Try one pull rebase and push again
    subprocess.run([git_exe, "-C", repo_dir, "pull", "--rebase", remote_url, "main"])
    subprocess.run([git_exe, "-C", repo_dir, "push", remote_url, "main"], check=True)
    print("[OK] Da rebase va push len GitHub thanh cong!")
