import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  encodePacked,
  keccak256,
  type Address,
  type Hex,
  type WalletClient,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";

import { FilecoinStorage } from "./FilecoinStorage.js";
import { BankrGateway } from "./BankrGateway.js";
import { CommitmentProofSystem } from "./CommitmentProof.js";
import { AGENT_REGISTRY_ABI, COVENANT_PROTOCOL_ABI, REPUTATION_SYSTEM_ABI } from "./abis.js";
import type {
  AgentConfig,
  AgentConstitution,
  CovenantTerms,
  CovenantResult,
  FulfillmentPayload,
  CommitmentProof,
  AgentReputation,
  LLMMessage,
  SupportedModel,
} from "./types.js";

/**
 * AxiomAgent — The base class for all AXIOM-powered AI agents.
 *
 * Every agent that uses this SDK:
 *   ✓ Has a Filecoin-anchored identity (constitution CID)
 *   ✓ Can create and fulfill cryptographically binding covenants
 *   ✓ Commits reasoning BEFORE acting (tamper-proof accountability)
 *   ✓ Earns/loses reputation based on covenant outcomes
 *   ✓ Pays for its own LLM inference via Bankr
 *   ✓ Accepts payments via x402 for its services
 */
export class AxiomAgent {
  public readonly name: string;
  public readonly agentType: string;
  public readonly address: Address;

  protected wallet: WalletClient;
  protected publicClient: PublicClient;
  protected storage: FilecoinStorage;
  protected llm: BankrGateway;
  protected config: AgentConfig;

  private constitutionCID: string = "";
  private activeProofs: Map<string, CommitmentProof> = new Map();

  // Contract addresses
  protected registryAddress: Address;
  protected covenantAddress: Address;
  protected reputationAddress: Address;

