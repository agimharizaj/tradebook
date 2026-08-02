import { createClient } from "@/lib/supabase/server";
import { buildAiContext } from "@/lib/ai-context";

export const dynamic = "force-dynamic";
// Give long replies room; Vercel Fluid compute allows up to 300s on Hobby.
export const maxDuration = 300;

// Lightweight, non-reasoning model: Sidekick summarises pre-computed stats
// and compares rules, which needs speed and reliability, not deep reasoning.
// Starts writing in ~1-2s (the 3.6 reasoning model thought for 60s+ and hit
// Vercel's clock), higher free-tier daily allowance, vision included.
const MODEL = "gemini-3.1-flash-lite";

type ClientMessage = {
  role: "user" | "model";
  text: string;
  // Base64 image (no data: prefix) attached to a user message, for the
  // setup checker. Only the newest message ever carries one; older
  // screenshots are replaced client-side with a text placeholder.
  image?: { mimeType: string; data: string };
};

// ---------------------------------------------------------------------------
// Free fallback via OpenRouter when Gemini's free quota is exhausted.
// Text-only (setup checks with images stay on Gemini). The free-model lineup
// rotates weekly, so the list is fetched live and cached, preferring the
// consistently-free Chinese model families (Qwen, GLM, Kimi).
// ---------------------------------------------------------------------------
type OrModel = { id?: string; pricing?: { prompt?: string; completion?: string } };
let freeModelCache: { ids: string[]; at: number } | null = null;

// Abort if response HEADERS don't arrive within `ms`; once they have, the
// timer is cleared so long streams are unaffected. Free models can accept a
// request and then queue for minutes - without this, one slow provider
// freezes the whole reply.
async function fetchWithHeaderTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function freeModelIds(key: string): Promise<string[]> {
  if (freeModelCache && Date.now() - freeModelCache.at < 60 * 60 * 1000) return freeModelCache.ids;
  const r = await fetchWithHeaderTimeout(
    "https://openrouter.ai/api/v1/models",
    { headers: { Authorization: `Bearer ${key}` } },
    5_000
  );
  if (!r.ok) return [];
  const j = (await r.json()) as { data?: OrModel[] };
  const rank = (id: string) =>
    id.includes("qwen") ? 0 : id.includes("glm") || id.startsWith("z-ai") ? 1 : id.includes("kimi") || id.includes("moonshot") ? 2 : id.includes("llama") ? 3 : 4;
  const ids = (j.data ?? [])
    .filter((m) => m.id && m.pricing?.prompt === "0" && m.pricing?.completion === "0")
    .map((m) => m.id as string)
    .sort((a, b) => rank(a) - rank(b));
  freeModelCache = { ids, at: Date.now() };
  return ids;
}

const FALLBACK_NOTE = "\n\n(Gemini's free quota was full, so a free fallback model answered this one.)";

