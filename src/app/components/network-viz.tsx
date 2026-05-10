import { motion } from "motion/react";

type Anchor = "top" | "right" | "bottom" | "left" | "tl" | "tr" | "bl" | "br";

const agents: {
  id: string; label: string; x: number; y: number; color: string; model: string; anchor: Anchor;
}[] = [
  { id: "strategy",     label: "Strategy",     x: 50, y: 16, color: "#22d3ee", model: "Claude 4.7", anchor: "top" },
  { id: "research",     label: "Research",     x: 78, y: 30, color: "#a855f7", model: "GPT-5",       anchor: "tr" },
  { id: "design",       label: "Design",       x: 78, y: 72, color: "#3b82f6", model: "Llama 4",     anchor: "br" },
  { id: "treasury",     label: "Treasury",     x: 50, y: 86, color: "#10b981", model: "DeepSeek",    anchor: "bottom" },
  { id: "analytics",    label: "Analytics",    x: 22, y: 72, color: "#8b5cf6", model: "Qwen 3",      anchor: "bl" },
  { id: "coordination", label: "Coordination", x: 22, y: 30, color: "#0ea5e9", model: "Claude 4.7",  anchor: "tl" },
];

const center = { x: 50, y: 50 };

function labelOffset(a: Anchor): React.CSSProperties {
  const out = 16;
  switch (a) {
    case "top":    return { left: "50%", top: -out, transform: "translate(-50%, -100%)" };
    case "bottom": return { left: "50%", bottom: -out, transform: "translate(-50%, 100%)" };
    case "left":   return { right: out, top: "50%", transform: "translate(0, -50%)" };
    case "right":  return { left: out, top: "50%", transform: "translate(0, -50%)" };
    case "tl":
    case "tr":     return { left: "50%", top: -out, transform: "translate(-50%, -100%)" };
    case "bl":
    case "br":     return { left: "50%", bottom: -out, transform: "translate(-50%, 100%)" };
  }
}

export function NetworkViz({ compact = false }: { compact?: boolean }) {
  const height = compact ? 360 : 560;
  return (
    <div
      className="relative w-full overflow-hidden rounded-3xl border border-white/10"
      style={{
        height,
        background:
          "radial-gradient(circle at 50% 50%, rgba(56,189,248,0.12), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(10,12,20,0.9), rgba(4,6,12,0.95))",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(circle at 50% 50%, rgba(0,0,0,1) 30%, rgba(0,0,0,0.05) 85%)",
        }}
      />

      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <radialGradient id="nvCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="nvLine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {[14, 24, 34].map((r) => (
          <circle
            key={r}
            cx={center.x}
            cy={center.y}
            r={r}
            fill="none"
            stroke="rgba(34,211,238,0.10)"
            strokeWidth="0.10"
            strokeDasharray="0.6 0.8"
          />
        ))}

        <circle cx={center.x} cy={center.y} r="14" fill="url(#nvCoreGlow)" />

        {agents.map((a) => (
          <line
            key={`r-${a.id}`}
            x1={center.x} y1={center.y} x2={a.x} y2={a.y}
            stroke="url(#nvLine)"
            strokeWidth="0.18"
            strokeDasharray="1.2 1"
          />
        ))}

        {/* peer ring connections */}
        {agents.map((a, i) => {
          const b = agents[(i + 1) % agents.length];
          return (
            <line
              key={`p-${a.id}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="rgba(168,85,247,0.18)"
              strokeWidth="0.10"
              strokeDasharray="0.5 0.8"
            />
          );
        })}

        {/* one-way data flows core → agent */}
        {agents.map((a, i) => (
          <motion.circle
            key={`flow-${a.id}`}
            r="0.55"
            fill={a.color}
            initial={{ cx: center.x, cy: center.y, opacity: 0 }}
            animate={{
              cx: [center.x, a.x],
              cy: [center.y, a.y],
              opacity: [0, 0.9, 0],
            }}
            transition={{
              duration: 3.8,
              repeat: Infinity,
              delay: i * 0.55,
              ease: "linear",
              times: [0, 0.6, 1],
            }}
          />
        ))}

        {/* slow rotating sweep */}
        <motion.line
          x1={center.x} y1={center.y} x2={center.x + 36} y2={center.y}
          stroke="rgba(34,211,238,0.16)" strokeWidth="0.14"
          style={{ originX: `${center.x}%`, originY: `${center.y}%` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
        />
      </svg>

      {/* core */}
      <div
        className="absolute"
        style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
      >
        <div className="relative flex h-[112px] w-[112px] items-center justify-center rounded-full border border-cyan-300/30 bg-gradient-to-br from-cyan-400/20 to-purple-500/20 backdrop-blur-xl">
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: "0 0 60px rgba(34,211,238,0.32)" }}
            animate={{ opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative h-12 w-12 rounded-full bg-gradient-to-br from-cyan-300 to-purple-400" />
          <div className="pointer-events-none absolute -bottom-7 whitespace-nowrap text-[10px] uppercase tracking-[0.32em] text-cyan-200/80">
            HiveMind Core
          </div>
        </div>
      </div>

      {/* agent nodes */}
      {agents.map((a, i) => (
        <motion.div
          key={a.id}
          className="absolute"
          style={{ left: `${a.x}%`, top: `${a.y}%`, transform: "translate(-50%, -50%)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: i * 0.08 }}
        >
          <div className="relative h-3 w-3">
            <div
              className="absolute inset-0 rounded-full ring-2 ring-black/60"
              style={{
                background: a.color,
                boxShadow: `0 0 14px ${a.color}, 0 0 30px ${a.color}66`,
              }}
            />
          </div>

          <div className="pointer-events-none absolute" style={labelOffset(a.anchor)}>
            <div className="flex flex-col items-center gap-1 whitespace-nowrap">
              <div
                className="rounded-md border border-white/10 bg-[#06091a]/95 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-white/85 backdrop-blur"
                style={{ boxShadow: `inset 0 0 0 1px ${a.color}26` }}
              >
                {a.label}
              </div>
              <div className="text-[9px] tracking-wider text-white/45">{a.model}</div>
            </div>
          </div>
        </motion.div>
      ))}

      <div className="pointer-events-none absolute left-4 top-4 text-[10px] uppercase tracking-[0.3em] text-cyan-300/60">
        ◢ live coordination
      </div>
      <div className="pointer-events-none absolute right-4 top-4 text-[10px] tabular-nums text-white/40">
        sync 99.8% · 12ms
      </div>
      <div className="pointer-events-none absolute left-4 bottom-4 text-[10px] tabular-nums text-white/40">
        msgs/s 184 · agents 6/6
      </div>
      <div className="pointer-events-none absolute right-4 bottom-4 text-[10px] uppercase tracking-[0.3em] text-purple-300/60">
        net.v7 ◣
      </div>
    </div>
  );
}
