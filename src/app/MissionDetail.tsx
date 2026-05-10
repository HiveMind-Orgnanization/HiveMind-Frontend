import { useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import { motion } from "motion/react";
import {
  Activity, CheckCircle2, Circle, Loader2, Clock, Cpu, Wallet, Sparkles,
  FileText, Image as ImageIcon, Video, Code2, Layers, Pause, Play, Zap,
  ArrowUpRight, Send, ShieldCheck, Star, Network, Gauge, Hexagon,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { useMissions } from "./store";
import { apiConfigured } from "../lib/api";
import { useMissionLiveMetrics } from "./hooks/useHiveMind";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

const timeline = [
  { t: "16:08:02", title: "Mission initiated",     by: "Operator",     status: "done",   c: "#22d3ee" },
  { t: "16:08:14", title: "Agents assigned",       by: "Coordinator",  status: "done",   c: "#a855f7" },
  { t: "16:09:01", title: "Memory retrieved",      by: "Memory",       status: "done",   c: "#f59e0b" },
  { t: "16:11:38", title: "Workflows generated",   by: "Strategy",     status: "done",   c: "#22d3ee" },
  { t: "16:24:11", title: "Outputs in progress",   by: "Design",       status: "active", c: "#3b82f6" },
  { t: "16:42:50", title: "Payments queued",       by: "Treasury",     status: "queued", c: "#10b981" },
  { t: "—",        title: "Mission completion",    by: "Coordinator",  status: "queued", c: "#a855f7" },
];

type GraphNode = {
  id: string; label: string; agent: string; x: number; y: number; status: "done" | "active" | "queued"; c: string;
};
type GraphEdge = { from: string; to: string };

const graphNodes: GraphNode[] = [
  { id: "root",    label: "Root Plan",         agent: "Strategy",     x: 50, y: 12, status: "done",   c: "#22d3ee" },
  { id: "research",label: "Research Sweep",    agent: "Research",     x: 22, y: 32, status: "done",   c: "#a855f7" },
  { id: "memory",  label: "Memory Recall",     agent: "Memory",       x: 78, y: 32, status: "done",   c: "#f59e0b" },
  { id: "design",  label: "Design Variants",   agent: "Design",       x: 22, y: 60, status: "active", c: "#3b82f6" },
  { id: "copy",    label: "Copy & Threads",    agent: "Marketing",    x: 50, y: 60, status: "active", c: "#ec4899" },
  { id: "audit",   label: "Brand Audit",       agent: "Coordination", x: 78, y: 60, status: "active", c: "#06b6d4" },
  { id: "review",  label: "Quality Review",    agent: "Coordination", x: 50, y: 80, status: "queued", c: "#0ea5e9" },
  { id: "payout",  label: "Payouts & Settle",  agent: "Treasury",     x: 78, y: 92, status: "queued", c: "#10b981" },
  { id: "publish", label: "Publish & Track",   agent: "Analytics",    x: 22, y: 92, status: "queued", c: "#8b5cf6" },
];

const graphEdges: GraphEdge[] = [
  { from: "root", to: "research" }, { from: "root", to: "memory" },
  { from: "research", to: "design" }, { from: "research", to: "copy" },
  { from: "memory", to: "audit" },   { from: "memory", to: "copy" },
  { from: "design", to: "review" },  { from: "copy", to: "review" }, { from: "audit", to: "review" },
  { from: "review", to: "payout" },  { from: "review", to: "publish" },
];

const assignments = [
  { agent: "Atlas",  spec: "Strategy",     model: "Claude 4.7", task: "KPI tree synthesis",    status: "active",  c: "#22d3ee" },
  { agent: "Vega",   spec: "Research",     model: "GPT-5",      task: "Solana trend matrix",   status: "done",    c: "#a855f7" },
  { agent: "Lumen",  spec: "Design",       model: "Llama 4",    task: "Banner pack v3",        status: "active",  c: "#3b82f6" },
  { agent: "Halo",   spec: "Coordination", model: "Claude 4.7", task: "Stage 4 → 5 routing",   status: "active",  c: "#06b6d4" },
  { agent: "Echo",   spec: "Analytics",    model: "Qwen 3",     task: "Engagement Δ tracking", status: "queued",  c: "#8b5cf6" },
  { agent: "Axiom",  spec: "Treasury",     model: "DeepSeek",   task: "Escrow approvals",      status: "queued",  c: "#10b981" },
];

const assignmentTone: Record<string, { c: string; bg: string; label: string }> = {
  active: { c: "#22d3ee", bg: "rgba(34,211,238,0.12)", label: "active" },
  done:   { c: "#10b981", bg: "rgba(16,185,129,0.12)", label: "done"   },
  queued: { c: "#a855f7", bg: "rgba(168,85,247,0.12)", label: "queued" },
};

const outputs = [
  { kind: "image", title: "Hero banner v3 · 1080×1080",       size: "12 variants", icon: ImageIcon, c: "#3b82f6" },
  { kind: "video", title: "Hero video · storyboard",          size: "00:42",       icon: Video,     c: "#a855f7" },
  { kind: "doc",   title: "Launch copy · A/B variants ×6",    size: "4.2 KB",      icon: FileText,  c: "#22d3ee" },
  { kind: "code",  title: "Landing page · React snippets",    size: "8 files",     icon: Code2,     c: "#10b981" },
  { kind: "asset", title: "Press kit · brand bundle",         size: "24 MB",       icon: Layers,    c: "#f59e0b" },
  { kind: "image", title: "Twitter thread imagery",           size: "12 cards",    icon: ImageIcon, c: "#ec4899" },
];

const txFlow = [
  { l: "Mission Budget",    v: "48.00", sub: "SOL",       c: "#22d3ee" },
  { l: "Allocated",         v: "31.60", sub: "65.8%",     c: "#a855f7" },
  { l: "Escrow Locked",     v: "12.40", sub: "active",    c: "#f59e0b" },
  { l: "Payouts Settled",   v: "4.00",  sub: "8 agents",  c: "#10b981" },
];

const deliverables = [
  { name: "Brand Strategy Brief",       agent: "Atlas",   q: 0.96, status: "approved",  c: "#22d3ee" },
  { name: "Solana Trend Report",        agent: "Vega",    q: 0.94, status: "approved",  c: "#a855f7" },
  { name: "Hero Banner Pack v3",        agent: "Lumen",   q: 0.91, status: "review",    c: "#3b82f6" },
  { name: "Twitter Thread x12",         agent: "Lumen",   q: 0.88, status: "review",    c: "#ec4899" },
  { name: "Press Kit Bundle",           agent: "Lumen",   q: 0.86, status: "in-progress", c: "#f59e0b" },
  { name: "Engagement Analytics Plan",  agent: "Echo",    q: 0.92, status: "approved",  c: "#8b5cf6" },
];

const delTone: Record<string, { c: string; bg: string }> = {
  approved:    { c: "#10b981", bg: "rgba(16,185,129,0.12)" },
  review:      { c: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  "in-progress": { c: "#22d3ee", bg: "rgba(34,211,238,0.12)" },
};

function statusIcon(s: GraphNode["status"]) {
  if (s === "done")   return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />;
  if (s === "active") return <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />;
  return <Circle className="h-3.5 w-3.5 text-white/30" />;
}

function TaskGraph() {
  const nodeById = useMemo(() => Object.fromEntries(graphNodes.map((n) => [n.id, n])), []);
  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-black/60 to-[#06091a]/60 backdrop-blur-xl">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(circle at 50% 50%, rgba(0,0,0,1) 30%, rgba(0,0,0,0.1) 85%)",
        }}
      />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="tgEdge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {graphEdges.map((e, i) => {
          const a = nodeById[e.from], b = nodeById[e.to];
          if (!a || !b) return null;
          return (
            <g key={`${e.from}-${e.to}`}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="url(#tgEdge)" strokeWidth="0.18" strokeDasharray="1.2 1"
              />
              <motion.circle
                r="0.6" fill={b.c}
                initial={{ cx: a.x, cy: a.y, opacity: 0 }}
                animate={{
                  cx: [a.x, b.x],
                  cy: [a.y, b.y],
                  opacity: [0, 0.9, 0],
                }}
                transition={{ duration: 3.4, repeat: Infinity, delay: i * 0.4, ease: "linear" }}
              />
            </g>
          );
        })}
      </svg>

      {graphNodes.map((n, i) => (
        <motion.div
          key={n.id}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.05 }}
          className="absolute"
          style={{ left: `${n.x}%`, top: `${n.y}%`, transform: "translate(-50%, -50%)" }}
        >
          <div
            className="relative flex items-center gap-2 rounded-xl border bg-black/80 px-3 py-2 backdrop-blur-xl"
            style={{
              borderColor: `${n.c}55`,
              boxShadow: n.status === "active" ? `0 0 16px ${n.c}55, inset 0 0 0 1px ${n.c}33` : "none",
            }}
          >
            {n.status === "active" && (
              <motion.div
                className="absolute inset-0 rounded-xl"
                style={{ boxShadow: `0 0 32px ${n.c}55` }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2.2, repeat: Infinity }}
              />
            )}
            <div className="relative flex items-center gap-2">
              {statusIcon(n.status)}
              <div>
                <div className="text-[11px]">{n.label}</div>
                <div className="text-[9px] text-white/45">{n.agent}</div>
              </div>
            </div>
          </div>
        </motion.div>
      ))}

      <div className="pointer-events-none absolute left-3 top-3 text-[10px] uppercase tracking-[0.3em] text-cyan-300/60">
        ◢ task graph
      </div>
      <div className="pointer-events-none absolute right-3 top-3 text-[10px] tabular-nums text-white/40">
        9 nodes · 11 edges
      </div>
      <div className="pointer-events-none absolute right-3 bottom-3 text-[10px] uppercase tracking-[0.3em] text-purple-300/60">
        flow.v3 ◣
      </div>
    </div>
  );
}

