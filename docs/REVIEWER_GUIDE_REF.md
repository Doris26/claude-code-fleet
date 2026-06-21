# Reviewer guide — reference (shared by a colleague)

Kept as a REFERENCE; the parts that apply to our result-exploration
work are already folded into cc-review's ALGO_PROMPT (grill points 9–14). The
production-execution parts are NOT in our default review (we explore, we don't run
production here) — pull them in if/when reviewing a deployment change.

## Folded into our algo-grill (ALGO_PROMPT #9–14)
- **A passing result is the default suspect, not the default truth.**
- **Red-flag magnitudes:** an implausibly strong target metric ⇒ find the leak before accepting; show in-sample/held-out + an adverse slice.
- **Look-ahead / leakage:** same-step state tracker, future data in inputs, test-set early-stopping, label leakage; trace each input's timestamp vs the decision step.
- **Horizon mismatch:** input horizon vs evaluation horizon; overlapping windows inflate the count and are labels only.
- **Clipped bounds:** any `clip(lower=-X)` result invalid until a full tick-level replay validates it.
- **Walk-forward stability:** K-fold WF — same param across folds = stable, different each fold = overfit.
- **Burden of proof:** back every "this metric is wrong" with the leak you found or the rerun you did.

## NOT folded — production-execution only (reference for deployment reviews)
- **Execution-path / opposite-side state matrix:** for any reversible action / state transition,
  verify the opposite side under the full matrix (open↔close, acquire↔release, the auto vs no-op
  effect variants). Historical bugs were asymmetric (correct on one side, broken on the inverse).
  Expect a regression guard test for the opposite side.
- **Param/reproducibility integrity:** changing a champion param without re-running the canonical
  sweep + updating validation history invalidates published metrics — blocking. Paths via a paths
  module, not `__file__`-derived.
- **Run for real:** `pytest -n 30` (xdist); reproduce any metric claim with the canonical script.
- **Audit-before-valid:** confirm data AND implementation were audited (self + reviewer) before valid.
- **Output:** lead with a verdict; tag findings blocking vs nice-to-have.
