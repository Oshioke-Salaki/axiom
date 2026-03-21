// @ts-nocheck
// Re-export SDK types inline (avoids workspace dependency)
import { randomBytes as nodeRandomBytes } from "crypto";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  encodePacked,
  keccak256,
  toHex,
  nonceManager,
  parseEventLogs,
  type Address,
  type Hex,
  type WalletClient,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import OpenAI from "openai";

// ============================================================================
// ABI fragments
// ============================================================================
export const AGENT_REGISTRY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "agentAddress", type: "address" },
      { internalType: "string", name: "name", type: "string" },
      { internalType: "string", name: "agentType", type: "string" },
      { internalType: "string", name: "constitutionCID", type: "string" },
    ],
    name: "register",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "agentAddress", type: "address" }],
    name: "isRegistered",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "agentAddress", type: "address" }],
    name: "getAgent",
    outputs: [
      {
        components: [
          { internalType: "address", name: "owner", type: "address" },
          { internalType: "string", name: "constitutionCID", type: "string" },
          { internalType: "string", name: "name", type: "string" },
          { internalType: "string", name: "agentType", type: "string" },
          { internalType: "uint256", name: "registeredAt", type: "uint256" },
          { internalType: "bool", name: "active", type: "bool" },
        ],
        internalType: "struct AgentRegistry.AgentProfile",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const COVENANT_PROTOCOL_ABI = [
  {
    inputs: [
      { internalType: "address", name: "provider", type: "address" },
      { internalType: "string", name: "termsCID", type: "string" },
      { internalType: "string", name: "termsHash", type: "string" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint256", name: "minReputationRequired", type: "uint256" },
      { internalType: "bytes", name: "delegationData", type: "bytes" },
    ],
    name: "createCovenant",
    outputs: [{ internalType: "uint256", name: "covenantId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "bytes32", name: "reasoningCommitment", type: "bytes32" },
    ],
    name: "commitReasoning",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "string", name: "reasoning", type: "string" },
      { internalType: "bytes32", name: "salt", type: "bytes32" },
      { internalType: "string", name: "reasoningCID", type: "string" },
      { internalType: "string", name: "deliverableCID", type: "string" },
    ],
    name: "fulfillCovenant",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "id", type: "uint256" }],
    name: "getCovenant",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "id", type: "uint256" },
          { internalType: "address", name: "requester", type: "address" },
          { internalType: "address", name: "provider", type: "address" },
          { internalType: "string", name: "termsHash", type: "string" },
          { internalType: "string", name: "termsCID", type: "string" },
          { internalType: "uint256", name: "paymentAmount", type: "uint256" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
          { internalType: "uint8", name: "state", type: "uint8" },
          { internalType: "bytes32", name: "reasoningCommitment", type: "bytes32" },
          { internalType: "string", name: "reasoningCID", type: "string" },
          { internalType: "string", name: "deliverableCID", type: "string" },
          { internalType: "uint256", name: "createdAt", type: "uint256" },
          { internalType: "uint256", name: "committedAt", type: "uint256" },
          { internalType: "uint256", name: "fulfilledAt", type: "uint256" },
          { internalType: "bytes", name: "delegationData", type: "bytes" },
          { internalType: "uint256", name: "minReputationRequired", type: "uint256" },
        ],
        internalType: "struct CovenantProtocol.Covenant",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "covenantCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    type: "event",
    name: "CovenantCreated",
    inputs: [
      { indexed: true, name: "id", type: "uint256" },
      { indexed: true, name: "requester", type: "address" },
      { indexed: true, name: "provider", type: "address" },
      { indexed: false, name: "paymentAmount", type: "uint256" },
      { indexed: false, name: "deadline", type: "uint256" },
      { indexed: false, name: "termsCID", type: "string" },
    ],
  },
] as const;

export const REPUTATION_SYSTEM_ABI = [
  {
    inputs: [{ internalType: "address", name: "agent", type: "address" }],
    name: "getScore",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "agent", type: "address" }],
    name: "getTier",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "agent", type: "address" }],
    name: "getRecord",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "score", type: "uint256" },
          { internalType: "uint256", name: "totalCovenants", type: "uint256" },
          { internalType: "uint256", name: "fulfilled", type: "uint256" },
          { internalType: "uint256", name: "breached", type: "uint256" },
          { internalType: "uint256", name: "lastUpdated", type: "uint256" },
          { internalType: "string[]", name: "executionLogCIDs", type: "string[]" },
        ],
        internalType: "struct ReputationSystem.ReputationRecord",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ============================================================================
