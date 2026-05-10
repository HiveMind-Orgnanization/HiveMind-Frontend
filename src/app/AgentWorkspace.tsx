import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link, useNavigate } from "react-router";
import { WalletGate } from "./components/WalletGate";
import {
  Bot, Brain, GitBranch, Terminal, Zap, Cpu, Activity, Send,
  Pause, Play, MessageSquare, Database, ArrowRight,
  Loader2, Plus, Lock,
  ChevronDown, ChevronRight, File, Folder, Download,
  LayoutPanelLeft, Code2, ExternalLink, X,
  FolderOpen, Sparkles, type LucideIcon,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { useMissions, ALL_AGENTS, type Mission } from "./store";
import { toast } from "sonner";
import {
  apiConfigured,
  createMissionBriefApi,
  fetchMissionWorkspaceSnapshotApi,
  fetchMissionArtifactsApi,
  downloadMissionArtifactsZip,
  startMissionPreview,
  invokeAgentApi,
  putMissionWorkspaceSnapshotApi,
  swarmRunMissionApi,
  type SwarmProgress,
  type MissionArtifact,
  type SwarmRunResult,
} from "../lib/api";
import { getAuthToken } from "../lib/auth-token";
import {
  loadWorkspaceSnapshot,
  persistServerWorkspaceSnapshot,
  saveWorkspaceSnapshot,
  isVacuousWorkspaceSnapshot,
  type WorkspaceSnapshotV1,
} from "../lib/workspace-persistence";
import { useAgents, useTasks, useHiveMindRealtime, useMemoryChunks } from "./hooks/useHiveMind";
import { AgentMessageMarkdown } from "./components/agent-message-markdown";
import { buildArtifactTree, dedupeArtifactsByPath, type ArtifactTreeNode } from "../lib/artifact-tree";

// All agent invocations always use GPT-5 for best results.
const AGENT_MODEL = "gpt-5";

type ChatMsg = {
  id: number;
  agent: string;
  color: string;
  text: string;
  state?: "thinking" | "delegating" | "executing" | "approved" | "failed";
  ts: string;
  /** Controls visual rendering style in the chat panel. */
  kind?: "system" | "system_done" | "system_warn" | "narrative" | "output" | "done" | "verify_ok" | "verify_fail" | "repair" | "thinking_active" | "coordination_result";
  /** Expandable inter-agent coordination log (shown in "Thought for Xs" section). */
  thinkingLog?: string[];
  /** Elapsed seconds of coordination thinking. */
  thinkingDuration?: number;
  /** Files that were modified by the swarm for this response. */
  fileChanges?: { path: string; agent: string; added: number; removed: number }[];
};

const seedMessages: ChatMsg[] = [
  { id: 1, agent: "Strategy", color: "#22d3ee", text: "Research trending Solana meme narratives — focus on past 14 days.", state: "delegating", ts: "16:42:08" },
  { id: 2, agent: "Research", color: "#a855f7", text: "Identified 12 high-performing meme formats. Sending vectors → Memory.", state: "executing", ts: "16:42:11" },
  { id: 3, agent: "Memory", color: "#f59e0b", text: "Indexed 248 vectors. Recall handle: mem://campaign/0x4f2", state: "approved", ts: "16:42:14" },
  { id: 4, agent: "Design", color: "#3b82f6", text: "Generating campaign visual assets — 12 variants in flight.", state: "executing", ts: "16:42:18" },
  { id: 5, agent: "Treasury", color: "#10b981", text: "Budget allocation approved · 12.4 SOL → escrow.", state: "approved", ts: "16:42:21" },
  { id: 6, agent: "Analytics", color: "#8b5cf6", text: "Predicted engagement increased by 27% over baseline.", state: "thinking", ts: "16:42:25" },
];

const newMessages: ChatMsg[] = [
  { id: 7, agent: "Coordination", color: "#06b6d4", text: "Routing variant 7 → Marketing for distribution.", state: "delegating", ts: "16:42:31" },
  { id: 8, agent: "Development", color: "#0ea5e9", text: "Embedding tracker into landing page. ETA 90s.", state: "executing", ts: "16:42:36" },
  { id: 9, agent: "Strategy", color: "#22d3ee", text: "Reweighting CPC ceiling → 0.42 SOL based on Analytics signal.", state: "thinking", ts: "16:42:42" },
  { id: 10, agent: "Treasury", color: "#10b981", text: "Settled 2.4 SOL → Design Agent · tx 4kJ2…91FE", state: "approved", ts: "16:42:48" },
];

type LogLine = { ts: number; agent: string; message: string };

const SWARM_FEED_REPLY_CHARS = 2800;


/** Produces a realistic inter-agent coordination dialogue for the reasoning log. */
function generateCoordinationScript(agents: string[], request: string) {
  const req = request.slice(0, 72) + (request.length > 72 ? "…" : "");
  const entries: { from: string; log: string }[] = [];

  const add = (from: string, to: string | null, msg: string) => {
    entries.push({ from, log: to ? `[${from} → ${to}] ${msg}` : `[${from}] ${msg}` });
  };

  add("Coordination", null, `Received directive: "${req}"`);
  if (agents.length > 1) {
    add("Coordination", agents[0]!, `${agents[0]}, assess scope and coordinate subtasks.`);
  }

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]!;
    const next = agents[i + 1] ?? null;
    switch (agent) {
      case "Strategy":
        add("Strategy", null, "Analyzing objective, decomposing into subtasks.");
        if (next) add("Strategy", next, `Scope defined. ${next}, you're up — focus on implementation.`);
        break;
      case "Research":
        add("Research", null, "Scanning codebase and existing artifacts for context…");
        add("Research", null, "Relevant files identified and indexed.");
        if (next) add("Research", next, `Analysis ready. ${next}, take the findings and proceed.`);
        break;
      case "Design":
        add("Design", null, "Reviewing UI structure and visual components…");
        add("Design", null, "Design spec finalized — updating styles and layout.");
        if (next) add("Design", next, `Visual changes applied. ${next}, integrate with logic.`);
        break;
      case "Development":
        add("Development", null, "Writing code changes based on the brief…");
        add("Development", null, "Implementation complete. Files persisted to workspace.");
        if (next) add("Development", next, `Build done. ${next}, verify quality.`);
        break;
      case "Analytics":
        add("Analytics", null, "Evaluating impact metrics of proposed changes…");
        if (next) add("Analytics", next, `Metrics clear. ${next}, continue pipeline.`);
        break;
      case "Marketing":
        add("Marketing", null, "Reviewing copy alignment and messaging…");
        if (next) add("Marketing", next, `Content updated. ${next}, finalize.`);
        break;
      default:
        add(agent, null, "Processing assigned subtask…");
        if (next) add(agent, next, `Done with my part. ${next}, continuing.`);
    }
  }

  add("Coordination", null, "All agents reported back. Compiling final deliverable…");
  return entries;
}

function appendSwarmOutputsToPanels(
  data: SwarmRunResult,
  setMessages: Dispatch<SetStateAction<ChatMsg[]>>,
  setLogLines: Dispatch<SetStateAction<LogLine[]>>,
  finalCoordinationBubble: ChatMsg,
) {
  const started = data.startedAt ?? Date.now();
  const fmt = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour12: false });
  const midMsgs: ChatMsg[] = [];

  data.results
    .filter((r) => r.role !== "Coordination")
    .forEach((r, i) => {
      const meta = ALL_AGENTS.find((a) => a.name === r.role);
      const color = meta?.color ?? "#94a3b8";
      const slot = started + i * 600;

      // 1) Plan bubble — agent's narrative describing what it will do.
      if (r.plan && r.plan.trim().length > 0) {
        midMsgs.push({
          id: slot + 1,
          agent: r.agentName || r.role,
          color,
          text: r.plan.trim(),
          state: "delegating",
          kind: "narrative",
          ts: fmt(slot + 30),
        });
      }

      // 2) Output bubble — actual reply or error (shown as output card).
      const raw = (r.error?.trim() ?? r.reply ?? "").trim();
      const text =
        raw.length === 0
          ? `(no output · ${r.role})`
          : raw.length > SWARM_FEED_REPLY_CHARS
            ? `${raw.slice(0, SWARM_FEED_REPLY_CHARS)}\n\n…(truncated — full text in Artifacts)`
            : raw;
      midMsgs.push({
        id: slot + 2,
        agent: r.agentName || r.role,
        color,
        text,
        state: (r.error ? "failed" : "approved") as ChatMsg["state"],
        kind: r.error ? "output" : "output",
        ts: fmt(slot + 120),
      });

      // 3) Done summary pill.
      const artifactCount = Array.isArray(r.artifactPaths) ? r.artifactPaths.length : 0;
      midMsgs.push({
        id: slot + 3,
        agent: r.agentName || r.role,
        color,
        text: r.error
          ? `Failed · ${r.error.slice(0, 240)}`
          : `Produced ${artifactCount} artifact${artifactCount === 1 ? "" : "s"}: ${(r.artifactPaths ?? []).slice(0, 3).join(", ")}${artifactCount > 3 ? " …" : ""}`,
        state: r.error ? "failed" : "approved",
        kind: "done",
        ts: fmt(slot + 200),
      });
    });

  const logs: LogLine[] = data.results.flatMap((r, i) => {
    const slot = started + i * 600;
    const out: LogLine[] = [];
    if (r.plan)
      out.push({ ts: slot + 10, agent: r.agentName || r.role, message: `[plan] ${r.plan}` });
    out.push({
      ts: slot + 40,
      agent: r.agentName || r.role,
      message: r.error?.trim()
        ? `[fail] ${r.role} · ${r.error.slice(0, 400)}`
        : `[work] ${r.role} · ${(r.reply ?? "").trim().slice(0, 360)}${(r.reply ?? "").length > 360 ? "…" : ""}`,
    });
    out.push({
      ts: slot + 70,
      agent: r.agentName || r.role,
      message: `[done] ${r.role} · ${Array.isArray(r.artifactPaths) ? r.artifactPaths.length : 0} artifacts`,
    });
    return out;
  });
  setLogLines((prev) => [...prev, ...logs].slice(-200));
  setMessages((prev) => [...prev, ...midMsgs, finalCoordinationBubble]);
}

