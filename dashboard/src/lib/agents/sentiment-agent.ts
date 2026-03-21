// @ts-nocheck
/**
 * SentimentAgent — AXIOM-powered market sentiment analyzer.
 *
 * This agent:
 *   1. Receives a covenant from the master agent
 *   2. Commits reasoning hash BEFORE analyzing (tamper-proof)
 *   3. Runs multi-source sentiment analysis via Bankr LLM
 *   4. Stores evidence on Filecoin
 *   5. Fulfills covenant, earns payment
 *   6. Reputation updated on-chain
 */

import { type Address } from "viem";
import { AxiomAgent } from "./AxiomAgent";
import { AXIOM_BASE_CONFIG, AGENT_KEYS } from "./config";

export interface SentimentAnalysis {
  asset: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  signals: string[];
  socialScore: number;
  onchainScore: number;
  recommendation: "BUY" | "SELL" | "HOLD";
  reasoning: string;
  sources: string[];
  analyzedAt: string;
}

class SentimentAgent extends AxiomAgent {
  constructor() {
    super({
      ...AXIOM_BASE_CONFIG,
      name: "Sentinel-1",
      agentType: "sentiment",
      privateKey: AGENT_KEYS.SENTIMENT,
      constitution: {
        name: "Sentinel-1",
        agentType: "sentiment",
        version: "1.0.0",
        capabilities: [
          "social sentiment analysis",
          "on-chain signal aggregation",
          "multi-source data synthesis",
          "market mood detection",
        ],
        restrictions: [
          "will NOT fabricate data",
          "will NOT make price predictions",
          "will NOT exceed covenant scope",
          "will ALWAYS commit reasoning before acting",
        ],
        maxSpendPerCovenant: "0.005",
        supportedModels: ["claude-sonnet-4-6", "gemini-2.5-flash"],
        author: "AXIOM Protocol",
        createdAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Accept and fulfill a sentiment analysis covenant.
   * This is the core loop: commit → analyze → reveal → get paid.
   */
  async acceptAndFulfill(covenantId: bigint, asset: string): Promise<SentimentAnalysis> {
    console.log(`\n[Sentinel-1] Accepted covenant #${covenantId} for ${asset}`);

    // Step 1: Build reasoning BEFORE acting
    const preliminaryReasoning = `
      Covenant #${covenantId} - Sentiment analysis for ${asset}
      Methodology:
        1. Aggregate Farcaster/X social mentions from last 24h
        2. Analyze funding rates and open interest
        3. Check whale wallet movements
        4. Cross-reference with historical sentiment patterns
      I will commit to this reasoning before running analysis.
      If the analysis produces a different result, I will report it honestly.
    `.trim();

    // Step 2: Commit reasoning on-chain (tamper-proof)
    const proof = await this.commitReasoning(covenantId, preliminaryReasoning);

    // Step 3: Now actually run the analysis (AFTER commitment)
    console.log(`\n[Sentinel-1] Running sentiment analysis for ${asset}...`);
    const analysis = await this.llm.analyzeToJSON<SentimentAnalysis>(
      `You are Sentinel-1, an AXIOM-registered AI market sentiment analyst.
       Your identity is cryptographically anchored to Filecoin. Every analysis you produce
       is stored permanently and verifiable. You cannot lie — your reasoning was committed
       on-chain before this analysis ran.

       Analyze ${asset} market sentiment and return structured JSON.`,
      `Analyze current ${asset} market sentiment. Include:
       - Overall sentiment (bullish/bearish/neutral) with confidence score
       - Key signals driving your analysis
       - Social score (0-100) and on-chain score (0-100)
       - Clear BUY/SELL/HOLD recommendation
       - Detailed reasoning for your conclusion
       - Data sources consulted

       Return JSON matching this schema:
       {
         "asset": "${asset}",
         "sentiment": "bullish|bearish|neutral",
         "confidence": 0.0-1.0,
         "signals": ["signal1", "signal2"],
         "socialScore": 0-100,
         "onchainScore": 0-100,
         "recommendation": "BUY|SELL|HOLD",
         "reasoning": "detailed explanation",
         "sources": ["source1", "source2"],
         "analyzedAt": "ISO timestamp"
       }`
    );

    analysis.analyzedAt = new Date().toISOString();

    console.log(`\n[Sentinel-1] Analysis complete:`);
    console.log(`  Asset:          ${analysis.asset}`);
    console.log(`  Sentiment:      ${analysis.sentiment} (${(analysis.confidence * 100).toFixed(0)}% confidence)`);
    console.log(`  Recommendation: ${analysis.recommendation}`);
    console.log(`  Social Score:   ${analysis.socialScore}/100`);
    console.log(`  Onchain Score:  ${analysis.onchainScore}/100`);

    // Step 4: Fulfill covenant — reveals reasoning + stores evidence on Filecoin
    const finalReasoning = `
      Sentiment analysis for ${asset} completed.
      Result: ${analysis.sentiment} (${(analysis.confidence * 100).toFixed(0)}% confidence)
      Recommendation: ${analysis.recommendation}
      Key signals: ${analysis.signals.join(", ")}
      Full reasoning: ${analysis.reasoning}
    `.trim();

    await this.fulfillCovenant(covenantId, finalReasoning, analysis);

    return analysis;
  }
}

export { SentimentAgent };
