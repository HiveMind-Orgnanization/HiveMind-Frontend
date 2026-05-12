import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { toast } from "sonner";
import {
  Settings as SettingsIcon, Wallet, Brain, KeyRound, Shield, Bell, Users,
  Cpu, Sparkles, Zap, Hexagon, Lock, ChevronRight, Save,
  Check, Copy, Eye, EyeOff, ExternalLink, X, RotateCcw,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { AGENT_MODEL_CATALOG, type AgentModelTier } from "../lib/agent-models";
import {
  useWorkspaceSettings,
  resetSettings,
  DEFAULT_AGENT_DEFAULTS,
  type RouterStrategy,
  type AgentDefaults,
} from "../lib/settings-store";
import { useMissions } from "./store";
import { useAgents } from "./hooks/useHiveMind";

const TREASURY_RECIPIENT_PUBKEY =
  import.meta.env.VITE_HM_TREASURY_PUBKEY?.trim() ||
  "G4o8wSS85JzcpDqTN9RWKaUvFF2a3bT3x2yewyk4xWPc";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

const sections = [
  { id: "wallet",      label: "Wallet & Treasury", icon: Wallet,        c: "#10b981" },
  { id: "models",      label: "AI Models",         icon: Brain,         c: "#a855f7" },
  { id: "preferences", label: "AI Preferences",    icon: Sparkles,      c: "#22d3ee" },
  { id: "api",         label: "API & Keys",        icon: KeyRound,      c: "#3b82f6" },
  { id: "permissions", label: "Agent Permissions", icon: Shield,        c: "#06b6d4" },
  { id: "notifications", label: "Notifications",   icon: Bell,          c: "#f59e0b" },
  { id: "team",        label: "Team",              icon: Users,         c: "#ec4899" },
] as const;

type SectionId = typeof sections[number]["id"];

const MODEL_COLOR_BY_TIER: Record<AgentModelTier, string> = {
  light:     "#10b981",
  standard:  "#22d3ee",
  reasoning: "#a855f7",
  premium:   "#f59e0b",
};

const TIER_LABEL: Record<AgentModelTier, string> = {
  light:     "Light",
  standard:  "Standard",
  reasoning: "Reasoning",
  premium:   "Premium",
};

/** Only light + standard models actually route in v1 — reasoning + premium are
 *  surfaced in the catalog as "Coming soon" so users see the multi-provider
 *  story without us advertising routing we don't perform. */
const ENABLED_TIERS: ReadonlySet<AgentModelTier> = new Set(["light", "standard"]);

// v1 only ships fixed orchestration rules — fine-grained agent permissions
// land with the multi-user release. Surface the matrix so users understand
// what's coming, but disable the toggles.
const permissionRows = [
  { p: "Delegate to peer agents",      sub: "Spawn subtasks across the swarm",       defaults: { Strategy: true, Research: true, Design: true, Treasury: false, Coordination: true } },
  { p: "Modify mission scope",         sub: "Edit objective, KPIs, and stage gates", defaults: { Strategy: true, Research: false, Design: false, Treasury: false, Coordination: true } },
  { p: "Read shared memory",           sub: "Query qdrant#brand vector store",       defaults: { Strategy: true, Research: true, Design: true, Treasury: true, Coordination: true } },
  { p: "Write shared memory",          sub: "Upsert embeddings into shared store",   defaults: { Strategy: true, Research: true, Design: true, Treasury: false, Coordination: true } },
  { p: "Approve payouts",              sub: "Move SOL from escrow to settled",       defaults: { Strategy: false, Research: false, Design: false, Treasury: true, Coordination: false } },
  { p: "Sign on-chain transactions",   sub: "Settle to Solana devnet",               defaults: { Strategy: false, Research: false, Design: false, Treasury: true, Coordination: false } },
];

const agentList = ["Strategy", "Research", "Design", "Treasury", "Coordination"];

function Toggle({ on, onClick, disabled = false }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative h-5 w-9 rounded-full border transition ${
        on ? "border-cyan-300/50 bg-cyan-300/20" : "border-white/10 bg-white/[0.03]"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <motion.span
        className="absolute top-0.5 h-4 w-4 rounded-full"
        style={{
          background: on ? "linear-gradient(135deg, #22d3ee, #a855f7)" : "rgba(255,255,255,0.4)",
          boxShadow: on ? "0 0 8px #22d3ee" : "none",
        }}
        animate={{ left: on ? 18 : 2 }}
        transition={{ type: "spring", stiffness: 360, damping: 28 }}
      />
    </button>
  );
}

function PrefRow({
  label, desc, value, onChange,
}: {
  label: string; desc: string; value: boolean; onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <div className="min-w-0 pr-3">
        <div className="text-sm text-white/85">{label}</div>
        <div className="text-[11px] text-white/45">{desc}</div>
      </div>
      <Toggle on={value} onClick={() => onChange(!value)} />
    </div>
  );
}

export default function Settings() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const walletAddress = publicKey?.toBase58() ?? null;
  const walletShort = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : "—";

  const { missions } = useMissions();
  const { agents } = useAgents();
  const { settings, update, stampSave } = useWorkspaceSettings(walletAddress);

  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [revealKeys, setRevealKeys] = useState(false);
  const [section, setSection] = useState<SectionId>("wallet");

  // Live workspace integration probes — used by the API & Keys section to
  // show the user the actual endpoints HiveMind is talking to + whether
  // they're reachable right now. apiReachable starts null while we wait
  // for the first /health response.
  const apiUrl = import.meta.env.VITE_API_URL?.trim() ?? "";
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const target = apiUrl ? `${apiUrl}/health` : "/health";
        const r = await fetch(target, { method: "GET" });
        if (!cancelled) setApiReachable(r.ok);
      } catch {
        if (!cancelled) setApiReachable(false);
      }
    };
    probe();
    const id = window.setInterval(probe, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [apiUrl]);

  const [liveSlot, setLiveSlot] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const slot = await connection.getSlot();
        if (!cancelled) setLiveSlot(slot);
      } catch {
        /* leave null */
      }
    };
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [connection]);

  useEffect(() => {
    if (!publicKey) { setSolBalance(null); return; }
    let cancelled = false;
    const tick = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        if (!cancelled) setSolBalance(lamports / LAMPORTS_PER_SOL);
      } catch {
        /* leave at null */
      }
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [publicKey, connection]);

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress).then(() => {
        setCopied(true);
        toast.success("Wallet address copied");
        setTimeout(() => setCopied(false), 1500);
      });
    }
  };

  // Resolve effective enabled state per model: stored override OR tier default.
  const modelEnabled = (id: string, tier: AgentModelTier): boolean => {
    if (id in settings.models) return settings.models[id];
    return ENABLED_TIERS.has(tier);
  };
  const toggleModel = (id: string, tier: AgentModelTier) => {
    if (!ENABLED_TIERS.has(tier)) return; // premium/reasoning locked
    const current = modelEnabled(id, tier);
    update((prev) => ({ ...prev, models: { ...prev.models, [id]: !current } }));
  };

  const setRouterStrategy = (r: RouterStrategy) =>
    update((prev) => ({ ...prev, routerStrategy: r }));

  const updatePref = (key: string, value: boolean) =>
    update((prev) => ({ ...prev, preferences: { ...prev.preferences, [key]: value } }));

  const updateNotif = (key: string, value: boolean) =>
    update((prev) => ({ ...prev, notifications: { ...prev.notifications, [key]: value } }));

  const updateTreasury = (key: string, value: boolean) =>
    update((prev) => ({ ...prev, treasury: { ...prev.treasury, [key]: value } }));

  const updateDefaults = (patch: Partial<AgentDefaults>) =>
    update((prev) => ({ ...prev, defaults: { ...prev.defaults, ...patch } }));

  const onResetSettings = () => {
    if (!window.confirm("Reset every Settings field to defaults? Models, toggles, defaults — all per-wallet preferences will be wiped.")) {
      return;
    }
    resetSettings(walletAddress);
    toast.success("Settings reset to defaults");
  };

  const save = () => {
    stampSave();
    toast.success("Settings saved", { description: "Preferences are stored per-wallet in this browser." });
  };

  const enabledModelCount = useMemo(() => {
    return AGENT_MODEL_CATALOG.filter((m) => modelEnabled(m.id, m.tier)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.models]);

  // Counts for the workspace summary card — driven by real registry + user state.
  const missionCount = missions.length;
  const agentCount = agents.length;
  const memoryCount = missions.reduce((s, m) => s + (m.agents?.length ?? 0), 0); // a stand-in proxy

  const savedAtLabel = useMemo(() => {
    if (!settings.savedAt) return null;
    return new Date(settings.savedAt).toLocaleTimeString();
  }, [settings.savedAt]);

  const headerStatusLabel = walletAddress
    ? `Workspace · ${walletShort}`
    : "Workspace · not connected";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />

        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at 15% 0%, rgba(34,211,238,0.10), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(168,85,247,0.10), transparent 55%)",
            }}
          />
          <Particles count={18} />

          <div className="relative px-6 py-6">
            <PageHeader
              title="Settings"
              subtitle="Workspace preferences, models, permissions, and orchestrator configuration."
              crumbs={[{ label: "Settings" }]}
              status={{ label: headerStatusLabel, tone: "purple" }}
              actions={
                <div className="flex items-center gap-2">
                  {savedAtLabel && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1.5 text-[11px] text-emerald-200">
                      <Check className="h-3 w-3" /> saved {savedAtLabel}
                    </span>
                  )}
                  <button
                    onClick={onResetSettings}
                    title="Reset every Settings field to defaults (per-wallet)"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 transition hover:border-rose-300/30 hover:text-rose-200"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset all
                  </button>
                  <button
                    onClick={save}
                    className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
                    <Save className="relative h-3.5 w-3.5" />
                    <span className="relative">Save Changes</span>
                  </button>
                </div>
              }
            />

            <div className="grid gap-6 xl:grid-cols-4">
              {/* Sidebar nav */}
              <Card className="xl:col-span-1">
                <div className="border-b border-white/5 px-5 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <SettingsIcon className="h-4 w-4 text-cyan-300" />
                    Configuration
                  </div>
                </div>
                <div className="space-y-1 p-3">
                  {sections.map((s) => {
                    const active = section === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSection(s.id)}
                        className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                          active ? "bg-gradient-to-r from-cyan-300/10 to-transparent text-white" : "text-white/65 hover:bg-white/5"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="settings-pill"
                            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]"
                          />
                        )}
                        <s.icon className={`h-4 w-4 ${active ? "" : "text-white/40"}`} style={active ? { color: s.c } : {}} />
                        <span className="flex-1">{s.label}</span>
                        <ChevronRight className={`h-3.5 w-3.5 ${active ? "text-cyan-300" : "text-white/30"}`} />
                      </button>
                    );
                  })}
                </div>

                {/* Workspace summary — derived from real registry + user state */}
                <div className="m-3 rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 p-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">workspace</div>
                  <div className="mt-2 truncate font-mono text-sm">{walletShort}</div>
                  <div className="mt-1 text-[11px] text-white/55">
                    {agentCount > 0 ? `${agentCount} agents` : "registry offline"} ·{" "}
                    {missionCount > 0 ? `${missionCount} missions` : "no missions"} · devnet
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                    {[
                      { k: "Models", v: enabledModelCount },
                      { k: "Mem",    v: memoryCount },
                      { k: "Perms",  v: "v2" },
                    ].map((x) => (
                      <div key={x.k} className="rounded-md bg-black/40 p-1.5">
                        <div className="text-[9px] text-white/40">{x.k}</div>
                        <div className="text-[11px] text-cyan-200 tabular-nums">{x.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Section content */}
              <div className="xl:col-span-3">
                {section === "models" && (
                  <div className="space-y-6">
                    <Card>
                      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Brain className="h-4 w-4 text-purple-300" />
                          Model Configuration
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.25em] text-purple-300">
                          {enabledModelCount} / {AGENT_MODEL_CATALOG.length} routed
                        </span>
                      </div>

                      <div className="px-5 pt-4 text-[11px] text-white/45">
                        v1 routes through light + standard tiers. Reasoning + premium models are listed for transparency — they unlock with the v2 routing release.
                      </div>

                      <div className="grid gap-3 p-4 md:grid-cols-2">
                        {AGENT_MODEL_CATALOG.map((m, i) => {
                          const tierEnabled = ENABLED_TIERS.has(m.tier);
                          const enabled = modelEnabled(m.id, m.tier);
                          const c = MODEL_COLOR_BY_TIER[m.tier];
                          return (
                            <motion.div
                              key={m.id}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.02 }}
                              className={`relative overflow-hidden rounded-xl border border-white/10 bg-black/30 p-4 ${tierEnabled ? "" : "opacity-75"}`}
                            >
                              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl" style={{ background: c }} />
                              <div className="relative flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div
                                    className="h-10 w-10 shrink-0 rounded-xl"
                                    style={{ background: `linear-gradient(135deg, ${c}55, ${c}11)`, boxShadow: `0 0 14px ${c}55` }}
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-sm">
                                      <span className="truncate">{m.label}</span>
                                      {tierEnabled && enabled && (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
                                          live
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-white/50">{m.desc}</div>
                                    <div className="mt-0.5 font-mono text-[10px] text-white/35">{m.id}</div>
                                  </div>
                                </div>
                                {tierEnabled ? (
                                  <Toggle on={enabled} onClick={() => toggleModel(m.id, m.tier)} />
                                ) : (
                                  <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.25em] text-amber-200">
                                    Soon
                                  </span>
                                )}
                              </div>

                              <div className="relative mt-3 grid grid-cols-3 gap-2 text-[10px]">
                                <div className="rounded-md bg-white/[0.03] px-2 py-1.5">
                                  <div className="text-white/40">Tier</div>
                                  <div className="text-white/85">{TIER_LABEL[m.tier]}</div>
                                </div>
                                <div className="rounded-md bg-white/[0.03] px-2 py-1.5">
                                  <div className="text-white/40">SOL mult</div>
                                  <div className="tabular-nums text-white/85">{m.solMult.toFixed(2)}×</div>
                                </div>
                                <div className="rounded-md bg-white/[0.03] px-2 py-1.5">
                                  <div className="text-white/40">Status</div>
                                  <div className="tabular-nums text-white/85">
                                    {tierEnabled ? (enabled ? "routed" : "muted") : "v2"}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </Card>

                    <Card>
                      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Zap className="h-4 w-4 text-cyan-300" />
                          Routing Strategy
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">smart router</span>
                      </div>
                      <div className="grid gap-3 p-4 md:grid-cols-3">
                        {([
                          { id: "cost",    label: "Cost-Optimized", sub: "Cheapest viable model",     c: "#10b981" },
                          { id: "balance", label: "Balanced",        sub: "Quality vs cost trade-off", c: "#22d3ee" },
                          { id: "quality", label: "Max Quality",     sub: "Always pick best model",    c: "#a855f7" },
                        ] as const).map((r) => {
                          const active = settings.routerStrategy === r.id;
                          return (
                            <button
                              key={r.id}
                              onClick={() => setRouterStrategy(r.id)}
                              className={`relative overflow-hidden rounded-xl border p-4 text-left transition ${
                                active ? "border-cyan-300/40 bg-cyan-300/5" : "border-white/10 bg-black/30 hover:border-white/20"
                              }`}
                            >
                              <div className="text-sm">{r.label}</div>
                              <div className="mt-1 text-[11px] text-white/45">{r.sub}</div>
                              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                                <motion.div
                                  initial={{ width: 0 }} animate={{ width: active ? "100%" : "30%" }}
                                  transition={{ duration: 0.6 }}
                                  className="h-full rounded-full"
                                  style={{ background: r.c, boxShadow: `0 0 8px ${r.c}` }}
                                />
                              </div>
                              {active && (
                                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-cyan-300/15 px-1.5 py-0.5 text-[10px] text-cyan-200">
                                  <Check className="h-2.5 w-2.5" /> selected
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </Card>
                  </div>
                )}

                {section === "permissions" && (
                  <div className="space-y-6">
                    <Card>
                      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Shield className="h-4 w-4 text-cyan-300" />
                          v1 Orchestration Rules
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">fixed</span>
                      </div>
                      <div className="space-y-3 p-5 text-[12px] text-white/65">
                        <p>
                          Agent permissions are <span className="text-white/85">hard-coded</span> in v1 — every
                          mission runs the same delegation graph (Strategy plans, Research gathers, Design /
                          Development build, Coordination merges, Treasury settles). The Permissions Matrix
                          UI is a preview of the v2 per-capability toggles.
                        </p>
                        <p className="text-white/45 text-[11px]">
                          Why fixed in v1: predictable artifact pipeline + deterministic mission cost. Loosening
                          the graph requires a per-workspace policy engine that&apos;s shipping in v2.
                        </p>
                      </div>

                      <div className="overflow-x-auto border-t border-white/5">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-white/40">
                              <th className="px-5 py-3 text-left">Capability</th>
                              {agentList.map((a) => (
                                <th key={a} className="px-3 py-3 text-center">{a}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {permissionRows.map((row) => (
                              <tr key={row.p} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]">
                                <td className="px-5 py-3">
                                  <div className="text-sm text-white/85">{row.p}</div>
                                  <div className="text-[11px] text-white/45">{row.sub}</div>
                                </td>
                                {agentList.map((a) => {
                                  const on = !!row.defaults[a as keyof typeof row.defaults];
                                  return (
                                    <td key={a} className="px-3 py-3 text-center">
                                      <div className="flex justify-center">
                                        {on ? (
                                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300/35 bg-emerald-300/10 text-emerald-300" title={`${a} can ${row.p.toLowerCase()}`}>
                                            <Check className="h-3 w-3" />
                                          </span>
                                        ) : (
                                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-white/25" title={`${a} cannot ${row.p.toLowerCase()}`}>
                                            <X className="h-3 w-3" />
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>

                    <Card>
                      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Shield className="h-4 w-4 text-purple-300" />
                          Per-workspace Permissions
                        </div>
                        <span className="rounded-full border border-purple-300/30 bg-purple-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-purple-200">
                          v2 roadmap
                        </span>
                      </div>
                      <div className="grid gap-3 p-5 md:grid-cols-3">
                        {[
                          { t: "Per-capability toggles", d: "Allow / deny each agent per workspace, signed on-chain so verifiers can enforce." },
                          { t: "Audit log", d: "Every delegation, payout, and signed transaction streamed to an append-only feed." },
                          { t: "Custom role packs", d: "Define your own role (e.g. 'QA Reviewer') with a permission template." },
                        ].map((p) => (
                          <div key={p.t} className="rounded-xl border border-white/10 bg-black/30 p-3">
                            <div className="text-sm text-white/85">{p.t}</div>
                            <div className="mt-1 text-[11px] text-white/45">{p.d}</div>
                            <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-white/40">
                              coming soon
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                )}

                {section === "wallet" && (
                  <div className="space-y-6">
                    <Card>
                      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Wallet className="h-4 w-4 text-emerald-300" />
                          Connected Wallet
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-300">Solana devnet</span>
                      </div>
                      <div className="p-5">
                        <div className="flex items-center gap-3">
                          <div className={`h-12 w-12 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.5)] ${connected ? "bg-gradient-to-br from-emerald-300 to-cyan-300" : "bg-white/10"}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-mono text-sm">
                              {walletShort}
                              <button onClick={copyAddress} className="rounded-md border border-white/10 bg-white/[0.03] p-1 hover:border-cyan-300/30" title="Copy address" disabled={!walletAddress}>
                                {copied ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3 text-white/55" />}
                              </button>
                              {walletAddress && (
                                <a
                                  href={`https://explorer.solana.com/address/${walletAddress}?cluster=devnet`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="View on Solana Explorer"
                                  className="rounded-md border border-white/10 bg-white/[0.03] p-1 hover:border-cyan-300/30 hover:text-cyan-200"
                                >
                                  <ExternalLink className="h-3 w-3 text-white/55" />
                                </a>
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-white/50">
                              {connected ? "Connected · primary signer" : "Not connected — connect wallet to continue"}
                            </div>
                          </div>
                          <div className="ml-auto flex items-baseline gap-1.5">
                            <span className="text-2xl tabular-nums">
                              {solBalance !== null ? solBalance.toFixed(4) : connected ? "…" : "—"}
                            </span>
                            <span className="text-sm text-white/55">SOL</span>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-2 text-[11px] md:grid-cols-3">
                          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                            <div className="text-[10px] uppercase tracking-widest text-white/40">Network</div>
                            <div className="mt-1 text-emerald-300">Solana devnet</div>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                            <div className="text-[10px] uppercase tracking-widest text-white/40">RPC endpoint</div>
                            <div className="mt-1 truncate font-mono text-cyan-200">
                              {connection.rpcEndpoint.replace(/^https?:\/\//, "")}
                            </div>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                            <div className="text-[10px] uppercase tracking-widest text-white/40">Missions on this wallet</div>
                            <div className="mt-1 tabular-nums text-white/85">{missionCount}</div>
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card>
                      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Lock className="h-4 w-4 text-cyan-300" />
                          HiveMind Treasury
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">recipient pubkey</span>
                      </div>
                      <div className="space-y-3 p-5">
                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[10px] uppercase tracking-widest text-white/40">Treasury address</div>
                            <a
                              href={`https://explorer.solana.com/address/${TREASURY_RECIPIENT_PUBKEY}?cluster=devnet`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline"
                            >
                              View on Explorer <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          <div className="mt-2 break-all font-mono text-[12px] text-white/80">
                            {TREASURY_RECIPIENT_PUBKEY}
                          </div>
                          <div className="mt-2 text-[11px] text-white/45">
                            Deposits + agent payouts route through this pubkey. Override via{" "}
                            <span className="font-mono text-white/70">VITE_HM_TREASURY_PUBKEY</span> in production.
                          </div>
                        </div>

                        <PrefRow
                          label="Auto-approve payouts under 1 SOL"
                          desc="Skip manual review for low-value settlements"
                          value={settings.treasury.autoApproveSmallPayouts}
                          onChange={(v) => updateTreasury("autoApproveSmallPayouts", v)}
                        />
                        <PrefRow
                          label="Require multisig for amounts > 50 SOL"
                          desc="3/5 quorum gate on large settlements (v2 enforcement)"
                          value={settings.treasury.multisigOverThreshold}
                          onChange={(v) => updateTreasury("multisigOverThreshold", v)}
                        />
                        <PrefRow
                          label="Lock escrow on mission start"
                          desc="Hold mission budget until completion"
                          value={settings.treasury.lockEscrowOnStart}
                          onChange={(v) => updateTreasury("lockEscrowOnStart", v)}
                        />
                        <PrefRow
                          label="Settle automatically on approval"
                          desc="Push transactions when verifiers sign"
                          value={settings.treasury.autoSettleOnApproval}
                          onChange={(v) => updateTreasury("autoSettleOnApproval", v)}
                        />
                      </div>
                    </Card>
                  </div>
                )}

                {section === "preferences" && (
                  <div className="space-y-6">
                    <Card>
                      <div className="border-b border-white/5 px-5 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-cyan-300" />
                          AI Behavior
                        </div>
                      </div>
                      <div className="space-y-3 p-5">
                        <PrefRow
                          label="Stream chain-of-thought to console"
                          desc="Show every reasoning step in Live Console"
                          value={settings.preferences.streamReasoning}
                          onChange={(v) => updatePref("streamReasoning", v)}
                        />
                        <PrefRow
                          label="Auto-pause on low confidence"
                          desc="Halt mission if confidence < 0.65"
                          value={settings.preferences.autoPauseLowConfidence}
                          onChange={(v) => updatePref("autoPauseLowConfidence", v)}
                        />
                        <PrefRow
                          label="Memory recall in every reasoning"
                          desc="Always include top-k vector matches"
                          value={settings.preferences.memoryRecallAlways}
                          onChange={(v) => updatePref("memoryRecallAlways", v)}
                        />
                        <PrefRow
                          label="Shadow mode (no on-chain effects)"
                          desc="Run agents without committing transactions"
                          value={settings.preferences.shadowMode}
                          onChange={(v) => updatePref("shadowMode", v)}
                        />
                        <PrefRow
                          label="Human approval gates"
                          desc="Require human sign-off for high-impact actions"
                          value={settings.preferences.humanApprovalGates}
                          onChange={(v) => updatePref("humanApprovalGates", v)}
                        />
                      </div>
                    </Card>

                    <Card>
                      <div className="border-b border-white/5 px-5 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-purple-300" />
                          Defaults
                        </div>
                      </div>
                      <div className="grid gap-3 p-5 md:grid-cols-2">
                        {/* Temperature — number-with-slider for fine control. */}
                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/40">
                            <span>Default temperature</span>
                            <span className="font-mono text-cyan-300">{settings.defaults.temperature.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={2}
                            step={0.05}
                            value={settings.defaults.temperature}
                            onChange={(e) => updateDefaults({ temperature: parseFloat(e.target.value) })}
                            className="mt-3 w-full accent-cyan-300"
                          />
                          <div className="mt-1 text-[10px] text-white/40">0 deterministic → 2 wild · agent-runtime baseline</div>
                        </div>

                        {/* Top-K memory — integer 1..30 */}
                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/40">
                            <span>Top-K memory recall</span>
                            <span className="font-mono text-purple-300">{settings.defaults.topKMemory}</span>
                          </div>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            step={1}
                            value={settings.defaults.topKMemory}
                            onChange={(e) => {
                              const v = Math.max(1, Math.min(30, Math.round(parseInt(e.target.value || "0", 10) || 0)));
                              updateDefaults({ topKMemory: v });
                            }}
                            className="mt-3 w-full rounded-md border border-white/10 bg-black/50 px-3 py-1.5 text-sm tabular-nums text-white focus:border-purple-300/40 focus:outline-none"
                          />
                          <div className="mt-1 text-[10px] text-white/40">vector store fanout per recall · 1–30</div>
                        </div>

                        {/* Mission timeout — select preset hours */}
                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/40">
                            <span>Mission timeout</span>
                            <span className="font-mono text-amber-300">{settings.defaults.missionTimeoutHours}h</span>
                          </div>
                          <select
                            value={settings.defaults.missionTimeoutHours}
                            onChange={(e) => updateDefaults({ missionTimeoutHours: parseInt(e.target.value, 10) })}
                            className="mt-3 w-full rounded-md border border-white/10 bg-black/50 px-3 py-1.5 text-sm text-white focus:outline-none"
                          >
                            {[1, 4, 8, 12, 24, 48, 72].map((h) => (
                              <option key={h} value={h}>{h} hours</option>
                            ))}
                          </select>
                          <div className="mt-1 text-[10px] text-white/40">auto-pause cutoff for long-running missions</div>
                        </div>

                        {/* Max parallel agents — integer 1..20 */}
                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/40">
                            <span>Max parallel agents</span>
                            <span className="font-mono text-emerald-300">{settings.defaults.maxParallelAgents}</span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={20}
                            step={1}
                            value={settings.defaults.maxParallelAgents}
                            onChange={(e) => updateDefaults({ maxParallelAgents: parseInt(e.target.value, 10) })}
                            className="mt-3 w-full accent-emerald-300"
                          />
                          <div className="mt-1 text-[10px] text-white/40">swarm concurrency cap · 1–20</div>
                        </div>
                      </div>
                      <div className="border-t border-white/5 px-5 pb-4 pt-3 text-[11px] text-white/45">
                        Values persist per-wallet in this browser. v1 surfaces them here so you can tune the workspace; v2 will plumb them through the backend agent runtime so every invoke uses your defaults end-to-end.{" "}
                        <button
                          type="button"
                          onClick={() => updateDefaults(DEFAULT_AGENT_DEFAULTS)}
                          className="ml-1 text-cyan-300 hover:underline"
                        >
                          Reset defaults
                        </button>
                      </div>
                    </Card>
                  </div>
                )}

                {section === "api" && (
                  <div className="space-y-6">
                    <Card>
                      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <KeyRound className="h-4 w-4 text-cyan-300" />
                          Workspace Integrations
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">live</span>
                      </div>
                      <div className="space-y-2 px-5 pt-3 text-[11px] text-white/45">
                        These are the real endpoints HiveMind talks to from this browser.
                        Per-user API keys aren&apos;t in v1 — every action is signed by the
                        wallet you connected, which means you don&apos;t need a token to
                        invoke agents or settle missions.
                      </div>
                      <div className="divide-y divide-white/5">
                        {[
                          {
                            l: "HiveMind API",
                            v: apiUrl || "(same origin — Vite proxy)",
                            c: "#22d3ee",
                            label: apiReachable === null ? "checking…" : apiReachable ? "reachable" : "unreachable",
                            labelTone: apiReachable === false ? "rose" : apiReachable ? "emerald" : "amber",
                            sub: "REST + JWT (wallet-signed)",
                          },
                          {
                            l: "Solana RPC",
                            v: connection.rpcEndpoint,
                            c: "#a855f7",
                            label: liveSlot != null ? `slot ${liveSlot.toLocaleString()}` : "no slot",
                            labelTone: liveSlot != null ? "emerald" : "amber",
                            sub: "devnet — used for balance, deposits, and settlement",
                          },
                          {
                            l: "Treasury pubkey",
                            v: TREASURY_RECIPIENT_PUBKEY,
                            c: "#10b981",
                            label: "fixed",
                            labelTone: "cyan",
                            sub: "Override with VITE_HM_TREASURY_PUBKEY",
                          },
                          {
                            l: "Realtime hub",
                            v: apiUrl ? `${apiUrl.replace(/^http/, "ws")}/ws` : "wss://<same-origin>/ws",
                            c: "#f59e0b",
                            label: "best-effort",
                            labelTone: "amber",
                            sub: "Vercel→EB hop drops WS — Live Console falls back to in-tab bus",
                          },
                        ].map((k, i) => {
                          const masked = `${k.v.slice(0, 6)}…${k.v.slice(-6)}`;
                          const display = revealKeys ? k.v : (k.v.length > 22 ? masked : k.v);
                          const toneClass =
                            k.labelTone === "emerald" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                            : k.labelTone === "rose"   ? "border-rose-300/30 bg-rose-300/10 text-rose-200"
                            : k.labelTone === "cyan"   ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-200"
                            : "border-amber-300/30 bg-amber-300/10 text-amber-200";
                          return (
                            <motion.div
                              key={k.l}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.04 }}
                              className="grid grid-cols-12 items-center gap-3 px-5 py-3"
                            >
                              <div className="col-span-3 flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg"
                                  style={{ background: `linear-gradient(135deg, ${k.c}55, ${k.c}11)`, boxShadow: `0 0 12px ${k.c}55` }} />
                                <div>
                                  <div className="text-sm">{k.l}</div>
                                  <div className="text-[10px] text-white/45">{k.sub}</div>
                                </div>
                              </div>
                              <div className="col-span-7 flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-1.5">
                                <Hexagon className="h-3 w-3 text-white/40" />
                                <span className="truncate font-mono text-[11px]">{display}</span>
                                <button
                                  type="button"
                                  onClick={() => setRevealKeys((v) => !v)}
                                  className="ml-auto text-white/40 hover:text-white"
                                  title={revealKeys ? "Mask values" : "Reveal full values"}
                                >
                                  {revealKeys ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(k.v);
                                    toast.success(`Copied ${k.l}`);
                                  }}
                                  className="text-white/40 hover:text-cyan-300"
                                  title={`Copy ${k.l}`}
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                              <div className="col-span-2 text-right">
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${toneClass}`}>
                                  {k.label}
                                </span>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </Card>

                    <Card>
                      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <KeyRound className="h-4 w-4 text-purple-300" />
                          Personal API Keys
                        </div>
                        <span className="rounded-full border border-purple-300/30 bg-purple-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-purple-200">
                          v2 roadmap
                        </span>
                      </div>
                      <div className="p-5">
                        <p className="text-[12px] text-white/65">
                          Token-based programmatic access (run missions from scripts, ship CI workflows
                          that invoke agents, wire webhooks to Discord/Slack) lands with the v2 release.
                        </p>
                        <p className="mt-2 text-[11px] text-white/45">
                          v1 auth: every API call is signed by the wallet you connected (JWT issued from a
                          wallet challenge). Sign in once with your Solana wallet and the dashboard does
                          the rest — no copy-pasting tokens.
                        </p>
                        <div className="mt-4 grid gap-2 md:grid-cols-3">
                          {[
                            { t: "Production key", d: "Long-lived, scoped to read/write/sign" },
                            { t: "Webhook secrets", d: "Discord, Slack, custom URLs for mission completion" },
                            { t: "Custom RPC", d: "Override Solana RPC with your own provider" },
                          ].map((x) => (
                            <div key={x.t} className="rounded-xl border border-white/10 bg-black/30 p-3">
                              <div className="text-sm text-white/85">{x.t}</div>
                              <div className="mt-1 text-[11px] text-white/45">{x.d}</div>
                              <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-white/40">
                                coming soon
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>
                  </div>
                )}

                {section === "notifications" && (
                  <Card>
                    <div className="border-b border-white/5 px-5 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-amber-300" />
                        Notification Preferences
                      </div>
                    </div>
                    <div className="space-y-3 p-5">
                      <PrefRow
                        label="Mission completion"
                        desc="When any mission reaches done state"
                        value={settings.notifications.missionCompletion}
                        onChange={(v) => updateNotif("missionCompletion", v)}
                      />
                      <PrefRow
                        label="Failed workflows"
                        desc="Errors and retries from any agent"
                        value={settings.notifications.failedWorkflows}
                        onChange={(v) => updateNotif("failedWorkflows", v)}
                      />
                      <PrefRow
                        label="Payment approvals"
                        desc="When treasury awaits sign-off"
                        value={settings.notifications.paymentApprovals}
                        onChange={(v) => updateNotif("paymentApprovals", v)}
                      />
                      <PrefRow
                        label="Delegation requests"
                        desc="Cross-agent delegation events"
                        value={settings.notifications.delegationRequests}
                        onChange={(v) => updateNotif("delegationRequests", v)}
                      />
                      <PrefRow
                        label="Security alerts"
                        desc="Anomalies and signing failures"
                        value={settings.notifications.securityAlerts}
                        onChange={(v) => updateNotif("securityAlerts", v)}
                      />
                    </div>
                  </Card>
                )}

                {section === "team" && (
                  <div className="space-y-6">
                    <Card>
                      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-4 w-4 text-cyan-300" />
                          Workspace Members
                        </div>
                        <button
                          type="button"
                          disabled
                          title="Multi-user workspaces ship in v2"
                          className="cursor-not-allowed rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/55 opacity-70"
                        >
                          + invite
                          <span className="ml-1 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white/45">
                            Soon
                          </span>
                        </button>
                      </div>
                      <div className="px-5 pt-3 text-[11px] text-white/45">
                        v1 is single-user: every mission, artifact, and treasury action is scoped to the wallet
                        you connected. Multi-user workspaces (shared missions, role-based access, on-chain
                        team treasuries) ship in v2.
                      </div>
                      <div className="divide-y divide-white/5">
                        <motion.div
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="grid grid-cols-12 items-center gap-3 px-5 py-3"
                        >
                          <div className="col-span-5 flex items-center gap-3">
                            <div
                              className={`h-8 w-8 rounded-lg ${connected ? "bg-gradient-to-br from-emerald-300/40 to-cyan-300/30" : "bg-white/[0.06]"}`}
                              style={connected ? { boxShadow: "0 0 14px rgba(16,185,129,0.35)" } : undefined}
                            />
                            <div>
                              <div className="text-sm">You</div>
                              <div className="font-mono text-[10px] text-white/45">{walletShort}</div>
                            </div>
                          </div>
                          <div className="col-span-3 text-[11px] text-white/70">Owner · Workspace admin</div>
                          <div className="col-span-2 text-[11px] text-emerald-300">
                            {connected ? "active" : "wallet not connected"}
                          </div>
                          <div className="col-span-2 text-right">
                            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-cyan-200">
                              v1 — only seat
                            </span>
                          </div>
                        </motion.div>
                      </div>
                    </Card>

                    <Card>
                      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-4 w-4 text-purple-300" />
                          Multi-user Workspaces
                        </div>
                        <span className="rounded-full border border-purple-300/30 bg-purple-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-purple-200">
                          v2 roadmap
                        </span>
                      </div>
                      <div className="grid gap-3 p-5 md:grid-cols-3">
                        {[
                          { t: "Invite by wallet", d: "Onboard teammates with a Solana pubkey — no email required, signing-time access control." },
                          { t: "Shared treasury (3/5 multisig)", d: "Mission budgets approve through a multisig vault so no single member can drain it." },
                          { t: "Role packs", d: "Owner / Operator / Contributor / Auditor — each with a permission template you can override." },
                        ].map((p) => (
                          <div key={p.t} className="rounded-xl border border-white/10 bg-black/30 p-3">
                            <div className="text-sm text-white/85">{p.t}</div>
                            <div className="mt-1 text-[11px] text-white/45">{p.d}</div>
                            <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-white/40">
                              coming soon
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
