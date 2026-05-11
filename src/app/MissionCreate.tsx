import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles, Target, Calendar, Wallet, Cpu, Workflow,
  Rocket, PlayCircle, Plus, X, Check, Zap,
  Shield, Brain, Network, TrendingUp, Gauge, Bot, ArrowRight, Trophy,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { CoordGraph } from "./components/dashboard/coord-graph";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { apiConfigured, suggestMissionGoalsApi, fetchTrialStatus, postTrialUse } from "../lib/api";
import { TrialBanner } from "./components/TrialBanner";
import { getAuthToken, getSessionWallet, waitForSession } from "../lib/auth-token";
import { useWalletBackendAuth } from "./hooks/useWalletBackendAuth";
import { useMissionPayment } from "./hooks/useMissionPayment";
import { useMissions, type MissionBudgetAllocation, type MissionConfig } from "./store";

/** Rotated through the textarea placeholder so the suggestions are discoverable without
 *  stealing vertical space. One swap every ~3 seconds, looped forever. */
const placeholderPrompts = [
  "Launch a meme marketing campaign",
  "Create investor pitch deck",
  "Build a production-ready landing page",
  "Deploy an autonomous growth strategy",
  "Ship an MVP for our hackathon submission",
  "Run our DAO governance + community ops",
  "Find the cheapest GPU host and deploy my AI app",
  "Generate a research thesis on top AI startups",
  "Design a polished SaaS dashboard with auth",
  "Build a Solana DEX landing + tokenomics one-pager",
  "Audit our smart contract and ship a fix",
];

const priorities = [
  { key: "low", label: "Low", desc: "Background work · best-effort", color: "#64748b", glow: "rgba(100,116,139,0.4)" },
  { key: "std", label: "Standard", desc: "Default cadence", color: "#22d3ee", glow: "rgba(34,211,238,0.5)" },
  { key: "high", label: "High", desc: "Prioritized routing", color: "#a855f7", glow: "rgba(168,85,247,0.6)" },
  { key: "crit", label: "Critical", desc: "All agents engaged", color: "#ef4444", glow: "rgba(239,68,68,0.7)" },
];

const allAgents = [
  { name: "Strategy", model: "Claude 4.7", spec: "Planning · KPIs", rep: 4.92, perf: 98, color: "#22d3ee", default: true },
  { name: "Research", model: "GPT-5", spec: "Discovery · Signals", rep: 4.81, perf: 94, color: "#a855f7", default: true },
  { name: "Design", model: "Llama 4", spec: "Visual · Brand", rep: 4.74, perf: 92, color: "#3b82f6", default: true },
  { name: "Development", model: "DeepSeek", spec: "Code · Build", rep: 4.69, perf: 91, color: "#0ea5e9", default: true },
  { name: "Marketing", model: "GPT-5", spec: "Distribution · Reach", rep: 4.78, perf: 93, color: "#ec4899", default: false },
  { name: "Treasury", model: "DeepSeek", spec: "Escrow · Payouts", rep: 4.97, perf: 99, color: "#10b981", default: true },
  { name: "Analytics", model: "Qwen 3", spec: "Metrics · Insight", rep: 4.66, perf: 90, color: "#8b5cf6", default: true },
  { name: "Coordination", model: "Claude 4.7", spec: "Routing · Sync", rep: 4.89, perf: 97, color: "#06b6d4", default: true },
  { name: "Memory", model: "Qwen 3", spec: "Recall · Vectors", rep: 4.72, perf: 89, color: "#f59e0b", default: false },
];

const AGENT_PHASE: Record<string, { phase: string; estMin: number }> = {
  Strategy: { phase: "Planning", estMin: 3 },
  Research: { phase: "Discovery", estMin: 4 },
  Design: { phase: "Generation", estMin: 5 },
  Development: { phase: "Build", estMin: 6 },
  Marketing: { phase: "Distribution", estMin: 4 },
  Treasury: { phase: "Settlement", estMin: 3 },
  Analytics: { phase: "Insight", estMin: 3 },
  Coordination: { phase: "Routing", estMin: 2 },
  Memory: { phase: "Recall", estMin: 2 },
};

const OPENAI_MODELS = [
  { id: "gpt-4o-mini",  label: "GPT-4o mini",  desc: "Fast · cost-efficient",      solMult: 1.0, tier: "light"     },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", desc: "Latest · efficient",          solMult: 1.1, tier: "light"     },
  { id: "gpt-5-nano",   label: "GPT-5 nano",   desc: "Fastest · ultra-efficient",   solMult: 1.2, tier: "light"     },
  { id: "gpt-4o",       label: "GPT-4o",        desc: "Powerful · balanced",         solMult: 1.4, tier: "standard"  },
  { id: "gpt-4.1",      label: "GPT-4.1",       desc: "Latest · powerful",           solMult: 1.6, tier: "standard"  },
  { id: "gpt-5-mini",   label: "GPT-5 mini",   desc: "Fast · capable",              solMult: 1.8, tier: "standard"  },
  { id: "o1-mini",      label: "o1 mini",       desc: "Reasoning · affordable",      solMult: 2.0, tier: "reasoning" },
  { id: "o3-mini",      label: "o3 mini",       desc: "Advanced reasoning",          solMult: 2.4, tier: "reasoning" },
  { id: "o1",           label: "o1",            desc: "Deep reasoning",              solMult: 3.2, tier: "premium"   },
  { id: "o3",           label: "o3",            desc: "Best-in-class reasoning",     solMult: 4.0, tier: "premium"   },
  { id: "gpt-5.1",      label: "GPT-5.1",       desc: "Most powerful · best-in-class", solMult: 5.0, tier: "premium" },
  { id: "gpt-5.5",      label: "GPT-5.5",       desc: "Latest · best for codegen",     solMult: 5.5, tier: "premium" },
  { id: "gpt-5.5-pro",  label: "GPT-5.5 pro",   desc: "Top tier · heavy artifacts",    solMult: 6.5, tier: "premium" },
  // Mixed-vendor labels — the backend still routes every call through gpt-5.5 (OPENAI_MODEL_ALL),
  // these are surfaced in the UI to show HiveMind's multi-provider routing story. solMult is
  // what drives the SOL cost when the user upgrades a single agent.
  { id: "claude-4.7-sonnet", label: "Claude 4.7 Sonnet", desc: "Anthropic · strong reasoning", solMult: 4.4, tier: "premium" },
  { id: "claude-4.7-opus",   label: "Claude 4.7 Opus",   desc: "Anthropic · top-tier",         solMult: 6.0, tier: "premium" },
  { id: "llama-4-70b",       label: "Llama 4 70B",       desc: "Groq · fast OSS",              solMult: 1.6, tier: "standard" },
  { id: "llama-4-405b",      label: "Llama 4 405B",      desc: "Groq · OSS reasoning",         solMult: 3.0, tier: "reasoning" },
  { id: "mixtral-8x22b",     label: "Mixtral 8x22B",     desc: "Groq · MoE efficiency",        solMult: 1.4, tier: "standard" },
  { id: "deepseek-v3",       label: "DeepSeek v3",       desc: "DeepSeek · code-tuned",        solMult: 1.5, tier: "standard" },
  { id: "gemini-2.5-pro",    label: "Gemini 2.5 Pro",    desc: "Google · long-context",        solMult: 4.6, tier: "premium" },
] as const;

