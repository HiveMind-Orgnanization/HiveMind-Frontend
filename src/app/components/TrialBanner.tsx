import { useState, useEffect } from "react";
import { Zap, Coins, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { fetchTrialStatus, fetchTrialConfig, type TrialStatus, type TrialConfig } from "../../lib/api";
import { useWallet } from "@solana/wallet-adapter-react";

const EXPLORER_BASE = "https://explorer.solana.com";
const PROGRAM_ID = "EV447FY9Q7Ty7pFo8wDPFRhkqASmj87GZjFr8CPjQ5om";

function formatCountdown(nextClaimAt: number): string {
  const diff = Math.max(0, nextClaimAt - Date.now());
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export function TrialBanner() {
  const { publicKey, connected } = useWallet();
  const [status, setStatus] = useState<TrialStatus | null>(null);
  const [config, setConfig] = useState<TrialConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

  const walletAddr = publicKey?.toBase58() ?? null;

  useEffect(() => {
    fetchTrialConfig().then(setConfig);
  }, []);

  useEffect(() => {
    if (!walletAddr) { setStatus(null); return; }
    setLoading(true);
    fetchTrialStatus(walletAddr)
      .then(setStatus)
      .finally(() => setLoading(false));
  }, [walletAddr]);

  // Countdown timer
  useEffect(() => {
    if (!status?.nextClaimAt || status.canClaimDaily) { setCountdown(null); return; }
    const tick = () => setCountdown(formatCountdown(status.nextClaimAt!));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [status]);

  if (!config) return null;

  const explorerProgram = `${EXPLORER_BASE}/address/${PROGRAM_ID}?cluster=devnet`;
  const explorerMint = config.pdas?.tokenMint
    ? `${EXPLORER_BASE}/address/${config.pdas.tokenMint}?cluster=devnet`
    : null;

  return (
    <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-300/[0.06] to-purple-300/[0.04] p-5 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10">
            <Zap className="h-4 w-4 text-cyan-300" />
          </div>
          <div>
            <div className="text-sm font-medium">HIVE Free Trial</div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">devnet · on-chain</div>
          </div>
        </div>
        <a
          href={explorerProgram}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/50 hover:border-cyan-300/30 hover:text-cyan-300"
        >
          Explorer <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Free Uses</div>
          <div className="mt-1 text-xl tabular-nums text-cyan-300">
            {!connected ? "—" : loading ? "…" : (status?.usesRemaining ?? 0)}
            <span className="text-sm text-white/40">/{config.freeUsesTotal}</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Daily HIVE</div>
          <div className="mt-1 text-xl tabular-nums text-purple-300">
            10 <span className="text-sm text-white/40">HIVE</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Cluster</div>
          <div className="mt-1 text-base font-medium text-emerald-300">Devnet</div>
        </div>
      </div>

      {/* Wallet status */}
      {connected && walletAddr ? (
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
              Checking on-chain status…
            </div>
          ) : status?.registered ? (
            <div className="space-y-2">
              {/* Daily claim status */}
              <div className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-[11px] ${
                status.canClaimDaily
                  ? "border-emerald-300/30 bg-emerald-300/[0.06]"
                  : "border-white/10 bg-white/[0.02]"
              }`}>
                <div className="flex items-center gap-2">
                  {status.canClaimDaily
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                    : <Coins className="h-3.5 w-3.5 text-white/40" />}
                  <span className={status.canClaimDaily ? "text-emerald-300" : "text-white/55"}>
                    {status.canClaimDaily ? "Daily claim available" : `Next claim in ${countdown ?? "…"}`}
                  </span>
                </div>
                {status.canClaimDaily && (
                  <span className="rounded-md bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-300">10 HIVE ready</span>
                )}
              </div>

              {/* Trial uses progress */}
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center justify-between text-[10px] text-white/40">
                  <span>Trial uses remaining</span>
                  <span className="tabular-nums">{status.usesRemaining}/{config.freeUsesTotal}</span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-purple-300"
                    style={{ width: `${(status.usesRemaining / config.freeUsesTotal) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2.5 text-[11px]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="text-amber-200">
                Wallet not registered — send a <code className="text-amber-300">register_user</code> transaction to activate free trial
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 text-center text-[11px] text-white/40">
          Connect your Solana wallet to view trial status
        </div>
      )}

      {/* Token mint link */}
      {explorerMint && (
        <div className="mt-3 flex items-center justify-between text-[10px] text-white/30">
          <span>HIVE Token Mint</span>
          <a
            href={explorerMint}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 hover:text-cyan-300"
          >
            {config.pdas.tokenMint.slice(0, 8)}…{config.pdas.tokenMint.slice(-4)}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      )}
    </div>
  );
}
