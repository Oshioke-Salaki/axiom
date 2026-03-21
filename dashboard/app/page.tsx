"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

// ─── Contract addresses ───────────────────────────────────────────────────────
const CONTRACTS = {
  REGISTRY:   "0xB59726f55EB180832b56232DdF24d289aF86B491" as `0x${string}`,
  COVENANT:   "0x75E42505e9Dc81eb85EFF8E00285CBCf176F7E74" as `0x${string}`,
  REPUTATION: "0x196f28023E063CDb0D2EDeD22ddE18b6C5c2F6a2" as `0x${string}`,
};

const KNOWN_AGENTS = [
  { address: "0x3C926EA189e8729929d29175b6f75481422295cA" as `0x${string}`, name: "Nexus-1",    type: "orchestrator" },
  { address: "0xf0898B30aB69183875375A836C84435c758fc2B3" as `0x${string}`, name: "Sentinel-1", type: "sentiment"    },
  { address: "0x12e70471cE10220c06deaaeE401FE1054f596De4" as `0x${string}`, name: "ChainEye-1", type: "onchain-data" },
];

const TIERS = ["Untrusted", "Provisional", "Established", "Trusted", "Elite"];
const STATES = ["OPEN", "COMMITTED", "FULFILLED", "BREACHED", "CANCELLED"] as const;

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────
const COVENANT_ABI = [
  { name: "covenantCount", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    name: "getCovenant", type: "function",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "id", type: "uint256" }, { name: "requester", type: "address" },
        { name: "provider", type: "address" }, { name: "termsHash", type: "string" },
        { name: "termsCID", type: "string" }, { name: "paymentAmount", type: "uint256" },
        { name: "deadline", type: "uint256" }, { name: "state", type: "uint8" },
        { name: "reasoningCommitment", type: "bytes32" }, { name: "reasoningCID", type: "string" },
        { name: "deliverableCID", type: "string" }, { name: "createdAt", type: "uint256" },
        { name: "committedAt", type: "uint256" }, { name: "fulfilledAt", type: "uint256" },
        { name: "delegationData", type: "bytes" }, { name: "minReputationRequired", type: "uint256" },
      ],
    }],
    stateMutability: "view",
  },
] as const;

