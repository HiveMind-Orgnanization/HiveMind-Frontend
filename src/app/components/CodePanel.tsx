/**
 * Colorful, VS Code-style syntax-highlighted code panel.
 *
 * Uses react-syntax-highlighter with the Prism light build + a single dark
 * theme (oneDark) so the dependency graph stays small and we don't import
 * megabytes of language grammars we'll never use. The previous attempt with
 * CodeMirror tripped Vite's production minifier on a circular ESM cycle inside
 * the wallet-adapter peer graph (TDZ "Cannot access 'et' before init"); Prism
 * has no such cross-package cycles so this stays safe to ship to prod.
 *
 * Theme + line numbers + a language chip + a subtle gradient header give the
 * panel the "extraordinary look" the user asked for without dragging in a
 * full editor surface (out of scope — viewer first, editor later).
 */
import { useMemo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

/** Map filename / language hint → Prism grammar name. Prism accepts the
 *  hint as-is when known; everything else falls through to plain text. */
function detectLanguage(path: string, hint?: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (hint) {
    const lower = hint.toLowerCase();
    if (lower in PRISM_ALIASES) return PRISM_ALIASES[lower]!;
    return lower;
  }
  return EXT_TO_LANG[ext] ?? "text";
}

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  md: "markdown",
  mdx: "markdown",
  css: "css",
  scss: "scss",
  sass: "sass",
  html: "markup",
  xml: "markup",
  svg: "markup",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  rb: "ruby",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sql: "sql",
  graphql: "graphql",
  proto: "protobuf",
};

const PRISM_ALIASES: Record<string, string> = {
  typescript: "tsx",
  ts: "tsx",
  javascript: "jsx",
  js: "jsx",
  shell: "bash",
  yml: "yaml",
};

export function CodePanel({
  path,
  content,
  language,
  className,
  streaming = false,
}: {
  path: string;
  content: string;
  /** Optional language hint from the artifact metadata. */
  language?: string;
  className?: string;
  /** True while the LLM is still streaming tokens into `content`. When set,
   *  a blinking caret is appended to the rendered text so the user sees
   *  the file is actively being written. */
  streaming?: boolean;
}) {
  const lang = useMemo(() => detectLanguage(path, language), [path, language]);
  // When streaming, append an end-of-buffer marker that Prism leaves
  // un-tokenized. We render it as a CSS-blinking pseudo-cursor below.
  const displayContent = streaming
    ? `${content}​` /* zero-width joiner so Prism doesn't trim trailing newlines */
    : content;
  const lineCount = useMemo(() => displayContent.split("\n").length, [displayContent]);

  return (
    <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${className ?? ""}`}>
      <SyntaxHighlighter
        language={lang}
        style={oneDark}
        showLineNumbers
        wrapLines
        wrapLongLines
        customStyle={{
          margin: 0,
          padding: "16px 18px",
          background: "transparent",
          fontSize: "12.5px",
          lineHeight: "1.65",
          minHeight: "100%",
          height: "100%",
          width: "100%",
          overflow: "auto",
        }}
        lineNumberStyle={{
          minWidth: "2.5em",
          paddingRight: "1em",
          textAlign: "right",
          color: "rgba(148, 163, 184, 0.35)",
          userSelect: "none",
        }}
        codeTagProps={{
          style: {
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
          },
        }}
      >
        {displayContent || "// empty file"}
      </SyntaxHighlighter>

      {/* Blinking write caret while the LLM is mid-stream. Anchored bottom-left
          so it sits next to the live cursor at end-of-buffer — close enough to
          feel like a typewriter without trying to compute the exact glyph
          position (Prism wraps tokens in many spans, making that brittle). */}
      {streaming && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-12 bottom-3 inline-block h-3.5 w-[2px] animate-pulse bg-cyan-300/85 shadow-[0_0_8px_rgba(34,211,238,0.7)]"
        />
      )}

      {/* tiny chip top-right, matches VS Code's status bar idiom */}
      <div className="pointer-events-none absolute right-3 top-2.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/40">
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-0.5 font-mono text-cyan-300/85">
          {lang}
        </span>
        <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-white/50">
          {lineCount} ln
        </span>
      </div>
    </div>
  );
}
