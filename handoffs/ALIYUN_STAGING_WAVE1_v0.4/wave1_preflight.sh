#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

REGION=cn-beijing
PREFIX=visionqa-staging
STATE_DIR=.visionqa-wave1-v0.4
ENV_FILE="$STATE_DIR/context.env"
LEDGER="$STATE_DIR/ledger.jsonl"
RUN_FILE="$STATE_DIR/active-run"
APPROVED_ARTIFACT=approved_budget_artifact.csv
EXPECTED_APPROVAL_SHA=f82a9aa43271521d4505a9f78f7073f1c8ebf0170003078e378bd63f95b7ce39
mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"; touch "$LEDGER"; chmod 600 "$LEDGER"
PRELOG="$(mktemp "$STATE_DIR/preflight.XXXXXX")"; chmod 600 "$PRELOG"
COMMITTED=0
cleanup_preflight(){
  rc=$?
  if (( COMMITTED == 0 )); then
    rm -f -- "$PRELOG" "${MANIFEST:-}" "$STATE_DIR/context.new" "$STATE_DIR/active-run.tmp"
    if [[ -f "$RUN_FILE" && -n "${RUN_ID:-}" && "$(<"$RUN_FILE")" == "$RUN_ID" ]]; then rm -f -- "$RUN_FILE"; fi
  fi
  exit "$rc"
}
trap cleanup_preflight EXIT

die(){ printf 'PREFLIGHT=FAIL reason=%s\n' "$1" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "missing_$1"; }
api(){
  local out rc code
  set +e; out="$(timeout 30s aliyun "$@" 2>&1)"; rc=$?; set -e
  if (( rc != 0 )); then
    set +e; code="$(jq -r '.Code // .code // empty' <<<"$out" 2>/dev/null)"; set -e
    case "$code" in NoSuchBucket|ProjectNotExist|LogStoreNotExist|ResourceNotFound|EntityNotExist) return 44;; esac
    return "$rc"
  fi
  printf '%s' "$out"
}
record(){ jq -nc --arg ts "$(date -u +%FT%TZ)" --arg batch "$BATCH_ID" --arg run "$RUN_ID" --arg phase preflight --arg action "$1" --arg result "$2" '{timestamp:$ts,batch_id:$batch,run_id:$run,phase:$phase,action:$action,result:$result}' >>"$PRELOG"; }
require_sha(){ [[ "${1:-}" =~ ^[0-9a-fA-F]{64}$ ]] || die "$2"; }

for c in aliyun jq sha256sum timeout grep zip base64 mktemp cut stat od tr date chmod mkdir rm mv cat; do need "$c"; done
[[ -z "${ALIBABA_CLOUD_ACCESS_KEY_ID:-}${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-}${ALIYUN_ACCESS_KEY_ID:-}${ALIYUN_ACCESS_KEY_SECRET:-}" ]] || die static_access_key_env_present

[[ -f "$APPROVED_ARTIFACT" ]] || die approved_budget_artifact_missing
ACTUAL_APPROVAL_SHA="$(sha256sum "$APPROVED_ARTIFACT"|cut -d' ' -f1)"
[[ "$ACTUAL_APPROVAL_SHA" == "$EXPECTED_APPROVAL_SHA" ]] || die approved_budget_artifact_sha_mismatch
grep -F 'STG-BUDGET-001' "$APPROVED_ARTIFACT" | grep -F ',APPROVED,APPROVE,' >/dev/null || die approved_budget_row
BATCH_ID="wave1-${ACTUAL_APPROVAL_SHA:0:16}"
if [[ -f "$RUN_FILE" ]]; then
  OLD_RUN="$(<"$RUN_FILE")"
  jq -se --arg r "$OLD_RUN" 'any(.[]; .run_id==$r and (.action=="VERIFY_COMPLETE" or .action=="ROLLBACK_COMPLETE"))' "$LEDGER" >/dev/null || die unfinished_prior_run
fi
RUN_ID="$(od -An -N16 -tx1 /dev/urandom|tr -d ' \n')"
[[ "$RUN_ID" =~ ^[0-9a-f]{32}$ ]] || die run_id_generation