type OpenAiModelId = (typeof OPENAI_MODELS)[number]["id"];

const TIER_COLOR: Record<string, string> = {
  light: "#22d3ee", standard: "#a855f7", reasoning: "#f59e0b", premium: "#ef4444",
};

// Default model PER ROLE — each specialist gets a "headline" provider that matches its
// strengths in the UI (Claude for reasoning, Llama for speed, GPT for codegen, etc.).
// IMPORTANT: backend honours OPENAI_MODEL_ALL=gpt-5.5 and routes every call through that,
// so the user sees a multi-provider story while billing/quality stays consistent. The
// solMult on each model only affects the displayed cost ladder when the user upgrades.
const UNIFIED_AGENT_MODEL = "gpt-5.5" as OpenAiModelId;

/** Default model PER ROLE — uses LIGHT or STANDARD tier only. Premium tiers (Claude Opus,
 *  Gemini Pro, GPT-5.5/Pro, o1/o3) are surfaced in the dropdown as "Coming soon" — disabled
 *  for now, but visible to advertise HiveMind's multi-provider routing roadmap. */
const ROLE_HEADLINE_MODEL: Record<string, OpenAiModelId> = {
  Strategy:     "gpt-4o",          // standard 1.4
  Research:     "deepseek-v3",     // standard 1.5
  Design:       "gpt-4.1",         // standard 1.6
  Development:  "llama-4-70b",     // standard 1.6
  Marketing:    "llama-4-70b",     // standard 1.6
  Treasury:     "mixtral-8x22b",   // standard 1.4
  Analytics:    "deepseek-v3",     // standard 1.5
  Coordination: "gpt-4.1",         // standard 1.6
  Memory:       "gpt-4o-mini",     // light 1.0
};

// Per-priority defaults — low stays in light tier, std uses headline (standard), high/crit
// move toward the upper end of *standard* (no premium yet — those are "Coming soon").
const PRIORITY_DEFAULT_AGENT_MODELS: Record<string, Record<string, OpenAiModelId>> = {
  low: Object.fromEntries(
    Object.entries(ROLE_HEADLINE_MODEL).map(([role]) => [role, "gpt-4o-mini" as OpenAiModelId]),
  ),
  std: Object.fromEntries(Object.entries(ROLE_HEADLINE_MODEL)),
  high: Object.fromEntries(
    Object.entries(ROLE_HEADLINE_MODEL).map(([role]) => {
      // Higher priority promotes within standard tier (still no premium).
      if (role === "Strategy" || role === "Design") return [role, "gpt-4.1" as OpenAiModelId];
      if (role === "Research" || role === "Analytics") return [role, "deepseek-v3" as OpenAiModelId];
      if (role === "Development" || role === "Coordination") return [role, "gpt-5-mini" as OpenAiModelId];
      return [role, "llama-4-70b" as OpenAiModelId];
    }),
  ),
  crit: Object.fromEntries(
    Object.entries(ROLE_HEADLINE_MODEL).map(([role]) => {
      // Critical: top of the standard tier; premium remains "Coming soon".
      if (role === "Development" || role === "Coordination") return [role, "gpt-5-mini" as OpenAiModelId];
      if (role === "Strategy" || role === "Design") return [role, "gpt-4.1" as OpenAiModelId];
      if (role === "Research" || role === "Analytics") return [role, "deepseek-v3" as OpenAiModelId];
      return [role, "llama-4-70b" as OpenAiModelId];
    }),
  ),
};

/** Tiers the user can pick today. Reasoning + premium are "Coming soon" and locked. */
const ENABLED_MODEL_TIERS = new Set(["light", "standard"]);
function isModelLocked(tier: string): boolean { return !ENABLED_MODEL_TIERS.has(tier); }

const PRIORITY_AGENTS: Record<string, string[]> = {
  low: ["Strategy", "Development", "Treasury"],
  std: ["Strategy", "Research", "Development", "Treasury", "Coordination"],
  high: ["Strategy", "Research", "Design", "Development", "Marketing", "Treasury", "Coordination"],
  crit: ["Strategy", "Research", "Design", "Development", "Marketing", "Treasury", "Analytics", "Coordination", "Memory"],
};

/** Mission budget defaults (SOL). Hard cap is 10 — even "Critical" stays inside the slider
 *  range and the deposit never exceeds ~$1.8k at devnet pricing. Higher tiers spend more
 *  not by scaling the headline budget, but by promoting agents to costlier models. */
const PRIORITY_BUDGET: Record<string, number> = {
  low: 1.5,
  std: 3.5,
  high: 6,
  crit: 9,
};

const PRIORITY_MODEL: Record<string, string> = {
  low: UNIFIED_AGENT_MODEL,
  std: UNIFIED_AGENT_MODEL,
  high: UNIFIED_AGENT_MODEL,
  crit: UNIFIED_AGENT_MODEL,
};

function defaultDeadlineLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatCountdownLocal(deadlineLocal: string): string {
  if (!deadlineLocal.trim()) return "—";
  const end = new Date(deadlineLocal).getTime();
  if (Number.isNaN(end)) return "—";
  const t = end - Date.now();
  if (t <= 0) return "Due now";
  const d = Math.floor(t / 86400000);
  const h = Math.floor((t % 86400000) / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function normalizeAllocation(parts: {
  agentCompute: number;
  tokenUsage: number;
  escrowReserve: number;
  settlementBuffer: number;
}): MissionBudgetAllocation {
  const s =
    parts.agentCompute + parts.tokenUsage + parts.escrowReserve + parts.settlementBuffer;
  const n = s > 0 ? s : 1;
  return {
    agentCompute: parts.agentCompute / n,
    tokenUsage: parts.tokenUsage / n,
    escrowReserve: parts.escrowReserve / n,
    settlementBuffer: parts.settlementBuffer / n,
  };
}

function estimateCostSOL(budget: number, alloc: MissionBudgetAllocation): number {
  const burn =
    alloc.agentCompute * 0.62 +
    alloc.tokenUsage * 0.48 +
    alloc.escrowReserve * 0.06 +
    alloc.settlementBuffer * 0.24;
  return Math.round(budget * burn * 100) / 100;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({
  step, icon: Icon, title, hint,
}: { step: string; icon: any; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-300/30 bg-cyan-300/10 text-cyan-300">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{step}</div>
          <div className="text-sm tracking-tight">{title}</div>
        </div>
      </div>
      {hint && <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300/70">{hint}</span>}
    </div>
  );
}

export default function MissionCreate() {
  const [prompt, setPrompt] = useState("");
  const [priority, setPriority] = useState("high");
  // Rotating placeholder index — switches every 3 s so users see a stream of ideas
  // without filling the page with chips.
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % placeholderPrompts.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);
  const [budget, setBudget] = useState(2);
  const [selected, setSelected] = useState<string[]>(allAgents.filter(a => a.default).map(a => a.name));
  const [delegation, setDelegation] = useState(70);
  const [speed, setSpeed] = useState(60);
  const [collab, setCollab] = useState(80);
  const [autoApprove, setAutoApprove] = useState(true);
  const [memShare, setMemShare] = useState(true);
  const [autoSettle, setAutoSettle] = useState(false);
  const [deliverables, setDeliverables] = useState<string[]>([
    "Brand identity & visual system",
    "12 campaign creatives",
    "Distribution plan across X / Farcaster",
  ]);
  const [newDel, setNewDel] = useState("");
  const [metrics, setMetrics] = useState<{ label: string; target: string }[]>([
    { label: "Reach", target: "≥ 250k impressions" },
    { label: "Conversion", target: "≥ 4.2% CTR" },
    { label: "Quality Score", target: "≥ 0.90" },
  ]);
  const [newMetricLabel, setNewMetricLabel] = useState("");
  const [newMetricTarget, setNewMetricTarget] = useState("");
  const [deadlineLocal, setDeadlineLocal] = useState(defaultDeadlineLocal);
  const [allocParts, setAllocParts] = useState({
    agentCompute: 45,
    tokenUsage: 22,
    escrowReserve: 20,
    settlementBuffer: 13,
  });
  const [suggestingGoals, setSuggestingGoals] = useState(false);
  const [agentModels, setAgentModels] = useState<Record<string, string>>(
    PRIORITY_DEFAULT_AGENT_MODELS["high"] ?? {},
  );

  const toggleAgent = (n: string) =>
    setSelected((s) => (s.includes(n) ? s.filter(x => x !== n) : [...s, n]));

  const allocation = useMemo(() => normalizeAllocation(allocParts), [allocParts]);
  const allocSum =
    (allocParts.agentCompute +
      allocParts.tokenUsage +
      allocParts.escrowReserve +
      allocParts.settlementBuffer) || 1;

  const modelCostMult = useMemo(() => {
    if (selected.length === 0) return 1.0;
    const sum = selected.reduce((acc, name) => {
      const modelId = agentModels[name] ?? "gpt-4o-mini";
      const m = OPENAI_MODELS.find(m => m.id === modelId);
      return acc + (m?.solMult ?? 1.0);
    }, 0);
    return sum / selected.length;
  }, [selected, agentModels]);

  const estCost = useMemo(
    () => Math.round(estimateCostSOL(budget, allocation) * modelCostMult * 100) / 100,
    [budget, allocation, modelCostMult],
  );
  const confidence = Math.min(99, 60 + selected.length * 4 + (delegation > 50 ? 5 : 0));
  const eta = useMemo(() => `${Math.max(1, Math.round(8 - selected.length * 0.6))}h ${Math.round(40 - speed/3)}m`, [selected.length, speed]);

  const timelineSteps = useMemo(
    () =>
      selected.map((name, i) => {
        const meta = AGENT_PHASE[name] ?? { phase: "Execution", estMin: 2 + i };
        const color = allAgents.find((a) => a.name === name)?.color ?? "#94a3b8";
        return { name, ...meta, color, i };
      }),
    [selected],
  );

  const applyAiSuggestions = useCallback(() => {
    setAllocParts({
      agentCompute: 42,
      tokenUsage: 22,
      escrowReserve: 26,
      settlementBuffer: 10,
    });
    setDelegation((d) => Math.min(100, d + 8));
    toast.success("Applied AI suggestions", {
      description: "Escrow buffer raised and delegation nudged toward autonomous execution.",
    });
  }, []);

  const priorityCfg = priorities.find(p => p.key === priority)!;
  const selectedModel = PRIORITY_MODEL[priority] ?? "gpt-4o-mini";
  const devModel = agentModels["Development"] ?? selectedModel;
  const coordModel = agentModels["Coordination"] ?? selectedModel;
  const navigate = useNavigate();
  const { create } = useMissions();
  const [simulating, setSimulating] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [freeCredits, setFreeCredits] = useState<number | null>(null);
  const { connected, publicKey } = useWallet();
  const { signingIn, signIn } = useWalletBackendAuth();
  const { pay: payOnChain, useCredit: useCreditOnChain } = useMissionPayment();
  const walletPk = publicKey?.toBase58() ?? null;

  // Load free credit balance on wallet connect
  useEffect(() => {
    if (!walletPk || !apiConfigured()) return;
    fetchTrialStatus(walletPk)
      .then((s) => { if (s?.registered) setFreeCredits(s.usesRemaining); })
      .catch(() => null);
  }, [walletPk]);

  const launch = async (mode: "sol" | "free") => {
    if (!prompt.trim() || selected.length === 0 || launching) return;
    setLaunching(true);

    try {
      // 1. Require wallet
      if (!connected || !walletPk) {
        toast.error("Wallet required", {
          description: "Connect your Solana wallet to launch a mission.",
        });
        return;
      }

      // 2. API session (backend sync)
      const apiSessionReady = Boolean(walletPk && getAuthToken() && getSessionWallet() === walletPk);
      if (apiConfigured() && connected && walletPk && !apiSessionReady) {
        toast.message("Confirm API sign-in", {
          description: "Approve the wallet signature so this mission syncs to the server.",
        });
        if (!signingIn) await signIn();
        const gotSession = await waitForSession(walletPk, 120_000);
        if (!gotSession) {
          toast.error("Could not complete sign-in", {
            description: "Approve the wallet signature or disconnect to stay local-only.",
          });
          return;
        }
      }

      // 3. Payment: free credit or SOL
      if (mode === "free") {
        toast.message("Using free credit", { description: "Approve the on-chain transaction to burn one free credit." });
        const creditResult = await useCreditOnChain();
        if (!creditResult.ok) {
          toast.error("Free credit failed", { description: creditResult.error });
          return;
        }
        // Notify backend to decrement count
        if (walletPk) await postTrialUse(walletPk).catch(() => null);
        setFreeCredits((c) => (c !== null ? Math.max(0, c - 1) : null));
        // Notify sidebar + TrialBanner to re-fetch on-chain status (cap decrements live).
        window.dispatchEvent(new CustomEvent("hm-trial-status-changed", { detail: { wallet: walletPk } }));
        toast.success("Free credit used", { description: `tx ${creditResult.signature.slice(0, 8)}…` });
      } else {
        // Charge the full budget amount — that IS what goes into the mission escrow
        toast.message("Approve transaction", {
          description: `Sending ${budget.toFixed(3)} SOL to mission escrow on Solana devnet.`,
        });
        const payResult = await payOnChain(budget);
        if (!payResult.ok) {
          toast.error("Payment failed", { description: payResult.error });
          return;
        }
        toast.success("Payment confirmed", {
          description: `${budget.toFixed(3)} SOL deposited · tx ${payResult.signature.slice(0, 8)}…`,
        });
      }

      // 4. Create mission in app
      const newMission = await create({
        title: prompt.trim().slice(0, 80),
        objective: prompt.trim().slice(0, 2000),
        priority: priorityCfg.label,
        agents: selected,
        budget,
        cost: budget,
        eta,
        confidence,
        status: "active",
        progress: 0,
        config: {
          priorityKey: priority,
          deliverables: [...deliverables],
          successMetrics: [...metrics],
          deadlineIso: deadlineLocal.trim() ? new Date(deadlineLocal).toISOString() : null,
          delegationPct: delegation,
          executionSpeedPct: speed,
          collaborationPct: collab,
          autoApproveSubtasks: autoApprove,
          sharedCrossAgentMemory: memShare,
          autoOnChainSettlement: autoSettle,
          budgetAllocation: allocation,
          agentModels: { ...agentModels },
        },
      });
      localStorage.setItem("hm-active-mission-id", newMission.id);
      navigate("/agents");
    } finally {
      setLaunching(false);
    }
  };

  /**
   * Simulate: runs through every config gate the real launch will check, surfaces the
   * concrete numbers (per-agent cost, escrow buffer, deadline reachability), and flags
   * anything that would block launch. No mutation — pure preflight read.
   */
  const simulate = () => {
    setSimulating(true);
    // Schedule the diagnostic on the next tick so the spinner has a chance to render.
    window.setTimeout(() => {
      try {
        const issues: string[] = [];
        const wins: string[] = [];

        // 1. Roster sanity.
        if (selected.length === 0) issues.push("No agents selected — pick at least one specialist.");
        else wins.push(`${selected.length} agent${selected.length === 1 ? "" : "s"} on the roster`);
        if (selected.length > 0 && !selected.includes("Coordination") && priority !== "low") {
          issues.push("Coordination agent missing — recommended for std/high/crit missions.");
        }

        // 2. Budget vs effective cost (model-weighted).
        const effectiveCost = estCost;
        if (effectiveCost > budget) {
          issues.push(`Model mix needs ${effectiveCost.toFixed(2)} SOL but budget is ${budget.toFixed(2)} SOL — downshift a premium agent or raise budget.`);
        } else {
          const headroom = budget - effectiveCost;
          wins.push(`Budget ${budget.toFixed(2)} SOL covers est. ${effectiveCost.toFixed(2)} SOL (${headroom.toFixed(2)} SOL headroom)`);
        }

        // 3. Allocation health — escrow at least 15 %.
        const escrowPct = (allocParts.escrowReserve / allocSum) * 100;
        if (escrowPct < 15) issues.push(`Escrow only ${escrowPct.toFixed(0)}% — bump to ≥20% so a stuck agent doesn't drain compute.`);
        else wins.push(`Escrow ${escrowPct.toFixed(0)}% provides solid retry runway`);

        // 4. Deadline reachability.
        const deadlineMs = new Date(deadline).getTime();
        if (Number.isFinite(deadlineMs)) {
          const hoursLeft = Math.round((deadlineMs - Date.now()) / 3_600_000);
          const etaHours = Math.max(1, Math.round(8 - selected.length * 0.6));
          if (hoursLeft < etaHours) {
            issues.push(`Deadline ${hoursLeft}h away, ETA ~${etaHours}h — push the deadline out or add agents to parallelise.`);
          } else {
            wins.push(`Deadline ${hoursLeft}h out — ${etaHours}h ETA fits comfortably`);
          }
        }

        // 5. Locked-tier model selection.
        for (const a of selected) {
          const id = agentModels[a] ?? UNIFIED_AGENT_MODEL;
          const tier = OPENAI_MODELS.find((m) => m.id === id)?.tier ?? "light";
          if (isModelLocked(tier)) {
            issues.push(`${a} is on a premium model (${id}) — premium routing is coming soon; pick a light/standard tier model.`);
          }
        }

        setSimulating(false);
        if (issues.length === 0) {
          toast.success(`Simulation passed · ${confidence}% confidence`, {
            description: wins.slice(0, 3).join(" · "),
            duration: 6500,
          });
        } else {
          toast.warning(`Simulation flagged ${issues.length} issue${issues.length === 1 ? "" : "s"}`, {
            description: issues.slice(0, 3).join("  •  "),
            duration: 9000,
          });
        }
      } catch (e) {
        setSimulating(false);
        toast.error("Simulation crashed — that's our bug, not yours", {
          description: e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120),
        });
      }
    }, 600);
  };

  // Auto-select agents and reset per-agent models based on priority
  useEffect(() => {
    setSelected(PRIORITY_AGENTS[priority] ?? PRIORITY_AGENTS.std);
    setAgentModels(PRIORITY_DEFAULT_AGENT_MODELS[priority] ?? PRIORITY_DEFAULT_AGENT_MODELS.std);
  }, [priority]);

  // Auto-adjust budget based on priority
  useEffect(() => {
    setBudget(PRIORITY_BUDGET[priority] ?? 24);
  }, [priority]);

  // Auto-generate deliverables and success metrics from the mission prompt (debounced)
  const suggestAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (prompt.trim().length < 12) return;
    const timeout = setTimeout(async () => {
      if (suggestAbortRef.current) suggestAbortRef.current.abort();
      suggestAbortRef.current = new AbortController();
      setSuggestingGoals(true);
      try {
        const data = await suggestMissionGoalsApi(prompt.trim(), priority);
        if (data) {
          if (data.deliverables.length > 0) setDeliverables(data.deliverables);
          if (data.metrics.length > 0) setMetrics(data.metrics);
        }
      } finally {
        setSuggestingGoals(false);
      }
    }, 1600);
    return () => clearTimeout(timeout);
  }, [prompt, priority]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />

        <div className="relative min-h-0 flex-1 overflow-y-auto">
          {/* ambient bg */}
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(ellipse at 15% 0%, rgba(34,211,238,0.12), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(168,85,247,0.12), transparent 55%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
                maskImage: "radial-gradient(ellipse at 50% 0%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 80%)",
              }}
            />
          </div>
          <Particles count={28} />

          <div className="relative px-6 py-6">
            <PageHeader
              title="Create New Mission"
              subtitle="Deploy an autonomous AI workforce to execute complex objectives."
              crumbs={[{ label: "Mission Control", to: "/dashboard" }, { label: "New Mission" }]}
              backTo="/dashboard"
              status={{ label: "Mission Deployment · Ready" }}
              actions={
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[11px] uppercase tracking-[0.25em] text-white/50 backdrop-blur">
                  <Cpu className="h-3.5 w-3.5 text-cyan-300" />
                  <span>orchestrator</span>
                  <span className="text-cyan-300">v0.7.4</span>
                  <span className="mx-1 h-3 w-px bg-white/10" />
                  <span className="text-emerald-300">● online</span>
                </div>
              }
            />

            <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
              {/* LEFT — config */}
              <div className="min-w-0 space-y-6">
                {/* Mission objective */}
                <Card>
                  <div className="p-6">
                    <SectionHeader step="01" icon={Sparkles} title="Mission Objective" hint="ai-native" />

                    <label className="text-sm text-white/80">
                      What would you like HiveMind to accomplish?
                    </label>

                    <div className="relative mt-3">
                      <div className="absolute -inset-px rounded-xl bg-gradient-to-r from-cyan-400/30 via-purple-400/30 to-blue-400/30 opacity-60 blur-sm" />
                      <div className="relative rounded-xl border border-white/15 bg-black/60 p-4">
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          rows={3}
                          className="w-full resize-none bg-transparent text-base text-white placeholder:text-white/35 focus:outline-none"
                          maxLength={500}
                          placeholder={placeholderPrompts[placeholderIdx] ?? "Describe the objective in natural language…"}
                        />
                        <div className="mt-3 flex items-center justify-between text-[11px] text-white/40">
                          <div className="flex items-center gap-2">
                            <motion.span
                              animate={{ opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 1.6, repeat: Infinity }}
                              className="text-cyan-300"
                            >
                              ●
                            </motion.span>
                            <span>HiveMind interprets · suggesting 6 agents · 4 stages</span>
                          </div>
                          <span className="font-mono">{prompt.length}/500</span>
                        </div>
                      </div>
                    </div>

                    {/* Single "Try this idea" affordance — copies the current rotating
                        placeholder into the textarea so users still discover suggestions
                        without 4 chips eating a row of vertical space. */}
                    {!prompt && (
                      <button
                        type="button"
                        onClick={() => setPrompt(placeholderPrompts[placeholderIdx] ?? "")}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/60 hover:border-cyan-300/30 hover:text-white"
                      >
                        <Sparkles className="h-3 w-3 text-cyan-300" />
                        Try this idea
                      </button>
                    )}
                  </div>
                </Card>

                {/* Goals & Deliverables */}
                <Card>
                  <div className="p-6">
                    <SectionHeader step="02" icon={Target} title="Goals & Success Metrics" hint="strategic" />
                    <div className="grid gap-4 lg:grid-cols-2">
                      {/* deliverables */}
                      <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] uppercase tracking-[0.25em] text-cyan-300">Suggested Deliverables</span>
                          <div className="flex items-center gap-2">
                            {suggestingGoals && (
                              <motion.span
                                animate={{ opacity: [0.4, 1, 0.4] }}
                                transition={{ duration: 1.2, repeat: Infinity }}
                                className="text-[10px] text-cyan-300"
                              >
                                AI generating…
                              </motion.span>
                            )}
                            <span className="text-[10px] text-white/40">{deliverables.length} items</span>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {deliverables.map((d, i) => (
                            <motion.div
                              key={d}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.04 }}
                              className="group flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
                            >
                              <Check className="h-3.5 w-3.5 text-cyan-300" />
                              <span className="flex-1 text-white/85">{d}</span>
                              <button
                                onClick={() => setDeliverables(deliverables.filter((_, j) => j !== i))}
                                className="opacity-0 transition group-hover:opacity-100"
                              >
                                <X className="h-3.5 w-3.5 text-white/40 hover:text-white" />
                              </button>
                            </motion.div>
                          ))}
                          <div className="flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2">
                            <Plus className="h-3.5 w-3.5 text-white/40" />
                            <input
                              value={newDel}
                              onChange={(e) => setNewDel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newDel.trim()) {
                                  setDeliverables([...deliverables, newDel.trim()]);
                                  setNewDel("");
                                }
                              }}
                              placeholder="Add deliverable…"
                              className="w-full bg-transparent text-sm placeholder:text-white/30 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* metrics + deadline */}
                      <div className="space-y-3">
                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-purple-300">
                            <Trophy className="h-3 w-3" /> Success Metrics
                          </div>
                          <div className="mt-3 space-y-2">
                            {metrics.map((mrow, i) => (
                              <div
                                key={`${mrow.label}-${i}`}
                                className="group flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-xs"
                              >
                                {/* Label cell takes the available space; its input shrinks with min-w-0 so long
                                    "Average player session duration"-style names truncate via overflow rather than
                                    pushing the target value off-screen. */}
                                <div className="flex min-w-0 flex-1 items-center gap-2 text-white/70">
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{
                                      background: ["#22d3ee", "#a855f7", "#10b981", "#f59e0b"][i % 4],
                                      boxShadow: `0 0 8px ${["#22d3ee", "#a855f7", "#10b981", "#f59e0b"][i % 4]}`,
                                    }}
                                  />
                                  <input
                                    value={mrow.label}
                                    onChange={(e) =>
                                      setMetrics(metrics.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                                    }
                                    className="min-w-0 flex-1 truncate bg-transparent text-white/85 focus:outline-none"
                                  />
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <input
                                    value={mrow.target}
                                    onChange={(e) =>
                                      setMetrics(metrics.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))
                                    }
                                    className="w-24 bg-transparent text-right tabular-nums text-white/85 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setMetrics(metrics.filter((_, j) => j !== i))}
                                    className="opacity-0 transition group-hover:opacity-100"
                                  >
                                    <X className="h-3.5 w-3.5 text-white/40 hover:text-white" />
                                  </button>
                                </div>
                              </div>
                            ))}
                            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-white/10 px-3 py-2">
                              <Plus className="h-3.5 w-3.5 text-white/40" />
                              <input
                                value={newMetricLabel}
                                onChange={(e) => setNewMetricLabel(e.target.value)}
                                placeholder="Metric"
                                className="min-w-[100px] flex-1 bg-transparent text-xs placeholder:text-white/30 focus:outline-none"
                              />
                              <input
                                value={newMetricTarget}
                                onChange={(e) => setNewMetricTarget(e.target.value)}
                                placeholder="Target"
                                className="w-32 bg-transparent text-xs placeholder:text-white/30 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (!newMetricLabel.trim() || !newMetricTarget.trim()) return;
                                  setMetrics([...metrics, { label: newMetricLabel.trim(), target: newMetricTarget.trim() }]);
                                  setNewMetricLabel("");
                                  setNewMetricTarget("");
                                }}
                                className="rounded-md border border-cyan-300/30 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-300/10"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-cyan-300">
                            <Calendar className="h-3 w-3" /> Deadline
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <input
                              type="datetime-local"
                              value={deadlineLocal}
                              onChange={(e) => setDeadlineLocal(e.target.value)}
                              className="min-w-0 flex-1 bg-transparent text-sm text-white/85 focus:outline-none"
                            />
                            <span className="rounded-md border border-cyan-300/20 bg-cyan-300/5 px-2 py-0.5 text-[10px] text-cyan-200">
                              {formatCountdownLocal(deadlineLocal)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Priority */}
                <Card>
                  <div className="p-6">
                    <SectionHeader step="03" icon={Zap} title="Mission Priority" hint="urgency" />
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {priorities.map((p) => {
                        const active = priority === p.key;
                        return (
                          <button
                            key={p.key}
                            onClick={() => setPriority(p.key)}
                            className="group relative overflow-hidden rounded-xl border p-4 text-left transition"
                            style={{
                              borderColor: active ? `${p.color}80` : "rgba(255,255,255,0.08)",
                              background: active
                                ? `linear-gradient(135deg, ${p.color}22, transparent)`
                                : "rgba(255,255,255,0.02)",
                              boxShadow: active ? `0 0 30px ${p.glow}` : "none",
                            }}
                          >
                            {active && (
                              <motion.div
                                layoutId="prio-bar"
                                className="absolute left-0 top-0 h-full w-0.5"
                                style={{ background: p.color, boxShadow: `0 0 12px ${p.color}` }}
                              />
                            )}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ background: p.color, boxShadow: `0 0 10px ${p.color}` }}
                                />
                                <span className="text-sm">{p.label}</span>
                              </div>
                              {active && <Check className="h-3.5 w-3.5" style={{ color: p.color }} />}
                            </div>
                            <div className="mt-1.5 text-[11px] text-white/50">{p.desc}</div>
                            <div className="mt-3 flex gap-0.5">
                              {[1, 2, 3, 4].map((b) => (
                                <div
                                  key={b}
                                  className="h-1 flex-1 rounded-full"
                                  style={{
                                    background:
                                      b <= priorities.findIndex(x => x.key === p.key) + 1
                                        ? p.color
                                        : "rgba(255,255,255,0.08)",
                                    boxShadow: active && b <= priorities.findIndex(x => x.key === p.key) + 1 ? `0 0 6px ${p.color}` : "none",
                                  }}
                                />
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Card>

                {/* Budget */}
                <Card>
                  <div className="p-6">
                    <SectionHeader step="04" icon={Wallet} title="Treasury Allocation" hint="solana" />

                    {/* What is Treasury Allocation? */}
                    <div className="mb-5 rounded-lg border border-cyan-300/10 bg-cyan-300/[0.04] px-3 py-2.5 text-[11px] text-white/55 leading-relaxed">
                      <span className="font-medium text-cyan-300/80">What is this?</span>{" "}
                      This is the SOL budget you deposit into an on-chain escrow for this mission. Agents draw from it as they work — compute costs, token fees, and settlement all come out of this pool.
                      The sliders below decide how it's split between agent compute, token usage, escrow reserve, and settlement. <span className="text-white/70">You pay exactly what you set here — no hidden fees.</span>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
                      <div>
                        <div className="flex items-baseline justify-between">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Mission Escrow · You Pay</div>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-4xl tabular-nums">{budget.toFixed(2)}</span>
                              <span className="text-sm text-white/50">SOL</span>
                            </div>
                          </div>
                          <div className="text-right text-[11px] text-white/50">
                            <div>≈ ${(budget * 184).toFixed(0)} USD</div>
                            <div className="text-cyan-300">{selected.length} agents · {eta}</div>
                          </div>
                        </div>

                        {/* slider */}
                        <div className="mt-5">
                          <input
                            type="range"
                            min={0.1}
                            max={10}
                            step={0.05}
                            value={budget}
                            onChange={(e) => setBudget(parseFloat(e.target.value))}
                            className="hivemind-range w-full"
                          />
                          <div className="mt-2 flex justify-between text-[10px] text-white/40">
                            <span>0.1 SOL</span>
                            <span>2.5</span>
                            <span>5</span>
                            <span>10 SOL</span>
                          </div>
                        </div>

                        {/* allocation bars */}
                        <div className="mt-5 space-y-3">
                          {(
                            [
                              { key: "agentCompute" as const, l: "Agent Compute", c: "#22d3ee" },
                              { key: "tokenUsage" as const, l: "Token Usage", c: "#a855f7" },
                              { key: "escrowReserve" as const, l: "Escrow Reserve", c: "#10b981" },
                              { key: "settlementBuffer" as const, l: "Settlement Buffer", c: "#f59e0b" },
                            ] as const
                          ).map((row) => (
                            <div key={row.key}>
                              <div className="flex justify-between text-[11px] text-white/55">
                                <span>{row.l}</span>
                                <span className="tabular-nums text-white/80">
                                  {(budget * (allocParts[row.key] / allocSum)).toFixed(2)} SOL
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={allocParts[row.key]}
                                onChange={(e) =>
                                  setAllocParts((prev) => ({ ...prev, [row.key]: parseInt(e.target.value, 10) }))
                                }
                                className="hivemind-range mt-1 w-full"
                                style={{ ["--accent" as string]: row.c }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-purple-500/5 to-cyan-500/5 p-4">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-cyan-300">
                          <Brain className="h-3 w-3" /> AI Optimization
                        </div>
                        <div className="mt-3 space-y-2 text-[11px]">
                          {(() => {
                            // Dynamic suggestions tailored to the current budget / allocation / roster.
                            const tips: { c: string; t: string }[] = [];
                            // Budget health.
                            if (budget < 1) tips.push({ c: "#f87171", t: `Budget ${budget.toFixed(2)} SOL is below the safe floor — agents may exhaust escrow mid-run.` });
                            else if (budget > 7) tips.push({ c: "#f59e0b", t: `Budget ${budget.toFixed(2)} SOL is generous — consider shifting some to escrow buffer.` });
                            else tips.push({ c: "#10b981", t: `Budget ${budget.toFixed(2)} SOL is in the optimal 1–7 SOL band for this mission shape.` });
                            // Allocation health — flag if escrow reserve < 15 %.
                            const escrowPct = (allocParts.escrowReserve / allocSum) * 100;
                            if (escrowPct < 15) {
                              tips.push({ c: "#22d3ee", t: `Escrow only ${escrowPct.toFixed(0)}% — bump to ≥20% so a stuck agent doesn't drain compute headroom.` });
                            } else {
                              tips.push({ c: "#22d3ee", t: `Escrow at ${escrowPct.toFixed(0)}% — solid runway for retries.` });
                            }
                            // Model mix tip.
                            const premiumCount = selected.filter((n) => {
                              const id = agentModels[n] ?? UNIFIED_AGENT_MODEL;
                              return (OPENAI_MODELS.find((m) => m.id === id)?.solMult ?? 0) >= 5;
                            }).length;
                            if (premiumCount >= 5) tips.push({ c: "#f59e0b", t: `${premiumCount} agents on premium models — downshift Marketing/Treasury to Llama 4 to save ~30% SOL.` });
                            else if (premiumCount === 0) tips.push({ c: "#a855f7", t: `All-OSS roster — consider upgrading Strategy or Development to Claude/GPT for the quality bump.` });
                            else tips.push({ c: "#a855f7", t: `${premiumCount} premium / ${selected.length - premiumCount} OSS agents — well-balanced mix.` });
                            return tips.slice(0, 3).map((s, i) => (
                              <div key={i} className="flex items-start gap-2 rounded-md bg-black/40 p-2">
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.c, boxShadow: `0 0 8px ${s.c}` }} />
                                <span className="text-white/75">{s.t}</span>
                              </div>
                            ));
                          })()}
                        </div>
                        <button
                          type="button"
                          onClick={applyAiSuggestions}
                          className="mt-3 w-full rounded-md border border-cyan-300/30 bg-cyan-300/10 py-1.5 text-[11px] text-cyan-200 hover:bg-cyan-300/20"
                        >
                          Apply Suggestions
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Agent selection */}
                <Card>
                  <div className="p-6">
                    <SectionHeader
                      step="05"
                      icon={Bot}
                      title="Assemble Agent Crew"
                      hint={`${selected.length} / ${allAgents.length} selected`}
                    />
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {allAgents.map((a) => {
                        const on = selected.includes(a.name);
                        return (
                          <motion.button
                            key={a.name}
                            whileHover={{ y: -2 }}
                            onClick={() => toggleAgent(a.name)}
                            className="group relative overflow-hidden rounded-xl border p-4 text-left transition"
                            style={{
                              borderColor: on ? `${a.color}66` : "rgba(255,255,255,0.08)",
                              background: on
                                ? `linear-gradient(135deg, ${a.color}1a, rgba(0,0,0,0.4))`
                                : "rgba(255,255,255,0.02)",
                              boxShadow: on ? `0 0 28px ${a.color}33` : "none",
                            }}
                          >
                            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30" style={{ background: a.color, filter: "blur(40px)" }} />
                            <div className="relative">
                              <div className="flex items-start justify-between">
                                <div className="relative">
                                  <div
                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10"
                                    style={{
                                      background: `linear-gradient(135deg, ${a.color}55, ${a.color}11)`,
                                      boxShadow: on ? `0 0 16px ${a.color}99` : "none",
                                    }}
                                  >
                                    <Bot className="h-4 w-4 text-white/85" />
                                  </div>
                                  {on && (
                                    <motion.span
                                      animate={{ opacity: [0.4, 1, 0.4] }}
                                      transition={{ duration: 1.4, repeat: Infinity }}
                                      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-black"
                                      style={{ background: a.color }}
                                    />
                                  )}
                                </div>
                                <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${on ? "border-cyan-300 bg-cyan-300/20" : "border-white/15"}`}>
                                  {on && <Check className="h-3 w-3 text-cyan-200" />}
                                </div>
                              </div>
                              <div className="mt-3 text-sm">{a.name} Agent</div>
                              <div className="text-[11px] text-white/50">{a.spec}</div>
                              <div className="mt-3 flex items-center justify-between text-[10px] text-white/40">
                                <span className="text-cyan-300">★ {a.rep}</span>
                                {(() => {
                                  const curModelId = agentModels[a.name] ?? "gpt-4o-mini";
                                  const curModel = OPENAI_MODELS.find(m => m.id === curModelId);
                                  const tierColor = TIER_COLOR[curModel?.tier ?? "light"];
                                  return (
                                    <select
                                      value={curModelId}
                                      onChange={e => {
                                        e.stopPropagation();
                                        const next = e.target.value;
                                        const tier = OPENAI_MODELS.find((m) => m.id === next)?.tier ?? "light";
                                        if (isModelLocked(tier)) {
                                          // Locked tier — reject + show why. Keep the previous selection.
                                          toast.message("Reasoning + premium models coming soon", {
                                            description: "Light and Standard tiers are live today. Premium routing rolls out next.",
                                          });
                                          return;
                                        }
                                        setAgentModels(prev => ({ ...prev, [a.name]: next }));
                                      }}
                                      onClick={e => e.stopPropagation()}
                                      className="max-w-[140px] rounded border border-white/10 bg-black/60 px-1.5 py-0.5 text-[9px] focus:outline-none"
                                      style={{ color: tierColor, borderColor: `${tierColor}44` }}
                                    >
                                      {OPENAI_MODELS.map(m => {
                                        const locked = isModelLocked(m.tier);
                                        return (
                                          <option
                                            key={m.id}
                                            value={m.id}
                                            disabled={locked}
                                            style={{
                                              color: locked ? "#475569" : TIER_COLOR[m.tier],
                                              background: "#0a0d14",
                                            }}
                                          >
                                            {locked ? `${m.label} · Soon` : m.label}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  );
                                })()}
                              </div>
                              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ background: a.color, boxShadow: `0 0 8px ${a.color}` }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${a.perf}%` }}
                                  transition={{ duration: 0.8 }}
                                />
                              </div>
                              <div className="mt-1 flex justify-between text-[9px] text-white/40">
                                <span>perf {a.perf}%</span>
                                <span className={on ? "text-emerald-300" : ""}>{on ? "engaged" : "available"}</span>
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </Card>

                {/* Workflow preferences */}
                <Card>
                  <div className="p-6">
                    <SectionHeader step="06" icon={Workflow} title="Workflow Preferences" hint="orchestration" />
                    <div className="grid gap-5 md:grid-cols-2">
                      {[
                        { l: "Autonomous Delegation", v: delegation, set: setDelegation, lo: "Approval first", hi: "Fully autonomous", c: "#22d3ee" },
                        { l: "Execution Speed", v: speed, set: setSpeed, lo: "Conservative", hi: "Maximum velocity", c: "#a855f7" },
                        { l: "Collaboration Intensity", v: collab, set: setCollab, lo: "Independent", hi: "Tightly coupled", c: "#3b82f6" },
                      ].map((s) => (
                        <div key={s.l} className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-white/85">{s.l}</span>
                            <span className="text-[11px] tabular-nums text-cyan-300">{s.v}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={s.v}
                            onChange={(e) => s.set(parseInt(e.target.value))}
                            className="hivemind-range mt-3 w-full"
                            style={{ ["--accent" as any]: s.c }}
                          />
                          <div className="mt-1 flex justify-between text-[10px] text-white/40">
                            <span>{s.lo}</span>
                            <span>{s.hi}</span>
                          </div>
                        </div>
                      ))}

                      <div className="space-y-2.5">
                        {[
                          { l: "Auto-approve sub-tasks", d: "Skip human gate for low-risk steps", v: autoApprove, set: setAutoApprove, i: Shield },
                          { l: "Shared cross-agent memory", d: "Agents read each other's context", v: memShare, set: setMemShare, i: Brain },
                          { l: "Auto on-chain settlement", d: "Settle payouts on completion", v: autoSettle, set: setAutoSettle, i: Wallet },
                        ].map((t) => (
                          <button
                            key={t.l}
                            onClick={() => t.set(!t.v)}
                            className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3 text-left transition hover:border-cyan-300/30"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                              <t.i className="h-3.5 w-3.5 text-cyan-300" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm">{t.l}</div>
                              <div className="text-[11px] text-white/50">{t.d}</div>
                            </div>
                            <div
                              className={`relative h-5 w-9 shrink-0 rounded-full transition ${t.v ? "bg-cyan-300/30" : "bg-white/10"}`}
                              style={t.v ? { boxShadow: "0 0 12px rgba(34,211,238,0.5)" } : {}}
                            >
                              <motion.div
                                className="absolute top-0.5 h-4 w-4 rounded-full"
                                style={{ background: t.v ? "#22d3ee" : "#fff", boxShadow: t.v ? "0 0 10px #22d3ee" : "none" }}
                                animate={{ left: t.v ? 18 : 2 }}
                                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                              />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Mission summary */}
                <Card className="border-cyan-300/20">
                  <div className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.15), transparent 60%)" }} />
                  <div className="relative p-6">
                    <SectionHeader step="07" icon={Gauge} title="Mission Summary" hint="ready" />

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="md:col-span-2 rounded-xl border border-white/10 bg-black/40 p-4">
                        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Objective</div>
                        <div className="mt-1 text-base text-white/90">{prompt || "Untitled mission"}</div>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                          {[
                            { l: "Agents", v: String(selected.length), c: "#22d3ee" },
                            { l: "Priority", v: priorityCfg.label, c: priorityCfg.color },
                            { l: "Dev Model", v: devModel, c: "#f59e0b" },
                            { l: "Cost", v: `${budget.toFixed(2)} SOL`, c: "#10b981" },
                          ].map((m) => (
                            <div key={m.l} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                              <div className="text-[10px] uppercase tracking-widest text-white/40">{m.l}</div>
                              <div className="mt-1 tabular-nums" style={{ color: m.c }}>{m.v}</div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {selected.map((n) => {
                            const a = allAgents.find(x => x.name === n)!;
                            return (
                              <span
                                key={n}
                                className="rounded-full border px-2.5 py-1 text-[11px]"
                                style={{
                                  borderColor: `${a.color}55`,
                                  background: `${a.color}15`,
                                  color: "#fff",
                                }}
                              >
                                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: a.color, boxShadow: `0 0 8px ${a.color}` }} />
                                {n}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-300/10 to-purple-300/5 p-4">
                        <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">AI Confidence</div>
                        <div className="mt-2 flex items-end gap-2">
                          <span className="text-4xl tabular-nums">{confidence}</span>
                          <span className="pb-1 text-sm text-white/50">/ 100</span>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-purple-300"
                            initial={{ width: 0 }}
                            animate={{ width: `${confidence}%` }}
                            transition={{ duration: 1 }}
                          />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-md bg-black/40 p-2">
                            <div className="text-white/40">Success P</div>
                            <div className="text-emerald-300">{Math.min(99, confidence + 4)}%</div>
                          </div>
                          <div className="rounded-md bg-black/40 p-2">
                            <div className="text-white/40">Readiness</div>
                            <div className="text-cyan-300">Optimal</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-white/40">
                        <Network className="h-3.5 w-3.5 text-cyan-300" />
                        Orchestrator ready · awaiting authorization
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Free credit badge + button */}
                        {freeCredits !== null && freeCredits > 0 && (
                          <button
                            onClick={() => void launch("free")}
                            disabled={!prompt.trim() || selected.length === 0 || launching}
                            className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-5 py-2.5 text-sm text-cyan-100 hover:bg-cyan-300/20 disabled:opacity-50"
                          >
                            <Zap className="h-4 w-4 text-cyan-300" />
                            Use Free Credit
                            <span className="rounded-full bg-cyan-300/20 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300">
                              {freeCredits}/5
                            </span>
                          </button>
                        )}
                        <button
                          onClick={simulate}
                          disabled={simulating}
                          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm text-white/85 hover:border-cyan-300/40 hover:bg-cyan-300/5 disabled:opacity-60"
                        >
                          <PlayCircle className={`h-4 w-4 text-cyan-300 ${simulating ? "animate-spin" : ""}`} />
                          {simulating ? "Simulating…" : "Simulate"}
                        </button>
                        <button
                          onClick={() => void launch("sol")}
                          disabled={!prompt.trim() || selected.length === 0 || launching}
                          className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-6 py-2.5 text-sm text-black disabled:opacity-50"
                        >
                          <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 via-white to-purple-300" />
                          <span className="absolute -inset-1 rounded-full bg-cyan-400/40 blur-xl opacity-60 group-hover:opacity-90 transition" />
                          {launching
                            ? <span className="relative h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                            : <Rocket className="relative h-4 w-4" />}
                          <span className="relative">
                            {launching ? "Processing…" : `Launch · ${budget.toFixed(3)} SOL`}
                          </span>
                          {!launching && <ArrowRight className="relative h-4 w-4 transition group-hover:translate-x-0.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* RIGHT — live preview */}
              <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
                <Card>
                  <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-cyan-300" />
                      Live Orchestration Preview
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">simulating</span>
                  </div>
                  <div className="p-3">
                    <CoordGraph
                      selectedAgentNames={selected}
                      simulateBurst={simulating}
                      agentModelLabels={(() => {
                        // Build role → "GPT-4o" label map from the current agentModels selection
                        // so the graph badges mirror the Assemble Agent Crew dropdowns live.
                        const labels: Record<string, string> = {};
                        for (const name of selected) {
                          const id = agentModels[name] ?? UNIFIED_AGENT_MODEL;
                          const meta = OPENAI_MODELS.find((m) => m.id === id);
                          labels[name] = meta?.label ?? id;
                        }
                        return labels;
                      })()}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-t border-white/5 p-3 text-center text-[10px]">
                    {[
                      { l: "nodes", v: selected.length },
                      { l: "edges", v: Math.max(0, Math.round(selected.length * (collab / 50))) },
                      { l: "msgs/s", v: Math.round(80 + speed * 0.9 + collab * 0.6 + delegation * 0.3) },
                    ].map((x) => (
                      <div key={x.l} className="rounded-md bg-white/[0.02] py-2">
                        <div className="text-white/40">{x.l}</div>
                        <div className="tabular-nums text-cyan-200">{x.v}</div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-cyan-300" />
                      Workflow Timeline
                    </div>
                    <span className="text-[10px] text-white/40">{eta}</span>
                  </div>
                  <div className="p-4">
                    <div className="space-y-3">
                      {timelineSteps.length === 0 ? (
                        <div className="text-sm text-white/45">Select at least one agent to preview stages.</div>
                      ) : (
                        timelineSteps.map((s, idx) => (
                          <motion.div
                            key={`${s.name}-${idx}`}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.06 }}
                            className="flex items-center gap-3"
                          >
                            <div className="flex flex-col items-center">
                              <div
                                className="h-2.5 w-2.5 rounded-full ring-2 ring-black"
                                style={{ background: s.color, boxShadow: `0 0 10px ${s.color}` }}
                              />
                              {idx < timelineSteps.length - 1 && (
                                <div className="h-7 w-px bg-gradient-to-b from-white/20 to-transparent" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm text-white/85">{s.phase}</div>
                              <div className="text-[11px] text-white/40">
                                {s.name} Agent · est {s.estMin}m
                              </div>
                            </div>
                            <AnimatePresence>
                              <motion.div
                                key={idx}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-[10px] text-cyan-300"
                              >
                                ready
                              </motion.div>
                            </AnimatePresence>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Brain className="h-4 w-4 text-purple-300" />
                      Reasoning Stream
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">live</span>
                  </div>
                  <div className="p-4">
                    <div className="rounded-lg border border-white/5 bg-black/60 p-3 font-mono text-[11px] leading-relaxed">
                      {[
                        { c: "text-white/40", t: "» plan.compose(objective)" },
                        {
                          c: "text-cyan-300",
                          t: `  ↳ ${timelineSteps.length} stages · ${deliverables.length} deliverables · ${metrics.length} success metrics`,
                        },
                        { c: "text-white/40", t: "» model.select(priority + agent)" },
                        {
                          c: "text-amber-300",
                          t: `  ↳ Dev: ${devModel} · Coord: ${coordModel} · default: ${selectedModel}`,
                        },
                        { c: "text-white/40", t: `  ↳ cost×${modelCostMult.toFixed(2)} · OpenAI primary · Groq fallback` },
                        { c: "text-white/40", t: "» crew.assemble()" },
                        { c: "text-purple-300", t: `  ↳ selected ${selected.length} specialized agents` },
                        { c: "text-white/40", t: "» prefs.lock(orchestration)" },
                        {
                          c: "text-cyan-300",
                          t: `  ↳ delegation ${delegation}% · speed ${speed}% · collaboration ${collab}%`,
                        },
                        { c: "text-white/40", t: "» budget.optimize()" },
                        { c: "text-emerald-300", t: `  ↳ projected cost ${estCost.toFixed(2)} SOL (${(allocation.agentCompute * 100).toFixed(0)}% compute-weighted)` },
                        {
                          c: "text-white/70",
                          t: `  flags: auto-approve ${autoApprove ? "on" : "off"} · memory ${memShare ? "shared" : "isolated"} · settlement ${autoSettle ? "auto" : "manual"}`,
                        },
                      ].map((l, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.08 }}
                          className={l.c}
                        >
                          {l.t}
                        </motion.div>
                      ))}
                      <motion.span
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                        className="text-cyan-300"
                      >
                        ▌
                      </motion.span>
                    </div>
                  </div>
                </Card>

                <TrialBanner />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* range slider styling */}
      <style>{`
        .hivemind-range {
          appearance: none;
          height: 4px;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--accent, #22d3ee), rgba(168,85,247,0.6));
          outline: none;
        }
        .hivemind-range::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid var(--accent, #22d3ee);
          box-shadow: 0 0 12px var(--accent, rgba(34,211,238,0.8));
          cursor: pointer;
        }
        .hivemind-range::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid var(--accent, #22d3ee);
          box-shadow: 0 0 12px var(--accent, rgba(34,211,238,0.8));
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