function streamFromOpenRouter(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return new ReadableStream<Uint8Array>({
    start(controller) {
      // First byte immediately, so the platform never sees a silent response.
      controller.enqueue(new TextEncoder().encode("​"));
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        if (payload === "[DONE]") {
          controller.close();
          reader.cancel().catch(() => {});
          return;
        }
        try {
          const j = JSON.parse(payload);
          const t = j?.choices?.[0]?.delta?.content;
          if (t) controller.enqueue(encoder.encode(t));
          if (j?.choices?.[0]?.finish_reason) {
            controller.enqueue(encoder.encode(FALLBACK_NOTE));
            controller.close();
            reader.cancel().catch(() => {});
            return;
          }
        } catch {
          // Partial frame; wait for the rest.
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

async function tryOpenRouterFallback(
  system: string,
  msgs: ClientMessage[],
  key: string
): Promise<Response | null> {
  const ids = await freeModelIds(key).catch(() => [] as string[]);
  const orMessages = [
    { role: "system", content: system },
    ...msgs.map((m) => ({ role: m.role === "model" ? "assistant" : "user", content: m.text })),
  ];
  for (const id of ids.slice(0, 3)) {
    try {
      const r = await fetchWithHeaderTimeout(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: id, messages: orMessages, stream: true }),
        },
        10_000
      );
      if (!r.ok || !r.body) continue;
      console.info("[ai] Gemini quota full; falling back to OpenRouter model", id);
      return new Response(streamFromOpenRouter(r.body), {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    } catch {
      // Try the next free model.
    }
  }
  return null;
}

const HARD_RULES = `You are Sidekick, the Tradebook trading companion: an experienced trading analyst, coach and second pair of eyes for one trader. Below is a snapshot of their own data: summary statistics, recent trades, their strategies (entry/exit criteria and risk controls), notes, chart analyses and recent market headlines.

Answer style (default):
- Lead with the answer in the first sentence, then at most 2-4 sentences of reasoning. Stop there.
- Match length to the question. Short question, short answer. Go long only when asked for depth, or for a chart-plus-strategy check (below).
- Plain language, exact numbers. No filler, no restating the question, no summary sign-off.
- Caveats are a clause, not a paragraph. Note a view is probabilistic and the risk is theirs once, briefly, and only when it could drive a live trade.

What you do:
- Give honest opinions and advice on setups, strategy, risk and process, read charts (structure, trend, key levels, momentum, liquidity, candlestick behaviour) and explain news and macro events. Always have a reason, but keep it tight.
- Ground any claim about the trader's own performance in the data snapshot and quote the number you used. If the data does not support it, say so; do not guess.
- Name a discipline leak in one line when the data shows one: day-of-week and pair leaks, risk-rule violations, oversized losses, expectancy trends.

Be thorough only here: a chart screenshot with a selected strategy. Then describe what you actually see, check the setup against that strategy's written entry criteria and risk controls rule by rule (each marked met, not met, or cannot tell from the image), and end with your overall opinion of the setup. With no strategy selected, give a short read. For any criterion about the session being active or price being inside the trading window, use the "Right now" block in the snapshot (current time, open sessions, active kill zone) to mark it met or not met - do not answer "cannot tell" for time-of-day criteria.

Formatting: plain text only. Short paragraphs. Use a hyphen list only for three or more discrete items, otherwise prose. No markdown headers, no asterisks, no tables.`;

// What each app page shows, so "explain this page" / "what am I looking at"
// resolves to the right slice of the data snapshot.
const PAGE_NOTES: [string, string][] = [
  ["/dashboard", "the Dashboard: lifetime stats from their logged trades (net PnL, win rate, profit factor, equity curve, max drawdown, day-of-week breakdown)"],
  ["/journal/trade", "a single trade's journal page: the trade's facts plus their review (plan followed, confluence/management/mistake tags, entry and exit emotions, chart screenshots, reflection)"],
  ["/journal", "the Journal: a monthly calendar of their trades with daily PnL, weekly and monthly summaries, expectancy and average R, plus a day/week panel with guardrail violations, pre-market routine and per-trade journaling"],
  ["/charts", "the Trading page: a live TradingView chart of a pair from their watchlist, the trading-day panel (pre-market routine, guardrails, today's news and trades, watchlist) and a log of their saved chart analyses"],
  ["/risk", "the Risk calculator: position sizing (account size and risk in, lot size out) with live prices"],
  ["/news", "the News page: market headlines and the economic calendar (recent headlines are in the snapshot below)"],
  ["/sessions", "the Sessions page: live market clocks for Sydney, Tokyo, London and New York with open/closed status, and a converter between those market times"],
  ["/notebook", "the Notebook: their free-form trading notes (recent notes are in the snapshot below)"],
  ["/strategy", "the Strategy page: their playbooks with charting process, entry/exit criteria, management rules and risk controls (all in the snapshot below)"],
  ["/sanctuary", "the Sanctuary: a box-breathing and trading-psychology page"],
  ["/profile", "their Profile settings (personal details, password)"],
  ["/settings", "their Settings: trading guardrails (max trades/day, max daily loss, profit target, trading windows), trading profile, pre-market routine, pairs watchlist, appearance"],
];

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY is not set on the server." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: { messages?: ClientMessage[]; strategyId?: string | null; page?: string | null };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  // Conversation window: keep the newest history that fits ~100k tokens
  // (approximated at 4 chars/token). Gemini Flash takes 1M, so this is a
  // deliberate ceiling that keeps free-tier per-minute token quotas workable.
  const MAX_CONTEXT_CHARS = 400_000;
  const all = body.messages ?? [];
  const messages: ClientMessage[] = [];
  let chars = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    chars += (all[i].text?.length ?? 0) + 20;
    if (chars > MAX_CONTEXT_CHARS && messages.length) break;
    messages.unshift(all[i]);
  }
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "No user message." }, { status: 400 });
  }

  // Fresh data snapshot per request, as the signed-in user (RLS applies).
  const context = await buildAiContext(supabase, user);

  const pageNote =
    typeof body.page === "string"
      ? PAGE_NOTES.find(([prefix]) => body.page!.startsWith(prefix))?.[1]
      : undefined;

  const systemInstruction = [
    HARD_RULES,
    pageNote
      ? `\nThe trader currently has ${pageNote} open in Tradebook. When they ask about "this page", "this", or what's on screen, that is what they mean; answer from the matching parts of the data snapshot.`
      : "",
    body.strategyId
      ? `\nFor this conversation's setup check the trader selected the strategy with id ${body.strategyId}. Use that strategy's written entry criteria and risk controls.`
      : "",
    // Screenshot requests are only ever appropriate for chart reads. Without
    // an attached image, everything else must be answered from the snapshot.
    messages[messages.length - 1].image?.data
      ? ""
      : `\nThe current message has NO image attached. If they explicitly asked for a chart or setup read, tell them to attach a screenshot; for every other request answer from the data snapshot and never ask for an image.`,
    `\n===== TRADER DATA SNAPSHOT =====\n${context}\n===== END SNAPSHOT =====`,
  ].join("\n");

  const contents = messages.map((m) => ({
    role: m.role,
    parts: [
      ...(m.image?.data && m.role === "user"
        ? [{ inline_data: { mime_type: m.image.mimeType || "image/jpeg", data: m.image.data } }]
        : []),
      { text: m.text || "(see attached chart screenshot)" },
    ],
  }));

  const upstream = await fetchWithHeaderTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        // No thinkingConfig: flash-lite defaults to minimal thinking, and
        // sending the field to a model that doesn't support it is a 400.
        generationConfig: { temperature: 0.3, maxOutputTokens: 3072 },
      }),
    },
    20_000
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("Gemini error", upstream.status, detail.slice(0, 500));
    // Quota exhausted: retry on a free OpenRouter model (text only; image
    // setup checks need Gemini's vision).
    const lastHasImage = !!messages[messages.length - 1].image?.data;
    const orKey = process.env.OPENROUTER_API_KEY;
    if (upstream.status === 429 && !lastHasImage && orKey) {
      const fallback = await tryOpenRouterFallback(systemInstruction, messages, orKey);
      if (fallback) return fallback;
    }
    const friendly =
      upstream.status === 429
        ? lastHasImage
          ? "The free Gemini quota is used up and setup checks need Gemini's vision. Wait a minute and try again."
          : "Free quotas are used up on Gemini and the fallback. Wait a minute and try again."
        : `The AI service returned an error (${upstream.status}).`;
    return Response.json({ error: friendly }, { status: 502 });
  }

  // Re-stream: parse Gemini's SSE frames and forward plain UTF-8 text chunks,
  // so the client just reads response.body incrementally.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Heartbeat: Gemini 3.x "thinks" silently before the first token,
      // sometimes for over a minute. Vercel kills functions that haven't
      // started responding (504), so send invisible zero-width spaces
      // immediately and every 10s until real text arrives. The client
      // strips them out.
      let gotText = false;
      let closed = false;
      const safeEnqueue = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          closed = true;
        }
      };
      safeEnqueue("​");
      const heartbeat = setInterval(() => {
        if (!gotText) safeEnqueue("​");
      }, 10_000);
      const finish = () => {
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Already closed by the consumer.
          }
        }
        reader.cancel().catch(() => {});
      };
      (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              finish();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\n");
            buffer = frames.pop() ?? "";
            let finished = false;
            for (const line of frames) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const json = JSON.parse(payload);
                const parts: { text?: string }[] =
                  json?.candidates?.[0]?.content?.parts ?? [];
                for (const p of parts) {
                  if (p.text) {
                    gotText = true;
                    safeEnqueue(p.text);
                  }
                }
                const fin = json?.candidates?.[0]?.finishReason;
                if (fin === "MAX_TOKENS") {
                  safeEnqueue("\n\n(Answer hit the length limit. Ask me to continue.)");
                }
                if (fin) finished = true;
                const block = json?.promptFeedback?.blockReason;
                if (block) {
                  safeEnqueue(`\n(Request blocked by the AI provider: ${block})`);
                  finished = true;
                }
              } catch {
                // Partial frame: leave for the next chunk via buffer.
              }
            }
            // finishReason marks the true end; Gemini can hold the socket
            // open afterwards, so close ourselves.
            if (finished) {
              finish();
              return;
            }
          }
        } catch {
          finish();
        }
      })();
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
