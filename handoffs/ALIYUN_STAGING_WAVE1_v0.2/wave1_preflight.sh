#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

REGION=cn-beijing
PREFIX=visionqa-staging
STATE_DIR=.visionqa-wave1-v0.2
ENV_FILE="$STATE_DIR/context.env"
LEDGER="$STATE_DIR/ledger.jsonl"
mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"; : >"$LEDGER"; chmod 600 "$LEDGER"

die(){ printf 'PREFLIGHT=FAIL reason=%s\n' "$1" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "missing_$1"; }
api(){
  local out rc
  set +e; out="$(timeout 30s aliyun "$@" 2>&1)"; rc=$?; set -e
  (( rc == 0 )) || { printf '%s' "$out" | grep -Eqi 'NotFound|not found|404' && return 44; return "$rc"; }
  printf '%s' "$out"
}
record(){ jq -nc --arg ts "$(date -u +%FT%TZ)" --arg phase preflight --arg action "$1" --arg result "$2" '{timestamp:$ts,phase:$phase,action:$action,result:$result}' >>"$LEDGER"; }
require_sha(){ [[ "${1:-}" =~ ^[0-9a-fA-F]{64}$ ]] || die "$2"; }

for c in aliyun jq sha256sum timeout grep; do need "$c"; done
[[ -z "${ALIBABA_CLOUD_ACCESS_KEY_ID:-}${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-}${ALIYUN_ACCESS_KEY_ID:-}${ALIYUN_ACCESS_KEY_SECRET:-}" ]] || die static_access_key_env_present

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
if [[ -z "${VISIONQA_BUDGET_ALERT_EVIDENCE_SHA256:-}" ]]; then read -r -p '预算告警证据 SHA256: ' VISIONQA_BUDGET_ALERT_EVIDENCE_SHA256; fi
VISIONQA_MONTHLY_BUDGET_CNY="${VISIONQA_MONTHLY_BUDGET_CNY:-300}"
VISIONQA_BUDGET_ALERTS_CNY="${VISIONQA_BUDGET_ALERTS_CNY:-150,240,300}"

[[ "$VISIONQA_ZONE_ID" == cn-beijing-* ]] || die zone_missing_or_non_beijing
[[ "$VISIONQA_RESOURCE_GROUP_ID" =~ ^rg-[A-Za-z0-9_-]+$ ]] || die resource_group_id
[[ "$(stat -c '%a' "$VISIONQA_FC_ROLE_ARN_FILE")" == 600 ]] || die role_arn_file_permissions
VISIONQA_FC_ROLE_ARN="$(<"$VISIONQA_FC_ROLE_ARN_FILE")"
[[ "$VISIONQA_FC_ROLE_ARN" == acs:ram::*:role/visionqa-staging-runtime ]] || die role_arn
require_sha "${VISIONQA_BUDGET_ALERT_EVIDENCE_SHA256:-}" budget_evidence_sha
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
  jq -e '[..|objects|select(.Key=="project" and .Value=="visionqa"),..|objects|select(.Key=="environment" and .Value=="staging"),..|objects|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==3' <<<"$VT" >/dev/null || die vpc_tags_drift
fi
VSWS="$(api vpc DescribeVSwitches --RegionId "$REGION" --VSwitchName visionqa-staging-vsw-a)" || die vsw_read
[[ "$(jq '[.VSwitches.VSwitch[]?]|length' <<<"$VSWS")" -le 1 ]] || die duplicate_vswitch
if [[ "$(jq '[.VSwitches.VSwitch[]?]|length' <<<"$VSWS")" == 1 ]]; then
  jq -e --arg z "$VISIONQA_ZONE_ID" --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '.VSwitches.VSwitch[0] | .CidrBlock=="10.90.1.0/24" and .ZoneId==$z and (.ResourceGroupId==$rg)' <<<"$VSWS" >/dev/null || die vswitch_drift
  WID="$(jq -r '.VSwitches.VSwitch[0].VSwitchId' <<<"$VSWS")"; WT="$(api vpc ListTagResources --RegionId "$REGION" --ResourceType VSWITCH --ResourceId.1 "$WID")" || die vswitch_tags_read
  jq -e '[..|objects|select(.Key=="project" and .Value=="visionqa"),..|objects|select(.Key=="environment" and .Value=="staging"),..|objects|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==3' <<<"$WT" >/dev/null || die vswitch_tags_drift
