"use client";

// Voice-to-text via the browser's Web Speech API (Chrome/Edge/Safari).
// Live interim results stream through onText; final segments are committed.
// No API keys, no audio leaves the page except to the browser vendor's
// recognition service. Feature-detect with `supported`.
import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};
type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return Ctor ? new Ctor() : null;
}

export function useSpeech(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  // User pressed stop vs. the engine timing out on silence: only the former
  // should end the session (Chrome ends recognition after ~8s of silence).
  const wantRef = useRef(false);

  useEffect(() => {
    setSupported(!!getRecognition());
    return () => {
      wantRef.current = false;
      recRef.current?.stop();
    };
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    rec.lang = navigator.language || "en-GB";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinalRef.current(r[0].transcript.trim());
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = () => {
      wantRef.current = false;
      setListening(false);
      setInterim("");
    };
    rec.onend = () => {
      // Auto-restart after silence timeouts while the user still wants to talk.
      if (wantRef.current) {
        try { rec.start(); } catch { setListening(false); }
      } else {
        setListening(false);
        setInterim("");
      }
    };
    wantRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, interim, start, stop, toggle };
}
