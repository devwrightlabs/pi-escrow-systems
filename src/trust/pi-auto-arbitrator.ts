import { EscrowEngine } from "../core/EscrowEngine";
import type { DisputeSuggestion } from "../types/escrow";

const POSITIVE_SIGNALS = ["received", "resolved", "thanks", "confirm", "delivered", "working"];
const NEGATIVE_SIGNALS = ["broken", "missing", "late", "refund", "issue", "damaged", "never"];

/**
 * AI-style heuristics that recommend a fair refund split before human escalation.
 */
export class PiAutoArbitrator {
  /**
   * Scans encrypted-chat output and recommends a balanced refund split.
   */
  public suggestRefundSplit(engine: EscrowEngine, escrowId: string): DisputeSuggestion {
    try {
      const messages = engine.getChatMessages(escrowId);
      const corpus = messages.map((message) => message.content.toLowerCase()).join(" ");
      const positiveScore = POSITIVE_SIGNALS.reduce(
        (score, signal) => score + (corpus.includes(signal) ? 1 : 0),
        0
      );
      const negativeScore = NEGATIVE_SIGNALS.reduce(
        (score, signal) => score + (corpus.includes(signal) ? 1 : 0),
        0
      );
      const bias = Math.max(-0.3, Math.min(0.3, (positiveScore - negativeScore) * 0.05));
      const suggestedSellerShare = Number((0.5 + bias).toFixed(2));
      const suggestion: DisputeSuggestion = {
        suggestedBuyerShare: Number((1 - suggestedSellerShare).toFixed(2)),
        suggestedSellerShare,
        confidence: Number(Math.min(0.95, 0.55 + (positiveScore + negativeScore) * 0.04).toFixed(2)),
        rationale:
          "Signal-weighted arbitration recommendation generated from escrow chat sentiment, delivery terms, and refund vocabulary.",
        generatedAt: new Date().toISOString()
      };
      return suggestion;
    } catch (error: unknown) {
      throw new Error(`Failed to generate an automated arbitration suggestion: ${this.toErrorMessage(error)}`);
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
