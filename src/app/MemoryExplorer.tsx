import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Brain, Search, Network, Zap, Database, Sparkles, Hexagon, Layers,
  Filter, GitBranch, ChevronRight, History, BookmarkPlus, Atom, Activity,
  Loader2,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { apiConfigured, memoryQueryApi } from "../lib/api";
import { useMemoryChunks } from "./hooks/useHiveMind";
import { Skeleton } from "./components/ui/skeleton";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

type Cluster = "missions" | "workflows" | "agents" | "outputs" | "knowledge";

type Node = {
  id: string; label: string; cluster: Cluster; x: number; y: number; size: number; c: string;
};

const clusterStyle: Record<Cluster, { c: string; label: string }> = {
  missions:   { c: "#22d3ee", label: "Mission Memory" },
  workflows:  { c: "#a855f7", label: "Workflow Templates" },
  agents:     { c: "#3b82f6", label: "Agent Knowledge" },
  outputs:    { c: "#10b981", label: "Reusable Outputs" },
  knowledge:  { c: "#f59e0b", label: "Semantic Knowledge" },
};

const seedNodes: Omit<Node, "x" | "y" | "size">[] = [
  { id: "m1",  label: "Solana Marketing v3",  cluster: "missions",   c: "#22d3ee" },
  { id: "m2",  label: "Investor Pitch Deck",  cluster: "missions",   c: "#22d3ee" },
  { id: "m3",  label: "Memecoin Sweep",       cluster: "missions",   c: "#22d3ee" },
  { id: "m4",  label: "Brand Refresh Q2",     cluster: "missions",   c: "#22d3ee" },
  { id: "w1",  label: "Banner Pack Workflow", cluster: "workflows",  c: "#a855f7" },
  { id: "w2",  label: "Twitter Threads A/B",  cluster: "workflows",  c: "#a855f7" },
  { id: "w3",  label: "Press Kit Bundle",     cluster: "workflows",  c: "#a855f7" },
  { id: "a1",  label: "Atlas · Strategy",     cluster: "agents",     c: "#3b82f6" },
  { id: "a2",  label: "Vega · Research",      cluster: "agents",     c: "#3b82f6" },
  { id: "a3",  label: "Lumen · Design",       cluster: "agents",     c: "#3b82f6" },
  { id: "o1",  label: "Hero Video Storyboard",cluster: "outputs",    c: "#10b981" },
  { id: "o2",  label: "Brand Tokens v3",      cluster: "outputs",    c: "#10b981" },
  { id: "o3",  label: "Landing Copy A/B",     cluster: "outputs",    c: "#10b981" },
  { id: "k1",  label: "Solana Trends",        cluster: "knowledge",  c: "#f59e0b" },
  { id: "k2",  label: "Memecoin Sentiment",   cluster: "knowledge",  c: "#f59e0b" },
  { id: "k3",  label: "Influencer Reach",     cluster: "knowledge",  c: "#f59e0b" },
];

const edges: [string, string][] = [
  ["m1", "w1"], ["m1", "w2"], ["m1", "k1"], ["m1", "k2"], ["m1", "a1"], ["m1", "a3"], ["m1", "o2"],
  ["m2", "w3"], ["m2", "a1"], ["m2", "o1"],
  ["m3", "k2"], ["m3", "a2"],
  ["m4", "w1"], ["m4", "o2"], ["m4", "a3"],
  ["w1", "o2"], ["w2", "o3"], ["w3", "o1"],
  ["a1", "k1"], ["a2", "k2"], ["a2", "k3"], ["a3", "o2"],
  ["k1", "k2"], ["k2", "k3"],
];

const clusterCenters: Record<Cluster, { x: number; y: number }> = {
  missions:  { x: 30, y: 30 },
  workflows: { x: 70, y: 30 },
  agents:    { x: 50, y: 50 },
  outputs:   { x: 30, y: 75 },
  knowledge: { x: 70, y: 75 },
};

function placeNodes(): Node[] {
  return seedNodes.map((n, i) => {
    const center = clusterCenters[n.cluster];
    const angle = (i / seedNodes.length) * Math.PI * 2;
    const radius = 7 + (i % 3) * 4;
    return {
      ...n,
      x: center.x + Math.cos(angle + i) * radius,
      y: center.y + Math.sin(angle + i) * radius,
      size: 1.6 + (i % 3) * 0.6,
    };
  });
}

