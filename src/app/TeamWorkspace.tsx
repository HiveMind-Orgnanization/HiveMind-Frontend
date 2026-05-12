import { useMemo } from "react";
import { motion } from "motion/react";
import {
  UsersRound, Users, Crown, Shield, Sparkles, Wallet, Cpu, Hexagon,
  Activity, GitBranch, Target, Vote, Plus, MessageSquare, Network,
  ArrowUpRight, Rocket,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { Skeleton } from "./components/ui/skeleton";
import { Link } from "react-router";
import { useMissions } from "./store";
import { useAgents } from "./hooks/useHiveMind";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

const MISSION_COLORS = ["#22d3ee", "#a855f7", "#3b82f6", "#10b981"];

const missionStatusMap: Record<string, string> = {
  active: "active",
  completed: "completed",
  pending: "queued",
  failed: "settling",
};

const missionTone: Record<string, { c: string; bg: string }> = {
  active:    { c: "#22d3ee", bg: "rgba(34,211,238,0.12)" },
  settling:  { c: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  completed: { c: "#10b981", bg: "rgba(16,185,129,0.12)" },
};

const roles = [
  { role: "Admin",         count: 1, c: "#fbbf24", icon: Crown,   sub: "full authority"   },
  { role: "Operator",      count: 2, c: "#22d3ee", icon: Shield,  sub: "manage missions"  },
  { role: "Strategist",    count: 3, c: "#a855f7", icon: Sparkles,sub: "scope & KPIs"     },
  { role: "Contributor",   count: 4, c: "#3b82f6", icon: Users,   sub: "execute tasks"    },
  { role: "AI Supervisor", count: 2, c: "#10b981", icon: Cpu,     sub: "oversee agents"   },
];

const members = [
  { name: "Astra",   role: "Admin",         init: "A", contrib: 184, rep: 4.97, lastActive: "now",   c: "#fbbf24" },
  { name: "Halo",    role: "Operator",      init: "H", contrib: 142, rep: 4.89, lastActive: "12m",   c: "#22d3ee" },
  { name: "Vega",    role: "Strategist",    init: "V", contrib: 118, rep: 4.81, lastActive: "2h",    c: "#a855f7" },
  { name: "Lumen",   role: "Contributor",   init: "L", contrib:  96, rep: 4.74, lastActive: "1d",    c: "#3b82f6" },
  { name: "Echo",    role: "Strategist",    init: "E", contrib:  88, rep: 4.66, lastActive: "3h",    c: "#8b5cf6" },
  { name: "Nyx",     role: "Contributor",   init: "N", contrib:  72, rep: 4.51, lastActive: "5h",    c: "#ec4899" },
  { name: "Axiom",   role: "AI Supervisor", init: "X", contrib: 162, rep: 4.93, lastActive: "now",   c: "#10b981" },
];

const treasurySplits = [
  { l: "Mission Operations", pct: 42, c: "#22d3ee" },
  { l: "Agent Payouts",      pct: 24, c: "#a855f7" },
  { l: "Strategy Reserve",   pct: 18, c: "#10b981" },
  { l: "Governance Pool",    pct: 10, c: "#f59e0b" },
  { l: "Discretionary",      pct:  6, c: "#ec4899" },
];

const activityFeed = [
  { who: "Astra",  c: "#fbbf24", action: "approved 4.2 SOL escrow on", target: "M-247",       t: "16:42" },
  { who: "Halo",   c: "#22d3ee", action: "spawned subtask in",          target: "M-241",       t: "16:38" },
  { who: "Vega",   c: "#a855f7", action: "completed research on",       target: "M-229",       t: "16:30" },
  { who: "Axiom",  c: "#10b981", action: "settled payout to Lumen",      target: "0.42 SOL",    t: "16:24" },
  { who: "Echo",   c: "#8b5cf6", action: "shared insights to",           target: "Memory#brand",t: "16:18" },
  { who: "Lumen",  c: "#3b82f6", action: "submitted banner pack to",     target: "M-247",       t: "16:12" },
];

const collabFlow = [
  { stage: "Plan",        owner: "Strategist",   ai: "Strategy",     c: "#22d3ee" },
  { stage: "Research",    owner: "Strategist",   ai: "Research",     c: "#a855f7" },
  { stage: "Execute",     owner: "Contributor",  ai: "Design",       c: "#3b82f6" },
  { stage: "Coordinate",  owner: "Operator",     ai: "Coordination", c: "#06b6d4" },
  { stage: "Settle",      owner: "Admin",        ai: "Treasury",     c: "#10b981" },
];

export default function TeamWorkspace() {
  const { missions: rawMissions } = useMissions();
  const { agents, loading: agentsLoading } = useAgents();

  const overview = useMemo(() => {
    const activeMissions = rawMissions.filter((m) => m.status === "active").length;
    const completedMissions = rawMissions.filter((m) => m.status === "completed").length;
    const totalBudget = rawMissions.reduce((s, m) => s + (m.budget ?? m.cost ?? 0), 0);
    // Coordination = ratio of completed missions to total (a rough "things ship" signal).
    // Falls back to em-dash when there's no data — better than a fabricated "98.4%".
    const coordPct = rawMissions.length > 0
      ? Math.round((completedMissions / rawMissions.length) * 100)
      : null;
    return [
      // Team membership / multi-user features aren't shipped yet. Show 1 (the connected
      // wallet) instead of pretending there's a 12-person team.
      { l: "Members",         v: "1",                                            sub: "you",         i: Users,    c: "#22d3ee" },
      { l: "AI Agents",       v: agents.length > 0 ? String(agents.length) : "—", sub: "registered",  i: Cpu,      c: "#a855f7" },
      { l: "Active Missions", v: String(activeMissions),                          sub: "in flight",   i: Rocket,   c: "#3b82f6" },
      { l: "Treasury",        v: totalBudget > 0 ? `${totalBudget.toFixed(2)} SOL` : "0 SOL", sub: "committed",  i: Wallet, c: "#10b981" },
      { l: "Coordination",    v: coordPct != null ? `${coordPct}%` : "—",         sub: coordPct != null ? "complete" : "no data", i: Network, c: "#06b6d4" },
    ];
  }, [rawMissions, agents]);

  const missions = useMemo(() => {
    return rawMissions.map((m, i) => ({
      id: m.id.slice(0, 8).toUpperCase(),
      t: m.title,
      members: (m.agents ?? []).slice(0, 3).map((a: string) => a[0]?.toUpperCase() ?? "?"),
      agents: (m.agents ?? []).length,
      progress: m.progress ?? (m.status === "completed" ? 100 : m.status === "active" ? 60 : 20),
      status: missionStatusMap[m.status] ?? m.status,
      c: MISSION_COLORS[i % MISSION_COLORS.length],
    }));
  }, [rawMissions]);

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
                "radial-gradient(ellipse at 15% 0%, rgba(168,85,247,0.10), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(34,211,238,0.10), transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(16,185,129,0.06), transparent 50%)",
            }}
          />
          <Particles count={24} />

          <div className="relative px-6 py-6">
            <PageHeader
              title="Team Workspace"
              subtitle="AI-native collaborative workspace · autonomous organization operating system."
              crumbs={[{ label: "Team" }]}
              status={{ label: "Workspace · single-user beta", tone: "purple" }}
              actions={
                <div className="flex items-center gap-2">
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/85 hover:border-cyan-300/30">
                    <MessageSquare className="h-3.5 w-3.5" /> Open chat
                  </button>
                  <button className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black">
                    <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
                    <Plus className="relative h-3.5 w-3.5" />
                    <span className="relative">Invite Member</span>
                  </button>
                </div>
              }
            />

            {/* Org overview */}
            <Card className="mb-6">
              <div className="absolute inset-0 opacity-50">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 0%, rgba(168,85,247,0.18), transparent 50%), radial-gradient(circle at 80% 100%, rgba(34,211,238,0.18), transparent 50%)",
                  }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                />
              </div>
              <div className="relative grid gap-3 p-5 md:grid-cols-5">
                {agentsLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="rounded-xl border border-white/10 bg-black/30 p-4">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="mt-3 h-8 w-20" />
                        <Skeleton className="mt-1 h-3 w-14" />
                      </div>
                    ))
                  : overview.map((m, i) => (
                    <motion.div
                      key={m.l}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <m.i className="h-4 w-4" style={{ color: m.c }} />
                        <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{m.l}</span>
                      </div>
                      <div className="mt-3 text-2xl tabular-nums">{m.v}</div>
                      <div className="mt-1 text-[11px] text-white/45">{m.sub}</div>
                    </motion.div>
                  ))}
              </div>
            </Card>

            {/* Team Missions + Treasury */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Target className="h-4 w-4 text-cyan-300" />
                    Team Missions
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">live · shared</span>
                </div>
                <div className="divide-y divide-white/5">
                  {agentsLoading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-12 items-center gap-3 px-5 py-3">
                          <div className="col-span-4 flex items-center gap-3">
                            <Skeleton className="h-9 w-9 rounded-lg" />
                            <div className="flex-1">
                              <Skeleton className="h-3 w-12" />
                              <Skeleton className="mt-1 h-4 w-36" />
                            </div>
                          </div>
                          <Skeleton className="col-span-2 h-7 w-20" />
                          <Skeleton className="col-span-1 h-4 w-8" />
                          <Skeleton className="col-span-4 h-4 w-full" />
                          <Skeleton className="col-span-1 h-6 w-10 ml-auto" />
                        </div>
                      ))
                    : missions.length === 0 ? (
                      <div className="px-5 py-12 text-center text-sm text-white/45">
                        <Target className="mx-auto h-5 w-5 text-white/30" />
                        <div className="mt-2 text-white/70">No team missions yet</div>
                        <div className="mt-1 text-xs text-white/40">
                          Launch a mission from <span className="text-cyan-300/85">Mission Control</span> — it
                          will appear here for the connected wallet.
                        </div>
                      </div>
                    ) : missions.map((m, i) => {
                    const tone = missionTone[m.status] ?? missionTone["active"];
                    return (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="grid grid-cols-12 items-center gap-3 px-5 py-3 hover:bg-white/[0.02]"
                      >
                        <div className="col-span-4 flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg"
                            style={{ background: `linear-gradient(135deg, ${m.c}55, ${m.c}11)`, boxShadow: `0 0 14px ${m.c}55` }} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-white/40">{m.id}</span>
                              <span
                                className="rounded-md px-1.5 py-0.5 text-[9px] uppercase tracking-widest"
                                style={{ color: tone.c, background: tone.bg }}
                              >
                                {m.status}
                              </span>
                            </div>
                            <div className="truncate text-sm">{m.t}</div>
                          </div>
                        </div>

                        <div className="col-span-2 flex items-center -space-x-2">
                          {m.members.map((u, k) => (
                            <div
                              key={k}
                              className="flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-[#04060c] text-[10px]"
                              style={{ background: `linear-gradient(135deg, ${m.c}, #a855f7)` }}
                            >
                              {u}
                            </div>
                          ))}
                        </div>

                        <div className="col-span-1 flex items-center gap-1 text-[11px] text-white/65">
                          <Cpu className="h-3 w-3 text-cyan-300" />
                          <span className="tabular-nums">{m.agents}</span>
                        </div>

                        <div className="col-span-4">
                          <div className="flex items-center justify-between text-[10px] text-white/40">
                            <span>progress</span>
                            <span className="tabular-nums text-white/85">{m.progress}%</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                            <motion.div
                              initial={{ width: 0 }} animate={{ width: `${m.progress}%` }}
                              transition={{ duration: 1 }}
                              className="h-full rounded-full"
                              style={{ background: `linear-gradient(90deg, ${m.c}, #a855f7)`, boxShadow: `0 0 8px ${m.c}` }}
                            />
                          </div>
                        </div>

                        <div className="col-span-1 text-right">
                          <button className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/55 hover:border-cyan-300/30 hover:text-cyan-200">
                            open
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </Card>

              {/* Shared Treasury */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Wallet className="h-4 w-4 text-emerald-300" />
                    Shared Treasury
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-300">multisig 3/5</span>
                </div>
                <div className="p-5">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Total balance</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    {agentsLoading
                      ? <Skeleton className="h-9 w-32" />
                      : <span className="text-3xl tabular-nums">
                          {rawMissions.reduce((s, m) => s + (m.budget ?? m.cost ?? 0), 0).toFixed(2)}
                        </span>
                    }
                    <span className="text-sm text-white/55">SOL</span>
                    {rawMissions.length === 0 && (
                      <span className="ml-auto text-[11px] text-white/35">no missions yet</span>
                    )}
                  </div>

                  {/* Stacked bar */}
                  <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-white/5">
                    {treasurySplits.map((s, i) => (
                      <motion.div
                        key={s.l}
                        initial={{ width: 0 }}
                        animate={{ width: `${s.pct}%` }}
                        transition={{ duration: 1, delay: i * 0.1 }}
                        className="h-full"
                        style={{ background: s.c, boxShadow: `0 0 8px ${s.c}` }}
                      />
                    ))}
                  </div>

                  <div className="mt-3 space-y-1.5">
                    {treasurySplits.map((s) => (
                      <div key={s.l} className="flex items-center justify-between rounded-md bg-white/[0.02] px-3 py-1.5 text-[11px]">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: s.c, boxShadow: `0 0 6px ${s.c}` }} />
                          {s.l}
                        </span>
                        <span className="tabular-nums text-white/85">{s.pct}%</span>
                      </div>
                    ))}
                  </div>

                  <button className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-300/10 py-2 text-xs text-emerald-100 hover:bg-emerald-300/20">
                    <Vote className="h-3.5 w-3.5" /> Propose allocation
                  </button>
                </div>
              </Card>
            </div>

            {/* Multi-user collaboration features (roles, members, activity feed,
                workflow visualization, cross-team metrics) aren't wired to real data —
                they're aspirational and only made sense as a marketing mock. Replaced
                with an honest "coming soon" card so the page doesn't pretend to track
                a team that doesn't exist for this wallet. */}
            <Card className="mb-6 border-dashed">
              <div className="px-6 py-8 text-center">
                <UsersRound className="mx-auto h-6 w-6 text-white/35" aria-hidden />
                <div className="mt-3 text-sm text-white/75">Multi-user team workspace · coming soon</div>
                <div className="mx-auto mt-2 max-w-md text-xs text-white/45">
                  Roles, member invites, shared activity feeds, and cross-team workflow
                  orchestration are on the roadmap. For now the workspace is single-user
                  and scoped to your connected wallet — every mission, payment, and
                  artifact you see on this page is yours alone.
                </div>
              </div>
            </Card>

            {/* Original aspirational sections kept below, gated behind a flag so they
                don't render. Left in source so the layout can be restored quickly when
                the underlying APIs (team members, activity stream, multisig governance)
                ship. Wrapped in a fragment because JSX-gating a sequence of siblings
                requires a single root. */}
            {false && (
            <>
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <UsersRound className="h-4 w-4 text-cyan-300" />
                    Workspace Roles
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{roles.length} tiers</span>
                </div>
                <div className="space-y-2 p-4">
                  {roles.map((r, i) => (
                    <motion.div
                      key={r.role}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30 p-3"
                    >
                      <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-30 blur-2xl" style={{ background: r.c }} />
                      <div className="relative flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-lg border"
                          style={{ borderColor: `${r.c}55`, background: `${r.c}1a`, color: r.c }}
                        >
                          <r.icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{r.role}</span>
                            <span className="text-[10px] text-white/50">{r.count} members</span>
                          </div>
                          <div className="text-[10px] text-white/45">{r.sub}</div>
                        </div>
                      </div>
                      <div className="relative mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${(r.count / 4) * 100}%` }}
                          transition={{ duration: 1, delay: i * 0.05 }}
                          className="h-full rounded-full"
                          style={{ background: `linear-gradient(90deg, ${r.c}, #a855f7)`, boxShadow: `0 0 6px ${r.c}` }}
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>

              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-cyan-300" />
                    Members & Contributors
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{members.length} active</span>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-2">
                  {members.map((m, i) => (
                    <motion.div
                      key={m.name}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="rounded-xl border border-white/10 bg-black/30 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-sm"
                            style={{ background: `linear-gradient(135deg, ${m.c}55, ${m.c}11)`, boxShadow: `0 0 14px ${m.c}55` }}
                          >
                            {m.init}
                          </div>
                          <motion.span
                            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-black"
                            style={{ background: m.c }}
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.6, repeat: Infinity }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{m.name}</span>
                            <span className="text-[10px] text-white/45">{m.role}</span>
                          </div>
                          <div className="text-[10px] text-white/45">last active · {m.lastActive}</div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                        <div className="rounded-md bg-white/[0.03] px-2 py-1">
                          <div className="text-white/40">Contrib</div>
                          <div className="tabular-nums text-white/85">{m.contrib}</div>
                        </div>
                        <div className="rounded-md bg-white/[0.03] px-2 py-1">
                          <div className="text-white/40">Reputation</div>
                          <div className="tabular-nums text-white/85">{m.rep}</div>
                        </div>
                        <div className="rounded-md bg-white/[0.03] px-2 py-1">
                          <div className="text-white/40">Sync</div>
                          <div className="tabular-nums text-cyan-300">live</div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Collab flow + Activity feed */}
            <div className="mb-6 grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-4 w-4 text-cyan-300" />
                    Collaborative Workflow · Human + AI
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">orchestration</span>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-5 gap-3">
                    {collabFlow.map((s, i) => (
                      <motion.div
                        key={s.stage}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="relative rounded-xl border border-white/10 bg-black/30 p-3"
                      >
                        <div className="absolute -top-2 left-3 rounded-md px-1.5 py-0.5 text-[9px] uppercase tracking-widest"
                          style={{ background: s.c, color: "#04060c" }}
                        >
                          {i + 1}
                        </div>
                        <div className="text-sm">{s.stage}</div>
                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-white/55">
                          <Users className="h-3 w-3" /> {s.owner}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[10px]" style={{ color: s.c }}>
                          <Cpu className="h-3 w-3" /> {s.ai}
                        </div>

                        {i < collabFlow.length - 1 && (
                          <motion.div
                            className="absolute -right-2 top-1/2 hidden h-px w-4 -translate-y-1/2 md:block"
                            style={{ background: `linear-gradient(90deg, ${s.c}, transparent)` }}
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                          />
                        )}
                      </motion.div>
                    ))}
                  </div>

                  {/* Visualization */}
                  <div className="mt-5 h-32 w-full rounded-xl border border-white/10 bg-black/30 p-3">
                    <svg viewBox="0 0 600 100" className="h-full w-full" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="cwLine" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#22d3ee" />
                          <stop offset="50%" stopColor="#a855f7" />
                          <stop offset="100%" stopColor="#10b981" />
                        </linearGradient>
                      </defs>
                      <line x1="20" y1="50" x2="580" y2="50" stroke="rgba(255,255,255,0.06)" />
                      {collabFlow.map((s, i) => {
                        const x = 20 + (i / (collabFlow.length - 1)) * 560;
                        return (
                          <g key={s.stage}>
                            <circle cx={x} cy="50" r="6" fill={s.c} style={{ filter: `drop-shadow(0 0 8px ${s.c})` }} />
                            <text x={x} y="78" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.55)">{s.stage}</text>
                          </g>
                        );
                      })}
                      {Array.from({ length: 4 }).map((_, k) => (
                        <motion.circle
                          key={k}
                          r="3"
                          fill="url(#cwLine)"
                          initial={{ cx: 20, cy: 50 }}
                          animate={{ cx: [20, 580], opacity: [0, 1, 1, 0] }}
                          transition={{ duration: 5, repeat: Infinity, delay: k * 1.2, ease: "linear" }}
                          style={{ filter: "drop-shadow(0 0 6px #22d3ee)" }}
                        />
                      ))}
                    </svg>
                  </div>
                </div>
              </Card>

              {/* Activity feed */}
              <Card>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4 text-cyan-300" />
                    Team Activity
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">live</span>
                </div>
                <div className="space-y-2 p-3">
                  {activityFeed.map((e, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-[11px]"
                    >
                      <div className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ background: e.c, boxShadow: `0 0 6px ${e.c}` }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span style={{ color: e.c }}>{e.who}</span>
                          <span className="font-mono text-[9px] text-white/30">{e.t}</span>
                        </div>
                        <div className="mt-0.5 text-white/75">
                          {e.action} <span className="text-cyan-300">{e.target}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Org performance footer — fabricated metrics, gated off with the rest. */}
            <Card className="mb-6">
              <div className="grid grid-cols-2 gap-px bg-white/5 md:grid-cols-4">
                {[
                  { l: "Avg Mission ROI",      v: "+184%",  c: "#10b981", i: ArrowUpRight },
                  { l: "Workflow Reuse",       v: "62%",    c: "#22d3ee", i: GitBranch },
                  { l: "Cross-team Coord",     v: "98.4%",  c: "#a855f7", i: Network },
                  { l: "Hexagon Score",        v: "9.2/10", c: "#f59e0b", i: Hexagon },
                ].map((x) => (
                  <div key={x.l} className="bg-[#04060c] px-4 py-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40">
                      <x.i className="h-3 w-3" style={{ color: x.c }} />
                      {x.l}
                    </div>
                    <div className="mt-1 text-base tabular-nums">{x.v}</div>
                  </div>
                ))}
              </div>
            </Card>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
