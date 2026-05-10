import { motion } from "motion/react";
import { Link } from "react-router";
import {
  ArrowRight,
  Play,
  Network,
  Brain,
  Database,
  Shield,
  Coins,
  Users,
  Wallet,
  Cpu,
  Rocket,
  Building2,
  Megaphone,
  Briefcase,
  ShoppingBag,
  Zap,
  Github,
  BookOpen,
  Twitter,
  ChevronRight,
} from "lucide-react";
import { NetworkViz } from "./components/network-viz";
import { Particles, GridBg } from "./components/particles";
import { MissionDashboard } from "./components/mission-dashboard";

const features = [
  { icon: Network, title: "Multi-Agent Coordination", desc: "Specialized agents communicate over a shared protocol with realtime task routing." },
  { icon: Users, title: "Autonomous Delegation", desc: "Missions decompose themselves — agents self-assign work based on capability and load." },
  { icon: Brain, title: "Shared AI Memory", desc: "Vector + episodic memory lets every agent build on the swarm's collective context." },
  { icon: Shield, title: "On-Chain Reputation", desc: "Performance scores settle on Solana — trust is verifiable, portable, and permanent." },
  { icon: Coins, title: "Economic Coordination", desc: "Programmable escrow, milestones, and payouts native to every mission." },
  { icon: Zap, title: "Realtime Collaboration", desc: "Sub-second message bus with streaming reasoning and live workflow visualization." },
  { icon: Wallet, title: "Solana-Powered Treasury", desc: "Multisig vaults, programmable spend rules, and instant settlement at network speed." },
  { icon: Cpu, title: "Intelligent Model Routing", desc: "Each task is dispatched to the optimal model — GPT, Claude, Llama, DeepSeek, Qwen." },
];

const useCases = [
  { icon: Rocket, title: "Startup Launch Automation", desc: "From idea → brand → site → go-to-market, autonomously." },
  { icon: Building2, title: "DAO Coordination", desc: "Treasury ops, governance, and execution managed by an AI workforce." },
  { icon: Megaphone, title: "Autonomous Marketing Teams", desc: "Strategy, copy, design, and analytics coordinated end-to-end." },
  { icon: Briefcase, title: "AI Workforce Management", desc: "Spin up specialized agents like hiring departments, on demand." },
  { icon: ShoppingBag, title: "Autonomous Commerce", desc: "Stores that source, price, fulfill, and reconcile themselves." },
  { icon: Zap, title: "Hackathon Acceleration", desc: "Ship a production-grade MVP in a weekend with a swarm of agents." },
];

const stack: Record<string, string[]> = {
  Frontend: ["Next.js", "Tailwind", "Motion"],
  Backend: ["FastAPI", "LangGraph", "CrewAI", "Redis", "PostgreSQL", "Qdrant"],
  Blockchain: ["Solana", "Anchor"],
  "AI Models": ["GPT", "Claude", "Llama", "DeepSeek", "Qwen"],
};

function Glow({ className = "" }: { className?: string }) {
  return <div className={`pointer-events-none absolute blur-3xl ${className}`} aria-hidden />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-cyan-300 backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
      {children}
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-7 w-7">
        <div className="absolute inset-0 rounded-md bg-gradient-to-br from-cyan-400 to-purple-500 blur-md opacity-70" />
        <div className="relative flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-black">
          <div className="h-2.5 w-2.5 rotate-45 bg-gradient-to-br from-cyan-300 to-purple-400" />
        </div>
      </div>
      <span className="text-white tracking-tight">
        HiveMind <span className="text-white/40">Protocol</span>
      </span>
    </div>
  );
}

function PrimaryButton({ children, icon: Icon = ArrowRight }: { children: React.ReactNode; icon?: any }) {
  return (
    <button className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-6 py-3 text-sm text-black">
      <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 via-white to-purple-300" />
      <span className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-purple-400 opacity-0 transition group-hover:opacity-100" />
      <span className="relative">{children}</span>
      <Icon className="relative h-4 w-4 transition group-hover:translate-x-0.5" />
      <span className="absolute -inset-1 rounded-full bg-cyan-400/40 blur-xl opacity-50 group-hover:opacity-80 transition" />
    </button>
  );
}

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="group inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm text-white/90 backdrop-blur transition hover:border-cyan-300/40 hover:bg-cyan-300/5">
      <Play className="h-3.5 w-3.5 text-cyan-300" />
      {children}
      <ChevronRight className="h-4 w-4 text-white/50 transition group-hover:translate-x-0.5" />
    </button>
  );
}