const retrievalSamples = [
  { q: "marketing campaign workflows",  matches: 12, top: 0.94 },
  { q: "Solana growth strategies",      matches: 8,  top: 0.92 },
  { q: "previous investor pitch assets",matches: 6,  top: 0.89 },
  { q: "brand consistency tokens v2",   matches: 14, top: 0.97 },
];

const retrievedMemories = [
  { id: "MEM-1842", t: "Brand consistency rules · v3 · cyan/purple gradient set", agent: "Lumen",  c: "#3b82f6", rel: 0.94, age: "2d" },
  { id: "MEM-1781", t: "Solana ecosystem mid-cap reach matrix · April 2026",      agent: "Vega",   c: "#a855f7", rel: 0.91, age: "5d" },
  { id: "MEM-1704", t: "Press kit bundle template · 24MB · stock layouts",        agent: "Atlas",  c: "#22d3ee", rel: 0.88, age: "9d" },
  { id: "MEM-1652", t: "Memecoin sentiment vectors · Φ-cluster #4",               agent: "Echo",   c: "#8b5cf6", rel: 0.85, age: "12d" },
  { id: "MEM-1540", t: "Hero video storyboard reference · 00:42 narrative arc",   agent: "Lumen",  c: "#3b82f6", rel: 0.82, age: "18d" },
];

const historicalMissions = [
  { id: "M-229", t: "Solana Growth Strategy",   agents: 8, ms: "186h", recall: 24, c: "#22d3ee" },
  { id: "M-218", t: "Cross-Vault Reconciliation", agents: 4, ms: "62h", recall: 12,  c: "#10b981" },
  { id: "M-204", t: "Brand Refresh Q1",          agents: 6, ms: "112h", recall: 38, c: "#a855f7" },
  { id: "M-188", t: "Agent Marketplace Launch",  agents: 9, ms: "204h", recall: 41, c: "#3b82f6" },
];

function MemoryGraph({ active, hover, setHover }: {
  active: Cluster | "all";
  hover: string | null;
  setHover: (id: string | null) => void;
}) {
  const nodes = useMemo(placeNodes, []);
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-black/60 to-[#06091a]/60 backdrop-blur-xl">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 50%, rgba(34,211,238,0.10), transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(168,85,247,0.10), transparent 60%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(circle at 50% 50%, rgba(0,0,0,1) 30%, rgba(0,0,0,0.05) 90%)",
        }}
      />

      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="memEdge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* cluster halos */}
        {(Object.entries(clusterCenters) as [Cluster, { x: number; y: number }][]).map(([k, c]) => (
          <circle
            key={k}
            cx={c.x} cy={c.y} r="14"
            fill={`${clusterStyle[k].c}11`}
            stroke={`${clusterStyle[k].c}33`}
            strokeWidth="0.12"
            strokeDasharray="0.6 1"
            opacity={active === "all" || active === k ? 1 : 0.25}
          />
        ))}

        {edges.map(([a, b], i) => {
          const A = byId[a], B = byId[b];
          if (!A || !B) return null;
          const dim = active !== "all" && (A.cluster !== active && B.cluster !== active);
          return (
            <g key={`${a}-${b}`}>
              <line
                x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                stroke="url(#memEdge)" strokeWidth="0.16"
                strokeDasharray="0.8 0.8"
                opacity={dim ? 0.08 : hover && (hover === a || hover === b) ? 0.95 : 0.4}
              />
              <motion.circle
                r="0.45" fill="#22d3ee"
                initial={{ cx: A.x, cy: A.y, opacity: 0 }}
                animate={{ cx: [A.x, B.x], cy: [A.y, B.y], opacity: [0, 0.9, 0] }}
                transition={{ duration: 4 + (i % 4), repeat: Infinity, delay: i * 0.2, ease: "linear" }}
              />
            </g>
          );
        })}
      </svg>

      {nodes.map((n, i) => {
        const dim = active !== "all" && n.cluster !== active;
        const isHover = hover === n.id;
        return (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: dim ? 0.25 : 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
            onMouseEnter={() => setHover(n.id)}
            onMouseLeave={() => setHover(null)}
            className="absolute cursor-pointer"
            style={{ left: `${n.x}%`, top: `${n.y}%`, transform: "translate(-50%, -50%)" }}
          >
            <div className="relative">
              <div
                className="rounded-full ring-2 ring-black/60 transition-transform"
                style={{
                  width: `${n.size * 6}px`,
                  height: `${n.size * 6}px`,
                  background: n.c,
                  boxShadow: `0 0 ${10 + (isHover ? 16 : 0)}px ${n.c}, 0 0 30px ${n.c}55`,
                  transform: isHover ? "scale(1.4)" : "scale(1)",
                }}
              />
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: `${n.c}55` }}
                animate={{ scale: [1, 2.2, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 3 + (i % 3), repeat: Infinity, delay: i * 0.2 }}
              />
            </div>
            <div className="pointer-events-none mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-black/85 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white/85"
              style={{ position: "absolute", left: "50%", top: "100%", boxShadow: `inset 0 0 0 1px ${n.c}33` }}
            >
              {n.label}
            </div>
          </motion.div>
        );
      })}

      <div className="pointer-events-none absolute left-3 top-3 text-[10px] uppercase tracking-[0.3em] text-cyan-300/60">
        ◢ semantic graph · 16 nodes · 24 edges
      </div>
      <div className="pointer-events-none absolute right-3 top-3 text-[10px] tabular-nums text-white/40">
        ϕ recall 0.94 · 12ms
      </div>
      <div className="pointer-events-none absolute right-3 bottom-3 text-[10px] uppercase tracking-[0.3em] text-purple-300/60">
        cognition.v4 ◣
      </div>
    </div>
  );
}

