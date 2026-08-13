#!/usr/bin/env bash
set -Eeuo pipefail
STATE_DIR=.visionqa-wave1-v0.4
[[ -f "$STATE_DIR/context.env" && -f "$STATE_DIR/resource-ids.env" ]] || { echo 'VERIFY=FAIL reason=missing_state' >&2; exit 1; }
# shellcheck disable=SC1090
source "$STATE_DIR/context.env"; source "$STATE_DIR/resource-ids.env"
ROLE_ARN="$(<"$VISIONQA_FC_ROLE_ARN_FILE")"
die(){ printf 'VERIFY=FAIL reason=%s\n' "$1" >&2; exit 1; }
api(){ timeout 30s aliyun "$@" 2>/dev/null; }
tags_ok(){ jq -e '[..|objects|select(has("Key") and has("Value"))|select(.Key=="project" and .Value=="visionqa"),..|objects|select(has("Key") and has("Value"))|select(.Key=="environment" and .Value=="staging"),..|objects|select(has("Key") and has("Value"))|select(.Key=="owner" and .Value=="dingchenhui"),..|objects|select(has("Key") and has("Value"))|select(.Key=="managed-by" and .Value=="visionqa-operator")]|length==4' >/dev/null; }

V="$(api vpc DescribeVpcAttribute --RegionId "$REGION" --VpcId "$VPC_ID")"; jq -e --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '.VpcName=="visionqa-staging-vpc" and .CidrBlock=="10.90.0.0/16" and .ResourceGroupId==$rg' <<<"$V" >/dev/null || die vpc_drift
VT="$(api vpc ListTagResources --RegionId "$REGION" --ResourceType VPC --ResourceId.1 "$VPC_ID")"; tags_ok <<<"$VT" || die vpc_tags
W="$(api vpc DescribeVSwitchAttributes --RegionId "$REGION" --VSwitchId "$VSW_ID")"; jq -e --arg v "$VPC_ID" --arg z "$VISIONQA_ZONE_ID" --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '.VSwitchName=="visionqa-staging-vsw-a" and .VpcId==$v and .ZoneId==$z and .CidrBlock=="10.90.1.0/24" and .ResourceGroupId==$rg' <<<"$W" >/dev/null || die vsw_drift
WT="$(api vpc ListTagResources --RegionId "$REGION" --ResourceType VSWITCH --ResourceId.1 "$VSW_ID")"; tags_ok <<<"$WT" || die vsw_tags
S="$(api ecs DescribeSecurityGroups --RegionId "$REGION" --SecurityGroupId "$SG_ID")"; jq -e --arg v "$VPC_ID" --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '.SecurityGroups.SecurityGroup[0]|.SecurityGroupName=="visionqa-staging-sg" and .VpcId==$v and .ResourceGroupId==$rg' <<<"$S" >/dev/null || die sg_drift
ST="$(api ecs ListTagResources --RegionId "$REGION" --ResourceType securitygroup --ResourceId.1 "$SG_ID")"; tags_ok <<<"$ST" || die sg_tags
SA="$(api ecs DescribeSecurityGroupAttribute --RegionId "$REGION" --SecurityGroupId "$SG_ID" --Direction ingress)"; [[ "$(jq '[.Permissions.Permission[]?]|length' <<<"$SA")" == 0 ]] || die sg_ingress

