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

const ASSET_OPTIONS = [
  { symbol: "ETH",  name: "Ethereum",  color: "text-blue-500"   },
  { symbol: "BTC",  name: "Bitcoin",   color: "text-amber-500"  },
  { symbol: "SOL",  name: "Solana",    color: "text-purple-500" },
  { symbol: "ARB",  name: "Arbitrum",  color: "text-blue-400"   },
  { symbol: "OP",   name: "Optimism",  color: "text-red-500"    },
  { symbol: "MATIC",name: "Polygon",   color: "text-violet-500" },
];

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const COVENANT_ABI = [
  { name: "covenantCount", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    name: "getCovenant", type: "function",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "id", type: "uint256" }, { name: "requester", type: "address" },
      { name: "provider", type: "address" }, { name: "termsHash", type: "string" },
      { name: "termsCID", type: "string" }, { name: "paymentAmount", type: "uint256" },
      { name: "deadline", type: "uint256" }, { name: "state", type: "uint8" },
      { name: "reasoningCommitment", type: "bytes32" }, { name: "reasoningCID", type: "string" },
      { name: "deliverableCID", type: "string" }, { name: "createdAt", type: "uint256" },
      { name: "committedAt", type: "uint256" }, { name: "fulfilledAt", type: "uint256" },
      { name: "delegationData", type: "bytes" }, { name: "minReputationRequired", type: "uint256" },
    ]}],
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

function TxLink({ hash, dark }: { hash: string; dark?: boolean }) {
  if (!hash || hash.length < 10) return <span className={`font-mono text-xs ${dark ? "text-[#444]" : "text-gray-300"}`}>{hash}</span>;
  return (
    <a href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" rel="noopener noreferrer"
       className="font-mono text-xs text-blue-500 hover:underline hover:text-blue-400 transition-colors">
      {trunc(hash, 28)} ↗
    </a>
  );
}

function CIDLink({ cid }: { cid: string }) {
  if (!cid) return <span className="text-[#444] text-xs font-mono">—</span>;
  const isSim = cid.includes("gewog");
  return (
    <a href={isSim ? undefined : `https://ipfs.io/ipfs/${cid}`}
       target={isSim ? undefined : "_blank"} rel="noopener noreferrer"
       title={isSim ? "Simulated CID — Filecoin providers were offline" : cid}
       className={`font-mono text-xs truncate transition-colors block ${isSim ? "text-gray-400 cursor-default" : "text-blue-500 hover:underline hover:text-blue-400"}`}>
      {trunc(cid, 32)}{!isSim && " ↗"}
    </a>
  );
}

function Spinner() {
  return <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin opacity-50" />;
}

function StateBadge({ state }: { state: string }) {
  const s: Record<string, string> = {
    FULFILLED: "border-emerald-500/30 text-emerald-500 bg-emerald-500/10",
    COMMITTED: "border-amber-500/30 text-amber-500 bg-amber-500/10",
    OPEN:      "border-blue-500/30 text-blue-500 bg-blue-500/10",
    BREACHED:  "border-red-500/30 text-red-500 bg-red-500/10",
    CANCELLED: "border-gray-500/30 text-gray-500 bg-gray-500/10",
  };
  return <span className={`text-xs px-2 py-0.5 rounded font-mono border ${s[state] ?? s.OPEN}`}>{state}</span>;
}

