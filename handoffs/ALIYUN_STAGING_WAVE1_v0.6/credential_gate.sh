#!/usr/bin/env bash

# This file is sourced by preflight and may also be exercised directly by the
# shell test matrix. It never prints credentials or raw STS responses.
visionqa_validate_credential_environment() {
  VISIONQA_CREDENTIAL_ERROR=
  VISIONQA_CREDENTIAL_MODE=

  local modern_present=0 legacy_present=0
  [[ -n "${ALIBABA_CLOUD_ACCESS_KEY_ID:-}${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-}${ALIBABA_CLOUD_SECURITY_TOKEN:-}" ]] && modern_present=1
  [[ -n "${ALIYUN_ACCESS_KEY_ID:-}${ALIYUN_ACCESS_KEY_SECRET:-}${ALIYUN_SECURITY_TOKEN:-}" ]] && legacy_present=1

  if (( modern_present == 0 && legacy_present == 0 )); then
    VISIONQA_CREDENTIAL_MODE=profile_or_cloudshell_metadata
    return 0
  fi

  if (( modern_present == 1 && legacy_present == 1 )); then
    VISIONQA_CREDENTIAL_ERROR=mixed_credential_environment
    return 1
  fi

  local access_id access_secret security_token
  if (( modern_present == 1 )); then
    access_id="${ALIBABA_CLOUD_ACCESS_KEY_ID:-}"
    access_secret="${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-}"
    security_token="${ALIBABA_CLOUD_SECURITY_TOKEN:-}"
  else
    access_id="${ALIYUN_ACCESS_KEY_ID:-}"
    access_secret="${ALIYUN_ACCESS_KEY_SECRET:-}"
    security_token="${ALIYUN_SECURITY_TOKEN:-}"
  fi

  if [[ -z "$access_id" || -z "$access_secret" ]]; then
    VISIONQA_CREDENTIAL_ERROR=incomplete_access_key_environment
    return 1
  fi
  if [[ -z "$security_token" ]]; then
    VISIONQA_CREDENTIAL_ERROR=access_key_environment_without_security_token
    return 1
  fi

  local identity rc
  set +e
  identity="$(timeout 15s aliyun sts GetCallerIdentity 2>/dev/null)"
  rc=$?
  set -e
  if (( rc != 0 )); then
    VISIONQA_CREDENTIAL_ERROR=temporary_sts_identity_failed
    unset identity access_id access_secret security_token
    return 1
  fi

  if ! jq -e '
    ((.AccountId // .accountId // "") | tostring | test("^[0-9]+$"))
    and
    (
      (((.IdentityType // .identityType // "") == "RAMUser")
        and ((.Arn // .arn // "") | test(":user/visionqa-staging-operator$")))
      or
      (((.IdentityType // .identityType // "") | test("^(AssumedRoleUser|Role)$"))
        and ((.Arn // .arn // "") | test("(assumed-role|role)/.*(cloudshell|visionqa-staging-operator)"; "i")))
    )
  ' <<<"$identity" >/dev/null 2>&1; then
    VISIONQA_CREDENTIAL_ERROR=temporary_sts_identity_not_allowed
    unset identity access_id access_secret security_token
    return 1
  fi

  VISIONQA_CREDENTIAL_MODE=cloudshell_temporary_sts
  unset identity access_id access_secret security_token
  return 0
}
