import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Wallet, ArrowUpRight, TrendingUp, Lock, Unlock,
  Database, Activity, Zap, Shield, ExternalLink, Coins, GitBranch,
  CheckCircle2, Clock, Network, X, Loader2,
} from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { toast } from "sonner";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { Skeleton } from "./components/ui/skeleton";
import { WalletGate } from "./components/WalletGate";
import { createPaymentIntentApi } from "../lib/api";
import { usePayments } from "./hooks/useHiveMind";
import { useMissions } from "./store";

/** Where the user's deposit lands on-chain. Defaults to the HiveMind funder pubkey on
 *  devnet (also funds new wallets). Override with VITE_HM_TREASURY_PUBKEY in production. */
const TREASURY_RECIPIENT_PUBKEY =
  import.meta.env.VITE_HM_TREASURY_PUBKEY?.trim() ||
  "G4o8wSS85JzcpDqTN9RWKaUvFF2a3bT3x2yewyk4xWPc";

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

const ROLE_COLOR: Record<string, string> = {
  Strategy: "#22d3ee",
  Research: "#a855f7",
  Design: "#3b82f6",
  Development: "#0ea5e9",
  Marketing: "#ec4899",
  Treasury: "#10b981",
  Analytics: "#8b5cf6",
  Coordination: "#06b6d4",
  Memory: "#f59e0b",
};

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
  const { missions, walletConnected } = useMissions();
  const loading = paymentsLoading;
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  // Poll the devnet RPC for the current slot every 5s — replaces the hardcoded SLOT pill.
  const [liveSlot, setLiveSlot] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const slot = await connection.getSlot();
        if (!cancelled) setLiveSlot(slot);
      } catch {
        /* swallow — banner will fall back to em-dash */
      }
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [connection]);

  // Live on-chain SOL balance of the HiveMind treasury recipient pubkey — the only
  // honest source for the Treasury Vault card. Polled every 15s.
  const [treasuryBalanceSol, setTreasuryBalanceSol] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const lamports = await connection.getBalance(new PublicKey(TREASURY_RECIPIENT_PUBKEY));
        if (!cancelled) setTreasuryBalanceSol(lamports / LAMPORTS_PER_SOL);
      } catch {
        /* leave at null → em-dash */
      }
    };
    tick();
    const id = window.setInterval(tick, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [connection]);

  // Deposit modal state
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("0.1");
  const [depositing, setDepositing] = useState(false);

  const submitDeposit = async () => {
    if (depositing) return;
    if (!connected || !publicKey || !sendTransaction) {
      toast.error("Connect your wallet first");
      return;
    }
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a positive SOL amount");
      return;
    }
    if (amount > 10) {
      toast.error("Devnet cap: 10 SOL per deposit");
      return;
    }
    setDepositing(true);
    try {
      const recipient = new PublicKey(TREASURY_RECIPIENT_PUBKEY);
      const lamports = Math.round(amount * LAMPORTS_PER_SOL);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: publicKey,
        recentBlockhash: blockhash,
      }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipient,
          lamports,
        }),
      );
      const sig = await sendTransaction(tx, connection);
      toast("Deposit signed", { description: `Confirming ${amount} SOL on devnet…` });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      // Tag the deposit against the most-recent mission (or a synthetic "platform" id)
      // so it shows up in the payment feed alongside other settlements.
      const missionTag = missions[0]?.id ?? "platform-deposit";
      await createPaymentIntentApi({
        missionId: missionTag,
        amountSol: amount,
        recipientPubkey: TREASURY_RECIPIENT_PUBKEY,
      });
      toast.success("Deposit confirmed", {
        description: `${amount} SOL · ${sig.slice(0, 8)}…${sig.slice(-6)}`,
      });
      setDepositOpen(false);
      setDepositAmount("0.1");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        toast.message("Deposit cancelled");
      } else {
        toast.error("Deposit failed", { description: msg.slice(0, 140) });
      }
    } finally {
      setDepositing(false);
    }
  };

  const escrows = useMemo(() => {
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
  }, [missions]);

  const payouts = useMemo(() => {
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
  }, [payments]);

  const txFeed = useMemo(() => {
    return payments.slice(0, 16).map((p) => ({
      t: new Date(p.createdAt).toLocaleTimeString("en-US", { hour12: false }),
      c: p.status === "confirmed" ? "text-emerald-300" : p.status === "submitted" ? "text-cyan-300" : "text-amber-300",
      k: p.recipientPubkey === TREASURY_RECIPIENT_PUBKEY ? "DEPOSIT" : "PAYOUT",
      d: `${p.amountSol.toFixed(2)} SOL → ${shortPk(p.recipientPubkey)} · ${p.missionId}`,
      x: shortPk(p.id),
    }));
  }, [payments]);

  const totalBudget = useMemo(
    () => missions.reduce((s, m) => s + m.budget, 0),
    [missions],
  );
  const activeBudget = useMemo(
    () => missions.filter((m) => m.status === "active").reduce((s, m) => s + m.budget, 0),
    [missions],
  );
  const activeLocked = useMemo(
    () => missions.filter((m) => m.status === "active").reduce((s, m) => s + m.cost, 0),
    [missions],
  );
  const completedBudget = useMemo(
    () => missions.filter((m) => m.status === "completed").reduce((s, m) => s + m.budget, 0),
    [missions],
  );
  const payoutTotal = useMemo(
    () => payments.reduce((s, p) => s + p.amountSol, 0),
    [payments],
  );
  const queuedBudget = Math.max(0, totalBudget - activeBudget - completedBudget);

  const wallets = useMemo(() => {
    return [
      {
        name: "Treasury Vault",
        addr: `${TREASURY_RECIPIENT_PUBKEY.slice(0, 4)}…${TREASURY_RECIPIENT_PUBKEY.slice(-4)}`,
        kind: "On-chain · devnet",
        c: "#22d3ee",
        balance: treasuryBalanceSol,
        available: treasuryBalanceSol,
        explorer: `https://explorer.solana.com/address/${TREASURY_RECIPIENT_PUBKEY}?cluster=devnet`,
      },
      {
        name: "Mission Reserve",
        addr: missions.length > 0 ? `${missions.length} missions` : "—",
        kind: "Committed",
        c: "#a855f7",
        balance: missions.length > 0 ? totalBudget : null,
        available: missions.length > 0 ? Math.max(0, totalBudget - activeLocked) : null,
        explorer: null,
      },
      {
        name: "Agent Payouts",
        addr: payments.length > 0 ? `${payments.length} txs` : "—",
        kind: "Settled",
        c: "#10b981",
        balance: payments.length > 0 ? payoutTotal : null,
        available: payments.length > 0 ? payoutTotal : null,
        explorer: null,
      },
      {
        name: "Escrow Pool",
        addr: missions.filter((m) => m.status === "active").length > 0
          ? `${missions.filter((m) => m.status === "active").length} active`
          : "—",
        kind: "Locked",
        c: "#f59e0b",
        balance: missions.some((m) => m.status === "active") ? activeLocked : null,
        available: 0,
        explorer: null,
      },
    ];
  }, [missions, payments, treasuryBalanceSol, totalBudget, activeLocked, payoutTotal]);

  // Headline total = real on-chain treasury balance (the only truly verifiable number).
  const total = treasuryBalanceSol;
  const available = treasuryBalanceSol != null ? Math.max(0, treasuryBalanceSol - activeLocked) : null;
  // Partition of Mission Reserve — disjoint subsets summing to total budget.
  const compositionParts = totalBudget > 0
    ? [
        { name: "Active Escrow", value: activeBudget, c: "#f59e0b" },
        { name: "Completed Vault", value: completedBudget, c: "#a855f7" },
        { name: "Queued / Reserved", value: queuedBudget, c: "#22d3ee" },
      ]
    : [];
  // Safe percent helper — avoids NaN when a bucket is empty.
  const pct = (num: number, denom: number) => (denom > 0 ? (num / denom) * 100 : 0);

  const realVolume24h = useMemo(() => {
    if (payments.length === 0) return null;
    const now = Date.now();
    const day = 86400000;
    return payments
      .filter((p) => now - new Date(p.createdAt).getTime() < day)
      .reduce((s, p) => s + p.amountSol, 0);
  }, [payments]);

  const activeMissionsCount = missions.filter((m) => m.status === "active").length;
  const totalBudgetLocked = useMemo(
    () => missions.filter((m) => m.status === "active").reduce((s, m) => s + m.cost, 0),
    [missions],
  );

  // Live cashflow series — bucket real payments across the selected window. Deposits TO
  // the treasury recipient pubkey are INFLOW; everything else is OUTFLOW (agent payouts).
  // Returns hasRealData=false (and zeroed series) when there's no payment history so the
  // chart honestly shows nothing instead of a fake ramp.
  const cashflow = useMemo(() => {
    const rangeMs = range === "24h" ? 86_400_000 : range === "7d" ? 604_800_000 : 2_592_000_000;
    const now = Date.now();
    const start = now - rangeMs;
    const BUCKETS = 20;
    const bucketMs = rangeMs / BUCKETS;
    const inBuckets = new Array(BUCKETS).fill(0);
    const outBuckets = new Array(BUCKETS).fill(0);
    let hasRealData = false;
    for (const p of payments) {
      const t = new Date(p.createdAt).getTime();
      if (Number.isNaN(t) || t < start || t > now) continue;
      hasRealData = true;
      const idx = Math.min(BUCKETS - 1, Math.max(0, Math.floor((t - start) / bucketMs)));
      if (p.recipientPubkey === TREASURY_RECIPIENT_PUBKEY) inBuckets[idx] += p.amountSol;
      else outBuckets[idx] += p.amountSol;
    }
    // Cumulative running totals — what the user actually wants to see is "money in/out
    // over time," not a per-bucket spike, so each point is the sum so far.
    let cIn = 0;
    let cOut = 0;
    const inSeries = inBuckets.map((v) => (cIn += v));
    const outSeries = outBuckets.map((v) => (cOut += v));
    const maxV = Math.max(...inSeries, ...outSeries, 0.01);

    // SVG geometry: viewBox 400×140, top of plot y=20, bottom y=130 (plot height 110).
    const toPoints = (series: number[]) =>
      series
        .map((v, i) => {
          const x = (i / (BUCKETS - 1)) * 400;
          const y = 130 - (v / maxV) * 110;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");

    const linePoints = (series: number[]) => `M${toPoints(series).replaceAll(" ", " L")}`;
    const areaPath = (series: number[]) => `${linePoints(series)} L400,140 L0,140 Z`;

    return {
      inLine: linePoints(inSeries),
      outLine: linePoints(outSeries),
      inArea: areaPath(inSeries),
      outArea: areaPath(outSeries),
      inflowTotal: cIn,
      outflowTotal: cOut,
      net: cIn - cOut,
      hasRealData,
    };
  }, [payments, range]);

  // Revenue splits — derive from REAL mission agent assignments. Each agent on each
  // mission contributes 1 share of its budget allocation. When no missions exist,
  // the donut shows the empty state instead of fake percentages.
  const splits = useMemo(() => {
    if (missions.length === 0) return [];
    const roleSpend: Record<string, number> = {};
    for (const m of missions) {
      if (m.agents.length === 0) continue;
      const perAgent = m.budget / m.agents.length;
      for (const role of m.agents) roleSpend[role] = (roleSpend[role] ?? 0) + perAgent;
    }
    const total = Object.values(roleSpend).reduce((s, v) => s + v, 0);
    if (total === 0) return [];
    return Object.entries(roleSpend)
      .sort((a, b) => b[1] - a[1])
      .map(([role, v]) => ({
        role,
        pct: Math.round((v / total) * 100),
        c: ROLE_COLOR[role] ?? "#64748b",
      }));
  }, [missions]);

  // Mission Budget Allocation — average the four budget-allocation buckets across
  // every mission that has one. Earlier card hard-coded 45/22/20/13 — now reflects
  // what the user actually configured (or shows "—" before any mission).
  const budgetAllocation = useMemo(() => {
    const rows = missions.flatMap((m) => (m.config?.budgetAllocation ? [m.config.budgetAllocation] : []));
    if (rows.length === 0) return null;
    const sum = rows.reduce(
      (acc, r) => ({
        agentCompute: acc.agentCompute + r.agentCompute,
        tokenUsage: acc.tokenUsage + r.tokenUsage,
        escrowReserve: acc.escrowReserve + r.escrowReserve,
        settlementBuffer: acc.settlementBuffer + r.settlementBuffer,
      }),
      { agentCompute: 0, tokenUsage: 0, escrowReserve: 0, settlementBuffer: 0 },
    );
    const totalParts = sum.agentCompute + sum.tokenUsage + sum.escrowReserve + sum.settlementBuffer || 1;
    return {
      agentCompute: sum.agentCompute / totalParts,
      tokenUsage: sum.tokenUsage / totalParts,
      escrowReserve: sum.escrowReserve / totalParts,
      settlementBuffer: sum.settlementBuffer / totalParts,
    };
  }, [missions]);

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
                "radial-gradient(ellipse at 15% 0%, rgba(16,185,129,0.12), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(34,211,238,0.12), transparent 55%)",
            }}
          />
          <Particles count={24} />
          <WalletGate connected={walletConnected}>
          <div className="relative px-6 py-6">
            <PageHeader
              title="Treasury Dashboard"
              subtitle="Economic coordination infrastructure for autonomous AI workforces."
              crumbs={[{ label: "Treasury" }]}
              status={{ label: "Solana devnet · live", tone: "emerald" }}
              actions={
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[11px] uppercase tracking-[0.25em] text-white/50 backdrop-blur">
                    <Network className="h-3.5 w-3.5 text-emerald-300" />
                    <span>slot</span>
                    <span className="font-mono text-emerald-300">
                      {liveSlot != null ? liveSlot.toLocaleString() : "—"}
                    </span>
                  </div>
                  <button
                    onClick={() => setDepositOpen(true)}
                    disabled={!connected}
                    title={!connected ? "Connect your wallet to deposit" : "Deposit SOL into the HiveMind treasury"}
                    className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
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
                      {total != null ? total.toFixed(2) : "—"}
                    </motion.span>
                    <span className="text-lg text-white/50">SOL</span>
                    {realVolume24h != null && realVolume24h > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1 text-sm text-emerald-300">
                        <ArrowUpRight className="h-4 w-4" /> {realVolume24h.toFixed(2)} SOL / 24h
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-white/40">
                    {total != null ? `on-chain · ${shortPk(TREASURY_RECIPIENT_PUBKEY)} · devnet` : "treasury pubkey unreachable"}
                  </div>

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
                          { l: "Available",      v: available != null ? available.toFixed(2) : "—",         c: "#10b981", icon: Unlock },
                          { l: "Escrow Locked",  v: totalBudgetLocked > 0 ? totalBudgetLocked.toFixed(2) : "—", c: "#f59e0b", icon: Lock },
                          { l: "24h Volume",     v: realVolume24h != null && realVolume24h > 0 ? realVolume24h.toFixed(2) : "—", c: "#22d3ee", icon: Activity },
                          { l: "Active Missions",v: String(activeMissionsCount),                            c: "#a855f7", icon: GitBranch },
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
                      <span>Mission Budget Composition</span>
                      <span className="text-emerald-300">{totalBudget > 0 ? `${totalBudget.toFixed(2)} SOL` : "—"}</span>
                    </div>
                    {compositionParts.length === 0 ? (
                      <div className="mt-2 rounded-md border border-dashed border-white/10 px-3 py-2 text-[11px] text-white/40">
                        Launch a mission to populate the budget split.
                      </div>
                    ) : (
                      <>
                        <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-white/[0.04]">
                          {compositionParts.map((p) => (
                            <div
                              key={p.name}
                              className="h-full"
                              style={{
                                width: `${pct(p.value, totalBudget)}%`,
                                background: p.c,
                                boxShadow: `0 0 12px ${p.c}80`,
                              }}
                              title={`${p.name} · ${p.value.toFixed(2)} SOL`}
                            />
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-[10px]">
                          {compositionParts.map((p) => (
                            <span key={p.name} className="flex items-center gap-1.5 text-white/55">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.c, boxShadow: `0 0 6px ${p.c}` }} />
                              {p.name} · {pct(p.value, totalBudget).toFixed(0)}%
                            </span>
                          ))}
                        </div>
                      </>
                    )}
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
                      <path d={cashflow.inArea} fill="url(#trIn)" />
                      <path d={cashflow.inLine} fill="none" stroke="#10b981" strokeWidth="1.6" />
                      <path d={cashflow.outArea} fill="url(#trOut)" />
                      <path d={cashflow.outLine} fill="none" stroke="#f59e0b" strokeWidth="1.4" />
                    </svg>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-md bg-black/30 p-2">
                      <div className="text-white/40">Inflow</div>
                      <div className="text-emerald-300 tabular-nums">
                        {cashflow.hasRealData ? `+${cashflow.inflowTotal.toFixed(2)}` : "—"}
                      </div>
                    </div>
                    <div className="rounded-md bg-black/30 p-2">
                      <div className="text-white/40">Outflow</div>
                      <div className="text-amber-300 tabular-nums">
                        {cashflow.hasRealData ? `−${cashflow.outflowTotal.toFixed(2)}` : "—"}
                      </div>
                    </div>
                    <div className="rounded-md bg-black/30 p-2">
                      <div className="text-white/40">Net</div>
                      <div className="text-cyan-300 tabular-nums">
                        {cashflow.hasRealData
                          ? `${cashflow.net >= 0 ? "+" : ""}${cashflow.net.toFixed(2)}`
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Wallets */}
            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {wallets.map((w) => {
                const hasBalance = w.balance != null;
                const availNum = w.available ?? 0;
                const balNum = w.balance ?? 0;
                return (
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
                        {w.explorer ? (
                          <a href={w.explorer} target="_blank" rel="noreferrer" className="text-white/30 hover:text-cyan-300" title="View on Solana Explorer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="text-white/15">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                      <div className="mt-4 text-2xl tabular-nums">{hasBalance ? balNum.toFixed(2) : "—"}</div>
                      <div className="text-[11px] text-white/40">
                        {hasBalance ? `SOL · ≈ $${(balNum * 184).toFixed(0)}` : "no data yet"}
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[10px] text-white/50">
                        <span className="font-mono">{w.addr}</span>
                        <span style={{ color: w.c }}>
                          {hasBalance ? `${pct(availNum, balNum).toFixed(0)}% avail` : "—"}
                        </span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: w.c, boxShadow: `0 0 8px ${w.c}` }}
                          initial={{ width: 0 }}
                          animate={{ width: `${hasBalance ? pct(availNum, balNum) : 0}%` }}
                          transition={{ duration: 1 }}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
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
                      : escrows.length === 0
                      ? (
                          <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-xs text-white/40">
                            No missions in escrow yet. Launch one from Mission Control to allocate budget on-chain.
                          </div>
                        )
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
                      slot {liveSlot != null ? liveSlot.toLocaleString() : "—"}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-[11px]">
                    {[
                      { i: Shield,      l: "Treasury",         v: treasuryBalanceSol != null ? `${treasuryBalanceSol.toFixed(2)} SOL` : "—",     c: "#22d3ee" },
                      { i: GitBranch,   l: "Active escrow",    v: activeLocked > 0 ? `${activeLocked.toFixed(2)} SOL` : "—",                    c: "#10b981" },
                      { i: Database,    l: "Settled payouts",  v: payments.length > 0 ? `${payoutTotal.toFixed(2)} SOL · ${payments.length} tx` : "—", c: "#a855f7" },
                      { i: CheckCircle2,l: "Network",          v: liveSlot != null ? "devnet · live" : "unreachable",                            c: liveSlot != null ? "#06b6d4" : "#64748b" },
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
                  ) : payouts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-xs text-white/40">
                      No agent payouts yet. Settled mission payments will appear here.
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
                  {splits.length === 0 ? (
                    <div className="grid place-items-center py-12 text-center text-xs text-white/40">
                      <TrendingUp className="mb-2 h-8 w-8 text-white/15" />
                      <div className="text-sm text-white/65">No revenue splits yet</div>
                      <div className="mt-1">Splits compute from your mission agent rosters.</div>
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
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
                  {(() => {
                    const completed = missions.filter((m) => m.status === "completed");
                    const settledPayments = payments.filter((p) => p.status === "confirmed");
                    const avgConfidence = missions.length > 0
                      ? missions.reduce((s, m) => s + (m.confidence ?? 0), 0) / missions.length
                      : null;
                    const avgPayout = settledPayments.length > 0
                      ? settledPayments.reduce((s, p) => s + p.amountSol, 0) / settledPayments.length
                      : null;
                    const completionRate = missions.length > 0
                      ? (completed.length / missions.length) * 100
                      : null;
                    const totalAgents = missions.reduce((s, m) => s + m.agents.length, 0);
                    const sevenDayCutoff = Date.now() - 7 * 86_400_000;
                    const recentPayouts = payments.filter((p) => p.createdAt >= sevenDayCutoff).length;
                    return [
                      { k: "Total Inflow",      v: realVolume24h != null && realVolume24h > 0 ? `${realVolume24h.toFixed(2)} SOL` : "—", d: "24h on-chain", c: "#10b981" },
                      { k: "Payout Velocity",   v: recentPayouts > 0 ? `${recentPayouts}/wk`                            : "—", d: "last 7d",       c: "#22d3ee" },
                      { k: "Avg Payout",        v: avgPayout != null  ? `${avgPayout.toFixed(3)} SOL`                   : "—", d: "settled txs",   c: "#a855f7" },
                      { k: "Completion Rate",   v: completionRate != null ? `${completionRate.toFixed(0)}%`             : "—", d: "missions done",  c: "#3b82f6" },
                      { k: "Avg Confidence",    v: avgConfidence != null  ? `${avgConfidence.toFixed(0)}%`              : "—", d: "mission KPIs",   c: "#ec4899" },
                      { k: "Agent Roster",      v: totalAgents > 0       ? `${totalAgents}`                             : "—", d: "across missions", c: "#f59e0b" },
                    ];
                  })().map((m) => (
                    <div key={m.k} className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{m.k}</div>
                        <ArrowUpRight className="h-3 w-3 text-emerald-300" />
                      </div>
                      <div className="mt-2 text-2xl tabular-nums" style={{ color: m.c }}>{m.v}</div>
                      <div className="text-[10px] text-white/40">{m.d}</div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: m.c, boxShadow: `0 0 8px ${m.c}` }}
                          initial={{ width: 0 }}
                          animate={{ width: m.v === "—" ? "0%" : "70%" }}
                          transition={{ duration: 1 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/5 px-5 pb-5 pt-4">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
                    <span>Mission Budget Allocation</span>
                    <span className="text-cyan-300">{budgetAllocation ? "avg across missions" : "no data"}</span>
                  </div>
                  {budgetAllocation == null ? (
                    <div className="mt-3 rounded-md border border-dashed border-white/10 px-3 py-3 text-[11px] text-white/40">
                      Allocations show up after you launch a mission with a budget split.
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {[
                        { l: "Agent Compute",     v: budgetAllocation.agentCompute,     c: "#22d3ee" },
                        { l: "Token Usage",       v: budgetAllocation.tokenUsage,       c: "#a855f7" },
                        { l: "Escrow Reserve",    v: budgetAllocation.escrowReserve,    c: "#10b981" },
                        { l: "Settlement Buffer", v: budgetAllocation.settlementBuffer, c: "#f59e0b" },
                      ].map((x) => (
                        <div key={x.l}>
                          <div className="flex justify-between text-[11px] text-white/55">
                            <span>{x.l}</span>
                            <span className="tabular-nums">{(x.v * 100).toFixed(0)}% · {(totalBudget * x.v).toFixed(2)} SOL</span>
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
                  )}
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
                    {txFeed.length === 0 ? (
                      <div className="py-3 text-center text-white/30">// no transactions yet</div>
                    ) : (
                      txFeed.map((l, i) => (
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
                      ))
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
                      { l: "slot",    v: liveSlot != null ? liveSlot.toLocaleString() : "—", i: Network },
                      { l: "settled", v: payments.filter((p) => p.status === "confirmed").length.toString(), i: CheckCircle2 },
                      { l: "pending", v: payments.filter((p) => p.status !== "confirmed").length.toString(), i: Clock },
                    ].map((x) => (
                      <div key={x.l} className="rounded-md border border-white/5 bg-white/[0.02] py-2">
                        <x.i className="mx-auto h-3 w-3 text-cyan-300" />
                        <div className="mt-1 text-white/40">{x.l}</div>
                        <div className="tabular-nums text-white/85">{x.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Deposit modal — real on-chain SystemProgram.transfer to the HiveMind treasury
              pubkey on devnet. Records a payment intent server-side so the new deposit
              shows up in the live transaction feed. */}
          <AnimatePresence>
            {depositOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                onClick={() => { if (!depositing) setDepositOpen(false); }}
              >
                <motion.div
                  initial={{ scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.96, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1322] to-[#04060c] p-6 shadow-2xl"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-300/30"
                        style={{ background: "linear-gradient(135deg, #10b98155, #10b98111)" }}
                      >
                        <Wallet className="h-4 w-4 text-emerald-300" />
                      </div>
                      <div>
                        <div className="text-sm">Deposit to Treasury</div>
                        <div className="text-[10px] text-white/40">Solana devnet · real SOL transfer</div>
                      </div>
                    </div>
                    <button
                      onClick={() => { if (!depositing) setDepositOpen(false); }}
                      className="text-white/40 hover:text-white"
                      disabled={depositing}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Amount</label>
                      <div className="mt-1 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="10"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          disabled={depositing}
                          className="flex-1 bg-transparent text-lg tabular-nums text-white placeholder-white/30 outline-none"
                          placeholder="0.10"
                        />
                        <span className="text-xs text-white/50">SOL</span>
                      </div>
                      <div className="mt-1 flex gap-1.5">
                        {[0.1, 0.5, 1, 2].map((v) => (
                          <button
                            key={v}
                            onClick={() => setDepositAmount(String(v))}
                            disabled={depositing}
                            className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/60 hover:border-emerald-300/30 hover:text-emerald-200 disabled:opacity-50"
                          >
                            {v} SOL
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/5 bg-black/30 p-3 text-[11px] text-white/55">
                      <div className="flex items-center justify-between">
                        <span className="text-white/40">From</span>
                        <span className="font-mono text-white/75">
                          {publicKey ? `${publicKey.toBase58().slice(0, 6)}…${publicKey.toBase58().slice(-4)}` : "—"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-white/40">To · HiveMind treasury</span>
                        <span className="font-mono text-emerald-300/90">
                          {TREASURY_RECIPIENT_PUBKEY.slice(0, 6)}…{TREASURY_RECIPIENT_PUBKEY.slice(-4)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-white/40">Network</span>
                        <span className="text-emerald-300/90">devnet</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => { if (!depositing) setDepositOpen(false); }}
                      disabled={depositing}
                      className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/80 hover:border-white/20 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitDeposit}
                      disabled={depositing}
                      className="group relative flex-1 overflow-hidden rounded-lg px-3 py-2 text-xs text-black disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-emerald-300 to-cyan-300" />
                      <span className="relative inline-flex items-center justify-center gap-1.5">
                        {depositing
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Wallet className="h-3.5 w-3.5" />}
                        {depositing ? "Confirming…" : "Sign & deposit"}
                      </span>
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          </WalletGate>
        </div>
      </div>
    </div>
  );
}
