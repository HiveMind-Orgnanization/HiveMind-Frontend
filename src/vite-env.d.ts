/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SOLANA_RPC_URL?: string;
  readonly VITE_API_DISABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Build metadata injected by vite.config.ts via `define:`. Used by the
 *  in-app version badge so we can tell at a glance which commit + branch the
 *  page was built from — fastest way to spot a stale Vercel preview. */
declare const __HM_BUILD_SHA__: string;
declare const __HM_BUILD_BRANCH__: string;
declare const __HM_BUILD_TIME__: string;