export default function MissionDetail() {
  const { id } = useParams();
  const { missions } = useMissions();
  const mission = missions.find((m) => m.id === id) ?? missions[0];
  const [paused, setPaused] = useState(false);
  const { metrics: liveMetrics, loading: liveMetricsLoading } = useMissionLiveMetrics(mission?.id);

  if (!mission) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopNav />
          <div className="grid place-items-center p-10 text-center">
            <div>
              <div className="text-2xl">Mission not found</div>
              <p className="mt-2 text-sm text-white/55">It may have been archived.</p>
              <Link to="/dashboard" className="mt-4 inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100">
                Back to Mission Control
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const progressShown = liveMetrics?.progressPct ?? mission.progress;
  const rosterShown = liveMetrics
    ? `${liveMetrics.rosterBacked} / ${liveMetrics.rosterTotal}`
    : String(mission.agents.length);
  const etaShown = liveMetrics?.etaLabel ?? mission.eta;

  const statusShown = paused
    ? "Paused"
    : liveMetrics != null && liveMetrics.opsTotal > 0
      ? liveMetrics.opsDone >= liveMetrics.opsTotal
        ? "Completed"
        : "Executing"
      : "Idle";

  const pulseText =
    liveMetrics != null
      ? liveMetrics.opsTotal > 0
        ? `${progressShown}% · ${liveMetrics.opsDone} / ${liveMetrics.opsTotal} tasks`
        : `${progressShown}% · 0 tasks`
      : apiConfigured() && liveMetricsLoading
        ? `${progressShown}% · loading…`
        : apiConfigured()
          ? `${progressShown}% · metrics unavailable`
          : `${mission.progress}% · realtime orchestration`;

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
          <Particles count={26} />

          <div className="relative px-6 py-6">
            <PageHeader
              title={mission.title}
              subtitle={mission.objective}
              crumbs={[{ label: "Missions", to: "/dashboard" }, { label: mission.id }]}
              status={{ label: paused ? "Paused" : "Mission · Active", tone: paused ? "purple" : "cyan" }}
              actions={
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPaused((p) => !p)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/85 hover:border-cyan-300/30"
                  >
                    {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    {paused ? "Resume" : "Pause"}
                  </button>
                  <button className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black">
                    <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
                    <Zap className="relative h-3.5 w-3.5" />
                    <span className="relative">Accelerate</span>
                  </button>
                </div>
              }
            />

            {/* Mission Hero */}
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
              <div className="relative grid gap-4 p-6 md:grid-cols-6">
                {[
                  { l: "Status",            v: statusShown,                      icon: Activity, c: "#22d3ee" },
                  { l: "Progress",          v: `${progressShown}%`,               icon: Gauge,    c: "#a855f7" },
                  { l: "Mission roster",    v: rosterShown,                       icon: Cpu,      c: "#3b82f6" },
                  { l: "ETA",               v: etaShown,                         icon: Clock,    c: "#f59e0b" },
                  { l: "Coordination",      v: `${mission.confidence}%`,         icon: Network,  c: "#10b981" },
                  { l: "Mission ID",        v: mission.id,                       icon: Hexagon,  c: "#ec4899" },
                ].map((s, i) => (
                  <motion.div
                    key={s.l}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-xl border border-white/10 bg-black/30 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <s.icon className="h-3.5 w-3.5" style={{ color: s.c }} />
                      <span className="text-[9px] uppercase tracking-[0.25em] text-white/40">{s.l}</span>
                    </div>
                    <div className="mt-3 text-xl tabular-nums">{s.v}</div>
                  </motion.div>
                ))}
              </div>

              <div className="relative px-6 pb-6">
                <div className="flex justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
                  <span>Mission Pulse</span>
                  <span className="text-cyan-300">{pulseText}</span>
                </div>
                <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressShown}%` }}
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
            </Card>

            {/* Timeline + Task Graph */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              {/* Mission Timeline */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4 text-cyan-300" />
                    Mission Timeline
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">live</span>
                </div>
                <div className="relative p-5">
                  <div className="absolute left-9 top-5 bottom-5 w-px bg-gradient-to-b from-cyan-300/40 via-purple-300/30 to-emerald-300/20" />
                  <div className="space-y-4">
                    {timeline.map((e, i) => (
                      <motion.div
                        key={e.title}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="relative flex items-start gap-3"
                      >
                        <div className="relative z-10 flex h-8 w-8 items-center justify-center">
                          <span
                            className="block h-3 w-3 rotate-45 rounded-sm ring-2 ring-black"
                            style={{
                              background: e.c,
                              boxShadow: e.status === "active" ? `0 0 16px ${e.c}` : `0 0 8px ${e.c}`,
                            }}
                          />
                          {e.status === "active" && (
                            <motion.span
                              className="absolute h-6 w-6 rounded-full"
                              style={{ background: e.c, opacity: 0.25 }}
                              animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
                              transition={{ duration: 2, repeat: Infinity }}
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-white/85">{e.title}</span>
                            <span className="font-mono text-white/30">{e.t}</span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-white/45">by {e.by}</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Task Graph */}
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    Task Graph · Workflow Tree
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">orchestration · live</span>
                </div>
                <div className="p-3"><TaskGraph /></div>
              </Card>
            </div>

            {/* Agent Assignments + Outputs */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Cpu className="h-4 w-4 text-cyan-300" />
                    Agent Assignments
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{assignments.length} assigned</span>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-2">
                  {assignments.map((a, i) => {
                    const t = assignmentTone[a.status];
                    return (
                      <motion.div
                        key={a.agent}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="rounded-xl border border-white/10 bg-black/30 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="h-9 w-9 rounded-lg"
                              style={{ background: `linear-gradient(135deg, ${a.c}55, ${a.c}11)`, boxShadow: `0 0 16px ${a.c}55` }}
                            />
                            <motion.span
                              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-black"
                              style={{ background: a.c }}
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 1.6, repeat: Infinity }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm">{a.agent}</span>
                              <span
                                className="rounded-md px-1.5 py-0.5 text-[9px] uppercase tracking-widest"
                                style={{ color: t.c, background: t.bg }}
                              >
                                {t.label}
                              </span>
                            </div>
                            <div className="text-[10px] text-white/45">{a.spec} · {a.model}</div>
                            <div className="mt-1 truncate text-[11px] text-white/70">▸ {a.task}</div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Wallet className="h-4 w-4 text-emerald-300" />
                    Financial Activity
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-300">on-chain</span>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-2">
                    {txFlow.map((x) => (
                      <div key={x.l} className="rounded-lg border border-white/10 bg-black/30 p-3">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: x.c, boxShadow: `0 0 8px ${x.c}` }} />
                          {x.l}
                        </div>
                        <div className="mt-1.5 text-base tabular-nums">{x.v}</div>
                        <div className="text-[10px] text-white/45">{x.sub}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 text-[10px] uppercase tracking-[0.3em] text-white/40">Allocation Flow</div>
                  <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <motion.div initial={{ width: 0 }} animate={{ width: "44%" }} transition={{ duration: 1 }}
                      className="h-full" style={{ background: "#22d3ee", boxShadow: "0 0 8px #22d3ee" }} />
                    <motion.div initial={{ width: 0 }} animate={{ width: "26%" }} transition={{ duration: 1, delay: 0.1 }}
                      className="h-full" style={{ background: "#a855f7", boxShadow: "0 0 8px #a855f7" }} />
                    <motion.div initial={{ width: 0 }} animate={{ width: "18%" }} transition={{ duration: 1, delay: 0.2 }}
                      className="h-full" style={{ background: "#f59e0b", boxShadow: "0 0 8px #f59e0b" }} />
                    <motion.div initial={{ width: 0 }} animate={{ width: "12%" }} transition={{ duration: 1, delay: 0.3 }}
                      className="h-full" style={{ background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
                  </div>

                  <div className="mt-5 text-[10px] uppercase tracking-[0.3em] text-white/40">Recent Settlements</div>
                  <div className="mt-2 space-y-1.5 text-xs">
                    {[
                      { d: "Lumen · banner",   a: "−0.42", t: "16:42" },
                      { d: "Vega · research",  a: "−0.36", t: "16:38" },
                      { d: "Atlas · planning", a: "−0.50", t: "16:24" },
                    ].map((tx) => (
                      <div key={tx.d} className="flex items-center justify-between rounded-md bg-white/[0.02] px-3 py-2">
                        <span className="text-white/70">{tx.d}</span>
                        <span className="tabular-nums text-emerald-300">{tx.a} SOL</span>
                        <span className="font-mono text-white/30">{tx.t}</span>
                      </div>
                    ))}
                  </div>

                  <button className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-2 text-xs text-white/80 hover:border-emerald-300/30">
                    View Treasury <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              </Card>
            </div>

            {/* Outputs */}
            <Card className="mb-6">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Layers className="h-4 w-4 text-cyan-300" />
                  Outputs Generated
                </div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{outputs.length} artifacts</span>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
                {outputs.map((o, i) => (
                  <motion.div
                    key={o.title}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/30 p-4"
                  >
                    <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-30 blur-2xl" style={{ background: o.c }} />
                    <div className="relative">
                      <div className="flex h-20 items-center justify-center rounded-lg border border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
                        <o.icon className="h-7 w-7" style={{ color: o.c }} />
                      </div>
                      <div className="mt-3 truncate text-[11px] text-white/85">{o.title}</div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-white/45">
                        <span>{o.size}</span>
                        <span style={{ color: o.c }}>● {o.kind}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>

            {/* Deliverables */}
            <Card className="mb-6">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  Deliverables
                </div>
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-100 hover:bg-cyan-300/20">
                  <Send className="h-3 w-3" /> Submit Approval
                </button>
              </div>
              <div className="divide-y divide-white/5">
                {deliverables.map((d, i) => {
                  const t = delTone[d.status];
                  return (
                    <motion.div
                      key={d.name}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="grid grid-cols-12 items-center gap-3 px-5 py-3 hover:bg-white/[0.02]"
                    >
                      <div className="col-span-5 flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg"
                          style={{ background: `linear-gradient(135deg, ${d.c}55, ${d.c}11)`, boxShadow: `0 0 12px ${d.c}55` }}
                        />
                        <div>
                          <div className="text-sm">{d.name}</div>
                          <div className="text-[10px] text-white/45">by {d.agent}</div>
                        </div>
                      </div>
                      <div className="col-span-3">
                        <div className="flex items-center justify-between text-[11px] text-white/55">
                          <span>Quality</span>
                          <span className="tabular-nums text-white/85">{(d.q * 100).toFixed(0)}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                          <motion.div
                            initial={{ width: 0 }} animate={{ width: `${d.q * 100}%` }}
                            transition={{ duration: 1 }}
                            className="h-full rounded-full"
                            style={{ background: `linear-gradient(90deg, ${d.c}, #a855f7)`, boxShadow: `0 0 8px ${d.c}` }}
                          />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span
                          className="rounded-md px-2 py-0.5 text-[10px] uppercase tracking-widest"
                          style={{ color: t.c, background: t.bg }}
                        >
                          {d.status}
                        </span>
                      </div>
                      <div className="col-span-2 text-right text-[11px]">
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <Star className="h-2.5 w-2.5 fill-amber-300" />
                          <span className="tabular-nums">{(d.q * 5).toFixed(2)}</span>
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
