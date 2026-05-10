import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Wallet,
  ChevronDown,
  Copy,
  LogOut,
  Repeat,
  Loader2,
  Check,
} from "lucide-react";
import { apiConfigured } from "../../../lib/api";
import { useWalletBackendAuth } from "../../hooks/useWalletBackendAuth";
import { WalletPickerModal } from "./wallet-picker-modal";
import {
  WALLET_ERROR_EVENT,
  type WalletErrorDetail,
} from "../../../lib/wallet-events";

const DROPDOWN_WIDTH = 288; // tailwind w-72

function shorten(pk: string | undefined | null) {
  if (!pk) return "";
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

export function WalletButton() {
  const { wallet, publicKey, connected, connecting, disconnect, select } = useWallet();
  const apiOk = apiConfigured();
  const { signedIn, busy: signingIn, error, signIn, signOut } = useWalletBackendAuth();

  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const autoSignedRef = useRef<string | null>(null);

  useEffect(() => {
    const onErr = (e: Event) => {
      const detail = (e as CustomEvent<WalletErrorDetail>).detail;
      setWalletError(detail?.message ?? "Wallet error");
    };
    window.addEventListener(WALLET_ERROR_EVENT, onErr);
    return () => window.removeEventListener(WALLET_ERROR_EVENT, onErr);
  }, []);

  useEffect(() => {
    if (connected) setWalletError(null);
  }, [connected]);

  // Position the portal-rendered dropdown relative to the trigger button.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const top = rect.bottom + 8;
      const right = Math.max(8, window.innerWidth - rect.right);
      setCoords({ top, right });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const pk = publicKey?.toBase58() ?? null;

  // Auto sign-in once per wallet after connect.
  useEffect(() => {
    if (!connected || !pk || !apiOk) return;
    if (signedIn || signingIn) return;
    if (autoSignedRef.current === pk) return;
    autoSignedRef.current = pk;
    void signIn();
  }, [connected, pk, apiOk, signedIn, signingIn, signIn]);

  useEffect(() => {
    if (!connected) autoSignedRef.current = null;
  }, [connected]);

  const handleCopy = async () => {
    if (!pk) return;
    try {
      await navigator.clipboard.writeText(pk);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — silent */
    }
  };

  const handleChange = () => {
    setOpen(false);
    select(null);
    setPickerOpen(true);
  };

  const handleDisconnect = async () => {
    setOpen(false);
    try {
      await disconnect();
    } catch {
      /* adapter throws if already disconnected */
    }
    signOut();
  };

  const connectButton = (() => {
    const label = connecting ? "Connecting…" : "Connect Wallet";
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setWalletError(null);
            setPickerOpen(true);
          }}
          disabled={connecting}
          className="group relative flex h-[34px] items-center gap-2 overflow-hidden rounded-lg border border-cyan-300/30 bg-gradient-to-r from-cyan-300/10 via-purple-400/10 to-cyan-300/10 px-3 text-xs font-medium text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.05)] transition hover:border-cyan-300/50 hover:from-cyan-300/15 hover:to-purple-400/15 disabled:opacity-60"
        >
          <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent opacity-70" />
          {connecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
          ) : (
            <Wallet className="h-3.5 w-3.5 text-cyan-300" />
          )}
          <span className="tracking-[0.04em]">{label}</span>
        </button>
        {walletError && (
          <span
            className="hidden max-w-[180px] truncate text-[10px] text-red-300/90 md:inline"
            title={walletError}
          >
            {walletError}
          </span>
        )}
      </div>
    );
  })();

  const dropdown =
    open && coords && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: coords.top,
              right: coords.right,
              width: DROPDOWN_WIDTH,
              zIndex: 1000,
            }}
            className="overflow-hidden rounded-xl border border-white/10 bg-[#0a0d18]/95 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl"
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(34,211,238,0.5), rgba(168,85,247,0.45), transparent)",
              }}
            />
            <div className="relative px-4 pb-3 pt-4">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-white/45">
                {wallet?.adapter.name ?? "Wallet"}
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] tracking-[0.18em] text-emerald-300">
                  <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.9)]" />
                  Connected
                </span>
              </div>
              <div className="mt-2 break-all font-mono text-[12px] leading-relaxed text-white/85">
                {pk}
              </div>

              {(error || walletError) && (
                <div
                  className="mt-2 truncate rounded-md border border-red-400/25 bg-red-500/10 px-2 py-1 text-[11px] text-red-200"
                  title={error || walletError || ""}
                >
                  {error || walletError}
                </div>
              )}
            </div>

            <div className="border-t border-white/5">
              <MenuItem
                icon={
                  copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-white/55" />
                  )
                }
                label={copied ? "Copied" : "Copy address"}
                onClick={() => void handleCopy()}
              />
              <MenuItem
                icon={<Repeat className="h-3.5 w-3.5 text-white/55" />}
                label="Change wallet"
                onClick={handleChange}
              />
              <MenuItem
                icon={<LogOut className="h-3.5 w-3.5 text-red-300/85" />}
                label="Disconnect"
                onClick={() => void handleDisconnect()}
                danger
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {!connected ? (
        connectButton
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="group flex h-[34px] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs text-white/85 transition hover:border-cyan-300/30"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/30">
            {wallet?.adapter.icon ? (
              <img
                src={wallet.adapter.icon}
                alt={wallet.adapter.name}
                className="h-3.5 w-3.5"
              />
            ) : (
              <Wallet className="h-3 w-3 text-cyan-300" />
            )}
            {signedIn ? (
              <span className="absolute -right-0.5 -bottom-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
            ) : signingIn ? (
              <span className="absolute -right-0.5 -bottom-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.85)]" />
            ) : (
              <span className="absolute -right-0.5 -bottom-0.5 h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_6px_rgba(34,211,238,0.85)]" />
            )}
          </span>
          <span className="font-mono tracking-tight text-white">{shorten(pk)}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {dropdown}
      <WalletPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[12px] transition ${
        danger
          ? "text-red-200 hover:bg-red-500/10"
          : "text-white/80 hover:bg-white/[0.04] hover:text-white"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
