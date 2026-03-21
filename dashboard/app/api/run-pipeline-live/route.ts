export const runtime = "nodejs";
export const maxDuration = 300;

import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  keccak256,
  encodePacked,
  decodeEventLog,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// ── ABI ───────────────────────────────────────────────────────────────────────
const COVENANT_ABI = [
  { name: "createCovenant", type: "function", inputs: [
    { name: "provider", type: "address" },
    { name: "termsCID", type: "string" },
    { name: "termsHash", type: "string" },
    { name: "deadline", type: "uint256" },
    { name: "minReputationRequired", type: "uint256" },
    { name: "delegationData", type: "bytes" },
  ], outputs: [{ type: "uint256" }], stateMutability: "payable" },
  { name: "commitReasoning", type: "function", inputs: [
    { name: "id", type: "uint256" },
    { name: "reasoningCommitment", type: "bytes32" },
  ], outputs: [], stateMutability: "nonpayable" },
  { name: "fulfillCovenant", type: "function", inputs: [
    { name: "id", type: "uint256" },
    { name: "reasoning", type: "string" },
    { name: "salt", type: "bytes32" },
    { name: "reasoningCID", type: "string" },
    { name: "deliverableCID", type: "string" },
  ], outputs: [], stateMutability: "nonpayable" },
  { name: "getCovenant", type: "function", inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "id", type: "uint256" }, { name: "requester", type: "address" },
      { name: "provider", type: "address" }, { name: "termsHash", type: "string" },
      { name: "termsCID", type: "string" }, { name: "paymentAmount", type: "uint256" },
      { name: "deadline", type: "uint256" }, { name: "state", type: "uint8" },
      { name: "reasoningCommitment", type: "bytes32" }, { name: "reasoningCID", type: "string" },
      { name: "deliverableCID", type: "string" }, { name: "createdAt", type: "uint256" },
      { name: "committedAt", type: "uint256" }, { name: "fulfilledAt", type: "uint256" },
      { name: "delegationData", type: "bytes" }, { name: "minReputationRequired", type: "uint256" },
    ]}], stateMutability: "view" },
] as const;

const COVENANT_CREATED_EVENT = parseAbi(["event CovenantCreated(uint256 indexed id, address indexed requester, address indexed provider, uint256 paymentAmount, uint256 deadline, string termsCID)"]);

const COVENANT_ADDRESS = (
  process.env.COVENANT_PROTOCOL_ADDRESS ?? "0x75E42505e9Dc81eb85EFF8E00285CBCf176F7E74"
) as Address;

const CG_IDS: Record<string, string> = {
  ETH: "ethereum", BTC: "bitcoin", SOL: "solana", ARB: "arbitrum",
  OP: "optimism", MATIC: "matic-network", LINK: "chainlink",
  AVAX: "avalanche-2", DOGE: "dogecoin", PEPE: "pepe", WIF: "dogwifcoin",
};

async function fetchMarketData(asset: string): Promise<string> {
  try {
    const id = CG_IDS[asset.toUpperCase()] ?? asset.toLowerCase();
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return "";
    const data = await res.json();
    const d = data[id];
    if (!d) return "";
    const price  = d.usd != null           ? `$${Number(d.usd).toLocaleString()}` : "N/A";
    const change = d.usd_24h_change != null ? `${d.usd_24h_change > 0 ? "+" : ""}${d.usd_24h_change.toFixed(2)}%` : "N/A";
    const vol    = d.usd_24h_vol != null    ? `$${(d.usd_24h_vol / 1e9).toFixed(2)}B` : "N/A";
    return `\nLIVE MARKET DATA (CoinGecko):\n  Price: ${price}  |  24h: ${change}  |  Volume: ${vol}\n`;
  } catch { return ""; }
}

function makeCommitment(reasoning: string, salt: Hex): Hex {
  return keccak256(encodePacked(["string", "bytes32"], [reasoning, salt]));
}

function randomSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

