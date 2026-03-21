"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";

// ─── Constants ────────────────────────────────────────────────────────────────
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

const ADDR_TO_NAME = Object.fromEntries(KNOWN_AGENTS.map((a) => [a.address.toLowerCase(), a.name]));
const TIERS  = ["Untrusted", "Provisional", "Established", "Trusted", "Elite"];
const STATES = ["OPEN", "COMMITTED", "FULFILLED", "BREACHED", "CANCELLED"] as const;

// ─── ABIs ─────────────────────────────────────────────────────────────────────
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
    outputs: [{ type: "tuple", components: [
      { name: "owner", type: "address" }, { name: "constitutionCID", type: "string" },
      { name: "name", type: "string" }, { name: "agentType", type: "string" },
      { name: "registeredAt", type: "uint256" }, { name: "active", type: "bool" },
    ]}],
    stateMutability: "view",
  },
  { name: "isRegistered", type: "function", inputs: [{ name: "agentAddress", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
] as const;

const COVENANT_EVENTS = parseAbi([
  "event CovenantCreated(uint256 indexed id, address indexed requester, address indexed provider, uint256 paymentAmount, uint256 deadline, string termsCID)",
  "event ReasoningCommitted(uint256 indexed id, address indexed provider, bytes32 reasoningCommitment, uint256 timestamp)",
  "event CovenantFulfilled(uint256 indexed id, address indexed provider, string reasoningCID, string deliverableCID, uint256 paymentReleased, uint256 timestamp)",
  "event CovenantBreached(uint256 indexed id, address indexed provider, uint256 refundAmount, uint256 timestamp)",
]);

// ─── viem client ──────────────────────────────────────────────────────────────
const client = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });

// ─── Types ────────────────────────────────────────────────────────────────────
interface LiveAgent {
  address: string; name: string; type: string;
  constitutionCID: string; score: number; tier: string; isRegistered: boolean;
}

interface LiveCovenant {
  id: number; requester: string; provider: string;
  paymentEth: string; state: typeof STATES[number];
  termsCID: string; reasoningCID: string; deliverableCID: string;
  reasoningCommitment: string;
  createdAt: number; committedAt: number; fulfilledAt: number;
  requesterName: string; providerName: string;
}

interface ChainEvent {
  blockNumber: bigint; txHash: string; eventName: string;
  covenantId: bigint; address: string; extra: string;
}

// ─── Data fetchers ────────────────────────────────────────────────────────────
async function fetchAgents(): Promise<LiveAgent[]> {
  return Promise.all(KNOWN_AGENTS.map(async (a) => {
    const [score, tier, reg, profile] = await Promise.all([
      client.readContract({ address: CONTRACTS.REPUTATION, abi: REPUTATION_ABI, functionName: "getScore", args: [a.address] }).catch(() => 0n),
      client.readContract({ address: CONTRACTS.REPUTATION, abi: REPUTATION_ABI, functionName: "getTier",  args: [a.address] }).catch(() => 0),
      client.readContract({ address: CONTRACTS.REGISTRY,   abi: REGISTRY_ABI,   functionName: "isRegistered", args: [a.address] }).catch(() => false),
      client.readContract({ address: CONTRACTS.REGISTRY,   abi: REGISTRY_ABI,   functionName: "getAgent",     args: [a.address] }).catch(() => null),
    ]);
    return {
      address: a.address, name: a.name, type: a.type,
      constitutionCID: (profile as any)?.constitutionCID ?? "",
      score: Number(score), tier: TIERS[Number(tier)] ?? "Untrusted",
      isRegistered: Boolean(reg),
    };
  }));
}

async function fetchCovenants(): Promise<{ covenants: LiveCovenant[]; count: number }> {
  const countRaw = await client.readContract({ address: CONTRACTS.COVENANT, abi: COVENANT_ABI, functionName: "covenantCount" }).catch(() => 0n);
  const count = Number(countRaw);
  const start = Math.max(0, count - 20);
  const ids = Array.from({ length: count - start }, (_, i) => start + i);
  const covenants = (await Promise.all(ids.map(async (id) => {
    try {
      const c = await client.readContract({ address: CONTRACTS.COVENANT, abi: COVENANT_ABI, functionName: "getCovenant", args: [BigInt(id)] }) as any;
      return {
        id, requester: c.requester, provider: c.provider,
        paymentEth: `${(Number(c.paymentAmount) / 1e18).toFixed(4)} ETH`,
        state: STATES[Number(c.state)] ?? "OPEN",
        termsCID: c.termsCID, reasoningCID: c.reasoningCID, deliverableCID: c.deliverableCID,
        reasoningCommitment: c.reasoningCommitment,
        createdAt: Number(c.createdAt) * 1000, committedAt: Number(c.committedAt) * 1000,
        fulfilledAt: Number(c.fulfilledAt) * 1000,
        requesterName: ADDR_TO_NAME[c.requester.toLowerCase()] ?? trunc(c.requester, 10),
        providerName:  ADDR_TO_NAME[c.provider.toLowerCase()]  ?? trunc(c.provider,  10),
      } satisfies LiveCovenant;
    } catch { return null; }
  }))).filter(Boolean) as LiveCovenant[];
  return { covenants: covenants.reverse(), count };
}

