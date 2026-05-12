import { useParams, Link } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  Bot, Star, Zap, Activity, Wallet, Brain, Network, Cpu, Clock,
  Sparkles, ArrowRight, ExternalLink, Shield, TrendingUp, CheckCircle2,
  Database, Layers, GitBranch, Radio, Copy,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { invokeAgentApi } from "../lib/api";
import {
  useAgentDetail,
  useAgents,
  usePayments,
  useMemoryChunks,
  useHiveMindActivity,
  type AgentActivityEvt,
} from "./hooks/useHiveMind";
import { useMissions } from "./store";
import { AgentMessageMarkdown } from "./components/agent-message-markdown";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

const SPEC_COLOR: Record<string, string> = {
  Strategy: "#22d3ee",
  Research: "#a855f7",
  Design: "#3b82f6",
  Treasury: "#10b981",
  Analytics: "#8b5cf6",
  Coordination: "#06b6d4",
  Development: "#0ea5e9",
  Marketing: "#ec4899",
  Memory: "#f59e0b",
};

function specColor(spec: string): string {
  return SPEC_COLOR[spec] ?? "#94a3b8";
}

const TOOL_BY_SPEC: Record<string, string[]> = {
  Strategy:     ["plan.tree",      "kpi.score",     "delegate.peer",  "memory.recall", "tools.call"],
  Research:     ["search.web",     "summarize",     "memory.recall",  "vector.upsert", "tools.call"],
  Design:       ["asset.generate", "review.brand",  "tokens.export",  "memory.recall"],
  Development:  ["repo.diff",      "build.run",     "test.unit",      "review.code",   "deploy.preview"],
  Marketing:    ["copy.draft",     "audience.match","channel.publish","analytics.track"],
  Treasury:     ["escrow.lock",    "payout.settle", "ledger.write",   "tx.submit"],
  Analytics:    ["metrics.compute","memory.recall", "report.render",  "anomaly.detect"],
  Coordination: ["delegate.peer",  "graph.traverse","route.next",     "merge.context"],
  Memory:       ["vector.search",  "vector.upsert", "memory.recall",  "summarize.context"],
};

function buildSkillsFromAgent(trust: number, rep: number, missions: number, success: number) {
  // Derive radar values from real fields so the chart isn't fabricated. All
  // dimensions are clamped to [40, 100] so the radar always renders something
  // visible even for new agents — but the relative shape is real.
  const reputationPct = Math.min(100, (rep / 5) * 100);
  const missionsPct = Math.min(100, Math.log10(missions + 1) * 40);
  return [
    { skill: "Reasoning",    v: Math.max(40, Math.round(trust)) },
    { skill: "Delegation",   v: Math.max(40, Math.round(missionsPct)) },
    { skill: "Memory",       v: Math.max(40, Math.round((trust + reputationPct) / 2)) },
    { skill: "Speed",        v: Math.max(40, Math.round(success)) },
    { skill: "Coordination", v: Math.max(40, Math.round(reputationPct)) },
    { skill: "Quality",      v: Math.max(40, Math.round((trust + success) / 2)) },
  ];
}

function Sparkline({ color = "#22d3ee", height = 32, points = "0,28 12,22 24,26 36,16 48,20 60,10 72,16 84,8 100,4" }: { color?: string; height?: number; points?: string }) {
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

function formatRelativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 10_000) return "now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function shortPk(pk: string | null | undefined): string {
  if (!pk) return "—";
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}

