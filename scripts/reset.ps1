$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) { throw 'Stop the API server on port 8000 before resetting.' }
Write-Host 'The old synthetic DB is archived in data/.'
& ./.venv/Scripts/python.exe -m apps.api.manage reset
if ($LASTEXITCODE -ne 0) { throw 'Reset refused or failed' }
