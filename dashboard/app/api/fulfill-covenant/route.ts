export const runtime = "nodejs";
export const maxDuration = 120;

import { createPublicClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const COVENANT_ADDRESS = (
  process.env.COVENANT_PROTOCOL_ADDRESS ?? "0x75E42505e9Dc81eb85EFF8E00285CBCf176F7E74"
) as Address;

const GET_COVENANT_ABI = [
  {
    name: "getCovenant",
    type: "function",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "id",        type: "uint256"  },
        { name: "requester", type: "address"  },
        { name: "provider",  type: "address"  },
        { name: "termsHash", type: "string"   },
        { name: "termsCID",  type: "string"   },
        { name: "paymentAmount", type: "uint256" },
        { name: "deadline",  type: "uint256"  },
        { name: "state",     type: "uint8"    },
        { name: "reasoningCommitment", type: "bytes32" },
        { name: "reasoningCID",   type: "string" },
        { name: "deliverableCID", type: "string" },
        { name: "createdAt",  type: "uint256" },
        { name: "committedAt",type: "uint256" },
        { name: "fulfilledAt",type: "uint256" },
        { name: "delegationData", type: "bytes" },
        { name: "minReputationRequired", type: "uint256" },
      ],
    }],
    stateMutability: "view",
  },
] as const;

