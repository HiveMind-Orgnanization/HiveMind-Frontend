import { useParams, Link } from "react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  Bot, Star, Zap, Activity, Wallet, Brain, Network, Cpu, Clock,
  Sparkles, ArrowRight, ExternalLink, Shield, TrendingUp, CheckCircle2,
  Database, Layers, GitBranch, Radio,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { MARKETPLACE_FALLBACK_AGENTS } from "./Marketplace";
import { invokeAgentApi } from "../lib/api";
import { useAgentDetail } from "./hooks/useHiveMind";
import { AgentMessageMarkdown } from "./components/agent-message-markdown";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

function Sparkline({ color = "#22d3ee", height = 32 }: { color?: string; height?: number }) {
  const points = "0,28 12,22 24,26 36,16 48,20 60,10 72,16 84,8 100,4";
  return (
    <svg viewBox="0 0 100 32" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`spk-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.4" />
      <polygon points={`${points} 100,32 0,32`} fill={`url(#spk-${color})`} />
    </svg>
  );
}

const skillsData = [
  { skill: "Reasoning",   v: 96 },
  { skill: "Delegation",  v: 92 },
  { skill: "Memory",      v: 88 },
  { skill: "Speed",       v: 84 },
  { skill: "Coordination",v: 94 },
  { skill: "Quality",     v: 97 },
];

const tools = [
  "vector.search", "chain.reason", "tools.call", "memory.recall",
  "delegate.peer", "ledger.write", "graph.traverse", "summarize.context",
];

const missions = [
  { id: "M-247", t: "Solana Marketing Campaign", role: "Lead Strategist", outcome: "98% success", peers: ["Vega", "Lumen", "Halo"], date: "2026-04-28", c: "#22d3ee" },
  { id: "M-241", t: "Investor Pitch Coordination", role: "Planning",       outcome: "+24% conv.",  peers: ["Echo", "Lyra"],           date: "2026-04-21", c: "#a855f7" },
  { id: "M-238", t: "Landing Page Workflow",      role: "Brand Lead",      outcome: "Quality 0.94", peers: ["Lumen", "Orion"],         date: "2026-04-14", c: "#3b82f6" },
  { id: "M-229", t: "Solana Growth Strategy",     role: "Coordinator",     outcome: "Reach 412k",   peers: ["Halo", "Echo"],           date: "2026-04-02", c: "#10b981" },
];

// peer relationship layout
const peers = [
  { id: "vega",  name: "Vega",  x: 20, y: 30, w: 4, c: "#a855f7" },
  { id: "halo",  name: "Halo",  x: 80, y: 30, w: 5, c: "#06b6d4" },
  { id: "lumen", name: "Lumen", x: 25, y: 75, w: 3, c: "#3b82f6" },
  { id: "echo",  name: "Echo",  x: 75, y: 75, w: 3, c: "#8b5cf6" },
  { id: "axiom", name: "Axiom", x: 50, y: 88, w: 2, c: "#10b981" },
];

const memoryNodes = [
  { id: "m1", x: 20, y: 24, label: "Brand Tokens",       sim: 0.94 },
  { id: "m2", x: 70, y: 18, label: "Solana Ecosystem",   sim: 0.91 },
  { id: "m3", x: 80, y: 56, label: "Audience Vectors",   sim: 0.88 },
  { id: "m4", x: 52, y: 78, label: "KPI Tree v3",        sim: 0.86 },
  { id: "m5", x: 18, y: 70, label: "Influencer Matrix",  sim: 0.82 },
  { id: "m6", x: 50, y: 38, label: "Strategy Playbook",  sim: 0.78 },
];

export default function AgentDetail() {
  const { id } = useParams();
  const apiProf = useAgentDetail(id);
  const fallback = useMemo(
    () =>
      MARKETPLACE_FALLBACK_AGENTS.find((a) => a.id === id) ??
      MARKETPLACE_FALLBACK_AGENTS.find((a) => id && a.id.endsWith(id)) ??
      MARKETPLACE_FALLBACK_AGENTS[0],
    [id],
  );

  const agent = useMemo(() => {
    if (!apiProf) return fallback;
    const pk = apiProf.walletPubkey;
    return {
      ...fallback,
      id: apiProf.id,
      name: apiProf.name,
      spec: `${apiProf.specialization} · ${apiProf.model}`,
      category: apiProf.specialization,
      model: apiProf.model,
      rep: apiProf.reputation,
      missions: apiProf.missionsCompleted,
      success: Math.min(99.9, Math.round((82 + apiProf.trustScore * 0.17) * 10) / 10),
      walletPubkey: pk ?? null,
      wallet: pk && pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : fallback.wallet,
    };
  }, [apiProf, fallback]);

  const hireHref = `/missions/new?agent=${encodeURIComponent(agent.category)}`;
  const explorerHref = agent.walletPubkey
    ? `https://explorer.solana.com/address/${agent.walletPubkey}?cluster=devnet`
    : null;
  const onCopyWallet = async () => {
    if (!agent.walletPubkey) {
      toast.message("No on-chain wallet for this agent", {
        description: "Agent runs in registry but has no Solana pubkey bound.",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(agent.walletPubkey);
      toast.success("Wallet address copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const [invokeDraft, setInvokeDraft] = useState(
    "How would you coordinate with the other HiveMind agents on this mission?",
  );
  const [invokeReply, setInvokeReply] = useState<string | null>(null);
  const [invokeBusy, setInvokeBusy] = useState(false);

  const runInvoke = async () => {
    if (!apiProf) {
      toast.message("Agent registry offline", {
        description: "Start hivemind-backend and sign in so /api/agents resolves.",
      });
      return;
    }
    setInvokeBusy(true);
    const res = await invokeAgentApi(apiProf.id, { message: invokeDraft });
    setInvokeBusy(false);
    if (!res.ok) {
      toast.error(res.reason === "unauthorized" ? "Sign in with wallet to invoke agents" : "Invoke failed");
      return;
    }
    setInvokeReply(res.reply);
    if (res.provider === "mock" && res.debugLlm) {
      toast.error("Groq unavailable — mock reply shown", {
        description: res.debugLlm.slice(0, 400),
        duration: 12_000,
      });
    } else {
      toast.success(`HiveMind agent · ${res.provider} · ${res.model}`);
    }
  };

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
          <Particles count={22} />

          <div className="relative px-6 py-6">
            <PageHeader
              title={`${agent.name} Agent`}
              subtitle={agent.spec}
              backTo="/marketplace"
              crumbs={[{ label: "Marketplace", to: "/marketplace" }, { label: agent.name }]}
              status={{ label: agent.status === "online" ? "Live · Operational" : agent.status, tone: agent.status === "online" ? "emerald" : "purple" }}
              actions={
                <div className="flex gap-2">
                  <Link to={hireHref} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/80 hover:border-cyan-300/30">
                    Add to Mission
                  </Link>
                  <Link to={hireHref} className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black">
                    <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
                    <Zap className="relative h-3.5 w-3.5" />
                    <span className="relative">Hire {agent.name}</span>
                  </Link>
                </div>
              }
            />

            <Card className="mb-6 border-cyan-300/25">
              <div className="p-5">
                <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Invoke specialist</div>
                <p className="mt-1 max-w-2xl text-sm text-white/55">
                  Wallet session required. Backend uses Groq when <span className="font-mono text-white/70">GROQ_API_KEY</span> is set;
                  otherwise you get deterministic mock reasoning aligned with this agent&apos;s role (see technical architecture § agent runtime).
                </p>
                <textarea
                  value={invokeDraft}
                  onChange={(e) => setInvokeDraft(e.target.value)}
                  rows={3}
                  className="mt-3 w-full resize-none rounded-lg border border-white/10 bg-black/50 p-3 text-sm text-white placeholder:text-white/30 focus:border-cyan-300/40 focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runInvoke()}
                    disabled={invokeBusy}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-300 to-purple-300 px-4 py-2 text-xs font-medium text-black disabled:opacity-50"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    {invokeBusy ? "Running…" : `Run ${agent.name}`}
                  </button>
                  {apiProf && (
                    <span className="text-[11px] font-mono text-white/40">
                      registry · {apiProf.id}
                    </span>
                  )}
                </div>
                {invokeReply && (
                  <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-white/10 bg-black/60 p-3">
                    <AgentMessageMarkdown source={invokeReply} />
                  </div>
                )}
              </div>
            </Card>

            {/* Hero profile */}
            <Card className="mb-6">
              <div className="absolute inset-0 opacity-50">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `radial-gradient(circle at 20% 0%, ${agent.color}33, transparent 50%), radial-gradient(circle at 80% 100%, rgba(168,85,247,0.18), transparent 50%)`,
                  }}
                />
              </div>
              <div className="relative grid gap-6 p-6 lg:grid-cols-[280px_1fr_280px]">
                {/* Avatar block */}
                <div className="flex flex-col items-center text-center">
                  <div className="relative h-28 w-28">
                    <motion.div
                      className="absolute inset-0 rounded-3xl"
                      style={{ background: `radial-gradient(circle, ${agent.color}66, transparent 70%)` }}
                      animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <div
                      className="relative flex h-28 w-28 items-center justify-center rounded-3xl border border-white/15"
                      style={{
                        background: `linear-gradient(135deg, ${agent.color}66, ${agent.color}11)`,
                        boxShadow: `0 0 60px ${agent.color}88`,
                      }}
                    >
                      <Bot className="h-12 w-12 text-white" />
                    </div>
                    <motion.span
                      className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full ring-2 ring-black"
                      style={{ background: agent.status === "online" ? "#10b981" : "#f59e0b" }}
                      animate={agent.status === "online" ? { opacity: [0.5, 1, 0.5] } : {}}
                      transition={{ duration: 1.6, repeat: Infinity }}
                    />
                  </div>
                  <div className="mt-4 text-2xl tracking-tight">{agent.name}</div>
                  <div className="text-sm text-white/55">{agent.spec}</div>
                  <div className="mt-3 flex items-center gap-2 text-[11px]">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-white/60">{agent.model}</span>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/5 px-2 py-0.5 text-emerald-300">{agent.status}</span>
                  </div>
                  <div className="mt-4 inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-1 font-mono text-[11px] text-white/55">
                    <button
                      type="button"
                      onClick={onCopyWallet}
                      title="Copy wallet address"
                      className="px-1.5 py-1 hover:text-cyan-200"
                    >
                      {agent.wallet}
                    </button>
                    {explorerHref ? (
                      <a
                        href={explorerHref}
                        target="_blank"
                        rel="noreferrer"
                        title="View on Solana Explorer"
                        className="border-l border-white/10 px-1.5 py-1 hover:text-cyan-200"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="border-l border-white/10 px-1.5 py-1 opacity-40">
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Headline metrics */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-cyan-300">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    </span>
                    Currently · executing 2 missions
                  </div>
                  <div className="mt-2 max-w-xl text-sm text-white/70">
                    Autonomous {agent.spec.split("·")[0].trim().toLowerCase()} specialist with verified on-chain reputation.
                    Coordinates with {peers.length} peer agents across deployed workforces.
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { l: "Reputation", v: agent.rep, sub: "★ verified", c: "#fbbf24", icon: Star },
                      { l: "Success", v: `${agent.success}%`, sub: "all-time", c: "#10b981", icon: CheckCircle2 },
                      { l: "Missions", v: agent.missions, sub: "completed", c: "#22d3ee", icon: Layers },
                      { l: "Latency", v: `${agent.latency}ms`, sub: "avg p95", c: "#a855f7", icon: Clock },
                    ].map((m) => (
                      <motion.div
                        key={m.l}
                        whileHover={{ y: -2 }}
                        className="rounded-xl border border-white/10 bg-black/30 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <m.icon className="h-3.5 w-3.5" style={{ color: m.c }} />
                          <span className="text-[9px] uppercase tracking-widest text-white/40">{m.l}</span>
                        </div>
                        <div className="mt-2 text-2xl tabular-nums">{m.v}</div>
                        <div className="text-[10px] text-white/40">{m.sub}</div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Pricing */}
                <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-300/10 to-purple-300/5 p-5">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Hire Rate</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-4xl tabular-nums">{agent.price.toFixed(2)}</span>
                    <span className="text-sm text-white/50">SOL / mission</span>
                  </div>
                  <div className="mt-1 text-[11px] text-white/40">≈ ${(agent.price * 184).toFixed(0)} USD avg</div>

                  <div className="mt-4 space-y-2 text-[11px]">
                    {[
                      { i: Shield, t: "Escrow-protected payment", c: "#10b981" },
                      { i: Zap,    t: "Instant deployment", c: "#22d3ee" },
                      { i: Brain,  t: "Persistent memory included", c: "#a855f7" },
                    ].map((x, i) => (
                      <div key={i} className="flex items-center gap-2 text-white/70">
                        <x.i className="h-3 w-3" style={{ color: x.c }} />
                        {x.t}
                      </div>
                    ))}
                  </div>

                  <Link to={hireHref} className="group relative mt-5 block w-full overflow-hidden rounded-lg px-4 py-2.5 text-sm text-black">
                    <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 via-white to-purple-300" />
                    <span className="relative flex items-center justify-center gap-2">
                      <Zap className="h-4 w-4" /> Hire Agent
                    </span>
                  </Link>
                </div>
              </div>
            </Card>

            {/* Capabilities + Performance */}
            <div className="mb-6 grid gap-6 lg:grid-cols-3">
              {/* Capability radar */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    Capabilities
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">competency map</span>
                </div>
                <div className="p-5">
                  <svg viewBox="0 0 200 200" className="w-full">
                    <g transform="translate(100,100)">
                      {[1, 0.75, 0.5, 0.25].map((s) => (
                        <polygon
                          key={s}
                          points={skillsData
                            .map((_, i) => {
                              const ang = (i / skillsData.length) * Math.PI * 2 - Math.PI / 2;
                              return `${Math.cos(ang) * 80 * s},${Math.sin(ang) * 80 * s}`;
                            })
                            .join(" ")}
                          fill="none"
                          stroke="rgba(34,211,238,0.10)"
                          strokeWidth="0.6"
                        />
                      ))}
                      <polygon
                        points={skillsData
                          .map((sk, i) => {
                            const ang = (i / skillsData.length) * Math.PI * 2 - Math.PI / 2;
                            const r = (sk.v / 100) * 80;
                            return `${Math.cos(ang) * r},${Math.sin(ang) * r}`;
                          })
                          .join(" ")}
                        fill={`${agent.color}22`}
                        stroke={agent.color}
                        strokeWidth="1.2"
                      />
                      {skillsData.map((sk, i) => {
                        const ang = (i / skillsData.length) * Math.PI * 2 - Math.PI / 2;
                        const r = (sk.v / 100) * 80;
                        return (
                          <circle
                            key={sk.skill}
                            cx={Math.cos(ang) * r}
                            cy={Math.sin(ang) * r}
                            r="2.5"
                            fill={agent.color}
                          />
                        );
                      })}
                      {skillsData.map((sk, i) => {
                        const ang = (i / skillsData.length) * Math.PI * 2 - Math.PI / 2;
                        return (
                          <text
                            key={`l-${sk.skill}`}
                            x={Math.cos(ang) * 95}
                            y={Math.sin(ang) * 95}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="7"
                            fill="rgba(255,255,255,0.55)"
                            style={{ textTransform: "uppercase", letterSpacing: "0.15em" }}
                          >
                            {sk.skill}
                          </text>
                        );
                      })}
                    </g>
                  </svg>

                  <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
                    {skillsData.map((sk) => (
                      <div key={sk.skill} className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-2 py-1">
                        <span className="text-white/60">{sk.skill}</span>
                        <span className="tabular-nums" style={{ color: agent.color }}>{sk.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Performance analytics */}
              <Card className="lg:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-cyan-300" />
                    Performance Analytics
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">last 30d</span>
                </div>
                <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-3">
                  {[
                    { k: "Success Rate", v: `${agent.success}%`, d: "+0.4", c: "#10b981" },
                    { k: "Reasoning Quality", v: "0.94", d: "+0.02", c: "#a855f7" },
                    { k: "Collab. Efficiency", v: "92%", d: "+3", c: "#22d3ee" },
                    { k: "Avg Latency", v: `${agent.latency}ms`, d: "−12", c: "#3b82f6" },
                    { k: "Throughput", v: "24/h", d: "+2", c: "#f59e0b" },
                    { k: "Trust Score", v: "0.97", d: "+0.01", c: "#ec4899" },
                  ].map((m) => (
                    <div key={m.k} className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{m.k}</div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-2xl tabular-nums">{m.v}</span>
                        <span className="text-[11px] text-emerald-300">▲ {m.d}</span>
                      </div>
                      <div className="mt-2">
                        <Sparkline color={m.c} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Tools + Mission History */}
            <div className="mb-6 grid gap-6 lg:grid-cols-3">
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Cpu className="h-4 w-4 text-cyan-300" />
                    Tools & Workflows
                  </div>
                  <span className="text-[10px] text-white/40">{tools.length} bound</span>
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap gap-1.5">
                    {tools.map((t) => (
                      <span
                        key={t}
                        className="rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10.5px] text-white/70"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 text-[10px] uppercase tracking-[0.3em] text-white/40">Workflow Patterns</div>
                  <div className="mt-2 space-y-1.5 text-[11px]">
                    {[
                      "plan → research → generate → review",
                      "delegate → coordinate → settle",
                      "memory.recall → reason → execute",
                    ].map((w) => (
                      <div key={w} className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                        <GitBranch className="h-3 w-3 text-cyan-300" />
                        <span className="font-mono text-white/65">{w}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="lg:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Layers className="h-4 w-4 text-cyan-300" />
                    Mission History
                  </div>
                  <span className="text-[10px] text-white/40">last {missions.length} missions</span>
                </div>
                <div className="p-3">
                  <div className="relative space-y-2">
                    {missions.map((m, i) => (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="relative flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3"
                      >
                        <div className="flex flex-col items-center">
                          <div
                            className="h-2.5 w-2.5 rounded-full ring-2 ring-black"
                            style={{ background: m.c, boxShadow: `0 0 10px ${m.c}` }}
                          />
                          {i < missions.length - 1 && <div className="h-7 w-px bg-gradient-to-b from-white/15 to-transparent" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-mono text-[11px] text-white/40">{m.id}</span>
                            <span className="truncate">{m.t}</span>
                          </div>
                          <div className="text-[11px] text-white/55">
                            {m.role} · with <span className="text-white/75">{m.peers.join(", ")}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-emerald-300">{m.outcome}</div>
                          <div className="text-[10px] text-white/40">{m.date}</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* Memory + Peers */}
            <div className="mb-6 grid gap-6 lg:grid-cols-2">
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Brain className="h-4 w-4 text-purple-300" />
                    Semantic Memory
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-purple-300">vector recall · {memoryNodes.length} clusters</span>
                </div>
                <div className="relative h-[320px] overflow-hidden">
                  <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                    {memoryNodes.map((n, i) => (
                      <line
                        key={`ml-${i}`}
                        x1={50} y1={50} x2={n.x} y2={n.y}
                        stroke="rgba(168,85,247,0.18)"
                        strokeWidth="0.18"
                        strokeDasharray="0.8 1.2"
                      />
                    ))}
                    {memoryNodes.map((n, i) => (
                      <motion.circle
                        key={`mp-${i}`}
                        r="0.5"
                        fill="#a855f7"
                        initial={{ cx: 50, cy: 50, opacity: 0 }}
                        animate={{
                          cx: [50, n.x],
                          cy: [50, n.y],
                          opacity: [0, 0.85, 0],
                        }}
                        transition={{ duration: 3.6, repeat: Infinity, delay: i * 0.4, ease: "linear", times: [0, 0.6, 1] }}
                      />
                    ))}
                  </svg>

                  <div
                    className="absolute"
                    style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
                  >
                    <motion.div
                      className="flex h-14 w-14 items-center justify-center rounded-full border border-purple-300/30 bg-gradient-to-br from-purple-400/30 to-cyan-400/20 backdrop-blur"
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    >
                      <Brain className="h-5 w-5 text-purple-200" />
                    </motion.div>
                  </div>

                  {memoryNodes.map((n) => (
                    <div
                      key={n.id}
                      className="absolute"
                      style={{ left: `${n.x}%`, top: `${n.y}%`, transform: "translate(-50%, -50%)" }}
                    >
                      <div className="h-2 w-2 rounded-full bg-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.9)]" />
                      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#06091a]/95 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white/80">
                        {n.label}
                        <span className="ml-1 text-purple-300">{n.sim}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Network className="h-4 w-4 text-cyan-300" />
                    Coordination Network
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">peer pathways</span>
                </div>
                <div className="relative h-[320px] overflow-hidden">
                  <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                    {peers.map((p, i) => (
                      <line
                        key={`pe-${i}`}
                        x1={50} y1={50} x2={p.x} y2={p.y}
                        stroke={p.c} strokeOpacity={0.3}
                        strokeWidth={p.w * 0.08}
                      />
                    ))}
                    {peers.map((p, i) => (
                      <motion.circle
                        key={`pf-${i}`}
                        r="0.5"
                        fill={p.c}
                        initial={{ cx: 50, cy: 50, opacity: 0 }}
                        animate={{
                          cx: [50, p.x, 50],
                          cy: [50, p.y, 50],
                          opacity: [0, 0.9, 0],
                        }}
                        transition={{ duration: 3.4, repeat: Infinity, delay: i * 0.5, ease: "linear" }}
                      />
                    ))}
                  </svg>
                  <div className="absolute" style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15"
                      style={{
                        background: `linear-gradient(135deg, ${agent.color}66, ${agent.color}11)`,
                        boxShadow: `0 0 30px ${agent.color}99`,
                      }}
                    >
                      <Bot className="h-6 w-6 text-white" />
                    </div>
                    <div className="mt-2 text-center text-[10px] uppercase tracking-[0.25em] text-cyan-200/70">{agent.name}</div>
                  </div>
                  {peers.map((p) => (
                    <Link
                      key={p.id}
                      to={`/marketplace/${p.id}`}
                      className="absolute"
                      style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%, -50%)" }}
                    >
                      <div className="flex flex-col items-center">
                        <div
                          className="h-3 w-3 rounded-full ring-2 ring-black/60"
                          style={{ background: p.c, boxShadow: `0 0 12px ${p.c}` }}
                        />
                        <div className="mt-1 rounded-md border border-white/10 bg-[#06091a]/95 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white/80">
                          {p.name}
                        </div>
                        <div className="mt-0.5 text-[9px]" style={{ color: p.c }}>×{p.w} missions</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>

            {/* Wallet + Live Status */}
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Wallet className="h-4 w-4 text-emerald-300" />
                    Wallet & Earnings
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-300">on-chain · solana</span>
                </div>
                <div className="grid gap-4 p-5 md:grid-cols-3">
                  <div className="md:col-span-1">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Lifetime Earned</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-3xl tabular-nums text-emerald-300">412.84</span>
                      <span className="text-sm text-white/50">SOL</span>
                    </div>
                    <div className="mt-1 text-[11px] text-white/40">≈ $76,000 USD</div>

                    <div className="mt-4 space-y-2 text-[11px]">
                      {[
                        { l: "Active escrow", v: "12.40 SOL", c: "#22d3ee" },
                        { l: "Last 30d", v: "48.20 SOL", c: "#a855f7" },
                        { l: "Avg / mission", v: `${agent.price.toFixed(2)} SOL`, c: "#10b981" },
                      ].map((x) => (
                        <div key={x.l} className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                          <span className="text-white/60">{x.l}</span>
                          <span className="tabular-nums" style={{ color: x.c }}>{x.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
                      <span>Earnings · last 30d</span>
                      <span className="text-emerald-300">+18.4% MoM</span>
                    </div>
                    <div className="mt-2 h-44 w-full rounded-xl border border-white/10 bg-black/30 p-2">
                      <svg viewBox="0 0 400 140" className="h-full w-full" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="wf" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0,110 L40,98 L80,104 L120,82 L160,90 L200,60 L240,68 L280,40 L320,46 L360,22 L400,28 L400,140 L0,140 Z"
                          fill="url(#wf)"
                        />
                        <path
                          d="M0,110 L40,98 L80,104 L120,82 L160,90 L200,60 L240,68 L280,40 L320,46 L360,22 L400,28"
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="1.6"
                        />
                      </svg>
                    </div>

                    <div className="mt-4 text-[10px] uppercase tracking-[0.3em] text-white/40">Recent Transactions</div>
                    <div className="mt-2 space-y-1.5">
                      {[
                        { t: "Mission payout · M-247", a: "+0.42", at: "16:42", x: "4kJ2…91FE" },
                        { t: "Escrow release · M-241", a: "+0.36", at: "14:08", x: "8aB1…02CD" },
                        { t: "Reputation reward",      a: "+0.04", at: "11:22", x: "3pQ7…66TX" },
                      ].map((tx, i) => (
                        <div key={i} className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[11px]">
                          <span className="flex items-center gap-2">
                            <Database className="h-3 w-3 text-cyan-300" />
                            <span className="text-white/70">{tx.t}</span>
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="font-mono text-[10px] text-white/40">{tx.x}</span>
                            <span className="font-mono text-[10px] text-white/30">{tx.at}</span>
                            <span className="tabular-nums text-emerald-300">{tx.a} SOL</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Radio className="h-4 w-4 text-cyan-300" />
                    Live Execution
                  </div>
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    className="text-[10px] uppercase tracking-[0.25em] text-cyan-300"
                  >
                    streaming
                  </motion.span>
                </div>
                <div className="p-4">
                  <div className="mb-3 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">Current Task</div>
                    <div className="mt-1 text-sm text-white/85">KPI Tree v3 · audience rebalance</div>
                    <div className="mt-1 text-[11px] text-white/50">stage · reasoning · 38% complete</div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-purple-300"
                        initial={{ width: 0 }}
                        animate={{ width: "38%" }}
                        transition={{ duration: 1.2 }}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/5 bg-black/60 p-3 font-mono text-[11px] leading-relaxed">
                    {[
                      { c: "text-white/40", t: "» chain.reason(M-247)" },
                      { c: "text-cyan-300", t: "  ↳ planning step 4/9" },
                      { c: "text-white/40", t: "» memory.recall('audience')" },
                      { c: "text-purple-300", t: "  ↳ 6 vectors retrieved" },
                      { c: "text-white/40", t: "» delegate(Vega, segment)" },
                      { c: "text-blue-300",  t: "  ↳ peer ack received" },
                      { c: "text-white/70", t: "  thought: rebalance toward DeFi" },
                    ].map((l, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.07 }}
                        className={l.c}
                      >
                        {l.t}
                      </motion.div>
                    ))}
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
                      { l: "ctx", v: "248k" },
                      { l: "tokens/s", v: "184" },
                      { l: "ws", v: "live" },
                    ].map((x) => (
                      <div key={x.l} className="rounded-md border border-white/5 bg-white/[0.02] py-2">
                        <div className="text-white/40">{x.l}</div>
                        <div className="tabular-nums text-cyan-200">{x.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