function buildCoordinationDeliverableText(data: SwarmRunResult, baseFinal: string): string {
  const lines: string[] = [];
  const f = baseFinal.trim();
  if (f.length > 0) {
    lines.push(
      f.length > SWARM_FEED_REPLY_CHARS
        ? `${f.slice(0, SWARM_FEED_REPLY_CHARS)}\n\n…(truncated — see Artifacts)`
        : f,
    );
  } else {
    lines.push("Swarm run finished.");
  }
  const tree = data.fileTree?.trim();
  const paths = data.artifactPaths ?? [];
  if (tree && tree.length > 0 && paths.length > 0) {
    lines.push("", "**Deliverables**", "", "```text", tree, "```");
  }
  return lines.join("\n");
}

function buildVerificationBubble(
  data: SwarmRunResult,
  ts: string,
): ChatMsg | null {
  const v = data.verification;
  if (!v) return null;
  const ok = v.ok;
  const color = ok ? "#10b981" : "#f59e0b";
  const cov = v.coverage;

  const covLines = [
    `frontend ${cov.frontend ? "✓" : "✗"}`,
    `backend ${cov.backend ? "✓" : "✗"}`,
    `README ${cov.readme ? "✓" : "✗"}`,
    cov.docs ? "docs ✓" : null,
  ].filter(Boolean).join(" · ");

  const lines: string[] = [
    ok ? `✅ All checks passed — ${v.artifactPathCount} files delivered` : `⚠️ Needs revision · ${v.summary}`,
    "",
    `**Coverage:** ${covLines}`,
  ];
  if (!ok && v.issues.length > 0) {
    lines.push("", "**Issues found:**");
    for (const issue of v.issues.slice(0, 8)) lines.push(`- ${issue}`);
  }

  return {
    id: Date.now() + 99,
    agent: "Verifier",
    color,
    text: lines.join("\n"),
    state: ok ? "approved" : "thinking",
    kind: ok ? "verify_ok" : "verify_fail",
    ts,
  };
}

function snapshotToWorkspaceSnapshotV1(s: WorkspaceSnapshotV1): WorkspaceSnapshotV1 {
  return {
    v: 1,
    messages: s.messages,
    logLines: s.logLines,
    timelineEvents: s.timelineEvents,
    selectedAgent: s.selectedAgent,
    updatedAt: s.updatedAt,
  };
}

/** Pull wallet-scoped workspace from API and merge vs localStorage (authenticated only). */
async function mergeMissionWorkspaceFromApi(
  missionId: string,
  setters: {
    setMessages: Dispatch<SetStateAction<ChatMsg[]>>;
    setLogLines: Dispatch<SetStateAction<LogLine[]>>;
    setTimelineEvents: Dispatch<SetStateAction<{ ts: number; l: string; c: string }[]>>;
    setSelectedAgent: Dispatch<SetStateAction<string>>;
  },
): Promise<void> {
  if (!apiConfigured() || !getAuthToken()) return;
  const remote = await fetchMissionWorkspaceSnapshotApi(missionId);
  if (!remote) return;
  const local = loadWorkspaceSnapshot(missionId);
  const localTs = local?.updatedAt ?? 0;
  const remoteVacuous = isVacuousWorkspaceSnapshot(remote.snapshot);
  const localRich = Boolean(local && !isVacuousWorkspaceSnapshot(local));

  if (remote.updatedAt >= localTs) {
    // Avoid wiping real UI with an empty server snapshot (race: debounced PUT saves {} before merge returns).
    if (remoteVacuous && localRich && local) {
      await putMissionWorkspaceSnapshotApi(missionId, snapshotToWorkspaceSnapshotV1(local));
      return;
    }
    setters.setMessages(remote.snapshot.messages);
    setters.setLogLines(remote.snapshot.logLines);
    setters.setTimelineEvents(remote.snapshot.timelineEvents);
    setters.setSelectedAgent(remote.snapshot.selectedAgent);
    persistServerWorkspaceSnapshot(missionId, remote.snapshot, remote.updatedAt);
    return;
  }
  if (local && (local.messages.length > 0 || local.logLines.length > 0 || local.timelineEvents.length > 0)) {
    await putMissionWorkspaceSnapshotApi(missionId, snapshotToWorkspaceSnapshotV1(local));
  }
}

function missionWorkspaceSeed(missionId: string): {
  messages: ChatMsg[];
  logLines: LogLine[];
  timelineEvents: { ts: number; l: string; c: string }[];
  selectedAgent: string;
} {
  const persisted = loadWorkspaceSnapshot(missionId);
  if (persisted) {
    return {
      messages: persisted.messages,
      logLines: persisted.logLines,
      timelineEvents: persisted.timelineEvents,
      selectedAgent: persisted.selectedAgent,
    };
  }
  return {
    messages: apiConfigured() ? [] : seedMessages,
    logLines: [],
    timelineEvents: [],
    selectedAgent: "Strategy",
  };
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

/** Centered empty state for code tree / editor / preview — matches production app polish. */
function WorkspacePanelEmptyState({
  icon: Icon,
  title,
  description,
  footnote,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-8 text-center">
      <div className="relative mb-5 shrink-0">
        <div
          className="absolute -inset-3 rounded-3xl opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 80% 70% at 50% 40%, rgba(34,211,238,0.22), transparent 65%), radial-gradient(ellipse 60% 50% at 70% 80%, rgba(168,85,247,0.12), transparent 60%)",
          }}
        />
        <div className="relative flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-white/[0.12] bg-gradient-to-br from-white/[0.12] to-white/[0.03] shadow-[0_8px_32px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.06]">
          <Icon className="h-[26px] w-[26px] text-cyan-200/95" strokeWidth={1.5} aria-hidden />
        </div>
      </div>
      <h3 className="max-w-[280px] text-[15px] font-semibold leading-snug tracking-tight text-white/[0.92]">
        {title}
      </h3>
      <p className="mt-2 max-w-[300px] text-[13px] leading-relaxed text-white/50">{description}</p>
      {footnote ? (
        <div className="mt-5 max-w-[320px] rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-left text-[12px] leading-relaxed text-white/45">
          {footnote}
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ s }: { s?: string }) {
  if (!s) return null;
  const map: Record<string, { label: string; icon: string; c: string; bg: string }> = {
    thinking:   { label: "thinking",  icon: "◑", c: "#a855f7", bg: "rgba(168,85,247,0.15)" },
    delegating: { label: "planning",  icon: "→", c: "#22d3ee", bg: "rgba(34,211,238,0.12)" },
    executing:  { label: "building",  icon: "⟳", c: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
    approved:   { label: "done",      icon: "✓", c: "#10b981", bg: "rgba(16,185,129,0.12)" },
    failed:     { label: "failed",    icon: "✗", c: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  };
  const cfg = map[s] ?? map.thinking;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em]"
      style={{ borderColor: `${cfg.c}44`, color: cfg.c, background: cfg.bg }}
    >
      <span className="text-[10px] leading-none">{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

/** Circular avatar with agent initials + glow ring. */
function AgentAvatar({ name, color, size = "md" }: { name: string; color: string; size?: "sm" | "md" | "lg" }) {
  const initials = name.slice(0, 2).toUpperCase();
  const dim = size === "sm" ? "h-7 w-7 text-[9px]" : size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-[10px]";
  return (
    <div
      className={`${dim} shrink-0 rounded-full flex items-center justify-center font-bold tracking-tight`}
      style={{
        background: `radial-gradient(circle at 35% 35%, ${color}55, ${color}18)`,
        border: `1.5px solid ${color}60`,
        boxShadow: `0 0 16px ${color}30`,
        color,
      }}
    >
      {initials}
    </div>
  );
}

/** Full-width HiveMind system message (boot, completion, warnings). */
function SystemBubble({ m }: { m: ChatMsg }) {
  const isDone = m.kind === "system_done";
  const isWarn = m.kind === "system_warn";
  const accent = isDone ? "#10b981" : isWarn ? "#f59e0b" : "#22d3ee";
  const bg = isDone ? "rgba(16,185,129,0.06)" : isWarn ? "rgba(245,158,11,0.06)" : "rgba(34,211,238,0.05)";
  const icon = isDone ? "✅" : isWarn ? "⚠️" : "🤖";
  return (
    <div
      className="flex items-start gap-3 rounded-xl border px-4 py-3"
      style={{ borderColor: `${accent}30`, background: bg }}
    >
      <span className="mt-0.5 text-base leading-none">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-[11px] font-semibold" style={{ color: accent }}>HiveMind</span>
          <span className="text-[9px] font-medium uppercase tracking-widest" style={{ color: `${accent}80` }}>
            {isDone ? "complete" : isWarn ? "warning" : "system"}
          </span>
          <span className="ml-auto font-mono text-[9px] text-white/25">{m.ts}</span>
        </div>
        <p className="text-[12px] leading-relaxed text-white/70">{m.text}</p>
      </div>
    </div>
  );
}

/** Narrative bubble — agent's conversational "here's what I'll do" paragraph. */
function NarrativeBubble({ m }: { m: ChatMsg }) {
  return (
    <div className="flex items-start gap-3">
      <AgentAvatar name={m.agent} color={m.color} />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[12px] font-semibold" style={{ color: m.color }}>{m.agent}</span>
          <StatusBadge s={m.state} />
          <span className="ml-auto font-mono text-[9px] text-white/25">{m.ts}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-white/75">{m.text}</p>
      </div>
    </div>
  );
}

/** Done pill — compact artifact count indicator. */
function DonePill({ m }: { m: ChatMsg }) {
  const isFailed = m.state === "failed";
  const accent = isFailed ? "#ef4444" : "#10b981";
  return (
    <div className="flex items-center gap-2 pl-11">
      <div
        className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium"
        style={{ borderColor: `${accent}40`, color: accent, background: `${accent}0d` }}
      >
        <span>{isFailed ? "✗" : "✓"}</span>
        <span>{m.text}</span>
      </div>
      <span className="font-mono text-[9px] text-white/20">{m.ts}</span>
    </div>
  );
}

/** Verification summary card (ok or issues). */
function VerifyCard({ m }: { m: ChatMsg }) {
  const isOk = m.kind === "verify_ok";
  const accent = isOk ? "#10b981" : "#f59e0b";
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: `${accent}35`, background: `${accent}08` }}
    >
      <AgentMessageMarkdown source={m.text} />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px]" style={{ color: `${accent}90` }}>Verifier Agent · {m.ts}</span>
      </div>
    </div>
  );
}

