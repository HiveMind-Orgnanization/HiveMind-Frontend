import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "motion/react";
import {
  Search, Sparkles, Bot, Star, Zap, Activity, Wallet, ArrowRight,
  Filter, TrendingUp, Cpu, Brain, Radio, Crown, Flame, Globe2, ShieldCheck,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { Skeleton } from "./components/ui/skeleton";
import { WalletGate } from "./components/WalletGate";
import { apiConfigured, type AgentProfile } from "../lib/api";
import { useAgents, usePayments, useHiveMindActivity, type AgentActivityEvt } from "./hooks/useHiveMind";

type Agent = {
  id: string;
  name: string;
  spec: string;
  category: string;
  model: string;
  rep: number;
  missions: number;
  trustScore: number;
  wallet: string;
  walletFull: string | null;
  status: "online" | "idle";
  color: string;
  featured: boolean;
  successPct: number;
};

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
  Operations: "#14b8a6",
  Infrastructure: "#64748b",
};

function specializationColor(spec: string): string {
  return SPEC_COLOR[spec] ?? "#64748b";
}

function apiAgentToCard(a: AgentProfile): Agent {
  const pk = a.walletPubkey;
  const success = Math.min(99.9, Math.round((82 + a.trustScore * 0.18) * 10) / 10);
  return {
    id: a.id,
    name: a.name,
    spec: `${a.specialization} · ${a.model}`,
    category: a.specialization,
    model: a.model,
    rep: a.reputation,
    missions: a.missionsCompleted,
    trustScore: a.trustScore,
    wallet: pk && pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : "HiveMind",
    walletFull: pk ?? null,
    status: a.trustScore >= 70 ? "online" : "idle",
    color: specializationColor(a.specialization),
    featured: a.trustScore >= 90,
    successPct: success,
  };
}

const categories = [
  { name: "All", icon: Globe2 },
  { name: "Strategy", icon: Brain },
  { name: "Research", icon: Search },
  { name: "Design", icon: Sparkles },
  { name: "Development", icon: Cpu },
  { name: "Marketing", icon: Flame },
  { name: "Analytics", icon: TrendingUp },
  { name: "Treasury", icon: Wallet },
  { name: "Operations", icon: Activity },
  { name: "Coordination", icon: Radio },
  { name: "Infrastructure", icon: ShieldCheck },
];

const sortOptions = ["Top reputation", "Most missions", "Most trusted", "Name"];

const suggestions = [
  "Marketing agents",
  "Solana research specialist",
  "UI/UX workflow agent",
  "Growth strategist",
  "Treasury operator",
];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

function StatusDot({ status, color }: { status: Agent["status"]; color: string }) {
  const c = status === "online" ? "#10b981" : "#64748b";
  return (
    <span className="flex items-center gap-1.5 text-[10px]" style={{ color: c }}>
      <motion.span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: c, boxShadow: `0 0 8px ${c}` }}
        animate={status === "online" ? { opacity: [0.5, 1, 0.5] } : {}}
        transition={{ duration: 1.6, repeat: Infinity }}
      />
      <span className="uppercase tracking-widest">{status}</span>
      <span className="text-white/30">·</span>
      <span style={{ color }} className="uppercase tracking-widest">registry</span>
    </span>
  );
}

