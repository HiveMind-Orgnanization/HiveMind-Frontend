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
import { SandpackProvider, SandpackPreview as SandpackFrame, useSandpack } from "@codesandbox/sandpack-react";

// All agent invocations always use GPT-5 for best results.
const AGENT_MODEL = "gpt-5.5-long-context";

type ChatThought = {
  agent: string;
  color: string;
  text: string;
  ts: string;
  done: boolean;
  files?: string[];
};

type ChatMsg = {
  id: number;
  agent: string;
  color: string;
  text: string;
  state?: "thinking" | "delegating" | "executing" | "approved" | "failed";
  ts: string;
  kind?: "system" | "system_done" | "system_warn" | "hivemind_swarm";
  /** Elapsed seconds stored when swarm completes. */
  elapsedSecs?: number;
  /** Per-agent thought entries for the collapsible reasoning panel. */
  thoughts?: ChatThought[];
};

const seedMessages: ChatMsg[] = [];

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

/** Single HiveMind bubble: collapsible agent thought chain + final reply. */
/** Single thought entry inside the collapsible panel — Claude tool-call style. */
function HiveMindThought({ t }: { t: ChatThought }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="min-w-0"
    >
      <div className="flex items-center gap-2 mb-0.5">
        <div
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[7px] font-bold"
          style={{ background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}28` }}
        >
          {t.agent.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-[11.5px] font-medium" style={{ color: t.color }}>
          {t.agent}
        </span>
        <span className="ml-auto text-[10px] text-white/20 font-mono">{t.ts}</span>
        {!t.done ? (
          <motion.span
            animate={{ opacity: [0.25, 0.9, 0.25] }}
            transition={{ duration: 1.3, repeat: Infinity }}
            className="text-[10px] text-white/30"
          >
            working…
          </motion.span>
        ) : (
          <span className="text-[10px] text-emerald-400/60">done</span>
        )}
      </div>

      {t.text && (
        <p className="pl-[26px] text-[11.5px] leading-relaxed text-white/38">
          {t.text.length > 260 ? `${t.text.slice(0, 260)}…` : t.text}
        </p>
      )}

      {t.files && t.files.length > 0 && (
        <div className="mt-1.5 pl-[26px] space-y-[3px]">
          {t.files.slice(0, 8).map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 font-mono text-[10.5px]">
              <span className="text-emerald-400/70 select-none">+</span>
              <span className="text-white/30 truncate">{f}</span>
            </div>
          ))}
          {t.files.length > 8 && (
            <p className="pl-3 text-[10px] text-white/18">+{t.files.length - 8} more files</p>
          )}
        </div>
      )}
    </motion.div>
  );
}

/** Main HiveMind message — Claude-style with live timer, thought chain, and final reply. */
function HiveMindSwarmBubble({ m }: { m: ChatMsg }) {
  const [open, setOpen] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const done = m.state === "approved" || m.state === "failed";
  const thoughts = m.thoughts ?? [];

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [done]);

  const displaySecs = done ? (m.elapsedSecs ?? Math.max(elapsed, thoughts.length * 9)) : elapsed;
  const activeThought = thoughts.find((t) => !t.done);

  return (
    <div className="space-y-2.5">
      {/* Animated dots while waiting for first thought */}
      {!done && thoughts.length === 0 && (
        <motion.div
          className="flex items-center gap-1.5"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-white/25"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </motion.div>
      )}

      {/* Current agent status while running */}
      {!done && activeThought && (
        <motion.p
          key={activeThought.agent}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-[12.5px] text-white/35"
        >
          {activeThought.agent} is working…
        </motion.p>
      )}

      {/* Thought collapsible — shows once we have at least one entry */}
      {thoughts.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="group flex items-center gap-1.5 text-[12.5px] text-white/40 hover:text-white/70 transition-colors select-none"
          >
            <span
              className={`h-[7px] w-[7px] rounded-full flex-shrink-0 ${
                done ? "bg-emerald-400/80" : "bg-cyan-400/70 animate-pulse"
              }`}
            />
            <span>{done ? `Thought for ${displaySecs}s` : `Thinking for ${elapsed}s`}</span>
            <ChevronRight
              className={`h-3.5 w-3.5 text-white/30 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            />
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="thought-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="mt-2.5 ml-1 border-l border-white/[0.08] pl-4 space-y-3.5 pb-1">
                  {thoughts.map((t, i) => (
                    <HiveMindThought key={`${t.agent}-${i}`} t={t} />
                  ))}
                  {!done && (
                    <motion.div
                      animate={{ opacity: [0.2, 0.7, 0.2] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="flex items-center gap-1.5 text-[11px] text-white/22"
                    >
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Coordinating…</span>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Final answer */}
      {done && m.text && m.text.trim().length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="pt-0.5"
        >
          <AgentMessageMarkdown source={m.text} />
        </motion.div>
      )}

      {m.state === "failed" && !m.text && (
        <p className="text-[13px] text-red-400/80">Swarm run failed. Try again.</p>
      )}
    </div>
  );
}

/** Minimal system divider — mission lifecycle notifications. */
function SystemNotice({ m }: { m: ChatMsg }) {
  const icon = m.kind === "system_done" ? "✓" : m.kind === "system_warn" ? "⚠" : "·";
  const color = m.kind === "system_done" ? "text-emerald-400/50" : m.kind === "system_warn" ? "text-amber-400/50" : "text-white/25";
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="h-px flex-1 bg-white/[0.04]" />
      <span className={`text-[10.5px] font-mono ${color} flex items-center gap-1.5`}>
        <span>{icon}</span>
        <span className="max-w-[340px] truncate">{m.text}</span>
      </span>
      <div className="h-px flex-1 bg-white/[0.04]" />
    </div>
  );
}

/** Route a ChatMsg to the correct visual component — Claude-style: only HiveMind + User. */
function ChatBubble({ m }: { m: ChatMsg }) {
  if (m.kind === "hivemind_swarm") return <HiveMindSwarmBubble m={m} />;
  if (m.kind === "system" || m.kind === "system_done" || m.kind === "system_warn") return <SystemNotice m={m} />;
  if (m.agent === "Operator") return <UserBubble m={m} />;
  return null;
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

// ─── Sandpack in-browser preview ────────────────────────────────────────────

const SANDPACK_SKIP_FILES = new Set([
  "vite.config.ts", "vite.config.js", "vite.config.mts",
  "postcss.config.js", "postcss.config.cjs", "postcss.config.ts",
  "tailwind.config.ts", "tailwind.config.js",
  ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".prettierrc",
]);

const SANDPACK_SKIP_DEPS = new Set([
  "vite", "@vitejs/plugin-react", "@vitejs/plugin-react-swc", "@tailwindcss/vite",
  "typescript", "autoprefixer", "postcss", "tailwindcss",
  "@types/react", "@types/react-dom", "@types/node",
]);

/** LLMs hallucinate npm package names — fix the common ones before handing to Sandpack CDN. */
const PKG_ALIASES: Record<string, string> = {
  "@lucide/react": "lucide-react",
  "lucide/react": "lucide-react",
  "@radix/react-icons": "@radix-ui/react-icons",
  "@heroicons/react": "heroicons",
  "framer": "framer-motion",
  "react-query": "@tanstack/react-query",
  "@shadcn/ui": "",
  "shadcn-ui": "",
};

function normalizeDeps(deps: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, ver] of Object.entries(deps)) {
    if (SANDPACK_SKIP_DEPS.has(name)) continue;
    const alias = PKG_ALIASES[name];
    if (alias === "") continue; // remove entirely
    if (alias) { out[alias] = out[alias] ?? ver; continue; }
    out[name] = ver;
  }
  return out;
}

