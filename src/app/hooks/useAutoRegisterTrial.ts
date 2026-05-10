import { useEffect, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  TransactionInstruction,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import { fetchTrialStatus, confirmTrialRegister } from "../../lib/api";

const PROGRAM_ID = new PublicKey("EV447FY9Q7Ty7pFo8wDPFRhkqASmj87GZjFr8CPjQ5om");

// Discriminator from IDL: [2, 241, 150, 223, 99, 214, 116, 97]
const REGISTER_USER_DISCRIMINATOR = Buffer.from([2, 241, 150, 223, 99, 214, 116, 97]);

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

    // Store wallet for other components that read from localStorage
    localStorage.setItem("hm-connected-wallet", walletStr);

    (async () => {
      try {
        // Check if already registered
        const status = await fetchTrialStatus(walletStr);
        if (status?.registered) return;

        // Build register_user instruction
        const userTrialPda = getUserTrialPda(publicKey);
        const freeTrialConfigPda = getFreeTrialConfigPda();

        const ix = new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: publicKey,         isSigner: true,  isWritable: true },
            { pubkey: userTrialPda,      isSigner: false, isWritable: true },
            { pubkey: freeTrialConfigPda,isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: REGISTER_USER_DISCRIMINATOR,
        });

        const tx = new Transaction().add(ix);
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        const sig = await sendTransaction(tx, connection);
        await connection.confirmTransaction(sig, "confirmed");

        // Notify backend to re-read on-chain state
        await confirmTrialRegister(walletStr);
      } catch (err) {
        // Registration is best-effort — don't surface errors to the user
        if (import.meta.env.DEV) {
          console.warn("[auto-register-trial]", err);
        }
      }
    })();
  }, [connected, publicKey, sendTransaction, connection]);
}
