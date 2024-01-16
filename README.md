# Deriv AI Market Analyst

A live-feeling trading dashboard: streaming candlestick charts, real
technical indicators computed from that data, and an AI analyst (Gemini)
that reads the indicators and explains what they suggest — in plain
language, with a stated bias and confidence level, grounded strictly in the
numbers on screen.

**No account, no login, no orders are ever placed.** This is analysis-only:
the AI explains what the market data shows; it never executes a trade. That
was a deliberate scope decision, not a missing feature — see "Trading mode"
below.

```
Simulated market feed  →  streaming candles  →  indicators (SMA/EMA/RSI/MACD/Bollinger)
                                                       │
                                                       ▼
                                               Gemini (structured
                                                analysis + chat)
                                                       │
                                                       ▼
                                             chart + signal card + chat UI
```

## Why this project

This mirrors what Deriv's own product actually does — real-time market
data, technical analysis, and an AI layer that explains it to the user —
rather than a generic LLM demo. It's built the way a real fintech feature
would be:

- **A pluggable market-data layer**, not a hardcoded fetch. `lib/mock-market.ts`
  and `lib/deriv-client.ts` implement the exact same interface (`connect`,
  `getActiveSymbols`, `subscribeCandles`) — `app/page.tsx` doesn't know or
  care which one is plugged in. That's the actual engineering point: the
  UI, indicators, and AI layer are decoupled from where the ticks come from.
- **Indicators implemented from scratch** (`lib/indicators.ts`) — SMA, EMA,
  RSI (Wilder's smoothing), MACD, Bollinger Bands — not an opaque npm
  package, so the math is inspectable and was verified against hand-computed
  values and known edge cases (RSI → 100 on a strictly rising series, → 0 on
  a strictly falling one).
- **A real security boundary**: the Gemini API key lives only in the
  Next.js backend (`app/api/analyze/route.ts`); the browser never sees it.
- **Structured AI output**, not just chat text — the "Analyze now" button
  uses Gemini's JSON-schema-constrained output to force a schema-conforming
  response (bias / confidence / reasoning / observations / disclaimer), so
  the UI always has something reliable to render. The response is also
  validated server-side against the expected shape before it reaches the
  frontend, since schema-constrained output is a strong guarantee but not
  an absolute one.

## About the market data

The chart streams from **`lib/mock-market.ts`**, a simulated feed: prices
follow a seeded random walk (geometric, log-normal steps), tuned per
instrument so synthetic indices are higher-volatility and driftless while
EUR/USD and Gold get gentle drift and realistic tick sizes. Candles roll
over and stream new ticks about once a second, so it behaves like a live
feed in every way the UI cares about.

This is a deliberate choice, not a shortcut: `lib/deriv-client.ts` is a
**complete, working integration with Deriv's real public WebSocket API** —
the request/response cycle was independently verified against Deriv's own
API Playground during development. But a live third-party connection is a
fragile thing to depend on for a demo (firewalls, browser extensions, or a
change on Deriv's side can all break it invisibly), and Deriv's own
synthetic indices are themselves algorithmically generated constant-
volatility processes rather than real economic assets — so a well-tuned
random walk isn't really a simplification of the real thing, it's the same
category of thing.

**To swap in live data:** in `app/page.tsx`, change the import and the two
`new MockMarketClient()` calls to `new DerivClient(appId)` (see the old
`NEXT_PUBLIC_DERIV_APP_ID` pattern in git history, or just pass Deriv's
public demo id `"1089"`). No other file needs to change — that's the point
of the shared interface.

## Trading mode: analysis only

This deliberately never places an order, real or demo. Two reasons:

1. **Scope** — the value being demonstrated is the AI-explains-the-market
   layer, not a full order-management system with account auth, position
   tracking, and error handling for a broker API.
2. **Responsibility** — an app that lets an LLM place trades (even with fake
   money) needs a lot more guardrails than a portfolio project should skip
   past: explicit confirmation flows, spend/loss limits, clear audit
   logging. Shipping the analysis half well, and being explicit about why
   execution isn't included, is a better signal than a half-guarded
   execution path.

## Tech stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **lightweight-charts** (TradingView's open-source charting library — what
  most real trading platforms are actually built on)
- **`@google/genai`** (Gemini) — server-side only, in the Next.js API route

## Project structure

```
app/
  page.tsx              main page: wires chart, indicators, chat together
  api/analyze/route.ts  server-side Gemini calls (structured analysis + chat)
components/
  Chart.tsx              candlesticks + SMA + Bollinger Bands
  IndicatorPane.tsx       RSI sub-chart
  SymbolSelector.tsx      dropdown of available instruments
  ChatPanel.tsx           chat UI + "Analyze now" button
  SignalCard.tsx          bias/confidence/reasoning display
lib/
  mock-market.ts          simulated market-data feed (default data source)
  deriv-client.ts          real Deriv WebSocket integration (drop-in swap)
  indicators.ts            SMA/EMA/RSI/MACD/Bollinger, hand-rolled
  types.ts                 shared TypeScript types
```

## Setup (Windows / PowerShell)

Run each block in order, in PowerShell (right-click the unzipped folder →
**Open in Terminal**).

**1. Check Node.js is installed** (need 18.18+ or 20+):
```powershell
node --version
```
If missing, install the LTS version from nodejs.org, then reopen the terminal.

**2. Install dependencies:**
```powershell
npm install
```
If you see a "running scripts is disabled" error, run this first (needed
once per new terminal window):
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

**3. Get a Gemini API key** (if you don't already have one): go to
https://aistudio.google.com/apikey, create a key.

**4. Set up your environment file:**
```powershell
copy .env.local.example .env.local
notepad .env.local
```
Paste in your Gemini key, save, close.

**5. Run it:**
```powershell
npm run dev
```
Open http://localhost:3000 in your browser. You should see a streaming
candlestick chart within a couple of seconds, a symbol dropdown, and the AI
panel on the right. Click **Analyze now** to get a structured signal, or
type a question.

**6. Push to GitHub:**
```powershell
git init
git add .
git commit -m "Add Deriv AI Market Analyst: live charts, real indicators, Gemini-powered analysis"
git remote add origin https://github.com/f20230125-sudo/deriv-ai-analyst.git
git branch -M main
git push -u origin main
```
(Create the empty `deriv-ai-analyst` repo on github.com first.)

## Deploying it live (optional, but worth doing for a portfolio link)

This is a normal Next.js app, so it deploys cleanly to Vercel (free tier):
push to GitHub, go to vercel.com, "Import Project", pick the repo, add
`GEMINI_API_KEY` as an environment variable in the Vercel dashboard, deploy.
That gets you a shareable live link to put on your CV/LinkedIn instead of
just a GitHub repo.

## What I'd do differently at production scale

- Swap in `lib/deriv-client.ts` for real market data, with a fallback to
  the simulated feed if the live connection drops
- Add the demo-account order-placement flow described above, with hard
  confirmation and demo-only enforcement
- Cache/debounce indicator recomputation instead of recalculating the full
  series on every tick
- Rate-limit the `/api/analyze` route server-side (currently only
  protected by the UI's manual-trigger design)
- Persist chat/analysis history server-side per session instead of only
  in React state, so a refresh doesn't lose context
