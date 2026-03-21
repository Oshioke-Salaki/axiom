import { Address, Hex } from "viem";

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentConstitution {
  name: string;
  agentType: "orchestrator" | "sentiment" | "onchain-data" | "executor" | "custom";
  version: string;
  capabilities: string[];
  restrictions: string[];      // What the agent will NEVER do
  maxSpendPerCovenant: string; // In ETH
  supportedModels: string[];
  author: string;
  createdAt: string;
}

export interface AgentConfig {
  name: string;
  agentType: AgentConstitution["agentType"];
  privateKey: Hex;
  constitution: AgentConstitution;
  // Contract addresses
  registryAddress: Address;
  covenantAddress: Address;
  reputationAddress: Address;
  // Filecoin
  filecoinRpcUrl?: string;
  filecoinPrivateKey?: Hex;
  // Bankr LLM
  bankrApiKey?: string;
  defaultModel?: string;
  // Chain
  rpcUrl: string;
  chainId: number;
}

// ============================================================================
// Covenant Types
// ============================================================================

export interface CovenantTerms {
  task: string;
  description: string;
  deliverableFormat: string;
  successCriteria: string;
  paymentAmount: string;  // In ETH (e.g. "0.01")
  deadlineSeconds: number;
  minReputation?: number;
  delegationData?: Hex;
}

export interface CovenantResult {
  covenantId: bigint;
  txHash: Hex;
  requester: Address;
  provider: Address;
  paymentAmount: string;
  deadline: Date;
  termsCID: string;
}

export interface FulfillmentPayload {
  covenantId: bigint;
  reasoning: string;
  salt: Hex;
  deliverable: unknown;
  deliverableCID?: string;
  reasoningCID?: string;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface StoredDocument {
  cid: string;
  size: number;
  timestamp: number;
  type: "constitution" | "terms" | "reasoning" | "deliverable" | "execution-log";
}

// ============================================================================
// Proof Types
// ============================================================================

export interface CommitmentProof {
  commitment: Hex;       // keccak256(reasoning + salt)
  salt: Hex;
  timestamp: number;
  covenantId: string;
}

export interface ReasoningReveal {
  reasoning: string;
  salt: Hex;
  commitment: Hex;
  verified: boolean;
}

// ============================================================================
// LLM Types
// ============================================================================

export type SupportedModel =
  | "claude-sonnet-4-6"
  | "claude-opus-4-6"
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gpt-4o"
  | string;

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: number;
  cost?: number;
}

// ============================================================================
// Reputation Types
// ============================================================================

export type ReputationTier = "Unregistered" | "Untrusted" | "Provisional" | "Established" | "Trusted" | "Elite";

export interface AgentReputation {
  address: Address;
  score: number;
  tier: ReputationTier;
  totalCovenants: number;
  fulfilled: number;
  breached: number;
  successRate: number;
  executionLogCIDs: string[];
}
