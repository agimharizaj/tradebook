import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tradebook",
    short_name: "Tradebook",
    description: "Your trading playbooks, journal, and risk control in one place.",
    // Straight into the app: the installed PWA should never route through
    // the public landing page (auth layout still bounces signed-out users
    // to /login).
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#161A23",
    theme_color: "#161A23",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
