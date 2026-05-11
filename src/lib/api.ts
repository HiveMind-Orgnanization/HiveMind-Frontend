import type { Mission } from "../app/store";
import { getAuthToken } from "./auth-token";
import {
  coerceWorkspaceSnapshotFromApi,
  type WorkspaceSnapshotV1,
} from "./workspace-persistence";

/** Base URL for HiveMind API. Empty string = same-origin (Vite dev proxy → backend). */
export function apiBase(): string {
  const raw = import.meta.env.VITE_API_URL?.trim() ?? "";
  return raw.replace(/\/$/, "");
}

/** Whether the SPA should call the backend (missions, auth, health). */
export function apiConfigured(): boolean {
  if (import.meta.env.VITE_API_DISABLED === "true") return false;
  // In prod: Vercel rewrites /api/* → EB backend (server-side, no mixed-content).
  // In dev: Vite proxy in vite.config.ts routes /api/* → BACKEND_PROXY_TARGET.
  return true;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = apiBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

export async function fetchBackendHealth(): Promise<{ ok: boolean }> {
  if (!apiConfigured()) return { ok: false };
  try {
    const r = await apiFetch("/health");
    return { ok: r.ok };
  } catch {
    return { ok: false };
  }
}

export async function fetchMissionsApi(): Promise<Mission[] | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch("/api/missions");
    if (!r.ok) return null;
    const j = (await r.json()) as { missions?: Mission[] };
    return Array.isArray(j.missions) ? j.missions : null;
  } catch {
    return null;
  }
}

/** Matches GET /api/missions/:id/live-metrics — roster, progress, tasks, ETA derived on the server. */
export type MissionLiveMetrics = {
  rosterBacked: number;
  rosterTotal: number;
  progressPct: number;
  opsDone: number;
  opsTotal: number;
  etaLabel: string;
  etaSource: "deadline" | "task_estimate" | "stored" | "none";
};

export async function fetchMissionLiveMetricsApi(missionId: string): Promise<MissionLiveMetrics | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch(`/api/missions/${encodeURIComponent(missionId)}/live-metrics`);
    if (!r.ok) return null;
    return (await r.json()) as MissionLiveMetrics;
  } catch {
    return null;
  }
}

export type AutoInvokeResult = {
  agentId: string;
  agentName: string;
  specialization: string;
  reply: string;
  provider: "groq" | "mock";
  model: string;
  latencyMs: number;
  etaLabel: string;
  /** False when mission id only exists in the browser — invoke still runs; DB not updated. */
  persisted: boolean;
  mission?: Mission | null;
  debugLlm?: string;
};

export type AutoInvokeApiResponse =
  | { ok: true; data: AutoInvokeResult }
  | { ok: false; status: number; error: string; message: string };

