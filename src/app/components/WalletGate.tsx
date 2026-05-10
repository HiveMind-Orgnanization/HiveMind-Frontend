import { Wallet } from "lucide-react";
import { motion } from "motion/react";

export function WalletGate({ children, connected }: {
  children: React.ReactNode;
  connected: boolean;
}) {
  if (connected) return <>{children}</>;
  return (
    <div className="grid flex-1 place-items-center px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6 text-center"
      >
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/10 to-purple-300/10">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-300/5 to-purple-300/5 blur-xl" />
          <Wallet className="relative h-9 w-9 text-cyan-300" />
        </div>
        <div>
          <div className="text-xl tracking-tight text-white">Connect your wallet</div>
          <div className="mt-2 max-w-xs text-sm text-white/50">
            Your missions, agents, and on-chain data are tied to your Solana wallet. Connect to access your workspace.
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-2 text-xs text-cyan-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
          </span>
          Use the Connect Wallet button in the top-right corner
        </div>
      </motion.div>
    </div>
  );
}
