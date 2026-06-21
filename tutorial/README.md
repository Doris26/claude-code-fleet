# Tutorial

Learn claude-code-fleet by reading, then by doing.

## 1. Learn Claude Code first

claude-code-fleet supervises a fleet of **Claude Code CLI** sessions, so it helps to be comfortable
with Claude Code itself first (sessions, `/` commands, subagents, MCP, headless `claude -p`).

→ [`learn-claude-code.md`](learn-claude-code.md) — curated videos + official docs.

## 2. Case studies

Worked, end-to-end walkthroughs of running a real goal through a supervised fleet.

| Case study | What it teaches |
|---|---|
| [`case-studies/find-a-sharpe-2-crypto-alpha.md`](case-studies/find-a-sharpe-2-crypto-alpha.md) | Drive a quant-research worker to hunt a crypto trading strategy (illustrative target: out-of-sample Sharpe ≈ 2) — from recruiting the worker, to setting a landable goal, to checking the supervision crons, to writing prompts to the manager, to reading the ALIVE/DEAD verdicts. Uses the `quant-qc` plugin. |

> The case studies are **process tutorials**. The example strategy and all numbers in them are
> illustrative — they show you how to *drive and supervise* a fleet, not a turnkey money-printer.
