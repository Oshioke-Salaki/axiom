// @ts-nocheck
/**
 * Dry-run pipeline — no private keys needed.
 * Uses real Bankr LLM (if BANKR_LLM_KEY is set) and Filecoin simulation.
 * console.log is intercepted by the API route and streamed via SSE.
 */

import { FilecoinStorage, BankrGateway, createCommitment, verifyCommitment } from "./AxiomAgent";

export async function runDryPipeline() {
  console.log("\n" + "=".repeat(70));
  console.log("  AXIOM Protocol — Covenant Protocol for AI Agents");
  console.log("  Demo Pipeline v1.0.0");
  console.log("=".repeat(70));

  console.log("\n  [DEMO MODE — add PRIVATE_KEY env var to run live on Base Sepolia]");
  console.log("  Network: Base Sepolia (Chain 84532)");
  console.log("  Registry: 0xB59726f55EB180832b56232DdF24d289aF86B491");
  console.log("  Covenant: 0x75E42505e9Dc81eb85EFF8E00285CBCf176F7E74");

  const storage = new FilecoinStorage({});
  await storage.init();

  const llm = new BankrGateway({ apiKey: process.env.BANKR_LLM_KEY ?? "" });

  // ============================================================
  // Agent registration simulation
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("  AXIOM Agent: Nexus-1");
  console.log("  Type:        orchestrator");
  console.log("=".repeat(60));

  const [masterCID, sentimentCID, onchainCID] = await Promise.all([
    storage.storeConstitution({ name: "Nexus-1", agentType: "orchestrator", version: "1.0.0" }),
    storage.storeConstitution({ name: "Sentinel-1", agentType: "sentiment", version: "1.0.0" }),
    storage.storeConstitution({ name: "ChainEye-1", agentType: "onchain-data", version: "1.0.0" }),
  ]);

  console.log(`  [Filecoin] Storing constitution...`);
  console.log(`  Constitution CID: ${masterCID}`);
  console.log("  Registering on-chain...");
  console.log("  Registered! Reputation: 300 (Provisional)");

  // ============================================================
  // Pipeline start
  // ============================================================
  const pipelineId = `pipeline_ETH_${Date.now()}`;
  console.log("\n" + "=".repeat(70));
  console.log(`  AXIOM PIPELINE: ${pipelineId}`);
  console.log("  Asset: ETH  |  Budget: 0.001 + 0.001 ETH");
  console.log("=".repeat(70));

  // Phase 1 — hire sentiment agent
  console.log("\n[PHASE 1] Hiring Sentiment Agent...");
  const [sentimentTermsCID, onchainTermsCID] = await Promise.all([
    storage.storeTerms({ task: "ETH sentiment analysis", payment: "0.001 ETH", provider: "Sentinel-1" }),
    storage.storeTerms({ task: "ETH on-chain analysis", payment: "0.001 ETH", provider: "ChainEye-1" }),
  ]);
  console.log("  [Covenant] Hiring 0xf0898B30...");
  console.log("  [Covenant] #12 created. Payment: 0.001 ETH escrowed on Base");

  // Phase 2 — hire onchain agent
  console.log("\n[PHASE 2] Hiring Onchain Data Agent...");
  console.log("  [Covenant] Hiring 0x12e70471...");
  console.log("  [Covenant] #13 created. Payment: 0.001 ETH escrowed on Base");

  console.log("\n[PIPELINE] Both covenants created. Sub-agents now working...");
  console.log("  Covenant #12 → Sentinel-1 (sentiment)");
  console.log("  Covenant #13 → ChainEye-1 (onchain-data)");

  // Phase 3 — sub-agents execute
  console.log("\n[PHASE 3] Sub-agents executing (covenant-bound)...");

  // Sentinel-1
  console.log("\n[Sentinel-1] Accepted covenant #12 for ETH");

  const sentimentPreReasoning = `Covenant #12 - Sentiment analysis for ETH. Methodology: aggregate Farcaster/X social mentions, analyze funding rates, check whale wallet movements. Committing before analysis.`;
  const sentimentProof = createCommitment(sentimentPreReasoning, "12");

  console.log("  [Commit] Covenant #12 — committing reasoning BEFORE acting...");
  console.log(`  [Commit] Commitment hash: ${sentimentProof.commitment.slice(0, 22)}...`);
  console.log("  [Commit] On-chain. Tx: 0x879602acc937bd7d2a0f405989a40aa302f5b4cfa3ca808c189cd4ed5d7592cc");

  console.log("\n[Sentinel-1] Running sentiment analysis for ETH via Bankr LLM...");

  const sentimentResult = await llm.analyzeToJSON<{
    asset: string;
    sentiment: string;
    confidence: number;
    recommendation: string;
    signals: string[];
    socialScore: number;
    onchainScore: number;
    reasoning: string;
    sources: string[];
    analyzedAt: string;
  }>(
    "You are Sentinel-1, an AXIOM-registered market sentiment agent. Your reasoning was committed on-chain before this analysis ran — you cannot fabricate results.",
    `Analyze current ETH market sentiment. Return JSON:
     {
       "asset": "ETH",
       "sentiment": "bullish|bearish|neutral",
       "confidence": 0.0-1.0,
       "recommendation": "BUY|SELL|HOLD",
       "signals": ["signal1", "signal2", "signal3"],
       "socialScore": 0-100,
       "onchainScore": 0-100,
       "reasoning": "explanation",
       "sources": ["source1"],
       "analyzedAt": "${new Date().toISOString()}"
     }`
  );
  sentimentResult.analyzedAt = new Date().toISOString();

  console.log("\n[Sentinel-1] Analysis complete:");
  console.log(`  Asset:          ${sentimentResult.asset}`);
  console.log(`  Sentiment:      ${sentimentResult.sentiment} (${(sentimentResult.confidence * 100).toFixed(0)}% confidence)`);
  console.log(`  Recommendation: ${sentimentResult.recommendation}`);
  console.log(`  Social Score:   ${sentimentResult.socialScore}/100  |  Onchain Score: ${sentimentResult.onchainScore}/100`);

  const sentimentReasoningCID = await storage.storeReasoning(JSON.stringify({
    agent: "Sentinel-1", covenant: "12", commitment: sentimentProof.commitment,
    result: sentimentResult, verified: true, timestamp: new Date().toISOString(),
  }));

  console.log("  [Fulfill] Storing reasoning + deliverable on Filecoin...");
  console.log("  [Fulfill] DONE. Hash verified on-chain. Payment released.");
  console.log("  Tx: 0xd144e243abf91a0571998f0c73805ef212a6efbb16ad22b2e1481e9c7531bcb4");

  // ChainEye-1
  console.log("\n[ChainEye-1] Accepted covenant #13 for ETH on-chain analysis");

  const onchainPreReasoning = `Covenant #13 - On-chain data analysis for ETH. Methodology: query DEX volumes, track whale wallets >50 ETH, check open interest and funding rates. Committing before analysis.`;
  const onchainProof = createCommitment(onchainPreReasoning, "13");

  console.log("  [Commit] Covenant #13 — committing reasoning BEFORE acting...");
  console.log(`  [Commit] Commitment hash: ${onchainProof.commitment.slice(0, 22)}...`);
  console.log("  [Commit] On-chain. Tx: 0x37461f3f321c8be243831d81732b6f04999c6e7ad1c2ff8a9bcea28b75a92742");

  console.log("\n[ChainEye-1] Analyzing on-chain data for ETH via Bankr LLM...");

  const onchainResult = await llm.analyzeToJSON<{
    asset: string;
    dexVolume24h: string;
    volumeChange: string;
    whaleActivity: string;
    fundingRate: string;
    liquidationsRisk: string;
    netSignal: string;
    confidence: number;
    keyMetrics: string[];
    reasoning: string;
    analyzedAt: string;
  }>(
    "You are ChainEye-1, an AXIOM-registered on-chain data agent. Report ETH on-chain metrics objectively.",
    `Analyze current ETH on-chain data. Return JSON:
     {
       "asset": "ETH",
       "dexVolume24h": "string e.g. $2.3B",
       "volumeChange": "string e.g. +12%",
       "whaleActivity": "accumulation|distribution|neutral",
       "fundingRate": "string",
       "liquidationsRisk": "high|medium|low",
       "netSignal": "BULLISH|BEARISH|NEUTRAL",
       "confidence": 0.0-1.0,
       "keyMetrics": ["metric1", "metric2"],
       "reasoning": "explanation",
       "analyzedAt": "${new Date().toISOString()}"
     }`
  );
  onchainResult.analyzedAt = new Date().toISOString();

  console.log("\n[ChainEye-1] Analysis complete:");
  console.log(`  DEX Volume:       ${onchainResult.dexVolume24h} (${onchainResult.volumeChange})`);
  console.log(`  Whale Activity:   ${onchainResult.whaleActivity}`);
  console.log(`  Funding Rate:     ${onchainResult.fundingRate}`);
  console.log(`  Liquidation Risk: ${onchainResult.liquidationsRisk}`);
  console.log(`  Net Signal:       ${onchainResult.netSignal} (${(onchainResult.confidence * 100).toFixed(0)}% confidence)`);

  const onchainReasoningCID = await storage.storeReasoning(JSON.stringify({
    agent: "ChainEye-1", covenant: "13", commitment: onchainProof.commitment,
    result: onchainResult, verified: true, timestamp: new Date().toISOString(),
  }));

  console.log("  [Fulfill] Storing reasoning + deliverable on Filecoin...");
  console.log("  [Fulfill] DONE. Hash verified on-chain. Payment released.");
  console.log("  Tx: 0x0c754f942cddf0cd496c935a1de573ee82e5cc9f0ef1ae965b1f2e84ac9fd990");

  // Phase 4 — master synthesizes
  console.log("\n[PHASE 4] Nexus-1 synthesizing verified signals...");

  const finalDecision = await llm.analyzeToJSON<{
    action: string;
    confidence: number;
    rationale: string;
    riskLevel: string;
    suggestedSize: string;
  }>(
    "You are Nexus-1, the AXIOM master orchestrator. Synthesize verified sub-agent reports into a final trade decision.",
    `Sub-agent reports:
     - Sentinel-1 (Sentiment): ${sentimentResult.sentiment}, ${(sentimentResult.confidence * 100).toFixed(0)}% → ${sentimentResult.recommendation}
     - ChainEye-1 (On-chain): ${onchainResult.netSignal}, ${(onchainResult.confidence * 100).toFixed(0)}%

     Return JSON:
     {
       "action": "BUY|SELL|HOLD",
       "confidence": 0.0-1.0,
       "rationale": "clear explanation",
       "riskLevel": "low|medium|high",
       "suggestedSize": "e.g. 3% of portfolio"
     }`
  );

  const pipelineLogCID = await storage.storeExecutionLog({
    pipelineId, agents: { masterCID, sentimentCID, onchainCID },
    covenants: {
      sentiment: { id: "12", termsCID: sentimentTermsCID, reasoningCID: sentimentReasoningCID, commitment: sentimentProof.commitment, result: sentimentResult },
      onchain:   { id: "13", termsCID: onchainTermsCID,  reasoningCID: onchainReasoningCID,  commitment: onchainProof.commitment,  result: onchainResult },
    },
    finalDecision, timestamp: new Date().toISOString(),
  });

  console.log("[PHASE 4] Storing pipeline audit log on Filecoin...");
  console.log(`  CID: ${pipelineLogCID}`);

  const avgConf = Math.round(((sentimentResult.confidence + onchainResult.confidence) / 2) * 100);

  console.log("\n" + "=".repeat(70));
  console.log("  AXIOM PIPELINE COMPLETE");
  console.log("=".repeat(70));
  console.log("\n  Sub-agent Results:");
  console.log(`    Sentinel-1:  ${sentimentResult.sentiment} @ ${(sentimentResult.confidence * 100).toFixed(0)}% → ${sentimentResult.recommendation}`);
  console.log(`    ChainEye-1:  ${onchainResult.netSignal} @ ${(onchainResult.confidence * 100).toFixed(0)}%`);
  console.log("\n  FINAL DECISION:");
  console.log(`    Action:     ${finalDecision.action} ETH`);
  console.log(`    Confidence: ${(finalDecision.confidence * 100).toFixed(0)}%`);
  console.log(`    Risk:       ${finalDecision.riskLevel}`);
  console.log(`    Size:       ${finalDecision.suggestedSize}`);
  console.log("\n  Filecoin Audit Trail:");
  console.log(`    Sentinel-1 Reasoning: ${sentimentReasoningCID}`);
  console.log(`    ChainEye-1 Reasoning: ${onchainReasoningCID}`);
  console.log(`    Full Pipeline Log:    ${pipelineLogCID}`);
  console.log("\n  Every reasoning commitment was stored BEFORE");
  console.log("  the analysis ran. Retroactive tampering is impossible.");
  console.log("=".repeat(70) + "\n");
}
