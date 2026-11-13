# Run from the existing development checkout in an authenticated PowerShell.
[CmdletBinding()]
param([ValidateRange(5, 120)][int]$WaitMinutes = 50)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$repo = 'YellankiKaushik/Vishwas-Khata-AI-Hyd'
$venue = '03d8192b989ae9d1da212f318ff172a919043830'
$mainBefore = '482e80a98a770b6e09786d52d754c4686efc6c37'
$stagingBefore = '206e6cd02205987dadda1685134d2f2e14f46821'
$hostedBefore = '8173d4b7b65e3d7baf922ef42957349429678129'
$docsHead = 'a5fb6b7217ae52a4a5d010100cf011f72670b237'
$hosted = 'feat/hosted-synthetic-parity'
$staging = 'feat/synthetic-staging-foundations'
$integration = 'release/hyderabad-integration'
$docs = 'docs/hyderabad-maintainer'
$tag = 'hyderabad-venue-2026-11-13'
$workflow = 'hosted-acceptance.yml'
$jobs = 'acceptance', 'backend', 'hosted-edge', 'hosted-unit', 'local-edge'
$deadline = [DateTimeOffset]::UtcNow.AddMinutes($WaitMinutes)

function Invoke-Git {
    & git @args
    if ($LASTEXITCODE -ne 0) { throw "Git operation failed: $($args[0]) (exit $LASTEXITCODE)." }
}

function Invoke-Gh {
    & gh @args
    if ($LASTEXITCODE -ne 0) { throw "GitHub operation failed: $($args[0]) (exit $LASTEXITCODE)." }
}

function Get-Api([string]$Path) {
    (Invoke-Gh api "repos/$repo/$Path" | Out-String) | ConvertFrom-Json
}

function Assert-Same($Actual, $Expected, [string]$What) {
    if ($Actual -cne $Expected) { throw "$What was '$Actual', expected '$Expected'. Review the live state before retrying." }
}

function Assert-Ancestor([string]$Older, [string]$Newer) {
    & git merge-base --is-ancestor $Older $Newer
    if ($LASTEXITCODE -ne 0) { throw "$Older is not a verified ancestor of $Newer." }
}

function Get-RemoteHeads {
    $heads = @{}
    foreach ($line in (Invoke-Git ls-remote --heads origin)) {
        if ($line -cnotmatch '^([0-9a-f]{40})\s+refs/heads/(.+)$') { throw 'Unexpected remote branch response.' }
        $heads[$Matches[2]] = $Matches[1]
    }
    $heads
}

function Assert-FinalRefs([string]$MainSha, [string]$TagObject) {
    Assert-Same ((Get-RemoteHeads)['main']) $MainSha 'Published main'
    Assert-Same (Invoke-Git ls-remote --refs origin "refs/tags/$tag") "$TagObject`trefs/tags/$tag" 'Published venue tag'
}

function Get-Pr([int]$Number) {
    $fields = 'number,url,state,isDraft,isCrossRepository,headRefName,headRefOid,baseRefName,baseRefOid,mergeCommit,potentialMergeCommit,mergeStateStatus,reviewDecision'
    (Invoke-Gh pr view $Number --repo $repo --json $fields | Out-String) | ConvertFrom-Json
}

function Assert-Pr($Pr, [string]$HeadName, [string]$HeadSha, [string]$BaseName) {
    if ($Pr.isCrossRepository) { throw "PR #$($Pr.number) crosses repositories." }
    Assert-Same $Pr.headRefName $HeadName 'PR head ref'
    Assert-Same $Pr.headRefOid $HeadSha 'PR head SHA'
    Assert-Same $Pr.baseRefName $BaseName 'PR base ref'
}

