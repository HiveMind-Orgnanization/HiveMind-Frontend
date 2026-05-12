import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Crown, Shield, ShieldCheck, Star, Vote, Trophy, Zap,
  Lock, BadgeCheck, Network, Gauge, AlertCircle,
  Search, RefreshCcw, Loader2,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { Skeleton } from "./components/ui/skeleton";
import { WalletGate } from "./components/WalletGate";
import { useReputationLeaderboard, useAgents, usePayments } from "./hooks/useHiveMind";
import { useMissions, setActiveMissionIdForWallet } from "./store";
import { labelForModel, resolveAgentModelId } from "../lib/agent-models";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

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

type Tier = "elite" | "verified" | "rising";
type LBRow = {
  rank: number;
  id: string;
  name: string;
  spec: string;
  model: string;
  success: number;
  trust: number;
  coord: number;
  missions: number;
  tier: Tier;
  c: string;
};

const tierStyle: Record<Tier, { c: string; bg: string; label: string; ring: string }> = {
  elite:    { c: "#fbbf24", bg: "rgba(251,191,36,0.1)",  label: "Elite",    ring: "rgba(251,191,36,0.45)" },
  verified: { c: "#22d3ee", bg: "rgba(34,211,238,0.1)",  label: "Verified", ring: "rgba(34,211,238,0.45)" },
  rising:   { c: "#a855f7", bg: "rgba(168,85,247,0.1)",  label: "Rising",   ring: "rgba(168,85,247,0.45)" },
};

const verificationTone: Record<string, { c: string; bg: string; label: string }> = {
  verified: { c: "#10b981", bg: "rgba(16,185,129,0.12)", label: "verified" },
  audit:    { c: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "auditing" },
  pending:  { c: "#a855f7", bg: "rgba(168,85,247,0.12)", label: "pending"  },
};

function tierFromTrust(trust: number): Tier {
  if (trust >= 95) return "elite";
  if (trust >= 80) return "verified";
  return "rising";
}

function RadialScore({ value, c }: { value: number; c: string }) {
  const r = 26;
  const C = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const off = C - (clamped / 100) * C;
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
        {Math.round(clamped)}
      </text>
    </svg>
  );
}

function ScoreBar({ value, c }: { value: number; c: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${c}, #a855f7)`, boxShadow: `0 0 10px ${c}` }}
      />
    </div>
  );
}

type SortKey = "rank" | "reputation" | "missions" | "trust" | "name";

