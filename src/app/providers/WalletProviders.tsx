import { type ReactNode, useCallback, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import { emitWalletError } from "../../lib/wallet-events";

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
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