function parseCovenantId(logs: readonly { data: Hex; topics: readonly Hex[] }[]): bigint | null {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: COVENANT_CREATED_EVENT,
        data: log.data,
        topics: log.topics as any,
      }) as any;
      if (decoded?.eventName === "CovenantCreated") return BigInt(decoded.args?.id ?? 0);
    } catch {}
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const covenantId = BigInt(searchParams.get("covenantId") ?? "0");
  const asset = (searchParams.get("asset") ?? "ETH").toUpperCase();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };

      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        const line = args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ") + "\n";
        send({ line });
        originalLog(...args);
      };

      try {
        const { AGENT_KEYS } = await import("@/src/lib/agents/config");
        const { BankrGateway, FilecoinStorage } = await import("@/src/lib/agents/AxiomAgent");

        // ── Resolve keys ──────────────────────────────────────────────────────
        const rawNexus     = process.env.NEXUS_AGENT_PRIVATE_KEY!;
        const rawSentinel  = process.env.SENTIMENT_AGENT_PRIVATE_KEY!;
        const rawChainEye  = process.env.ONCHAIN_AGENT_PRIVATE_KEY!;

        if (!rawNexus || rawNexus.length < 10)     throw new Error("NEXUS_AGENT_PRIVATE_KEY not set");
        if (!rawSentinel || rawSentinel.length < 10) throw new Error("SENTIMENT_AGENT_PRIVATE_KEY not set");
        if (!rawChainEye || rawChainEye.length < 10) throw new Error("ONCHAIN_AGENT_PRIVATE_KEY not set");

        const nexusKey     = (rawNexus.startsWith("0x")    ? rawNexus    : `0x${rawNexus}`)    as `0x${string}`;
        const sentinelKey  = (rawSentinel.startsWith("0x") ? rawSentinel : `0x${rawSentinel}`) as `0x${string}`;
        const chainEyeKey  = (rawChainEye.startsWith("0x") ? rawChainEye : `0x${rawChainEye}`) as `0x${string}`;

        const nexusAccount    = privateKeyToAccount(nexusKey);
        const sentinelAccount = privateKeyToAccount(sentinelKey);
        const chainEyeAccount = privateKeyToAccount(chainEyeKey);

        const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
        const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });

        const nexusWallet    = createWalletClient({ account: nexusAccount,    chain: baseSepolia, transport: http(rpcUrl) });
        const sentinelWallet = createWalletClient({ account: sentinelAccount, chain: baseSepolia, transport: http(rpcUrl) });
        const chainEyeWallet = createWalletClient({ account: chainEyeAccount, chain: baseSepolia, transport: http(rpcUrl) });

        const llm     = new BankrGateway({ apiKey: process.env.BANKR_LLM_KEY ?? "" });
        const storage = new FilecoinStorage({
          rpcUrl:     process.env.FILECOIN_RPC_URL,
          privateKey: process.env.FILECOIN_PRIVATE_KEY as `0x${string}` | undefined,
        });
        await storage.init();

        const txHashes: Record<string, string> = {};

        // ── Pre-flight: verify covenant provider == nexusAccount ──────────────
        console.log(`\n[Nexus-1] Verifying covenant #${covenantId} provider…\n`);
        try {
          const cov = await publicClient.readContract({
            address: COVENANT_ADDRESS,
            abi: COVENANT_ABI,
            functionName: "getCovenant",
            args: [covenantId],
          }) as any;

          const expectedProvider = (cov.provider as string).toLowerCase();
          const nexusAddr = nexusAccount.address.toLowerCase();
          const isOpenCovenant = expectedProvider === "0x0000000000000000000000000000000000000000";

          if (!isOpenCovenant && expectedProvider !== nexusAddr) {
            console.log(`\n⚠  Provider mismatch detected\n`);
            console.log(`   Covenant #${covenantId} provider: ${cov.provider}\n`);
            console.log(`   Nexus-1 address:                 ${nexusAccount.address}\n`);
            console.log(`\n   This covenant was assigned to a different agent.\n`);
            console.log(`   Please create a new covenant via "Run Pipeline" button.\n`);
            send({ done: true, code: 1 });
            return;
          }

          if (isOpenCovenant) {
            console.log(`  [info] Open covenant (no specific provider assigned) — Nexus-1 will claim it.\n`);
          }

          const stateNum = Number(cov.state);
          if (stateNum === 2) {
            console.log(`\nCovenant #${covenantId} is already FULFILLED.\n`);
            send({ done: true, code: 0, result: { alreadyFulfilled: true } });
            return;
          }
          if (stateNum > 2) {
            console.log(`\nCovenant #${covenantId} is in terminal state (${["OPEN","COMMITTED","FULFILLED","BREACHED","CANCELLED"][stateNum] ?? stateNum}). Cannot fulfill.\n`);
            send({ done: true, code: 1 });
            return;
          }
        } catch (checkErr) {
          console.log(`  [warn] Could not pre-check covenant state: ${checkErr instanceof Error ? checkErr.message : checkErr}\n`);
        }

        // ── STEP 1: Nexus-1 commitReasoning on main covenant ──────────────────
        console.log(`\n[Nexus-1] [Commit] Pre-committing reasoning on covenant #${covenantId} before any analysis…\n`);
        const nexusMainReasoning = `Nexus-1 orchestrating pipeline for ${asset} on covenant #${covenantId}. Will delegate to Sentinel-1 and ChainEye-1 sub-agents.`;
        const nexusMainSalt = randomSalt();
        const nexusMainCommitment = makeCommitment(nexusMainReasoning, nexusMainSalt);
        console.log(`  [Commit] Commitment hash: ${nexusMainCommitment.slice(0, 22)}…\n`);

        const commitMainHash = await nexusWallet.writeContract({
          address: COVENANT_ADDRESS,
          abi: COVENANT_ABI,
          functionName: "commitReasoning",
          args: [covenantId, nexusMainCommitment],
        });
        txHashes.nexusCommit = commitMainHash;
        console.log(`  [Commit] [Tx] Nexus-1 commit tx: ${commitMainHash}\n`);
        await publicClient.waitForTransactionReceipt({ hash: commitMainHash });
        console.log(`  [Commit] Confirmed on-chain.\n`);

        // ── STEP 2: Nexus-1 creates sub-covenant for Sentinel-1 ───────────────
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
        const sentinelTermsCID = `bafybeisim${asset.toLowerCase()}sentinel1terms${covenantId}`;
        console.log(`\n[Nexus-1] [Tx] Creating sub-covenant for Sentinel-1 (0.0001 ETH)…\n`);
        const sentinelCovHash = await nexusWallet.writeContract({
          address: COVENANT_ADDRESS,
          abi: COVENANT_ABI,
          functionName: "createCovenant",
          args: [sentinelAccount.address, sentinelTermsCID, sentinelTermsCID, deadline, 0n, "0x" as `0x${string}`],
          value: parseEther("0.0001"),
        });
        txHashes.sentinelCreate = sentinelCovHash;
        console.log(`  [Tx] Sentinel-1 sub-covenant tx: ${sentinelCovHash}\n`);
        const sentinelCreateReceipt = await publicClient.waitForTransactionReceipt({ hash: sentinelCovHash });
        const sentinelCovId = parseCovenantId(sentinelCreateReceipt.logs as any) ?? 0n;
        console.log(`  [Tx] Sentinel-1 sub-covenant ID: #${sentinelCovId}\n`);

        // ── STEP 3: Nexus-1 creates sub-covenant for ChainEye-1 ───────────────
        const chainEyeTermsCID = `bafybeisim${asset.toLowerCase()}chaineye1terms${covenantId}`;
        console.log(`\n[Nexus-1] [Tx] Creating sub-covenant for ChainEye-1 (0.0001 ETH)…\n`);
        const chainEyeCovHash = await nexusWallet.writeContract({
          address: COVENANT_ADDRESS,
          abi: COVENANT_ABI,
          functionName: "createCovenant",
          args: [chainEyeAccount.address, chainEyeTermsCID, chainEyeTermsCID, deadline, 0n, "0x" as `0x${string}`],
          value: parseEther("0.0001"),
        });
        txHashes.chainEyeCreate = chainEyeCovHash;
        console.log(`  [Tx] ChainEye-1 sub-covenant tx: ${chainEyeCovHash}\n`);
        const chainEyeCreateReceipt = await publicClient.waitForTransactionReceipt({ hash: chainEyeCovHash });
        const chainEyeCovId = parseCovenantId(chainEyeCreateReceipt.logs as any) ?? 0n;
        console.log(`  [Tx] ChainEye-1 sub-covenant ID: #${chainEyeCovId}\n`);

        // ── STEP 4: Sentinel-1 commitReasoning on sub-covenant ────────────────
        console.log(`\n[Sentinel-1] [Commit] Pre-committing reasoning on sub-covenant #${sentinelCovId}…\n`);
        const sentinelReasoning = `Sentinel-1 sentiment analysis for ${asset} on sub-covenant #${sentinelCovId}. Committing methodology before execution.`;
        const sentinelSalt = randomSalt();
        const sentinelCommitment = makeCommitment(sentinelReasoning, sentinelSalt);
        console.log(`  [Commit] Commitment hash: ${sentinelCommitment.slice(0, 22)}…\n`);

        const sentinelCommitHash = await sentinelWallet.writeContract({
          address: COVENANT_ADDRESS,
          abi: COVENANT_ABI,
          functionName: "commitReasoning",
          args: [sentinelCovId, sentinelCommitment],
        });
        txHashes.sentinelCommit = sentinelCommitHash;
        console.log(`  [Commit] [Tx] Sentinel-1 commit tx: ${sentinelCommitHash}\n`);
        await publicClient.waitForTransactionReceipt({ hash: sentinelCommitHash });
        console.log(`  [Commit] Confirmed on-chain.\n`);

        // ── STEP 5: ChainEye-1 commitReasoning on sub-covenant ────────────────
        console.log(`\n[ChainEye-1] [Commit] Pre-committing reasoning on sub-covenant #${chainEyeCovId}…\n`);
        const chainEyeReasoning = `ChainEye-1 on-chain data analysis for ${asset} on sub-covenant #${chainEyeCovId}. Committing methodology before execution.`;
        const chainEyeSalt = randomSalt();
        const chainEyeCommitment = makeCommitment(chainEyeReasoning, chainEyeSalt);
        console.log(`  [Commit] Commitment hash: ${chainEyeCommitment.slice(0, 22)}…\n`);

        const chainEyeCommitHash = await chainEyeWallet.writeContract({
          address: COVENANT_ADDRESS,
          abi: COVENANT_ABI,
          functionName: "commitReasoning",
          args: [chainEyeCovId, chainEyeCommitment],
        });
        txHashes.chainEyeCommit = chainEyeCommitHash;
        console.log(`  [Commit] [Tx] ChainEye-1 commit tx: ${chainEyeCommitHash}\n`);
        await publicClient.waitForTransactionReceipt({ hash: chainEyeCommitHash });
        console.log(`  [Commit] Confirmed on-chain.\n`);

        // ── STEP 6: Sentinel-1 runs LLM analysis ─────────────────────────────
        console.log(`\n[Sentinel-1] Running sentiment analysis for ${asset} via Bankr LLM…\n`);
        const marketCtxSentinel = await fetchMarketData(asset);
        const sentimentRaw = await llm.analyzeToJSON<Record<string, any>>(
          "You are Sentinel-1, an AXIOM sentiment agent.",
          `Analyze ${asset} sentiment.${marketCtxSentinel}Return JSON: { "sentiment": "bullish|bearish|neutral", "confidence": 0-1, "recommendation": "BUY|SELL|HOLD", "socialScore": 0-100, "onchainScore": 0-100, "reasoning": "string" }`
        );
        const sentiment   = sentimentRaw.sentiment      ?? "neutral";
        const sentConf    = Number(sentimentRaw.confidence ?? 0.65);
        const rec         = sentimentRaw.recommendation  ?? "HOLD";
        const social      = Number(sentimentRaw.socialScore  ?? sentimentRaw.social_score  ?? 65);
        const onchainScr  = Number(sentimentRaw.onchainScore ?? sentimentRaw.onchain_score ?? 65);
        console.log(`\n[Sentinel-1] Analysis complete:\n  Asset:          ${asset}\n  Sentiment:      ${sentiment} (${(sentConf*100).toFixed(0)}% confidence)\n  Recommendation: ${rec}\n  Social Score:   ${social}/100  |  Onchain Score: ${onchainScr}/100\n`);

        const sentinelDeliverableCID = await storage.storeReasoning(JSON.stringify({ agent: "Sentinel-1", covenant: sentinelCovId.toString(), asset, result: sentimentRaw }));
        const sentinelReasoningCID   = await storage.storeReasoning(sentinelReasoning);

        // ── STEP 7: Sentinel-1 fulfillCovenant on sub-covenant ───────────────
        console.log(`\n[Sentinel-1] [Fulfill] Fulfilling sub-covenant #${sentinelCovId}…\n`);
        const sentinelFulfillHash = await sentinelWallet.writeContract({
          address: COVENANT_ADDRESS,
          abi: COVENANT_ABI,
          functionName: "fulfillCovenant",
          args: [sentinelCovId, sentinelReasoning, sentinelSalt, sentinelReasoningCID, sentinelDeliverableCID],
        });
        txHashes.sentinelFulfill = sentinelFulfillHash;
        console.log(`  [Fulfill] [Tx] Sentinel-1 fulfill tx: ${sentinelFulfillHash}\n`);
        await publicClient.waitForTransactionReceipt({ hash: sentinelFulfillHash });
        console.log(`  [Fulfill] DONE. Reasoning revealed — hash matched on-chain. Payment released to Sentinel-1.\n`);

        // ── STEP 8: ChainEye-1 runs LLM analysis ─────────────────────────────
        console.log(`\n[ChainEye-1] Analyzing on-chain data for ${asset} via Bankr LLM…\n`);
        const marketCtxChainEye = await fetchMarketData(asset);
        const onchainRaw = await llm.analyzeToJSON<Record<string, any>>(
          "You are ChainEye-1, an AXIOM on-chain data agent.",
          `Analyze ${asset} on-chain.${marketCtxChainEye}Return JSON: { "dexVolume24h": "string", "volumeChange": "string", "whaleActivity": "accumulation|distribution|neutral", "fundingRate": "string", "liquidationsRisk": "high|medium|low", "netSignal": "BULLISH|BEARISH|NEUTRAL", "confidence": 0-1 }`
        );
        const signal     = onchainRaw.netSignal    ?? onchainRaw.net_signal    ?? "NEUTRAL";
        const chainConf  = Number(onchainRaw.confidence ?? 0.65);
        const vol        = onchainRaw.dexVolume24h  ?? onchainRaw.dex_volume_24h ?? "$1B";
        const volChange  = onchainRaw.volumeChange  ?? onchainRaw.volume_change  ?? "+0%";
        const whale      = onchainRaw.whaleActivity ?? onchainRaw.whale_activity ?? "neutral";
        console.log(`\n[ChainEye-1] Analysis complete:\n  Asset:            ${asset}\n  DEX Volume:       ${vol} (${volChange})\n  Whale Activity:   ${whale}\n  Net Signal:       ${signal} (${(chainConf*100).toFixed(0)}% confidence)\n`);

        const chainEyeDeliverableCID = await storage.storeReasoning(JSON.stringify({ agent: "ChainEye-1", covenant: chainEyeCovId.toString(), asset, result: onchainRaw }));
        const chainEyeReasoningCID   = await storage.storeReasoning(chainEyeReasoning);

        // ── STEP 9: ChainEye-1 fulfillCovenant on sub-covenant ───────────────
        console.log(`\n[ChainEye-1] [Fulfill] Fulfilling sub-covenant #${chainEyeCovId}…\n`);
        const chainEyeFulfillHash = await chainEyeWallet.writeContract({
          address: COVENANT_ADDRESS,
          abi: COVENANT_ABI,
          functionName: "fulfillCovenant",
          args: [chainEyeCovId, chainEyeReasoning, chainEyeSalt, chainEyeReasoningCID, chainEyeDeliverableCID],
        });
        txHashes.chainEyeFulfill = chainEyeFulfillHash;
        console.log(`  [Fulfill] [Tx] ChainEye-1 fulfill tx: ${chainEyeFulfillHash}\n`);
        await publicClient.waitForTransactionReceipt({ hash: chainEyeFulfillHash });
        console.log(`  [Fulfill] DONE. Reasoning revealed — hash matched on-chain. Payment released to ChainEye-1.\n`);

        // ── STEP 10: Nexus-1 synthesizes both results via LLM ─────────────────
        console.log(`\n[Nexus-1] Synthesizing verified sub-agent results via Bankr LLM…\n`);
        const synthesisRaw = await llm.analyzeToJSON<Record<string, any>>(
          "You are Nexus-1, AXIOM orchestrator. Given verified sub-agent results, make a final trading decision.",
          `Sub-agent results for ${asset}:\n\nSentinel-1 (sentiment): ${JSON.stringify({ sentiment, confidence: sentConf, recommendation: rec, socialScore: social, onchainScore: onchainScr })}\n\nChainEye-1 (on-chain): ${JSON.stringify({ netSignal: signal, confidence: chainConf, dexVolume24h: vol, whaleActivity: whale })}\n\nReturn JSON: { "action": "BUY|SELL|HOLD", "confidence": 0-1, "rationale": "string", "riskLevel": "low|medium|high", "suggestedSize": "string" }`
        );
        const action       = (synthesisRaw.action       ?? "HOLD").toUpperCase();
        const finalConf    = Number(synthesisRaw.confidence ?? 0.65);
        const rationale    = synthesisRaw.rationale    ?? "";
        const riskLevel    = synthesisRaw.riskLevel    ?? synthesisRaw.risk_level    ?? "medium";
        const suggestedSize = synthesisRaw.suggestedSize ?? synthesisRaw.suggested_size ?? "1-3% portfolio";
        console.log(`\n[Nexus-1] Synthesis complete:\n  DECISION: ${action}  ${asset}\n  Confidence: ${(finalConf*100).toFixed(0)}%  |  Risk: ${riskLevel}  |  Size: ${suggestedSize}\n  Rationale: ${rationale.slice(0, 120)}…\n`);

        // ── STEP 11: Nexus-1 stores synthesis on Filecoin ────────────────────
        console.log(`\n[Nexus-1] Storing synthesis + full pipeline audit on Filecoin…\n`);
        const nexusSynthesisCID = await storage.storeReasoning(JSON.stringify({
          agent: "Nexus-1", covenant: covenantId.toString(), asset,
          sentimentResult: { sentiment, confidence: sentConf, recommendation: rec },
          onchainResult: { netSignal: signal, confidence: chainConf, dexVolume24h: vol, whaleActivity: whale },
          decision: { action, confidence: finalConf, rationale, riskLevel, suggestedSize },
          subCovenants: { sentinelId: sentinelCovId.toString(), chainEyeId: chainEyeCovId.toString() },
          txHashes,
        }));
        const nexusReasoningCID = await storage.storeReasoning(nexusMainReasoning);
        console.log(`  Filecoin synthesis CID: ${nexusSynthesisCID}\n`);

        // ── STEP 12: Nexus-1 fulfillCovenant on main covenant ─────────────────
        console.log(`\n[Nexus-1] [Fulfill] Fulfilling main covenant #${covenantId} with full reasoning reveal…\n`);
        const nexusFulfillHash = await nexusWallet.writeContract({
          address: COVENANT_ADDRESS,
          abi: COVENANT_ABI,
          functionName: "fulfillCovenant",
          args: [covenantId, nexusMainReasoning, nexusMainSalt, nexusReasoningCID, nexusSynthesisCID],
        });
        txHashes.nexusFulfill = nexusFulfillHash;
        console.log(`  [Fulfill] [Tx] Nexus-1 fulfill tx: ${nexusFulfillHash}\n`);
        await publicClient.waitForTransactionReceipt({ hash: nexusFulfillHash });
        console.log(`  [Fulfill] DONE. Reasoning revealed — hash matched on-chain. Payment released to Nexus-1.\n`);
        console.log(`\n✓ Pipeline complete. Full audit stored on Filecoin.\n`);

        // ── STEP 13: Done ─────────────────────────────────────────────────────
        send({
          done: true,
          code: 0,
          result: {
            decision: { action, confidence: finalConf, rationale, riskLevel, suggestedSize },
            sentimentResult: { sentiment, confidence: sentConf, recommendation: rec, socialScore: social, onchainScore: onchainScr },
            onchainResult: { netSignal: signal, confidence: chainConf, dexVolume24h: vol, whaleActivity: whale },
            txHashes,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ line: `Error: ${msg}\n`, isError: true });
        send({ done: true, code: 1 });
      } finally {
        console.log = originalLog;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