export async function autoInvokeMissionApi(
  missionId: string,
  ctx: { title: string; objective: string },
): Promise<AutoInvokeApiResponse> {
  if (!apiConfigured()) {
    return { ok: false, status: 0, error: "api_off", message: "API is disabled in this build." };
  }
  try {
    const r = await apiFetch(`/api/missions/${encodeURIComponent(missionId)}/auto-invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: ctx.title, objective: ctx.objective }),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      const err = typeof j.error === "string" ? j.error : "request_failed";
      const msg =
        typeof j.message === "string"
          ? j.message
          : err === "no_agents"
            ? "No agents in the API store."
            : r.status === 503
              ? "Backend unavailable."
              : `Request failed (${r.status}).`;
      return { ok: false, status: r.status, error: err, message: msg };
    }
    return { ok: true, data: j as AutoInvokeResult };
  } catch {
    return { ok: false, status: 0, error: "network", message: "Could not reach the backend. Is it running on port 8787?" };
  }
}

export type SwarmVerificationReport = {
  ok: boolean;
  summary: string;
  issues: string[];
  coverage: {
    frontend: boolean;
    backend: boolean;
    readme: boolean;
    docs: boolean;
    notesOnly: boolean;
  };
  artifactPathCount: number;
};

export type SwarmRunResult = {
  persisted: boolean;
  etaLabel: string;
  startedAt: number;
  finishedAt: number;
  finalReply?: string;
  fileTree?: string;
  artifactPaths?: string[];
  verification?: SwarmVerificationReport;
  results: Array<{
    role: string;
    agentId: string;
    agentName: string;
    specialization: string;
    reply: string;
    provider: "groq" | "openai" | "mock";
    model: string;
    plan?: string;
    artifactPaths?: string[];
    error?: string;
    debugLlm?: string;
  }>;
};

export type SwarmProgress = {
  currentRole: string | null;
  completedRoles: string[];
  partialResults: Array<{ role: string; agentName: string; replySnippet: string; provider: string; model: string }>;
};

/** Transient gateway / load errors while polling — one failure should not abort the whole swarm. */
async function fetchWithRetryForGateway(
  path: string,
  init: RequestInit | undefined,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const attempts = opts.attempts ?? 6;
  const base = opts.baseDelayMs ?? 400;
  let last: Response | undefined;
  for (let a = 0; a < attempts; a++) {
    try {
      last = await apiFetch(path, init);
      if (last.ok) return last;
      if (last.status === 401 || last.status === 403) return last;
      const retryable = last.status === 502 || last.status === 503 || last.status === 504;
      if (!retryable || a === attempts - 1) return last;
    } catch {
      if (a === attempts - 1) throw new Error("network_error_after_retries");
      /* network drop — treat like a transient gateway failure and retry */
    }
    await new Promise<void>((r) => setTimeout(r, base * (a + 1)));
  }
  return last!;
}

export async function swarmRunMissionApi(
  missionId: string,
  ctx: { title: string; objective: string },
  options?: { onProgress?: (progress: SwarmProgress) => void },
): Promise<{ ok: true; data: SwarmRunResult } | { ok: false; status: number; message: string }> {
  if (!apiConfigured()) return { ok: false, status: 0, message: "API is disabled in this build." };
  try {
    // POST returns immediately with a jobId (202) — backend runs swarm async.
    const r = await apiFetch(`/api/missions/${encodeURIComponent(missionId)}/swarm-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: ctx.title, objective: ctx.objective }),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok && r.status !== 202) {
      const msg = typeof j.message === "string" ? j.message : `Request failed (${r.status}).`;
      return { ok: false, status: r.status, message: msg };
    }
    const jobId = typeof j.jobId === "string" ? j.jobId : null;
    if (!jobId) {
      // Legacy sync response (old backend) — return directly.
      return { ok: true, data: j as SwarmRunResult };
    }

    let reportedCount = 0;
    // Poll until done (max 8 minutes, 4-second intervals).
    for (let i = 0; i < 120; i++) {
      await new Promise<void>((res) => setTimeout(res, 4000));
      const poll = await fetchWithRetryForGateway(
        `/api/missions/${encodeURIComponent(missionId)}/swarm-status/${encodeURIComponent(jobId)}`,
        undefined,
      );
      if (!poll.ok) {
        const hint =
          poll.status === 502 || poll.status === 503 || poll.status === 504
            ? " The API had a brief gateway error after retries — try running the swarm again, or set VITE_API_URL to your Elastic Beanstalk URL so the browser calls the API directly (avoids Vercel proxy limits)."
            : "";
        return {
          ok: false,
          status: poll.status,
          message: `Status check failed (${poll.status}).${hint}`,
        };
      }
      const s = (await poll.json()) as {
        status: string;
        data?: SwarmRunResult;
        error?: string;
        progress?: SwarmProgress;
      };
      // Emit new partial results since last poll.
      if (s.progress && options?.onProgress) {
        const newCount = s.progress.partialResults.length;
        if (newCount > reportedCount) {
          reportedCount = newCount;
          options.onProgress(s.progress);
        }
      }
      if (s.status === "done") return { ok: true, data: s.data! };
      if (s.status === "failed") return { ok: false, status: 500, message: s.error ?? "Swarm run failed." };
      // status === "running" — keep polling
    }
    return { ok: false, status: 408, message: "Swarm timed out waiting for results (8 min)." };
  } catch {
    return { ok: false, status: 0, message: "Could not reach the backend. Is it running on port 8787?" };
  }
}

