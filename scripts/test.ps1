param([switch]$Audit)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force .tmp | Out-Null
$env:TEMP = Join-Path $PWD '.tmp'
$env:TMP = $env:TEMP
$env:PYTHONUTF8 = '1'
$taskPython = (Resolve-Path '.venv/Scripts/python.exe').Path
Push-Location Project_Vishwas_Khata_V3
$sourceAuditPath = (Resolve-Path 'verification/V3_STATIC_AUDIT_RESULTS.txt').Path
$sourceAuditBytes = [System.IO.File]::ReadAllBytes($sourceAuditPath)
try {
    & $taskPython -X utf8 verification/verify_v3.py
    if ($LASTEXITCODE -ne 0) { throw 'Reference verifier failed' }
    & $taskPython -X utf8 -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) { throw 'Reference tests failed' }
} finally {
    [System.IO.File]::WriteAllBytes($sourceAuditPath, $sourceAuditBytes)
    Pop-Location
}
& $taskPython -X utf8 -m pytest tests -q --basetemp=.tmp/pytest-full --tb=short
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
npm --prefix apps/web test
if ($LASTEXITCODE -ne 0) { throw 'Web rule tests failed' }
npm --prefix apps/web run build
if ($LASTEXITCODE -ne 0) { throw 'Web production build failed' }
npm --prefix apps/web run test:e2e
if ($LASTEXITCODE -ne 0) { throw 'Browser tests failed' }
& $taskPython -X utf8 scripts/verify_release.py
if ($LASTEXITCODE -ne 0) { throw 'Frozen release provenance/source security verification failed' }
if (Test-Path 'apps/hosted/package.json') {
    npm --prefix apps/hosted test
    if ($LASTEXITCODE -ne 0) { throw 'Hosted PostgreSQL groundwork tests failed' }
}
if ($Audit) {
    & $taskPython -m pip_audit --progress-spinner off
    if ($LASTEXITCODE -ne 0) { throw 'Python dependency audit failed' }
    npm --prefix apps/web audit
    if ($LASTEXITCODE -ne 0) { throw 'Web dependency audit failed' }
}
Write-Host 'All requested checks passed. Browser tests used an isolated synthetic database.'
