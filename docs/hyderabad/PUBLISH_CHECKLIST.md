# Publish the reviewed Hyderabad Repair 2 source

Use the one-root sanitized candidate from the final implementation report. The archived `3a6a74b` witness stays intact. The new manifest hashes the exported source. The export excludes credentials, private history, WAV/media, SQLite, caches, browser traces and dependencies.

In ordinary Windows PowerShell authenticate with the authorized account:

```powershell
gh auth login
gh auth setup-git
gh auth status
```

After the candidate passes the laptop release checks, run this only in its clean sanitized checkout. Enter the candidate SHA and tree from the report.

```powershell
$target = 'https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd.git'
$expected = Read-Host 'Reviewed candidate commit'
$tree = Read-Host 'Reviewed candidate tree'
if (git status --porcelain) { throw 'Candidate checkout is dirty' }
if ((git rev-list --count HEAD) -ne 1) { throw 'Expected a one-root source export' }
if ((git rev-parse HEAD) -ne $expected -or (git rev-parse 'HEAD^{tree}') -ne $tree) { throw 'Unexpected source' }
if ((git remote get-url origin) -ne $target -or (git remote get-url --push origin) -ne $target) { throw 'Unexpected origin' }
$heads = git ls-remote --heads origin
if ($LASTEXITCODE -or $heads) { throw 'Remote check failed or destination now has a branch. Fetch and compare before proceeding.' }
git push -u origin HEAD:refs/heads/main
if ($LASTEXITCODE) { throw 'Push failed' }
$ref = git ls-remote origin refs/heads/main
if ($LASTEXITCODE -or ($ref -split '\s+')[0] -ne $expected) { throw 'Remote SHA mismatch' }
git fetch origin main
if ($LASTEXITCODE -or (git rev-parse 'origin/main^{tree}') -ne $tree) { throw 'Remote tree mismatch' }
$ref
```

For a bundle clone, first set its `origin` to the approved URL above. If the remote has an existing branch, fetch and compare, then use a normal branch and PR where appropriate.
