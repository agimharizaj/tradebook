import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FEEDS = [
  "https://www.forexlive.com/feed/",
  "https://www.forexlive.com/feed/news",
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
  for (const url of FEEDS) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TradebookBot/1.0)" },
        next: { revalidate: 300 },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
      if (blocks.length === 0) continue;
      const items = blocks.slice(0, 25).map((m) => {
        const b = m[1];
        const body = htmlToText(tag(b, "content:encoded") || tag(b, "description"));
        return {
          title: unwrap(tag(b, "title")),
          link: unwrap(tag(b, "link")),
          pubDate: unwrap(tag(b, "pubDate")),
          body: body.slice(0, 5000),
        };
      });
      return NextResponse.json({ items });
    } catch {
      continue;
    }
  }
  return NextResponse.json({ items: [], error: "unavailable" }, { status: 502 });
}
