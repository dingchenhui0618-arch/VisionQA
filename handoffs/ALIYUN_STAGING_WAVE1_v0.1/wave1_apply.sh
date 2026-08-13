#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ -f .visionqa-wave1.env ]] || { echo 'APPLY=FAIL reason=run_preflight_first' >&2; exit 1; }
# shellcheck disable=SC1091
source .visionqa-wave1.env

PREFIX="visionqa-staging"
VPC_NAME="${PREFIX}-vpc"; VPC_CIDR="10.90.0.0/16"
VSW_NAME="${PREFIX}-vsw-a"; VSW_CIDR="10.90.1.0/24"
SG_NAME="${PREFIX}-sg"
SLS_PROJECT="${PREFIX}-sls"
APP_LOGSTORE="${PREFIX}-app"; SECURITY_LOGSTORE="${PREFIX}-security"
FC_API="${PREFIX}-api"; FC_TASK="${PREFIX}-evaluation-task"
TAGS='[{"Key":"project","Value":"visionqa"},{"Key":"environment","Value":"staging"},{"Key":"owner","Value":"dingchenhui"},{"Key":"managed-by","Value":"visionqa-operator"}]'

die(){ printf 'APPLY=FAIL reason=%s\n' "$1" >&2; exit 1; }
json(){ timeout 60s aliyun "$@" 2>/dev/null; }
one_or_zero(){ jq -e "$1 | length <= 1" >/dev/null; }

[[ "$REGION" == cn-beijing ]] || die "region"
[[ "$BUCKET" == visionqa-staging-*-cn-beijing ]] || die "bucket"

# Budget policy: only pay-as-you-go low-volume resources. No database order,
# internet gateway, model call, API key, prepaid plan or public ingress.

VPCS="$(json vpc DescribeVpcs --RegionId "$REGION" --VpcName "$VPC_NAME")" || die vpc_read
one_or_zero '[.Vpcs.Vpc[]?]' <<<"$VPCS" || die duplicate_vpc
if [[ "$(jq '[.Vpcs.Vpc[]?]|length' <<<"$VPCS")" == 0 ]]; then
  VPC="$(json vpc CreateVpc --RegionId "$REGION" --VpcName "$VPC_NAME" --CidrBlock "$VPC_CIDR" --ResourceGroupId "$VISIONQA_RESOURCE_GROUP_ID")" || die vpc_create
  VPC_ID="$(jq -er '.VpcId' <<<"$VPC")" || die vpc_create_json
  json vpc TagResources --RegionId "$REGION" --ResourceType VPC --ResourceId.1 "$VPC_ID" --Tag.1.Key project --Tag.1.Value visionqa --Tag.2.Key environment --Tag.2.Value staging --Tag.3.Key owner --Tag.3.Value dingchenhui --Tag.4.Key managed-by --Tag.4.Value visionqa-operator >/dev/null || die vpc_tag
else
  VPC_ID="$(jq -er '.Vpcs.Vpc[0] | select(.CidrBlock=="10.90.0.0/16") | .VpcId' <<<"$VPCS")" || die vpc_drift
fi

VSWS="$(json vpc DescribeVSwitches --RegionId "$REGION" --VSwitchName "$VSW_NAME")" || die vsw_read
one_or_zero '[.VSwitches.VSwitch[]?]' <<<"$VSWS" || die duplicate_vswitch
if [[ "$(jq '[.VSwitches.VSwitch[]?]|length' <<<"$VSWS")" == 0 ]]; then
  VSW="$(json vpc CreateVSwitch --RegionId "$REGION" --ZoneId "$VISIONQA_ZONE_ID" --VpcId "$VPC_ID" --VSwitchName "$VSW_NAME" --CidrBlock "$VSW_CIDR")" || die vsw_create
  VSW_ID="$(jq -er '.VSwitchId' <<<"$VSW")" || die vsw_create_json
else
  VSW_ID="$(jq -er --arg v "$VPC_ID" --arg z "$VISIONQA_ZONE_ID" '.VSwitches.VSwitch[0] | select(.VpcId==$v and .ZoneId==$z and .CidrBlock=="10.90.1.0/24") | .VSwitchId' <<<"$VSWS")" || die vsw_drift
fi

SGS="$(json ecs DescribeSecurityGroups --RegionId "$REGION" --SecurityGroupName "$SG_NAME")" || die sg_read
one_or_zero '[.SecurityGroups.SecurityGroup[]?]' <<<"$SGS" || die duplicate_sg
if [[ "$(jq '[.SecurityGroups.SecurityGroup[]?]|length' <<<"$SGS")" == 0 ]]; then
  SG="$(json ecs CreateSecurityGroup --RegionId "$REGION" --VpcId "$VPC_ID" --SecurityGroupName "$SG_NAME" --SecurityGroupType normal --ResourceGroupId "$VISIONQA_RESOURCE_GROUP_ID")" || die sg_create
  SG_ID="$(jq -er '.SecurityGroupId' <<<"$SG")" || die sg_create_json
  json ecs TagResources --RegionId "$REGION" --ResourceType securitygroup --ResourceId.1 "$SG_ID" --Tag.1.Key project --Tag.1.Value visionqa --Tag.2.Key environment --Tag.2.Value staging --Tag.3.Key owner --Tag.3.Value dingchenhui --Tag.4.Key managed-by --Tag.4.Value visionqa-operator >/dev/null || die sg_tag
