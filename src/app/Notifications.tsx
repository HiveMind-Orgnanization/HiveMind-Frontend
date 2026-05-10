import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion, AnimatePresence } from "motion/react";
import {
  Bell, CheckCircle2, AlertTriangle, XCircle, Info, Vote, Wallet, GitBranch,
  Users, Cpu, Zap, Radio, Filter, MailCheck, Trash2, Sparkles, Hexagon, Activity,
} from "lucide-react";
import { Sidebar } from "./components/dashboard/sidebar";
import { TopNav } from "./components/dashboard/topnav";
import { PageHeader } from "./components/dashboard/page-header";
import { Particles } from "./components/particles";
import { WalletGate } from "./components/WalletGate";
import { useNotifications, type NotifSeverity, type NotifChannel } from "./contexts/NotificationsContext";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

type Channel = "all" | NotifChannel;

const severityStyle: Record<NotifSeverity, { c: string; bg: string; ring: string; icon: typeof Info }> = {
  info:     { c: "#22d3ee", bg: "rgba(34,211,238,0.10)",  ring: "rgba(34,211,238,0.40)",  icon: Info },
  success:  { c: "#10b981", bg: "rgba(16,185,129,0.10)",  ring: "rgba(16,185,129,0.40)",  icon: CheckCircle2 },
  warning:  { c: "#f59e0b", bg: "rgba(245,158,11,0.10)",  ring: "rgba(245,158,11,0.40)",  icon: AlertTriangle },
  error:    { c: "#ef4444", bg: "rgba(239,68,68,0.10)",   ring: "rgba(239,68,68,0.40)",   icon: XCircle },
  critical: { c: "#ec4899", bg: "rgba(236,72,153,0.10)",  ring: "rgba(236,72,153,0.40)",  icon: Zap },
};

const channelIcon: Record<NotifChannel, typeof Cpu> = {
  execution:  Cpu,
  delegation: GitBranch,
  mission:    Hexagon,
  payment:    Wallet,
  governance: Vote,
};

const channelLabel: Record<NotifChannel, string> = {
  execution:  "Execution",
  delegation: "Delegation",
  mission:    "Mission",
  payment:    "Payment",
  governance: "Governance",
};

