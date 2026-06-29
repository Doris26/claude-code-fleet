# Skill 177 — High-Quality Fleet CCDR Prompt (template + checklist)

**Tier 2 — Always-on workflow.** Every `/deep-research` (CCDR) a worker runs MUST be composed
to this template. CCDR is garbage-in-garbage-out: a worker's entire exploration arc is only as good
as its research prompt. A lazy/vague prompt yields shallow directions or re-proposes already-DEAD
angles because the prompt never pasted the ledger. cc-recruit auto-injects a pointer to this skill
into every worker so the prompt can't be free-formed weakly.

## When to use
Any time a worker is about to run `/deep-research` — new direction, DEAD→new-mechanism, or stuck.
("CCDR" = the `/deep-research` slash command, NOT ad-hoc prose research.)

## ALWAYS run CCDR via a subagent (execution rule — faster, user 2026-06-24)

Do NOT run `/deep-research` inline in your main session. SPAWN a subagent (Agent tool,
general-purpose) with the CCDR prompt (composed to the 6-part template below), have IT run
`/deep-research`, and relay back ONLY the distilled ranked-candidates result. Why:

- `/deep-research` is a long (~15-40 min) heavy multi-agent fan-out. Run inline it BLOCKS your
  main session for the whole run AND BLOATS your context with the raw fan-out output → every later
  turn is a slow, expensive uncached pass over a huge context.
- A subagent ISOLATES the fan-out: your main context stays light + responsive, you can do other
  work (or run several CCDRs) in parallel, and you ingest only the ~1-2k-token synthesized result.
  Net = faster throughput + cheaper, even though the CCDR wall-clock itself is unchanged.
- Same principle as the manager's cron work (cc-watch / skill-capture / dream all delegate to a
  subagent to keep the main context light) and the "sub-agent returns only a distilled summary" rule.
- For a parallel/background CCDR, spawn the subagent with `run_in_background: true` and keep working
  until it completes.

### Pointer-return rule — subagent MUST NOT return the full report to the parent

The subagent's final message MUST be a SHORT POINTER, not the full DR output. The full output stays
in the subagent's context (isolated); the parent only ingest a 1-2 line pointer. Without this, the
synthesized report floods the parent context anyway, defeating the isolation benefit.

**Mandatory subagent instruction** (append to every CCDR subagent prompt):

> After `/deep-research` completes, write the full report to
> `lean/factors/alpha_research/YYYY-MM-DD_HHmm_<topic>.md` (substitute real timestamp + topic slug).
> Your reply to me MUST be EXACTLY: `DONE: <filepath> — <one-line verdict summary>`.
> Do NOT paste the full report or ranked-candidates table in your reply.

The parent reads the file on-demand (via Read tool) when it needs the ranked candidates. The parent
context receives ~10 words, not ~50k tokens.

Delegation changes WHO runs it, not the prompt bar — the subagent STILL composes its prompt to the
6 required parts below.

## RULE A — completion bar (a DR round is NOT done until EVERY candidate has a verdict)
**A deep-research round is NOT COMPLETE until EVERY ranked candidate has a QC verdict — a real QC
bt-id (32-hex) + ALIVE/DEAD, OR an explicit `needs-paid-data:<feed>` flag. No cherry-picking the
"top 1-2".** The failure mode this kills: a worker runs DR, gets 5 ranked candidates, QC-tests only
the 1-2 it likes, and silently drops the rest — so the round's "DEAD" verdict is unearned (the
dropped candidates were never falsified). Every ranked candidate must land in one of exactly three
terminal states:
- a real **32-hex QC bt-id** + **ALIVE** / **DEAD** (it was actually backtested), or
- **`needs-paid-data:<feed>`** (it genuinely cannot be tested on free QC — name the exact feed), or
- (nothing else counts — `pending` / `-` / empty = the round is NOT done).

Emit the verdicts in the **`## Candidates` ledger** (format below) so this is auditable; a missing
or partial ledger is itself a sign the round was cherry-picked. The cc-monitor
`check_dr_candidates_verified` pass parses this ledger and flags any un-verified candidate.

