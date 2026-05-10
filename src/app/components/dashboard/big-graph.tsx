import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Plus, Minus, Maximize2, Move } from "lucide-react";

type Anchor = "top" | "right" | "bottom" | "left" | "tl" | "tr" | "bl" | "br";

const agents: {
  id: string; label: string; x: number; y: number; color: string; anchor: Anchor; state: string;
}[] = [
  { id: "strategy",     label: "Strategy",     x: 50, y: 16, color: "#22d3ee", anchor: "top",    state: "Thinking" },
  { id: "research",     label: "Research",     x: 76, y: 28, color: "#a855f7", anchor: "tr",     state: "Retrieving" },
  { id: "design",       label: "Design",       x: 84, y: 52, color: "#3b82f6", anchor: "right",  state: "Generating" },
  { id: "development",  label: "Development",  x: 76, y: 76, color: "#0ea5e9", anchor: "br",     state: "Executing" },
  { id: "treasury",     label: "Treasury",     x: 50, y: 88, color: "#10b981", anchor: "bottom", state: "Reviewing" },
  { id: "analytics",    label: "Analytics",    x: 24, y: 76, color: "#8b5cf6", anchor: "bl",     state: "Streaming" },
  { id: "memory",       label: "Memory",       x: 16, y: 52, color: "#f59e0b", anchor: "left",   state: "Indexing" },
  { id: "coordination", label: "Coordination", x: 24, y: 28, color: "#06b6d4", anchor: "tl",     state: "Routing" },
];

const paths: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
  [0, 4], [2, 6], [1, 5],
];

const center = { x: 50, y: 52 };

