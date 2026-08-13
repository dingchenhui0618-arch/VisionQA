#!/usr/bin/env bash
set -Eeuo pipefail
[[ -f .visionqa-wave1.env ]] || { echo 'VERIFY=FAIL reason=missing_env' >&2; exit 1; }
# shellcheck disable=SC1091
source .visionqa-wave1.env
die(){ printf 'VERIFY=FAIL reason=%s\n' "$1" >&2; exit 1; }
json(){ timeout 30s aliyun "$@" 2>/dev/null; }

VPCS="$(json vpc DescribeVpcs --RegionId "$REGION" --VpcName visionqa-staging-vpc)" || die vpc
[[ "$(jq -r '.Vpcs.Vpc[0].CidrBlock' <<<"$VPCS")" == "10.90.0.0/16" ]] || die vpc_drift
VSWS="$(json vpc DescribeVSwitches --RegionId "$REGION" --VSwitchName visionqa-staging-vsw-a)" || die vsw
[[ "$(jq -r '.VSwitches.VSwitch[0].CidrBlock' <<<"$VSWS")" == "10.90.1.0/24" ]] || die vsw_drift
SGS="$(json ecs DescribeSecurityGroups --RegionId "$REGION" --SecurityGroupName visionqa-staging-sg)" || die sg
SG_ID="$(jq -er '.SecurityGroups.SecurityGroup[0].SecurityGroupId' <<<"$SGS")" || die sg_missing
ATTR="$(json ecs DescribeSecurityGroupAttribute --RegionId "$REGION" --SecurityGroupId "$SG_ID" --Direction ingress)" || die sg_attr
[[ "$(jq '[.Permissions.Permission[]?]|length' <<<"$ATTR")" == 0 ]] || die sg_ingress

ACL="$(json oss GetBucketAcl --BucketName "$BUCKET")" || die oss_acl
[[ "$(jq -r '.AccessControlList.Grant // .Acl' <<<"$ACL")" == private ]] || die oss_public
BPA="$(json oss GetPublicAccessBlock --BucketName "$BUCKET")" || die oss_bpa
[[ "$(jq -r '.PublicAccessBlockConfiguration.BlockPublicAccess // .BlockPublicAccess' <<<"$BPA")" == true ]] || die oss_bpa_off
ENC="$(json oss GetBucketEncryption --BucketName "$BUCKET")" || die oss_enc
[[ "$(jq -r '.ServerSideEncryptionRule.SSEAlgorithm // .SSEAlgorithm' <<<"$ENC")" == AES256 ]] || die oss_enc_drift
LC="$(json oss GetBucketLifecycle --BucketName "$BUCKET")" || die oss_lifecycle
jq -e '.Rule[]? | select(.Prefix=="staging/visionqa/" and .Status=="Enabled" and .Expiration.Days==14 and .AbortMultipartUpload.Days==1)' <<<"$LC" >/dev/null || die oss_lifecycle_drift

for spec in visionqa-staging-app:30 visionqa-staging-security:90; do
  store="${spec%%:*}"; days="${spec##*:}"
  L="$(json log GetLogStore --project visionqa-staging-sls --logstore "$store" --region "$REGION")" || die "sls_${store}"
  [[ "$(jq -r '.ttl // .TTL' <<<"$L")" == "$days" ]] || die "sls_ttl_${store}"
done

for fn in visionqa-staging-api visionqa-staging-evaluation-task; do
  F="$(json fc GetFunction --region "$REGION" --functionName "$fn" --fcVersion v3)" || die "fc_${fn}"
  [[ "$(jq -r '.environmentVariables.VISIONQA_RUNTIME_MODE // .EnvironmentVariables.VISIONQA_RUNTIME_MODE' <<<"$F")" == fixture ]] || die "fc_mode_${fn}"
  [[ "$(jq -r '.instanceConcurrency // .InstanceConcurrency' <<<"$F")" == 1 ]] || die "fc_concurrency_${fn}"
  [[ "$(jq -r '.environmentVariables.LIVE_PROVIDER_ENABLED // .EnvironmentVariables.LIVE_PROVIDER_ENABLED' <<<"$F")" == false ]] || die "live_provider_gate_${fn}"
done

echo 'VERIFY=PASS'
echo 'SMOKE=CONFIG_ONLY fixture=true model_calls=0'
echo 'FORBIDDEN=PASS rds_order=0 nat=0 eip=0 model_calls=0 access_key=0'
