param([string]$PostgresImage = 'postgres:17-bookworm', [switch]$Browser, [switch]$CiBrowser, [int]$HttpsPort = 8443)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$root = (Get-Location).Path
function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command exited with code $LASTEXITCODE" }
}
function New-Password {
    node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))"
    if ($LASTEXITCODE -ne 0) { throw 'Could not generate disposable credentials' }
}

if ($CiBrowser -and (!$IsLinux -or $env:GITHUB_ACTIONS -ne 'true' -or !$Browser)) {
    throw 'CiBrowser requires Browser on an ephemeral Linux GitHub Actions runner'
}
$npm = if ($IsLinux) { 'npm' } else { 'npm.cmd' }
$opensslCommand = if ($IsLinux) { 'openssl' } else { 'openssl.exe' }
$openssl = Get-Command $opensslCommand -ErrorAction SilentlyContinue
if ($openssl) { $openssl = $openssl.Source }
elseif (!$IsLinux) { $openssl = Join-Path $env:ProgramFiles 'Git/usr/bin/openssl.exe' }
if ($Browser -and !(Test-Path -LiteralPath 'apps/web/dist/index.html')) { throw 'Build the frontend before running browser acceptance' }
if (!$openssl -or !(Test-Path -LiteralPath $openssl)) { throw 'OpenSSL is required to generate the local PostgreSQL certificate' }
Invoke-Checked docker @('info','--format','{{.ServerVersion}}')

$id = [guid]::NewGuid().ToString('N').Substring(0,12)
$container = "vishwas-acceptance-$id"
$work = Join-Path $root ".tmp/$container"
New-Item -ItemType Directory -Path $work -Force | Out-Null
$adminPassword = New-Password
$ownerPassword = New-Password
$runtimePassword = New-Password
$ca = Join-Path $work 'pg.crt'
$key = Join-Path $work 'pg.key'
Invoke-Checked $openssl @('req','-new','-x509','-newkey','rsa:2048','-nodes','-days','1',
    '-subj','/CN=Vishwas disposable acceptance','-addext','basicConstraints=critical,CA:TRUE',
    '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-out',$ca,'-keyout',$key)
$names = @('HOSTED_DATABASE_CA','HOSTED_DATABASE_URL','HOSTED_MIGRATION_DATABASE_URL',
    'HOSTED_PUBLIC_ORIGIN','HOSTED_SESSION_SECRET','HOSTED_LOCAL_TLS_CERT_FILE','HOSTED_LOCAL_TLS_KEY_FILE',
    'HOSTED_BIND_ADDRESS','HOSTED_WEB_DIST','PORT','VISHWAS_HOSTED_TEST_URL','NODE_EXTRA_CA_CERTS',
    'HOSTED_LOCAL_VERCEL_ACCEPTANCE')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$started = $false
$server = $null
try {
    Invoke-Checked docker @('run','-d','--name',$container,'-p','127.0.0.1::5432',
        '-e',"POSTGRES_PASSWORD=$adminPassword",'--mount',"type=bind,source=$work,target=/acceptance,readonly",
        '--entrypoint','bash',$PostgresImage,'-euc',
        'install -o postgres -g postgres -m 600 /acceptance/pg.key /tmp/hyd.key; install -o postgres -g postgres -m 644 /acceptance/pg.crt /tmp/hyd.crt; exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/hyd.crt -c ssl_key_file=/tmp/hyd.key')
    $started = $true
    $address = docker port $container 5432/tcp
    if ($LASTEXITCODE -ne 0 -or $address -notmatch '^127[.]0[.]0[.]1:(\d+)$') { throw 'Expected one loopback PostgreSQL port' }
    $port = $Matches[1]
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        docker exec $container pg_isready -h 127.0.0.1 -q
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw 'Disposable PostgreSQL did not become ready' }

    @"
