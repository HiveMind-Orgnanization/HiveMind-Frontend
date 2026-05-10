import { Sidebar } from "./sidebar";
import { TopNav } from "./topnav";
import { PageHeader } from "./page-header";
import { Particles } from "../particles";
import { Construction } from "lucide-react";
import { Link } from "react-router";

export function StubPage({
  title,
  subtitle,
  crumbs = [],
}: {
  title: string;
  subtitle?: string;
  crumbs?: { label: string; to?: string }[];
}) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at 15% 0%, rgba(34,211,238,0.10), transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(168,85,247,0.10), transparent 55%)",
            }}
          />
          <Particles count={20} />
          <div className="relative px-6 py-6">
            <PageHeader
              title={title}
              subtitle={subtitle}
              crumbs={crumbs}
              status={{ label: "Module · Coming Soon", tone: "purple" }}
            />

            <div className="grid place-items-center py-20">
              <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-10 text-center backdrop-blur-xl">
                <div
                  className="absolute inset-0 opacity-50"
                  style={{
                    backgroundImage:
                      "radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.18), transparent 60%)",
                  }}
                />
                <div className="relative">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10">
                    <Construction className="h-6 w-6 text-cyan-300" />
                  </div>
                  <h2 className="mt-5 text-2xl tracking-tight">{title}</h2>
                  <p className="mt-2 text-sm text-white/55">
                    This module is in development. Mock surfaces ready · backend wiring pending.
                  </p>
                  <div className="mt-6 flex justify-center gap-2">
                    <Link
                      to="/dashboard"
                      className="rounded-full border border-white/15 bg-white/[0.03] px-5 py-2 text-sm hover:border-cyan-300/40"
                    >
                      Back to Dashboard
                    </Link>
                    <Link
                      to="/agents"
                      className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-5 py-2 text-sm text-cyan-100 hover:bg-cyan-300/20"
                    >
                      Open Agent Workspace
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
