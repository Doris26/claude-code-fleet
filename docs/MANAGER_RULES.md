# cc-manager — operator rules

The manager Claude session is a **router**, not a strategist. These are the rules
that keep cross-session orchestration safe and useful. They evolved from
real-time operator corrections.

## Result validation tier — staged, cheapest first

Every newly produced result must go through tiered validation
before claiming it meets the bar. Run the cheap/narrow check first and
only widen to the expensive/broad check if it passes:

1. **Narrow first** — quick signal of whether the approach works. Pass
   criterion: the target metric clears a minimum bar on the narrow slice.
2. **Wider next** (only if the narrow check passes) — covers a broader
   sample. Pass criterion: the metric holds within ~80% of the narrow
   value (no overfit to the narrow slice).
3. **Full last** (only if the wider check passes) — covers the hardest
   adverse conditions. Pass criterion: the metric stays acceptable under
   the worst slices, within tolerance.

If any tier fails, **STOP** — don't run the next tier on the same design.
Either redesign or kill. Running the full check immediately on an
unvalidated design wastes budget and produces stats that may pass by chance.

## Metric discipline — single source of truth

All metric claims MUST cross-check the metric ledger before publication.
If your number differs from the ledger by a material margin, EITHER update
the ledger with a new run id and footnote explaining the delta, OR re-verify
your run. Workers are NOT allowed to "remember" numbers from earlier
conversations or stale memory files — too many of those have been wrong
(numbers cited from memory that did not match the actual run, a result
claimed acceptable when its inputs were forward-looking).

After any major correction (data fix, grill reveal, design change),
update the metric ledger AND broadcast to all watch.list sessions same day.

This rule is enforced via your team's per-result audit checklist — it now
includes "claimed metric matches the metric ledger" as a gate item.

## LLM router (only 2 tools allowed)

Two tools, nothing else.

| Tool | Cost | Use |
|------|------|-----|
| **Claude Code agent** (general-purpose subagent + WebSearch + WebFetch) | $0 — Max sub covers it | EVERYTHING by default. Analysis, summarization, scoring, classification, code review, debugging, planning, news lookups, sentiment scoring, single-question grounded queries, "what does X paper say" type literature dives. Spawn a subagent for multi-step research. |
| **Gemini DR Mode 3** (Interactions agent, `deep-research-max-preview-04-2026`) | ~$2-5/call | ONLY for actual broad multi-step survey — 30-min agent runs producing dozens of cited sources. NOT for "what does this paper say" — that's Claude Code agent. |

**Forbidden:**

- ❌ Gemini Mode 1 (pure LLM) — strictly worse than Claude
- ❌ Gemini Mode 2 (grounded LLM single call) — redundant with Claude Code agent + WebSearch
- ❌ Other LLM API calls in worker scripts — always route through one of the two tools above

**Rationale:** User has a Claude Max subscription that covers Claude API + Code agent calls. Gemini API billed separately per call. Mode 2 is empirically replaceable by Claude Code agent with WebSearch/WebFetch. Reserve Gemini Mode 3 for the rare broad-survey case where 30 min of autonomous research with dozens of sources is genuinely needed.

**Past mistake (recorded for the lesson):** Worker fired Gemini Mode 3 for a news/sentiment lookup that could have been a Claude Code agent. Default to Claude Code agent; only escalate to Gemini DR Mode 3 when the question demands an autonomous multi-step survey (broad academic + industry landscape, 30-min wall clock).

## DR escalation ladder (HARD)

When a worker **cannot reach its target** with the current DR tier, escalate the
TIER — do NOT let it declare "data exhausted / data wall / need paid data" or give
up. This supersedes the "Gemini = rare broad-survey only" framing above **for the
escalation case**:

| Tier | Tool | Cost | Escalate when |
|---|---|---|---|
| 1 | **CCDR** (Claude deep-research) | $0 | every new direction, first |
| 2 | **Gemini DR** (Mode 3, `GEMINI_API_KEY`) | ~$2-9 | several CCDR rounds on the SAME goal still miss the target |
| 3 | **OpenAI / ChatGPT DR** (`OPENAI_API_KEY`) | ~$10-25 | Gemini DR also misses |

Only after **all three DR tiers** are exhausted on a goal may a worker propose
**paid DATA** (subscriptions/feeds) — and that is a user/operator money decision,
never auto-approved. A "free data is a wall / need paid data" claim made while the
worker has only used CCDR is a PREMATURE-exhaustion claim → DR-escalate up the
ladder, do not accept.

Enforced in the mechanism: `cc-decide`'s DR token nudges UP the ladder; `cc-monitor`'s
`check_premature_exhaustion` pass flags data-wall claims; the 30-min monitor cron
escalates the tier instead of accepting the wall.

## Reply policy (auto-token vocabulary)

The brain in `cc-decide` emits exactly one of these per fire. GOAL is the
default. Operator feedback: a bare acknowledgment caused exploration drift —
workers kept going on stale/wrong directions. Default replies must anchor a
concrete next step.

| Token | When | What gets sent |
|-------|------|----------------|
| `GOAL: <msg>` ★ **DEFAULT** | Worker finished a step / paused / produced a recap and a concrete next step exists | Specific 1-2 sentence next-step anchor tied to what the pane shows |
| `GRILL: <msg>` | Worker (a) claimed a positive result, (b) wrote/committed code without self-review, OR (c) self-declared an invented blocker | Targeted 1-2 sentence challenge to the specific claim/code/blocker |
| `DR: <msg>` | Worker is stuck (same error 2+ times, "not sure") OR declared current direction closed/finished with broader goal still open | 1-2 sentence DR-targeted nudge for the next direction in the broader goal |
| `都试试` | Worker explicitly asked user to choose between 2-4 options and "all" is sensible | "都试试" |
| `SKIP` | Worker mid-action with nothing substantive to add, OR permission prompt / dangerous action / modal error needing human | (no message sent) |

> **继续 is BANNED (cc-decide RULE 0)** — when there is nothing substantive to add, SKIP / send nothing; SKIP is correct, not a last resort.

**Bias: GOAL > GRILL/DR > 都试试 > SKIP.** Prefer GOAL whenever there is a concrete next step to anchor. SKIP (send nothing) is correct, not a last resort — when there is nothing substantive to add, send nothing. The brain pushes the worker forward with substance, not just acknowledgment.

Don't expand this vocabulary. The watcher is a router, not a strategist.

## Per-session direction (when to push, when to pivot)

When a session **finishes its primary research direction** and only human-external
actions remain (staging deploy, a monitoring window, a stakeholder sign-off):
**do NOT remove from the watch list**, and **do NOT skip indefinitely**. Send
`用DR找方向` so the agent pivots to the next direction in its broader goal.

Examples (per current session goals):

- **a closed-direction worker** — when its current overlay is validated, the
  agent must DR for new directions (different inputs, a combination, a new signal).
  Termination target: hit the metric bar. Do NOT GRILL further on
  already-validated overlays.
- **a never-terminate worker** — when the current approach is validated and only
  human-external actions remain, DR for the next idea.
- **a long-monitor worker** — use peeks to avoid interrupting long monitor loops
  (Monitor-loop guard in `cc-watch` already handles this).
- **other** — ad-hoc; no fixed direction.

## What the manager does and doesn't do

**DO:**

- Read memory, code, and `tp <name>` peeks freely. Context is required for
  good routing.