function Wait-Acceptance([string]$Branch, [string]$Sha) {
    $query = "actions/workflows/$workflow/runs?head_sha=$Sha&branch=$Branch&event=push"
    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        $run = (Get-Api $query).workflow_runs | Sort-Object id -Descending | Select-Object -First 1
        if ($run) {
            Assert-Same $run.head_sha $Sha 'Actions head SHA'
            Assert-Same $run.head_branch $Branch 'Actions head branch'
            if ($run.status -eq 'completed') {
                Write-Host "$Branch $Sha acceptance $($run.conclusion) $($run.html_url)"
                Assert-Same $run.conclusion 'success' 'Actions conclusion'
                $results = @((Get-Api "actions/runs/$($run.id)/attempts/$($run.run_attempt)/jobs?per_page=100").jobs)
                Assert-Same (($results.name | Sort-Object) -join ',') ($jobs -join ',') 'Acceptance job list'
                foreach ($job in $results) {
                    Assert-Same $job.conclusion 'success' "Job $($job.name)"
                }
                return
            }
        }
        Start-Sleep -Seconds 20
    }
    throw "Timed out waiting for $Branch at $Sha. Run this script again to resume."
}

function Assert-Review($Pr, [bool]$ApprovalRequired, [bool]$AllowPending = $false) {
    if ($Pr.reviewDecision -eq 'CHANGES_REQUESTED' -or
        (!$AllowPending -and $Pr.reviewDecision -eq 'REVIEW_REQUIRED')) {
        throw "PR #$($Pr.number) review decision is $($Pr.reviewDecision). $($Pr.url)"
    }
    $query = @'
query($owner:String!, $name:String!, $number:Int!) {
  repository(owner:$owner,name:$name) { pullRequest(number:$number) {
    reviewThreads(first:100) { pageInfo { hasNextPage } nodes { isResolved } }
  } }
}
'@
    $review = (Invoke-Gh api graphql -f "query=$query" -f 'owner=YellankiKaushik' -f 'name=Vishwas-Khata-AI-Hyd' -F "number=$($Pr.number)" | Out-String) | ConvertFrom-Json
    $threads = $review.data.repository.pullRequest.reviewThreads
    if ($threads.pageInfo.hasNextPage -or @($threads.nodes | Where-Object { !$_.isResolved }).Count) {
        throw "Review threads on PR #$($Pr.number) need inspection. $($Pr.url)"
    }
    if ($ApprovalRequired) {
        $details = Get-Api "pulls/$($Pr.number)"
        $pages = (Invoke-Gh api --paginate --slurp "repos/$repo/pulls/$($Pr.number)/reviews?per_page=100" | Out-String) |
            ConvertFrom-Json -NoEnumerate
        $submissions = @($pages | ForEach-Object { $_ | Write-Output })
        $approvals = @($submissions | Where-Object { $_.user.login -ne $details.user.login -and $_.state -ne 'COMMENTED' } |
            Group-Object { $_.user.login } | ForEach-Object { $_.Group | Sort-Object id -Descending | Select-Object -First 1 } |
            Where-Object { $_.state -eq 'APPROVED' -and $_.commit_id -eq $Pr.headRefOid -and $_.author_association -in @('OWNER','MEMBER','COLLABORATOR') })
        if (!$approvals.Count) { throw "Integration PR #$($Pr.number) needs a repository reviewer to approve its exact head. $($Pr.url)" }
    }
}

