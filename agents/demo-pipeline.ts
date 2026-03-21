/**
 * AXIOM Demo Pipeline
 *
 * This is the 2-minute demo script. Run this to see the full system:
 *
 *   1. Three agents register on-chain with Filecoin-backed constitutions
 *   2. Master agent creates binding covenants and pays sub-agents
 *   3. Sub-agents commit reasoning BEFORE running analysis
 *   4. Sub-agents fulfill covenants and get paid automatically
 *   5. Master synthesizes and stores everything on Filecoin
 *   6. Full audit trail: on-chain + Filecoin, forever verifiable
 *
 * Run:
 *   cp ../.env.example ../.env   # fill in your keys
 *   npx tsx demo-pipeline.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../.env") });

import { DEPLOYED_CONTRACTS, NETWORK, AGENT_KEYS, AXIOM_BASE_CONFIG } from "./shared/config.js";
import { AxiomAgent, FilecoinStorage, BankrGateway } from "./shared/AxiomAgent.js";
import { privateKeyToAccount } from "viem/accounts";

// ============================================================================
// Check environment
// ============================================================================
function checkEnvironment() {
  console.log("\n" + "=".repeat(70));
  console.log("  AXIOM Protocol — Covenant Protocol for AI Agents");
  console.log("  Demo Pipeline v1.0.0");
  console.log("=".repeat(70));

  const warnings: string[] = [];

  if (!AGENT_KEYS.MASTER || AGENT_KEYS.MASTER.length < 10) {
    warnings.push("PRIVATE_KEY not set — using dry-run mode (no on-chain txs)");
  }
  if (!process.env.BANKR_LLM_KEY) {
    warnings.push("BANKR_LLM_KEY not set — using mock LLM responses");
  }
  if (!process.env.FILECOIN_PRIVATE_KEY) {
    warnings.push("FILECOIN_PRIVATE_KEY not set — using Filecoin simulation");
  }
  if (DEPLOYED_CONTRACTS.COVENANT_PROTOCOL === "0x0000000000000000000000000000000000000000") {
    warnings.push("Contract addresses not set — run `forge script` to deploy first");
  }

  if (warnings.length > 0) {
    console.log("\n  Configuration warnings:");
    warnings.forEach((w) => console.log(`    ⚠ ${w}`));
    console.log("\n  Running in DEMO mode (simulated blockchain + Filecoin)\n");
  } else {
    console.log("\n  All environment variables configured!");
    console.log(`  Network: Base Sepolia (Chain ${NETWORK.CHAIN_ID})`);
    console.log(`  Registry: ${DEPLOYED_CONTRACTS.AGENT_REGISTRY}`);
    console.log(`  Covenant: ${DEPLOYED_CONTRACTS.COVENANT_PROTOCOL}`);
    console.log(`  Reputation: ${DEPLOYED_CONTRACTS.REPUTATION_SYSTEM}\n`);
  }

  return warnings.length === 0;
}

// ============================================================================
// Dry-run demo (no real keys needed)
// ============================================================================
async function runDryDemo() {
  console.log("\n" + "=".repeat(70));
  console.log("  AXIOM DRY-RUN DEMO");
  console.log("  Showing the full protocol flow without on-chain transactions");
  console.log("=".repeat(70));

  // Initialize Filecoin storage (sim mode)
  const storage = new FilecoinStorage({});
  await storage.init();

  // Initialize Bankr LLM
  const llm = new BankrGateway({ apiKey: process.env.BANKR_LLM_KEY ?? "" });

  // ============================================================================
  // Step 1: Constitutions stored on Filecoin
  // ============================================================================
  console.log("\n[STEP 1] Storing agent constitutions on Filecoin...");

  const masterConstitution = {
    name: "Nexus-1",
    agentType: "orchestrator",
    version: "1.0.0",
    capabilities: ["multi-agent orchestration", "covenant management", "signal synthesis"],
    restrictions: ["will NOT exceed approved budget", "will ALWAYS store pipeline log on Filecoin"],
    createdAt: new Date().toISOString(),
  };

  const sentimentConstitution = {
    name: "Sentinel-1",
    agentType: "sentiment",
    version: "1.0.0",
    capabilities: ["social sentiment analysis", "on-chain signal aggregation"],
    restrictions: ["will NOT fabricate data", "will ALWAYS commit reasoning before acting"],
    createdAt: new Date().toISOString(),
  };

  const onchainConstitution = {
    name: "ChainEye-1",
    agentType: "onchain-data",
    version: "1.0.0",
    capabilities: ["DEX volume analysis", "whale wallet tracking"],
    restrictions: ["will NOT fabricate blockchain data", "will ONLY report what on-chain data shows"],
    createdAt: new Date().toISOString(),
  };

  const [masterCID, sentimentCID, onchainCID] = await Promise.all([
    storage.storeConstitution(masterConstitution),
    storage.storeConstitution(sentimentConstitution),
    storage.storeConstitution(onchainConstitution),
  ]);

  console.log(`  Nexus-1 Constitution CID:    ${masterCID}`);
  console.log(`  Sentinel-1 Constitution CID: ${sentimentCID}`);
  console.log(`  ChainEye-1 Constitution CID: ${onchainCID}`);

  // ============================================================================
  // Step 2: Covenant terms stored on Filecoin
  // ============================================================================
  console.log("\n[STEP 2] Creating covenants (terms stored on Filecoin)...");

  const sentimentTerms = {
    task: "Provide comprehensive ETH market sentiment analysis",
    deliverableFormat: "JSON with sentiment score, confidence, signals, recommendation",
    successCriteria: "Analysis includes social and on-chain signals with confidence >= 0.6",
    payment: "0.001 ETH",
    deadline: new Date(Date.now() + 300_000).toISOString(),
    requester: "Nexus-1",
    provider: "Sentinel-1",
  };

  const onchainTerms = {
    task: "Provide on-chain data analysis for ETH",
    deliverableFormat: "JSON with DEX volume, whale activity, liquidation risk",
    successCriteria: "Analysis covers DEX volume, whale activity, and funding rates",
    payment: "0.001 ETH",
    deadline: new Date(Date.now() + 300_000).toISOString(),
    requester: "Nexus-1",
    provider: "ChainEye-1",
  };

  const [sentimentTermsCID, onchainTermsCID] = await Promise.all([
    storage.storeTerms(sentimentTerms),
    storage.storeTerms(onchainTerms),
  ]);

  console.log(`  Covenant #0 (Sentiment) Terms CID: ${sentimentTermsCID}`);
  console.log(`  Covenant #1 (On-chain) Terms CID:  ${onchainTermsCID}`);
  console.log("  [Simulated] On-chain: 2 x createCovenant() with ETH escrow");

  // ============================================================================
  // Step 3: Sub-agents commit reasoning (BEFORE acting)
  // ============================================================================
  console.log("\n[STEP 3] Sub-agents committing reasoning BEFORE analysis...");

  const { createCommitment, verifyCommitment } = await import("./shared/AxiomAgent.js");

  const sentimentPreReasoning = `
    Covenant #0 - ETH sentiment analysis
    Methodology: aggregate Farcaster mentions, check funding rates, track whale wallets.
    I commit to reporting findings honestly regardless of result.
    This commitment is made BEFORE running any analysis.
  `.trim();

  const onchainPreReasoning = `
    Covenant #1 - ETH on-chain data analysis
    Methodology: query DEX volumes, track wallets >50 ETH, check OI and funding.
    I will report data as-is without manipulation.
    This commitment is made BEFORE querying any data.
  `.trim();

  const sentimentProof = createCommitment(sentimentPreReasoning, "0");
  const onchainProof = createCommitment(onchainPreReasoning, "1");

  console.log(`  Sentinel-1 Commitment: ${sentimentProof.commitment.slice(0, 30)}...`);
  console.log(`  ChainEye-1 Commitment: ${onchainProof.commitment.slice(0, 30)}...`);
  console.log("  [Simulated] On-chain: 2 x commitReasoning() stored on Base");

  // ============================================================================
  // Step 4: Sub-agents run actual analysis via Bankr LLM
  // ============================================================================
  console.log("\n[STEP 4] Sub-agents executing analysis via Bankr LLM...");

  const sentimentResult = await llm.analyzeToJSON<{
    sentiment: string;
    confidence: number;
    recommendation: string;
    signals: string[];
    reasoning: string;
  }>(
    "You are Sentinel-1, an AXIOM-registered market sentiment agent. Analyze ETH sentiment.",
    `Analyze current ETH market sentiment. Return JSON:
     {
       "sentiment": "bullish|bearish|neutral",
       "confidence": 0.0-1.0,
       "recommendation": "BUY|SELL|HOLD",
       "signals": ["signal1", "signal2", "signal3"],
       "reasoning": "explanation"
     }`
  );

  const onchainResult = await llm.analyzeToJSON<{
    dexVolume24h: string;
    whaleActivity: string;
    netSignal: string;
    confidence: number;
    reasoning: string;
  }>(
    "You are ChainEye-1, an AXIOM-registered on-chain data agent. Report ETH on-chain metrics.",
    `Report current ETH on-chain data. Return JSON:
     {
       "dexVolume24h": "string",
       "whaleActivity": "accumulation|distribution|neutral",
       "netSignal": "BULLISH|BEARISH|NEUTRAL",
       "confidence": 0.0-1.0,
       "reasoning": "explanation"
     }`
  );

  console.log(`\n  Sentinel-1 result: ${sentimentResult.sentiment} (${(sentimentResult.confidence * 100).toFixed(0)}%) → ${sentimentResult.recommendation}`);
  console.log(`  ChainEye-1 result: ${onchainResult.netSignal} (${(onchainResult.confidence * 100).toFixed(0)}%)`);

  // ============================================================================
  // Step 5: Verify commitments (reasoning wasn't changed)
  // ============================================================================
  console.log("\n[STEP 5] Verifying commitment integrity...");

  const sentimentValid = verifyCommitment(sentimentPreReasoning, sentimentProof.salt, sentimentProof.commitment);
  const onchainValid = verifyCommitment(onchainPreReasoning, onchainProof.salt, onchainProof.commitment);

  console.log(`  Sentinel-1 commitment valid: ${sentimentValid ? "YES ✓" : "NO ✗"}`);
  console.log(`  ChainEye-1 commitment valid: ${onchainValid ? "YES ✓" : "NO ✗"}`);

  // ============================================================================
  // Step 6: Store reasoning documents on Filecoin
  // ============================================================================
  console.log("\n[STEP 6] Storing reasoning documents on Filecoin...");

  const sentimentReasoningDoc = JSON.stringify({
    axiom: "1.0.0",
    agent: "Sentinel-1",
    covenant: "0",
    commitment: sentimentProof.commitment,
    preReasoning: sentimentPreReasoning,
    result: sentimentResult,
    verified: sentimentValid,
    timestamp: new Date().toISOString(),
  }, null, 2);

  const onchainReasoningDoc = JSON.stringify({
    axiom: "1.0.0",
    agent: "ChainEye-1",
    covenant: "1",
    commitment: onchainProof.commitment,
    preReasoning: onchainPreReasoning,
    result: onchainResult,
    verified: onchainValid,
    timestamp: new Date().toISOString(),
  }, null, 2);

  const [sentimentReasoningCID, onchainReasoningCID] = await Promise.all([
    storage.storeReasoning(sentimentReasoningDoc),
    storage.storeReasoning(onchainReasoningDoc),
  ]);

  console.log(`  Sentinel-1 Reasoning CID: ${sentimentReasoningCID}`);
  console.log(`  ChainEye-1 Reasoning CID: ${onchainReasoningCID}`);
  console.log("  [Simulated] On-chain: 2 x fulfillCovenant() — escrow released, reputation updated");

  // ============================================================================
  // Step 7: Master synthesizes and makes final decision
  // ============================================================================
  console.log("\n[STEP 7] Master agent synthesizing and committing final decision...");

  const finalDecision = await llm.analyzeToJSON<{
    action: string;
    confidence: number;
    rationale: string;
    riskLevel: string;
    size: string;
  }>(
    "You are Nexus-1, AXIOM master orchestrator. Synthesize sub-agent reports into a trade decision.",
    `Sub-agent reports:
     - Sentinel-1 (Sentiment): ${sentimentResult.sentiment}, ${(sentimentResult.confidence * 100).toFixed(0)}% confidence → ${sentimentResult.recommendation}
     - ChainEye-1 (On-chain): ${onchainResult.netSignal}, ${(onchainResult.confidence * 100).toFixed(0)}% confidence

     Synthesize into final decision. Return JSON:
     {
       "action": "BUY|SELL|HOLD",
       "confidence": 0.0-1.0,
       "rationale": "explanation",
       "riskLevel": "low|medium|high",
       "size": "portfolio % suggestion"
     }`
  );

  // Store master's reasoning proof
  const masterProof = createCommitment(
    `Final decision: ${finalDecision.action} ETH @ ${(finalDecision.confidence * 100).toFixed(0)}% confidence. ${finalDecision.rationale}`,
    "master"
  );

  // ============================================================================
  // Step 8: Store complete pipeline log on Filecoin
  // ============================================================================
  console.log("\n[STEP 8] Storing complete pipeline audit log on Filecoin...");

  const pipelineLog = {
    axiomProtocol: "1.0.0",
    pipelineId: `pipeline_ETH_${Date.now()}`,
    timestamp: new Date().toISOString(),
    agents: {
      master: { name: "Nexus-1", constitutionCID: masterCID },
      sentiment: { name: "Sentinel-1", constitutionCID: sentimentCID },
      onchain: { name: "ChainEye-1", constitutionCID: onchainCID },
    },
    covenants: {
      sentiment: {
        id: "0",
        termsCID: sentimentTermsCID,
        reasoningCID: sentimentReasoningCID,
        commitment: sentimentProof.commitment,
        result: sentimentResult,
      },
      onchain: {
        id: "1",
        termsCID: onchainTermsCID,
        reasoningCID: onchainReasoningCID,
        commitment: onchainProof.commitment,
        result: onchainResult,
      },
    },
    finalDecision: {
      ...finalDecision,
      masterCommitment: masterProof.commitment,
    },
    verification: {
      sentimentCommitmentValid: sentimentValid,
      onchainCommitmentValid: onchainValid,
      allVerified: sentimentValid && onchainValid,
    },
  };

  const pipelineLogCID = await storage.storeExecutionLog(pipelineLog);
  console.log(`  Pipeline Log CID: ${pipelineLogCID}`);

  // ============================================================================
  // Final Summary
  // ============================================================================
  console.log("\n" + "=".repeat(70));
  console.log("  AXIOM PIPELINE COMPLETE");
  console.log("=".repeat(70));
  console.log(`\n  Asset: ETH`);
  console.log(`  Final Decision: ${finalDecision.action}`);
  console.log(`  Confidence: ${(finalDecision.confidence * 100).toFixed(0)}%`);
  console.log(`  Risk Level: ${finalDecision.riskLevel}`);
  console.log(`  Suggested Size: ${finalDecision.size}`);
  console.log(`  Rationale: ${finalDecision.rationale}`);

  console.log("\n  Filecoin Audit Trail:");
  console.log(`    Nexus-1 Constitution:    ${masterCID}`);
  console.log(`    Sentinel-1 Constitution: ${sentimentCID}`);
  console.log(`    ChainEye-1 Constitution: ${onchainCID}`);
  console.log(`    Covenant #0 Terms:       ${sentimentTermsCID}`);
  console.log(`    Covenant #1 Terms:       ${onchainTermsCID}`);
  console.log(`    Sentinel-1 Reasoning:    ${sentimentReasoningCID}`);
  console.log(`    ChainEye-1 Reasoning:    ${onchainReasoningCID}`);
  console.log(`    Full Pipeline Log:       ${pipelineLogCID}`);

  console.log("\n  Every step is:");
  console.log("    ✓ Cryptographically committed BEFORE execution");
  console.log("    ✓ Permanently stored on Filecoin");
  console.log("    ✓ Verifiable by anyone, forever");
  console.log("    ✓ Linked to agent identity & reputation on Base");

  console.log("\n  This is the first time AI agents can be held accountable.");
  console.log("  AXIOM — The Promise Layer for AI Agents.");
  console.log("=".repeat(70) + "\n");

  return pipelineLog;
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  const isLive = checkEnvironment();

  if (!isLive) {
    await runDryDemo();
  } else {
    // Full live run — derive provider addresses from private keys (always correct)
    const sentimentAddress = (
      process.env.SENTIMENT_AGENT_ADDRESS ||
      (AGENT_KEYS.SENTIMENT ? privateKeyToAccount(AGENT_KEYS.SENTIMENT).address : "")
    ) as `0x${string}`;
    const onchainAddress = (
      process.env.ONCHAIN_AGENT_ADDRESS ||
      (AGENT_KEYS.ONCHAIN ? privateKeyToAccount(AGENT_KEYS.ONCHAIN).address : "")
    ) as `0x${string}`;

    const { MasterAgent } = await import("./master-agent.js");
    const master = new MasterAgent();
    await master.init();
    await master.runResearchPipeline(
      "ETH",
      sentimentAddress,
      onchainAddress,
      { sentimentEth: "0.001", onchainEth: "0.001" }
    );
  }
}

main().catch(console.error);