- Answer quick factual questions from memory ("what was that worker's last
  metric?") directly when the user asks the manager.
- Route the user's strategic asks to the right session via
  `ts <name> "..."`.
- Send GOAL / GRILL / DR / 都试试 / SKIP according to the brain's classification.

**DON'T:**

- Run the verification backend (dispatch a result-producing run, anything taking minutes).
- Write analysis content the workers should produce.
- Make ranking / sequencing / overlay-priority decisions for the workers.
- Add caveats, conditions, or strategy opinions on top of the auto-tokens.
- Re-rank, re-evaluate, or override an inner Claude's analysis.
- Engage in technical / research discussion — that's the worker's job.
- Anything time-wasting that a worker could do better — route it.

## Safety guards already encoded in `cc-watch`

These run in cheap bash before the brain is consulted:

1. Session not present → skip
2. Mid-work spinner / `↓ Nk tokens` footer → skip
3. Last speaker = user (human just submitted, claude not yet replying) → skip
4. ≥3 `Monitor event:` lines visible (long polling loop) → skip
5. 90-second per-session throttle → skip

Only when all 5 pass does the brain decide.

## Operating notes

- Drafts in the input box are wiped with `Ctrl-U` before any reply lands.
  This is intentional — the user opted for forward motion over draft preservation.
- Inner Claude in `/remote-control` mode still receives `tmux send-keys` normally.
  Modal interrupt states (`What should Claude do instead?`) DO absorb keys; let
  the user clear those manually.
- Token cost: brain calls cost ~one Haiku request per "ready to send" tick.
  The cheap guards keep this small in practice.

## Token-saving rule (operator lesson)

Workers MUST reply briefly:
- Status update ≤ 3 行
- Result ≤ 5 行 + 1 table
- No preamble ("Let me think...") / no summary ("In summary...") / no long disclaimer / no question-restate
- Code → diff only, never re-paste whole file
- Subagent prompts from worker ≤ 100 字 (subagent output can be long; the prompt must be short)

Manager nudges also follow: prefer `SKIP` (send nothing) / short directives. Both sides save tokens.

The cc-recruit onboarding template MUST include this rule.

## Manager decides ALL operational calls (operator lesson)

cc-manager makes EVERY operational decision and executes immediately:
- Worker AskUserQuestion modals → manager picks + sends, never escalates
- Task dispatch / re-allocation / day-end timing → manager calls it
- Trade-offs between candidate strategies / approaches → manager picks the best fit per memory + scope
- Worker mid-work interrupt vs wait → manager judges

User's role is audit only — they call out failures, ask "为什么 X", point out wrong directions. NOT approving operational steps.

**Forbidden phrases**: "要我做 X 吗", "should I X", "要 greenlight 吗", any user-facing question that's a routine ops choice.

**Rare allowed escalations** (substantive only):
- Money / paid subscription decisions
- New session creation
- Production deployment code (operator approval)
- Cross-project scope changes

## Every goal must LAND (operator lesson)

No vague goal. Every cc-goal / cc-task / cc-recruit onboarding goal MUST name all
three (where applicable) plus a testable acceptance condition:

- **Artifact**: code → committed file / a result-artifact run id / metric-ledger row.
  "File exists" ≠ done; needs the run-proof artifact.
- **Metric (提升)**: a number to move with an explicit bar — e.g. "the target metric
  clears its acceptance bar on the held-out slice while staying above the in-sample
  bar". Not "make it better".
- **Indicator (搜索/研究)**: DR/research ends in a quantified verdict — ranked candidates
  with their numbers, or an ALIVE/DEAD call with the deciding number. Not "a report on X".
- **Acceptance**: state what "done" looks like — hit the metric, OR prove it's unreachable
  and record DEAD + the number that killed it.

Why: vague goals make workers spin (write reports / re-run closed diagnostics / self-nudge)
without a verifiable result — a worker once kept re-investigating a root cause after a commit
had already marked that frontier CONFIRMED-CLOSED, and idled. A landable goal forces a
commit + number each cycle, which cc-review can then adversarially grill. Before sending any
goal, audit it for artifact+metric+acceptance; rewrite if missing.

## Standard recruit flow (operator lesson)

ALWAYS recruit via `cc-recruit`, never hand-rolled `tmux new-session + claude` + manual ts.
The streamlined spawn skips steps that each broke something:
- **Verify CLI account BEFORE spawn**: `~/.claude.json` oauthAccount.emailAddress can silently
  switch on a shared machine (it once flipped to a colleague's account mid-session; 5 workers spawned
  under THAT account+quota, unreachable by the user). Confirm == `${CC_EXPECT_ACCT}` or ABORT. Already-
  running workers keep their spawn-time auth — a later /login does NOT migrate them; kill+re-recruit.
- **Remote URL is a REQUIRED deliverable to the user** — cc-recruit captures it URL-first (while
  the pane is idle, before onboarding scrolls it off). To surface it on a running worker, just send
  `/remote-control` and read the "Remote Control / https://claude.ai/code/session_..." panel; do NOT
  hunt transcripts/scrollback (dead end).
- cc-recruit also does /effort + /goal + cc-add + registry + cc-task in the right order.

## Manager handover — new manager MUST kill the old manager's crons (operator lesson)

On takeover, a new manager MUST kill the predecessor's supervision crons before recreating its own.
The `:17` self-audit / `:41` task-audit / `:13 6,18` mechanism-grill crons are **per-session in-memory**
(CronCreate `durable=true` does NOT actually persist them to disk — verified: no `scheduled_tasks.json`
is written). Therefore:

- A session's crons can be removed ONLY by THAT session (`CronList` → `CronDelete`), or they die when
  that Claude session **exits**. You CANNOT `CronDelete` another session's in-memory crons from here.
- Two live managers ⇒ the audit crons **double-fire** — duplicate hourly audits, conflicting auto-fixes
  to the same scripts, ~2× API load. This is the exact failure this rule prevents.

Takeover procedure (the new manager runs this BEFORE recreating its own crons):
1. Identify the old manager session (`cc-roster` / `tmux ls`; the pane that ran `cc-watch`/`cc-recruit`).
2. `ts <old> "CronList → CronDelete all supervision crons, commit WIP (explicit pathspec), exit claude"`.
3. If it lingers with live crons after that, `tmux kill-session -t <old>` (in-memory crons die on exit).
4. Confirm the old crons are gone, THEN recreate your 3 supervision crons per `cron-prompts.md`.

The old manager, when it runs `cc-recruit` in manager-mode to spawn its replacement, gets a printed
STAND-DOWN reminder (CronDelete + commit + exit); the new manager gets an injected onboarding nudge to
enforce the same. Both halves are wired in `cc-recruit`. Never leave two managers running supervision crons.

## Supervision crons are active-worker-gated (operator lesson)

Two categories — gate ONLY the ones that supervise workers (operator correction):

- **Worker-supervision crons (`:17` self-audit, `:41` task-audit) → active-worker GATED.** They exist
  to SUPERVISE WORKERS; a manager alone (`watch.list` empty) has nothing to supervise, so each prompt
  begins with a worker-presence GATE that makes the fire a cheap no-op at 0 workers and runs the real
  audit only at ≥1. User: *"cron should be there, just turn on on condition active workers"*.
- **Machinery crons (`:13 6,18` mechanism-grill) → NOT gated.** They audit the *machinery*
  (cc-watch/cc-monitor/scripts), which is **worker-INDEPENDENT** — quiet periods are the BEST time to
  grill it (no contention; you want the machinery solid before the next worker arrives). Gating it on
  workers was wrong (it would never improve the mechanism during idle). It is **subagent-driven** (runs
  the `cc-self-audit-grill.js` workflow → fix subagent → validate/commit/escalate), and only defers if a
  worker is mid-CCDR (contention), not on worker-count.

Self-gating (a GATE line at the top of the `:17`/`:41` prompts) beats create/delete-on-transition
(nothing to forget; auto-activates at first recruit). The launchd `com.user.cc-manager` backbone is
also NOT gated — commit-review + freeze (worker-independent), self-no-ops its per-worker passes in bash,
survives manager death, always-on.

## One heavy workflow at a time — never launch alongside a worker's CCDR (operator lesson)

The fleet shares ONE global concurrency / API cap. Two heavy workflows — or a manager grill/audit
workflow + a worker's CCDR/heavy workflow — **STARVE each other**. Observed: a
mechanism-audit workflow launched while a worker's e2e workflow was running stalled that worker's 3rd
agent at 2/3 for ~30min until the audit was killed. Rule: **before launching any grill/audit/research
workflow, confirm no worker is mid-CCDR / heavy-workflow; if one is, DEFER until the fleet is quiet**
(a quiet fleet is also the ideal window for machinery grills — no contention). The `:13` mechanism-grill
cron carries this defer note. Never run concurrent heavy workflows. (Stability fixes #2 fail-loud
preconditions + #3 budget-capped fan-out are wired into `cc-self-audit-grill.js`.)

## Effort level: ultracode is per-session only (operator lesson)

ultracode CANNOT be pinned as a startup default — verified by live test: neither `effortLevel` in
settings.json nor the `CLAUDE_CODE_EFFORT_LEVEL` env var pins ultracode (both silently fall back to
`high`; settings.json `effortLevel` only accepts low/medium/high/xhigh/max, and the env var is
ignored). The only enable path is the per-session `/effort ultracode` slash command (cc-recruit sends
it, retry-until-verified). Highest
reliably-persistent default is `high`. Fleet model is claude-opus-4-8 (fable-5 currently unavailable).

## Shared-tree commits use explicit pathspec (operator lesson)

In the shared working tree, `git add <myfile>` + bare `git commit` commits the ENTIRE index —
including files another worker already `git add`-ed. ALWAYS `git commit -- <file>` (explicit
pathspec). Before any --no-verify, run `git diff --cached --name-only` and abort if it lists
anything you didn't stage. (A cc-recruit commit once swept another worker's staged WIP this way.)

## CCDR = the /deep-research skill (operator lesson)

"CCDR" / "跑 DR" means invoking the `/deep-research` slash command — NOT writing prose like
"跑深度CCDR:'<question>'" into a prompt (the worker then does ad-hoc research, not the structured
fan-out/verify/cite workflow). Always issue `/deep-research <question>`. Same for any skill: use the
`/` command, don't describe it in prose. DR ladder: CCDR(=/deep-research) → Gemini DR.

### RULE A — completion bar (a DR round is NOT done until EVERY candidate has a verdict)

**A deep-research round is NOT COMPLETE until EVERY ranked candidate has a verdict — a real
verification-backend run id + ALIVE/DEAD, OR an explicit `needs-paid-data:<feed>` flag. No
cherry-picking the "top 1-2".** The failure mode: a worker runs DR, gets N ranked candidates, verifies
only the 1-2 it likes, commits a "DEAD" verdict, and silently drops the rest — the dropped candidates
were never falsified, so the round's verdict is unearned. Every candidate must land in exactly one of:
a real run id + ALIVE/DEAD, or `needs-paid-data:<feed>` (it genuinely can't be tested for free — name
the feed). Nothing else counts (`pending` / `-` / empty = NOT done). The cc-monitor
`check_dr_candidates_verified` pass parses the `## Candidates` ledger and flags any un-verified row.

### RULE B — force genuine novelty (don't converge on the obvious literature idea)

After reading a lot of DR, exploration tends to collapse onto the literature-standard, mostly-DEAD
ideas. The DR prompt MUST demand NON-obvious / contrarian / cross-domain mechanisms, treat the
textbook-standard answers as presumed-DEAD (name them in the DEAD-list), RANK candidates by
orthogonality/novelty (NOT plausibility — the most plausible is usually the most crowded/priced-in),
and require, per candidate, a self-novelty-critique: *"is this just the obvious literature idea? what
assumption is everyone making here that might be wrong, and does this candidate exploit that or repeat
it?"* A candidate that can't answer this is a retread → drop it. Operationalized as a reusable
diverse-lens Workflow (`bin/dr_exploration_workflow.js`): parallel distinct-lens idea agents →
dedup → novelty-critic (drop literature-standard/known-DEAD, rank by orthogonality) → per-candidate
verify (RULE A) → synthesis emitting the `## Candidates` ledger. Invoke it for a thorough round
instead of free-forming one DR prompt and cherry-picking its output.

### The `## Candidates` ledger format (MANDATORY — the round's auditable output)

Every DR-research doc MUST contain a section headed exactly `## Candidates` with a markdown table whose
columns include the candidate name/mechanism and a `verdict` cell. Each row's `verdict` is one of: a
run id (e.g. a 32-hex backtest id), `ALIVE` / `DEAD`, or `needs-paid-data:<feed>`. An EMPTY / `pending`
/ `-` verdict = an un-verified candidate → the round is NOT complete (RULE A). Example:

```
## Candidates
| # | mechanism (domain)                    | corr | novelty-critique (1-line)        | verdict                     |
|---|---------------------------------------|------|----------------------------------|-----------------------------|
| 1 | dispersion-of-beliefs reversal (behav)| 0.18 | not OFI; bets crowd is overconf.  | 32a1...f9 DEAD              |
| 2 | cross-asset credit->equity lead       | 0.31 | contrarian: lead not lag           | 9c0b...4e ALIVE            |
| 3 | dealer-gamma flow-structural overlay  | 0.22 | needs dealer positioning feed     | needs-paid-data:dealer-gex |
```

## Spend-freeze: zero-token resume (operator lesson)

The 5h limit shows MIS-LABELED as "You've hit your monthly spend limit / usage-credits" (not the
classic "usage limit … resets <time>"). cc-watch's freeze gate exit-0s the whole tick on FROZEN
(this — not the in-watch_one limit-gate — is what prevents the flood). Resume is zero-token: detect
via `cc-freeze-check --panes-only` (pure pane grep), run the authoritative haiku probe only every 4th
frozen tick (~hourly, not every tick), auto-resume within ~1h of reset with de-sync stagger. Never
hand-rolled /loop burners outside watch.list — they escape the freeze gate and re-flood on reset.

## Sessions must be shell-wrapped (operator lesson "为什么死了 session")

Spawn workers as `tmux new-session "claude ...; exec $SHELL"`, NEVER `tmux new-session "claude"`.
With claude as the session's SOLE process, when claude exits (/loop ends, goal completes, or
crash) tmux destroys the whole session (remain-on-exit is off by default) → "pane GONE", never
re-nudgeable. This killed a worker ~3.5h into its 8h box: it reached its terminal verdict, /loop
ended, claude exited, session vanished, sat dead ~7h. The `; exec $SHELL` fallback keeps the pane
alive so cc-keepalive can restart claude in-place and state is inspectable. cc-keepalive detects
"claude exited but pane alive" (no TUI markers like "bypass permissions") and restarts in-place.

