import { Link, useNavigate } from "react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";

type Crumb = { label: string; to?: string };

export function PageHeader({
  title,
  subtitle,
  crumbs = [],
  backTo = "/dashboard",
  status,
  actions,
}: {
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  backTo?: string;
  status?: { label: string; tone?: "cyan" | "emerald" | "purple" };
  actions?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const tone = status?.tone ?? "cyan";
  const toneCls =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "purple"
      ? "text-purple-300"
      : "text-cyan-300";

  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-white/40">
          <button
            onClick={() => navigate(backTo)}
            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-white/70 transition hover:border-cyan-300/40 hover:text-cyan-200"
            aria-label="Back"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>Back</span>
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-2">
              <ChevronRight className="h-3 w-3 text-white/25" />
              {c.to ? (
                <Link to={c.to} className="hover:text-white/80">
                  {c.label}
                </Link>
              ) : (
                <span className="text-white/60">{c.label}</span>
              )}
            </span>
          ))}
          {status && (
            <span className={`ml-2 flex items-center gap-1.5 ${toneCls}`}>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
              </span>
              {status.label}
            </span>
          )}
        </div>
        <h1 className="mt-3 text-3xl tracking-tight md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-white/55">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
