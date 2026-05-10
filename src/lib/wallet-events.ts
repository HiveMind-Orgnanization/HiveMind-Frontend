export const WALLET_ERROR_EVENT = "hm-wallet-error";

export type WalletErrorDetail = {
  message: string;
  name?: string;
};

export function emitWalletError(detail: WalletErrorDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<WalletErrorDetail>(WALLET_ERROR_EVENT, { detail }));
}

/**
 * Wallet names we hide from the picker. MetaMask doesn't support Solana
 * natively (would require their Solana Snap), and selecting it just throws
 * an opaque adapter error — so we keep it out of the list to avoid confusion.
 */
export const HIDDEN_WALLET_NAMES = new Set<string>(["MetaMask"]);
