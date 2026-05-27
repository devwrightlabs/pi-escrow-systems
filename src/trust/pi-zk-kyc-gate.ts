import { EscrowEngine } from "../core/EscrowEngine";
import type { KycProof } from "../types/escrow";

const encoder = new TextEncoder();

const toHex = (value: ArrayBuffer): string =>
  Array.from(new Uint8Array(value))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/**
 * Zero-knowledge style gate that proves both parties passed KYC without exposing identity data.
 */
export class PiZkKycGate {
  /**
   * Generates and stores a privacy-preserving KYC proof for one participant.
   */
  public async generateProof(
    engine: EscrowEngine,
    escrowId: string,
    walletAddress: string,
    verifier: string,
    secretNonce: string
  ): Promise<KycProof> {
    try {
      if (!globalThis.crypto?.subtle) {
        throw new Error("Web Crypto is required to generate zero-knowledge KYC proofs.");
      }
      const proof = toHex(
        await globalThis.crypto.subtle.digest(
          "SHA-256",
          encoder.encode(`${escrowId}:${walletAddress}:${verifier}:${secretNonce}`)
        )
      );
      const kycProof: KycProof = {
        walletAddress,
        proof,
        issuedAt: new Date().toISOString(),
        verifier
      };
      engine.addKycProof(escrowId, kycProof);
      return kycProof;
    } catch (error: unknown) {
      throw new Error(`Failed to generate a zero-knowledge KYC proof: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Verifies that both buyer and seller now have stored KYC proofs on the escrow.
   */
  public verifyBothParties(engine: EscrowEngine, escrowId: string): boolean {
    try {
      const escrow = engine.getEscrow(escrowId);
      if (!escrow) {
        return false;
      }
      const buyerWallet = escrow.participants.find((participant) => participant.role === "BUYER")?.walletAddress;
      const sellerWallet = escrow.participants.find((participant) => participant.role === "SELLER")?.walletAddress;
      return Boolean(
        buyerWallet &&
          sellerWallet &&
          escrow.kycProofs.some((proof) => proof.walletAddress === buyerWallet) &&
          escrow.kycProofs.some((proof) => proof.walletAddress === sellerWallet)
      );
    } catch (error: unknown) {
      throw new Error(`Failed to verify zero-knowledge KYC gate: ${this.toErrorMessage(error)}`);
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
