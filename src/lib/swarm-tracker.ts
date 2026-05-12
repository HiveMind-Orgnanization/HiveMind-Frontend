/**
 * Cross-navigation tracker for in-flight backend jobs (swarm runs + agent
 * invokes) tied to a mission.
 *
 * Both swarm-run and invoke-agent are async on the backend: they return a
 * jobId immediately and the client polls `/swarm-status/<jobId>` or
 * `/invoke-status/<jobId>` until done. Without this tracker, when the user
 * navigates away from Agent Workspace and back, the original polling closure
 * resolves on an unmounted component (state updates dropped) and the
 * remounted workspace used to mark every "thinking" bubble as
 * "interrupted by page reload" — even though the backend was still working.
 *
 * Active job records live at module scope (survives SPA navigation within a
 * tab) AND in localStorage (survives full reload). Records expire after 25 min
 * — past the swarm budget — so genuinely orphaned jobs don't haunt remounts.
 */
export type JobKind = "swarm" | "invoke";

export type ActiveJob =
  | {
      kind: "swarm";
      jobId: string;
      missionId: string;
      hmId: number;
      startedAt: number;
    }
  | {
      kind: "invoke";
      jobId: string;
      missionId: string;
      hmId: number;
      agentId: string;
      agentName: string;
      startedAt: number;
    };

const STORAGE_PREFIX = "hm-active-job:";
const STALE_MS = 25 * 60_000;

// In-memory map. Survives SPA navigation within a tab.
const liveJobs = new Map<string, ActiveJob>();

function storageKey(missionId: string): string {
  return `${STORAGE_PREFIX}${missionId}`;
}

function readPersisted(missionId: string): ActiveJob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(missionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveJob;
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

function writePersisted(job: ActiveJob) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(job.missionId), JSON.stringify(job));
  } catch {
    /* quota errors — non-fatal */
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

/** Register the start of a new in-flight job for a mission. */
export function markJobStarted(job: ActiveJob): void {
  liveJobs.set(job.missionId, job);
  writePersisted(job);
}

/** Clear the job record (done, failed, or user-cancelled). */
export function markJobFinished(missionId: string): void {
  liveJobs.delete(missionId);
  clearPersisted(missionId);
}

/**
 * Returns the active job record if one is tracked, preferring the in-memory
 * entry. On a fresh page load the in-memory map is empty so we re-hydrate
 * from localStorage. Records older than STALE_MS are dropped.
 */
export function getActiveJob(missionId: string): ActiveJob | null {
  const live = liveJobs.get(missionId);
  if (live) return live;
  const persisted = readPersisted(missionId);
  if (persisted) {
    liveJobs.set(missionId, persisted);
    return persisted;
  }
  return null;
}

/** True if the mission currently has a tracked in-flight job. */
export function hasActiveJob(missionId: string): boolean {
  return getActiveJob(missionId) !== null;
}

// ---- User-initiated cancellation -----------------------------------------
//
// The Stop button on the chat composer sets a cancellation flag for the
// mission. Both poll loops (pollSwarmJob, pollInvokeJob) check this flag on
// every iteration and bail out early when set. The backend job will keep
// running to completion server-side — there's no remote cancel endpoint yet
// — but the client stops polling and frees up the UI.

const cancelled = new Set<string>();

export function markCancelled(missionId: string): void {
  cancelled.add(missionId);
}

export function clearCancelled(missionId: string): void {
  cancelled.delete(missionId);
}

export function isCancelled(missionId: string): boolean {
  return cancelled.has(missionId);
}

// ---- Legacy compatibility shims for swarm-only callers ----

export function markSwarmStarted(missionId: string, jobId: string, hmId = 0): void {
  markJobStarted({ kind: "swarm", jobId, missionId, hmId, startedAt: Date.now() });
}

export function markSwarmFinished(missionId: string): void {
  markJobFinished(missionId);
}

export function getActiveSwarmJob(missionId: string): { jobId: string; startedAt: number } | null {
  const job = getActiveJob(missionId);
  if (!job || job.kind !== "swarm") return null;
  return { jobId: job.jobId, startedAt: job.startedAt };
}
