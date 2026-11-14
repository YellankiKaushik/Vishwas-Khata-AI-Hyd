#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedHead)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ge 7) { $PSNativeCommandUseErrorActionPreference = $false }
$repo = 'YellankiKaushik/Vishwas-Khata-AI-Hyd'
$branch = 'release/supabase-pooler'
$base = 'ee22f382fd5129b7087f0d857f2ab72bbf4f510c'
$original = 'c721d5d56f4ccacefec5ab185635e32251da09ed'
$number = 4
$tag = 'hyderabad-venue-2026-11-13'

function Git {
    & git.exe @args
    if ($LASTEXITCODE -ne 0) { throw "Git $($args[0]) failed ($LASTEXITCODE)." }
}
function Gh {
    & gh.exe @args
    if ($LASTEXITCODE -ne 0) { throw "GitHub $($args[0]) failed ($LASTEXITCODE)." }
}
function Api([string]$Path) {
    (Gh api "repos/$repo/$Path" | Out-String) | ConvertFrom-Json
}
function RemoteRef([string]$Ref) {
    $line = Git ls-remote --refs origin $Ref
    if ($line) { ($line -split "`t")[0] }
}
function Assert-Same($Actual, $Expected, [string]$Label) {
    if ($Actual -cne $Expected) { throw "Unexpected $Label. Expected $Expected, got $Actual." }
}
function Assert-Candidate {
    Assert-Same (Git rev-parse HEAD) $ExpectedHead 'local commit'
    if ($ExpectedHead -ceq $original) { throw 'Use the corrected candidate SHA.' }
    Git merge-base --is-ancestor $base $ExpectedHead
    Git merge-base --is-ancestor $original $ExpectedHead
}

function Get-ReleasePr {
    $pr = Api "pulls/$number"
    Assert-Same $pr.number $number 'PR number'
    Assert-Same $pr.head.ref $branch 'PR head branch'
    Assert-Same $pr.head.repo.full_name $repo 'PR head repository'
    Assert-Same $pr.base.ref 'main' 'PR base branch'
    Assert-Same $pr.base.repo.full_name $repo 'PR base repository'
    $pr
}
function Wait-Acceptance([string]$Sha, [string]$Branch) {
    $deadline = [DateTimeOffset]::UtcNow.AddMinutes(35)
    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        $path = "actions/workflows/hosted-acceptance.yml/runs?head_sha=$Sha&branch=$Branch&event=push"
        $run = (Api $path).workflow_runs | Sort-Object id -Descending | Select-Object -First 1
        if ($run -and $run.status -eq 'completed') {
            Assert-Same $run.head_sha $Sha 'CI commit'
            Assert-Same $run.head_branch $Branch 'CI branch'
            Write-Host $run.html_url
            Assert-Same $run.conclusion 'success' 'CI result'
            $jobs = @( (Api "actions/runs/$($run.id)/attempts/$($run.run_attempt)/jobs?per_page=100").jobs )
            Assert-Same (($jobs.name | Sort-Object) -join ',') 'acceptance,backend,hosted-browser,hosted-unit,local-browser' 'mandatory job list'
            foreach ($job in $jobs) { Assert-Same $job.conclusion 'success' $job.name }
            return
        }
        Start-Sleep -Seconds 20
    }
    throw "Timed out waiting for CI at $Sha. Rerun to resume."
}