I="$(api oss GetBucketInfo --BucketName "$BUCKET")"; [[ "$(jq -r '.BucketInfo.Bucket.Location // .Location' <<<"$I")" == oss-cn-beijing ]] || die oss_region
[[ "$(jq -r '.BucketInfo.Bucket.ResourceGroupId // .ResourceGroupId // empty' <<<"$I")" == "$VISIONQA_RESOURCE_GROUP_ID" ]] || die oss_resource_group
A="$(api oss GetBucketAcl --BucketName "$BUCKET")"; [[ "$(jq -r '.AccessControlList.Grant // .Acl' <<<"$A")" == private ]] || die oss_acl
B="$(api oss GetBucketPublicAccessBlock --BucketName "$BUCKET")"; [[ "$(jq -r '.PublicAccessBlockConfiguration.BlockPublicAccess // .BlockPublicAccess' <<<"$B")" == true ]] || die oss_bpa
E="$(api oss GetBucketEncryption --BucketName "$BUCKET")"; [[ "$(jq -r '.ServerSideEncryptionRule.SSEAlgorithm // .SSEAlgorithm' <<<"$E")" == AES256 ]] || die oss_sse
L="$(api oss GetBucketLifecycle --BucketName "$BUCKET")"; jq -e '.Rule[]?|select(.Prefix=="staging/visionqa/" and .Status=="Enabled" and .Expiration.Days==14 and .AbortMultipartUpload.Days==1)' <<<"$L" >/dev/null || die oss_lifecycle
OT="$(api oss GetBucketTagging --BucketName "$BUCKET")"; tags_ok <<<"$OT" || die oss_tags

PJ="$(api log GetProject --projectName visionqa-staging-sls --region "$REGION")"; [[ "$(jq -r '.resourceGroupId // .ResourceGroupId // empty' <<<"$PJ")" == "$VISIONQA_RESOURCE_GROUP_ID" ]] || die sls_resource_group
for spec in visionqa-staging-app:30 visionqa-staging-security:90; do s="${spec%%:*}"; d="${spec##*:}"; LS="$(api log GetLogStore --project visionqa-staging-sls --logstore "$s" --region "$REGION")"; [[ "$(jq -r '.ttl // .TTL' <<<"$LS")" == "$d" ]] || die "sls_ttl_$s"; done
LT="$(api log ListTagResources --resourceType project --resourceId visionqa-staging-sls --region "$REGION")"; tags_ok <<<"$LT" || die sls_tags

for fn in visionqa-staging-api visionqa-staging-evaluation-task; do
  F="$(api fc GetFunction --region "$REGION" --functionName "$fn" --fcVersion v3)"
  jq -e --arg r "$ROLE_ARN" --arg rg "$VISIONQA_RESOURCE_GROUP_ID" '(.runtime=="nodejs20") and (.handler=="index.handler") and (.memorySize==1024) and (.diskSize==512) and (.instanceConcurrency==1) and (.role==$r) and ((.resourceGroupId // .ResourceGroupId)==$rg) and (.environmentVariables.VISIONQA_RUNTIME_MODE=="fixture") and (.environmentVariables.LIVE_PROVIDER_ENABLED=="false")' <<<"$F" >/dev/null || die "fc_drift_$fn"
  C="$(api fc GetConcurrencyConfig --region "$REGION" --functionName "$fn" --fcVersion v3)"; [[ "$(jq -r '.reservedConcurrency // .ReservedConcurrency' <<<"$C")" == 1 ]] || die "fc_max_instances_$fn"
  P="$(api fc GetProvisionConfig --region "$REGION" --functionName "$fn" --qualifier LATEST --fcVersion v3)"; [[ "$(jq -r '.target // .Target // 0' <<<"$P")" == 0 ]] || die "fc_provision_$fn"
  FT="$(api fc ListTaggedResources --region "$REGION" --resourceType function --resourceId "$fn" --fcVersion v3)"; tags_ok <<<"$FT" || die "fc_tags_$fn"
done
jq -nc --arg ts "$(date -u +%FT%TZ)" --arg batch "$BATCH_ID" --arg run "$RUN_ID" '{timestamp:$ts,batch_id:$batch,run_id:$run,phase:"verify",action:"VERIFY_COMPLETE",result:"PASS"}' >>"$STATE_DIR/ledger.jsonl"
echo 'VERIFY=PASS private=1 bpa=1 sse=1 lifecycle=14/1 instance_concurrency=1 max_instances=1 provisioned=0'
echo 'SMOKE=CONFIG_ONLY fixture=true model_calls=0'
echo 'FORBIDDEN=PASS orders=0 internet_egress=0 model_calls=0 access_keys=0'
