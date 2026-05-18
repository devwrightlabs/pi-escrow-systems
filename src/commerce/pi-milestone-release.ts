import { EscrowEngine } from "../core/EscrowEngine";
import type { EscrowMilestoneInput, EscrowRecord } from "../types/escrow";

/**
 * Sequential release workflow for gig and milestone-based payments.
 */
export class PiMilestoneRelease {
  /**
   * Reconfigures an escrow with a milestone release schedule.
   */
  public configureMilestones(engine: EscrowEngine, escrowId: string, milestones: EscrowMilestoneInput[]): EscrowRecord {
    try {
      const escrow = engine.getEscrow(escrowId);
      if (!escrow) {
        throw new Error(`Escrow ${escrowId} was not found.`);
      }
      const recreated = engine.createEscrow({
        contractId: escrow.id,
        title: escrow.title,
        description: escrow.description,
        assetSymbol: escrow.assetSymbol,
        amount: escrow.amount,
        thresholdAmount: escrow.thresholdAmount,
        buyerWallet: escrow.participants.find((participant) => participant.role === "BUYER")?.walletAddress ?? "",
        sellerWallet: escrow.participants.find((participant) => participant.role === "SELLER")?.walletAddress ?? "",
        contributors: escrow.contributions.map((contribution) => ({
          walletAddress: contribution.walletAddress,
          amount: contribution.amount,
          role: contribution.role
        })),
        milestones,
        deliveryWindowDays: escrow.deliveryWindowDays,
        metadata: escrow.metadata
      });
      return recreated;
    } catch (error: unknown) {
      throw new Error(`Failed to configure milestones: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Approves the next milestone phase and releases the configured percentage.
   */
  public approvePhase(engine: EscrowEngine, escrowId: string, approvedBy: string): EscrowRecord {
    try {
      const escrow = engine.getEscrow(escrowId);
      const nextMilestone = escrow?.milestones.find((milestone) => milestone.status === "PENDING");
      if (!escrow || !nextMilestone) {
        throw new Error(`No pending milestone exists for ${escrowId}.`);
      }
      return engine.approveMilestone(escrowId, nextMilestone.id, approvedBy);
    } catch (error: unknown) {
      throw new Error(`Failed to approve milestone release phase: ${this.toErrorMessage(error)}`);
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