CLI_VERSION="$(aliyun version 2>&1 | tr '\n' ' ')"
[[ "$CLI_VERSION" =~ [Vv]ersion[[:space:]]*3\.|3\.[0-9] ]] || die unsupported_aliyun_cli_version
HELP_ACTIONS=(
  "sts GetCallerIdentity" "resourcemanager GetResourceGroup"
  "vpc DescribeVpcs" "vpc DescribeVpcAttribute" "vpc DescribeVSwitches" "vpc DescribeVSwitchAttributes" "vpc CreateVpc" "vpc CreateVSwitch" "vpc TagResources" "vpc ListTagResources" "vpc DeleteVSwitch" "vpc DeleteVpc"
  "ecs DescribeSecurityGroups" "ecs DescribeSecurityGroupAttribute" "ecs CreateSecurityGroup" "ecs TagResources" "ecs ListTagResources" "ecs DeleteSecurityGroup"
  "oss GetBucketInfo" "oss GetBucketAcl" "oss PutBucket" "oss PutBucketPublicAccessBlock" "oss GetBucketPublicAccessBlock" "oss PutBucketEncryption" "oss GetBucketEncryption" "oss PutBucketLifecycle" "oss GetBucketLifecycle" "oss PutBucketTagging" "oss GetBucketTagging" "oss ListObjects" "oss ListMultipartUploads" "oss DeleteBucket"
  "log GetProject" "log CreateProject" "log GetLogStore" "log CreateLogStore" "log TagResources" "log ListTagResources" "log DeleteLogStore" "log DeleteProject"
  "fc ListFunctions" "fc GetFunction" "fc CreateFunction" "fc PutConcurrencyConfig" "fc GetConcurrencyConfig" "fc PutProvisionConfig" "fc GetProvisionConfig" "fc DeleteProvisionConfig" "fc DeleteConcurrencyConfig" "fc TagResources" "fc ListTaggedResources" "fc DeleteFunction"
)
for spec in "${HELP_ACTIONS[@]}"; do read -r svc act <<<"$spec"; timeout 15s aliyun "$svc" "$act" help >/dev/null 2>&1 || die "cli_help_${svc}_${act}"; done

ID="$(api sts GetCallerIdentity)" || die sts
ACCOUNT_ID="$(jq -er '.AccountId // .accountId' <<<"$ID")" || die sts_json
ACCOUNT_HASH="$(printf '%s' "$ACCOUNT_ID" | sha256sum | cut -c1-6)"
BUCKET="${PREFIX}-oss-${ACCOUNT_HASH}-cn-beijing"
unset ID ACCOUNT_ID

if [[ -z "${VISIONQA_ZONE_ID:-}" ]]; then read -r -p '北京可用区 ID: ' VISIONQA_ZONE_ID; fi
if [[ -z "${VISIONQA_RESOURCE_GROUP_ID:-}" ]]; then read -r -p 'visionqa-staging Resource Group ID: ' VISIONQA_RESOURCE_GROUP_ID; fi
VISIONQA_FC_ROLE_ARN_FILE="$STATE_DIR/fc-role-arn"
if [[ ! -f "$VISIONQA_FC_ROLE_ARN_FILE" ]]; then
  read -r -s -p 'visionqa-staging-runtime 完整 ARN（隐藏输入）: ' ROLE_INPUT; printf '\n'
  printf '%s' "$ROLE_INPUT" >"$VISIONQA_FC_ROLE_ARN_FILE"; unset ROLE_INPUT; chmod 600 "$VISIONQA_FC_ROLE_ARN_FILE"
fi
VISIONQA_MONTHLY_BUDGET_CNY="${VISIONQA_MONTHLY_BUDGET_CNY:-300}"
VISIONQA_BUDGET_ALERTS_CNY="${VISIONQA_BUDGET_ALERTS_CNY:-150,240,300}"

[[ "$VISIONQA_ZONE_ID" == cn-beijing-* ]] || die zone_missing_or_non_beijing
[[ "$VISIONQA_RESOURCE_GROUP_ID" =~ ^rg-[A-Za-z0-9_-]+$ ]] || die resource_group_id
[[ "$(stat -c '%a' "$VISIONQA_FC_ROLE_ARN_FILE")" == 600 ]] || die role_arn_file_permissions
VISIONQA_FC_ROLE_ARN="$(<"$VISIONQA_FC_ROLE_ARN_FILE")"
[[ "$VISIONQA_FC_ROLE_ARN" == acs:ram::*:role/visionqa-staging-runtime ]] || die role_arn
[[ "${VISIONQA_MONTHLY_BUDGET_CNY:-}" == 300 ]] || die monthly_budget_not_300
[[ "${VISIONQA_BUDGET_ALERTS_CNY:-}" == 150,240,300 ]] || die budget_alerts_not_150_240_300
record gates PASS

