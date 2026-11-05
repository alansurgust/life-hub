Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\app\finance"
WshShell.Run """C:\Users\Admin\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe"" desktop_app.py", 0, False
