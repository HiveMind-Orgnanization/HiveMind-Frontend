/**
 * Local in-process agent activity bus.
 *
 * The backend broadcasts `agent.activity` events on a WebSocket so other
 * connected clients (and the Live Console) can stream them. But on the
 * production deploy the frontend lives on Vercel and the backend on AWS
 * Elastic Beanstalk — Vercel's `vercel.json` rewrites cover `/api`, `/health`,
 * and `/preview`, but Vercel does NOT proxy WebSocket upgrades through
 * rewrites, so `wss://<vercel-host>/ws` 404s and the Live Console used to
 * silently show "Listening for agent activity…" forever even while agents
 * were actively producing output in the same tab.
 *
 * This bus closes that loop: AgentWorkspace publishes events as agents do
 * work (chat send, thought complete, swarm progress, file save), and the
 * Live Console subscribes to it alongside the WebSocket. Events from local
 * actions therefore always appear, even when the remote WS is down. When
 * the WS *does* connect (e.g. when running against a direct EB URL with
 * HTTPS) both sources feed the same logs state — listeners de-duplicate by
 * timestamp + agent + message prefix.
 */
export type LocalActivityEvt = {
  agent: string;
  message: string;
  ts: number;
};

type Listener = (e: LocalActivityEvt) => void;

const listeners = new Set<Listener>();

/** Subscribe to local activity events. Returns an unsubscribe function. */
export function subscribeLocalActivity(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Publish a local activity event to all subscribers. */
export function publishLocalActivity(e: LocalActivityEvt): void {
  for (const fn of listeners) {
    try {
      fn(e);
    } catch {
      /* listener exceptions never crash the producer */
    }
  }
}