RG="$(api resourcemanager GetResourceGroup --ResourceGroupId "$VISIONQA_RESOURCE_GROUP_ID")" || die resource_group_read
[[ "$(jq -r '.ResourceGroup.DisplayName // .DisplayName // empty' <<<"$RG")" == visionqa-staging ]] || die resource_group_name_drift
record resource_group PASS

VPCS="$(api vpc DescribeVpcs --RegionId "$REGION" --VpcName visionqa-staging-vpc)" || die vpc_read
[[ "$(jq '[.Vpcs.Vpc[]?]|length' <<<"$VPCS")" -le 1 ]] || die duplicate_vpc
if [[ "$(jq '[.Vpcs.Vpc[]?]|length' <<<"$VPCS")" == 1 ]]; then
  jq -e --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '.Vpcs.Vpc[0] | .CidrBlock=="10.90.0.0/16" and (.ResourceGroupId==$rg)' <<<"$VPCS" >/dev/null || die vpc_drift
  VID="$(jq -r '.Vpcs.Vpc[0].VpcId' <<<"$VPCS")"; VT="$(api vpc ListTagResources --RegionId "$REGION" --ResourceType VPC --ResourceId.1 "$VID")" || die vpc_tags_read
  jq -e '[..|objects|select(.Key=="project" and .Value=="visionqa"),..|objects|select(.Key=="environment" and .Value=="staging"),..|objects|select(.Key=="owner" and .Value=="dingchenhui"),..|objects|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==4' <<<"$VT" >/dev/null || die vpc_tags_drift
fi
VSWS="$(api vpc DescribeVSwitches --RegionId "$REGION" --VSwitchName visionqa-staging-vsw-a)" || die vsw_read
[[ "$(jq '[.VSwitches.VSwitch[]?]|length' <<<"$VSWS")" -le 1 ]] || die duplicate_vswitch
if [[ "$(jq '[.VSwitches.VSwitch[]?]|length' <<<"$VSWS")" == 1 ]]; then
  jq -e --arg z "$VISIONQA_ZONE_ID" --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '.VSwitches.VSwitch[0] | .CidrBlock=="10.90.1.0/24" and .ZoneId==$z and (.ResourceGroupId==$rg)' <<<"$VSWS" >/dev/null || die vswitch_drift
  WID="$(jq -r '.VSwitches.VSwitch[0].VSwitchId' <<<"$VSWS")"; WT="$(api vpc ListTagResources --RegionId "$REGION" --ResourceType VSWITCH --ResourceId.1 "$WID")" || die vswitch_tags_read
  jq -e '[..|objects|select(.Key=="project" and .Value=="visionqa"),..|objects|select(.Key=="environment" and .Value=="staging"),..|objects|select(.Key=="owner" and .Value=="dingchenhui"),..|objects|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==4' <<<"$WT" >/dev/null || die vswitch_tags_drift
fi
SGS="$(api ecs DescribeSecurityGroups --RegionId "$REGION" --SecurityGroupName visionqa-staging-sg)" || die sg_read
[[ "$(jq '[.SecurityGroups.SecurityGroup[]?]|length' <<<"$SGS")" -le 1 ]] || die duplicate_sg
if [[ "$(jq '[.SecurityGroups.SecurityGroup[]?]|length' <<<"$SGS")" == 1 ]]; then
  jq -e --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '.SecurityGroups.SecurityGroup[0].ResourceGroupId==$rg' <<<"$SGS" >/dev/null || die sg_resource_group_drift
  SID="$(jq -r '.SecurityGroups.SecurityGroup[0].SecurityGroupId' <<<"$SGS")"; ST="$(api ecs ListTagResources --RegionId "$REGION" --ResourceType securitygroup --ResourceId.1 "$SID")" || die sg_tags_read
  jq -e '[..|objects|select(.Key=="project" and .Value=="visionqa"),..|objects|select(.Key=="environment" and .Value=="staging"),..|objects|select(.Key=="owner" and .Value=="dingchenhui"),..|objects|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==4' <<<"$ST" >/dev/null || die sg_tags_drift
