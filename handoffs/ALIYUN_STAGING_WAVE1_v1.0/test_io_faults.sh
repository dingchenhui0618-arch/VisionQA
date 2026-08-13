#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$ROOT/wave1_state_commit.sh"

T="$(mktemp -d)"; trap 'rm -rf -- "$T"' EXIT
export STATE_DIR="$T/state"; mkdir -p "$STATE_DIR"
export LEDGER="$STATE_DIR/ledger.jsonl"; touch "$LEDGER"
export RUN_ID=run-io-test BATCH_ID=batch-io-test RUN_FILE="$STATE_DIR/active-run"

# Override only JSON serialization/query so the real durable I/O/rename code is
# exercised without requiring jq on the Windows Git Bash test host.
visionqa_terminal_line(){ printf 'run=%s batch=%s action=%s result=%s' "$RUN_ID" "$BATCH_ID" "$1" "$2"; }
visionqa_has_terminal(){ grep -F "run=$RUN_ID batch=$BATCH_ID action=$1 result=PASS" "$LEDGER" >/dev/null; }
reset_case(){ rm -f -- "$STATE_DIR"/active-run* "$LEDGER"; touch "$LEDGER"; printf '%s' "$RUN_ID" >"$RUN_FILE"; unset VISIONQA_TEST_FAIL_APPEND VISIONQA_TEST_FAIL_FSYNC VISIONQA_TEST_FAIL_RENAME; }

# 1. Ledger append failure: active-run remains and no terminal is invented.
reset_case; export VISIONQA_TEST_FAIL_APPEND=1
set +e; visionqa_commit_rollback; rc=$?; set -e
[[ "$rc" -ne 0 && -f "$RUN_FILE" ]] || exit 1
! visionqa_has_terminal ROLLBACK_COMMITTING || exit 1

# 2. fsync failure: active-run remains retryable.
reset_case; export VISIONQA_TEST_FAIL_FSYNC=1
set +e; visionqa_commit_rollback; rc=$?; set -e
[[ "$rc" -ne 0 && -f "$RUN_FILE" ]] || exit 1

# 3. Rename failure after durable COMMITTING: active-run remains.
reset_case; visionqa_durable_append "$LEDGER" "$(visionqa_terminal_line ROLLBACK_COMMITTING PASS)"
export VISIONQA_TEST_FAIL_RENAME=1
set +e; visionqa_commit_rollback; rc=$?; set -e
[[ "$rc" -ne 0 && -f "$RUN_FILE" ]] || exit 1

# 4. COMPLETE append failure after rename: active is absent but durable
# COMMITTING remains as the recovery anchor.
reset_case; visionqa_durable_append "$LEDGER" "$(visionqa_terminal_line ROLLBACK_COMMITTING PASS)"
export VISIONQA_TEST_FAIL_APPEND=1
set +e; visionqa_commit_rollback; rc=$?; set -e
[[ "$rc" -ne 0 && ! -f "$RUN_FILE" ]] || exit 1
visionqa_has_terminal ROLLBACK_COMMITTING || exit 1

# 5. Retry from COMMITTING completes and clears tombstone.
unset VISIONQA_TEST_FAIL_APPEND
visionqa_commit_rollback
visionqa_has_terminal ROLLBACK_COMPLETE || exit 1
[[ ! -f "$RUN_FILE" && ! -f "$STATE_DIR/active-run.committing.$RUN_ID" ]] || exit 1

# 6. COMPLETE fsync failure is also recoverable from durable COMMITTING.
reset_case; visionqa_durable_append "$LEDGER" "$(visionqa_terminal_line ROLLBACK_COMMITTING PASS)"
export VISIONQA_TEST_FAIL_FSYNC=1
set +e; visionqa_commit_rollback; rc=$?; set -e
[[ "$rc" -ne 0 && ! -f "$RUN_FILE" ]] || exit 1
unset VISIONQA_TEST_FAIL_FSYNC
visionqa_commit_rollback
visionqa_has_terminal ROLLBACK_COMPLETE || exit 1

echo 'IO_FAULT_INJECTION=PASS cases=6'
