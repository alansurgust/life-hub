@echo off
chcp 65001 > nul
title Finance - Quản Lý & Thống Kê Chi Tiêu AI
echo ========================================================
echo    Finance - Quản Lý & Thống Kê Chi Tiêu AI
echo ========================================================
echo.
echo Đang khởi chạy máy chủ tại: http://127.0.0.1:8000 ...
echo Trình duyệt web sẽ tự động mở sau vài giây.
echo.

cd /d "%~dp0"
start "" "http://127.0.0.1:8000"
if exist "C:\Users\Admin\AppData\Local\Python\pythoncore-3.14-64\python.exe" (
    "C:\Users\Admin\AppData\Local\Python\pythoncore-3.14-64\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
) else (
    python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
)
pause
