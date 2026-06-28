export const meta = {
  name: 'dr-exploration-workflow',
  description: 'Reusable thorough deep-research exploration round: parallel DIVERSE-LENS ideation → dedup → NOVELTY-CRITIC (drop literature-standard/known-DEAD, rank by orthogonality) → per-candidate verify (RULE A) → synthesis emitting the `## Candidates` ledger + ALIVE survivors.',
  phases: [
    { title: 'Ideate', detail: 'one agent per DISTINCT lens (behavioral / microstructure / cross-domain lead-lag / regime-conditional / flow-structural / alt-data), each generating candidate mechanisms' },
    { title: 'Critic', detail: 'dedup, drop literature-standard & known-DEAD ideas, rank survivors by orthogonality/novelty (RULE B)' },
    { title: 'Verify', detail: 'EACH surviving candidate gets a real verification run → ALIVE/DEAD or needs-paid-data (RULE A — no cherry-picking)' },
    { title: 'Synthesize', detail: 'emit the `## Candidates` ledger + the ALIVE survivors' },
  ],
}
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS / HOW WORKERS INVOKE IT
// A research worker invokes this Workflow for a THOROUGH exploration round instead of free-forming
// one deep-research prompt and cherry-picking its output. It fixes two common quality failures:
//   P1 (cherry-picking): RULE A — the round is NOT done until EVERY surviving candidate has a real
//      verification verdict. The Verify phase runs `verify` on each candidate via pipeline(); none is
//      dropped un-falsified. The synthesis emits the `## Candidates` ledger so completeness is auditable.
//   P2 (shallow / literature-convergent): RULE B — the Ideate phase fans out DISTINCT lenses (so ideas
//      don't all collapse onto the obvious textbook answer), and the Critic phase explicitly drops
//      literature-standard / known-DEAD ideas and RANKS by orthogonality/novelty, not plausibility.
//
// Invoke (from a worker, via the Workflow tool):
//   Workflow({ scriptPath: "bin/dr_exploration_workflow.js",
//              input: { goal, metric_bar, dead_list, baseline_desc, verify } })
//   - goal:          the goal in one line ("new orthogonal mechanism, metric >= BAR, free data").
//   - metric_bar:    the explicit acceptance number the verification run must clear.
//   - dead_list:     already-DEAD angles to forbid (from your progress log + memory); the lenses and
//                    the critic both receive this so refuted angles never come back as 'candidates'.
//   - baseline_desc: the existing baseline/book, so orthogonality (corr) can be estimated/ranked.
//   - verify:        a worker-supplied async fn (candidate) -> { runid, verdict, metric } that runs a
//                    REAL verification on your backend (the verification backend ONLY — never a
//                    self-written shortcut) and returns a run id + ALIVE/DEAD, OR
//                    { needs_paid_data: "<feed>" }. RULE A is only honored if `verify` is a genuine
//                    backend run; passing a stub defeats the purpose.
//
// Conventions: this is a Workflow-tool JS module — top-level `meta`, and phase()/agent()/parallel()/
// pipeline() are provided by the Workflow runtime. The body is an async top-level program (evaluated
// as a function body); it returns the synthesis object.
// ---------------------------------------------------------------------------------------------

const inp = (typeof input === 'object' && input) ? input : {}
const GOAL = inp.goal || '(goal not supplied — caller MUST pass input.goal: the one-line goal + metric bar)'
const METRIC_BAR = inp.metric_bar || '(no explicit bar supplied — RULE A still applies: every candidate needs a verdict)'
const DEAD_LIST = inp.dead_list || '(no DEAD-list supplied — STILL treat literature-standard / textbook ideas as presumed-DEAD)'
const BASELINE = inp.baseline_desc || '(existing baseline not described — estimate orthogonality qualitatively)'
// `verify` MUST be a real backend-run fn; if absent we still run, but flag every candidate as
// needs-verify so the round is honestly INCOMPLETE rather than silently cherry-picked.
const verify = (typeof inp.verify === 'function') ? inp.verify : null

