$ErrorActionPreference = "Stop"

$root = "D:\VisionQA"
$inputCsv = Join-Path $root "data\commercial_reference_corpus_v0.2\gold_labels_calibration_v0.1.csv"
$outRoot = Join-Path $root "data\commercial_reference_corpus_v0.2\qwen_calibration_v0.1"
$tempRoot = Join-Path $outRoot ".tmp"
$endpoint = "http://localhost:3141/api/live-evaluate"
$targetBytes = 900 * 1024
$maxDimension = 1280

New-Item -ItemType Directory -Force -Path $outRoot, $tempRoot | Out-Null
Add-Type -AssemblyName System.Drawing

function Get-PlacementContext([string]$placement) {
  switch ($placement) {
    "AESTHETIC_REFERENCE" {
      return [pscustomobject]@{ Channel = "Reference Library"; Placement = "服饰审美参考"; Template = "aesthetic-reference" }
    }
    "LIFESTYLE_CAMPAIGN" {
      return [pscustomobject]@{ Channel = "E-commerce Campaign"; Placement = "服饰生活方式广告"; Template = "lifestyle-campaign" }
    }
    "PRODUCT_MAIN_IMAGE" {
      return [pscustomobject]@{ Channel = "E-commerce"; Placement = "普通服饰商品主图"; Template = "product-main-image" }
    }
    "PLATFORM_PROMOTION_MAIN_IMAGE" {
      return [pscustomobject]@{ Channel = "Tmall"; Placement = "平台促销主图"; Template = "platform-promotion" }
    }
    default { throw "Unsupported intended placement: $placement" }
  }
}

function New-PreparedImage([string]$sourcePath, [string]$stem) {
  $info = Get-Item -LiteralPath $sourcePath
  if ($info.Length -le $targetBytes) {
    return [pscustomobject]@{ Path = $sourcePath; Derived = $false; SourceBytes = $info.Length; PreparedBytes = $info.Length }
  }

  $image = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $scale = [Math]::Min(1.0, [Math]::Min($maxDimension / $image.Width, $maxDimension / $image.Height))
    $width = [Math]::Max(1, [int][Math]::Round($image.Width * $scale))
    $height = [Math]::Max(1, [int][Math]::Round($image.Height * $scale))
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.DrawImage($image, 0, 0, $width, $height)
      } finally { $graphics.Dispose() }
      $preparedPath = Join-Path $tempRoot ("prepared_{0}.jpg" -f $stem)
      $jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
        Where-Object { $_.MimeType -eq "image/jpeg" } |
        Select-Object -First 1
      $parameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
      $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
        [System.Drawing.Imaging.Encoder]::Quality,
        [long]78
      )
      $bitmap.Save($preparedPath, $jpeg, $parameters)
      $preparedInfo = Get-Item -LiteralPath $preparedPath
      return [pscustomobject]@{ Path = $preparedPath; Derived = $true; SourceBytes = $info.Length; PreparedBytes = $preparedInfo.Length }
    } finally { $bitmap.Dispose() }
  } finally { $image.Dispose() }
}

function Get-ModelResultRow($target, $parsed, [int]$status, $prepared, [string]$responsePath) {
  $result = if ($parsed) { $parsed.result } else { $null }
  $skills = if ($result) { $result.score_evaluation.skill_scores } else { $null }
  $metrics = if ($result) { $result.score_evaluation.commercial_assessment.metrics } else { $null }
  return [pscustomobject]@{
    asset_alias = $target.asset_alias
    source_sha256 = $target.sha256
    intended_placement = $target.intended_placement
    human_overall_score = $target.overall_score
    human_gate = $target.threshold_gate_decision
    source_bytes = $prepared.SourceBytes
    prepared_bytes = $prepared.PreparedBytes
    prepared_derivative = $prepared.Derived
    http_status = $status
    model_overall_score = if ($result) { $result.score_evaluation.overall_score } else { $null }
    model_gate = if ($result) { $result.gate_evaluation.decision } else { $null }
    score_status = if ($result) { $result.score_evaluation.status } else { $null }
    model_human_realism = if ($skills) { $skills.human_realism.score } else { $null }
    model_photography_realism = if ($skills) { $skills.photography_realism.score } else { $null }
    model_material_realism = if ($skills) { $skills.material_realism.score } else { $null }
    model_commercial_value = if ($skills) { $skills.commercial_value.score } else { $null }
    model_product_prominence = if ($metrics) { $metrics.product_prominence.score } else { $null }
    model_selling_point_clarity = if ($metrics) { $metrics.selling_point_clarity.score } else { $null }
    model_promotion_hierarchy = if ($metrics) { $metrics.promotion_hierarchy.score } else { $null }
    model_information_legibility = if ($metrics) { $metrics.information_legibility.score } else { $null }
    model_click_motivation = if ($metrics) { $metrics.click_motivation.score } else { $null }
    model_channel_placement_fit = if ($metrics) { $metrics.channel_placement_fit.score } else { $null }
    observations_count = if ($result) { @($result.model_evaluation.observations).Count } else { 0 }
    repair_prompt = if ($result) { $result.action_plan.repair_prompt.prompt } else { $null }
    provider_id = if ($parsed) { $parsed.provider.providerId } else { $null }
    model_snapshot = if ($parsed) { $parsed.provider.modelSnapshot } else { $null }
    latency_ms = if ($parsed) { $parsed.provider.latencyMs } else { $null }
    prompt_tokens = if ($parsed) { $parsed.provider.usage.inputTokens } else { $null }
    completion_tokens = if ($parsed) { $parsed.provider.usage.outputTokens } else { $null }
    response_file = $responsePath
  }
}

