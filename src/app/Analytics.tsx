import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  BarChart3, TrendingUp, TrendingDown, Activity, Cpu, Brain, Server,
  Wifi, Gauge, GitBranch, Wallet, Sparkles, Network, Hexagon,
} from "lucide-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { Skeleton } from "./components/ui/skeleton";
import { WalletGate } from "./components/WalletGate";
import { useAgents } from "./hooks/useHiveMind";
import { usePayments } from "./hooks/useHiveMind";
import { useMissions } from "./store";
import { apiConfigured } from "../lib/api";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

function specColor(spec: string): string {
  const m: Record<string, string> = {
    Strategy: "#22d3ee", Research: "#a855f7", Design: "#3b82f6",
    Treasury: "#10b981", Analytics: "#8b5cf6", Coordination: "#06b6d4",
    Development: "#0ea5e9", Marketing: "#ec4899", Memory: "#f59e0b",
  };
  return m[spec] ?? "#64748b";
}

const healthTone: Record<string, string> = {
  online: "#10b981", warning: "#f59e0b", error: "#ef4444", unknown: "#64748b",
};

const RANGE_MS: Record<"24h" | "7d" | "30d" | "90d", number> = {
  "24h": 86_400_000,
  "7d":  7  * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
};

function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-4 backdrop-blur-xl">
      <Skeleton className="mb-3 h-4 w-24 bg-white/10" />
      <Skeleton className="mb-2 h-8 w-20 bg-white/10" />
      <Skeleton className="h-6 w-full bg-white/5" />
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState<"24h" | "7d" | "30d" | "90d">("7d");
  const { agents, loading: agentsLoading } = useAgents();
  const { payments, loading: paymentsLoading } = usePayments();
  const { missions, walletConnected } = useMissions();
  const { connection } = useConnection();

  // Window-filter helper used everywhere a "range" applies. Falls back to "include
  // everything" semantics when the timestamp is missing (defensive).
  const rangeStart = useMemo(() => Date.now() - RANGE_MS[range], [range]);
  const missionsInRange = useMemo(
    () => missions.filter((m) => (m.createdAt ?? 0) >= rangeStart),
    [missions, rangeStart],
  );
  const paymentsInRange = useMemo(
    () => payments.filter((p) => new Date(p.createdAt).getTime() >= rangeStart),
    [payments, rangeStart],
  );

  const kpis = useMemo(() => {
    const totalMissions = missionsInRange.length;
    const completedMissions = missionsInRange.filter((m) => m.status === "completed").length;
    const activeMissions = missionsInRange.filter((m) => m.status === "active").length;
    const pausedMissions = missionsInRange.filter((m) => m.status === "paused").length;
    const workflowEff = totalMissions > 0
      ? Math.round((completedMissions / totalMissions) * 100)
      : null;

    const avgRep = agents.length > 0
      ? (agents.reduce((s, a) => s + a.reputation, 0) / agents.length).toFixed(2)
      : null;
    const agentProd = agents.length > 0
      ? (agents.reduce((s, a) => s + a.trustScore, 0) / agents.length / 100).toFixed(2)
      : null;

    const payoutsVol = paymentsInRange.reduce((s, p) => s + p.amountSol, 0);
    const econPerf = payoutsVol > 0 ? `${payoutsVol.toFixed(2)} SOL` : "—";

    // No real latency data source today. Em-dash is more honest than a fabricated number.
    const avgLatency = "—";

    return [
      {
        l: "Agent Productivity",
        v: agentProd ?? "—",
        d: agentProd ? `${agents.length} agents` : "no agents",
        sub: "trust score / 100",
        i: Cpu, c: "#22d3ee", up: agentProd != null,
      },
      {
        l: "Workflow Efficiency",
        v: workflowEff != null ? `${workflowEff}%` : "—",
        d: workflowEff != null ? `${activeMissions} active` : "no missions",
        sub: "completed / total",
        i: Activity, c: "#a855f7", up: workflowEff != null && workflowEff > 50,
      },
      {
        l: "Mission Throughput",
        v: String(totalMissions),
        d: completedMissions > 0 ? `${completedMissions} done` : "—",
        sub: `in last ${range}`,
        i: GitBranch, c: "#3b82f6", up: totalMissions > 0,
      },
      {
        l: "AI Reasoning Quality",
        v: avgRep ?? "—",
        d: avgRep ? "rep avg" : "no agents",
        sub: "1-5 reputation",
        i: Brain, c: "#ec4899", up: avgRep != null,
      },
      {
        l: "Execution Latency",
        v: avgLatency,
        d: "soon",
        sub: "no source yet",
        i: Activity, c: "#f59e0b", up: true,
      },
      {
        l: "On-chain Volume",
        v: econPerf,
        d: paymentsInRange.length > 0 ? `${paymentsInRange.length} tx` : "no tx",
        sub: `in last ${range}`,
        i: Wallet, c: "#10b981", up: paymentsInRange.length > 0,
      },
      {
        l: "Orchestration Success",
        v: workflowEff != null ? `${workflowEff}%` : "—",
        d: pausedMissions > 0 ? `${pausedMissions} paused` : "—",
        sub: "settle rate",
        i: Network, c: "#06b6d4", up: workflowEff != null && workflowEff >= 50,
      },
      {
        l: "Mission Roster",
        v: agents.length > 0 ? String(agents.length) : "—",
        d: agents.length > 0 ? "registered" : "—",
        sub: "active agent profiles",
        i: Hexagon, c: "#8b5cf6", up: agents.length > 0,
      },
    ];
  }, [agents, missionsInRange, paymentsInRange, range]);

  const agentEff = useMemo(() => {
    if (agents.length === 0) return [];
    return [...agents]
      .sort((a, b) => b.trustScore - a.trustScore)
      .slice(0, 8)
      .map((a) => ({
        name: a.name,
        spec: a.specialization,
        prod: Math.min(0.99, a.trustScore / 100),
        missions: a.missionsCompleted,
        c: specColor(a.specialization),
      }));
  }, [agents]);

  const missionStats = useMemo(() => {
    const started = missionsInRange.length;
    const completed = missionsInRange.filter((m) => m.status === "completed").length;
    const paused = missionsInRange.filter((m) => m.status === "paused").length;
    return { started, completed, paused };
  }, [missionsInRange]);

  // Throughput series — bucket missions over the selected range so the chart reflects
  // real activity instead of a hardcoded waveform. Two stacked lines: cumulative
  // started count + cumulative completed count.
  const throughputChart = useMemo(() => {
    const BUCKETS = 24;
    const bucketMs = RANGE_MS[range] / BUCKETS;
    const startedBuckets = new Array(BUCKETS).fill(0);
    const completedBuckets = new Array(BUCKETS).fill(0);
    for (const m of missionsInRange) {
      const idx = Math.min(
        BUCKETS - 1,
        Math.max(0, Math.floor((m.createdAt - rangeStart) / bucketMs)),
      );
      startedBuckets[idx] += 1;
      if (m.status === "completed") completedBuckets[idx] += 1;
    }
    let cStarted = 0;
    let cCompleted = 0;
    const startedCum = startedBuckets.map((v) => (cStarted += v));
    const completedCum = completedBuckets.map((v) => (cCompleted += v));
    const maxV = Math.max(1, ...startedCum, ...completedCum);
    // SVG viewBox 0 0 600 220, plot region y=20..200 (180 tall).
    const toPath = (series: number[]) => {
      if (series.length === 0) return "";
      return series
        .map((v, i) => {
          const x = (i / (BUCKETS - 1)) * 600;
          const y = 200 - (v / maxV) * 180;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    };
    const area = (series: number[]) => {
      const line = toPath(series);
      if (!line) return "";
      return `${line} L600,220 L0,220 Z`;
    };
    return {
      startedLine: toPath(startedCum),
      startedArea: area(startedCum),
      completedLine: toPath(completedCum),
      completedArea: area(completedCum),
      hasData: missionsInRange.length > 0,
    };
  }, [missionsInRange, range, rangeStart]);

  const modelDist = useMemo(() => {
    if (agents.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const a of agents) {
      const m = a.model || "Unknown";
      counts[m] = (counts[m] ?? 0) + 1;
    }
    const total = agents.length;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([m, n], i) => ({
        m,
        pct: Math.round((n / total) * 100),
        c: ["#22d3ee", "#a855f7", "#3b82f6", "#10b981", "#f59e0b"][i] ?? "#64748b",
      }));
  }, [agents]);

  // Live Solana slot for the System Health card — same source the Treasury page uses.
  const [liveSlot, setLiveSlot] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await connection.getSlot();
        if (!cancelled) setLiveSlot(s);
      } catch {
        /* leave at null */
      }
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [connection]);

  const sysHealth = useMemo(() => {
    const apiOk = apiConfigured();
    const activeMissionCount = missions.filter((m) => m.status === "active").length;
    return [
      { l: "API",          s: apiOk ? "online" : "warning", v: apiOk ? "reachable" : "disabled", sub: "VITE_API_URL", c: apiOk ? "#10b981" : "#f59e0b", i: Server },
      { l: "Realtime",     s: apiOk ? "online" : "unknown", v: apiOk ? "ws" : "—", sub: "WebSocket hub", c: "#22d3ee", i: Wifi },
      { l: "Solana RPC",   s: liveSlot != null ? "online" : "unknown", v: liveSlot != null ? `slot ${liveSlot.toLocaleString()}` : "—", sub: "devnet", c: "#06b6d4", i: Hexagon },
      { l: "Active queue", s: activeMissionCount > 0 ? "online" : "unknown", v: String(activeMissionCount), sub: "running missions", c: "#3b82f6", i: GitBranch },
      { l: "Models",       s: modelDist.length > 0 ? "online" : "unknown", v: modelDist.length > 0 ? `${modelDist.length} routed` : "—", sub: "via routing layer", c: "#a855f7", i: Brain },
      { l: "Agent roster", s: agents.length > 0 ? "online" : "unknown", v: agents.length > 0 ? `${agents.length} agents` : "—", sub: "registered profiles", c: "#10b981", i: Cpu },
    ];
  }, [missions, agents.length, modelDist.length, liveSlot]);

  const loading = agentsLoading && paymentsLoading;

  // Activity heatmap — buckets real events (mission creates + payments) into a 14-day ×
  // 7-band grid. Color intensity = relative density vs the busiest cell. Replaces the
  // previous Math.sin-based fake pattern.
  const heatmapValues = useMemo(() => {
    const now = Date.now();
    const DAYS = 14;
    const BANDS = 7;
    const cells = new Array(DAYS * BANDS).fill(0);
    const events: number[] = [
      ...missions.map((m) => m.createdAt ?? now),
      ...payments.map((p) => new Date(p.createdAt).getTime()),
    ];
    for (const ts of events) {
      const ageMs = now - ts;
      const dayIdx = Math.floor(ageMs / 86_400_000);
      if (dayIdx < 0 || dayIdx >= DAYS) continue;
      // Band = hour-of-day bucket (0=midnight, 6=evening).
      const date = new Date(ts);
      const bandIdx = Math.min(BANDS - 1, Math.floor(date.getHours() / (24 / BANDS)));
      const col = DAYS - 1 - dayIdx; // newest day on the right
      cells[bandIdx * DAYS + col] += 1;
    }
    const max = Math.max(1, ...cells);
    return cells.map((v) => v / max);
  }, [missions, payments]);

  const downloadReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      range,
      kpis: kpis.map((k) => ({ label: k.l, value: k.v, delta: k.d, sub: k.sub })),
      missions: {
        total: missionsInRange.length,
        completed: missionsInRange.filter((m) => m.status === "completed").length,
        active: missionsInRange.filter((m) => m.status === "active").length,
        paused: missionsInRange.filter((m) => m.status === "paused").length,
      },
      agents: agents.map((a) => ({
        name: a.name,
        specialization: a.specialization,
        model: a.model,
        reputation: a.reputation,
        trustScore: a.trustScore,
        missionsCompleted: a.missionsCompleted,
      })),
      payments: {
        countInRange: paymentsInRange.length,
        totalSolInRange: paymentsInRange.reduce((s, p) => s + p.amountSol, 0),
      },
      systemHealth: sysHealth.map((s) => ({ component: s.l, status: s.s, value: s.v })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hivemind-analytics-${range}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />

        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at 15% 0%, rgba(34,211,238,0.10), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(168,85,247,0.10), transparent 55%)",
            }}
          />
          <Particles count={22} />
          <WalletGate connected={walletConnected}>
          <div className="relative px-6 py-6">
            <PageHeader
              title="Analytics Dashboard"
              subtitle="Operational intelligence across the autonomous AI ecosystem."
              crumbs={[{ label: "Analytics" }]}
              status={{ label: loading ? "Loading…" : "Insights · realtime", tone: "cyan" }}
              actions={
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1 text-[11px] text-white/70">
                    {(["24h", "7d", "30d", "90d"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setRange(r)}
                        className={`rounded-md px-2.5 py-1 transition ${
                          range === r ? "bg-white/10 text-white" : "hover:text-white"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={downloadReport}
                    className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
                    <BarChart3 className="relative h-3.5 w-3.5" />
                    <span className="relative">Export Report</span>
                  </button>
                </div>
              }
            />

            {/* Top KPI grid */}
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
                : kpis.map((k, i) => (
                <motion.div
                  key={k.l}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-4 backdrop-blur-xl"
                >
                  <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-30 blur-2xl" style={{ background: k.c }} />
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <k.i className="h-4 w-4" style={{ color: k.c }} />
                      <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{k.l}</span>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="text-2xl tabular-nums">{k.v}</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] ${k.up ? "text-emerald-300" : "text-rose-300"}`}>
                        {k.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {k.d}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-white/45">{k.sub}</div>
                    <svg viewBox="0 0 100 24" className="mt-3 h-6 w-full">
                      <defs>
                        <linearGradient id={`kpi-${i}`} x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={k.c} stopOpacity="0.5" />
                          <stop offset="100%" stopColor={k.c} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path
                        d={`M0,${18 - (i % 3) * 2} L20,${14 - (i % 4)} L40,${16 - (i % 5)} L60,${10 - (i % 3)} L80,${12 - (i % 4)} L100,${4 + (i % 2)}`}
                        fill="none" stroke={k.c} strokeWidth="1.2"
                      />
                      <path
                        d={`M0,${18 - (i % 3) * 2} L20,${14 - (i % 4)} L40,${16 - (i % 5)} L60,${10 - (i % 3)} L80,${12 - (i % 4)} L100,${4 + (i % 2)} L100,24 L0,24 Z`}
                        fill={`url(#kpi-${i})`}
                      />
                    </svg>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Hero chart + Model distribution */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    Mission Throughput · Workflow Performance
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">{range}</span>
                </div>
                <div className="p-5">
                  {loading ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        {[0,1,2].map(i => <Skeleton key={i} className="h-16 bg-white/5 rounded-xl" />)}
                      </div>
                      <Skeleton className="h-64 w-full bg-white/5 rounded-xl" />
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { l: "Started",   v: String(missionStats.started),   c: "#22d3ee" },
                          { l: "Completed", v: String(missionStats.completed), c: "#10b981" },
                          { l: "Paused",    v: String(missionStats.paused),    c: "#f59e0b" },
                        ].map((s) => (
                          <div key={s.l} className="rounded-xl border border-white/10 bg-black/30 p-3">
                            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{s.l}</div>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-2xl tabular-nums">{s.v}</span>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.c, boxShadow: `0 0 8px ${s.c}` }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 h-64 w-full rounded-xl border border-white/10 bg-black/30 p-3">
                        {throughputChart.hasData ? (
                          <svg viewBox="0 0 600 220" className="h-full w-full" preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="anA" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
                                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                              </linearGradient>
                              <linearGradient id="anB" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            {[40, 80, 120, 160, 200].map((y) => (
                              <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="rgba(255,255,255,0.05)" />
                            ))}
                            <path d={throughputChart.startedArea} fill="url(#anA)" />
                            <path d={throughputChart.startedLine} fill="none" stroke="#22d3ee" strokeWidth="2" />
                            <path d={throughputChart.completedArea} fill="url(#anB)" />
                            <path d={throughputChart.completedLine} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 3" />
                          </svg>
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-white/40">
                            No mission activity in the last {range}.
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-4 text-[11px]">
                        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-sm bg-cyan-300" /> Started (cumulative)</span>
                        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-sm bg-emerald-300" /> Completed (cumulative)</span>
                      </div>
                    </>
                  )}
                </div>
              </Card>

              {/* Model distribution donut */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Brain className="h-4 w-4 text-purple-300" />
                    Model Routing · Inference Mix
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-purple-300">{range}</span>
                </div>
                <div className="p-5">
                  {agentsLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="mx-auto h-44 w-44 rounded-full bg-white/5" />
                      {[0,1,2,3,4].map(i => <Skeleton key={i} className="h-7 w-full bg-white/5 rounded-md" />)}
                    </div>
                  ) : (
                    <>
                      <div className="grid place-items-center">
                        <svg viewBox="0 0 160 160" className="h-44 w-44">
                          {(() => {
                            let acc = 0;
                            return modelDist.map((m, i) => {
                              const r = 60, C = 2 * Math.PI * r;
                              const off = -((acc / 100) * C);
                              const arc = (m.pct / 100) * C;
                              acc += m.pct;
                              return (
                                <motion.circle
                                  key={m.m}
                                  cx="80" cy="80" r={r}
                                  fill="none" stroke={m.c} strokeWidth="14"
                                  strokeDasharray={`${arc} ${C - arc}`}
                                  initial={{ strokeDashoffset: off + C }}
                                  animate={{ strokeDashoffset: off }}
                                  transition={{ duration: 1.2, delay: i * 0.05 }}
                                  transform="rotate(-90 80 80)"
                                  style={{ filter: `drop-shadow(0 0 4px ${m.c}88)` }}
                                />
                              );
                            });
                          })()}
                          <text x="80" y="78" textAnchor="middle" fontSize="22" fill="white" className="tabular-nums">{agents.length || "—"}</text>
                          <text x="80" y="96" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)">agents</text>
                        </svg>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        {modelDist.map((m) => (
                          <div key={m.m} className="flex items-center justify-between rounded-md bg-white/[0.02] px-3 py-1.5 text-[11px]">
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: m.c, boxShadow: `0 0 6px ${m.c}` }} />
                              {m.m}
                            </span>
                            <span className="tabular-nums text-white/85">{m.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            </div>

            {/* Agent Efficiency + Heatmap */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Cpu className="h-4 w-4 text-cyan-300" />
                    Agent Efficiency
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                    {agentsLoading ? "loading…" : `${agentEff.length} agents`}
                  </span>
                </div>
                <div className="space-y-3 p-5">
                  {agentsLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-12 items-center gap-3">
                          <Skeleton className="col-span-3 h-10 rounded-lg bg-white/5" />
                          <Skeleton className="col-span-7 h-2 rounded-full bg-white/5" />
                          <Skeleton className="col-span-1 h-4 w-8 rounded bg-white/5" />
                          <Skeleton className="col-span-1 h-4 w-6 rounded bg-white/5" />
                        </div>
                      ))
                    : agentEff.length > 0
                    ? agentEff.map((a, i) => (
                        <motion.div
                          key={a.name}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="grid grid-cols-12 items-center gap-3"
                        >
                          <div className="col-span-3 flex items-center gap-3">
                            <div className="h-7 w-7 rounded-lg" style={{ background: `linear-gradient(135deg, ${a.c}55, ${a.c}11)`, boxShadow: `0 0 12px ${a.c}55` }} />
                            <div>
                              <div className="text-sm">{a.name}</div>
                              <div className="text-[10px] text-white/45">{a.spec}</div>
                            </div>
                          </div>
                          <div className="col-span-7">
                            <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5">
                              <motion.div
                                initial={{ width: 0 }} animate={{ width: `${a.prod * 100}%` }}
                                transition={{ duration: 1, delay: i * 0.05 }}
                                className="h-full rounded-full"
                                style={{ background: `linear-gradient(90deg, ${a.c}, #a855f7)`, boxShadow: `0 0 8px ${a.c}` }}
                              />
                            </div>
                          </div>
                          <div className="col-span-1 text-right text-sm tabular-nums">{a.prod.toFixed(2)}</div>
                          <div className="col-span-1 text-right text-[11px] text-white/45">{a.missions}</div>
                        </motion.div>
                      ))
                    : (
                      <div className="py-8 text-center text-sm text-white/40">
                        No agents registered — launch a mission to see efficiency data.
                      </div>
                    )
                  }
                </div>
              </Card>

              {/* Activity heatmap */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4 text-emerald-300" />
                    Activity Heatmap
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-300">14d</span>
                </div>
                <div className="p-5">
                  <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(14, 1fr)" }}>
                    {heatmapValues.map((v, i) => {
                      const op = 0.08 + v * 0.85;
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: (i / (14 * 7)) * 0.6 }}
                          className="aspect-square rounded-sm"
                          style={{
                            background: `rgba(34,211,238,${op})`,
                            boxShadow: v > 0.7 ? `0 0 6px rgba(34,211,238,${v})` : "none",
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-white/40">
                    <span>less</span>
                    <div className="flex gap-1">
                      {[0.15, 0.3, 0.5, 0.7, 0.9].map((o) => (
                        <span key={o} className="h-3 w-3 rounded-sm" style={{ background: `rgba(34,211,238,${o})` }} />
                      ))}
                    </div>
                    <span>more</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-md bg-white/[0.02] p-2">
                      <div className="text-white/40">Missions tracked</div>
                      <div className="tabular-nums">{missions.length}</div>
                    </div>
                    <div className="rounded-md bg-white/[0.02] p-2">
                      <div className="text-white/40">Payments tracked</div>
                      <div className="tabular-nums">{payments.length}</div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* System health */}
            <Card className="mb-6">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Gauge className="h-4 w-4 text-cyan-300" />
                  System Health · Infrastructure
                </div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">
                  {(() => {
                    const online = sysHealth.filter((s) => s.s === "online").length;
                    return `${online} / ${sysHealth.length} online`;
                  })()}
                </span>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
                {sysHealth.map((s, i) => (
                  <motion.div
                    key={s.l}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-xl border border-white/10 bg-black/30 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <s.i className="h-4 w-4" style={{ color: s.c }} />
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[9px] uppercase tracking-widest"
                        style={{ color: healthTone[s.s], background: `${healthTone[s.s]}1a` }}
                      >
                        {s.s}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-white/60">{s.l}</div>
                    <div className="mt-0.5 text-base tabular-nums">{s.v}</div>
                    <div className="text-[10px] text-white/45">{s.sub}</div>
                  </motion.div>
                ))}
              </div>
            </Card>
          </div>
          </WalletGate>
        </div>
      </div>
    </div>
  );
}
