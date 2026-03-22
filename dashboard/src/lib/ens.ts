/**
 * ENS (Ethereum Name Service) utilities for AXIOM
 * Replaces hex addresses with human-readable ENS names throughout the UI.
 * Resolution uses Ethereum mainnet (where ENS lives).
 */

import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

const ensClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth.llamarpc.com"), // free public RPC
});

// In-memory cache so we don't re-query the same address
const cache = new Map<string, string | null>();

/**
 * Resolve an address to its ENS name (reverse lookup).
 * Returns null if no ENS name is registered.
 */
export async function resolveEnsName(address: string): Promise<string | null> {
  const key = address.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  try {
    const name = await ensClient.getEnsName({ address: address as `0x${string}` });
    cache.set(key, name ?? null);
    return name ?? null;
  } catch {
    cache.set(key, null);
    return null;
  }
}

/**
 * Resolve an ENS name to an address (forward lookup).
 * Returns null if the name doesn't resolve.
 */
export async function resolveEnsAddress(name: string): Promise<string | null> {
  try {
    const address = await ensClient.getEnsAddress({ name: normalize(name) });
    return address ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve multiple addresses in parallel.
 */
export async function resolveMany(
  addresses: string[]
): Promise<Record<string, string | null>> {
  const results = await Promise.all(
    addresses.map(async (addr) => [addr, await resolveEnsName(addr)] as const)
  );
  return Object.fromEntries(results);
}

/**
 * Format an address for display — ENS name if available, otherwise shortened hex.
 */
export function formatAddress(
  address: string,
  ensName: string | null | undefined,
  short = true
): string {
  if (ensName) return ensName;
  if (short) return `${address.slice(0, 6)}…${address.slice(-4)}`;
  return address;
}

// ── Known AXIOM agent ENS names ─────────────────────────────────────────────
// These map agent addresses to their ENS identities.
// Register these subdomains under axiom.eth on ENS (Sepolia or mainnet).
export const AGENT_ENS_NAMES: Record<string, string> = {
  "0xb532a579c2d30a1fcc1ae73180dc4f02a6150e0c": "nexus-1.axiom.eth",
  "0xca8eb63d342581fc9057384a8e10b9630d44c08d": "sentinel-1.axiom.eth",
  "0xbe562d6bd57cf703f642aa79a056a7508f37dfab": "chaineye-1.axiom.eth",
};

/**
 * Get display name for any address — checks agent ENS map first,
 * then falls back to resolved ENS name, then shortened hex.
 */
export function getDisplayName(
  address: string,
  resolvedEns?: string | null
): string {
  const key = address.toLowerCase();
  if (AGENT_ENS_NAMES[key]) return AGENT_ENS_NAMES[key];
  if (resolvedEns) return resolvedEns;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
