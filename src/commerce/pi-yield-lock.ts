import { EscrowEngine } from "../core/EscrowEngine";
import type { EscrowRecord, YieldLockTerms } from "../types/escrow";

/**
 * Yield bridge for 7-day delivery holds while funds remain locked in transit.
 */
export class PiYieldLock {
  /**
   * Attaches an external yield contract strategy to a locked escrow.
   */
  public attachStrategy(
    engine: EscrowEngine,
    escrowId: string,
    provider: string,
    annualPercentageYield: number,
    lockDurationDays = 7
  ): EscrowRecord {
    try {
      const yieldTerms: YieldLockTerms = {
        provider,
        annualPercentageYield,
        lockDurationDays,
        accruedAmount: 0,
        lastAccruedAt: new Date().toISOString()
      };
      return engine.upsertYieldTerms(escrowId, yieldTerms);
    } catch (error: unknown) {
      throw new Error(`Failed to attach yield lock strategy: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Accrues micro-yield against the currently held balance.
   */
  public accrue(engine: EscrowEngine, escrowId: string, elapsedDays: number): EscrowRecord {
    try {
      const escrow = engine.getEscrow(escrowId);
      if (!escrow?.yieldTerms) {
        throw new Error(`Yield terms are not configured for ${escrowId}.`);
      }
      const interest = Number(
        ((escrow.heldAmount * escrow.yieldTerms.annualPercentageYield * elapsedDays) / (100 * 365)).toFixed(8)
      );
      return engine.upsertYieldTerms(escrowId, {
        ...escrow.yieldTerms,
        accruedAmount: Number((escrow.yieldTerms.accruedAmount + interest).toFixed(8)),
        lastAccruedAt: new Date().toISOString()
      });
    } catch (error: unknown) {
      throw new Error(`Failed to accrue yield for ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
