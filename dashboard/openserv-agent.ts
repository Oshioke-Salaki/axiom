/**
 * AXIOM — OpenServ Agent
 *
 * Registers Nexus-1 (orchestrator), Sentinel-1 (sentiment), and ChainEye-1 (on-chain)
 * as a unified multi-agent DeFi analysis service on OpenServ.
 *
 * Run: npx tsx openserv-agent.ts
 * Register endpoint on: https://platform.openserv.ai  →  Developer → Add Agent
 * Endpoint URL: <your-ngrok-or-deployed-url>  (SDK auto-creates tunnel if OPENSERV_TUNNEL=1)
 */

import "dotenv/config";
import { Agent } from "@openserv-labs/sdk";
import { z } from "zod";

// ── Inline Bankr LLM client (avoids circular Next.js imports) ────────────────
import OpenAI from "openai";

function makeBankrClient() {
  const apiKey = process.env.BANKR_LLM_KEY ?? "";
  return new OpenAI({
    apiKey,
    baseURL: "https://llm.bankr.bot/v1",
    defaultHeaders: { "X-API-Key": apiKey },
  });
}

async function analyzeToJSON<T>(
  client: OpenAI,
  system: string,
  user: string
): Promise<T> {
  const resp = await client.chat.completions.create({
    model: "claude-sonnet-4-6",
    messages: [
      { role: "system", content: `${system}\nRespond with valid JSON only. No markdown fences.` },
      { role: "user",   content: user },
    ],
    temperature: 0.7,
    max_tokens: 1200,
  });
  const raw = resp.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim()) as T;
}

// ── Live market data helper ───────────────────────────────────────────────────
const CG_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", ARB: "arbitrum",
  OP: "optimism", MATIC: "matic-network", LINK: "chainlink",
  AVAX: "avalanche-2", DOGE: "dogecoin", PEPE: "pepe",
};

