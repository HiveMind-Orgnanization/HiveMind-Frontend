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

        // 2. Check SOL balance — register_user requires ~0.002 SOL rent (payer = user)
        const balance = await connection.getBalance(publicKey);
        if (balance < MIN_SOL_FOR_REGISTER) {
          toast.info("Funding your devnet wallet before registering…", { duration: 4000 });
          try {
            const airdropSig = await connection.requestAirdrop(publicKey, AIRDROP_AMOUNT);
            // Wait up to 30 s for the airdrop
            const latestBlockhash = await connection.getLatestBlockhash();
            await connection.confirmTransaction(
              { signature: airdropSig, ...latestBlockhash },
              "confirmed",
            );
          } catch (airdropErr) {
            // Devnet airdrop is rate-limited — warn but attempt registration anyway
            console.warn("[auto-register-trial] airdrop failed:", airdropErr);
            toast.warning(
              "Devnet airdrop rate-limited. If registration fails, get SOL from faucet.solana.com.",
              { duration: 6000 },
            );
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
      } catch (err: unknown) {
        toast.dismiss("trial-register");
        const msg = err instanceof Error ? err.message : String(err);
        // User rejected the wallet popup — don't show an error
        if (msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("cancelled")) return;
        toast.error(`Wallet registration failed: ${msg.slice(0, 120)}`, { duration: 8000 });
        if (import.meta.env.DEV) console.warn("[auto-register-trial]", err);
      }
    })();
  }, [connected, publicKey, sendTransaction, connection]);
}
