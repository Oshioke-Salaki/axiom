import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../.env") });

export const DEPLOYED_CONTRACTS = {
  AGENT_REGISTRY: (process.env.AGENT_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  COVENANT_PROTOCOL: (process.env.COVENANT_PROTOCOL_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  REPUTATION_SYSTEM: (process.env.REPUTATION_SYSTEM_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
};

export const NETWORK = {
  RPC_URL: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
  CHAIN_ID: 84532,  // Base Sepolia
};

export const BANKR_CONFIG = {
  API_KEY: process.env.BANKR_LLM_KEY ?? "",
  DEFAULT_MODEL: (process.env.DEFAULT_LLM_MODEL ?? "claude-sonnet-4-6") as string,
};

export const FILECOIN_CONFIG = {
  RPC_URL: process.env.FILECOIN_RPC_URL ?? "https://api.calibration.node.glif.io/rpc/v1",
  PRIVATE_KEY: (process.env.FILECOIN_PRIVATE_KEY ?? "") as `0x${string}`,
};

// Agent private keys — in production these would be separate wallets
export const AGENT_KEYS = {
  MASTER: (process.env.MASTER_AGENT_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? "") as `0x${string}`,
  SENTIMENT: (process.env.SENTIMENT_AGENT_PRIVATE_KEY ?? "") as `0x${string}`,
  ONCHAIN: (process.env.ONCHAIN_AGENT_PRIVATE_KEY ?? "") as `0x${string}`,
  EXECUTOR: (process.env.EXECUTOR_AGENT_PRIVATE_KEY ?? "") as `0x${string}`,
};

export const AXIOM_BASE_CONFIG = {
  registryAddress: DEPLOYED_CONTRACTS.AGENT_REGISTRY,
  covenantAddress: DEPLOYED_CONTRACTS.COVENANT_PROTOCOL,
  reputationAddress: DEPLOYED_CONTRACTS.REPUTATION_SYSTEM,
  rpcUrl: NETWORK.RPC_URL,
  chainId: NETWORK.CHAIN_ID,
  bankrApiKey: BANKR_CONFIG.API_KEY,
  defaultModel: BANKR_CONFIG.DEFAULT_MODEL,
  filecoinRpcUrl: FILECOIN_CONFIG.RPC_URL,
  filecoinPrivateKey: FILECOIN_CONFIG.PRIVATE_KEY || undefined,
};
