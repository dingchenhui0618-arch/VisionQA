#!/usr/bin/env bash
# Sourced by wave1_rollback.sh. No cloud operations.

visionqa_durable_append(){
  local ledger="$1" line="$2"
  [[ "${VISIONQA_TEST_FAIL_APPEND:-0}" != 1 ]] || return 71
  printf '%s\n' "$line" >>"$ledger" || return 72
  [[ "${VISIONQA_TEST_FAIL_FSYNC:-0}" != 1 ]] || return 73
  sync -f "$ledger" || return 74
  tail -n 1 "$ledger" | grep -Fqx "$line" || return 75
}

visionqa_terminal_line(){
  local action="$1" result="$2"
  jq -nc --arg ts "$(date -u +%FT%TZ)" --arg batch "$BATCH_ID" --arg run "$RUN_ID" --arg action "$action" --arg result "$result" \
    '{timestamp:$ts,batch_id:$batch,run_id:$run,phase:"rollback",action:$action,result:$result}'
}

visionqa_has_terminal(){
  local action="$1"
  jq -se --arg run "$RUN_ID" --arg batch "$BATCH_ID" --arg action "$action" \
    'any(.[];.run_id==$run and .batch_id==$batch and .phase=="rollback" and .action==$action and .result=="PASS")' "$LEDGER" >/dev/null
}

visionqa_commit_rollback(){
  local tombstone="$STATE_DIR/active-run.committing.$RUN_ID" line

  # Recovery after a prior durable COMMITTING + successful rename.
  if [[ ! -f "$RUN_FILE" ]] && visionqa_has_terminal ROLLBACK_COMMITTING; then
    if ! visionqa_has_terminal ROLLBACK_COMPLETE; then
      line="$(visionqa_terminal_line ROLLBACK_COMPLETE PASS)"
      visionqa_durable_append "$LEDGER" "$line" || return $?
    fi
    rm -f -- "$tombstone"
    sync -f "$STATE_DIR" || return 76
    return 0
  fi

  [[ -f "$RUN_FILE" && "$(<"$RUN_FILE")" == "$RUN_ID" ]] || return 77
  if ! visionqa_has_terminal ROLLBACK_COMMITTING; then
    line="$(visionqa_terminal_line ROLLBACK_COMMITTING PASS)"
    visionqa_durable_append "$LEDGER" "$line" || return $?
  fi

  [[ "${VISIONQA_TEST_FAIL_RENAME:-0}" != 1 ]] || return 78
  mv -f "$RUN_FILE" "$tombstone" || return 79
  sync -f "$STATE_DIR" || return 80

  if ! visionqa_has_terminal ROLLBACK_COMPLETE; then
    line="$(visionqa_terminal_line ROLLBACK_COMPLETE PASS)"
    visionqa_durable_append "$LEDGER" "$line" || return $?
  fi
  rm -f -- "$tombstone"
  sync -f "$STATE_DIR" || return 81
}