/** Standard agent output bubble — used for actual LLM replies. */
function OutputBubble({ m }: { m: ChatMsg }) {
  const isFailed = m.state === "failed";
  const borderColor = isFailed ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)";
  const bg = isFailed ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.02)";
  return (
    <div className="flex items-start gap-3">
      <AgentAvatar name={m.agent} color={m.color} />
      <div className="min-w-0 flex-1 rounded-xl border p-3.5" style={{ borderColor, background: bg }}>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[12px] font-semibold" style={{ color: m.color }}>{m.agent}</span>
          <StatusBadge s={m.state} />
          <span className="ml-auto font-mono text-[9px] text-white/25">{m.ts}</span>
        </div>
        <AgentMessageMarkdown source={m.text} />
      </div>
    </div>
  );
}

/** Right-aligned bubble for messages sent by the user/operator. */
function UserBubble({ m }: { m: ChatMsg }) {
  return (
    <div className="flex items-end justify-end gap-2">
      <div className="max-w-[82%]">
        <div className="mb-1 flex items-center justify-end gap-2">
          <span className="font-mono text-[9px] text-white/25">{m.ts}</span>
          <span className="text-[11px] font-semibold text-white/50">You</span>
        </div>
        <div className="rounded-2xl rounded-br-sm border border-cyan-300/20 bg-gradient-to-br from-cyan-500/20 to-purple-500/15 px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90">
          {m.text}
        </div>
      </div>
      <div
        className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{
          background: "radial-gradient(circle at 35% 35%, rgba(226,232,240,0.2), rgba(226,232,240,0.06))",
          border: "1.5px solid rgba(226,232,240,0.2)",
          color: "#e2e8f0",
        }}
      >
        OP
      </div>
    </div>
  );
}

/** Clean "agents coordinating" placeholder shown while swarm runs. */
function ThinkingActiveBubble({ m }: { m: ChatMsg }) {
  const agents = m.text ? m.text.split(" · ") : ["Agents"];
  const label = agents.length > 3
    ? `${agents.slice(0, 3).join(", ")} +${agents.length - 3} more`
    : agents.join(", ");
  return (
    <div className="flex items-start gap-3">
      <div
        className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center"
        style={{
          background: "radial-gradient(circle at 35% 35%, rgba(34,211,238,0.25), rgba(34,211,238,0.06))",
          border: "1.5px solid rgba(34,211,238,0.4)",
        }}
      >
        <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-cyan-300">Coordination</span>
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="text-[9px] uppercase tracking-widest text-cyan-300/55"
          >
            working
          </motion.span>
          <span className="ml-auto font-mono text-[9px] text-white/25">{m.ts}</span>
        </div>
        <p className="mt-0.5 text-[12px] text-white/35">{label} coordinating…</p>
      </div>
    </div>
  );
}