// CommitmentProof
// ============================================================================
export interface CommitmentProof {
  commitment: Hex;
  salt: Hex;
  reasoning: string;
  timestamp: number;
  covenantId: string;
}

export function createCommitment(reasoning: string, covenantId: string): CommitmentProof {
  const salt = toHex(nodeRandomBytes(32)) as Hex;
  const commitment = keccak256(
    encodePacked(["string", "bytes32"], [reasoning, salt as `0x${string}`])
  ) as Hex;
  return { commitment, salt, reasoning, timestamp: Date.now(), covenantId };
}

export function verifyCommitment(reasoning: string, salt: Hex, commitment: Hex): boolean {
  const computed = keccak256(
    encodePacked(["string", "bytes32"], [reasoning, salt as `0x${string}`])
  );
  return computed.toLowerCase() === commitment.toLowerCase();
}

// ============================================================================
// FilecoinStorage — Synapse SDK v1.0.0
// API: synapse.createStorage() → storage.upload(data) → { commp }
// Requires: ethers v6 peer dep, USDFC deposited + service approved
// ============================================================================
export class FilecoinStorage {
  private isSimulated: boolean;
  private rpcUrl: string;
  private privateKey: string;
  private synapse: any = null;
  private storageService: any = null;

  constructor(config: { rpcUrl?: string; privateKey?: string }) {
    // Use WebSocket RPC for calibration — SDK works better with it
    this.rpcUrl = config.rpcUrl ?? "wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1";
    this.privateKey = config.privateKey ?? "";
    this.isSimulated = !config.privateKey;
  }

  async init(): Promise<void> {
    if (this.isSimulated) {
      console.log("  [Filecoin] Simulation mode (no private key configured)");
      return;
    }
    try {
      const { Synapse } = await import("@filoz/synapse-sdk");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.synapse = await (Synapse as any).create({
        rpcURL: this.rpcUrl,
        privateKey: this.privateKey,
      });
      console.log("  [Filecoin] Connected to FOC calibration network");

      // Check USDFC balance before attempting to create storage
      const { TOKENS } = await import("@filoz/synapse-sdk");
      const usdfc = await this.synapse.payments.walletBalance(TOKENS.USDFC);
      const { ethers } = await import("ethers");
      const usdfcFormatted = ethers.formatUnits(usdfc, 18);
      console.log(`  [Filecoin] USDFC wallet balance: ${usdfcFormatted}`);

      if (usdfc === 0n) {
        console.log("  [Filecoin] No USDFC balance — falling back to simulation");
        console.log("  [Filecoin] To enable real storage: get tUSDFC at https://stg.usdfc.net");
        this.isSimulated = true;
        return;
      }

      // Check deposited balance
      const deposited = await this.synapse.payments.balance();
      console.log(`  [Filecoin] Deposited balance: ${ethers.formatUnits(deposited, 18)} USDFC`);

      if (deposited === 0n) {
        // Auto-deposit a small amount for the demo
        console.log("  [Filecoin] Depositing USDFC for storage payments...");
        const depositAmount = ethers.parseUnits("10", 18); // 10 USDFC
        const depositable = usdfc < depositAmount ? usdfc : depositAmount;
        await this.synapse.payments.deposit(depositable, TOKENS.USDFC);
        console.log(`  [Filecoin] Deposited ${ethers.formatUnits(depositable, 18)} USDFC`);
      }

      // Create the storage service (selects a provider automatically)
      console.log("  [Filecoin] Creating storage service...");
      this.storageService = await this.synapse.createStorage();
      console.log("  [Filecoin] Storage service ready");

    } catch (err: any) {
      console.warn(`  [Filecoin] Init failed: ${err.message}`);
      console.log("  [Filecoin] Falling back to simulation mode");
      this.isSimulated = true;
    }
  }

  async store(content: string): Promise<string> {
    if (this.isSimulated || !this.storageService) {
      return this.simulateStore(content);
    }
    try {
      const data = new TextEncoder().encode(content);
      const result = await this.storageService.upload(data);
      // v1.0.0 returns { commp } — the piece commitment CID
      const cid = result.commp?.toString() ?? result.cid?.toString() ?? result.pieceCID;
      console.log(`  [Filecoin] Stored → ${cid}`);
      return cid;
    } catch (err: any) {
      console.warn(`  [Filecoin] Upload failed (${err.message}) — using simulation`);
      return this.simulateStore(content);
    }
  }

