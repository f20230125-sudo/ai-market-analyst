"use client";

import { SymbolInfo } from "@/lib/types";

interface Props {
  symbols: SymbolInfo[];
  value: string;
  onChange: (symbol: string) => void;
  loading?: boolean;
}

const MARKET_LABEL: Record<string, string> = {
  synthetic_index: "Synthetic Indices",
  forex: "Forex",
  commodities: "Commodities",
};

export default function SymbolSelector({ symbols, value, onChange, loading }: Props) {
  const grouped = symbols.reduce<Record<string, SymbolInfo[]>>((acc, s) => {
    (acc[s.market] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="relative">
      <select
        className="appearance-none bg-panel border border-border rounded-md pl-3 pr-8 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 min-w-[180px]"
        value={value}
        disabled={loading || symbols.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        {loading && <option>Loading symbols…</option>}
        {Object.entries(grouped).map(([market, list]) => (
          <optgroup key={market} label={MARKET_LABEL[market] ?? market}>
            {list.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.displayName}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
