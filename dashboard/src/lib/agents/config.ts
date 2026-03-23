// @ts-nocheck
// Config for agents running inside the Next.js API route.
// Env vars are injected by Next.js / Vercel — no dotenv loading needed.

export const DEPLOYED_CONTRACTS = {
  AGENT_REGISTRY:   (process.env.AGENT_REGISTRY_ADDRESS   ?? "") as `0x${string}`,
  COVENANT_PROTOCOL:(process.env.COVENANT_PROTOCOL_ADDRESS ?? "") as `0x${string}`,
  REPUTATION_SYSTEM:(process.env.REPUTATION_SYSTEM_ADDRESS ?? "") as `0x${string}`,
};

export const NETWORK = {
  RPC_URL:  process.env.BASE_RPC_URL ?? process.env.BASE_SEPOLIA_RPC_URL ?? "https://mainnet.base.org",
  CHAIN_ID: 8453,
};

export const BANKR_CONFIG = {
  API_KEY:       process.env.BANKR_LLM_KEY ?? "",
  DEFAULT_MODEL: (process.env.DEFAULT_LLM_MODEL ?? "claude-sonnet-4-6") as string,
};

export const FILECOIN_CONFIG = {
  RPC_URL:     process.env.FILECOIN_RPC_URL ?? "https://api.node.glif.io/rpc/v1",
  PRIVATE_KEY: (process.env.FILECOIN_PRIVATE_KEY ?? "") as `0x${string}`,
};

export const AGENT_KEYS = {
  MASTER:    (process.env.MASTER_AGENT_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? "") as `0x${string}`,
  SENTIMENT: (process.env.SENTIMENT_AGENT_PRIVATE_KEY ?? "") as `0x${string}`,
  ONCHAIN:   (process.env.ONCHAIN_AGENT_PRIVATE_KEY  ?? "") as `0x${string}`,
  EXECUTOR:  (process.env.EXECUTOR_AGENT_PRIVATE_KEY  ?? "") as `0x${string}`,
  NEXUS:     (process.env.NEXUS_AGENT_PRIVATE_KEY ?? "") as `0x${string}`,
};

export const AXIOM_BASE_CONFIG = {
  registryAddress:   DEPLOYED_CONTRACTS.AGENT_REGISTRY,
  covenantAddress:   DEPLOYED_CONTRACTS.COVENANT_PROTOCOL,
  reputationAddress: DEPLOYED_CONTRACTS.REPUTATION_SYSTEM,
  rpcUrl:            NETWORK.RPC_URL,
  chainId:           NETWORK.CHAIN_ID,
  bankrApiKey:       BANKR_CONFIG.API_KEY,
  defaultModel:      BANKR_CONFIG.DEFAULT_MODEL,
  filecoinRpcUrl:    FILECOIN_CONFIG.RPC_URL,
  filecoinPrivateKey:FILECOIN_CONFIG.PRIVATE_KEY || undefined,
};
