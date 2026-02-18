import { describe, it, expect } from "vitest";
import { sma, ema, rsi, macd, bollingerBands, computeSnapshot } from "./indicators";
import { Candle } from "./types";

describe("sma", () => {
  it("returns null before the warm-up period, then the rolling average", () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out).toEqual([null, null, 2, 3, 4]);
  });

  it("handles a period longer than the input", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });
});

describe("ema", () => {
  it("seeds with the SMA of the first period, then applies the EMA recurrence", () => {
    // period=3, k=0.5: seed = avg(1,2,3)=2; then 4*0.5+2*0.5=3; then 5*0.5+3*0.5=4
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out).toEqual([null, null, 2, 3, 4]);
  });

  it("returns all nulls when input is shorter than the period", () => {
    expect(ema([1, 2], 5)).toEqual([null, null]);
  });
});

describe("rsi (Wilder's smoothing)", () => {
  it("goes to 100 on a strictly rising series (never a loss)", () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20, always +1
    const out = rsi(closes, 14);
    expect(out[14]).toBe(100);
    expect(out[out.length - 1]).toBe(100);
  });

  it("goes to 0 on a strictly falling series (never a gain)", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 20 - i); // 20..1, always -1
    const out = rsi(closes, 14);
    expect(out[14]).toBe(0);
    expect(out[out.length - 1]).toBe(0);
  });

  it("returns null for every index before period+1 data points exist", () => {
    const closes = Array.from({ length: 14 }, (_, i) => i + 1); // only 14 points, need 15
    const out = rsi(closes, 14);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it("sits at 50 on a perfectly flat series (no gains, no losses)", () => {
    const closes = new Array(20).fill(100);
    const out = rsi(closes, 14);
    expect(out[14]).toBe(50);
  });
});

describe("macd", () => {
  it("produces a histogram equal to macdLine minus signalLine at every valid index", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2);
    const { macdLine, signalLine, histogram } = macd(closes);
    for (let i = 0; i < closes.length; i++) {
      if (macdLine[i] != null && signalLine[i] != null) {
        expect(histogram[i]).not.toBeNull();
        expect(histogram[i]!).toBeCloseTo(macdLine[i]! - signalLine[i]!, 10);
      } else {
        expect(histogram[i]).toBeNull();
      }
    }
  });

  it("has no macd line values before the slow EMA warms up (default slow=26)", () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i);
    const { macdLine } = macd(closes);
    expect(macdLine.every((v) => v === null)).toBe(true);
  });
});

describe("bollingerBands", () => {
  it("collapses upper/middle/lower to the same value when variance is zero", () => {
    const closes = new Array(10).fill(10);
    const { upper, middle, lower } = bollingerBands(closes, 5, 2);
    expect(middle[4]).toBe(10);
    expect(upper[4]).toBe(10);
    expect(lower[4]).toBe(10);
  });

  it("keeps the bands symmetric around the middle band", () => {
    const closes = [10, 12, 8, 14, 6, 16, 4, 18, 2, 20];
    const { upper, middle, lower } = bollingerBands(closes, 5, 2);
    for (let i = 4; i < closes.length; i++) {
      const upDist = upper[i]! - middle[i]!;
      const downDist = middle[i]! - lower[i]!;
      expect(upDist).toBeCloseTo(downDist, 10);
    }
  });
});

describe("computeSnapshot", () => {
  const toCandle = (close: number, i: number): Candle => ({
    time: i,
    open: close,
    high: close,
    low: close,
    close,
  });

  it("returns an all-null snapshot for an empty candle series", () => {
    const snap = computeSnapshot([]);
    expect(snap.sma20).toBeNull();
    expect(snap.rsi14).toBeNull();
    expect(snap.macd).toBeNull();
    expect(snap.bollinger).toBeNull();
    expect(snap.lastPrice).toBeNull();
    expect(snap.priceChangePct).toBeNull();
  });

  it("computes priceChangePct relative to the first candle in the visible window", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i); // 100..129
    const candles = closes.map(toCandle);
    const snap = computeSnapshot(candles);
    expect(snap.lastPrice).toBe(129);
    expect(snap.priceChangePct).toBeCloseTo(((129 - 100) / 100) * 100, 10);
    expect(snap.sma20).not.toBeNull();
    expect(snap.rsi14).toBe(100); // strictly rising window
  });
});
