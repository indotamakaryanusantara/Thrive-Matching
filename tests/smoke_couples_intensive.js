/**
 * Smoke tests — Couples Your Goals + Other Intensive therapist matching
 * Run: node tests/smoke_couples_intensive.js
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'matcher-source', 'thrivetherapy-matchingdemo.html'), 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

function grab(name, kind) {
  const re = kind === 'fn'
    ? new RegExp('function ' + name + '\\([\\s\\S]*?\\n}')
    : new RegExp('const ' + name + ' = [\\s\\S]*?\\n[\\]}];');
  const m = src.match(re);
  if (!m) throw new Error('could not extract ' + name);
  return m[0];
}

// COUPLES_GOAL / INTENSIVE_GOAL are const objects — extract manually
const couplesMap = src.match(/const COUPLES_GOAL_TO_MATCH = \{[\s\S]*?\n\};/)[0];
const intensiveMap = src.match(/const INTENSIVE_GOAL_TO_MATCH = \{[\s\S]*?\n\};/)[0];
const intensiveRouting = src.match(/const INTENSIVE_ROUTING = \{[\s\S]*?\n\};/)[0];

eval([
  grab('THERAPISTS'), grab('GROUPS'),
  src.match(/const GROUP_KEYWORDS = \{[\s\S]*?\n\};/)[0],
  grab('MESSAGE_SPECIALTY_KEYWORDS'), grab('PLAIN_LABEL_KEYWORDS'),
  src.match(/Object\.entries\(PLAIN_LABEL_KEYWORDS\)[\s\S]*?\}\);/)[0],
  grab('NICHE_KEYWORDS'), grab('nicheKwHits', 'fn'),
  src.match(/const HARD_FILTER_SPECIALTIES = \[[^\]]*\];/)[0],
  couplesMap, intensiveMap, intensiveRouting,
  grab('detectImplicitSpecialties', 'fn'), grab('getSeverityTier', 'fn'),
  grab('specCredit', 'fn'), grab('normalizeInsuranceForMatch', 'fn'),
  grab('analyzeMessageScore', 'fn'),
  // intensiveType is closed-over from page scope; bind to globalThis for tests
  'globalThis.__intensive = null;',
  grab('findMatch', 'fn').replace(/\bintensiveType\b/g, 'globalThis.__intensive'),
  'Object.assign(globalThis, {THERAPISTS, COUPLES_GOAL_TO_MATCH, INTENSIVE_GOAL_TO_MATCH, INTENSIVE_ROUTING, findMatch, getSeverityTier});'
].join('\n'));

function setFlow(svc, intensive) {
  globalThis.__intensive = intensive;
}
let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { passed++; console.log('  PASS  ' + label); }
  else { failed++; console.log('  FAIL  ' + label); }
}

console.log('\n— Couples Your Goals mapping —');
const expectedGoals = [
  'Affair / Betrayal Recovery',
  'Communication & Conflict',
  'Family Dynamics',
  'Sex & Intimacy',
  'Life Transitions',
  'Premarital',
];
expectedGoals.forEach(g => {
  check('map has "' + g + '"', !!COUPLES_GOAL_TO_MATCH[g]);
});

console.log('\n— Couples: Affair goal → infidelity specialists —');
{
  setFlow('couples', null);
  const ranked = [{ id: 'couples', label: 'Affair / Betrayal Recovery' }];
  const niches = new Set(['infidelity', 'betrayal trauma']);
  const notes = 'affair / betrayal recovery';
  const tier = getSeverityTier(['couples'], notes);
  const res = findMatch(ranked, 3, 'aetna', 3, 2, null, 30, niches, tier, notes, 'specialty', 'couples', 'excluded');
  check('returns matches', res.length > 0);
  check('all have infidelity/betrayal niche',
    res.every(r => r.therapist.niche.some(n => ['infidelity', 'betrayal trauma'].includes(n))));
}

console.log('\n— Couples: Premarital goal → niche signal —');
{
  setFlow('couples', null);
  const ranked = [{ id: 'couples', label: 'Premarital' }];
  const niches = new Set(['premarital']);
  const notes = 'premarital';
  const tier = getSeverityTier(['couples'], notes);
  const res = findMatch(ranked, 3, 'bcbs', 3, 2, null, 28, niches, tier, notes, 'specialty', 'couples', 'excluded');
  check('returns matches for premarital', res.length > 0);
  const topHasPremarital = res.some(r => r.therapist.niche.includes('premarital') || r.therapist.specialties.includes('couples'));
  check('top results include couples/premarital therapists', topHasPremarital);
}

console.log('\n— Other Intensive Your Goals mapping —');
['ketamine', 'ocd_intensive', 'couples_intensive', 'trauma_intensive'].forEach(k => {
  check('INTENSIVE_GOAL_TO_MATCH has ' + k, !!INTENSIVE_GOAL_TO_MATCH[k]);
});

console.log('\n— Other Intensive: OCD → OCD specialty match —');
{
  setFlow('other_intensive', 'ocd_intensive');
  const goal = INTENSIVE_GOAL_TO_MATCH.ocd_intensive;
  const ranked = [{ id: goal.specialty, label: goal.label }];
  const notes = goal.label.toLowerCase();
  const tier = getSeverityTier([goal.specialty], notes);
  const res = findMatch(ranked, 3, 'aetna', 3, 2, null, 30, new Set(), tier, notes, 'specialty', 'other_intensive', 'excluded');
  check('returns matches for OCD intensive', res.length > 0);
  check('top match has ocd specialty or comfortable',
    res[0] && (res[0].therapist.specialties.includes('ocd') || (res[0].therapist.comfortable || []).includes('ocd')));
  const jenna = THERAPISTS.find(t => t.name === 'Jenna Daniel');
  if (jenna && jenna.caseload !== 'closed') {
    check('Jenna Daniel among top when open', res.some(r => r.therapist.name === 'Jenna Daniel'));
  } else {
    check('Jenna Daniel closed or missing — skip boost assert (ok)', true);
  }
}

console.log('\n— Other Intensive: Trauma → trauma specialty —');
{
  setFlow('other_intensive', 'trauma_intensive');
  const goal = INTENSIVE_GOAL_TO_MATCH.trauma_intensive;
  const ranked = [{ id: goal.specialty, label: goal.label }];
  const notes = goal.label.toLowerCase();
  const tier = getSeverityTier([goal.specialty], notes);
  const res = findMatch(ranked, 3, 'bcbs', 3, 2, null, 35, new Set(), tier, notes, 'specialty', 'other_intensive', 'excluded');
  check('returns matches for trauma intensive', res.length > 0);
  check('top has trauma specialty or comfortable',
    res[0] && (res[0].therapist.specialties.includes('trauma') || (res[0].therapist.comfortable || []).includes('trauma')));
}

console.log('\n— Other Intensive: Couples Intensive soft-boost Cayla path —');
{
  setFlow('other_intensive', 'couples_intensive');
  const goal = INTENSIVE_GOAL_TO_MATCH.couples_intensive;
  const ranked = [{ id: goal.specialty, label: goal.label }];
  const niches = new Set(['couples intensives']);
  const notes = goal.label.toLowerCase();
  const tier = getSeverityTier([goal.specialty], notes);
  const cayla = THERAPISTS.find(t => t.name === 'Cayla Bozovich');
  const orig = cayla.caseload;
  const origIns = cayla.insurance;
  cayla.caseload = 'open';
  cayla.insurance = ['aetna', 'bcbs'];
  const res = findMatch(ranked, 3, 'aetna', 3, 2, null, 30, niches, tier, notes, 'specialty', 'other_intensive', 'excluded');
  check('returns matches', res.length > 0);
  check('Cayla ranks #1 when open (intensive soft boost)', res[0] && res[0].therapist.name === 'Cayla Bozovich');
  cayla.caseload = orig;
  cayla.insurance = origIns;
}

console.log('\n— UI copy markers in source —');
check('Couples step title Your Goals', /stepCouplesSpecialty[\s\S]*?Your Goals/.test(html));
check('Intensive step1b title Your Goals', /id="step1b"[\s\S]*?Your Goals/.test(html));
check('intensive submit routes to step4 prefs', /INTENSIVE_GOAL_TO_MATCH\[type\][\s\S]*?step4/.test(src));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
