# Verification plugins

The supervisor's review gate (`bin/cc-review`) enforces one idea: **a worker
cannot self-certify a result — the manager independently verifies every landed
commit against ground truth, and the worker can't skip it.**

"Ground truth" is domain-specific, so it lives behind a small plugin interface.
The core framework ships finance-free; the quant backend is just one example.

## Interface

A plugin is a directory containing (at minimum) an executable `verify-claim`:

```
verify-claim <commit_sha> [--repo <path>]
```

- **stdin:** none.
- **stdout:** exactly one JSON object:
  ```json
  {"verdict": "PASS|FAIL|SKIP", "checked": <int>, "issues": ["..."]}
  ```
- **verdict semantics:**
  - `PASS` — every result-artifact the commit *cites* (a backtest id, a CI run
    id, a benchmark URL, …) resolves against ground truth, or the commit cites none.
  - `FAIL` — a cited artifact is fabricated / 404s / mismatches ground truth.
    `cc-review` blocks and re-pokes the commit's owner until it's PASS.
  - `SKIP` — cannot verify (no credentials, not applicable). Caller treats as
    non-blocking.

Optionally a plugin may provide `review-prompt.txt` — extra, domain-specific
review criteria appended to the LLM review pass (e.g. overfit / look-ahead checks
for quant). If absent, the core correctness review runs alone.

Select a plugin with `CC_VERIFY_PLUGIN` (see `claude-code-fleet.env.example`).

## Bundled plugins

| Plugin | `verify-claim` does | Needs |
|---|---|---|
| `generic` (default) | Surfaces every cited artifact-id / URL in the diff and reports them as unverified; verdict `SKIP`. Lets the framework run with no backend. | nothing |
| `quant-qc` (example) | Resolves each new QuantConnect backtest-id cited in the diff against the QC `backtests/read` API, and checks any adjacent claimed Sharpe matches. | `QC_USER_ID`, `QC_API_TOKEN` env vars |

## Writing your own

Drop a directory under `plugins/<name>/` with an executable `verify-claim`
following the contract above, point `CC_VERIFY_PLUGIN` at it, done. Good
backends to write: GitHub Actions run-id resolver, an artifact-store HEAD check,
a benchmark-dashboard id lookup.
