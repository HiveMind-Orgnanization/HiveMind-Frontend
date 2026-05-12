import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useWallet, type Wallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { ExternalLink, X, Wallet as WalletIcon, Loader2 } from "lucide-react";
import { HIDDEN_WALLET_NAMES } from "../../../lib/wallet-events";

type Props = {
  open: boolean;
  onClose: () => void;
};

function partition(wallets: Wallet[]) {
  const visible = wallets.filter((w) => !HIDDEN_WALLET_NAMES.has(w.adapter.name));
  const installed = visible.filter((w) => w.readyState === WalletReadyState.Installed);
  const loadable = visible.filter((w) => w.readyState === WalletReadyState.Loadable);
  const notDetected = visible.filter((w) => w.readyState === WalletReadyState.NotDetected);
  return { installed, loadable, notDetected };
}

export function WalletPickerModal({ open, onClose }: Props) {
  const { wallets, select, connecting, connected, wallet } = useWallet();
  const [pendingName, setPendingName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Close once we land in connected state for the wallet we requested.
  useEffect(() => {
    if (!open || !pendingName) return;
    if (connected && wallet?.adapter.name === pendingName) {
      setPendingName(null);
      onClose();
    }
  }, [open, pendingName, connected, wallet, onClose]);

  // Reset our pending state if the user closes the modal mid-flight.
  useEffect(() => {
    if (!open) setPendingName(null);
  }, [open]);

  const { installed, loadable, notDetected } = useMemo(() => partition(wallets), [wallets]);

  if (!open || typeof document === "undefined") return null;

  /**
   * Root cause we hit before: `select(name)` + a useEffect-based `connect()` broke the
   * browser's user-gesture chain. By the time the effect fired (after React re-render),
   * the wallet extension treated `connect()` as a non-user-initiated request and either
   * queued it silently or failed to surface its approval popup.
   *
   * Fix: call the picked wallet's `adapter.connect()` DIRECTLY inside the click handler.
   * That keeps the call synchronous with the user's click, so the extension's popup
   * fires every time. `select(name)` is still called so wallet-adapter-react's context
   * keeps its bookkeeping (current wallet, autoConnect persistence) in sync.
   */
  const handlePick = async (w: Wallet) => {
    setPendingName(w.adapter.name);
    select(w.adapter.name);
    try {
      // Direct adapter call — bypasses the React context's connect() which would only
      // run on a later render and lose the user-gesture context Solflare requires.
      await w.adapter.connect();
    } catch {
      // Cancelled/rejected/timed-out — clear our local pending state. The friendly
      // toast next to the Connect Wallet button is rendered by WalletProvider#onError.
      setPendingName(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Connect a wallet"
    >
      <button
        type="button"
        aria-label="Close wallet picker"
        onClick={onClose}
        className="absolute inset-0 bg-[#02040a]/70 backdrop-blur-sm"
      />

      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#0a0d18]/98 to-[#06070f]/98 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
        style={{ boxShadow: "0 0 0 1px rgba(34,211,238,0.05), 0 30px 80px -20px rgba(0,0,0,0.7)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60% 40% at 0% 0%, rgba(34,211,238,0.10), transparent 60%), radial-gradient(60% 40% at 100% 0%, rgba(168,85,247,0.10), transparent 60%)",
          }}
        />

        <div className="relative flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-300/30 bg-cyan-300/10 text-cyan-300">
              <WalletIcon className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/45">
                HiveMind · Connect
              </div>
              <div className="text-sm tracking-tight text-white">Choose a wallet</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 hover:border-cyan-300/30 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative max-h-[70vh] overflow-y-auto px-3 py-3">
          {installed.length === 0 && loadable.length === 0 && notDetected.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-white/55">
              No Solana wallets detected. Install Phantom or Solflare and reload.
            </div>
          )}

          {installed.length > 0 && (
            <Section title="Detected" subtitle="Ready to connect">
              {installed.map((w) => (
                <WalletRow
                  key={w.adapter.name}
                  w={w}
                  pending={pendingName === w.adapter.name && (connecting || !connected)}
                  onClick={() => handlePick(w)}
                />
              ))}
            </Section>
          )}

          {loadable.length > 0 && (
            <Section title="Available" subtitle="Loaded on demand">
              {loadable.map((w) => (
                <WalletRow
                  key={w.adapter.name}
                  w={w}
                  pending={pendingName === w.adapter.name && (connecting || !connected)}
                  onClick={() => handlePick(w)}
                />
              ))}
            </Section>
          )}

          {notDetected.length > 0 && (
            <Section title="Install" subtitle="Get a Solana wallet to continue">
              {notDetected.map((w) => (
                <WalletRow
                  key={w.adapter.name}
                  w={w}
                  pending={false}
                  onClick={() => window.open(w.adapter.url, "_blank", "noopener,noreferrer")}
                  installLink
                />
              ))}
            </Section>
          )}
        </div>

        <div className="relative flex items-center justify-between border-t border-white/5 px-5 py-3 text-[11px] text-white/45">
          <span>By connecting you agree to the network terms.</span>
          <a
            href="https://solana.com/wallets"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-white/55 hover:text-cyan-300"
          >
            More wallets <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-2 pb-3 last:pb-1">
      <div className="flex items-baseline justify-between px-2 pb-2 pt-1">
        <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">{title}</span>
        {subtitle && (
          <span className="text-[10px] text-white/35">{subtitle}</span>
        )}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function WalletRow({
  w,
  pending,
  onClick,
  installLink = false,
}: {
  w: Wallet;
  pending: boolean;
  onClick: () => void;
  installLink?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="group flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.04] disabled:opacity-60"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/30">
        {w.adapter.icon ? (
          <img src={w.adapter.icon} alt={w.adapter.name} className="h-5 w-5" />
        ) : (
          <WalletIcon className="h-4 w-4 text-cyan-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm text-white/90">
          {w.adapter.name}
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />}
        </div>
        <div className="truncate text-[11px] text-white/45">
          {installLink
            ? "Not detected · click to install"
            : pending
              ? "Approve in wallet…"
              : "Click to connect"}
        </div>
      </div>
      {installLink ? (
        <ExternalLink className="h-3.5 w-3.5 text-white/40 group-hover:text-cyan-300" />
      ) : (
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/35 group-hover:text-cyan-300">
          {pending ? "Connecting" : "Connect"}
        </span>
      )}
    </button>
  );
}