function labelStyle(a: Anchor): React.CSSProperties {
  const out = 14;
  switch (a) {
    case "top":    return { left: "50%", top: -out, transform: "translate(-50%, -100%)" };
    case "bottom": return { left: "50%", bottom: -out, transform: "translate(-50%, 100%)" };
    case "left":   return { right: out, top: "50%", transform: "translate(0, -50%)" };
    case "right":  return { left: out, top: "50%", transform: "translate(0, -50%)" };
    case "tl":     return { left: "50%", top: -out, transform: "translate(-50%, -100%)" };
    case "tr":     return { left: "50%", top: -out, transform: "translate(-50%, -100%)" };
    case "bl":     return { left: "50%", bottom: -out, transform: "translate(-50%, 100%)" };
    case "br":     return { left: "50%", bottom: -out, transform: "translate(-50%, 100%)" };
  }
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.4;

export function BigGraph() {
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const onWheel = useCallback((e: WheelEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    const factor = e.ctrlKey || e.metaKey ? 0.012 : 0.0025;
    setZoom((z) => clampZoom(z * (1 - e.deltaY * factor)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  return (
    <div
      ref={containerRef}
      className="relative h-[640px] w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-black/70 to-[#04060e]/80 backdrop-blur-xl"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(circle at 50% 50%, rgba(0,0,0,1) 30%, rgba(0,0,0,0.1) 85%)",
        }}
      />

      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ touchAction: "none" }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: dragRef.current ? "none" : "transform 0.18s ease-out",
          }}
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            <defs>
              <radialGradient id="bgCore" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="bgEdge" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.5" />
              </linearGradient>
            </defs>

            {[12, 22, 32].map((r) => (
              <circle
                key={r}
                cx={center.x}
                cy={center.y}
                r={r}
                fill="none"
                stroke="rgba(34,211,238,0.08)"
                strokeWidth="0.10"
              />
            ))}
            <circle cx={center.x} cy={center.y} r="12" fill="url(#bgCore)" />

            {agents.map((a) => (
              <line
                key={`r-${a.id}`}
                x1={center.x} y1={center.y} x2={a.x} y2={a.y}
                stroke={a.color}
                strokeOpacity={hover === a.id ? 0.6 : 0.16}
                strokeWidth="0.18"
              />
            ))}

            {paths.map(([i, j], k) => (
              <line
                key={`p-${k}`}
                x1={agents[i].x} y1={agents[i].y} x2={agents[j].x} y2={agents[j].y}
                stroke="url(#bgEdge)" strokeOpacity="0.14" strokeWidth="0.14"
              />
            ))}

            {agents.map((a, i) => (
              <motion.circle
                key={`flow-${a.id}`}
                r="0.5"
                fill={a.color}
                initial={{ cx: center.x, cy: center.y, opacity: 0 }}
                animate={{
                  cx: [center.x, a.x],
                  cy: [center.y, a.y],
                  opacity: [0, 0.8, 0],
                }}
                transition={{
                  duration: 3.6,
                  repeat: Infinity,
                  delay: i * 0.45,
                  ease: "linear",
                  times: [0, 0.6, 1],
                }}
              />
            ))}

            <motion.line
              x1={center.x} y1={center.y} x2={center.x + 36} y2={center.y}
              stroke="rgba(34,211,238,0.18)" strokeWidth="0.16"
              style={{ originX: `${center.x}%`, originY: `${center.y}%` }}
              animate={{ rotate: 360 }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            />
          </svg>

          <div
            className="absolute"
            style={{ left: "50%", top: "52%", transform: "translate(-50%, -50%)" }}
          >
            <div className="relative flex h-[92px] w-[92px] items-center justify-center rounded-full border border-cyan-300/30 bg-gradient-to-br from-cyan-400/20 to-purple-500/20 backdrop-blur-xl">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ boxShadow: "0 0 50px rgba(34,211,238,0.35)" }}
                animate={{ opacity: [0.55, 0.85, 0.55] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-cyan-300 to-purple-400" />
              <div className="pointer-events-none absolute -bottom-7 whitespace-nowrap text-[9px] uppercase tracking-[0.32em] text-cyan-200/70">
                HiveMind Core
              </div>
            </div>
          </div>

          {agents.map((a) => (
            <div
              key={a.id}
              className="absolute"
              style={{ left: `${a.x}%`, top: `${a.y}%`, transform: "translate(-50%, -50%)" }}
              onMouseEnter={() => setHover(a.id)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="relative h-3 w-3">
                <div
                  className="absolute inset-0 rounded-full ring-2 ring-black/60 transition-transform duration-200"
                  style={{
                    background: a.color,
                    boxShadow: `0 0 12px ${a.color}, 0 0 28px ${a.color}66`,
                    transform: hover === a.id ? "scale(1.35)" : "scale(1)",
                  }}
                />
              </div>

              <div className="pointer-events-none absolute" style={labelStyle(a.anchor)}>
                <div className="flex flex-col items-center gap-0.5 whitespace-nowrap">
                  <div
                    className="rounded-md border border-white/10 bg-[#06091a]/95 px-2 py-0.5 text-[9.5px] uppercase tracking-[0.18em] text-white/85"
                    style={{ boxShadow: `inset 0 0 0 1px ${a.color}26` }}
                  >
                    {a.label}
                  </div>
                  <div className="text-[9px]" style={{ color: a.color }}>● {a.state}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1.5 rounded-xl border border-white/10 bg-black/60 p-1.5 backdrop-blur">
        <button
          onClick={() => setZoom((z) => clampZoom(z + 0.2))}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-white/70 hover:border-cyan-300/40 hover:text-cyan-200"
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <div className="px-1 text-center text-[9px] tabular-nums text-white/50">
          {Math.round(zoom * 100)}%
        </div>
        <button
          onClick={() => setZoom((z) => clampZoom(z - 0.2))}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-white/70 hover:border-cyan-300/40 hover:text-cyan-200"
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <div className="my-0.5 h-px bg-white/10" />
        <button
          onClick={reset}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-white/70 hover:border-cyan-300/40 hover:text-cyan-200"
          aria-label="Reset"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="pointer-events-none absolute left-3 top-3 text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">
        ◢ orchestration · live
      </div>
      <div className="pointer-events-none absolute right-16 top-3 text-[10px] tabular-nums text-white/40">
        msgs/s 248 · sync 99.9%
      </div>
      <div className="pointer-events-none absolute left-3 bottom-3 text-[10px] tabular-nums text-white/40">
        agents 8/8 · edges 11
      </div>
      <div className="pointer-events-none absolute left-1/2 bottom-3 flex -translate-x-1/2 items-center gap-1.5 text-[9px] uppercase tracking-[0.25em] text-white/30">
        <Move className="h-3 w-3" /> drag · scroll to zoom
      </div>
      <div className="pointer-events-none absolute right-3 bottom-3 text-[10px] uppercase tracking-[0.3em] text-purple-300/60">
        graph.v7 ◣
      </div>
    </div>
  );
}

export const WORKSPACE_AGENTS = agents;
