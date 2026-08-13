#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${VISIONQA_CONFIRM_ROLLBACK:-}" == DELETE_WAVE1_STAGING_V0_8 ]] || { echo 'ROLLBACK=REFUSED' >&2; exit 2; }
STATE_DIR=.visionqa-wave1-v0.8
[[ -f "$STATE_DIR/context.env" && -f "$STATE_DIR/ledger.jsonl" ]] || { echo 'ROLLBACK=FAIL reason=missing_state' >&2; exit 1; }
# shellcheck disable=SC1090
source "$STATE_DIR/context.env"
LEDGER="$STATE_DIR/ledger.jsonl"
RUN_FILE="$STATE_DIR/active-run"
# shellcheck disable=SC1091
source "$(dirname "$0")/wave1_state_commit.sh"
if [[ -f "$RUN_FILE" ]]; then
  [[ "$(<"$RUN_FILE")" == "$RUN_ID" ]] || { echo 'ROLLBACK=FAIL reason=active_run_mismatch' >&2; exit 1; }
else
  visionqa_has_terminal ROLLBACK_COMMITTING || { echo 'ROLLBACK=FAIL reason=no_active_or_committing' >&2; exit 1; }
fi
ROLLBACK_OK=0
rollback_exit(){
  rc=$?
  if (( rc != 0 && ROLLBACK_OK == 0 )); then
    set +e
    fail_line="$(jq -nc --arg ts "$(date -u +%FT%TZ)" --arg batch "$BATCH_ID" --arg run "$RUN_ID" --arg rc "$rc" '{timestamp:$ts,batch_id:$batch,run_id:$run,phase:"rollback",action:"ROLLBACK_FAILED",result:("FAIL_RC_"+$rc)}')"
    visionqa_durable_append "$LEDGER" "$fail_line"
    set -e
  fi
  exit "$rc"
}
trap rollback_exit EXIT
if [[ ! -f "$RUN_FILE" ]] && visionqa_has_terminal ROLLBACK_COMMITTING; then
  visionqa_commit_rollback
  ROLLBACK_OK=1
  trap - EXIT
  echo "ROLLBACK=PASS recovered_committing=true ledger=$LEDGER"
  exit 0
fi
MANIFEST="$STATE_DIR/run-$RUN_ID.json"
[[ -f "$MANIFEST" ]] || { echo 'ROLLBACK=FAIL reason=manifest_missing' >&2; exit 1; }
[[ "$REGION" == cn-beijing && "$BUCKET" == visionqa-staging-oss-??????-cn-beijing ]] || exit 1
api(){ timeout 60s aliyun "$@" 2>/dev/null; }
MANIFEST_SHA="$(sha256sum "$MANIFEST"|cut -d' ' -f1)"
LEDGER_MANIFEST_SHA="$(jq -sr --arg r "$RUN_ID" '[.[]|select(.run_id==$r and .action=="MANIFEST_CHECKPOINT")]|last|.manifest_sha256 // empty' "$LEDGER")"
[[ -n "$LEDGER_MANIFEST_SHA" && "$MANIFEST_SHA" == "$LEDGER_MANIFEST_SHA" ]] || { echo 'ROLLBACK=FAIL reason=manifest_ledger_sha_mismatch' >&2; exit 1; }
[[ "$(jq -r '.run_id' "$MANIFEST")" == "$RUN_ID" && "$(jq -r '.batch_id' "$MANIFEST")" == "$BATCH_ID" && "$(jq -r '.region' "$MANIFEST")" == "$REGION" && "$(jq -r '.resource_group_id' "$MANIFEST")" == "$VISIONQA_RESOURCE_GROUP_ID" ]] || { echo 'ROLLBACK=FAIL reason=manifest_identity' >&2; exit 1; }
created(){ local k="$1" id="$2" h; h="$(printf '%s' "$id"|sha256sum|cut -d' ' -f1)"; jq -se --arg run "$RUN_ID" --arg batch "$BATCH_ID" --arg k "$k" --arg h "$h" 'any(.[]; .run_id==$run and .batch_id==$batch and .phase=="apply" and .kind==$k and .id_sha256==$h and .result=="CREATED")' "$LEDGER" >/dev/null; }
resource_id(){ jq -er --arg k "$1" --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '.resources[$k] | select(.created_by_run==true and .region=="cn-beijing" and .resource_group_id==$rg) | .id' "$MANIFEST"; }
tags_ok(){ jq -e '[..|objects|select(has("Key") and has("Value"))|select(.Key=="project" and .Value=="visionqa"),..|objects|select(has("Key") and has("Value"))|select(.Key=="environment" and .Value=="staging"),..|objects|select(has("Key") and has("Value"))|select(.Key=="owner" and .Value=="dingchenhui"),..|objects|select(has("Key") and has("Value"))|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==4' >/dev/null; }
record(){ jq -nc --arg ts "$(date -u +%FT%TZ)" --arg batch "$BATCH_ID" --arg run "$RUN_ID" --arg phase rollback --arg action "$1" --arg result "$2" '{timestamp:$ts,batch_id:$batch,run_id:$run,phase:$phase,action:$action,result:$result}' >>"$LEDGER"; }

