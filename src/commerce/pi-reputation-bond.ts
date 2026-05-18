import { EscrowEngine } from "../core/EscrowEngine";
import type { EscrowRecord, ReputationBond } from "../types/escrow";

/**
 * Seller bond module for trusted merchants that want faster cash flow.
 */
export class PiReputationBond {
  /**
   * Stakes seller collateral so escrow can optionally bypass the standard lock period.
   */
  public stakeBond(
    engine: EscrowEngine,
    escrowId: string,
    sellerWallet: string,
    bondedAmount: number,
    minimumReputationScore: number
  ): EscrowRecord {
    try {
      const bond: ReputationBond = {
        sellerWallet,
        bondedAmount,
        minimumReputationScore,
        activatedAt: new Date().toISOString()
      };
      return engine.attachReputationBond(escrowId, bond);
    } catch (error: unknown) {
      throw new Error(`Failed to stake a reputation bond: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Determines whether the current bond is sufficient to bypass escrow lockup.
   */
  public canBypassStandardLockup(engine: EscrowEngine, escrowId: string): boolean {
    try {
      const escrow = engine.getEscrow(escrowId);
      if (!escrow?.reputationBond) {
        return false;
      }
      const seller = escrow.participants.find((participant) => participant.role === "SELLER");
      return Boolean(
        seller &&
          (seller.reputationScore ?? 0) >= escrow.reputationBond.minimumReputationScore &&
          escrow.reputationBond.bondedAmount >= escrow.amount
      );
    } catch (error: unknown) {
      throw new Error(`Failed to evaluate seller reputation bond: ${this.toErrorMessage(error)}`);
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
