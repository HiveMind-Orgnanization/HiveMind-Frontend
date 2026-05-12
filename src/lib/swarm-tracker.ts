/**
 * Cross-navigation tracker for in-flight swarm runs.
 *
 * Problem we're solving: the backend runs `swarm-run` asynchronously and the
 * client polls `/swarm-status/<jobId>` until done. When the user navigates
 * away from Agent Workspace and back, the original component is unmounted —
 * its polling closure still resolves but updates state on a dead component
 * (dropped). The remounted component sees stale "thinking" bubbles and used
 * to mark them all as "interrupted by page reload."
 *
 * This tracker stores the active jobId at module scope (survives navigation
 * within a tab) AND in localStorage (survives full reload). On remount the
 * workspace checks for an active job for the current mission and re-enters
 * the poll loop instead of declaring the run dead.
 *
 * Active job records expire after 25 min — the backend swarm budget is 20 min
 * (see swarmRunMissionApi MAX_MS), so anything older than that is genuinely
 * orphaned and the UI should offer a manual Resume.
 */
export type SwarmJobRecord = {
  jobId: string;
  startedAt: number;
};

const STORAGE_PREFIX = "hm-swarm-job:";
const STALE_MS = 25 * 60_000;

// In-memory map. Kept alive across SPA navigation within a single tab so
// switching to another sidebar page doesn't break the swarm tracking story.
const liveJobs = new Map<string, SwarmJobRecord>();

function storageKey(missionId: string): string {
  return `${STORAGE_PREFIX}${missionId}`;
}

function readPersisted(missionId: string): SwarmJobRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(missionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SwarmJobRecord;
    if (!parsed?.jobId || typeof parsed.startedAt !== "number") return null;
    if (Date.now() - parsed.startedAt > STALE_MS) {
      localStorage.removeItem(storageKey(missionId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePersisted(missionId: string, rec: SwarmJobRecord) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(missionId), JSON.stringify(rec));
  } catch {
    /* quota — non-fatal */
  }
}

function clearPersisted(missionId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(missionId));
  } catch {
    /* ignore */
  }
}

/** Register the start of a new swarm run. Call right after the backend returns a jobId. */
export function markSwarmStarted(missionId: string, jobId: string): void {
  const rec: SwarmJobRecord = { jobId, startedAt: Date.now() };
  liveJobs.set(missionId, rec);
  writePersisted(missionId, rec);
}

/** Clear the swarm record (done, failed, or user-cancelled). */
export function markSwarmFinished(missionId: string): void {
  liveJobs.delete(missionId);
  clearPersisted(missionId);
}

/**
 * Return the active job record if one exists. Prefer the in-memory entry; fall
 * back to localStorage when this is a fresh page load. Returns null when no
 * known run is in flight or when the persisted record is past the stale cutoff.
 */
export function getActiveSwarmJob(missionId: string): SwarmJobRecord | null {
  const live = liveJobs.get(missionId);
  if (live) return live;
  const persisted = readPersisted(missionId);
  if (persisted) {
    // Surface the persisted record into the in-memory map so subsequent
    // navigations within this tab don't keep hitting localStorage.
    liveJobs.set(missionId, persisted);
    return persisted;
  }
  return null;
}

/** True if the swarm is currently tracked in THIS tab (i.e. not a fresh reload). */
export function isSwarmActiveInTab(missionId: string): boolean {
  return liveJobs.has(missionId);
}