/**
 * Loads wallet-scoped workspace state from the API (requires Bearer token).
 */
export async function fetchMissionWorkspaceSnapshotApi(
  missionId: string,
): Promise<{ snapshot: WorkspaceSnapshotV1; updatedAt: number } | null> {
  if (!apiConfigured() || !getAuthToken()) return null;
  try {
    const r = await apiFetch(`/api/missions/${encodeURIComponent(missionId)}/workspace-snapshot`);
    if (r.status === 404) return null;
    if (!r.ok) return null;
    const j = (await r.json()) as { snapshot?: unknown; updatedAt?: unknown };
    const updatedAt =
      typeof j.updatedAt === "number" && Number.isFinite(j.updatedAt)
        ? j.updatedAt
        : Date.now();
    const snapshot = coerceWorkspaceSnapshotFromApi(j.snapshot, updatedAt);
    return snapshot ? { snapshot, updatedAt } : null;
  } catch {
    return null;
  }
}

export async function putMissionWorkspaceSnapshotApi(
  missionId: string,
  body: WorkspaceSnapshotV1,
): Promise<number | null> {
  if (!apiConfigured() || !getAuthToken()) return null;
  try {
    const r = await apiFetch(`/api/missions/${encodeURIComponent(missionId)}/workspace-snapshot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { updatedAt?: unknown };
    return typeof j.updatedAt === "number" && Number.isFinite(j.updatedAt) ? j.updatedAt : Date.now();
  } catch {
    return null;
  }
}

export type MissionBriefResult =
  | { ok: true; brief: unknown; cached: boolean; provider?: string; model?: string }
  | { ok: false; status: number; message: string };

export async function createMissionBriefApi(
  missionId: string,
  body?: { title?: string; objective?: string; force?: boolean },
): Promise<MissionBriefResult> {
  if (!apiConfigured()) return { ok: false, status: 0, message: "API is disabled in this build." };
  try {
    const r = await apiFetch(`/api/missions/${encodeURIComponent(missionId)}/brief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const j = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      const msg = typeof j.message === "string" ? j.message : `Request failed (${r.status}).`;
      return { ok: false, status: r.status, message: msg };
    }
    return { ok: true, brief: j.brief, cached: Boolean(j.cached), provider: j.provider, model: j.model };
  } catch {
    return { ok: false, status: 0, message: "Could not reach the backend. Is it running on port 8787?" };
  }
}

export type MissionArtifact = {
  id: string;
  missionId: string;
  wallet: string;
  agent: string;
  role: string;
  kind: "file" | "note";
  path: string;
  language?: string;
  content: string;
  createdAt: number;
};

export async function fetchMissionArtifactsApi(missionId: string): Promise<MissionArtifact[] | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch(`/api/missions/${encodeURIComponent(missionId)}/artifacts`);
    if (!r.ok) return null;
    const j = (await r.json()) as { artifacts?: MissionArtifact[] };
    return Array.isArray(j.artifacts) ? j.artifacts : null;
  } catch {
    return null;
  }
}

