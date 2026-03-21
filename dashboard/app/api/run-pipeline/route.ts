import { spawn } from "child_process";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 120;

// Realistic simulation output when no private keys are configured
const SIM: Array<{ delay: number; text: string }> = [
  { delay: 100,  text: "======================================================================\n  AXIOM Protocol — Covenant Protocol for AI Agents\n  Demo Pipeline v1.0.0\n======================================================================\n" },
  { delay: 400,  text: "\n  [SIMULATION MODE — configure .env to run live]\n  Network: Base Sepolia (Chain 84532)\n  Registry: 0xB59726f55EB180832b56232DdF24d289aF86B491\n  Covenant: 0x75E42505e9Dc81eb85EFF8E00285CBCf176F7E74\n" },
  { delay: 800,  text: "\n============================================================\n  AXIOM Agent: Nexus-1\n  Address:     0x3C926EA189e8729929d29175b6f75481422295cA\n  Type:        orchestrator\n============================================================\n" },
  { delay: 600,  text: "  [Filecoin] Connected to FOC calibration network\n  [Filecoin:sim] Storing constitution...\n  Constitution CID: bafybeigewogICJuYW1lIjogIk5leHVzLTEi\n" },
  { delay: 900,  text: "  Registering on-chain...\n  Registered! Reputation: 300 (Provisional)\n" },
  { delay: 700,  text: "\n======================================================================\n  AXIOM PIPELINE: pipeline_ETH_demo\n  Asset: ETH  |  Budget: 0.001 + 0.001 ETH\n======================================================================\n" },
  { delay: 400,  text: "\n[PHASE 1] Hiring Sentiment Agent...\n" },
  { delay: 900,  text: "  [Covenant] Hiring 0xf0898B30...\n  [Covenant] #12 created. Payment: 0.001 ETH escrowed on Base\n" },
  { delay: 400,  text: "\n[PHASE 2] Hiring Onchain Data Agent...\n" },
  { delay: 900,  text: "  [Covenant] Hiring 0x12e70471...\n  [Covenant] #13 created. Payment: 0.001 ETH escrowed on Base\n" },
  { delay: 500,  text: "\n[PIPELINE] Both covenants created. Sub-agents now working...\n  Covenant #12 → Sentinel-1 (sentiment)\n  Covenant #13 → ChainEye-1 (onchain-data)\n" },
  { delay: 600,  text: "\n[PHASE 3] Sub-agents executing (covenant-bound)...\n" },
  { delay: 800,  text: "\n[Sentinel-1] Accepted covenant #12 for ETH\n" },
  { delay: 700,  text: "  [Commit] Covenant #12 — committing reasoning BEFORE acting...\n  [Commit] Commitment hash: 0x17366a2da2598ee1ee...\n  [Commit] On-chain. Tx: 0x879602acc937bd7d2a0f405989a40aa302f5b4cfa3ca808c189cd4ed5d7592cc\n" },
  { delay: 500,  text: "\n[Sentinel-1] Running sentiment analysis for ETH via Bankr LLM...\n" },
  { delay: 2200, text: "\n[Sentinel-1] Analysis complete:\n  Asset:          ETH\n  Sentiment:      bullish (71% confidence)\n  Recommendation: BUY\n  Social Score:   68/100  |  Onchain Score: 74/100\n" },
  { delay: 700,  text: "  [Fulfill] Storing reasoning + deliverable on Filecoin...\n  [Fulfill] DONE. Hash verified on-chain. Payment released.\n  Tx: 0xd144e243abf91a0571998f0c73805ef212a6efbb16ad22b2e1481e9c7531bcb4\n" },
  { delay: 800,  text: "\n[ChainEye-1] Accepted covenant #13 for ETH on-chain analysis\n" },
  { delay: 700,  text: "  [Commit] Covenant #13 — committing reasoning BEFORE acting...\n  [Commit] Commitment hash: 0x5bf49ec2f717775e62...\n  [Commit] On-chain. Tx: 0x37461f3f321c8be243831d81732b6f04999c6e7ad1c2ff8a9bcea28b75a92742\n" },
  { delay: 500,  text: "\n[ChainEye-1] Analyzing on-chain data for ETH via Bankr LLM...\n" },
  { delay: 2200, text: "\n[ChainEye-1] Analysis complete:\n  DEX Volume:       $1.8B (+7.4%)\n  Whale Activity:   accumulation\n  Funding Rate:     +0.018% per 8h\n  Liquidation Risk: medium\n  Net Signal:       BULLISH (63% confidence)\n" },
  { delay: 700,  text: "  [Fulfill] Storing reasoning + deliverable on Filecoin...\n  [Fulfill] DONE. Hash verified on-chain. Payment released.\n  Tx: 0x0c754f942cddf0cd496c935a1de573ee82e5cc9f0ef1ae965b1f2e84ac9fd990\n" },
  { delay: 700,  text: "\n[PHASE 4] Nexus-1 synthesizing verified signals...\n" },
  { delay: 1500, text: "[PHASE 4] Storing pipeline audit log on Filecoin...\n  CID: bafybeigewogICJwaXBlbGluZUlkIjogInBp\n" },
  { delay: 800,  text: "\n======================================================================\n  AXIOM PIPELINE COMPLETE\n======================================================================\n\n  Duration:   18.4s\n  Total Cost: 0.0020 ETH\n\n  Sub-agent Results:\n    Sentinel-1:  bullish @ 71% → BUY\n    ChainEye-1:  BULLISH @ 63%\n\n  FINAL DECISION:\n    Action:     BUY ETH\n    Confidence: 67%\n    Risk:       medium\n    Size:       3% of portfolio\n\n  On-chain Proof:\n    ✓ Covenant #12 — 0x879602... → 0xd144e2...\n    ✓ Covenant #13 — 0x37461f... → 0x0c754f...\n    ✓ Filecoin: bafybeigewogICJwaXBlbGluZUlkIjogInBp\n\n  Every reasoning commitment was stored on-chain BEFORE\n  the analysis ran. Retroactive tampering is impossible.\n======================================================================\n" },
];

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      const hasKeys = !!(process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length > 10);

      if (!hasKeys) {
        // Simulation mode — works everywhere including Vercel
        send({ line: "$ npx tsx demo-pipeline.ts\n", isCommand: true });
        for (const item of SIM) {
          await new Promise((r) => setTimeout(r, item.delay));
          send({ line: item.text });
        }
        send({ done: true, code: 0, simulated: true });
        controller.close();
        return;
      }

      // Live mode — spawns real pipeline process
      const agentsDir = path.resolve(process.cwd(), "../agents");
      send({ line: `$ npx tsx demo-pipeline.ts\n`, isCommand: true });

      const proc = spawn("npx", ["tsx", "demo-pipeline.ts"], {
        cwd: agentsDir,
        env: { ...process.env },
        shell: true,
      });

      proc.stdout.on("data", (data: Buffer) => send({ line: data.toString() }));
      proc.stderr.on("data", (data: Buffer) => {
        const msg = data.toString();
        if (!msg.includes("ExperimentalWarning") && !msg.includes("punycode") && !msg.includes("DeprecationWarning")) {
          send({ line: msg, isError: true });
        }
      });
      proc.on("close", (code: number) => {
        send({ done: true, code, simulated: false });
        controller.close();
      });
      proc.on("error", (err: Error) => {
        send({ line: `Error: ${err.message}\n`, isError: true });
        send({ done: true, code: 1, simulated: false });
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
