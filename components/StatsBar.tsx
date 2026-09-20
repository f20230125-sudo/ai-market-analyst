import { IndicatorSnapshot } from "@/lib/types";

interface Props {
  snapshot: IndicatorSnapshot;
  pip: number;
  loading: boolean;
}

function formatPrice(value: number | null, pip: number): string {
  if (value == null) return "—";
  const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(pip || 0.01))));
  return value.toFixed(decimals);
}

/** Small readout of the same numbers the AI is given, so the UI backs up
 *  its own claims instead of asking the user to trust the chat panel. */
export default function StatsBar({ snapshot, pip, loading }: Props) {
  const rsi = snapshot.rsi14;
  const rsiTone = rsi == null ? "text-muted" : rsi >= 70 ? "text-bear" : rsi <= 30 ? "text-bull" : "text-gray-200";

  const change = snapshot.priceChangePct;
  const changeTone = change == null ? "text-muted" : change > 0 ? "text-bull" : change < 0 ? "text-bear" : "text-muted";

  const histogram = snapshot.macd?.histogram ?? null;
  const macdTone = histogram == null ? "text-muted" : histogram > 0 ? "text-bull" : histogram < 0 ? "text-bear" : "text-muted";

  const tiles = [
    { label: "Last price", value: formatPrice(snapshot.lastPrice, pip), tone: "text-gray-100" },
    {
      label: "Change",
      value: change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`,
      tone: changeTone,
    },
    { label: "RSI (14)", value: rsi == null ? "—" : rsi.toFixed(1), tone: rsiTone },
    {
      label: "MACD hist.",
      value: histogram == null ? "—" : histogram.toFixed(4),
      tone: macdTone,
    },
    {
      label: "SMA (20)",
      value: formatPrice(snapshot.sma20, pip),
      tone: "text-gray-200",
    },
    {
      label: "Bollinger",
      value:
        snapshot.bollinger == null
          ? "—"
          : `${formatPrice(snapshot.bollinger.lower, pip)} – ${formatPrice(snapshot.bollinger.upper, pip)}`,
      tone: "text-gray-200",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border border-border bg-panel px-3 py-2.5 min-w-0"
        >
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted truncate">
            {tile.label}
          </div>
          {loading ? (
            <div className="skeleton h-4 w-16 rounded mt-1.5" />
          ) : (
            <div className={`text-sm font-semibold tabular-nums truncate ${tile.tone}`}>{tile.value}</div>
          )}
        </div>
      ))}
    </div>
  );
}
