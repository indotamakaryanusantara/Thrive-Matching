/**
 * Staging QA — Other Intensive Phase 1 (opsi A: asuransi di contact, tanpa Preferences)
 * Run: node tests/qa_staging_intensive.js
 */
const { chromium } = require('playwright-core');

const BASE = 'https://thrive-matching-two.vercel.app';
const DUMMY = {
  name: 'QA Dummy Intensive',
  email: 'qa.dummy.intensive@example.com',
  phone: '6025550199',
  age: '34',
};

const PROGRAMS = {
  ketamine: { value: 'ketamine', label: 'Ketamine' },
  ocd: { value: 'ocd_intensive', label: 'OCD Intensive' },
  couples: { value: 'couples_intensive', label: 'Couples Intensive' },
  trauma: { value: 'trauma_intensive', label: 'Trauma Intensive' },
};

async function startIntensive(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('.service-card[data-value="other_intensive"]', { timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#specialtyGrid .specialty-item').length > 5, {
    timeout: 60000,
  }).catch(() => {});
  await page.click('.service-card[data-value="other_intensive"]');
  await page.click('#step1 button.btn-next');
  // New order: Service → About You (contact) first
  await page.waitForSelector('#stepProgramContact.active', { timeout: 20000 });
}

async function fillContact(page, {
  location = 'No Preference',
  insurance = 'Aetna',
  message = '',
} = {}) {
  await page.fill('#pcName', DUMMY.name);
  await page.fill('#pcPhone', DUMMY.phone);
  await page.fill('#pcEmail', DUMMY.email);
  await page.fill('#pcAge', DUMMY.age);
  await page.click(`#pcLocationCards .opt-card[data-val="${location}"]`);
  await page.waitForSelector('#pcInsuranceField', { state: 'visible', timeout: 10000 });
  await page.click(`#pcInsuranceCards .opt-card[data-val="${insurance}"]`);
  await page.fill('#pcMessage', message || '');
}

async function continueToGoals(page) {
  await page.locator('#stepProgramContact button.btn-next').click();
  await page.waitForSelector('#step1b.active', { timeout: 15000 });
}

async function pickProgram(page, programKey) {
  const p = PROGRAMS[programKey];
  await page.click(`#step1b .service-card[data-value="${p.value}"]`);
  await page.click('#step1b button.btn-next');
  await page.waitForSelector(
    '#resultScreen.active, #optionsScreen.active, #conflictScreen.active, #noMatchScreen.active, #programResult.active',
    { timeout: 30000 }
  );
}

async function submitMatch(page) {
  // kept for compatibility — match now fires from Your Goals
  await page.locator('#step1b button.btn-next').click();
  await page.waitForSelector(
    '#resultScreen.active, #optionsScreen.active, #conflictScreen.active, #noMatchScreen.active, #programResult.active',
    { timeout: 30000 }
  );
}

async function readResult(page) {
  const mode = (await page.locator('#resultScreen.active').count())
    ? 'single'
    : (await page.locator('#optionsScreen.active').count())
      ? 'multi'
      : (await page.locator('#conflictScreen.active').count())
        ? 'conflict'
        : (await page.locator('#noMatchScreen.active').count())
          ? 'no-match'
          : (await page.locator('#programResult.active').count())
            ? 'program-handoff'
            : 'unknown';

  let names = [];
  if (mode === 'single') {
    names = (await page.locator('#matchCardContainer .tc-name').allTextContents())
      .map((s) => s.replace(/,.*/, '').trim())
      .filter(Boolean);
  } else if (mode === 'multi') {
    names = await page.evaluate(() =>
      [...document.querySelectorAll('#optionsCardContainer .option-card')]
        .map((card) => {
          const el = card.querySelector(
            '.oc-header div[style*="font-weight:700"], .oc-header div[style*="font-weight: 700"]'
          );
          return el ? el.textContent.replace(/,.*/, '').trim() : '';
        })
        .filter(Boolean)
    );
  } else if (mode === 'conflict') {
    names = (await page.locator('#conflictScreen .tc-name').allTextContents())
      .map((s) => s.replace(/,.*/, '').trim())
      .filter(Boolean);
  }
  return { mode, names };
}

async function uiChecksOnContact(page) {
  return page.evaluate(() => {
    const insVisible = !!(document.getElementById('pcInsuranceField')
      && getComputedStyle(document.getElementById('pcInsuranceField')).display !== 'none');
    const btn = document.querySelector('#stepProgramContact .btn-next');
    const btnText = btn ? btn.textContent.trim() : '';
    const prefsActive = !!document.querySelector('#step4.active');
    const labels = [1, 2, 3, 4, 5].map((i) => {
      const el = document.getElementById('lbl' + i);
      if (!el || el.style.display === 'none') return null;
      return el.textContent.trim();
    }).filter(Boolean);
    const progressVisible = !!(document.getElementById('progressWrap')
      && getComputedStyle(document.getElementById('progressWrap')).display !== 'none');
    return { insVisible, btnText, prefsActive, labels, progressVisible };
  });
}

