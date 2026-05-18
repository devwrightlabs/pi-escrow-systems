import { PiSmartContractAdapter } from "./pi-smart-contract-adapter";
import type {
  ArbitrationPackage,
  ChatMessage,
  DisputeSuggestion,
  EscrowContractBinding,
  EscrowContribution,
  EscrowCreationRequest,
  EscrowDispute,
  EscrowEngineConfig,
  EscrowMilestone,
  EscrowMilestoneInput,
  EscrowParticipant,
  EscrowRecord,
  EscrowSnapshot,
  EscrowState,
  EscrowValidationResult,
  GpsCoordinates,
  GpsPing,
  KycProof,
  PhotoProof,
  ReputationBond,
  YieldLockTerms
} from "../types/escrow";

const DEFAULT_CONFIG: {
  network: "simulation";
  autoReleaseOnGpsMatch: boolean;
  defaultDeliveryWindowDays: number;
  chatRetentionHours: number;
  broadcastChannelName: string;
} = {
  network: "simulation",
  autoReleaseOnGpsMatch: true,
  defaultDeliveryWindowDays: 7,
  chatRetentionHours: 24,
  broadcastChannelName: "devright-pi-escrow-live"
};

const FALLBACK_UUID = (): string => `id-${Math.random().toString(36).slice(2, 10)}`;
const createId = (prefix: string): string => `${prefix}_${globalThis.crypto?.randomUUID?.() ?? FALLBACK_UUID()}`;
const sumAmounts = (values: Array<{ amount: number }>): number => values.reduce((total, value) => total + value.amount, 0);
const normalizeCoordinate = (value: number): number => Number(value.toFixed(6));

/**
 * Main in-memory escrow engine for typed Pi commerce flows.
 */
export class EscrowEngine {
  private readonly adapter: PiSmartContractAdapter;

  private readonly config: EscrowEngineConfig;

  private readonly escrows = new Map<string, EscrowRecord>();

  private readonly listeners = new Set<(snapshot: EscrowSnapshot) => void>();

  /**
   * Creates a new escrow engine instance.
   */
  public constructor(config: EscrowEngineConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.adapter = new PiSmartContractAdapter(this.config.network);
  }

  /**
   * Returns the merged engine configuration.
   */
  public getConfig(): EscrowEngineConfig {
    return { ...DEFAULT_CONFIG, ...this.config };
  }

