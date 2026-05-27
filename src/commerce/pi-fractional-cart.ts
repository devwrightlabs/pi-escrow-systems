import { EscrowEngine } from "../core/EscrowEngine";
import type { EscrowCreationRequest, EscrowRecord } from "../types/escrow";

/**
 * Group-buying module that aggregates multiple contributors before locking an escrow.
 */
export class PiFractionalCart {
  /**
   * Creates a threshold-based escrow that only locks once the contribution target is met.
   */
  public createGroupCart(engine: EscrowEngine, input: EscrowCreationRequest): EscrowRecord {
    try {
      return engine.createEscrow({
        ...input,
        thresholdAmount: input.thresholdAmount ?? input.amount
      });
    } catch (error: unknown) {
      throw new Error(`Failed to create fractional cart escrow: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Adds a contribution and auto-locks the cart when the threshold is achieved.
   */
  public addContribution(
    engine: EscrowEngine,
    escrowId: string,
    walletAddress: string,
    amount: number,
    role: "BUYER" | "CONTRIBUTOR" = "CONTRIBUTOR"
  ): EscrowRecord {
    try {
      return engine.contributeToEscrow(escrowId, {
        walletAddress,
        amount,
        role
      });
    } catch (error: unknown) {
      throw new Error(`Failed to add fractional cart contribution: ${this.toErrorMessage(error)}`);
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
