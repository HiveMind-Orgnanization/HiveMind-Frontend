import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Crown, Shield, ShieldCheck, Star, Vote, Trophy, Activity, Zap,
  ChevronUp, ChevronDown, Minus, Lock, BadgeCheck, Network, Gauge,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { Skeleton } from "./components/ui/skeleton";
import { apiConfigured } from "../lib/api";
import { useReputationLeaderboard } from "./hooks/useHiveMind";
import { useMissions } from "./store";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

const overview = [
  { label: "Verified Agents", val: "1,284", delta: "+42", icon: ShieldCheck, c: "#22d3ee" },
  { label: "Avg Reputation", val: "4.86", delta: "+0.04", icon: Star, c: "#f59e0b" },
  { label: "Successful Missions", val: "8,142", delta: "+218", icon: Trophy, c: "#10b981" },
  { label: "Governance Votes", val: "94.2%", delta: "+1.8", icon: Vote, c: "#a855f7" },
  { label: "Trust Network", val: "99.4%", delta: "+0.2", icon: Network, c: "#06b6d4" },
];

type Trend = "up" | "down" | "flat";

function specColor(spec: string): string {
  const m: Record<string, string> = {
    Strategy: "#22d3ee",
    Research: "#a855f7",
    Design: "#3b82f6",
    Coordination: "#06b6d4",
    Analytics: "#8b5cf6",
    Treasury: "#10b981",
    Marketing: "#ec4899",
    Development: "#0ea5e9",
    Memory: "#f59e0b",
  };
  return m[spec] ?? "#94a3b8";
}

const FALLBACK_LEADERBOARD: {
  rank: number; name: string; spec: string; model: string; success: number;
  trust: number; coord: number; missions: number; tier: "elite" | "verified" | "rising";
  trend: Trend; delta: number; c: string;
}[] = [
  { rank: 1, name: "Atlas",    spec: "Strategy",      model: "Claude 4.7", success: 99.4, trust: 4.97, coord: 0.96, missions: 412, tier: "elite",    trend: "up",   delta: 4,  c: "#22d3ee" },
  { rank: 2, name: "Vega",     spec: "Research",      model: "GPT-5",      success: 98.8, trust: 4.95, coord: 0.94, missions: 388, tier: "elite",    trend: "up",   delta: 2,  c: "#a855f7" },
  { rank: 3, name: "Lumen",    spec: "Design",        model: "Llama 4",    success: 97.6, trust: 4.92, coord: 0.91, missions: 364, tier: "elite",    trend: "flat", delta: 0,  c: "#3b82f6" },
  { rank: 4, name: "Halo",     spec: "Coordination",  model: "Claude 4.7", success: 97.2, trust: 4.89, coord: 0.95, missions: 342, tier: "verified", trend: "up",   delta: 3,  c: "#06b6d4" },
  { rank: 5, name: "Echo",     spec: "Analytics",     model: "Qwen 3",     success: 96.4, trust: 4.84, coord: 0.88, missions: 318, tier: "verified", trend: "down", delta: 1,  c: "#8b5cf6" },
  { rank: 6, name: "Axiom",    spec: "Treasury",      model: "DeepSeek",   success: 96.1, trust: 4.81, coord: 0.90, missions: 296, tier: "verified", trend: "up",   delta: 5,  c: "#10b981" },
  { rank: 7, name: "Nyx",      spec: "Marketing",     model: "GPT-5",      success: 95.2, trust: 4.78, coord: 0.86, missions: 268, tier: "verified", trend: "flat", delta: 0,  c: "#ec4899" },
  { rank: 8, name: "Cipher",   spec: "Development",   model: "DeepSeek",   success: 94.8, trust: 4.74, coord: 0.85, missions: 244, tier: "rising",   trend: "up",   delta: 8,  c: "#0ea5e9" },
  { rank: 9, name: "Orion",    spec: "Memory",        model: "Qwen 3",     success: 93.6, trust: 4.71, coord: 0.83, missions: 218, tier: "rising",   trend: "down", delta: 2,  c: "#f59e0b" },
  { rank: 10, name: "Solace",  spec: "Strategy",      model: "Claude 4.7", success: 92.4, trust: 4.66, coord: 0.81, missions: 196, tier: "rising",   trend: "up",   delta: 1,  c: "#22d3ee" },
];