/** Final coordination result with expandable reasoning + file change list. */
function CoordinationResultBubble({ m }: { m: ChatMsg }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex items-start gap-3">
      <div
        className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold tracking-tight"
        style={{
          background: "radial-gradient(circle at 35% 35%, rgba(34,211,238,0.35), rgba(34,211,238,0.1))",
          border: "1.5px solid rgba(34,211,238,0.5)",
          boxShadow: "0 0 16px rgba(34,211,238,0.2)",
          color: "#22d3ee",
        }}
      >
        CO
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[12px] font-semibold text-cyan-300">Coordination</span>
          <StatusBadge s="approved" />
          <span className="ml-auto font-mono text-[9px] text-white/25">{m.ts}</span>
        </div>

        {/* "Thought for Xs" expandable */}
        {m.thinkingLog && m.thinkingLog.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mb-2.5 flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/50 transition-colors hover:border-white/15 hover:text-white/75"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
            Thought for {m.thinkingDuration ?? 0}s
            <ChevronRight
              className={`h-3 w-3 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        )}

        {expanded && m.thinkingLog && (
          <div className="mb-3 rounded-xl border border-white/[0.07] bg-black/50 p-3">
            <div className="space-y-1 font-mono text-[11px] leading-relaxed text-white/40">
              {m.thinkingLog.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        )}

        {/* Files changed with diff stats */}
        {m.fileChanges && m.fileChanges.length > 0 && (
          <div className="mb-3 overflow-hidden rounded-xl border border-white/[0.07] bg-black/30">
            <div className="border-b border-white/[0.05] px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/30">
              {m.fileChanges.length} file{m.fileChanges.length !== 1 ? "s" : ""} updated
            </div>
            <div className="divide-y divide-white/[0.04]">
              {m.fileChanges.map((f, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                  <File className="h-3 w-3 shrink-0 text-cyan-300/60" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/70">{f.path}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {f.added > 0 && (
                      <span className="font-mono text-[10px] font-semibold text-emerald-400">+{f.added}</span>
                    )}
                    {f.removed > 0 && (
                      <span className="font-mono text-[10px] font-semibold text-red-400">-{f.removed}</span>
                    )}
                    <span className="rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-white/30">
                      {f.agent}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main reply content */}
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <AgentMessageMarkdown source={m.text} />
        </div>
      </div>
    </div>
  );
}

/** Route a ChatMsg to the correct visual component. */
function ChatBubble({ m }: { m: ChatMsg }) {
  // Check kind first — a message's kind always wins over agent name for routing.
  if (m.kind === "thinking_active") return <ThinkingActiveBubble m={m} />;
  if (m.kind === "coordination_result") return <CoordinationResultBubble m={m} />;
  if (m.kind === "system" || m.kind === "system_done" || m.kind === "system_warn") return <SystemBubble m={m} />;
  if (m.kind === "verify_ok" || m.kind === "verify_fail") return <VerifyCard m={m} />;
  if (m.kind === "done") return <DonePill m={m} />;
  if (m.kind === "narrative") return <NarrativeBubble m={m} />;
  // Agent-based routing (only for messages with no specific kind)
  if (m.agent === "Operator") return <UserBubble m={m} />;
  return <OutputBubble m={m} />;
}

function ArtifactTreeView({
  nodes,
  depth,
  collapsed,
  toggleFolder,
  selectedArtifactId,
  onSelectFile,
}: {
  nodes: ArtifactTreeNode[];
  depth: number;
  collapsed: Set<string>;
  toggleFolder: (fullPath: string) => void;
  selectedArtifactId: string | null;
  onSelectFile: (id: string) => void;
}) {
  return (
    <div className={depth ? "ml-1.5 border-l border-white/[0.07] pl-2" : ""}>
      {nodes.map((node) => {
        if (node.isFile && node.artifactId) {
          const active = node.artifactId === selectedArtifactId;
          return (
            <button
              key={`${node.fullPath}:${node.artifactId}`}
              type="button"
              onClick={() => onSelectFile(node.artifactId!)}
              className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left font-mono text-[11px] transition ${
                active ? "bg-cyan-300/15 text-white" : "text-white/75 hover:bg-white/[0.04]"
              }`}
            >
              <File className="h-3 w-3 shrink-0 text-cyan-300/75" aria-hidden />
              <span className="min-w-0 truncate">{node.name}</span>
            </button>
          );
        }
        const open = !collapsed.has(node.fullPath);
        return (
          <div key={node.fullPath || `dir-${node.name}`} className="py-0.5">
            <button
              type="button"
              onClick={() => toggleFolder(node.fullPath)}
              className="flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-[11px] text-white/85 hover:bg-white/[0.04]"
            >
              {open ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-white/45" aria-hidden />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-white/45" aria-hidden />
              )}
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-300/85" aria-hidden />
              <span className="min-w-0 truncate font-medium">{node.name}</span>
            </button>
            {open && node.children.length > 0 ? (
              <ArtifactTreeView
                nodes={node.children}
                depth={depth + 1}
                collapsed={collapsed}
                toggleFolder={toggleFolder}
                selectedArtifactId={selectedArtifactId}
                onSelectFile={onSelectFile}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AgentWorkspaceMissionBody({
  mission,
  patchLocal,
}: {
  mission: Mission;
  patchLocal: (id: string, patch: Partial<Mission>) => void;
}) {
  const navigate = useNavigate();
  const initialWorkspace = useMemo(() => missionWorkspaceSeed(mission.id), [mission.id]);
  const [paused, setPaused] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>(initialWorkspace.messages);
  const [draft, setDraft] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>(initialWorkspace.selectedAgent);
  const [autoInvoking, setAutoInvoking] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  // Prevent double-send (Enter key + button click firing together)
  const isSendingRef = useRef(false);
  // Track which mission IDs we've already auto-invoked so we don't repeat.
  const autoInvokedRef = useRef<Set<string>>(new Set());
  const { agents: hiveAgents, reload: reloadAgents } = useAgents();
  const { tasks: hiveTasks, reload: reloadTasks } = useTasks(mission.id);
  const { chunks: memoryChunks } = useMemoryChunks();

  const [logLines, setLogLines] = useState<LogLine[]>(initialWorkspace.logLines);
  const [timelineEvents, setTimelineEvents] = useState<{ ts: number; l: string; c: string }[]>(
    initialWorkspace.timelineEvents,
  );
  const [brief, setBrief] = useState<unknown | null>(
    (mission.config && "brief" in mission.config ? (mission.config as any).brief : null) ?? null,
  );
  const [artifacts, setArtifacts] = useState<MissionArtifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(true);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [collapsedArtifactFolders, setCollapsedArtifactFolders] = useState<Set<string>>(new Set());
  const [zipDownloading, setZipDownloading] = useState(false);
  const [previewStarting, setPreviewStarting] = useState(false);
  /** Right panel: source tree vs hosted preview iframe (proxied /preview on dev). */
  const [workspacePanelTab, setWorkspacePanelTab] = useState<"code" | "preview">("code");
  const [previewEmbedUrl, setPreviewEmbedUrl] = useState<string | null>(null);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  /** False until server workspace merge finishes — avoids PUT-ing an empty snapshot before GET returns. */
  const [workspaceMergeDone, setWorkspaceMergeDone] = useState(false);
  /** Live "Thinking…" indicator for the agent currently working (driven by [work] events). */
  const [activeAgent, setActiveAgent] = useState<{ name: string; color: string; phase: string } | null>(null);
  // File writes are always persisted — agents always have code access.

  const artifactTree = useMemo(() => buildArtifactTree(artifacts), [artifacts]);
  const uniqueArtifactPaths = useMemo(() => dedupeArtifactsByPath(artifacts).length, [artifacts]);

  const loadHostedPreview = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!getAuthToken()) {
        if (!opts?.quiet) toast.error("Sign in with your wallet to preview");
        return false;
      }
      setPreviewStarting(true);
      const res = await startMissionPreview(mission.id);
      setPreviewStarting(false);
      if (!res.ok || !res.url) {
        if (!opts?.quiet) toast.error(res.message ?? "Preview failed");
        return false;
      }
      const u = res.url.endsWith("/") ? res.url : `${res.url}/`;
      setPreviewEmbedUrl(u);
      setWorkspacePanelTab("preview");
      if (!opts?.quiet) toast.success("Preview loaded");
      return true;
    },
    [mission.id],
  );

  const toggleArtifactFolder = useCallback((fullPath: string) => {
    setCollapsedArtifactFolders((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) next.delete(fullPath);
      else next.add(fullPath);
      return next;
    });
  }, []);

  const workspacePutTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reloadBriefAndArtifacts = useCallback(
    async (opts?: { cancelledRef?: { current: boolean } }) => {
      if (!apiConfigured() || !getAuthToken()) {
        setArtifactsLoading(false);
        return;
      }
      try {
        const [b, a] = await Promise.all([
          createMissionBriefApi(mission.id).catch(() => null),
          fetchMissionArtifactsApi(mission.id).catch(() => null),
        ]);
        if (opts?.cancelledRef?.current) return;
        if (b && b.ok) setBrief(b.brief ?? null);
        if (a) {
          setArtifacts(a);
          setSelectedArtifactId((cur) => {
            if (cur && a.some((x) => x.id === cur)) return cur;
            return a[0]?.id ?? null;
          });
        }
      } finally {
        if (!opts?.cancelledRef?.current) setArtifactsLoading(false);
      }
    },
    [mission.id],
  );

  useEffect(() => {
    const cancelledRef = { current: false };
    const run = () => void reloadBriefAndArtifacts({ cancelledRef });
    void run();
    const onSession = () => void run();
    window.addEventListener("hm-session-changed", onSession);
    return () => {
      cancelledRef.current = true;
      window.removeEventListener("hm-session-changed", onSession);
    };
  }, [reloadBriefAndArtifacts]);

  // Live artifact refresh while the swarm is running (Replit-style file updates).
  useEffect(() => {
    if (!apiConfigured() || !getAuthToken() || !autoInvoking) return;
    const tick = async () => {
      const a = await fetchMissionArtifactsApi(mission.id);
      if (a && a.length > 0) {
        setArtifacts(a);
        setSelectedArtifactId((cur) => cur ?? a[0]!.id);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2500);
    return () => window.clearInterval(id);
  }, [autoInvoking, mission.id]);

  // Cross-device merge when signed in; re-run after wallet session changes.
  useEffect(() => {
    setWorkspaceMergeDone(false);
    let cancelled = false;
    const run = async () => {
      try {
        if (cancelled) return;
        await mergeMissionWorkspaceFromApi(mission.id, {
          setMessages,
          setLogLines,
          setTimelineEvents,
          setSelectedAgent,
        });
      } finally {
        if (!cancelled) setWorkspaceMergeDone(true);
      }
    };
    void run();
    const onSession = () => void run();
    window.addEventListener("hm-session-changed", onSession);
    return () => {
      cancelled = true;
      window.removeEventListener("hm-session-changed", onSession);
    };
  }, [mission.id]);

  // LocalStorage always; debounced PUT to API when authenticated.
  useEffect(() => {
    saveWorkspaceSnapshot(mission.id, { messages, logLines, timelineEvents, selectedAgent });
    if (!apiConfigured() || !getAuthToken()) return;
    if (
      !workspaceMergeDone &&
      messages.length === 0 &&
      logLines.length === 0 &&
      timelineEvents.length === 0
    ) {
      return;
    }
    window.clearTimeout(workspacePutTimerRef.current);
    workspacePutTimerRef.current = window.setTimeout(() => {
      const now = Date.now();
      const body: WorkspaceSnapshotV1 = {
        v: 1,
        messages,
        logLines,
        timelineEvents,
        selectedAgent,
        updatedAt: now,
      };
      void putMissionWorkspaceSnapshotApi(mission.id, body).then((serverTs) => {
        const ts =
          typeof serverTs === "number" && Number.isFinite(serverTs) ? serverTs : Date.now();
        saveWorkspaceSnapshot(mission.id, { messages, logLines, timelineEvents, selectedAgent, updatedAt: ts });
      });
    }, 600);
    return () => window.clearTimeout(workspacePutTimerRef.current);
  }, [mission.id, messages, logLines, timelineEvents, selectedAgent, workspaceMergeDone]);

  // When WebSocket missed swarm traffic, infer activity from synced execution tasks (refresh/open workspace).
  useEffect(() => {
    if (!apiConfigured() || hiveTasks.length === 0) return;
    setLogLines((prev) => {
      if (prev.length > 0) return prev;
      const exec = hiveTasks.filter((t) => t.stage === "Execution").slice(0, 48);
      if (exec.length === 0) return prev;
      const base = Date.now();
      return exec.map((t, i) => ({
        ts: base - (exec.length - i) * 150,
        agent: "HiveMind",
        message: `Synced task · ${t.agent} · ${t.title} · ${t.status}`,
      }));
    });
  }, [hiveTasks]);

  const reasoningRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [reasoningStickBottom, setReasoningStickBottom] = useState(true);
  const [timelineStickBottom, setTimelineStickBottom] = useState(true);

  // Realtime: agent logs + task lifecycle events (drives Reasoning/Timeline + live chat).
  useHiveMindRealtime({
    channels: ["global", `mission:${mission.id}`],
    onEvent: (evt) => {
      if (paused) return;
      if (evt.type === "agent.activity") {
        setLogLines((prev) => [...prev, evt.payload].slice(-200));

        const m = evt.payload.message;
        const agentName = evt.payload.agent;

        const fmt = (ts: number) => new Date(ts).toLocaleTimeString("en-US", { hour12: false });

        // Replit-style narration: turn structured tags into typed chat bubbles.
        if (m.startsWith("[system] ") || m.startsWith("[system:done] ") || m.startsWith("[system:warn] ")) {
          const isDone = m.startsWith("[system:done] ");
          const isWarn = m.startsWith("[system:warn] ");
          setActiveAgent(null);
          setMessages((prev) => [
            ...prev,
            {
              id: evt.payload.ts,
              agent: "HiveMind",
              color: isDone ? "#10b981" : isWarn ? "#f59e0b" : "#22d3ee",
              text: m.replace(/^\[system(?::\w+)?\]\s*/, ""),
              state: isDone ? "approved" : isWarn ? "thinking" : "executing",
              kind: isDone ? "system_done" : isWarn ? "system_warn" : "system",
              ts: fmt(evt.payload.ts),
            },
          ]);
        } else if (m.startsWith("[plan] ")) {
          const meta = ALL_AGENTS.find((a) => a.name === agentName);
          const color = meta?.color ?? "#94a3b8";
          setActiveAgent({ name: agentName, color, phase: "Planning" });
          setMessages((prev) => [
            ...prev,
            {
              id: evt.payload.ts,
              agent: agentName,
              color,
              text: m.replace(/^\[plan\]\s*/, ""),
              state: "delegating",
              kind: "narrative",
              ts: fmt(evt.payload.ts),
            },
          ]);
        } else if (m.startsWith("[work] ")) {
          const meta = ALL_AGENTS.find((a) => a.name === agentName);
          const color = meta?.color ?? "#94a3b8";
          setActiveAgent({ name: agentName, color, phase: "Building" });
        } else if (m.startsWith("[done] ")) {
          const meta = ALL_AGENTS.find((a) => a.name === agentName);
          const color = meta?.color ?? "#10b981";
          setActiveAgent(null);
          setMessages((prev) => [
            ...prev,
            {
              id: evt.payload.ts,
              agent: agentName,
              color,
              text: m.replace(/^\[done\]\s*/, ""),
              state: "approved",
              kind: "done",
              ts: fmt(evt.payload.ts),
            },
          ]);
        } else if (m.startsWith("[verify] ") || m.startsWith("[verify:issue] ")) {
          const isIssue = m.startsWith("[verify:issue] ");
          setMessages((prev) => [
            ...prev,
            {
              id: evt.payload.ts,
              agent: "Verifier",
              color: isIssue ? "#f59e0b" : "#10b981",
              text: m.replace(/^\[verify(?::issue)?\]\s*/, ""),
              state: isIssue ? "thinking" : "approved",
              kind: isIssue ? "verify_fail" : "verify_ok",
              ts: fmt(evt.payload.ts),
            },
          ]);
        }

        // Keep the timeline lightweight: only include swarm boundaries.
        if (agentName === "HiveMind" && (m.startsWith("[swarm]") || m.startsWith("[system"))) {
          setTimelineEvents((prev) => [
            ...prev,
            { ts: evt.payload.ts, l: m.replace(/^\[(?:swarm|system(?::\w+)?)\]\s*/i, ""), c: "#22d3ee" },
          ].slice(-24));
          if (m.includes("complete") || m.includes("done")) setActiveAgent(null);
        }
      }
      if (evt.type === "task.created") {
        setTimelineEvents((prev) => [
          ...prev,
          { ts: Date.now(), l: `Task created · ${evt.payload.agent}`, c: "#a855f7" },
        ].slice(-24));
      }
      if (evt.type === "task.updated") {
        const tone =
          evt.payload.status === "done"
            ? "#10b981"
            : evt.payload.status === "failed"
              ? "#ef4444"
              : evt.payload.status === "active"
                ? "#22d3ee"
                : "#94a3b8";
        setTimelineEvents((prev) => [
          ...prev,
          { ts: Date.now(), l: `Task ${evt.payload.status} · ${evt.payload.agent}`, c: tone },
        ].slice(-24));
      }
    },
  });

  // Auto-scroll reasoning/timeline unless user scrolled up.
  useEffect(() => {
    if (!reasoningStickBottom) return;
    const el = reasoningRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logLines.length, reasoningStickBottom]);

  useEffect(() => {
    if (!timelineStickBottom) return;
    const el = timelineRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [timelineEvents.length, timelineStickBottom]);

  const onScrollStick = (
    el: HTMLDivElement | null,
    set: (v: boolean) => void,
  ) => {
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
    set(atBottom);
  };

  // Workflow tree removed (artifacts are the primary deliverable view now).

  const missionMemoryHits = useMemo(() => {
    const mid = mission.id;
    if (!mid) return [];
    return memoryChunks
      .filter((c) => c.missionId === mid)
      .slice(0, 8);
  }, [memoryChunks, mission.id]);

  /** Match roster specialization to backend agent id (backend seeds must include the role — e.g. Development → Orion). */
  const resolveAgentId = (name: string) => {
    const n = name.trim();
    const bySpec = hiveAgents.find((x) => x.specialization === n)?.id;
    if (bySpec) return bySpec;
    if (n === "Development")
      return hiveAgents.find((x) => x.specialization === "Design")?.id ?? null;
    if (n === "Marketing")
      return hiveAgents.find((x) => x.specialization === "Strategy")?.id ?? null;
    if (n === "Memory")
      return hiveAgents.find((x) => x.specialization === "Research")?.id ?? null;
    return null;
  };

  // simulate streaming new messages (demo mode only — API mode relies on real invokes)
  useEffect(() => {
    if (paused || apiConfigured()) return;
    let i = 0;
    const id = setInterval(() => {
      if (i >= newMessages.length) return;
      const m = { ...newMessages[i], id: Date.now() + i };
      setMessages((prev) => [...prev, m]);
      i += 1;
    }, 3200);
    return () => clearInterval(id);
  }, [paused, apiConfigured]);

  // Auto-invoke the best-matched agent as soon as a fresh mission opens.
  useEffect(() => {
    if (!apiConfigured() || autoInvokedRef.current.has(mission.id)) return;
    const persistedFlagKey = `hm-swarm-autoran:${mission.id}`;
    if (localStorage.getItem(persistedFlagKey) === "1") {
      autoInvokedRef.current.add(mission.id);
      return;
    }
    // A mission is "fresh" if no execution tasks exist yet.
    // Don't use `mission.progress` here: MissionCreate sets an estimated progress immediately,
    // which would prevent first-run swarms and leave the workspace blank.
    if (hiveTasks.length > 0) {
      autoInvokedRef.current.add(mission.id);
      localStorage.setItem(persistedFlagKey, "1");
      return;
    }
    // Restore session from localStorage immediately (offline / before API returns).
    const priorSync = loadWorkspaceSnapshot(mission.id);
    const hadLocalPersisted =
      priorSync !== null &&
      (priorSync.messages.length > 0 || priorSync.logLines.length > 0 || priorSync.timelineEvents.length > 0);
    if (hadLocalPersisted) {
      autoInvokedRef.current.add(mission.id);
      localStorage.setItem(persistedFlagKey, "1");
      return;
    }

    void (async () => {
      // When signed in, pull remote workspace before starting a new swarm (cross-device).
      await mergeMissionWorkspaceFromApi(mission.id, {
        setMessages,
        setLogLines,
        setTimelineEvents,
        setSelectedAgent,
      });
      const afterMerge = loadWorkspaceSnapshot(mission.id);
      const hadAfterMerge =
        afterMerge !== null &&
        (afterMerge.messages.length > 0 || afterMerge.logLines.length > 0 || afterMerge.timelineEvents.length > 0);
      if (hadAfterMerge) {
        autoInvokedRef.current.add(mission.id);
        localStorage.setItem(persistedFlagKey, "1");
        return;
      }

      setAutoInvoking(true);
      localStorage.setItem(persistedFlagKey, "1");
      const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
      setMessages([
        {
          id: Date.now(),
          agent: "Operator",
          color: "#e2e8f0",
          text: mission.objective,
          state: "delegating",
          ts,
        },
      ]);

      // Swarm run: one task per role/agent (6-agent main feature).
      const ROLE_COLORS: Record<string, string> = {
        Strategy: "#22d3ee", Research: "#a855f7", Design: "#3b82f6",
        Development: "#0ea5e9", Marketing: "#ec4899", Treasury: "#10b981",
        Analytics: "#8b5cf6", Coordination: "#06b6d4", Memory: "#f59e0b",
      };
      const swarm = await swarmRunMissionApi(
        mission.id,
        { title: mission.title, objective: mission.objective },
        {
          onProgress: (progress: SwarmProgress) => {
            const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
            // Add a message bubble for each newly completed agent
            const lastResult = progress.partialResults[progress.partialResults.length - 1];
            if (lastResult && lastResult.replySnippet.trim().length > 0) {
              const color = ROLE_COLORS[lastResult.role] ?? "#94a3b8";
              setMessages((prev) => {
                // Don't duplicate
                const alreadyHas = prev.some((m) => m.agent === lastResult.role && m.state === "executing");
                if (alreadyHas) return prev;
                return [
                  ...prev,
                  {
                    id: Date.now() + Math.random(),
                    agent: lastResult.role,
                    color,
                    text: lastResult.replySnippet,
                    state: "executing" as const,
                    ts,
                  },
                ];
              });
            }
            // Update active agent display to show current running role
            if (progress.currentRole) {
              const color = ROLE_COLORS[progress.currentRole] ?? "#94a3b8";
              setSelectedAgent(progress.currentRole);
              setMessages((prev) => {
                const alreadyThinking = prev.some((m) => m.agent === progress.currentRole && m.state === "thinking");
                if (alreadyThinking) return prev;
                return [
                  ...prev,
                  {
                    id: Date.now() + Math.random(),
                    agent: progress.currentRole!,
                    color,
                    text: `${progress.currentRole} agent is analyzing and generating output…`,
                    state: "thinking" as const,
                    ts,
                  },
                ];
              });
            }
            // Log line for completed roles
            setLogLines((prev) => [
              ...prev,
              {
                ts: Date.now(),
                agent: lastResult?.role ?? "HiveMind",
                message: `[done] ${lastResult?.role ?? ""} · ${progress.completedRoles.length}/${progress.completedRoles.length + 1} roles`,
              },
            ].slice(-200));
          },
        },
      );
      setAutoInvoking(false);
      if (!swarm.ok) {
        // allow retry on failure
        localStorage.removeItem(persistedFlagKey);
        toast.error("Swarm run failed", {
          description: swarm.message,
          duration: 12_000,
        });
        return;
      }
      autoInvokedRef.current.add(mission.id);
      const data = swarm.data;
      const groqHardFailures = data.results.filter(
        (r) =>
          r.provider === "mock" &&
          typeof r.debugLlm === "string" &&
          r.debugLlm.trim().length > 0,
      );
      if (groqHardFailures.length > 0) {
        toast.error("Groq unavailable — mock replies shown", {
          description: groqHardFailures[0]!.debugLlm!.slice(0, 400),
          duration: 12_000,
        });
      }
      if (!data.persisted) {
        patchLocal(mission.id, { eta: data.etaLabel, progress: 10 });
      }

      // Refresh artifacts after run (must match swarm wallet — list is per-wallet).
      const a = await fetchMissionArtifactsApi(mission.id);
      if (a) {
        setArtifacts(a);
        setSelectedArtifactId((cur) => {
          if (cur && a.some((x) => x.id === cur)) return cur;
          return a[0]?.id ?? null;
        });
      } else if (getAuthToken()) {
        toast.error("Could not load mission code files", {
          description:
            "Try refreshing the page. If you use a different wallet than when the swarm ran, sign in with that wallet — files are stored per wallet.",
          duration: 12_000,
        });
      }

      if (data.verification?.ok && a && a.length > 0) {
        void loadHostedPreview({ quiet: true }).then((ok) => {
          if (ok) toast.success("Preview is live — check the Preview tab");
        });
      }

      const ts2 = new Date().toLocaleTimeString("en-US", { hour12: false });
      const finalText =
        (typeof data.finalReply === "string" && data.finalReply.trim().length > 0)
          ? data.finalReply
          : (data.results.find((r) => r.role === "Coordination")?.reply ?? "");
      const coordBody = buildCoordinationDeliverableText(
        data,
        finalText || "Swarm run finished.",
      );
      const coordBubble: ChatMsg = {
        id: Date.now() + 10,
        agent: "Coordination",
        color: ALL_AGENTS.find((a) => a.name === "Coordination")?.color ?? "#22d3ee",
        text: coordBody,
        state: "approved" as const,
        ts: ts2,
      };
      appendSwarmOutputsToPanels(data, setMessages, setLogLines, coordBubble);

      const verifierBubble = buildVerificationBubble(data, ts2);
      if (verifierBubble) {
        setMessages((prev) => [...prev, verifierBubble]);
        setLogLines((prev) => [
          ...prev,
          {
            ts: Date.now(),
            agent: "Verifier",
            message: data.verification?.ok
              ? `[verify] ${data.verification.summary}`
              : `[verify:issue] ${(data.verification?.issues ?? []).join(" · ").slice(0, 480)}`,
          },
        ].slice(-200));
        if (!data.verification?.ok) {
          toast.warning("Swarm complete · verification flagged issues", {
            description: (data.verification?.issues ?? []).join(" · "),
            duration: 12_000,
          });
        }
      }

      // Default follow-ups to Coordination once swarm completes.
      setSelectedAgent("Coordination");

      // Refresh tasks so the dashboard state/metrics update.
      void reloadTasks();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.id, hiveTasks.length]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages.length]);

  const sendMessage = () => {
    if (!draft.trim() || isSendingRef.current) return;
    isSendingRef.current = true;
    const text = draft.trim();
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setDraft("");

    // 1. Operator message — no state badge
    const opId = Date.now() * 1000 + Math.floor(Math.random() * 999);
    setMessages((m) => [
      ...m,
      { id: opId, agent: "Operator", color: "#e2e8f0", text, ts },
    ]);

    if (!apiConfigured()) {
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          agent: "Coordination",
          color: "#22d3ee",
          text: "Enable the HiveMind API (or dev proxy) for LLM-backed agent invokes.",
          state: "executing" as const,
          ts: new Date().toLocaleTimeString("en-US", { hour12: false }),
        },
      ]);
      isSendingRef.current = false;
      return;
    }

    const agentsToInvoke = (mission.agents && mission.agents.length > 0)
      ? mission.agents
      : [selectedAgent];

    // 2. Insert clean "thinking" placeholder — random suffix prevents ID collision with previous messages
    const thinkingId = Date.now() * 1000 + Math.floor(Math.random() * 999) + 1;
    setMessages((m) => [
      ...m,
      {
        id: thinkingId,
        agent: "Coordination",
        color: "#22d3ee",
        text: agentsToInvoke.join(" · "),
        ts: new Date().toLocaleTimeString("en-US", { hour12: false }),
        kind: "thinking_active" as const,
        state: "executing" as const,
      },
    ]);

    const startTime = Date.now();

    void (async () => {
      // 3. Stream inter-agent coordination dialogue into the reasoning log
      const script = generateCoordinationScript(agentsToInvoke, text);
      let delay = 300;
      for (const entry of script) {
        const d = delay;
        setTimeout(() => {
          setLogLines((prev) =>
            [...prev, { ts: Date.now(), agent: entry.from, message: entry.log }].slice(-200),
          );
        }, d);
        delay += 550 + Math.random() * 550;
      }

      // Snapshot artifact contents before invoking (for diff stats later)
      const artifactsBefore = new Map(artifacts.map((a) => [a.path, a.content ?? ""]));

      // Smart prompt: the agent decides whether code changes are needed.
      // If needed → JSON with fileUpdates. If conversational → plain text.
      const smartPrompt =
        `You are the {AGENT} agent in a multi-agent AI team working on a software project.\n` +
        `The user said: "${text}"\n\n` +
        `IMPORTANT: Look at this message and decide:\n` +
        `• If the user is asking a question, making conversation, or saying something that does NOT require writing or modifying code — reply in plain conversational text.\n` +
        `• If the user is asking you to write, edit, fix, create, improve, or update any code or files — respond ONLY in this JSON format:\n` +
        `  {"assistantReply":"concise summary of changes","fileUpdates":[{"path":"relative/path","language":"typescript","content":"complete file content"}]}\n` +
        `Do NOT default to code output. Only produce fileUpdates when the user's message clearly requires it.`;

      // 4. Call the first agent. If it decides the request needs code, invoke all agents.
      //    If it responds in plain text, that's the final answer — skip the rest.
      const results: { agentName: string; reply: string; paths: string[] }[] = [];

      const firstAgentName = agentsToInvoke[0]!;
      const firstAgentId = resolveAgentId(firstAgentName);

      if (!firstAgentId) {
        void reloadAgents();
      } else {
        const firstRes = await invokeAgentApi(firstAgentId, {
          message: smartPrompt.replace("{AGENT}", firstAgentName),
          missionId: mission.id,
          includeArtifacts: true,
          persistArtifactUpdates: true,
          model: AGENT_MODEL,
        });

        if (!firstRes.ok) {
          if (firstRes.reason === "unauthorized") {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === thinkingId
                  ? { ...msg, kind: undefined, state: "failed" as const, text: "Sign-in required to invoke agents.", ts: new Date().toLocaleTimeString("en-US", { hour12: false }) }
                  : msg,
              ),
            );
            toast.error("Sign in to orchestrate agents");
            isSendingRef.current = false;
            return;
          }
        } else {
          if (firstRes.provider === "mock" && firstRes.debugLlm) {
            toast.error("Groq unavailable — mock reply shown", { description: firstRes.debugLlm.slice(0, 400), duration: 12_000 });
          }
          results.push({ agentName: firstAgentName, reply: firstRes.reply, paths: firstRes.artifactPathsApplied ?? [] });

          // If the first agent decided to write code, engage the remaining agents too.
          const wasCodeChange = (firstRes.artifactPathsApplied?.length ?? 0) > 0;
          if (wasCodeChange && agentsToInvoke.length > 1) {
            for (let i = 1; i < agentsToInvoke.length; i++) {
              const agentName = agentsToInvoke[i]!;
              const agentId = resolveAgentId(agentName);
              if (!agentId) continue;

              const res = await invokeAgentApi(agentId, {
                message: smartPrompt.replace("{AGENT}", agentName),
                missionId: mission.id,
                includeArtifacts: true,
                persistArtifactUpdates: true,
                model: AGENT_MODEL,
              });
              if (!res.ok) continue;
              if (res.provider === "mock" && res.debugLlm) {
                toast.error("Groq unavailable — mock reply shown", { description: res.debugLlm.slice(0, 400), duration: 12_000 });
              }
              results.push({ agentName, reply: res.reply, paths: res.artifactPathsApplied ?? [] });
            }
          }
        }
      }

      // 5. Refresh artifacts only if any agent actually wrote files
      const anyFilesWritten = results.some((r) => r.paths.length > 0);
      let freshArtifacts: typeof artifacts | null = null;
      if (anyFilesWritten) {
        freshArtifacts = await fetchMissionArtifactsApi(mission.id);
        if (freshArtifacts) {
          setArtifacts(freshArtifacts);
          setSelectedArtifactId((cur) => cur ?? freshArtifacts![0]?.id ?? null);
        }
      }

      const fileChanges = results.flatMap((r) =>
        r.paths.map((path) => {
          const prevContent = artifactsBefore.get(path) ?? "";
          const newContent = freshArtifacts?.find((a) => a.path === path)?.content ?? "";
          return {
            path,
            agent: r.agentName,
            added: Math.max(0, newContent.split("\n").length - (prevContent ? prevContent.split("\n").length : 0)),
            removed: Math.max(0, (prevContent ? prevContent.split("\n").length : 0) - newContent.split("\n").length),
          };
        }),
      );

      const thinkingDuration = Math.round((Date.now() - startTime) / 1000);
      const ts2 = new Date().toLocaleTimeString("en-US", { hour12: false });
      const thinkingLog = script.map((e) => e.log);

      // 6. Synthesize all agent replies into one Coordination summary via a final agent call
      let finalReply = results.length > 0
        ? results.map((r) => r.reply).join("\n\n")
        : "No agents were available to process this request.";

      if (anyFilesWritten && results.length > 1) {
        const coordAgentId =
          resolveAgentId("Coordination") ??
          resolveAgentId("Strategy") ??
          resolveAgentId(results[0]!.agentName);

        if (coordAgentId) {
          const synthPrompt =
            `You are the Coordination agent synthesizing the output of a multi-agent team. ` +
            `The team completed the following work in response to: "${text}"\n\n` +
            results.map((r) => `${r.agentName}: ${r.reply}`).join("\n\n") +
            `\n\nFiles changed: ${fileChanges.map((f) => f.path).join(", ") || "none"}` +
            `\n\nWrite a single, concise unified summary (2-4 sentences or bullet points) of what was accomplished. Do NOT use JSON format.`;

          const synthRes = await invokeAgentApi(coordAgentId, {
            message: synthPrompt,
            missionId: mission.id,
            includeArtifacts: false,
            persistArtifactUpdates: false,
          });
          if (synthRes.ok && synthRes.reply) finalReply = synthRes.reply;
        }
      }

      // 7. Replace the thinking placeholder with the final coordination result
      setMessages((m) =>
        m.map((msg) =>
          msg.id === thinkingId
            ? {
                ...msg,
                text: finalReply,
                state: "approved" as const,
                kind: "coordination_result" as const,
                thinkingLog,
                thinkingDuration,
                fileChanges,
                ts: ts2,
              }
            : msg,
        ),
      );

      if (anyFilesWritten && fileChanges.length > 0) {
        toast.success(`Saved ${fileChanges.length} file(s)`, { description: "Rebuild preview to run the updated app." });
      }
      isSendingRef.current = false;
    })();
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div className="absolute inset-0" style={{
              backgroundImage:
                "radial-gradient(ellipse at 20% 0%, rgba(34,211,238,0.10), transparent 50%), radial-gradient(ellipse at 80% 30%, rgba(168,85,247,0.10), transparent 55%)",
            }} />
          </div>
          <Particles count={22} />

          <div className="relative flex min-h-0 flex-1 flex-col gap-6 px-6 py-6">
            <div className="shrink-0">
            <PageHeader
              title="Agent Workspace"
              subtitle={`Coordinating · ${mission.title}`}
              crumbs={[{ label: "Mission Control", to: "/dashboard" }, { label: "Workspace" }]}
              status={{
                label:
                  paused
                    ? "Paused"
                    : `${hiveTasks.length} synced tasks · ${hiveAgents.length || ALL_AGENTS.length} agents in registry`,
                tone: paused ? "purple" : "emerald",
              }}
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => setActivityDrawerOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/80 hover:border-cyan-300/30"
                  >
                    <LayoutPanelLeft className="h-3.5 w-3.5 text-cyan-300" />
                    Activity
                  </button>
                  <button
                    onClick={() => setPaused((p) => !p)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/80 hover:border-cyan-300/30"
                  >
                    {paused ? <Play className="h-3.5 w-3.5 text-cyan-300" /> : <Pause className="h-3.5 w-3.5 text-cyan-300" />}
                    {paused ? "Resume" : "Pause"}
                  </button>
                  <button
                    onClick={() => navigate("/missions/new")}
                    className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-3 py-2 text-xs text-black"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
                    <Plus className="relative h-3.5 w-3.5" />
                    <span className="relative">New Mission</span>
                  </button>
                </>
              }
            />
            </div>

            {/* 30% communication · 70% code + live preview — flex-1 fills remaining viewport under header */}
            <div className="flex min-h-0 flex-1 flex-col gap-6 xl:flex-row xl:items-stretch">
              {/* ── Agent Communication panel (30%) ── */}
              <div className="flex min-h-0 w-full flex-1 flex-col xl:flex-none xl:w-[30%] xl:max-w-md">
                <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">

                  {/* Header */}
                  <div className="border-b border-white/5 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-cyan-300/30 to-purple-400/20">
                          <MessageSquare className="h-3.5 w-3.5 text-cyan-300" />
                        </div>
                        <span className="text-sm font-semibold text-white/90">Agent Communication</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {autoInvoking && (
                          <motion.div
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            className="flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                            <span className="text-[9px] font-semibold uppercase tracking-widest text-cyan-300">Running</span>
                          </motion.div>
                        )}
                        <span className="text-[10px] text-white/30">{messages.length} msgs</span>
                      </div>
                    </div>

                    {/* Active agent phase bar */}
                    {activeAgent && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2.5 flex items-center gap-2 rounded-lg border px-3 py-2"
                        style={{
                          borderColor: `${activeAgent.color}35`,
                          background: `${activeAgent.color}0a`,
                        }}
                      >
                        <AgentAvatar name={activeAgent.name} color={activeAgent.color} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold" style={{ color: activeAgent.color }}>
                              {activeAgent.name}
                            </span>
                            <span className="text-[9px] uppercase tracking-widest" style={{ color: `${activeAgent.color}80` }}>
                              {activeAgent.phase}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1">
                            {[0, 0.2, 0.4].map((d) => (
                              <motion.span
                                key={d}
                                className="h-1 w-4 rounded-full"
                                style={{ background: activeAgent.color }}
                                animate={{ opacity: [0.2, 0.9, 0.2], scaleX: [0.6, 1, 0.6] }}
                                transition={{ duration: 1.4, repeat: Infinity, delay: d }}
                              />
                            ))}
                            <span className="ml-1 text-[10px] text-white/40">Generating…</span>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Boot spinner when auto-invoking but no active agent yet */}
                    {autoInvoking && !activeAgent && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-2 flex items-center gap-2 text-[11px] text-white/40"
                      >
                        <Loader2 className="h-3 w-3 animate-spin text-cyan-300" />
                        <span>Initialising agents…</span>
                      </motion.div>
                    )}
                  </div>

                  {/* Message feed */}
                  <div ref={feedRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 no-scrollbar">
                    <AnimatePresence initial={false}>
                      {messages.map((m) => (
                        <motion.div
                          key={m.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.22 }}
                        >
                          <ChatBubble m={m} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {paused && (
                      <div className="flex items-center justify-center gap-2 py-2 text-[10px] text-white/30">
                        <Pause className="h-3 w-3" />
                        stream paused
                      </div>
                    )}
                  </div>

                  {/* Composer */}
                  <div className="border-t border-white/5 p-3">
                    <div className="relative flex items-center gap-2">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                        placeholder="Ask the swarm a question…"
                        className="w-full rounded-lg border border-white/10 bg-black/50 py-2 pl-3 pr-10 text-[13px] text-white/90 placeholder:text-white/25 focus:border-cyan-300/35 focus:outline-none"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!draft.trim()}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-gradient-to-r from-cyan-400 to-purple-400 p-1.5 text-black disabled:opacity-40"
                        aria-label="Send"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              </div>

              {/* ~70% — source + live hosted preview */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <GitBranch className="h-4 w-4 shrink-0 text-cyan-300" />
                      <span className="text-sm text-white/90">Code & preview</span>
                      <div className="flex rounded-lg border border-white/10 bg-black/50 p-0.5">
                        <button
                          type="button"
                          onClick={() => setWorkspacePanelTab("code")}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${
                            workspacePanelTab === "code"
                              ? "bg-cyan-300/20 text-cyan-200"
                              : "text-white/50 hover:text-white/80"
                          }`}
                        >
                          <Code2 className="h-3.5 w-3.5" aria-hidden />
                          Code
                        </button>
                        <button
                          type="button"
                          onClick={() => setWorkspacePanelTab("preview")}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${
                            workspacePanelTab === "preview"
                              ? "bg-cyan-300/20 text-cyan-200"
                              : "text-white/50 hover:text-white/80"
                          }`}
                        >
                          <Zap className="h-3.5 w-3.5" aria-hidden />
                          Preview
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={uniqueArtifactPaths === 0 || previewStarting || !getAuthToken()}
                        title={
                          !getAuthToken()
                            ? "Sign in with your wallet to preview"
                            : "Materialize artifacts, install, build — embeds in Preview tab"
                        }
                        onClick={() => void loadHostedPreview()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-white/85 transition hover:border-cyan-300/35 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {previewStarting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" aria-hidden />
                        ) : (
                          <Zap className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                        )}
                        Build preview
                      </button>
                      <button
                        type="button"
                        disabled={!previewEmbedUrl}
                        title="Open the current preview URL in a new tab"
                        onClick={() => {
                          if (previewEmbedUrl) window.open(previewEmbedUrl, "_blank", "noopener,noreferrer");
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/80 transition hover:border-cyan-300/35 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                        Tab
                      </button>
                      <button
                        type="button"
                        disabled={uniqueArtifactPaths === 0 || zipDownloading || !getAuthToken()}
                        title={
                          !getAuthToken()
                            ? "Sign in with your wallet to download"
                            : "Download all files as a ZIP"
                        }
                        onClick={() => {
                          void (async () => {
                            setZipDownloading(true);
                            const res = await downloadMissionArtifactsZip(mission.id);
                            setZipDownloading(false);
                            if (!res.ok) toast.error(res.message ?? "ZIP download failed");
                          })();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-white/85 transition hover:border-cyan-300/35 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {zipDownloading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" aria-hidden />
                        ) : (
                          <Download className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                        )}
                        ZIP
                      </button>
                      <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                        {uniqueArtifactPaths} file{uniqueArtifactPaths === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  {workspacePanelTab === "code" ? (
                  <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[minmax(200px,280px)_1fr]">
                    {/* File tree panel */}
                    <div
                      className={`min-h-0 flex-1 rounded-xl border border-white/[0.06] bg-gradient-to-b from-black/50 to-black/[0.35] ${
                        artifactsLoading || uniqueArtifactPaths === 0 ? "flex flex-col" : "overflow-y-auto no-scrollbar p-2"
                      }`}
                    >
                      {artifactsLoading ? (
                        /* Skeleton file tree */
                        <div className="space-y-1 p-2">
                          {[
                            { w: "w-3/4", indent: 0 }, { w: "w-2/3", indent: 1 }, { w: "w-1/2", indent: 1 },
                            { w: "w-3/5", indent: 1 }, { w: "w-2/3", indent: 0 }, { w: "w-1/2", indent: 1 },
                            { w: "w-3/4", indent: 1 }, { w: "w-1/3", indent: 2 }, { w: "w-2/5", indent: 2 },
                            { w: "w-2/3", indent: 0 }, { w: "w-1/2", indent: 1 },
                          ].map((row, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 rounded-md px-2 py-1"
                              style={{ paddingLeft: `${8 + row.indent * 16}px` }}
                            >
                              <div className="h-3 w-3 flex-shrink-0 animate-pulse rounded-sm bg-white/10" />
                              <div
                                className={`h-2.5 animate-pulse rounded-full bg-white/10 ${row.w}`}
                                style={{ animationDelay: `${i * 60}ms` }}
                              />
                            </div>
                          ))}
                        </div>
                      ) : uniqueArtifactPaths === 0 ? (
                        <WorkspacePanelEmptyState
                          icon={FolderOpen}
                          title="No deliverables yet"
                          description="When the swarm runs, generated files appear here as a browsable tree — frontend, backend, and docs."
                          footnote={
                            !getAuthToken() ? (
                              <span className="text-amber-200/85">
                                Sign in with the same wallet that runs the swarm — code is loaded from the API after auth.
                              </span>
                            ) : (
                              <>
                                <span className="font-medium text-white/55">Tip</span>
                                <span className="text-white/40"> · </span>
                                If the log shows files verified but this stays empty, refresh the page or confirm you did not switch
                                wallets (artifacts are stored per wallet).
                              </>
                            )
                          }
                        />
                      ) : (
                        <ArtifactTreeView
                          nodes={artifactTree.children}
                          depth={0}
                          collapsed={collapsedArtifactFolders}
                          toggleFolder={toggleArtifactFolder}
                          selectedArtifactId={selectedArtifactId}
                          onSelectFile={setSelectedArtifactId}
                        />
                      )}
                    </div>
                    {/* Code viewer panel */}
                    {(() => {
                      const a = artifacts.find((x) => x.id === selectedArtifactId) ?? artifacts[0];
                      if (artifactsLoading) {
                        return (
                          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-b from-black/45 to-black/30">
                            {/* Skeleton header */}
                            <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                              <div className="space-y-1">
                                <div className="h-2.5 w-40 animate-pulse rounded-full bg-white/10" />
                                <div className="h-2 w-24 animate-pulse rounded-full bg-white/[0.06]" />
                              </div>
                              <div className="h-6 w-10 animate-pulse rounded-md bg-white/[0.06]" />
                            </div>
                            {/* Skeleton code lines */}
                            <div className="flex-1 space-y-2 overflow-hidden p-4">
                              {[
                                "w-1/3", "w-3/5", "w-1/2", "w-2/3", "w-1/4",
                                "w-3/4", "w-2/5", "w-1/2", "w-3/5", "w-1/3",
                                "w-2/3", "w-1/2", "w-4/5", "w-1/3", "w-3/5",
                                "w-1/2", "w-2/3", "w-1/4",
                              ].map((w, i) => (
                                <div
                                  key={i}
                                  className={`h-2.5 animate-pulse rounded-full bg-white/[0.07] ${w}`}
                                  style={{ animationDelay: `${i * 40}ms`, marginLeft: i % 3 !== 0 ? "1.5rem" : "0" }}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      }
                      if (!a) {
                        return (
                          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-b from-black/45 to-black/30">
                            <WorkspacePanelEmptyState
                              icon={Code2}
                              title="No file open"
                              description={
                                uniqueArtifactPaths === 0
                                  ? "Source for the selected file shows here once artifacts exist. Run the swarm first, then pick a path from the tree."
                                  : "Select a file from the tree on the left to read its contents and copy snippets."
                              }
                            />
                          </div>
                        );
                      }
                      return (
                          <div className="flex h-full max-h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-black/55">
                            <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
                              <div className="min-w-0">
                                <div className="truncate font-mono text-[11px] text-white/75">{a.path}</div>
                                <div className="text-[10px] text-white/35">{a.agent} · {a.role} · {a.language ?? a.kind}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(a.content)}
                                className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/75 hover:border-cyan-300/30"
                              >
                                Copy
                              </button>
                            </div>
                            <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[12px] leading-relaxed text-white/85">
                              <code>{a.content}</code>
                            </pre>
                          </div>
                      );
                    })()}
                  </div>
                  ) : (
                  <div className="relative flex min-h-0 flex-1 flex-col bg-black/30 p-2">
                    {previewEmbedUrl ? (
                      <iframe
                        title="Mission preview"
                        src={previewEmbedUrl}
                        className="min-h-0 w-full flex-1 rounded-lg border border-white/10 bg-white"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                      />
                    ) : (
                      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-dashed border-white/[0.14] bg-gradient-to-b from-black/25 to-transparent">
                        <WorkspacePanelEmptyState
                          icon={Sparkles}
                          title="Preview not built"
                          description="We’ll render your generated app in this frame after a successful build. Verified swarms try to start automatically; you can trigger a build anytime."
                          footnote={
                            <>
                              Press <span className="rounded border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-px font-mono text-[11px] text-cyan-200/90">Build preview</span>{" "}
                              in the bar above. In local dev, previews load through the same origin so the iframe stays secure.
                            </>
                          }
                        />
                      </div>
                    )}
                  </div>
                  )}
                </Card>
              </div>
            </div>

            <AnimatePresence>
              {activityDrawerOpen ? (
                <motion.div
                  key="activity-drawer"
                  className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[2px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setActivityDrawerOpen(false)}
                >
                  <motion.aside
                    initial={{ x: 48, opacity: 0.9 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 48, opacity: 0.9 }}
                    transition={{ type: "spring", damping: 28, stiffness: 320 }}
                    className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#070a12]/97 p-4 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-white/90">
                        <LayoutPanelLeft className="h-4 w-4 text-cyan-300" />
                        Mission activity
                      </div>
                      <button
                        type="button"
                        onClick={() => setActivityDrawerOpen(false)}
                        className="rounded-lg border border-white/10 p-1.5 text-white/70 hover:border-cyan-300/30 hover:text-white"
                        aria-label="Close"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <Card>
                        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                          <div className="flex items-center gap-2 text-sm">
                            <Cpu className="h-4 w-4 text-cyan-300" />
                            Roster
                          </div>
                          <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">tap to target</span>
                        </div>
                        <div className="max-h-[220px] space-y-2 overflow-y-auto p-3">
                          {ALL_AGENTS.slice(0, 8).map((a, i) => {
                            const states = ["Thinking", "Delegating", "Executing", "Reviewing", "Retrieving Memory", "Negotiating", "Waiting", "Routing"];
                            const active = a.name === selectedAgent;
                            return (
                              <button
                                key={a.name}
                                type="button"
                                onClick={() => setSelectedAgent(a.name)}
                                className={`w-full rounded-xl border p-2.5 text-left text-xs transition ${
                                  active ? "border-cyan-300/40 bg-cyan-300/5" : "border-white/10 bg-black/30 hover:border-white/20"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-white/90">{a.name}</span>
                                  <span className="text-[10px] text-white/40">{a.model}</span>
                                </div>
                                <div className="mt-1 text-[10px]" style={{ color: a.color }}>
                                  {states[i]}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </Card>

                      <Card>
                        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                          <div className="flex items-center gap-2 text-sm">
                            <Brain className="h-4 w-4 text-purple-300" />
                            Reasoning stream
                          </div>
                          <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">live</span>
                        </div>
                        <div className="p-3">
                          <div
                            ref={reasoningRef}
                            onScroll={(e) => onScrollStick(e.currentTarget, setReasoningStickBottom)}
                            className="max-h-[200px] overflow-y-auto rounded-lg border border-white/5 bg-black/60 p-3 font-mono text-[11px] leading-relaxed"
                          >
                            {logLines.length === 0 ? (
                              <div className="text-white/40">Waiting for live logs…</div>
                            ) : (
                              logLines.map((l, idx) => (
                                <div key={`${l.ts}-${l.agent}-${idx}`} className="text-white/80">
                                  <span className="text-white/35">{new Date(l.ts).toLocaleTimeString("en-US", { hour12: false })}</span>
                                  <span className="text-white/35"> · </span>
                                  <span className="text-cyan-200">{l.agent}</span>
                                  <span className="text-white/35"> · </span>
                                  <span className="text-white/80">{l.message}</span>
                                </div>
                              ))
                            )}
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

                      <Card>
                        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                          <div className="flex items-center gap-2 text-sm">
                            <Database className="h-4 w-4 text-amber-300" />
                            Memory recall
                          </div>
                          <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{missionMemoryHits.length} hits</span>
                        </div>
                        <div className="space-y-2 p-3">
                          {missionMemoryHits.length === 0 ? (
                            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs text-white/50">
                              No mission memory yet.
                            </div>
                          ) : missionMemoryHits.map((n) => (
                            <div
                              key={n.id}
                              className="group flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 transition hover:border-cyan-300/30"
                            >
                              <div
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ background: "#f59e0b", boxShadow: "0 0 10px rgba(245,158,11,0.8)" }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-xs text-white/85">{n.text}</div>
                                <div className="truncate font-mono text-[10px] text-white/40">{n.id}</div>
                              </div>
                              <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] tabular-nums text-cyan-200">
                                {typeof n.score === "number" ? n.score.toFixed(2) : "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </Card>

                      <Card>
                        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                          <div className="flex items-center gap-2 text-sm">
                            <Activity className="h-4 w-4 text-cyan-300" />
                            Execution timeline
                          </div>
                          <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">today</span>
                        </div>
                        <div className="p-4">
                          <div
                            ref={timelineRef}
                            onScroll={(e) => onScrollStick(e.currentTarget, setTimelineStickBottom)}
                            className="max-h-[240px] space-y-3 overflow-y-auto pr-1"
                          >
                            {(timelineEvents.length ? timelineEvents : [{ ts: Date.now(), l: "No events yet", c: "#94a3b8" }]).map((e, i, arr) => (
                              <motion.div
                                key={`${e.ts}-${i}`}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.04 }}
                                className="flex items-center gap-3"
                              >
                                <div className="flex flex-col items-center">
                                  <div
                                    className="h-2.5 w-2.5 rounded-full ring-2 ring-black"
                                    style={{ background: e.c, boxShadow: `0 0 10px ${e.c}` }}
                                  />
                                  {i < arr.length - 1 && (
                                    <div className="h-6 w-px bg-gradient-to-b from-white/20 to-transparent" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="text-sm text-white/85">{e.l}</div>
                                  <div className="font-mono text-[10px] text-white/30">
                                    {new Date(e.ts).toLocaleTimeString("en-US", { hour12: false })}
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      </Card>

                      <Card>
                        <div className="border-b border-white/5 px-4 py-3">
                          <div className="flex items-center gap-2 text-sm">
                            <Zap className="h-4 w-4 text-cyan-300" />
                            Quick actions
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 p-3 text-xs">
                          <Link to="/dashboard" className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 hover:border-cyan-300/30">
                            Mission Control
                            <ArrowRight className="h-3 w-3 text-cyan-300" />
                          </Link>
                          <button
                            type="button"
                            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 hover:border-cyan-300/30"
                          >
                            Export logs
                            <Terminal className="h-3 w-3 text-cyan-300" />
                          </button>
                        </div>
                      </Card>
                    </div>
                  </motion.aside>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentWorkspace() {
  const { missions, patchLocal, walletConnected } = useMissions();
  const hasMission = missions.length > 0;

  // Reactive: re-read whenever MissionSwitcher changes the active mission
  const [pinnedId, setPinnedId] = useState(() => localStorage.getItem("hm-active-mission-id"));
  useEffect(() => {
    const sync = () => setPinnedId(localStorage.getItem("hm-active-mission-id"));
    // "storage" fires from other tabs; "hm-active-mission-changed" fires from MissionSwitcher in same tab
    window.addEventListener("storage", sync);
    window.addEventListener("hm-active-mission-changed", sync);
    window.addEventListener("hm-missions-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("hm-active-mission-changed", sync);
      window.removeEventListener("hm-missions-updated", sync);
    };
  }, []);

  const activeMission =
    (pinnedId ? missions.find((m) => m.id === pinnedId) : null) ??
    missions.find((m) => m.status === "active") ??
    missions[0];

  if (!hasMission) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopNav />
          <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
            <Particles count={26} />
            <WalletGate connected={walletConnected}>
              <div className="relative flex flex-1 items-center justify-center px-6 py-10">
                <div className="relative max-w-md text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10">
                    <Bot className="h-7 w-7 text-cyan-300" />
                  </div>
                  <h2 className="mt-5 text-2xl tracking-tight">No active workforce yet</h2>
                  <p className="mt-2 text-sm text-white/55">
                    Create your first mission to spin up an autonomous agent crew. The workspace will come alive with realtime coordination,
                    reasoning, and execution.
                  </p>
                  <div className="mt-6 flex justify-center gap-2">
                    <Link
                      to="/missions/new"
                      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-5 py-2.5 text-sm text-black"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
                      <Plus className="relative h-4 w-4" />
                      <span className="relative">Create Mission</span>
                    </Link>
                    <Link
                      to="/dashboard"
                      className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm text-white/80 hover:border-cyan-300/30"
                    >
                      Back to Dashboard
                    </Link>
                  </div>
                </div>
              </div>
            </WalletGate>
          </div>
        </div>
      </div>
    );
  }

  return <AgentWorkspaceMissionBody key={activeMission.id} mission={activeMission} patchLocal={patchLocal} />;
}