async function fetchEvents(): Promise<ChainEvent[]> {
  try {
    const blockNum = await client.getBlockNumber();
    const fromBlock = blockNum > 10000n ? blockNum - 10000n : 0n;
    const logs = await client.getLogs({ address: CONTRACTS.COVENANT, events: COVENANT_EVENTS, fromBlock, toBlock: "latest" });
    return [...logs].reverse().slice(0, 60).map((log: any) => {
      const args = log.args ?? {};
      let extra = "";
      if (log.eventName === "CovenantCreated")    extra = `${(Number(args.paymentAmount ?? 0) / 1e18).toFixed(4)} ETH`;
      if (log.eventName === "ReasoningCommitted") extra = (args.reasoningCommitment as string)?.slice(0, 14) + "…";
      if (log.eventName === "CovenantFulfilled")  extra = "escrow released";
      if (log.eventName === "CovenantBreached")   extra = "requester refunded";
      return {
        blockNumber: log.blockNumber ?? 0n,
        txHash: log.transactionHash ?? "",
        eventName: log.eventName ?? "",
        covenantId: args.id ?? 0n,
        address: args.provider ?? args.requester ?? "",
        extra,
      };
    });
  } catch { return []; }
}

async function fetchCovenant(id: number): Promise<LiveCovenant | null> {
  try {
    const c = await client.readContract({ address: CONTRACTS.COVENANT, abi: COVENANT_ABI, functionName: "getCovenant", args: [BigInt(id)] }) as any;
    return {
      id, requester: c.requester, provider: c.provider,
      paymentEth: `${(Number(c.paymentAmount) / 1e18).toFixed(4)} ETH`,
      state: STATES[Number(c.state)] ?? "OPEN",
      termsCID: c.termsCID, reasoningCID: c.reasoningCID, deliverableCID: c.deliverableCID,
      reasoningCommitment: c.reasoningCommitment,
      createdAt: Number(c.createdAt) * 1000, committedAt: Number(c.committedAt) * 1000,
      fulfilledAt: Number(c.fulfilledAt) * 1000,
      requesterName: ADDR_TO_NAME[c.requester.toLowerCase()] ?? trunc(c.requester, 10),
      providerName:  ADDR_TO_NAME[c.provider.toLowerCase()]  ?? trunc(c.provider,  10),
    };
  } catch { return null; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function trunc(s: string, n = 18) { return s && s.length > n ? s.slice(0, n) + "…" : s; }

function TxLink({ hash }: { hash: string }) {
  if (!hash || hash.length < 10) return <span className="font-mono text-xs text-gray-300">{hash}</span>;
  return (
    <a href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" rel="noopener noreferrer"
       className="font-mono text-xs text-blue-500 hover:underline hover:text-blue-700 transition-colors">
      {trunc(hash, 28)} ↗
    </a>
  );
}

function CIDLink({ cid }: { cid: string }) {
  if (!cid) return <span className="text-gray-300 text-xs font-mono">—</span>;
  const isSim = cid.includes("gewog");
  return (
    <a href={isSim ? undefined : `https://ipfs.io/ipfs/${cid}`}
       target={isSim ? undefined : "_blank"} rel="noopener noreferrer"
       title={isSim ? "Simulated CID — Filecoin providers were offline" : cid}
       className={`font-mono text-xs truncate transition-colors block ${isSim ? "text-gray-300 cursor-default" : "text-blue-500 hover:underline hover:text-blue-700"}`}>
      {trunc(cid, 32)}{!isSim && " ↗"}
    </a>
  );
}

function Spinner() {
  return <span className="inline-block w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin" />;
}

function StateBadge({ state }: { state: string }) {
  const s: Record<string, string> = {
    FULFILLED: "border-emerald-200 text-emerald-600 bg-emerald-50",
    COMMITTED: "border-amber-200 text-amber-600 bg-amber-50",
    OPEN:      "border-blue-200 text-blue-600 bg-blue-50",
    BREACHED:  "border-red-200 text-red-600 bg-red-50",
    CANCELLED: "border-gray-200 text-gray-400 bg-gray-50",
  };
  return <span className={`text-xs px-2 py-0.5 rounded font-mono border ${s[state] ?? s.OPEN}`}>{state}</span>;
}

function ReputationBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-black rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (score / 1000) * 100)}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-400 w-16 text-right">{score} / 1000</span>
    </div>
  );
}