for fn in visionqa-staging-api visionqa-staging-evaluation-task; do
  if id="$(resource_id "fc_function_$fn" 2>/dev/null)" && created "fc_function_$fn" "$id"; then
    [[ "$id" == "$fn" ]] || { echo "ROLLBACK=STOP reason=fc_name_$fn" >&2; exit 1; }
    F="$(api fc GetFunction --region "$REGION" --functionName "$fn" --fcVersion v3)"; jq -e --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '(.resourceGroupId // .ResourceGroupId)==$rg and .environmentVariables.VISIONQA_RUNTIME_MODE=="fixture" and .environmentVariables.LIVE_PROVIDER_ENABLED=="false"' <<<"$F" >/dev/null || { echo "ROLLBACK=STOP reason=fc_config_$fn" >&2; exit 1; }
    T="$(api fc ListTaggedResources --region "$REGION" --resourceType function --resourceId "$fn" --fcVersion v3)"; tags_ok <<<"$T" || { echo "ROLLBACK=STOP reason=fc_ownership_$fn" >&2; exit 1; }
    api fc DeleteProvisionConfig --region "$REGION" --functionName "$fn" --qualifier LATEST --fcVersion v3 >/dev/null
    api fc DeleteConcurrencyConfig --region "$REGION" --functionName "$fn" --fcVersion v3 >/dev/null
    api fc DeleteFunction --region "$REGION" --functionName "$fn" --fcVersion v3 >/dev/null
    record "delete_$fn" PASS
  fi
done

if sls_id="$(resource_id sls_project 2>/dev/null)" && created sls_project "$sls_id"; then
  [[ "$sls_id" == visionqa-staging-sls ]] || { echo 'ROLLBACK=STOP reason=sls_name' >&2; exit 1; }
  PJ="$(api log GetProject --projectName visionqa-staging-sls --region "$REGION")"; [[ "$(jq -r '.resourceGroupId // .ResourceGroupId // empty' <<<"$PJ")" == "$VISIONQA_RESOURCE_GROUP_ID" ]] || { echo 'ROLLBACK=STOP reason=sls_config' >&2; exit 1; }
  T="$(api log ListTagResources --resourceType project --resourceId visionqa-staging-sls --region "$REGION")"; tags_ok <<<"$T" || { echo 'ROLLBACK=STOP reason=sls_ownership' >&2; exit 1; }
  for s in visionqa-staging-app visionqa-staging-security; do api log DeleteLogStore --project visionqa-staging-sls --logstore "$s" --region "$REGION" >/dev/null; record "delete_$s" PASS; done
  api log DeleteProject --projectName visionqa-staging-sls --region "$REGION" >/dev/null; record delete_sls_project PASS
else
  T="$(api log ListTagResources --resourceType project --resourceId visionqa-staging-sls --region "$REGION")"; tags_ok <<<"$T" || { echo 'ROLLBACK=STOP reason=sls_ownership' >&2; exit 1; }
  for s in visionqa-staging-app visionqa-staging-security; do
    if lid="$(resource_id "logstore_$s" 2>/dev/null)" && created "logstore_$s" "$lid"; then [[ "$lid" == "$s" ]] || exit 1; api log DeleteLogStore --project visionqa-staging-sls --logstore "$s" --region "$REGION" >/dev/null; record "delete_$s" PASS; fi
  done
fi

