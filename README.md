# AXIOM Protocol
### The Promise Layer for AI Agents

> *AI agents cannot make credible promises to each other. AXIOM fixes that.*

---

## The Problem

Multi-agent systems are fundamentally broken at scale. When Agent A hires Agent B, there's no way to verify what B actually did, whether its reasoning was honest, or whether it changed its story after the fact. Trust either collapses into a centralized coordinator or it's just vibes.

**AXIOM is the first protocol where AI agents can be held accountable to each other.**

---

## How It Works

Every AXIOM covenant has three phases:

```
1. CREATE    →  Requester locks payment in escrow on Base
2. COMMIT    →  Provider commits keccak256(reasoning+salt) ON-CHAIN before acting
3. FULFILL   →  Provider reveals reasoning + delivers work
               Hash verified on-chain → escrow releases automatically
               Full evidence stored permanently on Filecoin
```

If the reasoning doesn't match the commitment: rejected on-chain.
If the deadline passes without fulfillment: requester refunded, reputation slashed.

**The reasoning was committed before the action. It cannot be changed retroactively. Ever.**

---

## Architecture

| Layer | Technology | Purpose |
|---|---|---|
| **Identity** | Filecoin FOC | Agent constitutions anchored to immutable CIDs |
| **Covenants** | CovenantProtocol.sol on Base | Binding agreements with ETH escrow |
| **Accountability** | Commit-reveal on Base | Tamper-proof reasoning BEFORE action |
| **Storage** | Filecoin Onchain Cloud | Constitutions, reasoning, deliverables — forever |
| **Permissions** | MetaMask ERC-7715 | Scoped delegations as covenant caveats |
| **Payments** | x402 on Base | Agent-to-agent USDC settlement |
| **Inference** | Bankr LLM Gateway | Claude, Gemini, GPT — self-funded by agents |
| **Reputation** | ReputationSystem.sol | Portable on-chain score from covenant history |

---

## Smart Contracts (Base Sepolia / Base Mainnet)

| Contract | Purpose |
|---|---|
| `AgentRegistry.sol` | Register agents with Filecoin-backed constitutions |
| `CovenantProtocol.sol` | Create, commit, fulfill, and breach covenants |
| `ReputationSystem.sol` | Track agent reputation from on-chain covenant history |

---

## Demo: Autonomous Research-to-Trade Pipeline

```
You → deposits 0.002 ETH into master agent

Nexus-1 (orchestrator)
  → hires Sentinel-1 via covenant #0  (0.001 ETH escrowed)
  → hires ChainEye-1 via covenant #1  (0.001 ETH escrowed)

Sentinel-1 (sentiment agent)
  → commits reasoning hash ON-CHAIN   (before analyzing anything)
  → runs ETH sentiment analysis via Bankr LLM
  → reveals reasoning (hash verified) → deliverable stored on Filecoin
  → covenant fulfilled, payment received, reputation updated

ChainEye-1 (on-chain data agent)
  → commits reasoning hash ON-CHAIN   (before reading any data)
  → reads DEX volumes, whale wallets, funding rates
  → reveals reasoning (hash verified) → deliverable stored on Filecoin
  → covenant fulfilled, payment received, reputation updated

Nexus-1
  → synthesizes two verified signals
  → commits final decision hash
  → stores full pipeline audit log on Filecoin

OUTPUT: BUY ETH — 76% confidence, Low risk, 2% portfolio size
PROOF:  9 Filecoin CIDs, on-chain commitment hashes, 2 fulfilled covenants
```

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo> && cd axiom

# 2. Configure environment
cp .env.example .env
# Fill in: PRIVATE_KEY, BANKR_LLM_KEY, FILECOIN_PRIVATE_KEY

# 3. Deploy contracts to Base Sepolia
forge script script/Deploy.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast --verify

# 4. Run the demo (works in dry-run mode without keys)
cd agents && npm install
npx tsx demo-pipeline.ts

# 5. Launch the dashboard
cd ../dashboard && npm run dev
# Open http://localhost:3000
```

---

## Project Structure

```
axiom/
├── src/                           # Solidity contracts (Foundry)
│   ├── AgentRegistry.sol          # Agent identity + Filecoin constitution CID
│   ├── CovenantProtocol.sol       # Core covenant engine with commit-reveal
│   ├── ReputationSystem.sol       # Portable on-chain reputation
│   └── interfaces/
├── test/Axiom.t.sol               # 7 passing Foundry tests
├── script/Deploy.s.sol            # One-command deployment
├── agents/                        # Demo autonomous agents
│   ├── shared/AxiomAgent.ts       # Base agent class (inline SDK)
│   ├── master-agent.ts            # Nexus-1: pipeline orchestrator
│   ├── sentiment-agent.ts         # Sentinel-1: market sentiment
│   ├── onchain-agent.ts           # ChainEye-1: on-chain data
│   └── demo-pipeline.ts           # Full end-to-end runnable demo
├── sdk/src/                       # AXIOM TypeScript SDK (publishable)
│   ├── AxiomAgent.ts
│   ├── FilecoinStorage.ts
│   ├── BankrGateway.ts
│   └── CommitmentProof.ts
└── dashboard/                     # Next.js live dashboard
```

---

## Prize Tracks

| Track | Why AXIOM Wins |
|---|---|
| **Filecoin** (RFS-1, RFS-3) | Agentic storage SDK + portable reputation anchored to Filecoin |
| **MetaMask Delegation** | Sub-delegation chains + ERC-7715 caveats as covenant permissions |
| **Base Agent Services** | x402-paid agent endpoints, discoverable on-chain |
| **Bankr LLM Gateway** | Self-sustaining multi-model system funded by covenant fees |

---

## Why Filecoin is Essential

Without Filecoin:
- Agent constitutions can be mutated → identity is fake
- Reasoning documents can be deleted → accountability is fake
- Audit trails can be censored → trust is fake

With Filecoin:
- Every constitution is immutable → identity is real
- Every reasoning document is permanent → accountability is real
- Every execution log is tamper-proof → trust is cryptographic

**Filecoin isn't a storage add-on. It's what makes the promises real.**

---

*AXIOM — Built for ETHGlobal Agents*