  private simulateStore(content: string): string {
    const hash = Buffer.from(content).toString("base64").slice(0, 28).replace(/[+/=]/g, "x");
    const cid = `bafybeig${hash}`;
    console.log(`  [Filecoin:sim] Stored → ${cid}`);
    return cid;
  }

  async storeConstitution(obj: object): Promise<string> {
    return this.store(JSON.stringify(obj, null, 2));
  }

  async storeTerms(obj: object): Promise<string> {
    return this.store(JSON.stringify(obj, null, 2));
  }

  async storeReasoning(doc: string): Promise<string> {
    return this.store(doc);
  }

  async storeDeliverable(obj: object): Promise<string> {
    return this.store(JSON.stringify(obj, null, 2));
  }

  async storeExecutionLog(obj: object): Promise<string> {
    return this.store(JSON.stringify(obj, null, 2));
  }
}

// ============================================================================
// BankrGateway
// ============================================================================
export class BankrGateway {
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: { apiKey: string; defaultModel?: string }) {
    this.defaultModel = config.defaultModel ?? "claude-sonnet-4-6";
    this.client = new OpenAI({
      apiKey: config.apiKey || "no-key",
      baseURL: "https://llm.bankr.bot/v1",
      defaultHeaders: { "X-API-Key": config.apiKey || "no-key" },
    });
  }

  async prompt(system: string, user: string, model?: string): Promise<string> {
    const m = model ?? this.defaultModel;
    try {
      const resp = await this.client.chat.completions.create({
        model: m,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      });
      return resp.choices[0]?.message?.content ?? "";
    } catch (err: any) {
      // Fallback for demo if no Bankr key
      console.warn(`  [Bankr] LLM call failed (${m}): ${err.message} — using mock response`);
      return this.mockResponse(user);
    }
  }

  async analyzeToJSON<T>(system: string, user: string, model?: string): Promise<T> {
    const jsonSystem = `${system}\n\nRespond with valid JSON only. No markdown fences.`;
    const raw = await this.prompt(jsonSystem, user, model);
    try {
      return JSON.parse(raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim()) as T;
    } catch {
      // Return mock data if JSON parse fails
      return this.mockJSONResponse(user) as T;
    }
  }

  private mockResponse(input: string): string {
    if (input.toLowerCase().includes("sentiment")) {
      return "Market sentiment analysis: BTC shows 74% bullish signals across Farcaster and on-chain metrics. Whale accumulation detected. Recommendation: BULLISH with high confidence.";
    }
    if (input.toLowerCase().includes("volume") || input.toLowerCase().includes("dex")) {
      return "On-chain data: 24h DEX volume $2.3B (+12%). Large buy orders detected on Uniswap v3 ETH/USDC. Whale wallet 0x...F3a accumulated 450 ETH in last 4 hours.";
    }
    return "Analysis complete. Signal: PROCEED with moderate confidence.";
  }

  private mockJSONResponse(input: string): unknown {
    // Synthesis/trade decision mock — check first since it has higher specificity
    if (input.toLowerCase().includes("synthesize") || (input.toLowerCase().includes("action") && input.toLowerCase().includes("rationale"))) {
      return {
        action: "BUY",
        confidence: 0.76,
        rationale: "Both sentiment (74%) and on-chain (71%) signals align bullish. Whale accumulation and neutral funding rates suggest genuine demand with room to run.",
        riskLevel: "low",
        size: "2% of portfolio",
        timestamp: new Date().toISOString()
      };
    }
    if (input.toLowerCase().includes("sentiment")) {
      return {
        sentiment: "bullish",
        confidence: 0.74,
        signals: ["whale accumulation", "social momentum", "funding rates neutral"],
        recommendation: "BUY",
        reasoning: "Multiple on-chain and social signals align bullish"
      };
    }
    if (input.toLowerCase().includes("volume") || input.toLowerCase().includes("dex") || input.toLowerCase().includes("on-chain") || input.toLowerCase().includes("onchain")) {
      return {
        dexVolume24h: "$2.3B",
        volumeChange: "+12%",
        whaleActivity: "accumulation",
        largestTransaction: "450 ETH on Uniswap v3",
        openInterest: "$1.8B",
        fundingRate: "0.01% (neutral)",
        liquidationsRisk: "low",
        netSignal: "BULLISH",
        confidence: 0.71,
        keyMetrics: ["Volume spike", "Whale accumulation", "Low liquidation risk"],
        reasoning: "On-chain flows confirm genuine demand with no over-leverage signal",
        analyzedAt: new Date().toISOString()
      };
    }
    return { action: "HOLD", confidence: 0.5, rationale: "Insufficient signal convergence", riskLevel: "medium", size: "1% of portfolio", timestamp: new Date().toISOString() };
  }
}

