import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { toast } from "sonner";
import {
  Settings as SettingsIcon, Wallet, Brain, KeyRound, Shield, Bell, Users,
  Cpu, Sparkles, Zap, Hexagon, Lock, ChevronRight, Save, RefreshCcw,
  Check, Copy, Eye, EyeOff, ExternalLink,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { AGENT_MODEL_CATALOG, type AgentModelTier } from "../lib/agent-models";
import { useWorkspaceSettings, type RouterStrategy } from "../lib/settings-store";
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
                  <Card>
                    <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Shield className="h-4 w-4 text-cyan-300" />
                        Agent Permissions Matrix
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">delegation authority</span>
                    </div>
                    <div className="overflow-x-auto">
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
                              {agentList.map((a) => (
                                <td key={a} className="px-3 py-3 text-center">
                                  <div className="flex justify-center">
                                    <Toggle on={!!row.defaults[a as keyof typeof row.defaults]} onClick={() => undefined} disabled />
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
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
                        {[
                          { l: "Default temperature",   v: "0.7",   c: "#22d3ee", note: "agent-runtime baseline" },
                          { l: "Top-K memory recall",   v: "8",     c: "#a855f7", note: "vector store fanout" },
                          { l: "Mission timeout",       v: "12h",   c: "#f59e0b", note: "auto-pause cutoff" },
                          { l: "Max parallel agents",   v: "12",    c: "#10b981", note: "swarm concurrency cap" },
                        ].map((x) => (
                          <div key={x.l} className="rounded-xl border border-white/10 bg-black/30 p-4">
                            <div className="text-[10px] uppercase tracking-widest text-white/40">{x.l}</div>
                            <div className="mt-1 text-2xl tabular-nums" style={{ color: x.c }}>{x.v}</div>
                            <div className="mt-1 text-[10px] text-white/40">{x.note} · v2 will expose tuning</div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                )}

                {section === "api" && (
                  <Card>
                    <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <KeyRound className="h-4 w-4 text-cyan-300" />
                        API & Integration Keys
                      </div>
                      <button className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-100 hover:bg-cyan-300/20">
                        + new key
                      </button>
                    </div>
                    <div className="divide-y divide-white/5">
                      {[
                        { l: "HiveMind API · production", v: "hm_live_4kJ29F1e",    role: "read · write · sign", c: "#22d3ee", date: "2026-04-12" },
                        { l: "Webhook · Discord",          v: "wh_disc_1aB22cD",    role: "deliver",             c: "#5865f2", date: "2026-04-29" },
                        { l: "Solana RPC",                 v: "rpc_helius_2qN73KZ", role: "submit · query",      c: "#a855f7", date: "2026-04-04" },
                      ].map((k, i) => (
                        <motion.div
                          key={k.l}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="grid grid-cols-12 items-center gap-3 px-5 py-3"
                        >
                          <div className="col-span-4 flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg"
                              style={{ background: `linear-gradient(135deg, ${k.c}55, ${k.c}11)`, boxShadow: `0 0 12px ${k.c}55` }} />
                            <div>
                              <div className="text-sm">{k.l}</div>
                              <div className="text-[10px] text-white/45">created {k.date}</div>
                            </div>
                          </div>
                          <div className="col-span-5 flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-1.5">
                            <Hexagon className="h-3 w-3 text-white/40" />
                            <span className="font-mono text-[11px]">
                              {revealKeys ? k.v : k.v.slice(0, 4) + "•".repeat(k.v.length - 8) + k.v.slice(-4)}
                            </span>
                            <button onClick={() => setRevealKeys((v) => !v)} className="ml-auto text-white/40 hover:text-white">
                              {revealKeys ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                            <button className="text-white/40 hover:text-cyan-300">
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="col-span-2 text-[11px] text-white/55">{k.role}</div>
                          <div className="col-span-1 text-right">
                            <button className="rounded-md border border-white/10 bg-white/[0.03] p-1.5 text-white/55 hover:border-rose-300/30 hover:text-rose-200">
                              <RefreshCcw className="h-3 w-3" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </Card>
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
                  <Card>
                    <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-cyan-300" />
                        Workspace Members
                      </div>
                      <button className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-100 hover:bg-cyan-300/20">
                        + invite
                      </button>
                    </div>
                    <div className="divide-y divide-white/5">
                      {[
                        { n: "Astra",   r: "Owner",        e: "astra@hivemind.sol",    last: "now",    c: "#22d3ee" },
                        { n: "Halo",    r: "Operator",     e: "halo@hivemind.sol",     last: "12m",    c: "#06b6d4" },
                        { n: "Vega",    r: "Strategist",   e: "vega@hivemind.sol",     last: "2h",     c: "#a855f7" },
                        { n: "Lumen",   r: "Contributor",  e: "lumen@hivemind.sol",    last: "1d",     c: "#3b82f6" },
                      ].map((u, i) => (
                        <motion.div
                          key={u.n}
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="grid grid-cols-12 items-center gap-3 px-5 py-3"
                        >
                          <div className="col-span-4 flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg"
                              style={{ background: `linear-gradient(135deg, ${u.c}55, ${u.c}11)`, boxShadow: `0 0 12px ${u.c}55` }} />
                            <div>
                              <div className="text-sm">{u.n}</div>
                              <div className="text-[10px] text-white/45">{u.e}</div>
                            </div>
                          </div>
                          <div className="col-span-3 text-[11px] text-white/70">{u.r}</div>
                          <div className="col-span-3 text-[11px] text-white/45">last active {u.last}</div>
                          <div className="col-span-2 text-right">
                            <button className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/55 hover:border-cyan-300/30 hover:text-cyan-200">
                              manage
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