CREATE ROLE hyd_owner LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '$ownerPassword';
CREATE ROLE hyd_runtime LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '$runtimePassword';
CREATE DATABASE hyd_acceptance OWNER hyd_owner;
CREATE DATABASE hyd_restored OWNER hyd_owner;
"@ | docker exec -i $container psql -Xq -v ON_ERROR_STOP=1 -U postgres
    if ($LASTEXITCODE -ne 0) { throw 'Disposable role provisioning failed' }
    $env:HOSTED_DATABASE_CA = Get-Content -LiteralPath $ca -Raw
    $env:HOSTED_DATABASE_URL = "postgresql://hyd_runtime:${runtimePassword}@127.0.0.1:${port}/hyd_acceptance"
    $env:HOSTED_MIGRATION_DATABASE_URL = "postgresql://hyd_owner:${ownerPassword}@127.0.0.1:${port}/hyd_acceptance"
    Invoke-Checked $npm @('--prefix','apps/hosted','run','migrate')
    Invoke-Checked $npm @('--prefix','apps/hosted','run','migrate')
    $expectedChecksums = @(Get-ChildItem -LiteralPath 'apps/hosted/migrations' -Filter '*.sql' -File |
        Sort-Object Name | ForEach-Object { "$($_.Name)|$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())" })
    $checksumSql = 'SELECT name,sha256 FROM hyd_demo_release.migrations ORDER BY name'
    $observedChecksums = @(docker exec $container psql -XAt -v ON_ERROR_STOP=1 -U postgres -d hyd_acceptance -c $checksumSql)
    if ($LASTEXITCODE -ne 0 -or ($observedChecksums -join "`n") -cne ($expectedChecksums -join "`n")) {
        throw 'Migration receipt checksums do not match the committed files'
    }
    Invoke-Checked $npm @('--prefix','apps/hosted','run','test:postgres')
    Invoke-Checked docker @('exec',$container,'pg_dump','-Fc','-U','postgres','-d','hyd_acceptance','-f','/tmp/hyd.dump')
    Invoke-Checked docker @('exec',$container,'pg_restore','--exit-on-error','-U','postgres','-d','hyd_restored','/tmp/hyd.dump')
    $env:HOSTED_DATABASE_URL = $env:HOSTED_DATABASE_URL.Replace('/hyd_acceptance','/hyd_restored')
    $env:HOSTED_MIGRATION_DATABASE_URL = $env:HOSTED_MIGRATION_DATABASE_URL.Replace('/hyd_acceptance','/hyd_restored')
    $witness = docker exec $container psql -XAt -v ON_ERROR_STOP=1 -U postgres -d hyd_restored -c 'SELECT count(*)=4 AND sum(signed_paise)=30000 FROM hyd_demo.journal'
    if ($LASTEXITCODE -ne 0 -or $witness -ne 't') { throw 'Restored journal does not match the original signed balance' }
    Invoke-Checked $npm @('--prefix','apps/hosted','run','migrate')
    Invoke-Checked $npm @('--prefix','apps/hosted','run','test:postgres')
    Write-Output 'Disposable TLS PostgreSQL migration, repeat, role/tenant checks, and backup/restore acceptance passed.'
    if ($Browser) {
        $env:HOSTED_PUBLIC_ORIGIN = "https://127.0.0.1:$HttpsPort"
        $env:VISHWAS_HOSTED_TEST_URL = $env:HOSTED_PUBLIC_ORIGIN
        $env:PORT = [string]$HttpsPort
        $env:HOSTED_BIND_ADDRESS = '127.0.0.1'
        $env:HOSTED_WEB_DIST = Join-Path $root 'apps/web/dist'
        $env:HOSTED_LOCAL_TLS_CERT_FILE = $ca
        $env:HOSTED_LOCAL_TLS_KEY_FILE = $key
        if ($CiBrowser) { $env:HOSTED_LOCAL_VERCEL_ACCEPTANCE = '1' }
        $env:HOSTED_SESSION_SECRET = New-Password
        $env:NODE_EXTRA_CA_CERTS = $ca
        $log = Join-Path $work 'hosted.log'
        $node = (Get-Command node).Source
        $startOptions = @{
            FilePath = $node
            WorkingDirectory = Join-Path $root 'apps/hosted'
            ArgumentList = 'src/server.mjs'
            RedirectStandardOutput = Join-Path $work 'hosted-out.log'
            RedirectStandardError = $log
            PassThru = $true
        }
        if (!$IsLinux) { $startOptions.WindowStyle = 'Hidden' }
        $migrationUrl = $env:HOSTED_MIGRATION_DATABASE_URL
        try {
            Remove-Item Env:HOSTED_MIGRATION_DATABASE_URL
            $server = Start-Process @startOptions
        } finally {
            $env:HOSTED_MIGRATION_DATABASE_URL = $migrationUrl
        }
        $listening = $false
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            node -e "fetch(process.env.HOSTED_PUBLIC_ORIGIN+'/v1/health/ready',{signal:AbortSignal.timeout(2000)}).then(r=>{process.exitCode=r.ok?0:1},()=>{process.exitCode=1})"
            if ($LASTEXITCODE -eq 0) { $listening = $true; break }
            if ($server.HasExited) { break }
            Start-Sleep -Seconds 1
        }
        if (!$listening) { throw "The loopback HTTPS service did not become ready. See $log" }
        Invoke-Checked node @('apps/hosted/acceptance/http.mjs','--expire-disposable-session')
        if ($CiBrowser) {
            $nss = Join-Path $HOME '.pki/nssdb'
            if (!(Test-Path -LiteralPath (Join-Path $nss 'cert9.db'))) {
                $nss = Join-Path $HOME '.local/share/pki/nssdb'
            }
            New-Item -ItemType Directory -Path $nss -Force | Out-Null
            if (!(Test-Path -LiteralPath (Join-Path $nss 'cert9.db'))) {
                Invoke-Checked certutil @('-N','-d',"sql:$nss",'--empty-password')
            }
            Invoke-Checked certutil @('-A','-d',"sql:$nss",'-n',$container,'-t','C,,','-i',$ca)
            try {
                Push-Location (Join-Path $root 'apps/web')
                try { Invoke-Checked $npm @('exec','--','playwright','test','-c','playwright.hosted.config.ts','--trace','off') }
                finally { Pop-Location }
            } finally {
                Invoke-Checked certutil @('-D','-d',"sql:$nss",'-n',$container)
            }
        } else {
            Write-Output "For Chromium acceptance, trust the local certificate at $ca in the test profile before continuing."
            Write-Output "In that profile's terminal, set VISHWAS_HOSTED_TEST_URL=$env:VISHWAS_HOSTED_TEST_URL and run Playwright with playwright.hosted.config.ts from apps/web."
            [void](Read-Host 'Press Enter after Chromium acceptance to stop the disposable services')
        }
    }
} finally {
    if ($server -and !$server.HasExited) { Stop-Process -Id $server.Id }
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process') }
    if ($started) {
        Invoke-Checked docker @('rm','-f','-v',$container)
    }
}
