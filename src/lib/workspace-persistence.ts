/**
 * Persist Agent Workspace UI (chat, reasoning logs, timeline) per mission in localStorage
 * so it survives SPA navigation and full page reloads.
 *
 * Storage keys are scoped BOTH by wallet pubkey AND by mission id. Without the wallet
 * prefix, wallet B looking at a mission created by wallet A would see wallet A's cached
 * chat history (the backend correctly refuses to serve the snapshot, but the local
 * fallback would leak). The legacy `hm-workspace-v1:<missionId>` key still gets read
 * once as a migration path, so users don't lose their chat on the first load after this
 * fix lands.
 */

const STORAGE_PREFIX = "hm-workspace-v1:";
const LEGACY_PREFIX = "hm-workspace-v1:";

const MAX_MESSAGES = 300;
const MAX_LOG_LINES = 400;
const MAX_TIMELINE = 120;

export type PersistedWorkspaceChatMsg = {
  id: number;
  agent: string;
  color: string;
  text: string;
  state?: "thinking" | "delegating" | "executing" | "approved";
  ts: string;
};

export type PersistedWorkspaceLogLine = { ts: number; agent: string; message: string };

export type WorkspaceSnapshotV1 = {
  v: 1;
  messages: PersistedWorkspaceChatMsg[];
  logLines: PersistedWorkspaceLogLine[];
  timelineEvents: { ts: number; l: string; c: string }[];
  selectedAgent: string;
  /** Client or server millis; used to merge local vs saved remote state. */
  updatedAt?: number;
};

function storageKey(walletPk: string | null, missionId: string) {
  return `${STORAGE_PREFIX}${walletPk ?? "guest"}:${missionId}`;
}

function legacyStorageKey(missionId: string) {
  return `${LEGACY_PREFIX}${missionId}`;
}

function parseSnapshot(raw: string): WorkspaceSnapshotV1 | null {
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceSnapshotV1>;
    if (
      parsed?.v !== 1 ||
      !Array.isArray(parsed.messages) ||
      !Array.isArray(parsed.logLines) ||
      !Array.isArray(parsed.timelineEvents)
    ) {
      return null;
    }
    return {
      v: 1,
      messages: parsed.messages,
      logLines: parsed.logLines,
      timelineEvents: parsed.timelineEvents,
      selectedAgent: typeof parsed.selectedAgent === "string" ? parsed.selectedAgent : "Strategy",
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined,
    };
  } catch {
    return null;
  }
}

export function loadWorkspaceSnapshot(walletPk: string | null, missionId: string): WorkspaceSnapshotV1 | null {
  if (typeof window === "undefined") return null;
  // Only the wallet-scoped key is honored. Legacy un-scoped snapshots are intentionally
  // ignored — copying them forward into the current wallet's slot WAS the bug it was
  // trying to fix: when wallet B opened a mission that wallet A had cached, wallet B
  // would inherit wallet A's chat history. We accept some lost chat on the first load
  // after this fix in exchange for a clean cross-tenant boundary.
  const scoped = localStorage.getItem(storageKey(walletPk, missionId));
  if (scoped) return parseSnapshot(scoped);
  return null;
}

/** One-time cleanup of any old un-scoped snapshot keys. Called by useMissions once on mount.
 *  Idempotent — safe to call from multiple components. */
export function purgeLegacyWorkspaceSnapshots(): void {
  if (typeof window === "undefined") return;
  try {
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // Legacy keys are `hm-workspace-v1:<missionId>` — no wallet pubkey segment.
      // Wallet-scoped keys have THREE colon-separated segments after the prefix.
      // Anything matching the prefix but missing the wallet segment is legacy.
      if (key.startsWith(LEGACY_PREFIX)) {
        const tail = key.slice(LEGACY_PREFIX.length);
        // Wallet pubkeys are base58 and never contain a colon; mission ids never do
        // either. Wallet-scoped form: `<walletPk>:<missionId>` → exactly one colon.
        // Legacy form: `<missionId>` → zero colons.
        if (!tail.includes(":")) toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function saveWorkspaceSnapshot(
  walletPk: string | null,
  missionId: string,
  snap: Omit<WorkspaceSnapshotV1, "v">,
): void {
  if (typeof window === "undefined") return;
  try {
    const updatedAt =
      typeof snap.updatedAt === "number" && Number.isFinite(snap.updatedAt) ? snap.updatedAt : Date.now();
    const payload: WorkspaceSnapshotV1 = {
      v: 1,
      messages: snap.messages.slice(-MAX_MESSAGES),
      logLines: snap.logLines.slice(-MAX_LOG_LINES),
      timelineEvents: snap.timelineEvents.slice(-MAX_TIMELINE),
      selectedAgent: snap.selectedAgent,
      updatedAt,
    };
    localStorage.setItem(storageKey(walletPk, missionId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

/** Normalize an API-loaded snapshot onto local disk with the server's revision time. */
export function persistServerWorkspaceSnapshot(
  walletPk: string | null,
  missionId: string,
  snapshot: WorkspaceSnapshotV1,
  serverUpdatedAt: number,
): void {
  saveWorkspaceSnapshot(walletPk, missionId, {
    messages: snapshot.messages,
    logLines: snapshot.logLines,
    timelineEvents: snapshot.timelineEvents,
    selectedAgent: snapshot.selectedAgent,
    updatedAt: serverUpdatedAt,
  });
}

export function isVacuousWorkspaceSnapshot(s: {
  messages: unknown[];
  logLines: unknown[];
  timelineEvents: unknown[];
}): boolean {
  return s.messages.length === 0 && s.logLines.length === 0 && s.timelineEvents.length === 0;
}

/** Normalize API jsonb — tolerate missing arrays or accidental nesting so the workspace UI never stays blank. */
export function coerceWorkspaceSnapshotFromApi(raw: unknown, serverUpdatedAt: number): WorkspaceSnapshotV1 | null {
  if (!raw || typeof raw !== "object") return null;
  let o = raw as Record<string, unknown>;
  if (o.v !== 1 && o.snapshot && typeof o.snapshot === "object") {
    o = o.snapshot as Record<string, unknown>;
  }
  if (o.v !== 1) return null;
  const messages = Array.isArray(o.messages) ? (o.messages as WorkspaceSnapshotV1["messages"]) : [];
  const logLines = Array.isArray(o.logLines) ? (o.logLines as WorkspaceSnapshotV1["logLines"]) : [];
  const timelineEvents = Array.isArray(o.timelineEvents)
    ? (o.timelineEvents as WorkspaceSnapshotV1["timelineEvents"])
    : [];
  return {
    v: 1,
    messages,
    logLines,
    timelineEvents,
    selectedAgent: typeof o.selectedAgent === "string" ? o.selectedAgent : "Strategy",
    updatedAt:
      typeof o.updatedAt === "number"
        ? o.updatedAt
        : typeof serverUpdatedAt === "number" && Number.isFinite(serverUpdatedAt)
          ? serverUpdatedAt
          : Date.now(),
  };
}