else
  SG_ID="$(jq -er --arg v "$VPC_ID" '.SecurityGroups.SecurityGroup[0] | select(.VpcId==$v) | .SecurityGroupId' <<<"$SGS")" || die sg_drift
fi

# Do not add any ingress rule. Existing same-name SG must also have none.
ATTR="$(json ecs DescribeSecurityGroupAttribute --RegionId "$REGION" --SecurityGroupId "$SG_ID" --Direction ingress)" || die sg_attr
[[ "$(jq '[.Permissions.Permission[]?]|length' <<<"$ATTR")" == 0 ]] || die sg_ingress_drift

if ! timeout 20s aliyun oss stat "oss://${BUCKET}" >/dev/null 2>&1; then
  timeout 60s aliyun oss mb "oss://${BUCKET}" --region "$REGION" --acl private >/dev/null || die oss_create
fi
# Native OSS API operations: private ACL, BPA, SSE-OSS AES256, and exact 14/1 lifecycle.
json oss PutBucketAcl --BucketName "$BUCKET" --Acl private >/dev/null || die oss_private
json oss PutPublicAccessBlock --BucketName "$BUCKET" --BlockPublicAccess true >/dev/null || die oss_bpa
json oss PutBucketEncryption --BucketName "$BUCKET" --SSEAlgorithm AES256 >/dev/null || die oss_sse
LIFECYCLE='{"Rule":[{"ID":"visionqa-staging-14d","Prefix":"staging/visionqa/","Status":"Enabled","Expiration":{"Days":14},"AbortMultipartUpload":{"Days":1}}]}'
json oss PutBucketLifecycle --BucketName "$BUCKET" --LifecycleConfiguration "$LIFECYCLE" >/dev/null || die oss_lifecycle

if ! json log GetProject --projectName "$SLS_PROJECT" --region "$REGION" >/dev/null; then
  json log CreateProject --projectName "$SLS_PROJECT" --description "VisionQA staging only" --region "$REGION" >/dev/null || die sls_project
fi
for spec in "$APP_LOGSTORE:30" "$SECURITY_LOGSTORE:90"; do
  store="${spec%%:*}"; days="${spec##*:}"
  if ! json log GetLogStore --project "$SLS_PROJECT" --logstore "$store" --region "$REGION" >/dev/null; then
    json log CreateLogStore --project "$SLS_PROJECT" --logstore "$store" --ttl "$days" --shardCount 1 --autoSplit false --maxSplitShard 1 --region "$REGION" >/dev/null || die "sls_${store}"
  fi
done

# Fixture-only FC package. It contains no network or model client.
TMP="$(mktemp -d)"; trap 'rm -rf -- "$TMP"' EXIT
cat > "$TMP/index.mjs" <<'JS'
export async function handler(event) {
  const p = JSON.parse(event?.toString?.() || "{}").rawPath || "/";
  const body = p === "/healthz" ? {status:"ok",mode:"fixture"} :
               p === "/readyz" ? {ready:true,mode:"fixture",modelCalls:0} :
               {error:"fixture_only"};
  return {statusCode: p==="/healthz"||p==="/readyz" ? 200 : 404,
    headers:{"content-type":"application/json"},body:JSON.stringify(body)};
}
JS
(cd "$TMP" && zip -q fixture.zip index.mjs)
ZIP64="$(base64 -w0 "$TMP/fixture.zip")"

FC_LIST="$(json fc ListFunctions --region "$REGION" --limit 100 --fcVersion v3)" || die fc_read
create_fc(){
  local name="$1" timeout_s="$2"
  local count
  count="$(jq --arg n "$name" '[((.functions // .Functions // [])[]) | select((.functionName // .FunctionName)==$n)]|length' <<<"$FC_LIST")"
  (( count <= 1 )) || die "duplicate_fc_${name}"
  if (( count == 0 )); then
    body="$(jq -nc --arg n "$name" --arg r "$VISIONQA_FC_ROLE_ARN" --arg z "$ZIP64" --argjson t "$timeout_s" \
      '{functionName:$n,description:"VisionQA staging fixture only",runtime:"nodejs20",handler:"index.handler",timeout:$t,memorySize:1024,diskSize:512,instanceConcurrency:1,role:$r,environmentVariables:{VISIONQA_RUNTIME_MODE:"fixture",LIVE_PROVIDER_ENABLED:"false"},code:{zipFile:$z}}')"
    json fc CreateFunction --region "$REGION" --fcVersion v3 --body "$body" >/dev/null || die "fc_create_${name}"
  else
    body="$(json fc GetFunction --region "$REGION" --functionName "$name" --fcVersion v3)" || die "fc_get_${name}"
    [[ "$(jq -r '.environmentVariables.VISIONQA_RUNTIME_MODE // .EnvironmentVariables.VISIONQA_RUNTIME_MODE' <<<"$body")" == fixture ]] || die "fc_mode_drift_${name}"
  fi
  json fc PutConcurrencyConfig --region "$REGION" --functionName "$name" --fcVersion v3 --body '{"reservedConcurrency":0}' >/dev/null || die "fc_concurrency_${name}"
}
create_fc "$FC_API" 30
create_fc "$FC_TASK" 120

printf 'APPLY=PASS region=%s mode=fixture\n' "$REGION"
printf 'FORBIDDEN=PASS rds_order=0 nat=0 eip=0 model_calls=0 access_key=0\n'
