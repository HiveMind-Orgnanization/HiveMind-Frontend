import { useEffect, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  TransactionInstruction,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { fetchTrialStatus, confirmTrialRegister } from "../../lib/api";
import { toast } from "sonner";

const PROGRAM_ID = new PublicKey("EV447FY9Q7Ty7pFo8wDPFRhkqASmj87GZjFr8CPjQ5om");

// Discriminator from IDL: [2, 241, 150, 223, 99, 214, 116, 97]
const REGISTER_USER_DISCRIMINATOR = Buffer.from([2, 241, 150, 223, 99, 214, 116, 97]);

// Rent + tx fee for register_user: 0.003 SOL is a safe floor.
const MIN_SOL_FOR_REGISTER = 0.003 * LAMPORTS_PER_SOL;
// How much to airdrop if below threshold (devnet only)
const AIRDROP_AMOUNT = 0.01 * LAMPORTS_PER_SOL;

function getUserTrialPda(userPubkey: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_trial"), userPubkey.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

function getFreeTrialConfigPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("free_trial_config")],
    PROGRAM_ID,
  );
  return pda;
}

export function useAutoRegisterTrial() {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!connected || !publicKey || !sendTransaction) return;

    const walletStr = publicKey.toBase58();
    if (attempted.current.has(walletStr)) return;
    attempted.current.add(walletStr);

    localStorage.setItem("hm-connected-wallet", walletStr);

    (async () => {
      try {
        // 1. Check if already registered on-chain
        const status = await fetchTrialStatus(walletStr);
        if (status?.registered) return;

        // 2. Check SOL balance — register_user requires ~0.002 SOL rent (payer = user).
        // Devnet's public faucet is rate-limited and almost never works, so we ask the
        // backend funder wallet to sponsor brand-new wallets via /api/trial/fund-wallet.
        // Falls back to the public airdrop only if the backend funder isn't configured.
        const balance = await connection.getBalance(publicKey);
        if (balance < MIN_SOL_FOR_REGISTER) {
          toast.info("Sponsoring your devnet wallet…", { id: "trial-fund", duration: 6000 });
          let funded = false;
          try {
            const r = await fetch(`/api/trial/fund-wallet`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ wallet: walletStr }),
            });
            const j = (await r.json().catch(() => ({}))) as { ok?: boolean; signature?: string; error?: string; message?: string };
            if (r.ok && j.ok) {
              funded = true;
              // Wait briefly for the deposit to land in the wallet's balance.
              for (let i = 0; i < 5; i++) {
                const b = await connection.getBalance(publicKey, "confirmed");
                if (b >= MIN_SOL_FOR_REGISTER) break;
                await new Promise((r) => setTimeout(r, 1200));
              }
              toast.dismiss("trial-fund");
            } else if (j.error === "funder_not_configured") {
              console.warn("[auto-register-trial] funder not configured on backend; falling back to public faucet");
            } else {
              console.warn("[auto-register-trial] fund-wallet failed:", j.message || j.error);
            }
          } catch (e) {
            console.warn("[auto-register-trial] fund-wallet network error:", e);
          }
          // Fallback: only try the public devnet faucet if the backend couldn't fund.
          if (!funded) {
            try {
              const airdropSig = await connection.requestAirdrop(publicKey, AIRDROP_AMOUNT);
              const latestBlockhash = await connection.getLatestBlockhash();
              await connection.confirmTransaction({ signature: airdropSig, ...latestBlockhash }, "confirmed");
              toast.dismiss("trial-fund");
            } catch (airdropErr) {
              console.warn("[auto-register-trial] airdrop failed:", airdropErr);
              toast.dismiss("trial-fund");
              toast.warning(
                "Couldn't auto-fund the wallet. Send 0.01 SOL on devnet and reconnect.",
                { duration: 7000 },
              );
            }
          }
        }

        // 3. Build and send register_user transaction
        toast.info("Registering your wallet on-chain…", { id: "trial-register", duration: 15000 });

        const userTrialPda = getUserTrialPda(publicKey);
        const freeTrialConfigPda = getFreeTrialConfigPda();

        const ix = new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: publicKey,              isSigner: true,  isWritable: true  },
            { pubkey: userTrialPda,           isSigner: false, isWritable: true  },
            { pubkey: freeTrialConfigPda,     isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId,isSigner: false, isWritable: false },
          ],
          data: REGISTER_USER_DISCRIMINATOR,
        });

        const tx = new Transaction().add(ix);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        const sig = await sendTransaction(tx, connection);
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed",
        );

        // 4. Notify backend
        const confirmed = await confirmTrialRegister(walletStr);
        if (confirmed?.ok) {
          toast.success("Free trial activated — 10 missions ready!", {
            id: "trial-register",
            duration: 5000,
          });
        } else {
          toast.dismiss("trial-register");
        }
        // Tell every other component that displays trial status (TrialBanner / sidebar Free
        // Credits pill / TrialPage) to re-fetch from the API. Without this, the Mission
        // Telemetry card stays stuck on "Wallet not registered" even after we just registered.
        window.dispatchEvent(new CustomEvent("hm-trial-status-changed", { detail: { wallet: walletStr } }));
      } catch (err: unknown) {
        toast.dismiss("trial-register");
        const msg = err instanceof Error ? err.message : String(err);
        const lower = msg.toLowerCase();
        // User rejected the wallet popup or simulation failed (almost always 0 SOL on devnet) —
        // don't surface an alarming red error; the sidebar already shows "Activating…" and the
        // user can retry from the trial page. Log to console for debugging.
        if (
          lower.includes("user rejected")
          || lower.includes("cancelled")
          || lower.includes("simulation failed")
          || lower.includes("insufficient")
        ) {
          if (import.meta.env.DEV) console.warn("[auto-register-trial]", err);
          return;
        }
        toast.message("Couldn't activate your free trial yet — retry from the Trial page if it doesn't settle in a minute.", {
          duration: 7000,
        });
        if (import.meta.env.DEV) console.warn("[auto-register-trial]", err);
      }
    })();
  }, [connected, publicKey, sendTransaction, connection]);
}
