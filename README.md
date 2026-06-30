# Thrive Matching

Next.js app for the Thrive Therapy Phoenix therapist matching tool.

**Live:** https://thrive-matching.vercel.app

## Stack

- Next.js 14 (App Router)
- Matcher UI/logic from client handoff demo (`matcher-source/`)

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm test         # regression suite (25 tests)
```

`predev` / `prebuild` split `matcher-source/thrivetherapy-matchingdemo.html` into:

- `app/matcher.css`
- `public/matcher/body.html`
- `public/matcher/matcher-app.js`

## Edit the matcher

Change **`matcher-source/thrivetherapy-matchingdemo.html`**, then run `npm run dev` or `npm test`.

## Vercel

Connect this repo with preset **Next.js**. Root directory: `/` (default). Build command: `npm run build`.
