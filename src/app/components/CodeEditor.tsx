/**
 * CodeMirror-backed editor for the Agent Workspace file panel.
 *
 * Replaces the Prism-only read-only viewer with a single component that can
 * also enter an editable mode. CodeMirror 6 gives us proper text editing
 * affordances (Cmd+F find, Cmd+Z undo, Tab handling, auto-indent) for the
 * same bundle cost as the previous syntax highlighter — but it covers both
 * read AND edit cases, so we drop the duplicate Prism path.
 *
 * Theme: oneDark — the closest "VS Code Dark+" approximation that ships in
 * @codemirror/theme-one-dark. Background is set transparent so the panel's
 * existing gradient bleeds through.
 *
 * Language packages are imported eagerly here (12 total) because the user
 * can switch files at any time and we want zero-latency highlighting on
 * file open — lazy-loading would flash unhighlighted text on every switch.
 */
import { useMemo } from "react";
import CodeMirror, { EditorView, type Extension } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { sql } from "@codemirror/lang-sql";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { xml } from "@codemirror/lang-xml";
import { oneDark } from "@codemirror/theme-one-dark";

type LangKey =
  | "tsx" | "ts" | "jsx" | "js" | "css" | "html" | "json"
  | "markdown" | "python" | "yaml" | "sql" | "rust" | "go" | "xml" | "plain";

function pickLanguage(path: string, declared?: string | null): LangKey {
  const p = (path || "").toLowerCase();
  const dot = p.lastIndexOf(".");
  const ext = dot >= 0 ? p.slice(dot + 1) : "";
  const d = (declared || "").toLowerCase().trim();
  const known: Record<string, LangKey> = {
    tsx: "tsx", ts: "ts", typescript: "ts",
    jsx: "jsx", js: "js", mjs: "js", cjs: "js", javascript: "js",
    css: "css", scss: "css", sass: "css", less: "css",
    html: "html", htm: "html",
    json: "json", jsonc: "json",
    md: "markdown", markdown: "markdown",
    py: "python", python: "python",
    yml: "yaml", yaml: "yaml",
    sql: "sql",
    rs: "rust", rust: "rust",
    go: "go", golang: "go",
    xml: "xml", svg: "xml",
  };
  if (d && known[d]) return known[d];
  if (ext && known[ext]) return known[ext];
  return "plain";
}

function langExtension(lang: LangKey): Extension[] {
  switch (lang) {
    case "tsx": return [javascript({ jsx: true, typescript: true })];
    case "ts":  return [javascript({ typescript: true })];
    case "jsx": return [javascript({ jsx: true })];
    case "js":  return [javascript()];
    case "css": return [css()];
    case "html": return [html()];
    case "json": return [json()];
    case "markdown": return [markdown()];
    case "python": return [python()];
    case "yaml": return [yaml()];
    case "sql": return [sql()];
    case "rust": return [rust()];
    case "go": return [go()];
    case "xml": return [xml()];
    case "plain":
    default: return [];
  }
}

export function CodeEditor({
  value,
  path,
  language,
  editable,
  wrap,
  onChange,
  onCmdS,
  minHeight = "100%",
}: {
  value: string;
  path: string;
  language?: string | null;
  /** Read-only when false. */
  editable: boolean;
  /** Word-wrap long lines (toolbar toggle). */
  wrap: boolean;
  onChange: (next: string) => void;
  /** Cmd/Ctrl + S handler. Returning true preventsDefault on the keydown. */
  onCmdS?: () => void;
  minHeight?: string;
}) {
  const lang = pickLanguage(path, language ?? null);

  const extensions = useMemo<Extension[]>(() => {
    const base = langExtension(lang);
    const ext: Extension[] = [
      ...base,
      EditorView.theme({
        "&": {
          height: "100%",
          background: "transparent",
          fontSize: "12.5px",
        },
        ".cm-scroller": {
          fontFamily:
            "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
          lineHeight: "1.55",
        },
        ".cm-content": {
          padding: "12px 0",
        },
        ".cm-gutters": {
          background: "transparent",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        },
        ".cm-lineNumbers .cm-gutterElement": {
          color: "rgba(255,255,255,0.22)",
          paddingLeft: "10px",
          paddingRight: "8px",
        },
        ".cm-activeLine": {
          backgroundColor: "rgba(255,255,255,0.025)",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "rgba(34,211,238,0.06)",
          color: "rgba(255,255,255,0.55)",
        },
        ".cm-selectionBackground, ::selection": {
          background: "rgba(34,211,238,0.20) !important",
        },
        ".cm-cursor": {
          borderLeftColor: "#67e8f9",
        },
      }, { dark: true }),
    ];
    if (wrap) ext.push(EditorView.lineWrapping);
    if (onCmdS) {
      ext.push(
        EditorView.domEventHandlers({
          keydown: (event) => {
            if ((event.metaKey || event.ctrlKey) && (event.key === "s" || event.key === "S")) {
              event.preventDefault();
              onCmdS();
              return true;
            }
            return false;
          },
        }),
      );
    }
    return ext;
  }, [lang, wrap, onCmdS]);

  return (
    <CodeMirror
      value={value}
      theme={oneDark}
      editable={editable}
      readOnly={!editable}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: editable,
        highlightActiveLineGutter: editable,
        foldGutter: true,
        bracketMatching: true,
        closeBrackets: editable,
        autocompletion: editable,
        indentOnInput: editable,
        tabSize: 2,
        searchKeymap: true,
      }}
      extensions={extensions}
      onChange={onChange}
      minHeight={minHeight}
      maxHeight="100%"
      height="100%"
      style={{ height: "100%", background: "transparent" }}
    />
  );
}