/** Triggers a browser download of all mission artifacts as a ZIP (wallet JWT required). */
export async function downloadMissionArtifactsZip(missionId: string): Promise<{ ok: boolean; message?: string }> {
  if (!apiConfigured()) return { ok: false, message: "API is disabled in this build." };
  if (!getAuthToken()) return { ok: false, message: "Sign in with your wallet to download artifacts." };
  try {
    const r = await apiFetch(`/api/missions/${encodeURIComponent(missionId)}/artifacts.zip`);
    if (r.status === 404) return { ok: false, message: "No artifacts to download yet." };
    if (!r.ok) return { ok: false, message: `Download failed (${r.status}).` };
    const blob = await r.blob();
    const safe = missionId.replace(/[^\w.-]+/g, "_").slice(0, 64);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hivemind-${safe}-artifacts.zip`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not download — check your connection." };
  }
}

/**
 * Browser URL for embedding/opening a preview path returned by the API.
 * In dev with empty VITE_API_URL, `/preview/...` is same-origin (Vite proxies to backend).
 * In prod, prefix with VITE_API_URL.
 */
export function previewAbsoluteUrl(previewPath: string): string {
  const p = previewPath.startsWith("/") ? previewPath : `/${previewPath}`;
  const base = apiBase();
  if (!base) return p;
  return `${base.replace(/\/$/, "")}${p}`;
}

export async function startMissionPreview(missionId: string): Promise<{ ok: boolean; url?: string; message?: string }> {
  if (!apiConfigured()) return { ok: false, message: "API is disabled in this build." };
  if (!getAuthToken()) return { ok: false, message: "Sign in with your wallet to start a preview." };
  try {
    const r = await apiFetch(`/api/missions/${encodeURIComponent(missionId)}/preview/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      // Hosted preview runs npm install + vite build on the server (often 2–15+ minutes on EB).
      signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(960_000) : undefined,
    });
    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      url?: string;
      sessionId?: string;
      error?: string;
      message?: string;
    };
    if (!r.ok) {
      const detail =
        typeof j.message === "string" && j.message.trim().length > 0
          ? j.message.trim()
          : typeof j.error === "string"
            ? j.error
            : "";
      const msg =
        detail ||
        (r.status === 502 || r.status === 504
          ? "Preview timed out or failed while building (try again in a minute)."
          : `Preview failed (${r.status}).`);
      return { ok: false, message: msg };
    }
    const path = typeof j.url === "string" ? j.url : "";
    if (!path) return { ok: false, message: "Preview started but no URL returned." };
    return { ok: true, url: previewAbsoluteUrl(path) };
  } catch {
    return { ok: false, message: "Could not start preview — check your connection." };
  }
}

export type CreateMissionPayload = Omit<Mission, "id" | "createdAt">;

export type CreateMissionApiResult =
  | { ok: true; mission: Mission }
  | { ok: false; reason: "unauthorized" | "bad_request" | "network" | "skipped" };

export async function createMissionApi(body: CreateMissionPayload): Promise<CreateMissionApiResult> {
  if (!apiConfigured()) return { ok: false, reason: "skipped" };
  try {
    const r = await apiFetch("/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 401) return { ok: false, reason: "unauthorized" };
    if (r.status === 400) return { ok: false, reason: "bad_request" };
    if (!r.ok) return { ok: false, reason: "network" };
    const mission = (await r.json()) as Mission;
    return { ok: true, mission };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export type MissionSuggestResult = {
  deliverables: string[];
  metrics: { label: string; target: string }[];
};

export async function suggestMissionGoalsApi(
  objective: string,
  priority: string,
): Promise<MissionSuggestResult | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch("/api/missions/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objective, priority }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as MissionSuggestResult;
    return j;
  } catch {
    return null;
  }
}

export async function deleteMissionApi(id: string): Promise<boolean> {
  if (!apiConfigured()) return false;
  try {
    const r = await apiFetch(`/api/missions/${encodeURIComponent(id)}`, { method: "DELETE" });
    return r.ok;
  } catch {
    return false;
  }
}

export async function fetchAuthChallenge(wallet: string): Promise<{ challenge: string } | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch(`/api/auth/challenge?wallet=${encodeURIComponent(wallet)}`);
    if (!r.ok) return null;
    return (await r.json()) as { challenge: string };
  } catch {
    return null;
  }
}

