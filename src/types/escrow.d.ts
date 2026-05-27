export type EscrowLifecycleState = "LOCKED" | "DISPUTED" | "RELEASED";
export type EscrowState =
  | "DRAFT"
  | "PENDING_FUNDS"
  | EscrowLifecycleState
  | "REFUNDING"
  | "REFUNDED"
  | "CANCELLED";
export type PiProtocolVersion = 23;
export type ParticipantRole = "BUYER" | "SELLER" | "ARBITRATOR" | "CONTRIBUTOR" | "MEDIATOR";
export type ProofSource = "CAMERA" | "GALLERY";
export type EscrowNetwork = "pi-mainnet" | "pi-testnet" | "simulation";
export type ChatCipherSuite = "AES-GCM-256";
export type MilestoneStatus = "PENDING" | "APPROVED" | "RELEASED";
export type EscrowMetadataPrimitive = string | number | boolean | null;
export type EscrowMetadata = Record<string, EscrowMetadataPrimitive>;

export interface EscrowParticipant {
  walletAddress: string;
  role: ParticipantRole;
  displayName?: string | undefined;
  reputationScore?: number | undefined;
  kycVerified?: boolean | undefined;
}

export interface EscrowContribution {
  walletAddress: string;
  amount: number;
  contributedAt: string;
  role: ParticipantRole;
}

export interface EscrowMilestoneInput {
  label: string;
  percentage: number;
  dueAt?: string | undefined;
}

export interface EscrowMilestone extends EscrowMilestoneInput {
  id: string;
  status: MilestoneStatus;
  approvedAt?: string | undefined;
  releasedAmount: number;
}

export interface YieldLockTerms {
  provider: string;
  annualPercentageYield: number;
  lockDurationDays: number;
  accruedAmount: number;
  lastAccruedAt: string;
}

export interface ReputationBond {
  sellerWallet: string;
  bondedAmount: number;
  minimumReputationScore: number;
  activatedAt: string;
  expiresAt?: string | undefined;
}

export interface PhotoProof {
  id: string;
  escrowId: string;
  capturedAt: string;
  capturedBy: string;
  source: ProofSource;
  digest: string;
  mimeType: string;
  timestampAuthority: string;
}

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
}

export interface GpsPing {
  participantWallet: string;
  coordinates: GpsCoordinates;
  recordedAt: string;
}

export interface GpsHandshake {
  buyerPing?: GpsPing | undefined;
  sellerPing?: GpsPing | undefined;
  matchedAt?: string | undefined;
  releaseOnMatch: boolean;
}

export interface ChatMessage {
  id: string;
  escrowId: string;
  senderWallet: string;
  recipientWallet: string;
  content: string;
  encrypted: boolean;
  cipherSuite?: ChatCipherSuite | undefined;
  createdAt: string;
  expiresAt?: string | undefined;
}

export interface EscrowDispute {
  openedAt: string;
  openedBy: string;
  reason: string;
  evidenceIds: string[];
  status: "OPEN" | "MEDIATED" | "ESCALATED" | "RESOLVED";
  aiSuggestion?: DisputeSuggestion | undefined;
}

export interface DisputeSuggestion {
  suggestedBuyerShare: number;
  suggestedSellerShare: number;
  confidence: number;
  rationale: string;
  generatedAt: string;
}

export interface KycProof {
  walletAddress: string;
  proof: string;
  issuedAt: string;
  verifier: string;
}

export interface ArbitrationPackage {
  escrowId: string;
  createdAt: string;
  payload: string;
  sealHash: string;
}

export interface EscrowWasmInstruction {
  opcode: string;
  params: Record<string, string | number | boolean | null>;
}

export interface EscrowWasmPayload {
  contractId: string;
  protocolVersion: PiProtocolVersion;
  target: "rust-wasm";
  entrypoint: string;
  instructions: EscrowWasmInstruction[];
  checksum: string;
  metadata: Record<string, string>;
}

export interface EscrowContractBinding {
  contractId: string;
  title: string;
  amount: number;
  thresholdAmount: number;
  assetSymbol: string;
  participants: EscrowParticipant[];
  milestones: EscrowMilestone[];
  releasePolicy: string;
  disputePolicy: string;
  metadata: EscrowMetadata;
}

export interface EscrowCreationRequest {
  contractId?: string | undefined;
  title: string;
  description?: string | undefined;
  assetSymbol?: string | undefined;
  amount: number;
  thresholdAmount?: number | undefined;
  buyerWallet: string;
  sellerWallet: string;
  contributors?: Array<Pick<EscrowContribution, "walletAddress" | "amount" | "role">>;
  milestones?: EscrowMilestoneInput[];
  deliveryWindowDays?: number | undefined;
  metadata?: EscrowMetadata | undefined;
}

export interface BaseEscrowRecord {
  id: string;
  title: string;
  description?: string | undefined;
  assetSymbol: string;
  amount: number;
  thresholdAmount: number;
  fundedAmount: number;
  heldAmount: number;
  releasedAmount: number;
  refundedAmount: number;
  state: EscrowState;
  participants: EscrowParticipant[];
  contributions: EscrowContribution[];
  milestones: EscrowMilestone[];
  contractBinding: EscrowContractBinding;
  contractPayload: EscrowWasmPayload;
  createdAt: string;
  updatedAt: string;
  deliveryWindowDays: number;
  metadata: EscrowMetadata;
  yieldTerms?: YieldLockTerms | undefined;
  reputationBond?: ReputationBond | undefined;
  photoProofs: PhotoProof[];
  gpsHandshake: GpsHandshake;
  chatMessages: ChatMessage[];
  dispute?: EscrowDispute | undefined;
  kycProofs: KycProof[];
  releasedAt?: string | undefined;
  lockedAt?: string | undefined;
}

export interface LockedEscrowRecord extends BaseEscrowRecord {
  state: "LOCKED";
  lockedAt: string;
}

export interface DisputedEscrowRecord extends BaseEscrowRecord {
  state: "DISPUTED";
  dispute: EscrowDispute;
}

export interface ReleasedEscrowRecord extends BaseEscrowRecord {
  state: "RELEASED";
  releasedAt: string;
}

export type EscrowRecord = BaseEscrowRecord;

export interface EscrowValidationResult {
  valid: boolean;
  issues: string[];
}

export interface EscrowSnapshot {
  escrows: EscrowRecord[];
  connected: boolean;
  updatedAt: string;
}

export interface EngineClock {
  now(): Date;
}

export interface EscrowEngineConfig {
  network?: EscrowNetwork | undefined;
  clock?: EngineClock | undefined;
  autoReleaseOnGpsMatch?: boolean | undefined;
  defaultDeliveryWindowDays?: number | undefined;
  chatRetentionHours?: number | undefined;
  broadcastChannelName?: string | undefined;
}

export interface BarterOffer {
  id: string;
  traderWallet: string;
  givesAsset: string;
  wantsAsset: string;
  amount: number;
}

export interface BarterCycle {
  cycleId: string;
  offers: BarterOffer[];
  executedAt: string;
}