// The DISTINCT lenses — each pulls a candidate mechanism from a DIFFERENT domain so the round does
// NOT converge on the one obvious answer (RULE B). Add/trim lenses per the goal's domain.
const LENSES = [
  { k: 'behavioral',           d: 'psychology / belief-dispersion / over-and-under-reaction mechanisms — but NOT the vanilla textbook version (presumed-DEAD).' },
  { k: 'microstructure',       d: 'execution / liquidity / inventory mechanisms — but NOT the plain obvious one; find a non-obvious structural edge.' },
  { k: 'cross-domain-lead-lag', d: 'one signal/series LEADING another. Favor a CONTRARIAN lead-vs-lag framing the crowd gets backwards.' },
  { k: 'regime-conditional',   d: 'a mechanism that only exists in a specific EXOGENOUS regime (volatility / liquidity / macro state) — conditioned on exogenous state, not own outcome.' },
  { k: 'flow-structural',      d: 'positioning / flows / mechanical structural pressure — calendar-anchored, hard-to-arb supply/demand.' },
  { k: 'alt-data',             d: 'an orthogonal alt-data signal with an economically-grounded causal story (NOT a data-mined correlation). State exactly which feed (free vs paid).' },
]

const IDEA_SCHEMA = { type:'object', additionalProperties:false, required:['candidates'], properties:{
  candidates:{ type:'array', items:{ type:'object', additionalProperties:false,
    required:['name','mechanism','domain','expected_corr','novelty_critique','data_availability','falsification_test'], properties:{
    name:{type:'string'}, mechanism:{type:'string', description:'the non-obvious causal story — why it should work'},
    domain:{type:'string'}, expected_corr:{type:'string', description:'expected corr to the baseline (ASC = more orthogonal)'},
    novelty_critique:{type:'string', description:'"is this just the obvious literature idea? what assumption is everyone making that might be wrong?"'},
    data_availability:{type:'string', description:'free, or the exact paid feed it needs'},
    falsification_test:{type:'string', description:'the cheap test to run FIRST'} } } } } }

phase('Ideate')
// Fan out one ideation agent per lens, in PARALLEL — distinct domains, so the candidate set is
// genuinely diverse instead of six rephrasings of the same textbook idea. Each gets goal + DEAD-list.
const ideated = await parallel(LENSES.map(L => () => agent(
`You are an idea generator working the "${L.k}" LENS ONLY. Generate 2-4 NON-OBVIOUS candidate
mechanisms for this goal, strictly from your lens's domain:
GOAL: ${GOAL}
METRIC BAR: ${METRIC_BAR}
EXISTING BASELINE (for orthogonality): ${BASELINE}
LENS (${L.k}): ${L.d}
ALREADY-DEAD — do NOT propose (and do NOT re-skin): ${DEAD_LIST}
RULE B: treat literature-standard / textbook ideas as PRESUMED-DEAD — only propose one as a genuinely
new variant with a justified twist, else skip. For EACH candidate fill novelty_critique honestly: is
it just the obvious literature idea? what assumption is everyone making here that might be wrong, and
does this candidate EXPLOIT that or REPEAT it? Prefer mechanisms orthogonal (low corr) to the
baseline. Cite a source / evidence for any claimed effect.`,
  { label:`ideate:${L.k}`, phase:'Ideate', schema:IDEA_SCHEMA })))
const pool = ideated.filter(Boolean).flatMap((r,i)=>(r.candidates||[]).map(c=>({...c, lens:LENSES[i].k})))

phase('Critic')
// Single NOVELTY-CRITIC pass: dedup, drop literature-standard / known-DEAD, RANK by orthogonality &
// novelty (NOT plausibility — the most plausible idea is usually the most crowded/priced-in).
const CRITIC_SCHEMA = { type:'object', additionalProperties:false, required:['survivors','dropped'], properties:{
  survivors:{ type:'array', description:'ranked best-first by (orthogonality DESC, novelty DESC) — survives only if NOT literature-standard/known-DEAD',
    items:{ type:'object', additionalProperties:false, required:['name','mechanism','domain','rank_reason','expected_corr','falsification_test'], properties:{
      name:{type:'string'}, mechanism:{type:'string'}, domain:{type:'string'},
      rank_reason:{type:'string', description:'why it ranks here on orthogonality/novelty'},
      expected_corr:{type:'string'}, falsification_test:{type:'string'} } } },
  dropped:{ type:'array', items:{ type:'object', additionalProperties:false, required:['name','reason'], properties:{
    name:{type:'string'}, reason:{type:'string', description:'literature-standard / known-DEAD / duplicate'} } } } } }
