export const meta = {
  name: 'cc-self-audit-grill',
  description: 'Reusable 12h self-audit: adversarially grill the cc-manager mechanism + manager↔worker interactions, verify each finding, return a confirmed ranked list for the fix subagent.',
  phases: [
    { title: 'Grill', detail: 'one adversarial auditor per dimension, against the real scripts + recent commits + interaction logs' },
    { title: 'Verify', detail: 'skeptically confirm/refute each finding (default REFUTED unless reproduced)' },
    { title: 'Synthesize', detail: 'ranked confirmed-real list with file:line + concrete fix' },
  ],
}
// Invoked by cc-self-audit.prompt via Workflow({scriptPath: ".../cc-self-audit-grill.js"}).
// Recipe distilled from an operator-guided session that actually landed fixes:
//   fan-out finders → skeptical verify (default-refute) → synth → (orchestrator hands to a fix subagent).
const APX = process.env.CC_REPO || (process.env.HOME + '/your-repo')
const CC_HOME = process.env.CC_HOME || (process.env.HOME + '/claude-code-fleet')
const MEM = process.env.CC_MEMORY_DIR || ''
const COMMON = `You are an ADVERSARIAL auditor of the cc-manager worker-fleet MECHANISM and the manager↔worker
interaction quality. Read the REAL material (read-only; Bash/Read/Grep):
- Scripts: <CC_HOME>/bin/ + plugins/ (cc-watch, cc-recruit, cc-keepalive, cc-review, verify-claim,
  cc-freeze-check, cc-monitor, cc-task, cc-goal, ts, MANAGER_RULES.md)
- Recent worker output: \`git -C ${APX} log --since='12 hours ago'\`, ${APX}/.cc-review/*.json,
  the live metric ledger of any actively-worked task.
- Interaction: ~/.claude (manager history), /tmp/cc-manager.log, ~/.cc-manager/cc-review-feed.log,
  ~/.cc-manager/escalations.log, ${MEM}/feedback_*.md (the durable rules, if CC_MEMORY_DIR is set).
Find REAL defects: rules that CONTRADICT each other, doctrine the commits/logs show being GAMED or
NOT followed, checks that don't actually fire, failure modes with no coverage, AND manager-behavior
that wasted compute (goal churn, false-FAIL repokes, redundant nudges, raising goals on unverified
run ids). Cite exact file:line / commit / log line. Default-assume broken; prove it. NOT style nits.`
const FS = { type:'object', additionalProperties:false, required:['findings'], properties:{ findings:{ type:'array', items:{
  type:'object', additionalProperties:false, required:['title','evidence','severity','impact','fix'], properties:{
    title:{type:'string'}, evidence:{type:'string',description:'file:line / commit / log proof'},
    severity:{type:'string',enum:['critical','high','medium','low']},
    impact:{type:'string'}, fix:{type:'string',description:'concrete, surgical code/rule change'} } } } } }
const DIMS = [
  { k:'mechanism-correctness', p:`${COMMON}\nDIMENSION: cc-watch/cc-review/cc-keepalive/verify-claim CORRECTNESS — cursor/attribution/lock/freeze/watchdog logic, set -u traps, race conditions, silently-dropped commits/repokes, run-id verification holes.` },
  { k:'review-efficacy', p:`${COMMON}\nDIMENSION: is the layered review EFFECTIVE + non-gameable? Read several .cc-review/*.json + the feed. Can a worker fabricate a run-id/target metric and pass? Are FAILs real or goal-blind false-positives? Does the review actually reach + constrain the worker?` },
  { k:'rule-consistency', p:`${COMMON}\nDIMENSION: do MANAGER_RULES + feedback_*.md CONTRADICT each other or the current goals? (e.g. acceptance-bar vs an unverified-result goal; record-ALIVE/DEAD-never-stops vs certified-terminal vs goal-erosion). List concrete contradictions with both rule texts.` },
  { k:'manager-interaction', p:`${COMMON}\nDIMENSION: manager↔worker INTERACTION quality over the last 12h. Goal churn without verify gates? False-FAIL repokes forwarded verbatim? Redundant/identical nudges to a healthy worker? Goals raised on unresolved run-ids? Ceilings asserted without citing the metric ledger? Quantify wasted compute and give the manager-behavior fix.` },
  { k:'coverage-gaps', p:`${COMMON}\nDIMENSION: failure modes with NO coverage — per-worker token budget, unbounded runtime, account-switch, fabricated results, premature retire, paid-gate walls re-goaled instead of escalated. What important mode is completely unguarded?` },
]
phase('Grill')
// #2 stability — precondition: a wrong/missing corpus path silently blinds the auditors (the MEM-path
// bug nearly shipped a blind audit). The workflow JS has no fs, so a cheap Bash-only agent checks it;
// abort LOUD rather than run an expensive blind partial-corpus audit.
const _pf = await agent(`Bash-only, no analysis. Check ONLY these two abort-critical corpus paths:
- ${CC_HOME}/bin (must be a dir)
- (optional) ${MEM}/feedback_*.md — only if CC_MEMORY_DIR is set; never affects ok
Return {ok, missing[]} where ok=false iff ${CC_HOME}/bin is absent (the feedback_*.md corpus is optional and never affects ok).
Set ok=true otherwise. Nothing else affects ok (no other path is consulted).`,
  { label:'preflight', phase:'Grill', schema:{type:'object',additionalProperties:false,required:['ok','missing'],properties:{ok:{type:'boolean'},missing:{type:'array',items:{type:'string'}}}} })
