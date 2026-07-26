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
  const messages = (body.messages ?? []).slice(-20); // cap history
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

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
      }),
    }
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    const friendly =
      upstream.status === 429
        ? "The free Gemini quota is used up for now. Wait a minute and try again."
        : `The AI service returned an error (${upstream.status}).`;
    console.error("Gemini error", upstream.status, detail.slice(0, 500));
    return Response.json({ error: friendly }, { status: 502 });
  }

  // Re-stream: parse Gemini's SSE frames and forward plain UTF-8 text chunks,
  // so the client just reads response.body incrementally.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n");
      buffer = frames.pop() ?? "";
      for (const line of frames) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const parts: { text?: string }[] =
            json?.candidates?.[0]?.content?.parts ?? [];
          for (const p of parts) if (p.text) controller.enqueue(encoder.encode(p.text));
          const block = json?.promptFeedback?.blockReason;
          if (block) controller.enqueue(encoder.encode(`\n(Request blocked by the AI provider: ${block})`));
        } catch {
          // Partial frame: leave for the next chunk via buffer.
        }
      }
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
