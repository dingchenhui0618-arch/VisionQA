#!/usr/bin/env bash

# This file is sourced by preflight and may also be exercised directly by the
# shell test matrix. It never prints credentials or raw STS responses.
visionqa_validate_credential_environment() {
  VISIONQA_CREDENTIAL_ERROR=
  VISIONQA_CREDENTIAL_MODE=

  local modern_state legacy_state
  credential_family_state() {
    local nonempty=0
    [[ -n "${!1:-}" ]] && ((nonempty += 1))
    [[ -n "${!2:-}" ]] && ((nonempty += 1))
    [[ -n "${!3:-}" ]] && ((nonempty += 1))
    case "$nonempty" in
      0) printf '%s' ABSENT ;;
      3) printf '%s' COMPLETE ;;
      *) printf '%s' PARTIAL ;;
    esac
  }
  partial_matches_complete() {
    local partial_id="${!1:-}" partial_secret="${!2:-}" partial_token="${!3:-}"
    local complete_id="${!4:-}" complete_secret="${!5:-}" complete_token="${!6:-}"
    [[ -z "$partial_id" || "$partial_id" == "$complete_id" ]] &&
      [[ -z "$partial_secret" || "$partial_secret" == "$complete_secret" ]] &&
      [[ -z "$partial_token" || "$partial_token" == "$complete_token" ]]
  }
  modern_state="$(credential_family_state \
    ALIBABA_CLOUD_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_SECRET ALIBABA_CLOUD_SECURITY_TOKEN)"
  legacy_state="$(credential_family_state \
    ALIYUN_ACCESS_KEY_ID ALIYUN_ACCESS_KEY_SECRET ALIYUN_SECURITY_TOKEN)"

  # Profiles, metadata endpoints and alternate token variables introduce a
  # second credential source that cannot be proven to be the validated chain.
  if [[ -v ALIBABA_CLOUD_PROFILE || -v ALIBABA_CLOUD_CREDENTIALS_URI ||
        -v ALIBABA_CLOUD_ROLE_ARN || -v ALIBABA_CLOUD_OIDC_PROVIDER_ARN ||
        -v ALIBABA_CLOUD_SESSION_TOKEN || -v ALIYUN_SESSION_TOKEN ||
        -v ALIBABA_CLOUD_CREDENTIALS_FILE ||
        -v ALIBABA_CLOUD_OIDC_TOKEN_FILE ||
        -v ALIBABA_CLOUD_ROLE_SESSION_NAME ]]; then
    VISIONQA_CREDENTIAL_ERROR=extra_credential_source_present
    return 1
  fi

  if [[ "${VISIONQA_STS_RUNNER_ACTIVE:-}" != TRUE ||
        ! "${VISIONQA_STS_SESSION_NAME:-}" =~ ^visionqa-wave1-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$ ]]; then
    VISIONQA_CREDENTIAL_ERROR=sts_runner_context_required
    return 1
  fi

  case "$modern_state:$legacy_state" in
    COMPLETE:ABSENT)
      ;;
    ABSENT:COMPLETE)
      export ALIBABA_CLOUD_ACCESS_KEY_ID="$ALIYUN_ACCESS_KEY_ID"
      export ALIBABA_CLOUD_ACCESS_KEY_SECRET="$ALIYUN_ACCESS_KEY_SECRET"
      export ALIBABA_CLOUD_SECURITY_TOKEN="$ALIYUN_SECURITY_TOKEN"
      ;;
    COMPLETE:COMPLETE)
      if ! partial_matches_complete \
        ALIYUN_ACCESS_KEY_ID ALIYUN_ACCESS_KEY_SECRET ALIYUN_SECURITY_TOKEN \
        ALIBABA_CLOUD_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_SECRET ALIBABA_CLOUD_SECURITY_TOKEN; then
        VISIONQA_CREDENTIAL_ERROR=mirrored_sts_environment_mismatch
        return 1
      fi
      ;;
    PARTIAL:COMPLETE)
      if ! partial_matches_complete \
        ALIBABA_CLOUD_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_SECRET ALIBABA_CLOUD_SECURITY_TOKEN \
        ALIYUN_ACCESS_KEY_ID ALIYUN_ACCESS_KEY_SECRET ALIYUN_SECURITY_TOKEN; then
        VISIONQA_CREDENTIAL_ERROR=partial_modern_mirror_mismatch
        return 1
      fi
      export ALIBABA_CLOUD_ACCESS_KEY_ID="$ALIYUN_ACCESS_KEY_ID"
      export ALIBABA_CLOUD_ACCESS_KEY_SECRET="$ALIYUN_ACCESS_KEY_SECRET"
      export ALIBABA_CLOUD_SECURITY_TOKEN="$ALIYUN_SECURITY_TOKEN"
      ;;
    COMPLETE:PARTIAL)
      if ! partial_matches_complete \
        ALIYUN_ACCESS_KEY_ID ALIYUN_ACCESS_KEY_SECRET ALIYUN_SECURITY_TOKEN \
        ALIBABA_CLOUD_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_SECRET ALIBABA_CLOUD_SECURITY_TOKEN; then
        VISIONQA_CREDENTIAL_ERROR=partial_legacy_mirror_mismatch
        return 1
      fi
      ;;
    ABSENT:ABSENT)
      VISIONQA_CREDENTIAL_ERROR=temporary_sts_environment_required
      return 1
      ;;
    *)
      VISIONQA_CREDENTIAL_ERROR=incomplete_sts_environment
      return 1
      ;;
  esac

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

  if ! jq -e --arg session "$VISIONQA_STS_SESSION_NAME" '
    ((.AccountId // .accountId // "") | tostring | test("^[0-9]+$"))
    and ((.IdentityType // .identityType // "") == "AssumedRoleUser")
    and ((.Arn // .arn // "") |
      test((":assumed-role/visionqa-staging-wave1-executor/" +
        $session + "$")))
  ' <<<"$identity" >/dev/null 2>&1; then
    VISIONQA_CREDENTIAL_ERROR=temporary_sts_identity_not_allowed
    unset identity
    return 1
  fi

  VISIONQA_CREDENTIAL_MODE=wave1_executor_sts
  unset identity
  return 0
}
