import { createClient } from "@/lib/supabase/server";
import { buildAiContext } from "@/lib/ai-context";

export const dynamic = "force-dynamic";
// Streaming responses can outlive the default timeout on slow days.
export const maxDuration = 60;

// Current stable Gemini Flash (free tier via Google AI Studio). One place to
// change when Google ships the next stable.
const MODEL = "gemini-3.6-flash";

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

const HARD_RULES = `You are Sidekick, the Tradebook trading companion, a trading performance analyst and accountability coach for one trader. Below is a snapshot of their own data: summary statistics, recent trades, their strategies (entry/exit criteria and risk controls), and note titles.

Hard rules, no exceptions:
1. Never predict price or direction. Never suggest when to enter or exit, a stop, a target, position size for a live trade, or whether to take a trade. You give no signals. If asked, briefly explain why you don't and offer a rule-compliance check of their setup against their own strategy instead.
2. Ground every claim in the data provided. Quote the numbers you used. If the data does not support an answer, say so plainly instead of guessing.
3. Chart screenshots: evaluate only against the selected strategy's written entry criteria and risk controls, rule by rule, each marked met, not met, or cannot tell from the image. Frame the result as an opinion on rule compliance, never a trade recommendation. If no strategy was selected, ask for one before evaluating.
4. Coach on discipline: day-of-week and pair leaks, risk-rule violations, oversized losses, expectancy trends. Ask short, direct questions that make the trader reflect on process, not outcomes.
5. Be concise. Plain language, numbers exact.

Formatting: plain text only. Short paragraphs, hyphen lists where a list helps. No markdown headers, no asterisks, no tables.`;

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

  let body: { messages?: ClientMessage[]; strategyId?: string | null };
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

  const systemInstruction = [
    HARD_RULES,
    body.strategyId
      ? `\nFor this conversation's setup check the trader selected the strategy with id ${body.strategyId}. Use that strategy's written entry criteria and risk controls.`
      : "",
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
        // Roomy cap: Gemini 3.x spends hidden "thinking" tokens from this
        // same budget, so a tight limit truncates visible answers mid-word.
        generationConfig: { temperature: 0.4, maxOutputTokens: 32768 },
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
