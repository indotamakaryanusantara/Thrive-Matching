#!/usr/bin/env node
/**
 * Regression tests for thrivetherapy-matchingdemo.html
 * Run: node tests/run_tests.js   (from the project root, requires Node 18+)
 *
 * Extracts the <script> from the demo and exercises the pure matching logic
 * (no DOM needed). Every business rule Colter has ruled on is asserted here —
 * if you refactor the matcher, keep this green.
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
eval([
  grab('THERAPISTS'), grab('GROUPS'),
  src.match(/const GROUP_KEYWORDS = \{[\s\S]*?\n\};/)[0],
  grab('MESSAGE_SPECIALTY_KEYWORDS'), grab('PLAIN_LABEL_KEYWORDS'),
  src.match(/Object\.entries\(PLAIN_LABEL_KEYWORDS\)[\s\S]*?\}\);/)[0],
  grab('NICHE_KEYWORDS'), grab('nicheKwHits', 'fn'),
  src.match(/const HARD_FILTER_SPECIALTIES = \[[^\]]*\];/)[0],
  src.match(/const EXPERTISE_CONTEXT = \{[\s\S]*?\n\};/)[0],
  grab('detectImplicitSpecialties', 'fn'), grab('getSeverityTier', 'fn'),
  grab('specCredit', 'fn'), grab('normalizeInsuranceForMatch', 'fn'),
  grab('analyzeMessageScore', 'fn'), grab('findMatch', 'fn'),
  grab('analyzeMatch', 'fn'), grab('buildConversationalBlurb', 'fn'),
  src.match(/const COUPLES_GOAL_TO_MATCH = \{[\s\S]*?\n\};/)[0],
  'Object.assign(globalThis, {THERAPISTS, GROUPS, GROUP_KEYWORDS, NICHE_KEYWORDS, nicheKwHits, detectImplicitSpecialties, getSeverityTier, specCredit, analyzeMessageScore, findMatch, analyzeMatch, buildConversationalBlurb, COUPLES_GOAL_TO_MATCH});'
].join('\n'));

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { passed++; console.log('  PASS  ' + label); }
  else      { failed++; console.log('  FAIL  ' + label); }
}
const match = (msg, opts = {}) => {
  const n = msg.toLowerCase();
  const ranked = opts.ranked || [];
  const tier = getSeverityTier(ranked.map(r => r.id), n);
  return { tier, res: findMatch(ranked, opts.loc || 3, opts.ins || 'aetna', opts.gender || 3,
    opts.virtual || 2, null, opts.age || 30, opts.niches || new Set(), tier, n,
    'specialty', opts.svc || 'individual', opts.intern || 'excluded') };
};
const isIntern = t => t.credentials.toLowerCase().includes('intern');
const detect = m => detectImplicitSpecialties(m.toLowerCase());
const niches = m => { const s = new Set();
  Object.entries(NICHE_KEYWORDS).forEach(([kw, tags]) => { if (nicheKwHits(m.toLowerCase(), kw)) tags.forEach(t => s.add(t)); });
  return s; };

console.log('\n— Message reading: signal over length —');
check('"I have OCD" detects ocd at full confidence', detect('I have OCD').get('ocd') === 1);
check('"I need help" detects nothing', detect('I need help').size === 0);
check('"my drinking is out of control" -> substance use', detect('my drinking is out of control').has('substance use'));
check('word boundaries: "stranger/courage/storage" detects nothing', detect('a stranger put my courage in storage').size === 0);
check('"lost my job" does NOT trigger grief', !detect('i lost my job last month').has('grief/loss'));
check('"lost my mom" DOES trigger grief', detect('i lost my mom last month').has('grief/loss'));
check('"life transition" does not trigger lgbtq+ niche', !niches('going through a big life transition').has('lgbtq+'));
check('"separation anxiety" does not trigger divorce niche', !niches('my daughter has separation anxiety').has('divorce/separation'));

console.log('\n— Severity gating (rating-driven, from the message) —');
{ const { tier, res } = match('i have been cutting myself and feel hopeless');
  check('self-harm message tiers critical', tier === 'critical');
  check('critical -> rating-3 only', res.length > 0 && res.every(r => r.therapist.rating === 3)); }
{ const { tier, res } = match('my drinking is getting worse and i need help');
  check('substance message tiers elevated', tier === 'elevated');
  check('elevated -> rating 2+', res.every(r => r.therapist.rating >= 2)); }

console.log('\n— Intern rules (low-cost pathway ONLY) —');
{ const { res } = match('anxiety is ruining my life', { intern: 'excluded' });
  check('no cost signal -> no interns ever', res.every(r => !isIntern(r.therapist))); }
{ const { res } = match('i cannot afford much but my drinking is getting worse', { intern: 'prefer' });
  check('elevated + cost opt-in -> intern allowed', res.some(r => isIntern(r.therapist))); }
{ const { res } = match('i cannot afford much and i have been cutting myself', { intern: 'prefer' });
  check('critical -> never an intern, even opted in', res.every(r => !isIntern(r.therapist))); }

console.log('\n— Avoid lists (prefer-not-to-see = hard exclusion) —');
{ const { res } = match('i have ocd and intrusive thoughts every day');
  check('OCD case never routed to an OCD-avoider', res.every(r => !(r.therapist.avoid || []).includes('ocd'))); }
{ THERAPISTS.forEach(t => { t.__av = t.avoid; t.avoid = ['ocd']; });
  const { res } = match('i have ocd');
  check('ALL therapists avoid -> zero matches (human follow-up)', res.length === 0);
  THERAPISTS.forEach(t => { t.avoid = t.__av; delete t.__av; }); }

console.log('\n— Phase 1: gender ONLY is soft for Individual/Couples —');
{ // When all males are closed, female therapists must still be eligible (soft, not hard exclude)
  THERAPISTS.forEach(t => {
    if (t.gender === 'male') { t.__caseload = t.caseload; t.caseload = 'closed'; }
  });
  const { res } = match('i feel anxious most days', { gender: 1, svc: 'individual' });
  check('male-only soft -> females still match when males closed',
    res.length > 0 && res.every(r => r.therapist.gender === 'female'));
  THERAPISTS.forEach(t => {
    if (t.__caseload !== undefined) { t.caseload = t.__caseload; delete t.__caseload; }
  }); }
{ // Soft scoring: mismatch still eligible at low gender pts; match gets full pts
  const { res } = match('i feel anxious most days', { gender: 1, svc: 'individual' });
  check('male-only soft -> female candidates keep genderScore 1 (not hard-excluded)',
    res.length > 0 && res.filter(r => r.therapist.gender === 'female')
      .every(r => r.breakdown.genderScore === 1));
  // Give males the same clinical signal so gender tiebreaker can surface
  const males = THERAPISTS.filter(t => t.gender === 'male');
  males.forEach(t => {
    t.__spec = t.specialties.slice();
    t.__comf = (t.comfortable || []).slice();
    t.__case = t.caseload;
    t.specialties = ['anxiety'];
    t.comfortable = [];
    t.caseload = 'open';
  });
  const { res: res2 } = match('i feel anxious most days', {
    gender: 1, svc: 'individual', ranked: [{ id: 'anxiety', label: 'Anxiety' }],
  });
  check('male-only soft -> male wins when clinical fit is equalized',
    res2.length > 0 && res2[0].therapist.gender === 'male' && res2[0].breakdown.genderScore === 5);
  males.forEach(t => {
    t.specialties = t.__spec; t.comfortable = t.__comf; t.caseload = t.__case;
    delete t.__spec; delete t.__comf; delete t.__case;
  }); }

console.log('\n— Phase 1: caseload Building > Open > Refill —');
check('specialize credit > comfortable credit',
  (() => {
    const t = { specialties: ['anxiety'], comfortable: ['depression'], avoid: [] };
    return specCredit(t, 'anxiety') === 1
      && specCredit(t, 'depression') === 0.5
      && specCredit(t, 'ocd') === 0
      && specCredit(t, 'anxiety') > specCredit(t, 'depression');
  })());
{ const a = THERAPISTS.find(t => t.specialties.includes('anxiety') && (t.insurance || []).includes('aetna'));
  if (a) {
    // Isolate one therapist so caseload deltas aren't lost outside top-3 slice
    THERAPISTS.forEach(t => {
      t.__case = t.caseload;
      if (t.name !== a.name) t.caseload = 'closed';
    });
    const scoreAt = (c) => {
      a.caseload = c;
      return match('i feel anxious most days', { ranked: [{ id: 'anxiety', label: 'Anxiety' }] }).res
        .find(r => r.therapist.name === a.name)?.score;
    };
    const buildingScore = scoreAt('building');
    const openScore = scoreAt('open');
    const refillScore = scoreAt('refill');
    THERAPISTS.forEach(t => { t.caseload = t.__case; delete t.__case; });
    check('Building score > Open > Refill for same therapist',
      buildingScore > openScore && openScore > refillScore);
  } else {
    check('Building score > Open > Refill for same therapist', false);
  }
}

console.log('\n— Phase 1 Couples Your Goals map —');
check('Affair goal maps to infidelity niches',
  (COUPLES_GOAL_TO_MATCH['Affair / Betrayal Recovery'].niches || []).includes('infidelity'));
check('Premarital goal maps to premarital niche',
  (COUPLES_GOAL_TO_MATCH['Premarital'].niches || []).includes('premarital'));
check('no Intensive goal map in Couples Phase 1 deploy',
  typeof globalThis.INTENSIVE_GOAL_TO_MATCH === 'undefined');
{ const INFID = ['infidelity', 'betrayal trauma'];
  const { res } = match('we need help', {
    svc: 'couples',
    ranked: [{ id: 'couples', label: 'Affair / Betrayal Recovery' }],
    niches: new Set(INFID),
  });
  check('Couples Affair niches → only infidelity specialists',
    res.length > 0 && res.every(r => r.therapist.niche.some(n => INFID.includes(n)))); }

console.log('\n— Phase 1 message-first (Individual + Couples) —');
{ // Empty message → neutral msgScore; goals/checkboxes decide
  const { res } = match('', { ranked: [{ id: 'anxiety', label: 'Anxiety' }], svc: 'individual' });
  check('empty message → all msgScore neutral (35)',
    res.length > 0 && res.every(r => r.breakdown.msgScore === 35));
  check('empty message → still returns matches from goals',
    res.length > 0); }
{ // Message with clinical signal → msgScore varies / can exceed neutral
  const { res } = match('I have OCD and intrusive thoughts every day', {
    ranked: [{ id: 'anxiety', label: 'Anxiety' }],
    svc: 'individual',
  });
  check('message with OCD signal → top msgScore > 35',
    res.length > 0 && res[0].breakdown.msgScore > 35);
  check('message with OCD → no OCD-avoider in results',
    res.every(r => !(r.therapist.avoid || []).includes('ocd'))); }
{ // Prefer-not from message concern still hard-excludes
  const { res } = match('i have been cutting myself', { svc: 'individual' });
  check('message self-harm → prefer-not avoiders excluded',
    res.every(r => !(r.therapist.avoid || []).includes('self harm'))); }

console.log('\n— Insurance hard filter —');
{ const { res } = match('i feel anxious most days', { ins: 'bcbs' });
  check('BCBS selection -> only therapists who accept BCBS', res.length > 0 && res.every(r => r.therapist.insurance.includes('bcbs'))); }
{ const cayla = THERAPISTS.find(t => t.name === 'Cayla Bozovich');
  const origIns = cayla.insurance; cayla.insurance = [];
  const { res } = match('i feel anxious most days', { ins: 'aetna' });
  check('self-pay-only therapist excluded when client picks Aetna', !res.some(r => r.therapist.name === 'Cayla Bozovich'));
  cayla.insurance = origIns; }

console.log('\n— Form wins: service type beats message couples-language —');
{ const d = detect('my marriage is falling apart and i am really depressed');
  check('couples detected in raw message', d.has('couples'));
  const { res } = match('my marriage is falling apart and i am really depressed', { svc: 'individual' });
  check('individual flow still returns matches', res.length > 0); }

console.log('\n— Infidelity gate (from therapist profile forms) —');
{ const INFID = ['infidelity', 'betrayal trauma'];
  const { res } = match('my husband had an affair and i am devastated',
    { svc: 'couples', ranked: [{ id: 'couples', label: 'Couples' }], niches: new Set(INFID) });
  check('infidelity routes only to listed specialists',
    res.length > 0 && res.every(r => r.therapist.niche.some(n => INFID.includes(n)))); }

console.log('\n— Groups (synced from Webflow CMS) —');
check('10 live groups present', GROUPS.length === 10);
check('every group has recommend keywords', GROUPS.every(g => GROUP_KEYWORDS[g.id]));
check('referral-only flag preserved (The Practice)', GROUPS.find(g => g.id === 'thepractice').referralOnly === true);

console.log('\n— Real-message corpus (previously all-missed sample) —');
{ const msgs = JSON.parse(fs.readFileSync(path.join(__dirname, 'real_missed_messages.json'), 'utf8')).slice(1);
  let hit = 0;
  for (const [, m] of msgs) {
    if (detect(String(m)).size > 0 || niches(String(m)).size > 0) hit++;
  }
  console.log('  INFO  ' + hit + '/' + msgs.length + ' formerly-invisible real messages now read');
  check('detection floor holds (>= 35 of 60)', hit >= 35); }

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
