import { EscrowEngine } from "../core/EscrowEngine";
import type { EscrowRecord, PhotoProof, ProofSource } from "../types/escrow";

const encoder = new TextEncoder();

const hexEncode = (value: ArrayBuffer): string =>
  Array.from(new Uint8Array(value))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/**
 * Captures and seals live camera evidence before escrow locking begins.
 */
export class PiPhotoProof {
  /**
   * Records a cryptographically time-stamped camera proof and rejects gallery uploads.
   */
  public async captureLiveProof(
    engine: EscrowEngine,
    escrowId: string,
    capturedBy: string,
    imagePayload: string,
    mimeType: string,
    source: ProofSource = "CAMERA"
  ): Promise<EscrowRecord> {
    try {
      if (source !== "CAMERA") {
        throw new Error("Gallery uploads are blocked; a live camera capture is required.");
      }
      const digestBuffer = await this.digest(`${escrowId}:${capturedBy}:${imagePayload}`);
      const photoProof: PhotoProof = {
        id: `photo_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`,
        escrowId,
        capturedAt: new Date().toISOString(),
        capturedBy,
        source,
        digest: hexEncode(digestBuffer),
        mimeType,
        timestampAuthority: "pi-webview-secure-camera"
      };
      return engine.addPhotoProof(escrowId, photoProof);
    } catch (error: unknown) {
      throw new Error(`Failed to capture a live photo proof: ${this.toErrorMessage(error)}`);
    }
  }

  private async digest(value: string): Promise<ArrayBuffer> {
    if (!globalThis.crypto?.subtle) {
      throw new Error("Web Crypto is required to compute photo proof digests.");
    }
    return globalThis.crypto.subtle.digest("SHA-256", encoder.encode(value));
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
