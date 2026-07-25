import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FEEDS: { url: string; source: string }[] = [
  { url: "https://www.forexlive.com/feed/", source: "ForexLive" },
  { url: "https://www.fxstreet.com/rss/news", source: "FXStreet" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
];

function unwrap(s: string) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}
function tag(block: string, name: string) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? unwrap(m[1]) : "";
}
function htmlToText(h: string) {
  return unwrap(h)
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&rsquo;|&#8217;/gi, "'")
    .replace(/&#8211;|&ndash;/gi, "-")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function GET() {
  // Fetch all feeds in parallel; tolerate any subset failing.
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const res = await fetch(f.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TradebookBot/1.0)" },
        next: { revalidate: 300 },
      });
      if (!res.ok) throw new Error("feed failed");
      const xml = await res.text();
      const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
      return blocks.slice(0, 40).map((m) => {
        const b = m[1];
        const body = htmlToText(tag(b, "content:encoded") || tag(b, "description"));
        return {
          title: unwrap(tag(b, "title")),
          link: unwrap(tag(b, "link")),
          pubDate: unwrap(tag(b, "pubDate")),
          body: body.slice(0, 5000),
          source: f.source,
        };
      });
    })
  );

  const merged = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const seen = new Set<string>();
  const items: typeof merged = [];
  for (const it of merged) {
    if (!it.link || !it.title || seen.has(it.link)) continue;
    seen.add(it.link);
    items.push(it);
  }
  items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  if (items.length === 0) {
    return NextResponse.json({ items: [], error: "unavailable" }, { status: 502 });
  }
  return NextResponse.json({ items: items.slice(0, 150) });
}