## A DEAD is not "done" — keep exploring until the metric or deadline (operator lesson)

"死了没达到目标应该 ccdr 继续探索." For a metric goal, a DEAD verdict on
ONE approach family is NOT goal completion — the GOAL is the number, not "explored the cheap
levers." The only two valid stops are: (1) the metric is achieved, or (2) the deadline is reached.
On a DEAD, the worker must `/deep-research` (CCDR) for a genuinely NEW mechanism AND write a
paid/alt-path escalation proposal to the manager (e.g. paid data, a different approach), then keep
exploring adjacent angles — never go idle before the deadline. cc-keepalive enforces
this (idle → re-nudge toward next CCDR mechanism; never releases on a DEAD, only at the deadline).
Manager error to avoid: I once wrongly called a worker "goal complete" when it had only exhausted the
free internal-logic levers and named alternatives (paid data / a different approach / new CCDR) remained.

## Runaway-turn watchdog + certified-terminal release (operator lesson "deep research 跑了2个多小时")

Two failure modes a time-boxed worker hit, both now mechanized:
1. **Runaway turn**: a worker's single turn / /deep-research ran 2h+ (one 198k-token thinking turn),
   and the old mid-work guard SKIPPED it forever ("working, leave alone"). cc-watch now tracks
   continuous mid-work dwell and INTERRUPTS (Esc) any turn past 75min (RUNAWAY_DWELL) — generous
   enough not to kill a legit ~30-40min 100-agent /deep-research, but catches the 2h runaway.
