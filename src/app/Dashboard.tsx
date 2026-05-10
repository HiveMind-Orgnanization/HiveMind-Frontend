import { motion, AnimatePresence } from "motion/react";
import { Link, useNavigate } from "react-router";
import {
  Rocket, Cpu, Activity, Clock, CheckCircle2, Circle, Loader2,
  Plus, Trash2, RotateCcw, Play, Pause, AlertTriangle,
  TrendingUp, Wallet, Brain, Database,
  Gauge, Zap, Sparkles, Inbox,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { CoordGraph } from "./components/dashboard/coord-graph";
import { Particles } from "./components/particles";
import { TrialBanner } from "./components/TrialBanner";
import { useMissions } from "./store";
import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { apiConfigured, swarmRunMissionApi } from "../lib/api";
import { useAgents, useTasks, useHiveMindActivity, useMissionLiveMetrics } from "./hooks/useHiveMind";

const AGENT_UI_COLORS: Record<string, string> = {
  Strategy: "#22d3ee",
  Research: "#a855f7",
  Design: "#3b82f6",
  Treasury: "#10b981",
  Analytics: "#8b5cf6",
  Coordination: "#0ea5e9",
  Development: "#0ea5e9",
  Marketing: "#ec4899",
  Memory: "#f59e0b",
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

function Sparkline({ color = "#22d3ee" }: { color?: string }) {
  const points = "0,28 14,22 28,26 42,16 56,20 70,10 84,16 100,8";
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-full">
      <defs>
        <linearGradient id={`sg-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" />
      <polygon points={`${points} 100,32 0,32`} fill={`url(#sg-${color})`} />
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { missions, remove, reset, patchLocal } = useMissions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = missions.find((m) => m.id === activeId) ?? missions[0];
  const paused = active?.status === "paused";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [accelerating, setAccelerating] = useState(false);
  const { agents: apiAgents } = useAgents();
  const { tasks: apiTasks } = useTasks(active?.id ?? null);
  const { metrics: liveMetrics, loading: liveMetricsLoading } = useMissionLiveMetrics(active?.id);
  const [liveFeed, setLiveFeed] = useState<{ t: string; a: string; c: string; msg: string }[]>([]);

  useHiveMindActivity(
    useCallback((e) => {
      const ts = new Date(e.ts).toISOString().slice(11, 19);
      const agentColors: Record<string, string> = {
        Strategy: "text-cyan-300",
        Research: "text-purple-300",
        Design: "text-blue-300",
        Treasury: "text-emerald-300",
        Analytics: "text-fuchsia-300",
        Coordination: "text-cyan-300",
        Development: "text-sky-300",
      };
      const c = agentColors[e.agent] ?? "text-white/60";
      setLiveFeed((prev) =>
        [{ t: ts, a: e.agent, c, msg: e.message.slice(0, 200) }, ...prev].slice(0, 28),
      );
    }, []),
  );

  // Stages and task buckets computed from real task data.
  // Falls back to mission agent list as planned stages when no tasks loaded yet.
  const { computedStages, tasksByStage } = useMemo(() => {
    const bucket: Record<string, { id: string; title: string; agent: string; color: string }[]> = {};

    if (apiTasks.length > 0) {
      for (const t of apiTasks) {
        const stage = (t.stage && t.stage.trim()) || "Workflow";
        if (!bucket[stage]) bucket[stage] = [];
        bucket[stage].push({ id: t.id, title: t.title, agent: t.agent, color: AGENT_UI_COLORS[t.agent] ?? "#94a3b8" });
      }
    }

    const stageNames = Object.keys(bucket);
    const stageList =
      stageNames.length > 0
        ? stageNames.map((name) => {
            const stageTasks = apiTasks.filter((t) => ((t.stage && t.stage.trim()) || "Workflow") === name);
            const doneCount = stageTasks.filter((t) => t.status === "done").length;
            const activeCount = stageTasks.filter((t) => t.status === "active").length;
            const status =
              stageTasks.length > 0 && doneCount === stageTasks.length
                ? "done"
                : activeCount > 0
                  ? "active"
                  : "queued";
            return { name, agent: stageTasks[0]?.agent ?? "System", count: stageTasks.length, status };
          })
        : (active?.agents ?? []).map((name) => ({
            name,
            agent: name,
            count: 0,
            status: "queued" as const,
          }));

    return { computedStages: stageList, tasksByStage: bucket };
  }, [apiTasks, active]);

  const dashboardAgents = useMemo(() => {
    if (!apiConfigured() || apiAgents.length === 0) return [];
    return apiAgents.map((a) => ({
      name: a.specialization,
      model: a.model,
      status: a.trustScore >= 94 ? "Reasoning" : a.trustScore >= 88 ? "Streaming" : "Idle",
      task: a.name,
      rep: a.reputation,
      latency: 90 + (a.trustScore % 420),
      mem: 12 + (a.missionsCompleted % 80),
      color: AGENT_UI_COLORS[a.specialization] ?? "#94a3b8",
    }));
  }, [apiAgents]);

  // Analytics metrics derived from real API data
  const analyticsMetrics = useMemo(() => {
    const totalTasks = liveMetrics?.opsTotal ?? apiTasks.length;
    const doneTasks =
      liveMetrics?.opsDone ?? apiTasks.filter((t) => t.status === "done").length;
    const avgLatency =
      dashboardAgents.length > 0
        ? Math.round(dashboardAgents.reduce((sum, a) => sum + a.latency, 0) / dashboardAgents.length)
        : null;
    const avgRep =
      dashboardAgents.length > 0
        ? (dashboardAgents.reduce((sum, a) => sum + a.rep, 0) / dashboardAgents.length).toFixed(2)
        : null;
    const successPct =
      totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : active?.progress ?? 0;
    const rosterVal = liveMetrics
      ? `${liveMetrics.rosterBacked}/${liveMetrics.rosterTotal}`
      : active
        ? String(active.agents.length)
        : "—";

    return [
      { k: "Coordination", v: rosterVal, c: "#22d3ee" },
      { k: "Tasks Done", v: totalTasks > 0 ? `${doneTasks}/${totalTasks}` : "—", c: "#a855f7" },
      { k: "Avg Agent Rep", v: avgRep ?? "—", c: "#3b82f6" },
      { k: "Confidence", v: `${active?.confidence ?? 0}%`, c: "#10b981" },
      { k: "Avg Latency", v: avgLatency != null ? `${avgLatency}ms` : "—", c: "#f59e0b" },
      { k: "Success Rate", v: `${successPct}%`, c: "#ec4899" },
    ];
  }, [liveMetrics, apiTasks, dashboardAgents, active]);

  // Console lines derived from live feed events
  const consoleLines = useMemo(() => {
    if (liveFeed.length === 0) return [];
    return liveFeed.slice(0, 6).flatMap((e) => [
      { c: "text-white/40", t: `» agent.${e.a.toLowerCase().replace(/\s+/g, "_")}.emit()` },
      { c: e.c, t: `  ↳ ${e.msg.slice(0, 90)}` },
    ]);
  }, [liveFeed]);

  // Treasury activity from completed tasks (approximate SOL cost per task)
  const treasuryActivity = useMemo(() => {
    if (!active || apiTasks.length === 0) return [];
    const done = apiTasks.filter((t) => t.status === "done").slice(0, 3);
    if (done.length === 0) return [];
    const perTask = active.budget / Math.max(apiTasks.length, 1);
    return done.map((t) => ({
      d: `${t.agent} · ${t.title.slice(0, 28)}`,
      a: `−${perTask.toFixed(2)}`,
      ts: new Date(t.createdAt).toISOString().slice(11, 16),
    }));
  }, [apiTasks, active]);

  const rosterMetric = useMemo(() => {
    if (!active) return { label: "Mission roster", val: "—", title: "" };
    if (liveMetrics) {
      return {
        label: "Mission roster",
        val: `${liveMetrics.rosterBacked} / ${liveMetrics.rosterTotal}`,
        title: `${liveMetrics.rosterBacked} of ${liveMetrics.rosterTotal} roles match agents in the registry (server).`,
      };
    }
    const planned = active.agents.length;
    if (!apiConfigured() || apiAgents.length === 0) {
      return {
        label: "Mission roster",
        val: String(planned),
        title: `${planned} roles on the mission graph (planned). Start the API for live roster coverage.`,
      };
    }
    const specs = new Set(apiAgents.map((a) => a.specialization));
    const backed = active.agents.filter((name) => specs.has(name)).length;
    return {
      label: "Mission roster",
      val: `${backed} / ${planned}`,
      title: `${backed} of ${planned} planned roles match /api/agents (offline fallback).`,
    };
  }, [active, liveMetrics, apiAgents]);

  useEffect(() => {
    if (!active && missions.length > 0) setActiveId(missions[0].id);
  }, [missions, active]);

  if (missions.length === 0) {
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
                  "radial-gradient(ellipse at 15% 0%, rgba(34,211,238,0.12), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(168,85,247,0.12), transparent 55%)",
              }}
            />
            <Particles count={24} />
            <div className="relative grid min-h-full place-items-center px-6 py-10">
              <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-10 text-center backdrop-blur-xl">
                <div className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.18), transparent 60%)" }} />
                <div className="relative">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10">
                    <Inbox className="h-6 w-6 text-cyan-300" />
                  </div>
                  <h2 className="mt-5 text-2xl tracking-tight">No active missions</h2>
                  <p className="mt-2 text-sm text-white/55">
                    Deploy your first autonomous workforce to get started. The HiveMind orchestrator is online and ready.
                  </p>
                  <div className="mt-6 flex justify-center gap-2">
                    <Link
                      to="/missions/new"
                      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-5 py-2.5 text-sm text-black"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
                      <Rocket className="relative h-4 w-4" />
                      <span className="relative">Create First Mission</span>
                    </Link>
                    <button
                      onClick={reset}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm text-white/80 hover:border-cyan-300/40"
                    >
                      <RotateCcw className="h-4 w-4 text-cyan-300" />
                      Load Demo Mission
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayProgress = liveMetrics?.progressPct ?? active.progress;
  const legacyOps = Math.round(active.progress * 9);

  const pulseSubtitle =
    liveMetrics != null
      ? liveMetrics.opsTotal > 0
        ? `${displayProgress}% · ${liveMetrics.opsDone} / ${liveMetrics.opsTotal} tasks`
        : `${displayProgress}% · 0 tasks`
      : apiConfigured()
        ? liveMetricsLoading
          ? `${displayProgress}% · loading…`
          : `${displayProgress}% · metrics unavailable`
        : `${active.progress}% · ${legacyOps} / ${legacyOps + 198} ops`;

  const stateStat = {
    label: "State",
    val: paused
      ? "Paused"
      : liveMetrics != null && liveMetrics.opsTotal > 0
        ? liveMetrics.opsDone >= liveMetrics.opsTotal
          ? "Completed"
          : "Executing"
        : "Idle",
    icon: Zap,
    accent: "#f59e0b",
    title: paused
      ? "Mission is paused."
      : liveMetrics != null
        ? liveMetrics.opsTotal > 0
          ? liveMetrics.opsDone >= liveMetrics.opsTotal
            ? "All mission tasks are complete (server)."
            : "Work in progress (server)."
          : "No tasks yet."
        : "No live metrics available.",
  } as const;

  const etaStat = {
    label: "ETA",
    val: liveMetrics?.etaLabel ?? active.eta,
    icon: Clock,
    accent: "#3b82f6",
    title: liveMetrics
      ? liveMetrics.etaSource === "deadline"
        ? "Time until mission deadline from wizard config (server)."
        : liveMetrics.etaSource === "task_estimate"
          ? "Roughly 15 minutes × each unfinished task (server estimate)."
          : liveMetrics.etaSource === "stored"
            ? "ETA from mission creation (no deadline / no tasks yet)."
            : "No ETA from server."
      : apiConfigured()
        ? "Live ETA requires /api/missions/…/live-metrics; showing stored mission value."
        : "Stored mission ETA (API disabled).",
  } as const;

  const totalTaskCount = liveMetrics?.opsTotal ?? apiTasks.length;
  const stageCount = computedStages.length;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />

        <div className="flex min-h-0 flex-1">
          {/* main */}
          <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
            {/* mission overview */}
            <Card className="mb-6">
              <div className="absolute inset-0 opacity-50">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 0%, rgba(34,211,238,0.18), transparent 50%), radial-gradient(circle at 80% 100%, rgba(168,85,247,0.18), transparent 50%)",
                  }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                />
              </div>
              <div className="relative p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em]">
                      <span className="relative flex h-1.5 w-1.5">
                        {paused ? (
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-purple-400" />
                        ) : (
                          <>
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
                          </>
                        )}
                      </span>
                      <span className={paused ? "text-purple-300" : "text-cyan-300"}>
                        {paused ? "Mission · Paused" : "Mission · Active"}
                      </span>
                    </div>
                    <h1 className="mt-2 text-3xl tracking-tight md:text-4xl">{active.title}</h1>
                    <p className="mt-2 max-w-2xl text-sm text-white/55">{active.objective}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/missions/new" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/80 hover:border-cyan-300/30">
                      <Plus className="h-3.5 w-3.5" /> New Mission
                    </Link>
                    <Link to="/agents" className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-300/20">
                      Open Workspace
                    </Link>
                    <button
                      onClick={() => {
                        const next = paused ? "active" : "paused";
                        patchLocal(active.id, { status: next });
                        toast(paused ? "Mission resumed" : "Mission paused", {
                          description: paused
                            ? "Agents are back online and listening for new directives."
                            : "All agent activity has been suspended. Click Resume to continue.",
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/80 hover:border-cyan-300/30"
                    >
                      {paused
                        ? <Play className="h-3.5 w-3.5 text-cyan-300" />
                        : <Pause className="h-3.5 w-3.5 text-cyan-300" />}
                      {paused ? "Resume" : "Pause"}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(true)}
                      title="Delete mission permanently"
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white/60 hover:border-rose-300/30 hover:text-rose-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        if (accelerating) return;
                        if (!apiConfigured()) {
                          toast.error("API not configured", { description: "Set VITE_API_URL to enable Accelerate." });
                          return;
                        }
                        setAccelerating(true);
                        toast("Accelerating mission…", { description: "Dispatching all agents to work in parallel on your mission." });
                        const res = await swarmRunMissionApi(active.id, { title: active.title, objective: active.objective });
                        setAccelerating(false);
                        if (res?.ok) {
                          toast.success("Swarm activated", { description: "All agents are coordinating at full speed." });
                        } else {
                          toast.error("Accelerate failed", { description: !res.ok ? res.message : "Could not start swarm run." });
                        }
                      }}
                      disabled={accelerating}
                      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black disabled:opacity-60"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
                      {accelerating
                        ? <Loader2 className="relative h-3.5 w-3.5 animate-spin" />
                        : <Rocket className="relative h-3.5 w-3.5" />}
                      <span className="relative">{accelerating ? "Running…" : "Accelerate"}</span>
                    </button>
                  </div>
                </div>

                {/* stat row */}
                <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
                  {[
                    { label: "Progress", val: `${displayProgress}%`, icon: Gauge, accent: "#22d3ee" },
                    {
                      label: rosterMetric.label,
                      val: rosterMetric.val,
                      icon: Cpu,
                      accent: "#a855f7",
                      title: rosterMetric.title,
                    },
                    { label: "Workflow Health", val: `${active.confidence}%`, icon: Activity, accent: "#10b981" },
                    etaStat,
                    stateStat,
                  ].map((s, i) => (
                    <motion.div
                      key={s.label}
                      title={"title" in s ? s.title : undefined}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-xl border border-white/10 bg-black/30 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <s.icon className="h-3.5 w-3.5" style={{ color: s.accent }} />
                        <span className="text-[9px] uppercase tracking-[0.25em] text-white/40">{s.label}</span>
                      </div>
                      <div className="mt-2 text-xl tabular-nums">{s.val}</div>
                    </motion.div>
                  ))}
                </div>

                {/* progress bar */}
                <div className="mt-5">
                  <div className="flex justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
                    <span>Mission Pulse</span>
                    <span className="text-cyan-300">{pulseSubtitle}</span>
                  </div>
                  <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${displayProgress}%` }}
                      transition={{ duration: 1.4, ease: "easeOut" }}
                      className="relative h-full rounded-full bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 shadow-[0_0_20px_rgba(34,211,238,0.7)]"
                    >
                      <motion.div
                        animate={{ x: ["-100%", "300%"] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                      />
                    </motion.div>
                  </div>
                </div>
              </div>
            </Card>

            {/* coord graph + treasury */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    Live Agent Coordination
                  </div>
                  <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.25em] text-white/40">
                    <span>graph view</span>
                    <span className="text-cyan-300">● realtime</span>
                  </div>
                </div>
                <div className="p-3">
                  <CoordGraph selectedAgentNames={active.agents} />
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Wallet className="h-4 w-4 text-emerald-300" />
                    Treasury
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-300">on-chain</span>
                </div>
                <div className="p-5">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Mission Budget</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl tabular-nums">{active.budget.toFixed(2)}</span>
                    <span className="text-sm text-white/50">SOL</span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                    {(() => {
                      const cfg = active.config?.budgetAllocation;
                      const ac = cfg?.agentCompute ?? 0.45;
                      const esc = cfg?.escrowReserve ?? 0.2;
                      const tok = cfg?.tokenUsage ?? 0.22;
                      const buf = cfg?.settlementBuffer ?? 0.13;
                      const budget = active.budget;
                      return [
                        { l: "Allocated", v: (budget * ac).toFixed(2), c: "#22d3ee" },
                        { l: "Escrow", v: (budget * esc).toFixed(2), c: "#a855f7" },
                        { l: "Tokens", v: (budget * tok).toFixed(2), c: "#10b981" },
                        { l: "Buffer", v: (budget * buf).toFixed(2), c: "#f59e0b" },
                      ];
                    })().map((x) => (
                      <div key={x.l} className="rounded-lg border border-white/10 bg-black/30 p-3">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: x.c, boxShadow: `0 0 8px ${x.c}` }} />
                          {x.l}
                        </div>
                        <div className="mt-1.5 text-base tabular-nums text-white">{x.v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 text-[10px] uppercase tracking-[0.3em] text-white/40">Recent Activity</div>
                  <div className="mt-2 space-y-1.5 text-xs">
                    {treasuryActivity.length > 0 ? (
                      treasuryActivity.map((tx, i) => (
                        <div key={i} className="flex items-center justify-between rounded-md bg-white/[0.02] px-3 py-2">
                          <span className="truncate text-white/70">{tx.d}</span>
                          <span className="ml-2 shrink-0 tabular-nums text-white/60">{tx.a} SOL</span>
                          <span className="ml-2 shrink-0 font-mono text-white/30">{tx.ts}</span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-dashed border-white/10 px-3 py-4 text-center text-[10px] text-white/30">
                        No on-chain activity yet
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* pipeline */}
            <Card className="mb-6">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-cyan-300" />
                  Mission Pipeline
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/40">
                  <span>
                    {totalTaskCount > 0 ? `${totalTaskCount} task${totalTaskCount !== 1 ? "s" : ""}` : "no tasks yet"}
                    {stageCount > 0 ? ` · ${stageCount} stage${stageCount !== 1 ? "s" : ""}` : ""}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
                {computedStages.length > 0 ? (
                  computedStages.map((stage, i) => {
                    const tasks = tasksByStage[stage.name] ?? [];
                    return (
                      <div key={stage.name} className="rounded-xl border border-white/10 bg-black/30 p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {stage.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />}
                            {stage.status === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />}
                            {stage.status === "queued" && <Circle className="h-3.5 w-3.5 text-white/30" />}
                            <span className="text-xs">{stage.name}</span>
                          </div>
                          <span className="text-[10px] tabular-nums text-white/40">{stage.count}</span>
                        </div>

                        <div className="my-3 h-0.5 w-full overflow-hidden rounded-full bg-white/5">
                          <motion.div
                            className={`h-full ${
                              stage.status === "done"
                                ? "bg-emerald-300"
                                : stage.status === "active"
                                  ? "bg-gradient-to-r from-cyan-300 to-purple-300"
                                  : "bg-white/10"
                            }`}
                            initial={{ width: 0 }}
                            animate={{ width: stage.status === "done" ? "100%" : stage.status === "active" ? "60%" : "0%" }}
                            transition={{ delay: i * 0.05, duration: 1 }}
                          />
                        </div>

                        <div className="space-y-1.5">
                          {tasks.slice(0, 3).map((t) => (
                            <div key={t.id} className="rounded-md border border-white/5 bg-white/[0.02] p-2 text-[11px]">
                              <div className="flex items-center gap-1.5 text-white/85">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color, boxShadow: `0 0 6px ${t.color}` }} />
                                <span className="flex-1 truncate">{t.title}</span>
                              </div>
                              <div className="mt-1 flex items-center justify-between text-[9px] text-white/40">
                                <span>{t.id.slice(0, 8)}</span>
                                <span>{t.agent}</span>
                              </div>
                            </div>
                          ))}
                          {tasks.length > 3 && (
                            <div className="text-center text-[10px] text-white/40">+{tasks.length - 3} more</div>
                          )}
                          {tasks.length === 0 && (
                            <div className="rounded-md border border-dashed border-white/10 p-2 text-center text-[10px] text-white/30">
                              awaiting
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full py-8 text-center text-[11px] text-white/30">
                    No pipeline stages yet — tasks will appear here once agents begin working
                  </div>
                )}
              </div>
            </Card>

            {/* analytics + agent grid */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              {/* analytics */}
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-cyan-300" />
                    Mission Analytics
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">live</span>
                </div>
                <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-3">
                  {analyticsMetrics.map((m) => (
                    <div key={m.k} className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{m.k}</div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-2xl tabular-nums">{m.v}</span>
                      </div>
                      <div className="mt-2">
                        <Sparkline color={m.c} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* large chart */}
                <div className="px-5 pb-5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
                    <span>Mission Completion · live</span>
                    <span className="text-cyan-300">{displayProgress}% complete</span>
                  </div>
                  <div className="mt-2 h-32 w-full rounded-xl border border-white/10 bg-black/30 p-2">
                    <svg viewBox="0 0 400 100" className="h-full w-full" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="bigChart" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="bigChart2" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0,80 L40,72 L80,76 L120,58 L160,64 L200,40 L240,46 L280,30 L320,38 L360,18 L400,24 L400,100 L0,100 Z"
                        fill="url(#bigChart)"
                      />
                      <path
                        d="M0,80 L40,72 L80,76 L120,58 L160,64 L200,40 L240,46 L280,30 L320,38 L360,18 L400,24"
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M0,90 L40,86 L80,88 L120,76 L160,80 L200,62 L240,68 L280,54 L320,60 L360,46 L400,52 L400,100 L0,100 Z"
                        fill="url(#bigChart2)"
                      />
                      <path
                        d="M0,90 L40,86 L80,88 L120,76 L160,80 L200,62 L240,68 L280,54 L320,60 L360,46 L400,52"
                        fill="none"
                        stroke="#a855f7"
                        strokeWidth="1.2"
                      />
                    </svg>
                  </div>
                </div>
              </Card>

              {/* agent status grid */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Cpu className="h-4 w-4 text-cyan-300" />
                    Agent Status
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                    {dashboardAgents.length > 0 ? `${dashboardAgents.length} online` : "no agents"}
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  {dashboardAgents.length > 0 ? (
                    dashboardAgents.map((a) => (
                      <motion.div
                        key={a.name}
                        whileHover={{ y: -1 }}
                        className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/30 p-3 transition hover:border-cyan-300/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div
                              className="h-9 w-9 rounded-lg"
                              style={{
                                background: `linear-gradient(135deg, ${a.color}55, ${a.color}11)`,
                                boxShadow: `0 0 16px ${a.color}55`,
                              }}
                            />
                            <motion.span
                              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-black"
                              style={{ background: a.color }}
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 1.6, repeat: Infinity }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm">{a.name}</span>
                              <span className="text-[10px] text-white/40">{a.model}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-white/55">
                              <span style={{ color: a.color }}>● {a.status}</span>
                              <span className="truncate">{a.task}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                          <div className="rounded-md bg-white/[0.03] px-2 py-1">
                            <div className="text-white/40">Rep</div>
                            <div className="tabular-nums text-white/85">{a.rep}</div>
                          </div>
                          <div className="rounded-md bg-white/[0.03] px-2 py-1">
                            <div className="text-white/40">Latency</div>
                            <div className="tabular-nums text-white/85">{a.latency}ms</div>
                          </div>
                          <div className="rounded-md bg-white/[0.03] px-2 py-1">
                            <div className="text-white/40">Mem</div>
                            <div className="tabular-nums text-white/85">{a.mem}%</div>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-[11px] text-white/30">
                      {apiConfigured() ? "No agents registered yet" : "API offline — start backend to see agents"}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </main>

          {/* right realtime panel */}
          <aside className="hidden w-[360px] shrink-0 flex-col border-l border-white/5 bg-black/40 backdrop-blur-xl xl:flex">
            <div className="border-b border-white/5 px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-cyan-300" />
                  Mission Telemetry
                </div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">live</span>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              {/* trial banner */}
              <div className="border-b border-white/5 p-4">
                <TrialBanner />
              </div>

              {/* feed */}
              <div className="border-b border-white/5 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Agent Activity</div>
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {liveFeed.length > 0 ? (
                    liveFeed.map((e, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.05, 0.3) }}
                        className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-[11px]"
                      >
                        <div className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${e.c}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className={e.c}>{e.a}</span>
                            <span className="font-mono text-[9px] text-white/30">{e.t}</span>
                          </div>
                          <div className="mt-0.5 text-white/75">{e.msg}</div>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-white/10 py-6 text-center text-[11px] text-white/30">
                      Waiting for agent activity…
                    </div>
                  )}
                </div>
              </div>

              {/* console */}
              <div className="flex min-h-0 flex-1 flex-col p-4">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
                  <span>// agent.console</span>
                  <span className="text-cyan-300">streaming</span>
                </div>
                <div className="mt-3 flex-1 overflow-y-auto rounded-lg border border-white/5 bg-black/60 p-3 font-mono text-[11px] leading-relaxed">
                  {consoleLines.length > 0 ? (
                    consoleLines.map((l, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className={l.c}
                      >
                        {l.t}
                      </motion.div>
                    ))
                  ) : (
                    <span className="text-white/20">// waiting for agent events…</span>
                  )}
                  <motion.span
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    className="text-cyan-300"
                  >
                    ▌
                  </motion.span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
                  {[
                    { l: "ws", v: apiConfigured() ? "live" : "off", i: Database },
                    { l: "ctx", v: liveMetrics ? `${liveMetrics.opsTotal}t` : "—", i: Brain },
                    { l: "done", v: liveMetrics ? String(liveMetrics.opsDone) : "—", i: Zap },
                  ].map((x) => (
                    <div key={x.l} className="rounded-md border border-white/5 bg-white/[0.02] py-2">
                      <x.i className="mx-auto h-3 w-3 text-cyan-300" />
                      <div className="mt-1 text-white/40">{x.l}</div>
                      <div className="tabular-nums text-white/85">{x.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {confirmDelete && active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setConfirmDelete(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm overflow-hidden rounded-2xl border border-rose-300/20 bg-[#0a0d18] shadow-2xl"
            >
              <div className="border-b border-white/5 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-300/20 bg-rose-500/10">
                    <AlertTriangle className="h-4 w-4 text-rose-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Delete mission?</h3>
                    <p className="mt-0.5 text-[11px] text-white/45">This action cannot be undone.</p>
                  </div>
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-white/60">
                  <span className="font-medium text-white/80">{active.title}</span> and all its agents, artifacts, and tasks will be permanently removed from the database.
                </p>
              </div>
              <div className="flex gap-2 p-4">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-xs text-white/70 hover:border-white/20"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setConfirmDelete(false);
                    await remove(active.id);
                    toast.success("Mission deleted", { description: "The mission has been permanently removed." });
                    const next = missions.find((m) => m.id !== active.id);
                    if (next) {
                      setActiveId(next.id);
                    } else {
                      navigate("/missions/new");
                    }
                  }}
                  className="flex-1 rounded-lg border border-rose-300/30 bg-rose-500/15 py-2 text-xs font-medium text-rose-200 hover:bg-rose-500/25"
                >
                  Delete permanently
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
