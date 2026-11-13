param([switch]$Replay)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if ($Replay) { $env:VISHWAS_AS_OF = '2026-10-27T17:00:00Z' }
npm --prefix apps/web run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
& ./.venv/Scripts/python.exe -m apps.api.manage seed
if ($LASTEXITCODE -ne 0) { throw 'Seed failed' }
Write-Host 'Open http://127.0.0.1:8000 — synthetic local app. Ctrl+C stops the server.'
& ./.venv/Scripts/python.exe -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000
