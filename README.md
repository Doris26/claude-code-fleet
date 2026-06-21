# claude-code-fleet

**Run a fleet of Claude Code agents — without babysitting them.**

Think [OpenClaw](https://github.com/openclaw/openclaw) / [Hermes](https://hermes-agent.ai), **but
lite.** Where those are full multi-agent *runtimes*, claude-code-fleet is the thin **supervisor**
you bolt onto the Claude Code CLI you already run. You start a few `claude` sessions in tmux on a
shared repo; it watches them so you don't have to hover over every pane: it independently reviews **every commit**
(the worker can't skip it), **refuses a result a worker *cites* but can't prove**, keeps stalled
sessions moving, freezes cleanly on the spend-limit, and interrupts runaway turns.

The core is domain-agnostic; the part that knows what a "real result" looks like is a small
**plugin**.

> **Lite by design:** no agent runtime to adopt, no agent graph to define — it wraps the Claude
> Code CLI you already use, and is happy to run *underneath* OpenClaw / Hermes / claude-squad.
> Extracted from a private multi-agent research fleet and generalized; the supervision mechanisms
> are battle-tested, the public packaging is young. Issues/PRs welcome.

---

## Point it at a hard goal and walk away

claude-code-fleet turns a fleet of Claude Code agents into an **autonomous, long-running research
engine**. Give it one open-ended, high-level goal and leave — it runs **for days, unattended, with
no human in the loop**: proposing ideas, building and testing them, killing the dead ends, and
self-reviewing every step. Because every result is **independently verified against ground truth**,
you can trust what it hands back instead of re-checking it.

> **Worked example** — the bundled
> [case study](tutorial/case-studies/find-a-sharpe-2-crypto-alpha.md):
>
> > *"Find a crypto trading strategy with out-of-sample Sharpe > 2 over the last 3 years."*
>
> You set that single goal and walk away. The fleet hunts on its own — proposing candidates,
> backtesting each on QuantConnect, deflating the overfit ones, and **refusing to call anything a
> Sharpe-2 result until the cited backtest is verified to actually exist.** You come back to
> ALIVE/DEAD verdicts you can trust — not a pile of unchecked claims.

**Built to run long, unattended.** Keepalive drives it round after round until it hits the metric or
a deadline — one dead end never ends the goal; the freeze gate rides out the 5-hour usage limit and
auto-resumes; the runaway watchdog kills a stuck turn; the account guard catches a drifted login. A
multi-day hunt survives limits, stalls, and restarts **without you watching**.

## Why

Spawning a fleet of autonomous coding agents is easy. Keeping them **honest and unstuck** without
hovering over every pane is the hard part:

- An agent **can't be trusted to review its own work** — "the judge can't be the party being
  judged." Review has to be driven from the outside.
- An agent can **cite a result that doesn't exist** (a fabricated run id + metric) and otherwise
  look perfectly productive.
- An agent **doesn't notice it's been idle for an hour**, or that its single turn has been
  spinning for two.

`claude-code-fleet` moves all of that to a manager-side cron supervisor, so the humans only step in for
real decisions.

## What it does

| Mechanism | What it gives you |
|---|---|
| **Non-skippable review gate** (`cc-review`) | On every landed commit the manager spawns a layered review the worker can't opt out of: L1 process/discipline + L2 optional domain review (plugin) + L3 Claude `/code-review` (correctness) + L4 `/security-review` + a deterministic secret-grep. FAIL → re-poke the owner until it's fixed. |
| **Anti-fabrication verification** (`verify-claim`) | A pluggable check resolves the result a commit *cites* (a backtest id, a CI run id, a benchmark URL, …) against ground truth. A fabricated / typo'd / mismatched id FAILs review. |
| **Keepalive** (`cc-keepalive`) | Run-until-metric / deadline / certified-terminal. A single DEAD verdict does **not** end a metric goal; an idle worker is re-nudged toward the next angle; a dead session is respawned. |
| **Freeze gate** (`cc-freeze-check`) | Detects the 5-hour usage-limit banner and exits the supervision tick **zero-token**, then auto-resumes after the reset. No flood, no burned budget. |
| **Runaway watchdog** (in `cc-watch`) | Interrupts a single turn that has been mid-work past a threshold (a 2-hour thinking turn won't hang forever). |
| **Account guard** | Freezes the whole fleet if the active Claude account drifts from the one you expect — on a shared machine the CLI account can silently switch and spawn workers under the wrong quota. |
| **tmux primitives** (`ta`/`tl`/`ts`/`tp`) + `watch.list` | Start/list/send-to/peek sessions; add/remove them from supervision. |

## Architecture

```
claude-code-fleet/
├── bin/         # the supervisor — domain-agnostic. cc-watch (backbone), cc-review,
│                #   cc-keepalive, cc-recruit, cc-freeze-check, cc-monitor, tmux primitives, …
├── plugins/     # verification backends behind one interface (plugins/README.md)
│   ├── generic/ #   default: surfaces cited artifact ids/URLs, verdict SKIP (runs with no backend)
│   └── quant-qc/#   worked example: resolves QuantConnect backtest-ids + an overfit review prompt
├── docs/        # operator contract (MANAGER_RULES) + mechanism index + states
├── personas/    # manager + worker system prompts (general); domain personas live in plugins
├── launchd/     # the macOS supervision cron template
└── claude-code-fleet.env.example
```

The split is the whole point: **`bin/` knows nothing about your domain.** What counts as a "real
result" to verify, and any domain-specific review criteria, live in a plugin. The bundled
`quant-qc` plugin is one example (it knows about QuantConnect backtests); writing your own is a
directory with one executable — see [`plugins/README.md`](plugins/README.md).

## Install

**Quick (recommended):**

```bash
git clone https://github.com/Doris26/claude-code-fleet && cd claude-code-fleet
./install.sh                 # checks deps, symlinks the cc-* commands onto PATH, writes your config
```

Or via **npm** *(once published to the registry)* — puts the `cc-*` commands on your PATH:

```bash
npm install -g claude-code-fleet      # or run ad-hoc: npx claude-code-fleet --help
```

Then configure and go:

```bash
$EDITOR claude-code-fleet.env   # set CC_REPO (the repo your fleet commits to) + CC_EXPECT_ACCT
source claude-code-fleet.env

ta worker1 && cc-add worker1    # start a worker + put it under supervision

# run the supervisor — the always-on launchd backbone…
sed "s|__HOME__|$HOME|g" launchd/com.user.cc-manager.plist.template \
    > ~/Library/LaunchAgents/com.user.cc-manager.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.cc-manager.plist
# …or drive cc-watch from Claude in-session crons (docs/cron-prompts.md). Linux: systemd-user/cron.
```

Needs `bash`, `python3`, `tmux`, `git`, and the `claude` CLI on your machine — npm and `install.sh`
distribute the scripts, they don't install those runtime deps.

Start with [`docs/MECHANISM_INDEX.md`](docs/MECHANISM_INDEX.md) (what each script does and how they
chain) and [`docs/MANAGER_RULES.md`](docs/MANAGER_RULES.md) (the operator contract).

## How this relates to other agent-orchestration tools

claude-code-fleet is deliberately **narrow and orthogonal**. Most tools in this space solve *fan-out* —
spawning, isolating, and routing many agents in parallel. claude-code-fleet solves *supervision* — keeping
already-running agents **honest and unstuck**: a non-skippable external commit-review gate,
anti-fabrication citation-verification, plus freeze / keepalive / runaway / account-drift guards. It
wraps the off-the-shelf Claude Code CLI rather than being a runtime of its own, so it's happy to run
*underneath* or *alongside* the orchestrators below.

| Tool | What it is | Relation to claude-code-fleet |
|---|---|---|
| [**Claude Squad**](https://github.com/smtg-ai/claude-squad) | A TUI to run/isolate many terminal agents (Claude Code, Codex, Aider…) in tmux + git worktrees, each on its own branch | Spawning/isolation only — no review gate or result verification. **Complementary**: launch the fleet with it, supervise with claude-code-fleet. |
| **Conductor** (Melty Labs) | Closed-source binary; clones the repo, runs multiple agents in parallel worktrees, manages GitHub auth | Parallel runner; no external commit-review/verification. **Orthogonal**. |
| [**Claude Code agent teams**](https://code.claude.com/docs/en/agent-teams) (official) | Native feature to orchestrate teams of Claude Code sessions via git worktrees | The spawning primitive claude-code-fleet can supervise; no anti-fabrication gate of its own. |
| [**OpenClaw**](https://github.com/openclaw/openclaw) (+ Mission Control) | A local-first gateway / control-plane: multi-channel (Slack/Telegram/…) routing to isolated agents; Mission Control adds approval-driven governance dashboards | Broader runtime + *human-approval* governance. claude-code-fleet's automated **adversarial commit review + citation verification** is a different mechanism than approval dashboards. |
| [**Hermes Agent**](https://hermes-agent.ai) (Nous Research) | A full multi-agent *runtime* (orchestrator + ~17 workers) for OpenCode, with persistent memory, cron, an orchestrator that reviews workers, and "explicit verification" | **Closest in spirit**, but it's a self-contained runtime where review happens *inside its own loop*; claude-code-fleet's review is **external, cron-driven, per-git-commit, and unskippable**, layered over the stock Claude Code CLI. |
| **Agent frameworks** — [LangGraph](https://github.com/langchain-ai/langgraph), [CrewAI](https://github.com/crewAIInc/crewAI), [AutoGen/AG2](https://github.com/ag2ai/ag2), [OpenHands](https://github.com/All-Hands-AI/OpenHands), [Google ADK](https://github.com/google/adk-python) | Libraries/runtimes to *define and execute* agent graphs from scratch | A different layer entirely — claude-code-fleet doesn't define agent graphs, it supervises sessions you already run. |

**Bottom line:** if you want a framework that *defines and executes* agent graphs, use one of the
runtimes above. claude-code-fleet is the missing **supervisor** — the part that reviews every commit a worker
lands (the judge can't be the judged), refuses a cited result it can't verify against ground truth,
and keeps the fleet alive across stalls and spend limits. That specific combination — external,
non-skippable commit review + anti-fabrication citation verification over the Claude Code CLI —
isn't covered by the orchestrators above; the closest is Hermes's in-loop review, which is part of a
different, self-contained runtime.

## License

MIT — see [LICENSE](LICENSE).