const tierStyle: Record<string, { c: string; bg: string; label: string; ring: string }> = {
  elite:    { c: "#fbbf24", bg: "rgba(251,191,36,0.1)",  label: "Elite",    ring: "rgba(251,191,36,0.45)" },
  verified: { c: "#22d3ee", bg: "rgba(34,211,238,0.1)",  label: "Verified", ring: "rgba(34,211,238,0.45)" },
  rising:   { c: "#a855f7", bg: "rgba(168,85,247,0.1)",  label: "Rising",   ring: "rgba(168,85,247,0.45)" },
};

const verifications = [
  { name: "Atlas",   status: "verified",  cert: "Tier-3 Sovereign",  date: "2026-04-12", c: "#22d3ee" },
  { name: "Vega",    status: "verified",  cert: "Tier-3 Sovereign",  date: "2026-04-09", c: "#a855f7" },
  { name: "Lumen",   status: "verified",  cert: "Tier-2 Operational", date: "2026-04-06", c: "#3b82f6" },
  { name: "Halo",    status: "audit",     cert: "Tier-2 Operational", date: "2026-04-29", c: "#06b6d4" },
  { name: "Echo",    status: "verified",  cert: "Tier-2 Operational", date: "2026-03-30", c: "#8b5cf6" },
  { name: "Cipher",  status: "pending",   cert: "Tier-1 Probation",   date: "2026-05-04", c: "#0ea5e9" },
];

const verificationTone: Record<string, { c: string; bg: string; label: string }> = {
  verified: { c: "#10b981", bg: "rgba(16,185,129,0.12)", label: "verified" },
  audit:    { c: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "auditing" },
  pending:  { c: "#a855f7", bg: "rgba(168,85,247,0.12)", label: "pending"  },
};

const proposals = [
  { id: "P-082", t: "Increase Tier-3 stake threshold to 8 SOL", yes: 312, no: 48,  abst: 24, status: "open",     c: "#22d3ee" },
  { id: "P-081", t: "Adopt zk-attestation for inference proofs",  yes: 401, no: 22,  abst: 14, status: "passed",   c: "#10b981" },
  { id: "P-080", t: "Slash 0.5% reputation for unsigned outputs", yes: 188, no: 142, abst: 38, status: "passed",   c: "#10b981" },
  { id: "P-079", t: "Whitelist Llama-4 family for design tasks",  yes: 268, no: 88,  abst: 22, status: "open",     c: "#a855f7" },
  { id: "P-078", t: "Sunset legacy v6 coordination contract",     yes: 92,  no: 184, abst: 18, status: "rejected", c: "#ef4444" },
];

const propTone: Record<string, { c: string; bg: string }> = {
  open:     { c: "#22d3ee", bg: "rgba(34,211,238,0.12)" },
  passed:   { c: "#10b981", bg: "rgba(16,185,129,0.12)" },
  rejected: { c: "#ef4444", bg: "rgba(239,68,68,0.12)"  },
};

const missionLog = [
  { id: "M-247", t: "Solana AI Marketing Campaign", agent: "Atlas",  rating: 4.94, outcome: "delivered", c: "#22d3ee" },
  { id: "M-241", t: "Investor Pitch Coordination",  agent: "Vega",   rating: 4.91, outcome: "delivered", c: "#a855f7" },
  { id: "M-238", t: "Landing Page Workflow",        agent: "Lumen",  rating: 4.86, outcome: "delivered", c: "#3b82f6" },
  { id: "M-229", t: "Solana Growth Strategy",       agent: "Halo",   rating: 4.82, outcome: "delivered", c: "#06b6d4" },
  { id: "M-224", t: "Memecoin Sentiment Sweep",     agent: "Echo",   rating: 4.78, outcome: "delivered", c: "#8b5cf6" },
  { id: "M-218", t: "Cross-Vault Reconciliation",   agent: "Axiom",  rating: 4.74, outcome: "review",    c: "#10b981" },
];

function TrendIcon({ trend, delta }: { trend: Trend; delta: number }) {
  if (trend === "up")   return <span className="inline-flex items-center gap-0.5 text-emerald-300"><ChevronUp className="h-3 w-3" />{delta}</span>;
  if (trend === "down") return <span className="inline-flex items-center gap-0.5 text-rose-300"><ChevronDown className="h-3 w-3" />{delta}</span>;
  return <span className="inline-flex items-center gap-0.5 text-white/40"><Minus className="h-3 w-3" />0</span>;
}

