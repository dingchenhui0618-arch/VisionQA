$ErrorActionPreference = "Stop"

$root = "D:\VisionQA"
$desktopRoot = "C:\Users\123\Desktop"
$outRoot = Join-Path $root "data\mixed_commercial_reference_v0.3\live_results"
$tempRoot = Join-Path $outRoot ".tmp"
$endpoint = "http://localhost:3141/api/live-evaluate"
$targetBytes = 900 * 1024
$maxDimension = 1280

New-Item -ItemType Directory -Force -Path $outRoot, $tempRoot | Out-Null
Add-Type -AssemblyName System.Drawing

$targets = @(
  [pscustomobject]@{ alias = "gwang/6e977399dd360b69.jpg"; sha256 = "6e977399dd360b69d06aadaab910f0bd33e7dee64ea79552cfa161307a21e071" },
  [pscustomobject]@{ alias = "gwang/700d190d8cf52b9e.jpg"; sha256 = "700d190d8cf52b9ec8a086613943e6dbf8e18c80ab277c9b484a604b77d4c5b8" },
  [pscustomobject]@{ alias = "gwang/f5ddce3cb4b24e98.jpg"; sha256 = "f5ddce3cb4b24e98fec63569e5e4a041fdc27de7e1ba28a533eea9b3f3a5ca98" },
  [pscustomobject]@{ alias = "xiaoyu/d5b064961a59c36a.jpg"; sha256 = "d5b064961a59c36a875fb5aea29a876e7679b5f" },
  [pscustomobject]@{ alias = "xiaoyu/fd7e3fb17988a2d7.jpg"; sha256 = "fd7e3fb17988a2d7ba8c8e63834053ef3e89be4" }
)

# Resolve the full SHA for the Xiaoyu target from the frozen manifest.
$xiaoyu = Import-Csv -LiteralPath (Join-Path $root "data\customer_xiaoyu_v0.1\asset_manifest.csv") |
  Where-Object { $_.source_alias -eq "xiaoyu/d5b064961a59c36a.jpg" } |
  Select-Object -First 1
if (-not $xiaoyu) { throw "Cannot resolve frozen Xiaoyu target." }
$targets[3].sha256 = $xiaoyu.sha256
$xiaoyuProduct = Import-Csv -LiteralPath (Join-Path $root "data\customer_xiaoyu_v0.1\asset_manifest.csv") |
  Where-Object { $_.source_alias -eq "xiaoyu/fd7e3fb17988a2d7.jpg" } |
  Select-Object -First 1
if (-not $xiaoyuProduct) { throw "Cannot resolve frozen Xiaoyu product target." }
$targets[4].sha256 = $xiaoyuProduct.sha256

function Resolve-SourceFile([string]$sha256) {
  Get-ChildItem -LiteralPath $desktopRoot -File -Filter *.jpg -Recurse |
    Get-FileHash -Algorithm SHA256 |
    Where-Object { $_.Hash.ToLowerInvariant() -eq $sha256.ToLowerInvariant() } |
    Select-Object -First 1
}

function New-PreparedImage([string]$sourcePath, [int]$index) {
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
      } finally {
        $graphics.Dispose()
      }
      $preparedPath = Join-Path $tempRoot ("prepared_{0:D2}.jpg" -f $index)
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
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $image.Dispose()
  }
}

$results = New-Object System.Collections.Generic.List[object]
$index = 0
foreach ($target in $targets) {
  $index++
  $match = Resolve-SourceFile $target.sha256
  if (-not $match) { throw "Cannot resolve source for $($target.alias)" }
  $prepared = New-PreparedImage $match.Path $index
  $requestId = "mixed-canary-v02-$index-$([guid]::NewGuid().ToString('N'))"
  $curlArgs = @(
    "-sS", "--max-time", "90", "-X", "POST",
    "-H", "x-request-id: $requestId",
    "-F", "candidate=@$($prepared.Path);type=image/jpeg",
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
  $results.Add([pscustomobject]@{
    asset_alias = $target.alias
    source_sha256 = $target.sha256
    source_bytes = $prepared.SourceBytes
    prepared_bytes = $prepared.PreparedBytes
    prepared_derivative = $prepared.Derived
    http_status = $status
    overall_score = if ($result) { $result.score_evaluation.overall_score } else { $null }
    gate_decision = if ($result) { $result.gate_evaluation.decision } else { $null }
    score_status = if ($result) { $result.score_evaluation.status } else { $null }
    observations_count = if ($result) { @($result.model_evaluation.observations).Count } else { 0 }
    response_file = $responsePath
  })
}

$results | Export-Csv -LiteralPath (Join-Path $outRoot "canary_summary.csv") -NoTypeInformation -Encoding UTF8
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outRoot "canary_summary.json") -Encoding UTF8
$results | Format-Table -AutoSize

Get-ChildItem -LiteralPath $tempRoot -File -ErrorAction SilentlyContinue | Remove-Item -Force
