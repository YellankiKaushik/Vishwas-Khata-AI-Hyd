param([switch]$HostedBrowser)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$root = (Get-Location).Path
function Invoke-Check {
    param([string]$Executable, [string[]]$Arguments)
    Write-Host "> $Executable $($Arguments -join ' ')"
    & $Executable @Arguments
    $code = $LASTEXITCODE
    Write-Host "Exit code: $code"
    if ($code -ne 0) { throw "Verification stopped at $Executable" }
}

Invoke-Check node @('--version')
Invoke-Check npm.cmd @('--version')
Invoke-Check powershell.exe @('-NoProfile','-File',(Join-Path $root 'scripts/setup.ps1'),'-DependenciesOnly')
$python = Join-Path $root '.venv/Scripts/python.exe'
Invoke-Check $python @('--version')
Invoke-Check $python @('-m','pip','--version')
Invoke-Check $python @('-m','pip','show','fastapi','pytest','pip_audit')
Invoke-Check node @('-e',"const p=require('./apps/hosted/node_modules/@electric-sql/pglite/package.json').version; console.log(p); if (p!=='0.5.16') process.exit(1)")
Invoke-Check npm.cmd @('--prefix','apps/web','ls','--depth=0')
Invoke-Check npm.cmd @('--prefix','apps/hosted','ls','--depth=0')
Invoke-Check $python @('-X','utf8','-m','pytest','-q','tests')
Invoke-Check $python @('-X','utf8','-m','pytest','-q','Project_Vishwas_Khata_V3/tests')
Invoke-Check $python @('-X','utf8','scripts/verify_release.py')
Invoke-Check npm.cmd @('--prefix','apps/hosted','test')
Invoke-Check npm.cmd @('--prefix','apps/web','test')
# The browser script also performs the full TypeScript and Vite production build.
Invoke-Check npm.cmd @('--prefix','apps/web','run','test:e2e')
Invoke-Check npm.cmd @('--prefix','apps/web','audit')
Invoke-Check npm.cmd @('--prefix','apps/hosted','audit')
Invoke-Check $python @('-m','pip','check')
Invoke-Check $python @('-m','pip_audit','-r','requirements-lock.txt')

if ($HostedBrowser) {
    Invoke-Check powershell.exe @('-NoProfile','-File',(Join-Path $root 'scripts/test_hosted_postgres.ps1'),'-Browser')
}