fi
record network_inventory PASS

set +e; OSS_INFO="$(api oss GetBucketInfo --BucketName "$BUCKET")"; OSS_RC=$?; set -e
(( OSS_RC == 0 || OSS_RC == 44 )) || die oss_read
if (( OSS_RC == 0 )); then
  [[ "$(jq -r '.BucketInfo.Bucket.Location // .Location' <<<"$OSS_INFO")" == oss-cn-beijing ]] || die oss_region_drift
  [[ "$(jq -r '.BucketInfo.Bucket.ResourceGroupId // .ResourceGroupId // empty' <<<"$OSS_INFO")" == "$VISIONQA_RESOURCE_GROUP_ID" ]] || die oss_resource_group_drift
  ACL="$(api oss GetBucketAcl --BucketName "$BUCKET")" || die oss_acl
  [[ "$(jq -r '.AccessControlList.Grant // .Acl' <<<"$ACL")" == private ]] || die oss_acl_drift
  BPA="$(api oss GetBucketPublicAccessBlock --BucketName "$BUCKET")" || die oss_bpa
  [[ "$(jq -r '.PublicAccessBlockConfiguration.BlockPublicAccess // .BlockPublicAccess' <<<"$BPA")" == true ]] || die oss_bpa_drift
  ENC="$(api oss GetBucketEncryption --BucketName "$BUCKET")" || die oss_sse
  [[ "$(jq -r '.ServerSideEncryptionRule.SSEAlgorithm // .SSEAlgorithm' <<<"$ENC")" == AES256 ]] || die oss_sse_drift
  LC="$(api oss GetBucketLifecycle --BucketName "$BUCKET")" || die oss_lifecycle
  jq -e '.Rule[]? | select(.Prefix=="staging/visionqa/" and .Status=="Enabled" and .Expiration.Days==14 and .AbortMultipartUpload.Days==1)' <<<"$LC" >/dev/null || die oss_lifecycle_drift
  OT="$(api oss GetBucketTagging --BucketName "$BUCKET")" || die oss_tags
  jq -e '[..|objects|select(.Key=="project" and .Value=="visionqa"),..|objects|select(.Key=="environment" and .Value=="staging"),..|objects|select(.Key=="owner" and .Value=="dingchenhui"),..|objects|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==4' <<<"$OT" >/dev/null || die oss_tags_drift
fi
record oss_inventory PASS

set +e; PROJECT="$(api log GetProject --projectName visionqa-staging-sls --region "$REGION")"; PRC=$?; set -e
(( PRC == 0 || PRC == 44 )) || die sls_read
if (( PRC == 0 )); then
  [[ "$(jq -r '.resourceGroupId // .ResourceGroupId // empty' <<<"$PROJECT")" == "$VISIONQA_RESOURCE_GROUP_ID" ]] || die sls_resource_group_drift
  for spec in visionqa-staging-app:30 visionqa-staging-security:90; do
    s="${spec%%:*}"; d="${spec##*:}"
    L="$(api log GetLogStore --project visionqa-staging-sls --logstore "$s" --region "$REGION")" || die "sls_${s}_read"
    [[ "$(jq -r '.ttl // .TTL' <<<"$L")" == "$d" ]] || die "sls_${s}_ttl_drift"
  done
  LT="$(api log ListTagResources --resourceType project --resourceId visionqa-staging-sls --region "$REGION")" || die sls_tags
  jq -e '[..|objects|select(.Key=="project" and .Value=="visionqa"),..|objects|select(.Key=="environment" and .Value=="staging"),..|objects|select(.Key=="owner" and .Value=="dingchenhui"),..|objects|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==4' <<<"$LT" >/dev/null || die sls_tags_drift
fi
record sls_inventory PASS

