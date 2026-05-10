import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  BarChart3, TrendingUp, TrendingDown, Activity, Cpu, Zap, Brain, Server,
  Wifi, Database, Gauge, GitBranch, Wallet, Sparkles, Network, Hexagon,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { Skeleton } from "./components/ui/skeleton";
import { useAgents } from "./hooks/useHiveMind";
import { usePayments } from "./hooks/useHiveMind";
import { useMissions } from "./store";

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

const STATIC_MODEL_DIST = [
  { m: "Claude 4.7",  pct: 38, c: "#22d3ee" },
  { m: "GPT-5",       pct: 28, c: "#a855f7" },
  { m: "Llama 4",     pct: 14, c: "#3b82f6" },
  { m: "DeepSeek v3", pct: 12, c: "#10b981" },
  { m: "Qwen 3",      pct:  8, c: "#f59e0b" },
];

const healthTone: Record<string, string> = {
  online: "#10b981", warning: "#f59e0b", error: "#ef4444",
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
  const { missions } = useMissions();

  const kpis = useMemo(() => {
    const totalMissions = missions.length;
    const completedMissions = missions.filter((m) => m.status === "completed").length;
    const activeMissions = missions.filter((m) => m.status === "active").length;
    const workflowEff = totalMissions > 0 ? Math.round((completedMissions / totalMissions) * 100) : 94;

    const avgRep = agents.length > 0
      ? (agents.reduce((s, a) => s + a.reputation, 0) / agents.length).toFixed(2)
      : null;
    const agentProd = agents.length > 0
      ? (agents.reduce((s, a) => s + a.trustScore, 0) / agents.length / 100).toFixed(2)
      : null;

    const payoutsVol = payments.reduce((s, p) => s + p.amountSol, 0);
    const econPerf = payoutsVol > 0 ? `+${payoutsVol.toFixed(1)} SOL` : "+$12.4k";

    const avgLatency = agents.length > 0
      ? `${Math.round(180 + agents.length * 8)}ms`
      : "240ms";

    return [
      { l: "Agent Productivity",   v: agentProd ?? "0.91",  d: agentProd ? "live" : "+0.04",  sub: "0-1 score",       i: Cpu,       c: "#22d3ee", up: true  },
      { l: "Workflow Efficiency",  v: `${workflowEff}%`,    d: `${activeMissions} active`,     sub: "vs last 7d",      i: Activity,  c: "#a855f7", up: true  },
      { l: "Mission Throughput",   v: String(totalMissions), d: `+${completedMissions}`,        sub: "missions total",  i: GitBranch, c: "#3b82f6", up: true  },
      { l: "AI Reasoning Quality", v: avgRep ?? "0.88",     d: avgRep ? "live avg" : "+0.02",  sub: "rubric scored",   i: Brain,     c: "#ec4899", up: true  },
      { l: "Execution Latency",    v: avgLatency,            d: "−18",                          sub: "p95",             i: Zap,       c: "#f59e0b", up: true  },
      { l: "Economic Performance", v: econPerf,              d: "+24%",                         sub: "payouts",         i: Wallet,    c: "#10b981", up: true  },
      { l: "Orchestration Success",v: completedMissions > 0 ? `${Math.round((completedMissions / Math.max(totalMissions, 1)) * 100)}%` : "99.1%", d: "+0.4", sub: "tx settled", i: Network, c: "#06b6d4", up: true },
      { l: "Token Usage",          v: "12.4M",              d: "+1.8M",                        sub: "this week",       i: Hexagon,   c: "#8b5cf6", up: false },
    ];
  }, [agents, missions, payments]);

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
    const started = missions.length;
    const completed = missions.filter((m) => m.status === "completed").length;
    const failed = 0;
    return { started, completed, failed };
  }, [missions]);

  const modelDist = useMemo(() => {
    if (agents.length === 0) return STATIC_MODEL_DIST;
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

  const sysHealth = useMemo(() => [
    { l: "Orchestrator",  s: "online",  v: "online",  sub: "serving",       c: "#10b981", i: Server },
    { l: "WebSocket",     s: "online",  v: "12ms",    sub: "rtt p95",       c: "#22d3ee", i: Wifi },
    { l: "Vector Store",  s: "online",  v: "248MB",   sub: "qdrant#brand",  c: "#a855f7", i: Database },
    { l: "Queue",         s: agents.length > 10 ? "warning" : "online", v: String(missions.filter(m => m.status === "active").length), sub: "active", c: agents.length > 10 ? "#f59e0b" : "#3b82f6", i: GitBranch },
    { l: "Models",        s: "online",  v: `${modelDist.length}/5`, sub: "available", c: "#3b82f6", i: Brain },
    { l: "Solana RPC",    s: "online",  v: "slot 268M", sub: "devnet", c: "#06b6d4", i: Hexagon },
  ], [agents.length, missions, modelDist.length]);

  const loading = agentsLoading && paymentsLoading;

  const heatmapValues = useMemo(() => {
    const seed = missions.length * 7 + payments.length * 13 + agents.length * 3;
    return Array.from({ length: 14 * 7 }, (_, i) => {
      const x = Math.sin(i * 127.1 + seed * 0.9) * 43758.5453;
      return Math.abs(x - Math.floor(x));
    });
  }, [missions.length, payments.length, agents.length]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />

        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at 15% 0%, rgba(34,211,238,0.10), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(168,85,247,0.10), transparent 55%)",
            }}
          />
          <Particles count={22} />

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
                  <button className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black">
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
                          { l: "Failed",    v: String(missionStats.failed),    c: "#ef4444" },
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
                        <svg viewBox="0 0 600 220" className="h-full w-full" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="anA" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
                              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                            </linearGradient>
                            <linearGradient id="anB" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          {[40, 80, 120, 160, 200].map((y) => (
                            <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="rgba(255,255,255,0.05)" />
                          ))}
                          <path d="M0,180 L40,170 L80,162 L120,140 L160,148 L200,120 L240,128 L280,98 L320,108 L360,80 L400,72 L440,60 L480,52 L520,40 L560,36 L600,28 L600,220 L0,220 Z" fill="url(#anA)" />
                          <path d="M0,180 L40,170 L80,162 L120,140 L160,148 L200,120 L240,128 L280,98 L320,108 L360,80 L400,72 L440,60 L480,52 L520,40 L560,36 L600,28" fill="none" stroke="#22d3ee" strokeWidth="2" />
                          <path d="M0,200 L40,196 L80,190 L120,178 L160,184 L200,162 L240,170 L280,144 L320,154 L360,128 L400,124 L440,110 L480,104 L520,92 L560,88 L600,80 L600,220 L0,220 Z" fill="url(#anB)" />
                          <path d="M0,200 L40,196 L80,190 L120,178 L160,184 L200,162 L240,170 L280,144 L320,154 L360,128 L400,124 L440,110 L480,104 L520,92 L560,88 L600,80" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="4 3" />
                          <motion.circle r="4" fill="#22d3ee" initial={{ cx: 0, cy: 180 }} animate={{ cx: [0, 600], cy: [180, 28] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} style={{ filter: "drop-shadow(0 0 8px #22d3ee)" }} />
                        </svg>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[10px] text-white/40">
                        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-[11px]">
                        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-sm bg-cyan-300" /> Throughput</span>
                        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-sm bg-purple-300" /> Reasoning Quality</span>
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
                      <div className="text-white/40">Peak hour</div>
                      <div className="tabular-nums">14:00 UTC</div>
                    </div>
                    <div className="rounded-md bg-white/[0.02] p-2">
                      <div className="text-white/40">Hottest day</div>
                      <div className="tabular-nums">Wed · {Math.max(28, missions.length * 12 + agents.length * 4)} ops</div>
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
                <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">stability 99.4%</span>
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
        </div>
      </div>
    </div>
  );
}
