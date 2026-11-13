$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& ./.venv/Scripts/python.exe -m apps.api.manage seed
if ($LASTEXITCODE -ne 0) { throw 'Seed failed' }
$apiProcess = Start-Process -FilePath (Resolve-Path '.venv/Scripts/python.exe') -ArgumentList '-m','uvicorn','apps.api.main:app','--host','127.0.0.1','--port','8000' -WindowStyle Hidden -PassThru
try { npm --prefix apps/web run dev } finally { Stop-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue }
