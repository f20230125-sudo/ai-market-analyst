"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MockMarketClient } from "@/lib/mock-market";
import { computeSnapshot } from "@/lib/indicators";
import { AnalysisResult, Candle, ChatMessage, SymbolInfo } from "@/lib/types";
import Chart from "@/components/Chart";
import IndicatorPane from "@/components/IndicatorPane";
import SymbolSelector from "@/components/SymbolSelector";
import ChatPanel from "@/components/ChatPanel";

const GRANULARITIES = [
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
  { label: "1h", seconds: 3600 },
];

const MAX_CANDLES = 300;
const PREFERRED_DEFAULT_SYMBOL = "Volatility 75 Index";

export default function Home() {
  const clientRef = useRef<MockMarketClient | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [symbol, setSymbol] = useState<string>("");
  const [granularity, setGranularity] = useState(60);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const [candlesLoading, setCandlesLoading] = useState(false);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [latestAnalysis, setLatestAnalysis] = useState<AnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Connect to the market-data feed + load the tradable symbol list once on
  // mount.
  //
  // React 18 StrictMode (on in dev via next.config.js) intentionally runs
  // this effect, its cleanup, and then the effect again on first mount, to
  // help surface exactly this class of bug. Without the `cancelled` guard,
  // the first (throwaway) pass could still call a state setter *after* the
  // second (real) pass has already taken over, leaving stale state on
  // screen. This only affects `next dev`; `next build && next start`
  // doesn't double-invoke effects.
  useEffect(() => {
    let cancelled = false;
    const client = new MockMarketClient();
    clientRef.current = client;

    client
      .connect()
      .then(() => client.getActiveSymbols())
      .then((list) => {
        if (cancelled) return;
        setSymbols(list);
        setSymbolsLoading(false);
        const preferred = list.find((s) => s.displayName === PREFERRED_DEFAULT_SYMBOL) ?? list[0];
        if (preferred) setSymbol(preferred.symbol);
      })
      .catch((err) => {
        if (cancelled) return;
        setConnectionError(
          err instanceof Error ? err.message : "Failed to start the market data feed"
        );
        setSymbolsLoading(false);
      });

    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
      client.disconnect();
    };
  }, []);

  // (Re)subscribe to live candles whenever the symbol or timeframe changes.
  useEffect(() => {
    if (!symbol || !clientRef.current) return;
    let cancelled = false;
    setCandlesLoading(true);
    unsubscribeRef.current?.();

    clientRef.current
      .subscribeCandles(symbol, granularity, (updated) => {
        setCandles((prev) => {
          if (prev.length === 0) return [updated];
          const last = prev[prev.length - 1];
          if (last.time === updated.time) {
            return [...prev.slice(0, -1), updated];
          }
          const next = [...prev, updated];
          return next.length > MAX_CANDLES ? next.slice(next.length - MAX_CANDLES) : next;
        });
      })
      .then(({ history, unsubscribe }) => {
        if (cancelled) {
          unsubscribe();
          return;
        }
        unsubscribeRef.current = unsubscribe;
        setCandles(history);
        setCandlesLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setConnectionError(err instanceof Error ? err.message : "Failed to load candle history");
          setCandlesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, granularity]);

  const snapshot = useMemo(() => computeSnapshot(candles), [candles]);
  const currentSymbolInfo = symbols.find((s) => s.symbol === symbol);

  const handleAnalyze = useCallback(async () => {
    if (!currentSymbolInfo) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "analyze",
          symbol,
          displayName: currentSymbolInfo.displayName,
          snapshot,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setLatestAnalysis(data.result as AnalysisResult);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAiLoading(false);
    }
  }, [symbol, currentSymbolInfo, snapshot]);

  const handleAsk = useCallback(
    async (question: string) => {
      if (!currentSymbolInfo) return;
      const nextHistory: ChatMessage[] = [...chatHistory, { role: "user", content: question }];
      setChatHistory(nextHistory);
      setAiLoading(true);
      setAiError(null);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "chat",
            symbol,
            displayName: currentSymbolInfo.displayName,
            snapshot,
            chatHistory: nextHistory,
            question,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Chat request failed");
        setChatHistory((prev) => [...prev, { role: "assistant", content: data.text as string }]);
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "Chat request failed");
      } finally {
        setAiLoading(false);
      }
    },
    [symbol, currentSymbolInfo, snapshot, chatHistory]
  );

  return (
    <main className="min-h-screen bg-bg text-gray-100 p-4 md:p-6">
      <header className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold">Deriv AI Market Analyst</h1>
          <p className="text-xs text-muted">
            Real indicators + AI-explained signals — educational only, no orders are ever placed.
          </p>
        </div>
        <span
          title="Prices are a simulated random-walk feed for demo reliability, not a live Deriv connection. See README for why, and how to swap in live data."
          className="text-[11px] font-medium tracking-wide uppercase text-muted border border-border rounded-full px-2.5 py-1 cursor-help"
        >
          Simulated feed
        </span>
      </header>

      {connectionError && (
        <div className="mb-4 text-sm bg-bear/10 border border-bear/30 text-bear rounded-md px-3 py-2">
          {connectionError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SymbolSelector symbols={symbols} value={symbol} onChange={setSymbol} loading={symbolsLoading} />
        <div className="flex gap-1">
          {GRANULARITIES.map((g) => (
            <button
              key={g.seconds}
              onClick={() => setGranularity(g.seconds)}
              className={`text-xs px-2.5 py-1.5 rounded-md border transition ${
                granularity === g.seconds
                  ? "bg-accent/20 border-accent/40 text-accent"
                  : "bg-panel border-border text-muted hover:text-gray-200"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
        {candlesLoading && <span className="text-xs text-muted">Loading candles…</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Chart candles={candles} />
          <IndicatorPane candles={candles} />
        </div>
        <div className="lg:col-span-1">
          <ChatPanel
            displayName={currentSymbolInfo?.displayName ?? symbol}
            chatHistory={chatHistory}
            latestAnalysis={latestAnalysis}
            loading={aiLoading}
            disabled={!currentSymbolInfo || candles.length === 0}
            onAnalyze={handleAnalyze}
            onAsk={handleAsk}
          />
          {aiError && <p className="text-xs text-bear mt-2">{aiError}</p>}
        </div>
      </div>
    </main>
  );
}
