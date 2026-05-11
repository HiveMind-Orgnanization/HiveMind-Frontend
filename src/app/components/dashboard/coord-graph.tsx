import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion } from "motion/react";
import { Plus, Minus, Maximize2, Move } from "lucide-react";

type Anchor = "top" | "right" | "bottom" | "left" | "tl" | "tr" | "bl" | "br";

/** Lay 9 nodes evenly around the HiveMind core (radius ~38 vu) so labels and connecting
 *  lines never intersect. Start angle is -90 ° (Strategy directly on top) and we step
 *  every 40 ° clockwise. Anchor is chosen so the label sits on the outside of each node. */
type Node = { id: string; label: string; x: number; y: number; color: string; model: string; anchor: Anchor };
const CIRCLE_RADIUS_VU = 36;
function placeOnCircle(angleDeg: number): { x: number; y: number; anchor: Anchor } {
  const rad = (angleDeg * Math.PI) / 180;
  const x = 50 + CIRCLE_RADIUS_VU * Math.cos(rad);
  const y = 50 + CIRCLE_RADIUS_VU * Math.sin(rad);
  // Pick label anchor based on quadrant so the text always extends OUTSIDE the circle.
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let anchor: Anchor = "right";
  const absCos = Math.abs(cos);
  const absSin = Math.abs(sin);
  if (absSin > absCos * 1.6) anchor = sin > 0 ? "bottom" : "top";
  else if (absCos > absSin * 1.6) anchor = cos > 0 ? "right" : "left";
  else if (cos > 0 && sin > 0) anchor = "br";
  else if (cos > 0 && sin < 0) anchor = "tr";
  else if (cos < 0 && sin > 0) anchor = "bl";
  else anchor = "tl";
  return { x, y, anchor };
}

// 9 agents @ 40 ° apart, starting at -90 ° (Strategy at top, clockwise).
const ROLE_RING: { id: string; label: string; color: string; defaultModel: string }[] = [
  { id: "strategy",     label: "Strategy",     color: "#22d3ee", defaultModel: "GPT-4o" },
  { id: "research",     label: "Research",     color: "#a855f7", defaultModel: "DeepSeek v3" },
  { id: "design",       label: "Design",       color: "#3b82f6", defaultModel: "GPT-4.1" },
  { id: "development",  label: "Development",  color: "#0ea5e9", defaultModel: "Llama 4 70B" },
  { id: "marketing",    label: "Marketing",    color: "#ec4899", defaultModel: "Llama 4 70B" },
  { id: "treasury",     label: "Treasury",     color: "#10b981", defaultModel: "Mixtral 8x22B" },
  { id: "analytics",    label: "Analytics",    color: "#8b5cf6", defaultModel: "DeepSeek v3" },
  { id: "coordination", label: "Coordination", color: "#67e8f9", defaultModel: "GPT-4.1" },
  { id: "memory",       label: "Memory",       color: "#f59e0b", defaultModel: "GPT-4o mini" },
];

const GRAPH_NODES: Node[] = ROLE_RING.map((r, i) => {
  const angle = -90 + i * (360 / ROLE_RING.length);
  const p = placeOnCircle(angle);
  return { ...r, x: p.x, y: p.y, anchor: p.anchor, model: r.defaultModel };
});

const center = { x: 50, y: 50 };

function labelOffset(a: Anchor): React.CSSProperties {
  // Push labels further from the node dot so they don't collide with neighbours when
  // multiple agents sit close on the ring (e.g. 9-agent crit mission).
  const out = 18;
  switch (a) {
    case "top":    return { left: "50%", top: -out, transform: "translate(-50%, -100%)" };
    case "bottom": return { left: "50%", bottom: -out, transform: "translate(-50%, 100%)" };
    case "left":   return { right: out, top: "50%", transform: "translate(0, -50%)" };
    case "right":  return { left: out,  top: "50%", transform: "translate(0, -50%)" };
    // Diagonals: nudge BOTH axes so the label clears its neighbour on the same side.
    case "tl":     return { right: out * 0.6, bottom: out * 0.4, transform: "translate(0, 50%)" };
    case "tr":     return { left:  out * 0.6, bottom: out * 0.4, transform: "translate(0, 50%)" };
    case "bl":     return { right: out * 0.6, top:    out * 0.4, transform: "translate(0, -50%)" };
    case "br":     return { left:  out * 0.6, top:    out * 0.4, transform: "translate(0, -50%)" };
  }
}

export type CoordGraphProps = {
  /** When set, only these agents (by display name) are shown on the graph. */
  selectedAgentNames?: string[];
  /** Short faster pulses while simulating workflow. */
  simulateBurst?: boolean;
  /** Map of role name → friendly model label (e.g. "GPT-4o" / "Llama 4 70B").
   *  When provided, overrides each node's default model badge so the graph mirrors the
   *  Assemble Agent Crew section. */
  agentModelLabels?: Record<string, string>;
};

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.4;