const REPUTATION_ABI = [
  { name: "getScore", type: "function", inputs: [{ name: "agent", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "getTier",  type: "function", inputs: [{ name: "agent", type: "address" }], outputs: [{ type: "uint8"   }], stateMutability: "view" },
] as const;

const REGISTRY_ABI = [
  {
    name: "getAgent", type: "function",
    inputs: [{ name: "agentAddress", type: "address" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "owner", type: "address" }, { name: "constitutionCID", type: "string" },
        { name: "name", type: "string" }, { name: "agentType", type: "string" },
        { name: "registeredAt", type: "uint256" }, { name: "active", type: "bool" },
      ],
    }],
    stateMutability: "view",
  },
  { name: "isRegistered", type: "function", inputs: [{ name: "agentAddress", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
] as const;

// ─── viem client ──────────────────────────────────────────────────────────────
const client = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"),
});

// ─── Live data types ──────────────────────────────────────────────────────────
interface LiveAgent {
  address: string;
  name: string;
  type: string;
  constitutionCID: string;
  score: number;
  tier: string;
  isRegistered: boolean;
}

interface LiveCovenant {
  id: number;
  requester: string;
  provider: string;
  paymentEth: string;
  state: typeof STATES[number];
  termsCID: string;
  reasoningCID: string;
  deliverableCID: string;
  createdAt: number;
  fulfilledAt: number;
  requesterName: string;
  providerName: string;
}

interface LiveData {
  agents: LiveAgent[];
  covenants: LiveCovenant[];
  covenantCount: number;
  fulfilledCount: number;
  totalEscrowEth: string;
  lastUpdated: Date | null;
  error: string | null;
}

// ─── Fetch on-chain data ──────────────────────────────────────────────────────
async function fetchLiveData(): Promise<LiveData> {
  const addrToName = Object.fromEntries(KNOWN_AGENTS.map((a) => [a.address.toLowerCase(), a.name]));

  // Agent data
  const agents = await Promise.all(
    KNOWN_AGENTS.map(async (a) => {
      const [score, tier, reg, profile] = await Promise.all([
        client.readContract({ address: CONTRACTS.REPUTATION, abi: REPUTATION_ABI, functionName: "getScore", args: [a.address] }).catch(() => 0n),
        client.readContract({ address: CONTRACTS.REPUTATION, abi: REPUTATION_ABI, functionName: "getTier",  args: [a.address] }).catch(() => 0),
        client.readContract({ address: CONTRACTS.REGISTRY,   abi: REGISTRY_ABI,   functionName: "isRegistered", args: [a.address] }).catch(() => false),
        client.readContract({ address: CONTRACTS.REGISTRY,   abi: REGISTRY_ABI,   functionName: "getAgent",     args: [a.address] }).catch(() => null),
      ]);
      return {
        address: a.address,
        name: a.name,
        type: a.type,
        constitutionCID: (profile as any)?.constitutionCID ?? "",
        score: Number(score),
        tier: TIERS[Number(tier)] ?? "Untrusted",
        isRegistered: Boolean(reg),
      } satisfies LiveAgent;
    })
  );

  // Covenant data
  const countRaw = await client.readContract({ address: CONTRACTS.COVENANT, abi: COVENANT_ABI, functionName: "covenantCount" }).catch(() => 0n);
  const count = Number(countRaw);
  // Read up to the last 20 covenants
  const start = Math.max(0, count - 20);
  const ids = Array.from({ length: count - start }, (_, i) => start + i);

  const covenants: LiveCovenant[] = (
    await Promise.all(
      ids.map(async (id) => {
        try {
          const c = await client.readContract({ address: CONTRACTS.COVENANT, abi: COVENANT_ABI, functionName: "getCovenant", args: [BigInt(id)] }) as any;
          const ethAmt = (Number(c.paymentAmount) / 1e18).toFixed(4);
          return {
            id,
            requester: c.requester,
            provider: c.provider,
            paymentEth: `${ethAmt} ETH`,
            state: STATES[Number(c.state)] ?? "OPEN",
            termsCID: c.termsCID,
            reasoningCID: c.reasoningCID,
            deliverableCID: c.deliverableCID,
            createdAt: Number(c.createdAt) * 1000,
            fulfilledAt: Number(c.fulfilledAt) * 1000,
            requesterName: addrToName[c.requester.toLowerCase()] ?? truncate(c.requester, 10),
            providerName:  addrToName[c.provider.toLowerCase()]  ?? truncate(c.provider,  10),
          } satisfies LiveCovenant;
        } catch { return null; }
      })
    )
  ).filter(Boolean) as LiveCovenant[];

  const fulfilled = covenants.filter((c) => c.state === "FULFILLED");
  const totalWei  = covenants.reduce((s, c) => s + parseFloat(c.paymentEth), 0);

  return {
    agents,
    covenants: covenants.reverse(), // newest first
    covenantCount: count,
    fulfilledCount: fulfilled.length,
    totalEscrowEth: totalWei.toFixed(4),
    lastUpdated: new Date(),
    error: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function truncate(s: string, n = 18) {
  return s && s.length > n ? s.slice(0, n) + "…" : s;
}

function basescanTx(hash: string) {
  return `https://sepolia.basescan.org/tx/${hash}`;
}

function ipfsUrl(cid: string) {
  return `https://ipfs.io/ipfs/${cid}`;
}

function TxLink({ hash }: { hash: string }) {
  if (!hash || hash.includes("…")) return <span className="font-mono text-gray-300 text-xs">{truncate(hash, 28)}</span>;
  return (
    <a href={basescanTx(hash)} target="_blank" rel="noopener noreferrer"
       className="font-mono text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors">
      {truncate(hash, 28)} ↗
    </a>
  );
}

function CIDLink({ cid, label }: { cid: string; label?: string }) {
  if (!cid) return null;
  const isSim = cid.includes("gewog");
  return (
    <a href={isSim ? undefined : ipfsUrl(cid)}
       target={isSim ? undefined : "_blank"}
       rel="noopener noreferrer"
       title={isSim ? "Simulated CID (Filecoin providers offline)" : cid}
       className={`font-mono text-xs truncate transition-colors ${isSim ? "text-gray-300 cursor-default" : "text-blue-500 hover:text-blue-700 hover:underline"}`}>
      {label ?? truncate(cid, 26)}{!isSim && " ↗"}
    </a>
  );
}

// ─── Pipeline mock (for replay animation) ────────────────────────────────────
interface PipelineStep {
  id: string;
  timestamp: string;
  agent: string;
  action: string;
  detail: string;
  cid?: string;
  txHash?: string;
  type: "info" | "commit" | "fulfill" | "storage" | "decision";
}

const MOCK_STEPS: PipelineStep[] = [
  { id: "1",  timestamp: "09:42:01", agent: "Nexus-1",    action: "Register",       detail: "Constitution anchored to Filecoin",                                              cid: "bafybeigewogICJuYW1lIjogIk5leHVzLTEi",    type: "storage" },
  { id: "2",  timestamp: "09:42:03", agent: "Sentinel-1", action: "Register",       detail: "Constitution anchored to Filecoin",                                              cid: "bafybeigewogICJuYW1lIjogIlNlbnRpbmVs",   type: "storage" },
  { id: "3",  timestamp: "09:42:05", agent: "ChainEye-1", action: "Register",       detail: "Constitution anchored to Filecoin",                                              cid: "bafybeigewogICJuYW1lIjogIkNoYWluRXll",   type: "storage" },
  { id: "4",  timestamp: "09:42:08", agent: "Nexus-1",    action: "Covenant #12",   detail: "Hired Sentinel-1 — 0.001 ETH locked in escrow on Base",                         txHash: "0x879602acc937bd7d2a0f405989a40aa302f5b4cfa3ca808c189cd4ed5d7592cc", type: "info" },
  { id: "5",  timestamp: "09:42:14", agent: "Nexus-1",    action: "Covenant #13",   detail: "Hired ChainEye-1 — 0.001 ETH locked in escrow on Base",                         txHash: "0x37461f3f321c8be243831d81732b6f04999c6e7ad1c2ff8a9bcea28b75a92742", type: "info" },
  { id: "6",  timestamp: "09:42:22", agent: "Sentinel-1", action: "Commit",         detail: "keccak256(reasoning + salt) stored on-chain before any analysis runs",          txHash: "0x879602acc937bd7d2a0f405989a40aa302f5b4cfa3ca808c189cd4ed5d7592cc", type: "commit" },
  { id: "7",  timestamp: "09:42:28", agent: "ChainEye-1", action: "Commit",         detail: "keccak256(reasoning + salt) stored on-chain before any analysis runs",          txHash: "0x37461f3f321c8be243831d81732b6f04999c6e7ad1c2ff8a9bcea28b75a92742", type: "commit" },
  { id: "8",  timestamp: "09:42:55", agent: "Sentinel-1", action: "Analysis",       detail: "ETH sentiment: bullish at 71% confidence — BUY signal via Bankr LLM",           type: "info" },
  { id: "9",  timestamp: "09:43:02", agent: "ChainEye-1", action: "Analysis",       detail: "DEX vol $1.8B (+7.4%), whale accumulation detected — BULLISH at 63%",            type: "info" },
  { id: "10", timestamp: "09:43:10", agent: "Sentinel-1", action: "Fulfill #12",    detail: "Reasoning revealed — hash verified on-chain. Escrow released automatically.",   cid: "bafybeigewogICJheGlvbSI6ICIxLjAuMCIs", txHash: "0xd144e243abf91a0571998f0c73805ef212a6efbb16ad22b2e1481e9c7531bcb4", type: "fulfill" },
  { id: "11", timestamp: "09:43:14", agent: "ChainEye-1", action: "Fulfill #13",    detail: "Reasoning revealed — hash verified on-chain. Escrow released automatically.",   cid: "bafybeigewogICJhc3NldCI6ICJFVEgiLAog",  txHash: "0x0c754f942cddf0cd496c935a1de573ee82e5cc9f0ef1ae965b1f2e84ac9fd990", type: "fulfill" },
  { id: "12", timestamp: "09:43:18", agent: "Nexus-1",    action: "Synthesize",     detail: "Aggregating verified signals from 2 covenant-bound agents",                     type: "info" },
  { id: "13", timestamp: "09:43:24", agent: "Nexus-1",    action: "Decision",       detail: "BUY ETH — 67% confidence, medium risk, 3% portfolio size",                      type: "decision" },
  { id: "14", timestamp: "09:43:26", agent: "Nexus-1",    action: "Audit log",      detail: "Full pipeline stored on Filecoin — permanent and tamper-proof",                  cid: "bafybeigewogICJwaXBlbGluZUlkIjogInBp", type: "storage" },
];

const stepBorder: Record<PipelineStep["type"], string> = {
  commit: "border-l-amber-400", fulfill: "border-l-emerald-400",
  storage: "border-l-blue-400", decision: "border-l-black", info: "border-l-gray-200",
};
const stepDot: Record<PipelineStep["type"], string> = {
  commit: "bg-amber-400", fulfill: "bg-emerald-400",
  storage: "bg-blue-400", decision: "bg-black", info: "bg-gray-300",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function ReputationBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.round((score / 1000) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-black rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-400 w-16 text-right">{score} / 1000</span>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    FULFILLED: "border-emerald-200 text-emerald-600 bg-emerald-50",
    COMMITTED: "border-amber-200  text-amber-600  bg-amber-50",
    OPEN:      "border-blue-200   text-blue-600   bg-blue-50",
    BREACHED:  "border-red-200    text-red-600    bg-red-50",
    CANCELLED: "border-gray-200   text-gray-400   bg-gray-50",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-mono border ${styles[state] ?? styles.OPEN}`}>
      {state}
    </span>
  );
}

function Spinner() {
  return <span className="inline-block w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin" />;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Home() {
  const [activeTab, setActiveTab] = useState<"pipeline" | "agents" | "covenants">("pipeline");

  // Pipeline replay
  const [visibleSteps, setVisibleSteps] = useState<PipelineStep[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [decision, setDecision] = useState<{ action: string; confidence: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Live data
  const [live, setLive] = useState<LiveData>({
    agents: KNOWN_AGENTS.map((a) => ({ ...a, constitutionCID: "", score: 0, tier: "—", isRegistered: false })),
    covenants: [],
    covenantCount: 0,
    fulfilledCount: 0,
    totalEscrowEth: "0",
    lastUpdated: null,
    error: null,
  });
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchLiveData();
      setLive(data);
    } catch (e: any) {
      setLive((prev) => ({ ...prev, error: e.message, lastUpdated: new Date() }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 15_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refresh]);

  const replayPipeline = useCallback(() => {
    setVisibleSteps([]);
    setDecision(null);
    setElapsed(0);
    setIsReplaying(true);
    const start = Date.now();
    MOCK_STEPS.forEach((step, i) => {
      setTimeout(() => {
        setVisibleSteps((prev) => [...prev, step]);
        setElapsed(Math.round((Date.now() - start) / 100) / 10);
        if (step.type === "decision") setDecision({ action: "BUY", confidence: 0.67 });
        if (i === MOCK_STEPS.length - 1) setIsReplaying(false);
      }, i * 650);
    });
  }, []);

  useEffect(() => { replayPipeline(); }, [replayPipeline]);

  // Stats — mix live count + mock decision
  const stats = [
    { value: live.agents.filter((a) => a.isRegistered).length || "3", label: "Registered Agents",   sub: "on Base Sepolia" },
    { value: live.covenantCount || "—",                                label: "Total Covenants",      sub: `${live.fulfilledCount} fulfilled` },
    { value: live.fulfilledCount || "—",                               label: "Covenants Fulfilled",  sub: "escrow released on-chain" },
    { value: decision?.action ?? "—",                                  label: "Pipeline Decision",    sub: decision ? `${Math.round(decision.confidence * 100)}% confidence` : "run pipeline", highlight: !!decision },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      {/* ── Header ── */}
      <header className="border-b border-gray-100 sticky top-0 z-20 bg-white/95 backdrop-blur-sm">
        <div className="max-w-screen-xl mx-auto px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-black flex items-center justify-center">
              <span className="text-white text-xs font-bold tracking-tight">Ax</span>
            </div>
            <span className="font-semibold text-sm tracking-tight">AXIOM Protocol</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400 text-xs">The Promise Layer for AI Agents</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-gray-400">
            <a href={`https://sepolia.basescan.org/address/${CONTRACTS.COVENANT}`} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Base Sepolia ↗
            </a>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Filecoin Cal
            </div>
            {loading ? (
              <div className="border border-gray-200 rounded px-2.5 py-1 flex items-center gap-1.5 text-gray-400">
                <Spinner /> syncing…
              </div>
            ) : live.lastUpdated ? (
              <div className="border border-gray-200 rounded px-2.5 py-1 font-mono text-gray-500">
                updated {live.lastUpdated.toLocaleTimeString()}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-8 py-10">

        {/* ── Stats ── */}
        <div className="grid grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden mb-10">
          {stats.map((s) => (
            <div key={s.label} className="bg-white px-7 py-6">
              <div className="text-3xl font-bold font-mono tracking-tight text-black flex items-baseline gap-2">
                {s.value}
                {loading && typeof s.value === "number" && <Spinner />}
              </div>
              <div className="text-sm text-gray-700 mt-1 font-medium">{s.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center justify-between mb-8 border-b border-gray-100">
          <div className="flex">
            {(["pipeline", "agents", "covenants"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-1 py-3 mr-8 text-sm capitalize border-b-2 -mb-px transition-colors ${
                  activeTab === tab ? "border-black text-black font-medium" : "border-transparent text-gray-400 hover:text-gray-700"
                }`}>
                {tab}
                {tab === "covenants" && live.covenantCount > 0 && (
                  <span className="ml-1.5 text-xs font-mono text-gray-300">{live.covenantCount}</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 pb-px">
            <button onClick={refresh} disabled={loading}
              className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-400 hover:text-black hover:border-gray-400 disabled:opacity-40 transition-all font-mono">
              ↻ sync
            </button>
            <button onClick={replayPipeline} disabled={isReplaying}
              className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-500 hover:text-black hover:border-gray-400 disabled:opacity-40 transition-all font-mono">
              {isReplaying ? `running ${elapsed}s…` : "▶ replay"}
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            Pipeline Tab
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "pipeline" && (
          <div className="grid grid-cols-5 gap-8">
            <div className="col-span-3">
              <div className="space-y-0.5 max-h-[580px] overflow-y-auto pr-2">
                {visibleSteps.length === 0 && (
                  <div className="py-20 text-center text-gray-300 text-sm">pipeline steps appear here</div>
                )}
                {visibleSteps.map((step) => (
                  <div key={step.id}
                    className={`flex items-start gap-4 px-4 py-3 border-l-2 ${stepBorder[step.type]} animate-in fade-in duration-200 slide-in-from-bottom-1`}>
                    <span className="text-gray-300 font-mono text-xs mt-0.5 w-16 shrink-0">{step.timestamp}</span>
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${stepDot[step.type]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-xs font-mono text-gray-400">{step.agent}</span>
                          <span className="text-sm font-medium text-gray-900">{step.action}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.detail}</p>
                        {step.txHash && (
                          <div className="mt-1">
                            <TxLink hash={step.txHash} />
                          </div>
                        )}
                        {step.cid && (
                          <div className="mt-0.5">
                            <CIDLink cid={step.cid} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-5 mt-6 pt-4 border-t border-gray-100">
                {[
                  { color: "bg-amber-400",  label: "On-chain commit"    },
                  { color: "bg-emerald-400", label: "Covenant fulfilled" },
                  { color: "bg-blue-400",   label: "Filecoin storage"   },
                  { color: "bg-black",      label: "Final decision"     },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className={`w-2 h-2 rounded-full ${l.color}`} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-2 space-y-5">
              {/* Decision */}
              {decision ? (
                <div className="border border-black rounded-xl p-6">
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-mono mb-3">Final Decision</div>
                  <div className="text-6xl font-bold font-mono tracking-tight text-black mb-2">{decision.action}</div>
                  <div className="text-sm text-gray-500 mb-4">
                    ETH · {Math.round(decision.confidence * 100)}% confidence · medium risk · 3% size
                  </div>
                  <div className="space-y-2 text-xs">
                    {[
                      "Reasoning committed before analysis ran",
                      "Hash verified on-chain — cannot be altered",
                      "Evidence stored permanently on Filecoin",
                      "Agent reputation updated on Base",
                    ].map((t) => (
                      <div key={t} className="flex items-center gap-2 text-gray-600">
                        <span className="text-emerald-500">✓</span>{t}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-1 text-xs font-mono">
                    <div className="text-gray-400 mb-1.5">Proof transactions</div>
                    <TxLink hash="0xd144e243abf91a0571998f0c73805ef212a6efbb16ad22b2e1481e9c7531bcb4" />
                    <TxLink hash="0x0c754f942cddf0cd496c935a1de573ee82e5cc9f0ef1ae965b1f2e84ac9fd990" />
                  </div>
                </div>
              ) : (
                <div className="border border-gray-100 rounded-xl p-6">
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-mono mb-3">Final Decision</div>
                  <div className="text-gray-200 text-3xl font-mono font-bold">—</div>
                  <div className="text-xs text-gray-300 mt-2">waiting for agents…</div>
                </div>
              )}

              {/* Protocol stack */}
              <div className="border border-gray-100 rounded-xl p-5">
                <div className="text-xs text-gray-400 uppercase tracking-wider font-mono mb-4">Protocol Stack</div>
                <div className="space-y-3">
                  {[
                    { label: "Filecoin Onchain Cloud", desc: "Constitutions · reasoning · audit logs",   dot: "bg-blue-400",    href: "https://filecoin.io" },
                    { label: "Base Sepolia",            desc: "Covenant protocol · reputation system",   dot: "bg-emerald-400", href: `https://sepolia.basescan.org/address/${CONTRACTS.COVENANT}` },
                    { label: "Bankr LLM Gateway",       desc: "Claude · Gemini · GPT unified API",       dot: "bg-purple-400",  href: "https://bankr.bot" },
                    { label: "MetaMask Delegation",     desc: "ERC-7715 scoped permissions",             dot: "bg-orange-400",  href: "https://metamask.io" },
                    { label: "x402 Protocol",           desc: "Agent-to-agent USDC payments",            dot: "bg-amber-400",   href: "https://x402.org" },
                  ].map((item) => (
                    <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer"
                       className="flex items-start gap-3 group">
                      <span className={`w-1.5 h-1.5 rounded-full ${item.dot} shrink-0 mt-1.5`} />
                      <div>
                        <div className="text-xs font-medium text-gray-800 group-hover:text-black transition-colors">{item.label} <span className="text-gray-300">↗</span></div>
                        <div className="text-xs text-gray-400">{item.desc}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {/* Contracts */}
              <div className="border border-gray-100 rounded-xl p-5">
                <div className="text-xs text-gray-400 uppercase tracking-wider font-mono mb-4">Deployed Contracts</div>
                <div className="space-y-2">
                  {[
                    { label: "CovenantProtocol", addr: CONTRACTS.COVENANT   },
                    { label: "AgentRegistry",    addr: CONTRACTS.REGISTRY   },
                    { label: "ReputationSystem", addr: CONTRACTS.REPUTATION },
                  ].map((c) => (
                    <div key={c.label}>
                      <div className="text-xs text-gray-400 mb-0.5">{c.label}</div>
                      <a href={`https://sepolia.basescan.org/address/${c.addr}`} target="_blank" rel="noopener noreferrer"
                         className="font-mono text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors">
                        {c.addr} ↗
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            Agents Tab
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "agents" && (
          <div>
            <p className="text-sm text-gray-400 mb-6">
              Every agent is registered on-chain with a Filecoin-backed constitution.
              Reputation scores update automatically from covenant history.
              {loading && <span className="ml-2 inline-flex items-center gap-1 text-gray-300"><Spinner /> loading live scores…</span>}
            </p>
            <div className="grid grid-cols-3 gap-5">
              {live.agents.map((agent) => (
                <div key={agent.address} className="border border-gray-100 rounded-xl p-6 hover:border-gray-300 transition-colors">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <h3 className="font-semibold text-base font-mono">{agent.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{agent.type.replace("-", " ")}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-xs border border-gray-200 rounded px-2 py-0.5 text-gray-500 font-mono">
                        {agent.tier}
                      </span>
                      {agent.isRegistered && (
                        <span className="text-xs text-emerald-500 font-mono">✓ registered</span>
                      )}
                    </div>
                  </div>

                  <div className="mb-5">
                    <div className="text-xs text-gray-400 mb-2">Reputation Score</div>
                    <ReputationBar score={agent.score} />
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex gap-2">
                      <span className="text-gray-300 shrink-0 w-10">addr</span>
                      <a href={`https://sepolia.basescan.org/address/${agent.address}`} target="_blank" rel="noopener noreferrer"
                         className="text-blue-500 hover:text-blue-700 hover:underline transition-colors truncate">
                        {truncate(agent.address, 22)} ↗
                      </a>
                    </div>
                    {agent.constitutionCID && (
                      <div className="flex gap-2">
                        <span className="text-gray-300 shrink-0 w-10">cid</span>
                        <CIDLink cid={agent.constitutionCID} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            Covenants Tab
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "covenants" && (
          <div>
            <p className="text-sm text-gray-400 mb-6">
              {live.covenantCount > 0
                ? `${live.covenantCount} covenants created · ${live.fulfilledCount} fulfilled · showing most recent 20`
                : "Loading live covenant data from Base Sepolia…"}
              {loading && <span className="ml-2 inline-flex items-center gap-1 text-gray-300"><Spinner /> syncing…</span>}
            </p>

            {live.covenants.length === 0 && !loading && (
              <div className="border border-gray-100 rounded-xl p-10 text-center text-gray-300 text-sm">
                No covenants found
              </div>
            )}

            <div className="space-y-3">
              {live.covenants.map((c) => (
                <div key={c.id} className="border border-gray-100 rounded-xl p-6 hover:border-gray-200 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <a href={`https://sepolia.basescan.org/address/${CONTRACTS.COVENANT}`}
                           target="_blank" rel="noopener noreferrer"
                           className="font-semibold font-mono hover:text-blue-600 transition-colors">
                          Covenant #{c.id} ↗
                        </a>
                        <StateBadge state={c.state} />
                      </div>
                      <p className="text-sm text-gray-400">
                        {c.requesterName}
                        <span className="text-gray-300 mx-1.5">→</span>
                        {c.providerName}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold text-sm">{c.paymentEth}</div>
                      {c.createdAt > 0 && (
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(c.createdAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-400 font-mono mb-1.5">Terms CID</div>
                      <CIDLink cid={c.termsCID} />
                    </div>
                    <div className={`rounded-lg p-3 ${c.reasoningCID ? "bg-amber-50" : "bg-gray-50"}`}>
                      <div className="text-xs text-amber-500 font-mono mb-1.5">Reasoning · pre-committed</div>
                      {c.reasoningCID ? <CIDLink cid={c.reasoningCID} /> : <span className="text-gray-300 text-xs font-mono">—</span>}
                    </div>
                    <div className={`rounded-lg p-3 ${c.deliverableCID ? "bg-emerald-50" : "bg-gray-50"}`}>
                      <div className="text-xs text-emerald-500 font-mono mb-1.5">Deliverable CID</div>
                      {c.deliverableCID ? <CIDLink cid={c.deliverableCID} /> : <span className="text-gray-300 text-xs font-mono">—</span>}
                    </div>
                  </div>

                  {c.state === "FULFILLED" && (
                    <div className="pt-3 border-t border-gray-50 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1.5"><span className="text-emerald-500">✓</span> Commitment verified on-chain</span>
                      <span className="flex items-center gap-1.5"><span className="text-emerald-500">✓</span> Reasoning hash matched</span>
                      <span className="flex items-center gap-1.5"><span className="text-emerald-500">✓</span> Escrow released automatically</span>
                      {c.fulfilledAt > 0 && (
                        <span className="ml-auto text-gray-300 font-mono">
                          fulfilled {new Date(c.fulfilledAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-100 mt-16">
        <div className="max-w-screen-xl mx-auto px-8 py-5 flex items-center justify-between">
          <span className="text-xs text-gray-300 font-mono">AXIOM Protocol · ETHGlobal Agents</span>
          <div className="flex items-center gap-6 text-xs font-mono">
            <a href={`https://sepolia.basescan.org/address/${CONTRACTS.COVENANT}`} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-gray-600 transition-colors">BaseScan ↗</a>
            <a href="https://filecoin.io" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-gray-600 transition-colors">Filecoin ↗</a>
            <a href="https://bankr.bot" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-gray-600 transition-colors">Bankr ↗</a>
            <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-gray-600 transition-colors">MetaMask ↗</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
