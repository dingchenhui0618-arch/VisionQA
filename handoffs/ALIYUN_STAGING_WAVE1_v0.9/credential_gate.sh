#!/usr/bin/env bash

# This file is sourced by preflight and may also be exercised directly by the
# shell test matrix. It never prints credentials or raw STS responses.
visionqa_validate_credential_environment() {
  VISIONQA_CREDENTIAL_ERROR=
  VISIONQA_CREDENTIAL_MODE=

  local modern_present=0 legacy_present=0
  [[ -v ALIBABA_CLOUD_ACCESS_KEY_ID || -v ALIBABA_CLOUD_ACCESS_KEY_SECRET || -v ALIBABA_CLOUD_SECURITY_TOKEN ]] && modern_present=1
  [[ -v ALIYUN_ACCESS_KEY_ID || -v ALIYUN_ACCESS_KEY_SECRET || -v ALIYUN_SECURITY_TOKEN ]] && legacy_present=1

  # Profiles, metadata endpoints and alternate token variables introduce a
  # second credential source that cannot be proven to be the validated chain.
  if [[ -v ALIBABA_CLOUD_PROFILE || -v ALIBABA_CLOUD_CREDENTIALS_URI ||
        -v ALIBABA_CLOUD_SESSION_TOKEN || -v ALIYUN_SESSION_TOKEN ]]; then
    VISIONQA_CREDENTIAL_ERROR=extra_credential_source_present
    return 1
  fi

  if (( modern_present == 0 && legacy_present == 0 )); then
    VISIONQA_CREDENTIAL_ERROR=temporary_sts_environment_required
    return 1
  fi

  if (( modern_present == 1 )); then
    if [[ -z "${ALIBABA_CLOUD_ACCESS_KEY_ID:-}" ||
          -z "${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-}" ||
          -z "${ALIBABA_CLOUD_SECURITY_TOKEN:-}" ]]; then
      VISIONQA_CREDENTIAL_ERROR=incomplete_modern_sts_environment
      return 1
    fi
  fi
  if (( legacy_present == 1 )); then
    if [[ -z "${ALIYUN_ACCESS_KEY_ID:-}" ||
          -z "${ALIYUN_ACCESS_KEY_SECRET:-}" ||
          -z "${ALIYUN_SECURITY_TOKEN:-}" ]]; then
      VISIONQA_CREDENTIAL_ERROR=incomplete_legacy_sts_environment
      return 1
    fi
  fi

  if (( modern_present == 1 && legacy_present == 1 )); then
    if [[ "$ALIBABA_CLOUD_ACCESS_KEY_ID" != "$ALIYUN_ACCESS_KEY_ID" ||
          "$ALIBABA_CLOUD_ACCESS_KEY_SECRET" != "$ALIYUN_ACCESS_KEY_SECRET" ||
          "$ALIBABA_CLOUD_SECURITY_TOKEN" != "$ALIYUN_SECURITY_TOKEN" ]]; then
      VISIONQA_CREDENTIAL_ERROR=mirrored_sts_environment_mismatch
      return 1
    fi
  elif (( legacy_present == 1 )); then
    export ALIBABA_CLOUD_ACCESS_KEY_ID="$ALIYUN_ACCESS_KEY_ID"
    export ALIBABA_CLOUD_ACCESS_KEY_SECRET="$ALIYUN_ACCESS_KEY_SECRET"
    export ALIBABA_CLOUD_SECURITY_TOKEN="$ALIYUN_SECURITY_TOKEN"
  fi

  # Normalize to one credential chain before the identity call and all later
  # CLI operations. Never retain the legacy mirror as a fallback.
  unset ALIYUN_ACCESS_KEY_ID ALIYUN_ACCESS_KEY_SECRET ALIYUN_SECURITY_TOKEN

  # Bind every subsequent CLI call to the validated environment chain. A
  # local profile or metadata credential must never replace it silently.
  export ALIBABA_CLOUD_IGNORE_PROFILE=TRUE

  local identity rc
  set +e
  identity="$(timeout 15s aliyun sts GetCallerIdentity 2>/dev/null)"
  rc=$?
  set -e
  if (( rc != 0 )); then
    VISIONQA_CREDENTIAL_ERROR=temporary_sts_identity_failed
    unset identity
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
    unset identity
    return 1
  fi

  VISIONQA_CREDENTIAL_MODE=cloudshell_temporary_sts
  unset identity
  return 0
}