// grill 2026-06-15 FIX: only abort on an EXPLICIT ok:false (corpus genuinely missing). If the preflight
// agent ITSELF died (_pf null/undefined — a transient model/tool flake, most likely on the cheapest
// call), fail OPEN, not closed — killing a healthy 12h audit on a flaky probe (mislabeled "corpus
// missing") is worse than proceeding; the downstream grill agents read the corpus themselves and will
// surface a truly-absent corpus.
if (!_pf) {
  log(`PREFLIGHT agent DIED (transient) — proceeding fail-open (corpus probe inconclusive, not a corpus-missing signal). Grill agents will surface a truly-absent corpus.`)
} else if (!_pf.ok) {
  const _miss = (_pf.missing && _pf.missing.length ? _pf.missing : ['(unspecified)']).join(', ')
  log(`PREFLIGHT FAIL — audit corpus missing/empty: ${_miss}. Aborting (a blind partial-corpus audit is worse than none — fix the path consts in cc-self-audit-grill.js).`)
  return { confirmed_count:0, aborted:true, synthesis:{ summary:`ABORTED: corpus precondition failed — ${_miss}`, confirmed:[], top_fix:'fix the missing corpus path(s) in cc-self-audit-grill.js' } }
}
const grilled = await parallel(DIMS.map(d => () => agent(d.p, { label:`grill:${d.k}`, phase:'Grill', schema:FS })))
const all = grilled.filter(Boolean).flatMap((r,i)=>(r.findings||[]).map(f=>({...f,dim:DIMS[i].k})))
phase('Verify')
const VS = { type:'object', additionalProperties:false, required:['verdict','reasoning'], properties:{
  verdict:{type:'string',enum:['REAL','REFUTED','PARTIAL']}, reasoning:{type:'string'},
  corrected_severity:{type:'string',enum:['critical','high','medium','low','none']} } }
// #3 stability — budget-cap the verify fan-out (the unbounded part: 1 agent per finding; last run was
// 2.4M tokens). No budget target → verify ALL (stay thorough). Budget set → cap, prioritizing the most
// severe; the dropped tail is LOGGED loudly (no silent truncation).
const _sev = { critical:0, high:1, medium:2, low:3 }
const _ranked = [...all].sort((a,b)=>(_sev[a.severity]??9)-(_sev[b.severity]??9))
const _maxV = (budget && budget.total) ? Math.max(6, Math.floor(budget.remaining()/80000)) : all.length
const _toV = _ranked.slice(0, _maxV)
if (_toV.length < all.length) log(`#3 budget cap: verifying ${_toV.length}/${all.length} findings (dropped ${all.length-_toV.length} lowest-severity to stay in budget — raise the budget target to verify all).`)
const verified = await parallel(_toV.map(f => () =>
  agent(`SKEPTICALLY verify this claimed cc-manager defect. Read the actual files. Is it REAL or is the auditor wrong (already handled / evidence misread / can't occur)? Default REFUTED unless you reproduce it with evidence.\nCLAIM: ${JSON.stringify(f)}`,
    { label:`verify:${f.dim}`, phase:'Verify', schema:VS }).then(v=>({...f,...v}))))
const real = verified.filter(Boolean).filter(v => v.verdict==='REAL' || v.verdict==='PARTIAL')
phase('Synthesize')
const SY = { type:'object', additionalProperties:false, required:['summary','confirmed','top_fix'], properties:{
  summary:{type:'string'},
  confirmed:{type:'array',items:{type:'object',additionalProperties:true},description:'ranked: severity, file, evidence, concrete fix'},
  top_fix:{type:'string'} } }
const synth = await agent(`Synthesize this cc-manager self-audit. Below are findings that SURVIVED skeptical verification. Produce a 3-sentence summary, a severity-RANKED confirmed[] list (each: title, severity, file:line, evidence, concrete surgical fix), and the single top_fix. This goes straight to a fix subagent — make every fix CONCRETE and SURGICAL (exact file + change), not vague.\nVERIFIED:\n${JSON.stringify(real,null,2)}`,
  { label:'synthesize', phase:'Synthesize', schema:SY })
return { confirmed_count: real.length, synthesis: synth, verified: real }
