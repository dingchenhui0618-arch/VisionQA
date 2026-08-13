#!/usr/bin/env bash
set -Eeuo pipefail

# VisionQA Wave1 v1.0 STS entry point.
# Secrets returned by AssumeRole stay in shell variables and are never printed
# or persisted. Do not run this script with shell tracing enabled.

ROOT="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-}"
ROLE_NAME="visionqa-staging-wave1-executor"
SESSION_PREFIX="visionqa-wave1-"
DURATION_SECONDS=3600

fail() {
  printf 'STS_RUNNER=FAIL reason=%s\n' "$1"
  exit 1
}

[[ "$-" != *x* ]] || fail shell_trace_enabled
case "$MODE" in
  preflight|apply|verify|all) ;;
  *) fail invalid_mode ;;
esac

for forbidden in \
  ALIBABA_CLOUD_PROFILE ALIBABA_CLOUD_CREDENTIALS_URI \
  ALIBABA_CLOUD_ROLE_ARN ALIBABA_CLOUD_OIDC_PROVIDER_ARN \
  ALIBABA_CLOUD_SESSION_TOKEN ALIYUN_SESSION_TOKEN; do
  [[ ! -v "$forbidden" ]] || fail extra_credential_source_present
done

operator_identity=
role_info=
access_key_info=
assume_response=
sts_id=
sts_secret=
sts_token=
sts_expiration=
cleanup() {
  unset operator_identity role_info access_key_info assume_response
  unset sts_id sts_secret sts_token sts_expiration
  unset account_id operator_type operator_arn role_arn run_id session_name
  unset now_epoch expiration_epoch remaining rc
}
trap cleanup EXIT

set +e
operator_identity="$(timeout 15s aliyun sts GetCallerIdentity 2>/dev/null)"
rc=$?
set -e
(( rc == 0 )) || fail operator_identity_failed

account_id="$(jq -r '.AccountId // .accountId // empty' <<<"$operator_identity" 2>/dev/null)"
operator_type="$(jq -r '.IdentityType // .identityType // empty' <<<"$operator_identity" 2>/dev/null)"
operator_arn="$(jq -r '.Arn // .arn // empty' <<<"$operator_identity" 2>/dev/null)"
[[ "$account_id" =~ ^[0-9]+$ ]] || fail operator_account_invalid
[[ "$operator_type" == RAMUser ]] || fail operator_identity_type_invalid
[[ "$operator_arn" == "acs:ram::${account_id}:user/visionqa-staging-operator" ]] ||
  fail operator_identity_not_allowed

role_arn="acs:ram::${account_id}:role/${ROLE_NAME}"

# Re-read the role boundary before every execution. A successful AssumeRole is
# also the runtime proof that the trust policy's MFA condition evaluated true.
set +e
role_info="$(timeout 15s aliyun ram GetRole --RoleName "$ROLE_NAME" 2>/dev/null)"
rc=$?
set -e
(( rc == 0 )) || fail executor_role_read_failed
jq -e \
  --arg account "$account_id" \
  '(.Role.AssumeRolePolicyDocument |
      if type == "string" then fromjson else . end) as $policy
   | (.Role.MaxSessionDuration == 3600)
   and ($policy.Statement | length == 1)
   and ($policy.Statement[0].Effect == "Allow")
   and ($policy.Statement[0].Action == "sts:AssumeRole")
   and (($policy.Statement[0].Principal.RAM |
      if type == "array" then . else [.] end) ==
      [("acs:ram::" + $account +
        ":user/visionqa-staging-operator")])
   and ($policy.Statement[0].Condition.Bool["acs:MFAPresent"] == "true")' \
  <<<"$role_info" >/dev/null 2>&1 ||
  fail executor_role_trust_drift
unset role_info

set +e
access_key_info="$(timeout 15s aliyun ram ListAccessKeys \
  --UserName visionqa-staging-operator 2>/dev/null)"
rc=$?
set -e
(( rc == 0 )) || fail operator_access_key_probe_failed
jq -e '[(.AccessKeys.AccessKey // .AccessKeys // [])[]?] | length == 0' \
  <<<"$access_key_info" >/dev/null 2>&1 ||
  fail operator_access_key_not_zero
