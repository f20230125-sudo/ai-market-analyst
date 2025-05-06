import { AnalysisResult } from "@/lib/types";

const BIAS_STYLES: Record<string, string> = {
  bullish: "bg-bull/15 text-bull border-bull/30",
  bearish: "bg-bear/15 text-bear border-bear/30",
  neutral: "bg-muted/15 text-muted border-muted/30",
};

const BIAS_ICON: Record<string, string> = {
  bullish: "▲",
  bearish: "▼",
  neutral: "●",
};

const CONFIDENCE_DOTS: Record<string, number> = { low: 1, medium: 2, high: 3 };

export default function SignalCard({ result }: { result: AnalysisResult }) {
  const biasClass = BIAS_STYLES[result.bias] ?? BIAS_STYLES.neutral;
  const icon = BIAS_ICON[result.bias] ?? BIAS_ICON.neutral;
  const dots = CONFIDENCE_DOTS[result.confidence] ?? 1;

  return (
    <div className="animate-fade-in-up border border-border rounded-lg p-4 bg-bg/40 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase border ${biasClass}`}>
          <span className="text-[10px]" aria-hidden>
            {icon}
          </span>
          {result.bias}
        </span>
        <div className="flex items-center gap-1 text-xs text-muted">
          Confidence:
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${i <= dots ? "bg-accent" : "bg-border"}`}
            />
          ))}
          <span className="ml-1 capitalize">{result.confidence}</span>
        </div>
      </div>

      <p className="text-sm text-gray-200 leading-relaxed">{result.reasoning}</p>

      {result.keyObservations?.length > 0 && (
        <ul className="text-sm text-muted space-y-1 list-disc list-inside">
          {result.keyObservations.map((obs, i) => (
            <li key={i}>{obs}</li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted border-t border-border pt-2 italic">{result.disclaimer}</p>
    </div>
  );
}
