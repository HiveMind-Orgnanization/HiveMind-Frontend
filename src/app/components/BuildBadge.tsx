/**
 * Tiny build-info badge pinned to the bottom-right corner.
 *
 * Shows the git commit SHA + branch the bundle was built from. Without this,
 * "is the user on the latest deploy?" turns into a guessing game involving
 * cache busting, Vercel preview lookups, and screenshots. With it, anyone can
 * read off the SHA in 2 seconds and compare it to `git log origin/dev`.
 *
 * Click to copy the full info to clipboard so support / debugging is one
 * gesture away.
 */
import { useState } from "react";

export function BuildBadge() {
  const sha = typeof __HM_BUILD_SHA__ === "string" ? __HM_BUILD_SHA__ : "unknown";
  const branch = typeof __HM_BUILD_BRANCH__ === "string" ? __HM_BUILD_BRANCH__ : "unknown";
  const time = typeof __HM_BUILD_TIME__ === "string" ? __HM_BUILD_TIME__ : "";
  const [copied, setCopied] = useState(false);

  const onClick = () => {
    const text = `build ${sha} (${branch}) ${time}`;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Built from commit ${sha} on branch ${branch}\n${time}\nClick to copy`}
      className="fixed bottom-2 right-2 z-[60] flex items-center gap-1.5 rounded-md border border-white/10 bg-black/60 px-2 py-1 font-mono text-[10px] text-white/45 backdrop-blur hover:border-cyan-300/30 hover:text-cyan-200/90"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${branch === "dev" ? "bg-amber-300" : "bg-emerald-300"}`} />
      <span>{sha}</span>
      <span className="text-white/30">·</span>
      <span>{branch}</span>
      {copied && <span className="ml-1 text-cyan-300">copied</span>}
    </button>
  );
}
