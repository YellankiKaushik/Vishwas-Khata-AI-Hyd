param([string]$Python = '')
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
$settings = @{
    DATABASE_PATH = Join-Path $PWD ('.tmp/hyderabad-demo-' + [Guid]::NewGuid().ToString('N') + '/demo.sqlite3')
    DEMO_MODE = 'true'
    HYDERABAD_ENABLED = 'true'
    HYDERABAD_LIVE_ASSISTANT_ENABLED = 'false'
    VOICE_PROVIDER = 'mock'
    SARVAM_API_KEY = 'disabled-for-hyderabad-demo'
    SARVAM_LIVE_VERIFIED = 'false'
    SARVAM_TTS_VERIFIED = 'false'
    VISHWAS_AS_OF = '2026-11-13T05:00:00Z'
}
$previous = @{}
foreach ($name in $settings.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    if (!$Python) { $Python = '.venv/Scripts/python.exe' }
    if (!(Test-Path -LiteralPath $Python -PathType Leaf)) { throw 'Run ./scripts/setup.ps1 first to install dependencies.' }
    $Python = (Resolve-Path -LiteralPath $Python).Path
    foreach ($name in $settings.Keys) {
        [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
    }
    npm --prefix apps/web run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
    & $Python -m apps.api.manage seed
    if ($LASTEXITCODE -ne 0) { throw 'Isolated synthetic seed failed.' }
    Write-Host 'Vishwas-Khata-AI Hyderabad at http://127.0.0.1:8000'
    Write-Host 'Synthetic business date 13 November 2026 (IST). Ctrl+C stops the server.'
    Write-Host "This run uses $($settings.DATABASE_PATH)"
    & $Python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000
    if ($LASTEXITCODE -ne 0) { throw "Demo server exited with code $LASTEXITCODE." }
}
finally {
    foreach ($name in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
    Pop-Location
}
