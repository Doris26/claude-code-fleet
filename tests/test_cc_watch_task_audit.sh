#!/bin/bash
# Isolation test for cc-watch's Stage-4 gated task-audit (folded-in :41; user 2026-06-15
# "fold :41 into cc-watch"). Extracts the REAL Stage-4 block from cc-watch at runtime and runs
# it under stubbed `cc-task` + `claude` on PATH, asserting:
#   1. GATE SKIPS (no claude spawn) when no pending task has a deliverable.
#   2. GATE FIRES + the right `cc-task done` calls are produced when a deliverable exists, and
#      reopen entries are LOGGED only (no auto-reopen).
# Pure isolation: no network, no real claude, no real ~/.cc-manager. Exit 0 = all pass.
set -uo pipefail

CC_WATCH="$(cd "$(dirname "$0")" && pwd)/cc-watch"
[ -f "$CC_WATCH" ] || { echo "FAIL: cc-watch not found at $CC_WATCH"; exit 1; }

# --- pull the Stage-4 block verbatim (from the marker line through its closing `fi`) ----------
BLOCK=$(awk '/^# Stage 4 — gated task-audit/{f=1} f{print}' "$CC_WATCH")
[ -n "$BLOCK" ] || { echo "FAIL: could not extract Stage-4 block from cc-watch"; exit 1; }

PASS=0; FAIL=0
ok()  { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

# run_case <pending-fixture> <claude-json-fixture> -> populates $OUT (stdout) + $DONE_LOG.
# Logs persist until the NEXT run_case (or script exit) so post-call assertions can read them.
_LAST_TMP=""
cleanup() { [ -n "$_LAST_TMP" ] && rm -rf "$_LAST_TMP"; }
trap cleanup EXIT
run_case() {
    cleanup
    local pending="$1" claudejson="$2"
    local tmp; tmp=$(mktemp -d); _LAST_TMP="$tmp"
    local stub="$tmp/bin"; mkdir -p "$stub"
    local home="$tmp/home"; mkdir -p "$home/.local/bin"
    DONE_LOG="$tmp/done.log"; CLAUDE_LOG="$tmp/claude.log"
    : > "$DONE_LOG"; : > "$CLAUDE_LOG"

    # stub cc-task: `pending` -> fixture; `done` -> append args to DONE_LOG.
    cat > "$home/.local/bin/cc-task" <<STUB
#!/bin/bash
case "\$1" in
  pending) cat <<'PEND'
${pending}
PEND
    ;;
  done) echo "DONE \$*" >> "${DONE_LOG}" ;;
esac
STUB
    chmod +x "$home/.local/bin/cc-task"

    # stub claude: record that it was called, emit a {"result": "..."} envelope wrapping the
    # fixture JSON (mirrors `claude -p --output-format json`).
    cat > "$stub/claude" <<STUB
#!/bin/bash
echo "CLAUDE-CALLED \$*" >> "${CLAUDE_LOG}"
RESULT='${claudejson}' python3 -c 'import json,os; print(json.dumps({"result": os.environ["RESULT"]}))'
STUB
    chmod +x "$stub/claude"

    OUT=$(HOME="$home" PATH="$stub:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/sbin" \
          bash -c "set -uo pipefail; $BLOCK" 2>&1)
}

PEND_HEADER='  ID          STATUS        ASSIGNEE    DESCRIPTION                                             DELIVERABLE / VERDICT
  ----------- ------------- ----------- ------------------------------------------------------- ------------------------------'

# ---------------------------------------------------------------------------------------------
echo "== CASE 1: no deliverable -> GATE SKIPS, no claude spawn =="
PEND1="${PEND_HEADER}
  T-aaaaaaaa  assigned      manager     fleet router/supervisor                                 "
run_case "$PEND1" '{"flips":[],"reopen":[]}'
echo "$OUT" | grep -q '\[task-audit\] skip (no pending task w/ deliverable)' \
    && ok "skip message printed" || bad "expected skip message; got: $OUT"
