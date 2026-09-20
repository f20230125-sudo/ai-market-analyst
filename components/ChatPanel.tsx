"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { ChatMessage, AnalysisResult } from "@/lib/types";
import SignalCard from "./SignalCard";

interface Props {
  displayName: string;
  chatHistory: ChatMessage[];
  latestAnalysis: AnalysisResult | null;
  loading: boolean;
  disabled: boolean;
  onAnalyze: () => void;
  onAsk: (question: string) => void;
}

const EXAMPLE_PROMPTS = [
  "Why does RSI matter here?",
  "Was this trend already building 20 candles ago?",
  "What would change your bias?",
];

export default function ChatPanel({
  displayName,
  chatHistory,
  latestAnalysis,
  loading,
  disabled,
  onAnalyze,
  onAsk,
}: Props) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatHistory.length, latestAnalysis, loading]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    onAsk(q);
    setInput("");
  };

  const handlePromptClick = (prompt: string) => {
    if (loading || disabled) return;
    onAsk(prompt);
  };

  return (
    <div className="flex flex-col border border-border rounded-lg bg-panel">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-100">AI Market Analyst</div>
            <div className="text-xs text-muted truncate">{displayName}</div>
          </div>
        </div>
        <button
          onClick={onAnalyze}
          disabled={disabled || loading}
          className="shrink-0 text-xs font-medium bg-accent/15 text-accent border border-accent/30 rounded-md px-3 py-1.5 hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {loading ? "Analyzing…" : "Analyze now"}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[260px] max-h-[460px]">
        {latestAnalysis && <SignalCard result={latestAnalysis} />}

        {chatHistory.length === 0 && !latestAnalysis && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Click &ldquo;Analyze now&rdquo; for a structured read on the current chart, or ask a
              question below.
            </p>
            <div className="flex flex-col gap-1.5">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handlePromptClick(prompt)}
                  disabled={disabled || loading}
                  className="text-left text-xs text-muted border border-border rounded-md px-3 py-2 hover:border-accent/40 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatHistory.map((m, i) => (
          <div
            key={i}
            className={`animate-fade-in-up text-sm rounded-lg px-3 py-2 max-w-[85%] leading-relaxed ${
              m.role === "user"
                ? "bg-accent/15 text-gray-100 ml-auto"
                : "bg-bg text-gray-200 border border-border"
            }`}
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-muted pulse-dot" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted pulse-dot" style={{ animationDelay: "0.2s" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-muted pulse-dot" style={{ animationDelay: "0.4s" }} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-border flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
          placeholder="Ask about this chart…"
          className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-gray-100 placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || loading || !input.trim()}
          className="text-sm font-medium bg-accent text-bg rounded-md px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
}
