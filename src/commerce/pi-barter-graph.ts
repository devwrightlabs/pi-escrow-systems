import type { BarterCycle, BarterOffer } from "../types/escrow";

const createCycleId = (): string => `cycle_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`;

/**
 * Matching engine for complex, simultaneous multi-party barter swaps.
 */
export class PiBarterGraph {
  /**
   * Detects directed barter cycles where every participant receives the asset they want.
   */
  public findCycles(offers: BarterOffer[]): BarterCycle[] {
    try {
      const cycles: BarterCycle[] = [];
      const seen = new Set<string>();

      for (const offer of offers) {
        const path = this.searchCycle(offers, offer, offer, [], new Set<string>());
        if (path.length > 1) {
          const key = path
            .map((entry) => entry.id)
            .sort()
            .join(":");
          if (!seen.has(key)) {
            seen.add(key);
            cycles.push({
              cycleId: createCycleId(),
              offers: path,
              executedAt: new Date().toISOString()
            });
          }
        }
      }

      return cycles;
    } catch (error: unknown) {
      throw new Error(`Failed to compute barter cycles: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Returns the first executable simultaneous settlement cycle, if any.
   */
  public executeSimultaneousSwap(offers: BarterOffer[]): BarterCycle | undefined {
    try {
      return this.findCycles(offers)[0];
    } catch (error: unknown) {
      throw new Error(`Failed to execute barter graph settlement: ${this.toErrorMessage(error)}`);
    }
  }

  private searchCycle(
    offers: BarterOffer[],
    origin: BarterOffer,
    current: BarterOffer,
    path: BarterOffer[],
    visited: Set<string>
  ): BarterOffer[] {
    const nextPath = [...path, current];
    const nextVisited = new Set(visited);
    nextVisited.add(current.id);

    const nextOffers = offers.filter(
      (candidate) =>
        !nextVisited.has(candidate.id) &&
        current.wantsAsset === candidate.givesAsset &&
        current.amount <= candidate.amount
    );

    for (const candidate of nextOffers) {
      if (candidate.wantsAsset === origin.givesAsset && candidate.amount >= origin.amount) {
        return [...nextPath, candidate];
      }
      const nested = this.searchCycle(offers, origin, candidate, nextPath, nextVisited);
      if (nested.length > 0) {
        return nested;
      }
    }

    return [];
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
