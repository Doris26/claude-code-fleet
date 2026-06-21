# Case study: finding a Sharpe-2.0 crypto trading algo — end-to-end

> ⭐ **The headline:** point a supervised claude-code-fleet at the markets and let it hunt — autonomously,
> around the clock — until it lands a crypto strategy at **out-of-sample Sharpe ≈ 2.0**, *and won't
> let itself fake it*. Every candidate is PIT-checked, cost-stressed, DSR-deflated, and its cited
> backtest is verified against ground truth before it's allowed to call itself a Sharpe-2 result.
> That last part is the magic: an unsupervised agent will happily *claim* Sharpe 2; claude-code-fleet makes it
> **prove it**.

**Goal of this walkthrough:** show how you drive *and supervise* a Claude Code worker to search
for a crypto trading strategy that clears a hard, pre-registered bar — **out-of-sample Sharpe ≥
2.0** — without babysitting it, and without letting it fool you with an overfit or fabricated result.

> **Read this as a *method*, not a recipe for a specific strategy.** The example strategy shape and
> every number below are illustrative. What's real is the *loop*: recruit → land a goal → let it
> self-drive → supervise every commit → read honest ALIVE/DEAD verdicts.

This case study uses the bundled **`quant-qc` plugin** (it verifies a cited QuantConnect backtest
is real). The same flow works for any domain — swap the plugin.

---

## 0. Why a supervisor at all (for this task)

A crypto-alpha hunt is exactly where an unsupervised agent goes wrong:

- It **overfits** — finds a Sharpe-3 backtest that is curve-fit to one regime and calls it done.
- It **fabricates** — cites a backtest id and a Sharpe that don't actually exist, or quotes a
  remembered number from three turns ago.
- It **quits early** — one idea dies (DEAD), and it declares the whole goal finished.
- It **stalls** — a single deep-research turn runs for two hours, or it hits the 5-hour usage limit
  and silently sits dead.

claude-code-fleet's review gate, `verify-claim`, keepalive, and freeze gate are built to catch precisely
these. That's the point of the exercise.

---

## 1. Configure

```bash
cd claude-code-fleet
cp claude-code-fleet.env.example claude-code-fleet.env
$EDITOR claude-code-fleet.env
```

Set:

```bash
export CC_REPO="$HOME/crypto-research"      # the git repo your worker commits strategies to
export CC_EXPECT_ACCT="you@example.com"     # your Claude account (the fleet freezes if it drifts)
export CC_VERIFY_PLUGIN="plugins/quant-qc"  # verify cited backtests against QuantConnect
export QC_USER_ID="..."                      # QuantConnect creds (read from env, never committed)
export QC_API_TOKEN="..."
```

```bash
source claude-code-fleet.env
ln -s "$PWD"/bin/* ~/.local/bin/   # put ta/ts/tp/cc-* on PATH (tmux + claude must be installed)
```

Pick the **metric ledger** convention your worker will keep as the single source of truth for
headline numbers — e.g. a `PERF_CARDS.md` in `CC_REPO` (the `quant-qc` review prompt and
`verify-claim` both understand that convention).

---

## 2. Recruit the worker — with a *landable* goal

The single most important thing: the goal must **LAND**. Every goal names an **artifact**, a
**metric** (a number vs an explicit bar), and an **acceptance** condition. A vague "find a good
crypto strategy" makes a worker spin forever; a landable goal forces a commit + a number each cycle
that the review gate can then grill.

Write the onboarding context to a file, then recruit:

```bash
cat > /tmp/onboard_crypto.txt <<'TXT'
You are hunting a crypto trading strategy. Engine: QuantConnect (cloud or local Lean) ONLY —
no yfinance, no self-written backtester. Universe: liquid perps/spot (BTC, ETH, + majors).
Read the quant-qc persona + the claude-code-fleet MANAGER_RULES before you start.
TXT

cc-recruit cryptoalpha /tmp/onboard_crypto.txt \
  "Find a crypto trading strategy with OUT-OF-SAMPLE Sharpe >= 2.0. \
   ARTIFACT: committed strategy file + a real QuantConnect backtest id + a PERF_CARDS.md row. \
   METRIC: OOS Sharpe >= 2.0 (and IS within ~80% of OOS, MaxDD < thesis tolerance). \
   ACCEPTANCE: hit the bar OOS, OR prove it unreachable on free data and record DEAD + the \
   number that killed it. Explore, do not ship." \
  "crypto alpha research" \
  "Search/validate crypto strategies to the OOS Sharpe>=2 bar" \
  "CC_REPO strategy dir + PERF_CARDS.md row" \
  quant-researcher
```

