#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Auto Versioning Utility for Life Hub OS
Automatically packages a new SemVer ZIP snapshot into D:\app\finance\versions\
and updates VERSIONS_INDEX.md & README.md.

Usage:
    python auto_version.py --type patch --title "Sửa lỗi X" --request "Yêu cầu của người dùng"
    python auto_version.py --type minor --title "Thêm tính năng Y" --request "..."
    python auto_version.py --type major --title "Đại tu Z" --request "..."
"""

import os, sys, shutil, zipfile, re, argparse
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
except:
    pass

PROJECT_DIR = r'D:\app\finance'
VERSIONS_DIR = os.path.join(PROJECT_DIR, 'versions')
INDEX_FILE = os.path.join(VERSIONS_DIR, 'VERSIONS_INDEX.md')
README_FILE = os.path.join(VERSIONS_DIR, 'README.md')

def get_latest_version():
    latest = (0, 0, 0)
    if os.path.exists(VERSIONS_DIR):
        for f in os.listdir(VERSIONS_DIR):
            m = re.match(r'^v(\d+)\.(\d+)\.(\d+)\.zip$', f)
            if m:
                cur = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
                if cur > latest:
                    latest = cur
    return latest

def bump_version(current, bump_type):
    maj, minr, pat = current
    bump_type = bump_type.lower()
    if bump_type == 'major':
        return (maj + 1, 0, 0)
    elif bump_type == 'minor':
        return (maj, minr + 1, 0)
    elif bump_type == 'patch':
        return (maj, minr, pat + 1)
    else:
        raise ValueError(f"Unknown bump type: {bump_type}. Use 'patch', 'minor', or 'major'.")

def create_version(bump_type, title, request_text=""):
    latest = get_latest_version()
    new_v = bump_version(latest, bump_type)
    ver_str = f"{new_v[0]}.{new_v[1]}.{new_v[2]}"
    zip_name = f"v{ver_str}.zip"
    zip_path = os.path.join(VERSIONS_DIR, zip_name)
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    type_vn = {
        'major': 'Nâng cấp ĐỘT PHÁ (Thay đổi lớn - Major Version Bump)',
        'minor': 'Nâng cấp TÍNH NĂNG MỚI (Thay đổi vừa - Minor Version Bump)',
        'patch': 'Tinh chỉnh & Sửa lỗi (Thay đổi nhỏ - Patch Fix)'
    }.get(bump_type.lower(), bump_type)

    # Temporary staging
    staging = os.path.join(VERSIONS_DIR, f'_stage_{ver_str}')
    if os.path.exists(staging):
        shutil.rmtree(staging)
    os.makedirs(staging, exist_ok=True)

    try:
        # Collect project files
        staged_files = []
        for root, dirs, files in os.walk(PROJECT_DIR):
            # Exclude special folders
            rel_dir = os.path.relpath(root, PROJECT_DIR).replace('\\', '/')
            if rel_dir == 'versions' or rel_dir.startswith('versions/') or \
               rel_dir == 'update' or rel_dir.startswith('update/') or \
               '__pycache__' in rel_dir:
                continue

            for f in files:
                if f.endswith('.log') or f.endswith('.tmp') or f.startswith('_stage_'):
                    continue
                src_f = os.path.join(root, f)
                rel_f = os.path.relpath(src_f, PROJECT_DIR)
                dst_f = os.path.join(staging, rel_f)
                os.makedirs(os.path.dirname(dst_f), exist_ok=True)
                shutil.copy2(src_f, dst_f)
                staged_files.append((rel_f, os.path.getsize(src_f)))

        # Create VERSION_INFO.md
        v_info_content = f"""# THÔNG TIN PHIÊN BẢN {ver_str} (Life Hub OS)
**Mã phiên bản (SemVer):** `v{ver_str}`  
**Cấp độ thay đổi:** `{bump_type.upper()}` — {type_vn}  
**Thời gian tạo:** {now_str}  
**Tiêu đề:** {title}  

