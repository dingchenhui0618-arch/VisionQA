$ErrorActionPreference = "Stop"

$root = "D:\VisionQA"
$sourceRoot = "C:\Users\123\Desktop"
$manifestPath = Join-Path $root "data\customer_gwang_v0.1\canary_manifest.csv"
$outRoot = Join-Path $root "data\customer_gwang_v0.1\live_results_v0.1"
$endpoint = "http://localhost:3141/api/live-evaluate"

New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

$manifest = Import-Csv -LiteralPath $manifestPath
$results = New-Object System.Collections.Generic.List[object]
$index = 0

foreach ($row in $manifest) {
  $index++
  $hash = $row.asset_sha256.ToLowerInvariant()
  $match = Get-ChildItem -LiteralPath $sourceRoot -File -Filter *.jpg -Recurse |
    Get-FileHash -Algorithm SHA256 |
    Where-Object { $_.Hash.ToLowerInvariant() -eq $hash } |
    Select-Object -First 1

  if (-not $match) {
    throw "Cannot resolve local source for $($row.asset_alias)"
  }

  $filePath = $match.Path
  $requestId = "gwang-canary-$index-$([guid]::NewGuid().ToString('N'))"
  $curlArgs = @(
    "-sS", "--max-time", "90", "-X", "POST",
    "-H", "x-request-id: $requestId",
    "-F", "candidate=@$filePath;type=image/jpeg",
    "-F", "consent=confirmed",
    "-F", "channel=Tmall",
    "-F", "placement=fashion ecommerce main image",
    "-F", "referenceStatus=complete",
    "-F", "provenanceStatus=known",
    "-F", "commercialTemplateId=platform-promotion",
    "--write-out", "`n__HTTP_STATUS__%{http_code}",
    $endpoint
  )
  $raw = (& curl.exe @curlArgs 2>&1 | Out-String).Trim()
  $statusMatch = [regex]::Match($raw, "__HTTP_STATUS__(\d{3})$")
  $status = if ($statusMatch.Success) { [int]$statusMatch.Groups[1].Value } else { 0 }
  $body = if ($statusMatch.Success) { $raw.Substring(0, $statusMatch.Index).Trim() } else { $raw }
  $responsePath = Join-Path $outRoot ("response_{0:D2}.json" -f $index)
  [System.IO.File]::WriteAllText($responsePath, $body, [System.Text.Encoding]::UTF8)

  $parsed = $null
  try { $parsed = $body | ConvertFrom-Json } catch {}
  $result = if ($parsed) { $parsed.result } else { $null }
  $score = if ($result -and $result.score_evaluation) { $result.score_evaluation.overall_score } else { $null }
  $gate = if ($result -and $result.gate) { $result.gate.decision } elseif ($result -and $result.gate_decision) { $result.gate_decision } else { $null }
  $scoreStatus = if ($result -and $result.score_evaluation) { $result.score_evaluation.status } else { $null }
  $observations = if ($result -and $result.observations) { @($result.observations).Count } else { 0 }
  $results.Add([pscustomobject]@{
    asset_alias = $row.asset_alias
    asset_sha256 = $hash
    http_status = $status
    score = $score
    gate_decision = $gate
    score_status = $scoreStatus
    observations_count = $observations
    response_file = $responsePath
  })
}

$summaryPath = Join-Path $outRoot "canary_summary.csv"
$results | Export-Csv -LiteralPath $summaryPath -NoTypeInformation -Encoding UTF8
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outRoot "canary_summary.json") -Encoding UTF8
$results | Format-Table -AutoSize
Write-Output "SUMMARY=$summaryPath"
