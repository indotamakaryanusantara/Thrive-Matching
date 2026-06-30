# Thrive Matching

Source code for the Thrive Therapy Phoenix therapist matching tool.

## Contents

| Path | Description |
|------|-------------|
| `thrivetherapy-matchingdemo.html` | Matcher UI + business logic (phase 1 baseline) |
| `tests/run_tests.js` | Regression suite — keep green when changing matching rules |

## Run tests

```bash
node tests/run_tests.js
```

Requires Node 18+. No dependencies.

## Local development

Client data, Webflow exports, spreadsheet templates, and handoff documents live **outside** this folder in the parent `TherapistMatching/` workspace (not versioned here).

## Stack (phase 1)

- Frontend: productionize demo → Vite/JS on Vercel
- Backend: Google Apps Script + Google Sheets
- Roster source: NEW AI THERAPIST PROFILES (Google Sheet)