## RULE B — force genuine novelty (don't converge on the obvious literature idea)
After reading a lot of DR, exploration tends to collapse onto the literature-standard, mostly-already-
DEAD ideas. Counter it explicitly: **the DR prompt MUST demand NON-obvious / contrarian / cross-domain
mechanisms, rank candidates by orthogonality/novelty (NOT by plausibility), and self-critique its own
novelty.** Concretely the prompt must:
- **Treat literature-standard ideas as presumed-DEAD** — momentum, OFI/order-flow-imbalance, value,
  plain mean-reversion, vanilla carry/TSMOM, PEAD, announcement-premium are the obvious first answers
  the whole field (and this fleet) already burned. Name them in the DEAD-list (part 2) and say "do not
  return these as candidates; if you must, justify a genuinely new variant."
- **Demand cross-domain / contrarian mechanisms** — pull the causal story from a DIFFERENT domain
  (behavioral, microstructure, cross-asset lead-lag, regime-conditional, flow/positioning-structural,
  alt-data) than the obvious one; favor a mechanism where the crowd's assumption might be WRONG.
- **RANK by orthogonality/novelty, not plausibility** — the most plausible candidate is usually the
  most crowded/priced-in. Ask DR to sort candidates by (expected corr to the existing book ASC, novelty
  DESC), not by "how likely to work."
- **Self-novelty-critique** — the prompt must require, for each candidate, an explicit answer to:
  *"Is this just the obvious literature idea dressed up? What assumption is everyone making here that
  might be wrong — and does this candidate exploit that, or repeat it?"* A candidate that can't answer
  this is a literature retread → drop it.

Diverse-lens ideation + a novelty critic is operationalized as a reusable Workflow — see
**`lean/research/skills/coding/dr_exploration_workflow.js`** (Part 3): parallel distinct-lens idea
agents → dedup → novelty-critic (drop literature-standard/known-DEAD, rank by orthogonality) →
per-candidate QC verify (RULE A) → synthesis emitting the `## Candidates` ledger. Invoke it for a
thorough exploration round instead of free-forming one DR prompt and cherry-picking its output.

## The 6 required parts of a fleet CCDR prompt

1. **Goal + metric + acceptance** — the exact bar the research must serve, e.g.
   *"US-futures strategy, 5yr Sharpe ≥ 2.0, DSR-passing, realistic costs, free-QC + PIT universe."*
   Without the number, DR optimizes for "interesting," not "clears the bar."
2. **DEAD-list / avoid** — paste the ledger of already-refuted angles (from the strategy's
   `PROGRESS.md` + memory `project_*`), e.g. *"already DEAD, do NOT re-propose: tsmom, all 6 trend
   variants, coint-spreads, announcement-effect."* This is the single biggest quality lever — it
   stops DR from returning the dead angles the fleet already burned.
3. **Novelty / orthogonality bar** — *"genuinely NEW mechanism with an economically-grounded causal
   story (not a data-mined correlation); target corr < 0.4 to the existing book."*
4. **Deliverable shape** — *"return candidates RANKED BY ORTHOGONALITY/NOVELTY (not plausibility);
   each with: (a) mechanism — the non-obvious causal story, and which DOMAIN it's pulled from,
   (b) expected edge / SR AND expected corr to the existing book, (c) data availability on free QC
   (or exactly which paid feed it needs → `needs-paid-data:<feed>`), (d) a $0 falsification test to
   run FIRST, (e) a self-novelty-critique: 'is this just the obvious literature idea? what assumption
   is everyone making that might be wrong?'"* Forces actionable + novel, not a crowded survey.
   Per RULE A the round is not done until EVERY one of these candidates has a QC verdict.
5. **Cite-required** — sources for every claimed effect; mark speculative vs evidenced.
6. **Scope guards** — free-QC-first; honor excluded scope (e.g. crypto if excluded for this worker);
   respect the DR ladder (CCDR → Gemini DR → OpenAI DR; paid data only after all three).