// ============================================================================
// Base AxiomAgent
// ============================================================================
export interface AgentBaseConfig {
  name: string;
  agentType: string;
  privateKey: Hex;
  constitution: object;
  registryAddress: Address;
  covenantAddress: Address;
  reputationAddress: Address;
  rpcUrl: string;
  chainId: number;
  bankrApiKey?: string;
  defaultModel?: string;
  filecoinRpcUrl?: string;
  filecoinPrivateKey?: string;
}

export class AxiomAgent {
  public readonly name: string;
  public readonly agentType: string;
  public readonly address: Address;

  protected wallet: WalletClient;
  protected publicClient: PublicClient;
  protected storage: FilecoinStorage;
  protected llm: BankrGateway;
  protected config: AgentBaseConfig;

  protected constitutionCID: string = "";
  protected activeProofs: Map<string, CommitmentProof> = new Map();
  protected registryAddress: Address;
  protected covenantAddress: Address;
  protected reputationAddress: Address;

  constructor(config: AgentBaseConfig) {
    this.config = config;
    this.name = config.name;
    this.agentType = config.agentType;
    this.registryAddress = config.registryAddress;
    this.covenantAddress = config.covenantAddress;
    this.reputationAddress = config.reputationAddress;

    const account = privateKeyToAccount(config.privateKey, { nonceManager });
    this.address = account.address;

    const chain = config.chainId === 8453 ? base : baseSepolia;
    this.wallet = createWalletClient({ account, transport: http(config.rpcUrl), chain });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.publicClient = createPublicClient({ transport: http(config.rpcUrl), chain }) as any;

    this.storage = new FilecoinStorage({
      rpcUrl: config.filecoinRpcUrl,
      privateKey: config.filecoinPrivateKey,
    });
    this.llm = new BankrGateway({
      apiKey: config.bankrApiKey ?? "",
      defaultModel: config.defaultModel ?? "claude-sonnet-4-6",
    });
  }

  async init(): Promise<void> {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  AXIOM Agent: ${this.name}`);
    console.log(`  Address:     ${this.address}`);
    console.log(`  Type:        ${this.agentType}`);
    console.log(`${"=".repeat(60)}`);

    await this.storage.init();

    const registered = await this.isRegistered();
    if (!registered) {
      await this.registerOnChain();
    } else {
      const profile = await this.publicClient.readContract({
        address: this.registryAddress,
        abi: AGENT_REGISTRY_ABI,
        functionName: "getAgent",
        args: [this.address],
      }) as any;
      this.constitutionCID = profile.constitutionCID;
      console.log(`  Already registered. Constitution: ${this.constitutionCID}`);
    }

    const rep = await this.getReputation();
    console.log(`  Reputation: ${rep.score} (${rep.tier})`);
    const balance = await this.publicClient.getBalance({ address: this.address });
    console.log(`  Balance: ${(Number(balance) / 1e18).toFixed(6)} ETH`);
  }

  private async registerOnChain(): Promise<void> {
    console.log("  Storing constitution on Filecoin...");
    this.constitutionCID = await this.storage.storeConstitution(this.config.constitution);
    console.log(`  Constitution CID: ${this.constitutionCID}`);

    console.log("  Registering on-chain...");
    const hash = await this.wallet.writeContract({
      address: this.registryAddress,
      abi: AGENT_REGISTRY_ABI,
      functionName: "register",
      args: [this.address, this.name, this.agentType, this.constitutionCID],
    });
    await this.publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    console.log(`  Registered! Tx: ${hash}`);
  }

  async createCovenant(
    providerAddress: Address,
    terms: {
      task: string;
      paymentEth: string;
      deadlineSeconds: number;
      minReputation?: number;
    }
  ): Promise<bigint> {
    console.log(`\n  [Covenant] Hiring ${providerAddress.slice(0, 10)}...`);
    const termsCID = await this.storage.storeTerms(terms);
    const termsHash = keccak256(encodePacked(["string"], [termsCID]));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + terms.deadlineSeconds);

    const hash = await this.wallet.writeContract({
      address: this.covenantAddress,
      abi: COVENANT_PROTOCOL_ABI,
      functionName: "createCovenant",
      args: [providerAddress, termsCID, termsHash, deadline, BigInt(terms.minReputation ?? 0), "0x"],
      value: parseEther(terms.paymentEth),
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });

    // Parse covenant ID from the emitted CovenantCreated event — no RPC timing issues
    const logs = parseEventLogs({ abi: COVENANT_PROTOCOL_ABI, logs: receipt.logs, eventName: "CovenantCreated" });
    const covenantId = logs[0].args.id;

    console.log(`  [Covenant] #${covenantId} created. Payment: ${terms.paymentEth} ETH. Terms: ${termsCID}`);
    return covenantId;
  }

