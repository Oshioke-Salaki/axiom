export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { task, asset, payment, provider, requester } = body;

    const { FilecoinStorage } = await import("@/src/lib/agents/AxiomAgent");
    const storage = new FilecoinStorage({
      rpcUrl:     process.env.FILECOIN_RPC_URL,
      privateKey: process.env.FILECOIN_PRIVATE_KEY as `0x${string}` | undefined,
    });
    await storage.init();

    const terms = {
      task:      task      ?? `Analyze ${asset} market`,
      asset:     asset     ?? "ETH",
      payment:   payment   ?? "0.001 ETH",
      provider:  provider  ?? "",
      requester: requester ?? "",
      deadline:  new Date(Date.now() + 600_000).toISOString(), // 10 min
      createdAt: new Date().toISOString(),
    };

    const cid = await storage.storeTerms(terms);
    return Response.json({ cid, terms });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
