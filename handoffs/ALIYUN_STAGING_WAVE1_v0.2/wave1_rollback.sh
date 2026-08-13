#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${VISIONQA_CONFIRM_ROLLBACK:-}" == DELETE_WAVE1_STAGING_V0_2 ]] || { echo 'ROLLBACK=REFUSED' >&2; exit 2; }
STATE_DIR=.visionqa-wave1-v0.2
[[ -f "$STATE_DIR/context.env" && -f "$STATE_DIR/resource-ids.env" && -f "$STATE_DIR/ledger.jsonl" ]] || { echo 'ROLLBACK=FAIL reason=missing_state' >&2; exit 1; }
# shellcheck disable=SC1090
source "$STATE_DIR/context.env"; source "$STATE_DIR/resource-ids.env"
LEDGER="$STATE_DIR/ledger.jsonl"
[[ "$REGION" == cn-beijing && "$BUCKET" == visionqa-staging-oss-??????-cn-beijing ]] || exit 1
api(){ timeout 60s aliyun "$@" 2>/dev/null; }
created(){ jq -se --arg k "$1" 'any(.[]; .phase=="apply" and .kind==$k and .result=="CREATED")' "$LEDGER" >/dev/null; }
tags_ok(){ jq -e '[..|objects|select(has("Key") and has("Value"))|select(.Key=="project" and .Value=="visionqa"),..|objects|select(has("Key") and has("Value"))|select(.Key=="environment" and .Value=="staging"),..|objects|select(has("Key") and has("Value"))|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==3' >/dev/null; }
record(){ jq -nc --arg ts "$(date -u +%FT%TZ)" --arg phase rollback --arg action "$1" --arg result "$2" '{timestamp:$ts,phase:$phase,action:$action,result:$result}' >>"$LEDGER"; }

for fn in visionqa-staging-api visionqa-staging-evaluation-task; do
  if created "fc_function_$fn"; then
    T="$(api fc ListTaggedResources --region "$REGION" --resourceType function --resourceId "$fn" --fcVersion v3)"; tags_ok <<<"$T" || { echo "ROLLBACK=STOP reason=fc_ownership_$fn" >&2; exit 1; }
    api fc DeleteProvisionConfig --region "$REGION" --functionName "$fn" --qualifier LATEST --fcVersion v3 >/dev/null
    api fc DeleteConcurrencyConfig --region "$REGION" --functionName "$fn" --fcVersion v3 >/dev/null
    api fc DeleteFunction --region "$REGION" --functionName "$fn" --fcVersion v3 >/dev/null
    record "delete_$fn" PASS
  fi
done

if created sls_project; then
  T="$(api log ListTagResources --resourceType project --resourceId visionqa-staging-sls --region "$REGION")"; tags_ok <<<"$T" || { echo 'ROLLBACK=STOP reason=sls_ownership' >&2; exit 1; }
  for s in visionqa-staging-app visionqa-staging-security; do api log DeleteLogStore --project visionqa-staging-sls --logstore "$s" --region "$REGION" >/dev/null; record "delete_$s" PASS; done
  api log DeleteProject --projectName visionqa-staging-sls --region "$REGION" >/dev/null; record delete_sls_project PASS
else
  T="$(api log ListTagResources --resourceType project --resourceId visionqa-staging-sls --region "$REGION")"; tags_ok <<<"$T" || { echo 'ROLLBACK=STOP reason=sls_ownership' >&2; exit 1; }
  for s in visionqa-staging-app visionqa-staging-security; do
    if created "logstore_$s"; then api log DeleteLogStore --project visionqa-staging-sls --logstore "$s" --region "$REGION" >/dev/null; record "delete_$s" PASS; fi
  done
fi

if created oss_bucket; then
  T="$(api oss GetBucketTagging --BucketName "$BUCKET")"; tags_ok <<<"$T" || { echo 'ROLLBACK=STOP reason=oss_ownership' >&2; exit 1; }
  [[ -z "$(api oss ListObjects --BucketName "$BUCKET" --Prefix staging/visionqa/ | jq -r '.Contents[]?.Key // empty')" ]] || { echo 'ROLLBACK=STOP reason=bucket_not_empty' >&2; exit 1; }
  [[ -z "$(api oss ListMultipartUploads --BucketName "$BUCKET" | jq -r '.Upload[]?.Key // empty')" ]] || { echo 'ROLLBACK=STOP reason=multipart_exists' >&2; exit 1; }
  api oss DeleteBucket --BucketName "$BUCKET" >/dev/null; record delete_oss_bucket PASS
fi

if created security_group; then
  T="$(api ecs ListTagResources --RegionId "$REGION" --ResourceType securitygroup --ResourceId.1 "$SG_ID")"; tags_ok <<<"$T" || { echo 'ROLLBACK=STOP reason=sg_ownership' >&2; exit 1; }
  api ecs DeleteSecurityGroup --RegionId "$REGION" --SecurityGroupId "$SG_ID" >/dev/null; record delete_sg PASS
fi
if created vswitch; then
  T="$(api vpc ListTagResources --RegionId "$REGION" --ResourceType VSWITCH --ResourceId.1 "$VSW_ID")"; tags_ok <<<"$T" || { echo 'ROLLBACK=STOP reason=vsw_ownership' >&2; exit 1; }
  api vpc DeleteVSwitch --RegionId "$REGION" --VSwitchId "$VSW_ID" >/dev/null; record delete_vswitch PASS
fi
if created vpc; then
  T="$(api vpc ListTagResources --RegionId "$REGION" --ResourceType VPC --ResourceId.1 "$VPC_ID")"; tags_ok <<<"$T" || { echo 'ROLLBACK=STOP reason=vpc_ownership' >&2; exit 1; }
  api vpc DeleteVpc --RegionId "$REGION" --VpcId "$VPC_ID" >/dev/null; record delete_vpc PASS
fi
echo "ROLLBACK=PASS ledger=$LEDGER"
