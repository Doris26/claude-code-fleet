# Learn Claude Code

claude-code-fleet is a supervisor for **Claude Code CLI** sessions, so get comfortable with Claude Code
itself first. Start with the official material, then a video walkthrough, then go hands-on.

> Links verified as appearing in search as of mid-2026. YouTube titles and availability change —
> when in doubt, start from the **official channel/docs** and search from there.

## Official (start here)

- **Claude Code docs** — the authoritative reference: <https://docs.claude.com/en/docs/claude-code>
- **Tutorials | Claude** (official): <https://claude.com/resources/tutorials>
- **Claude Code 101** (free Anthropic course): <https://anthropic.skilljar.com/claude-code-101>
- **Anthropic "Claude Tutorial" YouTube playlist**: <https://www.youtube.com/playlist?list=PLYQsp-tXX9w4TPApr97et876K9bbDBO5Q>

## Video walkthroughs (YouTube)

- **Anthropic's 7-Hour Claude Code Course in 27 Minutes** — fast, dense overview:
  <https://www.youtube.com/watch?v=XuSFUvUdvQA>
- **Mastering Claude Code in 30 minutes** — advanced features, shortcuts, workflows:
  <https://www.youtube.com/watch?v=6eBSHbLKuN0>
- **Anthropic Just Revealed The Best Claude Code Setup** — setup + keeping agents from failing:
  <https://www.youtube.com/watch?v=lGalJmyI78w>

## Hands-on

- **claude-code-crash-course** (emarco177) — branch-per-feature, follow the commits to learn MCP,
  subagents, hooks, and automation step by step:
  <https://github.com/emarco177/claude-code-crash-course>

## What to actually learn for claude-code-fleet

claude-code-fleet leans on a specific subset of Claude Code. Make sure you're comfortable with:

| Concept | Why claude-code-fleet needs it |
|---|---|
| **Sessions + `/` commands** (`/goal`, `/loop`, `/effort`, `/remote-control`) | a worker is anchored by `/goal`, self-drives via `/loop`, and is driven/observed over `/remote-control`. |
| **Subagents** (the Agent tool) | `cc-review`, the self-audit grill, and the manager's cron work all run as subagents to keep the manager's own context light. |
| **Headless mode** (`claude -p --output-format json`) | every reviewer (`cc-review`, `verify-claim`'s grills) is a non-interactive `claude -p` call whose JSON output is parsed. |
| **Built-in `/code-review` & `/security-review`** | two of cc-review's layers are these built-ins. |
| **In-session crons** (`CronCreate` / `CronList`) | one of the two ways to drive the supervision loop (see [`../docs/cron-prompts.md`](../docs/cron-prompts.md)). |
| **The account model** (`~/.claude.json` → `oauthAccount`) | the fleet's account-drift guard reads this to make sure workers run under the account you expect. |
| **tmux basics** | each worker is a `claude` session in a tmux pane; `ta`/`ts`/`tp` wrap tmux. |

Once those click, the [crypto-alpha case study](case-studies/find-a-sharpe-2-crypto-alpha.md) walks the
whole supervised loop end to end.
