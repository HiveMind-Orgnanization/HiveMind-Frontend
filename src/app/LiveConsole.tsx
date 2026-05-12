import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Terminal, Activity, Cpu, Brain, Zap, Network, Wifi, GitBranch,
  Play, Pause, Trash2, Filter, ChevronRight, Hexagon, Radio, Database,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { useHiveMindActivity } from "./hooks/useHiveMind";
import { subscribeLocalActivity } from "../lib/agent-activity-bus";
import { apiConfigured } from "../lib/api";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

type LogLevel = "info" | "ok" | "warn" | "err" | "tool" | "model" | "memory";
type LogLine = { id: number; t: string; level: LogLevel; agent: string; msg: string };

const agents = ["Strategy", "Research", "Design", "Treasury", "Coordination", "Memory", "Analytics", "Marketing"];
const tools = ["generate_image", "memory.recall", "browser.fetch", "chain.tx", "code.diff", "vector.upsert", "db.query"];
const models = ["claude-4.7-opus", "gpt-5", "llama-4-maverick", "deepseek-v3", "qwen-3-72b"];

const levelColor: Record<LogLevel, string> = {
  info:  "text-white/60",
  ok:    "text-emerald-300",
  warn:  "text-amber-300",
  err:   "text-rose-300",
  tool:  "text-cyan-300",
  model: "text-purple-300",
  memory:"text-blue-300",
};

const reasoningTree = [
  { d: 0, t: "PLAN ▸ Solana AI Marketing Campaign", c: "#22d3ee" },
  { d: 1, t: "├─ DELEGATE ▸ Research scope",          c: "#a855f7" },
  { d: 2, t: "│   ├─ retrieve trending memes (k=20)",  c: "#8b5cf6" },
  { d: 2, t: "│   └─ score sentiment vectors",         c: "#8b5cf6" },
  { d: 1, t: "├─ DELEGATE ▸ Design banner pack",       c: "#3b82f6" },
  { d: 2, t: "│   ├─ choose palette · cyan/purple",    c: "#3b82f6" },
  { d: 2, t: "│   ├─ generate 12 variants",            c: "#3b82f6" },
  { d: 2, t: "│   └─ score brand consistency",         c: "#3b82f6" },
  { d: 1, t: "├─ DELEGATE ▸ Marketing copy A/B",       c: "#ec4899" },
  { d: 2, t: "│   └─ produce 6 hook variants",         c: "#ec4899" },
  { d: 1, t: "├─ COORD ▸ stage 4 → review gate",       c: "#06b6d4" },
  { d: 1, t: "└─ TREASURY ▸ allocate escrow",          c: "#10b981" },
  { d: 2, t: "    └─ disburse on approval",            c: "#10b981" },
];

const orchestrationDecisions = [
  { t: "16:42:31", title: "Routed Research → Memory recall", note: "context size hit 248k tokens", c: "#a855f7" },
  { t: "16:42:08", title: "Switched model llama-4 → claude-4.7", note: "image-gen quality dropped", c: "#3b82f6" },
  { t: "16:41:50", title: "Spawned parallel branch · Marketing", note: "budget under p50 latency target", c: "#ec4899" },
  { t: "16:41:22", title: "Throttled Design Agent", note: "rate limit · 8 RPS",                       c: "#f59e0b" },
];

