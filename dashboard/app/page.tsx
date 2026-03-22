"use client";

import { useState, useEffect, useRef } from "react";

function useTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

function AnimatedCount({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      let v = 0;
      const step = Math.ceil(to / 40);
      const id = setInterval(() => {
        v = Math.min(v + step, to);
        setVal(v);
        if (v >= to) clearInterval(id);
      }, 28);
    });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

function TerminalLine({ text, delay = 0, dim }: { text: string; delay?: number; dim?: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  if (!shown) return <div className="h-[1.25rem]" />;
  return (
    <div className={`font-mono text-xs leading-5 ${dim ? "opacity-30" : "opacity-100"}`}>
      {text}
    </div>
  );
}

export default function Landing() {
  const { dark, toggle } = useTheme();

  const bg      = dark ? "bg-[#0c0c0c]"   : "bg-white";
  const fg      = dark ? "text-[#f0f0f0]"  : "text-[#111]";
  const sub     = dark ? "text-[#888]"     : "text-gray-500";
  const muted   = dark ? "text-[#444]"     : "text-gray-300";
  const border  = dark ? "border-[#1e1e1e]": "border-gray-100";
  const cardBg  = dark ? "bg-[#111]"       : "bg-gray-50";
  const cardBdr = dark ? "border-[#1e1e1e]": "border-gray-100";
  const navBg   = dark ? "bg-[#0c0c0c]/90 border-[#1a1a1a]" : "bg-white/90 border-gray-100";

  return (
    <div className={`min-h-screen ${bg} ${fg} transition-colors duration-300`}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 inset-x-0 z-50 border-b backdrop-blur-xl ${navBg}`}>
        <div className="max-w-5xl mx-auto px-6 h-13 flex items-center justify-between">
          <span className="font-mono font-black text-base tracking-tight">AXIOM</span>
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              className={`w-7 h-7 rounded-md border flex items-center justify-center text-xs transition-colors ${dark ? "border-[#2a2a2a] text-[#555] hover:text-[#aaa]" : "border-gray-200 text-gray-400 hover:text-gray-700"}`}
            >
              {dark ? "○" : "●"}
            </button>
            <a
              href="/app"
              className={`px-4 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${dark ? "bg-[#f0f0f0] text-[#0c0c0c] hover:bg-white" : "bg-[#111] text-white hover:bg-black"}`}
            >
              Launch app →
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="pt-36 pb-24 px-6 max-w-5xl mx-auto">
        <div className={`inline-flex items-center gap-2 font-mono text-xs mb-8 ${sub}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          live on Base Sepolia
        </div>

        <h1 className="text-[clamp(56px,10vw,96px)] font-black leading-none tracking-tight mb-5">
          AXIOM
        </h1>
        <p className={`text-lg sm:text-xl font-light mb-3 max-w-xl leading-snug ${dark ? "text-[#ccc]" : "text-gray-600"}`}>
          The promise layer for AI agents.
        </p>
        <p className={`text-sm max-w-lg leading-relaxed mb-10 ${sub}`}>
          A three-agent DeFi intelligence system where every decision is committed on-chain before execution, verified with cryptographic proofs, and archived permanently on Filecoin.
        </p>

        <div className="flex flex-wrap gap-3">
          <a href="/app" className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${dark ? "bg-[#f0f0f0] text-[#0c0c0c] hover:bg-white" : "bg-[#111] text-white hover:bg-black"}`}>
            Run a pipeline
          </a>
          <a href="/app" className={`px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors ${dark ? "border-[#2a2a2a] text-[#888] hover:text-[#f0f0f0] hover:border-[#444]" : "border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-400"}`}>
            View covenants
          </a>
        </div>

        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-6 mt-20 pt-10 border-t ${border}`}>
          {[
            { n: 63, s: "+", label: "covenants fulfilled" },
            { n: 9,  s: " per run", label: "Filecoin CIDs stored" },
            { n: 3,  s: "", label: "registered agents" },
            { n: 3,  s: "", label: "deployed contracts" },
          ].map((item) => (
            <div key={item.label}>
              <div className="text-3xl font-black font-mono mb-0.5">
                <AnimatedCount to={item.n} suffix={item.s} />
              </div>
              <div className={`text-xs font-mono ${sub}`}>{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── What is it ──────────────────────────────────────────────────── */}
      <section className={`py-20 border-t ${border}`}>
        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-2 gap-14 items-center">
          <div>
            <p className={`text-xs font-mono uppercase tracking-widest mb-3 ${muted}`}>The problem</p>
            <h2 className="text-3xl font-black leading-tight mb-5">
              AI agents make decisions.<br />
              <span className={sub}>Nobody can verify them.</span>
            </h2>
            <p className={`text-sm leading-relaxed mb-4 ${sub}`}>
              AXIOM uses cryptographic commit-reveal. Before any agent analyses anything, it commits <span className={`font-mono ${dark ? "text-[#bbb]" : "text-gray-700"}`}>keccak256(reasoning + salt)</span> on-chain. After it acts, it reveals the reasoning — which must match. Post-hoc rationalization is impossible.
            </p>
            <p className={`text-sm leading-relaxed ${sub}`}>
              Payment is escrowed on Base Sepolia at covenant creation. Released automatically when the provider fulfills. Refunded automatically if they breach. No intermediaries. No trust required.
            </p>
          </div>

          {/* Terminal */}
          <div className={`rounded-xl border overflow-hidden ${cardBg} ${cardBdr}`}>
            <div className={`flex items-center gap-1.5 px-4 py-3 border-b ${border}`}>
              <span className="w-2 h-2 rounded-full bg-[#333]" />
              <span className="w-2 h-2 rounded-full bg-[#333]" />
              <span className="w-2 h-2 rounded-full bg-[#333]" />
              <span className={`ml-2 text-xs font-mono ${muted}`}>axiom pipeline · ETH/USD</span>
            </div>
            <div className={`px-4 py-4 space-y-0.5 ${dark ? "text-[#ccc]" : "text-gray-700"}`}>
              <TerminalLine delay={0}    text="✓ Filecoin ready — USDFC deposited" />
              <TerminalLine delay={300}  text="[Nexus-1]   Covenant #61 verified" />
              <TerminalLine delay={600}  text="[Nexus-1]   0x56ab53c1… committed on-chain" />
              <TerminalLine delay={900}  text="[Nexus-1]   ERC-7715 delegations signed" />
              <TerminalLine delay={1200} text="[Filecoin]  Delegation proof → bafkz…igihyx" />
              <TerminalLine delay={1500} text="[Sentinel-1] bearish · 67% · HOLD" />
              <TerminalLine delay={1800} text="[ChainEye-1] distribution · BEARISH · 67%" />
              <TerminalLine delay={2100} text="[Nexus-1]   DECISION: SELL ETH" />
              <TerminalLine delay={2400} text="✓ All covenants fulfilled. Escrow released." dim />
              <TerminalLine delay={2700} text="✓ 9 CIDs anchored to Filecoin." dim />
            </div>
          </div>
        </div>
      </section>

      {/* ── Agents ──────────────────────────────────────────────────────── */}
      <section className={`py-20 border-t ${border}`}>
        <div className="max-w-5xl mx-auto px-6">
          <p className={`text-xs font-mono uppercase tracking-widest mb-3 ${muted}`}>The agents</p>
          <h2 className="text-3xl font-black mb-10">Three agents. One decision.</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                name: "Nexus-1",
                role: "Orchestrator",
                addr: "0xB532A579…a6150E0C",
                desc: "Creates covenants, issues ERC-7715 delegations, synthesizes sub-agent results, and fulfills the main covenant. The coordinating authority.",
              },
              {
                name: "Sentinel-1",
                role: "Sentiment",
                addr: "0xcA8Eb63d…630d44C0",
                desc: "Social sentiment + on-chain signal analysis via Bankr LLM. Commits reasoning before running. Results stored on Filecoin.",
              },
              {
                name: "ChainEye-1",
                role: "On-Chain Data",
                addr: "0xbe562D6B…08F37DfAB",
                desc: "DEX volume, whale activity, and funding rate analysis. Produces a verifiable net signal with immutable Filecoin CID.",
              },
            ].map((a) => (
              <div key={a.name} className={`rounded-xl border p-5 ${cardBg} ${cardBdr}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="font-mono font-bold text-sm mb-0.5">{a.name}</div>
                    <div className={`text-xs font-mono px-2 py-0.5 rounded border inline-block ${dark ? "border-[#2a2a2a] text-[#555]" : "border-gray-200 text-gray-400"}`}>{a.role}</div>
                  </div>
                  <span className={`text-xs font-mono mt-0.5 ${muted}`}>{a.addr}</span>
                </div>
                <p className={`text-xs leading-relaxed ${sub}`}>{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pipeline ────────────────────────────────────────────────────── */}
      <section className={`py-20 border-t ${border}`}>
        <div className="max-w-5xl mx-auto px-6">
          <p className={`text-xs font-mono uppercase tracking-widest mb-3 ${muted}`}>The pipeline</p>
          <h2 className="text-3xl font-black mb-10">How it works</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { n: "01", who: "You", tag: "createCovenant", body: "Connect MetaMask. Pick an asset. Lock 0.00005 ETH in escrow on Base Sepolia. A smart contract covenant is created with Nexus-1 as provider." },
              { n: "02", who: "Nexus-1", tag: "commitReasoning", body: "Before any analysis runs, Nexus-1 hashes its reasoning + random salt and commits on-chain. The reasoning cannot be changed after this point." },
              { n: "03", who: "Nexus-1", tag: "ERC-7715 delegate", body: "Nexus-1 signs typed MetaMask delegations to Sentinel-1 and ChainEye-1, scoped to the covenant contract via AllowedTargets caveat. Proof stored on Filecoin." },
              { n: "04", who: "Sentinel-1", tag: "sentiment analysis", body: "Commits its own reasoning hash first. Runs social + on-chain sentiment via Bankr LLM. Stores results on Filecoin. Fulfills sub-covenant." },
              { n: "05", who: "ChainEye-1", tag: "on-chain analysis", body: "Same commit-then-analyze flow for DEX volume, whale activity, and funding rates. Verifiable CID on Filecoin. Fulfills sub-covenant." },
              { n: "06", who: "Nexus-1", tag: "synthesize + fulfill", body: "Synthesizes both results into a final BUY/SELL/HOLD decision. Reveals full reasoning — must match on-chain hash. Main escrow released." },
            ].map((s) => (
              <div key={s.n} className={`rounded-xl border p-5 ${cardBg} ${cardBdr}`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className={`font-mono text-xs ${muted}`}>{s.n}</span>
                  <span className="font-mono text-sm font-semibold">{s.who}</span>
                  <span className={`text-xs font-mono px-2 py-0.5 rounded border ${dark ? "border-[#2a2a2a] text-[#555]" : "border-gray-200 text-gray-400"}`}>{s.tag}</span>
                </div>
                <p className={`text-sm leading-relaxed ${sub}`}>{s.body}</p>
              </div>
            ))}
          </div>

          {/* Lifecycle */}
          <div className={`mt-6 rounded-xl border p-5 ${cardBg} ${cardBdr}`}>
            <p className={`text-xs font-mono mb-4 ${muted}`}>Covenant lifecycle</p>
            <div className="flex items-center gap-3 flex-wrap">
              {[
                { s: "OPEN",      c: "border-[#1e1e1e] text-[#888]" },
                { s: "→" },
                { s: "COMMITTED", c: "border-amber-500/30 text-amber-500 bg-amber-500/5" },
                { s: "→" },
                { s: "FULFILLED", c: "border-emerald-500/30 text-emerald-500 bg-emerald-500/5" },
              ].map((item, i) =>
                item.s === "→" ? (
                  <span key={i} className={`text-xs ${muted}`}>→</span>
                ) : (
                  <span key={i} className={`text-xs px-2.5 py-1 rounded font-mono border ${item.c} ${!item.c?.includes("amber") && !item.c?.includes("emerald") ? (dark ? "bg-[#111]" : "bg-gray-50") : ""}`}>{item.s}</span>
                )
              )}
              <span className={`text-xs ml-2 ${muted}`}>or BREACHED (requester refunded)</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Protocol features ───────────────────────────────────────────── */}
      <section className={`py-20 border-t ${border}`}>
        <div className="max-w-5xl mx-auto px-6">
          <p className={`text-xs font-mono uppercase tracking-widest mb-3 ${muted}`}>Protocol</p>
          <h2 className="text-3xl font-black mb-10">Built on primitives that matter</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: "Commit-reveal proofs", body: "keccak256(reasoning + salt) locked on-chain before any analysis. Reasoning revealed on fulfillment and verified against the hash. Tamper-proof." },
              { title: "Smart contract escrow", body: "ETH locked at covenant creation on Base Sepolia. Released when fulfilled, refunded when breached. No human intermediary in the payment path." },
              { title: "ERC-7715 delegation", body: "Nexus-1 issues MetaMask typed delegations scoped via AllowedTargets + LimitedCalls caveats. Authorization is verifiable, not assumed." },
              { title: "Filecoin audit trail", body: "9 content-addressed CIDs per pipeline run. Agent constitutions, task terms, reasoning, delegation proofs, analysis results, full synthesis." },
              { title: "On-chain reputation", body: "Agents earn reputation across fulfilled covenants. Five tiers from Untrusted to Elite. Score gates access to high-value opportunities." },
              { title: "OpenServ integration", body: "Published as a multi-agent service on OpenServ with three capabilities: full pipeline, Sentinel-1 only, ChainEye-1 only. Callable from any platform." },
            ].map((f) => (
              <div key={f.title} className={`rounded-xl border p-5 ${cardBg} ${cardBdr}`}>
                <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500 mb-4`} />
                <h3 className="font-semibold text-sm mb-2">{f.title}</h3>
                <p className={`text-xs leading-relaxed ${sub}`}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stack ───────────────────────────────────────────────────────── */}
      <section className={`py-20 border-t ${border}`}>
        <div className="max-w-5xl mx-auto px-6">
          <p className={`text-xs font-mono uppercase tracking-widest mb-3 ${muted}`}>Stack</p>
          <h2 className="text-3xl font-black mb-10">Every layer</h2>
          <div className="space-y-8">
            {[
              {
                group: "Blockchain",
                items: [
                  { name: "Base Sepolia", desc: "Covenant Protocol · Agent Registry · Reputation System · three deployed contracts" },
                  { name: "MetaMask ERC-7715", desc: "Delegation Toolkit · AllowedTargets + LimitedCalls caveats · typed off-chain signing" },
                  { name: "viem", desc: "Type-safe contract interactions · EIP-712 · ABI encoding · event decoding" },
                  { name: "wagmi + RainbowKit", desc: "Wallet connection · account management · MetaMask integration" },
                ],
              },
              {
                group: "Storage",
                items: [
                  { name: "Filecoin FOC", desc: "Calibration testnet · decentralized content-addressed storage · 9 CIDs per pipeline" },
                  { name: "Synapse SDK v0.40", desc: "@filoz/synapse-sdk · USDFC deposit with permit · direct data upload" },
                ],
              },
              {
                group: "Intelligence",
                items: [
                  { name: "Bankr LLM", desc: "claude-sonnet-4-6 via bankr.bot · JSON-structured DeFi analysis · market data via CoinGecko" },
                  { name: "OpenServ", desc: "@openserv-labs/sdk · three capabilities published · callable from any AI platform" },
                ],
              },
              {
                group: "Frontend",
                items: [
                  { name: "Next.js 16", desc: "App Router · SSE streaming pipeline output · Edge-compatible API routes" },
                  { name: "TypeScript + Tailwind v4", desc: "End-to-end type safety · class-based dark mode · Geist font" },
                ],
              },
            ].map((g) => (
              <div key={g.group}>
                <p className={`text-xs font-mono uppercase tracking-widest mb-4 ${muted}`}>{g.group}</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {g.items.map((it) => (
                    <div key={it.name} className={`rounded-lg border px-4 py-3 flex gap-4 items-baseline ${cardBg} ${cardBdr}`}>
                      <span className="font-mono font-semibold text-sm shrink-0">{it.name}</span>
                      <span className={`text-xs leading-relaxed ${sub}`}>{it.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contracts ───────────────────────────────────────────────────── */}
      <section className={`py-20 border-t ${border}`}>
        <div className="max-w-5xl mx-auto px-6">
          <p className={`text-xs font-mono uppercase tracking-widest mb-3 ${muted}`}>On-chain</p>
          <h2 className="text-3xl font-black mb-8">Contracts</h2>
          <div className="space-y-3">
            {[
              { name: "Covenant Protocol",  addr: "0x75E42505e9Dc81eb85EFF8E00285CBCf176F7E74", desc: "createCovenant · commitReasoning · fulfillCovenant · escrow" },
              { name: "Agent Registry",     addr: "0xB59726f55EB180832b56232DdF24d289aF86B491", desc: "registerAgent · getAgent · isRegistered" },
              { name: "Reputation System",  addr: "0x196f28023E063CDb0D2EDeD22ddE18b6C5c2F6a2", desc: "getScore · getTier · getRecord · five-tier system" },
            ].map((c) => (
              <div key={c.addr} className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-2 ${cardBg} ${cardBdr}`}>
                <span className="font-mono font-semibold text-sm shrink-0">{c.name}</span>
                <span className={`text-xs font-mono flex-1 ${sub}`}>{c.desc}</span>
                <a
                  href={`https://sepolia.basescan.org/address/${c.addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-xs font-mono shrink-0 hover:underline ${dark ? "text-[#888] hover:text-[#ccc]" : "text-gray-400 hover:text-gray-700"}`}
                >
                  {c.addr.slice(0, 20)}… ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className={`py-24 border-t ${border}`}>
        <div className="max-w-5xl mx-auto px-6">
          <p className={`text-xs font-mono uppercase tracking-widest mb-4 ${muted}`}>Get started</p>
          <h2 className="text-4xl sm:text-5xl font-black mb-5 leading-tight">
            Make your first<br />
            <span className="text-emerald-500">on-chain AI covenant.</span>
          </h2>
          <p className={`text-sm mb-8 max-w-sm leading-relaxed ${sub}`}>
            Connect MetaMask. Lock 0.00005 ETH. Nexus-1 commits its reasoning, runs the pipeline, and delivers a verified DeFi decision — all verifiable on-chain.
          </p>
          <a href="/app" className={`inline-block px-6 py-3 rounded-lg text-sm font-medium transition-colors ${dark ? "bg-[#f0f0f0] text-[#0c0c0c] hover:bg-white" : "bg-[#111] text-white hover:bg-black"}`}>
            Launch AXIOM →
          </a>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className={`py-8 border-t ${border}`}>
        <div className={`max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono ${muted}`}>
          <span className={`font-black text-sm ${dark ? "text-[#f0f0f0]" : "text-[#111]"}`}>AXIOM</span>
          <span>The promise layer for AI agents</span>
          <a href="/app" className="hover:underline">Open dashboard →</a>
        </div>
      </footer>

    </div>
  );
}
