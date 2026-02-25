import { useState, useEffect, useCallback, useRef } from "react";

interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  color: string;
  specialty: string;
  revenue: number;
  claims: number;
  wins: number;
  confidence: number;
  status: "idle" | "scanning" | "evaluating" | "claiming" | "confirming";
}

interface Drop {
  id: string;
  title: string;
  type: string;
  studio: string;
  priceCents: number;
  spots: number;
  spotsRemaining: number;
  status: "detecting" | "evaluating" | "claiming" | "confirming" | "filled";
  claimedBy: string | null;
  createdAt: number;
  conversionProbability: number;
  cycleProgress: number;
}

interface EventItem {
  id: string;
  timestamp: number;
  type: string;
  agent: string;
  agentEmoji: string;
  agentColor: string;
  message: string;
  details: string;
}

interface CompletedDrop {
  title: string;
  type: string;
  spots: number;
  price: number;
  claimedBy: string;
  studio: string;
}

const CLASS_TEMPLATES = [
  { name: "Hot Flow Yoga", type: "Flash Drop", studio: "Cambridge Yoga", price: 3600, spots: 1 },
  { name: "Power Yoga", type: "Urgent Fill", studio: "Cambridge Yoga", price: 2300, spots: 2 },
  { name: "Vinyasa Yoga", type: "Flash Drop", studio: "Cambridge Yoga", price: 1800, spots: 4 },
  { name: "Stretch & Recover", type: "Last Chance", studio: "Cambridge Yoga", price: 3500, spots: 1 },
  { name: "HIIT Express", type: "Open Spot", studio: "Iron Forge Fitness", price: 2500, spots: 3 },
  { name: "CrossFit WOD", type: "Flash Drop", studio: "Iron Forge Fitness", price: 2000, spots: 2 },
  { name: "Pilates Core", type: "Urgent Fill", studio: "Zen Studio Boston", price: 2800, spots: 1 },
  { name: "Barre Burn", type: "Last Chance", studio: "Zen Studio Boston", price: 3200, spots: 2 },
  { name: "Spin Surge", type: "Flash Drop", studio: "Iron Forge Fitness", price: 2200, spots: 2 },
  { name: "Meditation Flow", type: "Open Spot", studio: "Zen Studio Boston", price: 1500, spots: 3 },
];

const SEED_AGENTS: Agent[] = [
  { id: "blitz", name: "BLITZ", emoji: "⚡", role: "Speed", color: "#f59e0b", specialty: "Flash Fill Specialist", revenue: 6042, claims: 148, wins: 89, confidence: 94, status: "idle" },
  { id: "ace", name: "ACE", emoji: "🎯", role: "Conversion", color: "#ef4444", specialty: "High-Value Closer", revenue: 3917, claims: 112, wins: 73, confidence: 91, status: "idle" },
  { id: "ghost", name: "GHOST", emoji: "👻", role: "Stealth", color: "#8b5cf6", specialty: "Premium Slot Hunter", revenue: 3002, claims: 95, wins: 61, confidence: 87, status: "idle" },
  { id: "agent-o", name: "Agent O", emoji: "🤖", role: "Orchestrator", color: "#3b82f6", specialty: "Strategy Optimizer", revenue: 1655, claims: 78, wins: 42, confidence: 85, status: "idle" },
  { id: "hawk", name: "HAWK", emoji: "🦅", role: "Detection", color: "#10b981", specialty: "Cancellation Scanner", revenue: 253, claims: 67, wins: 35, confidence: 92, status: "idle" },
];

const SEED_COMPLETED: CompletedDrop[] = [
  { title: "Hot Flow Yoga", type: "Flash Drop", spots: 1, price: 3600, claimedBy: "ACE", studio: "Cambridge Yoga" },
  { title: "Power Yoga", type: "Urgent Fill", spots: 2, price: 2300, claimedBy: "BLITZ", studio: "Cambridge Yoga" },
  { title: "Vinyasa Yoga", type: "Flash Drop", spots: 4, price: 1800, claimedBy: "GHOST", studio: "Cambridge Yoga" },
  { title: "Stretch & Recover", type: "Last Chance", spots: 1, price: 3500, claimedBy: "BLITZ", studio: "Cambridge Yoga" },
];

