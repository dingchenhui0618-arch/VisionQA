param(
    [Parameter(Mandatory = $true)]
    [string]$DownloadedPrivateFile,
    [Parameter(Mandatory = $true)]
    [string]$ZonePrivateFile,
    [Parameter(Mandatory = $true)]
    [string]$PrivateDirectory
)

$ErrorActionPreference = 'Stop'

$resolvedPrivate = [System.IO.Path]::GetFullPath($PrivateDirectory)
$destination = Join-Path $resolvedPrivate 'aliyun_wave1_runtime.env'
$shaPath = "$destination.sha256"
$resolvedDestination = [System.IO.Path]::GetFullPath($destination)

if (-not $resolvedDestination.StartsWith($resolvedPrivate, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Destination outside private directory'
}
if (-not (Test-Path -LiteralPath $DownloadedPrivateFile) -or -not (Test-Path -LiteralPath $ZonePrivateFile)) {
    throw 'Private source missing'
}

$zoneLine = Get-Content -LiteralPath $ZonePrivateFile -Encoding UTF8 |
    Where-Object { $_ -match '^VISIONQA_ZONE_ID=' } |
    Select-Object -First 1
$downloadLines = Get-Content -LiteralPath $DownloadedPrivateFile -Encoding UTF8
$rgLine = $downloadLines |
    Where-Object { $_ -match '^VISIONQA_RESOURCE_GROUP_ID=' } |
    Select-Object -First 1
$roleLine = $downloadLines |
    Where-Object { $_ -match '^VISIONQA_FC_ROLE_ARN=' } |
    Select-Object -First 1

if ($zoneLine -notmatch '^VISIONQA_ZONE_ID=cn-beijing-[a-z]$') {
    throw 'Zone validation failed'
}
if ($rgLine -notmatch '^VISIONQA_RESOURCE_GROUP_ID=rg-[A-Za-z0-9_-]+$') {
    throw 'Resource group validation failed'
}
if ($roleLine -notmatch '^VISIONQA_FC_ROLE_ARN=acs:ram::[0-9]+:role/visionqa-staging-runtime$') {
    throw 'Role ARN validation failed'
}

$content = ($zoneLine, $rgLine, $roleLine) -join "`n"
[System.IO.File]::WriteAllText(
    $destination,
    $content + "`n",
    [System.Text.UTF8Encoding]::new($false)
)

$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText(
    $shaPath,
    "SHA256=$hash`n",
    [System.Text.UTF8Encoding]::new($false)
)

$principal = "$env:USERDOMAIN\$env:USERNAME"
& icacls.exe $destination '/inheritance:r' '/grant:r' "${principal}:(R)" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'ACL destination failed'
}
& icacls.exe $shaPath '/inheritance:r' '/grant:r' "${principal}:(R)" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'ACL SHA failed'
}

$aclText = (& icacls.exe $destination) -join "`n"
if ($aclText -notmatch [regex]::Escape($principal)) {
    throw 'ACL verification failed'
}

Write-Output 'PRIVATE_RUNTIME_EVIDENCE=READY'
Write-Output 'VALIDATION=PASS'
Write-Output 'ACL=PASS'