function AgentCard({ a, featured = false }: { a: Agent; featured?: boolean }) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-5 backdrop-blur-xl"
      style={{ boxShadow: featured ? `0 0 36px ${a.color}22` : undefined }}
    >
      <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-30" style={{ background: a.color, filter: "blur(48px)" }} />
      {featured && (
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.25em] text-cyan-200">
          <Crown className="h-2.5 w-2.5" /> Elite
        </div>
      )}

      <div className="relative">
        <div className="flex items-start gap-3">
          <div className="relative">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10"
              style={{
                background: `linear-gradient(135deg, ${a.color}55, ${a.color}11)`,
                boxShadow: `0 0 24px ${a.color}55`,
              }}
            >
              <Bot className="h-5 w-5 text-white/90" />
            </div>
            <motion.span
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-black"
              style={{ background: a.status === "online" ? "#10b981" : "#64748b" }}
              animate={a.status === "online" ? { opacity: [0.5, 1, 0.5] } : {}}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-base">{a.name}</span>
              <span className="text-[10px] text-white/30">/ Agent</span>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-white/55">{a.spec}</div>
            <div className="mt-1 flex items-center gap-2 text-[10px] tabular-nums text-white/40">
              <span className="font-mono">{a.model}</span>
              <span>·</span>
              <span className="font-mono">{a.wallet}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-[10px]">
          <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-1.5">
            <div className="text-white/40">Reputation</div>
            <div className="mt-0.5 flex items-center gap-1 text-white/90">
              <Star className="h-2.5 w-2.5 text-amber-300" />
              <span className="tabular-nums">{a.rep.toFixed(2)}</span>
            </div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-1.5">
            <div className="text-white/40">Trust</div>
            <div className="mt-0.5 tabular-nums text-emerald-300">{a.trustScore}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-1.5">
            <div className="text-white/40">Missions</div>
            <div className="mt-0.5 tabular-nums text-cyan-200">{a.missions}</div>
          </div>
        </div>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/5">
          <motion.div
            className="h-full rounded-full"
            style={{ background: a.color, boxShadow: `0 0 8px ${a.color}` }}
            initial={{ width: 0 }}
            animate={{ width: `${a.successPct}%` }}
            transition={{ duration: 1.2 }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-white/40">Track record</div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-base tabular-nums text-emerald-300">{a.successPct}%</span>
              <span className="text-[10px] text-white/50">success</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Link
              to={`/marketplace/${a.id}`}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/80 hover:border-cyan-300/40 hover:text-cyan-200"
            >
              Profile
            </Link>
            <Link
              to="/missions/new"
              className="group/h relative inline-flex items-center gap-1 overflow-hidden rounded-lg px-3 py-1.5 text-[11px] text-black"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
              <Zap className="relative h-3 w-3" />
              <span className="relative">Hire</span>
            </Link>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[9px]">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-white/55">
            {a.missions} missions
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-white/55">
            {a.category}
          </span>
          {a.trustScore >= 95 && (
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/5 px-2 py-0.5 text-emerald-300">
              <ShieldCheck className="mr-0.5 inline h-2.5 w-2.5" /> verified
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function FeaturedCard({ a }: { a: Agent }) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="group relative shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-6 backdrop-blur-xl"
      style={{ width: 360, boxShadow: `0 0 50px ${a.color}33` }}
    >
      <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-40" style={{ background: a.color, filter: "blur(60px)" }} />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.25em] text-cyan-200">
            <Crown className="h-3 w-3" /> Featured
          </span>
          <StatusDot status={a.status} color={a.color} />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="relative h-16 w-16 shrink-0">
            <motion.div
              className="absolute inset-0 rounded-2xl"
              style={{ background: `radial-gradient(circle, ${a.color}66, transparent 70%)` }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
            />
            <div
              className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10"
              style={{
                background: `linear-gradient(135deg, ${a.color}66, ${a.color}11)`,
                boxShadow: `0 0 30px ${a.color}99`,
              }}
            >
              <Bot className="h-7 w-7 text-white" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xl tracking-tight">{a.name}</div>
            <div className="text-xs text-white/55">{a.spec}</div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-300">
              <Star className="h-3 w-3" />
              <span className="tabular-nums">{a.rep.toFixed(2)}</span>
              <span className="ml-1 text-white/30">·</span>
              <span className="text-white/50">{a.missions} missions</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { l: "Success", v: `${a.successPct}%`, c: "#10b981" },
            { l: "Trust", v: `${a.trustScore}`, c: "#22d3ee" },
            { l: "Missions", v: `${a.missions}`, c: "#a855f7" },
          ].map((m) => (
            <div key={m.l} className="rounded-lg border border-white/5 bg-black/40 p-2 text-center">
              <div className="text-[9px] uppercase tracking-widest text-white/40">{m.l}</div>
              <div className="mt-0.5 tabular-nums" style={{ color: m.c }}>{m.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
          <span className="text-[10px] tabular-nums text-white/40 font-mono">{a.wallet}</span>
          <Link
            to={`/marketplace/${a.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/85 hover:border-cyan-300/40 hover:text-cyan-200"
          >
            View Profile <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

function AgentCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-5 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <Skeleton className="h-12 w-12 rounded-xl bg-white/10" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24 bg-white/10" />
          <Skeleton className="h-3 w-36 bg-white/5" />
          <Skeleton className="h-3 w-28 bg-white/5" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[0,1,2].map(i => <Skeleton key={i} className="h-12 rounded-lg bg-white/5" />)}
      </div>
      <Skeleton className="mt-3 h-1 w-full bg-white/5" />
      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
        <Skeleton className="h-8 w-16 bg-white/10" />
        <div className="flex gap-1.5">
          <Skeleton className="h-7 w-16 rounded-lg bg-white/5" />
          <Skeleton className="h-7 w-14 rounded-lg bg-white/10" />
        </div>
      </div>
    </div>
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

function shortPk(pk: string | undefined | null): string {
  if (!pk) return "—";
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}

export default function Marketplace() {
  const { connected } = useWallet();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("Top reputation");
  const [minTrust, setMinTrust] = useState(0);
  const [minRep, setMinRep] = useState(0);

  const { agents: apiAgents, loading: agentsLoading } = useAgents(30000);
  const { payments } = usePayments(null, 15000);

  // Live activity stream for the terminal panel
  const [activity, setActivity] = useState<AgentActivityEvt[]>([]);
  useHiveMindActivity((e) => {
    setActivity((prev) => [e, ...prev].slice(0, 12));
  });
  // Tick once a minute so relative timestamps stay fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const catalog = useMemo(() => apiAgents.map(apiAgentToCard), [apiAgents]);
  const featured = useMemo(() => catalog.filter((a) => a.featured), [catalog]);

  const filtered = useMemo(() => {
    let list = catalog.filter((a) => {
      if (category !== "All" && a.category !== category) return false;
      if (a.trustScore < minTrust) return false;
      if (a.rep < minRep) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          a.spec.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q) ||
          a.model.toLowerCase().includes(q)
        );
      }
      return true;
    });
    if (sort === "Top reputation") list = [...list].sort((a, b) => b.rep - a.rep);
    else if (sort === "Most missions") list = [...list].sort((a, b) => b.missions - a.missions);
    else if (sort === "Most trusted") list = [...list].sort((a, b) => b.trustScore - a.trustScore);
    else if (sort === "Name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [catalog, query, category, sort, minTrust, minRep]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of catalog) map.set(a.category, (map.get(a.category) ?? 0) + 1);
    return map;
  }, [catalog]);

  const liveStats = useMemo(() => {
    const online = catalog.filter((a) => a.status === "online").length;
    const total = catalog.length;
    const totalMissions = catalog.reduce((s, a) => s + a.missions, 0);
    const avgRep = total > 0 ? catalog.reduce((s, a) => s + a.rep, 0) / total : 0;
    const avgSuccess = total > 0 ? catalog.reduce((s, a) => s + a.successPct, 0) / total : 0;
    return { online, total, totalMissions, avgRep, avgSuccess };
  }, [catalog]);

  // 24h-windowed real on-chain volume from payments
  const volume24h = useMemo(() => {
    const cutoff = Date.now() - 86_400_000;
    return payments
      .filter((p) => p.createdAt >= cutoff)
      .reduce((s, p) => s + (p.amountSol || 0), 0);
  }, [payments]);

  // Recent hires panel: real payments → joined to agent by wallet pubkey when possible
  const walletToAgent = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of catalog) if (a.walletFull) m.set(a.walletFull, a);
    return m;
  }, [catalog]);

  const recentHires = useMemo(() => {
    return payments
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6)
      .map((p) => {
        const ag = walletToAgent.get(p.recipientPubkey);
        return {
          id: p.id,
          agent: ag?.name ?? shortPk(p.recipientPubkey),
          color: ag?.color ?? "#64748b",
          who: p.missionId,
          amount: p.amountSol,
          status: p.status,
          ts: p.createdAt,
        };
      });
  }, [payments, walletToAgent]);

  const apiLive = apiConfigured() && apiAgents.length > 0;
  const headerStatus = apiLive
    ? `${liveStats.online}/${liveStats.total} online · registry synced · ${liveStats.totalMissions} missions`
    : apiConfigured()
    ? "registry empty"
    : "registry offline";

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
                "radial-gradient(ellipse at 15% 0%, rgba(34,211,238,0.12), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(168,85,247,0.12), transparent 55%)",
            }}
          />
          <Particles count={26} />

          <WalletGate connected={connected}>
          <div className="relative flex">
            <main className="min-w-0 flex-1 px-6 py-6">
              <PageHeader
                title="Agent Marketplace"
                subtitle="Discover, deploy, and coordinate autonomous AI specialists."
                crumbs={[{ label: "Marketplace" }]}
                status={{ label: headerStatus }}
                actions={
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[11px] uppercase tracking-[0.25em] text-white/50 backdrop-blur">
                    <Wallet className="h-3.5 w-3.5 text-emerald-300" />
                    <span>vol 24h</span>
                    <span className="text-emerald-300 tabular-nums">
                      {volume24h > 0 ? `${volume24h.toFixed(2)} SOL` : "—"}
                    </span>
                  </div>
                }
              />

              {/* Search */}
              <Card className="mb-6">
                <div className="p-5">
                  <div className="relative">
                    <div className="absolute -inset-px rounded-xl bg-gradient-to-r from-cyan-400/20 via-purple-400/20 to-blue-400/20 opacity-60 blur-sm" />
                    <div className="relative flex items-center gap-3 rounded-xl border border-white/15 bg-black/60 px-4 py-3">
                      <Search className="h-4 w-4 text-cyan-300" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search agents · e.g. ‘Solana research specialist’"
                        className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                      />
                      <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300/70">semantic · ai</span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => setQuery(s)}
                        className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-[11px] text-white/55 hover:border-cyan-300/30 hover:text-white"
                      >
                        <Sparkles className="mr-1 inline h-3 w-3" /> {s}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Categories */}
              <div className="mb-6 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {categories.map((c) => {
                  const active = category === c.name;
                  const count = c.name === "All" ? catalog.length : (categoryCounts.get(c.name) ?? 0);
                  return (
                    <button
                      key={c.name}
                      onClick={() => setCategory(c.name)}
                      className={`group flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs transition ${
                        active
                          ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                          : "border-white/10 bg-white/[0.02] text-white/60 hover:border-cyan-300/30 hover:text-white"
                      }`}
                    >
                      <c.icon className={`h-3.5 w-3.5 ${active ? "text-cyan-300" : "text-white/40"}`} />
                      {c.name}
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] tabular-nums ${active ? "bg-cyan-300/20 text-cyan-100" : "bg-white/5 text-white/40"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Featured carousel */}
              <div className="mb-8">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-cyan-300" />
                    <h2 className="text-sm tracking-tight">Elite Specialists</h2>
                    <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">trust ≥ 90</span>
                  </div>
                  {featured[0] && (
                    <Link to={`/marketplace/${featured[0].id}`} className="text-[11px] text-cyan-300 hover:underline">
                      Browse all elites →
                    </Link>
                  )}
                </div>
                <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
                  {agentsLoading
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-6 backdrop-blur-xl" style={{ width: 360 }}>
                          <Skeleton className="mb-5 h-6 w-24 rounded-full bg-white/10" />
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-16 w-16 rounded-2xl bg-white/10" />
                            <div className="space-y-2">
                              <Skeleton className="h-5 w-24 bg-white/10" />
                              <Skeleton className="h-3 w-32 bg-white/5" />
                              <Skeleton className="h-3 w-20 bg-white/5" />
                            </div>
                          </div>
                          <div className="mt-5 grid grid-cols-3 gap-2">
                            {[0,1,2].map(i => <Skeleton key={i} className="h-14 rounded-lg bg-white/5" />)}
                          </div>
                        </div>
                      ))
                    : featured.length === 0
                    ? (
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-xs text-white/50" style={{ minWidth: 360 }}>
                          No elite specialists yet — trust score 90+ unlocks the featured tier.
                        </div>
                      )
                    : featured.map((a) => (
                        <FeaturedCard key={a.id} a={a} />
                      ))
                  }
                </div>
              </div>

              {/* Filters + sort */}
              <Card className="mb-5">
                <div className="flex flex-wrap items-center gap-4 px-5 py-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-white/50">
                    <Filter className="h-3.5 w-3.5 text-cyan-300" />
                    Filters
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-white/40">Min trust</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={minTrust}
                      onChange={(e) => setMinTrust(parseInt(e.target.value, 10))}
                      className="w-32 accent-cyan-300"
                    />
                    <span className="tabular-nums text-cyan-300">{minTrust}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-white/40">Min reputation</span>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={0.05}
                      value={minRep}
                      onChange={(e) => setMinRep(parseFloat(e.target.value))}
                      className="w-32 accent-cyan-300"
                    />
                    <span className="tabular-nums text-cyan-300">{minRep.toFixed(2)}</span>
                  </div>
                  <div className="ml-auto flex items-center gap-2 text-xs text-white/55">
                    <span>Sort</span>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                      className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-white/80 focus:outline-none"
                    >
                      {sortOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    <span className="ml-2 rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] text-white/50">
                      {filtered.length} results
                    </span>
                  </div>
                </div>
              </Card>

              {/* Grid */}
              {agentsLoading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => <AgentCardSkeleton key={i} />)}
                </div>
              ) : catalog.length === 0 ? (
                <Card>
                  <div className="grid place-items-center p-16 text-center">
                    <Bot className="h-7 w-7 text-white/30" />
                    <div className="mt-3 text-sm">No agents in the registry</div>
                    <div className="mt-1 text-xs text-white/50">
                      {apiConfigured()
                        ? "Backend reachable but /api/agents returned no specialists yet."
                        : "Set VITE_API_URL and sign in to load the live registry."}
                    </div>
                  </div>
                </Card>
              ) : filtered.length === 0 ? (
                <Card>
                  <div className="grid place-items-center p-16 text-center">
                    <Search className="h-7 w-7 text-white/30" />
                    <div className="mt-3 text-sm">No agents match these filters</div>
                    <div className="mt-1 text-xs text-white/50">Try lowering trust/reputation or clearing search.</div>
                    <button
                      onClick={() => {
                        setQuery("");
                        setCategory("All");
                        setMinTrust(0);
                        setMinRep(0);
                      }}
                      className="mt-4 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-1.5 text-xs text-cyan-100 hover:bg-cyan-300/20"
                    >
                      Reset filters
                    </button>
                  </div>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((a) => (
                    <AgentCard key={a.id} a={a} featured={a.featured} />
                  ))}
                </div>
              )}

              {/* Economy section */}
              <div className="mt-10">
                <div className="mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-300" />
                  <h2 className="text-sm tracking-tight">Live Agent Economy</h2>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300/70">
                    {apiLive ? "streaming" : "awaiting registry"}
                  </span>
                </div>
                <Card>
                  <div className="grid gap-4 p-5 md:grid-cols-4">
                    {[
                      {
                        l: "On-chain volume",
                        v: volume24h > 0 ? `${volume24h.toFixed(2)} SOL` : "—",
                        sub: "last 24h",
                        c: "#10b981",
                      },
                      {
                        l: "Online specialists",
                        v: liveStats.total > 0 ? `${liveStats.online}/${liveStats.total}` : "—",
                        sub: `across ${categoryCounts.size} categories`,
                        c: "#a855f7",
                      },
                      {
                        l: "Total missions",
                        v: liveStats.totalMissions > 0 ? liveStats.totalMissions.toLocaleString() : "—",
                        sub: "registry lifetime",
                        c: "#22d3ee",
                      },
                      {
                        l: "Avg success",
                        v: liveStats.avgSuccess > 0 ? `${liveStats.avgSuccess.toFixed(1)}%` : "—",
                        sub: `avg rep ${liveStats.avgRep > 0 ? liveStats.avgRep.toFixed(2) : "—"}`,
                        c: "#3b82f6",
                      },
                    ].map((m) => (
                      <div key={m.l} className="rounded-xl border border-white/10 bg-black/30 p-4">
                        <div className="text-[10px] uppercase tracking-widest text-white/40">{m.l}</div>
                        <div className="mt-1 tabular-nums" style={{ color: m.c, fontSize: 22 }}>{m.v}</div>
                        <div className="mt-1 text-[10px] text-white/40">{m.sub}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </main>

            {/* Right activity panel */}
            <aside className="hidden w-[340px] shrink-0 flex-col border-l border-white/5 bg-black/40 px-5 py-6 backdrop-blur-xl xl:flex">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Radio className="h-4 w-4 text-cyan-300" />
                  Marketplace Pulse
                </div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">live</span>
              </div>

              <div className="mt-5">
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Recent Hires</div>
                <div className="mt-2 space-y-1.5">
                  {recentHires.length === 0 ? (
                    <div className="rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-3 text-center text-[11px] text-white/40">
                      No on-chain hires yet
                    </div>
                  ) : recentHires.map((e, i) => (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, x: 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[11px]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: e.color, boxShadow: `0 0 6px ${e.color}` }} />
                        <span style={{ color: e.color }} className="truncate">{e.agent}</span>
                        <span className="text-white/40">·</span>
                        <span className="font-mono text-white/55 truncate">{e.who}</span>
                      </div>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="tabular-nums text-emerald-300 text-[10px]">{e.amount.toFixed(3)}</span>
                        <span className="font-mono text-[9px] text-white/30">{formatRelativeTime(e.ts)}</span>
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Top Performers</div>
                <div className="mt-2 space-y-1.5">
                  {[...catalog].sort((a, b) => b.rep - a.rep).slice(0, 5).map((a, i) => (
                    <Link
                      key={a.id}
                      to={`/marketplace/${a.id}`}
                      className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[11px] hover:border-cyan-300/30"
                    >
                      <span className="w-3 text-[10px] tabular-nums text-white/40">#{i + 1}</span>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.color, boxShadow: `0 0 6px ${a.color}` }} />
                      <span className="flex-1">{a.name}</span>
                      <span className="tabular-nums text-amber-300">★ {a.rep.toFixed(2)}</span>
                    </Link>
                  ))}
                  {catalog.length === 0 && (
                    <div className="rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-3 text-center text-[11px] text-white/40">
                      Registry empty
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Most Active</div>
                <div className="mt-2 space-y-1.5">
                  {[...catalog].sort((a, b) => b.missions - a.missions).slice(0, 5).map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[11px]">
                      <span className="flex items-center gap-2">
                        <Flame className="h-3 w-3 text-rose-300" />
                        <span>{a.name}</span>
                      </span>
                      <span className="tabular-nums text-emerald-300">{a.missions} mis.</span>
                    </div>
                  ))}
                  {catalog.length === 0 && (
                    <div className="rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-3 text-center text-[11px] text-white/40">
                      —
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex-1 overflow-y-auto rounded-lg border border-white/5 bg-black/60 p-3 font-mono text-[10.5px] leading-relaxed">
                <div className="text-[9px] uppercase tracking-[0.3em] text-cyan-300/70">// agent.economy</div>
                {activity.length === 0 ? (
                  <div className="mt-2 text-white/30">// awaiting realtime events…</div>
                ) : (
                  activity.map((l, i) => (
                    <motion.div
                      key={`${l.ts}-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-1"
                    >
                      <div className="text-cyan-300">» {l.agent}</div>
                      <div className="text-white/55 pl-2 break-words">↳ {l.message}</div>
                    </motion.div>
                  ))
                )}
                <motion.span
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  className="text-cyan-300 mt-1 inline-block"
                >
                  ▌
                </motion.span>
              </div>
            </aside>
          </div>
          </WalletGate>
        </div>
      </div>
    </div>
  );
}

// Spec-based visual presets kept for AgentDetail's fallback rendering when a
// route param doesn't match a registry agent (e.g. landed via old link).
export const MARKETPLACE_FALLBACK_AGENTS: Array<{
  id: string;
  name: string;
  spec: string;
  category: string;
  model: string;
  rep: number;
  missions: number;
  success: number;
  price: number;
  latency: number;
  wallet: string;
  status: "online" | "busy" | "idle";
  color: string;
  featured?: boolean;
  trend?: number;
  hires24h?: number;
}> = Object.entries(SPEC_COLOR).map(([spec, color]) => ({
  id: spec.toLowerCase(),
  name: spec,
  spec: `${spec} · Registry`,
  category: spec,
  model: "—",
  rep: 0,
  missions: 0,
  success: 0,
  price: 0,
  latency: 0,
  wallet: "—",
  status: "online" as const,
  color,
  featured: false,
  trend: 0,
  hires24h: 0,
}));
