import { EscrowEngine } from "../core/EscrowEngine";
import type { ArbitrationPackage } from "../types/escrow";

/**
 * Bundles immutable dispute evidence for CLAP review.
 */
export class PiArbitrationPackager {
  /**
   * Packages the chat log, GPS data, KYC proofs, and photo proofs into a sealed JSON payload.
   */
  public createSealedPackage(engine: EscrowEngine, escrowId: string): ArbitrationPackage {
    try {
      return engine.createArbitrationPackage(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to package arbitration evidence: ${this.toErrorMessage(error)}`);
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
