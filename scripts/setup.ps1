param([switch]$DependenciesOnly, [switch]$Hosted)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force .tmp | Out-Null
$env:TEMP = Join-Path $PWD '.tmp'
$env:TMP = $env:TEMP
$taskPython = Get-Command python -ErrorAction SilentlyContinue
$bundledPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
if (Test-Path $bundledPython) { $pythonExe = $bundledPython } elseif ($taskPython) { $pythonExe = $taskPython.Source } else { throw 'Python 3.11+ required' }
if (!(Test-Path '.venv/Scripts/python.exe')) { & $pythonExe -m venv .venv }
& ./.venv/Scripts/python.exe -m pip --version 2>$null
if ($LASTEXITCODE -ne 0) {
    & ./.venv/Scripts/python.exe -m ensurepip --default-pip
    if ($LASTEXITCODE -ne 0) { throw 'Could not bootstrap pip in the virtual environment' }
}
# pip is bootstrap tooling outside the historic application lock.
& ./.venv/Scripts/python.exe -m pip install --upgrade pip==26.3
if ($LASTEXITCODE -ne 0) { throw 'Audited pip bootstrap failed' }
& ./.venv/Scripts/python.exe -m pip install -r requirements-lock.txt
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed' }
npm --prefix apps/web ci --cache .tmp/npm-cache
if ($LASTEXITCODE -ne 0) { throw 'Web dependency installation failed' }
if ($Hosted) {
    npm --prefix apps/hosted ci --cache .tmp/npm-cache
    if ($LASTEXITCODE -ne 0) { throw 'Hosted test dependency installation failed' }
}
if (!$DependenciesOnly) {
    & ./.venv/Scripts/python.exe -m apps.api.manage seed
    if ($LASTEXITCODE -ne 0) { throw 'Seed failed' }
}
