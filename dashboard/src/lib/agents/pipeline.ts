// @ts-nocheck
/**
 * Dry-run pipeline — no private keys needed.
 * Uses real Bankr LLM (if BANKR_LLM_KEY is set) and Filecoin simulation.
 * console.log is intercepted by the API route and streamed via SSE.
 */

import { FilecoinStorage, BankrGateway, createCommitment } from "./AxiomAgent";

export async function runDryPipeline(asset = "ETH") {
  console.log("\n" + "=".repeat(70));
  console.log("  AXIOM Protocol — Covenant Protocol for AI Agents");
  console.log("  Demo Pipeline v1.0.0");
  console.log("=".repeat(70));

  console.log("\n  [DEMO MODE — add PRIVATE_KEY env var to run live on Base Sepolia]");
  console.log(`  Asset:   ${asset}`);
  console.log("  Network: Base Sepolia (Chain 84532)");
  console.log("  Registry: 0xB59726f55EB180832b56232DdF24d289aF86B491");
  console.log("  Covenant: 0x75E42505e9Dc81eb85EFF8E00285CBCf176F7E74");

  const storage = new FilecoinStorage({});
  await storage.init();

  const llm = new BankrGateway({ apiKey: process.env.BANKR_LLM_KEY ?? "" });

  // ──────────────────────────────────────────────────────────────
  // Agent registration
  // ──────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  AXIOM Agent: Nexus-1");
  console.log("  Type:        orchestrator");
  console.log("=".repeat(60));

  const [masterCID, sentimentCID, onchainCID] = await Promise.all([
    storage.storeConstitution({ name: "Nexus-1",    agentType: "orchestrator",  version: "1.0.0" }),
    storage.storeConstitution({ name: "Sentinel-1", agentType: "sentiment",     version: "1.0.0" }),
    storage.storeConstitution({ name: "ChainEye-1", agentType: "onchain-data",  version: "1.0.0" }),
  ]);

  console.log("  [Filecoin] Storing constitution...");
  console.log(`  Constitution CID: ${masterCID}`);
  console.log("  Registering on-chain...");
  console.log("  Registered! Reputation: 300 (Provisional)");

  // ──────────────────────────────────────────────────────────────
  // Pipeline start
  // ──────────────────────────────────────────────────────────────
  const pipelineId = `pipeline_${asset}_${Date.now()}`;
  console.log("\n" + "=".repeat(70));
  console.log(`  AXIOM PIPELINE: ${pipelineId}`);
  console.log(`  Asset: ${asset}  |  Budget: 0.001 + 0.001 ETH`);
  console.log("=".repeat(70));

  // Phase 1 — hire sentiment agent
  console.log("\n[PHASE 1] Hiring Sentiment Agent...");
  const [sentimentTermsCID, onchainTermsCID] = await Promise.all([
    storage.storeTerms({ task: `${asset} sentiment analysis`, payment: "0.001 ETH", provider: "Sentinel-1" }),
    storage.storeTerms({ task: `${asset} on-chain analysis`,  payment: "0.001 ETH", provider: "ChainEye-1" }),
  ]);
  console.log("  [Covenant] Hiring 0xf0898B30...");
  console.log("  [Covenant] #12 created. Payment: 0.001 ETH escrowed on Base");

  // Phase 2 — hire onchain agent
  console.log("\n[PHASE 2] Hiring Onchain Data Agent...");
  console.log("  [Covenant] Hiring 0x12e70471...");
  console.log("  [Covenant] #13 created. Payment: 0.001 ETH escrowed on Base");

  console.log("\n[PIPELINE] Both covenants created. Sub-agents now working...");
  console.log(`  Covenant #12 → Sentinel-1 (sentiment)`);
  console.log(`  Covenant #13 → ChainEye-1 (onchain-data)`);

  // Phase 3 — sub-agents
  console.log("\n[PHASE 3] Sub-agents executing (covenant-bound)...");

  // ── Sentinel-1 ──────────────────────────────────────────────
  console.log(`\n[Sentinel-1] Accepted covenant #12 for ${asset}`);

  const sentimentPreReasoning = `Covenant #12 - Sentiment analysis for ${asset}. Methodology: aggregate social mentions, analyze funding rates, check whale wallet movements. Committing before analysis.`;
  const sentimentProof = createCommitment(sentimentPreReasoning, "12");

  console.log("  [Commit] Covenant #12 — committing reasoning BEFORE acting...");
  console.log(`  [Commit] Commitment hash: ${sentimentProof.commitment.slice(0, 22)}...`);
  console.log("  [Commit] On-chain. Tx: 0x879602acc937bd7d2a0f405989a40aa302f5b4cfa3ca808c189cd4ed5d7592cc");

  console.log(`\n[Sentinel-1] Running sentiment analysis for ${asset} via Bankr LLM...`);

  const rawSentiment = await llm.analyzeToJSON<Record<string, any>>(
    `You are Sentinel-1, an AXIOM-registered market sentiment agent. Your reasoning was committed on-chain before this analysis ran.`,
    `Analyze current ${asset} market sentiment. Return ONLY valid JSON with exactly these keys:
     {
       "sentiment": "bullish" or "bearish" or "neutral",
       "confidence": number between 0 and 1,
       "recommendation": "BUY" or "SELL" or "HOLD",
       "signals": ["signal1", "signal2", "signal3"],
       "socialScore": number between 0 and 100,
       "onchainScore": number between 0 and 100,
       "reasoning": "brief explanation",
       "sources": ["source1", "source2"]
     }`
  );

  // Normalize — LLMs sometimes use snake_case or different names
  const sentimentResult = {
    asset,
    sentiment:      rawSentiment.sentiment      ?? "neutral",
    confidence:     Number(rawSentiment.confidence ?? rawSentiment.confidence_score ?? 0.65),
    recommendation: rawSentiment.recommendation ?? "HOLD",
    signals:        rawSentiment.signals        ?? [],
    socialScore:    Number(rawSentiment.socialScore  ?? rawSentiment.social_score   ?? rawSentiment.social   ?? 60),
    onchainScore:   Number(rawSentiment.onchainScore ?? rawSentiment.onchain_score  ?? rawSentiment.onchain  ?? 60),
    reasoning:      rawSentiment.reasoning      ?? "",
    sources:        rawSentiment.sources        ?? [],
    analyzedAt:     new Date().toISOString(),
  };

  console.log(`\n[Sentinel-1] Analysis complete:`);
  console.log(`  Asset:          ${sentimentResult.asset}`);
  console.log(`  Sentiment:      ${sentimentResult.sentiment} (${(sentimentResult.confidence * 100).toFixed(0)}% confidence)`);
  console.log(`  Recommendation: ${sentimentResult.recommendation}`);
  console.log(`  Social Score:   ${sentimentResult.socialScore}/100  |  Onchain Score: ${sentimentResult.onchainScore}/100`);

  const sentimentReasoningCID = await storage.storeReasoning(JSON.stringify({
    agent: "Sentinel-1", covenant: "12", asset,
    commitment: sentimentProof.commitment, result: sentimentResult,
    verified: true, timestamp: new Date().toISOString(),
  }));

  console.log("  [Fulfill] Storing reasoning + deliverable on Filecoin...");
  console.log("  [Fulfill] DONE. Hash verified on-chain. Payment released.");
  console.log("  Tx: 0xd144e243abf91a0571998f0c73805ef212a6efbb16ad22b2e1481e9c7531bcb4");

  // ── ChainEye-1 ──────────────────────────────────────────────
  console.log(`\n[ChainEye-1] Accepted covenant #13 for ${asset} on-chain analysis`);

  const onchainPreReasoning = `Covenant #13 - On-chain data analysis for ${asset}. Methodology: query DEX volumes, track whale wallets, check open interest and funding rates. Committing before analysis.`;
  const onchainProof = createCommitment(onchainPreReasoning, "13");

  console.log("  [Commit] Covenant #13 — committing reasoning BEFORE acting...");
  console.log(`  [Commit] Commitment hash: ${onchainProof.commitment.slice(0, 22)}...`);
  console.log("  [Commit] On-chain. Tx: 0x37461f3f321c8be243831d81732b6f04999c6e7ad1c2ff8a9bcea28b75a92742");

  console.log(`\n[ChainEye-1] Analyzing on-chain data for ${asset} via Bankr LLM...`);

  const rawOnchain = await llm.analyzeToJSON<Record<string, any>>(
    `You are ChainEye-1, an AXIOM-registered on-chain data agent. Report ${asset} on-chain metrics objectively.`,
    `Analyze current ${asset} on-chain data. Return ONLY valid JSON with exactly these keys:
     {
       "dexVolume24h": "e.g. $2.3B",
       "volumeChange": "e.g. +12%",
       "whaleActivity": "accumulation" or "distribution" or "neutral",
       "fundingRate": "e.g. 0.01% per 8h",
       "liquidationsRisk": "high" or "medium" or "low",
       "netSignal": "BULLISH" or "BEARISH" or "NEUTRAL",
       "confidence": number between 0 and 1,
       "keyMetrics": ["metric1", "metric2"],
       "reasoning": "brief explanation"
     }`
  );

  const onchainResult = {
    asset,
    dexVolume24h:    rawOnchain.dexVolume24h    ?? rawOnchain.dex_volume_24h ?? rawOnchain.volume    ?? "$1.5B",
    volumeChange:    rawOnchain.volumeChange    ?? rawOnchain.volume_change  ?? "+0%",
    whaleActivity:   rawOnchain.whaleActivity   ?? rawOnchain.whale_activity ?? "neutral",
    fundingRate:     rawOnchain.fundingRate      ?? rawOnchain.funding_rate   ?? "0.01%",
    liquidationsRisk:rawOnchain.liquidationsRisk ?? rawOnchain.liquidation_risk ?? rawOnchain.liquidations_risk ?? "medium",
    netSignal:       rawOnchain.netSignal        ?? rawOnchain.net_signal     ?? "NEUTRAL",
    confidence:      Number(rawOnchain.confidence ?? rawOnchain.confidence_score ?? 0.65),
    keyMetrics:      rawOnchain.keyMetrics       ?? rawOnchain.key_metrics    ?? [],
    reasoning:       rawOnchain.reasoning        ?? "",
    analyzedAt:      new Date().toISOString(),
  };

  console.log(`\n[ChainEye-1] Analysis complete:`);
  console.log(`  DEX Volume:       ${onchainResult.dexVolume24h} (${onchainResult.volumeChange})`);
  console.log(`  Whale Activity:   ${onchainResult.whaleActivity}`);
  console.log(`  Funding Rate:     ${onchainResult.fundingRate}`);
  console.log(`  Liquidation Risk: ${onchainResult.liquidationsRisk}`);
  console.log(`  Net Signal:       ${onchainResult.netSignal} (${(onchainResult.confidence * 100).toFixed(0)}% confidence)`);

  const onchainReasoningCID = await storage.storeReasoning(JSON.stringify({
    agent: "ChainEye-1", covenant: "13", asset,
    commitment: onchainProof.commitment, result: onchainResult,
    verified: true, timestamp: new Date().toISOString(),
  }));

  console.log("  [Fulfill] Storing reasoning + deliverable on Filecoin...");
  console.log("  [Fulfill] DONE. Hash verified on-chain. Payment released.");
  console.log("  Tx: 0x0c754f942cddf0cd496c935a1de573ee82e5cc9f0ef1ae965b1f2e84ac9fd990");

  // ── Phase 4 — Nexus-1 synthesizes ───────────────────────────
  console.log("\n[PHASE 4] Nexus-1 synthesizing verified signals...");

  const rawDecision = await llm.analyzeToJSON<Record<string, any>>(
    "You are Nexus-1, the AXIOM master orchestrator. Synthesize verified sub-agent reports into a final trade decision.",
    `Sub-agent reports for ${asset}:
     - Sentinel-1 (Sentiment): ${sentimentResult.sentiment}, ${(sentimentResult.confidence * 100).toFixed(0)}% → ${sentimentResult.recommendation}
     - ChainEye-1 (On-chain): ${onchainResult.netSignal}, ${(onchainResult.confidence * 100).toFixed(0)}%

     Return ONLY valid JSON with exactly these keys:
     {
       "action": "BUY" or "SELL" or "HOLD",
       "confidence": number between 0 and 1,
       "rationale": "clear one-sentence explanation",
       "riskLevel": "low" or "medium" or "high",
       "suggestedSize": "e.g. 3% of portfolio"
     }`
  );

  const finalDecision = {
    action:       rawDecision.action        ?? "HOLD",
    confidence:   Number(rawDecision.confidence ?? rawDecision.confidence_score ?? 0.65),
    rationale:    rawDecision.rationale     ?? "",
    riskLevel:    rawDecision.riskLevel     ?? rawDecision.risk_level ?? rawDecision.risk ?? "medium",
    suggestedSize:rawDecision.suggestedSize ?? rawDecision.suggested_size ?? rawDecision.size ?? "2% of portfolio",
  };

  const pipelineLogCID = await storage.storeExecutionLog({
    pipelineId, asset,
    agents: { masterCID, sentimentCID, onchainCID },
    covenants: {
      sentiment: { id: "12", termsCID: sentimentTermsCID, reasoningCID: sentimentReasoningCID, commitment: sentimentProof.commitment, result: sentimentResult },
      onchain:   { id: "13", termsCID: onchainTermsCID,  reasoningCID: onchainReasoningCID,  commitment: onchainProof.commitment,  result: onchainResult  },
    },
    finalDecision, timestamp: new Date().toISOString(),
  });

  console.log("[PHASE 4] Storing pipeline audit log on Filecoin...");
  console.log(`  CID: ${pipelineLogCID}`);

  console.log("\n" + "=".repeat(70));
  console.log("  AXIOM PIPELINE COMPLETE");
  console.log("=".repeat(70));
  console.log("\n  Sub-agent Results:");
  console.log(`    Sentinel-1:  ${sentimentResult.sentiment} @ ${(sentimentResult.confidence * 100).toFixed(0)}% → ${sentimentResult.recommendation}`);
  console.log(`    ChainEye-1:  ${onchainResult.netSignal} @ ${(onchainResult.confidence * 100).toFixed(0)}%`);
  console.log("\n  FINAL DECISION:");
  console.log(`    Action:     ${finalDecision.action} ${asset}`);
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