export default function Notifications() {
  const { connected } = useWallet();
  const { items, unread, markAll, dismiss, toggle } = useNotifications();
  const [channel, setChannel] = useState<Channel>("all");
  const [hideRead, setHideRead] = useState(false);

  const filtered = useMemo(
    () =>
      items
        .filter((n) => (channel === "all" ? true : n.channel === channel))
        .filter((n) => (hideRead ? !n.read : true)),
    [items, channel, hideRead],
  );

  const critical = items.filter((n) => n.severity === "critical" && !n.read).length;

  const channelCount = Object.keys(channelIcon).length;
  const overview = useMemo(() => [
    { l: "Unread",         v: String(unread),          sub: `of ${items.length} events`, c: "#22d3ee", i: Bell },
    { l: "Critical",       v: String(critical),         sub: "needs review",              c: "#ec4899", i: Zap },
    { l: "Active Streams", v: String(channelCount),     sub: "channels live",             c: "#a855f7", i: Radio },
    { l: "Today",          v: String(items.length),     sub: "total events",              c: "#10b981", i: Sparkles },
  ], [unread, items.length, critical, channelCount]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />

        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at 15% 0%, rgba(34,211,238,0.10), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(168,85,247,0.10), transparent 55%)",
            }}
          />
          <Particles count={20} />

          <WalletGate connected={connected}>
          <div className="relative px-6 py-6">
            <PageHeader
              title="Notification Center"
              subtitle="Realtime intelligence feed for autonomous AI coordination."
              crumbs={[{ label: "Notifications" }]}
              status={{ label: `${unread} unread`, tone: unread > 0 ? "cyan" : "purple" }}
              actions={
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHideRead((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/85 hover:border-cyan-300/30"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {hideRead ? "Show all" : "Hide read"}
                  </button>
                  <button
                    onClick={markAll}
                    className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-xs text-black"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-300" />
                    <MailCheck className="relative h-3.5 w-3.5" />
                    <span className="relative">Mark all read</span>
                  </button>
                </div>
              }
            />

            {/* Overview strip */}
            <div className="mb-6 grid gap-3 md:grid-cols-4">
              {overview.map((m, i) => (
                <motion.div
                  key={m.l}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-4 backdrop-blur-xl"
                >
                  <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-30 blur-2xl" style={{ background: m.c }} />
                  <div className="relative flex items-center justify-between">
                    <m.i className="h-4 w-4" style={{ color: m.c }} />
                    <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{m.l}</span>
                  </div>
                  <div className="relative mt-3 text-2xl tabular-nums">{m.v}</div>
                  <div className="relative mt-1 text-[11px] text-white/45">{m.sub}</div>
                </motion.div>
              ))}
            </div>

            {/* Channels strip + feed */}
            <div className="grid gap-6 xl:grid-cols-4">
              <Card className="xl:col-span-1">
                <div className="border-b border-white/5 px-5 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-cyan-300" />
                    Channels
                  </div>
                </div>
                <div className="space-y-1 p-3">
                  {(["all", "execution", "delegation", "mission", "payment", "governance"] as Channel[]).map((c) => {
                    const Icon = c === "all" ? Bell : channelIcon[c];
                    const count = c === "all" ? items.length : items.filter((n) => n.channel === c).length;
                    const active = channel === c;
                    return (
                      <button
                        key={c}
                        onClick={() => setChannel(c)}
                        className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                          active ? "bg-gradient-to-r from-cyan-300/10 to-transparent text-white" : "text-white/65 hover:bg-white/5"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="notif-pill"
                            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]"
                          />
                        )}
                        <Icon className={`h-4 w-4 ${active ? "text-cyan-300" : "text-white/40"}`} />
                        <span className="flex-1 capitalize">{c === "all" ? "All Events" : channelLabel[c]}</span>
                        <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] tabular-nums text-white/55">{count}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-white/5 p-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Live stream</div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-cyan-300">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    </span>
                    streaming · ws · 12ms
                  </div>
                  <svg viewBox="0 0 200 30" className="mt-3 h-6 w-full">
                    {Array.from({ length: 30 }).map((_, i) => {
                      const h = 4 + Math.random() * 22;
                      return (
                        <rect key={i} x={i * 7} y={30 - h} width={4} height={h}
                          fill="#22d3ee" opacity={0.2 + Math.random() * 0.7} />
                      );
                    })}
                  </svg>
                </div>
              </Card>

              {/* Feed */}
              <Card className="xl:col-span-3">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Bell className="h-4 w-4 text-cyan-300" />
                    {channel === "all" ? "All Events" : channelLabel[channel as NotifChannel]} Feed
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">{filtered.length} entries</span>
                </div>

                {filtered.length === 0 ? (
                  <div className="grid place-items-center px-5 py-16 text-center">
                    <div>
                      <Bell className="mx-auto h-8 w-8 text-white/30" />
                      <div className="mt-3 text-white/70">No notifications</div>
                      <div className="text-xs text-white/45">You&apos;re all caught up.</div>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    <AnimatePresence>
                      {filtered.map((n, i) => {
                        const sev = severityStyle[n.severity];
                        const Icon = sev.icon;
                        const ChIcon = channelIcon[n.channel];
                        return (
                          <motion.div
                            key={n.id}
                            layout
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 8 }}
                            transition={{ delay: i * 0.03 }}
                            className={`group relative grid grid-cols-12 items-start gap-3 px-5 py-3 transition hover:bg-white/[0.02] ${n.read ? "opacity-70" : ""}`}
                          >
                            {!n.read && (
                              <span
                                className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                                style={{ background: sev.c, boxShadow: `0 0 8px ${sev.c}` }}
                              />
                            )}

                            <div className="col-span-1 mt-0.5 flex justify-start pl-3">
                              <div
                                className="flex h-8 w-8 items-center justify-center rounded-lg border"
                                style={{ borderColor: sev.ring, background: sev.bg, color: sev.c, boxShadow: `0 0 12px ${sev.c}33` }}
                              >
                                <Icon className="h-4 w-4" />
                              </div>
                            </div>

                            <div className="col-span-9 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
                                <span className="font-mono text-white/30">{n.id}</span>
                                <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.02] px-1.5 py-0.5 text-white/60">
                                  <ChIcon className="h-2.5 w-2.5" /> {channelLabel[n.channel]}
                                </span>
                                <span className="rounded-md px-1.5 py-0.5" style={{ color: sev.c, background: sev.bg }}>
                                  {n.severity}
                                </span>
                                {n.mission && <span className="text-white/45">on {n.mission}</span>}
                                {n.amount && <span className="text-emerald-300">{n.amount}</span>}
                              </div>
                              <div className="mt-1.5 text-sm text-white/90">{n.title}</div>
                              <div className="mt-0.5 text-[12px] text-white/55">{n.body}</div>
                            </div>

                            <div className="col-span-2 flex items-start justify-end gap-2 text-[10px]">
                              <span className="font-mono text-white/30">{n.t}</span>
                              <button
                                onClick={() => toggle(n.id)}
                                className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-1 text-white/55 hover:border-cyan-300/30 hover:text-cyan-200"
                                title={n.read ? "Mark unread" : "Mark read"}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => dismiss(n.id)}
                                className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-1 text-white/55 hover:border-rose-300/30 hover:text-rose-200"
                                title="Dismiss"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </Card>
            </div>

            {/* Coordination Pulse */}
            <Card className="mt-6">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-cyan-300" />
                  Coordination Pulse
                </div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">orchestrators online · {Math.min(items.filter(n => n.channel === "execution" && !n.read).length + 2, channelCount)}</span>
              </div>
              <div className="grid grid-cols-2 gap-px bg-white/5 md:grid-cols-4">
                {[
                  { l: "Resolved (24h)",    v: String(items.filter((n) => n.severity === "success").length), c: "#10b981" },
                  { l: "Awaiting Approval", v: String(items.filter((n) => n.channel === "payment" && !n.read).length), c: "#f59e0b" },
                  { l: "Auto-routed",       v: String(items.filter((n) => n.channel === "execution").length), c: "#22d3ee" },
                  { l: "Escalated",         v: String(critical), c: "#ec4899" },
                ].map((x) => (
                  <div key={x.l} className="bg-[#04060c] px-4 py-3">
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
          </WalletGate>
        </div>
      </div>
    </div>
  );
}