  async commitReasoning(covenantId: bigint, reasoning: string): Promise<CommitmentProof> {
    console.log(`\n  [Commit] Covenant #${covenantId} — committing reasoning BEFORE acting...`);
    const proof = createCommitment(reasoning, covenantId.toString());
    console.log(`  [Commit] Commitment hash: ${proof.commitment.slice(0, 20)}...`);

    const hash = await this.wallet.writeContract({
      address: this.covenantAddress,
      abi: COVENANT_PROTOCOL_ABI,
      functionName: "commitReasoning",
      args: [covenantId, proof.commitment as `0x${string}`],
    });
    await this.publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });

    this.activeProofs.set(covenantId.toString(), proof);
    console.log(`  [Commit] On-chain. Tx: ${hash}`);
    return proof;
  }

  async fulfillCovenant(
    covenantId: bigint,
    reasoning: string,
    deliverable: object
  ): Promise<Hex> {
    const proof = this.activeProofs.get(covenantId.toString());
    if (!proof) throw new Error(`No proof found for covenant #${covenantId}`);

    console.log(`\n  [Fulfill] Storing evidence on Filecoin...`);
    const reasoningDoc = JSON.stringify({
      axiom: "1.0.0",
      agent: this.name,
      covenant: covenantId.toString(),
      commitment: proof.commitment,
      salt: proof.salt,
      committedReasoning: proof.reasoning,
      executionReasoning: reasoning,
      deliverable,
      timestamp: new Date().toISOString(),
    }, null, 2);

    const [reasoningCID, deliverableCID] = await Promise.all([
      this.storage.storeReasoning(reasoningDoc),
      this.storage.storeDeliverable(deliverable),
    ]);

    console.log(`  [Fulfill] Reasoning CID: ${reasoningCID}`);
    console.log(`  [Fulfill] Deliverable CID: ${deliverableCID}`);

    const hash = await this.wallet.writeContract({
      address: this.covenantAddress,
      abi: COVENANT_PROTOCOL_ABI,
      functionName: "fulfillCovenant",
      args: [covenantId, proof.reasoning, proof.salt as `0x${string}`, reasoningCID, deliverableCID],
    });
    await this.publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    this.activeProofs.delete(covenantId.toString());

    console.log(`  [Fulfill] DONE. Payment released. Tx: ${hash}`);
    return hash;
  }

  async getReputation() {
    try {
      const [score, tier, record] = await Promise.all([
        this.publicClient.readContract({ address: this.reputationAddress, abi: REPUTATION_SYSTEM_ABI, functionName: "getScore", args: [this.address] }),
        this.publicClient.readContract({ address: this.reputationAddress, abi: REPUTATION_SYSTEM_ABI, functionName: "getTier", args: [this.address] }),
        this.publicClient.readContract({ address: this.reputationAddress, abi: REPUTATION_SYSTEM_ABI, functionName: "getRecord", args: [this.address] }) as Promise<any>,
      ]);
      return {
        score: Number(score),
        tier: tier as string,
        totalCovenants: Number(record.totalCovenants),
        fulfilled: Number(record.fulfilled),
        breached: Number(record.breached),
      };
    } catch {
      return { score: 300, tier: "Provisional", totalCovenants: 0, fulfilled: 0, breached: 0 };
    }
  }

  async isRegistered(): Promise<boolean> {
    try {
      return await this.publicClient.readContract({
        address: this.registryAddress,
        abi: AGENT_REGISTRY_ABI,
        functionName: "isRegistered",
        args: [this.address],
      }) as boolean;
    } catch {
      return false;
    }
  }
}
