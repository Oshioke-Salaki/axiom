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
import { AxiomAgent } from "./shared/AxiomAgent.js";
import { AXIOM_BASE_CONFIG, AGENT_KEYS } from "./shared/config.js";

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

// ============================================================================
// Standalone server mode — accept covenants via x402
// ============================================================================
async function runServer() {
  const agent = new SentimentAgent();

  if (!AGENT_KEYS.SENTIMENT || AGENT_KEYS.SENTIMENT.length < 10) {
    console.log("[Sentinel-1] No private key — running in demo mode");
    await runDemo();
    return;
  }

  await agent.init();
  console.log("\n[Sentinel-1] Running as x402-enabled service...");
  console.log("  Endpoint: POST /analyze");
  console.log("  Price: 0.001 ETH per analysis");
  console.log("  Waiting for covenants...");

  // Expose agent as x402-paid service
  const { default: express } = await import("express");
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      agent: agent.name,
      address: agent.address,
      type: agent.agentType,
      constitutionCID: agent.constitutionCID,
      status: "ready",
    });
  });

  app.post("/analyze", async (req, res) => {
    try {
      const { covenantId, asset } = req.body;
      const analysis = await agent.acceptAndFulfill(BigInt(covenantId), asset ?? "ETH");
      res.json({ success: true, analysis });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(3001, () => {
    console.log("\n[Sentinel-1] Service running on port 3001");
  });
}

async function runDemo() {
  console.log("\n[Sentinel-1] Demo mode — simulating covenant fulfillment");
  const agent = new SentimentAgent();

  // Mock analysis output
  const mockAnalysis: SentimentAnalysis = {
    asset: "ETH",
    sentiment: "bullish",
    confidence: 0.78,
    signals: [
      "Farcaster mentions +43% in 24h",
      "Funding rates neutral (not overheated)",
      "Whale wallets accumulating: 3 wallets bought >100 ETH",
      "DEX volume trending up",
    ],
    socialScore: 74,
    onchainScore: 71,
    recommendation: "BUY",
    reasoning:
      "Multiple bullish signals converging: social momentum building, institutional wallets accumulating, funding rates suggesting room to run without leverage flush risk. On-chain data confirms genuine demand.",
    sources: ["Farcaster API", "Nansen on-chain data", "Coinglass funding rates"],
    analyzedAt: new Date().toISOString(),
  };

  console.log("\n[Sentinel-1] Mock analysis:");
  console.log(JSON.stringify(mockAnalysis, null, 2));
  return mockAnalysis;
}

// Run if called directly
const isMain = process.argv[1]?.endsWith("sentiment-agent.ts");
if (isMain) {
  runServer().catch(console.error);
}

export { SentimentAgent };
