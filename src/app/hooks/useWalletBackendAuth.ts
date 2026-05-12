import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import {
  apiConfigured,
  fetchAuthChallenge,
  verifyAuth,
} from "../../lib/api";
import {
  clearSession,
  getAuthToken,
  getSessionWallet,
  setSession,
} from "../../lib/auth-token";

export function useWalletBackendAuth() {
  const { publicKey, signMessage, connected } = useWallet();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevConnected = useRef(false);

  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    window.addEventListener("hm-session-changed", fn);
    return () => window.removeEventListener("hm-session-changed", fn);
  }, []);

  useEffect(() => {
    if (prevConnected.current && !connected) clearSession();
    prevConnected.current = connected;
  }, [connected]);

  const walletStr = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!walletStr || !getAuthToken()) return;
    const sessionW = getSessionWallet();
    if (sessionW && sessionW !== walletStr) clearSession();
  }, [walletStr]);

  const signedIn = useMemo(
    () =>
      Boolean(connected && walletStr && getAuthToken()) &&
      getSessionWallet() === walletStr,
    [tick, connected, walletStr],
  );

  // Clear any stale sign-in error once we successfully sign in OR the user disconnects
  // and reconnects — without this, a previous "User rejected the request." (raw error
  // from a wallet popup the user cancelled earlier) lingers in the wallet dropdown
  // forever, even after a clean reconnect. Also normalize the raw message into a
  // friendly token here so the dropdown reads "Cancelled" instead of the SDK text.
  useEffect(() => {
    if (signedIn) setError(null);
  }, [signedIn]);
  useEffect(() => {
    if (!connected) setError(null);
  }, [connected]);
  // Mirror the friendly mapping the wallet-button onErr listener uses, so the auth
  // error and the adapter error read the same in the dropdown.
  const friendlyError = useMemo(() => {
    if (!error) return null;
    if (/reject|cancel/i.test(error)) return "Cancelled";
    if (/timeout/i.test(error)) return "Wallet timed out";
    if (/not\s*detected|not\s*found/i.test(error)) return "Wallet not detected";
    return error.length > 80 ? `${error.slice(0, 77)}…` : error;
  }, [error]);
  // Auto-clear lingering errors after 6s so they never sit in the dropdown indefinitely.
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(t);
  }, [error]);

  const signIn = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!apiConfigured()) {
      setError("Set VITE_API_URL to sign in");
      return false;
    }
    if (!walletStr || !signMessage) {
      setError("Connect a wallet that supports message signing");
      return false;
    }
    setBusy(true);
    try {
      const ch = await fetchAuthChallenge(walletStr);
      if (!ch?.challenge) {
        setError("Could not load sign-in challenge");
        return false;
      }
      const encoded = new TextEncoder().encode(ch.challenge);
      const sig = await signMessage(encoded);
      const sig58 = bs58.encode(sig);
      const ver = await verifyAuth({
        wallet: walletStr,
        message: ch.challenge,
        signature: sig58,
      });
      if (!ver?.token) {
        setError("Signature verification failed");
        return false;
      }
      setSession(ver.token, ver.wallet);
      setTick((t) => t + 1);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      return false;
    } finally {
      setBusy(false);
    }
  }, [walletStr, signMessage]);

  const signOut = useCallback(() => {
    clearSession();
    setTick((t) => t + 1);
  }, []);

  return {
    signedIn,
    busy,
    error: friendlyError,
    signIn,
    signOut,
    apiReachable: apiConfigured(),
    walletShort: walletStr ? `${walletStr.slice(0, 4)}…${walletStr.slice(-4)}` : null,
  };
}