$targets = Import-Csv -LiteralPath $inputCsv
if ($targets.Count -ne 40) { throw "Calibration batch must contain exactly 40 rows." }

# Build one SHA-to-path map without changing source files.
$shaToPath = @{}
$sourceRoots = @(
  "C:\Users\123\Desktop\小宇电商图素材",
  "C:\Users\123\Desktop\枪王电商图素材"
)
foreach ($sourceRoot in $sourceRoots) {
  Get-ChildItem -LiteralPath $sourceRoot -File -Filter *.jpg -Recurse |
    Get-FileHash -Algorithm SHA256 |
    ForEach-Object { $shaToPath[$_.Hash.ToLowerInvariant()] = $_.Path }
}

$results = New-Object System.Collections.Generic.List[object]
$index = 0
foreach ($target in $targets) {
  $index++
  $stem = "{0:D2}_{1}" -f $index, $target.sha256.Substring(0, 8)
  $responsePath = Join-Path $outRoot ("response_{0}.json" -f $stem)
  $sourcePath = $shaToPath[$target.sha256.ToLowerInvariant()]
  if (-not $sourcePath) { throw "Cannot resolve source for $($target.asset_alias)" }
  $prepared = New-PreparedImage $sourcePath $stem

  # Resume safely: a successful response is never billed twice by this runner.
  $parsed = $null
  if (Test-Path -LiteralPath $responsePath) {
    try { $parsed = Get-Content -LiteralPath $responsePath -Raw -Encoding utf8 | ConvertFrom-Json } catch {}
  }
  if ($parsed -and $parsed.result -and $parsed.provider) {
    $results.Add((Get-ModelResultRow $target $parsed 200 $prepared $responsePath))
    continue
  }

  $context = Get-PlacementContext $target.intended_placement
  $requestId = "calibration-v01-$stem-$([guid]::NewGuid().ToString('N'))"
  $curlArgs = @(
    "-sS", "--max-time", "100", "-X", "POST",
    "-H", "x-request-id: $requestId",
    "-F", "candidate=@$($prepared.Path);type=image/jpeg",
    "-F", "consent=confirmed",
    "-F", "channel=$($context.Channel)",
    "-F", "placement=$($context.Placement)",
    "-F", "referenceStatus=complete",
    "-F", "provenanceStatus=known",
    "-F", "commercialTemplateId=$($context.Template)",
    "--write-out", "`n__HTTP_STATUS__%{http_code}",
    $endpoint
  )
  $raw = (& curl.exe @curlArgs 2>&1 | Out-String).Trim()
  $statusMatch = [regex]::Match($raw, "__HTTP_STATUS__(\d{3})$")
  $status = if ($statusMatch.Success) { [int]$statusMatch.Groups[1].Value } else { 0 }
  $body = if ($statusMatch.Success) { $raw.Substring(0, $statusMatch.Index).Trim() } else { $raw }
  [System.IO.File]::WriteAllText($responsePath, $body, [System.Text.Encoding]::UTF8)
  try { $parsed = $body | ConvertFrom-Json } catch { $parsed = $null }
  $results.Add((Get-ModelResultRow $target $parsed $status $prepared $responsePath))
  $results | Export-Csv -LiteralPath (Join-Path $outRoot "calibration_progress.csv") -NoTypeInformation -Encoding UTF8
  Write-Output ("CALIBRATION_PROGRESS={0}/40 asset={1} http={2}" -f $index, $target.asset_alias, $status)
}

$summary = Join-Path $outRoot "calibration_summary.csv"
$results | Export-Csv -LiteralPath $summary -NoTypeInformation -Encoding UTF8
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outRoot "calibration_summary.json") -Encoding UTF8
Get-ChildItem -LiteralPath $tempRoot -File -ErrorAction SilentlyContinue | Remove-Item -Force
$results | Group-Object http_status | Select-Object Name, Count | Format-Table -AutoSize
Write-Output "CALIBRATION_BATCH=COMPLETE"
