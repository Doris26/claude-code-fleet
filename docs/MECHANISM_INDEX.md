# cc-manager MECHANISM — single index

The one place a new manager (or worker) reads to understand the whole fleet mechanism.
The supervisor lives in this repo: `bin/` (scripts), `docs/` (this index + rules), `personas/`, `plugins/`.

## Read order for a NEW manager
1. `MANAGER_RULES.md` — operator hard rules (the contract).
2. This file — what each script does + how they chain.
3. `cron-prompts.md` — the launchd/cron jobs.
4. Your team's skills/rules docs — the full skill library (ALIVE/DEAD lessons).

## Read order for a NEW worker (cc-recruit injects this automatically)
1. Your team's skills/rules docs — all skills, Tier-1 hard rules first.
2. `MECHANISM_INDEX.md` (this) + `MANAGER_RULES.md` — how you're supervised + reviewed.

## Scripts (bin/)

| Script | Role |
|---|---|
| `cc-recruit` | Spawn a worker: account-guard → URL-first → /effort ultracode → /goal → onboarding → **inject skills must-read** → cc-add → registry → cc-task. Sessions are shell-wrapped (`claude; exec $SHELL`) so they survive claude exiting. |
| `cc-watch` | launchd every 1800s (30min). Stages: freeze gate (zero-token resume) → keepalive tick → cost-guard → per-worker brain/guards (mid-work + **runaway watchdog 75min**) → **cc-review on new commits** → cc-monitor. Atomic mkdir lock w/ mtime steal. |
| `cc-review` | Manager-spawned LAYERED review of each landed commit (worker can't skip): L1 process (ours) + L2 algo-grill (ours, overfit) + L3 `/code-review` (built-in correctness, HEAD only) + deterministic secret-grep; LLM `/security-review` only on infra/bin/deploy. FAIL → attribute (path-prefix) → repoke owner → until PASS. |
| `cc-keepalive` | Time-boxed "run until METRIC / DEADLINE / certified-terminal". Idle→re-nudge next angle; dead/exited→respawn (shell-wrapped, account-guarded); cc-task done→release. Doctrine: a single DEAD never stops; consult ALIVE/DEAD ledger, no repeat DRs. |
| `cc-freeze-check` | 5h/spend-limit detector. `--panes-only` = zero-token banner grep; full = haiku probe. ANY banner → FROZEN. |
| `cc-goal` / `cc-task` / `cc-add` / `cc-rm` / `cc-roster` | Goal anchor / task store / watch.list add-remove / roster. |
| `cc-monitor` / `cc-monitor-gate` / `cc-self-audit` | Deliverable + landing + session-health detection; institutional audit. |
| `cc-decide` | Brain for idle-nudge — largely RETIRED: execution self-drives via `/loop`, cron does supervision only. |
| `ts` / `tp` / `ta` / `tl` | tmux send (idempotent C-u) / capture / attach / list. |

## Optional companion — a skill-capture cron (NOT bundled in claude-code-fleet)

The autonomous skill-library writer. Closes the loop the manager review gate opens: cc-review
captures lessons *at commit time*; this cron mines those landed commits and turns the reusable
ones into curated `skill_NNN_*.md` files (so the library grows without a human).

| Item | Detail |
|---|---|
| Script | `bin/auto_skill_capture.py` — screen each candidate commit with a tool-less `claude -p` (NO/NEW/UPDATE), then a second `claude -p` writes/refines the skill markdown. Tool-less by design: the LLM is a pure text transformer, only the script touches disk/origin. |
| launchd job | `com.user.auto-skill-capture` (`~/Library/LaunchAgents/com.user.auto-skill-capture.plist`). **StartInterval 14400s (every 4h), `--hours 24 --commit`** — NOT hourly despite the docstring's "hourly" line. |
| Output | NEW → a `skill_NNN_*.md` under your team's skills docs + an "Auto-captured (review + re-tier)" row in `INDEX.md`; UPDATE → additive refine of an existing skill (shrink-guard refuses a >10% gut). Commits as `feat(skills): auto-captured …` / `docs(skills): auto-updated …`, pathspec-scoped. Self-commits are filtered to break recursion. |
| Cursor / state | `~/.cc-manager/auto_skill_state.json` — `last_processed_sha` advances ONLY through the contiguous fully-handled prefix (oldest-first); a halted commit is NOT crossed (fail-loud cursor). Also holds `fail_counts` (per-SHA halt streak) + `skipped_poison` (poison ledger). Single-instance `flock` on `auto_skill_capture.lock`. Logs: `~/.cc-manager/auto_skill_capture.log` (+ `.err`). |
| Numbering | `next_skill_number()` scans the WHOLE `skills/` tree (global max+1), so a new skill can't reuse a sibling-dir number. The flock prevents the two-runs-race twin-number. |
| Verified status (grill) | SOUND. Fidelity high (sampled NEW + UPDATE writes spot-checked faithful + additive to source). Known no-op-UPDATE crash (`git commit` exit 1 under old `check=True`) is FIXED + exercised in prod (`no-op … identical content — skipping`). Parsers robust (NOW≠NO, NEWS≠NEW, fence-strip, "Skipping the boilerplate"≠SKIP). |
| Caveat | The fail-loud halt had **no poison-pill escape**: a commit whose LLM call fails every run wedged the cursor permanently while the backlog grew (observed: one SHA halted 8 consecutive runs; a large backlog built up behind a 4h/10-per-run cadence). FIXED — `--max-retries` (default 6 ≈ 1 day): persistent halts are retried fail-loud, then LOUDLY skipped past + logged to `skipped_poison` so the queue drains. Backlog drainage is still slow by design (10/run); raise `--max` if it lags. |

## Core doctrines (see MANAGER_RULES.md for full text)
- **Execution self-drives (`/loop`); supervision is cron-driven (cc-watch).** Review must never be /loop-driven (a worker can't judge itself).
- **Every goal must LAND** — artifact + metric + acceptance.
- **Recruit only via cc-recruit** — verify account, remote URL is a required deliverable.
- **Shared tree** — commit with explicit pathspec (`git commit -- <file>`), never `git add -A`.
- **CCDR = the `/deep-research` skill** (a slash command, not prose).
- **A DEAD ≠ done** — keep exploring; only metric / deadline / certified-terminal stop.

## Mechanism skills (in your team's skills docs)
- recruit flow
- stuck-worker recovery
- the non-skippable review gate
- landing proof
- fail-loud cursor (governs `auto_skill_capture` state pointer)

## Session rules (the durable operator-behavior rules)
standard-recruit-flow · shared-tree-commit-pathspec · ccdr-is-deep-research-skill ·
all-goals-must-land · fix-mechanism-not-instance. (These are the durable manager-behavior rules.)