---

## 📌 Yêu cầu từ người dùng
> {request_text if request_text else title}

---

## 🛠️ Chi tiết kỹ thuật & Thay đổi
- **Mã định danh phiên bản:** `v{ver_str}`
- **Loại thay đổi:** {type_vn}
- **Nội dung hoàn thành:** {title}

---

## 📂 Danh mục tệp tin trong gói phiên bản ({len(staged_files)} files)
| STT | Đường dẫn tệp tin | Dung lượng (bytes) |
|---|---|---|
"""
        for i, (rf, sz) in enumerate(sorted(staged_files)):
            v_info_content += f"| {i+1} | `{rf}` | {sz:,} |\n"

        v_info_path = os.path.join(staging, 'VERSION_INFO.md')
        with open(v_info_path, 'w', encoding='utf-8') as fp:
            fp.write(v_info_content)

        # Create zip
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(staging):
                for f in files:
                    p = os.path.join(root, f)
                    rel = os.path.relpath(p, staging)
                    zf.write(p, rel)

        zip_size = os.path.getsize(zip_path)
        print(f"Created {zip_name} ({zip_size:,} bytes) - [{bump_type.upper()}] {title}")

        # Update VERSIONS_INDEX.md and README.md
        update_index(ver_str, zip_name, bump_type.upper(), zip_size, len(staged_files), title, now_str, request_text)

        return ver_str, zip_name, zip_size

    finally:
        if os.path.exists(staging):
            shutil.rmtree(staging)

def update_index(ver_str, zip_name, ctype, zip_size, file_count, title, now_str, request_text):
    sz_kb = zip_size / 1024
    row = f"| **`v{ver_str}`** | [`{zip_name}`](./{zip_name}) | **`{ctype}`** | {sz_kb:.1f} KB | {file_count} | **{title}** |\n"
    
    details_block = f"""
### 📦 Phiên bản v{ver_str} — {title}
- **Tập tin nén:** `{zip_name}` ({zip_size:,} bytes)
- **Phân loại thay đổi:** `{ctype}`
- **Thời gian tạo:** {now_str}
- **Yêu cầu từ người dùng:**
  > "{request_text if request_text else title}"
- **Số lượng file mã nguồn:** {file_count} files

---
"""

    for target_file in [INDEX_FILE, README_FILE]:
        if os.path.exists(target_file):
            with open(target_file, 'r', encoding='utf-8') as fp:
                content = fp.read()

            # Insert row into table before "---"
            table_marker = "---"
            parts = content.split("## 🔍 CHI TIẾT TỪNG PHIÊN BẢN")
            if len(parts) == 2:
                table_part = parts[0]
                detail_part = parts[1]
                # Insert row at the end of table
                table_lines = table_part.strip().splitlines()
                # find last table row
                last_row_idx = -1
                for idx, line in enumerate(table_lines):
                    if line.strip().startswith('|'):
                        last_row_idx = idx
                if last_row_idx != -1:
                    table_lines.insert(last_row_idx + 1, row.strip())
                    new_table = '\n'.join(table_lines) + '\n\n---\n\n'
                else:
                    new_table = table_part + row
                
                # Append detail at the bottom
                new_content = new_table + "## 🔍 CHI TIẾT TỪNG PHIÊN BẢN\n" + detail_part + details_block
            else:
                new_content = content + "\n" + row + "\n" + details_block

            with open(target_file, 'w', encoding='utf-8') as fp:
                fp.write(new_content)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Auto version packager for Life Hub OS")
    parser.add_argument('--type', choices=['patch', 'minor', 'major'], default='patch', help="Bump level")
    parser.add_argument('--title', required=True, help="Title of this update")
    parser.add_argument('--request', default='', help="Original user prompt")

    args = parser.parse_args()
    create_version(args.type, args.title, args.request)
