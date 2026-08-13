#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
STATE_DIR=.visionqa-wave1-v0.2
ENV_FILE="$STATE_DIR/context.env"; LEDGER="$STATE_DIR/ledger.jsonl"
[[ -f "$ENV_FILE" && -f "$LEDGER" ]] || { echo 'APPLY=FAIL reason=run_preflight_first' >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
ROLE_ARN="$(<"$VISIONQA_FC_ROLE_ARN_FILE")"
TAGS='[{"Key":"project","Value":"visionqa"},{"Key":"environment","Value":"staging"},{"Key":"owner","Value":"dingchenhui"},{"Key":"managed-by","Value":"visionqa-operator"}]'
die(){ printf 'APPLY=FAIL reason=%s\n' "$1" >&2; exit 1; }
api(){ timeout 60s aliyun "$@" 2>/dev/null; }
probe(){
  local out rc
  set +e; out="$(timeout 30s aliyun "$@" 2>&1)"; rc=$?; set -e
  if (( rc != 0 )); then printf '%s' "$out" | grep -Eqi 'NotFound|not found|404' && return 44; return "$rc"; fi
  printf '%s' "$out"
}
record(){ jq -nc --arg ts "$(date -u +%FT%TZ)" --arg phase apply --arg action "$1" --arg kind "$2" --arg idhash "${3:-}" --arg result "$4" '{timestamp:$ts,phase:$phase,action:$action,kind:$kind,id_sha256:$idhash,result:$result}' >>"$LEDGER"; }
idhash(){ printf '%s' "$1" | sha256sum | cut -d' ' -f1; }
onerr(){ local rc=$?; record interrupted unknown "" "FAIL_RC_$rc"; echo "APPLY=FAIL reason=partial_failure ledger=$LEDGER" >&2; exit "$rc"; }
trap onerr ERR

[[ "$REGION" == cn-beijing ]] || die region
[[ "${VISIONQA_MONTHLY_BUDGET_CNY:-300}" == 300 ]] || die budget
[[ "${VISIONQA_BUDGET_ALERTS_CNY:-150,240,300}" == 150,240,300 ]] || die budget_alerts
[[ "$BUCKET" == visionqa-staging-oss-??????-cn-beijing ]] || die bucket_name

VPCS="$(api vpc DescribeVpcs --RegionId "$REGION" --VpcName visionqa-staging-vpc)"
if [[ "$(jq '[.Vpcs.Vpc[]?]|length' <<<"$VPCS")" == 0 ]]; then
  O="$(api vpc CreateVpc --RegionId "$REGION" --VpcName visionqa-staging-vpc --CidrBlock 10.90.0.0/16 --ResourceGroupId "$VISIONQA_RESOURCE_GROUP_ID")"
  VPC_ID="$(jq -er '.VpcId' <<<"$O")"; record create vpc "$(idhash "$VPC_ID")" CREATED
  api vpc TagResources --RegionId "$REGION" --ResourceType VPC --ResourceId.1 "$VPC_ID" --Tag.1.Key project --Tag.1.Value visionqa --Tag.2.Key environment --Tag.2.Value staging --Tag.3.Key owner --Tag.3.Value dingchenhui --Tag.4.Key managed-by --Tag.4.Value visionqa-operator >/dev/null
else VPC_ID="$(jq -er '.Vpcs.Vpc[0]|select(.CidrBlock=="10.90.0.0/16")|.VpcId' <<<"$VPCS")"; record reuse vpc "$(idhash "$VPC_ID")" EXISTING; fi

VSWS="$(api vpc DescribeVSwitches --RegionId "$REGION" --VSwitchName visionqa-staging-vsw-a)"
if [[ "$(jq '[.VSwitches.VSwitch[]?]|length' <<<"$VSWS")" == 0 ]]; then
  O="$(api vpc CreateVSwitch --RegionId "$REGION" --ZoneId "$VISIONQA_ZONE_ID" --VpcId "$VPC_ID" --VSwitchName visionqa-staging-vsw-a --CidrBlock 10.90.1.0/24 --ResourceGroupId "$VISIONQA_RESOURCE_GROUP_ID")"
  VSW_ID="$(jq -er '.VSwitchId' <<<"$O")"; record create vswitch "$(idhash "$VSW_ID")" CREATED
  api vpc TagResources --RegionId "$REGION" --ResourceType VSWITCH --ResourceId.1 "$VSW_ID" --Tag.1.Key project --Tag.1.Value visionqa --Tag.2.Key environment --Tag.2.Value staging --Tag.3.Key owner --Tag.3.Value dingchenhui --Tag.4.Key managed-by --Tag.4.Value visionqa-operator >/dev/null
else VSW_ID="$(jq -er --arg v "$VPC_ID" --arg z "$VISIONQA_ZONE_ID" '.VSwitches.VSwitch[0]|select(.VpcId==$v and .ZoneId==$z and .CidrBlock=="10.90.1.0/24")|.VSwitchId' <<<"$VSWS")"; record reuse vswitch "$(idhash "$VSW_ID")" EXISTING; fi

SGS="$(api ecs DescribeSecurityGroups --RegionId "$REGION" --SecurityGroupName visionqa-staging-sg)"
if [[ "$(jq '[.SecurityGroups.SecurityGroup[]?]|length' <<<"$SGS")" == 0 ]]; then
  O="$(api ecs CreateSecurityGroup --RegionId "$REGION" --VpcId "$VPC_ID" --SecurityGroupName visionqa-staging-sg --SecurityGroupType normal --ResourceGroupId "$VISIONQA_RESOURCE_GROUP_ID")"
  SG_ID="$(jq -er '.SecurityGroupId' <<<"$O")"; record create security_group "$(idhash "$SG_ID")" CREATED
  api ecs TagResources --RegionId "$REGION" --ResourceType securitygroup --ResourceId.1 "$SG_ID" --Tag.1.Key project --Tag.1.Value visionqa --Tag.2.Key environment --Tag.2.Value staging --Tag.3.Key owner --Tag.3.Value dingchenhui --Tag.4.Key managed-by --Tag.4.Value visionqa-operator >/dev/null
else SG_ID="$(jq -er --arg v "$VPC_ID" '.SecurityGroups.SecurityGroup[0]|select(.VpcId==$v)|.SecurityGroupId' <<<"$SGS")"; record reuse security_group "$(idhash "$SG_ID")" EXISTING; fi
ATTR="$(api ecs DescribeSecurityGroupAttribute --RegionId "$REGION" --SecurityGroupId "$SG_ID" --Direction ingress)"
[[ "$(jq '[.Permissions.Permission[]?]|length' <<<"$ATTR")" == 0 ]] || die sg_ingress_drift
cat >"$STATE_DIR/resource-ids.env" <<EOF
VPC_ID=$VPC_ID
VSW_ID=$VSW_ID
SG_ID=$SG_ID
EOF
chmod 600 "$STATE_DIR/resource-ids.env"

set +e; probe oss GetBucketInfo --BucketName "$BUCKET" >/dev/null; BRC=$?; set -e
(( BRC == 0 || BRC == 44 )) || die oss_probe_unknown
if (( BRC == 44 )); then
  api oss PutBucket --BucketName "$BUCKET" --ResourceGroupId "$VISIONQA_RESOURCE_GROUP_ID" --CreateBucketConfiguration '{"StorageClass":"Standard","DataRedundancyType":"LRS"}' >/dev/null
  record create oss_bucket "$(idhash "$BUCKET")" CREATED
else record reuse oss_bucket "$(idhash "$BUCKET")" EXISTING; fi
# ACL mutation is intentionally absent: a new bucket defaults to private.
api oss PutBucketPublicAccessBlock --BucketName "$BUCKET" --PublicAccessBlockConfiguration '{"BlockPublicAccess":true}' >/dev/null
api oss PutBucketEncryption --BucketName "$BUCKET" --ServerSideEncryptionRule '{"SSEAlgorithm":"AES256"}' >/dev/null
api oss PutBucketLifecycle --BucketName "$BUCKET" --LifecycleConfiguration '{"Rule":[{"ID":"visionqa-staging-14d","Prefix":"staging/visionqa/","Status":"Enabled","Expiration":{"Days":14},"AbortMultipartUpload":{"Days":1}}]}' >/dev/null
api oss PutBucketTagging --BucketName "$BUCKET" --Tagging "{\"TagSet\":{\"Tag\":$TAGS}}" >/dev/null
record configure oss_security "$(idhash "$BUCKET")" PASS

set +e; probe log GetProject --projectName visionqa-staging-sls --region "$REGION" >/dev/null; PRC=$?; set -e
(( PRC == 0 || PRC == 44 )) || die sls_project_probe_unknown
if (( PRC == 44 )); then
  api log CreateProject --projectName visionqa-staging-sls --description 'VisionQA staging only' --resourceGroupId "$VISIONQA_RESOURCE_GROUP_ID" --region "$REGION" >/dev/null
  record create sls_project "$(idhash visionqa-staging-sls)" CREATED
else record reuse sls_project "$(idhash visionqa-staging-sls)" EXISTING; fi
for spec in visionqa-staging-app:30 visionqa-staging-security:90; do
  store="${spec%%:*}"; days="${spec##*:}"
  set +e; probe log GetLogStore --project visionqa-staging-sls --logstore "$store" --region "$REGION" >/dev/null; LRC=$?; set -e
  (( LRC == 0 || LRC == 44 )) || die "sls_logstore_probe_unknown_$store"
  if (( LRC == 44 )); then api log CreateLogStore --project visionqa-staging-sls --logstore "$store" --ttl "$days" --shardCount 1 --autoSplit false --maxSplitShard 1 --region "$REGION" >/dev/null; record create "logstore_$store" "$(idhash "$store")" CREATED
  else L="$(api log GetLogStore --project visionqa-staging-sls --logstore "$store" --region "$REGION")"; [[ "$(jq -r '.ttl // .TTL' <<<"$L")" == "$days" ]] || die "sls_ttl_drift_$store"; record reuse "logstore_$store" "$(idhash "$store")" EXISTING; fi
done
api log TagResources --resourceType project --resourceId visionqa-staging-sls --tags "$TAGS" --region "$REGION" >/dev/null

TMP="$(mktemp -d)"; trap 'rm -rf -- "$TMP"' EXIT
cat >"$TMP/index.mjs" <<'JS'
export async function handler(event){const p=JSON.parse(event?.toString?.()||"{}").rawPath||"/";const ok=p==="/healthz"||p==="/readyz";return {statusCode:ok?200:404,headers:{"content-type":"application/json"},body:JSON.stringify(ok?{status:"ok",mode:"fixture",modelCalls:0}:{error:"fixture_only"})};}
JS
(cd "$TMP" && zip -q fixture.zip index.mjs)
CODE_SHA="$(sha256sum "$TMP/fixture.zip"|cut -d' ' -f1)"; ZIP64="$(base64 -w0 "$TMP/fixture.zip")"
FNS="$(api fc ListFunctions --region "$REGION" --limit 100 --fcVersion v3)"
create_fc(){
  local name="$1" timeout_s="$2" count body F
  count="$(jq --arg n "$name" '[((.functions // .Functions // [])[])|select((.functionName // .FunctionName)==$n)]|length' <<<"$FNS")"
  (( count <= 1 )) || die "duplicate_fc_$name"
  if (( count == 0 )); then
    body="$(jq -nc --arg n "$name" --arg r "$ROLE_ARN" --arg z "$ZIP64" --arg rg "$VISIONQA_RESOURCE_GROUP_ID" --argjson t "$timeout_s" --argjson tags "$TAGS" '{functionName:$n,description:"VisionQA staging fixture only",runtime:"nodejs20",handler:"index.handler",timeout:$t,memorySize:1024,diskSize:512,instanceConcurrency:1,role:$r,resourceGroupId:$rg,tags:$tags,environmentVariables:{VISIONQA_RUNTIME_MODE:"fixture",LIVE_PROVIDER_ENABLED:"false"},code:{zipFile:$z}}')"
    api fc CreateFunction --region "$REGION" --fcVersion v3 --body "$body" >/dev/null
    record create "fc_function_$name" "$(idhash "$name")" CREATED
  else
    F="$(api fc GetFunction --region "$REGION" --functionName "$name" --fcVersion v3)"
    jq -e --arg r "$ROLE_ARN" --argjson t "$timeout_s" '(.runtime=="nodejs20") and (.handler=="index.handler") and (.memorySize==1024) and (.diskSize==512) and (.timeout==$t) and (.instanceConcurrency==1) and (.role==$r) and (.environmentVariables.VISIONQA_RUNTIME_MODE=="fixture") and (.environmentVariables.LIVE_PROVIDER_ENABLED=="false")' <<<"$F" >/dev/null || die "fc_drift_$name"
    record reuse "fc_function_$name" "$(idhash "$name")" EXISTING
  fi
  api fc PutConcurrencyConfig --region "$REGION" --functionName "$name" --fcVersion v3 --body '{"reservedConcurrency":1}' >/dev/null
  api fc PutProvisionConfig --region "$REGION" --functionName "$name" --qualifier LATEST --fcVersion v3 --body '{"target":0}' >/dev/null
  api fc TagResources --region "$REGION" --resourceType function --resourceId "$name" --tags "$TAGS" --fcVersion v3 >/dev/null
  record configure fc_limits "$(idhash "$name")" PASS
}
create_fc visionqa-staging-api 30
create_fc visionqa-staging-evaluation-task 120
printf '%s\n' "$CODE_SHA" >"$STATE_DIR/fixture-code.sha256"; chmod 600 "$STATE_DIR/fixture-code.sha256"
trap - ERR
echo "APPLY=PASS ledger=$LEDGER"
echo 'FORBIDDEN=PASS orders=0 internet_egress=0 model_calls=0 access_keys=0'