const PHASE_DURATIONS = { detecting: 3000, evaluating: 3000, claiming: 4000, confirming: 5000 };
const DROP_INTERVAL_MS = 30000;
const AGENT_NAMES = ["BLITZ", "ACE", "GHOST", "Agent O", "HAWK"];

function pickWinner(): string {
  const weights = [30, 28, 20, 12, 10];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < AGENT_NAMES.length; i++) {
    r -= weights[i];
    if (r <= 0) return AGENT_NAMES[i];
  }
  return AGENT_NAMES[0];
}

function findAgent(agents: Agent[], name: string): Agent | undefined {
  return agents.find((a) => a.name === name);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

let eventIdCounter = 0;
function nextEventId(): string {
  return `evt-${++eventIdCounter}-${Date.now()}`;
}

let dropIdCounter = 0;
function nextDropId(): string {
  return `drop-${++dropIdCounter}-${Date.now()}`;
}

export default function ArenaDemo() {
  const [agents, setAgents] = useState<Agent[]>(SEED_AGENTS);
  const [activeDrops, setActiveDrops] = useState<Drop[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [completedDrops, setCompletedDrops] = useState<CompletedDrop[]>(SEED_COMPLETED);
  const [totalRevenue, setTotalRevenue] = useState(14868);
  const [totalClaims, setTotalClaims] = useState(599);
  const [totalDrops, setTotalDrops] = useState(232);
  const [fillRate, setFillRate] = useState(85);
  const [isLive, setIsLive] = useState(false);
  const [activeTab, setActiveTab] = useState("arena");
  const [secondsToNext, setSecondsToNext] = useState(30);
  const templateIndexRef = useRef(0);
  const rushListCount = 100;

  const addEvent = useCallback(
    (type: string, agentName: string, emoji: string, color: string, message: string, details: string) => {
      setEvents((prev) =>
        [{ id: nextEventId(), timestamp: Date.now(), type, agent: agentName, agentEmoji: emoji, agentColor: color, message, details }, ...prev].slice(0, 50)
      );
    },
    []
  );

  const updateAgentStatus = useCallback((name: string, status: Agent["status"]) => {
    setAgents((prev) => prev.map((a) => (a.name === name ? { ...a, status } : a)));
  }, []);

  const updateAgentRevenue = useCallback((name: string, priceCents: number) => {
    setAgents((prev) =>
      prev
        .map((a) => (a.name === name ? { ...a, revenue: a.revenue + priceCents / 100, claims: a.claims + 1, wins: a.wins + 1 } : a))
        .sort((a, b) => b.revenue - a.revenue)
    );
  }, []);

  const runCycle = useCallback(() => {
    const tplIdx = templateIndexRef.current % CLASS_TEMPLATES.length;
    templateIndexRef.current++;
    const template = CLASS_TEMPLATES[tplIdx];
    const dropId = nextDropId();
    const convProb = 70 + Math.random() * 25;

    const newDrop: Drop = {
      id: dropId,
      title: template.name,
      type: template.type,
      studio: template.studio,
      priceCents: template.price,
      spots: template.spots,
      spotsRemaining: template.spots,
      status: "detecting",
      claimedBy: null,
      createdAt: Date.now(),
      conversionProbability: convProb,
      cycleProgress: 0,
    };

    setActiveDrops((prev) => [newDrop, ...prev]);
    setTotalDrops((d) => d + 1);

    const hawkAgent = SEED_AGENTS.find((a) => a.name === "HAWK")!;
    addEvent("cancellation_detected", "HAWK", hawkAgent.emoji, hawkAgent.color, `Cancellation detected: ${template.name}`, `${template.spots} spot(s) · $${(template.price / 100).toFixed(0)} · ${template.studio}`);
    updateAgentStatus("HAWK", "scanning");

    // Phase 2: Evaluating (3s)
    setTimeout(() => {
      setActiveDrops((prev) => prev.map((d) => (d.id === dropId ? { ...d, status: "evaluating", cycleProgress: 20 } : d)));
      updateAgentStatus("HAWK", "idle");
      AGENT_NAMES.forEach((name) => updateAgentStatus(name, "evaluating"));
      const scores = AGENT_NAMES.map((n) => `${n}: ${(70 + Math.random() * 25).toFixed(0)}%`).join(" · ");
      addEvent("agents_evaluating", "System", "🔍", "#94a3b8", `${AGENT_NAMES.length} agents evaluating opportunity`, scores);
    }, PHASE_DURATIONS.detecting);

    // Phase 3: Claiming (6s)
    const winner = pickWinner();
    setTimeout(() => {
      setActiveDrops((prev) => prev.map((d) => (d.id === dropId ? { ...d, status: "claiming", claimedBy: winner, cycleProgress: 50 } : d)));
      AGENT_NAMES.forEach((name) => updateAgentStatus(name, name === winner ? "claiming" : "idle"));
      const wa = findAgent(SEED_AGENTS, winner);
      addEvent("claim_submitted", winner, wa?.emoji || "🤖", wa?.color || "#fff", `${winner} claims ${template.name}`, `Confidence: ${convProb.toFixed(0)}% · Strategy: ${wa?.specialty}`);
    }, PHASE_DURATIONS.detecting + PHASE_DURATIONS.evaluating);

    // Phase 4: Confirming (9s)
    setTimeout(() => {
      setActiveDrops((prev) => prev.map((d) => (d.id === dropId ? { ...d, status: "confirming", cycleProgress: 75 } : d)));
      updateAgentStatus(winner, "confirming");
      addEvent("claim_processing", "System", "⏳", "#94a3b8", `Processing claim for ${template.name}`, `Verifying ${winner}'s customer match...`);
    }, PHASE_DURATIONS.detecting + PHASE_DURATIONS.evaluating + PHASE_DURATIONS.claiming);

    // Phase 5: Completed (15s)
    setTimeout(() => {
      setActiveDrops((prev) => prev.filter((d) => d.id !== dropId));
      updateAgentStatus(winner, "idle");
      updateAgentRevenue(winner, template.price * template.spots);
      setTotalRevenue((r) => r + (template.price * template.spots) / 100);
      setTotalClaims((c) => c + template.spots);
      setFillRate((prev) => Math.min(99, Math.max(prev, 80 + Math.random() * 15)));
      setCompletedDrops((prev) => [{ title: template.name, type: template.type, spots: template.spots, price: template.price, claimedBy: winner, studio: template.studio }, ...prev].slice(0, 10));

      const wa = findAgent(SEED_AGENTS, winner);
      addEvent("revenue_recovered", winner, wa?.emoji || "✅", "#10b981", `Revenue recovered: $${((template.price * template.spots) / 100).toFixed(0)}`, `${template.name} · ${template.spots} spot(s) filled by ${winner}`);
    }, PHASE_DURATIONS.detecting + PHASE_DURATIONS.evaluating + PHASE_DURATIONS.claiming + PHASE_DURATIONS.confirming);
  }, [addEvent, updateAgentStatus, updateAgentRevenue]);

  // Start simulation
  useEffect(() => {
    setIsLive(true);
    const firstDrop = setTimeout(() => runCycle(), 2000);
    const interval = setInterval(() => runCycle(), DROP_INTERVAL_MS);
    return () => {
      clearTimeout(firstDrop);
      clearInterval(interval);
    };
  }, [runCycle]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsToNext((prev) => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Progress ticker for active drops
  useEffect(() => {
    const ticker = setInterval(() => {
      setActiveDrops((prev) =>
        prev.map((d) => {
          const elapsed = Date.now() - d.createdAt;
          const totalDuration = Object.values(PHASE_DURATIONS).reduce((a, b) => a + b, 0);
          return { ...d, cycleProgress: Math.min(100, (elapsed / totalDuration) * 100) };
        })
      );
    }, 200);
    return () => clearInterval(ticker);
  }, []);

  // WebSocket connection for real events
  useEffect(() => {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws?operatorId=demo-operator-001`);
      ws.onopen = () => setIsLive(true);
      ws.onclose = () => {};
      ws.onerror = () => {};
      return () => ws.close();
    } catch {
      // WebSocket not available in static mode
    }
  }, []);

  const liveDropCount = activeDrops.length;

  return (
    <div className="arena-root">
      {/* ─── Header ─── */}
      <header className="arena-header">
        <div className="arena-header-left">
          <h1 className="arena-title">
            YU Arena Demo
            <span className="arena-badge">MIT<span className="arena-badge-ai">AI</span> STUDIO</span>
          </h1>
          <p className="arena-subtitle">Multi-Agent Competition Platform — Watch AI agents race to fill empty spots in real-time</p>
        </div>
        <div className="arena-header-right">
          <span className="arena-user">HK2 AI Studio · Omar Dominguez</span>
          <span className={`arena-status ${isLive ? "live" : "offline"}`}>
            <span className="arena-status-dot" />
            {isLive ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </header>

      {/* ─── Stats Bar ─── */}
      <div className="arena-stats">
        <div className="arena-stat green-glow">
          <div className="arena-stat-value green">${totalRevenue.toLocaleString()}</div>
          <div className="arena-stat-label">REVENUE RECOVERED</div>
        </div>
        <div className="arena-stat">
          <div className="arena-stat-value">{liveDropCount}</div>
          <div className="arena-stat-label">LIVE DROPS</div>
        </div>
        <div className="arena-stat">
          <div className="arena-stat-value">{totalClaims.toLocaleString()}</div>
          <div className="arena-stat-label">CLAIMS</div>
        </div>
        <div className="arena-stat">
          <div className="arena-stat-value">{fillRate}%</div>
          <div className="arena-stat-label">FILL RATE</div>
        </div>
        <div className="arena-stat">
          <div className="arena-stat-value">{totalDrops}</div>
          <div className="arena-stat-label">DROPS</div>
        </div>
      </div>

      {/* ─── Agent Leaderboard ─── */}
      <div className="arena-leaderboard">
        {agents.slice(0, 5).map((agent, i) => (
          <div key={agent.id} className={`arena-agent-badge ${agent.status !== "idle" ? "active" : ""}`} style={{ borderColor: agent.color }}>
            <span className="arena-agent-rank">{i < 3 ? agent.emoji : `${i + 1}.`}</span>
            {i < 3 && <span className="arena-agent-emoji">{agent.emoji}</span>}
            <span className="arena-agent-name" style={{ color: agent.color }}>{agent.name}</span>
            <span className="arena-agent-rev">${agent.revenue.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* ─── Tab Navigation ─── */}
      <div className="arena-tabs">
        <button className={`arena-tab ${activeTab === "arena" ? "active" : ""}`} onClick={() => setActiveTab("arena")}>Arena</button>
        <button className={`arena-tab ${activeTab === "vendors" ? "active" : ""}`} onClick={() => setActiveTab("vendors")}>Vendors</button>
        <button className={`arena-tab ${activeTab === "customers" ? "active" : ""}`} onClick={() => setActiveTab("customers")}>
          Registered Customers <span className="arena-tab-count">{rushListCount}</span>
        </button>
        <button className={`arena-tab ${activeTab === "insights" ? "active" : ""}`} onClick={() => setActiveTab("insights")}>Demo Insights</button>
        <button className={`arena-tab ${activeTab === "guide" ? "active" : ""}`} onClick={() => setActiveTab("guide")}>Guide</button>
      </div>

      {/* ─── Main Content ─── */}
      {activeTab === "arena" && (
        <div className="arena-main">
          <div className="arena-col arena-col-left">
            <div className="arena-panel">
              <div className="arena-panel-header">
                <h2>Live Drops</h2>
                <span className="text-muted-sm">Active opportunities with real-time spot visualization</span>
              </div>
              <div className="arena-panel-body">
                {activeDrops.length === 0 ? (
                  <div className="arena-waiting">
                    <div className="arena-spinner" />
                    <span>Waiting for next drop...</span>
                    <span className="text-muted-sm">Drops auto-launch every {DROP_INTERVAL_MS / 1000}s</span>
                  </div>
                ) : (
                  activeDrops.map((drop) => (
                    <div key={drop.id} className={`arena-drop-card phase-${drop.status}`}>
                      <div className="arena-drop-top">
                        <div className="arena-drop-title">{drop.title} — <span className="arena-drop-type">{drop.type}</span></div>
                        <span className={`arena-drop-status status-${drop.status}`}>{drop.status.toUpperCase()}</span>
                      </div>
                      <div className="arena-drop-meta">
                        <span>{drop.spots} spot{drop.spots > 1 ? "s" : ""}</span>
                        <span className="arena-drop-price">${(drop.priceCents / 100).toFixed(0)}</span>
                        <span>{drop.studio}</span>
                        {drop.claimedBy && <span className="arena-drop-agent">→ {drop.claimedBy}</span>}
                      </div>
                      <div className="arena-drop-progress">
                        <div className="arena-drop-progress-bar" style={{ width: `${drop.cycleProgress}%` }} />
                      </div>
                      <div className="arena-drop-phases">
                        <span className={drop.status === "detecting" ? "active-phase" : ""}>HAWK Scan</span>
                        <span className={drop.status === "evaluating" ? "active-phase" : ""}>Evaluate</span>
                        <span className={drop.status === "claiming" ? "active-phase" : ""}>Claim</span>
                        <span className={drop.status === "confirming" ? "active-phase" : ""}>Confirm</span>
                      </div>
                      <div className="arena-drop-probability">
                        Conversion: <strong>{drop.conversionProbability.toFixed(0)}%</strong>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="arena-col arena-col-right">
            <div className="arena-panel">
              <div className="arena-panel-header">
                <h2>Live Event Feed</h2>
                <span className="text-muted-sm">Real-time stream of agent actions and decisions</span>
              </div>
              <div className="arena-panel-body arena-events-scroll">
                {events.length === 0 ? (
                  <div className="arena-waiting">
                    <span className="text-accent-muted">Waiting for activity...</span>
                  </div>
                ) : (
                  events.slice(0, 15).map((evt) => (
                    <div key={evt.id} className={`arena-event event-${evt.type}`}>
                      <span className="arena-event-time">{formatTime(evt.timestamp)}</span>
                      <span className="arena-event-emoji">{evt.agentEmoji}</span>
                      <div className="arena-event-content">
                        <span className="arena-event-msg">{evt.message}</span>
                        <span className="arena-event-detail">{evt.details}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "insights" && (
        <div className="arena-insights">
          <div className="arena-insights-grid">
            <div className="arena-panel insight-panel">
              <h3>Agent Performance Matrix</h3>
              <div className="insight-table">
                <div className="insight-row insight-header-row">
                  <span>Agent</span><span>Wins</span><span>Revenue</span><span>Avg $/Claim</span><span>Confidence</span>
                </div>
                {agents.map((a) => (
                  <div key={a.id} className="insight-row">
                    <span>{a.emoji} {a.name}</span>
                    <span>{a.wins}</span>
                    <span>${a.revenue.toLocaleString()}</span>
                    <span>${a.claims > 0 ? (a.revenue / a.claims).toFixed(0) : "—"}</span>
                    <span className="insight-confidence">
                      <span className="insight-conf-bar" style={{ width: `${a.confidence}%`, background: a.color }} />
                      {a.confidence}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="arena-panel insight-panel">
              <h3>Business Impact Metrics</h3>
              <div className="insight-metrics">
                <div className="insight-metric">
                  <div className="insight-metric-value green">${totalRevenue.toLocaleString()}</div>
                  <div className="insight-metric-label">Lost Revenue Recovered</div>
                  <div className="insight-metric-detail">Previously 100% lost to cancellations</div>
                </div>
                <div className="insight-metric">
                  <div className="insight-metric-value">{(totalRevenue * 12).toLocaleString()}</div>
                  <div className="insight-metric-label">Projected Annual Recovery</div>
                  <div className="insight-metric-detail">Based on current recovery rate</div>
                </div>
                <div className="insight-metric">
                  <div className="insight-metric-value accent">{fillRate}%</div>
                  <div className="insight-metric-label">Cancellation Fill Rate</div>
                  <div className="insight-metric-detail">vs. industry avg of 12% manual recovery</div>
                </div>
                <div className="insight-metric">
                  <div className="insight-metric-value">{((totalClaims / Math.max(totalDrops, 1)) * 100).toFixed(0)}%</div>
                  <div className="insight-metric-label">Agent Utilization</div>
                  <div className="insight-metric-detail">Multi-agent coordination efficiency</div>
                </div>
              </div>
            </div>

            <div className="arena-panel insight-panel">
              <h3>Real-Time ROI Calculator</h3>
              <div className="insight-roi">
                <div className="roi-row"><span>Avg Cancellation Rate</span><span className="roi-val red">15-30%</span></div>
                <div className="roi-row"><span>Avg Revenue per Slot</span><span className="roi-val">${(totalRevenue / Math.max(totalClaims, 1)).toFixed(0)}</span></div>
                <div className="roi-row"><span>Notice Window</span><span className="roi-val">2-6 hours</span></div>
                <div className="roi-row"><span>Manual Recovery Rate</span><span className="roi-val red">~12%</span></div>
                <div className="roi-row highlight"><span>YU Arena Recovery Rate</span><span className="roi-val green">{fillRate}%</span></div>
                <div className="roi-row highlight"><span>Revenue Uplift</span><span className="roi-val green">+{fillRate - 12}% points</span></div>
              </div>
            </div>

            <div className="arena-panel insight-panel">
              <h3>Agent Decision Trees</h3>
              <div className="insight-decisions">
                <div className="decision-flow">
                  <div className="decision-node hawk-node">
                    <span className="decision-icon">🦅</span>
                    <span>HAWK: Scan</span>
                    <span className="decision-desc">Monitor all vendor schedules for cancellations. Trigger on schedule gap detection.</span>
                  </div>
                  <div className="decision-arrow">↓</div>
                  <div className="decision-node eval-node">
                    <span className="decision-icon">🔍</span>
                    <span>All Agents: Evaluate</span>
                    <span className="decision-desc">Score opportunity: price, timing, customer match, historical fill rate.</span>
                  </div>
                  <div className="decision-arrow">↓</div>
                  <div className="decision-node ace-node">
                    <span className="decision-icon">🎯</span>
                    <span>Winner: Claim</span>
                    <span className="decision-desc">Highest-scoring agent submits claim with matched customer from rush list.</span>
                  </div>
                  <div className="decision-arrow">↓</div>
                  <div className="decision-node confirm-node">
                    <span className="decision-icon">✅</span>
                    <span>Confirm & Recover</span>
                    <span className="decision-desc">Auto-confirm booking. Revenue recovered. Customer notified.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "guide" && (
        <div className="arena-guide">
          <div className="arena-panel">
            <h3>The Problem: Service Businesses Losing 15-30% of Revenue</h3>
            <div className="guide-content">
              <div className="guide-stat-row">
                <div className="guide-stat"><span className="guide-stat-big red">$150B+</span><span>Annual revenue lost to last-minute cancellations in fitness & wellness</span></div>
                <div className="guide-stat"><span className="guide-stat-big red">15-30%</span><span>Of booked sessions are cancelled within 24 hours</span></div>
                <div className="guide-stat"><span className="guide-stat-big red">2-6 hrs</span><span>Notice window — too short for manual recovery</span></div>
                <div className="guide-stat"><span className="guide-stat-big red">~12%</span><span>Manual fill rate for last-minute openings</span></div>
              </div>
            </div>
          </div>
          <div className="arena-panel">
            <h3>The Solution: Multi-Agent AI Recovery System</h3>
            <div className="guide-content">
              <p>YU Arena deploys specialized AI agents that autonomously detect cancellations, evaluate opportunities, and fill empty spots — recovering revenue that would otherwise be lost.</p>
              <div className="guide-agents">
                {SEED_AGENTS.map((a) => (
                  <div key={a.id} className="guide-agent-card" style={{ borderLeftColor: a.color }}>
                    <span className="guide-agent-header">{a.emoji} {a.name} — {a.role}</span>
                    <span className="guide-agent-desc">{a.specialty}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "vendors" && (
        <div className="arena-vendors">
          <div className="arena-panel">
            <h3>Participating Vendors</h3>
            <div className="vendor-list">
              {["Cambridge Yoga", "Iron Forge Fitness", "Zen Studio Boston"].map((name) => (
                <div key={name} className="vendor-card">
                  <span className="vendor-name">{name}</span>
                  <span className="vendor-stat">Active · {Math.floor(Math.random() * 30 + 20)} drops this month</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "customers" && (
        <div className="arena-customers">
          <div className="arena-panel">
            <h3>Registered Customers (Rush List) — {rushListCount} Members</h3>
            <div className="customer-list">
              {["Alex Rivera", "Jordan Chen", "Sam Patel", "Casey Kim", "Morgan Lee", "Taylor Brooks", "Jamie Wu", "Riley Johnson", "Drew Martinez", "Avery Thomas"].map((name, i) => (
                <div key={i} className="customer-row">
                  <span className="customer-name">{name}</span>
                  <span className="customer-phone">+1 (617) 555-900{i}</span>
                  <span className="customer-status">Active</span>
                </div>
              ))}
              <div className="customer-more">... and {rushListCount - 10} more members</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Recent Results ─── */}
      {activeTab === "arena" && (
        <div className="arena-results">
          <h3>RECENT RESULTS</h3>
          <div className="arena-results-list">
            {completedDrops.slice(0, 6).map((d, i) => (
              <div key={i} className="arena-result-row">
                <span className="result-title">{d.title} — <span className="result-type">{d.type}</span></span>
                <span className="result-spots">{d.spots} spot{d.spots > 1 ? "s" : ""}</span>
                <span className="result-price">${(d.price / 100).toFixed(0)}</span>
                <span className="result-count">{Math.floor(Math.random() * 4 + 1)}</span>
                <span className="result-studio">{d.studio}</span>
                <span className="result-status filled">FILLED</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── How It Works ─── */}
      {activeTab === "arena" && (
        <div className="arena-how">
          <h2>How YU Arena Works</h2>
          <div className="arena-how-grid">
            <div className="arena-how-step">
              <span className="arena-how-num">1</span>
              <h4>Empty Spots Appear</h4>
              <p>Last-minute cancellations create openings that would expire unsold</p>
            </div>
            <div className="arena-how-step">
              <span className="arena-how-num">2</span>
              <h4>AI Agents Race to Claim</h4>
              <p>{AGENT_NAMES.length} agents with different strategies compete to fill each spot</p>
            </div>
            <div className="arena-how-step">
              <span className="arena-how-num">3</span>
              <h4>Revenue Gets Recovered</h4>
              <p>Spots get filled instantly, recovering revenue the vendor was about to lose</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Footer ─── */}
      <footer className="arena-footer">
        <span>Built at MIT STUDIO · Powered by YU Arena · Multi-Agent AI Platform</span>
        <span className="arena-footer-timer">Next drop in {secondsToNext}s</span>
      </footer>
    </div>
  );
}
