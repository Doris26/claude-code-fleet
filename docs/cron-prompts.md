# claude-code-fleet — supervision cron prompts (for the `cc-manager` session)

This is how you drive the supervision loop. Two options:

1. **Always-on backbone (recommended for a hands-off fleet):** the `cc-watch` script via
   **launchd** (`launchd/com.user.cc-manager.plist.template`, interval 1800s / 30 min). It is
   system-level and runs even when no Claude is alive — it reviews new commits, holds the freeze
   gate, ticks keepalive, and runs cc-monitor. **This single cron is the minimum you need.**
2. **Claude in-session crons:** a manager `claude` session drives `cc-watch` (and optional audits)
   via `CronCreate`. These fire only while that session is alive, auto-expire after 7 days, and
   don't survive a restart — so a fresh manager recreates them on takeover (see "How to recreate").

The "How to recreate" block at the bottom is copy-pasteable. The **cc-watch backbone (#1)** is the
core; the skill-capture and dream crons are **optional companions** that need tools NOT bundled
with claude-code-fleet (noted inline). Paste these prompts into `CronCreate` calls to recreate the schedule.

## Paradigm context

**Goal = continuous exploration, NOT shipping.**
Workers' success metric = new variants tested, dead-end / alive verdicts
documented. Sign-off gates (your team's rules, operator approval, promote-to-prod)
are NOT the prompt-cron's concern.

**LLM routing** (4-tier): ChatGPT DR for high-stakes / final
synthesis ($10-25, OPENAI_API_KEY); Gemini DR Mode 3 for iteration
($2-9, GEMINI_API_KEY); Claude subagent for simple search ($0); Claude
direct for one-shot reasoning ($0).

**GOAL-ONLY direction (HARD, operator lesson "你一定要用goal 增强机制")**:
ALL manager→worker DIRECTION communication MUST go through `/goal`
(`cc-goal <name> "<clean text>"` — persistent, status-bar-anchored). NEVER
a bare `ts`/`继续`/transient nudge for direction — those scroll away and
cause drift (the exact failure observed this session). `cc-goal --nudge`
(plain message) is reserved ONLY for micro-pokes (e.g. "submit the queued
msg"), never for setting/changing what a worker is working on. The hourly
self-check MUST verify every worker shows `◎ /goal active` and re-anchor any
that is missing/stale. (Note: `/goal <text>` uses the COMMAND, not the
literal "GOAL:" text prefix — that prefix stays deprecated.)

**Task tracking**: `cc-task pending` shows in-flight
tasks per worker. `cc-roster` shows worker × tmux × cron live state.
When a worker writes a deliverable file, manager should `cc-task done <id>`
to flip status.

**Worker registry**: `~/.cc-manager/workers.json` (declarative);
`~/.cc-manager/tasks.jsonl` (append-only event log).

## 1. 4-hour status report — `7 */4 * * *`

Fires at :07 every 4 hours. Outputs a 4-line snapshot of each session's
state.

```
[4-hour cc-manager status report]

You are managing tmux Claude Code worker sessions on this machine. The
user wants a concise snapshot every 4 hours.

Run:
  cc-roster            # name × status × tmux × cron × current goal
  cc-task pending      # in-flight tasks per worker

For each active worker, also run `~/.local/bin/tp <name> 50` to peek
recent pane and extract one-line current activity.

Output (under 20 lines total, no preamble):

  === 4H REPORT (HH:MM) ===

  Roster:
  [worker1]   <status> · TASK <T-id> · <last activity 1-line>
  [worker2]   <status> · TASK <T-id> · <last activity 1-line>

  Pending tasks (cc-task pending): <count>
  Completed since last report: <count>  (run cc-task list --status completed and diff)

  Action items for next 4h: <if any blocked tasks or stuck workers>

State labels: mid-work / DR-firing / waiting / blocked / completed-today / gone.
End right after last bracketed line.
```

## 2. 12-hour cross-learning broadcast — `13 */12 * * *`

Fires at :13 at 00 and 12 hours. Tells every worker to read recent git
log + scan other sessions' work directories for cross-pollination.

```
[12-hour cross-learning broadcast]

Run this single command, then report which sessions received it:

  ~/.local/bin/cc-broadcast "12h 互相学习时间。花 5 分钟:(a) git log --oneline --since='12 hours ago' -30 看其他 workers 在做什么;(b) 扫一下其他 workers 最新的 verdict / 结论文件 看他们试了哪些方向。如果有 takeaway 可用于你本职任务(别人发现的资源 / DR prompt 套路 / 死路结论你不重复)记下,然后回到本职。goal 是探索不是 ship,死路也算成果。"

Output one short summary line: "broadcast sent to N sessions, M skipped
(reasons: ...)". No commentary beyond that.
```

## 3. Hourly self-supervision audit — `17 * * * *`  [REMOVED — :17 deleted by operator]

Fires at :17 every hour. Detects "manager not actually supervising"
patterns and auto-fixes the underlying bug. Hourly (not 15-min) on
purpose: the launchd `cc-watch` already runs the 30-min MECHANICAL pass
(nudge + cc-monitor); this cron is the lower-frequency LLM-judgment layer
on top, and an hourly cadence avoids colliding with the launchd tick +
the API contention that 30-min LLM fires caused at 6 sessions.

```
[hourly self-supervision audit — manager]

You are the cc-manager. Check whether you're actually doing your job
(supervising 4 worker sessions properly) and fix any bug you find.

Step 1 — snapshot:
  - tail -30 /tmp/cc-manager.log
  - for each session in ~/.cc-manager/watch.list:
      report last log entry age + current pane bottom (~8 lines)

Step 2 — flag supervision-missed if ANY:
  (a) Stale log: last [<session>] entry > 1800s old (launchd fires every
      15 min as of 2026-05-27, so each session should have an entry
      every ~15 min)
  (b) Stuck-on-skip: last 5 log entries same skip reason
  (c) Brain unparsable: log shows cc-decide unparseable response
  (d) Worker idle, no spinner, no monitor, no draft — but no recent sent:
  (e) Mid-work verb appears in pane but watcher tried to send anyway
      (regex missed a glyph)
  (f) Fake-blocker idle: pane self-declares "等 X / blocked / pending /
      hold for Y" for 2+ cycles AND last sent: was bare 继续. Verify
      whether X/Y exists (file/repo/feature). If invented, ts a
      context-aware unblock ("X 不是 blocker, 因为 Y; 继续推 Z"). If
      real but unescalated, `cc-task block <T-id> "<reason>"` + flag for user.
  (g) **Task completion missed** (BACKSTOP to cc-monitor auto-flip):
      cc-monitor now AUTO-FLIPS any active task whose deliverable exists
      (file / glob / dir) AND whose worker pane shows a TERMINAL verdict
      (DEAD-END / CLOSED / 闭环了 / 交付完成 / verdict DEAD|DELIVERED).
      Your job is the cases it deliberately leaves: deliverable exists but
      pane shows a NON-terminal verdict (bare ALIVE / partial) or no verdict
      — cc-monitor only FLAGS these ("STALE" / "non-terminal verdict"). For
      each flagged task, READ the actual deliverable (do not keyword-match)
      to confirm it is genuinely closed, then
      `cc-task done <T-id> --verdict "<one-line>" --artifact <commit-sha>`.
      If still iterating, leave it. Also sanity-check cc-monitor's auto-flips
      in /tmp/cc-manager.log ("AUTO-FLIPPED") — re-open via `cc-task add` if
      one was wrong.

Step 3 — diagnose + fix:
  - Edit ~/.local/bin/cc-watch or ~/.local/bin/cc-decide
  - bash -n to verify parse
  - Run ~/.local/bin/cc-watch once manually, confirm no errors
  - Sync to <CC_HOME>/bin/
  - Commit + push: "fix(cc-manager-self-audit): <one line>"

Step 4 — output one of:
  audit (HH:MM): all 4 sessions supervised correctly, no gaps
  audit (HH:MM): N issue(s) found, fixed M; <one line per issue>
  audit (HH:MM): N issue(s) found, M unfixable (need user); <one line each>

End right after the line.
```

## 4. Hourly task-status audit — `41 * * * *`  [REMOVED — folded into cc-watch backbone]

Fires at :41 every hour (offset from the :17 self-check). The careful
LLM backstop to cc-monitor's mechanical auto-flip: cc-monitor closes
deliverable+TERMINAL-verdict tasks automatically, but ambiguous/partial
ones need a human-grade read of the actual deliverable.

```
[hourly task-status audit — manager]

You are the cc-manager. Audit task state — do NOT trust pane keywords,
READ the actual deliverables.

Step 1 — list:
  cc-task pending             # active tasks per worker
  cc-task list --status completed | tail -10   # recently auto/hand-flipped
  tail -40 /tmp/cc-manager.log | grep -E "AUTO-FLIPPED|STALE|non-terminal"

Step 2 — for each PENDING task with a deliverable:
  - Resolve the deliverable (file / glob / dir) and OPEN it. Read enough
    to judge: is this genuinely closed, or still iterating?
  - Genuinely closed → cc-task done <T-id> --verdict "<one-line, read from
    the doc's own verdict, not a guess>" --artifact <commit/path>.
  - Still iterating / await-state with no deliverable → leave it, but if a
    worker is idle in await-state with an UNWRITTEN deliverable, nudge it
    to produce the deliverable (await-state never excuses a missing doc).

Step 3 — sanity-check cc-monitor's auto-flips (log "AUTO-FLIPPED"): open
each auto-flipped deliverable; if one was flipped wrongly (verdict was not
actually terminal), re-open via `cc-task add` with the same assignee +
deliverable and note the false-flip so the TERMINAL_VERDICT_REGEX can be
tightened.

Step 4 — output (no preamble):
  task-audit (HH:MM): pending N · flipped M this hour · false-flips F
  <one line per task flipped or re-opened>

End right after the last line.
```

## 5. 12-hour mechanism grill — `13 6,18 * * *`  [ACTIVE]

Fires at :13 at 06 and 18 local. The adversarial self-audit of the
fleet's OWN machinery. **Scope = the whole fleet mechanism, NOT just
cc-monitor** (broadened after the narrow version missed an
`auto_skill_capture.py` crash bug: a byte-identical UPDATE staged nothing
→ `git commit` exited 1 → `check=True` killed the whole run; the operator
flagged that this grill should have caught it). Two tracks, alternated
each fire (A → B → A …). The old version also hardcoded `git add
bin/cc-monitor` in step 5 — which would have blocked
committing any non-monitor fix; now it adds the specific grilled file.

```
[cc-manager 自审] 每12小时一次的机制 grill。慢、认真。一次只 grill ONE target,两个 track 交替(本次 A → 下次 B → 下次 A …):

TRACK A — cc-monitor 检测 pass(读 bin/cc-monitor 里该 pass 函数+调用链),按序轮:check_deliverables / check_completed_integrity / check_ship_drift / check_repeated_nudge / check_dropped_tasks / check_uncommitted / check_goal_stale / check_run_proof
TRACK B — fleet 支撑脚本(读整脚本),按序轮:bin/cc-decide / bin/cc-watch / bin/cc-goal / bin/cc-broadcast / bin/cc-add

步骤:
(1) Read 选中 target 的全文。
(2) 对抗性 grill:找一个 worker 能用来 evade 的 spoof,或一个会让脚本崩溃/静默丢数据/误判的真漏洞。重点嗅:check=True 在可空/no-op 输入上崩溃、超时静默丢弃、git 失败未保护、正则过宽过窄、cwd/路径假设、并发/auth 竞态。
(3) 发现真漏洞 → 写最小 fix + 一个可执行验证(unit / pipe-test / py_compile + 行为断言)。
(4) 跑回归确认没新增 false-positive/回归:TRACK A 跑 `bin/cc-monitor`(无 flag=run_all);TRACK B 跑 `python3 -m py_compile <脚本>` + 针对性 smoke。
(5) 有改动就 commit+push,`git add` 只加**本次被 grill 的那个具体文件**(用变量,绝不写死成 cc-monitor,绝不 git add -A/.)。
(6) 没发现问题记一行结论(target 名 + 已确认无洞)。

中文简短汇报。记住范围是整个 fleet 机制,不只是 cc-monitor。
```

## Active-worker gate — crons are "there" but turn ON only with active workers (operator lesson)

These supervision crons exist to SUPERVISE WORKERS. A manager that is alone (`watch.list`
empty, no workers) has nothing to supervise — firing the audits then just burns tokens on an
empty fleet. Operator directive: *"cron should be there, just turn on on condition active workers"*
and *"只有你自己是不需要cron的"*.

**Only the worker-supervision crons are gated** (operator correction): `:17` self-audit and
`:41` task-audit supervise workers → GATE them. `:13` mechanism-grill audits the *machinery*
(worker-independent) → **do NOT gate it**; it runs regardless of worker count (quiet = best time to
grill, no contention), subagent-driven, deferring only on active-CCDR contention.

So the **`:17` / `:41`** prompts MUST begin with a worker-presence GATE (the crons stay
created/"there"; they self-gate OFF when the fleet is empty and auto-activate when the first
worker is recruited — no create/delete churn to forget):

```
[GATE — run FIRST every fire] worker count = `grep -c . ~/.cc-manager/watch.list 2>/dev/null || echo 0`
(absent/empty = 0). If 0 → reply "cron-skip: no workers, gated off" and STOP (do not read logs,
peek panes, or run any audit). Only if ≥1 worker, proceed: <the audit prompt below>
```

The launchd `com.user.cc-manager` (cc-watch: commit-review + freeze + survives manager death)
is NOT gated by this — it self-no-ops its per-worker passes cheaply in bash and still reviews
new commits / holds the freeze gate, so it stays always-on.

## How to recreate (fresh session)

```python
# ⚠️ launchd DISABLED (operator: "systemcron都关 / 只保留 claude cron"). NO system-cron fallback
# remains — these Claude in-session crons are the ONLY supervision, and they DIE when this manager
# session exits. A fresh manager MUST recreate ALL of these on takeover, or there is ZERO supervision
# (no cc-review on commits, no freeze, no keepalive, no task-audit). RECREATE ALL 4.
#
# ⚠️ EVERY recurring cron DELEGATES TO A SUBAGENT (operator, emphatic: "you make sure you use
# subagent to do the cron so do not occupy your heavy context!!!!"). The cron prompt must tell the
# manager: do NOT run the work in your own context — SPAWN a subagent (Agent tool, general-purpose),
# have IT run the command, and relay ONLY the subagent's one-line result. The heavy output (cc-watch
# logs, skill-capture diff, dream's transcript scan) stays in the subagent's context; the manager
# keeps a light context. The wording below already encodes this — do NOT revert to bare `run: ...`.

# 1. BACKBONE — cc-watch: freeze-gate + keepalive + cc-review on NEW commits + cc-monitor + TASK-AUDIT.
#    ⚠ ON-DEMAND, NOT 24/7 — this is the EXCEPTION to "RECREATE ALL 4" above.
#    WHY cc-watch exists: catch workers who STOP EARLY / slack (declare done or go idle when there is
#    genuinely MORE to do; DEAD != done). The manager VERIFIES genuine completion, never accepts a
#    premature "done". BUG it caused: an always-on 30min cron has NO "fleet genuinely-done -> stop
#    watching" off-switch, so it idle-spins a ~30k subagent EVERY tick even when all work is genuinely
#    complete or held-pending-user = ~1.4M tok/day pure waste. NEW MODEL: CREATE this cron ONLY when a
#    worker is ACTIVELY working (dispatch / cutover / research producing commits needing cc-review or with
#    runaway risk); DELETE it the moment the manager VERIFIES genuine completion OR the work is held
#    pending a USER decision. Idle/standby/held fleet = NO cc-watch (run cc-review manually on any one-off
#    important commit meanwhile). At takeover, do NOT blindly recreate this if the fleet is idle — only run
#    it around genuinely-active work. DELEGATED to a subagent (template below = create when active).
#    ⚠ GATED + ALL-CRONS-ON-DEMAND: the recurring cc crons are NOT free — each subagent spawn costs
#    ~30k tokens regardless of work found, so an idle fleet idle-spins them (cc-watch alone ~1.4M tok/day).
#    TWO rules: (a) on an idle / wound-down / held-pending-user fleet, DELETE every cc cron (run any one-off
#    check manually); recreate ONLY when a worker is actively producing commits/runaway-risk. (b) even when
#    armed, cc-watch SELF-SKIPS idle ticks via `cc-watch-gate`: the cron runs the gate FIRST in the
#    manager's own cheap turn and spawns the ~30k subagent ONLY on SPAWN (new commit | uncommitted | a
#    worker mid-turn 'esc to interrupt'); SKIP relays one line, no subagent. Gate fails OPEN to SPAWN.
CronCreate(cron="4,34 * * * *",  durable=True, prompt="[cc-watch backbone — every 30min · launchd OFF · GATED · USE A SUBAGENT (keep manager context light)] FIRST gate cheaply in YOUR OWN context (do NOT spawn yet): run `bash <CC_HOME>/bin/cc-watch-gate`. If it prints 'SKIP ...' → relay that one line ('cc-watch SKIP: <reason>') and STOP — do NOT spawn a subagent (idle-spin fix). If it prints 'SPAWN <reason>' → THEN SPAWN a subagent (Agent tool, general-purpose) with task: 'Run: bash <CC_HOME>/bin/cc-watch 2>&1 | tail -20. This does cc-review on new commits + freeze-gate + keepalive + cc-monitor + task-audit. Report ONE line: commits reviewed / freeze state / anything that needs the manager.' Relay ONLY the subagent's one line.")
# 2. SKILL-CAPTURE — [OPTIONAL companion: needs `auto_skill_capture.py`, a separate tool NOT bundled
#    with claude-code-fleet]. Mines landed commits into a reusable skills library. DELEGATED to a subagent.
CronCreate(cron="12 5 * * *",  durable=True, prompt="[skill-capture — DAILY · USE A SUBAGENT (keep manager context light)] Do NOT run it in your own context. SPAWN a subagent (Agent tool, general-purpose) with task: 'Run: python3 ${CC_REPO}/bin/auto_skill_capture.py --hours 24 --commit. Report ONE line: skills captured/updated + commit sha, or none.' Relay ONLY the subagent's one line.")
# 3. MECHANISM-GRILL — 12h adversarial fan-out of the machinery; NOT gated. Already subagent-driven
#    (the workflow IS the fan-out); the cron prompt just launches it.
CronCreate(cron="13 6,18 * * *", durable=True, prompt="<paste prompt 5 above>")
# 4. DREAM — [OPTIONAL companion: needs the `/dream` memory-consolidation skill, NOT bundled with
#    claude-code-fleet]. Memory consolidation DAILY: the /dream skill scans transcripts →
#    consolidates memory → rebuilds MEMORY.md lean (<200 lines). Fights "memory rot" (counterpart to
#    skill-capture's "skill rot"). NOT gated. Transcript scanning is heavy → DELEGATED to a subagent.
CronCreate(cron="27 5 * * *", durable=True, prompt="[dream — memory consolidation DAILY · USE A SUBAGENT (memory scanning is heavy)] Do NOT run it in your own context. SPAWN a subagent (Agent tool, general-purpose) with task: 'Invoke the /dream skill on the project memory; if not loaded, read ~/.claude/skills/dream/SKILL.md and run its 4 phases (Orient → Gather Signal → Consolidate → Prune & rebuild MEMORY.md lean). Report ONE line: memories consolidated/pruned + MEMORY.md line count.' Relay ONLY the subagent's one line.")
# REMOVED: :17 self-audit (deleted by operator — not needed); :41 task-audit (folded into the
# cc-watch backbone above as a gated LLM backstop after cc-monitor — no separate cron).

# OPTIONAL heavier crons (periodic reports / cross-learning; interrupt workers + add API load, off by default):
CronCreate(cron="7 */4 * * *",  durable=True, prompt="<paste prompt 1 above>")  # 4h status report
CronCreate(cron="13 */12 * * *", durable=True, prompt="<paste prompt 2 above>") # 12h cross-learning broadcast
```

Note: `durable=true` does NOT actually persist — all Claude crons die with the manager session
(empirically verified). Since launchd is now DISABLED, NOTHING survives session loss / reboot — there
is no durable backbone anymore. This is the deliberate operator choice: all supervision is
Claude-cron, session-bound. The cost: a fresh manager that forgets to recreate the 4 above = ZERO
supervision until it does — so recreating them is the manager's FIRST takeover action (wired into the
cc-manager persona + cc-recruit). Each of the 3 recurring work-crons (cc-watch / skill-capture / dream)
DELEGATES to a subagent so the manager context stays light; only the grill's fan-out is intrinsic.
To re-enable the durable launchd backbone instead:
`launchctl load -w ~/Library/LaunchAgents/com.user.cc-manager.plist` (+ auto-skill-capture).

## Auto-expiry note

All jobs auto-expire after 7 days. If the manager session is alive
that long, refresh by deleting (`CronDelete <id>`) and recreating.
