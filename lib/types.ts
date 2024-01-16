export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SymbolInfo {
  symbol: string; // Deriv's internal code, e.g. "R_75"
  displayName: string; // e.g. "Volatility 75 Index"
  market: string; // "synthetic_index" | "forex" | "commodities" | ...
  submarket: string;
  pip: number;
}

export interface IndicatorSnapshot {
  sma20: number | null;
  ema12: number | null;
  ema26: number | null;
  rsi14: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  bollinger: { upper: number; middle: number; lower: number } | null;
  lastPrice: number | null;
  priceChangePct: number | null; // over the visible candle window
}

export type Bias = "bullish" | "bearish" | "neutral";
export type Confidence = "low" | "medium" | "high";

export interface AnalysisResult {
  bias: Bias;
  confidence: Confidence;
  reasoning: string;
  keyObservations: string[];
  disclaimer: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
