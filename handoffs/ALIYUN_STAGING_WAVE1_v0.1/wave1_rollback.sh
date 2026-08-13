#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${VISIONQA_CONFIRM_ROLLBACK:-}" == "DELETE_WAVE1_STAGING" ]] || {
  echo 'ROLLBACK=REFUSED set VISIONQA_CONFIRM_ROLLBACK=DELETE_WAVE1_STAGING' >&2
  exit 2
}
[[ -f .visionqa-wave1.env ]] || { echo 'ROLLBACK=FAIL reason=missing_env' >&2; exit 1; }
# shellcheck disable=SC1091
source .visionqa-wave1.env
[[ "$REGION" == cn-beijing && "$BUCKET" == visionqa-staging-*-cn-beijing ]] || exit 1
json(){ timeout 60s aliyun "$@" 2>/dev/null; }

# Only exact Wave1 names are targeted. Database, internet egress, model and
# identity resources are deliberately absent. This deletes cloud data and must
# be run by the owner.
for fn in visionqa-staging-api visionqa-staging-evaluation-task; do
  json fc DeleteFunction --region "$REGION" --functionName "$fn" --fcVersion v3 >/dev/null || true
done
for store in visionqa-staging-app visionqa-staging-security; do
  json log DeleteLogStore --project visionqa-staging-sls --logstore "$store" --region "$REGION" >/dev/null || true
done
json log DeleteProject --projectName visionqa-staging-sls --region "$REGION" >/dev/null || true

# Bucket removal is refused unless empty. No wildcard object deletion.
if timeout 20s aliyun oss ls "oss://${BUCKET}/" 2>/dev/null | grep -q .; then
  echo 'ROLLBACK=STOP bucket_not_empty' >&2; exit 1
fi
timeout 30s aliyun oss rm "oss://${BUCKET}" >/dev/null || true

VSW_ID="$(json vpc DescribeVSwitches --RegionId "$REGION" --VSwitchName visionqa-staging-vsw-a | jq -r '.VSwitches.VSwitch[0].VSwitchId // empty')"
SG_ID="$(json ecs DescribeSecurityGroups --RegionId "$REGION" --SecurityGroupName visionqa-staging-sg | jq -r '.SecurityGroups.SecurityGroup[0].SecurityGroupId // empty')"
VPC_ID="$(json vpc DescribeVpcs --RegionId "$REGION" --VpcName visionqa-staging-vpc | jq -r '.Vpcs.Vpc[0].VpcId // empty')"
[[ -z "$SG_ID" ]] || json ecs DeleteSecurityGroup --RegionId "$REGION" --SecurityGroupId "$SG_ID" >/dev/null
[[ -z "$VSW_ID" ]] || json vpc DeleteVSwitch --RegionId "$REGION" --VSwitchId "$VSW_ID" >/dev/null
[[ -z "$VPC_ID" ]] || json vpc DeleteVpc --RegionId "$REGION" --VpcId "$VPC_ID" >/dev/null
echo 'ROLLBACK=PASS'
