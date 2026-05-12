/**
 * Local agent activity bus + persistent ring buffer.
 *
 * Two pain points this solves:
 *
 *  1. The backend broadcasts `agent.activity` events on a WebSocket so other
 *     connected clients (and the Live Console) can stream them. But on the
 *     production deploy the frontend lives on Vercel and the backend on AWS
 *     Elastic Beanstalk — Vercel's `vercel.json` rewrites cover `/api`,
 *     `/health`, and `/preview`, but Vercel does NOT proxy WebSocket
 *     upgrades through rewrites, so `wss://<vercel-host>/ws` 404s and the
 *     Live Console used to silently show "Listening for agent activity…"
 *     forever even while agents were actively producing output in the same
 *     tab.
 *
 *  2. Without persistence, opening the Live Console AFTER agents have run
 *     showed an empty feed — events emitted before subscription were lost
 *     forever. Now every event also writes to a capped localStorage ring
 *     so a fresh page load can replay the last ~200 entries.
 *
 * AgentWorkspace publishes events as agents do work (chat send, thought
 * complete, swarm progress, file save); LiveConsole subscribes to it
 * alongside the WebSocket. Events from local actions therefore always
 * appear, even when the remote WS is down. When the WS *does* connect
 * (e.g. when running against a direct EB URL with HTTPS) both sources
 * feed the same logs state.
 */
export type LocalActivityEvt = {
  agent: string;
  message: string;
  ts: number;
};

type Listener = (e: LocalActivityEvt) => void;

const listeners = new Set<Listener>();

const STORAGE_KEY = "hm-activity-history";
const RING_LIMIT = 200; // max events kept in localStorage
const MAX_MSG_BYTES = 2000; // truncate huge replies before persisting

function readRing(): LocalActivityEvt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalActivityEvt[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is LocalActivityEvt =>
        e != null &&
        typeof e.agent === "string" &&
        typeof e.message === "string" &&
        typeof e.ts === "number",
    );
  } catch {
    return [];
  }
}

function writeRing(events: LocalActivityEvt[]): void {
  if (typeof window === "undefined") return;
  try {
    // Keep only the most recent RING_LIMIT and truncate oversized messages
    // so the JSON serialization stays under localStorage's per-key budget.
    const trimmed = events.slice(-RING_LIMIT).map((e) =>
      e.message.length > MAX_MSG_BYTES
        ? { ...e, message: `${e.message.slice(0, MAX_MSG_BYTES)}…` }
        : e,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / corrupted — non-fatal, in-memory bus still works */
  }
}

/** Read the persisted ring so a fresh page load can replay history. */
export function getRecentLocalActivity(): LocalActivityEvt[] {
  return readRing();
}

/** Wipe persisted history (used by the Live Console "trash" button). */
export function clearLocalActivity(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Subscribe to local activity events. Returns an unsubscribe function. */
export function subscribeLocalActivity(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Publish a local activity event to all subscribers AND the persisted ring. */
export function publishLocalActivity(e: LocalActivityEvt): void {
  // Persist first so the ring has the latest entry even if a listener
  // throws or React unmounts a subscriber mid-emit.
  const ring = readRing();
  ring.push(e);
  writeRing(ring);
  for (const fn of listeners) {
    try {
      fn(e);
    } catch {
      /* listener exceptions never crash the producer */
    }
  }
}