## Paid DR must be ACTED ON (never fire-and-forget)
The DR ladder for workers is **CCDR (free, DEFAULT) → Gemini DR (~$3) → OpenAI DR (~$6)**.
Escalate to Gemini DR ONLY after several CCDR rounds genuinely miss the goal's target (a
CCDR-DEAD on a find-alpha goal COUNTS as "missed" and DOES justify escalating); escalate to
OpenAI DR ONLY after Gemini also misses — OpenAI IS allowed, it is the top of the ladder, not
off-limits. **CRITICAL: every PAID DR call (Gemini AND OpenAI) MUST be immediately followed by
genuine falsification-testing of its top-ranked candidates** — run the skill_177 deliverable
method on each: mechanism → $0 falsification test → QC BT. A paid DR fired and then NOT acted on
is wasted money ($3 / $6 gone for nothing). NEVER fire-and-forget a paid DR: if you spend the
money, you owe the falsification work on its output. (This is the worker's own ladder judgment;
the keepalive/nudge must NOT auto-push paid escalation.)

## Bad vs good (illustrative)
- ❌ *"deep research US futures strategies for high Sharpe"* — no metric, no DEAD-list, no deliverable
  shape → returns generic TSMOM/carry (already DEAD) as a "survey."
- ✅ *"Find a NEW US-futures alpha mechanism for 5yr Sharpe ≥ 2.0 on free QC (PIT). Already DEAD —
  do not propose: tsmom, trend (6 variants), coint-spreads, announcement-effect. Need an
  economically-grounded mechanism, corr < 0.4 to a long-equity book. Return ranked candidates, each
  with mechanism / expected SR / free-QC data availability (or required paid feed) / a $0
  falsification test. Cite sources."*

## Pitfalls
- Skipping the DEAD-list = the #1 cause of wasted DR rounds (re-explores refuted angles).
- Asking for "a report on X" instead of ranked falsifiable candidates = unactionable.
- Free-forming the prompt instead of using this template = inconsistent quality across the fleet.

## The `## Candidates` ledger format (MANDATORY — the round's auditable output)
Every DR-research doc a worker commits MUST contain a section headed exactly `## Candidates` with a
markdown table. Columns must include the candidate name/mechanism and a `verdict` cell. The `verdict`
cell of each row is one of:
- a **32-hex QC bt-id** (e.g. `acf72f9d1234...` — proves it was backtested) — pair with ALIVE/DEAD,
- **`ALIVE`** / **`DEAD`** (the verdict, ideally next to its bt-id), or
- **`needs-paid-data:<feed>`** (e.g. `needs-paid-data:ThetaData-IV`).

A row whose `verdict` is EMPTY / `pending` / `-` = an **un-verified candidate** → the round is NOT
complete (RULE A). Example:

```
## Candidates
| # | mechanism (domain)                    | corr | novelty-critique (1-line)        | verdict                     |
|---|---------------------------------------|------|----------------------------------|-----------------------------|
| 1 | dispersion-of-beliefs reversal (behav)| 0.18 | not OFI; bets crowd is overconf.  | 32a1...f9 DEAD              |
| 2 | cross-asset credit→equity lead (xasset)| 0.31| contrarian: lead not lag           | 9c0b...4e ALIVE            |
| 3 | dealer-gamma flow-structural overlay  | 0.22 | needs dealer positioning feed     | needs-paid-data:SqueezeGEX |
```

The cc-monitor `check_dr_candidates_verified` pass parses exactly this table and flags any row with a
bt-id-less / verdict-less cell, naming the un-verified candidates.

## Cross-references
- Skill 111 (Deep Research / DR router), Skill 50 (alpha workflow Gate 0–1), `MANAGER_RULES.md`
  (DR escalation ladder; "every goal must LAND"; "a DEAD is not done").
- **`lean/research/skills/coding/dr_exploration_workflow.js`** — the reusable diverse-lens →
  novelty-critic → per-candidate-QC-verify Workflow that operationalizes RULE A + RULE B for a
  thorough exploration round.
- cc-monitor `check_dr_candidates_verified` — the pass that enforces RULE A by parsing the
  `## Candidates` ledger.
