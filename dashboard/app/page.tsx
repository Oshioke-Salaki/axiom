"use client";

import { useState, useEffect, useCallback } from "react";

interface Agent {
  address: string;
  name: string;
  type: string;
  constitutionCID: string;
  score: number;
  tier: string;
  totalCovenants: number;
  fulfilled: number;
  breached: number;
}

interface Covenant {
  id: number;
  requester: string;
  provider: string;
  paymentAmount: string;
  state: "OPEN" | "COMMITTED" | "FULFILLED" | "BREACHED" | "CANCELLED";
  termsCID: string;
  reasoningCID?: string;
  deliverableCID?: string;
  createdAt: number;
  fulfilledAt?: number;
}

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

const MOCK_AGENTS: Agent[] = [
  {
    address: "0x3C926EA189e8729929d29175b6f75481422295cA",
    name: "Nexus-1",
    type: "orchestrator",
    constitutionCID: "bafybeigewogICJuYW1lIjogIk5leHVzLTEi",
    score: 300,
    tier: "Provisional",
    totalCovenants: 2,
    fulfilled: 2,
    breached: 0,
  },
  {
    address: "0xf0898B30aB69183875375A836C84435c758fc2B3",
    name: "Sentinel-1",
    type: "sentiment",
    constitutionCID: "bafybeigewogICJuYW1lIjogIlNlbnRpbmVs",
    score: 350,
    tier: "Provisional",
    totalCovenants: 1,
    fulfilled: 1,
    breached: 0,
  },
  {
    address: "0x12e70471cE10220c06deaaeE401FE1054f596De4",
    name: "ChainEye-1",
    type: "onchain-data",
    constitutionCID: "bafybeigewogICJuYW1lIjogIkNoYWluRXll",
    score: 325,
    tier: "Provisional",
    totalCovenants: 1,
    fulfilled: 1,
    breached: 0,
  },
];

const MOCK_COVENANTS: Covenant[] = [
  {
    id: 12,
    requester: "Nexus-1",
    provider: "Sentinel-1",
    paymentAmount: "0.001 ETH",
    state: "FULFILLED",
    termsCID: "bafybeigewogICJ0YXNrIjogIlByb3ZpZGUg",
    reasoningCID: "bafybeigewogICJheGlvbSI6ICIxLjAuMCIs",
    deliverableCID: "bafybeigewogICJhc3NldCI6ICJFVEgiLAog",
    createdAt: Date.now() - 180000,
    fulfilledAt: Date.now() - 60000,
  },
  {
    id: 13,
    requester: "Nexus-1",
    provider: "ChainEye-1",
    paymentAmount: "0.001 ETH",
    state: "FULFILLED",
    termsCID: "bafybeigewogICJ0YXNrIjogIlByb3ZpZGUg",
    reasoningCID: "bafybeigewogICJheGlvbSI6ICIxLjAuMCIs",
    deliverableCID: "bafybeigewogICJhc3NldCI6ICJFVEgiLAog",
    createdAt: Date.now() - 170000,
    fulfilledAt: Date.now() - 55000,
  },
];