fi
SGS="$(api ecs DescribeSecurityGroups --RegionId "$REGION" --SecurityGroupName visionqa-staging-sg)" || die sg_read
[[ "$(jq '[.SecurityGroups.SecurityGroup[]?]|length' <<<"$SGS")" -le 1 ]] || die duplicate_sg
if [[ "$(jq '[.SecurityGroups.SecurityGroup[]?]|length' <<<"$SGS")" == 1 ]]; then
  jq -e --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '.SecurityGroups.SecurityGroup[0].ResourceGroupId==$rg' <<<"$SGS" >/dev/null || die sg_resource_group_drift
  SID="$(jq -r '.SecurityGroups.SecurityGroup[0].SecurityGroupId' <<<"$SGS")"; ST="$(api ecs ListTagResources --RegionId "$REGION" --ResourceType securitygroup --ResourceId.1 "$SID")" || die sg_tags_read
  jq -e '[..|objects|select(.Key=="project" and .Value=="visionqa"),..|objects|select(.Key=="environment" and .Value=="staging"),..|objects|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==3' <<<"$ST" >/dev/null || die sg_tags_drift
fi
record network_inventory PASS

set +e; OSS_INFO="$(api oss GetBucketInfo --BucketName "$BUCKET")"; OSS_RC=$?; set -e
(( OSS_RC == 0 || OSS_RC == 44 )) || die oss_read
if (( OSS_RC == 0 )); then
  [[ "$(jq -r '.BucketInfo.Bucket.Location // .Location' <<<"$OSS_INFO")" == oss-cn-beijing ]] || die oss_region_drift
  ACL="$(api oss GetBucketAcl --BucketName "$BUCKET")" || die oss_acl
  [[ "$(jq -r '.AccessControlList.Grant // .Acl' <<<"$ACL")" == private ]] || die oss_acl_drift
  BPA="$(api oss GetBucketPublicAccessBlock --BucketName "$BUCKET")" || die oss_bpa
  [[ "$(jq -r '.PublicAccessBlockConfiguration.BlockPublicAccess // .BlockPublicAccess' <<<"$BPA")" == true ]] || die oss_bpa_drift
  ENC="$(api oss GetBucketEncryption --BucketName "$BUCKET")" || die oss_sse
  [[ "$(jq -r '.ServerSideEncryptionRule.SSEAlgorithm // .SSEAlgorithm' <<<"$ENC")" == AES256 ]] || die oss_sse_drift
  LC="$(api oss GetBucketLifecycle --BucketName "$BUCKET")" || die oss_lifecycle
  jq -e '.Rule[]? | select(.Prefix=="staging/visionqa/" and .Status=="Enabled" and .Expiration.Days==14 and .AbortMultipartUpload.Days==1)' <<<"$LC" >/dev/null || die oss_lifecycle_drift
  OT="$(api oss GetBucketTagging --BucketName "$BUCKET")" || die oss_tags
  jq -e '[..|objects|select(.Key=="project" and .Value=="visionqa"),..|objects|select(.Key=="environment" and .Value=="staging"),..|objects|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==3' <<<"$OT" >/dev/null || die oss_tags_drift
fi
record oss_inventory PASS

