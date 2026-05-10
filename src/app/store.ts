import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { apiConfigured, createMissionApi, deleteMissionApi, fetchMissionsApi } from "../lib/api";
import type { CreateMissionPayload } from "../lib/api";

export type MissionSuccessMetric = { label: string; target: string };

export type MissionBudgetAllocation = {
  agentCompute: number;
  tokenUsage: number;
  escrowReserve: number;
  settlementBuffer: number;
};

export type MissionConfig = {
  priorityKey: string;
  deliverables: string[];
  successMetrics: MissionSuccessMetric[];
  deadlineIso: string | null;
  delegationPct: number;
  executionSpeedPct: number;
  collaborationPct: number;
  autoApproveSubtasks: boolean;
  sharedCrossAgentMemory: boolean;
  autoOnChainSettlement: boolean;
  budgetAllocation: MissionBudgetAllocation;
  brief?: unknown;
  briefUpdatedAt?: number;
  agentModels?: Record<string, string>;
};

export type Mission = {
  id: string;
  title: string;
  objective: string;
  priority: string;
  status: "active" | "queued" | "completed" | "paused";
  agents: string[];
  budget: number;
  cost: number;
  progress: number;
  createdAt: number;
  eta: string;
  confidence: number;
  config?: MissionConfig;
};

const KEY = "hm-missions";

const seed: Mission[] = [
  {
    id: "M-247",
    title: "Launch Solana AI Marketing Campaign",
    objective:
      "Autonomous workforce coordinating brand strategy, content production, and on-chain promotion across X, Farcaster, and Solana ecosystem partners.",
    priority: "high",
    status: "active",
    agents: ["Strategy", "Research", "Design", "Development", "Treasury", "Analytics", "Coordination"],
    budget: 48,
    cost: 29.76,
    progress: 68,
    createdAt: Date.now() - 1000 * 60 * 60 * 4,
    eta: "02h 14m",
    confidence: 92,
  },
];

function read(): Mission[] {
  if (typeof window === "undefined") return seed;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw);
  } catch {
    return seed;
  }
}

function write(list: Mission[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("hm-missions-updated"));
}

/** Union server + local-only missions (same id → prefer server row). */
function mergeRemoteWithLocal(remote: Mission[], local: Mission[]): Mission[] {
  const byId = new Map<string, Mission>();
  for (const m of remote) byId.set(m.id, m);
  for (const m of local) {
    if (!byId.has(m.id)) byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function useMissions() {
  const [missions, setMissions] = useState<Mission[]>(() => read());

  useEffect(() => {
    const sync = () => setMissions(read());
    window.addEventListener("hm-missions-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hm-missions-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const remote = await fetchMissionsApi();
      if (cancelled || remote === null) return;
      const merged = mergeRemoteWithLocal(remote, read());
      write(merged);
      window.dispatchEvent(new CustomEvent("hm-missions-updated"));
    };
    void pull();
    const onSession = () => void pull();
    window.addEventListener("hm-session-changed", onSession);
    return () => {
      cancelled = true;
      window.removeEventListener("hm-session-changed", onSession);
    };
  }, []);

  const create = useCallback(
    async (m: CreateMissionPayload) => {
      const list = read();
      const localId = `M-${Math.floor(248 + Math.random() * 750)}`;
      const payload: CreateMissionPayload = {
        ...m,
        status: m.status ?? "active",
        progress: m.progress ?? 0,
      };
      const res = await createMissionApi(payload);

      let next: Mission;
      if (res.ok) {
        next = res.mission;
      } else {
        next = {
          ...payload,
          id: localId,
          createdAt: Date.now(),
        };
        if (apiConfigured() && res.reason === "unauthorized") {
          toast.warning("Mission saved locally only", {
            description:
              "The API rejected the save (not signed in). Open your wallet → finish API session, then launch again—or keep working offline; local missions stay until you sync.",
          });
        } else if (apiConfigured() && res.reason !== "skipped") {
          toast.error("Could not sync mission", {
            description: "Saved on this device. Check network or try again after signing in.",
          });
        }
      }

      const updated = [next, ...list.filter((x) => x.id !== next.id)];
      write(updated);
      return next;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    void deleteMissionApi(id);
    write(read().filter((m) => m.id !== id));
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    write(seed);
  }, []);

  const clear = useCallback(() => {
    write([]);
  }, []);

  const patchLocal = useCallback((id: string, patch: Partial<Mission>) => {
    const list = read().map((x) => (x.id === id ? { ...x, ...patch } : x));
    write(list);
  }, []);

  return { missions, create, remove, reset, clear, patchLocal };
}

export const ALL_AGENTS = [
  { name: "Strategy",     model: "Claude 4.7", spec: "Planning · KPIs",        color: "#22d3ee" },
  { name: "Research",     model: "GPT-5",       spec: "Discovery · Signals",   color: "#a855f7" },
  { name: "Design",       model: "Llama 4",     spec: "Visual · Brand",        color: "#3b82f6" },
  { name: "Development",  model: "DeepSeek",    spec: "Code · Build",          color: "#0ea5e9" },
  { name: "Marketing",    model: "GPT-5",       spec: "Distribution · Reach",  color: "#ec4899" },
  { name: "Treasury",     model: "DeepSeek",    spec: "Escrow · Payouts",      color: "#10b981" },
  { name: "Analytics",    model: "Qwen 3",      spec: "Metrics · Insight",     color: "#8b5cf6" },
  { name: "Coordination", model: "Claude 4.7",  spec: "Routing · Sync",        color: "#06b6d4" },
  { name: "Memory",       model: "Qwen 3",      spec: "Recall · Vectors",      color: "#f59e0b" },
];