const MOCK_STEPS: PipelineStep[] = [
  { id: "1", timestamp: "09:42:01", agent: "Nexus-1", action: "Register", detail: "Constitution anchored to Filecoin", cid: "bafybeigewogICJuYW1lIjogIk5leHVzLTEi", type: "storage" },
  { id: "2", timestamp: "09:42:03", agent: "Sentinel-1", action: "Register", detail: "Constitution anchored to Filecoin", cid: "bafybeigewogICJuYW1sIjogIlNlbnRpbmVs", type: "storage" },
  { id: "3", timestamp: "09:42:05", agent: "ChainEye-1", action: "Register", detail: "Constitution anchored to Filecoin", cid: "bafybeigewogICJuYW1lIjogIkNoYWluRXll", type: "storage" },
  { id: "4", timestamp: "09:42:08", agent: "Nexus-1", action: "Covenant #12", detail: "Hired Sentinel-1 — 0.001 ETH locked in escrow on Base", txHash: "0x879602acc937bd7d2a0f405989a40aa302f5b4cfa3ca808c189cd4ed5d7592cc", type: "info" },
  { id: "5", timestamp: "09:42:14", agent: "Nexus-1", action: "Covenant #13", detail: "Hired ChainEye-1 — 0.001 ETH locked in escrow on Base", txHash: "0x37461f3f321c8be243831d81732b6f04999c6e7ad1c2ff8a9bcea28b75a92742", type: "info" },
  { id: "6", timestamp: "09:42:22", agent: "Sentinel-1", action: "Commit", detail: "keccak256(reasoning + salt) stored on-chain before any analysis runs", txHash: "0x879602acc937bd7d2a0f405989a40aa302f5b4cfa3ca808c189cd4ed5d7592cc", type: "commit" },
  { id: "7", timestamp: "09:42:28", agent: "ChainEye-1", action: "Commit", detail: "keccak256(reasoning + salt) stored on-chain before any analysis runs", txHash: "0x37461f3f321c8be243831d81732b6f04999c6e7ad1c2ff8a9bcea28b75a92742", type: "commit" },
  { id: "8", timestamp: "09:42:55", agent: "Sentinel-1", action: "Analysis", detail: "ETH sentiment: bullish at 71% confidence — BUY signal via Bankr LLM", type: "info" },
  { id: "9", timestamp: "09:43:02", agent: "ChainEye-1", action: "Analysis", detail: "DEX vol $1.8B (+7.4%), whale accumulation detected — BULLISH at 63%", type: "info" },
  { id: "10", timestamp: "09:43:10", agent: "Sentinel-1", action: "Fulfill #12", detail: "Reasoning revealed — hash matched on-chain. Escrow released.", cid: "bafybeigewogICJheGlvbSI6ICIxLjAuMCIs", txHash: "0xd144e243abf91a0571998f0c73805ef212a6efbb16ad22b2e1481e9c7531bcb4", type: "fulfill" },
  { id: "11", timestamp: "09:43:14", agent: "ChainEye-1", action: "Fulfill #13", detail: "Reasoning revealed — hash matched on-chain. Escrow released.", cid: "bafybeigewogICJhc3NldCI6ICJFVEgiLAog", txHash: "0x0c754f942cddf0cd496c935a1de573ee82e5cc9f0ef1ae965b1f2e84ac9fd990", type: "fulfill" },
  { id: "12", timestamp: "09:43:18", agent: "Nexus-1", action: "Synthesize", detail: "Aggregating verified signals from 2 covenant-bound agents", type: "info" },
  { id: "13", timestamp: "09:43:24", agent: "Nexus-1", action: "Decision", detail: "BUY ETH — 67% confidence, medium risk, 3% portfolio size", type: "decision" },
  { id: "14", timestamp: "09:43:26", agent: "Nexus-1", action: "Audit log", detail: "Full pipeline stored on Filecoin — permanent and tamper-proof", cid: "bafybeigewogICJwaXBlbGluZUlkIjogInBp", type: "storage" },
];

const stepBorderColor: Record<PipelineStep["type"], string> = {
  commit:   "border-l-amber-400",
  fulfill:  "border-l-emerald-400",
  storage:  "border-l-blue-400",
  decision: "border-l-black",
  info:     "border-l-gray-200",
};

const stepDot: Record<PipelineStep["type"], string> = {
  commit:   "bg-amber-400",
  fulfill:  "bg-emerald-400",
  storage:  "bg-blue-400",
  decision: "bg-black",
  info:     "bg-gray-300",
};

