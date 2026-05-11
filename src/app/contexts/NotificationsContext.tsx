import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useHiveMindRealtime } from "../hooks/useHiveMind";

export type NotifSeverity = "info" | "success" | "warning" | "error" | "critical";
export type NotifChannel = "execution" | "delegation" | "mission" | "payment" | "governance";

export type Notif = {
  id: string;
  channel: NotifChannel;
  severity: NotifSeverity;
  title: string;
  body: string;
  agent?: string;
  mission?: string;
  amount?: string;
  t: string;
  read: boolean;
};

const severityForType = (type: string): NotifSeverity => {
  if (type.includes("fail") || type.includes("error") || type.includes("timeout")) return "error";
  if (type.includes("warn") || type.includes("spike") || type.includes("approval")) return "warning";
  if (type.includes("critical") || type.includes("dispute")) return "critical";
  if (type.includes("success") || type.includes("complete") || type.includes("settled") || type.includes("checkpoint")) return "success";
  return "info";
};

const channelForType = (type: string): NotifChannel => {
  if (type.startsWith("payment") || type.includes("payout") || type.includes("escrow")) return "payment";
  if (type.startsWith("delegation") || type.includes("delegate")) return "delegation";
  if (type.startsWith("mission") || type.includes("mission")) return "mission";
  if (type.startsWith("governance") || type.includes("vote") || type.includes("trust")) return "governance";
  return "execution";
};

type NotifCtx = {
  items: Notif[];
  unread: number;
  markAll: () => void;
  dismiss: (id: string) => void;
  toggle: (id: string) => void;
  setItems: React.Dispatch<React.SetStateAction<Notif[]>>;
};

const Ctx = createContext<NotifCtx | null>(null);

const seedNotifs: Notif[] = [
  { id: "N-1042", channel: "execution",  severity: "success",  title: "Banner pack v3 generated",       body: "Lumen produced 12 variants with score 0.91 on M-247.", agent: "Lumen",  mission: "M-247", t: "16:42", read: false },
  { id: "N-1041", channel: "delegation", severity: "info",     title: "Delegation requested",            body: "Halo requests Strategy review on KPI tree v2.",       agent: "Halo",   mission: "M-247", t: "16:41", read: false },
  { id: "N-1040", channel: "payment",    severity: "success",  title: "Payout settled",                  body: "Vega received 0.36 SOL for trend report.",            agent: "Vega",   mission: "M-247", amount: "0.36 SOL", t: "16:38", read: false },
  { id: "N-1039", channel: "execution",  severity: "warning",  title: "Latency spike detected",          body: "Llama-4 router p95 climbed to 540ms; consider reroute.", t: "16:34", read: false },
  { id: "N-1038", channel: "mission",    severity: "success",  title: "Mission checkpoint reached",      body: "M-247 stage 4 → 5 completed with 99.1% coordination.", mission: "M-247", t: "16:30", read: true },
  { id: "N-1037", channel: "governance", severity: "info",     title: "Vote opened · P-082",             body: "Increase Tier-3 stake threshold to 8 SOL. 312 yes / 48 no.", t: "16:28", read: true },
  { id: "N-1036", channel: "execution",  severity: "error",    title: "Workflow failed",                 body: "Press kit assembly timed out · retry scheduled (backoff 800ms).", agent: "Lumen", mission: "M-247", t: "16:24", read: false },
  { id: "N-1035", channel: "delegation", severity: "info",     title: "Coordination conflict resolved",  body: "Atlas yielded design ownership to Lumen on M-241.", agent: "Atlas", mission: "M-241", t: "16:18", read: true },
  { id: "N-1034", channel: "payment",    severity: "warning",  title: "Approval required",               body: "Treasury awaits sign-off for 4.20 SOL escrow lock on M-238.", mission: "M-238", amount: "4.20 SOL", t: "16:14", read: false },
  { id: "N-1033", channel: "mission",    severity: "success",  title: "Mission completed",               body: "M-229 · Solana Growth Strategy · 8 agents · 96% efficiency.", mission: "M-229", t: "16:08", read: true },
  { id: "N-1032", channel: "governance", severity: "critical", title: "Trust dispute escalated",         body: "Cipher's Tier-1 attestation flagged by 2 verifiers — review window 12h.", agent: "Cipher", t: "15:42", read: false },
  { id: "N-1031", channel: "execution",  severity: "info",     title: "Memory upserted · 1284 vectors",  body: "Echo embedded sentiment scan into qdrant#brand cluster #4.", agent: "Echo", t: "15:30", read: true },
];

let notifCounter = 1100;
void seedNotifs; // demo data retained for tests/Storybook; not used in the live provider.

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  // Start empty — no fake demo entries leaking the same "7 unread" badge across every wallet.
  // Real WS events from the backend populate the feed below.
  const [items, setItems] = useState<Notif[]>([]);
  const unread = items.filter((n) => !n.read).length;
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58() ?? null;

  // Reset notifications whenever the connected wallet changes — different wallets must not
  // share notification history (was static across every wallet because seed was hardcoded).
  useEffect(() => {
    setItems([]);
  }, [walletAddress]);

  const markAll = useCallback(() => setItems((arr) => arr.map((n) => ({ ...n, read: true }))), []);
  const dismiss = useCallback((id: string) => setItems((arr) => arr.filter((n) => n.id !== id)), []);
  const toggle = useCallback((id: string) => setItems((arr) => arr.map((n) => (n.id === id ? { ...n, read: !n.read } : n))), []);

  // Wire real WebSocket events into the feed
  useHiveMindRealtime({
    channels: ["global", "execution", "delegation", "mission", "payment", "governance"],
    onEvent: useCallback((e) => {
      const type = e.type ?? "execution.event";
      const payload = e.payload as Record<string, unknown>;
      const notif: Notif = {
        id: `N-${++notifCounter}`,
        channel: channelForType(type),
        severity: severityForType(type),
        title: String(payload?.title ?? type.replace(/\./g, " ")),
        body: String(payload?.body ?? payload?.message ?? JSON.stringify(payload).slice(0, 100)),
        agent: payload?.agent ? String(payload.agent) : undefined,
        mission: payload?.missionId ? String(payload.missionId) : undefined,
        amount: payload?.amount ? `${payload.amount} SOL` : undefined,
        t: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" }),
        read: false,
      };
      setItems((prev) => [notif, ...prev.slice(0, 49)]);
    }, []),
  });

  return (
    <Ctx.Provider value={{ items, unread, markAll, dismiss, toggle, setItems }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications must be inside NotificationsProvider");
  return ctx;
}
