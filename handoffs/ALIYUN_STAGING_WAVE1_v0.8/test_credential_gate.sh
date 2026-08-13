#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"
trap 'rm -rf -- "$T"' EXIT
mkdir "$T/bin"

cat >"$T/bin/aliyun" <<'STUB'
#!/usr/bin/env bash
if [[ -n "${ALIBABA_CLOUD_PROFILE:-}" && "${ALIBABA_CLOUD_IGNORE_PROFILE:-}" != "TRUE" ]]; then
  printf '%s\n' '{"AccountId":"1000000000000000","IdentityType":"RAMUser","Arn":"acs:ram::1000000000000000:user/profile-admin"}'
  exit 0
fi
case "${STUB_MODE:-}" in
  cloudshell)
    printf '%s\n' '{"AccountId":"1000000000000000","IdentityType":"RAMUser","Arn":"acs:ram::1000000000000000:user/visionqa-staging-operator"}'
    ;;
  assumed-role)
    printf '%s\n' '{"AccountId":"1000000000000000","IdentityType":"AssumedRoleUser","Arn":"acs:sts::1000000000000000:assumed-role/aliyuncloudshell-default-role/session"}'
    ;;
  fake-token|expired-token|sts-fail)
    exit 1
    ;;
  wrong-identity)
    printf '%s\n' '{"AccountId":"1000000000000000","IdentityType":"RAMUser","Arn":"acs:ram::1000000000000000:user/other-user"}'
    ;;
  *)
    exit 98
    ;;
esac
STUB
chmod 700 "$T/bin/aliyun"

cat >"$T/bin/jq" <<'STUB'
#!/usr/bin/env python3
import json
import re
import sys

try:
    value = json.load(sys.stdin)
except Exception:
    raise SystemExit(4)
account = str(value.get("AccountId") or value.get("accountId") or "")
identity_type = value.get("IdentityType") or value.get("identityType") or ""
arn = value.get("Arn") or value.get("arn") or ""
allowed = bool(re.fullmatch(r"[0-9]+", account)) and (
    (identity_type == "RAMUser" and arn.endswith(":user/visionqa-staging-operator"))
    or (
        identity_type in {"AssumedRoleUser", "Role"}
        and re.search(r"(assumed-role|role)/.*(cloudshell|visionqa-staging-operator)", arn, re.I)
    )
)
raise SystemExit(0 if allowed else 1)
STUB
chmod 700 "$T/bin/jq"

run_case() {
  local expected="$1" name="$2"
  shift 2
  set +e
  output="$(env -i PATH="$T/bin:$PATH" HOME="$T" ROOT="$ROOT" "$@" bash -c '
    set -Eeuo pipefail
    source "$ROOT/credential_gate.sh"
    if ! visionqa_validate_credential_environment; then
      printf "%s" "${VISIONQA_CREDENTIAL_ERROR:-unknown}"
      exit 1
    fi
    [[ "${ALIBABA_CLOUD_IGNORE_PROFILE:-}" == TRUE ]] || {
      printf "%s" "profile_fallback_not_disabled"
      exit 1
    }
  ' 2>/dev/null)"
  local rc=$?
  set -e
  if [[ "$expected" == pass && "$rc" -ne 0 ]]; then
    echo "CREDENTIAL_GATE_TEST=FAIL case=$name expected=pass rc=$rc reason=${output:-none}"
    exit 1
  fi
  if [[ "$expected" == fail && "$rc" -eq 0 ]]; then
    echo "CREDENTIAL_GATE_TEST=FAIL case=$name expected=fail"
    exit 1
  fi
}

run_case fail no_environment
run_case fail profile_only \
  ALIBABA_CLOUD_PROFILE=default
run_case fail metadata_only \
  ALIBABA_CLOUD_CREDENTIALS_URI=http://metadata.invalid/credentials
run_case pass cloudshell_sts \
  STUB_MODE=cloudshell \
  ALIBABA_CLOUD_ACCESS_KEY_ID=temp-id \
  ALIBABA_CLOUD_ACCESS_KEY_SECRET=temp-secret \
  ALIBABA_CLOUD_SECURITY_TOKEN=temp-token
run_case pass cloudshell_assumed_role \
  STUB_MODE=assumed-role \
  ALIBABA_CLOUD_ACCESS_KEY_ID=temp-id \
  ALIBABA_CLOUD_ACCESS_KEY_SECRET=temp-secret \
  ALIBABA_CLOUD_SECURITY_TOKEN=temp-token
