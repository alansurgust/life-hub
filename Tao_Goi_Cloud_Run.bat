@echo off
chcp 65001 > nul
title Đóng gói mã nguồn cho Google Cloud Run
echo ========================================================
echo    Đóng gói mã nguồn Life Hub cho Google Cloud Run
echo ========================================================
echo.
echo Đang nén các tệp cần thiết thành LifeHub_CloudRun.zip...

cd /d "%~dp0"

py -c "import zipfile, os; base_dir = r'%~dp0'.rstrip('\\'); zip_path = os.path.join(base_dir, 'LifeHub_CloudRun.zip'); include_files = ['Dockerfile', '.dockerignore', 'requirements.txt', 'cloudrun_deploy.md']; include_dirs = ['app', 'static']; zipf = zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED); [zipf.write(os.path.join(base_dir, f), arcname=f) for f in include_files if os.path.exists(os.path.join(base_dir, f))]; [(zipf.write(os.path.join(r, file), arcname=os.path.relpath(os.path.join(r, file), base_dir))) for d in include_dirs for r, ds, fs in os.walk(os.path.join(base_dir, d)) for file in fs if not file.endswith(('.pyc', '.pyo')) and '__pycache__' not in r]; zipf.close(); print('Thanh cong! Kich thuoc:', os.path.getsize(zip_path), 'bytes')"

echo.
echo [HOÀN TẤT] Tệp LifeHub_CloudRun.zip đã được tạo tại thư mục D:\app\finance.
echo Bạn có thể tải tệp này lên Google Cloud Shell (https://shell.cloud.google.com) để triển khai.
echo.
pause