function truncate(s: string, n = 20) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function ReputationBar({ score }: { score: number }) {
  const pct = Math.round((score / 1000) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-black rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-500 w-14 text-right">{score} / 1000</span>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"pipeline" | "agents" | "covenants">("pipeline");
  const [visibleSteps, setVisibleSteps] = useState<PipelineStep[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [decision, setDecision] = useState<{ action: string; confidence: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);

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

  const tabs = ["pipeline", "agents", "covenants"] as const;

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
            <span className="text-gray-300 text-sm">·</span>
            <span className="text-gray-400 text-xs">The Promise Layer for AI Agents</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-gray-400">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Base Sepolia
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Filecoin Calibration
            </div>
            <div className="border border-gray-200 rounded px-2.5 py-1 font-mono text-gray-500">
              3 agents · 2 covenants
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-8 py-10">

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden mb-10">
          {[
            { value: "3", label: "Registered Agents", sub: "on Base Sepolia" },
            { value: "0.002", label: "ETH in Escrow", sub: "across 2 covenants" },
            { value: "9", label: "Filecoin CIDs", sub: "permanent audit trail" },
            {
              value: decision?.action ?? "—",
              label: "Pipeline Decision",
              sub: decision ? `${Math.round(decision.confidence * 100)}% confidence` : "running…",
              highlight: !!decision,
            },
          ].map((s) => (
            <div key={s.label} className="bg-white px-7 py-6">
              <div className={`text-3xl font-bold font-mono tracking-tight ${s.highlight ? "text-black" : "text-black"}`}>
                {s.value}
              </div>
              <div className="text-sm text-gray-700 mt-1 font-medium">{s.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center justify-between mb-8 border-b border-gray-100 pb-0">
          <div className="flex gap-0">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-1 py-3 mr-8 text-sm capitalize border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? "border-black text-black font-medium"
                    : "border-transparent text-gray-400 hover:text-gray-700"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <button
            onClick={replayPipeline}
            disabled={isReplaying}
            className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-500 hover:text-black hover:border-gray-400 disabled:opacity-40 transition-all font-mono"
          >
            {isReplaying ? `running ${elapsed}s…` : "↻ replay"}
          </button>
        </div>

        {/* ── Pipeline Tab ── */}
        {activeTab === "pipeline" && (
          <div className="grid grid-cols-5 gap-8">
            {/* Feed */}
            <div className="col-span-3">
              <div className="space-y-1 max-h-[560px] overflow-y-auto pr-2">
                {visibleSteps.length === 0 && (
                  <div className="py-20 text-center text-gray-300 text-sm">
                    pipeline will appear here
                  </div>
                )}
                {visibleSteps.map((step) => (
                  <div
                    key={step.id}
                    className={`flex items-start gap-4 px-4 py-3 border-l-2 ${stepBorderColor[step.type]} animate-in fade-in duration-200 slide-in-from-bottom-1`}
                  >
                    <span className="text-gray-300 font-mono text-xs mt-0.5 w-16 shrink-0">{step.timestamp}</span>
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${stepDot[step.type]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-mono text-gray-400">{step.agent}</span>
                          <span className="text-sm font-medium text-gray-900">{step.action}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.detail}</p>
                        {step.txHash && (
                          <p className="text-xs font-mono text-gray-300 mt-1 truncate">
                            tx {truncate(step.txHash, 32)}
                          </p>
                        )}
                        {step.cid && (
                          <p className="text-xs font-mono text-blue-400 mt-0.5 truncate">
                            {truncate(step.cid, 32)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-5 mt-6 pt-4 border-t border-gray-100">
                {[
                  { color: "bg-amber-400", label: "On-chain commit" },
                  { color: "bg-emerald-400", label: "Covenant fulfilled" },
                  { color: "bg-blue-400", label: "Filecoin storage" },
                  { color: "bg-black", label: "Final decision" },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className={`w-2 h-2 rounded-full ${l.color}`} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Right panel */}
            <div className="col-span-2 space-y-6">

              {/* Decision card */}
              {decision ? (
                <div className="border border-black rounded-xl p-6">
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-mono mb-3">Final Decision</div>
                  <div className="text-6xl font-bold font-mono tracking-tight text-black mb-2">
                    {decision.action}
                  </div>
                  <div className="text-sm text-gray-500 mb-4">
                    ETH · {Math.round(decision.confidence * 100)}% confidence · medium risk · 3% size
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="text-emerald-500">✓</span>
                      Reasoning committed before analysis ran
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="text-emerald-500">✓</span>
                      Hash verified on-chain — cannot be altered
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="text-emerald-500">✓</span>
                      Evidence stored permanently on Filecoin
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="text-emerald-500">✓</span>
                      Agent reputation updated on Base
                    </div>
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
                    { label: "Filecoin Onchain Cloud", desc: "Constitutions · reasoning · audit logs", dot: "bg-blue-400" },
                    { label: "Base Sepolia", desc: "Covenant protocol · reputation system", dot: "bg-emerald-400" },
                    { label: "Bankr LLM Gateway", desc: "Claude · Gemini · GPT unified API", dot: "bg-purple-400" },
                    { label: "MetaMask Delegation", desc: "ERC-7715 scoped permissions", dot: "bg-orange-400" },
                    { label: "x402 Protocol", desc: "Agent-to-agent USDC payments", dot: "bg-amber-400" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3">
                      <span className={`w-1.5 h-1.5 rounded-full ${item.dot} shrink-0 mt-1.5`} />
                      <div>
                        <div className="text-xs font-medium text-gray-800">{item.label}</div>
                        <div className="text-xs text-gray-400">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Why AXIOM */}
              <div className="border border-gray-100 rounded-xl p-5">
                <div className="text-xs text-gray-400 uppercase tracking-wider font-mono mb-3">Why AXIOM</div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  AI agents can&apos;t make credible promises to each other.
                  AXIOM is the first protocol where agents commit{" "}
                  <span className="font-mono text-amber-500 font-medium">keccak256(reasoning)</span>{" "}
                  on-chain <em>before</em> acting. Retroactive tampering is
                  cryptographically impossible. Every decision is permanently
                  auditable by anyone, forever.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Agents Tab ── */}
        {activeTab === "agents" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400 mb-6">
              Every agent is registered on-chain with a Filecoin-backed constitution. Identity, reputation, and execution history are permanently auditable.
            </p>
            <div className="grid grid-cols-3 gap-5">
              {MOCK_AGENTS.map((agent) => (
                <div key={agent.address} className="border border-gray-100 rounded-xl p-6 hover:border-gray-300 transition-colors">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <h3 className="font-semibold text-base font-mono">{agent.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{agent.type.replace("-", " ")}</p>
                    </div>
                    <span className="text-xs border border-gray-200 rounded px-2 py-0.5 text-gray-500 font-mono">
                      {agent.tier}
                    </span>
                  </div>

                  <div className="mb-5">
                    <div className="flex justify-between text-xs text-gray-400 mb-2">
                      <span>Reputation</span>
                    </div>
                    <ReputationBar score={agent.score} />
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-5 text-center">
                    <div className="bg-gray-50 rounded-lg py-3">
                      <div className="text-xl font-bold font-mono">{agent.totalCovenants}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Total</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg py-3">
                      <div className="text-xl font-bold font-mono text-emerald-500">{agent.fulfilled}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Fulfilled</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg py-3">
                      <div className="text-xl font-bold font-mono text-red-400">{agent.breached}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Breached</div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex gap-2">
                      <span className="text-gray-300 w-10 shrink-0">addr</span>
                      <span className="text-gray-500 truncate">{truncate(agent.address, 22)}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-gray-300 w-10 shrink-0">cid</span>
                      <span className="text-blue-400 truncate">{truncate(agent.constitutionCID, 22)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Covenants Tab ── */}
        {activeTab === "covenants" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400 mb-6">
              Reasoning is committed <span className="text-black font-medium">before</span> agents act.
              The contract verifies the reveal hash matches the commitment — retroactive tampering is impossible.
            </p>
            {MOCK_COVENANTS.map((c) => (
              <div key={c.id} className="border border-gray-100 rounded-xl p-6 hover:border-gray-200 transition-colors">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold font-mono">Covenant #{c.id}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded font-mono border ${
                        c.state === "FULFILLED"
                          ? "border-emerald-200 text-emerald-600 bg-emerald-50"
                          : c.state === "COMMITTED"
                          ? "border-amber-200 text-amber-600 bg-amber-50"
                          : c.state === "BREACHED"
                          ? "border-red-200 text-red-600 bg-red-50"
                          : "border-gray-200 text-gray-500"
                      }`}>
                        {c.state}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">
                      {c.requester} <span className="text-gray-300">→</span> {c.provider}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold">{c.paymentAmount}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(c.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-400 font-mono mb-1.5">Terms CID</div>
                    <div className="text-xs font-mono text-gray-600 truncate">{c.termsCID}</div>
                  </div>
                  {c.reasoningCID && (
                    <div className="bg-amber-50 rounded-lg p-3">
                      <div className="text-xs text-amber-500 font-mono mb-1.5">Reasoning CID · pre-committed</div>
                      <div className="text-xs font-mono text-gray-600 truncate">{c.reasoningCID}</div>
                    </div>
                  )}
                  {c.deliverableCID && (
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <div className="text-xs text-emerald-500 font-mono mb-1.5">Deliverable CID</div>
                      <div className="text-xs font-mono text-gray-600 truncate">{c.deliverableCID}</div>
                    </div>
                  )}
                </div>

                {c.state === "FULFILLED" && (
                  <div className="mt-4 pt-4 border-t border-gray-50 flex items-center gap-5 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5"><span className="text-emerald-500">✓</span> Commitment verified on-chain</span>
                    <span className="flex items-center gap-1.5"><span className="text-emerald-500">✓</span> Reasoning hash matched</span>
                    <span className="flex items-center gap-1.5"><span className="text-emerald-500">✓</span> Escrow released automatically</span>
                    {c.fulfilledAt && (
                      <span className="ml-auto text-gray-300">
                        fulfilled at {new Date(c.fulfilledAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 mt-16">
        <div className="max-w-screen-xl mx-auto px-8 py-5 flex items-center justify-between">
          <span className="text-xs text-gray-300 font-mono">AXIOM Protocol · ETHGlobal</span>
          <div className="flex items-center gap-6 text-xs text-gray-300 font-mono">
            <span>Base</span>
            <span>Filecoin</span>
            <span>Bankr</span>
            <span>MetaMask</span>
            <span>x402</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
