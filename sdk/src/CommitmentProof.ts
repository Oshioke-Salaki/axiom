import { keccak256, encodePacked, toHex, randomBytes } from "viem";
import type { Hex } from "viem";
import type { CommitmentProof, ReasoningReveal } from "./types.js";

/**
 * CommitmentProof — Hash-Commit-Reveal for tamper-proof agent reasoning.
 *
 * The core mechanic of AXIOM accountability:
 *   1. BEFORE acting → agent commits keccak256(reasoning + salt) on-chain
 *   2. AFTER acting  → agent reveals reasoning + salt
 *   3. Anyone can verify: the reasoning was NOT changed after the fact
 *
 * This is what makes AXIOM agents auditable. The reasoning hash is stored
 * on-chain AND the full reasoning document is stored on Filecoin — permanent,
 * tamper-proof, forever verifiable.
 */
export class CommitmentProofSystem {
  /**
   * Generate a cryptographic commitment from a reasoning string.
   * Call this BEFORE the agent takes any action.
   */
  static commit(reasoning: string, covenantId: string): CommitmentProof {
    const salt = toHex(randomBytes(32)) as Hex;
    const commitment = keccak256(
      encodePacked(["string", "bytes32"], [reasoning, salt as `0x${string}`])
    ) as Hex;

    return {
      commitment,
      salt,
      timestamp: Date.now(),
      covenantId,
    };
  }

  /**
   * Verify that a revealed reasoning matches a commitment.
   * Call this to audit an agent's behavior.
   */
  static verify(reasoning: string, salt: Hex, commitment: Hex): boolean {
    const computed = keccak256(
      encodePacked(["string", "bytes32"], [reasoning, salt as `0x${string}`])
    );
    return computed.toLowerCase() === commitment.toLowerCase();
  }

  /**
   * Produce a reveal payload for on-chain fulfillment.
   */
  static reveal(reasoning: string, proof: CommitmentProof): ReasoningReveal {
    const verified = CommitmentProofSystem.verify(
      reasoning,
      proof.salt,
      proof.commitment
    );

    return {
      reasoning,
      salt: proof.salt,
      commitment: proof.commitment,
      verified,
    };
  }

  /**
   * Format reasoning for Filecoin storage — includes structured metadata.
   */
  static formatReasoningDocument(
    agentName: string,
    covenantId: string,
    reasoning: string,
    proof: CommitmentProof,
    action: string,
    outcome?: string
  ): string {
    return JSON.stringify(
      {
        axiomVersion: "1.0.0",
        agentName,
        covenantId,
        commitment: proof.commitment,
        salt: proof.salt,
        committedAt: new Date(proof.timestamp).toISOString(),
        reasoning,
        action,
        outcome: outcome ?? "pending",
        verified: CommitmentProofSystem.verify(reasoning, proof.salt, proof.commitment),
      },
      null,
      2
    );
  }
}
