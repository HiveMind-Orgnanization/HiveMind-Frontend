"use client";

import { useCallback, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [code]);

  const label = language ?? "code";

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-white/15 bg-black/75">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-white/45">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[10px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-white/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const markdownShell =
  "agent-md text-sm leading-relaxed text-white/85 [&_a]:text-cyan-300 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_blockquote]:text-white/65 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:text-[15px] [&_h3]:font-semibold [&_hr]:my-4 [&_hr]:border-white/15 [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-white [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-white/10 [&_th]:bg-white/[0.06] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6";

export function AgentMessageMarkdown({ source }: { source: string }) {
  return (
    <div className={markdownShell}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className ?? "");
            const content = String(children ?? "").replace(/\n$/, "");
            const isBlock = Boolean(match) || content.includes("\n");
            if (isBlock) {
              return <CodeBlock code={content} language={match?.[1]} />;
            }
            return (
              <code className="rounded bg-white/[0.12] px-1 py-0.5 font-mono text-[0.92em] text-cyan-100">
                {children}
              </code>
            );
          },
        }}
      >
        {source}
      </Markdown>
    </div>
  );
}
