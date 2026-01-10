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
    <select
      className="bg-panel border border-border rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
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
  );
}
