export const runtime = "nodejs";

/**
 * GET  /api/admin/bootstrap-agents
 *   Returns agent addresses derived from private keys + their registration status.
 *   The frontend uses this to know which agents need to be registered,
 *   then signs with the user's MetaMask wallet (no ETH needed in agent wallets).
 *
 * POST /api/admin/bootstrap-agents
 *   (Legacy: server-side self-registration. Only works if agent wallets are funded.)
 */

import { createPublicClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const REGISTRY_ADDRESS = (
  process.env.AGENT_REGISTRY_ADDRESS ?? ""
) as Address;

const REGISTRY_ABI = [
  {
    inputs: [{ internalType: "address", name: "agentAddress", type: "address" }],
    name: "isRegistered",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const AGENT_SPECS = [
  { keyEnv: "SENTIMENT_AGENT_PRIVATE_KEY", name: "Sentinel-1", type: "sentiment",    cid: "bafybeisimsentinel1axiomconstitution" },
  { keyEnv: "ONCHAIN_AGENT_PRIVATE_KEY",   name: "ChainEye-1", type: "onchain-data", cid: "bafybeisimchaineye1axiomconstitution"  },
  { keyEnv: "NEXUS_AGENT_PRIVATE_KEY",     name: "Nexus-1",    type: "orchestrator", cid: "bafybeisimnexus1axiomconstitution"     },
] as const;

export async function GET() {
  const rpcUrl = process.env.BASE_RPC_URL ?? process.env.BASE_SEPOLIA_RPC_URL ?? "https://mainnet.base.org";
  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });

  const agents = await Promise.all(
    AGENT_SPECS.map(async (spec) => {
      const rawKey = process.env[spec.keyEnv];
      if (!rawKey || rawKey.length < 10) {
        return { name: spec.name, type: spec.type, cid: spec.cid, address: null, isRegistered: false, error: `${spec.keyEnv} not set` };
      }
      const key = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
      const account = privateKeyToAccount(key);
      const isRegistered = await publicClient
        .readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "isRegistered", args: [account.address] })
        .catch(() => false);
      return { name: spec.name, type: spec.type, cid: spec.cid, address: account.address, isRegistered };
    }),
  );

  return Response.json({ ok: true, registryAddress: REGISTRY_ADDRESS, agents });
}