export function CoordGraph(props: CoordGraphProps = {}) {
  const { selectedAgentNames, simulateBurst, agentModelLabels } = props;
  // Filter the ring down to selected agents, AND re-lay them so the remaining nodes are
  // evenly spaced. Without re-laying, 3 selected agents would cluster on the original ring
  // slots and leave huge gaps. Even spacing keeps the graph readable at every roster size.
  const visibleAgents = useMemo(() => {
    const base = (() => {
      if (!selectedAgentNames?.length) return GRAPH_NODES;
      const want = new Set(selectedAgentNames.map((s) => s.trim().toLowerCase()));
      const matched = GRAPH_NODES.filter((n) => want.has(n.label.toLowerCase()));
      return matched.length > 0 ? matched : GRAPH_NODES;
    })();
    const n = base.length;
    return base.map((node, i) => {
      const angle = -90 + i * (360 / Math.max(1, n));
      const p = placeOnCircle(angle);
      const model = agentModelLabels?.[node.label] ?? node.model;
      return { ...node, x: p.x, y: p.y, anchor: p.anchor, model };
    });
  }, [selectedAgentNames, agentModelLabels]);

  const flowDuration = simulateBurst ? 1.15 : 3.6;
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
    setPan({
      x: dragRef.current.px + (e.clientX - dragRef.current.x),
      y: dragRef.current.py + (e.clientY - dragRef.current.y),
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  return (
    <div
      ref={containerRef}
      className="relative h-[480px] w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-black/60 to-[#06091a]/60 backdrop-blur-xl"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
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
              <radialGradient id="cgGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </radialGradient>
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
            <circle cx={center.x} cy={center.y} r="12" fill="url(#cgGlow)" />

            {visibleAgents.map((a) => (
              <line
                key={`r-${a.id}`}
                x1={center.x} y1={center.y} x2={a.x} y2={a.y}
                stroke={a.color}
                strokeOpacity={hover === a.id ? 0.55 : 0.18}
                strokeWidth="0.18"
              />
            ))}

            {visibleAgents.map((a, i) => (
              <motion.circle
                key={`flow-${a.id}`}
                r="0.55"
                fill={a.color}
                initial={{ cx: center.x, cy: center.y, opacity: 0 }}
                animate={{
                  cx: [center.x, a.x],
                  cy: [center.y, a.y],
                  opacity: [0, 0.85, 0],
                }}
                transition={{
                  duration: flowDuration,
                  repeat: Infinity,
                  delay: i * (simulateBurst ? 0.12 : 0.5),
                  ease: "linear",
                  times: [0, 0.6, 1],
                }}
              />
            ))}

            <motion.line
              x1={center.x} y1={center.y} x2={center.x + 34} y2={center.y}
              stroke="rgba(34,211,238,0.18)" strokeWidth="0.16"
              style={{ originX: `${center.x}%`, originY: `${center.y}%` }}
              animate={{ rotate: 360 }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            />
          </svg>

          <div
            className="absolute"
            style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
          >
            <div className="relative flex h-[84px] w-[84px] items-center justify-center rounded-full border border-cyan-300/30 bg-gradient-to-br from-cyan-400/20 to-purple-500/20 backdrop-blur-xl">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ boxShadow: "0 0 44px rgba(34,211,238,0.3)" }}
                animate={{ opacity: [0.5, 0.85, 0.5] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative h-9 w-9 rounded-full bg-gradient-to-br from-cyan-300 to-purple-400" />
              <div className="pointer-events-none absolute -bottom-6 whitespace-nowrap text-[9px] uppercase tracking-[0.32em] text-cyan-200/70">
                HiveMind Core
              </div>
            </div>
          </div>

          {visibleAgents.map((a) => (
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
                    boxShadow: `0 0 12px ${a.color}, 0 0 26px ${a.color}66`,
                    transform: hover === a.id ? "scale(1.35)" : "scale(1)",
                  }}
                />
              </div>

              <div className="pointer-events-none absolute" style={labelOffset(a.anchor)}>
                <div className="flex flex-col items-center gap-0.5 whitespace-nowrap">
                  <div
                    className="rounded-md border border-white/10 bg-[#06091a]/95 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/85"
                    style={{ boxShadow: `inset 0 0 0 1px ${a.color}26` }}
                  >
                    {a.label}
                  </div>
                  <div className="text-[9px] text-white/45">{a.model}</div>
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

      <div className="pointer-events-none absolute left-3 top-3 text-[10px] uppercase tracking-[0.3em] text-cyan-300/60">
        ◢ live coordination
      </div>
      <div className="pointer-events-none absolute right-16 top-3 text-[10px] tabular-nums text-white/40">
        sync 99.8% · 12ms
      </div>
      {/* Footer: single flex row so the three pieces never overlap. The drag hint hides on
          narrow widths (md and below) where it would otherwise collide with the numbers. */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 text-[10px] tabular-nums text-white/40">
        <span className="whitespace-nowrap">
          msgs/s {Math.round(140 + visibleAgents.length * 22)} · agents {visibleAgents.length}/{GRAPH_NODES.length}
        </span>
        <span className="hidden lg:inline-flex items-center gap-1.5 whitespace-nowrap text-[9px] uppercase tracking-[0.25em] text-white/30">
          <Move className="h-3 w-3" /> drag · scroll to zoom
        </span>
        <span className="whitespace-nowrap uppercase tracking-[0.3em] text-purple-300/60">
          graph.v7 ◣
        </span>
      </div>
    </div>
  );
}