const EVENT_STYLE: Record<string, { dot: string; label: string; text: string }> = {
  CovenantCreated:    { dot: "bg-blue-400",    label: "Created",   text: "text-blue-600"    },
  ReasoningCommitted: { dot: "bg-amber-400",   label: "Committed", text: "text-amber-600"   },
  CovenantFulfilled:  { dot: "bg-emerald-400", label: "Fulfilled", text: "text-emerald-600" },
  CovenantBreached:   { dot: "bg-red-400",     label: "Breached",  text: "text-red-600"     },
};

// Pipeline replay mock
interface PipelineStep {
  id: string; timestamp: string; agent: string; action: string;
  detail: string; cid?: string; txHash?: string;
  type: "info" | "commit" | "fulfill" | "storage" | "decision";
}
const MOCK_STEPS: PipelineStep[] = [
  { id:"1",  timestamp:"09:42:01", agent:"Nexus-1",    action:"Register",     detail:"Constitution anchored to Filecoin",                                             cid:"bafybeigewogICJuYW1lIjogIk5leHVzLTEi",    type:"storage"  },
  { id:"2",  timestamp:"09:42:03", agent:"Sentinel-1", action:"Register",     detail:"Constitution anchored to Filecoin",                                             cid:"bafybeigewogICJuYW1lIjogIlNlbnRpbmVs",   type:"storage"  },
  { id:"3",  timestamp:"09:42:05", agent:"ChainEye-1", action:"Register",     detail:"Constitution anchored to Filecoin",                                             cid:"bafybeigewogICJuYW1lIjogIkNoYWluRXll",   type:"storage"  },
  { id:"4",  timestamp:"09:42:08", agent:"Nexus-1",    action:"Covenant #12", detail:"Hired Sentinel-1 — 0.001 ETH locked in escrow on Base",                        txHash:"0x879602acc937bd7d2a0f405989a40aa302f5b4cfa3ca808c189cd4ed5d7592cc", type:"info"     },
  { id:"5",  timestamp:"09:42:14", agent:"Nexus-1",    action:"Covenant #13", detail:"Hired ChainEye-1 — 0.001 ETH locked in escrow on Base",                        txHash:"0x37461f3f321c8be243831d81732b6f04999c6e7ad1c2ff8a9bcea28b75a92742", type:"info"     },
  { id:"6",  timestamp:"09:42:22", agent:"Sentinel-1", action:"Commit",       detail:"keccak256(reasoning + salt) stored on-chain BEFORE analysis runs",             txHash:"0x879602acc937bd7d2a0f405989a40aa302f5b4cfa3ca808c189cd4ed5d7592cc", type:"commit"   },
  { id:"7",  timestamp:"09:42:28", agent:"ChainEye-1", action:"Commit",       detail:"keccak256(reasoning + salt) stored on-chain BEFORE analysis runs",             txHash:"0x37461f3f321c8be243831d81732b6f04999c6e7ad1c2ff8a9bcea28b75a92742", type:"commit"   },
  { id:"8",  timestamp:"09:42:55", agent:"Sentinel-1", action:"Analysis",     detail:"ETH sentiment: bullish 71% confidence — BUY signal via Bankr LLM",            type:"info"     },
  { id:"9",  timestamp:"09:43:02", agent:"ChainEye-1", action:"Analysis",     detail:"DEX vol $1.8B (+7.4%), whale accumulation detected — BULLISH 63%",             type:"info"     },
  { id:"10", timestamp:"09:43:10", agent:"Sentinel-1", action:"Fulfill #12",  detail:"Reasoning revealed — hash matched on-chain. Escrow released automatically.",  cid:"bafybeigewogICJheGlvbSI6ICIxLjAuMCIs", txHash:"0xd144e243abf91a0571998f0c73805ef212a6efbb16ad22b2e1481e9c7531bcb4", type:"fulfill"  },
  { id:"11", timestamp:"09:43:14", agent:"ChainEye-1", action:"Fulfill #13",  detail:"Reasoning revealed — hash matched on-chain. Escrow released automatically.",  cid:"bafybeigewogICJhc3NldCI6ICJFVEgiLAog",  txHash:"0x0c754f942cddf0cd496c935a1de573ee82e5cc9f0ef1ae965b1f2e84ac9fd990", type:"fulfill"  },
  { id:"12", timestamp:"09:43:18", agent:"Nexus-1",    action:"Synthesize",   detail:"Aggregating verified signals from 2 covenant-bound agents",                   type:"info"     },
  { id:"13", timestamp:"09:43:24", agent:"Nexus-1",    action:"Decision",     detail:"BUY ETH — 67% confidence, medium risk, 3% portfolio size",                    type:"decision" },
  { id:"14", timestamp:"09:43:26", agent:"Nexus-1",    action:"Audit log",    detail:"Full pipeline stored on Filecoin — permanent and tamper-proof",                cid:"bafybeigewogICJwaXBlbGluZUlkIjogInBp", type:"storage"  },
];
const STEP_BORDER: Record<string, string> = { commit:"border-l-amber-400", fulfill:"border-l-emerald-400", storage:"border-l-blue-400", decision:"border-l-black", info:"border-l-gray-200" };
const STEP_DOT:    Record<string, string> = { commit:"bg-amber-400",        fulfill:"bg-emerald-400",        storage:"bg-blue-400",        decision:"bg-black",        info:"bg-gray-300"        };