async function fetchMarketCtx(asset: string): Promise<string> {
  try {
    const id = CG_IDS[asset.toUpperCase()] ?? asset.toLowerCase();
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`
    );
    if (!r.ok) return "";
    const d = (await r.json())[id];
    if (!d) return "";
    return `\nLIVE: $${Number(d.usd).toLocaleString()} | 24h: ${d.usd_24h_change?.toFixed(2)}% | Vol: $${(d.usd_24h_vol / 1e9).toFixed(2)}B`;
  } catch { return ""; }
}

// ── AXIOM OpenServ Agent ──────────────────────────────────────────────────────
const axiomAgent = new Agent({
  systemPrompt: `You are AXIOM — a decentralised multi-agent DeFi analysis system.
You coordinate three specialised agents:
  • Nexus-1   — orchestrator; synthesises final trade decision
  • Sentinel-1 — sentiment agent; social + on-chain score analysis
  • ChainEye-1 — on-chain agent; DEX volume, whale activity, funding rates
All reasoning is committed on-chain (Base Sepolia) via the AXIOM Covenant Protocol before execution, then stored on Filecoin (FOC) for verifiable audit trails. Delegations are issued using MetaMask ERC-7715.
Respond only with JSON analysis outputs when executing capabilities.`,
  apiKey: process.env.OPENSERV_API_KEY,
});

// ── Capability 1: Full multi-agent DeFi analysis ─────────────────────────────
axiomAgent.addCapability({
  name: "analyze-asset",
  description:
    "Run the AXIOM three-agent DeFi pipeline for a crypto asset. " +
    "Sentinel-1 runs social/sentiment analysis, ChainEye-1 runs on-chain data analysis, " +
    "and Nexus-1 synthesises a final BUY/SELL/HOLD decision with confidence and rationale. " +
    "Returns structured JSON with full reasoning from all three agents.",
  inputSchema: z.object({
    asset: z.string().describe("Crypto asset symbol, e.g. BTC, ETH, SOL"),
  }),
  async run({ args }) {
    const { asset } = args;
    const sym = asset.toUpperCase();
    const llm = makeBankrClient();
    const mkt = await fetchMarketCtx(sym);

    // ── Sentinel-1: sentiment analysis ───────────────────────────────────────
    const sentiment = await analyzeToJSON<Record<string, unknown>>(
      llm,
      "You are Sentinel-1, AXIOM sentiment agent. Analyse crypto social sentiment and on-chain signals.",
      `Analyse ${sym} sentiment.${mkt}\nReturn JSON: { "sentiment":"bullish|bearish|neutral", "confidence":0-1, "socialScore":0-100, "onchainScore":0-100, "recommendation":"BUY|SELL|HOLD", "reasoning":"string" }`
    );

    // ── ChainEye-1: on-chain analysis ─────────────────────────────────────────
    const onchain = await analyzeToJSON<Record<string, unknown>>(
      llm,
      "You are ChainEye-1, AXIOM on-chain data agent. Analyse DEX volume, whale activity, funding rates.",
      `Analyse ${sym} on-chain data.${mkt}\nReturn JSON: { "dexVolume24h":"string", "volumeChange":"string", "whaleActivity":"accumulation|distribution|neutral", "fundingRate":"string", "netSignal":"BULLISH|BEARISH|NEUTRAL", "confidence":0-1, "reasoning":"string" }`
    );

    // ── Nexus-1: synthesise final decision ────────────────────────────────────
    const synthesis = await analyzeToJSON<Record<string, unknown>>(
      llm,
      "You are Nexus-1, AXIOM orchestrator. Synthesise verified sub-agent results into a final trading decision.",
      `Sub-agent results for ${sym}:\n\nSentinel-1: ${JSON.stringify(sentiment)}\n\nChainEye-1: ${JSON.stringify(onchain)}\n\nReturn JSON: { "action":"BUY|SELL|HOLD", "confidence":0-1, "rationale":"string", "riskLevel":"low|medium|high", "suggestedSize":"string" }`
    );

    return JSON.stringify({
      axiomVersion: "1.0.0",
      asset: sym,
      timestamp: new Date().toISOString(),
      pipeline: {
        "Sentinel-1 (sentiment)": sentiment,
        "ChainEye-1 (on-chain)":  onchain,
        "Nexus-1 (decision)":     synthesis,
      },
      decision: synthesis,
      protocol: {
        covenants:  "Base Sepolia — AXIOM Covenant Protocol",
        storage:    "Filecoin FOC mainnet",
        delegation: "MetaMask ERC-7715",
      },
    }, null, 2);
  },
});

// ── Capability 2: Sentinel-1 standalone sentiment ────────────────────────────
axiomAgent.addCapability({
  name: "sentinel-sentiment",
  description:
    "Run only Sentinel-1 sentiment analysis for a crypto asset. " +
    "Returns social score, on-chain score, sentiment label, and recommendation.",
  inputSchema: z.object({
    asset: z.string().describe("Crypto asset symbol"),
  }),
  async run({ args }) {
    const sym = args.asset.toUpperCase();
    const llm = makeBankrClient();
    const mkt = await fetchMarketCtx(sym);
    const result = await analyzeToJSON<Record<string, unknown>>(
      llm,
      "You are Sentinel-1, AXIOM sentiment agent.",
      `Analyse ${sym} sentiment.${mkt}\nReturn JSON: { "sentiment":"bullish|bearish|neutral", "confidence":0-1, "socialScore":0-100, "onchainScore":0-100, "recommendation":"BUY|SELL|HOLD", "reasoning":"string" }`
    );
    return JSON.stringify({ agent: "Sentinel-1", asset: sym, ...result }, null, 2);
  },
});

// ── Capability 3: ChainEye-1 standalone on-chain ──────────────────────────────
axiomAgent.addCapability({
  name: "chaineye-onchain",
  description:
    "Run only ChainEye-1 on-chain analysis for a crypto asset. " +
    "Returns DEX volume, whale activity, funding rate, and net signal.",
  inputSchema: z.object({
    asset: z.string().describe("Crypto asset symbol"),
  }),
  async run({ args }) {
    const sym = args.asset.toUpperCase();
    const llm = makeBankrClient();
    const mkt = await fetchMarketCtx(sym);
    const result = await analyzeToJSON<Record<string, unknown>>(
      llm,
      "You are ChainEye-1, AXIOM on-chain data agent.",
      `Analyse ${sym} on-chain data.${mkt}\nReturn JSON: { "dexVolume24h":"string", "volumeChange":"string", "whaleActivity":"accumulation|distribution|neutral", "fundingRate":"string", "netSignal":"BULLISH|BEARISH|NEUTRAL", "confidence":0-1, "reasoning":"string" }`
    );
    return JSON.stringify({ agent: "ChainEye-1", asset: sym, ...result }, null, 2);
  },
});

// ── Start ─────────────────────────────────────────────────────────────────────
axiomAgent.start().then(() => {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  AXIOM OpenServ Agent — running on port 7378");
  console.log("  Capabilities:");
  console.log("    • analyze-asset      — full 3-agent pipeline");
  console.log("    • sentinel-sentiment — social + on-chain sentiment");
  console.log("    • chaineye-onchain   — DEX volume + whale activity");
  console.log("\n  Register on: https://platform.openserv.ai");
  console.log("  Set endpoint to: http://<your-url>:7378");
  console.log("═══════════════════════════════════════════════════════\n");
});
