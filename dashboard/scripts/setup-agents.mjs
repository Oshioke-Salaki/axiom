/**
 * AXIOM Agent Wallet Setup
 * Run: node scripts/setup-agents.mjs
 *
 * Generates fresh private keys for Sentinel-1 and ChainEye-1,
 * writes .env.local in the dashboard root.
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env.local");

// ── Read existing env vars so we don't clobber them ──────────────────────────
const existing = {};
if (existsSync(envPath)) {
  readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
      const [k, ...v] = line.split("=");
      if (k) existing[k.trim()] = v.join("=").trim();
    });
  console.log("📄  Found existing .env.local — will merge (not overwrite).\n");
}

// ── Generate keys ─────────────────────────────────────────────────────────────
const sentimentKey = existing.SENTIMENT_AGENT_PRIVATE_KEY || generatePrivateKey();
const onchainKey   = existing.ONCHAIN_AGENT_PRIVATE_KEY   || generatePrivateKey();
const nexusKey     = existing.NEXUS_AGENT_PRIVATE_KEY     || generatePrivateKey();

const sentimentAccount = privateKeyToAccount(sentimentKey);
const onchainAccount   = privateKeyToAccount(onchainKey);
const nexusAccount     = privateKeyToAccount(nexusKey);

const isNewSentiment = !existing.SENTIMENT_AGENT_PRIVATE_KEY;
const isNewOnchain   = !existing.ONCHAIN_AGENT_PRIVATE_KEY;
const isNewNexus     = !existing.NEXUS_AGENT_PRIVATE_KEY;

// ── Write .env.local ──────────────────────────────────────────────────────────
const merged = {
  ...existing,
  SENTIMENT_AGENT_PRIVATE_KEY: sentimentKey,
  ONCHAIN_AGENT_PRIVATE_KEY:   onchainKey,
  NEXUS_AGENT_PRIVATE_KEY:     nexusKey,
};

const content = Object.entries(merged)
  .filter(([k]) => k)
  .map(([k, v]) => `${k}=${v}`)
  .join("\n") + "\n";

writeFileSync(envPath, content);

// ── Print results ─────────────────────────────────────────────────────────────
console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║              AXIOM Agent Wallets Ready                      ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

console.log(`Sentinel-1 (sentiment agent)`);
console.log(`  Address:  ${sentimentAccount.address}`);
console.log(`  Key:      ${sentimentKey.slice(0,10)}... ${isNewSentiment ? "✨ NEW" : "♻️  EXISTING"}\n`);

console.log(`ChainEye-1 (onchain-data agent)`);
console.log(`  Address:  ${onchainAccount.address}`);
console.log(`  Key:      ${onchainKey.slice(0,10)}... ${isNewOnchain ? "✨ NEW" : "♻️  EXISTING"}\n`);

console.log(`Nexus-1 (orchestrator agent)`);
console.log(`  Address:  ${nexusAccount.address}`);
console.log(`  Key:      ${nexusKey.slice(0,10)}... ${isNewNexus ? "✨ NEW" : "♻️  EXISTING"}\n`);

console.log("✅  .env.local written.\n");

if (isNewSentiment || isNewOnchain || isNewNexus) {
  console.log("══ NEXT STEPS ══════════════════════════════════════════════════");
  console.log("");
  console.log("1. Fund both agent wallets with Base Sepolia ETH (~0.01 ETH each):");
  console.log("   Faucet: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet");
  console.log("   (or bridge from another faucet: https://faucet.quicknode.com/base/sepolia)");
  console.log("");
  console.log("2. Open the AXIOM dashboard and click 'Bootstrap Agents' button.");
  console.log("   (This registers both agents on-chain using their own keys)");
  console.log("");
  console.log("3. Restart your dev server:  npm run dev");
  console.log("");
  console.log("After that, hiring an agent will complete the FULL on-chain loop:");
  console.log("  createCovenant → commitReasoning → fulfillCovenant → payment released");
  console.log("════════════════════════════════════════════════════════════════");
} else {
  console.log("Agent keys already existed — no new wallets generated.");
  console.log("Restart dev server to pick up .env.local:  npm run dev");
}