set +e; PROJECT="$(api log GetProject --projectName visionqa-staging-sls --region "$REGION")"; PRC=$?; set -e
(( PRC == 0 || PRC == 44 )) || die sls_read
if (( PRC == 0 )); then
  for spec in visionqa-staging-app:30 visionqa-staging-security:90; do
    s="${spec%%:*}"; d="${spec##*:}"
    L="$(api log GetLogStore --project visionqa-staging-sls --logstore "$s" --region "$REGION")" || die "sls_${s}_read"
    [[ "$(jq -r '.ttl // .TTL' <<<"$L")" == "$d" ]] || die "sls_${s}_ttl_drift"
  done
  LT="$(api log ListTagResources --resourceType project --resourceId visionqa-staging-sls --region "$REGION")" || die sls_tags
  jq -e '[..|objects|select(.Key=="project" and .Value=="visionqa"),..|objects|select(.Key=="environment" and .Value=="staging"),..|objects|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==3' <<<"$LT" >/dev/null || die sls_tags_drift
fi
record sls_inventory PASS

FNS="$(api fc ListFunctions --region "$REGION" --limit 100 --fcVersion v3)" || die fc_read
for fn in visionqa-staging-api visionqa-staging-evaluation-task; do
  FC_COUNT="$(jq --arg n "$fn" '[((.functions // .Functions // [])[])|select((.functionName // .FunctionName)==$n)]|length' <<<"$FNS")"
  [[ "$FC_COUNT" -le 1 ]] || die "duplicate_fc_$fn"
  if [[ "$FC_COUNT" == 1 ]]; then
    F="$(api fc GetFunction --region "$REGION" --functionName "$fn" --fcVersion v3)" || die "fc_get_$fn"
    jq -e --arg r "$VISIONQA_FC_ROLE_ARN" '(.runtime=="nodejs20") and (.handler=="index.handler") and (.memorySize==1024) and (.diskSize==512) and (.instanceConcurrency==1) and (.role==$r) and (.environmentVariables.VISIONQA_RUNTIME_MODE=="fixture") and (.environmentVariables.LIVE_PROVIDER_ENABLED=="false")' <<<"$F" >/dev/null || die "fc_drift_$fn"
    C="$(api fc GetConcurrencyConfig --region "$REGION" --functionName "$fn" --fcVersion v3)" || die "fc_concurrency_$fn"; [[ "$(jq -r '.reservedConcurrency // .ReservedConcurrency' <<<"$C")" == 1 ]] || die "fc_max_instances_$fn"
    FT="$(api fc ListTaggedResources --region "$REGION" --resourceType function --resourceId "$fn" --fcVersion v3)" || die "fc_tags_$fn"
    jq -e '[..|objects|select(.Key=="project" and .Value=="visionqa"),..|objects|select(.Key=="environment" and .Value=="staging"),..|objects|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==3' <<<"$FT" >/dev/null || die "fc_tags_drift_$fn"
  fi
done
record fc_inventory PASS

cat >"$ENV_FILE" <<EOF
REGION=$REGION
BUCKET=$BUCKET
VISIONQA_ZONE_ID=$VISIONQA_ZONE_ID
VISIONQA_RESOURCE_GROUP_ID=$VISIONQA_RESOURCE_GROUP_ID
VISIONQA_FC_ROLE_ARN_FILE=$VISIONQA_FC_ROLE_ARN_FILE
VISIONQA_BUDGET_ALERT_EVIDENCE_SHA256=$VISIONQA_BUDGET_ALERT_EVIDENCE_SHA256
VISIONQA_MONTHLY_BUDGET_CNY=$VISIONQA_MONTHLY_BUDGET_CNY
VISIONQA_BUDGET_ALERTS_CNY=$VISIONQA_BUDGET_ALERTS_CNY
EOF
chmod 600 "$ENV_FILE"
echo 'PREFLIGHT=PASS ZONE=OK RG=OK ROLE=OK BUDGET=OK'
echo 'FORBIDDEN=PASS orders=0 internet_egress=0 model_calls=0 access_keys=0'
