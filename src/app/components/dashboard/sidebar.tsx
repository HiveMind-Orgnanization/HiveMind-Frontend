import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link, useLocation } from "react-router";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Radio, Users, Wallet, Award, Brain, Store, BarChart3, Terminal, UsersRound, Settings,
  PanelLeftClose, PanelLeftOpen, Zap, Loader2,
} from "lucide-react";
import { fetchTrialStatus } from "../../../lib/api";

const items = [
  { icon: Radio, label: "Mission Control", to: "/dashboard" },
  { icon: Users, label: "Agent Workspace", to: "/agents" },
  { icon: Wallet, label: "Treasury", to: "/treasury" },
  { icon: Award, label: "Reputation", to: "/reputation" },
  { icon: Brain, label: "Memory Explorer", to: "/memory" },
  { icon: Store, label: "Marketplace", to: "/marketplace" },
  { icon: BarChart3, label: "Analytics", to: "/analytics" },
  { icon: Terminal, label: "Live Console", to: "/console" },
  { icon: UsersRound, label: "Team Workspace", to: "/team" },
  { icon: Settings, label: "Settings", to: "/settings" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("hm-sidebar-collapsed") === "1"
  );
  type CreditsState =
    | { kind: "hidden" }
    | { kind: "activating" }
    | { kind: "ready"; uses: number; total: number };
  const [credits, setCredits] = useState<CreditsState>({ kind: "hidden" });
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58() ?? null;
  const location = useLocation();
  const isActive = (to: string) =>
    to === "/dashboard"
      ? location.pathname === "/dashboard" || location.pathname.startsWith("/missions")
      : location.pathname.startsWith(to);

  // Re-fetch trial status whenever the wallet changes (was using a stale localStorage read
  // with an empty effect-dep array, so connecting to a fresh wallet showed the OLD wallet's
  // remaining credits — usually 0 after the old one was used up). For unregistered wallets,
  // useAutoRegisterTrial is mid-flight: surface an "Activating…" state and poll briefly.
  // Also listens for "hm-trial-status-changed" so manual register or trial-use re-fetches.
  useEffect(() => {
    if (!walletAddress) { setCredits({ kind: "hidden" }); return; }
    let cancelled = false;
    let pollHandle: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      const s = await fetchTrialStatus(walletAddress);
      if (cancelled) return;
      if (s?.registered) {
        // usesTotal comes from the on-chain account (10 by default per FreeTrialConfig).
        setCredits({ kind: "ready", uses: s.usesRemaining, total: s.usesTotal ?? 10 });
        return;
      }
      // Not registered yet — auto-register may still be in flight. Show "Activating…" and
      // poll every 3 s for up to ~45 s.
      setCredits({ kind: "activating" });
      if (attempts < 15) pollHandle = setTimeout(tick, 3000);
    };
    const refetch = () => { attempts = 0; void tick(); };
    refetch();
    window.addEventListener("hm-trial-status-changed", refetch);
    return () => {
      cancelled = true;
      if (pollHandle) clearTimeout(pollHandle);
      window.removeEventListener("hm-trial-status-changed", refetch);
    };
  }, [walletAddress]);

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem("hm-sidebar-collapsed", c ? "0" : "1");
      return !c;
    });
  };

  return (
    <motion.aside
      initial={{ width: collapsed ? 68 : 240 }}
      animate={{ width: collapsed ? 68 : 240 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="relative hidden shrink-0 border-r border-white/5 bg-black/40 py-5 backdrop-blur-xl lg:block"
    >
      <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} px-3`}>
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative h-7 w-7 shrink-0">
            <div className="absolute inset-0 rounded-md bg-gradient-to-br from-cyan-400 to-purple-500 blur-md opacity-70" />
            <div className="relative flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-black">
              <div className="h-2.5 w-2.5 rotate-45 bg-gradient-to-br from-cyan-300 to-purple-400" />
            </div>
          </div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden whitespace-nowrap text-sm tracking-tight text-white"
              >
                HiveMind
              </motion.span>
            )}
          </AnimatePresence>
        </Link>

        {!collapsed && (
          <button
            onClick={toggle}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.02] text-white/50 hover:border-cyan-300/30 hover:text-cyan-300"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={toggle}
          className="mx-auto mt-3 flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.02] text-white/50 hover:border-cyan-300/30 hover:text-cyan-300"
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen className="h-3.5 w-3.5" />
        </button>
      )}

      {/* expand handle on edge */}
      <button
        onClick={toggle}
        aria-label="Toggle sidebar"
        className="group absolute -right-3 top-16 z-10 hidden h-7 w-3 items-center justify-center"
      >
        <span className="h-7 w-px bg-white/10 transition group-hover:bg-cyan-300/60" />
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="mt-6 px-5 text-[10px] uppercase tracking-[0.3em] text-white/30"
          >
            workspace
          </motion.div>
        )}
      </AnimatePresence>

      <nav className={`mt-3 space-y-0.5 ${collapsed ? "px-2" : "px-3"}`}>
        {items.map((it) => {
          const active = isActive(it.to);
          return (
            <Link
              to={it.to}
              key={it.label}
              title={collapsed ? it.label : undefined}
              className={`group relative flex w-full items-center rounded-lg text-sm transition ${
                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2"
              } ${
                active
                  ? "bg-gradient-to-r from-cyan-300/10 to-transparent text-white"
                  : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <motion.span
                  layoutId={collapsed ? undefined : "active-pill"}
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]"
                />
              )}
              <it.icon className={`h-4 w-4 shrink-0 ${active ? "text-cyan-300" : "text-white/40 group-hover:text-cyan-300"}`} />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex-1 overflow-hidden whitespace-nowrap text-left"
                  >
                    {it.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {!collapsed && active && (
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
              )}
            </Link>
          );
        })}
      </nav>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className="mx-3 mt-8 rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 p-4"
          >
            <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">system</div>
            <div className="mt-2 text-sm text-white/85">All systems nominal</div>
            {credits.kind !== "hidden" && (
              <Link to="/trial" className="mt-3 flex items-center justify-between rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-2.5 py-2 text-[10px] hover:border-cyan-300/40">
                <div className="flex items-center gap-1.5 text-white/60">
                  <Zap className="h-3 w-3 text-cyan-300" />
                  Free Credits
                </div>
                {credits.kind === "activating" ? (
                  <span className="flex items-center gap-1 text-cyan-300/80">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Activating…
                  </span>
                ) : (
                  <span className="tabular-nums text-cyan-300">{credits.uses}/{credits.total} free</span>
                )}
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {collapsed && (
        <div className="mx-2 mt-8 rounded-lg border border-white/10 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 p-2 text-center">
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.9)]"
          />
          <div className="mt-1 text-[9px] text-cyan-200 tabular-nums">98%</div>
        </div>
      )}
    </motion.aside>
  );
}