async function fetchRoster() {
  const res = await fetch(BASE + '/api/roster');
  const data = await res.json();
  return data.therapists || [];
}

function therapistSpecsFromRoster(roster, names) {
  return names.map((name) => {
    const t = roster.find((x) => x.name === name);
    if (!t) return { name, specialties: [], comfortable: [], niche: [] };
    return {
      name,
      specialties: t.specialties || [],
      comfortable: t.comfortable || [],
      niche: (t.niche || []).slice(0, 10),
    };
  });
}

function hasSpec(info, id) {
  return (info.specialties || []).includes(id) || (info.comfortable || []).includes(id);
}

async function scenario(browser, id, fn) {
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const row = { id, pass: false, mode: '', names: [], note: '', extra: '' };
  try {
    console.log('…', id);
    await startIntensive(page);
    await fn(page, row);
    row.pass = true;
  } catch (e) {
    row.note = String(e.message || e).slice(0, 280);
    row.pass = false;
  }
  await page.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  return row;
}

(async () => {
  console.log('Launch Chrome…');
  const roster = await fetchRoster();
  console.log('Roster therapists:', roster.length);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];

  const cases = [
    [
      'A1 About You first / then Goals / OCD',
      async (page, row) => {
        // startIntensive already on contact
        const ui = await uiChecksOnContact(page);
        row.extra = JSON.stringify(ui);
        if (!ui.insVisible) throw new Error('insurance field not visible on intensive contact');
        if (!/Continue/i.test(ui.btnText)) throw new Error('expected Continue on About You, got: ' + ui.btnText);
        if (ui.prefsActive) throw new Error('Preferences step should not be active');
        if (!ui.progressVisible) throw new Error('progress should stay visible on intensive contact');
        const aboutBeforeGoals = ui.labels.indexOf('About You') < ui.labels.indexOf('Your Goals');
        if (!aboutBeforeGoals) throw new Error('About You should come before Your Goals: ' + ui.labels.join(' | '));
        await fillContact(page);
        await continueToGoals(page);
        const goalsBtn = await page.locator('#step1b button.btn-next').textContent();
        if (!/Find My Therapist/i.test(goalsBtn || '')) throw new Error('expected Find My Therapist on Goals');
        await pickProgram(page, 'ocd');
        const r = await readResult(page);
        row.mode = r.mode;
        row.names = r.names;
        if (r.mode === 'program-handoff') throw new Error('got program handoff instead of therapist match');
        if (r.mode === 'no-match' || r.mode === 'unknown') throw new Error('expected match, got ' + r.mode);
        if (!r.names.length) throw new Error('no therapist names');
        if (await page.locator('#step4.active').count()) throw new Error('landed on Preferences');
      },
    ],
    [
      'A3 validation missing insurance',
      async (page, row) => {
        await page.fill('#pcName', DUMMY.name);
        await page.fill('#pcPhone', DUMMY.phone);
        await page.fill('#pcEmail', DUMMY.email);
        await page.fill('#pcAge', DUMMY.age);
        await page.click('#pcLocationCards .opt-card[data-val="No Preference"]');
        await page.locator('#stepProgramContact button.btn-next').click();
        await page.waitForTimeout(800);
        const stillContact = await page.locator('#stepProgramContact.active').count();
        const errIns = await page.evaluate(() => {
          const el = document.getElementById('errPcInsurance');
          return el && getComputedStyle(el).display !== 'none';
        });
        row.mode = stillContact ? 'validation' : 'advanced';
        if (!stillContact || !errIns) throw new Error('expected stay on contact with insurance error');
      },
    ],
    [
      'B1 OCD Intensive empty message',
      async (page, row) => {
        await fillContact(page, { message: '' });
        await continueToGoals(page);
        await pickProgram(page, 'ocd');
        const r = await readResult(page);
        row.mode = r.mode;
        row.names = r.names;
        if (r.mode === 'program-handoff') throw new Error('program handoff');
        if (r.mode === 'no-match' || r.mode === 'unknown') throw new Error('expected match, got ' + r.mode);
        const specs = therapistSpecsFromRoster(roster, r.names);
        row.extra = specs.map((s) => `${s.name}:ocd=${hasSpec(s, 'ocd')}`).join('; ');
        if (!specs.some((s) => hasSpec(s, 'ocd'))) {
          throw new Error('expected at least one OCD specialty/comfortable: ' + row.extra);
        }
      },
    ],
    [
      'B2 Trauma Intensive empty message',
      async (page, row) => {
        await fillContact(page, { message: '' });
        await continueToGoals(page);
        await pickProgram(page, 'trauma');
        const r = await readResult(page);
        row.mode = r.mode;
        row.names = r.names;
        if (r.mode === 'program-handoff') throw new Error('program handoff');
        if (r.mode === 'no-match' || r.mode === 'unknown') throw new Error('expected match, got ' + r.mode);
        const specs = therapistSpecsFromRoster(roster, r.names);
        row.extra = specs.map((s) => `${s.name}:trauma=${hasSpec(s, 'trauma')}`).join('; ');
        if (!specs.some((s) => hasSpec(s, 'trauma'))) {
          throw new Error('expected at least one trauma specialty/comfortable: ' + row.extra);
        }
      },
    ],
    [
      'B3 Couples Intensive empty message',
      async (page, row) => {
        await fillContact(page, { message: '' });
        await continueToGoals(page);
        await pickProgram(page, 'couples');
        const r = await readResult(page);
        row.mode = r.mode;
        row.names = r.names;
        if (r.mode === 'program-handoff') throw new Error('program handoff');
        if (r.mode === 'no-match' || r.mode === 'unknown') throw new Error('expected match, got ' + r.mode);
        const specs = therapistSpecsFromRoster(roster, r.names);
        row.extra = specs.map((s) => `${s.name}:couples=${hasSpec(s, 'couples')}`).join('; ');
        if (!specs.some((s) => hasSpec(s, 'couples'))) {
          row.extra += ' | WARN no couples specialty in top (hard-filter may fall back)';
        }
      },
    ],
    [
      'B4 Ketamine empty message',
      async (page, row) => {
        await fillContact(page, { message: '' });
        await continueToGoals(page);
        await pickProgram(page, 'ketamine');
        const r = await readResult(page);
        row.mode = r.mode;
        row.names = r.names;
        if (r.mode === 'program-handoff') throw new Error('program handoff');
        if (r.mode === 'no-match' || r.mode === 'unknown') throw new Error('expected match, got ' + r.mode);
        if (!r.names.length) throw new Error('no names');
        const specs = therapistSpecsFromRoster(roster, r.names);
        row.extra = specs
          .map((s) => `${s.name}:dep=${hasSpec(s, 'depression')};ket=${(s.niche || []).includes('ketamine')}`)
          .join('; ');
      },
    ],
    [
      'C1 OCD empty message',
      async (page, row) => {
        await fillContact(page, { message: '' });
        await continueToGoals(page);
        await pickProgram(page, 'ocd');
        const r = await readResult(page);
        row.mode = r.mode;
        row.names = r.names;
        if (r.mode === 'no-match' || r.mode === 'unknown' || r.mode === 'program-handoff') {
          throw new Error('expected match, got ' + r.mode);
        }
      },
    ],
    [
      'C2 Trauma program + OCD message',
      async (page, row) => {
        await fillContact(page, { message: 'I have OCD and intrusive thoughts every day' });
        await continueToGoals(page);
        await pickProgram(page, 'trauma');
        const r = await readResult(page);
        row.mode = r.mode;
        row.names = r.names;
        if (r.mode === 'no-match' || r.mode === 'unknown' || r.mode === 'program-handoff') {
          throw new Error('expected match, got ' + r.mode);
        }
        const specs = therapistSpecsFromRoster(roster, r.names);
        row.extra = specs.map((s) => `${s.name}:ocd=${hasSpec(s, 'ocd')};trauma=${hasSpec(s, 'trauma')}`).join('; ');
      },
    ],
    [
      'D1 OCD Aetna',
      async (page, row) => {
        await fillContact(page, { insurance: 'Aetna' });
        await continueToGoals(page);
        await pickProgram(page, 'ocd');
        const r = await readResult(page);
        row.mode = r.mode;
        row.names = r.names;
        if (r.mode === 'no-match' || r.mode === 'unknown' || r.mode === 'program-handoff') {
          throw new Error('expected match, got ' + r.mode);
        }
      },
    ],
    [
      'D2 OCD BCBS',
      async (page, row) => {
        await fillContact(page, { insurance: 'BCBS' });
        await continueToGoals(page);
        await pickProgram(page, 'ocd');
        const r = await readResult(page);
        row.mode = r.mode;
        row.names = r.names;
        if (r.mode === 'no-match' || r.mode === 'unknown' || r.mode === 'program-handoff') {
          throw new Error('expected match, got ' + r.mode);
        }
      },
    ],
    [
      'E2 Trauma Virtual location',
      async (page, row) => {
        await fillContact(page, { location: 'Virtual' });
        await continueToGoals(page);
        await pickProgram(page, 'trauma');
        const r = await readResult(page);
        row.mode = r.mode;
        row.names = r.names;
        if (r.mode === 'no-match' || r.mode === 'unknown' || r.mode === 'program-handoff') {
          throw new Error('expected match, got ' + r.mode);
        }
        if (!r.names.length) throw new Error('no names');
      },
    ],
  ];

  for (const [id, fn] of cases) {
    results.push(await scenario(browser, id, fn));
  }

  await browser.close();

  console.log('\n=== Other Intensive staging QA ===');
  let pass = 0;
  let fail = 0;
  for (const r of results) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    if (r.pass) pass++;
    else fail++;
    console.log(
      `${mark}  ${r.id}  |  ${r.mode || '-'}  |  ${(r.names || []).slice(0, 3).join(' · ') || '-'}`
      + (r.extra ? `  |  ${r.extra}` : '')
      + (r.note ? `  |  ${r.note}` : '')
    );
  }
  console.log(`\n${pass} passed, ${fail} failed (of ${results.length})`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