2. **Forced re-derivation**: keepalive's "DEAD never stops" doctrine over-corrected — the worker had
   CERTIFIED the metric unreachable on the full sample + escalated the only remaining path
   (paid data → operator), yet keepalive kept nudging it to re-derive the settled answer, burning
   tokens. keepalive now RELEASES when the worker has no open cc-task (a deliberate, reviewable
   "certified-terminal" done-signal — distinct from a single-approach DEAD which is just a commit).
Doctrine for worker goals: a single DEAD → keep exploring (CCDR for a new mechanism); but once the
metric is exhaustively certified-unreachable AND the only path left is escalated to user/operator,
run `cc-task done` to signal terminal (releases keepalive). Don't loop re-deriving a settled result.
Operational note: don't run multiple heavy workflows concurrently with a worker's CCDR — they share
the global concurrency cap and starve each other (a normally-30min DR stretched to hours).

## Execution self-drives (/loop); supervision is cron-driven (operator lesson)

Clean division of labor, decided after a long worker CCDR run:
- **Worker execution / CCDR / exploration = `/loop` self-driven.** A worker that needs to run
  deep-research / iterate gets a `/loop` from the manager AT RECRUIT TIME (one send). It then
  self-paces round by round, unattended — the manager does NOT nudge it to "keep working".
