import { EscrowEngine } from "../core/EscrowEngine";
import type { ChatMessage, ChatCipherSuite } from "../types/escrow";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CIPHER_SUITE: ChatCipherSuite = "AES-GCM-256";

const toHex = (value: Uint8Array): string =>
  Array.from(value)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const fromHex = (value: string): Uint8Array => {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
};

/**
 * Encrypted, escrow-bound chat interface with automatic post-release expiry.
 */
export class PiEscrowChat {
  /**
   * Encrypts and appends a chat message to the target escrow contract.
   */
  public async sendMessage(
    engine: EscrowEngine,
    escrowId: string,
    senderWallet: string,
    recipientWallet: string,
    plaintext: string,
    sharedSecret: string
  ): Promise<ChatMessage> {
    try {
      const encrypted = await this.encrypt(plaintext, sharedSecret);
      const message: ChatMessage = {
        id: `chat_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`,
        escrowId,
        senderWallet,
        recipientWallet,
        content: encrypted,
        encrypted: true,
        cipherSuite: CIPHER_SUITE,
        createdAt: new Date().toISOString()
      };
      engine.addChatMessage(escrowId, message);
      return message;
    } catch (error: unknown) {
      throw new Error(`Failed to send escrow chat message: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Decrypts all surviving escrow messages with the supplied shared secret.
   */
  public async readMessages(
    engine: EscrowEngine,
    escrowId: string,
    sharedSecret: string
  ): Promise<Array<ChatMessage & { plaintext: string }>> {
    try {
      const messages = engine.getChatMessages(escrowId);
      const resolvedMessages = await Promise.all(
        messages.map(async (message) => ({
          ...message,
          plaintext: message.encrypted ? await this.decrypt(message.content, sharedSecret) : message.content
        }))
      );
      return resolvedMessages;
    } catch (error: unknown) {
      throw new Error(`Failed to read escrow chat messages: ${this.toErrorMessage(error)}`);
    }
  }

  private async deriveKey(sharedSecret: string): Promise<CryptoKey> {
    if (!globalThis.crypto?.subtle) {
      throw new Error("Web Crypto is required for encrypted escrow chat.");
    }
    const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(sharedSecret));
    return globalThis.crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  private async encrypt(plaintext: string, sharedSecret: string): Promise<string> {
    if (!globalThis.crypto?.getRandomValues) {
      throw new Error("Web Crypto random values are required for encrypted escrow chat.");
    }
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(sharedSecret);
    const cipherBuffer = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));
    const cipherBytes = new Uint8Array(cipherBuffer);
    const merged = new Uint8Array(iv.length + cipherBytes.length);
    merged.set(iv, 0);
    merged.set(cipherBytes, iv.length);
    return toHex(merged);
  }

  private async decrypt(serializedCipherText: string, sharedSecret: string): Promise<string> {
    const merged = fromHex(serializedCipherText);
    const iv = merged.slice(0, 12);
    const ciphertext = merged.slice(12);
    const key = await this.deriveKey(sharedSecret);
    const plainBuffer = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return decoder.decode(plainBuffer);
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
