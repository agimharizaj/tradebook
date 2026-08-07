import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });
const jbmono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

export const metadata: Metadata = {
  title: "Tradebook",
  description: "Your trading playbooks, journal, and risk control in one place.",
  appleWebApp: {
    capable: true,
    title: "Tradebook",
    statusBarStyle: "black-translucent",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#161A23",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${grotesk.variable} ${jbmono.variable}`}
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('tb_theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='dark';}try{var last=0;var h=function(){var v=window.visualViewport;var px=v?Math.round(v.height+v.offsetTop):window.innerHeight;if(px>0&&px!==last){last=px;document.documentElement.style.setProperty('--app-height',px+'px')}};var hh=function(){h();setTimeout(h,120);setTimeout(h,400)};h();window.addEventListener('resize',hh);window.addEventListener('orientationchange',hh);window.addEventListener('focusout',hh);window.addEventListener('pageshow',hh);document.addEventListener('visibilitychange',hh);if(window.visualViewport){window.visualViewport.addEventListener('resize',hh)}setInterval(h,1500);}catch(e){}})();",
          }}
        />
        {children}
      </body>
    </html>
  );
}
