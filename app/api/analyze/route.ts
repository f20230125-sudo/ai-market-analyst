import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { AnalysisResult, ChatMessage, IndicatorSnapshot } from "@/lib/types";

// This route runs server-side only (Next.js API route), so the Gemini key
// lives in an env var and is never sent to the browser -- the client only
// ever calls this route, never the Gemini API directly.
export const runtime = "nodejs";

const MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `You are an educational market-analysis assistant embedded in a demo trading dashboard for Deriv synthetic indices, forex, and commodities.

You are shown REAL, CURRENT technical indicator values computed from live market data for one instrument. Your job:
- Explain in plain language what the given indicator values suggest about near-term price behavior.
- State an overall directional bias (bullish, bearish, or neutral) and a confidence level (low, medium, high), grounded STRICTLY in the numbers you are given -- never invent news, fundamentals, or data you weren't given.
- Keep reasoning concise, specific, and numbers-literate: reference the actual values (e.g. "RSI at 74 is in overbought territory").
- Never claim certainty. Technical indicators describe what already happened, not what will definitely happen next.
- This dashboard never places trades and is for educational analysis only -- make that clear.

Note: Deriv's synthetic indices (Volatility/Boom/Crash/Jump) are algorithmically generated instruments with constant, published volatility parameters, not real economic assets driven by news or fundamentals -- analyze them purely as statistical price series, not as "the market pricing in information."`;

const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    bias: { type: "string", enum: ["bullish", "bearish", "neutral"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    reasoning: {
      type: "string",
      description: "2-4 sentences explaining the bias, referencing the actual indicator values given.",
    },
    keyObservations: {
      type: "array",
      items: { type: "string" },
      description: "3-5 short bullet-point observations, e.g. 'RSI at 72 indicates overbought conditions'.",
    },
    disclaimer: {
      type: "string",
      description: "One sentence reiterating this is educational analysis, not financial advice, and no trade is being placed.",
    },
  },
  required: ["bias", "confidence", "reasoning", "keyObservations", "disclaimer"],
};

const VALID_BIAS = new Set(["bullish", "bearish", "neutral"]);
const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);

function isValidAnalysis(x: unknown): x is AnalysisResult {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.bias === "string" &&
    VALID_BIAS.has(r.bias) &&
    typeof r.confidence === "string" &&
    VALID_CONFIDENCE.has(r.confidence) &&
    typeof r.reasoning === "string" &&
    Array.isArray(r.keyObservations) &&
    typeof r.disclaimer === "string"
  );
}

/** Gemini (like most hosted LLM APIs) occasionally returns a transient 5xx
 * under load. Retry a few times with a short delay rather than failing the
 * whole request -- same pattern used in this project's other Gemini-based
 * portfolio pieces. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 5000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      const transient = /5\d\d|overloaded|unavailable|timeout/i.test(message);
      if (!transient || i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

function buildContextBlock(displayName: string, snapshot: IndicatorSnapshot): string {
  const lines = [`Instrument: ${displayName}`];
  if (snapshot.lastPrice != null) lines.push(`Last price: ${snapshot.lastPrice}`);
  if (snapshot.priceChangePct != null) {
    lines.push(`Change over visible window: ${snapshot.priceChangePct.toFixed(2)}%`);
  }
  if (snapshot.sma20 != null) lines.push(`SMA(20): ${snapshot.sma20.toFixed(4)}`);
  if (snapshot.ema12 != null && snapshot.ema26 != null) {
    lines.push(`EMA(12): ${snapshot.ema12.toFixed(4)}, EMA(26): ${snapshot.ema26.toFixed(4)}`);
  }
  if (snapshot.rsi14 != null) lines.push(`RSI(14): ${snapshot.rsi14.toFixed(2)}`);
  if (snapshot.macd) {
    lines.push(
      `MACD: ${snapshot.macd.macd.toFixed(4)}, Signal: ${snapshot.macd.signal.toFixed(4)}, Histogram: ${snapshot.macd.histogram.toFixed(4)}`
    );
  }
  if (snapshot.bollinger) {
    lines.push(
      `Bollinger Bands: upper ${snapshot.bollinger.upper.toFixed(4)}, middle ${snapshot.bollinger.middle.toFixed(4)}, lower ${snapshot.bollinger.lower.toFixed(4)}`
    );
  }
  return lines.join("\n");
}

interface RequestBody {
  mode: "analyze" | "chat";
  symbol: string;
  displayName: string;
  snapshot: IndicatorSnapshot;
  chatHistory?: ChatMessage[];
  question?: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set on the server. Add it to .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mode, displayName, snapshot, chatHistory, question } = body;
  if (!displayName || !snapshot) {
    return NextResponse.json({ error: "Missing displayName/snapshot in request" }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey });
  const context = buildContextBlock(displayName, snapshot);

  try {
    if (mode === "analyze") {
      const resp = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL,
          contents: `Here is the current market snapshot:\n\n${context}\n\nProvide your analysis.`,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseJsonSchema: ANALYSIS_JSON_SCHEMA,
            maxOutputTokens: 600,
          },
        })
      );

      const text = resp.text;
      if (!text) {
        return NextResponse.json({ error: "Model did not return a response" }, { status: 502 });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: "Model returned malformed JSON" }, { status: 502 });
      }

      if (!isValidAnalysis(parsed)) {
        return NextResponse.json({ error: "Model response didn't match the expected schema" }, { status: 502 });
      }

      return NextResponse.json({ result: parsed });
    }

    if (mode === "chat") {
      const history = (chatHistory ?? []).slice(-10); // cap context size
      const contents = [
        ...history.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        { role: "user", parts: [{ text: question ?? "" }] },
      ];

      const resp = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL,
          contents,
          config: {
            systemInstruction: `${SYSTEM_PROMPT}\n\nCurrent market snapshot for reference:\n${context}`,
            maxOutputTokens: 400,
          },
        })
      );

      return NextResponse.json({ text: resp.text ?? "" });
    }

    return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
  } catch (err) {
    console.error("[analyze] Gemini API error", err);
    const message = err instanceof Error ? err.message : "Analysis request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
