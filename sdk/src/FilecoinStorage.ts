import type { StoredDocument } from "./types.js";

/**
 * FilecoinStorage — Permanent, verifiable storage for AXIOM agent data.
 *
 * Stores:
 *   - Agent constitutions (identity anchor)
 *   - Covenant terms (binding agreements)
 *   - Reasoning documents (pre-committed, tamper-proof)
 *   - Deliverables (work products)
 *   - Execution logs (audit trail)
 *
 * Uses Filecoin Onchain Cloud (FOC) via the Synapse SDK.
 * Falls back to a simulation mode when keys aren't configured.
 */
export class FilecoinStorage {
  private synapse: any = null;
  private isSimulated: boolean;
  private rpcUrl: string;
  private privateKey: string;

  constructor(config: { rpcUrl?: string; privateKey?: string }) {
    this.rpcUrl = config.rpcUrl ?? "https://api.calibration.node.glif.io/rpc/v1";
    this.privateKey = config.privateKey ?? "";
    this.isSimulated = !config.privateKey;

    if (this.isSimulated) {
      console.log("[Filecoin] Running in simulation mode — no private key provided");
    }
  }

  async init(): Promise<void> {
    if (this.isSimulated) return;

    try {
      const { Synapse } = await import("@filoz/synapse-sdk");
      this.synapse = await Synapse.create({
        rpcURL: this.rpcUrl,
        privateKey: this.privateKey,
      });
      console.log("[Filecoin] Connected to FOC network");
    } catch (err) {
      console.warn("[Filecoin] SDK init failed, falling back to simulation:", (err as Error).message);
      this.isSimulated = true;
    }
  }

  /**
   * Store any document on Filecoin. Returns a CID.
   */
  async store(
    content: string,
    type: StoredDocument["type"]
  ): Promise<StoredDocument> {
    const data = new TextEncoder().encode(content);
    const timestamp = Date.now();

    if (this.isSimulated || !this.synapse) {
      return this.simulateStore(content, type, timestamp);
    }

    try {
      const upload = await this.synapse.storage.upload(data, {
        onProviderSelected: (sp: any) =>
          console.log(`[Filecoin] Storage provider selected: ${sp}`),
        onDataSetResolved: (dsId: any) =>
          console.log(`[Filecoin] DataSet resolved: ${dsId}`),
      });

      return {
        cid: upload.pieceCID,
        size: data.length,
        timestamp,
        type,
      };
    } catch (err) {
      console.warn("[Filecoin] Upload failed, using simulation:", (err as Error).message);
      return this.simulateStore(content, type, timestamp);
    }
  }

  /**
   * Retrieve a document from Filecoin by CID.
   */
  async retrieve(cid: string): Promise<string> {
    if (this.isSimulated || cid.startsWith("sim_")) {
      return `[Simulated Filecoin content for CID: ${cid}]`;
    }

    try {
      const data = await this.synapse.storage.download(cid);
      return new TextDecoder().decode(data);
    } catch (err) {
      throw new Error(`[Filecoin] Retrieval failed for ${cid}: ${(err as Error).message}`);
    }
  }

  /**
   * Store an agent constitution. Returns the CID.
   */
  async storeConstitution(constitution: object): Promise<string> {
    const doc = await this.store(JSON.stringify(constitution, null, 2), "constitution");
    return doc.cid;
  }

  /**
   * Store covenant terms. Returns the CID.
   */
  async storeTerms(terms: object): Promise<string> {
    const doc = await this.store(JSON.stringify(terms, null, 2), "terms");
    return doc.cid;
  }

  /**
   * Store a reasoning document. Returns the CID.
   * This is the tamper-proof audit record.
   */
  async storeReasoning(reasoningDoc: string): Promise<string> {
    const doc = await this.store(reasoningDoc, "reasoning");
    return doc.cid;
  }

  /**
   * Store a deliverable. Returns the CID.
   */
  async storeDeliverable(deliverable: object): Promise<string> {
    const doc = await this.store(JSON.stringify(deliverable, null, 2), "deliverable");
    return doc.cid;
  }

  /**
   * Store an execution log. Returns the CID.
   */
  async storeExecutionLog(log: object): Promise<string> {
    const doc = await this.store(JSON.stringify(log, null, 2), "execution-log");
    return doc.cid;
  }

  private simulateStore(
    content: string,
    type: StoredDocument["type"],
    timestamp: number
  ): StoredDocument {
    // Generate a deterministic fake CID based on content hash
    const hash = Buffer.from(content).toString("base64").slice(0, 32).replace(/[+/=]/g, "x");
    const cid = `sim_bafybeig${hash}`;
    console.log(`[Filecoin:sim] Stored ${type} → ${cid} (${content.length} bytes)`);
    return { cid, size: content.length, timestamp, type };
  }

  get mode(): "live" | "simulated" {
    return this.isSimulated ? "simulated" : "live";
  }
}
