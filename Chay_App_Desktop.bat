@echo off
chcp 65001 > nul
title Finance - Quản Lý & Thống Kê Chi Tiêu AI
echo ========================================================
echo    Finance - Quản Lý & Thống Kê Chi Tiêu AI (Desktop)
echo ========================================================
echo.
echo Đang mở ứng dụng Finance...
echo.

cd /d "%~dp0"
if exist "C:\Users\Admin\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe" (
    "C:\Users\Admin\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe" desktop_app.py
) else (
    "C:\Users\Admin\AppData\Local\Python\bin\python.exe" desktop_app.py
)