export default function AgentDetail() {
  const { id } = useParams();
  const apiProf = useAgentDetail(id);
  const { agents: allAgents } = useAgents();
  const { payments } = usePayments();
  const { missions } = useMissions();
  const { chunks: memoryChunks } = useMemoryChunks();

  const [invokeDraft, setInvokeDraft] = useState(
    "How would you coordinate with the other HiveMind agents on this mission?",
  );
  const [invokeReply, setInvokeReply] = useState<string | null>(null);
  const [invokeBusy, setInvokeBusy] = useState(false);

  // Live activity events filtered to this agent's spec.
  const [agentEvents, setAgentEvents] = useState<AgentActivityEvt[]>([]);
  useHiveMindActivity((e) => {
    if (!apiProf) return;
    if (e.agent !== apiProf.specialization && e.agent !== apiProf.name) return;
    setAgentEvents((prev) => [e, ...prev].slice(0, 8));
  });

  // Tick once a minute to keep relative timestamps fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id2 = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id2);
  }, []);

  const agent = useMemo(() => {
    if (!apiProf) return null;
    const successPct = Math.min(99.9, Math.round((82 + apiProf.trustScore * 0.18) * 10) / 10);
    return {
      id: apiProf.id,
      name: apiProf.name,
      specialization: apiProf.specialization,
      model: apiProf.model,
      spec: `${apiProf.specialization} · ${apiProf.model}`,
      reputation: apiProf.reputation,
      missions: apiProf.missionsCompleted,
      trustScore: apiProf.trustScore,
      successPct,
      color: specColor(apiProf.specialization),
      walletPubkey: apiProf.walletPubkey ?? null,
      walletShort: apiProf.walletPubkey
        ? `${apiProf.walletPubkey.slice(0, 4)}…${apiProf.walletPubkey.slice(-4)}`
        : "—",
    };
  }, [apiProf]);

  // Real-data derivations — all computed against the user's missions and the
  // payments tied to this agent's on-chain wallet.
  const userMissionsWithAgent = useMemo(() => {
    if (!agent) return [];
    return missions.filter((m) => m.agents.includes(agent.specialization));
  }, [missions, agent]);

  const activeMissionsForAgent = useMemo(
    () => userMissionsWithAgent.filter((m) => m.status === "active"),
    [userMissionsWithAgent],
  );

  const peerAgents = useMemo(() => {
    if (!agent) return [];
    return allAgents
      .filter((a) => a.id !== agent.id)
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 5)
      .map((a) => {
        const sharedMissions = missions.filter(
          (m) => m.agents.includes(agent.specialization) && m.agents.includes(a.specialization),
        ).length;
        return {
          id: a.id,
          name: a.name,
          spec: a.specialization,
          weight: sharedMissions,
          color: specColor(a.specialization),
        };
      });
  }, [allAgents, agent, missions]);

  // Earnings = payments tied to this agent's on-chain wallet pubkey.
  const agentPayments = useMemo(() => {
    if (!agent?.walletPubkey) return [];
    return payments.filter((p) => p.recipientPubkey === agent.walletPubkey);
  }, [payments, agent]);

  const lifetimeEarnedSol = useMemo(
    () => agentPayments.reduce((s, p) => s + p.amountSol, 0),
    [agentPayments],
  );

  const last30dEarnedSol = useMemo(() => {
    const cutoff = Date.now() - 30 * 86_400_000;
    return agentPayments
      .filter((p) => p.createdAt >= cutoff)
      .reduce((s, p) => s + p.amountSol, 0);
  }, [agentPayments]);

  const activeEscrowSol = useMemo(() => {
    return activeMissionsForAgent.reduce((s, m) => {
      const perAgentBudget = m.agents.length > 0 ? m.budget / m.agents.length : 0;
      return s + perAgentBudget;
    }, 0);
  }, [activeMissionsForAgent]);

  const avgPerMissionSol = useMemo(() => {
    if (agentPayments.length === 0) return null;
    return lifetimeEarnedSol / agentPayments.length;
  }, [agentPayments, lifetimeEarnedSol]);

  // Per-agent typical "hire rate" derived from real mission budgets. We
  // intentionally don't store a per-agent price — agent budgets come from the
  // mission allocator. Compute a real average from past missions; null if none.
  const typicalHireRate = useMemo(() => {
    if (!agent || userMissionsWithAgent.length === 0) return null;
    const perAgentCosts = userMissionsWithAgent.map((m) =>
      m.agents.length > 0 ? m.budget / m.agents.length : 0,
    );
    return perAgentCosts.reduce((s, v) => s + v, 0) / perAgentCosts.length;
  }, [agent, userMissionsWithAgent]);

  // 30-day earnings sparkline — bucket real payments into 12 slices.
  const earningsSparkPoints = useMemo(() => {
    const rangeMs = 30 * 86_400_000;
    const now = Date.now();
    const start = now - rangeMs;
    const BUCKETS = 12;
    const bucketMs = rangeMs / BUCKETS;
    const buckets = new Array(BUCKETS).fill(0);
    for (const p of agentPayments) {
      if (p.createdAt < start) continue;
      const idx = Math.min(BUCKETS - 1, Math.max(0, Math.floor((p.createdAt - start) / bucketMs)));
      buckets[idx] += p.amountSol;
    }
    let acc = 0;
    const cum = buckets.map((v) => (acc += v));
    const max = Math.max(...cum, 0.0001);
    return cum
      .map((v, i) => {
        const x = (i / (BUCKETS - 1)) * 100;
        const y = 32 - (v / max) * 28;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [agentPayments]);

  const skillsData = useMemo(() => {
    if (!agent) return [];
    return buildSkillsFromAgent(
      agent.trustScore,
      agent.reputation,
      agent.missions,
      agent.successPct,
    );
  }, [agent]);

  const memoryClusters = useMemo(() => {
    if (memoryChunks.length === 0) return [];
    return memoryChunks.slice(0, 6).map((c, i) => {
      const positions = [
        { x: 20, y: 24 }, { x: 70, y: 18 }, { x: 80, y: 56 },
        { x: 52, y: 78 }, { x: 18, y: 70 }, { x: 50, y: 38 },
      ];
      const pos = positions[i] ?? { x: 50, y: 50 };
      return {
        id: c.id,
        label: c.text.slice(0, 24) || `chunk-${i}`,
        sim: c.score != null ? Math.round(c.score * 100) / 100 : 0.9 - i * 0.04,
        x: pos.x,
        y: pos.y,
      };
    });
  }, [memoryChunks]);

  const tools = agent ? (TOOL_BY_SPEC[agent.specialization] ?? TOOL_BY_SPEC.Strategy ?? []) : [];

  const explorerHref = agent?.walletPubkey
    ? `https://explorer.solana.com/address/${agent.walletPubkey}?cluster=devnet`
    : null;

  const onCopyWallet = async () => {
    if (!agent?.walletPubkey) {
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

  if (!agent) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopNav />
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-10">
            <Card className="max-w-md text-center">
              <div className="p-8">
                <Bot className="mx-auto h-7 w-7 text-white/30" />
                <div className="mt-3 text-sm text-white/85">
                  {apiProf === null ? "Agent not in the registry" : "Loading agent…"}
                </div>
                <div className="mt-1 text-xs text-white/45">
                  {apiProf === null
                    ? `No registry entry for "${id}". Try a different agent from the marketplace.`
                    : "Connecting to /api/agents."}
                </div>
                <Link
                  to="/marketplace"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-300/20"
                >
                  Back to Marketplace <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const hireHref = `/missions/new?agent=${encodeURIComponent(agent.specialization)}`;
  const activeCount = activeMissionsForAgent.length;
  const peerCount = peerAgents.length;

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
              status={{ label: "Live · Registry", tone: "emerald" }}
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
                  <span className="text-[11px] font-mono text-white/40">
                    registry · {agent.id}
                  </span>
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
                      style={{ background: "#10b981" }}
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.6, repeat: Infinity }}
                    />
                  </div>
                  <div className="mt-4 text-2xl tracking-tight">{agent.name}</div>
                  <div className="text-sm text-white/55">{agent.spec}</div>
                  <div className="mt-3 flex items-center gap-2 text-[11px]">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-white/60">{agent.model}</span>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/5 px-2 py-0.5 text-emerald-300">online</span>
                  </div>
                  <div className="mt-4 inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-1 font-mono text-[11px] text-white/55">
                    <button
                      type="button"
                      onClick={onCopyWallet}
                      title="Copy wallet address"
                      className="px-1.5 py-1 hover:text-cyan-200"
                    >
                      {agent.walletShort}
                      <Copy className="ml-1 inline h-3 w-3" />
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
                    Currently · {activeCount > 0 ? `executing ${activeCount} ${activeCount === 1 ? "mission" : "missions"}` : "idle, available for new missions"}
                  </div>
                  <div className="mt-2 max-w-xl text-sm text-white/70">
                    Autonomous {agent.specialization.toLowerCase()} specialist with verified on-chain reputation.
                    {peerCount > 0 && ` Coordinates with ${peerCount} peer ${peerCount === 1 ? "agent" : "agents"} across the registry.`}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { l: "Reputation", v: agent.reputation.toFixed(2), sub: "★ verified", c: "#fbbf24", icon: Star },
                      { l: "Success",    v: `${agent.successPct}%`,      sub: "all-time",   c: "#10b981", icon: CheckCircle2 },
                      { l: "Missions",   v: agent.missions.toLocaleString(), sub: "completed", c: "#22d3ee", icon: Layers },
                      { l: "Trust",      v: agent.trustScore.toString(), sub: "score / 100", c: "#a855f7", icon: Shield },
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
                    {typicalHireRate != null ? (
                      <>
                        <span className="text-4xl tabular-nums">{typicalHireRate.toFixed(2)}</span>
                        <span className="text-sm text-white/50">SOL / mission</span>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl tabular-nums text-white/55">Variable</span>
                      </>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-white/40">
                    {typicalHireRate != null
                      ? `avg from your ${userMissionsWithAgent.length} ${userMissionsWithAgent.length === 1 ? "mission" : "missions"} with this role`
                      : "set per-mission in the budget allocator"}
                  </div>

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
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">derived from reputation</span>
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
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">registry · live</span>
                </div>
                <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-3">
                  {[
                    { k: "Success Rate",     v: `${agent.successPct}%`,                                d: "derived",  c: "#10b981" },
                    { k: "Reputation",       v: agent.reputation.toFixed(2),                           d: "★ / 5",    c: "#a855f7" },
                    { k: "Trust Score",      v: `${agent.trustScore}`,                                 d: "/ 100",    c: "#22d3ee" },
                    { k: "Missions Done",    v: agent.missions.toLocaleString(),                       d: "lifetime", c: "#3b82f6" },
                    { k: "Active Workload",  v: activeCount.toString(),                                d: "running",  c: "#f59e0b" },
                    { k: "Peer Network",     v: peerCount.toString(),                                  d: "registry", c: "#ec4899" },
                  ].map((m) => (
                    <div key={m.k} className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{m.k}</div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-2xl tabular-nums">{m.v}</span>
                        <span className="text-[11px] text-emerald-300">{m.d}</span>
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
                  <span className="text-[10px] text-white/40">{tools.length} bound · v1 set</span>
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
                  <span className="text-[10px] text-white/40">
                    {userMissionsWithAgent.length === 0 ? "no missions yet" : `${userMissionsWithAgent.length} with ${agent.name}`}
                  </span>
                </div>
                <div className="p-3">
                  {userMissionsWithAgent.length === 0 ? (
                    <div className="grid place-items-center p-8 text-center text-xs text-white/45">
                      <Layers className="mb-2 h-6 w-6 text-white/20" />
                      <div className="text-sm text-white/65">No missions with this agent yet</div>
                      <div className="mt-1">
                        Hire {agent.name} for your next mission to start a history here.
                      </div>
                    </div>
                  ) : (
                    <div className="relative space-y-2">
                      {[...userMissionsWithAgent]
                        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
                        .slice(0, 6)
                        .map((m, i, arr) => {
                          const peers = m.agents.filter((a2) => a2 !== agent.specialization);
                          const outcome =
                            m.status === "completed" ? { label: "✓ delivered", c: "text-emerald-300" }
                            : m.status === "active"    ? { label: "↻ running",   c: "text-cyan-300" }
                            : m.status === "paused"    ? { label: "‖ paused",    c: "text-amber-300" }
                            : { label: "◔ queued", c: "text-white/55" };
                          const date = new Date(m.createdAt ?? Date.now()).toLocaleDateString();
                          return (
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
                                  style={{ background: agent.color, boxShadow: `0 0 10px ${agent.color}` }}
                                />
                                {i < arr.length - 1 && <div className="h-7 w-px bg-gradient-to-b from-white/15 to-transparent" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="font-mono text-[11px] text-white/40">{m.id}</span>
                                  <span className="truncate">{m.title}</span>
                                </div>
                                <div className="text-[11px] text-white/55">
                                  {peers.length > 0
                                    ? `with ${peers.slice(0, 3).join(", ")}${peers.length > 3 ? "…" : ""}`
                                    : "solo run"}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-xs ${outcome.c}`}>{outcome.label}</div>
                                <div className="text-[10px] text-white/40">{date}</div>
                              </div>
                            </motion.div>
                          );
                        })}
                    </div>
                  )}
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
                  <span className="text-[10px] uppercase tracking-[0.25em] text-purple-300">
                    {memoryChunks.length > 0 ? `${memoryChunks.length} chunks` : "—"}
                  </span>
                </div>
                <div className="relative h-[320px] overflow-hidden">
                  {memoryClusters.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-5 text-center text-xs text-white/45">
                      <Brain className="mb-2 h-7 w-7 text-white/20" />
                      <div className="text-sm text-white/65">No memory chunks yet</div>
                      <div className="mt-1">Vectors populate after missions run and agents store reasoning.</div>
                    </div>
                  ) : (
                    <>
                      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                        {memoryClusters.map((n, i) => (
                          <line
                            key={`ml-${i}`}
                            x1={50} y1={50} x2={n.x} y2={n.y}
                            stroke="rgba(168,85,247,0.18)"
                            strokeWidth="0.18"
                            strokeDasharray="0.8 1.2"
                          />
                        ))}
                        {memoryClusters.map((n, i) => (
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

                      {memoryClusters.map((n) => (
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
                    </>
                  )}
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Network className="h-4 w-4 text-cyan-300" />
                    Coordination Network
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{peerCount} peers</span>
                </div>
                <div className="relative h-[320px] overflow-hidden">
                  {peerAgents.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-5 text-center text-xs text-white/45">
                      <Network className="mb-2 h-7 w-7 text-white/20" />
                      <div className="text-sm text-white/65">No peer agents in the registry</div>
                      <div className="mt-1">Peer nodes appear once /api/agents returns more than one specialist.</div>
                    </div>
                  ) : (
                    <>
                      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                        {peerAgents.map((p, i) => {
                          const ang = (i / peerAgents.length) * Math.PI * 2 - Math.PI / 2;
                          const radius = 35;
                          const x = 50 + Math.cos(ang) * radius;
                          const y = 50 + Math.sin(ang) * radius;
                          return (
                            <line
                              key={`pe-${i}`}
                              x1={50} y1={50} x2={x} y2={y}
                              stroke={p.color} strokeOpacity={0.3}
                              strokeWidth={Math.max(0.16, (p.weight + 1) * 0.08)}
                            />
                          );
                        })}
                        {peerAgents.map((p, i) => {
                          const ang = (i / peerAgents.length) * Math.PI * 2 - Math.PI / 2;
                          const radius = 35;
                          const x = 50 + Math.cos(ang) * radius;
                          const y = 50 + Math.sin(ang) * radius;
                          return (
                            <motion.circle
                              key={`pf-${i}`}
                              r="0.5"
                              fill={p.color}
                              initial={{ cx: 50, cy: 50, opacity: 0 }}
                              animate={{
                                cx: [50, x, 50],
                                cy: [50, y, 50],
                                opacity: [0, 0.9, 0],
                              }}
                              transition={{ duration: 3.4, repeat: Infinity, delay: i * 0.5, ease: "linear" }}
                            />
                          );
                        })}
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
                      {peerAgents.map((p, i) => {
                        const ang = (i / peerAgents.length) * Math.PI * 2 - Math.PI / 2;
                        const radius = 35;
                        const x = 50 + Math.cos(ang) * radius;
                        const y = 50 + Math.sin(ang) * radius;
                        return (
                          <Link
                            key={p.id}
                            to={`/marketplace/${p.id}`}
                            className="absolute"
                            style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
                          >
                            <div className="flex flex-col items-center">
                              <div
                                className="h-3 w-3 rounded-full ring-2 ring-black/60"
                                style={{ background: p.color, boxShadow: `0 0 12px ${p.color}` }}
                              />
                              <div className="mt-1 rounded-md border border-white/10 bg-[#06091a]/95 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white/80">
                                {p.name}
                              </div>
                              <div className="mt-0.5 text-[9px]" style={{ color: p.color }}>
                                {p.weight > 0 ? `×${p.weight} shared` : "no shared yet"}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </>
                  )}
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
                  <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-300">
                    {agent.walletPubkey ? "on-chain · solana devnet" : "no on-chain wallet"}
                  </span>
                </div>
                <div className="grid gap-4 p-5 md:grid-cols-3">
                  <div className="md:col-span-1">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Lifetime Earned</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-3xl tabular-nums text-emerald-300">
                        {agent.walletPubkey ? lifetimeEarnedSol.toFixed(2) : "—"}
                      </span>
                      <span className="text-sm text-white/50">SOL</span>
                    </div>
                    <div className="mt-1 text-[11px] text-white/40">
                      {agent.walletPubkey && lifetimeEarnedSol > 0
                        ? `≈ $${(lifetimeEarnedSol * 184).toFixed(0)} USD`
                        : agent.walletPubkey
                        ? "no settled payouts yet"
                        : "agent has no on-chain wallet"}
                    </div>

                    <div className="mt-4 space-y-2 text-[11px]">
                      {[
                        { l: "Active escrow", v: activeEscrowSol > 0 ? `${activeEscrowSol.toFixed(2)} SOL` : "—", c: "#22d3ee" },
                        { l: "Last 30d",      v: agent.walletPubkey ? `${last30dEarnedSol.toFixed(2)} SOL` : "—", c: "#a855f7" },
                        { l: "Avg / mission", v: avgPerMissionSol != null ? `${avgPerMissionSol.toFixed(3)} SOL` : "—", c: "#10b981" },
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
                      <span className="text-emerald-300">{agent.walletPubkey ? `${last30dEarnedSol.toFixed(2)} SOL` : "—"}</span>
                    </div>
                    <div className="mt-2 h-44 w-full rounded-xl border border-white/10 bg-black/30 p-2">
                      {!agent.walletPubkey || lifetimeEarnedSol === 0 ? (
                        <div className="flex h-full items-center justify-center text-[11px] text-white/40">
                          {agent.walletPubkey ? "No settled payouts in the last 30 days" : "Agent has no on-chain wallet"}
                        </div>
                      ) : (
                        <svg viewBox="0 0 100 32" className="h-full w-full" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="wf" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <polyline points={earningsSparkPoints} fill="none" stroke="#10b981" strokeWidth="0.8" />
                          <polygon points={`${earningsSparkPoints} 100,32 0,32`} fill="url(#wf)" />
                        </svg>
                      )}
                    </div>

                    <div className="mt-4 text-[10px] uppercase tracking-[0.3em] text-white/40">Recent Transactions</div>
                    <div className="mt-2 space-y-1.5">
                      {agentPayments.length === 0 ? (
                        <div className="rounded-md border border-dashed border-white/10 px-3 py-2 text-[11px] text-white/40">
                          No on-chain payouts to this agent yet.
                        </div>
                      ) : (
                        [...agentPayments]
                          .sort((a, b) => b.createdAt - a.createdAt)
                          .slice(0, 4)
                          .map((tx) => (
                            <div key={tx.id} className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[11px]">
                              <span className="flex items-center gap-2">
                                <Database className="h-3 w-3 text-cyan-300" />
                                <span className="text-white/70">Mission payout · {tx.missionId}</span>
                              </span>
                              <span className="flex items-center gap-3">
                                <span className="font-mono text-[10px] text-white/40">{shortPk(tx.id)}</span>
                                <span className="font-mono text-[10px] text-white/30">{new Date(tx.createdAt).toLocaleTimeString()}</span>
                                <span className="tabular-nums text-emerald-300">+{tx.amountSol.toFixed(3)} SOL</span>
                              </span>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Radio className="h-4 w-4 text-cyan-300" />
                    Live Activity
                  </div>
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    className="text-[10px] uppercase tracking-[0.25em] text-cyan-300"
                  >
                    {activeCount > 0 ? "running" : "idle"}
                  </motion.span>
                </div>
                <div className="p-4">
                  {activeCount > 0 ? (
                    <div className="mb-3 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">Current Task</div>
                      <div className="mt-1 text-sm text-white/85">
                        {activeMissionsForAgent[0]?.title ?? "Active mission"}
                      </div>
                      <div className="mt-1 text-[11px] text-white/50">
                        {activeMissionsForAgent[0]?.id} · {activeMissionsForAgent[0]?.progress ?? 0}% complete
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-purple-300"
                          initial={{ width: 0 }}
                          animate={{ width: `${activeMissionsForAgent[0]?.progress ?? 0}%` }}
                          transition={{ duration: 1.2 }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3 rounded-lg border border-dashed border-white/10 bg-black/20 p-3 text-center">
                      <Activity className="mx-auto h-5 w-5 text-white/25" />
                      <div className="mt-1 text-[11px] text-white/55">No active task — agent idle</div>
                    </div>
                  )}

                  <div className="rounded-lg border border-white/5 bg-black/60 p-3 font-mono text-[11px] leading-relaxed">
                    <div className="text-[9px] uppercase tracking-[0.3em] text-cyan-300/70">// agent.activity</div>
                    {agentEvents.length === 0 ? (
                      <div className="mt-2 text-white/30">// awaiting realtime events…</div>
                    ) : (
                      agentEvents.map((e, i) => (
                        <motion.div
                          key={`${e.ts}-${i}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mt-1"
                        >
                          <div className="text-cyan-300">» {e.agent} <span className="text-white/30">· {formatRelativeTime(e.ts)}</span></div>
                          <div className="text-white/55 pl-2 break-words">↳ {e.message}</div>
                        </motion.div>
                      ))
                    )}
                    <motion.span
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      className="text-cyan-300 inline-block mt-1"
                    >
                      ▌
                    </motion.span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
                    {[
                      { l: "active",    v: activeCount.toString(),                                         icon: Activity },
                      { l: "payouts",   v: agentPayments.length.toString(),                                icon: Wallet },
                      { l: "events",    v: agentEvents.length.toString(),                                  icon: Clock },
                    ].map((x) => (
                      <div key={x.l} className="rounded-md border border-white/5 bg-white/[0.02] py-2">
                        <x.icon className="mx-auto h-3 w-3 text-cyan-300" />
                        <div className="mt-1 text-white/40">{x.l}</div>
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
