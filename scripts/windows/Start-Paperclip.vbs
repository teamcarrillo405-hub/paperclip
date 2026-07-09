Set shell = CreateObject("WScript.Shell")
script = "C:\Users\glcar\paperclip\scripts\windows\Start-Paperclip.ps1"
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & script & """", 0, False