if oss_id="$(resource_id oss_bucket 2>/dev/null)" && created oss_bucket "$oss_id"; then
  [[ "$oss_id" == "$BUCKET" ]] || { echo 'ROLLBACK=STOP reason=oss_name' >&2; exit 1; }
  OI="$(api oss GetBucketInfo --BucketName "$BUCKET")"; [[ "$(jq -r '.BucketInfo.Bucket.Location // .Location' <<<"$OI")" == oss-cn-beijing && "$(jq -r '.BucketInfo.Bucket.ResourceGroupId // .ResourceGroupId // empty' <<<"$OI")" == "$VISIONQA_RESOURCE_GROUP_ID" ]] || { echo 'ROLLBACK=STOP reason=oss_config' >&2; exit 1; }
  OA="$(api oss GetBucketAcl --BucketName "$BUCKET")"; [[ "$(jq -r '.AccessControlList.Grant // .Acl' <<<"$OA")" == private ]] || { echo 'ROLLBACK=STOP reason=oss_acl' >&2; exit 1; }
  T="$(api oss GetBucketTagging --BucketName "$BUCKET")"; tags_ok <<<"$T" || { echo 'ROLLBACK=STOP reason=oss_ownership' >&2; exit 1; }
  [[ -z "$(api oss ListObjects --BucketName "$BUCKET" --Prefix staging/visionqa/ | jq -r '.Contents[]?.Key // empty')" ]] || { echo 'ROLLBACK=STOP reason=bucket_not_empty' >&2; exit 1; }
  [[ -z "$(api oss ListMultipartUploads --BucketName "$BUCKET" | jq -r '.Upload[]?.Key // empty')" ]] || { echo 'ROLLBACK=STOP reason=multipart_exists' >&2; exit 1; }
  api oss DeleteBucket --BucketName "$BUCKET" >/dev/null; record delete_oss_bucket PASS
fi

if SG_ID="$(resource_id security_group 2>/dev/null)" && created security_group "$SG_ID"; then
  S="$(api ecs DescribeSecurityGroups --RegionId "$REGION" --SecurityGroupId "$SG_ID")"; jq -e --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '.SecurityGroups.SecurityGroup[0]|.SecurityGroupName=="visionqa-staging-sg" and .ResourceGroupId==$rg' <<<"$S" >/dev/null || { echo 'ROLLBACK=STOP reason=sg_config' >&2; exit 1; }
  T="$(api ecs ListTagResources --RegionId "$REGION" --ResourceType securitygroup --ResourceId.1 "$SG_ID")"; tags_ok <<<"$T" || { echo 'ROLLBACK=STOP reason=sg_ownership' >&2; exit 1; }
  api ecs DeleteSecurityGroup --RegionId "$REGION" --SecurityGroupId "$SG_ID" >/dev/null; record delete_sg PASS
fi
if VSW_ID="$(resource_id vswitch 2>/dev/null)" && created vswitch "$VSW_ID"; then
  W="$(api vpc DescribeVSwitchAttributes --RegionId "$REGION" --VSwitchId "$VSW_ID")"; jq -e --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '.VSwitchName=="visionqa-staging-vsw-a" and .CidrBlock=="10.90.1.0/24" and .ResourceGroupId==$rg' <<<"$W" >/dev/null || { echo 'ROLLBACK=STOP reason=vsw_config' >&2; exit 1; }
  T="$(api vpc ListTagResources --RegionId "$REGION" --ResourceType VSWITCH --ResourceId.1 "$VSW_ID")"; tags_ok <<<"$T" || { echo 'ROLLBACK=STOP reason=vsw_ownership' >&2; exit 1; }
  api vpc DeleteVSwitch --RegionId "$REGION" --VSwitchId "$VSW_ID" >/dev/null; record delete_vswitch PASS
fi
if VPC_ID="$(resource_id vpc 2>/dev/null)" && created vpc "$VPC_ID"; then
  V="$(api vpc DescribeVpcAttribute --RegionId "$REGION" --VpcId "$VPC_ID")"; jq -e --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '.VpcName=="visionqa-staging-vpc" and .CidrBlock=="10.90.0.0/16" and .ResourceGroupId==$rg' <<<"$V" >/dev/null || { echo 'ROLLBACK=STOP reason=vpc_config' >&2; exit 1; }
  T="$(api vpc ListTagResources --RegionId "$REGION" --ResourceType VPC --ResourceId.1 "$VPC_ID")"; tags_ok <<<"$T" || { echo 'ROLLBACK=STOP reason=vpc_ownership' >&2; exit 1; }
  api vpc DeleteVpc --RegionId "$REGION" --VpcId "$VPC_ID" >/dev/null; record delete_vpc PASS
fi
visionqa_commit_rollback
ROLLBACK_OK=1
trap - EXIT
echo "ROLLBACK=PASS ledger=$LEDGER"
