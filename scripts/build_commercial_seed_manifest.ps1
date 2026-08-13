param(
  [Parameter(Mandatory = $true)]
  [string]$SourceRoot,
  [string]$OutputDirectory = "D:\VisionQA\datasets\commercial_template_seed_v0.1"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$sourceDirectories = @(Get-ChildItem -LiteralPath $SourceRoot -Directory)
$previewRoot = $sourceDirectories |
  Where-Object { @(Get-ChildItem -LiteralPath $_.FullName -File -Filter *.jpg).Count -eq 53 } |
  Select-Object -First 1
$archiveRoot = $sourceDirectories |
  Where-Object { @(Get-ChildItem -LiteralPath $_.FullName -File -Filter *.rar).Count -eq 53 } |
  Select-Object -First 1

if (-not $previewRoot) {
  throw "Directory containing 53 JPG previews was not found."
}
if (-not $archiveRoot) {
  throw "Directory containing 53 RAR archives was not found."
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function Get-AssetNumber([string]$name) {
  $match = [regex]::Match($name, "\((\d+)\)")
  if (-not $match.Success) {
    throw "Cannot parse asset number from: $name"
  }
  return [int]$match.Groups[1].Value
}

$previews = Get-ChildItem -LiteralPath $previewRoot.FullName -File -Filter *.jpg
$archives = Get-ChildItem -LiteralPath $archiveRoot.FullName -File -Filter *.rar
$previewByNumber = @{}
$archiveByNumber = @{}

foreach ($file in $previews) {
  $previewByNumber[(Get-AssetNumber $file.BaseName)] = $file
}
foreach ($file in $archives) {
  $archiveByNumber[(Get-AssetNumber $file.BaseName)] = $file
}

$entries = foreach ($number in 1..53) {
  $preview = $previewByNumber[$number]
  $archive = $archiveByNumber[$number]
  if (-not $preview -or -not $archive) {
    throw "Missing preview or archive for asset $number"
  }

  $image = [System.Drawing.Image]::FromFile($preview.FullName)
  try {
    $width = $image.Width
    $height = $image.Height
  }
  finally {
    $image.Dispose()
  }

  $archiveListing = @(tar -tf $archive.FullName 2>$null)
  $psdCount = @($archiveListing | Where-Object { $_ -match "\.psd$" }).Count

  [ordered]@{
    asset_id = "commercial-seed-{0:D3}" -f $number
    source_number = $number
    source_kind = "purchased_editable_ecommerce_template"
    data_role = "commercial_template_seed"
    performance_evidence = "NOT_AVAILABLE"
    preview = [ordered]@{
      path = $preview.FullName
      width = $width
      height = $height
      bytes = $preview.Length
    }
    source_archive = [ordered]@{
      path = $archive.FullName
      bytes = $archive.Length
      psd_count = $psdCount
    }
    initial_template = "platform_promotion_main_image_v0.1"
    annotation_status = "UNLABELED"
    review_status = "PENDING_DOUBLE_REVIEW"
  }
}

$manifest = [ordered]@{
  manifest_version = "0.1.0"
  created_at = (Get-Date).ToUniversalTime().ToString("o")
  collection_id = "purchased-fashion-commerce-template-seed-53"
  collection_name = "53-fashion-commerce-main-image-templates"
  source_root = $SourceRoot
  rights = [ordered]@{
    source_type = "purchased_template_material"
    confirmed_by = "project_owner"
    confirmed_at = "2026-07-28"
    internal_research_allowed = $true
    third_party_model_testing_allowed = $true
    future_production_assets_same_permission = $true
    redistribution_allowed = $false
  }
  intended_uses = @(
    "commercial_template_design",
    "commercial_submetric_anchoring",
    "layout_and_promotion_expression_analysis",
    "third_party_multimodal_model_testing"
  )
  prohibited_claims = @(
    "verified_real_world_campaign_performance",
    "verified_ctr_or_cvr_improvement",
    "four_skill_accuracy_gold_set",
    "specific_client_brand_preference"
  )
  collection_stats = [ordered]@{
    asset_sets = $entries.Count
    jpg_previews = $previews.Count
    rar_archives = $archives.Count
    psd_files = ($entries | ForEach-Object { $_.source_archive.psd_count } | Measure-Object -Sum).Sum
    total_archive_bytes = ($archives | Measure-Object Length -Sum).Sum
  }
  entries = @($entries)
}

$manifestPath = Join-Path $OutputDirectory "manifest.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$annotationRows = $entries | ForEach-Object {
  [pscustomobject]@{
    asset_id = $_.asset_id
    source_number = $_.source_number
    preview_path = $_.preview.path
    first_template = $_.initial_template
    product_category = ""
    channel = "platform_ecommerce"
    placement = "main_image"
    brand_positioning = ""
    commercial_objective = "promotion_conversion"
    visual_tone = ""
    layout_state = ""
    template_fit_label = ""
    evidence_notes = ""
    reviewer_1 = ""
    reviewer_2 = ""
    adjudication = ""
  }
}

$annotationPath = Join-Path $OutputDirectory "annotation_sheet.csv"
$annotationRows | Export-Csv -LiteralPath $annotationPath -NoTypeInformation -Encoding UTF8

Write-Output $manifestPath
Write-Output $annotationPath