- **Review / checks / supervision = cron-driven (cc-watch), manager-side.** This is the half a
  worker cannot do for itself: cc-review (dual-subagent on every commit), freeze gate, keepalive
  bounds, runaway watchdog, FAIL→owner repoke. Principle: EXECUTION may self-drive, but REVIEW
  must be OTHER-driven — "the judge can't be the party being judged". Never let a worker's /loop
  drive its own review (it could skip it); the review trigger stays in the manager's cron.
- **Consequence:** with /loop self-driving execution, cc-watch's old cc-decide "nudge an idle
  worker with a fresh GOAL to keep it busy" role is largely retired — cron returns to PURE
  supervision/checks (review, freeze, keepalive, watchdog, attribution), not work-prompting.
- At recruit: if the task is continuous exploration → set /goal (anchor) + /loop (drive) + arm
  keepalive (bounds). If one-shot/Q&A → /goal only, no /loop. (See "Every goal must LAND".)

### /goal vs /loop — decision rule + worked examples (operator lesson)

`/goal` = persistent target ANCHOR (the worker remembers WHAT to achieve; survives compact/restart;
does NOT auto-iterate). `/loop` = self-drive ENGINE (worker does one step per round, unattended,
until a stop condition). They answer different questions: **/goal = "what to do", /loop = "should it
keep doing it by itself".**

