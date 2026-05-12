import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
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
  /** Count of follow-up chat messages the user has sent AFTER the mission completed.
   *  First FOLLOWUP_FREE_QUOTA are free; each one after that requires a paid top-up
   *  (FOLLOWUP_PAID_SOL per message) since the original escrow has already settled. */
  followUpCount?: number;
};

export const FOLLOWUP_FREE_QUOTA = 5;
export const FOLLOWUP_PAID_SOL = 0.05;

/** Per-wallet localStorage key — missions from different wallets must not co-mingle.
 *  Use a placeholder when no wallet is connected so we never write into a "global" bucket. */
const LEGACY_KEY = "hm-missions";
const LEGACY_ACTIVE_MISSION_KEY = "hm-active-mission-id";
function missionsKey(walletPk: string | null): string {
  return walletPk ? `hm-missions:${walletPk}` : "hm-missions:guest";
}

/** Per-wallet key for the currently-active mission id. Used by the topnav switcher and
 *  the agent workspace to remember which mission the user was last looking at. Scoped
 *  per-wallet so switching wallets does NOT leak the old wallet's mission pointer into
 *  the new wallet's session (which produced "I switched wallets but still see the old
 *  mission" bug reports). */
export function activeMissionKey(walletPk: string | null): string {
  return walletPk ? `hm-active-mission-id:${walletPk}` : "hm-active-mission-id:guest";
}

/** Read the active mission id for the connected wallet. */
export function getActiveMissionId(walletPk: string | null): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(activeMissionKey(walletPk));
}

/** Persist the active mission id for the connected wallet + broadcast a custom event so
 *  topnav/sidebar/dashboard all re-sync without needing a full reload. */
export function setActiveMissionIdForWallet(walletPk: string | null, missionId: string | null) {
  if (typeof window === "undefined") return;
  const key = activeMissionKey(walletPk);
  if (missionId) localStorage.setItem(key, missionId);
  else localStorage.removeItem(key);
  window.dispatchEvent(new CustomEvent("hm-active-mission-changed", { detail: { id: missionId } }));
}

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

function read(walletPk: string | null): Mission[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(missionsKey(walletPk));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function write(walletPk: string | null, list: Mission[]) {
  localStorage.setItem(missionsKey(walletPk), JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("hm-missions-updated"));
}

/** One-time cleanup: nuke the pre-fix global keys (`hm-missions`, `hm-active-mission-id`)
 *  so they can't leak across wallets. Per-wallet variants replace them. Also wipes any
 *  legacy un-scoped workspace snapshots so chat history can't carry across wallets. */
function purgeLegacyMissionsKey() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(LEGACY_ACTIVE_MISSION_KEY); } catch { /* ignore */ }
  try {
    // Imported lazily to avoid circular deps in the module graph.
    void import("../lib/workspace-persistence").then((m) => m.purgeLegacyWorkspaceSnapshots());
  } catch { /* ignore */ }
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
  const { connected, publicKey } = useWallet();
  const walletPk = publicKey?.toBase58() ?? null;

  const [missions, setMissions] = useState<Mission[]>([]);

  // One-time: drop the legacy global "hm-missions" key (pre per-wallet scoping) so it can't
  // leak across wallets on this device.
  useEffect(() => { purgeLegacyMissionsKey(); }, []);

  // Clear missions immediately when wallet disconnects; reload when it connects.
  // read() is now scoped by walletPk so different wallets can't see each other's cache.
  useEffect(() => {
    if (!connected || !walletPk) {
      setMissions([]);
    } else {
      setMissions(read(walletPk));
    }
  }, [connected, walletPk]);

  useEffect(() => {
    if (!connected || !walletPk) return;
    const sync = () => setMissions(read(walletPk));
    window.addEventListener("hm-missions-updated", sync);
    window.addEventListener("storage", sync);
    // The WalletAccountWatcher in WalletProviders broadcasts this when the user
    // switches accounts INSIDE the wallet extension (Phantom/Solflare). We listen so
    // the mission list refreshes immediately without waiting for the next render.
    window.addEventListener("hm-wallet-changed", sync);
    return () => {
      window.removeEventListener("hm-missions-updated", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("hm-wallet-changed", sync);
    };
  }, [connected, walletPk]);

  useEffect(() => {
    if (!connected || !walletPk) return;
    let cancelled = false;
    const seedIds = new Set(seed.map((s) => s.id));
    const pull = async () => {
      const remote = await fetchMissionsApi();
      if (cancelled || remote === null) return;
      const local = read(walletPk);
      if (remote.length === 0) {
        // Server has no missions for this wallet — keep only user-created local missions
        // that haven't been seeded as demos.
        write(walletPk, local.filter((m) => !seedIds.has(m.id)));
      } else {
        write(walletPk, mergeRemoteWithLocal(remote, local));
      }
      window.dispatchEvent(new CustomEvent("hm-missions-updated"));
    };
    void pull();
    const onSession = () => void pull();
    window.addEventListener("hm-session-changed", onSession);
    return () => {
      cancelled = true;
      window.removeEventListener("hm-session-changed", onSession);
    };
  }, [connected, walletPk]);

  const create = useCallback(
    async (m: CreateMissionPayload) => {
      const list = read(walletPk);
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
      write(walletPk, updated);
      return next;
    },
    [walletPk],
  );

  const remove = useCallback(async (id: string) => {
    void deleteMissionApi(id);
    write(walletPk, read(walletPk).filter((m) => m.id !== id));
  }, [walletPk]);

  const reset = useCallback(() => {
    localStorage.removeItem(missionsKey(walletPk));
    write(walletPk, seed);
  }, [walletPk]);

  const clear = useCallback(() => {
    write(walletPk, []);
  }, [walletPk]);

  const patchLocal = useCallback((id: string, patch: Partial<Mission>) => {
    const list = read(walletPk).map((x) => (x.id === id ? { ...x, ...patch } : x));
    write(walletPk, list);
  }, [walletPk]);

  return { missions, create, remove, reset, clear, patchLocal, walletConnected: connected };
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
