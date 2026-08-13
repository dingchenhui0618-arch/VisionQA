#!/usr/bin/env bash
set -Eeuo pipefail
T="$(mktemp -d)"; trap 'rm -rf -- "$T"' EXIT
S="$T/state"; mkdir -p "$S"; L="$S/ledger.jsonl"; touch "$L"
ROOT="$(cd "$(dirname "$0")" && pwd)"

assert_absent(){ [[ ! -e "$1" ]] || { echo "TEST_FAIL unexpected=$1"; exit 1; }; }
assert_present(){ [[ -e "$1" ]] || { echo "TEST_FAIL missing=$1"; exit 1; }; }
assert_line(){ grep -F "$1" "$L" >/dev/null || { echo "TEST_FAIL ledger=$1"; exit 1; }; }

# 1. Preflight candidate fails before commit: no active-run, no committed prelog.
candidate=run-preflight-fail
prelog="$S/preflight.tmp"; printf 'candidate=%s\n' "$candidate" >"$prelog"
rm -f -- "$prelog" "$S/active-run.tmp"
assert_absent "$S/active-run"; [[ ! -s "$L" ]] || exit 1

# 2. Successful preflight atomically commits one active run.
run=run-apply-partial
printf '%s' "$run" >"$S/active-run.tmp"; mv -f "$S/active-run.tmp" "$S/active-run"
printf 'run=%s action=PREFLIGHT_COMPLETE\n' "$run" >>"$L"
assert_present "$S/active-run"

# 3. Partial apply keeps active run and append-only CREATED evidence.
printf 'run=%s action=create kind=vpc result=CREATED id_sha=h1\n' "$run" >>"$L"
printf 'run=%s action=apply result=FAIL\n' "$run" >>"$L"
assert_present "$S/active-run"; assert_line 'kind=vpc result=CREATED'

# 4. Missing manifest rollback fails, appends failure, remains retryable.
[[ ! -f "$S/manifest" ]] || exit 1
printf 'run=%s action=ROLLBACK_FAILED reason=manifest_missing\n' "$run" >>"$L"
assert_present "$S/active-run"; assert_line 'ROLLBACK_FAILED reason=manifest_missing'

# 5. Retry rollback can fail once without deleting active run.
printf '{}' >"$S/manifest"
printf 'run=%s action=ROLLBACK_FAILED reason=ownership\n' "$run" >>"$L"
assert_present "$S/active-run"

# 6. Successful retry appends terminal record and removes only matching active.
[[ "$(<"$S/active-run")" == "$run" ]] || exit 1
printf 'run=%s action=ROLLBACK_COMPLETE result=PASS\n' "$run" >>"$L"
rm -f -- "$S/active-run"
assert_absent "$S/active-run"; assert_line 'ROLLBACK_COMPLETE result=PASS'

# Ledger remained append-only across all paths.
[[ "$(wc -l <"$L")" -eq 6 ]] || { echo 'TEST_FAIL ledger_line_count'; exit 1; }

# 7. Inspect the delivered scripts: active-run commit is after all drift gates.
help_line="$(grep -n 'HELP_ACTIONS=(' "$ROOT/wave1_preflight.sh"|cut -d: -f1)"
drift_line="$(grep -n 'record fc_inventory PASS' "$ROOT/wave1_preflight.sh"|cut -d: -f1)"
active_line="$(grep -n 'mv -f .*active-run.tmp.*RUN_FILE' "$ROOT/wave1_preflight.sh"|cut -d: -f1)"
[[ "$active_line" -gt "$help_line" && "$active_line" -gt "$drift_line" ]] || { echo 'TEST_FAIL active_run_order'; exit 1; }

# 8. Inspect delivered rollback retry/terminal transitions.
grep -F 'action:"ROLLBACK_FAILED"' "$ROOT/wave1_rollback.sh" >/dev/null
grep -F 'record ROLLBACK_COMPLETE PASS' "$ROOT/wave1_rollback.sh" >/dev/null
grep -F 'rm -f -- "$RUN_FILE"' "$ROOT/wave1_rollback.sh" >/dev/null
echo 'BASH_STATE_PATHS=PASS cases=8'