function pad(n: number) { return n.toString().padStart(2, "0"); }
function nowStamp() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function nextLog(id: number): LogLine {
  const r = Math.random();
  const agent = agents[Math.floor(Math.random() * agents.length)];
  const t = nowStamp();
  if (r < 0.18) return { id, t, level: "tool",  agent, msg: `tools.call(${tools[Math.floor(Math.random() * tools.length)]})` };
  if (r < 0.34) return { id, t, level: "model", agent, msg: `route → ${models[Math.floor(Math.random() * models.length)]} · est ${Math.round(80 + Math.random() * 540)}ms` };
  if (r < 0.46) return { id, t, level: "memory",agent, msg: `memory.recall(query='brand_tokens', k=${Math.round(2 + Math.random() * 8)})` };
  if (r < 0.58) return { id, t, level: "ok",    agent, msg: `task complete · score ${(0.78 + Math.random() * 0.2).toFixed(2)}` };
  if (r < 0.66) return { id, t, level: "warn",  agent, msg: `latency spike · ${Math.round(420 + Math.random() * 480)}ms` };
  if (r < 0.70) return { id, t, level: "err",   agent, msg: `retry · transient model 503 · backoff ${Math.round(200 + Math.random() * 800)}ms` };
  const events = [
    "delegated subtask to Coordination",
    "approved escrow 2.4 SOL → vault",
    "engagement Δ +18.4% vs baseline",
    "stage checkpoint #4 reached",
    "vector upsert · 1284 embeddings",
    "websocket ping · sync 99.8%",
    "thinking · prefer cyan/purple gradient",
    "validate output against guideline.v3",
  ];
  return { id, t, level: "info", agent, msg: events[Math.floor(Math.random() * events.length)] };
}

