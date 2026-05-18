import { EscrowEngine } from "../core/EscrowEngine";
import type { EscrowRecord } from "../types/escrow";

/**
 * Refund timer that drains funds back to the buyer after prolonged seller silence.
 */
export class PiTimeDecayRefund {
  /**
   * Calculates the refundable percentage after the 48-hour grace window has elapsed.
   */
  public calculateRefundRatio(hoursSinceSellerResponse: number): number {
    if (hoursSinceSellerResponse <= 48) {
      return 0;
    }

    return Math.min(1, Number((((hoursSinceSellerResponse - 48) / 48)).toFixed(2)));
  }

  /**
   * Applies a proportional buyer refund based on the seller's unresponsive period.
   */
  public apply(engine: EscrowEngine, escrowId: string, hoursSinceSellerResponse: number, triggeredBy: string): EscrowRecord {
    try {
      const escrow = engine.getEscrow(escrowId);
      if (!escrow) {
        throw new Error(`Escrow ${escrowId} does not exist.`);
      }
      const ratio = this.calculateRefundRatio(hoursSinceSellerResponse);
      if (ratio <= 0) {
        return escrow;
      }
      return engine.applyDecayRefund(escrowId, Number((escrow.heldAmount * ratio).toFixed(8)), triggeredBy);
    } catch (error: unknown) {
      throw new Error(`Failed to apply time-decay refund: ${this.toErrorMessage(error)}`);
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