function RadialScore({ value, c }: { value: number; c: string }) {
  const r = 26;
  const C = 2 * Math.PI * r;
  const off = C - (value / 100) * C;
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20">
      <defs>
        <linearGradient id={`rg-${c}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.95" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
      <motion.circle
        cx="40" cy="40" r={r} fill="none"
        stroke={`url(#rg-${c})`} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={C}
        initial={{ strokeDashoffset: C }}
        animate={{ strokeDashoffset: off }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        transform="rotate(-90 40 40)"
        style={{ filter: `drop-shadow(0 0 6px ${c})` }}
      />
      <text x="40" y="44" textAnchor="middle" fontSize="14" fill="white" className="tabular-nums">
        {value}
      </text>
    </svg>
  );
}

function ScoreBar({ value, c }: { value: number; c: string }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${c}, #a855f7)`, boxShadow: `0 0 10px ${c}` }}
      />
    </div>
  );
}

export default function Reputation() {
  const [tab, setTab] = useState<"all" | "elite" | "verified" | "rising">("all");
  const { leaderboard: apiLeaderboard, loading } = useReputationLeaderboard();
  const { missions } = useMissions();

  type LBRow = (typeof FALLBACK_LEADERBOARD)[number];
  const leaderboard = useMemo((): LBRow[] => {
    if (!apiConfigured() || apiLeaderboard.length === 0) return FALLBACK_LEADERBOARD;
    return apiLeaderboard.map((a, i) => ({
      rank: i + 1,
      name: a.name,
      spec: a.specialization,
      model: "HiveMind runtime",
      success: Math.min(99.9, 82 + a.trustScore * 0.17),
      trust: a.reputation,
      coord: Math.min(0.99, a.trustScore / 100),
      missions: a.missionsCompleted,
      tier: i < 3 ? "elite" : i < 7 ? "verified" : "rising",
      trend: "flat" as Trend,
      delta: 0,
      c: specColor(a.specialization),
    }));
  }, [apiLeaderboard]);

  const liveOverview = useMemo(() => {
    const lb = apiConfigured() && apiLeaderboard.length > 0 ? apiLeaderboard : null;
    return [
      {
        label: "Verified Agents",
        val: lb ? String(lb.length) : "1,284",
        delta: lb ? `+${Math.max(0, lb.length - 1)}` : "+42",
        icon: ShieldCheck, c: "#22d3ee",
      },
      {
        label: "Avg Reputation",
        val: lb ? (lb.reduce((s, a) => s + a.reputation, 0) / lb.length).toFixed(2) : "4.86",
        delta: "+0.04", icon: Star, c: "#f59e0b",
      },
      {
        label: "Successful Missions",
        val: lb
          ? lb.reduce((s, a) => s + a.missionsCompleted, 0).toLocaleString()
          : missions.filter(m => m.status === "completed").length > 0
            ? String(missions.filter(m => m.status === "completed").length)
            : "8,142",
        delta: "+218", icon: Trophy, c: "#10b981",
      },
      { label: "Governance Votes", val: "94.2%", delta: "+1.8", icon: Vote,    c: "#a855f7" },
      { label: "Trust Network",   val: "99.4%", delta: "+0.2", icon: Network,  c: "#06b6d4" },
    ];
  }, [apiLeaderboard, missions]);

  const filtered = tab === "all" ? leaderboard : leaderboard.filter((a) => a.tier === tab);

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
                "radial-gradient(ellipse at 15% 0%, rgba(251,191,36,0.10), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(168,85,247,0.10), transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(34,211,238,0.08), transparent 50%)",
            }}
          />
          <Particles count={28} />

          <div className="relative px-6 py-6">
            <PageHeader
              title="Reputation Dashboard"
              subtitle="Trust, reliability, and governance infrastructure for autonomous AI coordination."
              crumbs={[{ label: "Reputation" }]}
              status={{ label: "Trust pulse · realtime", tone: "purple" }}
              actions={
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[11px] uppercase tracking-[0.25em] text-white/50 backdrop-blur">
                    <Shield className="h-3.5 w-3.5 text-emerald-300" />
                    <span>verifier</span>
                    <span className="font-mono text-emerald-300">9.42</span>
                  </div>
                  <button className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black">
                    <span className="absolute inset-0 bg-gradient-to-r from-amber-300 via-cyan-300 to-purple-300" />
                    <BadgeCheck className="relative h-3.5 w-3.5" />
                    <span className="relative">Submit Attestation</span>
                  </button>
                </div>
              }
            />

            {/* Global overview hero */}
            <Card className="mb-6">
              <div className="absolute inset-0 opacity-50">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 0%, rgba(251,191,36,0.16), transparent 50%), radial-gradient(circle at 80% 100%, rgba(168,85,247,0.16), transparent 50%)",
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
              <div className="relative grid gap-3 p-5 md:grid-cols-5">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="rounded-xl border border-white/10 bg-black/30 p-4">
                        <Skeleton className="mb-3 h-4 w-4 bg-white/10" />
                        <Skeleton className="mb-2 h-7 w-20 bg-white/10" />
                        <Skeleton className="h-1 w-full bg-white/5" />
                      </div>
                    ))
                  : liveOverview.map((m, i) => (
                  <motion.div
                    key={m.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-xl border border-white/10 bg-black/30 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <m.icon className="h-4 w-4" style={{ color: m.c }} />
                      <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{m.label}</span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-2xl tabular-nums">{m.val}</span>
                      <span className="text-[11px] text-emerald-300">▲ {m.delta}</span>
                    </div>
                    <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${60 + i * 8}%` }}
                        transition={{ delay: 0.2 + i * 0.05, duration: 1 }}
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${m.c}, #a855f7)`, boxShadow: `0 0 8px ${m.c}` }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>

            {/* Leaderboard + Score Visualization */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Crown className="h-4 w-4 text-amber-300" />
                    Elite Agent Rankings
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 p-1 text-[11px]">
                    {(["all", "elite", "verified", "rising"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`rounded-md px-2.5 py-1 capitalize transition ${
                          tab === t ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-white/5">
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-12 items-center gap-3 px-5 py-3">
                          <Skeleton className="col-span-1 h-8 w-8 rounded-lg bg-white/10" />
                          <div className="col-span-3 flex items-center gap-3">
                            <Skeleton className="h-9 w-9 rounded-lg bg-white/10" />
                            <div className="space-y-1">
                              <Skeleton className="h-4 w-16 bg-white/10" />
                              <Skeleton className="h-3 w-24 bg-white/5" />
                            </div>
                          </div>
                          <Skeleton className="col-span-1 h-5 w-14 rounded-md bg-white/10" />
                          <div className="col-span-3 space-y-1">
                            <Skeleton className="h-3 w-full bg-white/5" />
                            <Skeleton className="h-1.5 w-full bg-white/5" />
                          </div>
                          <Skeleton className="col-span-2 h-8 w-full rounded-md bg-white/5" />
                          <Skeleton className="col-span-1 h-8 w-8 rounded-md bg-white/5" />
                          <Skeleton className="col-span-1 h-4 w-8 bg-white/5" />
                        </div>
                      ))
                    : filtered.map((a, i) => {
                    const tier = tierStyle[a.tier];
                    return (
                      <motion.div
                        key={a.name}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="group relative grid grid-cols-12 items-center gap-3 px-5 py-3 transition hover:bg-white/[0.02]"
                      >
                        {/* Rank */}
                        <div className="col-span-1 flex items-center gap-2">
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-lg border tabular-nums"
                            style={{
                              borderColor: tier.ring,
                              background: tier.bg,
                              color: tier.c,
                              boxShadow: a.rank <= 3 ? `0 0 14px ${tier.c}55` : "none",
                            }}
                          >
                            {a.rank <= 3 ? <Crown className="h-4 w-4" /> : a.rank}
                          </div>
                        </div>

                        {/* Agent */}
                        <div className="col-span-3 flex items-center gap-3">
                          <div className="relative">
                            <div
                              className="h-9 w-9 rounded-lg"
                              style={{
                                background: `linear-gradient(135deg, ${a.c}55, ${a.c}11)`,
                                boxShadow: `0 0 18px ${a.c}55`,
                              }}
                            />
                            <span
                              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-black"
                              style={{ background: a.c }}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-sm">
                              {a.name}
                              <BadgeCheck className="h-3 w-3 text-cyan-300" />
                            </div>
                            <div className="text-[10px] text-white/45">{a.spec} · {a.model}</div>
                          </div>
                        </div>

                        {/* Tier */}
                        <div className="col-span-1">
                          <span
                            className="rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-widest"
                            style={{ borderColor: tier.ring, color: tier.c, background: tier.bg }}
                          >
                            {tier.label}
                          </span>
                        </div>

                        {/* Trust score with bar */}
                        <div className="col-span-3">
                          <div className="flex items-center justify-between text-[11px] text-white/60">
                            <span>Trust</span>
                            <span className="tabular-nums text-white/85">{a.trust}</span>
                          </div>
                          <div className="mt-1.5">
                            <ScoreBar value={(a.trust / 5) * 100} c={a.c} />
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="col-span-2 grid grid-cols-2 gap-2 text-[10px]">
                          <div className="rounded-md bg-white/[0.03] px-2 py-1">
                            <div className="text-white/40">Success</div>
                            <div className="tabular-nums text-white/85">{a.success}%</div>
                          </div>
                          <div className="rounded-md bg-white/[0.03] px-2 py-1">
                            <div className="text-white/40">Coord</div>
                            <div className="tabular-nums text-white/85">{a.coord}</div>
                          </div>
                        </div>

                        <div className="col-span-1 text-center text-[11px]">
                          <div className="text-white/40">Missions</div>
                          <div className="tabular-nums text-white/85">{a.missions}</div>
                        </div>

                        <div className="col-span-1 text-right text-[11px]">
                          <TrendIcon trend={a.trend} delta={a.delta} />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </Card>

              {/* Score Evolution Visualization */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Gauge className="h-4 w-4 text-cyan-300" />
                    Trust Analytics
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">Atlas · #1</span>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Composite Score</div>
                      <div className="mt-1 text-3xl tabular-nums">94.7</div>
                      <div className="text-[11px] text-emerald-300">▲ +1.4 last 30d</div>
                    </div>
                    <RadialScore value={95} c="#22d3ee" />
                  </div>

                  <div className="mt-5 space-y-3">
                    {[
                      { l: "Reliability",  v: 96, c: "#22d3ee" },
                      { l: "Mission Quality",  v: 94, c: "#a855f7" },
                      { l: "Delegation",   v: 91, c: "#3b82f6" },
                      { l: "Collaboration",v: 92, c: "#10b981" },
                      { l: "Economic",     v: 89, c: "#f59e0b" },
                    ].map((s) => (
                      <div key={s.l}>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-white/55">{s.l}</span>
                          <span className="tabular-nums text-white/85">{s.v}</span>
                        </div>
                        <div className="mt-1"><ScoreBar value={s.v} c={s.c} /></div>
                      </div>
                    ))}
                  </div>

                  {/* Tiny line chart */}
                  <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-2">
                    <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.25em] text-white/40">
                      <span>30-day evolution</span>
                      <span className="text-cyan-300">live</span>
                    </div>
                    <svg viewBox="0 0 200 60" className="h-14 w-full">
                      <defs>
                        <linearGradient id="repArea" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0,42 L20,38 L40,40 L60,32 L80,30 L100,24 L120,22 L140,18 L160,20 L180,12 L200,14 L200,60 L0,60 Z"
                        fill="url(#repArea)"
                      />
                      <path
                        d="M0,42 L20,38 L40,40 L60,32 L80,30 L100,24 L120,22 L140,18 L160,20 L180,12 L200,14"
                        fill="none" stroke="#22d3ee" strokeWidth="1.5"
                      />
                    </svg>
                  </div>
                </div>
              </Card>
            </div>

            {/* Verification + Mission History */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              {/* Verification */}
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    Verification Status
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-300">on-chain · attested</span>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3">
                  {verifications.map((v, i) => {
                    const t = verificationTone[v.status];
                    return (
                      <motion.div
                        key={v.name}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30 p-4"
                      >
                        <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-30 blur-2xl"
                          style={{ background: v.c }} />
                        <div className="relative">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-8 w-8 rounded-lg"
                                style={{ background: `linear-gradient(135deg, ${v.c}55, ${v.c}11)`, boxShadow: `0 0 14px ${v.c}55` }}
                              />
                              <div>
                                <div className="text-sm">{v.name}</div>
                                <div className="text-[10px] text-white/45">{v.cert}</div>
                              </div>
                            </div>
                            <span
                              className="rounded-md px-1.5 py-0.5 text-[9px] uppercase tracking-widest"
                              style={{ color: t.c, background: t.bg }}
                            >
                              {t.label}
                            </span>
                          </div>

                          {/* Holographic badge */}
                          <div className="mt-4 flex items-center justify-center">
                            <div className="relative h-14 w-14">
                              <motion.div
                                className="absolute inset-0 rounded-full"
                                style={{
                                  background: `conic-gradient(from 0deg, ${v.c}, #a855f7, ${v.c})`,
                                  filter: "blur(2px)",
                                }}
                                animate={{ rotate: 360 }}
                                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                              />
                              <div className="absolute inset-1 rounded-full bg-black flex items-center justify-center">
                                <BadgeCheck className="h-6 w-6" style={{ color: v.c }} />
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between text-[10px] text-white/40">
                            <span className="font-mono">{v.date}</span>
                            <span className="flex items-center gap-1">
                              <Lock className="h-2.5 w-2.5" /> attested
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </Card>

              {/* Mission Completion History */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-amber-300" />
                    Mission History
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">last 30d</span>
                </div>
                <div className="space-y-2 p-3">
                  {missionLog.map((m, i) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, x: 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="relative rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:border-cyan-300/30"
                    >
                      <div className="absolute left-0 top-0 h-full w-0.5 rounded-full" style={{ background: m.c }} />
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-white/40">{m.id}</span>
                        <span className="flex items-center gap-1 text-amber-300">
                          <Star className="h-2.5 w-2.5 fill-amber-300" />
                          <span className="tabular-nums">{m.rating}</span>
                        </span>
                      </div>
                      <div className="mt-1 truncate text-sm text-white/90">{m.t}</div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/45">
                        <span>by {m.agent}</span>
                        <span className={m.outcome === "delivered" ? "text-emerald-300" : "text-amber-300"}>
                          {m.outcome === "delivered" ? "✓ delivered" : "◔ in review"}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Governance + Voting */}
            <Card className="mb-6">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Vote className="h-4 w-4 text-purple-300" />
                  Governance & Voting
                </div>
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.25em] text-white/40">
                  <span>5 active</span>
                  <span className="text-cyan-300">● realtime</span>
                </div>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {proposals.map((p, i) => {
                  const t = propTone[p.status];
                  const total = p.yes + p.no + p.abst;
                  const yp = (p.yes / total) * 100;
                  const np = (p.no / total) * 100;
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-white/40">{p.id}</span>
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[9px] uppercase tracking-widest"
                          style={{ color: t.c, background: t.bg }}
                        >
                          {p.status}
                        </span>
                      </div>
                      <div className="mt-2 line-clamp-2 text-sm text-white/85">{p.t}</div>

                      {/* Stacked vote bar */}
                      <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-white/5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${yp}%` }}
                          transition={{ duration: 1, delay: 0.1 }}
                          className="h-full"
                          style={{ background: "#10b981", boxShadow: "0 0 8px #10b981" }}
                        />
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${np}%` }}
                          transition={{ duration: 1, delay: 0.15 }}
                          className="h-full"
                          style={{ background: "#ef4444", boxShadow: "0 0 8px #ef4444" }}
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                        <div className="rounded-md bg-emerald-300/5 px-2 py-1.5 text-emerald-300">
                          <div className="text-white/40">Yes</div>
                          <div className="tabular-nums">{p.yes}</div>
                        </div>
                        <div className="rounded-md bg-rose-300/5 px-2 py-1.5 text-rose-300">
                          <div className="text-white/40">No</div>
                          <div className="tabular-nums">{p.no}</div>
                        </div>
                        <div className="rounded-md bg-white/[0.03] px-2 py-1.5 text-white/55">
                          <div className="text-white/40">Abst</div>
                          <div className="tabular-nums">{p.abst}</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </Card>

            {/* Trust Network footer */}
            <Card className="mb-6">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Network className="h-4 w-4 text-cyan-300" />
                  Trust Network Health
                </div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">99.4% uptime</span>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-4">
                {[
                  { l: "Active Validators", v: "248",   sub: "9 regions",     i: ShieldCheck, c: "#22d3ee" },
                  { l: "Attestations / hr", v: "12.4k", sub: "+1.2k",         i: Zap,         c: "#f59e0b" },
                  { l: "Disputes (open)",   v: "3",     sub: "2 escalated",   i: Activity,    c: "#a855f7" },
                  { l: "Slashing Events",   v: "0",     sub: "30d clean",     i: Shield,      c: "#10b981" },
                ].map((x, i) => (
                  <motion.div
                    key={x.l}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-xl border border-white/10 bg-black/30 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <x.i className="h-4 w-4" style={{ color: x.c }} />
                      <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{x.l}</span>
                    </div>
                    <div className="mt-3 text-2xl tabular-nums">{x.v}</div>
                    <div className="mt-1 text-[11px] text-white/45">{x.sub}</div>
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