unset access_key_info

run_id="$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
session_name="${SESSION_PREFIX}${run_id}"
[[ "$session_name" =~ ^visionqa-wave1-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$ ]] ||
  fail session_name_invalid

set +e
assume_response="$(timeout 20s aliyun sts AssumeRole \
  --RoleArn "$role_arn" \
  --RoleSessionName "$session_name" \
  --DurationSeconds "$DURATION_SECONDS" 2>/dev/null)"
rc=$?
set -e
(( rc == 0 )) || fail assume_role_failed

sts_id="$(jq -r '.Credentials.AccessKeyId // empty' <<<"$assume_response" 2>/dev/null)"
sts_secret="$(jq -r '.Credentials.AccessKeySecret // empty' <<<"$assume_response" 2>/dev/null)"
sts_token="$(jq -r '.Credentials.SecurityToken // empty' <<<"$assume_response" 2>/dev/null)"
sts_expiration="$(jq -r '.Credentials.Expiration // empty' <<<"$assume_response" 2>/dev/null)"
[[ -n "$sts_id" && -n "$sts_secret" && -n "$sts_token" ]] ||
  fail incomplete_assume_role_credentials
[[ -n "$sts_expiration" ]] || fail missing_expiration

now_epoch="$(date -u +%s)"
set +e
expiration_epoch="$(date -u -d "$sts_expiration" +%s 2>/dev/null)"
rc=$?
set -e
(( rc == 0 )) || fail invalid_expiration
remaining=$((expiration_epoch - now_epoch))
(( remaining >= 300 && remaining <= DURATION_SECONDS )) ||
  fail expiration_out_of_bounds

unset operator_identity assume_response operator_type operator_arn

(
  set -Eeuo pipefail
  export ALIBABA_CLOUD_ACCESS_KEY_ID="$sts_id"
  export ALIBABA_CLOUD_ACCESS_KEY_SECRET="$sts_secret"
  export ALIBABA_CLOUD_SECURITY_TOKEN="$sts_token"
  export ALIBABA_CLOUD_IGNORE_PROFILE=TRUE
  export VISIONQA_STS_RUNNER_ACTIVE=TRUE
  export VISIONQA_STS_SESSION_NAME="$session_name"
  unset ALIYUN_ACCESS_KEY_ID ALIYUN_ACCESS_KEY_SECRET ALIYUN_SECURITY_TOKEN
  unset ALIBABA_CLOUD_PROFILE ALIBABA_CLOUD_CREDENTIALS_URI
  unset ALIBABA_CLOUD_ROLE_ARN ALIBABA_CLOUD_OIDC_PROVIDER_ARN
  unset ALIBABA_CLOUD_SESSION_TOKEN ALIYUN_SESSION_TOKEN
  unset ALIBABA_CLOUD_CREDENTIALS_FILE
  unset ALIBABA_CLOUD_OIDC_TOKEN_FILE ALIBABA_CLOUD_ROLE_SESSION_NAME

  role_identity="$(timeout 15s aliyun sts GetCallerIdentity 2>/dev/null)" ||
    fail assumed_role_identity_failed
  jq -e \
    --arg account "$account_id" \
    --arg session "$session_name" \
    '((.AccountId // .accountId // "") | tostring) == $account
     and ((.IdentityType // .identityType // "") == "AssumedRoleUser")
     and ((.Arn // .arn // "") ==
       ("acs:sts::" + $account +
        ":assumed-role/visionqa-staging-wave1-executor/" + $session))' \
    <<<"$role_identity" >/dev/null 2>&1 ||
    fail assumed_role_identity_not_allowed
  unset role_identity

  case "$MODE" in
    preflight)
      bash "$ROOT/wave1_preflight.sh"
      ;;
    apply)
      bash "$ROOT/wave1_apply.sh"
      ;;
    verify)
      bash "$ROOT/wave1_verify.sh"
      ;;
    all)
      bash "$ROOT/wave1_preflight.sh"
      bash "$ROOT/wave1_apply.sh"
      bash "$ROOT/wave1_verify.sh"
      ;;
  esac
)

printf 'STS_RUNNER=PASS mode=%s\n' "$MODE"
