import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Zap, Coins, ExternalLink, CheckCircle2, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { fetchTrialStatus, fetchTrialConfig, type TrialStatus, type TrialConfig } from "../lib/api";

const PROGRAM_ID = "EV447FY9Q7Ty7pFo8wDPFRhkqASmj87GZjFr8CPjQ5om";
const EXPLORER = "https://explorer.solana.com";

function fmt(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.max(0, ts - Date.now());
  if (diff === 0) return "now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export default function TrialPage() {
  const [wallet, setWallet] = useState("");
  const [inputWallet, setInputWallet] = useState("");
  const [status, setStatus] = useState<TrialStatus | null>(null);
  const [config, setConfig] = useState<TrialConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTrialConfig().then(setConfig);
    const saved = localStorage.getItem("hm-connected-wallet");
    if (saved) { setWallet(saved); setInputWallet(saved); }
  }, []);

  useEffect(() => {
    if (!wallet) return;
    load(wallet);
  }, [wallet]);

  async function load(w: string) {
    setLoading(true);
    setError(null);
    const s = await fetchTrialStatus(w);
    if (!s) setError("Could not fetch trial status — is the backend running?");
    setStatus(s);
    setLoading(false);
  }

  function handleLookup() {
    const w = inputWallet.trim();
    if (!w) return;
    localStorage.setItem("hm-connected-wallet", w);
    setWallet(w);
  }

  const explorerProgram = `${EXPLORER}/address/${PROGRAM_ID}?cluster=devnet`;
  const explorerMint = config?.pdas.tokenMint ? `${EXPLORER}/address/${config.pdas.tokenMint}?cluster=devnet` : null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-3xl">
            {/* Header */}
            <div className="mb-8 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10">
                <Zap className="h-6 w-6 text-cyan-300" />
              </div>
              <div>
                <h1 className="text-2xl tracking-tight">HIVE Free Trial</h1>
                <p className="mt-0.5 text-sm text-white/50">
                  10 free agent invocations per wallet · 10 HIVE tokens daily airdrop
                </p>
              </div>
              <a
                href={explorerProgram}
                target="_blank"
                rel="noreferrer"
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/50 hover:border-cyan-300/30 hover:text-cyan-300"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Devnet Explorer
              </a>
            </div>

            {/* Program info cards */}
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { l: "Program", v: `${PROGRAM_ID.slice(0, 8)}…`, link: explorerProgram, accent: "#22d3ee" },
                { l: "Cluster", v: "Devnet", link: null, accent: "#10b981" },
                { l: "Free Uses", v: `${config?.freeUsesTotal ?? 10}/wallet`, link: null, accent: "#a855f7" },
                { l: "Daily HIVE", v: config?.dailyTokens ?? "10 HIVE", link: null, accent: "#f59e0b" },
              ].map((c) => (
                <motion.div
                  key={c.l}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="text-[10px] uppercase tracking-widest text-white/40">{c.l}</div>
                  {c.link ? (
                    <a href={c.link} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-base hover:underline" style={{ color: c.accent }}>
                      {c.v} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <div className="mt-1 text-base tabular-nums" style={{ color: c.accent }}>{c.v}</div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* PDA addresses */}
            {config && (
              <div className="mb-6 rounded-xl border border-white/10 bg-black/30 p-5">
                <div className="mb-3 text-[10px] uppercase tracking-widest text-white/40">On-chain PDA Addresses</div>
                <div className="space-y-2 font-mono text-[11px]">
                  {[
                    { l: "HivemindConfig", v: config.pdas.hivemindConfig },
                    { l: "FreeTrialConfig", v: config.pdas.freeTrialConfig },
                    { l: "HIVE Token Mint", v: config.pdas.tokenMint },
                  ].map((row) => (
                    <div key={row.l} className="flex items-center justify-between gap-4">
                      <span className="shrink-0 text-white/40">{row.l}</span>
                      <a
                        href={`${EXPLORER}/address/${row.v}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 truncate text-cyan-300/80 hover:text-cyan-300"
                      >
                        {row.v}
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Wallet lookup */}
            <div className="mb-6 rounded-xl border border-white/10 bg-black/30 p-5">
              <div className="mb-3 text-sm">Check Wallet Trial Status</div>
              <div className="flex gap-2">
                <input
                  value={inputWallet}
                  onChange={(e) => setInputWallet(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                  placeholder="Enter Solana wallet address…"
                  className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-cyan-300/40"
                />
                <button
                  onClick={handleLookup}
                  disabled={loading || !inputWallet.trim()}
                  className="flex items-center gap-1.5 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/20 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Check
                </button>
              </div>
            </div>

            {/* Status result */}
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-300/30 bg-rose-300/[0.06] p-4 text-sm text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {status && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-white/10 bg-black/30 p-5"
              >
                <div className="mb-4 flex items-center gap-3">
                  {status.registered
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                    : <AlertCircle className="h-5 w-5 text-amber-300" />}
                  <div>
                    <div className="text-sm">{status.registered ? "Wallet registered" : "Wallet not registered"}</div>
                    <div className="text-[11px] text-white/40 font-mono">{status.wallet}</div>
                  </div>
                </div>

                {status.registered ? (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                      { l: "Uses Remaining", v: `${status.usesRemaining}/${config?.freeUsesTotal ?? 10}`, accent: "#22d3ee" },
                      { l: "Total Uses", v: String(status.usesTotal ?? 0), accent: "#a855f7" },
                      { l: "Daily Claims", v: String(status.dailyClaimsTotal ?? 0), accent: "#10b981" },
                      {
                        l: status.canClaimDaily ? "Claim Ready" : "Next Claim In",
                        v: status.canClaimDaily ? "10 HIVE ready" : fmt(status.nextClaimAt),
                        accent: status.canClaimDaily ? "#10b981" : "#f59e0b",
                      },
                    ].map((m) => (
                      <div key={m.l} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                        <div className="text-[10px] uppercase tracking-widest text-white/40">{m.l}</div>
                        <div className="mt-1 text-base tabular-nums" style={{ color: m.accent }}>{m.v}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-300/30 bg-amber-300/[0.06] p-4 text-sm text-amber-200">
                    This wallet hasn&apos;t been registered yet. Send a{" "}
                    <code className="text-amber-300">register_user</code> transaction to the program to activate
                    10 free uses.
                  </div>
                )}

                {status.userTrialAddress && (
                  <div className="mt-4 flex items-center justify-between text-[10px] text-white/30 font-mono">
                    <span>UserTrial PDA</span>
                    <a
                      href={`${EXPLORER}/address/${status.userTrialAddress}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 hover:text-cyan-300"
                    >
                      {status.userTrialAddress} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                )}
              </motion.div>
            )}

            {/* How it works */}
            <div className="mt-8 rounded-xl border border-white/10 bg-black/30 p-5">
              <div className="mb-4 text-sm">How the Free Trial Works</div>
              <div className="space-y-3 text-[12px] text-white/60">
                {[
                  { n: "1", t: "Register your wallet", d: "Send a registerUser tx to program EV447F… — creates your UserFreeTrial PDA with 10 uses." },
                  { n: "2", t: "Use free invocations", d: "Each agent mission invocation calls useFreeTrial, decrementing your remaining uses. Fails on-chain when exhausted." },
                  { n: "3", t: "Claim daily HIVE tokens", d: "Once every 24h, call claimDailyTokens to mint 10 HIVE (9 decimals) to your associated token account." },
                  { n: "4", t: "HIVE token mint", d: `Canonical SPL token mint at ${config?.pdas.tokenMint?.slice(0, 12) ?? "…"} on devnet. Mint authority is the program PDA itself.` },
                ].map((s) => (
                  <div key={s.n} className="flex gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-300/10 text-[10px] text-cyan-300">{s.n}</div>
                    <div>
                      <div className="text-white/85">{s.t}</div>
                      <div className="mt-0.5 text-white/40">{s.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Token claim icon row */}
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-purple-300/20 bg-purple-300/[0.04] px-4 py-3 text-[11px] text-white/50">
              <Coins className="h-4 w-4 text-purple-300" />
              {explorerMint ? (
                <>
                  HIVE Token Mint on devnet:&nbsp;
                  <a href={explorerMint} target="_blank" rel="noreferrer" className="text-purple-300 hover:underline">
                    {config?.pdas.tokenMint}
                  </a>
                </>
              ) : (
                "HIVE Token Mint — loading…"
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
