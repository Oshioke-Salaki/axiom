import { privateKeyToAccount } from "viem/accounts";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const asset = (searchParams.get("asset") ?? "ETH").toUpperCase().slice(0, 12);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      // Intercept console.log so agent code streams directly to the terminal
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") + "\n";
        send({ line });
        originalLog(...args);
      };

      try {
        const { AGENT_KEYS } = await import("@/src/lib/agents/config");

        const hasKeys = !!(AGENT_KEYS.MASTER && AGENT_KEYS.MASTER.length > 10);

        send({ line: "$ npx tsx demo-pipeline.ts\n", isCommand: true });

        if (!hasKeys) {
          // ----------------------------------------------------------------
          // Dry-run mode — real LLM, real Filecoin sim, no on-chain txs
          // ----------------------------------------------------------------
          const { runDryPipeline } = await import("@/src/lib/agents/pipeline");
          await runDryPipeline(asset);
        } else {
          // ----------------------------------------------------------------
          // Live mode — real on-chain transactions on Base Sepolia
          // ----------------------------------------------------------------
          const { MasterAgent } = await import("@/src/lib/agents/master-agent");

          const sentimentAddress = (
            process.env.SENTIMENT_AGENT_ADDRESS ||
            (AGENT_KEYS.SENTIMENT ? privateKeyToAccount(AGENT_KEYS.SENTIMENT).address : "")
          ) as `0x${string}`;

          const onchainAddress = (
            process.env.ONCHAIN_AGENT_ADDRESS ||
            (AGENT_KEYS.ONCHAIN ? privateKeyToAccount(AGENT_KEYS.ONCHAIN).address : "")
          ) as `0x${string}`;

          const master = new MasterAgent();
          await master.init();
          await master.runResearchPipeline(asset, sentimentAddress, onchainAddress, {
            sentimentEth: "0.001",
            onchainEth:   "0.001",
          });
        }

        send({ done: true, code: 0, simulated: !hasKeys });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ line: `Error: ${msg}\n`, isError: true });
        send({ done: true, code: 1, simulated: false });
      } finally {
        console.log = originalLog;
        controller.close();
      }
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