// ─── Terminal Modal ───────────────────────────────────────────────────────────
interface TerminalLine { text: string; isError?: boolean; isCommand?: boolean }

function TerminalModal({ onClose }: { onClose: () => void }) {
  const [lines, setLines]     = useState<TerminalLine[]>([]);
  const [status, setStatus]   = useState<"idle" | "running" | "done" | "error">("idle");
  const [simulated, setSim]   = useState(false);
  const bottomRef             = useRef<HTMLDivElement>(null);
  const esRef                 = useRef<EventSource | null>(null);

  const run = useCallback(() => {
    if (esRef.current) esRef.current.close();
    setLines([]);
    setStatus("running");

    const es = new EventSource("/api/run-pipeline");
    esRef.current = es;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.line) {
        const parts = (data.line as string).split("\n");
        setLines((prev) => [
          ...prev,
          ...parts.filter((p) => p !== "").map((p) => ({
            text: p, isError: !!data.isError, isCommand: !!data.isCommand,
          })),
        ]);
      }
      if (data.done) {
        setStatus(data.code === 0 ? "done" : "error");
        setSim(!!data.simulated);
        es.close();
      }
    };
    es.onerror = () => {
      setLines((prev) => [...prev, { text: "Connection error — is the dev server running?", isError: true }]);
      setStatus("error");
      es.close();
    };
  }, []);

  useEffect(() => { run(); return () => esRef.current?.close(); }, [run]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-xl overflow-hidden border border-gray-200 shadow-2xl flex flex-col" style={{ maxHeight: "80vh" }}>
        {/* Terminal header */}
        <div className="bg-[#1a1a1a] px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <span className="text-gray-400 text-xs font-mono ml-2">AXIOM Pipeline Terminal</span>
            {status === "running" && <span className="ml-2 flex items-center gap-1 text-xs text-emerald-400 font-mono"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> running</span>}
            {status === "done"    && <span className="ml-2 text-xs text-emerald-400 font-mono">✓ complete{simulated ? " (simulated)" : " (live)"}</span>}
            {status === "error"   && <span className="ml-2 text-xs text-red-400 font-mono">✗ error</span>}
          </div>
          <div className="flex items-center gap-2">
            {status !== "running" && (
              <button onClick={run} className="text-xs font-mono text-gray-400 hover:text-white px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors">
                ↻ run again
              </button>
            )}
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg leading-none">×</button>
          </div>
        </div>

        {/* Terminal body */}
        <div className="bg-[#0d0d0d] flex-1 overflow-y-auto p-4 font-mono text-sm">
          {lines.length === 0 && status === "running" && (
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Spinner /> starting pipeline…
            </div>
          )}
          {lines.map((line, i) => (
            <div key={i} className={`leading-relaxed whitespace-pre-wrap ${
              line.isCommand ? "text-gray-500" :
              line.isError   ? "text-red-400" :
              line.text.includes("COMPLETE") || line.text.includes("✓") ? "text-emerald-400" :
              line.text.includes("DECISION") || line.text.includes("BUY") ? "text-white font-semibold" :
              line.text.includes("[Commit]") ? "text-amber-300" :
              line.text.includes("[Fulfill]") ? "text-emerald-300" :
              line.text.includes("Tx:") ? "text-blue-400" :
              "text-gray-300"
            }`}>
              {line.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// ─── Covenant Detail Card ─────────────────────────────────────────────────────
function CovenantCard({ c }: { c: LiveCovenant }) {
  return (
    <div className="border border-gray-100 rounded-xl p-6 hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <a href={`https://sepolia.basescan.org/address/${CONTRACTS.COVENANT}`} target="_blank" rel="noopener noreferrer"
               className="font-semibold font-mono hover:text-blue-600 transition-colors">
              Covenant #{c.id} ↗
            </a>
            <StateBadge state={c.state} />
          </div>
          <p className="text-sm text-gray-400">
            {c.requesterName} <span className="text-gray-300 mx-1">→</span> {c.providerName}
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono font-semibold text-sm">{c.paymentEth}</div>
          {c.createdAt > 0 && <div className="text-xs text-gray-400 mt-1">{new Date(c.createdAt).toLocaleString()}</div>}
        </div>
      </div>

      {c.reasoningCommitment && c.reasoningCommitment !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
        <div className="mb-3 bg-amber-50 rounded-lg p-3">
          <div className="text-xs text-amber-500 font-mono mb-1">On-chain Commitment (stored BEFORE execution)</div>
          <div className="font-mono text-xs text-gray-600 break-all">{c.reasoningCommitment}</div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-400 font-mono mb-1.5">Terms CID</div>
          <CIDLink cid={c.termsCID} />
        </div>
        <div className={`rounded-lg p-3 ${c.reasoningCID ? "bg-amber-50" : "bg-gray-50"}`}>
          <div className="text-xs text-amber-500 font-mono mb-1.5">Reasoning · pre-committed</div>
          <CIDLink cid={c.reasoningCID} />
        </div>
        <div className={`rounded-lg p-3 ${c.deliverableCID ? "bg-emerald-50" : "bg-gray-50"}`}>
          <div className="text-xs text-emerald-500 font-mono mb-1.5">Deliverable CID</div>
          <CIDLink cid={c.deliverableCID} />
        </div>
      </div>

      {c.state === "FULFILLED" && (
        <div className="pt-3 border-t border-gray-50 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
          <span className="flex items-center gap-1.5"><span className="text-emerald-500">✓</span> Commitment verified on-chain</span>
          <span className="flex items-center gap-1.5"><span className="text-emerald-500">✓</span> Reasoning hash matched</span>
          <span className="flex items-center gap-1.5"><span className="text-emerald-500">✓</span> Escrow released automatically</span>
          {c.fulfilledAt > 0 && <span className="ml-auto text-gray-300 font-mono">fulfilled {new Date(c.fulfilledAt).toLocaleTimeString()}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [activeTab, setActiveTab] = useState<"pipeline" | "live" | "agents" | "covenants">("pipeline");
  const [showTerminal, setShowTerminal] = useState(false);

  // Pipeline replay
  const [visibleSteps, setVisibleSteps] = useState<PipelineStep[]>([]);
  const [isReplaying, setIsReplaying]   = useState(false);
  const [decision, setDecision]         = useState<{ action: string; confidence: number } | null>(null);
  const [elapsed, setElapsed]           = useState(0);

  // Live data
  const [agents,    setAgents]    = useState<LiveAgent[]>(KNOWN_AGENTS.map((a) => ({ ...a, constitutionCID: "", score: 0, tier: "—", isRegistered: false })));
  const [covenants, setCovenants] = useState<LiveCovenant[]>([]);
  const [covCount,  setCovCount]  = useState(0);
  const [events,    setEvents]    = useState<ChainEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [lastSync,  setLastSync]  = useState<Date | null>(null);

  // Covenant verifier
  const [verifyInput,  setVerifyInput]  = useState("");
  const [verifyResult, setVerifyResult] = useState<LiveCovenant | null | "loading" | "not-found">(null);

  const refresh = useCallback(async () => {
    try {
      const [a, { covenants: c, count }, e] = await Promise.all([fetchAgents(), fetchCovenants(), fetchEvents()]);
      setAgents(a); setCovenants(c); setCovCount(count); setEvents(e);
      setLastSync(new Date());
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  const replayPipeline = useCallback(() => {
    setVisibleSteps([]); setDecision(null); setElapsed(0); setIsReplaying(true);
    const start = Date.now();
    MOCK_STEPS.forEach((step, i) => {
      setTimeout(() => {
        setVisibleSteps((p) => [...p, step]);
        setElapsed(Math.round((Date.now() - start) / 100) / 10);
        if (step.type === "decision") setDecision({ action: "BUY", confidence: 0.67 });
        if (i === MOCK_STEPS.length - 1) setIsReplaying(false);
      }, i * 650);
    });
  }, []);

  useEffect(() => { replayPipeline(); }, [replayPipeline]);

  const handleVerify = useCallback(async () => {
    const id = parseInt(verifyInput.trim(), 10);
    if (isNaN(id) || id < 0) return;
    setVerifyResult("loading");
    const result = await fetchCovenant(id);
    setVerifyResult(result ?? "not-found");
  }, [verifyInput]);

  const fulfilled = covenants.filter((c) => c.state === "FULFILLED").length;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {showTerminal && <TerminalModal onClose={() => setShowTerminal(false)} />}

      {/* ── Header ── */}
      <header className="border-b border-gray-100 sticky top-0 z-20 bg-white/95 backdrop-blur-sm">
        <div className="max-w-screen-xl mx-auto px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-black flex items-center justify-center">
              <span className="text-white text-xs font-bold tracking-tight">Ax</span>
            </div>
            <span className="font-semibold text-sm tracking-tight">AXIOM Protocol</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400 text-xs hidden sm:block">The Promise Layer for AI Agents</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <a href={`https://sepolia.basescan.org/address/${CONTRACTS.COVENANT}`} target="_blank" rel="noopener noreferrer"
                 className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Base Sepolia ↗
              </a>
              {loading
                ? <span className="flex items-center gap-1.5"><Spinner /> syncing</span>
                : lastSync && <span className="font-mono">{lastSync.toLocaleTimeString()}</span>
              }
            </div>
            <button onClick={() => setShowTerminal(true)}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded bg-black text-white hover:bg-gray-800 transition-colors font-medium">
              <span className="text-emerald-400">▶</span> Run Pipeline
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-8 py-10">

        {/* ── Stats ── */}
        <div className="grid grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden mb-10">
          {[
            { value: agents.filter((a) => a.isRegistered).length || 3, label: "Registered Agents",  sub: "on Base Sepolia" },
            { value: covCount || "—",                                   label: "Total Covenants",     sub: `${fulfilled} fulfilled` },
            { value: fulfilled || "—",                                  label: "Proofs Verified",     sub: "on-chain hash match" },
            { value: decision?.action ?? "—",                          label: "Pipeline Decision",   sub: decision ? `${Math.round(decision.confidence * 100)}% confidence` : "click run", highlight: !!decision },
          ].map((s) => (
            <div key={s.label} className="bg-white px-7 py-6">
              <div className="text-3xl font-bold font-mono tracking-tight text-black">
                {s.value}{loading && <span className="ml-2 inline-flex"><Spinner /></span>}
              </div>
              <div className="text-sm text-gray-700 mt-1 font-medium">{s.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center justify-between border-b border-gray-100 mb-8">
          <div className="flex">
            {(["pipeline", "live", "agents", "covenants"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-1 py-3 mr-8 text-sm capitalize border-b-2 -mb-px transition-colors ${activeTab === tab ? "border-black text-black font-medium" : "border-transparent text-gray-400 hover:text-gray-700"}`}>
                {tab}
                {tab === "live" && events.length > 0 && <span className="ml-1.5 text-xs font-mono text-gray-300">{events.length}</span>}
                {tab === "covenants" && covCount > 0 && <span className="ml-1.5 text-xs font-mono text-gray-300">{covCount}</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pb-px">
            <button onClick={refresh} disabled={loading}
              className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-400 hover:text-black hover:border-gray-400 disabled:opacity-40 transition-all font-mono">
              ↻ sync
            </button>
            <button onClick={replayPipeline} disabled={isReplaying}
              className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-400 hover:text-black hover:border-gray-400 disabled:opacity-40 transition-all font-mono">
              {isReplaying ? `${elapsed}s…` : "▶ replay"}
            </button>
          </div>
        </div>

        {/* ══ Pipeline Tab ══ */}
        {activeTab === "pipeline" && (
          <div className="grid grid-cols-5 gap-8">
            <div className="col-span-3">
              <div className="space-y-0.5 max-h-[560px] overflow-y-auto pr-2">
                {visibleSteps.length === 0 && <div className="py-20 text-center text-gray-300 text-sm">click ▶ replay or Run Pipeline</div>}
                {visibleSteps.map((step) => (
                  <div key={step.id} className={`flex items-start gap-4 px-4 py-3 border-l-2 ${STEP_BORDER[step.type]} animate-in fade-in duration-200 slide-in-from-bottom-1`}>
                    <span className="text-gray-300 font-mono text-xs mt-0.5 w-16 shrink-0">{step.timestamp}</span>
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${STEP_DOT[step.type]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-xs font-mono text-gray-400">{step.agent}</span>
                          <span className="text-sm font-medium text-gray-900">{step.action}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{step.detail}</p>
                        {step.txHash && <div className="mt-1"><TxLink hash={step.txHash} /></div>}
                        {step.cid    && <div className="mt-0.5"><CIDLink cid={step.cid} /></div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-5 mt-5 pt-4 border-t border-gray-100">
                {[{ c:"bg-amber-400", l:"Commit" }, { c:"bg-emerald-400", l:"Fulfill" }, { c:"bg-blue-400", l:"Filecoin" }, { c:"bg-black", l:"Decision" }].map((l) => (
                  <div key={l.l} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className={`w-2 h-2 rounded-full ${l.c}`} /> {l.l}
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-2 space-y-5">
              {decision ? (
                <div className="border border-black rounded-xl p-6">
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-mono mb-3">Final Decision</div>
                  <div className="text-6xl font-bold font-mono tracking-tight text-black mb-2">{decision.action}</div>
                  <div className="text-sm text-gray-500 mb-4">ETH · {Math.round(decision.confidence * 100)}% confidence · medium risk · 3% size</div>
                  <div className="space-y-2 text-xs">
                    {["Reasoning committed before analysis ran", "Hash verified on-chain — cannot be altered", "Evidence stored permanently on Filecoin", "Agent reputation updated on Base"].map((t) => (
                      <div key={t} className="flex items-center gap-2 text-gray-600"><span className="text-emerald-500">✓</span>{t}</div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
                    <div className="text-xs text-gray-400 font-mono mb-2">Live proof transactions</div>
                    <TxLink hash="0xd144e243abf91a0571998f0c73805ef212a6efbb16ad22b2e1481e9c7531bcb4" />
                    <TxLink hash="0x0c754f942cddf0cd496c935a1de573ee82e5cc9f0ef1ae965b1f2e84ac9fd990" />
                  </div>
                </div>
              ) : (
                <div className="border border-gray-100 rounded-xl p-6 flex flex-col items-start gap-3">
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-mono">Final Decision</div>
                  <div className="text-3xl font-mono text-gray-200 font-bold">—</div>
                  <button onClick={() => setShowTerminal(true)}
                    className="text-xs px-3 py-2 rounded bg-black text-white hover:bg-gray-800 transition-colors font-medium flex items-center gap-2">
                    <span className="text-emerald-400">▶</span> Run live pipeline
                  </button>
                </div>
              )}

              <div className="border border-gray-100 rounded-xl p-5">
                <div className="text-xs text-gray-400 uppercase tracking-wider font-mono mb-4">Protocol Stack</div>
                <div className="space-y-3">
                  {[
                    { l:"Filecoin Onchain Cloud", d:"Constitutions · reasoning · audit logs", dot:"bg-blue-400",    h:"https://filecoin.io" },
                    { l:"Base Sepolia",            d:"Covenant protocol · reputation system",  dot:"bg-emerald-400", h:`https://sepolia.basescan.org/address/${CONTRACTS.COVENANT}` },
                    { l:"Bankr LLM Gateway",       d:"Claude · Gemini · GPT unified API",      dot:"bg-purple-400",  h:"https://bankr.bot" },
                    { l:"MetaMask Delegation",     d:"ERC-7715 scoped permissions",            dot:"bg-orange-400",  h:"https://metamask.io" },
                    { l:"x402 Protocol",           d:"Agent-to-agent USDC payments",           dot:"bg-amber-400",   h:"https://x402.org" },
                  ].map((item) => (
                    <a key={item.l} href={item.h} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 group">
                      <span className={`w-1.5 h-1.5 rounded-full ${item.dot} shrink-0 mt-1.5`} />
                      <div>
                        <div className="text-xs font-medium text-gray-800 group-hover:text-black transition-colors">{item.l} <span className="text-gray-300">↗</span></div>
                        <div className="text-xs text-gray-400">{item.d}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ Live Events Tab ══ */}
        {activeTab === "live" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-gray-400">
                Real-time events from the CovenantProtocol contract on Base Sepolia.
                {loading && <span className="ml-2 inline-flex items-center gap-1 text-gray-300"><Spinner /> fetching…</span>}
              </p>
              <div className="flex gap-2 text-xs">
                {Object.entries(EVENT_STYLE).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-1.5 text-gray-400">
                    <span className={`w-2 h-2 rounded-full ${val.dot}`} /> {val.label}
                  </div>
                ))}
              </div>
            </div>

            {events.length === 0 && !loading && (
              <div className="border border-gray-100 rounded-xl p-16 text-center">
                <div className="text-gray-300 text-sm mb-2">No events found in recent blocks</div>
                <div className="text-xs text-gray-300">Run the pipeline to generate on-chain activity</div>
              </div>
            )}

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              {events.map((ev, i) => {
                const style = EVENT_STYLE[ev.eventName] ?? { dot: "bg-gray-300", label: ev.eventName, text: "text-gray-600" };
                return (
                  <div key={`${ev.txHash}-${i}`}
                    className={`flex items-center gap-4 px-5 py-3.5 text-xs ${i !== events.length - 1 ? "border-b border-gray-50" : ""} hover:bg-gray-50 transition-colors`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                    <span className={`font-mono font-medium w-32 shrink-0 ${style.text}`}>{style.label}</span>
                    <span className="font-mono text-gray-600 w-16 shrink-0">#{ev.covenantId.toString()}</span>
                    <span className="font-mono text-gray-400 shrink-0">{ADDR_TO_NAME[ev.address.toLowerCase()] ?? trunc(ev.address, 14)}</span>
                    {ev.extra && <span className="text-gray-400 font-mono">{ev.extra}</span>}
                    <div className="ml-auto flex items-center gap-4">
                      <span className="text-gray-300 font-mono">block {ev.blockNumber.toString()}</span>
                      <TxLink hash={ev.txHash} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ Agents Tab ══ */}
        {activeTab === "agents" && (
          <div>
            <p className="text-sm text-gray-400 mb-6">
              Every agent is registered on-chain with a Filecoin-backed constitution. Scores update from covenant history.
              {loading && <span className="ml-2 inline-flex items-center gap-1 text-gray-300"><Spinner /></span>}
            </p>
            <div className="grid grid-cols-3 gap-5">
              {agents.map((agent) => (
                <div key={agent.address} className="border border-gray-100 rounded-xl p-6 hover:border-gray-300 transition-colors">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <h3 className="font-semibold font-mono">{agent.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{agent.type.replace("-", " ")}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-xs border border-gray-200 rounded px-2 py-0.5 text-gray-500 font-mono">{agent.tier}</span>
                      {agent.isRegistered && <span className="text-xs text-emerald-500 font-mono">✓ registered</span>}
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
                         className="text-blue-500 hover:underline transition-colors truncate">{trunc(agent.address, 22)} ↗</a>
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

        {/* ══ Covenants Tab ══ */}
        {activeTab === "covenants" && (
          <div>
            {/* ── Covenant Verifier ── */}
            <div className="border border-gray-100 rounded-xl p-5 mb-6">
              <div className="text-xs text-gray-400 uppercase tracking-wider font-mono mb-3">Verify Any Covenant</div>
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden flex-1 max-w-xs">
                  <span className="px-3 text-gray-400 text-sm font-mono border-r border-gray-200 bg-gray-50 py-2">#</span>
                  <input
                    type="number" min="0" placeholder="Covenant ID (e.g. 12)"
                    value={verifyInput} onChange={(e) => setVerifyInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                    className="px-3 py-2 text-sm font-mono outline-none flex-1 bg-white"
                  />
                </div>
                <button onClick={handleVerify} disabled={!verifyInput || verifyResult === "loading"}
                  className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors font-medium">
                  {verifyResult === "loading" ? "Looking up…" : "Verify Proof"}
                </button>
                {verifyResult && verifyResult !== "loading" && (
                  <button onClick={() => { setVerifyResult(null); setVerifyInput(""); }}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors">clear</button>
                )}
              </div>

              {verifyResult === "not-found" && (
                <div className="mt-3 text-sm text-red-500 font-mono">Covenant #{verifyInput} not found on-chain</div>
              )}
              {verifyResult && verifyResult !== "loading" && verifyResult !== "not-found" && (
                <div className="mt-4">
                  <div className="text-xs text-gray-400 font-mono mb-2">Proof for Covenant #{verifyResult.id}</div>
                  <CovenantCard c={verifyResult} />
                </div>
              )}
            </div>

            {/* ── Covenant List ── */}
            <p className="text-sm text-gray-400 mb-4">
              {covCount > 0 ? `${covCount} total · ${fulfilled} fulfilled · showing most recent 20` : "Loading…"}
              {loading && <span className="ml-2 inline-flex items-center gap-1 text-gray-300"><Spinner /></span>}
            </p>

            {covenants.length === 0 && !loading && (
              <div className="border border-gray-100 rounded-xl p-10 text-center text-gray-300 text-sm">No covenants found</div>
            )}

            <div className="space-y-3">
              {covenants.map((c) => <CovenantCard key={c.id} c={c} />)}
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
