/**
 * indicators.ts
 * =============
 * Hand-rolled technical indicators, no external TA library. Each series
 * function returns an array the same length as the input, with `null` for
 * indices that don't yet have enough warm-up data -- callers (chart
 * overlays, snapshot()) just skip nulls.
 */

import { Candle, IndicatorSnapshot } from "./types";

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    const val = values[i] * k + prev * (1 - k);
    out[i] = val;
    prev = val;
  }
  return out;
}

function rsiFromAvg(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Wilder's RSI (the standard formulation). */
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = rsiFromAvg(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFromAvg(avgGain, avgLoss);
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f != null && s != null ? f - s : null;
  });

  const firstValidIdx = macdLine.findIndex((v) => v != null);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  if (firstValidIdx !== -1) {
    const macdValues = macdLine.slice(firstValidIdx).map((v) => v as number);
    const sig = ema(macdValues, signalPeriod);
    for (let i = 0; i < sig.length; i++) {
      signalLine[firstValidIdx + i] = sig[i];
    }
  }

  const histogram: (number | null)[] = closes.map((_, i) => {
    const m = macdLine[i];
    const s = signalLine[i];
    return m != null && s != null ? m - s : null;
  });

  return { macdLine, signalLine, histogram };
}

export function bollingerBands(closes: number[], period = 20, mult = 2) {
  const middle = sma(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i++) {
    const mid = middle[i];
    if (mid == null) continue;
    const window = closes.slice(i - period + 1, i + 1);
    const variance = window.reduce((acc, v) => acc + (v - mid) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = mid + mult * sd;
    lower[i] = mid - mult * sd;
  }

  return { upper, middle, lower };
}

/** Latest-value summary across all indicators, for the AI prompt + signal card. */
export function computeSnapshot(candles: Candle[]): IndicatorSnapshot {
  const closes = candles.map((c) => c.close);
  const empty: IndicatorSnapshot = {
    sma20: null,
    ema12: null,
    ema26: null,
    rsi14: null,
    macd: null,
    bollinger: null,
    lastPrice: null,
    priceChangePct: null,
  };
  if (closes.length === 0) return empty;

  const sma20Arr = sma(closes, 20);
  const ema12Arr = ema(closes, 12);
  const ema26Arr = ema(closes, 26);
  const rsiArr = rsi(closes, 14);
  const { macdLine, signalLine, histogram } = macd(closes);
  const boll = bollingerBands(closes, 20, 2);

  const last = closes.length - 1;
  const first = closes[0];
  const lastPrice = closes[last];

  const m = macdLine[last];
  const s = signalLine[last];
  const h = histogram[last];
  const bu = boll.upper[last];
  const bm = boll.middle[last];
  const bl = boll.lower[last];

  return {
    sma20: sma20Arr[last],
    ema12: ema12Arr[last],
    ema26: ema26Arr[last],
    rsi14: rsiArr[last],
    macd: m != null && s != null && h != null ? { macd: m, signal: s, histogram: h } : null,
    bollinger: bu != null && bm != null && bl != null ? { upper: bu, middle: bm, lower: bl } : null,
    lastPrice,
    priceChangePct: first !== 0 ? ((lastPrice - first) / first) * 100 : null,
  };
}
