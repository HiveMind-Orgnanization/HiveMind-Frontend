/**
 * Read-only code viewer with VS Code–style syntax highlighting.
 *
 * Uses react-syntax-highlighter's Prism *light* build so we only ship the
 * tokenizers we actually need (TS/JS/JSX/TSX/CSS/JSON/markdown/bash/python/
 * yaml/html) instead of the 1 MB "everything" bundle. The vscDarkPlus theme
 * is Prism's reasonable approximation of VS Code Dark+, so the file viewer
 * in Agent Workspace reads the same way developers expect from their editor.
 *
 * Line numbers are on by default for files over ~10 lines so users can
 * scan + reference specific lines in chat ("look at line 42 of …").
 */
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import graphql from "react-syntax-highlighter/dist/esm/languages/prism/graphql";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import scss from "react-syntax-highlighter/dist/esm/languages/prism/scss";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import toml from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("diff", diff);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("graphql", graphql);
SyntaxHighlighter.registerLanguage("gql", graphql);
SyntaxHighlighter.registerLanguage("html", markup);
SyntaxHighlighter.registerLanguage("xml", markup);
SyntaxHighlighter.registerLanguage("svg", markup);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("mjs", javascript);
SyntaxHighlighter.registerLanguage("cjs", javascript);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("jsonc", json);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("md", markdown);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("rs", rust);
SyntaxHighlighter.registerLanguage("scss", scss);
SyntaxHighlighter.registerLanguage("sass", scss);
SyntaxHighlighter.registerLanguage("less", scss);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("toml", toml);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);

/**
 * Maps a file path / declared language to a Prism token. Prism is strict —
 * unknown tokens render plain text, so the resolver normalizes extensions and
 * defaults to "typescript" (the dominant language in our generated artifacts).
 */
export function resolvePrismLanguage(path: string, declared: string | null | undefined): string {
  const p = (path || "").toLowerCase();
  const dot = p.lastIndexOf(".");
  const ext = dot >= 0 ? p.slice(dot + 1) : "";
  const d = (declared || "").toLowerCase().trim();

  // Direct hits — the most common cases first.
  const known: Record<string, string> = {
    tsx: "tsx", ts: "typescript", typescript: "typescript",
    jsx: "jsx", js: "javascript", javascript: "javascript",
    mjs: "javascript", cjs: "javascript",
    json: "json", jsonc: "json",
    css: "css", scss: "scss", sass: "scss", less: "scss",
    html: "html", htm: "html", xml: "xml", svg: "svg",
    md: "markdown", markdown: "markdown",
    py: "python", python: "python",
    rs: "rust", rust: "rust",
    go: "go", golang: "go",
    sh: "bash", bash: "bash", zsh: "bash",
    yml: "yaml", yaml: "yaml",
    toml: "toml",
    sql: "sql",
    graphql: "graphql", gql: "graphql",
    diff: "diff", patch: "diff",
  };

  if (d && known[d]) return known[d];
  if (ext && known[ext]) return known[ext];

  // Filenames without an extension that we still want to colour.
  if (p.endsWith("dockerfile") || p === "dockerfile") return "bash";
  if (p.endsWith(".env")) return "bash";

  // Fallback: TypeScript is the dominant artifact language so it tokenizes
  // most files reasonably (even when the path's extension is unfamiliar).
  return "typescript";
}

export function CodeViewer({
  content,
  path,
  language,
  showLineNumbers,
}: {
  content: string;
  path: string;
  language?: string | null;
  /** Defaults to true when the file is over 10 lines. */
  showLineNumbers?: boolean;
}) {
  const lang = resolvePrismLanguage(path, language ?? null);
  const lineCount = content.split("\n").length;
  const showLines = showLineNumbers ?? lineCount > 10;

  return (
    <SyntaxHighlighter
      language={lang}
      style={vscDarkPlus}
      showLineNumbers={showLines}
      wrapLongLines={false}
      // The vscDarkPlus theme ships its own background — strip it so our
      // panel's gradient bg shows through and the seam looks intentional.
      customStyle={{
        background: "transparent",
        margin: 0,
        padding: "12px 16px",
        fontSize: "12px",
        lineHeight: "1.55",
      }}
      codeTagProps={{
        style: {
          background: "transparent",
          fontFamily:
            "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
          fontSize: "12px",
        },
      }}
      lineNumberStyle={{
        minWidth: "2.4em",
        paddingRight: "0.85em",
        color: "rgba(255,255,255,0.22)",
        userSelect: "none",
        textAlign: "right",
      }}
    >
      {content}
    </SyntaxHighlighter>
  );
}
