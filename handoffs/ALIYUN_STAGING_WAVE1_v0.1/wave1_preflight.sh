#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

REGION="cn-beijing"
PREFIX="visionqa-staging"
VPC_NAME="${PREFIX}-vpc"
VPC_CIDR="10.90.0.0/16"
VSW_NAME="${PREFIX}-vsw-a"
VSW_CIDR="10.90.1.0/24"
SG_NAME="${PREFIX}-sg"
SLS_PROJECT="${PREFIX}-sls"
FC_API="${PREFIX}-api"
FC_TASK="${PREFIX}-evaluation-task"

die(){ printf 'PREFLIGHT=FAIL reason=%s\n' "$1" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "missing_$1"; }
json(){ timeout 30s aliyun "$@" 2>/dev/null; }

need aliyun
need jq
need sha256sum

# Identity is only used locally to derive a deterministic, globally unique bucket
# suffix. No account identifier is printed or written.
IDENTITY="$(json sts GetCallerIdentity)" || die "sts"
ACCOUNT_ID="$(jq -er '.AccountId // .accountId' <<<"$IDENTITY")" || die "sts_json"
BUCKET="${PREFIX}-$(printf '%s' "$ACCOUNT_ID" | sha256sum | cut -c1-10)-cn-beijing"
unset IDENTITY ACCOUNT_ID

[[ "$BUCKET" == visionqa-staging-*-cn-beijing ]] || die "bucket_name"
[[ -n "${VISIONQA_ZONE_ID:-}" ]] || die "set_VISIONQA_ZONE_ID"
[[ "${VISIONQA_ZONE_ID}" == cn-beijing-* ]] || die "zone_not_beijing"
[[ -n "${VISIONQA_RESOURCE_GROUP_ID:-}" ]] || die "set_VISIONQA_RESOURCE_GROUP_ID"
[[ -n "${VISIONQA_FC_ROLE_ARN:-}" ]] || die "set_VISIONQA_FC_ROLE_ARN"
[[ "${VISIONQA_FC_ROLE_ARN}" == *":role/visionqa-staging-runtime" ]] || die "unexpected_fc_role"

# Explicitly reject credential variables. Cloud Shell temporary identity only.
for n in ALIBABA_CLOUD_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_SECRET \
         ALIYUN_ACCESS_KEY_ID ALIYUN_ACCESS_KEY_SECRET; do
  [[ -z "${!n:-}" ]] || die "static_access_key_env_present"
done

# Exact-name inventory. Unknown duplicates or drift stop before mutation.
VPCS="$(json vpc DescribeVpcs --RegionId "$REGION" --VpcName "$VPC_NAME")" || die "vpc_read"
VPC_COUNT="$(jq '[.Vpcs.Vpc[]?] | length' <<<"$VPCS")"
(( VPC_COUNT <= 1 )) || die "duplicate_vpc"
if (( VPC_COUNT == 1 )); then
  [[ "$(jq -r '.Vpcs.Vpc[0].CidrBlock' <<<"$VPCS")" == "$VPC_CIDR" ]] || die "vpc_drift"
fi

VSWS="$(json vpc DescribeVSwitches --RegionId "$REGION" --VSwitchName "$VSW_NAME")" || die "vsw_read"
VSW_COUNT="$(jq '[.VSwitches.VSwitch[]?] | length' <<<"$VSWS")"
(( VSW_COUNT <= 1 )) || die "duplicate_vswitch"
if (( VSW_COUNT == 1 )); then
  [[ "$(jq -r '.VSwitches.VSwitch[0].CidrBlock' <<<"$VSWS")" == "$VSW_CIDR" ]] || die "vswitch_drift"
  [[ "$(jq -r '.VSwitches.VSwitch[0].ZoneId' <<<"$VSWS")" == "$VISIONQA_ZONE_ID" ]] || die "vswitch_zone_drift"
fi

SGS="$(json ecs DescribeSecurityGroups --RegionId "$REGION" --SecurityGroupName "$SG_NAME")" || die "sg_read"
SG_COUNT="$(jq '[.SecurityGroups.SecurityGroup[]?] | length' <<<"$SGS")"
(( SG_COUNT <= 1 )) || die "duplicate_security_group"

# Name-only existence checks. Detailed drift is verified after creation.
if timeout 20s aliyun oss stat "oss://${BUCKET}" >/dev/null 2>&1; then OSS_STATE=EXISTS; else OSS_STATE=ABSENT; fi
if json log GetProject --projectName "$SLS_PROJECT" --region "$REGION" >/dev/null; then SLS_STATE=EXISTS; else SLS_STATE=ABSENT; fi

FC_LIST="$(json fc ListFunctions --region "$REGION" --limit 100 --fcVersion v3)" || die "fc_read"
for fn in "$FC_API" "$FC_TASK"; do
  c="$(jq --arg n "$fn" '[((.functions // .Functions // [])[]) | select((.functionName // .FunctionName)==$n)] | length' <<<"$FC_LIST")"
  (( c <= 1 )) || die "duplicate_fc_${fn}"
done

cat > .visionqa-wave1.env <<EOF
REGION=$REGION
BUCKET=$BUCKET
VISIONQA_ZONE_ID=$VISIONQA_ZONE_ID
VISIONQA_RESOURCE_GROUP_ID=$VISIONQA_RESOURCE_GROUP_ID
VISIONQA_FC_ROLE_ARN=$VISIONQA_FC_ROLE_ARN
EOF
chmod 600 .visionqa-wave1.env

printf 'PREFLIGHT=PASS vpc=%s vswitch=%s sg=%s oss=%s sls=%s\n' \
  "$VPC_COUNT" "$VSW_COUNT" "$SG_COUNT" "$OSS_STATE" "$SLS_STATE"
printf 'FORBIDDEN=PASS rds_order=0 nat=0 eip=0 model_calls=0 access_key=0\n'
