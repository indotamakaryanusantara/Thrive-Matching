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
  grab('specCredit', 'fn'), grab('analyzeMessageScore', 'fn'), grab('findMatch', 'fn'),
  grab('analyzeMatch', 'fn'), grab('buildConversationalBlurb', 'fn'),
  'Object.assign(globalThis, {THERAPISTS, GROUPS, GROUP_KEYWORDS, NICHE_KEYWORDS, nicheKwHits, detectImplicitSpecialties, getSeverityTier, specCredit, analyzeMessageScore, findMatch, analyzeMatch, buildConversationalBlurb});'
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

console.log('\n— Gender ONLY is hard; severity bends —');
{ const troy = THERAPISTS.find(t => t.name === 'Troy Zaslove');
  const orig = troy.caseload; troy.caseload = 'open';
  const { res } = match('i have been cutting myself and feel hopeless', { gender: 1 });
  check('male-only critical -> male match even at rating 2', res.length > 0 && res.every(r => r.therapist.gender === 'male'));
  troy.caseload = orig; }

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
