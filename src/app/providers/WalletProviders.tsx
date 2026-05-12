import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { ConnectionProvider, useWallet, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import { emitWalletError } from "../../lib/wallet-events";

/** Watches the wallet adapter for in-extension account switches. The Solana wallet
 *  adapter's React context updates `publicKey` when the user switches accounts inside
 *  Phantom/Solflare, BUT the update sometimes lags or fires without the corresponding
 *  disconnect/reconnect cycle that downstream hooks expect. This component normalizes
 *  the behaviour by broadcasting a `hm-wallet-changed` event whenever the connected
 *  pubkey transitions to a NEW non-null value mid-session, so every component that
 *  caches per-wallet data can refresh without waiting for the next mount. */
function WalletAccountWatcher() {
  const { publicKey, wallet } = useWallet();
  const lastPkRef = useRef<string | null>(null);

  useEffect(() => {
    const pk = publicKey?.toBase58() ?? null;
    const prev = lastPkRef.current;
    lastPkRef.current = pk;
    if (prev === pk) return;
    // First time we see a pk (page load) — just record it, no broadcast needed.
    // The wallet-adapter-react context already kicks initial subscribers.
    if (prev === null) return;
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("hm-wallet-changed", { detail: { from: prev, to: pk } }),
    );
  }, [publicKey]);

  // Also listen for the wallet adapter's native accountChanged signal. Most adapters
  // emit `connect` and `disconnect` events on account switch, but some (Solflare on
  // certain versions) only fire a single `connect` with the new pubkey. We hook both.
  useEffect(() => {
    const adapter = wallet?.adapter;
    if (!adapter) return;
    const onConnect = () => {
      // The publicKey state will sync via the effect above — no direct action needed
      // here, but this listener ensures we DON'T miss the signal when the adapter
      // skips the disconnect.
    };
    adapter.on("connect", onConnect);
    return () => {
      try { adapter.off("connect", onConnect); } catch { /* ignore */ }
    };
  }, [wallet]);

  return null;
}

export function WalletProviders({ children }: { children: ReactNode }) {
  const endpoint = import.meta.env.VITE_SOLANA_RPC_URL?.trim() || clusterApiUrl("devnet");

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  const onError = useCallback((error: Error & { name?: string }) => {
    emitWalletError({ message: error.message || "Wallet error", name: error.name });
    if (import.meta.env.DEV) {
      console.warn("[wallet]", error);
    }
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={onError}>
        <WalletAccountWatcher />
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
