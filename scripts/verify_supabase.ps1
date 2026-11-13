#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$CaPath)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ge 7) { $PSNativeCommandUseErrorActionPreference = $false }

function Read-PrivateUrl([string]$Prompt) {
    $secret = Read-Host $Prompt -AsSecureString
    $buffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($buffer) }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($buffer)
        $secret.Dispose()
    }
}

function Invoke-PrivateCheck([string]$Label, [string[]]$Arguments) {
    # Native errors can contain a URI or server response. Report a fixed label only.
    $ErrorActionPreference = 'Continue'
    & node @Arguments 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "$Label failed (exit $LASTEXITCODE). Check the private database settings." }
    Write-Host "$Label passed."
}

$ca = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $CaPath).Path)
if ($ca -notmatch '-----BEGIN CERTIFICATE-----' -or $ca -match 'PRIVATE KEY') { throw 'Supply the public database CA PEM file.' }
if (!(Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js 24 is required.' }
$settings = 'HOSTED_DATABASE_URL', 'HOSTED_MIGRATION_DATABASE_URL', 'HOSTED_DATABASE_CA'
$previous = @{}
foreach ($name in $settings) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    $env:HOSTED_DATABASE_CA = $ca
    $env:HOSTED_MIGRATION_DATABASE_URL = Read-PrivateUrl 'Private hyd_owner session pooler or direct URL'
    $env:HOSTED_DATABASE_URL = Read-PrivateUrl 'Private hyd_runtime shared transaction pooler URL'
    $validate = @'
import { databaseTarget } from './apps/hosted/src/database.mjs';
const runtime = databaseTarget(process.env.HOSTED_DATABASE_URL);
const migration = databaseTarget(process.env.HOSTED_MIGRATION_DATABASE_URL, { migration: true });
if (!runtime.transactionPooler || !runtime.supabase || !migration.supabase ||
    runtime.project !== 'xzsccwmljyckbmjcfang' || runtime.project !== migration.project ||
    !new URL(process.env.HOSTED_DATABASE_URL).hostname.endsWith('.pooler.supabase.com')) process.exit(1);
'@
    Invoke-PrivateCheck 'Supabase project and endpoint validation' @('--input-type=module', '-e', $validate)
    Invoke-PrivateCheck 'Verified TLS migration and grants' @('apps/hosted/scripts/migrate.mjs')
    Invoke-PrivateCheck 'Migration checksum replay' @('apps/hosted/scripts/migrate.mjs')
    Invoke-PrivateCheck 'TLS runtime role, tenant isolation, concurrency and stale evidence' @('--test', 'apps/hosted/acceptance/postgres.mjs')
} finally {
    foreach ($name in $settings) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    Pop-Location
}