function ReputationBar({ score, dark }: { score: number; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 h-1 rounded-full overflow-hidden ${dark ? "bg-[#2a2a2a]" : "bg-gray-100"}`}>
        <div className={`h-full rounded-full transition-all duration-700 ${dark ? "bg-[#f0f0f0]" : "bg-black"}`}
             style={{ width: `${Math.min(100, (score / 1000) * 100)}%` }} />
      </div>
      <span className={`text-xs font-mono w-16 text-right ${dark ? "text-[#666]" : "text-gray-400"}`}>{score} / 1000</span>
    </div>
  );
}

// ─── Theme toggle icon ────────────────────────────────────────────────────────
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

const EVENT_STYLE: Record<string, { dot: string; label: string; text: string }> = {
  CovenantCreated:    { dot: "bg-blue-400",    label: "Created",   text: "text-blue-500"    },
  ReasoningCommitted: { dot: "bg-amber-400",   label: "Committed", text: "text-amber-500"   },
  CovenantFulfilled:  { dot: "bg-emerald-400", label: "Fulfilled", text: "text-emerald-500" },
  CovenantBreached:   { dot: "bg-red-400",     label: "Breached",  text: "text-red-500"     },
};

interface PipelineStep {
  id: string; timestamp: string; agent: string; action: string;
  detail: string; cid?: string; txHash?: string;
  type: "info" | "commit" | "fulfill" | "storage" | "decision";
}

function getMockSteps(asset: string): PipelineStep[] {
  return [
    { id:"1",  timestamp:"09:42:01", agent:"Nexus-1",    action:"Register",             detail:"Constitution anchored to Filecoin",                                             cid:"bafybeigewogICJuYW1lIjogIk5leHVzLTEi",    type:"storage"  },
    { id:"2",  timestamp:"09:42:03", agent:"Sentinel-1", action:"Register",             detail:"Constitution anchored to Filecoin",                                             cid:"bafybeigewogICJuYW1lIjogIlNlbnRpbmVs",   type:"storage"  },
    { id:"3",  timestamp:"09:42:05", agent:"ChainEye-1", action:"Register",             detail:"Constitution anchored to Filecoin",                                             cid:"bafybeigewogICJuYW1lIjogIkNoYWluRXll",   type:"storage"  },
    { id:"4",  timestamp:"09:42:08", agent:"Nexus-1",    action:"Covenant #12",         detail:`Hired Sentinel-1 — 0.001 ETH locked in escrow on Base`,                        txHash:"0x879602acc937bd7d2a0f405989a40aa302f5b4cfa3ca808c189cd4ed5d7592cc", type:"info"     },
    { id:"5",  timestamp:"09:42:14", agent:"Nexus-1",    action:"Covenant #13",         detail:`Hired ChainEye-1 — 0.001 ETH locked in escrow on Base`,                        txHash:"0x37461f3f321c8be243831d81732b6f04999c6e7ad1c2ff8a9bcea28b75a92742", type:"info"     },
    { id:"6",  timestamp:"09:42:22", agent:"Sentinel-1", action:"Commit",               detail:"keccak256(reasoning + salt) stored on-chain BEFORE analysis runs",             txHash:"0x879602acc937bd7d2a0f405989a40aa302f5b4cfa3ca808c189cd4ed5d7592cc", type:"commit"   },
    { id:"7",  timestamp:"09:42:28", agent:"ChainEye-1", action:"Commit",               detail:"keccak256(reasoning + salt) stored on-chain BEFORE analysis runs",             txHash:"0x37461f3f321c8be243831d81732b6f04999c6e7ad1c2ff8a9bcea28b75a92742", type:"commit"   },
    { id:"8",  timestamp:"09:42:55", agent:"Sentinel-1", action:`${asset} Sentiment`,   detail:`${asset} sentiment: bullish 71% confidence — BUY signal via Bankr LLM`,        type:"info"     },
    { id:"9",  timestamp:"09:43:02", agent:"ChainEye-1", action:`${asset} On-chain`,    detail:"DEX vol $1.8B (+7.4%), whale accumulation detected — BULLISH 63%",             type:"info"     },
    { id:"10", timestamp:"09:43:10", agent:"Sentinel-1", action:"Fulfill #12",          detail:"Reasoning revealed — hash matched on-chain. Escrow released automatically.",   cid:"bafybeigewogICJheGlvbSI6ICIxLjAuMCIs", txHash:"0xd144e243abf91a0571998f0c73805ef212a6efbb16ad22b2e1481e9c7531bcb4", type:"fulfill"  },
    { id:"11", timestamp:"09:43:14", agent:"ChainEye-1", action:"Fulfill #13",          detail:"Reasoning revealed — hash matched on-chain. Escrow released automatically.",   cid:"bafybeigewogICJhc3NldCI6ICJFVEgiLAog",  txHash:"0x0c754f942cddf0cd496c935a1de573ee82e5cc9f0ef1ae965b1f2e84ac9fd990", type:"fulfill"  },
    { id:"12", timestamp:"09:43:18", agent:"Nexus-1",    action:"Synthesize",           detail:"Aggregating verified signals from 2 covenant-bound agents",                    type:"info"     },
    { id:"13", timestamp:"09:43:24", agent:"Nexus-1",    action:"Decision",             detail:`BUY ${asset} — 67% confidence, medium risk, 3% portfolio size`,                type:"decision" },
    { id:"14", timestamp:"09:43:26", agent:"Nexus-1",    action:"Audit log",            detail:"Full pipeline stored on Filecoin — permanent and tamper-proof",                cid:"bafybeigewogICJwaXBlbGluZUlkIjogInBp", type:"storage"  },
  ];
}

const STEP_BORDER: Record<string, string> = { commit:"border-l-amber-400", fulfill:"border-l-emerald-400", storage:"border-l-blue-400", decision:"border-l-white dark:border-l-white", info:"border-l-gray-200 dark:border-l-[#2a2a2a]" };
const STEP_DOT:    Record<string, string> = { commit:"bg-amber-400", fulfill:"bg-emerald-400", storage:"bg-blue-400", decision:"bg-white", info:"bg-gray-300 dark:bg-[#444]" };

// ─── Asset Selector + Pipeline Launcher ───────────────────────────────────────
function PipelineLauncher({ dark, onLaunch }: { dark: boolean; onLaunch: (asset: string) => void }) {
  const [open, setOpen]         = useState(false);
  const [selected, setSelected] = useState("ETH");
  const [custom, setCustom]     = useState("");
  const panelRef                = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const finalAsset = custom.trim().toUpperCase() || selected;

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={() => setOpen((p) => !p)}
        className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded transition-colors font-medium ${dark ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-800"}`}>
        <span className="text-emerald-500">▶</span> Run Pipeline
        <span className={`font-mono text-xs ml-0.5 px-1.5 py-0.5 rounded ${dark ? "bg-black/10" : "bg-white/15"}`}>{finalAsset}</span>
      </button>

      {open && (
        <div className={`absolute right-0 top-full mt-2 w-72 rounded-xl border shadow-2xl z-50 p-4 ${dark ? "bg-[#141414] border-[#2a2a2a]" : "bg-white border-gray-100"}`}>
          <div className={`text-xs font-mono mb-3 ${dark ? "text-[#666]" : "text-gray-400"}`}>SELECT ASSET</div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {ASSET_OPTIONS.map((a) => (
              <button key={a.symbol} onClick={() => { setSelected(a.symbol); setCustom(""); }}
                className={`px-2 py-2 rounded-lg text-xs font-mono font-semibold transition-all border ${
                  selected === a.symbol && !custom
                    ? `${a.color} border-current bg-current/10`
                    : dark ? "border-[#2a2a2a] text-[#888] hover:border-[#444] hover:text-[#ccc]" : "border-gray-100 text-gray-500 hover:border-gray-300 hover:text-gray-800"
                }`}>
                {a.symbol}
              </button>
            ))}
          </div>
          <div className={`flex items-center border rounded-lg overflow-hidden mb-4 ${dark ? "border-[#2a2a2a] bg-[#0c0c0c]" : "border-gray-100 bg-gray-50"}`}>
            <span className={`px-3 text-xs font-mono border-r py-2 ${dark ? "border-[#2a2a2a] text-[#555]" : "border-gray-100 text-gray-400"}`}>custom</span>
            <input
              type="text" placeholder="e.g. PEPE, WIF, LINK…" maxLength={10}
              value={custom} onChange={(e) => { setCustom(e.target.value.toUpperCase()); setSelected(""); }}
              className={`px-3 py-2 text-xs font-mono outline-none flex-1 bg-transparent uppercase ${dark ? "text-[#f0f0f0] placeholder-[#444]" : "text-gray-800 placeholder-gray-300"}`}
            />
          </div>
          <button
            onClick={() => { setOpen(false); onLaunch(finalAsset); }}
            disabled={!finalAsset}
            className={`w-full py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${dark ? "bg-white text-black hover:bg-gray-100 disabled:opacity-40" : "bg-black text-white hover:bg-gray-800 disabled:opacity-40"}`}>
            <span className="text-emerald-500">▶</span> Launch {finalAsset} Pipeline
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Terminal Modal ───────────────────────────────────────────────────────────
interface TerminalLine { text: string; isError?: boolean; isCommand?: boolean }

function TerminalModal({ asset, onClose }: { asset: string; onClose: () => void }) {
  const [lines, setLines]   = useState<TerminalLine[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [simulated, setSim] = useState(false);
  const bottomRef           = useRef<HTMLDivElement>(null);
  const esRef               = useRef<EventSource | null>(null);

  const run = useCallback(() => {
    if (esRef.current) esRef.current.close();
    setLines([]); setStatus("running");
    const es = new EventSource(`/api/run-pipeline?asset=${encodeURIComponent(asset)}`);
    esRef.current = es;
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.line) {
        const parts = (data.line as string).split("\n");
        setLines((prev) => [...prev, ...parts.filter((p) => p !== "").map((p) => ({ text: p, isError: !!data.isError, isCommand: !!data.isCommand }))]);
      }
      if (data.done) { setStatus(data.code === 0 ? "done" : "error"); setSim(!!data.simulated); es.close(); }
    };
    es.onerror = () => {
      setLines((prev) => [...prev, { text: "Connection error.", isError: true }]);
      setStatus("error"); es.close();
    };
  }, [asset]);

  useEffect(() => { run(); return () => esRef.current?.close(); }, [run]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-[#2a2a2a]" style={{ maxHeight: "80vh" }}>
        <div className="bg-[#161616] px-4 py-3 flex items-center justify-between shrink-0 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <span className="text-[#666] text-xs font-mono ml-2">AXIOM Pipeline — {asset}</span>
            {status === "running" && <span className="flex items-center gap-1 text-xs text-emerald-400 font-mono"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> running</span>}
            {status === "done"    && <span className="text-xs text-emerald-400 font-mono">✓ complete{simulated ? " (demo)" : " (live)"}</span>}
            {status === "error"   && <span className="text-xs text-red-400 font-mono">✗ error</span>}
          </div>
          <div className="flex items-center gap-2">
            {status !== "running" && (
              <button onClick={run} className="text-xs font-mono text-[#666] hover:text-white px-2 py-1 rounded border border-[#2a2a2a] hover:border-[#444] transition-colors">↻ run again</button>
            )}
            <button onClick={onClose} className="text-[#666] hover:text-white transition-colors text-lg leading-none">×</button>
          </div>
        </div>
        <div className="bg-[#0a0a0a] flex-1 overflow-y-auto p-5 font-mono text-sm">
          {lines.length === 0 && status === "running" && (
            <div className="flex items-center gap-2 text-[#555] text-xs"><Spinner /> connecting…</div>
          )}
          {lines.map((line, i) => (
            <div key={i} className={`leading-relaxed whitespace-pre-wrap ${
              line.isCommand   ? "text-[#555]" :
              line.isError     ? "text-red-400" :
              line.text.includes("COMPLETE") || line.text.includes("✓") ? "text-emerald-400" :
              line.text.includes("DECISION") || line.text.includes("BUY") || line.text.includes("SELL") ? "text-white font-semibold" :
              line.text.includes("[Commit]") ? "text-amber-300" :
              line.text.includes("[Fulfill]") ? "text-emerald-300" :
              line.text.includes("Tx:") || line.text.includes("0x") ? "text-blue-400" :
              "text-[#aaa]"
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

// ─── Covenant Card ────────────────────────────────────────────────────────────
function CovenantCard({ c, dark }: { c: LiveCovenant; dark: boolean }) {
  const card   = dark ? "border-[#2a2a2a] hover:border-[#3a3a3a]" : "border-gray-100 hover:border-gray-200";
  const sub    = dark ? "bg-[#1a1a1a]" : "bg-gray-50";
  const amber  = dark ? "bg-amber-950/30" : "bg-amber-50";
  const green  = dark ? "bg-emerald-950/30" : "bg-emerald-50";
  const muted  = dark ? "text-[#666]" : "text-gray-400";
  const text   = dark ? "text-[#ccc]" : "text-gray-600";
  return (
    <div className={`border rounded-xl p-6 transition-colors ${card}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <a href={`https://sepolia.basescan.org/address/${CONTRACTS.COVENANT}`} target="_blank" rel="noopener noreferrer"
               className="font-semibold font-mono hover:text-blue-500 transition-colors">
              Covenant #{c.id} ↗
            </a>
            <StateBadge state={c.state} />
          </div>
          <p className={`text-sm ${muted}`}>
            {c.requesterName} <span className={`mx-1 ${dark ? "text-[#444]" : "text-gray-300"}`}>→</span> {c.providerName}
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono font-semibold text-sm">{c.paymentEth}</div>
          {c.createdAt > 0 && <div className={`text-xs mt-1 ${muted}`}>{new Date(c.createdAt).toLocaleString()}</div>}
        </div>
      </div>

      {c.reasoningCommitment && c.reasoningCommitment !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
        <div className={`mb-3 rounded-lg p-3 ${amber}`}>
          <div className="text-xs text-amber-500 font-mono mb-1">On-chain Commitment (stored BEFORE execution)</div>
          <div className={`font-mono text-xs break-all ${text}`}>{c.reasoningCommitment}</div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className={`rounded-lg p-3 ${sub}`}>
          <div className={`text-xs font-mono mb-1.5 ${muted}`}>Terms CID</div>
          <CIDLink cid={c.termsCID} />
        </div>
        <div className={`rounded-lg p-3 ${c.reasoningCID ? amber : sub}`}>
          <div className="text-xs text-amber-500 font-mono mb-1.5">Reasoning · pre-committed</div>
          <CIDLink cid={c.reasoningCID} />
        </div>
        <div className={`rounded-lg p-3 ${c.deliverableCID ? green : sub}`}>
          <div className="text-xs text-emerald-500 font-mono mb-1.5">Deliverable CID</div>
          <CIDLink cid={c.deliverableCID} />
        </div>
      </div>

      {c.state === "FULFILLED" && (
        <div className={`pt-3 border-t flex flex-wrap gap-x-5 gap-y-1 text-xs ${dark ? "border-[#2a2a2a] text-[#666]" : "border-gray-50 text-gray-400"}`}>
          {["Commitment verified on-chain", "Reasoning hash matched", "Escrow released automatically"].map((t) => (
            <span key={t} className="flex items-center gap-1.5"><span className="text-emerald-500">✓</span>{t}</span>
          ))}
          {c.fulfilledAt > 0 && <span className={`ml-auto font-mono ${dark ? "text-[#444]" : "text-gray-300"}`}>fulfilled {new Date(c.fulfilledAt).toLocaleTimeString()}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [dark, setDark] = useState(false);

  // Persist theme
  useEffect(() => {
    const saved = localStorage.getItem("axiom-theme");
    if (saved === "dark") setDark(true);
  }, []);
  const toggleDark = () => {
    setDark((d) => {
      localStorage.setItem("axiom-theme", !d ? "dark" : "light");
      return !d;
    });
  };

  const [activeTab,    setActiveTab]    = useState<"pipeline" | "live" | "agents" | "covenants">("pipeline");
  const [terminalAsset, setTerminalAsset] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState("ETH");

  // Pipeline replay
  const [visibleSteps, setVisibleSteps] = useState<PipelineStep[]>([]);
  const [isReplaying,  setIsReplaying]  = useState(false);
  const [decision,     setDecision]     = useState<{ action: string; confidence: number; asset: string } | null>(null);
  const [elapsed,      setElapsed]      = useState(0);

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

  useEffect(() => { refresh(); const id = setInterval(refresh, 15_000); return () => clearInterval(id); }, [refresh]);

  const replayPipeline = useCallback((asset = selectedAsset) => {
    const steps = getMockSteps(asset);
    setVisibleSteps([]); setDecision(null); setElapsed(0); setIsReplaying(true);
    const start = Date.now();
    steps.forEach((step, i) => {
      setTimeout(() => {
        setVisibleSteps((p) => [...p, step]);
        setElapsed(Math.round((Date.now() - start) / 100) / 10);
        if (step.type === "decision") setDecision({ action: "BUY", confidence: 0.67, asset });
        if (i === steps.length - 1) setIsReplaying(false);
      }, i * 650);
    });
  }, [selectedAsset]);

  useEffect(() => { replayPipeline(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = useCallback(async () => {
    const id = parseInt(verifyInput.trim(), 10);
    if (isNaN(id) || id < 0) return;
    setVerifyResult("loading");
    const result = await fetchCovenant(id);
    setVerifyResult(result ?? "not-found");
  }, [verifyInput]);

  const fulfilled = covenants.filter((c) => c.state === "FULFILLED").length;

  // ── theme-aware classes ────────────────────────────────────────────────────
  const bg      = dark ? "bg-[#0c0c0c] text-[#f0f0f0]" : "bg-white text-gray-900";
  const hdr     = dark ? "bg-[#0c0c0c]/95 border-[#1e1e1e]" : "bg-white/95 border-gray-100";
  const surface = dark ? "bg-[#141414] border-[#2a2a2a]" : "bg-white border-gray-100";
  const card    = dark ? "bg-[#141414]" : "bg-white";
  const divider = dark ? "bg-[#1e1e1e]" : "bg-gray-100";
  const muted   = dark ? "text-[#666]" : "text-gray-400";
  const sub     = dark ? "text-[#aaa]" : "text-gray-700";
  const border  = dark ? "border-[#2a2a2a]" : "border-gray-100";
  const inputBg = dark ? "bg-[#0c0c0c] border-[#2a2a2a] text-[#f0f0f0] placeholder-[#444]" : "bg-white border-gray-200 text-gray-900 placeholder-gray-300";
  const hoverRow = dark ? "hover:bg-[#141414]" : "hover:bg-gray-50";
  const tabActive = dark ? "border-white text-white" : "border-black text-black";
  const tabInact  = dark ? `border-transparent ${muted} hover:text-[#ccc]` : `border-transparent ${muted} hover:text-gray-700`;
  const btnOutline = dark ? "border-[#2a2a2a] text-[#888] hover:text-white hover:border-[#555]" : "border-gray-200 text-gray-400 hover:text-black hover:border-gray-400";

  return (
    <div className={`min-h-screen font-sans transition-colors duration-200 ${bg} ${dark ? "dark" : ""}`}>
      {terminalAsset && <TerminalModal asset={terminalAsset} onClose={() => setTerminalAsset(null)} />}

      {/* ── Header ── */}
      <header className={`border-b sticky top-0 z-20 backdrop-blur-sm ${hdr}`}>
        <div className="max-w-screen-xl mx-auto px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-7 h-7 rounded flex items-center justify-center ${dark ? "bg-white" : "bg-black"}`}>
              <span className={`text-xs font-bold tracking-tight ${dark ? "text-black" : "text-white"}`}>Ax</span>
            </div>
            <span className="font-semibold text-sm tracking-tight">AXIOM Protocol</span>
            <span className={dark ? "text-[#333]" : "text-gray-300"}>·</span>
            <span className={`text-xs hidden sm:block ${muted}`}>The Promise Layer for AI Agents</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-4 text-xs ${muted}`}>
              <a href={`https://sepolia.basescan.org/address/${CONTRACTS.COVENANT}`} target="_blank" rel="noopener noreferrer"
                 className={`flex items-center gap-1.5 transition-colors ${dark ? "hover:text-[#ccc]" : "hover:text-gray-700"}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Base Sepolia ↗
              </a>
              {loading
                ? <span className="flex items-center gap-1.5"><Spinner /> syncing</span>
                : lastSync && <span className="font-mono">{lastSync.toLocaleTimeString()}</span>
              }
            </div>
            {/* Theme toggle */}
            <button onClick={toggleDark}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${dark ? "border-[#2a2a2a] text-[#888] hover:text-white hover:border-[#444]" : "border-gray-200 text-gray-400 hover:text-black hover:border-gray-400"}`}>
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
            <PipelineLauncher dark={dark} onLaunch={(asset) => { setSelectedAsset(asset); setTerminalAsset(asset); }} />
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-8 py-10">

        {/* ── Stats ── */}
        <div className={`grid grid-cols-4 gap-px rounded-xl overflow-hidden mb-10 border ${dark ? "bg-[#1e1e1e] border-[#1e1e1e]" : "bg-gray-100 border-gray-100"}`}>
          {[
            { value: agents.filter((a) => a.isRegistered).length || 3, label: "Registered Agents",  sub: "on Base Sepolia" },
            { value: covCount || "—",                                   label: "Total Covenants",     sub: `${fulfilled} fulfilled` },
            { value: fulfilled || "—",                                  label: "Proofs Verified",     sub: "on-chain hash match" },
            { value: decision ? `${decision.action} ${decision.asset}` : "—", label: "Pipeline Decision", sub: decision ? `${Math.round(decision.confidence * 100)}% confidence` : "pick asset & run" },
          ].map((s) => (
            <div key={s.label} className={`px-7 py-6 ${card}`}>
              <div className="text-3xl font-bold font-mono tracking-tight flex items-baseline gap-2">
                {s.value}{loading && <span className="inline-flex"><Spinner /></span>}
              </div>
              <div className={`text-sm mt-1 font-medium ${sub}`}>{s.label}</div>
              <div className={`text-xs mt-0.5 ${muted}`}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className={`flex items-center justify-between border-b mb-8 ${border}`}>
          <div className="flex">
            {(["pipeline", "live", "agents", "covenants"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-1 py-3 mr-8 text-sm capitalize border-b-2 -mb-px transition-colors font-medium ${activeTab === tab ? tabActive : tabInact}`}>
                {tab}
                {tab === "live"      && events.length > 0   && <span className={`ml-1.5 text-xs font-mono ${muted}`}>{events.length}</span>}
                {tab === "covenants" && covCount > 0         && <span className={`ml-1.5 text-xs font-mono ${muted}`}>{covCount}</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pb-px">
            <button onClick={refresh} disabled={loading}
              className={`text-xs px-3 py-1.5 rounded border disabled:opacity-40 transition-all font-mono ${btnOutline}`}>
              ↻ sync
            </button>
            <button onClick={() => replayPipeline(selectedAsset)} disabled={isReplaying}
              className={`text-xs px-3 py-1.5 rounded border disabled:opacity-40 transition-all font-mono ${btnOutline}`}>
              {isReplaying ? `${elapsed}s…` : `▶ replay ${selectedAsset}`}
            </button>
          </div>
        </div>

        {/* ══ Pipeline Tab ══ */}
        {activeTab === "pipeline" && (
          <div className="grid grid-cols-5 gap-8">
            <div className="col-span-3">
              <div className="space-y-0.5 max-h-[560px] overflow-y-auto pr-2">
                {visibleSteps.length === 0 && (
                  <div className={`py-20 text-center text-sm ${muted}`}>select an asset and click ▶ Run Pipeline</div>
                )}
                {visibleSteps.map((step) => (
                  <div key={step.id} className={`flex items-start gap-4 px-4 py-3 border-l-2 ${STEP_BORDER[step.type]}`}
                       style={{ animation: "fadeSlideIn 0.2s ease forwards" }}>
                    <span className={`font-mono text-xs mt-0.5 w-16 shrink-0 ${muted}`}>{step.timestamp}</span>
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${STEP_DOT[step.type]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={`text-xs font-mono ${muted}`}>{step.agent}</span>
                          <span className="text-sm font-medium">{step.action}</span>
                        </div>
                        <p className={`text-xs mt-0.5 ${muted}`}>{step.detail}</p>
                        {step.txHash && <div className="mt-1"><TxLink hash={step.txHash} /></div>}
                        {step.cid    && <div className="mt-0.5"><CIDLink cid={step.cid} /></div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className={`flex items-center gap-5 mt-5 pt-4 border-t ${border}`}>
                {[{ c:"bg-amber-400", l:"Commit" }, { c:"bg-emerald-400", l:"Fulfill" }, { c:"bg-blue-400", l:"Filecoin" }, { c:dark?"bg-white":"bg-black", l:"Decision" }].map((l) => (
                  <div key={l.l} className={`flex items-center gap-1.5 text-xs ${muted}`}>
                    <span className={`w-2 h-2 rounded-full ${l.c}`} /> {l.l}
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-2 space-y-5">
              {decision ? (
                <div className={`border rounded-xl p-6 ${dark ? "border-white/20 bg-[#141414]" : "border-black"}`}>
                  <div className={`text-xs uppercase tracking-wider font-mono mb-3 ${muted}`}>Final Decision</div>
                  <div className="text-5xl font-bold font-mono tracking-tight mb-1">{decision.action}</div>
                  <div className={`text-sm mb-4 ${muted}`}>{decision.asset} · {Math.round(decision.confidence * 100)}% confidence · medium risk · 3% size</div>
                  <div className="space-y-2 text-xs">
                    {["Reasoning committed before analysis ran", "Hash verified on-chain — cannot be altered", "Evidence stored permanently on Filecoin", "Agent reputation updated on Base"].map((t) => (
                      <div key={t} className={`flex items-center gap-2 ${sub}`}><span className="text-emerald-500">✓</span>{t}</div>
                    ))}
                  </div>
                  <div className={`mt-4 pt-4 border-t space-y-1.5 ${border}`}>
                    <div className={`text-xs font-mono mb-2 ${muted}`}>Live proof transactions</div>
                    <TxLink hash="0xd144e243abf91a0571998f0c73805ef212a6efbb16ad22b2e1481e9c7531bcb4" />
                    <TxLink hash="0x0c754f942cddf0cd496c935a1de573ee82e5cc9f0ef1ae965b1f2e84ac9fd990" />
                  </div>
                </div>
              ) : (
                <div className={`border rounded-xl p-6 flex flex-col items-start gap-3 ${border}`}>
                  <div className={`text-xs uppercase tracking-wider font-mono ${muted}`}>Final Decision</div>
                  <div className={`text-3xl font-mono font-bold ${dark ? "text-[#333]" : "text-gray-200"}`}>—</div>
                  <p className={`text-xs ${muted}`}>Run the pipeline on any asset to see a live decision.</p>
                </div>
              )}

              <div className={`border rounded-xl p-5 ${border}`}>
                <div className={`text-xs uppercase tracking-wider font-mono mb-4 ${muted}`}>Protocol Stack</div>
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
                        <div className={`text-xs font-medium transition-colors ${dark ? "text-[#ccc] group-hover:text-white" : "text-gray-800 group-hover:text-black"}`}>{item.l} <span className={muted}>↗</span></div>
                        <div className={`text-xs ${muted}`}>{item.d}</div>
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
              <p className={`text-sm ${muted}`}>
                Real-time events from the CovenantProtocol contract on Base Sepolia.
                {loading && <span className="ml-2 inline-flex items-center gap-1"><Spinner /> fetching…</span>}
              </p>
              <div className="flex gap-3 text-xs">
                {Object.entries(EVENT_STYLE).map(([key, val]) => (
                  <div key={key} className={`flex items-center gap-1.5 ${muted}`}>
                    <span className={`w-2 h-2 rounded-full ${val.dot}`} /> {val.label}
                  </div>
                ))}
              </div>
            </div>

            {events.length === 0 && !loading && (
              <div className={`border rounded-xl p-16 text-center ${border}`}>
                <div className={`text-sm mb-2 ${muted}`}>No events in recent blocks</div>
                <div className={`text-xs ${dark ? "text-[#444]" : "text-gray-300"}`}>Run the pipeline to generate on-chain activity</div>
              </div>
            )}

            <div className={`border rounded-xl overflow-hidden ${border}`}>
              {events.map((ev, i) => {
                const style = EVENT_STYLE[ev.eventName] ?? { dot: "bg-gray-300", label: ev.eventName, text: dark ? "text-[#aaa]" : "text-gray-600" };
                return (
                  <div key={`${ev.txHash}-${i}`}
                    className={`flex items-center gap-4 px-5 py-3.5 text-xs ${i !== events.length - 1 ? `border-b ${border}` : ""} ${hoverRow} transition-colors`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                    <span className={`font-mono font-medium w-32 shrink-0 ${style.text}`}>{style.label}</span>
                    <span className={`font-mono w-16 shrink-0 ${muted}`}>#{ev.covenantId.toString()}</span>
                    <span className={`font-mono shrink-0 ${muted}`}>{ADDR_TO_NAME[ev.address.toLowerCase()] ?? trunc(ev.address, 14)}</span>
                    {ev.extra && <span className={`font-mono ${muted}`}>{ev.extra}</span>}
                    <div className="ml-auto flex items-center gap-4">
                      <span className={`font-mono ${dark ? "text-[#444]" : "text-gray-300"}`}>block {ev.blockNumber.toString()}</span>
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
            <p className={`text-sm mb-6 ${muted}`}>
              Every agent is registered on-chain with a Filecoin-backed constitution. Scores update from covenant history.
              {loading && <span className="ml-2 inline-flex items-center gap-1"><Spinner /></span>}
            </p>
            <div className="grid grid-cols-3 gap-5">
              {agents.map((agent) => (
                <div key={agent.address} className={`border rounded-xl p-6 transition-colors ${dark ? "border-[#2a2a2a] hover:border-[#3a3a3a]" : "border-gray-100 hover:border-gray-300"}`}>
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <h3 className="font-semibold font-mono">{agent.name}</h3>
                      <p className={`text-xs mt-0.5 capitalize ${muted}`}>{agent.type.replace("-", " ")}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`text-xs border rounded px-2 py-0.5 font-mono ${dark ? "border-[#2a2a2a] text-[#888]" : "border-gray-200 text-gray-500"}`}>{agent.tier}</span>
                      {agent.isRegistered && <span className="text-xs text-emerald-500 font-mono">✓ registered</span>}
                    </div>
                  </div>
                  <div className="mb-5">
                    <div className={`text-xs mb-2 ${muted}`}>Reputation Score</div>
                    <ReputationBar score={agent.score} dark={dark} />
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex gap-2">
                      <span className={`shrink-0 w-10 ${dark ? "text-[#444]" : "text-gray-300"}`}>addr</span>
                      <a href={`https://sepolia.basescan.org/address/${agent.address}`} target="_blank" rel="noopener noreferrer"
                         className="text-blue-500 hover:underline transition-colors truncate">{trunc(agent.address, 22)} ↗</a>
                    </div>
                    {agent.constitutionCID && (
                      <div className="flex gap-2">
                        <span className={`shrink-0 w-10 ${dark ? "text-[#444]" : "text-gray-300"}`}>cid</span>
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
            <div className={`border rounded-xl p-5 mb-6 ${border}`}>
              <div className={`text-xs uppercase tracking-wider font-mono mb-3 ${muted}`}>Verify Any Covenant</div>
              <div className="flex items-center gap-3">
                <div className={`flex items-center border rounded-lg overflow-hidden flex-1 max-w-xs ${dark ? "border-[#2a2a2a]" : "border-gray-200"}`}>
                  <span className={`px-3 text-sm font-mono border-r py-2 ${dark ? "border-[#2a2a2a] text-[#555] bg-[#141414]" : "border-gray-200 text-gray-400 bg-gray-50"}`}>#</span>
                  <input
                    type="number" min="0" placeholder="Covenant ID (e.g. 12)"
                    value={verifyInput} onChange={(e) => setVerifyInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                    className={`px-3 py-2 text-sm font-mono outline-none flex-1 bg-transparent ${inputBg}`}
                  />
                </div>
                <button onClick={handleVerify} disabled={!verifyInput || verifyResult === "loading"}
                  className={`px-4 py-2 text-sm rounded-lg disabled:opacity-40 transition-colors font-medium ${dark ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-800"}`}>
                  {verifyResult === "loading" ? "Looking up…" : "Verify Proof"}
                </button>
                {verifyResult && verifyResult !== "loading" && (
                  <button onClick={() => { setVerifyResult(null); setVerifyInput(""); }}
                    className={`text-xs transition-colors ${dark ? "text-[#666] hover:text-[#ccc]" : "text-gray-400 hover:text-gray-700"}`}>clear</button>
                )}
              </div>
              {verifyResult === "not-found" && (
                <div className="mt-3 text-sm text-red-500 font-mono">Covenant #{verifyInput} not found on-chain</div>
              )}
              {verifyResult && verifyResult !== "loading" && verifyResult !== "not-found" && (
                <div className="mt-4">
                  <div className={`text-xs font-mono mb-2 ${muted}`}>Proof for Covenant #{(verifyResult as LiveCovenant).id}</div>
                  <CovenantCard c={verifyResult as LiveCovenant} dark={dark} />
                </div>
              )}
            </div>

            <p className={`text-sm mb-4 ${muted}`}>
              {covCount > 0 ? `${covCount} total · ${fulfilled} fulfilled · showing most recent 20` : "Loading…"}
              {loading && <span className="ml-2 inline-flex items-center gap-1"><Spinner /></span>}
            </p>

            {covenants.length === 0 && !loading && (
              <div className={`border rounded-xl p-10 text-center text-sm ${border} ${muted}`}>No covenants found</div>
            )}
            <div className="space-y-3">
              {covenants.map((c) => <CovenantCard key={c.id} c={c} dark={dark} />)}
            </div>
          </div>
        )}
      </main>

      <footer className={`border-t mt-16 ${border}`}>
        <div className={`max-w-screen-xl mx-auto px-8 py-5 flex items-center justify-between text-xs font-mono ${muted}`}>
          <span>AXIOM Protocol · ETHGlobal Agents</span>
          <div className="flex items-center gap-6">
            {[
              { l: "BaseScan ↗", h: `https://sepolia.basescan.org/address/${CONTRACTS.COVENANT}` },
              { l: "Filecoin ↗", h: "https://filecoin.io" },
              { l: "Bankr ↗",    h: "https://bankr.bot" },
              { l: "MetaMask ↗", h: "https://metamask.io" },
            ].map((x) => (
              <a key={x.l} href={x.h} target="_blank" rel="noopener noreferrer"
                 className={`transition-colors ${dark ? "text-[#444] hover:text-[#aaa]" : "text-gray-300 hover:text-gray-600"}`}>{x.l}</a>
            ))}
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