[ ! -s "$CLAUDE_LOG" ] && ok "claude NOT spawned" || bad "claude was spawned when it shouldn't be"
[ ! -s "$DONE_LOG" ]   && ok "no cc-task done calls" || bad "unexpected cc-task done call"

# ---------------------------------------------------------------------------------------------
echo "== CASE 2: deliverable present -> GATE FIRES, flips -> cc-task done, reopen -> log only =="
PEND2="${PEND_HEADER}
  T-bbbbbbbb  in_progress   ai_dag      capex x momentum verdict                                lean/strategies/dag-sa/PERF_CARD.md
  T-cccccccc  in_progress   qqqe        de-gross dose-response                                  lean/strategies/qqqe/RESULT.json
  T-dddddddd  assigned      manager     fleet router/supervisor                                 "
CJSON2='{"flips":[{"id":"T-bbbbbbbb","verdict":"capex x momentum DEAD vs flat blend","artifact":"a1b2c3d"},{"id":"T-cccccccc","verdict":"de-gross ALIVE SR+0.05","artifact":"lean/strategies/qqqe/RESULT.json"}],"reopen":[{"id":"T-eeeeeeee","reason":"auto-flip verdict was non-terminal ALIVE"}]}'
run_case "$PEND2" "$CJSON2"

[ -s "$CLAUDE_LOG" ] && ok "claude spawned (gate fired)" || bad "claude NOT spawned when deliverable present"
# exactly the model: --add-dir + --output-format json + model claude-opus-4-8 (mirror cc-review)
grep -q -- '--add-dir' "$CLAUDE_LOG" && grep -q -- '--output-format json' "$CLAUDE_LOG" \
    && grep -q -- 'claude-opus-4-8' "$CLAUDE_LOG" \
    && ok "claude invoked read-only w/ --add-dir / json / opus-4-8" \
    || bad "claude invocation flags wrong: $(cat "$CLAUDE_LOG")"

# two flips -> two cc-task done with the right ids + verdict + artifact
grep -q 'DONE done T-bbbbbbbb --verdict capex x momentum DEAD vs flat blend --artifact a1b2c3d' "$DONE_LOG" \
    && ok "flip T-bbbbbbbb -> correct cc-task done" \
    || bad "T-bbbbbbbb done call wrong: $(cat "$DONE_LOG")"
grep -q 'DONE done T-cccccccc --verdict de-gross ALIVE SR+0.05 --artifact lean/strategies/qqqe/RESULT.json' "$DONE_LOG" \
    && ok "flip T-cccccccc -> correct cc-task done" \
    || bad "T-cccccccc done call wrong: $(cat "$DONE_LOG")"
[ "$(grep -c '^DONE ' "$DONE_LOG")" -eq 2 ] && ok "exactly 2 done calls (no extras)" \
    || bad "expected 2 done calls, got $(grep -c '^DONE ' "$DONE_LOG")"

# reopen -> LOG ONLY (no cc-task done / add for it)
echo "$OUT" | grep -q '\[task-audit\] reopen-flagged T-eeeeeeee' \
    && ok "reopen logged" || bad "reopen not logged: $OUT"
! grep -q 'T-eeeeeeee' "$DONE_LOG" && ok "reopen did NOT trigger a cc-task done (log-only)" \
    || bad "reopen wrongly hit cc-task done"

# summary line
echo "$OUT" | grep -q '\[task-audit\] flipped 2 / reopen-flagged 1' \
    && ok "summary 'flipped 2 / reopen-flagged 1'" || bad "summary wrong: $OUT"

# ---------------------------------------------------------------------------------------------
echo "== CASE 3: deliverable present but claude returns empty JSON -> 0 flips, no crash =="
run_case "$PEND2" '{"flips":[],"reopen":[]}'
[ -s "$CLAUDE_LOG" ] && ok "claude spawned" || bad "claude not spawned"
[ ! -s "$DONE_LOG" ] && ok "no done calls on empty flips" || bad "unexpected done on empty flips"
echo "$OUT" | grep -q '\[task-audit\] flipped 0 / reopen-flagged 0' \
    && ok "summary 'flipped 0 / reopen-flagged 0'" || bad "summary wrong: $OUT"

echo "================================================="
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
