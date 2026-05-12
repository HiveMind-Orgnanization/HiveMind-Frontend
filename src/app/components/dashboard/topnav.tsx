import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, Bell, ChevronDown, Plus, Radio, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { WalletButton } from "./wallet-button";
import { useCommandPalette } from "../../contexts/CommandPaletteContext";
import { useNotifications } from "../../contexts/NotificationsContext";
import { useMissions, type Mission } from "../../store";

const STATUS_ICON: Record<string, { icon: typeof Radio; color: string }> = {
  active:    { icon: Radio,         color: "#22d3ee" },
  completed: { icon: CheckCircle2,  color: "#10b981" },
  pending:   { icon: Clock,         color: "#f59e0b" },
  failed:    { icon: XCircle,       color: "#f87171" },
};

function statusDot(status: string) {
  const color = STATUS_ICON[status]?.color ?? "#6b7280";
  return color;
}

function MissionSwitcher() {
  const { missions } = useMissions();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const [activeMissionId, setActiveMissionId] = useState<string | null>(
    () => localStorage.getItem("hm-active-mission-id"),
  );

  // Sync if localStorage changes from MissionCreate navigation
  useEffect(() => {
    const onStorage = () => setActiveMissionId(localStorage.getItem("hm-active-mission-id"));
    window.addEventListener("storage", onStorage);
    window.addEventListener("hm-missions-updated", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("hm-missions-updated", onStorage);
    };
  }, []);

  // Close on outside click — check both the trigger button and the portal dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        ref.current?.contains(t) ||
        dropdownRef.current?.contains(t)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleToggle() {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen((v) => !v);
  }

  const activeMission: Mission | undefined =
    (activeMissionId ? missions.find((m) => m.id === activeMissionId) : undefined) ??
    missions.find((m) => m.status === "active") ??
    missions[0];

  function selectMission(m: Mission) {
    localStorage.setItem("hm-active-mission-id", m.id);
    setActiveMissionId(m.id);
    setOpen(false);
    window.dispatchEvent(new CustomEvent("hm-active-mission-changed", { detail: { id: m.id } }));
    navigate("/agents");
  }

  // Smarter title preview for the navbar — strip trailing detail lists ("— hero, mint…"),
  // truncate at a word boundary so we never mid-word, and cap at ~36 chars.
  const previewTitle = (() => {
    if (!activeMission) return "";
    const head = activeMission.title.split(/\s+[—–-]\s+/)[0]!.trim() || activeMission.title;
    if (head.length <= 36) return head;
    const truncated = head.slice(0, 36);
    const lastSpace = truncated.lastIndexOf(" ");
    return `${truncated.slice(0, lastSpace > 20 ? lastSpace : 36).trimEnd()}…`;
  })();
  const label = activeMission
    ? `Mission #${activeMission.id} · ${previewTitle}`
    : "No active mission";

  const dotColor = activeMission ? statusDot(activeMission.status) : "#6b7280";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-white/85 hover:border-cyan-300/30 transition-colors"
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor: dotColor,
            boxShadow: activeMission?.status === "active" ? `0 0 8px ${dotColor}` : "none",
          }}
        />
        <span className="max-w-[220px] truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] w-80 overflow-hidden rounded-xl border border-white/10 bg-[#080b14] shadow-2xl shadow-black/60"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
            <span className="text-[10px] uppercase tracking-[0.3em] text-white/30">
              Missions · {missions.length}
            </span>
            <Link
              to="/missions/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 rounded-md bg-cyan-300/10 px-2 py-1 text-[11px] text-cyan-300 hover:bg-cyan-300/20"
            >
              <Plus className="h-3 w-3" />
              New
            </Link>
          </div>

          {/* Mission list */}
          <div className="max-h-72 overflow-y-auto">
            {missions.length === 0 ? (
              <div className="py-8 text-center text-xs text-white/30">No missions yet</div>
            ) : (
              missions.map((m) => {
                const isSelected = m.id === activeMission?.id;
                const dot = statusDot(m.status);
                return (
                  <button
                    key={m.id}
                    onClick={() => selectMission(m)}
                    className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] ${
                      isSelected ? "bg-cyan-300/[0.06]" : ""
                    }`}
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: dot,
                        boxShadow: m.status === "active" ? `0 0 6px ${dot}` : "none",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[11px] font-mono text-white/40">#{m.id}</span>
                        {isSelected && (
                          <span className="rounded-full bg-cyan-300/10 px-1.5 py-0.5 text-[9px] text-cyan-300">
                            viewing
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[13px] text-white/85">{m.title}</div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-white/35">
                        <span className="capitalize">{m.status}</span>
                        <span>·</span>
                        <span>{m.progress ?? 0}%</span>
                        <span>·</span>
                        <span>{m.agents?.length ?? 0} agents</span>
                      </div>
                    </div>
                    {m.status === "active" && (
                      <div className="mt-1.5 shrink-0">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        </span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/5 px-3 py-2">
            <Link
              to="/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70"
            >
              View all on Dashboard →
            </Link>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function TopNav() {
  const { openPalette } = useCommandPalette();
  const { unread } = useNotifications();

  return (
    <header className="flex h-14 items-center gap-4 border-b border-white/5 bg-black/40 px-5 backdrop-blur-xl">
      <MissionSwitcher />

      <div className="relative ml-2 hidden flex-1 max-w-md md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
        <input
          readOnly
          onClick={openPalette}
          placeholder="Search agents, missions, transactions…"
          className="w-full cursor-pointer rounded-lg border border-white/10 bg-white/[0.02] py-1.5 pl-9 pr-16 text-sm text-white placeholder:text-white/30 focus:border-cyan-300/40 focus:outline-none hover:border-white/20"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white/40">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Link
          to="/notifications"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] hover:border-cyan-300/30"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4 text-white/70" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-300 text-[9px] font-bold text-black shadow-[0_0_8px_rgba(34,211,238,0.9)]">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>

        <WalletButton />
      </div>
    </header>
  );
}