  constructor(config: AgentConfig) {
    this.config = config;
    this.name = config.name;
    this.agentType = config.agentType;

    this.registryAddress = config.registryAddress;
    this.covenantAddress = config.covenantAddress;
    this.reputationAddress = config.reputationAddress;

    const account = privateKeyToAccount(config.privateKey);
    this.address = account.address;

    const chain = config.chainId === 8453 ? base : baseSepolia;

    this.wallet = createWalletClient({
      account,
      transport: http(config.rpcUrl),
      chain,
    });

    this.publicClient = createPublicClient({
      transport: http(config.rpcUrl),
      chain,
    });

    this.storage = new FilecoinStorage({
      rpcUrl: config.filecoinRpcUrl,
      privateKey: config.filecoinPrivateKey,
    });

    this.llm = new BankrGateway({
      apiKey: config.bankrApiKey ?? "",
      defaultModel: config.defaultModel ?? "claude-sonnet-4-6",
    });
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Initialize the agent: connect to Filecoin, register on-chain.
   */
  async init(): Promise<void> {
    console.log(`\n[${this.name}] Initializing...`);
    await this.storage.init();

    const alreadyRegistered = await this.isRegistered();
    if (!alreadyRegistered) {
      await this.registerOnChain();
    } else {
      const profile = await this.getOnChainProfile();
      this.constitutionCID = profile.constitutionCID;
      console.log(`[${this.name}] Already registered. Constitution: ${this.constitutionCID}`);
    }

    const rep = await this.getReputation();
    console.log(`[${this.name}] Ready. Reputation: ${rep.score} (${rep.tier})`);
  }

  private async registerOnChain(): Promise<void> {
    console.log(`[${this.name}] Storing constitution on Filecoin...`);
    this.constitutionCID = await this.storage.storeConstitution(this.config.constitution);
    console.log(`[${this.name}] Constitution CID: ${this.constitutionCID}`);

    console.log(`[${this.name}] Registering on-chain...`);
    const hash = await this.wallet.writeContract({
      address: this.registryAddress,
      abi: AGENT_REGISTRY_ABI,
      functionName: "register",
      args: [this.address, this.name, this.agentType, this.constitutionCID],
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[${this.name}] Registered. Tx: ${hash}`);
  }

  // ============================================================================
  // Covenant Operations
  // ============================================================================

  /**
   * Hire another agent by creating a covenant with escrow payment.
   */
  async hirAgent(
    providerAddress: Address,
    terms: CovenantTerms
  ): Promise<CovenantResult> {
    console.log(`[${this.name}] Creating covenant with ${providerAddress}...`);

    const termsCID = await this.storage.storeTerms(terms);
    const termsHash = keccak256(encodePacked(["string"], [termsCID]));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + terms.deadlineSeconds);
    const paymentWei = parseEther(terms.paymentAmount);

    const hash = await this.wallet.writeContract({
      address: this.covenantAddress,
      abi: COVENANT_PROTOCOL_ABI,
      functionName: "createCovenant",
      args: [
        providerAddress,
        termsCID,
        termsHash,
        deadline,
        BigInt(terms.minReputation ?? 0),
        (terms.delegationData ?? "0x") as Hex,
      ],
      value: paymentWei,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    // Parse covenantId from logs
    const covenantCount = await this.publicClient.readContract({
      address: this.covenantAddress,
      abi: COVENANT_PROTOCOL_ABI,
      functionName: "covenantCount",
    });
    const covenantId = (covenantCount as bigint) - 1n;

    console.log(`[${this.name}] Covenant #${covenantId} created. Terms: ${termsCID}`);

    return {
      covenantId,
      txHash: hash,
      requester: this.address,
      provider: providerAddress,
      paymentAmount: terms.paymentAmount,
      deadline: new Date(Number(deadline) * 1000),
      termsCID,
    };
  }

  /**
   * Commit reasoning hash BEFORE taking any action.
   * This is what makes AXIOM agents accountable.
   */
  async commitReasoning(covenantId: bigint, reasoning: string): Promise<CommitmentProof> {
    const proof = CommitmentProofSystem.commit(reasoning, covenantId.toString());

    console.log(`[${this.name}] Committing reasoning for covenant #${covenantId}...`);
    console.log(`[${this.name}] Commitment: ${proof.commitment}`);

    const hash = await this.wallet.writeContract({
      address: this.covenantAddress,
      abi: COVENANT_PROTOCOL_ABI,
      functionName: "commitReasoning",
      args: [covenantId, proof.commitment as `0x${string}`],
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    this.activeProofs.set(covenantId.toString(), proof);

    console.log(`[${this.name}] Reasoning committed on-chain. Tx: ${hash}`);
    return proof;
  }

  /**
   * Fulfill a covenant: reveal reasoning + deliver work product.
   * Automatically releases escrow to this agent.
   */
  async fulfillCovenant(payload: FulfillmentPayload): Promise<Hex> {
    const { covenantId, reasoning, deliverable } = payload;
    const proof = this.activeProofs.get(covenantId.toString());
    if (!proof) {
      throw new Error(`[${this.name}] No commitment found for covenant #${covenantId}`);
    }

    console.log(`[${this.name}] Storing reasoning + deliverable on Filecoin...`);

    const reasoningDoc = CommitmentProofSystem.formatReasoningDocument(
      this.name,
      covenantId.toString(),
      reasoning,
      proof,
      "covenant-fulfillment"
    );

    const [reasoningCID, deliverableCID] = await Promise.all([
      this.storage.storeReasoning(reasoningDoc),
      this.storage.storeDeliverable(deliverable as object),
    ]);

    console.log(`[${this.name}] Reasoning CID: ${reasoningCID}`);
    console.log(`[${this.name}] Deliverable CID: ${deliverableCID}`);

    console.log(`[${this.name}] Fulfilling covenant #${covenantId} on-chain...`);
    const hash = await this.wallet.writeContract({
      address: this.covenantAddress,
      abi: COVENANT_PROTOCOL_ABI,
      functionName: "fulfillCovenant",
      args: [covenantId, reasoning, proof.salt as `0x${string}`, reasoningCID, deliverableCID],
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    this.activeProofs.delete(covenantId.toString());

    console.log(`[${this.name}] Covenant #${covenantId} FULFILLED. Payment received. Tx: ${hash}`);
    return hash;
  }

  // ============================================================================
  // LLM Interface
  // ============================================================================

  async think(
    systemPrompt: string,
    userMessage: string,
    model?: SupportedModel
  ): Promise<string> {
    return this.llm.prompt(systemPrompt, userMessage, model);
  }

  async thinkStructured<T>(
    systemPrompt: string,
    userMessage: string,
    model?: SupportedModel
  ): Promise<T> {
    return this.llm.analyzeToJSON<T>(systemPrompt, userMessage, model);
  }

  async thinkWithHistory(messages: LLMMessage[], model?: SupportedModel): Promise<string> {
    const response = await this.llm.complete(messages, model);
    return response.content;
  }

  // ============================================================================
  // Reputation & Identity
  // ============================================================================

  async getReputation(): Promise<AgentReputation> {
    const [score, tier, record, successRate] = await Promise.all([
      this.publicClient.readContract({
        address: this.reputationAddress,
        abi: REPUTATION_SYSTEM_ABI,
        functionName: "getScore",
        args: [this.address],
      }),
      this.publicClient.readContract({
        address: this.reputationAddress,
        abi: REPUTATION_SYSTEM_ABI,
        functionName: "getTier",
        args: [this.address],
      }),
      this.publicClient.readContract({
        address: this.reputationAddress,
        abi: REPUTATION_SYSTEM_ABI,
        functionName: "getRecord",
        args: [this.address],
      }) as Promise<any>,
      this.publicClient.readContract({
        address: this.reputationAddress,
        abi: REPUTATION_SYSTEM_ABI,
        functionName: "getSuccessRate",
        args: [this.address],
      }),
    ]);

    return {
      address: this.address,
      score: Number(score),
      tier: tier as AgentReputation["tier"],
      totalCovenants: Number(record.totalCovenants),
      fulfilled: Number(record.fulfilled),
      breached: Number(record.breached),
      successRate: Number(successRate),
      executionLogCIDs: record.executionLogCIDs as string[],
    };
  }

  async isRegistered(): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.registryAddress,
      abi: AGENT_REGISTRY_ABI,
      functionName: "isRegistered",
      args: [this.address],
    }) as Promise<boolean>;
  }

  async getOnChainProfile() {
    return this.publicClient.readContract({
      address: this.registryAddress,
      abi: AGENT_REGISTRY_ABI,
      functionName: "getAgent",
      args: [this.address],
    }) as Promise<any>;
  }

  // ============================================================================
  // Utils
  // ============================================================================

  async getBalance(): Promise<string> {
    const balance = await this.publicClient.getBalance({ address: this.address });
    return (Number(balance) / 1e18).toFixed(6) + " ETH";
  }

  get constitutionId(): string {
    return this.constitutionCID;
  }
}