What `cc-recruit` does for you, in order (so you can't forget a step):

1. **Account guard** — aborts if the active Claude account ≠ `CC_EXPECT_ACCT` (don't spawn workers
   under the wrong quota on a shared machine).
2. Spawns `claude` in a tmux session named `cryptoalpha`, **shell-wrapped** so the pane survives
   `claude` exiting.
3. Captures the **remote-control URL** first (so you can watch/drive from the web UI).
4. `/effort` up, sets **`/goal`** (the persistent anchor — the worker's first directive), pastes the
   onboarding context, runs `cc-add` (registers it for supervision), records it, opens a task.
5. Launches it under the **`quant-researcher` persona** (the quant hard rules live in its system
   prompt: PIT correctness, real-backtest-or-it-didn't-happen, DSR before claiming a lift, …).

Make it self-drive, then bound it:

```bash
ts cryptoalpha "/loop each round: pick ONE falsifiable candidate -> backtest on QC -> \
  PIT + cost + DSR grill -> ALIVE/DEAD with the deciding number -> commit -> next angle"
```

`/goal` says *what*; `/loop` makes it *iterate by itself*; arm `cc-keepalive` to *bound* it (run
until the metric, a deadline, or a certified-terminal verdict — a single DEAD never ends the goal).

---

## 3. Stand up the supervisor (the half the worker cannot do for itself)

Review must be **other-driven** — the judge can't be the party being judged. The supervisor runs on
a cron, independent of the worker's `/loop`. Two ways to drive it:

**A. launchd backbone (always-on):**

```bash
sed "s|__HOME__|$HOME|g" launchd/com.user.cc-manager.plist.template \
    > ~/Library/LaunchAgents/com.user.cc-manager.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.cc-manager.plist
launchctl list | grep cc-manager     # confirm it's loaded
tail -f /tmp/cc-manager.log           # watch it tick
```

**B. Claude in-session crons** (a `manager` session drives `cc-watch`). See
[`../../docs/cron-prompts.md`](../../docs/cron-prompts.md) for the exact `CronCreate` prompts. After
creating them, **check they're alive** from the manager session:

```
CronList          # → you should see the cc-watch backbone (every ~30 min) and any audit crons
```

Either way, every ~30 minutes `cc-watch`:

- runs **`cc-review`** on each newly-landed commit (process review + the quant overfit grill from
  the plugin + `/code-review` + secret-grep);
- runs **`verify-claim`** — resolves every backtest id the commit cites against the QuantConnect API.
  A fabricated / typo'd id, or a stated Sharpe that doesn't match the real backtest, **FAILs** the
  review and the worker gets re-poked to fix it;
- ticks **keepalive** (idle worker → nudged to the next angle; a DEAD idea ≠ done);
- runs the **freeze gate** (5-hour usage limit → exit the tick zero-token, auto-resume after reset);
- watches for a **runaway turn** (a single turn stuck mid-work too long → interrupt).

---

## 4. Writing prompts to the manager

You mostly *don't* — a healthy worker self-drives and the cron supervises. When you do step in, the
manager speaks a tiny, deliberate vocabulary (don't expand it; it's a router, not a strategist):

| You want to… | Send |
|---|---|
| Anchor / change the direction | **`/goal <new target>`** (persistent; survives compaction) |
| Nudge the next concrete step | **`GOAL: <one-line next step>`** (the default) |
| Challenge a too-good result before it moves on | **`GRILL: <the specific claim>`** (e.g. "Sharpe 3.1 in 2021 only — show me 2022 + a cost-stressed OOS") |
| It's stuck / declared a wall | **`DR: <next direction>`** (escalate research: deep-research → bigger tiers; never accept a premature "need paid data") |
| Approve "try all" of N options it offered | **`都试试`** (try all) |
| Nothing to add | **send nothing** (silence is correct) |

Worked examples for *this* hunt:

- Worker commits "BTC/ETH inverse-vol long/flat, Sharpe 2.4 (2020–2024)." →
  `GRILL: that's in-sample 2020–24; show a true forward-OOS split + funding/borrow costs in, and a 2022 bear slice — Sharpe>2 only counts OOS net of cost.`
- Worker: "funding-carry overlay is DEAD, I'm out of ideas." →
  `DR: a DEAD on one overlay isn't done. /deep-research a NEW orthogonal mechanism (e.g. cross-sectional momentum on perps, or a vol-regime gate) with a counter-mechanism, corr<0.4 to the core, and a $0 falsification test.`
- Worker: "I need a paid orderflow feed to go further." →
  `DR: escalate the free-data research ladder first (deep-research → larger tiers); only after all are exhausted do we discuss paid data — and that's an operator decision, not auto-approved. Hold at the validated free verdict.`

---

## 5. Read the verdicts — and trust only what's verified

Every reviewed commit writes `CC_REPO/.cc-review/<sha>.json`:

```jsonc
{
  "sha": "…",
  "overall": "PASS",            // FAIL routes a re-poke back to the worker
  "code":   { "verdict": "PASS" },         // process/discipline
  "algo":   { "verdict": "GRILL", … },     // the quant overfit grill (plugin) — e.g. caught IS-only
  "secret": { "verdict": "PASS" },
  "btid":   { "verdict": "PASS", "checked": 1 }  // verify-claim: the cited backtest is REAL
}
```

Healthy end-states:

- **ALIVE at the bar:** a committed strategy + a `verify-claim`-PASS backtest id + a `PERF_CARDS.md`
  row showing OOS Sharpe ≥ 2.0 net of cost, surviving the overfit grill. *That's* a result — because
  it was independently verified, not because the worker said so.
- **Certified DEAD:** the worker proves the bar is unreachable on free data and records the killing
  number, having exhausted the research ladder. A DEAD with a reason is a real outcome — not a
  failure, and not something keepalive will let it quietly abandon early.

### An illustrative shape (made up, for the tutorial)

The kind of strategy a worker might converge toward in this hunt — purely to make the walkthrough
concrete — is a textbook combination: an **inverse-volatility-targeted BTC/ETH long-flat core** plus
a **cross-sectional funding-rate carry overlay** on perps, vol-targeted and de-grossed in stress.
The point of claude-code-fleet is not that *this* shape works — it's that whatever the worker proposes gets
**PIT-checked, cost-stressed, DSR-deflated, and backtest-verified** before it's allowed to call
itself a Sharpe-2 result.

---

## TL;DR

```
configure (CC_REPO + CC_EXPECT_ACCT + quant-qc plugin + QC creds)
  → cc-recruit with a LANDABLE goal (artifact + metric + acceptance) + /loop + keepalive
  → stand up cc-watch (launchd or Claude cron); CronList to confirm it's alive
  → it self-drives; the cron reviews every commit + verify-claim checks the cited backtest is real
  → you only GRILL too-good claims and DR it past walls
  → ALIVE only when independently verified; DEAD only when certified with the killing number
```
