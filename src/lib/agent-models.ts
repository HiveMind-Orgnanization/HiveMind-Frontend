/**
 * Shared model catalog. Same shape used in Mission Create and in any UI that wants to
 * render the human-readable label for a stored model id (e.g. agent rosters, dashboards).
 *
 * IMPORTANT: backend routes every OpenAI-compatible call through OPENAI_MODEL_ALL=gpt-5.5
 * (see hivemind-backend agent-runtime.ts). The non-OpenAI ids here (Claude, Llama,
 * DeepSeek, Mixtral, Gemini) advertise HiveMind's multi-provider routing story but the
 * runtime falls back to env routing — isOpenAiModel() returns false for those ids.
 */
export type AgentModelTier = "light" | "standard" | "reasoning" | "premium";

export type AgentModel = {
  id: string;
  label: string;
  desc: string;
  /** Cost multiplier vs. baseline (gpt-4o-mini = 1.0) — drives Mission Create's SOL estimate. */
  solMult: number;
  tier: AgentModelTier;
};

export const AGENT_MODEL_CATALOG: readonly AgentModel[] = [
  { id: "gpt-4o-mini",       label: "GPT-4o mini",      desc: "Fast · cost-efficient",         solMult: 1.0, tier: "light"     },
  { id: "gpt-4.1-mini",      label: "GPT-4.1 mini",     desc: "Latest · efficient",            solMult: 1.1, tier: "light"     },
  { id: "gpt-5-nano",        label: "GPT-5 nano",       desc: "Fastest · ultra-efficient",     solMult: 1.2, tier: "light"     },
  { id: "gpt-4o",            label: "GPT-4o",           desc: "Powerful · balanced",           solMult: 1.4, tier: "standard"  },
  { id: "gpt-4.1",           label: "GPT-4.1",          desc: "Latest · powerful",             solMult: 1.6, tier: "standard"  },
  { id: "gpt-5-mini",        label: "GPT-5 mini",       desc: "Fast · capable",                solMult: 1.8, tier: "standard"  },
  { id: "o1-mini",           label: "o1 mini",          desc: "Reasoning · affordable",        solMult: 2.0, tier: "reasoning" },
  { id: "o3-mini",           label: "o3 mini",          desc: "Advanced reasoning",            solMult: 2.4, tier: "reasoning" },
  { id: "o1",                label: "o1",               desc: "Deep reasoning",                solMult: 3.2, tier: "premium"   },
  { id: "o3",                label: "o3",               desc: "Best-in-class reasoning",       solMult: 4.0, tier: "premium"   },
  { id: "gpt-5.1",           label: "GPT-5.1",          desc: "Most powerful · best-in-class", solMult: 5.0, tier: "premium"   },
  { id: "gpt-5.5",           label: "GPT-5.5",          desc: "Latest · best for codegen",     solMult: 5.5, tier: "premium"   },
  { id: "gpt-5.5-pro",       label: "GPT-5.5 pro",      desc: "Top tier · heavy artifacts",    solMult: 6.5, tier: "premium"   },
  { id: "claude-4.7-sonnet", label: "Claude 4.7 Sonnet", desc: "Anthropic · strong reasoning", solMult: 4.4, tier: "premium"   },
  { id: "claude-4.7-opus",   label: "Claude 4.7 Opus",   desc: "Anthropic · top-tier",         solMult: 6.0, tier: "premium"   },
  { id: "llama-4-70b",       label: "Llama 4 70B",       desc: "Groq · fast OSS",              solMult: 1.6, tier: "standard"  },
  { id: "llama-4-405b",      label: "Llama 4 405B",      desc: "Groq · OSS reasoning",         solMult: 3.0, tier: "reasoning" },
  { id: "mixtral-8x22b",     label: "Mixtral 8x22B",     desc: "Groq · MoE efficiency",        solMult: 1.4, tier: "standard"  },
  { id: "deepseek-v3",       label: "DeepSeek v3",       desc: "DeepSeek · code-tuned",        solMult: 1.5, tier: "standard"  },
  { id: "gemini-2.5-pro",    label: "Gemini 2.5 Pro",    desc: "Google · long-context",        solMult: 4.6, tier: "premium"   },
] as const;

const _BY_ID = new Map(AGENT_MODEL_CATALOG.map((m) => [m.id, m]));

/** Render the friendly label for a stored model id; falls back to the raw id when not catalogued. */
export function labelForModel(id: string | null | undefined): string {
  if (!id) return "—";
  return _BY_ID.get(id)?.label ?? id;
}

/** Lookup the full model entry, or null when not catalogued. */
export function findAgentModel(id: string | null | undefined): AgentModel | null {
  if (!id) return null;
  return _BY_ID.get(id) ?? null;
}
