/**
 * Web Speech API wrapper for dictating chat composer text.
 *
 * Browser support is uneven — Chrome / Edge / Safari ship SpeechRecognition
 * (under the webkit prefix on Safari) but Firefox does not. The hook below
 * reports support up front so the UI can hide the mic button when speech
 * isn't available, and exposes a simple start/stop interface with
 * incremental + final transcript callbacks.
 *
 * Why we don't ship a richer voice-chat (audio in/out via Whisper + TTS):
 *  - that would require backend audio pipelines (file upload, Whisper call,
 *    TTS synthesis) and a streaming protocol — out of scope for v1.
 *  - browser-native SpeechRecognition gives us dictation for free with zero
 *    backend changes, which is the dominant ChatGPT-style use case.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResultEntry = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionResultEntry;
};

type SpeechRecognitionResultList = {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEvent = { error: string };

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function resolveCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceInputSupported(): boolean {
  return resolveCtor() !== null;
}

export type UseVoiceInputOpts = {
  /** Called on every interim transcript update. */
  onInterim?: (interim: string) => void;
  /** Called when a final transcript chunk is committed. */
  onFinal?: (final: string) => void;
  /** Locale string (defaults to navigator.language or 'en-US'). */
  lang?: string;
};

export type VoiceInputState = {
  /** True if the browser exposes SpeechRecognition. */
  supported: boolean;
  /** True while recording. */
  recording: boolean;
  /** Most recent interim transcript (live update; cleared on stop). */
  interim: string;
  /** Error message from the recognizer; cleared on next start(). */
  error: string | null;
  start: () => void;
  stop: () => void;
};

export function useVoiceInput(opts: UseVoiceInputOpts = {}): VoiceInputState {
  const supported = isVoiceInputSupported();
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    return () => {
      recRef.current?.abort();
    };
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      setError("Voice input isn't supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }
    if (recording) return;
    setError(null);
    setInterim("");
    const Ctor = resolveCtor();
    if (!Ctor) {
      setError("Voice input unavailable.");
      return;
    }
    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = optsRef.current.lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
      rec.onresult = (e) => {
        let interimChunk = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (!r) continue;
          const transcript = r[0]?.transcript ?? "";
          if (r.isFinal) {
            optsRef.current.onFinal?.(transcript);
          } else {
            interimChunk += transcript;
          }
        }
        setInterim(interimChunk);
        if (interimChunk) optsRef.current.onInterim?.(interimChunk);
      };
      rec.onerror = (ev) => {
        const code = ev.error || "unknown";
        if (code === "no-speech") {
          setError("No speech detected — try again.");
        } else if (code === "not-allowed" || code === "service-not-allowed") {
          setError("Microphone access was denied. Allow it in your browser settings and retry.");
        } else if (code === "aborted") {
          // user-initiated stop; no error message needed
        } else {
          setError(`Voice input error: ${code}`);
        }
      };
      rec.onend = () => {
        setRecording(false);
        setInterim("");
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voice input failed to start.");
    }
  }, [recording, supported]);

  const stop = useCallback(() => {
    if (!recording) return;
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped — ignore */
    }
  }, [recording]);

  return { supported, recording, interim, error, start, stop };
}

/**
 * Research-mode prompt prefix. Prepended to the user's message when the Web
 * Search toggle is on, so the agent treats the request as a research task
 * instead of an off-the-cuff reply. Honest about the fact we don't actually
 * fetch live results — the prompt asks the agent to lean on its training
 * data and call out anything that needs verification.
 */
export const RESEARCH_MODE_PREFIX = `## Research mode ON

The operator enabled "Web search / Research mode". Treat this as a research
task: be thorough, cite specific sources / docs / RFCs you're drawing from,
flag claims that would benefit from live verification, and surface
trade-offs explicitly. If you're missing information that would change the
answer materially, say what you'd look up first.
`;
