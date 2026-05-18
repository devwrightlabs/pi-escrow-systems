import type { EscrowContractBinding, EscrowMetadata, EscrowRecord, EscrowWasmInstruction, EscrowWasmPayload } from "../types/escrow";

const hashValue = (value: string): string => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0).toString(16).padStart(8, "0");
};

const metadataToStrings = (metadata: EscrowMetadata): Record<string, string> =>
  Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, String(value)]));

/**
 * Bridges typed escrow bindings into a deterministic Rust WASM payload schema.
 */
export class PiSmartContractAdapter {
  private readonly network: string;

  /**
   * Creates a new adapter for the requested Pi execution network.
   */
  public constructor(network = "simulation") {
    this.network = network;
  }

  /**
   * Compiles a typed escrow contract binding into a Protocol v23 Rust WASM payload.
   */
  public compile(binding: EscrowContractBinding): EscrowWasmPayload {
    try {
      const instructions: EscrowWasmInstruction[] = [
        {
          opcode: "INIT_ESCROW",
          params: {
            title: binding.title,
            amount: binding.amount,
            thresholdAmount: binding.thresholdAmount,
            assetSymbol: binding.assetSymbol
          }
        },
        {
          opcode: "SET_RELEASE_POLICY",
          params: {
            releasePolicy: binding.releasePolicy
          }
        },
        {
          opcode: "SET_DISPUTE_POLICY",
          params: {
            disputePolicy: binding.disputePolicy
          }
        },
        {
          opcode: "SET_PARTICIPANTS",
          params: {
            participantCount: binding.participants.length,
            buyerWallet: binding.participants.find((participant) => participant.role === "BUYER")?.walletAddress ?? "",
            sellerWallet: binding.participants.find((participant) => participant.role === "SELLER")?.walletAddress ?? ""
          }
        }
      ];

      if (binding.milestones.length > 0) {
        instructions.push({
          opcode: "SET_MILESTONES",
          params: {
            milestoneCount: binding.milestones.length,
            milestoneDigest: hashValue(JSON.stringify(binding.milestones))
          }
        });
      }

      return {
        contractId: binding.contractId,
        protocolVersion: 23,
        target: "rust-wasm",
        entrypoint: "execute_escrow",
        instructions,
        checksum: hashValue(JSON.stringify(binding)),
        metadata: {
          network: this.network,
          generatedAt: new Date().toISOString(),
          ...metadataToStrings(binding.metadata)
        }
      };
    } catch (error: unknown) {
      throw new Error(`Failed to compile Pi smart contract payload: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Compiles an in-memory escrow record into a fresh WASM payload.
   */
  public compileEscrowRecord(record: EscrowRecord): EscrowWasmPayload {
    return this.compile(record.contractBinding);
  }

  /**
   * Serializes a payload for transport into a native WASM runtime.
   */
  public serialize(payload: EscrowWasmPayload): string {
    try {
      return JSON.stringify(payload);
    } catch (error: unknown) {
      throw new Error(`Failed to serialize Pi smart contract payload: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Restores a payload that was previously serialized by the adapter.
   */
  public deserialize(serializedPayload: string): EscrowWasmPayload {
    try {
      return JSON.parse(serializedPayload) as EscrowWasmPayload;
    } catch (error: unknown) {
      throw new Error(`Failed to deserialize Pi smart contract payload: ${this.toErrorMessage(error)}`);
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
