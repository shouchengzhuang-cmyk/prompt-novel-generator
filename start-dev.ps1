Set-Location "D:\Projects\prompt-novel-generator"

Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd "D:\Projects\prompt-novel-generator\server"; node index.js'

Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd "D:\Projects\prompt-novel-generator"; npm run dev'
