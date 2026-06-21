# quant-qc — example verification plugin (QuantConnect)

This is a **worked example** of a claude-code-fleet domain plugin. It specializes the generic
supervision framework for **quantitative-strategy research on QuantConnect (QC)**, where the
result a worker cites is a *backtest*, and the fabrication risk is a made-up Sharpe / backtest-id.

Nothing here is required by the core. It exists to show how a domain plugs in — copy its shape
to build your own (CI runs, benchmark dashboards, an artifact store, …).

## What it provides

| File | Role |
|---|---|
| `verify-claim` | The verification provider. Resolves every QC backtest-id (32-hex) cited in a commit's diff against the QC `backtests/read` API; FAILs on a 404 (fabricated/typo/stale id), on a stated-Sharpe-vs-real mismatch, or on a perf number cited with no resolvable backtest anchor. SKIPs (non-blocking, "manual verify owed") on cross-account / unreadable ids. |
| `review-prompt.txt` | The L2 domain review prompt — an adversarial overfit/look-ahead/DSR grill appended by `cc-review` when this plugin is active. Goal-aware (won't FAIL an explore-only directive on deploy-gate checks). |
| `persona.agent.md` | A quant-researcher worker persona — the domain specialization of the generic worker. |

## Enable it

```bash
export CC_VERIFY_PLUGIN=plugins/quant-qc     # or an absolute path
export QC_USER_ID=...                         # your QuantConnect user id
export QC_API_TOKEN=...                        # your QuantConnect API token (read from env, never commit)
```

With this set, `cc-review` will, on every reviewed commit:
- run the generic process review (L1), `/code-review` (L3), `/security-review` (L4), and the
  deterministic secret-grep — exactly as it does with no plugin, **plus**
- run the overfit grill (`review-prompt.txt`) as L2, and
- resolve any cited backtest-id against QC via `verify-claim`.

Without `QC_USER_ID` / `QC_API_TOKEN`, `verify-claim` returns `SKIP` (it cannot reach QC) — the
review still runs, it just can't confirm a cited backtest is real. Treat a long run of SKIPs as
"the anti-fabrication control is dark," not as clean passes.

## Why a Lean/QC convention is assumed

`verify-claim` resolves a backtest-id by trying it against project-ids it finds in the diff and,
failing that, the `cloud-id` in a sibling `config.json` of any touched directory (the Lean project
layout). If your QC projects are laid out differently, adjust `_config_cloud_ids()` in `verify-claim`.
