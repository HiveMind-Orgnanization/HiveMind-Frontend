/**
 * Per-wallet workspace settings persistence.
 *
 * Settings persist to localStorage scoped by wallet pubkey so switching wallets
 * doesn't leak preferences across sessions. Each settings section has its own
 * key + setter pair; the Settings page subscribes to "hm-settings-changed"
 * events so multiple tabs / panels stay in sync.
 *
 * Schema is intentionally narrow — only fields the v1 UI exposes are tracked.
 * Anything aspirational (per-user API keys, fine-grained agent permissions,
 * team membership) lives in v2 and is surfaced in the UI with "Coming soon"
 * badges instead of pretending to persist.
 */
import { useCallback, useEffect, useState } from "react";

export type RouterStrategy = "cost" | "balance" | "quality";

export type WorkspaceSettings = {
  /** Per-model enabled flags keyed by model id (see lib/agent-models.ts catalog) */
  models: Record<string, boolean>;
  /** Cost/balance/quality routing preference for the model dispatcher */
  routerStrategy: RouterStrategy;
  /** AI behaviour preference toggles (free-form keyed by stable slug) */
  preferences: Record<string, boolean>;
  /** Notification preference toggles */
  notifications: Record<string, boolean>;
  /** Treasury automation toggles */
  treasury: Record<string, boolean>;
  /** Last-saved timestamp (ms since epoch) */
  savedAt: number | null;
};

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  models: {},
  routerStrategy: "balance",
  preferences: {
    streamReasoning: true,
    autoPauseLowConfidence: true,
    memoryRecallAlways: true,
    shadowMode: false,
    humanApprovalGates: false,
  },
  notifications: {
    missionCompletion: true,
    failedWorkflows: true,
    paymentApprovals: true,
    delegationRequests: false,
    securityAlerts: true,
  },
  treasury: {
    autoApproveSmallPayouts: true,
    multisigOverThreshold: true,
    lockEscrowOnStart: false,
    autoSettleOnApproval: true,
  },
  savedAt: null,
};

function storageKey(walletPk: string | null): string {
  return walletPk ? `hm-settings:${walletPk}` : "hm-settings:guest";
}

const CHANGE_EVENT = "hm-settings-changed";

export function readSettings(walletPk: string | null): WorkspaceSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(storageKey(walletPk));
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<WorkspaceSettings>;
    return {
      models:          { ...DEFAULT_SETTINGS.models,        ...(parsed.models        ?? {}) },
      routerStrategy:  parsed.routerStrategy ?? DEFAULT_SETTINGS.routerStrategy,
      preferences:     { ...DEFAULT_SETTINGS.preferences,   ...(parsed.preferences   ?? {}) },
      notifications:   { ...DEFAULT_SETTINGS.notifications, ...(parsed.notifications ?? {}) },
      treasury:        { ...DEFAULT_SETTINGS.treasury,      ...(parsed.treasury      ?? {}) },
      savedAt:         parsed.savedAt ?? null,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(walletPk: string | null, next: WorkspaceSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(walletPk), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { walletPk } }));
  } catch {
    /* quota errors etc. — non-fatal */
  }
}

/**
 * Hook surface for the Settings page (and any other component that needs to
 * read/update workspace preferences). Returns the current settings + an update
 * function. All updates write through immediately + broadcast the change event,
 * so the Save button is really an explicit-savepoint affordance rather than a
 * gate — preferences are durable as soon as the user toggles them.
 */
export function useWorkspaceSettings(walletPk: string | null) {
  const [settings, setSettings] = useState<WorkspaceSettings>(() => readSettings(walletPk));

  useEffect(() => {
    setSettings(readSettings(walletPk));
  }, [walletPk]);

  useEffect(() => {
    const handler = () => setSettings(readSettings(walletPk));
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, [walletPk]);

  const update = useCallback(
    (mutator: (prev: WorkspaceSettings) => WorkspaceSettings) => {
      setSettings((prev) => {
        const next = mutator(prev);
        writeSettings(walletPk, next);
        return next;
      });
    },
    [walletPk],
  );

  const stampSave = useCallback(() => {
    update((prev) => ({ ...prev, savedAt: Date.now() }));
  }, [update]);

  return { settings, update, stampSave };
}
