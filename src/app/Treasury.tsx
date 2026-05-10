import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Wallet, ArrowUpRight, ArrowDownRight, TrendingUp, Lock, Unlock,
  Database, Activity, Zap, Shield, ExternalLink, Coins, GitBranch,
  CheckCircle2, Clock, AlertTriangle, Network,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { Skeleton } from "./components/ui/skeleton";
import { apiConfigured } from "../lib/api";
import { usePayments } from "./hooks/useHiveMind";
import { useMissions } from "./store";

function shortPk(pk: string) {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

const wallets = [
  { name: "Treasury Vault",  addr: "7xKn…42aF", balance: 2418.62, kind: "Multisig 3/5", c: "#22d3ee", available: 1842.10 },
  { name: "Mission Reserve", addr: "9aB2…71cD", balance: 612.40,  kind: "Operating",   c: "#a855f7", available: 412.40 },
  { name: "Agent Payouts",   addr: "4cE9…22bF", balance: 184.92,  kind: "Streaming",   c: "#10b981", available: 184.92 },
  { name: "Escrow Pool",     addr: "1fH4…88kL", balance: 348.20,  kind: "Locked",      c: "#f59e0b", available: 0 },
];

const FALLBACK_ESCROWS = [
  { id: "M-247", t: "Solana Marketing Campaign", amt: 48.00, locked: 28.40, agents: 6, status: "active", eta: "02h 14m", c: "#22d3ee" },
  { id: "M-241", t: "Investor Pitch Coordination", amt: 32.00, locked: 18.60, agents: 4, status: "active", eta: "06h 02m", c: "#a855f7" },
  { id: "M-238", t: "Landing Page Workflow",      amt: 22.00, locked: 4.20,  agents: 3, status: "settling", eta: "12m",    c: "#3b82f6" },
  { id: "M-229", t: "Solana Growth Strategy",     amt: 64.00, locked: 0,     agents: 8, status: "released", eta: "—",      c: "#10b981" },
];

const FALLBACK_PAYOUTS = [
  { agent: "Atlas",  amt: 0.42, mission: "M-247", t: "16:42", status: "settled",  c: "#22d3ee" },
  { agent: "Vega",   amt: 0.36, mission: "M-247", t: "16:38", status: "settled",  c: "#a855f7" },
  { agent: "Lumen",  amt: 0.48, mission: "M-241", t: "16:24", status: "pending",  c: "#3b82f6" },
  { agent: "Halo",   amt: 0.50, mission: "M-247", t: "16:18", status: "settled",  c: "#06b6d4" },
  { agent: "Echo",   amt: 0.32, mission: "M-238", t: "16:02", status: "approved", c: "#8b5cf6" },
  { agent: "Axiom",  amt: 0.62, mission: "M-247", t: "15:48", status: "settled",  c: "#10b981" },
  { agent: "Nyx",    amt: 0.45, mission: "M-241", t: "15:30", status: "settled",  c: "#ec4899" },
];

const FALLBACK_TX_FEED = [
  { t: "16:42:08", c: "text-emerald-300", k: "PAYOUT",  d: "Atlas → 0.42 SOL · M-247", x: "4kJ2…91FE" },
  { t: "16:42:01", c: "text-cyan-300",    k: "ESCROW",  d: "Locked 4.20 SOL → M-238",  x: "8aB1…02CD" },
  { t: "16:41:38", c: "text-purple-300",  k: "RELEASE", d: "Released 6.40 SOL · M-229", x: "3pQ7…66TX" },
  { t: "16:41:12", c: "text-emerald-300", k: "PAYOUT",  d: "Vega → 0.36 SOL · M-247",   x: "9wF3…14LM" },
  { t: "16:40:54", c: "text-amber-300",   k: "TOPUP",   d: "Vault +24.00 SOL · multisig", x: "2qN5…73KZ" },
  { t: "16:40:21", c: "text-blue-300",    k: "ROUTE",   d: "Cross-vault transfer 12 SOL", x: "6yJ4…88RS" },
  { t: "16:39:50", c: "text-emerald-300", k: "PAYOUT",  d: "Halo → 0.50 SOL · M-247",   x: "1aP2…44YX" },
  { t: "16:39:18", c: "text-cyan-300",    k: "ESCROW",  d: "Locked 18.60 SOL → M-241",  x: "5tU8…29WB" },
];

const splits = [
  { role: "Strategy",     pct: 24, c: "#22d3ee" },
  { role: "Research",     pct: 18, c: "#a855f7" },
  { role: "Design",       pct: 16, c: "#3b82f6" },
  { role: "Coordination", pct: 14, c: "#06b6d4" },
  { role: "Treasury",     pct: 12, c: "#10b981" },
  { role: "Analytics",    pct: 10, c: "#8b5cf6" },
  { role: "Reserve",      pct:  6, c: "#f59e0b" },
];

const statusTone: Record<string, { c: string; bg: string; label: string }> = {
  active:   { c: "#22d3ee", bg: "rgba(34,211,238,0.1)", label: "active"   },
  settling: { c: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: "settling" },
  released: { c: "#10b981", bg: "rgba(16,185,129,0.1)", label: "released" },
  pending:  { c: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: "pending"  },
  settled:  { c: "#10b981", bg: "rgba(16,185,129,0.1)", label: "settled"  },
  approved: { c: "#22d3ee", bg: "rgba(34,211,238,0.1)", label: "approved" },
};

export default function Treasury() {
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const { payments, loading: paymentsLoading } = usePayments();
  const { missions } = useMissions();
  const loading = paymentsLoading;

  const escrows = useMemo(() => {
    if (apiConfigured() && missions.length > 0) {
      const colors = ["#22d3ee", "#a855f7", "#3b82f6", "#10b981", "#f59e0b"];
      return missions.map((m, i) => ({
        id: m.id,
        t: m.title,
        amt: m.budget,
        locked: m.cost,
        agents: m.agents.length,
        status: (m.status === "active" ? "active" : m.status === "queued" ? "settling" : "released") as
          | "active"
          | "settling"
          | "released",
        eta: m.eta,
        c: colors[i % colors.length]!,
      }));
    }
    return FALLBACK_ESCROWS;
  }, [missions]);

  const payouts = useMemo(() => {
    if (apiConfigured() && payments.length > 0) {
      const colors = ["#22d3ee", "#a855f7", "#3b82f6", "#06b6d4", "#8b5cf6", "#10b981", "#ec4899"];
      return payments.map((p, i) => ({
        agent: shortPk(p.recipientPubkey),
        amt: p.amountSol,
        mission: p.missionId,
        t: new Date(p.createdAt).toLocaleTimeString("en-US", { hour12: false }),
        status: (p.status === "confirmed" ? "settled" : p.status === "submitted" ? "approved" : "pending") as
          | "settled"
          | "approved"
          | "pending",
        c: colors[i % colors.length]!,
      }));
    }
    return FALLBACK_PAYOUTS;
  }, [payments]);

  const txFeed = useMemo(() => {
    if (apiConfigured() && payments.length > 0) {
      const inject = payments.slice(0, 8).map((p) => ({
        t: new Date(p.createdAt).toLocaleTimeString("en-US", { hour12: false }),
        c: p.status === "confirmed" ? "text-emerald-300" : "text-amber-300",
        k: "PAYOUT",
        d: `${p.amountSol.toFixed(2)} SOL → ${shortPk(p.recipientPubkey)} · ${p.missionId}`,
        x: shortPk(p.id),
      }));
      return [...inject, ...FALLBACK_TX_FEED];
    }
    return FALLBACK_TX_FEED;
  }, [payments]);

  const total = wallets.reduce((s, w) => s + w.balance, 0);
  const available = wallets.reduce((s, w) => s + w.available, 0);
  const locked = total - available;

  const realVolume24h = useMemo(() => {
    if (!apiConfigured() || payments.length === 0) return null;
    const now = Date.now();
    const day = 86400000;
    return payments
      .filter((p) => now - new Date(p.createdAt).getTime() < day)
      .reduce((s, p) => s + p.amountSol, 0)
      .toFixed(2);
  }, [payments]);

  const activeMissionsCount = missions.filter((m) => m.status === "active").length;
  const totalBudgetLocked = useMemo(
    () => missions.filter((m) => m.status === "active").reduce((s, m) => s + m.cost, 0).toFixed(2),
    [missions],
  );

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
                "radial-gradient(ellipse at 15% 0%, rgba(16,185,129,0.12), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(34,211,238,0.12), transparent 55%)",
            }}
          />
          <Particles count={24} />

          <div className="relative px-6 py-6">
            <PageHeader
              title="Treasury Dashboard"
              subtitle="Economic coordination infrastructure for autonomous AI workforces."
              crumbs={[{ label: "Treasury" }]}
              status={{ label: "Solana mainnet · settling", tone: "emerald" }}
              actions={
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[11px] uppercase tracking-[0.25em] text-white/50 backdrop-blur">
                    <Network className="h-3.5 w-3.5 text-emerald-300" />
                    <span>slot</span>
                    <span className="font-mono text-emerald-300">268,124,412</span>
                  </div>
                  <button className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black">
                    <span className="absolute inset-0 bg-gradient-to-r from-emerald-300 to-cyan-300" />
                    <Wallet className="relative h-3.5 w-3.5" />
                    <span className="relative">Deposit</span>
                  </button>
                </div>
              }
            />

            {/* Hero overview */}
            <Card className="mb-6">
              <div className="absolute inset-0 opacity-50">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 15% 0%, rgba(16,185,129,0.18), transparent 50%), radial-gradient(circle at 85% 100%, rgba(34,211,238,0.18), transparent 50%)",
                  }}
                />
              </div>

              <div className="relative grid gap-6 p-6 lg:grid-cols-[1.4fr_1fr]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.3em] text-emerald-300 flex items-center gap-2">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </span>
                    Total Treasury · live
                  </div>
                  <div className="mt-3 flex flex-wrap items-baseline gap-3">
                    <motion.span
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6 }}
                      className="text-5xl tabular-nums tracking-tight md:text-6xl"
                    >
                      {total.toFixed(2)}
                    </motion.span>
                    <span className="text-lg text-white/50">SOL</span>
                    <span className="ml-2 inline-flex items-center gap-1 text-sm text-emerald-300">
                      <ArrowUpRight className="h-4 w-4" /> +18.4% / 30d
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-white/40">≈ ${(total * 184).toLocaleString()} USD</div>

                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {loading
                      ? Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="rounded-xl border border-white/10 bg-black/30 p-3">
                            <Skeleton className="mb-2 h-3 w-16 bg-white/10" />
                            <Skeleton className="mb-1 h-6 w-14 bg-white/10" />
                            <Skeleton className="h-2 w-8 bg-white/5" />
                          </div>
                        ))
                      : [
                          { l: "Available",      v: available.toFixed(2),                  c: "#10b981", icon: Unlock },
                          { l: "Escrow Locked",  v: totalBudgetLocked,                     c: "#f59e0b", icon: Lock },
                          { l: "24h Volume",     v: realVolume24h ?? "—",                  c: "#22d3ee", icon: Activity },
                          { l: "Active Missions",v: String(activeMissionsCount),            c: "#a855f7", icon: GitBranch },
                        ].map((m, i) => (
                          <motion.div
                            key={m.l}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="rounded-xl border border-white/10 bg-black/30 p-3"
                          >
                            <div className="flex items-center justify-between">
                              <m.icon className="h-3.5 w-3.5" style={{ color: m.c }} />
                              <span className="text-[9px] uppercase tracking-widest text-white/40">{m.l}</span>
                            </div>
                            <div className="mt-2 text-xl tabular-nums">{m.v}</div>
                            <div className="text-[10px] text-white/40">{m.l === "Active Missions" ? `across ${missions.reduce((s, m) => s + m.agents.length, 0)} agents` : "SOL"}</div>
                          </motion.div>
                        ))
                    }
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
                      <span>Treasury Composition</span>
                      <span className="text-emerald-300">balanced</span>
                    </div>
                    <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full">
                      {wallets.map((w) => (
                        <div
                          key={w.name}
                          className="h-full"
                          style={{
                            width: `${(w.balance / total) * 100}%`,
                            background: w.c,
                            boxShadow: `0 0 12px ${w.c}80`,
                          }}
                          title={`${w.name} · ${w.balance.toFixed(2)} SOL`}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px]">
                      {wallets.map((w) => (
                        <span key={w.name} className="flex items-center gap-1.5 text-white/55">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: w.c, boxShadow: `0 0 6px ${w.c}` }} />
                          {w.name} · {((w.balance / total) * 100).toFixed(0)}%
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300">Cashflow · {range}</div>
                    <div className="flex gap-1 rounded-md border border-white/10 bg-black/40 p-0.5 text-[10px]">
                      {(["24h", "7d", "30d"] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => setRange(r)}
                          className={`rounded px-2 py-0.5 ${range === r ? "bg-cyan-300/20 text-cyan-100" : "text-white/50 hover:text-white"}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 h-44 w-full rounded-xl border border-white/10 bg-black/40 p-2">
                    <svg viewBox="0 0 400 140" className="h-full w-full" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="trIn" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="trOut" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d="M0,90 L40,82 L80,86 L120,68 L160,74 L200,52 L240,58 L280,38 L320,46 L360,24 L400,30 L400,140 L0,140 Z" fill="url(#trIn)" />
                      <path d="M0,90 L40,82 L80,86 L120,68 L160,74 L200,52 L240,58 L280,38 L320,46 L360,24 L400,30" fill="none" stroke="#10b981" strokeWidth="1.6" />
                      <path d="M0,108 L40,104 L80,106 L120,94 L160,98 L200,82 L240,88 L280,72 L320,80 L360,64 L400,72 L400,140 L0,140 Z" fill="url(#trOut)" />
                      <path d="M0,108 L40,104 L80,106 L120,94 L160,98 L200,82 L240,88 L280,72 L320,80 L360,64 L400,72" fill="none" stroke="#f59e0b" strokeWidth="1.4" />
                    </svg>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-md bg-black/30 p-2">
                      <div className="text-white/40">Inflow</div>
                      <div className="text-emerald-300 tabular-nums">+248.4</div>
                    </div>
                    <div className="rounded-md bg-black/30 p-2">
                      <div className="text-white/40">Outflow</div>
                      <div className="text-amber-300 tabular-nums">−104.2</div>
                    </div>
                    <div className="rounded-md bg-black/30 p-2">
                      <div className="text-white/40">Net</div>
                      <div className="text-cyan-300 tabular-nums">+144.2</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Wallets */}
            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {wallets.map((w) => (
                <motion.div
                  key={w.name}
                  whileHover={{ y: -2 }}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-5 backdrop-blur-xl"
                  style={{ boxShadow: `0 0 30px ${w.c}22` }}
                >
                  <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-30" style={{ background: w.c, filter: "blur(48px)" }} />
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10"
                          style={{ background: `linear-gradient(135deg, ${w.c}55, ${w.c}11)` }}
                        >
                          <Wallet className="h-4 w-4 text-white/85" />
                        </div>
                        <div>
                          <div className="text-sm">{w.name}</div>
                          <div className="text-[10px] text-white/40">{w.kind}</div>
                        </div>
                      </div>
                      <button className="text-white/30 hover:text-cyan-300">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-4 text-2xl tabular-nums">{w.balance.toFixed(2)}</div>
                    <div className="text-[11px] text-white/40">SOL · ≈ ${(w.balance * 184).toFixed(0)}</div>
                    <div className="mt-3 flex items-center justify-between text-[10px] text-white/50">
                      <span className="font-mono">{w.addr}</span>
                      <span style={{ color: w.c }}>{((w.available / w.balance) * 100).toFixed(0)}% avail</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: w.c, boxShadow: `0 0 8px ${w.c}` }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(w.available / w.balance) * 100 || 0}%` }}
                        transition={{ duration: 1 }}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Escrow + Solana economic layer */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Lock className="h-4 w-4 text-amber-300" />
                    Mission Escrow
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-amber-300">{escrows.filter(e => e.status === "active").length} active</span>
                </div>
                <div className="p-3">
                  <div className="space-y-2">
                    {loading
                      ? Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="flex items-center gap-4 rounded-xl border border-white/10 bg-black/30 p-3">
                            <Skeleton className="h-10 w-10 shrink-0 rounded-lg bg-white/10" />
                            <div className="flex-1 space-y-2">
                              <Skeleton className="h-4 w-40 bg-white/10" />
                              <Skeleton className="h-3 w-24 bg-white/5" />
                              <Skeleton className="h-1 w-full bg-white/5" />
                            </div>
                            <div className="text-right space-y-1">
                              <Skeleton className="h-4 w-16 bg-white/10" />
                              <Skeleton className="h-4 w-12 rounded-full bg-white/5" />
                            </div>
                          </div>
                        ))
                      : escrows.map((e) => {
                      const pct = e.amt > 0 ? Math.min(100, (e.locked / e.amt) * 100) : 0;
                      const tone = statusTone[e.status];
                      return (
                        <motion.div
                          key={e.id}
                          whileHover={{ x: 2 }}
                          className="flex items-center gap-4 rounded-xl border border-white/10 bg-black/30 p-3"
                        >
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                            style={{ background: `linear-gradient(135deg, ${e.c}55, ${e.c}11)`, boxShadow: `0 0 16px ${e.c}55` }}
                          >
                            <Coins className="h-4 w-4 text-white/85" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-mono text-[11px] text-white/40">{e.id}</span>
                              <span className="truncate">{e.t}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-[11px] text-white/55">
                              <span>{e.agents} agents</span>
                              <span>·</span>
                              <span>eta {e.eta}</span>
                            </div>
                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ background: e.c, boxShadow: `0 0 8px ${e.c}` }}
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 1 }}
                              />
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm tabular-nums">
                              <span style={{ color: e.c }}>{e.locked.toFixed(2)}</span>
                              <span className="text-white/40"> / {e.amt.toFixed(2)}</span>
                            </div>
                            <span
                              className="mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] uppercase tracking-widest"
                              style={{ background: tone.bg, color: tone.c, border: `1px solid ${tone.c}33` }}
                            >
                              {tone.label}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                </div>
              </Card>

              {/* Solana economic layer */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Network className="h-4 w-4 text-emerald-300" />
                    Solana Layer
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-300">on-chain</span>
                </div>
                <div className="p-5">
                  <div className="relative h-44 w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
                    <svg viewBox="0 0 100 60" className="h-full w-full" preserveAspectRatio="none">
                      {/* network nodes */}
                      <g>
                        {[
                          { x: 50, y: 30, r: 4, c: "#10b981" },
                          { x: 20, y: 18, r: 2.4, c: "#22d3ee" },
                          { x: 80, y: 18, r: 2.4, c: "#a855f7" },
                          { x: 24, y: 46, r: 2.2, c: "#3b82f6" },
                          { x: 74, y: 48, r: 2.4, c: "#ec4899" },
                          { x: 50, y: 8,  r: 1.8, c: "#f59e0b" },
                          { x: 50, y: 54, r: 1.8, c: "#06b6d4" },
                        ].map((n, i) => (
                          <g key={i}>
                            {i > 0 && (
                              <line x1={50} y1={30} x2={n.x} y2={n.y} stroke={n.c} strokeOpacity="0.3" strokeWidth="0.18" />
                            )}
                            <circle cx={n.x} cy={n.y} r={n.r} fill={n.c} opacity="0.9" />
                          </g>
                        ))}
                        {[
                          { x: 20, y: 18, c: "#22d3ee" },
                          { x: 80, y: 18, c: "#a855f7" },
                          { x: 24, y: 46, c: "#3b82f6" },
                          { x: 74, y: 48, c: "#ec4899" },
                        ].map((n, i) => (
                          <motion.circle
                            key={`fp-${i}`}
                            r="0.55" fill={n.c}
                            initial={{ cx: n.x, cy: n.y, opacity: 0 }}
                            animate={{ cx: [n.x, 50], cy: [n.y, 30], opacity: [0, 0.9, 0] }}
                            transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.5, ease: "linear" }}
                          />
                        ))}
                      </g>
                    </svg>
                    <div className="absolute left-3 top-3 text-[10px] uppercase tracking-[0.25em] text-emerald-300/70">
                      ◢ settlement mesh
                    </div>
                    <div className="absolute right-3 bottom-3 text-[9px] tabular-nums text-white/40">
                      tps 184 · 12ms
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-[11px]">
                    {[
                      { i: Shield,  l: "Multisig vault",     v: "3 of 5", c: "#22d3ee" },
                      { i: GitBranch, l: "Smart escrow",     v: "v2.4 verified", c: "#10b981" },
                      { i: Database, l: "Reputation oracle", v: "synced · 8s ago", c: "#a855f7" },
                      { i: CheckCircle2, l: "Compliance",    v: "passing", c: "#06b6d4" },
                    ].map((x, i) => (
                      <div key={i} className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                        <span className="flex items-center gap-2 text-white/70">
                          <x.i className="h-3 w-3" style={{ color: x.c }} />
                          {x.l}
                        </span>
                        <span className="tabular-nums" style={{ color: x.c }}>{x.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* Payouts + Splits */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              {/* payouts */}
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-cyan-300" />
                    Agent Payouts
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">leaderboard · 24h</span>
                </div>
                <div className="p-3">
                  {loading ? (
                    <div className="space-y-2 p-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 border-t border-white/5 py-2">
                          <Skeleton className="h-4 w-20 bg-white/10" />
                          <Skeleton className="h-4 w-14 bg-white/5" />
                          <Skeleton className="h-5 w-16 rounded-full bg-white/5" />
                          <Skeleton className="ml-auto h-4 w-20 bg-white/10" />
                          <Skeleton className="h-4 w-12 bg-white/5" />
                        </div>
                      ))}
                    </div>
                  ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                        <th className="px-3 py-2 text-left">Agent</th>
                        <th className="px-3 py-2 text-left">Mission</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((p, i) => {
                        const tone = statusTone[p.status];
                        return (
                          <motion.tr
                            key={`${p.agent}-${p.mission}-${p.t}-${i}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.04 }}
                            className="border-t border-white/5 text-[12px] hover:bg-white/[0.02]"
                          >
                            <td className="px-3 py-2.5">
                              <span className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full" style={{ background: p.c, boxShadow: `0 0 6px ${p.c}` }} />
                                <span>{p.agent}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-white/55">{p.mission}</td>
                            <td className="px-3 py-2.5">
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest"
                                style={{ background: tone.bg, color: tone.c, border: `1px solid ${tone.c}33` }}
                              >
                                {tone.label}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">+{p.amt.toFixed(2)} SOL</td>
                            <td className="px-3 py-2.5 text-right font-mono text-[11px] text-white/40">{p.t}</td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                  )}
                </div>
              </Card>

              {/* revenue splits */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-purple-300" />
                    Revenue Splits
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-purple-300">avg · last 30d</span>
                </div>
                <div className="p-5">
                  <div className="relative mx-auto h-40 w-40">
                    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                      {(() => {
                        let acc = 0;
                        return splits.map((s) => {
                          const dash = s.pct;
                          const offset = -acc;
                          acc += s.pct;
                          return (
                            <circle
                              key={s.role}
                              cx="50" cy="50" r="40"
                              fill="none"
                              stroke={s.c}
                              strokeWidth="14"
                              strokeDasharray={`${dash} 100`}
                              strokeDashoffset={offset}
                              pathLength="100"
                              strokeLinecap="butt"
                              opacity="0.9"
                            />
                          );
                        });
                      })()}
                      <circle cx="50" cy="50" r="28" fill="rgba(0,0,0,0.6)" />
                    </svg>
                    <div className="absolute inset-0 grid place-items-center text-center">
                      <div>
                        <div className="text-[9px] uppercase tracking-[0.25em] text-white/40">distributed</div>
                        <div className="mt-1 text-xl tabular-nums">100%</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5 text-[11px]">
                    {splits.map((s) => (
                      <div key={s.role} className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.c, boxShadow: `0 0 6px ${s.c}` }} />
                        <span className="flex-1 text-white/65">{s.role}</span>
                        <span className="tabular-nums text-white/85">{s.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* Transaction feed + Analytics */}
            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4 text-cyan-300" />
                    Financial Analytics
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">treasury intelligence</span>
                </div>
                <div className="grid gap-3 p-5 md:grid-cols-3">
                  {[
                    { k: "Treasury Growth", v: "+18.4%",  d: "MoM",        c: "#10b981", up: true },
                    { k: "Payout Velocity", v: "184/day", d: "+12 wow",    c: "#22d3ee", up: true },
                    { k: "Mission Profit",  v: "0.42 SOL", d: "avg margin", c: "#a855f7", up: true },
                    { k: "Token Util.",     v: "82%",      d: "+4 wow",    c: "#3b82f6", up: true },
                    { k: "Agent ROI",       v: "3.2×",     d: "rolling",   c: "#ec4899", up: true },
                    { k: "Efficiency",      v: "97.3%",    d: "+0.4 wow",  c: "#f59e0b", up: true },
                  ].map((m) => (
                    <div key={m.k} className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{m.k}</div>
                        {m.up ? (
                          <ArrowUpRight className="h-3 w-3 text-emerald-300" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 text-rose-300" />
                        )}
                      </div>
                      <div className="mt-2 text-2xl tabular-nums" style={{ color: m.c }}>{m.v}</div>
                      <div className="text-[10px] text-white/40">{m.d}</div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: m.c, boxShadow: `0 0 8px ${m.c}` }}
                          initial={{ width: 0 }}
                          animate={{ width: `${60 + Math.random() * 30}%` }}
                          transition={{ duration: 1 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/5 px-5 pb-5 pt-4">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
                    <span>Mission Budget Allocation</span>
                    <span className="text-cyan-300">live</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {[
                      { l: "Agent Compute",     v: 0.45, c: "#22d3ee" },
                      { l: "Token Usage",       v: 0.22, c: "#a855f7" },
                      { l: "Escrow Reserve",    v: 0.20, c: "#10b981" },
                      { l: "Settlement Buffer", v: 0.13, c: "#f59e0b" },
                    ].map((x) => (
                      <div key={x.l}>
                        <div className="flex justify-between text-[11px] text-white/55">
                          <span>{x.l}</span>
                          <span className="tabular-nums">{(x.v * 100).toFixed(0)}% · {(166 * x.v).toFixed(2)} SOL</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: x.c, boxShadow: `0 0 8px ${x.c}80` }}
                            initial={{ width: 0 }}
                            animate={{ width: `${x.v * 100}%` }}
                            transition={{ duration: 0.8 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* tx feed */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Database className="h-4 w-4 text-cyan-300" />
                    Transaction Feed
                  </div>
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    className="text-[10px] uppercase tracking-[0.25em] text-cyan-300"
                  >
                    streaming
                  </motion.span>
                </div>
                <div className="p-3">
                  <div className="rounded-lg border border-white/5 bg-black/60 p-3 font-mono text-[11px] leading-relaxed">
                    {txFeed.map((l, i) => (
                      <motion.div
                        key={`${l.t}-${l.k}-${l.d}-${i}`}
                        initial={{ opacity: 0, x: 4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-start gap-2 border-b border-white/5 py-1.5 last:border-0"
                      >
                        <span className="font-mono text-[9px] text-white/30">{l.t}</span>
                        <span className={`${l.c} font-mono text-[9px] uppercase tracking-widest`}>{l.k}</span>
                        <span className="flex-1 text-white/70">{l.d}</span>
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
                      { l: "tps", v: "184", i: Zap },
                      { l: "fees", v: "0.04", i: Coins },
                      { l: "blk", v: "12ms", i: Clock },
                    ].map((x) => (
                      <div key={x.l} className="rounded-md border border-white/5 bg-white/[0.02] py-2">
                        <x.i className="mx-auto h-3 w-3 text-cyan-300" />
                        <div className="mt-1 text-white/40">{x.l}</div>
                        <div className="tabular-nums text-white/85">{x.v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-300/20 bg-amber-300/5 p-2.5 text-[11px] text-amber-200">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>Settlement buffer below 15% — consider top-up.</span>
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