function Merge-VerifiedPr($Pr, [string]$BaseSha, [bool]$ApprovalRequired) {
    Assert-Same $Pr.state 'OPEN' 'PR state'
    Assert-Same $Pr.baseRefOid $BaseSha 'PR base SHA'
    Assert-Review $Pr $ApprovalRequired $Pr.isDraft
    if ($Pr.isDraft) {
        Invoke-Gh pr ready $Pr.number --repo $repo | Out-Host
    }
    do {
        $fresh = Get-Pr $Pr.number
        Assert-Pr $fresh $Pr.headRefName $Pr.headRefOid $Pr.baseRefName
        Assert-Same $fresh.baseRefOid $BaseSha 'PR base SHA'
        Assert-Same $fresh.state 'OPEN' 'PR state'
        if ($fresh.mergeStateStatus -eq 'CLEAN') { break }
        if ($fresh.mergeStateStatus -notin @('UNKNOWN', 'BLOCKED', 'UNSTABLE', 'DRAFT')) { break }
        if ([DateTimeOffset]::UtcNow -ge $deadline) { break }
        Start-Sleep -Seconds 15
    } while ($true)
    Assert-Same $fresh.isDraft $false 'PR draft state'
    Assert-Same $fresh.mergeStateStatus 'CLEAN' 'GitHub merge state'
    Assert-Review $fresh $ApprovalRequired
    $live = Get-RemoteHeads
    Assert-Same $live[$fresh.baseRefName] $BaseSha 'Live base ref'
    Assert-Same $live[$fresh.headRefName] $fresh.headRefOid 'Live head ref'
    Invoke-Git fetch --no-tags origin "refs/pull/$($fresh.number)/merge" | Out-Host
    Assert-Same (Invoke-Git rev-parse FETCH_HEAD) $fresh.potentialMergeCommit.oid 'GitHub test merge commit'
    Assert-Same (Invoke-Git show -s --format=%P FETCH_HEAD) "$BaseSha $($fresh.headRefOid)" 'GitHub test merge parents'
    Assert-Same (Invoke-Git rev-parse 'FETCH_HEAD^{tree}') (Invoke-Git rev-parse "$($fresh.headRefOid)^{tree}") 'Test merge tree versus accepted head'
    $result = (Invoke-Gh api --method PUT "repos/$repo/pulls/$($fresh.number)/merge" -f merge_method=merge -f "sha=$($fresh.headRefOid)" |
        Out-String) | ConvertFrom-Json
    Assert-Same $result.merged $true 'GitHub merge result'
    $merged = Get-Pr $fresh.number
    Assert-Same $merged.state 'MERGED' 'PR merge result'
    $merged
}

function Assert-MergeCommit([string]$Sha, [string]$Base, [string]$Head) {
    Assert-Same (Invoke-Git show -s --format=%P $Sha) "$Base $Head" 'Actual merge parents'
    Assert-Same (Invoke-Git rev-parse "${Sha}^{tree}") (Invoke-Git rev-parse "${Head}^{tree}") 'Actual merge tree'
}

