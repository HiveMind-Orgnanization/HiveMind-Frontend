# HiveMind — Frontend

> The Vite + React + TypeScript frontend for HiveMind, an autonomous AI workforce on Solana.

Type one sentence describing what you want built. Nine specialist agents collaborate to ship it end-to-end — paid through an on-chain Solana escrow.

This repo contains the user-facing app: landing page, mission creation wizard, multi-agent workspace with live Sandpack preview, treasury dashboard, and on-chain interactions via Solana wallet adapter.

**Live:** *(your Vercel URL)* · **Demo:** [YouTube](https://www.youtube.com/watch?v=5d9067mHfPE&t=1s) · **Docs:** [HiveMind-Docs](https://github.com/HiveMind-Orgnanization/HiveMind-Docs)

---

## What's in this repo

| Path | Purpose |
|---|---|
| `src/app/Landing.tsx` | Public landing page with embedded demo video |
| `src/app/Dashboard.tsx` | Mission analytics, agent status, coordination graph |
| `src/app/MissionCreate.tsx` | Mission wizard — prompt, agents, models, budget |
| `src/app/AgentWorkspace.tsx` | Chat with the swarm + Sandpack live preview |
| `src/app/Treasury.tsx` | On-chain deposits, cashflow chart, escrow composition |
| `src/lib/agent-models.ts` | Per-role model catalog (single source of truth) |
| `src/lib/api.ts` | Backend HTTP + async polling helpers |
| `src/app/hooks/` | Realtime WebSocket hooks (`useHiveMind*`, `useMissionPayment`, etc.) |
| `src/app/providers/WalletProviders.tsx` | Solana wallet-adapter setup |

---

## Tech stack

- **Vite + React 18 + TypeScript** — bundler, framework, types
- **Tailwind CSS** + **motion/react** — styling and animation
- **@codesandbox/sandpack-react** — in-browser preview rendering
- **@solana/wallet-adapter-react** + **@solana/web3.js** — wallet and on-chain RPC
- **sonner** — toasts
- **react-router** — routing

---

## Local setup

### Prerequisites

- **Node.js 20+** and **pnpm**
- A Solana wallet (Solflare or Phantom) configured for devnet
- The [HiveMind-Backend](https://github.com/HiveMind-Orgnanization/HiveMind-Backend) running locally on port 8787

### Install and run

```bash
git clone https://github.com/HiveMind-Orgnanization/HiveMind-Frontend.git
cd HiveMind-Frontend
pnpm install
cp .env.example .env.local   # then edit with your values
pnpm dev
```

Open `http://localhost:5173`.

### Environment variables

```bash
# Backend API base URL — required
VITE_API_URL=http://localhost:8787

# Solana devnet RPC — optional; defaults to clusterApiUrl("devnet")
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com

# Treasury recipient pubkey — optional; defaults to the funder pubkey on devnet
VITE_HM_TREASURY_PUBKEY=G4o8wSS85JzcpDqTN9RWKaUvFF2a3bT3x2yewyk4xWPc
```

### Production build

```bash
pnpm build       # → dist/
pnpm preview     # serve dist/ on http://localhost:4173
```

---

## Deployment

The production build is deployed on **Vercel**. The repo includes a `vercel.json` that:

- Rewrites `/preview/*` to the backend's preview server (HTTP, not HTTPS, behind Vercel's edge)
- Adds `no-store` cache headers to preview routes
- Falls back to `index.html` for SPA routes

To deploy your own copy:

```bash
vercel link
vercel env add VITE_API_URL          # https://your-backend-domain
vercel env add VITE_SOLANA_RPC_URL   # optional
vercel deploy --prod
```

---

## Project conventions

- **No emojis in code.** UI uses Lucide icons exclusively.
- **No CSS files.** All styling via Tailwind utility classes.
- **Per-wallet localStorage scoping.** Keys prefixed with `hm-*:<walletPubkey>` so wallets never see each other's data.
- **Async API calls.** Vercel's 30s rewrite limit means every long-running endpoint uses the `202 + jobId` + polling pattern.
- **Custom Sandpack overlay.** We hide Sandpack's red error overlay (`showSandpackErrorOverlay={false}`) and surface friendly amber overlays + in-chat auto-fix bubbles instead.

---

## Contributing

Contributions are very welcome — this was built during a hackathon, and the roadmap is wide open.

### How to contribute

1. **Open an issue first** if you're planning a non-trivial change. We'd like to discuss the design before you write code.
2. **Fork the repo**, create a branch named `feat/your-feature` or `fix/your-fix`.
3. **Match the existing style.** Tailwind, Lucide, motion/react. No new dependencies without discussion.
4. **Test locally.** Run `pnpm build` and confirm there are no TypeScript or build errors.
5. **Open a PR** with a clear description of what changed and why. Include screenshots for any visible UI changes.

### Good first issues

- Add unit tests for `src/lib/agent-models.ts` (`resolveAgentModelId`, etc.)
- Replace remaining hardcoded mock data on `Reputation` / `Memory Explorer` / `Marketplace` with live API data
- Improve mobile layout for the Agent Workspace split view
- Add keyboard shortcuts for layout toggling (Chat-only / Split / Code-only)

### What we won't merge

- Marketing / aspirational text in code comments
- Comments that just describe what code does without explaining *why*
- New dependencies that duplicate existing functionality
- PRs that mix unrelated changes

---

## Related repos

- **[HiveMind-Backend](https://github.com/HiveMind-Orgnanization/HiveMind-Backend)** — Fastify API, agent orchestration, preview manager
- **[hivemind-contracts](https://github.com/HiveMind-Orgnanization/hivemind-contracts)** — Anchor Solana program
- **[HiveMind-Docs](https://github.com/HiveMind-Orgnanization/HiveMind-Docs)** — Docusaurus documentation site

---

## License

MIT — see `LICENSE`.

Built for the [Colosseum Hackathon](https://www.colosseum.org/), May 2026.
