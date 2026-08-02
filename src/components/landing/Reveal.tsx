"use client";

// Scroll-reveal + lazy-mount wrapper for landing sections. Children fade in
// as they enter the viewport; with `lazy`, the children (typically animated
// demo components) aren't even mounted until they're near the viewport, so
// the page does no off-screen work on load. Reduced-motion users see
// everything immediately (globals.css).
import { useEffect, useRef, useState } from "react";

export default function Reveal({
  children,
  lazy = false,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  lazy?: boolean;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "160px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`tb-reveal ${shown ? "tb-reveal-in" : ""} ${className}`}
    >
      {lazy && !shown ? <div className="min-h-40" aria-hidden="true" /> : children}
    </div>
  );
}