run_case pass profile_conflict_forced_to_env_chain \
  STUB_MODE=cloudshell \
  ALIBABA_CLOUD_PROFILE=privileged-profile \
  ALIBABA_CLOUD_IGNORE_PROFILE=true \
  ALIBABA_CLOUD_ACCESS_KEY_ID=temp-id \
  ALIBABA_CLOUD_ACCESS_KEY_SECRET=temp-secret \
  ALIBABA_CLOUD_SECURITY_TOKEN=temp-token
run_case fail access_key_without_token \
  STUB_MODE=cloudshell \
  ALIBABA_CLOUD_ACCESS_KEY_ID=long-id \
  ALIBABA_CLOUD_ACCESS_KEY_SECRET=long-secret
run_case fail empty_token \
  STUB_MODE=cloudshell \
  ALIBABA_CLOUD_ACCESS_KEY_ID=temp-id \
  ALIBABA_CLOUD_ACCESS_KEY_SECRET=temp-secret \
  ALIBABA_CLOUD_SECURITY_TOKEN=
run_case fail fake_token \
  STUB_MODE=fake-token \
  ALIBABA_CLOUD_ACCESS_KEY_ID=temp-id \
  ALIBABA_CLOUD_ACCESS_KEY_SECRET=temp-secret \
  ALIBABA_CLOUD_SECURITY_TOKEN=fake
run_case fail expired_token \
  STUB_MODE=expired-token \
  ALIBABA_CLOUD_ACCESS_KEY_ID=temp-id \
  ALIBABA_CLOUD_ACCESS_KEY_SECRET=temp-secret \
  ALIBABA_CLOUD_SECURITY_TOKEN=expired
run_case fail identity_mismatch \
  STUB_MODE=wrong-identity \
  ALIBABA_CLOUD_ACCESS_KEY_ID=temp-id \
  ALIBABA_CLOUD_ACCESS_KEY_SECRET=temp-secret \
  ALIBABA_CLOUD_SECURITY_TOKEN=temp-token
run_case fail mixed_environment \
  STUB_MODE=cloudshell \
  ALIBABA_CLOUD_ACCESS_KEY_ID=temp-id \
  ALIBABA_CLOUD_ACCESS_KEY_SECRET=temp-secret \
  ALIBABA_CLOUD_SECURITY_TOKEN=temp-token \
  ALIYUN_ACCESS_KEY_ID=other-id \
  ALIYUN_ACCESS_KEY_SECRET=other-secret \
  ALIYUN_SECURITY_TOKEN=other-token

# CLI precedence simulation: only exact uppercase TRUE may ignore a profile.
for bad in unset empty lowercase; do
  set +e
  case "$bad" in
    unset)
      result="$(env -i PATH="$T/bin:$PATH" STUB_MODE=cloudshell ALIBABA_CLOUD_PROFILE=privileged-profile "$T/bin/aliyun" sts GetCallerIdentity | "$T/bin/jq" -e . 2>/dev/null)"
      ;;
    empty)
      result="$(env -i PATH="$T/bin:$PATH" STUB_MODE=cloudshell ALIBABA_CLOUD_PROFILE=privileged-profile ALIBABA_CLOUD_IGNORE_PROFILE= "$T/bin/aliyun" sts GetCallerIdentity | "$T/bin/jq" -e . 2>/dev/null)"
      ;;
    lowercase)
      result="$(env -i PATH="$T/bin:$PATH" STUB_MODE=cloudshell ALIBABA_CLOUD_PROFILE=privileged-profile ALIBABA_CLOUD_IGNORE_PROFILE=true "$T/bin/aliyun" sts GetCallerIdentity | "$T/bin/jq" -e . 2>/dev/null)"
      ;;
  esac
  rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || { echo "CREDENTIAL_GATE_TEST=FAIL case=profile_precedence_$bad"; exit 1; }
done
env -i PATH="$T/bin:$PATH" STUB_MODE=cloudshell ALIBABA_CLOUD_PROFILE=privileged-profile ALIBABA_CLOUD_IGNORE_PROFILE=TRUE "$T/bin/aliyun" sts GetCallerIdentity | "$T/bin/jq" -e . >/dev/null

echo 'CREDENTIAL_GATE_TESTS=PASS cases=16'
