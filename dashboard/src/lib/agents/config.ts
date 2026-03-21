// @ts-nocheck
// Config for agents running inside the Next.js API route.
// Env vars are injected by Next.js / Vercel — no dotenv loading needed.

export const DEPLOYED_CONTRACTS = {
  AGENT_REGISTRY:   (process.env.AGENT_REGISTRY_ADDRESS   ?? "0xB59726f55EB180832b56232DdF24d289aF86B491") as `0x${string}`,
  COVENANT_PROTOCOL:(process.env.COVENANT_PROTOCOL_ADDRESS ?? "0x75E42505e9Dc81eb85EFF8E00285CBCf176F7E74") as `0x${string}`,
  REPUTATION_SYSTEM:(process.env.REPUTATION_SYSTEM_ADDRESS ?? "0x196f28023E063CDb0D2EDeD22ddE18b6C5c2F6a2") as `0x${string}`,
};

export const NETWORK = {
  RPC_URL:  process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
  CHAIN_ID: 84532,
};

export const BANKR_CONFIG = {
  API_KEY:       process.env.BANKR_LLM_KEY ?? "",
  DEFAULT_MODEL: (process.env.DEFAULT_LLM_MODEL ?? "claude-sonnet-4-6") as string,
};

export const FILECOIN_CONFIG = {
  RPC_URL:     process.env.FILECOIN_RPC_URL ?? "https://api.calibration.node.glif.io/rpc/v1",
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