export default function LiveConsole() {
  const syntheticStream = !apiConfigured();
  const [logs, setLogs] = useState<LogLine[]>(() =>
    syntheticStream ? Array.from({ length: 28 }).map((_, i) => nextLog(i)) : [],
  );
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const idRef = useRef(syntheticStream ? 28 : 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);

  useEffect(() => {
    if (!syntheticStream || paused) return;
    const t = setInterval(() => {
      idRef.current += 1;
      setLogs((l) => {
        const next = [...l, nextLog(idRef.current)];
        return next.length > 220 ? next.slice(next.length - 220) : next;
      });
    }, 600 + Math.random() * 700);
    return () => clearInterval(t);
  }, [paused, syntheticStream]);

  useEffect(() => {
    if (!stick || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, stick]);

  // Shared push helper — both the remote WS feed and the local in-process bus
  // funnel into this so the console renders one unified stream.
  const pushActivity = useCallback((e: { agent: string; message: string; ts: number }) => {
    setLogs((l) => {
      idRef.current += 1;
      const line: LogLine = {
        id: idRef.current,
        t: new Date(e.ts).toLocaleTimeString("en-US", { hour12: false }),
        level: "model",
        agent: e.agent,
        msg: e.message.length > 2000 ? `${e.message.slice(0, 2000)}…` : e.message,
      };
      const next = [...l, line];
      return next.length > 220 ? next.slice(next.length - 220) : next;
    });
  }, []);

  useHiveMindActivity(pushActivity);

  // Local fallback — when the Vercel→EB hop drops the WebSocket, this still
  // surfaces every agent invoke happening in the same tab so the console is
  // never silent during an active mission.
  useEffect(() => {
    return subscribeLocalActivity(pushActivity);
  }, [pushActivity]);

  const filtered = useMemo(
    () => (filter === "all" ? logs : logs.filter((l) => l.level === filter)),
    [logs, filter]
  );

  // Tick state so the "Last event Ns ago" label updates between events.
  const [tickNow, setTickNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Real-time stats derived from the live logs. These run for both the demo synthetic
  // stream and the API stream, so the console always shows useful telemetry.
  const liveStats = useMemo(() => {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    const recent = logs.filter((l) => {
      // Parse the `[HH:MM:SS]` stamp as today; logs older than 60s drop out.
      const [hh, mm, ss] = l.t.split(":").map((s) => Number(s));
      if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) return false;
      const d = new Date();
      d.setHours(hh, mm, ss, 0);
      return d.getTime() >= oneMinuteAgo;
    });
    const uniqueAgents = new Set(logs.map((l) => l.agent)).size;
    const counts: Record<LogLevel, number> = {
      info: 0, ok: 0, warn: 0, err: 0, tool: 0, model: 0, memory: 0,
    };
    for (const l of logs) counts[l.level] += 1;
    // Bucket the last 60s into 12 × 5s slots for the mini bar chart.
    const buckets = new Array(12).fill(0);
    for (const l of recent) {
      const [hh, mm, ss] = l.t.split(":").map((s) => Number(s));
      const d = new Date();
      d.setHours(hh, mm, ss, 0);
      const ageMs = now - d.getTime();
      const bucketIdx = Math.min(11, Math.max(0, Math.floor(ageMs / 5000)));
      buckets[11 - bucketIdx] += 1;
    }
    const lastEventTs = logs.length > 0
      ? (() => {
          const last = logs[logs.length - 1]!;
          const [hh, mm, ss] = last.t.split(":").map((s) => Number(s));
          const d = new Date();
          d.setHours(hh, mm, ss, 0);
          return d.getTime();
        })()
      : null;
    const secondsSinceLast = lastEventTs != null ? Math.max(0, Math.floor((tickNow - lastEventTs) / 1000)) : null;
    return {
      perMinute: recent.length,
      uniqueAgents,
      total: logs.length,
      counts,
      buckets,
      bucketMax: Math.max(1, ...buckets),
      secondsSinceLast,
    };
  }, [logs, tickNow]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />

        <div className="relative min-h-0 flex-1 overflow-y-auto">
          {/* Cyberpunk grid + scanlines */}
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.16), transparent 60%), radial-gradient(ellipse at 50% 100%, rgba(168,85,247,0.16), transparent 60%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
              maskImage: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,1) 30%, rgba(0,0,0,0.1) 90%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(34,211,238,0.6) 0, rgba(34,211,238,0.6) 1px, transparent 1px, transparent 3px)",
            }}
          />

          <div className="relative px-6 py-6">
            <PageHeader
              title="Live Execution Console"
              subtitle={
                syntheticStream
                  ? "Demo synthetic stream (API disabled or unset)."
                  : "Real stream only: lines appear when agents complete invokes (WebSocket agent.activity)."
              }
              crumbs={[{ label: "Console" }]}
              status={{
                label: syntheticStream ? "Demo · synthetic" : "Live · API mode",
                tone: "cyan",
              }}
              actions={
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/5 px-3 py-2 text-[11px] uppercase tracking-[0.25em] text-cyan-300 backdrop-blur">
                    <Radio className="h-3.5 w-3.5" />
                    <span>channel</span>
                    <span className="font-mono normal-case tracking-normal">
                      {syntheticStream ? "demo" : "global"}
                    </span>
                  </div>
                  {syntheticStream ? (
                    <button
                      onClick={() => setPaused((p) => !p)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/85 hover:border-cyan-300/30"
                    >
                      {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      {paused ? "Resume" : "Pause"}
                    </button>
                  ) : null}
                  <button
                    onClick={() => setLogs([])}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/60 hover:border-rose-300/30 hover:text-rose-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              }
            />

            {syntheticStream ? (
            <Card className="mb-6">
              <div className="grid gap-3 p-4 md:grid-cols-6">
                {[
                  { l: "Active Agents",  v: "8 / 12",   sub: "online",     i: Cpu,      c: "#22d3ee" },
                  { l: "Models Live",    v: "5",        sub: "routed",     i: Brain,    c: "#a855f7" },
                  { l: "TPS",            v: "184",      sub: "tokens/s",   i: Zap,      c: "#f59e0b" },
                  { l: "Latency p95",    v: "240ms",    sub: "−18ms",      i: Activity, c: "#10b981" },
                  { l: "Queue Depth",    v: "23",       sub: "+4",         i: GitBranch,c: "#ec4899" },
                  { l: "Sync",           v: "99.8%",    sub: "ws · 12ms",  i: Wifi,     c: "#06b6d4" },
                ].map((m, i) => (
                  <motion.div
                    key={m.l}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-xl border border-white/10 bg-black/30 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <m.i className="h-3.5 w-3.5" style={{ color: m.c }} />
                      <span className="text-[9px] uppercase tracking-[0.25em] text-white/40">{m.l}</span>
                    </div>
                    <div className="mt-1.5 text-lg tabular-nums">{m.v}</div>
                    <div className="text-[10px] text-white/45">{m.sub}</div>
                  </motion.div>
                ))}
              </div>
            </Card>
            ) : null}

            {/* Main split: logs on the left (always), real-data side panels on the right
                in both demo and API mode. */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              {/* Live Log Feed */}
              <Card className="xl:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Terminal className="h-4 w-4 text-cyan-300" />
                    <span>// agent.kernel.stream</span>
                    <motion.span
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      className="text-cyan-300"
                    >
                      ▌
                    </motion.span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 p-1 text-[11px]">
                    <Filter className="ml-1 h-3 w-3 text-white/40" />
                    {(["all", "info", "tool", "model", "memory", "ok", "warn", "err"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`rounded-md px-2 py-0.5 capitalize transition ${
                          filter === f ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  ref={scrollRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
                  }}
                  className="relative h-[520px] overflow-y-auto bg-black/60 px-4 py-3 font-mono text-[12px] leading-relaxed"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)",
                    backgroundSize: "100% 22px",
                  }}
                >
                  {filtered.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center p-6">
                      <div className="flex max-w-md flex-col items-center gap-3 text-center text-[12px] leading-relaxed text-white/45">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/5">
                          <Radio className="h-5 w-5 text-cyan-300/70" aria-hidden />
                        </div>
                        {syntheticStream ? (
                          <span>Stream paused or cleared · resume demo above.</span>
                        ) : (
                          <>
                            <div className="text-sm text-white/75">Listening for agent activity…</div>
                            <div className="text-[11px] text-white/45">
                              No <span className="font-mono text-cyan-300/70">agent.activity</span> events on{" "}
                              <span className="font-mono text-white/60">channel global</span> yet. Open the{" "}
                              <strong className="text-white/70">Agent Workspace</strong> with an active mission and
                              send a prompt — each invoke streams a preview here in real time.
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {filtered.map((l) => (
                    <motion.div
                      key={l.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-start gap-3"
                    >
                      <span className="w-[64px] shrink-0 text-white/30 tabular-nums">[{l.t}]</span>
                      <span className={`w-[14px] shrink-0 ${levelColor[l.level]}`}>
                        {l.level === "ok" ? "✓" : l.level === "err" ? "✗" : l.level === "warn" ? "!" : l.level === "tool" ? "▸" : l.level === "model" ? "Σ" : l.level === "memory" ? "◇" : "·"}
                      </span>
                      <span className={`w-[100px] shrink-0 ${levelColor[l.level]}`}>{l.agent}</span>
                      <span className="text-white/85">{l.msg}</span>
                    </motion.div>
                  ))}
                  {!stick && (
                    <button
                      onClick={() => setStick(true)}
                      className="sticky bottom-0 ml-auto mt-2 block rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[10px] text-cyan-100"
                    >
                      ↓ jump to live
                    </button>
                  )}
                </div>

                {/* Live activity strip — works in both demo and API modes. Bar chart shows
                    events per 5-second bucket over the last minute; the metrics row gives
                    a quick read of stream health (events/min, unique agents, time since
                    last event). */}
                <div className="border-t border-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between text-[9px] uppercase tracking-[0.25em] text-white/40">
                    <span>activity · last 60s</span>
                    <span className="text-cyan-300">{filtered.length} entries · {liveStats.total} total</span>
                  </div>
                  <div className="grid grid-cols-[1fr,auto] items-center gap-3">
                    <svg viewBox="0 0 240 40" className="h-10 w-full" preserveAspectRatio="none">
                      {liveStats.buckets.map((v, i) => {
                        const h = Math.max(2, (v / liveStats.bucketMax) * 36);
                        return (
                          <rect
                            key={i}
                            x={i * 20 + 2}
                            y={40 - h}
                            width={16}
                            height={h}
                            fill={v > 0 ? "#22d3ee" : "#22d3ee"}
                            opacity={v > 0 ? 0.55 + (v / liveStats.bucketMax) * 0.4 : 0.08}
                            rx={1}
                          />
                        );
                      })}
                    </svg>
                    <div className="flex gap-3 text-[10px] uppercase tracking-[0.18em] text-white/40">
                      <div className="text-center">
                        <div className="font-mono text-[14px] tabular-nums text-cyan-300">
                          {liveStats.perMinute}
                        </div>
                        <div>per min</div>
                      </div>
                      <div className="text-center">
                        <div className="font-mono text-[14px] tabular-nums text-purple-300">
                          {liveStats.uniqueAgents}
                        </div>
                        <div>agents</div>
                      </div>
                      <div className="text-center">
                        <div className="font-mono text-[14px] tabular-nums text-emerald-300">
                          {liveStats.secondsSinceLast == null
                            ? "—"
                            : liveStats.secondsSinceLast < 60
                              ? `${liveStats.secondsSinceLast}s`
                              : `${Math.floor(liveStats.secondsSinceLast / 60)}m`}
                        </div>
                        <div>since last</div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Right column — real-data panels derived from the log stream. Works in
                  both synthetic and API mode (counts are honest about which events have
                  actually fired). */}
              <div className="space-y-6">
                <Card>
                  <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Brain className="h-4 w-4 text-purple-300" />
                      Recent Activity
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.25em] text-purple-300">tail · 12</span>
                  </div>
                  <div className="space-y-1 p-4 font-mono text-[11px] leading-relaxed">
                    {logs.length === 0 ? (
                      <div className="py-6 text-center text-[11px] text-white/35">
                        No activity yet. The tail will populate as agents fire events.
                      </div>
                    ) : (
                      logs.slice(-12).reverse().map((l, i) => (
                        <motion.div
                          key={l.id}
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="flex items-baseline gap-2"
                        >
                          <span className="w-[40px] shrink-0 text-white/25 tabular-nums text-[10px]">
                            {l.t.slice(3)}
                          </span>
                          <span className={`shrink-0 text-[10px] uppercase tracking-wider ${levelColor[l.level]}`}>
                            {l.agent}
                          </span>
                          <span className="truncate text-white/65">{l.msg}</span>
                        </motion.div>
                      ))
                    )}
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Hexagon className="h-4 w-4 text-cyan-300" />
                      Agents by Activity
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">
                      {liveStats.uniqueAgents} live
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    {(() => {
                      const byAgent = new Map<string, number>();
                      for (const l of logs) byAgent.set(l.agent, (byAgent.get(l.agent) ?? 0) + 1);
                      const ranked = [...byAgent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
                      const max = Math.max(1, ...ranked.map(([, n]) => n));
                      const AGENT_COLOR: Record<string, string> = {
                        Strategy: "#22d3ee",
                        Research: "#a855f7",
                        Design: "#3b82f6",
                        Development: "#06b6d4",
                        Marketing: "#ec4899",
                        Treasury: "#10b981",
                        Analytics: "#f97316",
                        Coordination: "#8b5cf6",
                        Memory: "#f59e0b",
                      };
                      if (ranked.length === 0) {
                        return (
                          <div className="py-6 text-center text-[11px] text-white/35">
                            No agents observed yet.
                          </div>
                        );
                      }
                      return ranked.map(([agent, count], i) => {
                        const c = AGENT_COLOR[agent] ?? "#94a3b8";
                        return (
                          <motion.div
                            key={agent}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="rounded-lg border border-white/10 bg-black/30 p-2.5"
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span>{agent}</span>
                              <span className="tabular-nums text-white/60">{count} events</span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(count / max) * 100}%` }}
                                transition={{ duration: 0.6 }}
                                className="h-full rounded-full"
                                style={{ background: c, boxShadow: `0 0 8px ${c}` }}
                              />
                            </div>
                          </motion.div>
                        );
                      });
                    })()}
                  </div>
                </Card>
              </div>
            </div>

            {/* Orchestration decisions + Event stream visualization */}
            {syntheticStream ? (
            <div className="mb-6 grid gap-6 xl:grid-cols-2">
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-4 w-4 text-cyan-300" />
                    Orchestration Decisions
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">routing logic</span>
                </div>
                <div className="space-y-2 p-4">
                  {orchestrationDecisions.map((d, i) => (
                    <motion.div
                      key={d.title}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-lg border border-white/5 bg-white/[0.02] p-3"
                    >
                      <div className="flex items-center gap-2 text-[11px]">
                        <ChevronRight className="h-3 w-3" style={{ color: d.c }} />
                        <span className="text-white/85">{d.title}</span>
                        <span className="ml-auto font-mono text-white/30">{d.t}</span>
                      </div>
                      <div className="mt-1 pl-5 text-[10px] text-white/45">// {d.note}</div>
                    </motion.div>
                  ))}
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Network className="h-4 w-4 text-purple-300" />
                    Event Stream Topology
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-purple-300">distributed</span>
                </div>
                <div className="relative h-64 overflow-hidden">
                  <svg viewBox="0 0 400 240" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="evLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.7" />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity="0.7" />
                      </linearGradient>
                    </defs>

                    {[60, 120, 180].map((y) => (
                      <line key={y} x1="20" y1={y} x2="380" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                    ))}

                    {Array.from({ length: 4 }).map((_, lane) => {
                      const y = 60 + lane * 40;
                      return Array.from({ length: 6 }).map((__, k) => (
                        <motion.circle
                          key={`${lane}-${k}`}
                          r="3"
                          fill={["#22d3ee", "#a855f7", "#10b981", "#ec4899"][lane]}
                          initial={{ cx: 20, cy: y, opacity: 0 }}
                          animate={{
                            cx: [20, 380],
                            opacity: [0, 1, 1, 0],
                          }}
                          transition={{
                            duration: 4 + lane * 0.5,
                            repeat: Infinity,
                            delay: k * 0.7 + lane * 0.3,
                            ease: "linear",
                          }}
                          style={{ filter: `drop-shadow(0 0 6px ${["#22d3ee", "#a855f7", "#10b981", "#ec4899"][lane]})` }}
                        />
                      ));
                    })}

                    {/* node ring */}
                    <circle cx="20" cy="120" r="10" fill="rgba(34,211,238,0.15)" stroke="rgba(34,211,238,0.5)" />
                    <text x="20" y="124" textAnchor="middle" fontSize="9" fill="#22d3ee">IN</text>
                    <circle cx="380" cy="120" r="10" fill="rgba(168,85,247,0.15)" stroke="rgba(168,85,247,0.5)" />
                    <text x="380" y="124" textAnchor="middle" fontSize="9" fill="#a855f7">OUT</text>
                  </svg>

                  <div className="absolute left-3 top-3 text-[10px] uppercase tracking-[0.3em] text-cyan-300/60">
                    ◢ websocket lanes
                  </div>
                  <div className="absolute right-3 top-3 text-[10px] tabular-nums text-white/40">
                    4 lanes · {(184 + Math.floor(Math.random() * 50)).toString()} msgs/s
                  </div>
                </div>
                <div className="grid grid-cols-4 border-t border-white/5">
                  {[
                    { l: "events.in",  v: "1.2k", c: "#22d3ee" },
                    { l: "delegations",v: "342",  c: "#a855f7" },
                    { l: "approvals",  v: "186",  c: "#10b981" },
                    { l: "broadcasts", v: "812",  c: "#ec4899" },
                  ].map((x) => (
                    <div key={x.l} className="border-r border-white/5 px-4 py-3 last:border-r-0">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: x.c, boxShadow: `0 0 8px ${x.c}` }} />
                        {x.l}
                      </div>
                      <div className="mt-1 text-base tabular-nums">{x.v}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
            ) : null}

            {syntheticStream ? (
            <Card className="mb-6">
              <div className="grid grid-cols-2 gap-px bg-white/5 md:grid-cols-6">
                {[
                  { l: "Process",   v: "hivemind.kernel.v7", i: Database },
                  { l: "Region",    v: "us-west-2 / sol-mainnet", i: Network },
                  { l: "Uptime",    v: "248h 12m",            i: Activity },
                  { l: "Slot",      v: "268,124,412",         i: Hexagon },
                  { l: "Build",     v: "0x4a2b…91FE",          i: GitBranch },
                  { l: "Operator",  v: "Astra · @hivemind.sol",i: Cpu },
                ].map((x) => (
                  <div key={x.l} className="bg-[#04060c] px-4 py-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40">
                      <x.i className="h-3 w-3 text-cyan-300" />
                      {x.l}
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-white/85">{x.v}</div>
                  </div>
                ))}
              </div>
            </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
