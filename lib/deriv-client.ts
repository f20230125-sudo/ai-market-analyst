/**
 * deriv-client.ts
 * ================
 * A small, dependency-free wrapper around Deriv's public WebSocket API
 * (wss://ws.derivws.com/websockets/v3). Runs entirely in the browser --
 * market data and symbol listing are public endpoints that need no login,
 * which fits this app's "analysis only, no orders" scope: we never touch
 * a real or demo account, only read-only market data.
 *
 * API shape reference: https://api.deriv.com/api-explorer (see
 * `active_symbols` and `ticks_history`). If Deriv changes a field name
 * this is the one file to check first -- open the browser console, the
 * client logs a warning for any message it doesn't recognize instead of
 * failing silently.
 */

import { Candle, SymbolInfo } from "./types";

type JsonMsg = Record<string, any>;

const WS_URL = "wss://ws.derivws.com/websockets/v3";

// Markets we care about for this app (skip crypto/stocks/basket indices
// to keep the symbol list focused on what Deriv is actually known for).
export const RELEVANT_MARKETS = ["synthetic_index", "forex", "commodities"];

export class DerivClient {
  private ws: WebSocket | null = null;
  private appId: string;
  private reqCounter = 1;
  private connectPromise: Promise<void> | null = null;
  private pending = new Map<number, { resolve: (m: JsonMsg) => void; reject: (e: Error) => void }>();
  private ohlcListeners = new Map<string, (c: Candle) => void>(); // key: symbol
  private subscriptionIds = new Map<string, string>(); // symbol -> subscription id

  constructor(appId: string) {
    this.appId = appId;
  }

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}?app_id=${encodeURIComponent(this.appId)}`);
      this.ws = ws;

      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("Deriv WebSocket connection failed"));
      ws.onclose = () => {
        this.connectPromise = null;
      };
      ws.onmessage = (event) => this.handleMessage(event);
    });

    return this.connectPromise;
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.connectPromise = null;
    this.pending.clear();
    this.ohlcListeners.clear();
    this.subscriptionIds.clear();
  }

  private handleMessage(event: MessageEvent) {
    let msg: JsonMsg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.warn("[deriv-client] received non-JSON message", event.data);
      return;
    }

    if (msg.error) {
      const reqId = msg.req_id;
      if (reqId && this.pending.has(reqId)) {
        this.pending.get(reqId)!.reject(new Error(msg.error.message || "Deriv API error"));
        this.pending.delete(reqId);
      } else {
        console.warn("[deriv-client] API error", msg.error);
      }
      return;
    }

    // Live candle (OHLC) push for a subscription -- doesn't consume the
    // pending map, keeps arriving until we `forget` the subscription.
    if (msg.msg_type === "ohlc" && msg.ohlc) {
      const symbol = msg.ohlc.symbol as string;
      const listener = this.ohlcListeners.get(symbol);
      if (listener) {
        listener({
          time: Number(msg.ohlc.open_time ?? msg.ohlc.epoch),
          open: Number(msg.ohlc.open),
          high: Number(msg.ohlc.high),
          low: Number(msg.ohlc.low),
          close: Number(msg.ohlc.close),
        });
      }
      return;
    }

    // One-shot request/response (active_symbols, or the initial
    // ticks_history reply, subscribed or not) -- resolves the matching
    // pending promise by req_id.
    const reqId = msg.req_id;
    if (reqId && this.pending.has(reqId)) {
      this.pending.get(reqId)!.resolve(msg);
      this.pending.delete(reqId);
      return;
    }

    // Unrecognized message shape -- surfaced for debugging rather than
    // silently dropped, since this is the piece most likely to drift if
    // Deriv changes their API.
    if (msg.msg_type && msg.msg_type !== "ohlc") {
      // benign: e.g. a forget/forget_all ack we don't otherwise handle
    }
  }

  private request(payload: JsonMsg, timeoutMs = 15000): Promise<JsonMsg> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Deriv WebSocket is not connected"));
    }
    const reqId = this.reqCounter++;
    const body = { ...payload, req_id: reqId };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error(`Deriv request timed out: ${JSON.stringify(payload)}`));
      }, timeoutMs);

      this.pending.set(reqId, {
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      this.ws!.send(JSON.stringify(body));
    });
  }

  async getActiveSymbols(): Promise<SymbolInfo[]> {
    // NOTE: deliberately NOT sending `product_type: "basic"` here -- Deriv's
    // live API returns an empty `active_symbols: []` (no error) when that
    // field is included on this endpoint, confirmed by comparing against
    // Deriv's own API Playground, which sends only `{ active_symbols: "brief" }`
    // and gets real data back. Keep this request minimal unless Deriv's docs
    // say otherwise.
    const msg = await this.request({ active_symbols: "brief" });
    const list: any[] = msg.active_symbols ?? [];
    return list
      .filter((s) => RELEVANT_MARKETS.includes(s.market))
      .map((s) => ({
        symbol: s.symbol,
        displayName: s.display_name,
        market: s.market,
        submarket: s.submarket,
        pip: Number(s.pip ?? 0.01),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /** One-time historical candles, no live updates. */
  async getCandleHistory(symbol: string, granularitySec: number, count = 200): Promise<Candle[]> {
    const msg = await this.request({
      ticks_history: symbol,
      style: "candles",
      granularity: granularitySec,
      count,
      end: "latest",
      adjust_start_time: 1,
    });
    const candles: any[] = msg.candles ?? [];
    return candles.map((c) => ({
      time: Number(c.epoch),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }));
  }

  /**
   * Historical candles PLUS a live subscription for the current forming
   * candle. Returns the initial history; call the returned `unsubscribe()`
   * when you switch symbols or unmount.
   */
  async subscribeCandles(
    symbol: string,
    granularitySec: number,
    onUpdate: (candle: Candle) => void,
    count = 200
  ): Promise<{ history: Candle[]; unsubscribe: () => void }> {
    const msg = await this.request({
      ticks_history: symbol,
      style: "candles",
      granularity: granularitySec,
      count,
      end: "latest",
      adjust_start_time: 1,
      subscribe: 1,
    });

    const subId = msg.subscription?.id;
    if (subId) this.subscriptionIds.set(symbol, subId);
    this.ohlcListeners.set(symbol, onUpdate);

    const candles: any[] = msg.candles ?? [];
    const history = candles.map((c) => ({
      time: Number(c.epoch),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }));

    const unsubscribe = () => {
      this.ohlcListeners.delete(symbol);
      const id = this.subscriptionIds.get(symbol);
      if (id && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ forget: id }));
      }
      this.subscriptionIds.delete(symbol);
    };

    return { history, unsubscribe };
  }
}