export async function verifyAuth(body: {
  wallet: string;
  message: string;
  signature: string;
}): Promise<{ token: string; wallet: string } | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return (await r.json()) as { token: string; wallet: string };
  } catch {
    return null;
  }
}

// --- HiveMind domain APIs (agents, tasks, memory, payments, reputation) ---

export type AgentProfile = {
  id: string;
  name: string;
  specialization: string;
  model: string;
  reputation: number;
  missionsCompleted: number;
  trustScore: number;
  walletPubkey?: string;
};

export type HiveTask = {
  id: string;
  missionId: string;
  title: string;
  agent: string;
  status: "queued" | "active" | "done" | "failed";
  stage?: string;
  createdAt: number;
};

export type HivePayment = {
  id: string;
  missionId: string;
  amountSol: number;
  recipientPubkey: string;
  status: "pending" | "submitted" | "confirmed";
  createdAt: number;
};

export type HiveMemoryChunk = {
  id: string;
  missionId?: string;
  text: string;
  embeddingDims: number;
  score?: number;
};

export type ReputationRow = {
  agentId: string;
  name: string;
  specialization: string;
  trustScore: number;
  reputation: number;
  missionsCompleted: number;
};

export async function fetchAgentsApi(): Promise<AgentProfile[] | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch("/api/agents");
    if (!r.ok) return null;
    const j = (await r.json()) as { agents?: AgentProfile[] };
    return Array.isArray(j.agents) ? j.agents : null;
  } catch {
    return null;
  }
}

export async function fetchAgentApi(id: string): Promise<AgentProfile | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch(`/api/agents/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    return (await r.json()) as AgentProfile;
  } catch {
    return null;
  }
}

export type InvokeAgentApiResult =
  | {
      ok: true;
      reply: string;
      provider: string;
      model: string;
      /** Backend adds in NODE_ENV=development when Groq fails */
      debugLlm?: string;
      /** Mission artifact paths written when `persistArtifactUpdates` was used and JSON parsed. */
      artifactPathsApplied?: string[];
      /** Model did not return usable JSON for persist mode. */
      persistArtifactParseFailed?: boolean;
    }
  | { ok: false; reason: "unauthorized" | "network" };

export async function invokeAgentApi(
  agentId: string,
  body: {
    message: string;
    missionId?: string;
    /** Default true with missionId: send latest file bodies to the model. */
    includeArtifacts?: boolean;
    /** Model must return JSON { assistantReply, fileUpdates[] }; files are saved to the mission. */
    persistArtifactUpdates?: boolean;
    /** Override LLM model id (e.g. "gpt-4o", "llama-3.3-70b-versatile"). */
    model?: string;
  },
): Promise<InvokeAgentApiResult> {
  if (!apiConfigured()) return { ok: false, reason: "network" };
  try {
    const invokePath = `/api/agents/${encodeURIComponent(agentId)}/invoke`;
    const r = await fetchWithRetryForGateway(invokePath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, { attempts: 5, baseDelayMs: 600 });
    if (r.status === 401) return { ok: false, reason: "unauthorized" };
    if (!r.ok) return { ok: false, reason: "network" };
    const j = (await r.json()) as {
      reply?: string;
      provider?: string;
      model?: string;
      debugLlm?: string;
      debugOpenAi?: string;
      artifactPathsApplied?: string[];
      persistArtifactParseFailed?: boolean;
    };
    const debug =
      typeof j.debugLlm === "string"
        ? j.debugLlm
        : typeof j.debugOpenAi === "string"
          ? j.debugOpenAi
          : undefined;
    return {
      ok: true,
      reply: j.reply ?? "",
      provider: j.provider ?? "mock",
      model: j.model ?? "unknown",
      debugLlm: debug,
      artifactPathsApplied: Array.isArray(j.artifactPathsApplied) ? j.artifactPathsApplied : undefined,
      persistArtifactParseFailed: Boolean(j.persistArtifactParseFailed),
    };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function fetchTasksApi(missionId?: string): Promise<HiveTask[] | null> {
  if (!apiConfigured()) return null;
  try {
    const q = missionId ? `?missionId=${encodeURIComponent(missionId)}` : "";
    const r = await apiFetch(`/api/tasks${q}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { tasks?: HiveTask[] };
    return Array.isArray(j.tasks) ? j.tasks : null;
  } catch {
    return null;
  }
}