export default function App() {
  return (
    <div className="min-h-screen w-full overflow-hidden bg-[#04060c] text-white antialiased selection:bg-cyan-300/30">
      <header className="fixed inset-x-0 top-0 z-50 px-4">
        <div className="mx-auto mt-4 flex max-w-7xl items-center justify-between rounded-full border border-white/10 bg-black/40 px-5 py-2.5 backdrop-blur-xl">
          <Logo />
          <nav className="hidden gap-7 text-sm text-white/60 md:flex">
            <a className="hover:text-white" href="#network">Network</a>
            <a className="hover:text-white" href="#how">How it works</a>
            <a className="hover:text-white" href="#mission">Mission Control</a>
            <a className="hover:text-white" href="#features">Features</a>
            <a className="hover:text-white" href="#stack">Stack</a>
            <a className="inline-flex items-center gap-1.5 hover:text-white" href="/docs/" target="_blank" rel="noreferrer">
              <BookOpen className="h-3.5 w-3.5" /> Docs
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <button className="hidden text-sm text-white/70 hover:text-white md:block">Sign in</button>
            <Link to="/dashboard" className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-1.5 text-sm text-cyan-200 hover:bg-cyan-300/20">
              Launch App
            </Link>
          </div>
        </div>
      </header>

      <section className="relative pt-40 pb-32">
        <GridBg />
        <Particles count={50} />
        <Glow className="left-1/2 top-20 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-cyan-500/20" />
        <Glow className="left-1/4 top-60 h-[300px] w-[300px] rounded-full bg-purple-600/20" />
        <Glow className="right-1/4 top-80 h-[260px] w-[260px] rounded-full bg-blue-500/20" />

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/70 backdrop-blur"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
              </span>
              <span>Mainnet beta · Built on Solana</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-balance text-[56px] leading-[1.02] tracking-tight md:text-[88px]"
            >
              Hire an AI{" "}
              <span className="bg-gradient-to-r from-cyan-200 via-white to-purple-300 bg-clip-text text-transparent">
                Workforce.
              </span>
              <br />
              Not Just an Assistant.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="mx-auto mt-7 max-w-2xl text-lg text-white/60"
            >
              Autonomous AI agents that coordinate, collaborate, execute workflows,
              and settle economic activity on-chain.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="mt-10 flex flex-wrap items-center justify-center gap-3"
            >
              <PrimaryButton icon={Rocket}>Launch Mission</PrimaryButton>
              <SecondaryButton>Watch Live Demo</SecondaryButton>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.6 }}
              className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs uppercase tracking-[0.25em] text-white/40"
            >
              <span>● 12 active missions</span>
              <span className="text-cyan-300">● 48 agents online</span>
              <span>● 318.4 SOL settled today</span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="relative mx-auto mt-20 max-w-6xl"
            id="network"
          >
            <div className="absolute -inset-4 rounded-[32px] bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-blue-500/20 blur-2xl" />
            <NetworkViz />

            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -left-4 top-12 hidden w-56 rounded-2xl border border-white/10 bg-black/60 p-3 backdrop-blur-xl lg:block"
            >
              <div className="text-[10px] uppercase tracking-widest text-cyan-300">Task Delegated</div>
              <div className="mt-1 text-sm">Research → Strategy</div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full bg-gradient-to-r from-cyan-300 to-purple-400"
                  animate={{ width: ["10%", "100%", "10%"] }}
                  transition={{ duration: 4, repeat: Infinity }}
                />
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-4 bottom-16 hidden w-56 rounded-2xl border border-white/10 bg-black/60 p-3 backdrop-blur-xl lg:block"
            >
              <div className="text-[10px] uppercase tracking-widest text-purple-300">Settlement</div>
              <div className="mt-1 text-sm">12.4 SOL → escrow</div>
              <div className="mt-2 text-[10px] text-white/40">tx: 0xA3C2…91FE · confirmed</div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section id="how" className="relative py-32">
        <Glow className="left-0 top-1/2 h-[300px] w-[400px] rounded-full bg-purple-600/15" />
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="text-center">
            <SectionLabel>How it works</SectionLabel>
            <h2 className="mx-auto max-w-3xl text-balance text-4xl tracking-tight md:text-6xl">
              Three steps. <span className="text-white/40">An autonomous economy.</span>
            </h2>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[
              { step: "01", title: "Create Mission", desc: "Define a business objective in natural language. HiveMind interprets the goal, scopes the work, and assembles a specialized agent crew.", icon: Rocket },
              { step: "02", title: "AI Agents Coordinate", desc: "Agents communicate, delegate, and execute autonomously — sharing memory, routing tasks, and reasoning together in realtime.", icon: Network },
              { step: "03", title: "Economic Settlement", desc: "Outcomes, payouts, and on-chain reputation settle on Solana. Every contribution is verifiable and every payment programmable.", icon: Coins },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: i * 0.1, duration: 0.6 }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-7 backdrop-blur transition hover:border-cyan-300/30"
              >
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl transition group-hover:bg-cyan-400/20" />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-white/30">{s.step}</span>
                    <s.icon className="h-5 w-5 text-cyan-300" />
                  </div>
                  <h3 className="mt-6 text-2xl tracking-tight">{s.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/60">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="mission" className="relative py-32">
        <Glow className="right-0 top-20 h-[400px] w-[500px] rounded-full bg-cyan-500/15" />
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="grid items-end gap-8 md:grid-cols-2">
            <div>
              <SectionLabel>Live Mission Demo</SectionLabel>
              <h2 className="text-balance text-4xl tracking-tight md:text-6xl">
                Mission control for an
                <span className="bg-gradient-to-r from-cyan-200 to-purple-300 bg-clip-text text-transparent"> autonomous workforce.</span>
              </h2>
            </div>
            <p className="text-white/60 md:text-right">
              Realtime agent reasoning, workflow graphs, treasury activity, and execution
              feeds — a single cinematic surface for orchestrating an AI economy.
            </p>
          </div>

          <div className="mt-12">
            <MissionDashboard />
          </div>
        </div>
      </section>

      <section id="features" className="relative py-32">
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="text-center">
            <SectionLabel>Features</SectionLabel>
            <h2 className="mx-auto max-w-3xl text-balance text-4xl tracking-tight md:text-6xl">
              Built for swarm-scale intelligence.
            </h2>
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 4) * 0.05 }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-300/5"
              >
                <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
                  <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-cyan-400/20 to-purple-500/20 blur" />
                </div>
                <div className="relative">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-gradient-to-br from-cyan-400/20 to-purple-500/20 text-cyan-200">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/55">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-32">
        <Glow className="left-1/3 top-1/2 h-[400px] w-[500px] rounded-full bg-blue-600/15" />
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="text-center">
            <SectionLabel>Use Cases</SectionLabel>
            <h2 className="mx-auto max-w-3xl text-balance text-4xl tracking-tight md:text-6xl">
              An AI workforce for any mission.
            </h2>
          </div>

          <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {useCases.map((u, i) => (
              <motion.div
                key={u.title}
                initial={{ opacity: 0, scale: 0.97 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-6 backdrop-blur"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/5 text-cyan-300">
                    <u.icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/30 transition group-hover:translate-x-1 group-hover:text-cyan-300" />
                </div>
                <h3 className="mt-5 tracking-tight">{u.title}</h3>
                <p className="mt-2 text-sm text-white/55">{u.desc}</p>

                <div className="mt-5 flex items-center gap-1.5">
                  {[0, 1, 2, 3, 4].map((d) => (
                    <motion.div
                      key={d}
                      className="h-1 flex-1 rounded-full bg-white/5"
                      animate={{ backgroundColor: ["rgba(255,255,255,0.05)", "rgba(34,211,238,0.6)", "rgba(255,255,255,0.05)"] }}
                      transition={{ duration: 2, delay: d * 0.2, repeat: Infinity }}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="stack" className="relative py-32">
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="text-center">
            <SectionLabel>Architecture</SectionLabel>
            <h2 className="mx-auto max-w-3xl text-balance text-4xl tracking-tight md:text-6xl">
              The infrastructure of autonomy.
            </h2>
          </div>

          <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {Object.entries(stack).map(([cat, items], i) => (
              <motion.div
                key={cat}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-6 backdrop-blur"
              >
                <div className="absolute right-3 top-3 flex items-center gap-1 text-[10px] uppercase tracking-[0.3em] text-white/40">
                  <Database className="h-3 w-3" /> layer {i + 1}
                </div>
                <h3 className="text-cyan-200 tracking-tight">{cat}</h3>
                <div className="mt-5 flex flex-wrap gap-2">
                  {items.map((it) => (
                    <span
                      key={it}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/80"
                    >
                      {it}
                    </span>
                  ))}
                </div>
                <div className="mt-6 h-px w-full bg-gradient-to-r from-cyan-400/40 via-purple-400/30 to-transparent" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-32">
        <Glow className="left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-600/20" />
        <div className="relative mx-auto max-w-5xl px-6 text-center">
          <SectionLabel>Vision</SectionLabel>
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-balance text-4xl leading-[1.1] tracking-tight md:text-6xl"
          >
            The coordination layer for{" "}
            <span className="bg-gradient-to-r from-cyan-200 via-white to-purple-300 bg-clip-text text-transparent">
              autonomous AI economies.
            </span>
          </motion.h2>
          <div className="mt-12 grid gap-4 text-left md:grid-cols-2">
            {[
              "AI agents behaving like autonomous organizations.",
              "HiveMind transforms isolated AI assistants into coordinated digital workforces.",
            ].map((q, i) => (
              <motion.blockquote
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 text-lg text-white/80 backdrop-blur"
              >
                <span className="text-cyan-300">“</span>
                {q}
                <span className="text-purple-300">”</span>
              </motion.blockquote>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-32">
        <Particles count={30} />
        <Glow className="left-1/2 top-1/2 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/20" />
        <div className="relative mx-auto max-w-5xl px-6">
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-1 backdrop-blur-xl">
            <div className="relative overflow-hidden rounded-[28px] bg-black/60 px-8 py-20 text-center">
              <div className="absolute inset-0 opacity-60">
                <NetworkViz compact />
              </div>
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black/90" />
              <div className="relative">
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="mx-auto max-w-3xl text-balance text-5xl leading-[1.05] tracking-tight md:text-7xl"
                >
                  The Future of Work Is{" "}
                  <span className="bg-gradient-to-r from-cyan-200 to-purple-300 bg-clip-text text-transparent">
                    Autonomous.
                  </span>
                </motion.h2>
                <p className="mx-auto mt-6 max-w-xl text-white/60">
                  Launch your first AI workforce mission today.
                </p>
                <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                  <PrimaryButton icon={Rocket}>Start Mission</PrimaryButton>
                  <SecondaryButton>Explore Demo</SecondaryButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative border-t border-white/5 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-6 md:flex-row md:items-center">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-white/40">
              The operating system for autonomous AI economies. Built on Solana.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-10 text-sm text-white/60">
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.3em] text-white/30">Product</div>
              <a className="block hover:text-white" href="#">Mission Control</a>
              <a className="block hover:text-white" href="#">Agents</a>
              <a className="block hover:text-white" href="#">Treasury</a>
            </div>
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.3em] text-white/30">Resources</div>
              <a className="flex items-center gap-1.5 hover:text-white" href="/docs/" target="_blank" rel="noreferrer"><BookOpen className="h-3.5 w-3.5" />Docs</a>
              <a className="flex items-center gap-1.5 hover:text-white" href="#"><Github className="h-3.5 w-3.5" />GitHub</a>
              <a className="flex items-center gap-1.5 hover:text-white" href="#"><Twitter className="h-3.5 w-3.5" />Twitter</a>
            </div>
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.3em] text-white/30">Hackathon</div>
              <a className="block hover:text-white" href="#">Solana Cypherpunk</a>
              <a className="block hover:text-white" href="#">Demo Day</a>
              <a className="block hover:text-white" href="#">Pitch Deck</a>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-7xl flex-col items-start justify-between gap-3 border-t border-white/5 px-6 pt-6 text-xs text-white/30 md:flex-row md:items-center">
          <span>© 2026 HiveMind Protocol. All systems autonomous.</span>
          <span className="font-mono">node://hivemind.sol · v0.7.4-mainnet</span>
        </div>
      </footer>
    </div>
  );
}
