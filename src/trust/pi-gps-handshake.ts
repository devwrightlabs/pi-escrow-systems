import { EscrowEngine } from "../core/EscrowEngine";
import type { EscrowRecord, GpsCoordinates } from "../types/escrow";

/**
 * In-person release gate driven by exact buyer and seller geolocation matches.
 */
export class PiGpsHandshake {
  /**
   * Records a participant location update and auto-releases on an exact coordinate match.
   */
  public recordPing(engine: EscrowEngine, escrowId: string, participantWallet: string, coordinates: GpsCoordinates): EscrowRecord {
    try {
      return engine.addGpsPing(escrowId, participantWallet, coordinates);
    } catch (error: unknown) {
      throw new Error(`Failed to record GPS handshake: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Checks whether both parties have produced the same normalized coordinates.
   */
  public hasExactMatch(engine: EscrowEngine, escrowId: string): boolean {
    try {
      const escrow = engine.getEscrow(escrowId);
      return Boolean(
        escrow?.gpsHandshake.buyerPing &&
          escrow.gpsHandshake.sellerPing &&
          escrow.gpsHandshake.buyerPing.coordinates.latitude === escrow.gpsHandshake.sellerPing.coordinates.latitude &&
          escrow.gpsHandshake.buyerPing.coordinates.longitude === escrow.gpsHandshake.sellerPing.coordinates.longitude
      );
    } catch (error: unknown) {
      throw new Error(`Failed to evaluate GPS handshake state: ${this.toErrorMessage(error)}`);
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
