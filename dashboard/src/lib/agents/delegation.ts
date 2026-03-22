/**
 * AXIOM — MetaMask Delegation Framework (ERC-7715)
 *
 * Nexus-1 (orchestrator) creates on-chain delegations to Sentinel-1 and
 * ChainEye-1 before they may act. Each delegation is scoped via an
 * AllowedTargets caveat — sub-agents can only interact with the AXIOM
 * Covenant contract. The chain: Nexus-1 → Sentinel-1, Nexus-1 → ChainEye-1.
 */

import {
  signDelegation,
  redeemDelegations,
  createExecution,
  ExecutionMode,
  ROOT_AUTHORITY,
  createCaveat,
  getDeleGatorEnvironment,
} from "@metamask/delegation-toolkit";
import {
  encodeAbiParameters,
  parseAbiParameters,
  encodePacked,
  type Address,
  type Hex,
  type WalletClient,
  type PublicClient,
} from "viem";
import { privateKeyToAddress } from "viem/accounts";

const BASE_SEPOLIA_CHAIN_ID = 84532;

export type SignedDelegation = {
  delegate: Address;
  delegator: Address;
  authority: Hex;
  caveats: { enforcer: Address; terms: Hex; args: Hex }[];
  salt: Hex;
  signature: Hex;
};

export type DelegationChain = {
  sentinelDelegation: SignedDelegation;
  chainEyeDelegation: SignedDelegation;
  delegationManager: Address;
  chainId: number;
};

/**
 * Creates and signs ERC-7715 delegations from Nexus-1 to its sub-agents.
 * Each delegation is restricted via AllowedTargets caveat — sub-agents may
 * only call the AXIOM Covenant contract.
 */
export async function createAgentDelegations(opts: {
  nexusPrivateKey: Hex;
  sentinelAddress: Address;
  chainEyeAddress: Address;
  covenantAddress: Address;
  covenantId: bigint;
}): Promise<DelegationChain> {
  const { nexusPrivateKey, sentinelAddress, chainEyeAddress, covenantAddress, covenantId } = opts;

  const env = getDeleGatorEnvironment(BASE_SEPOLIA_CHAIN_ID);
  const delegationManager = env.DelegationManager as Address;
  const nexusAddress = privateKeyToAddress(nexusPrivateKey);

  // AllowedTargets caveat — sub-agents can ONLY call the covenant contract
  // Enforcer expects packed addresses (20 bytes each), NOT ABI-encoded array
  const terms = encodePacked(["address"], [covenantAddress]);
  const allowedTargetsCaveat = createCaveat(
    env.caveatEnforcers.AllowedTargetsEnforcer as Address,
    terms as Hex
  );

  // LimitedCalls caveat — each delegation usable only once (commit + fulfill = 2 calls max)
  const limitedCallsEnforcer = env.caveatEnforcers.LimitedCallsEnforcer as Address;
  const { encodeAbiParameters: enc, parseAbiParameters: par } = await import("viem");
  const callLimitTerms = enc(par("uint256"), [2n]) as Hex;
  const limitedCallsCaveat = createCaveat(limitedCallsEnforcer, callLimitTerms);

  const caveats = [allowedTargetsCaveat, limitedCallsCaveat] as SignedDelegation["caveats"];

  // Unique salt per covenant so delegations are non-replayable across pipelines
  const saltBase = BigInt(covenantId) * 1000n;

  // Nexus-1 → Sentinel-1 delegation
  const sentinelDelegation = {
    delegate: sentinelAddress,
    delegator: nexusAddress,
    authority: ROOT_AUTHORITY as Hex,
    caveats,
    salt: `0x${(saltBase + 1n).toString(16).padStart(64, "0")}` as Hex,
  };

  const sentinelSig = await signDelegation({
    privateKey: nexusPrivateKey,
    delegation: sentinelDelegation as any,
    delegationManager,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    allowInsecureUnrestrictedDelegation: false,
  });

  // Nexus-1 → ChainEye-1 delegation
  const chainEyeDelegation = {
    delegate: chainEyeAddress,
    delegator: nexusAddress,
    authority: ROOT_AUTHORITY as Hex,
    caveats,
    salt: `0x${(saltBase + 2n).toString(16).padStart(64, "0")}` as Hex,
  };

  const chainEyeSig = await signDelegation({
    privateKey: nexusPrivateKey,
    delegation: chainEyeDelegation as any,
    delegationManager,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    allowInsecureUnrestrictedDelegation: false,
  });

  return {
    sentinelDelegation: { ...sentinelDelegation, signature: sentinelSig },
    chainEyeDelegation: { ...chainEyeDelegation, signature: chainEyeSig },
    delegationManager,
    chainId: BASE_SEPOLIA_CHAIN_ID,
  };
}

/**
 * Returns the DelegationManager contract address for Base Sepolia.
 * Sub-covenants must set this as their provider so that when the
 * DelegationManager executes calls on their behalf, msg.sender matches.
 */
export function getDelegationManagerAddress(): Address {
  return getDeleGatorEnvironment(BASE_SEPOLIA_CHAIN_ID).DelegationManager as Address;
}

/**
 * Redeems a signed delegation to execute a single contract call.
 * The sub-agent (delegate) calls the DelegationManager, which:
 *   1. Verifies Nexus-1's EIP-712 signature
 *   2. Enforces AllowedTargets caveat (target must be covenant contract)
 *   3. Enforces LimitedCalls caveat (max 2 per delegation)
 *   4. Executes the calldata with msg.sender = DelegationManager
 */
export async function redeemDelegationCall(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any;
  delegation: SignedDelegation;
  target: Address;
  callData: Hex;
}): Promise<Hex> {
  const { walletClient, publicClient, delegation, target, callData } = opts;
  const delegationManagerAddress = getDelegationManagerAddress();

  return await redeemDelegations(
    walletClient,
    publicClient,
    delegationManagerAddress,
    [
      {
        permissionContext: [delegation as any],
        executions: [createExecution({ target, callData })],
        mode: ExecutionMode.SingleDefault,
      },
    ]
  ) as Hex;
}