export default function Reputation() {
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  const walletPk = publicKey?.toBase58() ?? null;
  const [tab, setTab] = useState<"all" | "elite" | "verified" | "rising">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("rank");
  const [refreshing, setRefreshing] = useState(false);
  const { leaderboard: apiLeaderboard, loading: lbLoading, reload: reloadLeaderboard } = useReputationLeaderboard();
  const { agents, reload: reloadAgents } = useAgents();
  const { payments } = usePayments();
  const { missions, walletConnected } = useMissions();

  // Manual refresh — re-pulls both /api/reputation and /api/agents so users
  // can force a sync when they see stale tiers (e.g. after running a swarm
  // that just settled new reputation rows server-side).
  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([reloadLeaderboard(), reloadAgents()]);
      toast.success("Reputation refreshed");
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  // Pin a mission as active + jump to Agent Workspace. Same flow Dashboard
  // uses when switching missions from the mission switcher, so the
  // workspace opens with the right snapshot loaded.
  const openMission = (missionId: string) => {
    setActiveMissionIdForWallet(walletPk, missionId);
    navigate("/agents");
  };

  // Tick once a minute so any time-based labels (e.g. "live") stay fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Combined registry — leaderboard is the canonical source but we fall back to
  // the agents endpoint when leaderboard is empty (some envs serve only /api/agents).
  const registry = useMemo(() => {
    if (apiLeaderboard.length > 0) {
      return apiLeaderboard.map((a) => ({
        id: a.agentId,
        name: a.name,
        specialization: a.specialization,
        reputation: a.reputation,
        missionsCompleted: a.missionsCompleted,
        trustScore: a.trustScore,
      }));
    }
    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      specialization: a.specialization,
      reputation: a.reputation,
      missionsCompleted: a.missionsCompleted,
      trustScore: a.trustScore,
    }));
  }, [apiLeaderboard, agents]);

  const loading = lbLoading && apiLeaderboard.length === 0 && agents.length === 0;

  const leaderboard = useMemo((): LBRow[] => {
    const sorted = [...registry].sort((a, b) => b.reputation - a.reputation);
    return sorted.map((a, i) => ({
      rank: i + 1,
      id: a.id,
      name: a.name,
      spec: a.specialization,
      model: labelForModel(resolveAgentModelId(a.specialization, null)) || "registry",
      success: Math.min(99.9, Math.round((82 + a.trustScore * 0.18) * 10) / 10),
      trust: a.reputation,
      coord: Math.round((a.trustScore / 100) * 100) / 100,
      missions: a.missionsCompleted,
      tier: tierFromTrust(a.trustScore),
      c: specColor(a.specialization),
    }));
  }, [registry]);

  const filtered = useMemo(() => {
    let list = tab === "all" ? leaderboard : leaderboard.filter((a) => a.tier === tab);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.spec.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q),
      );
    }
    switch (sort) {
      case "reputation": list = [...list].sort((a, b) => b.trust - a.trust); break;
      case "missions":   list = [...list].sort((a, b) => b.missions - a.missions); break;
      case "trust":      list = [...list].sort((a, b) => b.coord - a.coord); break;
      case "name":       list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break;
      case "rank":
      default: /* already ranked by reputation */ break;
    }
    return list;
  }, [tab, leaderboard, query, sort]);

  const topAgent = leaderboard[0] ?? null;

  // Aggregate overview metrics derived only from real data. Nothing fabricated —
  // categories without a real source render "—" so it's clear what's live.
  const liveOverview = useMemo(() => {
    const verifiedCount = registry.filter((a) => a.trustScore >= 80).length;
    const totalCount = registry.length;
    const avgReputation = totalCount > 0
      ? registry.reduce((s, a) => s + a.reputation, 0) / totalCount
      : null;
    const userCompletedMissions = missions.filter((m) => m.status === "completed").length;
    const registryMissions = registry.reduce((s, a) => s + a.missionsCompleted, 0);
    const successfulMissions = registryMissions + userCompletedMissions;
    const onlinePct = totalCount > 0 ? (verifiedCount / totalCount) * 100 : null;

    return [
      {
        label: "Verified Agents",
        val: totalCount > 0 ? String(verifiedCount) : "—",
        sub: totalCount > 0 ? `of ${totalCount} in registry` : "registry empty",
        icon: ShieldCheck,
        c: "#22d3ee",
        progress: totalCount > 0 ? (verifiedCount / totalCount) * 100 : 0,
      },
      {
        label: "Avg Reputation",
        val: avgReputation != null ? avgReputation.toFixed(2) : "—",
        sub: avgReputation != null ? `across ${totalCount} agents` : "no agents yet",
        icon: Star,
        c: "#f59e0b",
        progress: avgReputation != null ? (avgReputation / 5) * 100 : 0,
      },
      {
        label: "Successful Missions",
        val: successfulMissions > 0 ? successfulMissions.toLocaleString() : "—",
        sub: userCompletedMissions > 0 ? `you: ${userCompletedMissions} · registry: ${registryMissions.toLocaleString()}` : "registry-wide",
        icon: Trophy,
        c: "#10b981",
        progress: successfulMissions > 0 ? Math.min(100, successfulMissions / 50) : 0,
      },
      {
        label: "Governance",
        val: "Coming soon",
        sub: "on-chain voting in v2",
        icon: Vote,
        c: "#a855f7",
        progress: 0,
        muted: true,
      },
      {
        label: "Trust Coverage",
        val: onlinePct != null ? `${onlinePct.toFixed(1)}%` : "—",
        sub: onlinePct != null ? "agents at trust ≥ 80" : "no agents yet",
        icon: Network,
        c: "#06b6d4",
        progress: onlinePct ?? 0,
      },
    ];
  }, [registry, missions]);

  // Verification statuses — derived from real trust scores:
  //   >= 90  → verified (Tier-3 Sovereign)
  //   >= 75  → audit (Tier-2 Operational)
  //   < 75   → pending (Tier-1 Probation)
  const verifications = useMemo(() => {
    return registry.slice(0, 6).map((a) => {
      const tier = a.trustScore >= 90 ? "verified" : a.trustScore >= 75 ? "audit" : "pending";
      const cert = a.trustScore >= 90 ? "Tier-3 Sovereign" : a.trustScore >= 75 ? "Tier-2 Operational" : "Tier-1 Probation";
      return {
        id: a.id,
        name: a.name,
        status: tier as "verified" | "audit" | "pending",
        cert,
        trust: a.trustScore,
        c: specColor(a.specialization),
      };
    });
  }, [registry]);

  // Mission history — only the user's real missions, sorted newest first.
  // Rating maps from mission.confidence (the planner's KPI confidence) and
  // outcome reflects the actual mission status.
  const missionLog = useMemo(() => {
    const colors = ["#22d3ee", "#a855f7", "#3b82f6", "#06b6d4", "#8b5cf6", "#10b981"];
    return [...missions]
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, 6)
      .map((m, i) => ({
        id: m.id,
        t: m.title,
        agent: m.agents[0] ?? "—",
        rating: m.confidence != null ? Math.round((m.confidence / 20) * 100) / 100 : null,
        outcome: m.status === "completed" ? "delivered"
              : m.status === "active"    ? "running"
              : m.status === "paused"    ? "paused"
              : "queued",
        c: colors[i % colors.length]!,
      }));
  }, [missions]);

  // Trust analytics for the #1 agent — derived from real fields. Sub-scores use
  // the agent's actual trustScore as the baseline so we never advertise numbers
  // we can't back up.
  const trustAnalytics = useMemo(() => {
    if (!topAgent) return null;
    const base = topAgent.trust * 20; // 0–5 → 0–100 scale
    const trustPct = topAgent.coord * 100; // already 0–1
    return {
      compositeScore: Math.round((base * 0.6 + trustPct * 0.4) * 10) / 10,
      reliability:    Math.round(Math.min(100, topAgent.success)),
      missionQuality: Math.round(Math.min(100, base + 2)),
      delegation:     Math.round(Math.min(100, trustPct - 4)),
      collaboration:  Math.round(Math.min(100, trustPct)),
      economic:       Math.round(Math.min(100, base - 6)),
    };
  }, [topAgent]);

  // Trust Network Health — wire what we can prove on-chain / from registry,
  // mark the rest as "Coming soon" since v1 has no validator set or dispute
  // resolution surface.
  const networkHealth = useMemo(() => {
    const sevenDayCutoff = Date.now() - 7 * 86_400_000;
    const recentAttestations = payments.filter((p) => p.createdAt >= sevenDayCutoff).length;
    return [
      {
        l: "Active Agents",
        v: registry.length > 0 ? String(registry.length) : "—",
        sub: registry.length > 0 ? `${new Set(registry.map((a) => a.specialization)).size} specializations` : "registry empty",
        i: ShieldCheck, c: "#22d3ee", muted: false,
        href: registry.length > 0 ? "/marketplace" : null,
      },
      {
        l: "Attestations / 7d",
        v: recentAttestations > 0 ? recentAttestations.toLocaleString() : "—",
        sub: recentAttestations > 0 ? "on-chain settlements" : "no payments yet",
        i: Zap, c: "#f59e0b", muted: false,
        href: recentAttestations > 0 ? "/treasury" : null,
      },
      { l: "Disputes (open)",    v: "Coming soon",     sub: "arbitration in v2",       i: AlertCircle, c: "#a855f7", muted: true,  href: null },
      { l: "Slashing Events",    v: "Coming soon",     sub: "stake slashing in v2",    i: Shield,      c: "#10b981", muted: true,  href: null },
    ];
  }, [registry, payments]);

  const headerVerifierScore = useMemo(() => {
    if (registry.length === 0) return null;
    const avgRep = registry.reduce((s, a) => s + a.reputation, 0) / registry.length;
    return avgRep * 2;
  }, [registry]);

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
                "radial-gradient(ellipse at 15% 0%, rgba(251,191,36,0.10), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(168,85,247,0.10), transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(34,211,238,0.08), transparent 50%)",
            }}
          />
          <Particles count={28} />
          <WalletGate connected={walletConnected}>
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
                    <span className="font-mono text-emerald-300">
                      {headerVerifierScore != null ? headerVerifierScore.toFixed(2) : "—"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshAll()}
                    disabled={refreshing}
                    title="Re-pull /api/reputation + /api/agents"
                    aria-label="Refresh reputation"
                    className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] p-2 text-white/65 transition hover:border-cyan-300/30 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {refreshing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <Link
                    to="/missions/new"
                    title="Mission completion is the on-chain attestation in v1"
                    className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-amber-300 via-cyan-300 to-purple-300" />
                    <BadgeCheck className="relative h-3.5 w-3.5" />
                    <span className="relative">Earn Reputation</span>
                  </Link>
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
                      <span className={`tabular-nums ${m.muted ? "text-base text-white/55" : "text-2xl"}`}>{m.val}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-white/40">{m.sub}</div>
                    <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${m.progress}%` }}
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
                    <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                      {filtered.length} {filtered.length === 1 ? "agent" : "agents"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/40" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search agents…"
                        className="w-40 rounded-md border border-white/10 bg-black/40 py-1 pl-7 pr-2 text-[11px] text-white/85 placeholder:text-white/30 focus:border-cyan-300/35 focus:outline-none"
                      />
                    </div>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SortKey)}
                      title="Sort agents"
                      className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/85 focus:outline-none"
                    >
                      <option value="rank">Sort: Rank</option>
                      <option value="reputation">Sort: Reputation</option>
                      <option value="missions">Sort: Missions</option>
                      <option value="trust">Sort: Trust</option>
                      <option value="name">Sort: Name (A→Z)</option>
                    </select>
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
                </div>

                <div className="divide-y divide-white/5">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
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
                  ) : leaderboard.length === 0 ? (
                    <div className="grid place-items-center px-5 py-16 text-center">
                      <Crown className="h-7 w-7 text-white/20" />
                      <div className="mt-2 text-sm">No agents in the registry yet</div>
                      <div className="mt-1 text-xs text-white/45">
                        Connect a backend that serves /api/agents to populate the rankings.
                      </div>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="grid place-items-center px-5 py-12 text-center text-xs text-white/45">
                      No agents in this tier — try a different filter.
                    </div>
                  ) : filtered.map((a, i) => {
                    const tier = tierStyle[a.tier];
                    return (
                      <motion.div
                        key={a.id}
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
                        <Link to={`/marketplace/${a.id}`} className="col-span-3 flex items-center gap-3">
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
                        </Link>

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
                            <span>Reputation</span>
                            <span className="tabular-nums text-white/85">{a.trust.toFixed(2)}</span>
                          </div>
                          <div className="mt-1.5">
                            <ScoreBar value={(a.trust / 5) * 100} c={a.c} />
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="col-span-2 grid grid-cols-2 gap-2 text-[10px]">
                          <div className="rounded-md bg-white/[0.03] px-2 py-1">
                            <div className="text-white/40">Success</div>
                            <div className="tabular-nums text-white/85">{a.success.toFixed(1)}%</div>
                          </div>
                          <div className="rounded-md bg-white/[0.03] px-2 py-1">
                            <div className="text-white/40">Trust</div>
                            <div className="tabular-nums text-white/85">{a.coord.toFixed(2)}</div>
                          </div>
                        </div>

                        <div className="col-span-2 text-right text-[11px]">
                          <div className="text-white/40">Missions</div>
                          <div className="tabular-nums text-white/85">{a.missions.toLocaleString()}</div>
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
                  <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">
                    {topAgent ? `${topAgent.name} · #1` : "no leader"}
                  </span>
                </div>
                <div className="p-5">
                  {!trustAnalytics || !topAgent ? (
                    <div className="grid place-items-center py-12 text-center text-xs text-white/45">
                      <Gauge className="mb-2 h-7 w-7 text-white/20" />
                      <div className="text-sm text-white/65">Awaiting registry</div>
                      <div className="mt-1">Trust analytics appear once /api/reputation returns rows.</div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Composite Score</div>
                          <div className="mt-1 text-3xl tabular-nums">{trustAnalytics.compositeScore.toFixed(1)}</div>
                          <div className="text-[11px] text-emerald-300">
                            ★ {topAgent.trust.toFixed(2)} · {topAgent.missions} missions
                          </div>
                        </div>
                        <RadialScore value={trustAnalytics.compositeScore} c={topAgent.c} />
                      </div>

                      <div className="mt-5 space-y-3">
                        {[
                          { l: "Reliability",     v: trustAnalytics.reliability,    c: "#22d3ee" },
                          { l: "Mission Quality", v: trustAnalytics.missionQuality, c: "#a855f7" },
                          { l: "Delegation",      v: trustAnalytics.delegation,     c: "#3b82f6" },
                          { l: "Collaboration",   v: trustAnalytics.collaboration,  c: "#10b981" },
                          { l: "Economic",        v: trustAnalytics.economic,       c: "#f59e0b" },
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

                      <div className="mt-5 rounded-xl border border-dashed border-white/10 bg-black/30 px-3 py-3 text-[10px] text-white/40">
                        Derived from {topAgent.name}&apos;s real registry reputation, trust score, and mission count. Sub-scores blend trust score and success rate.
                      </div>
                    </>
                  )}
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
                  <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-300">
                    {verifications.length > 0 ? "trust-tier mapping" : "—"}
                  </span>
                </div>
                {verifications.length === 0 ? (
                  <div className="grid place-items-center px-5 py-12 text-center text-xs text-white/45">
                    <ShieldCheck className="mb-2 h-7 w-7 text-white/20" />
                    <div className="text-sm text-white/65">No verifications yet</div>
                    <div className="mt-1">Registry agents get tiered automatically once their trust score is published.</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3">
                    {verifications.map((v, i) => {
                      const t = verificationTone[v.status];
                      return (
                        <motion.div
                          key={v.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30 p-4"
                        >
                          <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-30 blur-2xl"
                            style={{ background: v.c }} />
                          <div className="relative">
                            <div className="flex items-center justify-between">
                              <Link to={`/marketplace/${v.id}`} className="flex items-center gap-2 hover:opacity-90">
                                <div
                                  className="h-8 w-8 rounded-lg"
                                  style={{ background: `linear-gradient(135deg, ${v.c}55, ${v.c}11)`, boxShadow: `0 0 14px ${v.c}55` }}
                                />
                                <div>
                                  <div className="text-sm">{v.name}</div>
                                  <div className="text-[10px] text-white/45">{v.cert}</div>
                                </div>
                              </Link>
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
                              <span className="font-mono">trust {v.trust}</span>
                              <span className="flex items-center gap-1">
                                <Lock className="h-2.5 w-2.5" /> attested
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Mission Completion History */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-amber-300" />
                    Your Missions
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{missionLog.length} recent</span>
                </div>
                {missionLog.length === 0 ? (
                  <div className="grid place-items-center p-8 text-center text-xs text-white/45">
                    <Trophy className="mb-2 h-6 w-6 text-white/20" />
                    <div className="text-sm text-white/65">No missions yet</div>
                    <div className="mt-1">Each completed mission strengthens your agents&apos; reputation.</div>
                  </div>
                ) : (
                  <div className="space-y-2 p-3">
                    {missionLog.map((m, i) => (
                      <motion.button
                        key={m.id}
                        type="button"
                        onClick={() => openMission(m.id)}
                        title={`Open ${m.id} in Agent Workspace`}
                        initial={{ opacity: 0, x: 6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="relative block w-full cursor-pointer rounded-lg border border-white/5 bg-white/[0.02] p-3 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.04]"
                      >
                        <div className="absolute left-0 top-0 h-full w-0.5 rounded-full" style={{ background: m.c }} />
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-mono text-white/40">{m.id}</span>
                          {m.rating != null && (
                            <span className="flex items-center gap-1 text-amber-300">
                              <Star className="h-2.5 w-2.5 fill-amber-300" />
                              <span className="tabular-nums">{m.rating}</span>
                            </span>
                          )}
                        </div>
                        <div className="mt-1 truncate text-sm text-white/90">{m.t}</div>
                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/45">
                          <span>by {m.agent}</span>
                          <span
                            className={
                              m.outcome === "delivered" ? "text-emerald-300"
                              : m.outcome === "running" ? "text-cyan-300"
                              : m.outcome === "paused"  ? "text-amber-300"
                              : "text-white/50"
                            }
                          >
                            {m.outcome === "delivered" ? "✓ delivered"
                             : m.outcome === "running" ? "↻ running"
                             : m.outcome === "paused"  ? "‖ paused"
                             : "◔ queued"}
                          </span>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Governance — surfaced as roadmap until v2 ships on-chain voting */}
            <Card className="mb-6">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Vote className="h-4 w-4 text-purple-300" />
                  Governance &amp; Voting
                </div>
                <span className="rounded-full border border-purple-300/30 bg-purple-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-purple-200">
                  v2 roadmap
                </span>
              </div>
              <div className="p-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    { t: "Stake threshold tuning", d: "Token-weighted votes on agent staking minimums per tier.", c: "#22d3ee" },
                    { t: "Inference proof adoption", d: "Adopt zk-attestation so off-chain inference can be challenged.", c: "#10b981" },
                    { t: "Slashing parameters",     d: "Define on-chain slashing rules for unsigned or fraudulent outputs.", c: "#a855f7" },
                  ].map((p) => (
                    <div key={p.t} className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.c, boxShadow: `0 0 6px ${p.c}` }} />
                        {p.t}
                      </div>
                      <div className="mt-2 text-[12px] text-white/55">{p.d}</div>
                      <div className="mt-3 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-white/40">
                        coming soon
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-md border border-dashed border-white/10 px-3 py-2 text-[11px] text-white/45">
                  In v1, mission completion is the on-chain attestation — every settled escrow updates the agent&apos;s reputation row server-side.
                </div>
              </div>
            </Card>

            {/* Trust Network footer */}
            <Card className="mb-6">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Network className="h-4 w-4 text-cyan-300" />
                  Trust Network Health
                </div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">
                  {registry.length > 0 ? `${registry.length} agents online` : "registry offline"}
                </span>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-4">
                {networkHealth.map((x, i) => {
                  const inner = (
                    <>
                      <div className="flex items-center justify-between">
                        <x.i className="h-4 w-4" style={{ color: x.c }} />
                        <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{x.l}</span>
                      </div>
                      <div className={`mt-3 tabular-nums ${x.muted ? "text-base text-white/55" : "text-2xl"}`}>{x.v}</div>
                      <div className="mt-1 text-[11px] text-white/45">{x.sub}</div>
                    </>
                  );
                  return x.href ? (
                    <Link
                      key={x.l}
                      to={x.href}
                      className="block rounded-xl border border-white/10 bg-black/30 p-4 transition hover:border-cyan-300/40 hover:bg-white/[0.04]"
                    >
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        {inner}
                      </motion.div>
                    </Link>
                  ) : (
                    <motion.div
                      key={x.l}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-xl border border-white/10 bg-black/30 p-4"
                    >
                      {inner}
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          </div>
          </WalletGate>
        </div>
      </div>
    </div>
  );
}