function Remove-VerifiedBranch([string]$Branch, [string]$Sha) {
    # Git advertises the remote object to pre-push and uses that object in
    # the deletion transaction. Abort if it changed after the ancestry check.
    $existingHook = Invoke-Git rev-parse --git-path hooks/pre-push
    if (Test-Path -LiteralPath $existingHook) { throw 'An existing pre-push hook requires manual branch cleanup.' }
    $hooks = Join-Path $env:TEMP ('vishwas-delete-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $hooks | Out-Null
    $hook = Join-Path $hooks 'pre-push'
    try {
        $guard = @'
#!/bin/sh
set -eu
IFS=' ' read -r local_ref local_oid remote_ref remote_oid
test "$local_ref" = '(delete)'
test "$remote_ref" = 'refs/heads/{0}'
test "$remote_oid" = '{1}'
if read -r extra; then exit 1; fi
'@ -f $Branch, $Sha
        [IO.File]::WriteAllText($hook, (($guard -replace '\r\n', "`n") + "`n"), [Text.UTF8Encoding]::new($false))
        Invoke-Git -c "core.hooksPath=$hooks" push origin --delete $Branch
    } finally {
        if (Test-Path -LiteralPath $hook) { Remove-Item -LiteralPath $hook }
        Remove-Item -LiteralPath $hooks
    }
}

Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    Assert-Same (Invoke-Git config --get remote.origin.url) "https://github.com/$repo.git" 'Origin URL'
    Assert-Same (Invoke-Git branch --show-current) $hosted 'Local branch'
    if (Invoke-Git status --porcelain) { throw 'The development checkout must be clean.' }
    $candidate = Invoke-Git rev-parse HEAD
    Assert-Ancestor $hostedBefore $candidate
    Assert-Ancestor $stagingBefore $candidate
    Assert-Same (Invoke-Git cat-file -t "refs/tags/$tag") 'tag' 'Venue tag object type'
    Assert-Same (Invoke-Git rev-parse "refs/tags/${tag}^{commit}") $venue 'Venue tag target'
    Assert-Same (Invoke-Git rev-parse "${venue}^{tree}") 'ad842744a605517da3f4c63c9905ef781e312002' 'Frozen venue tree'
    Invoke-Gh auth status --hostname github.com | Out-Host
    $metadata = (Invoke-Gh api "repos/$repo" | Out-String) | ConvertFrom-Json
    Assert-Same $metadata.default_branch 'main' 'Default branch'
    Assert-Same $metadata.allow_merge_commit $true 'Merge commits allowed'
    Invoke-Git fetch --prune --no-tags origin
    $heads = Get-RemoteHeads
    Assert-Ancestor $docsHead $heads['main']
    Assert-Ancestor $venue $heads['main']
    $pr2 = Get-Pr 2
    Assert-Pr $pr2 $hosted $(if ($pr2.state -eq 'MERGED') { $candidate } else { $heads[$hosted] }) $staging
    Write-Host "Initial main $($heads['main']); PR #2 $($pr2.state); local candidate $candidate."

    $tagRef = "refs/tags/$tag"
    $tagObject = Invoke-Git rev-parse $tagRef
    $remoteTag = Invoke-Git ls-remote --refs origin $tagRef
    if (!$remoteTag) { Invoke-Git push origin "${tagRef}:$tagRef" }
    $publishedTag = Invoke-Git ls-remote --refs origin $tagRef
    Assert-Same $publishedTag "$tagObject`t$tagRef" 'Published annotated venue tag'

    if ($pr2.state -ne 'MERGED') {
        Assert-Same $pr2.state 'OPEN' 'PR #2 state'
        Assert-Same $heads['main'] $mainBefore 'Main SHA'
        Assert-Same $heads[$staging] $stagingBefore 'Staging SHA'
        Assert-Same $pr2.baseRefOid $stagingBefore 'Hosted PR base SHA'
        if ($heads[$hosted] -eq $hostedBefore) {
            Invoke-Git diff --check "$stagingBefore...$candidate"
            Invoke-Git push origin "${candidate}:refs/heads/$hosted"
        } else {
            Assert-Same $heads[$hosted] $candidate 'Published hosted head'
        }
        Wait-Acceptance $hosted $candidate
        $pr2 = Get-Pr 2
        Assert-Pr $pr2 $hosted $candidate $staging
        $remotePaths = @((Invoke-Gh api --paginate "repos/$repo/pulls/2/files?per_page=100" --jq '.[].filename') | Sort-Object)
        $localPaths = @((Invoke-Git diff --name-only "$stagingBefore...$candidate") | Sort-Object)
        Assert-Same ($remotePaths -join "`n") ($localPaths -join "`n") 'Published PR file list'
        Invoke-Git diff --stat "$stagingBefore...$candidate" | Out-Host
        $pr2 = Merge-VerifiedPr $pr2 $stagingBefore $false
        Invoke-Git fetch --no-tags origin
    }
    $stagingSha = $pr2.mergeCommit.oid
    Assert-MergeCommit $stagingSha $stagingBefore $candidate
    Wait-Acceptance $hosted $candidate
    Write-Host "PR #2 merged at $stagingSha $($pr2.url)"
    $heads = Get-RemoteHeads

    $existing = @((Invoke-Gh pr list --repo $repo --base main --head $integration --state all --json number | Out-String) | ConvertFrom-Json)
    if ($existing.Count -gt 1) { throw 'Multiple integration PRs require inspection.' }
    $pr = if ($existing.Count) { Get-Pr $existing[0].number } else { $null }
    if (!$pr -or $pr.state -ne 'MERGED') {
        Assert-Same $heads['main'] $mainBefore 'Integration base SHA'
        Assert-Same $heads[$staging] $stagingSha 'Merged staging ref'
        if (!$heads.ContainsKey($integration)) {
            if ($pr) { throw "Integration PR already exists without its head branch. $($pr.url)" }
            $tree = Invoke-Git merge-tree --write-tree $mainBefore $stagingSha
            if ($tree -cnotmatch '^[0-9a-f]{40}$') { throw 'Unexpected integration tree result.' }
            $integrationSha = Invoke-Git commit-tree $tree -p $mainBefore -p $stagingSha -m 'Integrate accepted Hyderabad hosted staging'
            Invoke-Git diff --check "$mainBefore...$integrationSha"
            Invoke-Git diff --stat "$mainBefore...$integrationSha" | Out-Host
            Invoke-Git push origin "${integrationSha}:refs/heads/$integration"
        } else {
            $integrationSha = $heads[$integration]
            Assert-Same (Invoke-Git show -s --format=%P $integrationSha) "$mainBefore $stagingSha" 'Integration parents'
            Assert-Same (Invoke-Git rev-parse "${integrationSha}^{tree}") (Invoke-Git merge-tree --write-tree $mainBefore $stagingSha) 'Integration tree'
        }
        if (!$pr) {
            $url = Invoke-Gh pr create --repo $repo --base main --head $integration --title 'Integrate verified Hyderabad synthetic hosted staging' --body 'Preserves main maintainer attribution and the frozen venue release. Requires full acceptance and review of this integration head. Public startup stays gated.'
            Write-Host $url
            $pr = Get-Pr ([int]($url -split '/')[-1])
        }
        Assert-Pr $pr $integration $integrationSha 'main'
        Wait-Acceptance $integration $integrationSha
        $pr = Merge-VerifiedPr (Get-Pr $pr.number) $mainBefore $true
        Invoke-Git fetch --no-tags origin
    } else {
        $integrationSha = $pr.headRefOid
        Assert-Pr $pr $integration $integrationSha 'main'
        Wait-Acceptance $integration $integrationSha
    }
    $mainSha = $pr.mergeCommit.oid
    Assert-MergeCommit $mainSha $mainBefore $integrationSha
    Assert-Same (Invoke-Git show -s --format=%P $integrationSha) "$mainBefore $stagingSha" 'Integrated candidate parents'
    Assert-Ancestor $docsHead $mainSha
    Assert-Ancestor $candidate $mainSha
    Assert-Ancestor $venue $mainSha
    Assert-FinalRefs $mainSha $tagObject
    Write-Host "Integration PR #$($pr.number) merged at $mainSha $($pr.url)"
    Wait-Acceptance 'main' $mainSha

    $cleanup = [ordered]@{ $docs = $docsHead; $hosted = $candidate; $staging = $stagingSha; $integration = $integrationSha }
    foreach ($branch in $cleanup.Keys) {
        $live = Get-RemoteHeads
        Assert-Same $live['main'] $mainSha 'Main SHA before branch cleanup'
        if (!$live.ContainsKey($branch)) {
            Write-Host "$branch already absent."
            continue
        }
        Assert-Same $live[$branch] $cleanup[$branch] "Cleanup head for $branch"
        Assert-Ancestor $live[$branch] $mainSha
        $open = @((Invoke-Gh api --paginate "repos/$repo/pulls?state=open&per_page=100" --jq '.[] | [.head.repo.full_name,.head.ref,.base.repo.full_name,.base.ref] | @tsv'))
        foreach ($line in $open) {
            $headRepo, $headRef, $baseRepo, $baseRef = $line -split "`t"
            if (($headRepo -eq $repo -and $headRef -eq $branch) -or ($baseRepo -eq $repo -and $baseRef -eq $branch)) {
                throw "An open PR still depends on $branch."
            }
        }
        $live = Get-RemoteHeads
        Assert-Same $live['main'] $mainSha 'Main SHA immediately before branch deletion'
        Assert-Same $live[$branch] $cleanup[$branch] "Branch SHA immediately before deleting $branch"
        Remove-VerifiedBranch $branch $cleanup[$branch]
        if ((Get-RemoteHeads).ContainsKey($branch)) { throw "Deletion of $branch was not verified." }
        Write-Host "Deleted $branch at $($cleanup[$branch])."
    }
    Assert-FinalRefs $mainSha $tagObject
    Write-Host "Verified main $mainSha, venue tag $tag at $venue, and remaining remote branches:"
    (Get-RemoteHeads).GetEnumerator() | Sort-Object Key | Format-Table -AutoSize | Out-Host
}
finally {
    Pop-Location
}