FNS="$(api fc ListFunctions --region "$REGION" --limit 100 --fcVersion v3)" || die fc_read
for fn in visionqa-staging-api visionqa-staging-evaluation-task; do
  FC_COUNT="$(jq --arg n "$fn" '[((.functions // .Functions // [])[])|select((.functionName // .FunctionName)==$n)]|length' <<<"$FNS")"
  [[ "$FC_COUNT" -le 1 ]] || die "duplicate_fc_$fn"
  if [[ "$FC_COUNT" == 1 ]]; then
    F="$(api fc GetFunction --region "$REGION" --functionName "$fn" --fcVersion v3)" || die "fc_get_$fn"
    jq -e --arg r "$VISIONQA_FC_ROLE_ARN" --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '(.runtime=="nodejs20") and (.handler=="index.handler") and (.memorySize==1024) and (.diskSize==512) and (.instanceConcurrency==1) and (.role==$r) and ((.resourceGroupId // .ResourceGroupId)==$rg) and (.environmentVariables.VISIONQA_RUNTIME_MODE=="fixture") and (.environmentVariables.LIVE_PROVIDER_ENABLED=="false")' <<<"$F" >/dev/null || die "fc_drift_$fn"
    C="$(api fc GetConcurrencyConfig --region "$REGION" --functionName "$fn" --fcVersion v3)" || die "fc_concurrency_$fn"; [[ "$(jq -r '.reservedConcurrency // .ReservedConcurrency' <<<"$C")" == 1 ]] || die "fc_max_instances_$fn"
    FT="$(api fc ListTaggedResources --region "$REGION" --resourceType function --resourceId "$fn" --fcVersion v3)" || die "fc_tags_$fn"
    jq -e '[..|objects|select(.Key=="project" and .Value=="visionqa"),..|objects|select(.Key=="environment" and .Value=="staging"),..|objects|select(.Key=="owner" and .Value=="dingchenhui"),..|objects|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==4' <<<"$FT" >/dev/null || die "fc_tags_drift_$fn"
  fi
done
record fc_inventory PASS

MANIFEST="$STATE_DIR/run-$RUN_ID.json"
jq -nc --arg batch "$BATCH_ID" --arg run "$RUN_ID" --arg region "$REGION" --arg rg "$VISIONQA_RESOURCE_GROUP_ID" --arg approval "$ACTUAL_APPROVAL_SHA" --arg cli "$CLI_VERSION" '{schema:"visionqa-wave1-run-v0.4",batch_id:$batch,run_id:$run,region:$region,resource_group_id:$rg,approved_budget_artifact_sha256:$approval,cli_version:$cli,resources:{}}' >"$MANIFEST"
chmod 600 "$MANIFEST"
record MANIFEST_INIT "$(sha256sum "$MANIFEST"|cut -d' ' -f1)"

cat >"$STATE_DIR/context.new" <<EOF
REGION=$REGION
BUCKET=$BUCKET
VISIONQA_ZONE_ID=$VISIONQA_ZONE_ID
VISIONQA_RESOURCE_GROUP_ID=$VISIONQA_RESOURCE_GROUP_ID
VISIONQA_FC_ROLE_ARN_FILE=$VISIONQA_FC_ROLE_ARN_FILE
APPROVED_BUDGET_ARTIFACT_SHA256=$ACTUAL_APPROVAL_SHA
VISIONQA_MONTHLY_BUDGET_CNY=$VISIONQA_MONTHLY_BUDGET_CNY
VISIONQA_BUDGET_ALERTS_CNY=$VISIONQA_BUDGET_ALERTS_CNY
BATCH_ID=$BATCH_ID
RUN_ID=$RUN_ID
EOF
chmod 600 "$STATE_DIR/context.new"
record PREFLIGHT_COMPLETE PASS
mv -f "$STATE_DIR/context.new" "$ENV_FILE"
printf '%s' "$RUN_ID" >"$STATE_DIR/active-run.tmp"; chmod 600 "$STATE_DIR/active-run.tmp"; mv -f "$STATE_DIR/active-run.tmp" "$RUN_FILE"
cat "$PRELOG" >>"$LEDGER"
COMMITTED=1
rm -f -- "$PRELOG"
trap - EXIT
echo 'PREFLIGHT=PASS CLI=OK ZONE=OK RG=OK ROLE=OK BUDGET_ARTIFACT=OK'
echo 'FORBIDDEN=PASS orders=0 internet_egress=0 model_calls=0 access_keys=0'
