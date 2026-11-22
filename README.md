# OptionStrat Pro — Color Lab

A single-page options strategy visualiser: build multi-leg strategies, see the payoff diagram,
Greeks and a price × time scenario grid, and compare two strategies under the same assumptions.
Everything is calculated in your browser with Black-Scholes (continuous dividend yield).

**Live app:** https://yestertommorrow-a11y.github.io/Options-Strategies/

> **Not investment advice.** This is an analysis tool. It cannot place orders. Prices come from
> free, delayed public sources and may be wrong or stale; verify against your broker before
> relying on any number.

## What it does

- Strategy templates (verticals, iron condor/butterfly, straddle, strangle, calendars, covered
  call, protective put, jade lizard, …) and fully custom legs, with undo.
- Payoff at first expiry and at any elapsed time / IV shift, per-leg curves, breakevens,
  max profit / loss, Greeks, and a scenario grid you can export as CSV (with its assumptions).
- Shared pricing assumptions: interest rate, dividend yield, option and stock commissions,
  slippage. Entry premiums stay fixed when assumptions change.
- Data provenance on every leg (market midpoint, model, manual, imported) with timestamps.
- Save strategies (session only, or opt-in `localStorage`), export/import them as JSON.
- Optional, off-by-default LLM helpers (price lookup and Python code generation) that require
  your own endpoint and human verification.

## Data and privacy

- Quotes come from Yahoo Finance and option chains from CBOE's free delayed feed. Browsers can't
  call them directly, so requests go through public relays (`r.jina.ai`, `api.allorigins.win`,
  `api.codetabs.com`). **The relays see every ticker you load.** SPY is fetched automatically when
  the page opens.
- The page loads its libraries from `cdn.tailwindcss.com`, `esm.sh`, `unpkg.com` and Google Fonts.
- Saved strategies stay in your browser. The full list of data flows is in the app's
  Charter panel.

## Run locally

Open `outputs/optionstrat_color_lab.html` in a modern browser, or serve the folder:

```
python -m http.server 8765
```

then visit http://localhost:8765/.

## Tests

Requires Node.js. The checks compile the app with Babel standalone 7.26.0, which is not stored in
the repository:

```
curl -L -o work/babel.min.cjs https://unpkg.com/@babel/standalone@7.26.0/babel.min.js
node run-review-checks.cjs
```

The runner compiles the React source, does a mocked render and runs 141 logic checks
(regression, scenario, priority and review-fix suites). Browser behaviour is not covered by these
checks; see the review notes for what was verified in a browser.

## Review notes

[`CLAUDE_FINDINGS.txt`](CLAUDE_FINDINGS.txt) is an independent review of the app: the defects
found, how each was fixed and tested, browser verification results, modelling limitations, and
what remains unverified (notably the live CBOE chain, which was unreachable through the relays
during the review).

## Layout

| Path | What |
|---|---|
| `index.html` | GitHub Pages entry; redirects to the app |
| `outputs/optionstrat_color_lab.html` | The application (single HTML file) |
| `run-review-checks.cjs` | Runs all checks |
| `work/*.cjs` | Test suites and harnesses |
| `CLAUDE_FINDINGS.txt` | Review findings, fixes and verification log |
