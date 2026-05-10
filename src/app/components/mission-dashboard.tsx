import { motion } from "motion/react";
import { Activity, Cpu, Wallet, GitBranch } from "lucide-react";

const logs = [
  { t: "00:01.204", a: "Strategy", msg: "Mission objective parsed → 4 sub-tasks created", c: "text-cyan-300" },
  { t: "00:01.842", a: "Coordination", msg: "Delegated 'market scan' → Research Agent", c: "text-purple-300" },
  { t: "00:02.611", a: "Research", msg: "Querying Qdrant → 248 vectors, 3 sources", c: "text-blue-300" },
  { t: "00:03.117", a: "Design", msg: "Generating brand variant set v3", c: "text-fuchsia-300" },
  { t: "00:04.502", a: "Treasury", msg: "Escrowed 12.4 SOL → multisig 0xA3..91", c: "text-emerald-300" },
  { t: "00:05.018", a: "Analytics", msg: "Reputation Δ +0.18 across 4 agents", c: "text-cyan-300" },
  { t: "00:05.901", a: "Coordination", msg: "Mission checkpoint #2 reached ✓", c: "text-purple-300" },
];

export function MissionDashboard() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-1 backdrop-blur-2xl shadow-[0_0_120px_rgba(34,211,238,0.15)]">
      <div className="rounded-[22px] bg-black/60 p-6">
        {/* top bar */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
            </div>
            <span className="ml-2 text-xs uppercase tracking-[0.3em] text-white/50">
              hivemind / mission-control
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-cyan-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            LIVE · 6 agents online
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {/* stats */}
          <div className="space-y-3">
            {[
              { icon: Activity, label: "Active Missions", val: "12", trend: "+3" },
              { icon: Cpu, label: "Agents Coordinating", val: "48", trend: "+12" },
              { icon: GitBranch, label: "Workflows Routed", val: "1.2k", trend: "+184" },
              { icon: Wallet, label: "Treasury (SOL)", val: "318.4", trend: "+12.4" },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-cyan-400/30 hover:bg-cyan-400/5 transition"
              >
                <div className="flex items-center justify-between">
                  <s.icon className="h-4 w-4 text-cyan-300" />
                  <span className="text-[10px] text-emerald-400">▲ {s.trend}</span>
                </div>
                <div className="mt-3 text-2xl text-white tabular-nums">{s.val}</div>
                <div className="text-[11px] uppercase tracking-widest text-white/40">{s.label}</div>
              </motion.div>
            ))}
          </div>

          {/* terminal */}
          <div className="rounded-xl border border-white/10 bg-black/50 p-4 lg:col-span-2">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
              <span>// agent.stream</span>
              <span className="text-cyan-300">streaming</span>
            </div>
            <div className="mt-3 space-y-1.5 font-mono text-[12px] leading-relaxed">
              {logs.map((l, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                  className="flex gap-3"
                >
                  <span className="text-white/30">{l.t}</span>
                  <span className={`${l.c} w-28 shrink-0`}>[{l.a}]</span>
                  <span className="text-white/80">{l.msg}</span>
                </motion.div>
              ))}
              <motion.div
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.4, repeat: Infinity }}
                className="text-cyan-300"
              >
                ▌
              </motion.div>
            </div>

            {/* mini chart */}
            <div className="mt-4 h-16 w-full">
              <svg viewBox="0 0 200 60" className="h-full w-full">
                <defs>
                  <linearGradient id="chartG" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,40 L20,32 L40,36 L60,22 L80,28 L100,14 L120,20 L140,10 L160,18 L180,8 L200,12 L200,60 L0,60 Z"
                  fill="url(#chartG)"
                />
                <path
                  d="M0,40 L20,32 L40,36 L60,22 L80,28 L100,14 L120,20 L140,10 L160,18 L180,8 L200,12"
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
