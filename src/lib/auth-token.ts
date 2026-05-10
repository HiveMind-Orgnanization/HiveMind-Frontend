const JWT_KEY = "hm_jwt";
const WALLET_KEY = "hm_session_wallet";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(JWT_KEY);
}

export function getSessionWallet(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(WALLET_KEY);
}

export function setSession(token: string, walletPubkey: string) {
  localStorage.setItem(JWT_KEY, token);
  localStorage.setItem(WALLET_KEY, walletPubkey);
  window.dispatchEvent(new CustomEvent("hm-session-changed"));
}

export function clearSession() {
  localStorage.removeItem(JWT_KEY);
  localStorage.removeItem(WALLET_KEY);
  window.dispatchEvent(new CustomEvent("hm-session-changed"));
}

/** Resolves true when a JWT exists for this wallet (e.g. after sign-in). */
export function waitForSession(walletPubkey: string, timeoutMs: number): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const ready = () => Boolean(getAuthToken() && getSessionWallet() === walletPubkey);
  if (ready()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const cleanup = (ok: boolean) => {
      window.clearInterval(iv);
      window.removeEventListener("hm-session-changed", onEvt);
      resolve(ok);
    };
    const onEvt = () => {
      if (ready()) cleanup(true);
    };
    window.addEventListener("hm-session-changed", onEvt);
    const iv = window.setInterval(() => {
      if (ready()) cleanup(true);
      else if (Date.now() - started >= timeoutMs) cleanup(false);
    }, 150);
  });
}

export function sessionMatchesWallet(connectedPubkey: string | null): boolean {
  if (!connectedPubkey || !getAuthToken()) return !getAuthToken();
  const w = getSessionWallet();
  return w === connectedPubkey;
}
