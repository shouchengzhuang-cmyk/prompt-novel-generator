@echo off
cd /d "%~dp0"
start "xiaomoxia-dev-server" cmd /k "cd /d "%~dp0" && npm run dev"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://localhost:5173/'; for($i=0;$i -lt 40;$i++){ try { $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1; if($r.StatusCode -ge 200){ Start-Process $url; exit 0 } } catch { Start-Sleep -Seconds 1 } }; Start-Process $url"
exit
