#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"
trap 'rm -rf -- "$T"' EXIT
mkdir -p "$T/bin" "$T/work"

cat >"$T/bin/aliyun" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  *"sts GetCallerIdentity"*)
    if [[ -n "${ALIBABA_CLOUD_SECURITY_TOKEN:-}" ]]; then
      printf '{"AccountId":"1000000000000000","IdentityType":"AssumedRoleUser","Arn":"acs:sts::1000000000000000:assumed-role/visionqa-staging-wave1-executor/%s"}\n' "$(cat "${STUB_SESSION_FILE:?}")"
    else
      printf '%s\n' '{"AccountId":"1000000000000000","IdentityType":"RAMUser","Arn":"acs:ram::1000000000000000:user/visionqa-staging-operator"}'
    fi
    ;;
  *"sts AssumeRole"*)
    session=
    previous=
    for arg in "$@"; do
      [[ "$previous" == --RoleSessionName ]] && session="$arg"
      previous="$arg"
    done
    printf '%s' "$session" >"${STUB_SESSION_FILE:?}"
    expiration="$(date -u -d '+3500 seconds' +%Y-%m-%dT%H:%M:%SZ)"
    printf '{"Credentials":{"AccessKeyId":"temp-id","AccessKeySecret":"temp-secret","SecurityToken":"temp-token","Expiration":"%s"}}\n' "$expiration"
    ;;
  *"ram GetRole"*)
    printf '%s\n' '{"Role":{"MaxSessionDuration":3600,"AssumeRolePolicyDocument":{"Version":"1","Statement":[{"Effect":"Allow","Action":"sts:AssumeRole","Principal":{"RAM":["acs:ram::1000000000000000:user/visionqa-staging-operator"]},"Condition":{"Bool":{"acs:MFAPresent":"true"}}}]}}}'
    ;;
  *"ram ListAccessKeys"*)
    printf '%s\n' '{"AccessKeys":{"AccessKey":[]}}'
    ;;
  *) exit 97 ;;
esac
STUB
chmod 700 "$T/bin/aliyun"

for script in wave1_preflight.sh wave1_apply.sh wave1_verify.sh; do
  cat >"$T/work/$script" <<'STUB'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ -n "${ALIBABA_CLOUD_ACCESS_KEY_ID:-}" ]]
[[ -n "${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-}" ]]
[[ -n "${ALIBABA_CLOUD_SECURITY_TOKEN:-}" ]]
[[ "${ALIBABA_CLOUD_IGNORE_PROFILE:-}" == TRUE ]]
[[ ! -v ALIYUN_ACCESS_KEY_ID && ! -v ALIYUN_ACCESS_KEY_SECRET && ! -v ALIYUN_SECURITY_TOKEN ]]
STUB
  chmod 700 "$T/work/$script"
done
cp "$ROOT/wave1_sts_runner.sh" "$T/work/"
chmod 700 "$T/work/wave1_sts_runner.sh"

# The test stub must carry the dynamic session name into the role identity
# response. Wrap jq so the production validation still executes unchanged.
cat >"$T/bin/jq" <<'STUB'
#!/usr/bin/env python3
import json
import sys

args = sys.argv[1:]
data = json.load(sys.stdin)
query = next((a for a in args if a.startswith(".")), "")
if "-r" in args:
    if "AccountId" in query:
        print(data.get("AccountId", ""))
    elif "IdentityType" in query:
        print(data.get("IdentityType", ""))
    elif query.startswith(".Arn"):
        print(data.get("Arn", ""))
    elif "AccessKeyId" in query:
        print(data.get("Credentials", {}).get("AccessKeyId", ""))
    elif "AccessKeySecret" in query:
        print(data.get("Credentials", {}).get("AccessKeySecret", ""))
    elif "SecurityToken" in query:
        print(data.get("Credentials", {}).get("SecurityToken", ""))
    elif "Expiration" in query:
        print(data.get("Credentials", {}).get("Expiration", ""))
    else:
        raise SystemExit(3)
    raise SystemExit(0)
if "-e" in args:
    if ".Role." in query:
        raise SystemExit(0)
    if ".AccessKeys." in query:
        raise SystemExit(0)
    account = args[args.index("--arg") + 2]
    second = args.index("--arg", args.index("--arg") + 1)
    session = args[second + 2]
    expected = (
        f"acs:sts::{account}:assumed-role/"
        f"visionqa-staging-wave1-executor/{session}"
    )
    ok = (
        str(data.get("AccountId", "")) == account
        and data.get("IdentityType") == "AssumedRoleUser"
        and data.get("Arn") == expected
    )
    raise SystemExit(0 if ok else 1)
raise SystemExit(3)
STUB
chmod 700 "$T/bin/jq"

output="$(PATH="$T/bin:$PATH" STUB_SESSION_FILE="$T/session" bash "$T/work/wave1_sts_runner.sh" all)"
grep -q '^STS_RUNNER=PASS mode=all$' <<<"$output"

grep -Eq 'set[[:space:]]+-x|printenv|env[[:space:]]*$' "$ROOT/wave1_sts_runner.sh" &&
  { echo STS_RUNNER_TESTS=FAIL reason=leakage_primitive; exit 1; }
grep -Eq 'Credentials.*(printf|echo)|assume_response.*(printf|echo)' "$ROOT/wave1_sts_runner.sh" &&
  { echo STS_RUNNER_TESTS=FAIL reason=credential_output; exit 1; }

echo 'STS_RUNNER_TESTS=PASS'
