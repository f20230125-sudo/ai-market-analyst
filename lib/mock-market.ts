/**
 * mock-market.ts
 * ================
 * A simulated market-data feed with the EXACT same public shape as
 * DerivClient (connect / disconnect / getActiveSymbols / subscribeCandles),
 * so app/page.tsx doesn't need to know or care which one is plugged in.
 *
 * This is the default data source, for demo reliability: lib/deriv-client.ts
 * is a complete, verified integration with Deriv's real public WebSocket API
 * (request/response cycle confirmed against Deriv's own API Playground), but
 * depending on a live third-party connection for a portfolio demo is
 * fragile -- corporate/ISP firewalls, browser extensions, or Deriv-side
 * hiccups can all break it in ways outside this app's control, at the worst
 * possible time (while someone's actually looking at it). Swapping back to
 * live data is a one-line change: see the import at the top of page.tsx.
 *
 * Prices follow a seeded geometric random walk per instrument. Deriv's own
 * synthetic indices are themselves algorithmically generated constant-
 * volatility processes (not real economic assets) -- so a random walk isn't
 * a simplification of the real thing here, it's the same category of thing.
 * EUR/USD and Gold get much lower per-second volatility and a lower pip
 * size, loosely matching real forex/metals tick behavior.
 */

import { Candle, SymbolInfo } from "./types";

// Deterministic PRNG (mulberry32) -- each instrument always starts its walk
// from the same seed, so a given symbol looks internally consistent for the
// life of the tab rather than jumping to a wildly different price on every
// symbol switch.
function mulberry32(seed: number) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface InstrumentSpec {
  symbol: string;
  displayName: string;
  market: string;
  submarket: string;
  pip: number;
  startPrice: number;
  volPerSec: number; // stddev of log-return per second
  seed: number;
}

// volPerSec values are tuned (via the empirical check in the build log, not
// a scaling from Deriv's actual index parameters, which aren't published)
// so that ~300 one-minute candles produce a several-percent, visually
// "high volatility but not parabolic" range for the higher-numbered
// indices, and a realistic sub-1%-over-5h intraday range for FX/metals.
const INSTRUMENTS: InstrumentSpec[] = [
  { symbol: "R_10", displayName: "Volatility 10 Index", market: "synthetic_index", submarket: "random_index", pip: 0.001, startPrice: 6512.4, volPerSec: 0.00003, seed: 10 },
  { symbol: "R_25", displayName: "Volatility 25 Index", market: "synthetic_index", submarket: "random_index", pip: 0.001, startPrice: 1834.2, volPerSec: 0.000075, seed: 25 },
  { symbol: "R_75", displayName: "Volatility 75 Index", market: "synthetic_index", submarket: "random_index", pip: 0.001, startPrice: 148230, volPerSec: 0.000224, seed: 75 },
  { symbol: "R_100", displayName: "Volatility 100 Index", market: "synthetic_index", submarket: "random_index", pip: 0.01, startPrice: 8104.6, volPerSec: 0.0003, seed: 100 },
  { symbol: "frxEURUSD", displayName: "EUR/USD", market: "forex", submarket: "major_pairs", pip: 0.0001, startPrice: 1.0842, volPerSec: 0.000015, seed: 42 },
  { symbol: "frxXAUUSD", displayName: "Gold/USD", market: "commodities", submarket: "metals", pip: 0.01, startPrice: 2385.4, volPerSec: 0.00003, seed: 79 },
];

class PriceWalk {
  price: number;
  private rand: () => number;

  constructor(private spec: InstrumentSpec) {
    this.rand = mulberry32(spec.seed);
    this.price = spec.startPrice;
  }

  private gaussian(): number {
    const u1 = Math.max(this.rand(), 1e-9);
    const u2 = this.rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** One lognormal step covering `seconds` of simulated elapsed time. */
  stepSeconds(seconds: number): number {
    const sigma = this.spec.volPerSec * Math.sqrt(Math.max(seconds, 0.01));
    const change = this.gaussian() * sigma;
    this.price = Math.max(this.price * (1 + change), this.spec.pip);
    return this.price;
  }
}

function genCandle(walk: PriceWalk, time: number, granularitySec: number): Candle {
  const steps = 8;
  const stepSec = granularitySec / steps;
  const open = walk.price;
  let high = open;
  let low = open;
  for (let i = 0; i < steps; i++) {
    const p = walk.stepSeconds(stepSec);
    if (p > high) high = p;
    if (p < low) low = p;
  }
  return { time, open, high, low, close: walk.price };
}

function genHistory(spec: InstrumentSpec, granularitySec: number, count: number) {
  const walk = new PriceWalk(spec);
  const now = Math.floor(Date.now() / 1000);
  const lastBucket = Math.floor(now / granularitySec) * granularitySec;
  const startBucket = lastBucket - (count - 1) * granularitySec;
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    candles.push(genCandle(walk, startBucket + i * granularitySec, granularitySec));
  }
  return { candles, walk };
}

export class MockMarketClient {
  private walks = new Map<string, PriceWalk>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  /** Small artificial delay so the UI's "connecting" state still means something. */
  connect(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 250));
  }

  disconnect() {
    this.timers.forEach((t) => clearInterval(t));
    this.timers.clear();
    this.walks.clear();
  }

  async getActiveSymbols(): Promise<SymbolInfo[]> {
    return INSTRUMENTS.map(({ symbol, displayName, market, submarket, pip }) => ({
      symbol,
      displayName,
      market,
      submarket,
      pip,
    })).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async getCandleHistory(symbol: string, granularitySec: number, count = 200): Promise<Candle[]> {
    const spec = INSTRUMENTS.find((s) => s.symbol === symbol);
    if (!spec) throw new Error(`Unknown symbol: ${symbol}`);
    return genHistory(spec, granularitySec, count).candles;
  }

  /**
   * Historical candles PLUS a simulated live tick stream for the current
   * forming candle -- mirrors DerivClient.subscribeCandles exactly, so
   * page.tsx's onUpdate/unsubscribe logic (including rolling a candle over
   * to a new time bucket) needs no changes at all.
   */
  async subscribeCandles(
    symbol: string,
    granularitySec: number,
    onUpdate: (candle: Candle) => void,
    count = 200
  ): Promise<{ history: Candle[]; unsubscribe: () => void }> {
    const spec = INSTRUMENTS.find((s) => s.symbol === symbol);
    if (!spec) throw new Error(`Unknown symbol: ${symbol}`);

    const { candles: history, walk } = genHistory(spec, granularitySec, count);
    this.walks.set(symbol, walk);
    let current = { ...history[history.length - 1] };

    // ~1 tick/second -- fast enough to feel live, slow enough not to strobe.
    const tickMs = 1000;
    const timer = setInterval(() => {
      const nowBucket = Math.floor(Date.now() / 1000 / granularitySec) * granularitySec;
      const price = walk.stepSeconds(tickMs / 1000);

      current =
        nowBucket === current.time
          ? { ...current, high: Math.max(current.high, price), low: Math.min(current.low, price), close: price }
          : { time: nowBucket, open: current.close, high: price, low: price, close: price };

      onUpdate(current);
    }, tickMs);
    this.timers.set(symbol, timer);

    const unsubscribe = () => {
      const t = this.timers.get(symbol);
      if (t) clearInterval(t);
      this.timers.delete(symbol);
      this.walks.delete(symbol);
    };

    return { history, unsubscribe };
  }
}
