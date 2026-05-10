import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import {
  Search, X, Rocket, Cpu, Wallet, LayoutDashboard, Settings, Bell, Brain,
  BarChart2, Users, ShoppingBag, Activity, Zap, ArrowRight,
} from "lucide-react";
import { useAgents } from "../hooks/useHiveMind";
import { useMissions } from "../store";

type Result = {
  id: string;
  group: string;
  icon: React.ElementType;
  label: string;
  sub?: string;
  href: string;
  color?: string;
};

const NAV_RESULTS: Result[] = [
  { id: "nav-dashboard",  group: "Navigate", icon: LayoutDashboard, label: "Dashboard",         href: "/dashboard",   color: "#22d3ee" },
  { id: "nav-missions",   group: "Navigate", icon: Rocket,          label: "New Mission",        href: "/missions/new",color: "#a855f7" },
  { id: "nav-agents",     group: "Navigate", icon: Cpu,             label: "Agent Workspace",    href: "/agents",      color: "#3b82f6" },
  { id: "nav-treasury",   group: "Navigate", icon: Wallet,          label: "Treasury",           href: "/treasury",    color: "#10b981" },
  { id: "nav-reputation", group: "Navigate", icon: Zap,             label: "Reputation",         href: "/reputation",  color: "#f59e0b" },
  { id: "nav-memory",     group: "Navigate", icon: Brain,           label: "Memory Explorer",    href: "/memory",      color: "#8b5cf6" },
  { id: "nav-marketplace",group: "Navigate", icon: ShoppingBag,     label: "Marketplace",        href: "/marketplace", color: "#06b6d4" },
  { id: "nav-analytics",  group: "Navigate", icon: BarChart2,       label: "Analytics",          href: "/analytics",   color: "#22d3ee" },
  { id: "nav-console",    group: "Navigate", icon: Activity,        label: "Live Console",       href: "/console",     color: "#10b981" },
  { id: "nav-team",       group: "Navigate", icon: Users,           label: "Team Workspace",     href: "/team",        color: "#a855f7" },
  { id: "nav-settings",   group: "Navigate", icon: Settings,        label: "Settings",           href: "/settings",    color: "#f59e0b" },
  { id: "nav-notifs",     group: "Navigate", icon: Bell,            label: "Notifications",      href: "/notifications",color: "#ec4899" },
];

function score(label: string, query: string): number {
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (l === q) return 100;
  if (l.startsWith(q)) return 80;
  if (l.includes(q)) return 60;
  const words = l.split(/\s+/);
  if (words.some((w) => w.startsWith(q))) return 40;
  return 0;
}

function fuzzy(items: Result[], query: string): Result[] {
  if (!query.trim()) return items;
  return items
    .map((r) => ({ r, s: score(r.label, query) + (r.sub ? score(r.sub, query) * 0.5 : 0) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .map(({ r }) => r);
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { agents } = useAgents();
  const { missions } = useMissions();

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const allResults = useMemo((): Result[] => {
    const missionResults: Result[] = missions.slice(0, 12).map((m) => ({
      id: `mission-${m.id}`,
      group: "Missions",
      icon: Rocket,
      label: m.title,
      sub: m.status,
      href: `/missions/${m.id}`,
      color: m.status === "completed" ? "#10b981" : m.status === "active" ? "#22d3ee" : "#a855f7",
    }));

    const agentResults: Result[] = agents.slice(0, 12).map((a) => ({
      id: `agent-${a.id}`,
      group: "Agents",
      icon: Cpu,
      label: a.name,
      sub: `Rep ${a.reputation} · ${a.model}`,
      href: `/agents`,
      color: "#a855f7",
    }));

    return [...NAV_RESULTS, ...missionResults, ...agentResults];
  }, [missions, agents]);

  const results = useMemo(() => {
    const filtered = fuzzy(allResults, query);
    if (!query.trim()) {
      const groups: Record<string, Result[]> = {};
      for (const r of filtered) {
        (groups[r.group] ??= []).push(r);
      }
      // Show Navigate + first 3 of each other group
      const nav = groups["Navigate"] ?? [];
      const miss = (groups["Missions"] ?? []).slice(0, 3);
      const agt = (groups["Agents"] ?? []).slice(0, 3);
      return [...nav, ...miss, ...agt];
    }
    return filtered.slice(0, 12);
  }, [allResults, query]);

  const grouped = useMemo(() => {
    const g: Record<string, Result[]> = {};
    for (const r of results) (g[r.group] ??= []).push(r);
    return g;
  }, [results]);

  const flatList = results;

  const select = useCallback((r: Result) => {
    navigate(r.href);
    onClose();
  }, [navigate, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, flatList.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      if (e.key === "Enter" && flatList[cursor]) { select(flatList[cursor]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, cursor, flatList, select, onClose]);

  useEffect(() => { setCursor(0); }, [query]);

  let globalIdx = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
            <motion.div
              key="palette"
              initial={{ opacity: 0, scale: 0.96, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#04060c] shadow-2xl shadow-black/60"
            >
              {/* Input */}
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                <Search className="h-4 w-4 shrink-0 text-white/40" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search agents, missions, pages…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="text-white/30 hover:text-white/60">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">esc</kbd>
              </div>

              {/* Results */}
              <div className="max-h-[60vh] overflow-y-auto py-2">
                {results.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-white/30">No results for "{query}"</div>
                ) : (
                  Object.entries(grouped).map(([group, items]) => (
                    <div key={group}>
                      <div className="px-4 pb-1 pt-3 text-[10px] uppercase tracking-[0.25em] text-white/30">{group}</div>
                      {items.map((r) => {
                        const idx = globalIdx++;
                        const active = idx === cursor;
                        return (
                          <button
                            key={r.id}
                            onClick={() => select(r)}
                            onMouseEnter={() => setCursor(idx)}
                            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`}
                          >
                            <div
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
                              style={{
                                borderColor: `${r.color ?? "#22d3ee"}40`,
                                background: `${r.color ?? "#22d3ee"}18`,
                                color: r.color ?? "#22d3ee",
                              }}
                            >
                              <r.icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-white/90">{r.label}</div>
                              {r.sub && <div className="truncate text-[11px] text-white/40">{r.sub}</div>}
                            </div>
                            {active && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 border-t border-white/5 px-4 py-2 text-[10px] text-white/25">
                <span><kbd className="mr-1 font-mono">↑↓</kbd>navigate</span>
                <span><kbd className="mr-1 font-mono">↵</kbd>open</span>
                <span><kbd className="mr-1 font-mono">esc</kbd>close</span>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
