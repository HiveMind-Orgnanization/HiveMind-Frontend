import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

/**
 * Stale-asset / stale-chunk recovery.
 *
 * Vite splits the bundle into hash-suffixed chunks (e.g. `index-Dkg9EETV.js`).
 * After a deploy the hash changes; users still holding an open tab eventually
 * trigger `await import()` for an old chunk, Vercel can't find it, and serves
 * the SPA fallback `index.html` with `Content-Type: text/html`. The browser
 * refuses to parse HTML as a JS module, and the page silently breaks (white
 * preview, blank panels). vercel.json now excludes `/assets/` from the SPA
 * catch-all so missing chunks return a proper 404 — this handler catches
 * those 404s + MIME mismatches and prompts the user to reload once, breaking
 * the spiral instead of leaving them on a half-broken page.
 */
function isStaleChunkError(reason: unknown): boolean {
  const msg = reason instanceof Error ? reason.message : String(reason ?? "");
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /MIME type.*text\/html/i.test(msg)
  );
}

const RELOAD_FLAG = "hm-stale-chunk-reloaded-at";
function handleStaleChunk(reason: unknown): void {
  if (!isStaleChunkError(reason)) return;
  // Reload at most once per minute so we don't get stuck in a refresh loop
  // (in the rare case the deploy itself is broken, not just the user's cache).
  const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? "0");
  if (Date.now() - last < 60_000) return;
  sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  // Soft prompt — most users will be fine with a silent reload, but we tell
  // them why so a flash of "the page reloaded itself" doesn't feel like a bug.
  console.warn("[hm] Stale chunk detected — reloading to pick up the latest deploy.", reason);
  window.location.reload();
}

window.addEventListener("unhandledrejection", (event) => handleStaleChunk(event.reason));
window.addEventListener("error", (event) => handleStaleChunk(event.error ?? event.message));

createRoot(document.getElementById("root")!).render(<App />);