/** Resolve @/ path alias to relative paths (Vite convention: @/ → /src/). */
function resolveAtAlias(code: string, sp: string): string {
  const dir = sp.replace(/\/[^/]+$/, ""); // e.g. /src/components
  const parts = dir.split("/").filter(Boolean); // ["src", "components"]
  const srcIdx = parts.indexOf("src");
  if (srcIdx < 0) return code;
  const levelsUp = parts.length - srcIdx - 1;
  const prefix = levelsUp === 0 ? "." : Array(levelsUp).fill("..").join("/");
  return code.replace(/(['"])@\/([^'"]+)\1/g, (_, q, p) => `${q}${prefix}/${p}${q}`);
}

function sandpackCss(css: string): string {
  return css
    .replace(/@tailwind\s+\w+;[ \t]*/gm, "")
    .replace(/@import\s+["']tailwindcss["'];[ \t]*/gm, "")
    .replace(/@import\s+["']tailwindcss\/[^"']*["'];[ \t]*/gm, "");
}

/**
 * Sandpack's in-browser bundler does NOT support Vite's `import.meta.env.*` syntax —
 * trying to evaluate transpiled code with `import.meta` yields:
 *   "Cannot use 'import.meta' outside a module"
 * (visible in the screenshot for mission M-793).
 *
 * Agents are intentionally instructed in `agent-runtime.ts` to use `import.meta.env.VITE_API_URL`
 * because that's correct for the hosted Vite preview ("Host" button → real `vite build`).
 * For the in-browser Sandpack preview we replace the references with safe runtime values so the
 * generated code runs unchanged. The DB copy still has the production-correct `import.meta` form.
 *
 * - `import.meta.env.VITE_API_URL` → `""`  (no backend in Sandpack — fetch becomes relative no-op)
 * - `import.meta.env.BASE_URL`     → `"/"`
 * - `import.meta.env.MODE`         → `"development"`
 * - `import.meta.env.DEV`          → `true`
 * - `import.meta.env.PROD`         → `false`
 * - `import.meta.env.SSR`          → `false`
 * - any other `import.meta.env.X`  → `""`
 * - `import.meta.url`              → `""`
 * - `import.meta.hot`              → `undefined`
 * - bare `import.meta`             → `({ env: {}, url: "", hot: undefined })`
 */
function sandpackJsTs(code: string): string {
  if (!code.includes("import.meta")) return code;
  let next = code;
  next = next.replace(/import\.meta\.env\.VITE_API_URL\b/g, '""');
  next = next.replace(/import\.meta\.env\.BASE_URL\b/g, '"/"');
  next = next.replace(/import\.meta\.env\.MODE\b/g, '"development"');
  next = next.replace(/import\.meta\.env\.DEV\b/g, "true");
  next = next.replace(/import\.meta\.env\.PROD\b/g, "false");
  next = next.replace(/import\.meta\.env\.SSR\b/g, "false");
  next = next.replace(/import\.meta\.env\.[A-Za-z_][A-Za-z0-9_]*/g, '""');
  next = next.replace(/import\.meta\.env\b/g, "({})");
  next = next.replace(/import\.meta\.url\b/g, '""');
  next = next.replace(/import\.meta\.hot\b/g, "undefined");
  next = next.replace(/\bimport\.meta\b/g, '({ env: {}, url: "", hot: undefined })');
  return next;
}

/**
 * Swarm-generated React often uses `export function App` without `export default`, or `import App from "./App"`
 * while the file on disk is `app.tsx` — Sandpack then renders `<App />` as undefined ("Element type is invalid").
 */
function sandpackFixAppEntryExportsAndImports(files: Record<string, { code: string }>): void {
  const appKey = ["/src/App.tsx", "/src/app.tsx", "/src/App.jsx", "/src/app.jsx"].find((k) => files[k]);
  if (!appKey) return;
  const importStem = (appKey.split("/").pop() ?? "App").replace(/\.(tsx|jsx|ts|js)$/i, "");
  const raw = files[appKey]!.code;
  if (!/\bexport\s+default\b/.test(raw)) {
    if (
      /\bexport\s+function\s+App\b/.test(raw) ||
      /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+App\s*\(/.test(raw) ||
      /\bconst\s+App\s*=/.test(raw) ||
      /\bconst\s+App\s*:\s*React\.FC/.test(raw)
    ) {
      files[appKey] = { code: `${raw.trimEnd()}\n\nexport default App;\n` };
    }
  }
  const entryKeys = [
    "/src/main.tsx", "/src/main.ts", "/src/index.tsx", "/src/index.ts", "/src/main.jsx", "/src/index.jsx",
  ];
  for (const ek of entryKeys) {
    const m = files[ek];
    if (!m) continue;
    let c = m.code;
    c = c.replace(/from\s+(["'])\.\/([Aa]pp)\1/g, (_full, q: string) => `from ${q}./${importStem}${q}`);
    files[ek] = { code: c };
  }
}

function buildSandpackFiles(artifacts: MissionArtifact[]): {
  files: Record<string, { code: string }>;
  dependencies: Record<string, string>;
  entry: string;
} {
  const deduped = dedupeArtifactsByPath(artifacts);
  const hasFe = deduped.some((a) => a.path.startsWith("frontend/"));
  const relevant = hasFe
    ? deduped.filter((a) => a.kind === "file" && a.path.startsWith("frontend/"))
    : deduped.filter((a) => a.kind === "file" && !a.path.startsWith("backend/") && !a.path.startsWith("docs/"));

  const files: Record<string, { code: string }> = {};
  let dependencies: Record<string, string> = {};

  for (const art of relevant) {
    let rel = hasFe ? art.path.replace(/^frontend\//, "") : art.path;
    const fname = rel.split("/").pop() ?? "";
    if (SANDPACK_SKIP_FILES.has(fname)) continue;

    if (rel === "package.json") {
      try {
        const pkg = JSON.parse(art.content) as { dependencies?: Record<string, string> };
        dependencies = normalizeDeps({ ...(pkg.dependencies ?? {}) });
      } catch { /* ignore */ }
      continue;
    }

    // Sandpack manages its own HTML shell — skip the project's index.html
    if (rel === "index.html" || rel === "public/index.html") continue;

    const sp = rel.startsWith("/") ? rel : `/${rel}`;
    let code = art.content;
    if (sp.endsWith(".css")) code = sandpackCss(code);
    else if (sp.match(/\.(tsx?|jsx?)$/)) {
      code = resolveAtAlias(code, sp);
      // Strip Vite-only `import.meta.*` so Sandpack's bundler doesn't throw
      // "Cannot use 'import.meta' outside a module" during evaluation.
      code = sandpackJsTs(code);
    }
    files[sp] = { code };
  }

  // Ensure a valid React entry point exists under /src/
  const ENTRY_CANDIDATES = ["/src/main.tsx", "/src/main.ts", "/src/index.tsx", "/src/index.ts"];
  if (!ENTRY_CANDIDATES.some((c) => files[c])) {
    const appKey = ["/src/App.tsx", "/src/app.tsx", "/src/App.ts"].find((k) => files[k]);
    const appImport = appKey ? appKey.replace("/src/", "./").replace(/\.tsx?$/, "") : null;
    const cssImport = files["/src/index.css"] ? '\nimport "./index.css";' : "";
    if (appImport) {
      files["/src/main.tsx"] = {
        code: `import React from "react";\nimport ReactDOM from "react-dom/client";${cssImport}\nimport App from "${appImport}";\nReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);`,
      };
    }
  }

  // Detect the entry point: prefer src/main.tsx hierarchy, fallback to template default
  const entry = ENTRY_CANDIDATES.find((c) => files[c]) ?? "/index.tsx";

  // Create stubs for any CSS imports that reference missing files (Sandpack hard-crashes on missing modules).
  const allPaths = new Set(Object.keys(files));
  for (const [filePath, { code }] of Object.entries(files)) {
    if (!filePath.match(/\.(tsx?|jsx?)$/)) continue;
    const dir = filePath.replace(/\/[^/]+$/, "") || "/";
    for (const m of code.matchAll(/import\s+(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+\.css)['"]/g)) {
      const imp = m[1]!;
      if (imp.startsWith("http") || !imp.match(/^\.\.?\//)) continue;
      const parts = `${dir}/${imp}`.split("/").filter(Boolean);
      const resolved: string[] = [];
      for (const p of parts) { if (p === "..") resolved.pop(); else if (p !== ".") resolved.push(p); }
      const abs = `/${resolved.join("/")}`;
      if (!allPaths.has(abs)) { files[abs] = { code: "" }; allPaths.add(abs); }
    }
  }

  sandpackFixAppEntryExportsAndImports(files);

  // Inject a base CSS reset so the preview is never completely invisible.
  // The Tailwind Play CDN handles utility classes; this guarantees box-sizing + font.
  const BASE_CSS_KEY = "/src/_sandpack_base.css";
  files[BASE_CSS_KEY] = {
    code: `*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; min-height: 100vh; }
#root { min-height: 100vh; display: flex; flex-direction: column; }`,
  };
  // Prepend the base import to the entry file if it's not already there
  const entryFile = files[entry];
  if (entryFile && !entryFile.code.includes("_sandpack_base")) {
    const relBase = entry.replace(/\/[^/]+$/, "") === "/src"
      ? "./_sandpack_base.css"
      : "/src/_sandpack_base.css";
    files[entry] = { code: `import "${relBase}";\n${entryFile.code}` };
  }

  return { files, dependencies, entry };
}

function SandpackErrorMonitor({ onErrors }: { onErrors: (errs: string[]) => void }) {
  const { sandpack, listen } = useSandpack();
  // reportedRef prevents duplicate reports in the same error state.
  // lastReportTimeRef allows re-firing after 30 s so a failed fix can be retried.
  const reportedRef = useRef(false);
  const lastReportTimeRef = useRef(0);
  const accRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Primary: sandpack.errors state — bundler/compilation errors only.
  useEffect(() => {
    try {
      const errs =
        ((sandpack as unknown as { errors?: unknown[] }).errors ?? []) as Array<{ message?: string } | string>;
      const messages = errs
        .map((e) => (typeof e === "string" ? e : (e as { message?: string }).message ?? ""))
        .filter((s) => s.length > 4);

      if (messages.length === 0) {
        reportedRef.current = false;
        return;
      }
      const now = Date.now();
      // Fire immediately, or re-fire if it's been >30 s (allows retry after a failed fix).
      if (!reportedRef.current || now - lastReportTimeRef.current > 30_000) {
        reportedRef.current = true;
        lastReportTimeRef.current = now;
        onErrors(messages);
      }
    } catch { /* never crash the preview */ }
  }, [(sandpack as unknown as { errors?: unknown[] }).errors, onErrors]);

  // Fallback: message bus — bundler events AND iframe runtime errors that look like real
  // compile/eval failures. We deliberately skip noisy console.warn / console.info; we DO
  // pick up uncaught runtime errors with patterns like "Cannot use 'import.meta'..." which
  // are the exact failures the user is seeing in the live preview.
  useEffect(() => {
    /** Heuristic: does this iframe console message look like a fixable compile/eval error? */
    const looksLikeFixableRuntimeError = (text: string): boolean => {
      if (!text || text.length < 4) return false;
      const t = text.toLowerCase();
      // React Router "future flag" warnings are advisory only — never trigger a repair from them.
      if (/react router future flag warning/.test(t)) return false;
      return (
        /cannot use ['"]?import\.meta['"]?/.test(t) ||
        /uncaught (syntaxerror|referenceerror|typeerror)/.test(t) ||
        /^syntaxerror\b/.test(t) ||
        /^referenceerror\b/.test(t) ||
        /unexpected token/.test(t) ||
        /is not a function/.test(t) ||
        /is not defined/.test(t) ||
        /failed to fetch dynamically imported module/.test(t) ||
        /cannot find module/.test(t) ||
        /does not provide an export named/.test(t) ||
        /has no exported member/.test(t) ||
        /element type is invalid/.test(t) ||
        /no routes matched location/.test(t) ||
        /cannot read propert(y|ies) of (undefined|null)/.test(t) ||
        /cannot destructure propert(y|ies)/.test(t) ||
        /maximum update depth exceeded/.test(t) ||
        /objects are not valid as a react child/.test(t) ||
        /(invalid|missing) hook call/.test(t)
      );
    };

    const unsub = listen((msg: Record<string, unknown>) => {
      try {
        const isBundlerErr =
          (msg["type"] === "action" && msg["action"] === "show-error") ||
          msg["type"] === "compile-error" ||
          msg["type"] === "module-error" ||
          (msg["type"] === "done" &&
            (msg["compilatonError"] === true || msg["compileError"] === true));

        // Iframe runtime / console error events — Sandpack forwards these via `console` /
        // `urlback` / `error` event types depending on bundler version. Filter to the ones
        // that look like fixable compile/eval errors so we never spam the agent on warns.
        let runtimeErrText = "";
        if (!isBundlerErr) {
          const t = msg["type"];
          const candidate =
            t === "console" || t === "log" || t === "error" || t === "urlback"
              ? (() => {
                  const log = msg["log"] as Array<{ method?: string; data?: unknown[] }> | undefined;
                  if (Array.isArray(log)) {
                    return log
                      .filter((entry) => entry?.method === "error")
                      .map((entry) =>
                        (entry?.data ?? [])
                          .map((d) => (typeof d === "string" ? d : safeStringify(d)))
                          .join(" "),
                      )
                      .join("\n");
                  }
                  // Some bundler versions send a single message field.
                  const single =
                    typeof msg["message"] === "string"
                      ? (msg["message"] as string)
                      : typeof msg["error"] === "string"
                        ? (msg["error"] as string)
                        : "";
                  return single;
                })()
              : "";
          if (looksLikeFixableRuntimeError(candidate)) runtimeErrText = candidate.trim();
        }

        if (!isBundlerErr && !runtimeErrText) return;

        const text = isBundlerErr
          ? [msg["title"] ?? msg["name"], msg["message"]]
              .filter(Boolean)
              .join(": ")
              .trim()
          : runtimeErrText;
        if (text.length > 4) accRef.current.push(text);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          if (accRef.current.length > 0) {
            const now = Date.now();
            if (!reportedRef.current || now - lastReportTimeRef.current > 30_000) {
              reportedRef.current = true;
              lastReportTimeRef.current = now;
              onErrors([...accRef.current]);
            }
            accRef.current = [];
          }
        }, 1500);
      } catch { /* ignore */ }
    });
    return () => { unsub(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [listen, onErrors]);

  return null;
}

/** Best-effort JSON.stringify that swallows cycles/native objects. */
function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function SandpackLivePreview({
  artifacts,
  autoFixing,
  swarmRunning,
  onErrors,
}: {
  artifacts: MissionArtifact[];
  autoFixing: boolean;
  swarmRunning: boolean;
  onErrors: (errs: string[]) => void;
}) {
  const { files, dependencies, entry } = useMemo(() => buildSandpackFiles(artifacts), [artifacts]);
  const hasFiles = Object.keys(files).length > 0;
  // A real, user-meaningful app needs at least an App/main entry from the agent — not just
  // the synthesized base CSS + stub entry. Count only artifact-derived source files.
  const hasGeneratedAppCode = useMemo(() => {
    const deduped = dedupeArtifactsByPath(artifacts);
    return deduped.some((a) => {
      const p = a.path.toLowerCase();
      if (!p.startsWith("frontend/")) return false;
      return /\.(tsx|jsx|ts|js)$/.test(p) && !p.endsWith("vite-env.d.ts");
    });
  }, [artifacts]);

  // Capture errors here too so we can render a friendly overlay (raw error text is hidden from users).
  const [hasFatalError, setHasFatalError] = useState(false);
  const handleInternalErrors = useCallback(
    (errs: string[]) => {
      setHasFatalError(true);
      onErrors(errs);
    },
    [onErrors],
  );
  // Reset error state whenever a fresh artifact set arrives (swarm produced new code).
  useEffect(() => {
    setHasFatalError(false);
  }, [artifacts]);

  // Stable key — changes only when artifact set grows/changes, forcing re-bundle
  const sandpackKey = useMemo(() => {
    const d = dedupeArtifactsByPath(artifacts);
    return `${d.length}-${d[d.length - 1]?.createdAt ?? 0}`;
  }, [artifacts]);

  // SandpackPreview ignores flex/percentage heights — measure the container and pass
  // a real pixel height. Initialise from window so it's never a thin strip.
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState(() =>
    typeof window !== "undefined" ? Math.max(400, window.innerHeight - 220) : 520
  );
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 100) setFrameHeight(h);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    const raf1 = requestAnimationFrame(measure);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(measure));
    const t1 = setTimeout(measure, 150);
    const t2 = setTimeout(measure, 600);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // "Generating" overlay: shown while the swarm is still producing code OR has finished
  // but hasn't emitted real frontend source yet. Avoid flashing the Sandpack default
  // "Hello world" stub while the agents are still working.
  const showGenerating = !hasGeneratedAppCode && (swarmRunning || !hasFiles);
  if (showGenerating) {
    return (
      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-white/[0.08] bg-gradient-to-b from-[#0a1320]/70 via-[#070b14]/80 to-[#040810]/70 p-8 text-center"
      >
        <div className="relative">
          <div className="absolute inset-0 animate-pulse rounded-full bg-cyan-400/20 blur-xl" aria-hidden />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-500/10">
            <Loader2 className="h-7 w-7 animate-spin text-cyan-300" aria-hidden />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-white/95">
            {swarmRunning ? "Building your preview…" : "Waiting for the swarm to start…"}
          </div>
          <div className="max-w-sm text-xs text-white/55">
            The agents are writing your app. The preview will appear here automatically once the code is ready.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10">
      {autoFixing && (
        <div className="flex items-center gap-2 border-b border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-300">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Polishing the preview… the agent is fixing an issue.
        </div>
      )}
      {/* This div is the height source — ResizeObserver reads its real pixel height */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} className="relative">
        <SandpackProvider
          key={sandpackKey}
          template="react-ts"
          files={files}
          customSetup={{ dependencies, entry }}
          options={{ externalResources: ["https://cdn.tailwindcss.com"] }}
          theme="dark"
        >
          <SandpackErrorMonitor onErrors={handleInternalErrors} />
          <SandpackFrame
            showOpenInCodeSandbox={false}
            showRefreshButton
            style={{ width: "100%", height: `${Math.max(200, frameHeight - 24)}px` }}
          />
        </SandpackProvider>
        {hasFatalError && !autoFixing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4">
            <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border border-amber-300/30 bg-[#1a1407]/90 px-4 py-3 text-xs text-amber-100/90 shadow-lg backdrop-blur">
              <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" aria-hidden />
              <div className="space-y-1">
                <div className="font-medium text-amber-100">Preview hit a snag</div>
                <div className="text-amber-100/70">
                  The agents are looking at it now. If it doesn’t recover in a moment, try sending a follow-up message in chat.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
  // Stable ID of the in-progress HiveMind swarm bubble so onProgress can update it.
  const hivemindMsgIdRef = useRef<number | null>(null);
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
  const [previewAutoFixing, setPreviewAutoFixing] = useState(false);
  const previewAutoFixAttemptsRef = useRef(0);
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
  /** True whenever the swarm or any in-flight agent invoke is producing code — drives the preview "Building…" overlay. */
  const swarmRunning = useMemo(
    () =>
      autoInvoking ||
      messages.some((m) => m.state === "thinking" || m.state === "delegating" || m.state === "executing"),
    [autoInvoking, messages],
  );

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
          // System done/warn clears the swarm ref
          if (isDone) hivemindMsgIdRef.current = null;
          setMessages((prev) => [
            ...prev,
            {
              id: evt.payload.ts,
              agent: "HiveMind",
              color: "#22d3ee",
              text: m.replace(/^\[system(?::\w+)?\]\s*/, ""),
              state: "executing",
              kind: isDone ? "system_done" : isWarn ? "system_warn" : "system",
              ts: fmt(evt.payload.ts),
            },
          ]);
        } else if (m.startsWith("[plan] ")) {
          const meta = ALL_AGENTS.find((a) => a.name === agentName);
          const color = meta?.color ?? "#94a3b8";
          setActiveAgent({ name: agentName, color, phase: "Planning" });
          // Route into HiveMind bubble if swarm is active; else ignore (onProgress handles it)
          const hmId = hivemindMsgIdRef.current;
          if (hmId !== null) {
            setMessages((prev) => prev.map((msg) => {
              if (msg.id !== hmId) return msg;
              const thoughts = msg.thoughts ?? [];
              if (thoughts.some((t) => t.agent === agentName)) return msg;
              return {
                ...msg,
                thoughts: [...thoughts, {
                  agent: agentName, color,
                  text: m.replace(/^\[plan\]\s*/, "").slice(0, 260),
                  ts: fmt(evt.payload.ts), done: false,
                }],
              };
            }));
          }
        } else if (m.startsWith("[work] ")) {
          const meta = ALL_AGENTS.find((a) => a.name === agentName);
          const color = meta?.color ?? "#94a3b8";
          setActiveAgent({ name: agentName, color, phase: "Building" });
        } else if (m.startsWith("[done] ") || m.startsWith("[progress] ")) {
          const meta = ALL_AGENTS.find((a) => a.name === agentName);
          const color = meta?.color ?? "#10b981";
          setActiveAgent(null);
          // Mark that thought as done in the HiveMind bubble
          const hmId = hivemindMsgIdRef.current;
          if (hmId !== null) {
            setMessages((prev) => prev.map((msg) => {
              if (msg.id !== hmId) return msg;
              return {
                ...msg,
                thoughts: (msg.thoughts ?? []).map((t) =>
                  t.agent === agentName ? { ...t, done: true, color } : t,
                ),
              };
            }));
          }
        } else if (m.startsWith("[verify] ") || m.startsWith("[verify:issue] ")) {
          // Absorbed into the HiveMind bubble final message — no separate bubble
          void 0;
        } else if (m.startsWith("[repair:") || m.startsWith("[swarm]")) {
          // Internal swarm repair — goes to log only, no chat bubble
          void 0;
        } else if (m.startsWith("[fail] ")) {
          // Mark the relevant thought as failed
          const hmId = hivemindMsgIdRef.current;
          if (hmId !== null) {
            setMessages((prev) => prev.map((msg) => {
              if (msg.id !== hmId) return msg;
              return {
                ...msg,
                thoughts: (msg.thoughts ?? []).map((t) =>
                  t.agent === agentName ? { ...t, done: true } : t,
                ),
              };
            }));
          }
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

  const handlePreviewAutoFix = useCallback(async (errors: string[]) => {
    const MAX_ATTEMPTS = 5;
    if (previewAutoFixAttemptsRef.current >= MAX_ATTEMPTS) return;
    previewAutoFixAttemptsRef.current += 1;
    const attempt = previewAutoFixAttemptsRef.current;

    const devAgentId =
      resolveAgentId("Development") ??
      resolveAgentId("Design") ??
      resolveAgentId("Strategy");
    if (!devAgentId) { toast.error("No agent available to auto-fix preview"); return; }

    setPreviewAutoFixing(true);

    // Extract file paths mentioned in the errors (e.g. /src/main.tsx → look up in artifacts)
    const errorPaths = new Set<string>();
    for (const e of errors) {
      const hits = e.match(/\/([\w/-]+\.(tsx?|jsx?|css|json))/g);
      if (hits) hits.forEach((p) => errorPaths.add(p));
    }

    // Detect known Sandpack-specific failure patterns so the prompt can give targeted guidance
    // (and ensure files containing the offending pattern are sent to the agent).
    const errText = errors.slice(0, 6).join("\n");
    const usesImportMeta =
      /import\.meta/i.test(errText) || /Cannot use 'import\.meta'/i.test(errText);
    const missingExportMatch = errText.match(
      /['"]([^'"]+)['"]\s+(?:does not provide an export named|has no exported member|is not exported)/i,
    );
    const missingExportName = missingExportMatch?.[1] ?? null;

    // Inline the relevant files so the agent can see exactly what needs fixing.
    // Falls back to all frontend files when no specific paths are mentioned.
    const deduped = dedupeArtifactsByPath(artifacts);
    const frontendFiles = deduped.filter(
      (a) => a.kind === "file" && (a.path.startsWith("frontend/") || a.path.startsWith("src/")),
    );

    // Score each file: higher score → more likely to be the cause / needed by the agent.
    const scoreFile = (a: MissionArtifact): number => {
      const rel = "/" + a.path.replace(/^frontend\//, "");
      let score = 0;
      // 1. Path explicitly mentioned in the error
      if (errorPaths.size > 0) {
        for (const ep of errorPaths) {
          if (rel.includes(ep) || ep.includes(rel.replace(/^\//, ""))) {
            score += 50;
            break;
          }
        }
      }
      // 2. File contains the failing pattern (`import.meta`, missing export, etc.)
      if (usesImportMeta && a.content.includes("import.meta")) score += 40;
      if (missingExportName && a.content.includes(missingExportName)) score += 30;
      // 3. Entry / app shell
      if (/\/src\/(main|index|App)\.(tsx|ts|jsx|js)$/.test(rel)) score += 20;
      // 4. Smaller files are cheaper to include in full
      if (a.content.length < 4_000) score += 5;
      return score;
    };

    const ranked = [...frontendFiles].sort((a, b) => scoreFile(b) - scoreFile(a));
    const MAX_FILES = 12;
    const relevant = ranked.slice(0, MAX_FILES);
    // Always include the entry-point candidates if not already in.
    const entryKeys = ["/src/main.tsx", "/src/App.tsx", "/src/index.tsx", "/src/main.jsx", "/src/App.jsx"];
    for (const a of frontendFiles) {
      const rel = "/" + a.path.replace(/^frontend\//, "");
      if (entryKeys.includes(rel) && !relevant.includes(a)) relevant.push(a);
    }

    const fileBlock = relevant
      .map((a) => {
        const rel = a.path.replace(/^frontend\//, "");
        const lang = rel.endsWith(".tsx") ? "tsx" : rel.endsWith(".ts") ? "ts" : rel.endsWith(".css") ? "css" : "js";
        const body = a.content.length > 6_000 ? a.content.slice(0, 6_000) + "\n// …[truncated]" : a.content;
        return `#### ${rel}\n\`\`\`${lang}\n${body}\n\`\`\``;
      })
      .join("\n\n");

    // Build environment-specific guidance the agent must follow when patching.
    // The default agent system prompt encourages `import.meta.env.VITE_API_URL` (correct for the
    // hosted Vite "Host" build), but that breaks in Sandpack — override it here.
    const sandpackConstraints = [
      "## Sandpack runtime constraints (the live preview uses CodeSandbox's in-browser bundler — NOT Vite)",
      "- Do NOT use `import.meta` anywhere (no `import.meta.env.*`, `import.meta.url`, `import.meta.hot`).",
      "  Sandpack throws `Cannot use 'import.meta' outside a module` during evaluation.",
      "- For API base URLs in Sandpack, use a plain string (`\"\"` for same-origin) or read from a window global,",
      "  e.g. `const API_BASE = (window as any).__VITE_API_URL__ ?? \"\";`. Do not call `import.meta.env`.",
      "- Do not depend on Vite-specific config (`vite.config.*`), PostCSS, or Tailwind config files —",
      "  Sandpack ignores them. Tailwind utility classes are loaded via the Tailwind Play CDN automatically;",
      "  don't add `@tailwind` directives in CSS files.",
      "- Don't import images from `/public/...` or use `new URL(..., import.meta.url)`.",
      "- Stick to react / react-dom / react-router-dom / lucide-react and other plain npm packages.",
      "- Every component you import must actually be exported (default vs named matters).",
      "- Every relative import must point to a file you include in `fileUpdates`.",
    ].join("\n");

    const hasNoRoutesMatched = /no routes matched location/i.test(errText);
    const hasNullPropAccess = /cannot read propert(y|ies) of (undefined|null)/i.test(errText);
    const targetedHint = usesImportMeta
      ? "## Targeted hint\nThe error is caused by `import.meta` references in the code. Remove every `import.meta.*` reference and replace with the safe alternatives described above."
      : missingExportName
        ? `## Targeted hint\nThe error references missing export "${missingExportName}". Make sure the file that imports it uses the correct default-vs-named import, and that the source file exports the symbol with the matching name.`
        : hasNoRoutesMatched
          ? "## Targeted hint\nReact Router says 'No routes matched location \"/\"'. Sandpack mounts the app at `/` — your `<Routes>` block must define a route at exactly `path=\"/\"` that renders the home view. Either add `<Route path=\"/\" element={<Home/>} />` (most common fix) OR add `<Route path=\"*\" element={<NotFound/>} />` as a catch-all that renders the home UI when nothing matches. Do NOT use a basename inside Sandpack. If you use `BrowserRouter`, remove any `basename` prop."
          : hasNullPropAccess
            ? "## Targeted hint\nThe error is a TypeError from reading a property on undefined/null — likely an unguarded `.map`/`.length` on a value that isn't an array yet. Use `Array.isArray(x) ? x.map(...) : null` and provide useState defaults like `useState<T[]>([])`."
            : "";

    const message = `\
SANDPACK REACT PREVIEW ERROR — auto-fix attempt ${attempt} of ${MAX_ATTEMPTS}

## Error(s) reported by Sandpack
\`\`\`
${errText}
\`\`\`

${sandpackConstraints}

${targetedHint}

## Current source files (most-likely-relevant first)
${fileBlock || "(no frontend files found — regenerate from scratch)"}

## Your task
Fix the error(s) above by editing the listed source files. Common causes:
- Vite-only syntax (\`import.meta.*\`) leaking into Sandpack
- Wrong import/export (default vs named), missing component export
- Broken relative path or missing file
- Invalid JSX or duplicate default export
Output every changed file in full — no truncation, no "..." placeholders, no comments like "rest unchanged".

## MANDATORY RESPONSE FORMAT
You MUST respond with exactly ONE raw JSON object. No markdown fences. No prose outside the JSON.
{
  "assistantReply": "one-sentence explanation of what you fixed",
  "fileUpdates": [
    { "path": "frontend/src/App.tsx", "language": "tsx", "content": "COMPLETE file contents here" }
  ]
}`;

    toast.info(`Auto-fixing preview (attempt ${attempt}/${MAX_ATTEMPTS})…`, { duration: 3000 });

    const result = await invokeAgentApi(devAgentId, {
      message,
      missionId: mission.id,
      persistArtifactUpdates: true,
      includeArtifacts: false, // we already inlined the files above
    });

    if (result.ok) {
      if (!result.persistArtifactParseFailed && result.artifactPathsApplied?.length) {
        const fresh = await fetchMissionArtifactsApi(mission.id);
        if (fresh) {
          setArtifacts(fresh);
          previewAutoFixAttemptsRef.current = 0; // reset on success so future errors get 5 fresh tries
          toast.success(`Preview fixed — updated: ${result.artifactPathsApplied.join(", ")}`, { duration: 4000 });
        }
      } else if (result.persistArtifactParseFailed) {
        // Agent replied but JSON was malformed — the 30-s re-fire window in SandpackErrorMonitor
        // will trigger another attempt automatically.
        toast.warning(`Auto-fix attempt ${attempt}: response wasn't valid JSON, retrying…`, { duration: 3500 });
      } else {
        toast.warning(`Auto-fix attempt ${attempt}: agent responded with no file changes`, { duration: 3500 });
      }
    } else {
      toast.error(`Auto-fix attempt ${attempt} failed (${result.reason}) — will retry`);
    }
    setPreviewAutoFixing(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.id, artifacts]);

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

      // Create the single HiveMind swarm bubble — it will be updated in place via onProgress.
      const hmId = Date.now() + 1;
      hivemindMsgIdRef.current = hmId;
      setMessages([
        {
          id: Date.now(),
          agent: "Operator",
          color: "#e2e8f0",
          text: mission.objective,
          state: "delegating",
          ts,
        },
        {
          id: hmId,
          agent: "HiveMind",
          color: "#22d3ee",
          text: "",
          state: "thinking",
          kind: "hivemind_swarm",
          thoughts: [],
          ts,
        },
      ]);

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
            const progressTs = new Date().toLocaleTimeString("en-US", { hour12: false });
            const lastResult = progress.partialResults[progress.partialResults.length - 1];

            setMessages((prev) => prev.map((msg) => {
              if (msg.id !== hmId) return msg;
              let thoughts = (msg.thoughts ?? []).map((t) =>
                !t.done && lastResult && t.agent === lastResult.role
                  ? { ...t, text: lastResult.replySnippet.slice(0, 300) || t.text, done: true }
                  : t,
              );
              // Add new working entry for the current role if not already tracked
              if (progress.currentRole && !thoughts.some((t) => t.agent === progress.currentRole)) {
                thoughts = [
                  ...thoughts,
                  {
                    agent: progress.currentRole,
                    color: ROLE_COLORS[progress.currentRole] ?? "#94a3b8",
                    text: `${progress.currentRole} agent is analysing…`,
                    ts: progressTs,
                    done: false,
                  },
                ];
              }
              return { ...msg, thoughts };
            }));

            setLogLines((prev) => [
              ...prev,
              {
                ts: Date.now(),
                agent: lastResult?.role ?? "HiveMind",
                message: `[progress] ${lastResult?.role ?? ""} · ${progress.completedRoles.length} roles done`,
              },
            ].slice(-200));
          },
        },
      );

      setAutoInvoking(false);
      if (!swarm.ok) {
        setMessages((prev) => prev.map((msg) =>
          msg.id === hmId ? { ...msg, state: "failed", text: swarm.message } : msg,
        ));
        localStorage.removeItem(persistedFlagKey);
        toast.error("Swarm run failed", { description: swarm.message, duration: 12_000 });
        return;
      }

      autoInvokedRef.current.add(mission.id);
      const data = swarm.data;
      const groqHardFailures = data.results.filter(
        (r) => r.provider === "mock" && typeof r.debugLlm === "string" && r.debugLlm.trim().length > 0,
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

      // Refresh artifacts after run.
      const a = await fetchMissionArtifactsApi(mission.id);
      if (a) {
        setArtifacts(a);
        setSelectedArtifactId((cur) => {
          if (cur && a.some((x) => x.id === cur)) return cur;
          return a[0]?.id ?? null;
        });
        // Auto-switch to live preview if frontend files exist
        const hasFrontend = a.some((x) => x.path.startsWith("frontend/") || x.path.startsWith("src/"));
        if (hasFrontend) {
          previewAutoFixAttemptsRef.current = 0; // reset auto-fix attempts for new swarm run
          setWorkspacePanelTab("preview");
          toast.success("Live preview ready", { description: "Your app is running in the preview panel.", duration: 4000 });
        }
      } else if (getAuthToken()) {
        toast.error("Could not load mission code files", {
          description:
            "Try refreshing the page. If you use a different wallet than when the swarm ran, sign in with that wallet — files are stored per wallet.",
          duration: 12_000,
        });
      }

      if (data.verification?.ok && a && a.length > 0) {
        void loadHostedPreview({ quiet: true }).then((ok) => {
          if (ok) toast.success("Hosted preview ready — check the Preview tab");
        });
      }

      const ts2 = new Date().toLocaleTimeString("en-US", { hour12: false });
      const finalText =
        (typeof data.finalReply === "string" && data.finalReply.trim().length > 0)
          ? data.finalReply
          : (data.results.find((r) => r.role === "Coordination")?.reply ?? "");
      const coordBody = buildCoordinationDeliverableText(data, finalText || "Swarm run finished.");

      // Build final thought list from all results, all marked done (includes file paths).
      const finalThoughts: ChatThought[] = data.results
        .filter((r) => r.role !== "Coordination")
        .map((r) => ({
          agent: r.role,
          color: ROLE_COLORS[r.role] ?? "#94a3b8",
          text: (r.reply ?? "").trim().slice(0, 260) || r.error?.slice(0, 260) || `${r.role} completed.`,
          ts: ts2,
          done: true,
          files: Array.isArray(r.artifactPaths) ? r.artifactPaths.slice(0, 10) : [],
        }));

      hivemindMsgIdRef.current = null;
      // Update the HiveMind bubble to its final approved state.
      const swarmElapsedSecs = Math.round((Date.now() - (data.startedAt ?? Date.now())) / 1000);
      setMessages((prev) => prev.map((msg) =>
        msg.id === hmId
          ? { ...msg, state: "approved", text: coordBody, thoughts: finalThoughts, ts: ts2, elapsedSecs: swarmElapsedSecs }
          : msg,
      ));

      // Write log lines from all results.
      const logs: LogLine[] = data.results.flatMap((r, i) => {
        const slot = (data.startedAt ?? Date.now()) + i * 600;
        return [
          ...(r.plan ? [{ ts: slot + 10, agent: r.agentName || r.role, message: `[plan] ${r.plan}` }] : []),
          {
            ts: slot + 40,
            agent: r.agentName || r.role,
            message: r.error?.trim()
              ? `[fail] ${r.role} · ${r.error.slice(0, 400)}`
              : `[work] ${r.role} · ${(r.reply ?? "").trim().slice(0, 360)}`,
          },
        ];
      });
      setLogLines((prev) => [...prev, ...logs].slice(-200));

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

      setSelectedAgent("Coordination");
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
    previewAutoFixAttemptsRef.current = 0; // new message → fresh auto-fix budget
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

    // 2. Insert HiveMind bubble in thinking state
    const thinkingId = Date.now() * 1000 + Math.floor(Math.random() * 999) + 1;
    hivemindMsgIdRef.current = thinkingId;
    const hmTs = new Date().toLocaleTimeString("en-US", { hour12: false });
    setMessages((m) => [
      ...m,
      {
        id: thinkingId,
        agent: "HiveMind",
        color: "#22d3ee",
        text: "",
        ts: hmTs,
        kind: "hivemind_swarm" as const,
        state: "thinking" as const,
        thoughts: [],
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

      const addThought = (name: string, snippet: string, files: string[], isDone: boolean) => {
        const color = ALL_AGENTS.find((a) => a.name === name)?.color ?? "#94a3b8";
        const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
        setMessages((prev) => prev.map((msg) => {
          if (msg.id !== thinkingId) return msg;
          const thoughts = msg.thoughts ?? [];
          if (thoughts.some((t) => t.agent === name)) {
            return { ...msg, thoughts: thoughts.map((t) => t.agent === name ? { ...t, text: snippet.slice(0, 260), files, done: isDone } : t) };
          }
          return { ...msg, thoughts: [...thoughts, { agent: name, color, text: snippet.slice(0, 260), ts, done: isDone, files }] };
        }));
      };

      if (!firstAgentId) {
        void reloadAgents();
      } else {
        addThought(firstAgentName, "Analysing your request…", [], false);
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
                  ? { ...msg, state: "failed" as const, text: "Sign-in required to invoke agents.", ts: new Date().toLocaleTimeString("en-US", { hour12: false }) }
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
          const paths = firstRes.artifactPathsApplied ?? [];
          addThought(firstAgentName, firstRes.reply, paths, true);
          results.push({ agentName: firstAgentName, reply: firstRes.reply, paths });

          const wasCodeChange = paths.length > 0;
          if (wasCodeChange && agentsToInvoke.length > 1) {
            for (let i = 1; i < agentsToInvoke.length; i++) {
              const agentName = agentsToInvoke[i]!;
              const agentId = resolveAgentId(agentName);
              if (!agentId) continue;
              addThought(agentName, "Building…", [], false);
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
              const rPaths = res.artifactPathsApplied ?? [];
              addThought(agentName, res.reply, rPaths, true);
              results.push({ agentName, reply: res.reply, paths: rPaths });
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

      // 7. Mark HiveMind bubble as approved with final reply
      hivemindMsgIdRef.current = null;
      setMessages((m) =>
        m.map((msg) =>
          msg.id === thinkingId
            ? { ...msg, text: finalReply, state: "approved" as const, elapsedSecs: thinkingDuration, ts: ts2 }
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

          <div className="relative flex min-h-0 flex-1 flex-col px-4 py-3">
            {/* 30% communication · 70% code + live preview — fills full viewport under TopNav */}
            <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row xl:items-stretch">
              {/* ── Agent Communication panel (30%) ── */}
              <div className="flex min-h-0 w-full flex-1 flex-col xl:flex-none xl:w-[30%] xl:max-w-md">
                <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">

                  {/* Active agent banner — only shown while swarm is running */}
                  <AnimatePresence>
                    {activeAgent && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden shrink-0"
                      >
                        <div
                          className="flex items-center gap-2 border-b px-3 py-2"
                          style={{ borderColor: `${activeAgent.color}25`, background: `${activeAgent.color}08` }}
                        >
                          <AgentAvatar name={activeAgent.name} color={activeAgent.color} size="sm" />
                          <span className="text-[11px] font-semibold" style={{ color: activeAgent.color }}>
                            {activeAgent.name}
                          </span>
                          <span className="text-[9px] uppercase tracking-widest" style={{ color: `${activeAgent.color}70` }}>
                            {activeAgent.phase}
                          </span>
                          <div className="ml-auto flex items-center gap-1">
                            {[0, 0.2, 0.4].map((d) => (
                              <motion.span
                                key={d}
                                className="h-1 w-3 rounded-full"
                                style={{ background: activeAgent.color }}
                                animate={{ opacity: [0.2, 0.9, 0.2], scaleX: [0.6, 1, 0.6] }}
                                transition={{ duration: 1.4, repeat: Infinity, delay: d }}
                              />
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

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
                          onClick={() => {
                            setWorkspacePanelTab("preview");
                            previewAutoFixAttemptsRef.current = 0; // fresh budget when user re-opens preview
                          }}
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
                        onClick={() => setActivityDrawerOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-white/85 transition hover:border-cyan-300/35"
                      >
                        <LayoutPanelLeft className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                        Activity
                      </button>
                      {/* Live preview is instant via Sandpack; "Host" button deploys to EB for a shareable URL */}
                      <button
                        type="button"
                        disabled={uniqueArtifactPaths === 0 || previewStarting || !getAuthToken()}
                        title={
                          !getAuthToken()
                            ? "Sign in with your wallet to deploy"
                            : "Deploy to hosted server for a shareable URL"
                        }
                        onClick={() => void loadHostedPreview()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-white/85 transition hover:border-cyan-300/35 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {previewStarting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" aria-hidden />
                        ) : (
                          <ExternalLink className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                        )}
                        Host
                      </button>
                      {previewEmbedUrl && (
                        <button
                          type="button"
                          title="Open hosted preview in a new tab"
                          onClick={() => window.open(previewEmbedUrl, "_blank", "noopener,noreferrer")}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1.5 text-[11px] text-cyan-300 transition hover:border-cyan-300/50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          Hosted URL
                        </button>
                      )}
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
                    <SandpackLivePreview
                      artifacts={artifacts}
                      autoFixing={previewAutoFixing}
                      swarmRunning={swarmRunning}
                      onErrors={handlePreviewAutoFix}
                    />
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