function Push-CheckedRef([string]$OldSha, [switch]$Delete) {
    $existingHook = Git rev-parse --git-path hooks/pre-push
    if (Test-Path -LiteralPath $existingHook) { throw 'An existing pre-push hook requires manual inspection before publishing.' }
    $hooks = Join-Path $env:TEMP ('supabase-push-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $hooks | Out-Null
    $hook = Join-Path $hooks 'pre-push'
    try {
        $guard = @'
#!/bin/sh
set -eu
IFS=' ' read -r local_ref local_oid remote_ref remote_oid
test "$local_oid" = '{2}'
test "$remote_ref" = 'refs/heads/{0}'
test "$remote_oid" = '{1}'
if read -r extra; then exit 1; fi
'@ -f $branch, $OldSha, $(if ($Delete) { '0' * 40 } else { $ExpectedHead })
        [IO.File]::WriteAllText($hook, (($guard -replace '\r\n', "`n") + "`n"), [Text.UTF8Encoding]::new($false))
        if ($Delete) {
            Git -c "core.hooksPath=$hooks" push origin --delete $branch
        } else {
            Git -c "core.hooksPath=$hooks" push origin "${ExpectedHead}:refs/heads/$branch"
        }
    } finally {
        if (Test-Path -LiteralPath $hook) { Remove-Item -LiteralPath $hook }
        Remove-Item -LiteralPath $hooks
    }
}

Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    Assert-Same (Git config --get remote.origin.url) "https://github.com/$repo.git" 'repository'
    Assert-Same (Git branch --show-current) $branch 'local branch'
    Assert-Candidate
    if (Git status --porcelain) { throw 'Use a clean development checkout.' }
    Assert-Same (Gh api user --jq '.login') 'YellankiKaushik' 'GitHub account'
    $repoInfo = (Gh api "repos/$repo" | Out-String) | ConvertFrom-Json
    Assert-Same $repoInfo.default_branch 'main' 'default branch'
    Assert-Same $repoInfo.allow_merge_commit $true 'merge commit policy'
    $tagRef = "refs/tags/$tag"
    $tagObject = Git rev-parse $tagRef
    Assert-Same (Git rev-parse "${tagRef}^{commit}") '03d8192b989ae9d1da212f318ff172a919043830' 'venue tag target'
    Assert-Same (RemoteRef $tagRef) $tagObject 'published venue tag'
    $pr = Get-ReleasePr
    Write-Host $pr.html_url
    if (!$pr.merged) {
        Assert-Same $pr.state 'open' 'PR state'
        Assert-Same $pr.draft $false 'draft state'
        Assert-Same $pr.base.sha $base 'PR base commit'
        Assert-Same (RemoteRef 'refs/heads/main') $base 'main before publication'
        $published = RemoteRef "refs/heads/$branch"
        Assert-Same $pr.head.sha $published 'PR and published head'
        if ($published -ceq $original) {
            Push-CheckedRef $original
        }
        Assert-Same (RemoteRef "refs/heads/$branch") $ExpectedHead 'published candidate'
    } else {
        Assert-Same $pr.head.sha $ExpectedHead 'merged PR head'
    }
    Wait-Acceptance $ExpectedHead $branch
    $pr = Get-ReleasePr
    Assert-Same $pr.head.sha $ExpectedHead 'PR head after acceptance'
    if (!$pr.merged) {
        Assert-Same $pr.state 'open' 'PR state'
        Assert-Same $pr.draft $false 'draft state'
        Assert-Same (RemoteRef 'refs/heads/main') $base 'main before merge'
        Assert-Same (RemoteRef "refs/heads/$branch") $ExpectedHead 'live candidate'
        $review = (Gh pr view $number --repo $repo --json reviewDecision,mergeStateStatus | Out-String) | ConvertFrom-Json
        if ($review.reviewDecision -in @('CHANGES_REQUESTED', 'REVIEW_REQUIRED')) { throw "Review must be resolved at $($pr.html_url)" }
        Assert-Same $review.mergeStateStatus 'CLEAN' 'GitHub merge state'
        $query = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){pageInfo{hasNextPage} nodes{isResolved}}}}}'
        $reviewData = (Gh api graphql -f "query=$query" -f 'owner=YellankiKaushik' -f 'name=Vishwas-Khata-AI-Hyd' -F "number=$number" | Out-String) | ConvertFrom-Json
        $threads = $reviewData.data.repository.pullRequest.reviewThreads
        if ($threads.pageInfo.hasNextPage -or @($threads.nodes | Where-Object { !$_.isResolved }).Count) { throw 'Review threads need inspection before merging.' }
        Assert-Same (RemoteRef 'refs/heads/main') $base 'main at merge'
        $result = (Gh api --method PUT "repos/$repo/pulls/$number/merge" -f merge_method=merge -f "sha=$ExpectedHead" | Out-String) | ConvertFrom-Json
        Assert-Same $result.merged $true 'merge result'
        $pr = Get-ReleasePr
    }
    Assert-Same $pr.merged $true 'merged PR'
    Assert-Same $pr.head.sha $ExpectedHead 'merged PR head'
    $main = $pr.merge_commit_sha
    Assert-Same (RemoteRef 'refs/heads/main') $main 'merged main'
    Git fetch --no-tags origin main
    Assert-Same (Git show -s --format=%P $main) "$base $ExpectedHead" 'merge parents'
    Assert-Same (Git rev-parse "${main}^{tree}") (Git rev-parse "${ExpectedHead}^{tree}") 'accepted tree'
    Wait-Acceptance $main 'main'
    $remaining = RemoteRef "refs/heads/$branch"
    if ($remaining) {
        Assert-Same $remaining $ExpectedHead 'branch before cleanup'
        $open = @(Gh api --paginate "repos/$repo/pulls?state=open&per_page=100" --jq '.[] | [.head.ref,.base.ref] | @tsv')
        foreach ($line in $open) {
            if (($line -split "`t") -ccontains $branch) { throw 'An open PR still uses the branch.' }
        }
        Assert-Same (RemoteRef 'refs/heads/main') $main 'main before cleanup'
        Push-CheckedRef $ExpectedHead -Delete
    }
    if (RemoteRef "refs/heads/$branch") { throw 'Branch deletion was not verified.' }
    Assert-Same (RemoteRef $tagRef) $tagObject 'venue tag'
    Git ls-remote --heads origin
} finally { Pop-Location }