export async function fetchPaymentsApi(missionId?: string): Promise<HivePayment[] | null> {
  if (!apiConfigured()) return null;
  try {
    const q = missionId ? `?missionId=${encodeURIComponent(missionId)}` : "";
    const r = await apiFetch(`/api/payments${q}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { payments?: HivePayment[] };
    return Array.isArray(j.payments) ? j.payments : null;
  } catch {
    return null;
  }
}

export async function createPaymentIntentApi(body: {
  missionId: string;
  amountSol: number;
  recipientPubkey: string;
}): Promise<{ payment: HivePayment } | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch("/api/payments/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return (await r.json()) as { payment: HivePayment };
  } catch {
    return null;
  }
}

export async function fetchMemoryChunksApi(): Promise<HiveMemoryChunk[] | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch("/api/memory/chunks");
    if (!r.ok) return null;
    const j = (await r.json()) as { chunks?: HiveMemoryChunk[] };
    return Array.isArray(j.chunks) ? j.chunks : null;
  } catch {
    return null;
  }
}

export async function memoryQueryApi(body: {
  query: string;
  topK?: number;
  missionId?: string;
}): Promise<
  | {
      query: string;
      matches: { id: string; missionId?: string; text: string; relevance: number }[];
      note?: string;
    }
  | null
> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch("/api/memory/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return (await r.json()) as {
      query: string;
      matches: { id: string; missionId?: string; text: string; relevance: number }[];
      note?: string;
    };
  } catch {
    return null;
  }
}

export async function fetchReputationLeaderboardApi(): Promise<ReputationRow[] | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch("/api/reputation");
    if (!r.ok) return null;
    const j = (await r.json()) as { leaderboard?: ReputationRow[] };
    return Array.isArray(j.leaderboard) ? j.leaderboard : null;
  } catch {
    return null;
  }
}

// ─── Free Trial / HIVE Token API ─────────────────────────────────────────────

export type TrialStatus = {
  wallet: string;
  registered: boolean;
  userTrialAddress?: string;
  usesRemaining: number;
  usesTotal?: number;
  dailyClaimsTotal?: number;
  canClaimDaily: boolean;
  nextClaimAt: number | null;
  tokenMint?: string;
  message?: string;
};

export type TrialConfig = {
  programId: string;
  cluster: string;
  pdas: { hivemindConfig: string; freeTrialConfig: string; tokenMint: string };
  freeUsesTotal: number;
  dailyTokens: string;
};

export async function fetchTrialStatus(wallet: string): Promise<TrialStatus | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch(`/api/trial/status?wallet=${encodeURIComponent(wallet)}`);
    if (!r.ok) return null;
    return (await r.json()) as TrialStatus;
  } catch {
    return null;
  }
}

export async function fetchTrialConfig(): Promise<TrialConfig | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch("/api/trial/config");
    if (!r.ok) return null;
    return (await r.json()) as TrialConfig;
  } catch {
    return null;
  }
}

export async function confirmTrialRegister(wallet: string): Promise<{ ok: boolean } | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch("/api/trial/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    return r.ok ? { ok: true } : null;
  } catch {
    return null;
  }
}

export async function postTrialUse(wallet: string): Promise<{ ok: boolean; usesRemaining?: number } | null> {
  if (!apiConfigured()) return null;
  try {
    const r = await apiFetch("/api/trial/use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    return r.ok ? ((await r.json()) as { ok: boolean; usesRemaining?: number }) : null;
  } catch {
    return null;
  }
}
