#!/usr/bin/env node
/**
 * eval-analysis.mjs
 * ==================
 * A small offline eval for the "analyze" mode of /api/analyze.
 *
 * Structured JSON output (see app/api/analyze/route.ts) guarantees the
 * *shape* of the model's response, never its *correctness*. This script
 * is the missing other half: a fixed set of indicator snapshots with a
 * known, unambiguous correct-ish bias (e.g. RSI pinned at 100 with price
 * riding the upper Bollinger band has no reasonable bearish reading), run
 * against the live route, checked against an allowed bias set per case.
 *
 * This is deliberately NOT wired into CI: it needs a running dev server
 * and a real GEMINI_API_KEY, and hits a paid API on every run. Run it by
 * hand after touching the system prompt or schema:
 *
 *   npm run dev            # in one terminal
 *   npm run eval           # in another
 */

const BASE_URL = process.env.EVAL_BASE_URL ?? "http://localhost:3000";

/** @typedef {{ name: string, displayName: string, snapshot: object, allowedBias: string[], note: string }} Case */

/** @type {Case[]} */
const CASES = [
  {
    name: "pinned-overbought",
    displayName: "Volatility 75 Index",
    snapshot: {
      lastPrice: 148900,
      priceChangePct: 8.4,
      sma20: 147200,
      ema12: 148500,
      ema26: 146800,
      rsi14: 97,
      macd: { macd: 320.5, signal: 210.2, histogram: 110.3 },
      bollinger: { upper: 148600, middle: 147200, lower: 145800 },
    },
    allowedBias: ["bullish", "neutral"],
    note: "RSI 97, price above the upper band, positive MACD histogram: everything points one way.",
  },
  {
    name: "pinned-oversold",
    displayName: "Volatility 75 Index",
    snapshot: {
      lastPrice: 145600,
      priceChangePct: -7.9,
      sma20: 147200,
      ema12: 146200,
      ema26: 147900,
      rsi14: 4,
      macd: { macd: -320.5, signal: -210.2, histogram: -110.3 },
      bollinger: { upper: 148600, middle: 147200, lower: 145800 },
    },
    allowedBias: ["bearish", "neutral"],
    note: "RSI 4, price at/below the lower band, negative MACD histogram.",
  },
  {
    name: "dead-flat",
    displayName: "EUR/USD",
    snapshot: {
      lastPrice: 1.0842,
      priceChangePct: 0.0,
      sma20: 1.0842,
      ema12: 1.0842,
      ema26: 1.0842,
      rsi14: 50,
      macd: { macd: 0, signal: 0, histogram: 0 },
      bollinger: { upper: 1.0842, middle: 1.0842, lower: 1.0842 },
    },
    allowedBias: ["neutral"],
    note: "Every indicator is dead center; a confident directional call here would be a red flag.",
  },
];

/** @param {Case} testCase */
async function runCase(testCase) {
  const res = await fetch(`${BASE_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "analyze",
      symbol: "EVAL",
      displayName: testCase.displayName,
      snapshot: testCase.snapshot,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    return { pass: false, reason: `HTTP ${res.status}: ${data.error ?? "unknown error"}` };
  }

  const bias = data.result?.bias;
  const pass = testCase.allowedBias.includes(bias);
  return {
    pass,
    reason: pass
      ? `bias=${bias} confidence=${data.result?.confidence}`
      : `bias=${bias} not in allowed set [${testCase.allowedBias.join(", ")}]`,
  };
}

async function main() {
  console.log(`Running ${CASES.length} eval case(s) against ${BASE_URL}\n`);
  let failures = 0;

  for (const testCase of CASES) {
    process.stdout.write(`  ${testCase.name.padEnd(24)} `);
    try {
      const { pass, reason } = await runCase(testCase);
      console.log(`${pass ? "PASS" : "FAIL"}  (${reason})`);
      if (!pass) failures += 1;
    } catch (err) {
      console.log(`ERROR (${err instanceof Error ? err.message : String(err)})`);
      failures += 1;
    }
  }

  console.log(`\n${CASES.length - failures}/${CASES.length} passed.`);
  if (failures > 0) {
    console.error(
      "\nIs the dev server running (`npm run dev`) with a valid GEMINI_API_KEY? " +
        "If so, this is a real regression in the system prompt or schema."
    );
    process.exit(1);
  }
}

main();
