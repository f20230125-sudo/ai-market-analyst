# AI Market Analyst

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
- **An actual agentic tool-calling loop in chat mode**, not just a bigger
  prompt. The model is given one real tool, `getIndicatorsAtLookback`,
  which recomputes the full indicator set as of N candles ago from the
  same raw OHLC series the user is viewing (`app/api/analyze/route.ts`).
  When you ask something like *"was RSI already this high 20 candles
  ago, or did this just happen?"*, Gemini decides to call the tool, the
  server executes it against real data and returns the result, and the
  model reasons over that before answering — a real function-call round
  trip, capped at 3 rounds so a misbehaving model can't loop forever.
  "Analyze now" deliberately stays a single structured call: it doesn't
  need history, and mixing tool declarations with schema-constrained
  output is more failure surface than the feature is worth there.
- **Tested where it matters**: `lib/indicators.test.ts` (Vitest) checks
  the hand-rolled SMA/EMA/RSI/MACD/Bollinger math against known edge cases
  — not just "it runs," but specific asserted values (e.g. RSI at exactly
  50 on a flat series, bands collapsing to a point at zero variance). A
  GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint, tests,
  and a production build on every push. `scripts/eval-analysis.mjs` is a
  separate, second layer: a small offline eval that hits the live
  `/api/analyze` route with fixed indicator snapshots that have an
  unambiguous correct-ish bias (RSI pinned at 97 with price riding the
  upper band has no reasonable bearish reading) and checks the model's
  actual output against it — because schema validation proves the shape
  is right, not that the reasoning is.
- **Rate-limited**, not just manually gated. `/api/analyze` now enforces
  a per-IP sliding-window limit (15 req/min) server-side, on top of the
  UI's manual-trigger design — the gap explicitly called out as missing
  in an earlier version of this README.

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
- **Vitest** for indicator unit tests, run in CI via **GitHub Actions**

**Why Gemini, not Claude:** `gemini-3.6-flash`'s native
`responseJsonSchema` support was the deciding factor for the "Analyze now"
path — the signal card needs a hard shape guarantee every time, not a
prompted-and-hoped-for one. Nothing about the architecture is Gemini-
specific, though: the schema-constrained call and the tool-calling loop
in `app/api/analyze/route.ts` are both patterns that map directly onto
Claude's tool use / structured output, and swapping providers would only
touch that one file.

## How this was built

This is built with AI as the primary development interface, not AI
bolted onto a hand-written app: the codebase, this README, the test
suite, and the agentic tool-calling loop were all built and iterated in
Claude Code sessions — describing what a piece should do, reviewing the
diff, running it, and correcting course, rather than writing every line
by hand first and asking AI to explain it after. That includes gaps a
human reviewer (in this case, working from a reverse-engineered read of
Deriv's own AI Engineer job postings) flagged and this session then
closed in the same sitting: no tests → an indicator test suite and CI; no
agentic behavior → the `getIndicatorsAtLookback` tool-calling loop; no
rate limiting → a per-IP limiter; no eval → `scripts/eval-analysis.mjs`.
The git history from this point forward is the actual build log.

## Project structure

```
app/
  page.tsx              main page: wires chart, indicators, chat together
  api/analyze/route.ts  server-side Gemini calls (structured analysis +
                         tool-calling chat), rate limiting
components/
  Chart.tsx              candlesticks + SMA + Bollinger Bands
  IndicatorPane.tsx       RSI sub-chart
  SymbolSelector.tsx      dropdown of available instruments
  ChatPanel.tsx           chat UI + "Analyze now" button
  SignalCard.tsx          bias/confidence/reasoning display
  StatsBar.tsx            live indicator readout (price/RSI/MACD/etc.)
lib/
  mock-market.ts          simulated market-data feed (default data source)
  deriv-client.ts          real Deriv WebSocket integration (drop-in swap)
  indicators.ts            SMA/EMA/RSI/MACD/Bollinger, hand-rolled
  indicators.test.ts        Vitest suite for the above
  types.ts                 shared TypeScript types
scripts/
  eval-analysis.mjs        offline eval for the AI's structured output
.github/workflows/ci.yml   lint + test + build on every push
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
git commit -m "Add AI Market Analyst: live charts, real indicators, Gemini-powered analysis"
git remote add origin https://github.com/f20230125-sudo/deriv-ai-analyst.git
git branch -M main
git push -u origin main
```
(Create the empty `deriv-ai-analyst` repo on github.com first.)

## Testing

```powershell
npm test          # Vitest — indicator math (SMA/EMA/RSI/MACD/Bollinger)
```

CI runs `lint`, `test`, and `build` on every push (see
`.github/workflows/ci.yml`). To eval the AI's actual output quality
(separate from schema-shape validation), run the app (`npm run dev`) and,
in another terminal:

```powershell
npm run eval       # hits the live /api/analyze route with fixed cases
```

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
- Move rate limiting from the in-memory per-instance limiter it has now
  (resets on cold start, not shared across serverless instances) to an
  edge- or Redis-backed one
- Persist chat/analysis history server-side per session instead of only
  in React state, so a refresh doesn't lose context
- Expand `scripts/eval-analysis.mjs` from a handful of hand-picked cases
  into a larger, versioned golden set, and run it in CI against a
  low-cost model tier instead of by hand
