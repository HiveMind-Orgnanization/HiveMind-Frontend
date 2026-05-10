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

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      return { ok: true, signature, missionOnChainId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // User rejected the transaction in wallet
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        return { ok: false, error: "Transaction cancelled by user." };
      }
      return { ok: false, error: msg };
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
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      return { ok: true, signature };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        return { ok: false, error: "Transaction cancelled by user." };
      }
      return { ok: false, error: msg };
    }
  };

  return { pay, useCredit, connected: Boolean(connected && publicKey) };
}
