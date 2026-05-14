import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("EV447FY9Q7Ty7pFo8wDPFRhkqASmj87GZjFr8CPjQ5om");

const CREATE_MISSION_DISC  = Buffer.from([15, 28, 105, 135, 65, 62, 188, 255]);
const FUND_MISSION_DISC    = Buffer.from([31, 13, 246, 29, 47, 205, 235, 39]);
const USE_FREE_TRIAL_DISC  = Buffer.from([54, 124, 88, 31, 163, 164, 114, 200]);

/** Derive mission PDA: seeds = ["mission", mission_id as LE u64] */
function getMissionPda(missionId: bigint): PublicKey {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(missionId);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mission"), idBuf],
    PROGRAM_ID,
  );
  return pda;
}

/**
 * Map a wallet-side error string into a user-friendly message.
 *
 * The big trap: Backpack (+ Phantom etc.) default to Mainnet. HiveMind runs
 * on Solana devnet — when the dApp sends a tx with the EV447F… program id
 * and the wallet is on mainnet, the wallet's own simulation reports
 * "Transaction simulation failed" because the program + PDAs don't exist on
 * mainnet. Users see a cryptic error inside the wallet popup with no hint
 * about the network mismatch.
 *
 * We detect that pattern here and surface a one-liner that tells the user
 * to switch their wallet to Devnet.
 */
function humanizeWalletError(raw: string): string {
  const lower = raw.toLowerCase();
  // Wallet simulation failed → almost always the network mismatch.
  if (
    lower.includes("simulation failed") ||
    lower.includes("simulate failed") ||
    lower.includes("accountnotfound") ||
    lower.includes("account not found") ||
    lower.includes("programaccountnotfound")
  ) {
    return "Wallet simulation failed — switch your wallet to Devnet. HiveMind runs on Solana devnet; if your wallet (Backpack / Phantom) is on Mainnet, every signature will fail. Open the wallet settings → Network → Devnet, then retry.";
  }
  if (lower.includes("insufficient") || lower.includes("0x1")) {
    return "Insufficient devnet SOL for the transaction fee. The auto-funder will top you up after a brief delay, or send any small amount of devnet SOL to your wallet manually.";
  }
  if (lower.includes("blockhash") || lower.includes("expired")) {
    return "Network blockhash expired — retry the transaction.";
  }
  return raw;
}

export type MissionPaymentResult =
  | { ok: true; signature: string; missionOnChainId: bigint }
  | { ok: false; error: string };

export function useMissionPayment() {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  /**
   * Creates the mission PDA on-chain and funds it with `solAmount` SOL in a
   * single atomic transaction. Returns the tx signature on success.
   */
  const pay = async (solAmount: number): Promise<MissionPaymentResult> => {
    if (!connected || !publicKey || !sendTransaction) {
      return { ok: false, error: "Wallet not connected. Please connect your wallet first." };
    }

    const lamports = BigInt(Math.round(solAmount * LAMPORTS_PER_SOL));
    if (lamports <= 0n) {
      return { ok: false, error: "Invalid payment amount." };
    }

    // Use current timestamp as unique u64 mission ID for the on-chain PDA
    const missionOnChainId = BigInt(Date.now());
    const missionPda = getMissionPda(missionOnChainId);

    // Borsh-encode u64 args (LE 8 bytes)
    const encodeU64 = (n: bigint) => {
      const b = Buffer.alloc(8);
      b.writeBigUInt64LE(n);
      return b;
    };

    // Instruction 1: create_mission(mission_id)
    const createData = Buffer.concat([CREATE_MISSION_DISC, encodeU64(missionOnChainId)]);
    const createIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: publicKey,            isSigner: true,  isWritable: true  },
        { pubkey: missionPda,           isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: createData,
    });

    // Instruction 2: fund_mission(lamports)
    const fundData = Buffer.concat([FUND_MISSION_DISC, encodeU64(lamports)]);
    const fundIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: publicKey,            isSigner: true,  isWritable: true  },
        { pubkey: missionPda,           isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: fundData,
    });

    try {
      const tx = new Transaction().add(createIx, fundIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Pre-simulate on OUR devnet connection so we can surface real errors
      // (insufficient funds, program reverts, exhausted credits) with the
      // actual program log lines — instead of the wallet's generic
      // "simulation failed" that fires when the user's wallet is on mainnet.
      const preSim = await connection.simulateTransaction(tx).catch(() => null);
      if (preSim?.value.err) {
        const logs = (preSim.value.logs ?? []).slice(-4).join(" · ").slice(0, 280);
        return { ok: false, error: `Devnet simulation failed: ${JSON.stringify(preSim.value.err)}${logs ? ` · ${logs}` : ""}` };
      }

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      return { ok: true, signature, missionOnChainId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        return { ok: false, error: "Transaction cancelled by user." };
      }
      return { ok: false, error: humanizeWalletError(msg) };
    }
  };

  /**
   * Burns one free credit on-chain via use_free_trial instruction.
   * Returns the tx signature on success.
   */
  const useCredit = async (): Promise<{ ok: true; signature: string } | { ok: false; error: string }> => {
    if (!connected || !publicKey || !sendTransaction) {
      return { ok: false, error: "Wallet not connected." };
    }

    const [userTrialPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_trial"), publicKey.toBuffer()],
      PROGRAM_ID,
    );

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: publicKey,   isSigner: true,  isWritable: false },
        { pubkey: userTrialPda, isSigner: false, isWritable: true  },
      ],
      data: USE_FREE_TRIAL_DISC,
    });

    try {
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Pre-simulate on our devnet connection. If THIS fails the program
      // logs tell us exactly why (trial exhausted, account missing, etc.).
      // If it succeeds but the wallet still rejects with simulation failure,
      // humanizeWalletError() flags the network mismatch to the user.
      const preSim = await connection.simulateTransaction(tx).catch(() => null);
      if (preSim?.value.err) {
        const logs = (preSim.value.logs ?? []).slice(-4).join(" · ").slice(0, 280);
        const errStr = JSON.stringify(preSim.value.err);
        // Anchor's TrialExhausted error code is 6003 → InstructionError [_, {Custom: 6003}]
        if (errStr.includes("6003")) {
          return { ok: false, error: "Free trial exhausted — no uses remaining. Pay with devnet SOL or claim a daily credit." };
        }
        if (errStr.includes("6005") || errStr.toLowerCase().includes("accountnotfound")) {
          return { ok: false, error: "Wallet not registered for the free trial yet. Reconnect the wallet so HiveMind can auto-register, then retry." };
        }
        return { ok: false, error: `Devnet simulation failed: ${errStr}${logs ? ` · ${logs}` : ""}` };
      }

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      return { ok: true, signature };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        return { ok: false, error: "Transaction cancelled by user." };
      }
      return { ok: false, error: humanizeWalletError(msg) };
    }
  };

  return { pay, useCredit, connected: Boolean(connected && publicKey) };
}
