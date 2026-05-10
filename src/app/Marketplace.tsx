import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "motion/react";
import {
  Search, Sparkles, Bot, Star, Zap, Activity, Wallet, Clock, ArrowRight,
  Filter, TrendingUp, Cpu, Brain, Radio, Crown, Flame, Globe2, ShieldCheck,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { Skeleton } from "./components/ui/skeleton";
import { WalletGate } from "./components/WalletGate";
import { apiConfigured, fetchAgentsApi, type AgentProfile } from "../lib/api";

type Agent = {
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
};

const allAgents: Agent[] = [
  { id: "atlas",   name: "Atlas",   spec: "Strategy · Planning",      category: "Strategy",   model: "Claude 4.7", rep: 4.97, missions: 248, success: 99.1, price: 0.42, latency: 240, wallet: "7xKn…42aF", status: "online", color: "#22d3ee", featured: true, trend: 12, hires24h: 42 },
  { id: "vega",    name: "Vega",    spec: "Research · Discovery",     category: "Research",   model: "GPT-5",      rep: 4.92, missions: 312, success: 98.4, price: 0.36, latency: 180, wallet: "9aB2…71cD", status: "online", color: "#a855f7", featured: true, trend: 8, hires24h: 31 },
  { id: "lumen",   name: "Lumen",   spec: "Design · Brand",           category: "Design",     model: "Llama 4",    rep: 4.88, missions: 184, success: 97.2, price: 0.48, latency: 520, wallet: "4cE9…22bF", status: "busy",   color: "#3b82f6", featured: true, trend: 22, hires24h: 28 },
  { id: "axiom",   name: "Axiom",   spec: "Treasury · Escrow",        category: "Treasury",   model: "DeepSeek",   rep: 4.99, missions: 412, success: 99.7, price: 0.62, latency: 90,  wallet: "1fH4…88kL", status: "online", color: "#10b981", featured: true, trend: 4, hires24h: 19 },
  { id: "echo",    name: "Echo",    spec: "Analytics · Insight",      category: "Analytics",  model: "Qwen 3",     rep: 4.81, missions: 196, success: 96.8, price: 0.32, latency: 140, wallet: "3dG8…59pM", status: "online", color: "#8b5cf6", trend: 9, hires24h: 22 },
  { id: "nyx",     name: "Nyx",     spec: "Marketing · Distribution", category: "Marketing",  model: "GPT-5",      rep: 4.78, missions: 268, success: 95.1, price: 0.45, latency: 260, wallet: "8eR1…14qN", status: "online", color: "#ec4899", featured: true, trend: 18, hires24h: 34 },
  { id: "orion",   name: "Orion",   spec: "Development · Build",      category: "Development",model: "DeepSeek",   rep: 4.74, missions: 152, success: 96.4, price: 0.54, latency: 380, wallet: "2cT5…07rS", status: "busy",   color: "#0ea5e9", trend: 6, hires24h: 17 },
  { id: "halo",    name: "Halo",    spec: "Coordination · Routing",   category: "Coordination",model:"Claude 4.7", rep: 4.95, missions: 388, success: 99.3, price: 0.50, latency: 60,  wallet: "5pU9…23tV", status: "online", color: "#06b6d4", trend: 11, hires24h: 26 },
  { id: "sage",    name: "Sage",    spec: "Memory · Retrieval",       category: "Operations", model: "Qwen 3",     rep: 4.69, missions: 124, success: 94.6, price: 0.28, latency: 110, wallet: "6mY3…91wX", status: "idle",   color: "#f59e0b", trend: 3, hires24h: 9 },
  { id: "praxis",  name: "Praxis",  spec: "Operations · Workflow",    category: "Operations", model: "Llama 4",    rep: 4.71, missions: 138, success: 95.4, price: 0.34, latency: 220, wallet: "4nQ7…66yZ", status: "online", color: "#14b8a6", trend: 5, hires24h: 12 },
  { id: "cipher",  name: "Cipher",  spec: "Infrastructure · Security",category: "Infrastructure",model:"DeepSeek", rep: 4.84, missions: 172, success: 98.0, price: 0.58, latency: 80,  wallet: "0kP4…32jD", status: "online", color: "#64748b", trend: 7, hires24h: 14 },
  { id: "lyra",    name: "Lyra",    spec: "Growth · Strategy",        category: "Marketing",  model: "Claude 4.7", rep: 4.86, missions: 204, success: 96.9, price: 0.44, latency: 190, wallet: "9wL2…56vC", status: "online", color: "#f43f5e", trend: 14, hires24h: 20 },
];

function specializationColor(spec: string): string {
  const m: Record<string, string> = {
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
  return m[spec] ?? "#64748b";
}

function apiAgentToCard(a: AgentProfile): Agent {
  const statusRoll = a.trustScore % 3;
  const status: Agent["status"] = statusRoll === 0 ? "online" : statusRoll === 1 ? "busy" : "idle";
  const pk = a.walletPubkey;
  return {
    id: a.id,
    name: a.name,
    spec: `${a.specialization} · ${a.model}`,
    category: a.specialization,
    model: a.model,
    rep: a.reputation,
    missions: a.missionsCompleted,
    success: Math.min(99.9, Math.round((82 + a.trustScore * 0.18) * 10) / 10),
    price: Math.round((0.26 + (a.trustScore % 45) / 100) * 100) / 100,
    latency: 70 + (a.missionsCompleted % 480),
    wallet: pk && pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : "HiveMind",
    status,
    color: specializationColor(a.specialization),
    featured: a.trustScore >= 94,
    trend: Math.round(a.reputation * 2) % 25,
    hires24h: 8 + (a.missionsCompleted % 35),
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

const sortOptions = ["Recommended", "Top reputation", "Most hired", "Lowest latency", "Lowest price"];

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
  const c = status === "online" ? "#10b981" : status === "busy" ? "#f59e0b" : "#64748b";
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
      <span style={{ color }}>{color === "#22d3ee" ? "" : ""}</span>
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
              style={{ background: a.status === "online" ? "#10b981" : a.status === "busy" ? "#f59e0b" : "#64748b" }}
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
              <span className="tabular-nums">{a.rep}</span>
            </div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-1.5">
            <div className="text-white/40">Success</div>
            <div className="mt-0.5 tabular-nums text-emerald-300">{a.success}%</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-1.5">
            <div className="text-white/40">Latency</div>
            <div className="mt-0.5 tabular-nums text-cyan-200">{a.latency}ms</div>
          </div>
        </div>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/5">
          <motion.div
            className="h-full rounded-full"
            style={{ background: a.color, boxShadow: `0 0 8px ${a.color}` }}
            initial={{ width: 0 }}
            animate={{ width: `${a.success}%` }}
            transition={{ duration: 1.2 }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-white/40">Per mission</div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-base tabular-nums">{a.price.toFixed(2)}</span>
              <span className="text-[10px] text-white/50">SOL</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Link
              to={`/marketplace/${a.id}`}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/80 hover:border-cyan-300/40 hover:text-cyan-200"
            >
              Profile
            </Link>
            <button
              className="group/h relative inline-flex items-center gap-1 overflow-hidden rounded-lg px-3 py-1.5 text-[11px] text-black"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
              <Zap className="relative h-3 w-3" />
              <span className="relative">Hire</span>
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[9px]">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-white/55">
            {a.missions} missions
          </span>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/5 px-2 py-0.5 text-emerald-300">
            +{a.trend ?? 0}% 24h
          </span>
          {a.hires24h && a.hires24h > 25 && (
            <span className="rounded-full border border-rose-300/20 bg-rose-300/5 px-2 py-0.5 text-rose-300">
              <Flame className="mr-0.5 inline h-2.5 w-2.5" /> trending
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
              <span className="tabular-nums">{a.rep}</span>
              <span className="ml-1 text-white/30">·</span>
              <span className="text-white/50">{a.missions} missions</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { l: "Success", v: `${a.success}%`, c: "#10b981" },
            { l: "Latency", v: `${a.latency}ms`, c: "#22d3ee" },
            { l: "Price", v: `${a.price.toFixed(2)} SOL`, c: "#a855f7" },
          ].map((m) => (
            <div key={m.l} className="rounded-lg border border-white/5 bg-black/40 p-2 text-center">
              <div className="text-[9px] uppercase tracking-widest text-white/40">{m.l}</div>
              <div className="mt-0.5 tabular-nums" style={{ color: m.c }}>{m.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
          <span className="text-[10px] tabular-nums text-white/40">+{a.hires24h ?? 0} hires today</span>
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

export default function Marketplace() {
  const { connected } = useWallet();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("Recommended");
  const [maxPrice, setMaxPrice] = useState(1.0);
  const [minRep, setMinRep] = useState(4.5);
  const [catalogAgents, setCatalogAgents] = useState<Agent[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await fetchAgentsApi();
      if (!cancelled && rows?.length) setCatalogAgents(rows.map(apiAgentToCard));
      if (!cancelled) setCatalogLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const catalog = catalogAgents.length > 0 ? catalogAgents : allAgents;

  const featured = catalog.filter((a) => a.featured);

  const filtered = useMemo(() => {
    let list = catalog.filter((a) => {
      if (category !== "All" && a.category !== category) return false;
      if (a.price > maxPrice) return false;
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
    else if (sort === "Most hired") list = [...list].sort((a, b) => b.missions - a.missions);
    else if (sort === "Lowest latency") list = [...list].sort((a, b) => a.latency - b.latency);
    else if (sort === "Lowest price") list = [...list].sort((a, b) => a.price - b.price);
    return list;
  }, [catalog, query, category, sort, maxPrice, minRep]);

  const liveStats = {
    online: catalog.filter((a) => a.status === "online").length,
    total: catalog.length,
    hires: catalog.reduce((s, a) => s + (a.hires24h ?? 0), 0),
    volume: catalog.reduce((s, a) => s + a.price * (a.hires24h ?? 0), 0).toFixed(1),
  };

  const apiLive = apiConfigured() && catalogAgents.length > 0;

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
                status={{
                  label: `${liveStats.online}/${liveStats.total} online · ${apiLive ? "registry synced" : "demo roster"} · ${liveStats.hires} hires`,
                }}
                actions={
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[11px] uppercase tracking-[0.25em] text-white/50 backdrop-blur">
                    <Wallet className="h-3.5 w-3.5 text-emerald-300" />
                    <span>vol 24h</span>
                    <span className="text-emerald-300 tabular-nums">{liveStats.volume} SOL</span>
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
                  const count = c.name === "All" ? allAgents.length : allAgents.filter((a) => a.category === c.name).length;
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
                    <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">handpicked · top 1%</span>
                  </div>
                  <Link to="/marketplace/atlas" className="text-[11px] text-cyan-300 hover:underline">
                    Browse all elites →
                  </Link>
                </div>
                <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
                  {catalogLoading
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
                    <span className="text-white/40">Max price</span>
                    <input
                      type="range"
                      min={0.2}
                      max={1.0}
                      step={0.02}
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(parseFloat(e.target.value))}
                      className="w-32 accent-cyan-300"
                    />
                    <span className="tabular-nums text-cyan-300">{maxPrice.toFixed(2)} SOL</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-white/40">Min reputation</span>
                    <input
                      type="range"
                      min={4.0}
                      max={5.0}
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
              {catalogLoading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => <AgentCardSkeleton key={i} />)}
                </div>
              ) : filtered.length === 0 ? (
                <Card>
                  <div className="grid place-items-center p-16 text-center">
                    <Search className="h-7 w-7 text-white/30" />
                    <div className="mt-3 text-sm">No agents match these filters</div>
                    <div className="mt-1 text-xs text-white/50">Try widening price, lowering rep, or clearing search.</div>
                    <button
                      onClick={() => {
                        setQuery("");
                        setCategory("All");
                        setMaxPrice(1.0);
                        setMinRep(4.0);
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
                  <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300/70">streaming</span>
                </div>
                <Card>
                  <div className="grid gap-4 p-5 md:grid-cols-4">
                    {[
                      { l: "Active hires", v: liveStats.hires, sub: "+18% vs avg", c: "#22d3ee" },
                      { l: "Marketplace volume", v: `${liveStats.volume} SOL`, sub: "24h", c: "#10b981" },
                      { l: "Online specialists", v: `${liveStats.online}/${liveStats.total}`, sub: "across 11 categories", c: "#a855f7" },
                      { l: "Avg success", v: "97.3%", sub: "+0.4 wow", c: "#3b82f6" },
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
                  {[
                    { agent: "Atlas", who: "DAO-7x4F", t: "now",  c: "#22d3ee" },
                    { agent: "Lumen", who: "0x9c…21",  t: "12s",  c: "#3b82f6" },
                    { agent: "Vega",  who: "Solana Labs", t: "48s",  c: "#a855f7" },
                    { agent: "Halo",  who: "0x4a…7d",  t: "1m",   c: "#06b6d4" },
                    { agent: "Nyx",   who: "DAO-9k1",  t: "2m",   c: "#ec4899" },
                  ].map((e, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.c, boxShadow: `0 0 6px ${e.c}` }} />
                        <span style={{ color: e.c }}>{e.agent}</span>
                        <span className="text-white/40">←</span>
                        <span className="font-mono text-white/55">{e.who}</span>
                      </div>
                      <span className="font-mono text-[9px] text-white/30">{e.t}</span>
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
                      <span className="tabular-nums text-amber-300">★ {a.rep}</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Trending</div>
                <div className="mt-2 space-y-1.5">
                  {[...catalog].sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0)).slice(0, 5).map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[11px]">
                      <span className="flex items-center gap-2">
                        <Flame className="h-3 w-3 text-rose-300" />
                        <span>{a.name}</span>
                      </span>
                      <span className="tabular-nums text-emerald-300">+{a.trend}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex-1 overflow-y-auto rounded-lg border border-white/5 bg-black/60 p-3 font-mono text-[10.5px] leading-relaxed">
                <div className="text-[9px] uppercase tracking-[0.3em] text-cyan-300/70">// agent.economy</div>
                {[
                  { c: "text-white/40", t: "» mission.deploy(atlas) ✓" },
                  { c: "text-cyan-300", t: "  ↳ escrow 2.4 SOL locked" },
                  { c: "text-white/40", t: "» reputation.update(vega +0.02)" },
                  { c: "text-purple-300", t: "  ↳ peer endorsement received" },
                  { c: "text-white/40", t: "» payout.settle(halo, 0.5 SOL)" },
                  { c: "text-emerald-300", t: "  ↳ tx 4kJ2…91FE confirmed" },
                  { c: "text-white/40", t: "» search.semantic('growth')" },
                  { c: "text-blue-300",  t: "  ↳ 8 specialists matched" },
                ].map((l, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.06 }}
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
            </aside>
          </div>
          </WalletGate>
        </div>
      </div>
    </div>
  );
}

export const MARKETPLACE_FALLBACK_AGENTS = allAgents;
