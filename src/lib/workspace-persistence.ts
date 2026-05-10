/**
 * Persist Agent Workspace UI (chat, reasoning logs, timeline) per mission in localStorage
 * so it survives SPA navigation and full page reloads.
 */

const STORAGE_PREFIX = "hm-workspace-v1:";

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

function storageKey(missionId: string) {
  return `${STORAGE_PREFIX}${missionId}`;
}

export function loadWorkspaceSnapshot(missionId: string): WorkspaceSnapshotV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(missionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceSnapshotV1>;
    if (parsed?.v !== 1 || !Array.isArray(parsed.messages) || !Array.isArray(parsed.logLines) || !Array.isArray(parsed.timelineEvents)) {
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

export function saveWorkspaceSnapshot(
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
    localStorage.setItem(storageKey(missionId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

/** Normalize an API-loaded snapshot onto local disk with the server's revision time. */
export function persistServerWorkspaceSnapshot(missionId: string, snapshot: WorkspaceSnapshotV1, serverUpdatedAt: number): void {
  saveWorkspaceSnapshot(missionId, {
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
