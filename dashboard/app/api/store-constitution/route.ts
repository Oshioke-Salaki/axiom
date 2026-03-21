export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, agentType, capabilities, restrictions, author } = body;

    if (!name || !agentType) {
      return Response.json({ error: "name and agentType are required" }, { status: 400 });
    }

    const { FilecoinStorage } = await import("@/src/lib/agents/AxiomAgent");

    const storage = new FilecoinStorage({
      rpcUrl:     process.env.FILECOIN_RPC_URL,
      privateKey: process.env.FILECOIN_PRIVATE_KEY as `0x${string}` | undefined,
    });
    await storage.init();

    const constitution = {
      name,
      agentType,
      version: "1.0.0",
      capabilities: capabilities ?? [],
      restrictions:  restrictions  ?? [],
      author:        author        ?? "anonymous",
      createdAt:     new Date().toISOString(),
    };

    const cid = await storage.storeConstitution(constitution);

    return Response.json({ cid, constitution });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