export default function MemoryExplorer() {
  const [query, setQuery] = useState("marketing campaign workflows");
  const [active, setActive] = useState<Cluster | "all">("all");
  const [hover, setHover] = useState<string | null>(null);
  const [tps, setTps] = useState(184);
  const { chunks, loading: chunksLoading } = useMemoryChunks();
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [searchHits, setSearchHits] = useState<
    | {
        query: string;
        items: {
          id: string;
          t: string;
          agent: string;
          c: string;
          rel: number;
          age: string;
        }[];
      }
    | null
  >(null);

  type RetrievedRow = (typeof retrievedMemories)[number];
  const chunkRows = useMemo((): RetrievedRow[] => {
    if (!apiConfigured() || chunks.length === 0) return [];
    return chunks.slice(0, 14).map((c, i) => ({
      id: c.id,
      t: c.text.length > 140 ? `${c.text.slice(0, 140)}…` : c.text,
      agent: c.missionId ? `mission:${c.missionId}` : "shared",
      c: "#22d3ee",
      rel: typeof c.score === "number" ? c.score : Math.max(0.52, 0.94 - i * 0.025),
      age: "live",
    }));
  }, [chunks]);

  const displayRetrieved = searchHits?.items ?? (chunkRows.length > 0 ? chunkRows : retrievedMemories);

  const runSearch = useCallback(
    async (override?: string) => {
      const q = (override ?? query).trim();
      if (!q) return;
      if (!apiConfigured()) {
        setSearchHits(null);
        setSearchNote("Connect the HiveMind API and sign in to query memory.");
        return;
      }
      setSearchBusy(true);
      setSearchNote(null);
      const res = await memoryQueryApi({ query: q, topK: 8 });
      setSearchBusy(false);
      if (!res?.matches?.length) {
        setSearchHits(null);
        setSearchNote(res?.note ?? "No semantic matches for that query.");
        return;
      }
      setSearchHits({
        query: res.query,
        items: res.matches.map((m) => ({
          id: m.id,
          t: m.text.length > 160 ? `${m.text.slice(0, 160)}…` : m.text,
          agent: m.missionId ? `mission:${m.missionId}` : "memory index",
          c: "#a855f7",
          rel: m.relevance,
          age: "query",
        })),
      });
    },
    [query],
  );

  useEffect(() => {
    const t = setInterval(() => setTps(150 + Math.floor(Math.random() * 80)), 1400);
    return () => clearInterval(t);
  }, []);

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
                "radial-gradient(ellipse at 15% 0%, rgba(34,211,238,0.12), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(168,85,247,0.12), transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(245,158,11,0.08), transparent 50%)",
            }}
          />
          <Particles count={26} />

          <div className="relative px-6 py-6">
            <PageHeader
              title="AI Memory Explorer"
              subtitle="Semantic intelligence · neural pathways · shared cognition archive."
              crumbs={[{ label: "Memory" }]}
              status={{
                label:
                  apiConfigured() && chunks.length > 0
                    ? `Cognition · ${chunks.length} chunks`
                    : "Cognition · synced",
                tone: "purple",
              }}
              actions={
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[11px] uppercase tracking-[0.25em] text-white/50 backdrop-blur">
                    <Atom className="h-3.5 w-3.5 text-purple-300" />
                    <span>vectors</span>
                    <span className="font-mono text-purple-300">2.4M</span>
                  </div>
                  <button className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black">
                    <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
                    <BookmarkPlus className="relative h-3.5 w-3.5" />
                    <span className="relative">Save Context</span>
                  </button>
                </div>
              }
            />

            {/* Semantic search */}
            <Card className="mb-6">
              <div className="absolute inset-0 opacity-50">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 0%, rgba(34,211,238,0.18), transparent 50%), radial-gradient(circle at 80% 100%, rgba(168,85,247,0.18), transparent 50%)",
                  }}
                />
              </div>
              <div className="relative p-5">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-cyan-300">
                  <Sparkles className="h-3.5 w-3.5" /> AI-native semantic search
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3 py-2 backdrop-blur">
                  <Search className="h-4 w-4 text-cyan-300" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void runSearch();
                    }}
                    placeholder="Ask the hive · 'find solana growth tactics from M-229'…"
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={searchBusy}
                    onClick={() => void runSearch()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 py-1.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-300/20 disabled:opacity-50"
                  >
                    {searchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Recall
                  </button>
                  <kbd className="hidden rounded border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white/40 sm:inline">↵</kbd>
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-cyan-300">
                    <Zap className="h-3 w-3" /> {tps} t/s
                  </span>
                </div>
                {searchNote ? (
                  <p className="mt-2 text-[11px] text-amber-300/90">{searchNote}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {retrievalSamples.map((s) => (
                    <button
                      key={s.q}
                      onClick={() => {
                        setQuery(s.q);
                        setSearchNote(null);
                        void runSearch(s.q);
                      }}
                      className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/70 hover:border-cyan-300/30 hover:text-white"
                    >
                      <span>{s.q}</span>
                      <span className="text-white/40">·</span>
                      <span className="text-cyan-300">{s.matches} matches</span>
                      <span className="text-white/40">·</span>
                      <span className="tabular-nums text-emerald-300">ϕ {s.top}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Memory graph + retrieved memories */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Network className="h-4 w-4 text-cyan-300" />
                    Semantic Memory Graph
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 p-1 text-[11px]">
                    <Filter className="ml-1 h-3 w-3 text-white/40" />
                    {(["all", ...Object.keys(clusterStyle)] as (Cluster | "all")[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setActive(f)}
                        className={`rounded-md px-2 py-0.5 capitalize transition ${
                          active === f ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
                        }`}
                        style={f !== "all" ? { color: active === f ? clusterStyle[f as Cluster].c : undefined } : {}}
                      >
                        {f === "all" ? "all" : clusterStyle[f as Cluster].label.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-3">
                  <MemoryGraph active={active} hover={hover} setHover={setHover} />
                </div>
                <div className="grid grid-cols-5 gap-px border-t border-white/5 bg-white/5 text-[11px]">
                  {(Object.entries(clusterStyle) as [Cluster, { c: string; label: string }][]).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => setActive((c) => (c === k ? "all" : k))}
                      className="flex items-center gap-2 bg-[#04060c] px-3 py-2 text-left hover:bg-white/[0.03]"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: v.c, boxShadow: `0 0 8px ${v.c}` }} />
                      <span className="truncate text-white/75">{v.label}</span>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Retrieved memories */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Brain className="h-4 w-4 text-purple-300" />
                    Retrieved Context
                  </div>
                  <span className="max-w-[52%] truncate text-[10px] uppercase tracking-[0.25em] text-purple-300">
                    {searchHits ? `q: ${searchHits.query.slice(0, 42)}${searchHits.query.length > 42 ? "…" : ""}` : "k=8"}
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  {chunksLoading && !searchHits
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                          <div className="flex items-center justify-between">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                          <Skeleton className="mt-2 h-4 w-full" />
                          <Skeleton className="mt-1 h-3 w-3/4" />
                        </div>
                      ))
                    : displayRetrieved.map((m, i) => (
                    <motion.div
                      key={`${m.id}-${i}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="relative rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:border-cyan-300/30"
                    >
                      <div className="absolute left-0 top-0 h-full w-0.5 rounded-full" style={{ background: m.c }} />
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-mono text-white/40">{m.id}</span>
                        <span className="inline-flex items-center gap-1 text-emerald-300">
                          <span className="tabular-nums">ϕ {m.rel}</span>
                          <span className="text-white/30">· {m.age} ago</span>
                        </span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[12px] text-white/85">{m.t}</div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/45">
                        <span>by {m.agent}</span>
                        <span className="inline-flex items-center gap-1 text-cyan-300">
                          <ChevronRight className="h-2.5 w-2.5" /> open
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Knowledge clusters + Historical */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Layers className="h-4 w-4 text-cyan-300" />
                    Knowledge References
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">connected · reusable</span>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-3">
                  {[
                    { l: "Reusable Workflows",  v: "184", sub: "+12 this week", c: "#a855f7", i: GitBranch },
                    { l: "Connected Missions",  v: "248", sub: "92% recall",    c: "#22d3ee", i: Hexagon },
                    { l: "Knowledge Vectors",   v: "2.4M",sub: "ϕ avg 0.84",    c: "#f59e0b", i: Atom },
                    { l: "Semantic Clusters",   v: "42",  sub: "auto-grouped",  c: "#10b981", i: Sparkles },
                    { l: "Embedded Outputs",    v: "1.2k",sub: "+184 today",    c: "#3b82f6", i: Database },
                    { l: "Active Recalls",      v: "318", sub: "k=8 default",   c: "#ec4899", i: Brain },
                  ].map((x, i) => (
                    <motion.div
                      key={x.l}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-30 blur-2xl" style={{ background: x.c }} />
                      <div className="relative flex items-center justify-between">
                        <x.i className="h-4 w-4" style={{ color: x.c }} />
                        <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{x.l}</span>
                      </div>
                      <div className="relative mt-3 text-2xl tabular-nums">{x.v}</div>
                      <div className="relative mt-1 text-[11px] text-white/45">{x.sub}</div>
                    </motion.div>
                  ))}
                </div>
              </Card>

              {/* Historical missions */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <History className="h-4 w-4 text-amber-300" />
                    Historical Missions
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-amber-300">archive</span>
                </div>
                <div className="space-y-2 p-3">
                  {historicalMissions.map((m, i) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="relative rounded-lg border border-white/5 bg-white/[0.02] p-3"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-white/40">{m.id}</span>
                        <span className="text-white/45">{m.ms}</span>
                      </div>
                      <div className="mt-1 truncate text-sm text-white/90">{m.t}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                        <div className="rounded-md bg-white/[0.03] px-2 py-1">
                          <div className="text-white/40">Agents</div>
                          <div className="tabular-nums text-white/85">{m.agents}</div>
                        </div>
                        <div className="rounded-md bg-white/[0.03] px-2 py-1">
                          <div className="text-white/40">Recalls</div>
                          <div className="tabular-nums text-white/85">{m.recall}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-cyan-300">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.c, boxShadow: `0 0 8px ${m.c}` }} />
                        archived · indexed
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Vector ops live strip */}
            <Card className="mb-6">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-cyan-300" />
                  Vector Operations · live
                </div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">qdrant#brand</span>
              </div>
              <div className="grid grid-cols-2 gap-px bg-white/5 md:grid-cols-4">
                {[
                  { l: "upsert / hr",  v: "12,482", c: "#22d3ee" },
                  { l: "queries / hr", v: "8,142",  c: "#a855f7" },
                  { l: "avg latency",  v: "12ms",   c: "#10b981" },
                  { l: "index size",   v: "248MB",  c: "#f59e0b" },
                ].map((x) => (
                  <div key={x.l} className="bg-[#04060c] px-4 py-4">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: x.c, boxShadow: `0 0 8px ${x.c}` }} />
                      {x.l}
                    </div>
                    <div className="mt-2 text-xl tabular-nums">{x.v}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

