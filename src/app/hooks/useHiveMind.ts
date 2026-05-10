import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiBase,
  apiConfigured,
  fetchAgentsApi,
  fetchAgentApi,
  fetchTasksApi,
  fetchMissionLiveMetricsApi,
  fetchPaymentsApi,
  fetchMemoryChunksApi,
  fetchReputationLeaderboardApi,
  type AgentProfile,
  type HiveTask,
  type HivePayment,
  type HiveMemoryChunk,
  type ReputationRow,
  type MissionLiveMetrics,
} from "../../lib/api";

function wsUrl(): string | null {
  if (!apiConfigured()) return null;
  const base = apiBase();
  if (!base) {
    const p = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${p}//${window.location.host}/ws`;
  }
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/ws`;
}

export type AgentActivityEvt = { agent: string; message: string; ts: number };

export type HiveMindRealtimeEvent =
  | { type: "agent.activity"; payload: AgentActivityEvt }
  | { type: "task.created"; payload: HiveTask }
  | { type: "task.updated"; payload: HiveTask }
  | { type: "mission.updated"; payload: unknown };

export function useAgents(pollMs = 30000) {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const rows = await fetchAgentsApi();
    if (rows) setAgents(rows);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    if (!apiConfigured()) return;
    const id = window.setInterval(load, pollMs);
    return () => window.clearInterval(id);
  }, [load, pollMs]);
  return { agents, loading, reload: load };
}

export function useAgentDetail(id: string | undefined) {
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const a = await fetchAgentApi(id);
      if (!cancelled && a) setAgent(a);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);
  return agent;
}

export function useTasks(missionId: string | null | undefined, pollMs = 12000) {
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!missionId) { setTasks([]); setLoading(false); return; }
    const rows = await fetchTasksApi(missionId);
    if (rows) setTasks(rows);
    setLoading(false);
  }, [missionId]);
  useEffect(() => {
    void load();
    if (!apiConfigured() || !missionId) { setLoading(false); return; }
    const id = window.setInterval(load, pollMs);
    return () => window.clearInterval(id);
  }, [load, missionId, pollMs]);
  return { tasks, loading, reload: load };
}

export function useMissionLiveMetrics(missionId: string | null | undefined, pollMs = 12000) {
  const [metrics, setMetrics] = useState<MissionLiveMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!missionId || !apiConfigured()) {
      setMetrics(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const row = await fetchMissionLiveMetricsApi(missionId);
      setMetrics(row);
    } finally {
      setLoading(false);
    }
  }, [missionId]);
  useEffect(() => {
    void load();
    if (!apiConfigured() || !missionId) return;
    const id = window.setInterval(load, pollMs);
    return () => window.clearInterval(id);
  }, [load, missionId, pollMs]);
  return { metrics, loading, reload: load };
}

export function usePayments(missionId?: string | null, pollMs = 15000) {
  const [payments, setPayments] = useState<HivePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const rows = await fetchPaymentsApi(missionId ?? undefined);
    if (rows) setPayments(rows);
    setLoading(false);
  }, [missionId]);
  useEffect(() => {
    void load();
    if (!apiConfigured()) { setLoading(false); return; }
    const id = window.setInterval(load, pollMs);
    return () => window.clearInterval(id);
  }, [load, pollMs]);
  return { payments, loading, reload: load };
}

export function useMemoryChunks(pollMs = 20000) {
  const [chunks, setChunks] = useState<HiveMemoryChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const rows = await fetchMemoryChunksApi();
    if (rows) setChunks(rows);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    if (!apiConfigured()) { setLoading(false); return; }
    const id = window.setInterval(load, pollMs);
    return () => window.clearInterval(id);
  }, [load, pollMs]);
  return { chunks, loading, reload: load };
}

export function useReputationLeaderboard(pollMs = 60000) {
  const [leaderboard, setLeaderboard] = useState<ReputationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const rows = await fetchReputationLeaderboardApi();
    if (rows) setLeaderboard(rows);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    if (!apiConfigured()) { setLoading(false); return; }
    const id = window.setInterval(load, pollMs);
    return () => window.clearInterval(id);
  }, [load, pollMs]);
  return { leaderboard, loading, reload: load };
}

/** Subscribe to backend realtime agent.activity events on the global channel. */
export function useHiveMindActivity(onEvt: (e: AgentActivityEvt) => void) {
  const cb = useRef(onEvt);
  cb.current = onEvt;
  useEffect(() => {
    const url = wsUrl();
    if (!url) return;
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type?: string;
          payload?: AgentActivityEvt;
        };
        if (msg.type === "agent.activity" && msg.payload) cb.current(msg.payload);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({ action: "subscribe", channel: "global" }));
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, []);
}

export function useHiveMindRealtime(opts: {
  channels: string[];
  onEvent: (e: HiveMindRealtimeEvent) => void;
}) {
  const cb = useRef(opts.onEvent);
  cb.current = opts.onEvent;
  const chans = opts.channels.join("|");
  useEffect(() => {
    const url = wsUrl();
    if (!url) return;
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as HiveMindRealtimeEvent;
        if (msg && typeof msg === "object" && "type" in msg && "payload" in msg) {
          cb.current(msg);
        }
      } catch {
        /* ignore malformed */
      }
    };
    ws.onopen = () => {
      try {
        for (const channel of opts.channels) {
          ws.send(JSON.stringify({ action: "subscribe", channel }));
        }
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chans]);
}
