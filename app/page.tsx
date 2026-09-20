"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MockMarketClient } from "@/lib/mock-market";
import { computeSnapshot } from "@/lib/indicators";
import { AnalysisResult, Candle, ChatMessage, SymbolInfo } from "@/lib/types";
import Chart from "@/components/Chart";
import IndicatorPane from "@/components/IndicatorPane";
import SymbolSelector from "@/components/SymbolSelector";
import ChatPanel from "@/components/ChatPanel";
import StatsBar from "@/components/StatsBar";

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
            // Lets the model's getIndicatorsAtLookback tool recompute
            // indicators at an earlier point in the same series instead of
            // only ever seeing the latest snapshot.
            candles,
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
    [symbol, currentSymbolInfo, snapshot, chatHistory, candles]
  );

  return (
    <main className="min-h-screen bg-bg text-gray-100">
      <div className="max-w-[1400px] mx-auto p-4 md:p-6">
        <header className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-bear/70 flex items-center justify-center shadow-lg shadow-accent/10">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-bg" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 17l5-5 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight truncate">
                AI Market Analyst
              </h1>
              <p className="text-xs text-muted truncate">
                Real indicators + AI-explained signals — educational only, no orders are ever placed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              title="Prices are a simulated random-walk feed for demo reliability, not a live Deriv connection. See README for why, and how to swap in live data."
              className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase text-muted border border-border rounded-full px-2.5 py-1 cursor-help"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent pulse-dot" />
              Simulated feed
            </span>
            <a
              href="https://github.com/f20230125-sudo/deriv-ai-analyst"
              target="_blank"
              rel="noreferrer"
              title="View source on GitHub"
              className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-gray-100 hover:border-muted transition"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.74.4-1.25.72-1.54-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.43-2.7 5.41-5.27 5.7.42.36.78 1.07.78 2.16 0 1.56-.01 2.82-.02 3.2 0 .3.21.66.79.55C20.21 21.39 23.5 17.09 23.5 12 23.5 5.65 18.35.5 12 .5z" />
              </svg>
            </a>
          </div>
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
          {candlesLoading && (
            <span className="text-xs text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted pulse-dot" />
              Loading candles…
            </span>
          )}
        </div>

        <StatsBar snapshot={snapshot} pip={currentSymbolInfo?.pip ?? 0.01} loading={candlesLoading && candles.length === 0} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            {candles.length === 0 ? (
              <div className="skeleton w-full rounded-lg border border-border" style={{ height: 420 }} />
            ) : (
              <Chart candles={candles} />
            )}
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

        <footer className="mt-8 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <p>Educational analysis only — no financial advice, no trades are ever placed.</p>
          <p>
            Built with{" "}
            <a
              href="https://claude.com/claude-code"
              target="_blank"
              rel="noreferrer"
              className="text-muted hover:text-gray-200 underline underline-offset-2"
            >
              Claude Code
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