Decision (two questions):
1. Persistent goal, or one-shot/query? → one-shot/query: use NEITHER, just do it.
2. (If persistent) Does it need to iterate by itself? → bounded single task: /goal ONLY ·
   unbounded exploration: /goal + /loop + keepalive.

Worked examples:
- **"8h push a worker's metric → target"** → /goal (anchor: optimize→target) + /loop (each round:
  tweak an input → run → ALIVE/DEAD → next) + keepalive (8h bound). Unbounded exploration, runs
  unattended; the cron does NOT nudge it to keep working — /loop does.
- **"what's that worker's current metric?"** → NEITHER. One-shot query: read the metric ledger, answer.
  No anchor, no iteration.
- **"fix a worker's held-out result to ≥ the bar, rework the gating logic"** → /goal ONLY. A bounded
  task — edit → run → verify → done. Adding /loop would make it invent busywork after it's done (the 2h tail).
- **"continuously monitor a staging run's health"** → /loop (or a cron job), goal optional — repetitive
  check, the objective is too simple to need a persistent anchor.

Rule of thumb: /goal almost always (it's the direction anchor, set at recruit). /loop ONLY for
unattended "iterate until a stop condition" — and if you add /loop you MUST give it a stop
(metric / deadline / certified-terminal), or it over-self-drives and burns tokens (the 2h tail).

## One mechanism folder + skill accessibility (operator lesson)

All mechanism lives in this repo (`bin/` scripts + `docs/` rules). The single
entry point is `MECHANISM_INDEX.md` — read it first. Skill accessibility is enforced, not hoped:
cc-recruit AUTO-INJECTS a mandatory "read your team's skills/rules docs + MECHANISM_INDEX.md
+ MANAGER_RULES.md before you start" nudge into EVERY worker (the manager can't forget it). A new
manager reads MECHANISM_INDEX.md → MANAGER_RULES.md → the skills/rules docs. Workers read those first.

## Manager interaction discipline (meta-grill)

A meta-grill of the manager↔worker loop found the manager over-repokes, blindly forwards bad
review verdicts, and raises goals on unverified results. The doctrine below fixes the BEHAVIOR;
FIX #4/#5/#1 wire parts of it into cc-watch/cc-goal, but the policy binds even where code does not.

- **READ-THEN-SET.** Before asserting a hard ceiling, a scope switch, or a
  bar-raise (a higher metric target), QUOTE the ledger evidence you are overriding: the result-artifact
  run id and/or the metric-ledger / verdict line. Don't assert a ceiling from memory. (cc-goal now
  prints a non-blocking warning when a ceiling/target/pivot goal cites no run-id/metric-ledger/verdict;
  it still sends — the warning is the discipline, `CC_GOAL_FORCE=1` acknowledges it.)
