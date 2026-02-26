# Metabolic Response Tracker

A lightweight, mobile-first Progressive Web App (PWA) for logging meals and analyzing CGM glucose response.

## What this is

This is a personal metabolic tracking tool focused on:
- fast daily entry
- low-friction updates
- meaningful glucose response metrics
- local-first privacy

It is intentionally **not** a diet app (no calorie tracking, no macro precision logging—just practical macro bands).

## Core workflow

1. **Daily fasting glucose first**
   - Log fasting glucose at the top of the Log view.
   - Once today’s fasting value is saved, meal entry unlocks.

2. **Stage 1: Pre-Meal Entry**
   - Meal description
   - Carb band
   - Protein band / fat band
   - Pre-meal glucose

3. **Stage 2: Post-Meal Update (inline per meal)**
   - Peak glucose
   - Time to peak
   - 2-hour glucose
   - Time back under 120
   - Notes and context tags

## Metrics and analysis

Per meal, the app derives:
- spike magnitude
- spike category (Mild / Moderate / High)
- duration category (Efficient / Acceptable / Prolonged)
- return delta (2-hour glucose - pre-meal glucose)
- AUC proxy (trapezoidal estimate)
- complete flag
- meal period (morning / afternoon / evening / late)

Reports include:
- sortable meal table
- food pattern summary
- time-of-day analysis
- charts (spike, daily peak, category histogram, fasting trend)

## Data model and storage

- Data is stored locally in **IndexedDB**.
- No backend, no authentication, no cloud sync.
- Exports are manual backups.

### Export/import

Data tab supports:
- **Export ALL Data (CSV)**
- **Export ALL Data (JSON)**
- **Import Backup (.csv or .json)**

Both formats include meals and fasting entries.

## Tech stack

- Vanilla HTML, CSS, JavaScript (ES6)
- Chart.js
- Service worker + manifest for offline-capable PWA behavior

## Run locally

From the project folder:

```bash
py -m http.server 5500
```

Then open:

```text
http://localhost:5500
```

## Deploy (Netlify)

This app can be deployed as a static site:

1. Push to GitHub
2. In Netlify: **New site from Git**
3. Select repo and branch
4. Build command: *(empty)*
5. Publish directory: `/`

After deployment, open the HTTPS URL on mobile and use **Add to Home Screen**.

## Notes

- Data on each device is local to that device unless exported/imported.
- For real usage, keep regular backup exports.