const critique = await agent(
`You are a NOVELTY CRITIC. Below are candidate mechanisms from diverse lenses. Your job (RULE B):
1) DEDUP near-identical mechanisms (keep the best-framed one).
2) DROP any candidate that is literature-standard / textbook OR is on the DEAD-list — put it in
   dropped[] with the reason. Be HARSH: if a candidate's novelty_critique reveals it just repeats the
   crowd's assumption, drop it.
3) RANK survivors best-first by ORTHOGONALITY (low corr to baseline) then NOVELTY — NOT by plausibility
   (the most plausible is usually the most crowded). Give each a rank_reason.
DEAD-LIST: ${DEAD_LIST}
BASELINE: ${BASELINE}
CANDIDATES:\n${JSON.stringify(pool, null, 2)}`,
  { label:'novelty-critic', phase:'Critic', schema:CRITIC_SCHEMA })
const survivors = (critique && critique.survivors) ? critique.survivors : []

phase('Verify')
// RULE A — EACH surviving candidate gets a REAL verification run. pipeline() runs `verify` per
// candidate; NONE is dropped un-falsified. If the caller didn't supply `verify`, we DON'T fake a
// verdict — we mark every candidate needs-verify so the round is honestly INCOMPLETE (the cc-monitor
// check_dr_candidates_verified pass + the `## Candidates` ledger will surface it), never cherry-picked.
const verified = await pipeline(survivors, async (c) => {
  if (!verify) {
    return { ...c, verdict: 'needs-verify', runid: null,
             note: 'no verify fn supplied — RULE A NOT satisfied; run a real verification for this candidate.' }
  }
  let r
  try { r = await verify(c) } catch (e) { r = { error: String(e && e.message || e) } }
  if (r && r.needs_paid_data) return { ...c, verdict: `needs-paid-data:${r.needs_paid_data}`, runid: null }
  if (r && r.error)           return { ...c, verdict: 'needs-verify', runid: null, note: `verify error: ${r.error}` }
  return { ...c, verdict: (r && r.verdict) || 'needs-verify', runid: (r && r.runid) || null, metric: r && r.metric }
})

phase('Synthesize')
// Emit the `## Candidates` ledger (the exact format the persona / research-rule / cc-monitor agree on)
// plus the ALIVE survivors. ledger_md is a ready-to-paste markdown table for the worker's research doc.
const ALIVE = verified.filter(v => /\bALIVE\b/i.test(v.verdict || ''))
const UNVERIFIED = verified.filter(v => /^(?:needs-verify)?$/i.test((v.verdict || '').trim()))
const esc = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const rows = verified.map((v, i) =>
  `| ${i + 1} | ${esc(v.name)} (${esc(v.domain)}) | ${esc(v.expected_corr)} | ${esc(v.rank_reason || v.novelty_critique)} | ${esc(v.runid ? v.runid + ' ' : '')}${esc(v.verdict)} |`)
const ledger_md = [
  '## Candidates',
  '| # | mechanism (domain) | corr | novelty-critique | verdict |',
  '|---|--------------------|------|------------------|---------|',
  ...rows,
].join('\n')

return {
  goal: GOAL,
  ledger_md,                 // paste THIS into the research doc (RULE A auditable)
  candidates: verified,
  alive: ALIVE,
  rule_a_complete: UNVERIFIED.length === 0,   // false ⇒ round NOT done; those candidates still owe a verification
  unverified: UNVERIFIED.map(v => v.name),
  dropped_as_literature: (critique && critique.dropped) || [],
}