- **VERIFY-BEFORE-RAISE.** Before raising the bar, resolve the CURRENT milestone's run id via
  `verify-claim` and require a PASS. The word "verified" in a worker's prose is NOT proof — run
  the verifier. A 404 means reproduce-or-retract, not raise.
- **GOAL + GATE ARE ONE ATOMIC ACT.** Set the explore-vs-deploy mode together WITH the goal. Never
  forward a repoke that orders work the goal forbids (e.g. a deploy-gate FAIL repoke to an
  explore-only worker — the algo-grill is goal-aware for exactly this reason).
- **DEFAULT TO SILENCE.** HEALTHY → silent (no nudge). STUCK → nudge ONCE, then MUTATE the ask
  (different words / a diagnosis), never re-send the same words. RUNAWAY → interrupt. Identical
  nudges are hard-capped at 2 (cc-watch FIX #5): re-sending the same payload at an unchanged worker
  is noise — mutate the ask or diagnose.
- **SUSPECT THE GRADER ON A FAIL STREAK.** Two same-check FAILs on a clean, committing worker mean
  AUDIT THE CHECK, not hammer the worker — repeated identical FAILs usually expose a goal-blind
  grader bug. cc-watch FIX #4 trips a per-owner circuit-breaker at the 3rd same-check FAIL: it
  suppresses further auto-repoke and writes a loud `[circuit-breaker]` line to escalations.log.
- **ESCALATE-AND-HOLD AT GATED WALLS.** When the ONLY path to a raised goal requires paid data or a
  sign-off (operator/user), escalate to the user and HOLD at the validated FREE verdict. Do NOT keep
  re-goaling a worker toward a number only the gated lever can reach. And do NOT fuse
  "cannot-reach-target" with "no-edge" — a free-data ceiling is a gate wall, not a dead signal.