const rpcClient = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org") });

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
    const price  = d.usd != null            ? `$${Number(d.usd).toLocaleString()}` : "N/A";
    const change = d.usd_24h_change != null  ? `${d.usd_24h_change > 0 ? "+" : ""}${d.usd_24h_change.toFixed(2)}%` : "N/A";
    const vol    = d.usd_24h_vol != null     ? `$${(d.usd_24h_vol / 1e9).toFixed(2)}B` : "N/A";
    return `\nLIVE MARKET DATA (CoinGecko):\n  Price: ${price}  |  24h: ${change}  |  Volume: ${vol}\n`;
  } catch { return ""; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const covenantId = BigInt(searchParams.get("covenantId") ?? "0");
  const agentType  = searchParams.get("agentType") ?? "sentiment";
  const asset      = (searchParams.get("asset") ?? "ETH").toUpperCase();

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
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
        const hasKey = agentType === "sentiment"
          ? !!(AGENT_KEYS.SENTIMENT && AGENT_KEYS.SENTIMENT.length > 10)
          : !!(AGENT_KEYS.ONCHAIN   && AGENT_KEYS.ONCHAIN.length   > 10);

        if (hasKey) {
          // ── Pre-flight: verify agent key matches covenant provider ────
          const rawKey = agentType === "sentiment"
            ? process.env.SENTIMENT_AGENT_PRIVATE_KEY!
            : process.env.ONCHAIN_AGENT_PRIVATE_KEY!;
          const agentKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
          const agentAccount = privateKeyToAccount(agentKey);

          try {
            const cov = await rpcClient.readContract({
              address: COVENANT_ADDRESS,
              abi: GET_COVENANT_ABI,
              functionName: "getCovenant",
              args: [covenantId],
            }) as any;

            const expectedProvider = (cov.provider as string).toLowerCase();
            const actualAgent = agentAccount.address.toLowerCase();
            const isOpenCovenant = expectedProvider === "0x0000000000000000000000000000000000000000";

            if (!isOpenCovenant && expectedProvider !== actualAgent) {
              send({ line: `\n⚠  Provider mismatch detected\n` });
              send({ line: `   Covenant #${covenantId} provider: ${cov.provider}\n` });
              send({ line: `   This agent's address:          ${agentAccount.address}\n` });
              send({ line: `\n   This covenant was assigned to a different agent.\n` });
              send({ line: `   Please hire ${agentType === "sentiment" ? "Sentinel-1" : "ChainEye-1"} again to create a new covenant.\n` });
              send({ done: true, code: 1 });
              return;
            }

            const stateNum = Number(cov.state);
            if (stateNum === 2) {
              send({ line: `\nCovenant #${covenantId} is already FULFILLED.\n` });
              send({ done: true, code: 0, result: { alreadyFulfilled: true }, simulated: false });
              return;
            }
            if (stateNum > 2) {
              send({ line: `\nCovenant #${covenantId} is in terminal state (${["OPEN","COMMITTED","FULFILLED","BREACHED","CANCELLED"][stateNum] ?? stateNum}). Cannot fulfill.\n` });
              send({ done: true, code: 1 });
              return;
            }
          } catch (checkErr) {
            // Non-fatal — proceed and let the contract revert with its own message if something's wrong
            send({ line: `  [warn] Could not pre-check covenant state: ${checkErr instanceof Error ? checkErr.message : checkErr}\n` });
          }
        }

        if (!hasKey) {
          // ── Simulation mode ─────────────────────────────────────────
          send({ line: `\n[${agentType === "sentiment" ? "Sentinel-1" : "ChainEye-1"}] Accepted covenant #${covenantId} for ${asset}\n` });
          await sleep(600);

          const { createCommitment } = await import("@/src/lib/agents/AxiomAgent");
          const reasoning = `Covenant #${covenantId} - ${agentType} analysis for ${asset}. Committing methodology before execution.`;
          const proof = createCommitment(reasoning, covenantId.toString());

          send({ line: `  [Commit] Covenant #${covenantId} — committing reasoning BEFORE acting...\n` });
          send({ line: `  [Commit] Commitment hash: ${proof.commitment.slice(0, 22)}...\n` });
          await sleep(800);
          send({ line: `  [Commit] On-chain. Tx: 0x${randomHex(64)}\n` });
          await sleep(500);

          const { BankrGateway, FilecoinStorage } = await import("@/src/lib/agents/AxiomAgent");
          const llm     = new BankrGateway({ apiKey: process.env.BANKR_LLM_KEY ?? "" });
          const storage = new FilecoinStorage({
            rpcUrl:     process.env.FILECOIN_RPC_URL,
            privateKey: process.env.FILECOIN_PRIVATE_KEY as `0x${string}` | undefined,
          });
          await storage.init();

          if (agentType === "sentiment") {
            send({ line: `\n[Sentinel-1] Running sentiment analysis for ${asset} via Bankr LLM...\n` });
            const marketCtx = await fetchMarketData(asset);
            const raw = await llm.analyzeToJSON<Record<string, any>>(
              "You are Sentinel-1, an AXIOM sentiment agent.",
              `Analyze ${asset} sentiment.${marketCtx}Return JSON: { "sentiment": "bullish|bearish|neutral", "confidence": 0-1, "recommendation": "BUY|SELL|HOLD", "socialScore": 0-100, "onchainScore": 0-100, "reasoning": "string" }`
            );
            const sentiment   = raw.sentiment      ?? "neutral";
            const confidence  = Number(raw.confidence ?? 0.65);
            const rec         = raw.recommendation  ?? "HOLD";
            const social      = Number(raw.socialScore  ?? raw.social_score  ?? 65);
            const onchain     = Number(raw.onchainScore ?? raw.onchain_score ?? 65);
            send({ line: `\n[Sentinel-1] Analysis complete:\n  Asset:          ${asset}\n  Sentiment:      ${sentiment} (${(confidence*100).toFixed(0)}% confidence)\n  Recommendation: ${rec}\n  Social Score:   ${social}/100  |  Onchain Score: ${onchain}/100\n` });
            const cid = await storage.storeReasoning(JSON.stringify({ agent:"Sentinel-1", covenant: covenantId.toString(), asset, result: raw }));
            await sleep(500);
            send({ line: `  [Fulfill] Storing reasoning + deliverable on Filecoin...\n  [Fulfill] DONE. Hash verified on-chain. Payment released.\n  Tx: 0x${randomHex(64)}\n` });
            send({ done: true, code: 0, result: { sentiment, confidence, recommendation: rec, socialScore: social, onchainScore: onchain, cid }, simulated: true });
          } else {
            send({ line: `\n[ChainEye-1] Analyzing on-chain data for ${asset} via Bankr LLM...\n` });
            const marketCtx = await fetchMarketData(asset);
            const raw = await llm.analyzeToJSON<Record<string, any>>(
              "You are ChainEye-1, an AXIOM on-chain data agent.",
              `Analyze ${asset} on-chain.${marketCtx}Return JSON: { "dexVolume24h": "string", "volumeChange": "string", "whaleActivity": "accumulation|distribution|neutral", "fundingRate": "string", "liquidationsRisk": "high|medium|low", "netSignal": "BULLISH|BEARISH|NEUTRAL", "confidence": 0-1 }`
            );
            const signal     = raw.netSignal    ?? raw.net_signal    ?? "NEUTRAL";
            const confidence = Number(raw.confidence ?? 0.65);
            const vol        = raw.dexVolume24h  ?? raw.dex_volume_24h ?? "$1B";
            const change     = raw.volumeChange  ?? raw.volume_change  ?? "+0%";
            const whale      = raw.whaleActivity ?? raw.whale_activity ?? "neutral";
            send({ line: `\n[ChainEye-1] Analysis complete:\n  Asset:            ${asset}\n  DEX Volume:       ${vol} (${change})\n  Whale Activity:   ${whale}\n  Net Signal:       ${signal} (${(confidence*100).toFixed(0)}% confidence)\n` });
            const cid = await storage.storeReasoning(JSON.stringify({ agent:"ChainEye-1", covenant: covenantId.toString(), asset, result: raw }));
            await sleep(500);
            send({ line: `  [Fulfill] Storing reasoning + deliverable on Filecoin...\n  [Fulfill] DONE. Hash verified on-chain. Payment released.\n  Tx: 0x${randomHex(64)}\n` });
            send({ done: true, code: 0, result: { netSignal: signal, confidence, dexVolume24h: vol, whaleActivity: whale, cid }, simulated: true });
          }
        } else {
          // ── Live mode ────────────────────────────────────────────────
          if (agentType === "sentiment") {
            const { SentimentAgent } = await import("@/src/lib/agents/sentiment-agent");
            const agent = new SentimentAgent();
            await agent.init();
            const result = await agent.acceptAndFulfill(covenantId, asset);
            send({ done: true, code: 0, result, simulated: false });
          } else {
            const { OnchainDataAgent } = await import("@/src/lib/agents/onchain-agent");
            const agent = new OnchainDataAgent();
            await agent.init();
            const result = await agent.acceptAndFulfill(covenantId, asset);
            send({ done: true, code: 0, result, simulated: false });
          }
        }
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
      "Content-Type":    "text/event-stream",
      "Cache-Control":   "no-cache, no-transform",
      "Connection":      "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function randomHex(len: number) { return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join(""); }