  /**
   * Subscribes to escrow snapshot changes.
   */
  public subscribe(listener: (snapshot: EscrowSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Returns a snapshot of all tracked escrows.
   */
  public getSnapshot(): EscrowSnapshot {
    return {
      escrows: this.getEscrows(),
      connected: true,
      updatedAt: this.nowIso()
    };
  }

  /**
   * Lists every tracked escrow after purging expired chat data.
   */
  public getEscrows(): EscrowRecord[] {
    return Array.from(this.escrows.values()).map((escrow) => this.purgeExpiredChatMessages(escrow));
  }

  /**
   * Reads a single escrow record by identifier.
   */
  public getEscrow(escrowId: string): EscrowRecord | undefined {
    const escrow = this.escrows.get(escrowId);
    return escrow ? this.purgeExpiredChatMessages(escrow) : undefined;
  }

  /**
   * Creates a new escrow draft and compiles its initial WASM payload.
   */
  public createEscrow(input: EscrowCreationRequest): EscrowRecord {
    try {
      const escrowId = input.contractId ?? createId("escrow");
      const now = this.nowIso();
      const contributions = (input.contributors ?? []).map<EscrowContribution>((contributor) => ({
        walletAddress: contributor.walletAddress,
        amount: contributor.amount,
        role: contributor.role,
        contributedAt: now
      }));
      const fundedAmount = sumAmounts(contributions);
      const thresholdAmount = input.thresholdAmount ?? input.amount;
      const participants = this.createParticipants(input);
      const milestones = this.createMilestones(input.amount, input.milestones ?? []);
      const state: EscrowState = fundedAmount >= thresholdAmount ? "LOCKED" : "PENDING_FUNDS";
      const baseRecord: Omit<EscrowRecord, "contractBinding" | "contractPayload"> = {
        id: escrowId,
        title: input.title,
        description: input.description,
        assetSymbol: input.assetSymbol ?? "PI",
        amount: input.amount,
        thresholdAmount,
        fundedAmount,
        heldAmount: fundedAmount,
        releasedAmount: 0,
        refundedAmount: 0,
        state,
        participants,
        contributions,
        milestones,
        createdAt: now,
        updatedAt: now,
        deliveryWindowDays: input.deliveryWindowDays ?? this.getDefaultDeliveryWindowDays(),
        metadata: { ...(input.metadata ?? {}) },
        photoProofs: [],
        gpsHandshake: {
          releaseOnMatch: this.shouldAutoReleaseOnGpsMatch()
        },
        chatMessages: [],
        kycProofs: []
      };
      const contractBinding = this.createContractBinding(baseRecord);
      const contractPayload = this.adapter.compile(contractBinding);
      const record: EscrowRecord = {
        ...baseRecord,
        contractBinding,
        contractPayload,
        lockedAt: state === "LOCKED" ? now : undefined
      };

      const validation = this.validateEscrowRecord(record);
      if (!validation.valid) {
        throw new Error(validation.issues.join("; "));
      }

      this.escrows.set(escrowId, record);
      this.emit();
      return record;
    } catch (error: unknown) {
      throw new Error(`Failed to create escrow: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Validates an escrow record before execution.
   */
  public validateEscrowRecord(record: EscrowRecord): EscrowValidationResult {
    const issues: string[] = [];
    const buyer = record.participants.find((participant) => participant.role === "BUYER");
    const seller = record.participants.find((participant) => participant.role === "SELLER");

    if (!buyer) {
      issues.push("A buyer participant is required.");
    }
    if (!seller) {
      issues.push("A seller participant is required.");
    }
    if (record.amount <= 0) {
      issues.push("Escrow amount must be greater than zero.");
    }
    if (record.thresholdAmount <= 0) {
      issues.push("Threshold amount must be greater than zero.");
    }
    if (record.thresholdAmount > record.amount) {
      issues.push("Threshold amount cannot exceed the escrow amount.");
    }
    if (record.heldAmount > record.amount) {
      issues.push("Held amount cannot exceed the escrow amount.");
    }
    if (record.milestones.length > 0) {
      const totalPercentage = record.milestones.reduce((sum, milestone) => sum + milestone.percentage, 0);
      if (Number(totalPercentage.toFixed(6)) !== 100) {
        issues.push("Milestone percentages must sum to exactly 100.");
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Contributes funds to a pending or locked escrow.
   */
  public contributeToEscrow(escrowId: string, contribution: Pick<EscrowContribution, "walletAddress" | "amount" | "role">): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      const now = this.nowIso();
      const nextContribution: EscrowContribution = {
        ...contribution,
        contributedAt: now
      };
      const fundedAmount = escrow.fundedAmount + contribution.amount;
      const nextEscrow: EscrowRecord = {
        ...escrow,
        fundedAmount,
        heldAmount: Math.min(escrow.amount, escrow.heldAmount + contribution.amount),
        contributions: [...escrow.contributions, nextContribution],
        updatedAt: now
      };
      this.persist(this.refreshPayload(nextEscrow));

      if (nextEscrow.state === "PENDING_FUNDS" && fundedAmount >= nextEscrow.thresholdAmount) {
        return this.executeHold(escrowId);
      }

      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to contribute to escrow ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Locks the funded amount in escrow and refreshes the compiled contract payload.
   */
  public executeHold(escrowId: string): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      if (escrow.fundedAmount < escrow.thresholdAmount) {
        throw new Error("Escrow threshold has not been met.");
      }
      const now = this.nowIso();
      const nextEscrow: EscrowRecord = {
        ...escrow,
        state: "LOCKED",
        heldAmount: Math.min(escrow.amount, escrow.fundedAmount),
        lockedAt: escrow.lockedAt ?? now,
        updatedAt: now
      };
      this.persist(this.refreshPayload(nextEscrow));
      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to execute hold for ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Approves a milestone and releases its proportional amount.
   */
  public approveMilestone(escrowId: string, milestoneId: string, approvedBy: string): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      if (escrow.state === "DISPUTED") {
        throw new Error("Cannot approve milestones while a dispute is open.");
      }
      const now = this.nowIso();
      let releaseAmount = 0;
      const milestones = escrow.milestones.map<EscrowMilestone>((milestone) => {
        if (milestone.id !== milestoneId) {
          return milestone;
        }

        if (milestone.status !== "PENDING") {
          throw new Error(`Milestone ${milestoneId} was already processed.`);
        }

        releaseAmount = Number(((escrow.amount * milestone.percentage) / 100).toFixed(8));
        return {
          ...milestone,
          status: "RELEASED" as const,
          approvedAt: now,
          releasedAmount: releaseAmount
        };
      });

      if (releaseAmount <= 0) {
        throw new Error(`Milestone ${milestoneId} was not found.`);
      }

      const nextEscrow = this.applyReleaseMutation(escrow, releaseAmount, approvedBy, milestones);
      this.persist(this.refreshPayload(nextEscrow));
      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to approve milestone ${milestoneId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Releases either a specific amount or the full remaining balance.
   */
  public releaseEscrow(escrowId: string, releasedBy: string, amount?: number): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      const releaseAmount = amount ?? escrow.heldAmount;
      const nextEscrow = this.applyReleaseMutation(escrow, releaseAmount, releasedBy, escrow.milestones);
      this.persist(this.refreshPayload(nextEscrow));
      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to release escrow ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Opens a dispute and places the escrow into a disputed state.
   */
  public openDispute(escrowId: string, openedBy: string, reason: string, evidenceIds: string[] = []): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      const now = this.nowIso();
      const dispute: EscrowDispute = {
        openedAt: now,
        openedBy,
        reason,
        evidenceIds,
        status: "OPEN"
      };
      const nextEscrow: EscrowRecord = {
        ...escrow,
        state: "DISPUTED",
        dispute,
        updatedAt: now
      };
      this.persist(this.refreshPayload(nextEscrow));
      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to open dispute for ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Resolves a dispute using the supplied refund split.
   */
  public resolveDispute(escrowId: string, suggestion: DisputeSuggestion): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      if (!escrow.dispute) {
        throw new Error("No dispute is open for this escrow.");
      }
      const now = this.nowIso();
      const buyerRefund = Number((escrow.heldAmount * suggestion.suggestedBuyerShare).toFixed(8));
      const sellerRelease = Number((escrow.heldAmount * suggestion.suggestedSellerShare).toFixed(8));
      const nextEscrow: EscrowRecord = {
        ...escrow,
        state: sellerRelease > 0 ? "RELEASED" : "REFUNDED",
        heldAmount: 0,
        releasedAmount: escrow.releasedAmount + sellerRelease,
        refundedAmount: escrow.refundedAmount + buyerRefund,
        releasedAt: sellerRelease > 0 ? now : escrow.releasedAt,
        dispute: {
          ...escrow.dispute,
          status: "RESOLVED",
          aiSuggestion: suggestion
        },
        updatedAt: now
      };
      this.persist(this.refreshPayload(nextEscrow));
      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to resolve dispute for ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Attaches or updates a yield lock strategy for the escrowed funds.
   */
  public upsertYieldTerms(escrowId: string, yieldTerms: YieldLockTerms): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      const nextEscrow: EscrowRecord = {
        ...escrow,
        yieldTerms,
        updatedAt: this.nowIso()
      };
      this.persist(this.refreshPayload(nextEscrow));
      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to attach yield terms to ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Attaches a seller reputation bond to the escrow.
   */
  public attachReputationBond(escrowId: string, bond: ReputationBond): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      const now = this.nowIso();
      const nextEscrow: EscrowRecord = {
        ...escrow,
        reputationBond: bond,
        metadata: {
          ...escrow.metadata,
          reputationBondBypass: bond.bondedAmount >= escrow.amount
        },
        updatedAt: now
      };
      this.persist(this.refreshPayload(nextEscrow));
      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to attach a reputation bond to ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Records a photo proof for the escrow.
   */
  public addPhotoProof(escrowId: string, photoProof: PhotoProof): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      const nextEscrow: EscrowRecord = {
        ...escrow,
        photoProofs: [...escrow.photoProofs, photoProof],
        updatedAt: this.nowIso()
      };
      this.persist(this.refreshPayload(nextEscrow));
      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to add a photo proof to ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Records a GPS ping and auto-releases the escrow when an exact match occurs.
   */
  public addGpsPing(escrowId: string, participantWallet: string, coordinates: GpsCoordinates): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      const buyerWallet = escrow.participants.find((participant) => participant.role === "BUYER")?.walletAddress;
      const sellerWallet = escrow.participants.find((participant) => participant.role === "SELLER")?.walletAddress;
      const now = this.nowIso();
      const ping: GpsPing = {
        participantWallet,
        coordinates: {
          latitude: normalizeCoordinate(coordinates.latitude),
          longitude: normalizeCoordinate(coordinates.longitude)
        },
        recordedAt: now
      };
      const handshake = {
        ...escrow.gpsHandshake,
        buyerPing: participantWallet === buyerWallet ? ping : escrow.gpsHandshake.buyerPing,
        sellerPing: participantWallet === sellerWallet ? ping : escrow.gpsHandshake.sellerPing
      };
      const matched = Boolean(
        handshake.buyerPing &&
          handshake.sellerPing &&
          handshake.buyerPing.coordinates.latitude === handshake.sellerPing.coordinates.latitude &&
          handshake.buyerPing.coordinates.longitude === handshake.sellerPing.coordinates.longitude
      );
      const nextEscrow: EscrowRecord = {
        ...escrow,
        gpsHandshake: {
          ...handshake,
          matchedAt: matched ? now : handshake.matchedAt
        },
        updatedAt: now
      };
      this.persist(this.refreshPayload(nextEscrow));

      if (matched && nextEscrow.gpsHandshake.releaseOnMatch && nextEscrow.heldAmount > 0) {
        return this.releaseEscrow(escrowId, participantWallet);
      }

      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to record GPS handshake for ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Appends a chat message to an escrow conversation.
   */
  public addChatMessage(escrowId: string, message: ChatMessage): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      const nextEscrow: EscrowRecord = {
        ...escrow,
        chatMessages: [...escrow.chatMessages, message],
        updatedAt: this.nowIso()
      };
      this.persist(this.refreshPayload(nextEscrow));
      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to append chat message to ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Returns chat history while enforcing post-release retention rules.
   */
  public getChatMessages(escrowId: string): ChatMessage[] {
    const escrow = this.mustGetEscrow(escrowId);
    return this.purgeExpiredChatMessages(escrow).chatMessages;
  }

  /**
   * Stores a zero-knowledge KYC proof for one escrow participant.
   */
  public addKycProof(escrowId: string, proof: KycProof): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      const withoutExisting = escrow.kycProofs.filter((currentProof) => currentProof.walletAddress !== proof.walletAddress);
      const nextEscrow: EscrowRecord = {
        ...escrow,
        kycProofs: [...withoutExisting, proof],
        updatedAt: this.nowIso()
      };
      this.persist(this.refreshPayload(nextEscrow));
      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to attach KYC proof to ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Applies a gradual buyer refund when the seller becomes unresponsive.
   */
  public applyDecayRefund(escrowId: string, amount: number, triggeredBy: string): EscrowRecord {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      const refundAmount = Math.min(amount, escrow.heldAmount);
      const now = this.nowIso();
      const nextEscrow: EscrowRecord = {
        ...escrow,
        state: refundAmount === escrow.heldAmount ? "REFUNDED" : "REFUNDING",
        heldAmount: Number((escrow.heldAmount - refundAmount).toFixed(8)),
        refundedAmount: Number((escrow.refundedAmount + refundAmount).toFixed(8)),
        updatedAt: now,
        metadata: {
          ...escrow.metadata,
          lastDecayTriggeredBy: triggeredBy,
          lastDecayAt: now
        }
      };
      this.persist(this.refreshPayload(nextEscrow));
      return this.mustGetEscrow(escrowId);
    } catch (error: unknown) {
      throw new Error(`Failed to apply time decay refund to ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  /**
   * Builds a sealed arbitration payload from the current escrow state.
   */
  public createArbitrationPackage(escrowId: string): ArbitrationPackage {
    try {
      const escrow = this.mustGetEscrow(escrowId);
      const payload = JSON.stringify({
        escrowId: escrow.id,
        state: escrow.state,
        dispute: escrow.dispute,
        photoProofs: escrow.photoProofs,
        gpsHandshake: escrow.gpsHandshake,
        chatMessages: escrow.chatMessages,
        kycProofs: escrow.kycProofs
      });
      return {
        escrowId: escrow.id,
        createdAt: this.nowIso(),
        payload,
        sealHash: this.createSealHash(payload)
      };
    } catch (error: unknown) {
      throw new Error(`Failed to create arbitration package for ${escrowId}: ${this.toErrorMessage(error)}`);
    }
  }

  private createParticipants(input: EscrowCreationRequest): EscrowParticipant[] {
    const contributors = (input.contributors ?? []).filter(
      (contributor) => contributor.walletAddress !== input.buyerWallet && contributor.walletAddress !== input.sellerWallet
    );

    return [
      {
        walletAddress: input.buyerWallet,
        role: "BUYER"
      },
      {
        walletAddress: input.sellerWallet,
        role: "SELLER"
      },
      ...contributors.map<EscrowParticipant>((contributor) => ({
        walletAddress: contributor.walletAddress,
        role: contributor.role
      }))
    ];
  }

  private createMilestones(amount: number, milestoneInputs: EscrowMilestoneInput[]): EscrowMilestone[] {
    if (milestoneInputs.length === 0) {
      return [];
    }

    const total = milestoneInputs.reduce((sum, milestone) => sum + milestone.percentage, 0);
    if (Number(total.toFixed(6)) !== 100) {
      throw new Error(`Milestone percentages must sum to 100 for amount ${amount}.`);
    }

    return milestoneInputs.map<EscrowMilestone>((milestone) => ({
      id: createId("milestone"),
      label: milestone.label,
      percentage: milestone.percentage,
      dueAt: milestone.dueAt,
      status: "PENDING",
      releasedAmount: 0
    }));
  }

  private createContractBinding(record: Omit<EscrowRecord, "contractBinding" | "contractPayload">): EscrowContractBinding {
    return {
      contractId: record.id,
      title: record.title,
      amount: record.amount,
      thresholdAmount: record.thresholdAmount,
      assetSymbol: record.assetSymbol,
      participants: record.participants,
      milestones: record.milestones,
      releasePolicy: record.milestones.length > 0 ? "milestone-sequenced" : "single-release",
      disputePolicy: "ai-pre-screen-then-clap",
      metadata: record.metadata
    };
  }

  private applyReleaseMutation(
    escrow: EscrowRecord,
    requestedReleaseAmount: number,
    releasedBy: string,
    milestones: EscrowMilestone[]
  ): EscrowRecord {
    if (requestedReleaseAmount <= 0) {
      throw new Error("Release amount must be greater than zero.");
    }
    if (requestedReleaseAmount > escrow.heldAmount) {
      throw new Error("Release amount exceeds the held balance.");
    }

    const now = this.nowIso();
    const remainingHeld = Number((escrow.heldAmount - requestedReleaseAmount).toFixed(8));
    return {
      ...escrow,
      state: remainingHeld === 0 ? "RELEASED" : "LOCKED",
      heldAmount: remainingHeld,
      releasedAmount: Number((escrow.releasedAmount + requestedReleaseAmount).toFixed(8)),
      releasedAt: remainingHeld === 0 ? now : escrow.releasedAt,
      milestones,
      updatedAt: now,
      metadata: {
        ...escrow.metadata,
        lastReleasedBy: releasedBy,
        lastReleaseAt: now
      }
    };
  }

  private purgeExpiredChatMessages(escrow: EscrowRecord): EscrowRecord {
    if (!escrow.releasedAt || escrow.chatMessages.length === 0) {
      return escrow;
    }

    const chatRetentionHours = this.getChatRetentionHours();
    const retentionMs = chatRetentionHours * 60 * 60 * 1000;
    const releasedAtMs = new Date(escrow.releasedAt).getTime();
    if (Date.now() - releasedAtMs < retentionMs) {
      return escrow;
    }

    const purgedEscrow: EscrowRecord = {
      ...escrow,
      chatMessages: [],
      updatedAt: this.nowIso()
    };
    this.escrows.set(escrow.id, purgedEscrow);
    return purgedEscrow;
  }

  private refreshPayload(record: EscrowRecord): EscrowRecord {
    const contractBinding = this.createContractBinding(record);
    return {
      ...record,
      contractBinding,
      contractPayload: this.adapter.compile(contractBinding)
    };
  }

  private mustGetEscrow(escrowId: string): EscrowRecord {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new Error(`Escrow ${escrowId} does not exist.`);
    }
    return escrow;
  }

  private persist(record: EscrowRecord): void {
    this.escrows.set(record.id, record);
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private createSealHash(payload: string): string {
    let hash = 0;
    for (let index = 0; index < payload.length; index += 1) {
      hash = (hash << 5) - hash + payload.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }

  private nowIso(): string {
    return (this.config.clock?.now() ?? new Date()).toISOString();
  }

  private getDefaultDeliveryWindowDays(): number {
    return this.config.defaultDeliveryWindowDays ?? DEFAULT_CONFIG.defaultDeliveryWindowDays;
  }

  private shouldAutoReleaseOnGpsMatch(): boolean {
    return this.config.autoReleaseOnGpsMatch ?? DEFAULT_CONFIG.autoReleaseOnGpsMatch;
  }

  private getChatRetentionHours(): number {
    return this.config.chatRetentionHours ?? DEFAULT_CONFIG.chatRetentionHours;
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
