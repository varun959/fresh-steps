import { useState, useEffect } from "react";

const SCREENS = ["map", "routes", "walking", "complete"];

const C = {
  fresh: "#4ade80",
  partial: "#facc15",
  covered: "#4b5563",
  planned: "#60a5fa",
  current: "#fb923c",
  dot: "#3b82f6",
  bg: "#08090d",
  panel: "#1a1d27",
  panelAlt: "#13161f",
  border: "#2a2d3a",
  text: "#f1f5f9",
  muted: "#64748b",
  accent: "#4ade80",
};

// Road network with side-aware coverage
// status: "fresh" = both sides fresh, "partial" = one side covered, "covered" = both sides covered
const roads = [
  // Horizontal roads
  { id: "h0", x1: 10, y1: 15, x2: 88, y2: 15, status: "covered" },
  { id: "h1", x1: 8,  y1: 28, x2: 85, y2: 30, status: "covered" },
  { id: "h2", x1: 12, y1: 42, x2: 90, y2: 40, status: "partial" },
  { id: "h3", x1: 10, y1: 55, x2: 88, y2: 57, status: "partial" },
  { id: "h4", x1: 14, y1: 68, x2: 82, y2: 66, status: "fresh" },
  { id: "h5", x1: 10, y1: 80, x2: 86, y2: 82, status: "fresh" },
  { id: "h6", x1: 15, y1: 90, x2: 75, y2: 92, status: "fresh" },
  // Vertical roads
  { id: "v0", x1: 15, y1: 10, x2: 13, y2: 92, status: "covered" },
  { id: "v1", x1: 30, y1: 8,  x2: 32, y2: 88, status: "covered" },
  { id: "v2", x1: 48, y1: 12, x2: 46, y2: 90, status: "partial" },
  { id: "v3", x1: 64, y1: 10, x2: 66, y2: 85, status: "partial" },
  { id: "v4", x1: 80, y1: 14, x2: 82, y2: 80, status: "fresh" },
  // Diagonal / organic
  { id: "d0", x1: 30, y1: 42, x2: 48, y2: 55, status: "covered" },
  { id: "d1", x1: 48, y1: 55, x2: 64, y2: 42, status: "partial" },
  { id: "d2", x1: 15, y1: 68, x2: 30, y2: 80, status: "fresh" },
  { id: "d3", x1: 64, y1: 55, x2: 80, y2: 66, status: "fresh" },
];

// Planned route (loop from pin)
const plannedRoute = [
  [45, 57], [48, 42], [64, 42], [66, 55], [64, 68], [48, 68], [45, 57]
];

// Out & back route (goes right, returns)
const outbackRoute = [
  [45, 57], [48, 42], [64, 42], [80, 40],
  [80, 43], [64, 45], [48, 45], [45, 57]
];

// Walked so far (in walking screen)
const walkedSoFar = [
  [45, 57], [48, 42], [64, 42], [66, 48]
];

const pinPos = [45, 57];

function poly(pts, scale) {
  return pts.map(([x, y]) => `${x * scale},${y * scale}`).join(" ");
}

function MapSVG({ screen, selectedRoute }) {
  const size = 340;
  const s = size / 100;
  const routePts = selectedRoute === 2 ? outbackRoute : plannedRoute;

  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <rect width={size} height={size} fill="#141820" />
      <defs>
        <pattern id="grid" width="28" height="22" patternUnits="userSpaceOnUse">
          <path d="M 28 0 L 0 0 0 22" fill="none" stroke="#1c2030" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width={size} height={size} fill="url(#grid)" />

      {/* Roads */}
      {roads.map((r) => (
        <line
          key={r.id}
          x1={r.x1 * s} y1={r.y1 * s}
          x2={r.x2 * s} y2={r.y2 * s}
          stroke={r.status === "covered" ? C.covered : r.status === "partial" ? C.partial : C.fresh}
          strokeWidth={r.status === "covered" ? 2.5 : 2.5}
          strokeOpacity={0.85}
          strokeLinecap="round"
        />
      ))}

      {/* Planned route - routes + walking screens */}
      {(screen === "routes" || screen === "walking") && (
        <polyline
          points={poly(routePts, s)}
          fill="none"
          stroke={C.planned}
          strokeWidth={3.5}
          strokeOpacity={0.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={screen === "routes" ? "7 4" : "7 4"}
        />
      )}

      {/* Walked so far - orange */}
      {screen === "walking" && (
        <polyline
          points={poly(walkedSoFar, s)}
          fill="none"
          stroke={C.current}
          strokeWidth={4}
          strokeOpacity={1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Completed - turns gray */}
      {screen === "complete" && (
        <polyline
          points={poly(routePts, s)}
          fill="none"
          stroke={C.covered}
          strokeWidth={3.5}
          strokeOpacity={0.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Start pin */}
      {(screen === "map" || screen === "routes") && (
        <g transform={`translate(${pinPos[0] * s},${pinPos[1] * s})`}>
          <circle r={12} fill={C.accent} opacity={0.15} />
          <circle r={5} fill={C.accent} />
          <circle r={2} fill="white" />
        </g>
      )}

      {/* Live dot - walking */}
      {screen === "walking" && (
        <g transform={`translate(${walkedSoFar[walkedSoFar.length - 1][0] * s},${walkedSoFar[walkedSoFar.length - 1][1] * s})`}>
          <circle r={14} fill={C.dot} opacity={0.12}>
            <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.12;0.04;0.12" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle r={6} fill={C.dot} />
          <circle r={2.5} fill="white" />
        </g>
      )}

      <text x={10} y={size - 6} fill="#ffffff12" fontSize={6} fontFamily="monospace">© OpenStreetMap</text>
    </svg>
  );
}

// ── Screen 1: Planning ──────────────────────────────────────────────────────

function PlanningPanel({ onConfirm }) {
  const [duration, setDuration] = useState(45);
  const [pinSet, setPinSet] = useState(false);

  return (
    <div style={{ background: C.panel, borderTop: `1px solid ${C.border}`, padding: "16px 20px 24px" }}>
      {!pinSet ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 14 }}>
            Tap the map to drop a <span style={{ color: C.accent }}>start pin</span>
          </div>
          <button
            onClick={() => setPinSet(true)}
            style={{
              padding: "10px 24px", background: C.accent, color: "#0f1117",
              fontWeight: 700, fontSize: 13, border: "none", borderRadius: 8, cursor: "pointer",
            }}
          >
            Drop Pin Here
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent, boxShadow: `0 0 8px ${C.accent}` }} />
            <span style={{ color: C.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontFamily: "monospace" }}>
              Start · Dorfstrasse, Baar
            </span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>How long do you want to walk?</span>
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <span style={{ color: C.accent, fontSize: 32, fontWeight: 700, fontFamily: "monospace" }}>{duration}<span style={{ fontSize: 16, marginLeft: 4 }}>min</span></span>
            </div>
            <input
              type="range" min={15} max={120} step={5}
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              style={{ width: "100%", accentColor: C.accent }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ color: C.muted, fontSize: 10 }}>15 min</span>
              <span style={{ color: C.muted, fontSize: 10 }}>≈ {(duration / 60 * 5).toFixed(1)} km at 5 km/h</span>
              <span style={{ color: C.muted, fontSize: 10 }}>2 hr</span>
            </div>
          </div>

          <button
            onClick={onConfirm}
            style={{
              width: "100%", padding: "12px", background: C.accent,
              color: "#0f1117", fontWeight: 700, fontSize: 14,
              border: "none", borderRadius: 8, cursor: "pointer",
            }}
          >
            Suggest Routes →
          </button>
        </>
      )}
    </div>
  );
}

// ── Screen 2: Route Options ─────────────────────────────────────────────────

const routeOptions = [
  { type: "🔄", label: "Loop", distance: "3.8 km", duration: "46 min", freshness: 91, color: C.accent, desc: "Returns to start" },
  { type: "➡️", label: "One-way", distance: "4.2 km", duration: "50 min", freshness: 86, color: C.planned, desc: "Ends near bus stop" },
  { type: "🔁", label: "Out & Back", distance: "3.6 km", duration: "43 min", freshness: 94, color: "#fb923c", desc: "Both sidewalks covered" },
];

function RoutesPanel({ onStart, selected, setSelected }) {
  return (
    <div style={{ background: C.panel, borderTop: `1px solid ${C.border}`, padding: "14px 16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Suggested Routes</span>
        <span style={{ color: C.muted, fontSize: 11, fontFamily: "monospace" }}>~5 km/h assumed</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
        {routeOptions.map((r, i) => (
          <div
            key={i}
            onClick={() => setSelected(i)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px",
              background: selected === i ? "#1e2535" : C.panelAlt,
              border: `1px solid ${selected === i ? r.color : C.border}`,
              borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <span style={{ fontSize: 16 }}>{r.type}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{r.label}</span>
                <span style={{ color: r.color, fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{r.freshness}% fresh</span>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                <span style={{ color: C.muted, fontSize: 11 }}>{r.distance}</span>
                <span style={{ color: C.muted, fontSize: 11 }}>{r.duration}</span>
                <span style={{ color: C.muted, fontSize: 11 }}>{r.desc}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button style={{
          flex: 1, padding: "11px", background: "transparent",
          color: C.planned, fontWeight: 600, fontSize: 13,
          border: `1px solid ${C.planned}`, borderRadius: 8, cursor: "pointer",
        }}>
          Open in Maps ↗
        </button>
        <button
          onClick={onStart}
          style={{
            flex: 1, padding: "11px", background: C.accent,
            color: "#0f1117", fontWeight: 700, fontSize: 13,
            border: "none", borderRadius: 8, cursor: "pointer",
          }}
        >
          Start Walk →
        </button>
      </div>
    </div>
  );
}

// ── Screen 3: Walking ───────────────────────────────────────────────────────

function WalkingPanel({ onEnd }) {
  const [elapsed, setElapsed] = useState(18);
  const [dist, setDist] = useState(1.4);
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(e => e + 1);
      setDist(d => +(d + 0.015).toFixed(3));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const pct = Math.min(Math.round(dist / 3.8 * 100), 100);

  return (
    <div style={{ background: C.panel, borderTop: `1px solid ${C.border}`, padding: "14px 20px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        {[
          { val: `${elapsed}:00`, label: "elapsed", color: C.accent },
          { val: `${dist.toFixed(1)} km`, label: "walked", color: C.text },
          { val: `${pct}%`, label: "complete", color: C.current },
        ].map(({ val, label, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>{val}</div>
            <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ height: 4, background: "#1e2230", borderRadius: 2, marginBottom: 12, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: C.current,
          borderRadius: 2, transition: "width 1s linear",
        }} />
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
        {[
          { color: C.dot, label: "You are here" },
          { color: C.current, label: "Walking now" },
          { color: C.planned, label: "Planned route" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            <span style={{ color: C.muted, fontSize: 10 }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{
        background: C.panelAlt, borderRadius: 8, padding: "8px 12px",
        marginBottom: 10, border: `1px solid ${C.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: C.muted, fontSize: 11 }}>Coverage recording active</span>
        <span style={{ color: C.accent, fontSize: 11, fontFamily: "monospace" }}>● LIVE</span>
      </div>

      <button
        onClick={onEnd}
        style={{
          width: "100%", padding: "11px", background: "transparent",
          color: "#ef4444", fontWeight: 600, fontSize: 13,
          border: `1px solid #ef444455`, borderRadius: 8, cursor: "pointer",
        }}
      >
        End Walk
      </button>
    </div>
  );
}

// ── Screen 4: Complete ──────────────────────────────────────────────────────

function CompletePanel({ onRestart }) {
  const [exported, setExported] = useState(false);
  return (
    <div style={{ background: C.panel, borderTop: `1px solid ${C.border}`, padding: "16px 20px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 26, marginBottom: 4 }}>✅</div>
        <div style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>Walk Complete</div>
        <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>Both sidewalks updated · Coverage saved</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { val: "3.8 km", label: "Distance" },
          { val: "46 min", label: "Duration" },
          { val: "91%", label: "Fresh roads" },
        ].map(({ val, label }) => (
          <div key={label} style={{
            background: C.panelAlt, borderRadius: 8, padding: "10px 6px",
            textAlign: "center", border: `1px solid ${C.border}`,
          }}>
            <div style={{ color: C.accent, fontSize: 15, fontWeight: 700, fontFamily: "monospace" }}>{val}</div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Side coverage callout */}
      <div style={{
        background: "#1a2518", border: `1px solid #4ade8033`,
        borderRadius: 8, padding: "9px 12px", marginBottom: 12,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>🟡→⬛</span>
        <span style={{ color: "#86efac", fontSize: 11 }}>
          Dorfstrasse now fully covered — both sides walked
        </span>
      </div>

      {/* GPX export */}
      <div style={{
        background: C.panelAlt, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: "10px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10,
      }}>
        <div>
          <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>walk_2026-03-02.gpx</div>
          <div style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>
            {exported ? "Exported ✓" : "Saved · ready to export"}
          </div>
        </div>
        <button
          onClick={() => setExported(true)}
          style={{
            padding: "7px 14px", background: "transparent",
            color: exported ? C.muted : C.accent,
            fontWeight: 600, fontSize: 12,
            border: `1px solid ${exported ? C.border : C.accent + "55"}`,
            borderRadius: 6, cursor: "pointer",
          }}
        >
          {exported ? "Done ✓" : "Export ↓"}
        </button>
      </div>

      <button
        onClick={onRestart}
        style={{
          width: "100%", padding: "12px", background: C.accent,
          color: "#0f1117", fontWeight: 700, fontSize: 14,
          border: "none", borderRadius: 8, cursor: "pointer",
        }}
      >
        Plan Next Walk →
      </button>
    </div>
  );
}

// ── App Shell ───────────────────────────────────────────────────────────────

export default function FreshSteps() {
  const [screen, setScreen] = useState("map");
  const [selectedRoute, setSelectedRoute] = useState(0);

  const navTo = (s) => setScreen(s);

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "20px 16px",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ color: C.text, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>🌿 Fresh Steps</div>
        <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>Interactive Mockup · tap through all 4 screens</div>
      </div>

      {/* Phone */}
      <div style={{
        width: 340, background: "#0f1117", borderRadius: 36, overflow: "hidden",
        border: "1px solid #2a2d3a",
        boxShadow: "0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px #1a1d27",
      }}>
        {/* Status bar */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 20px 6px", background: "#0c0e14",
        }}>
          <span style={{ color: C.muted, fontSize: 11, fontFamily: "monospace" }}>9:41</span>
          <div style={{ width: 80, height: 16, background: "#1a1d27", borderRadius: 10 }} />
          <span style={{ color: C.muted, fontSize: 11 }}>●●●</span>
        </div>

        {/* Map */}
        <MapSVG screen={screen} selectedRoute={selectedRoute} />

        {/* Panel */}
        {screen === "map" && <PlanningPanel onConfirm={() => navTo("routes")} />}
        {screen === "routes" && (
          <RoutesPanel
            onStart={() => navTo("walking")}
            selected={selectedRoute}
            setSelected={setSelectedRoute}
          />
        )}
        {screen === "walking" && <WalkingPanel onEnd={() => navTo("complete")} />}
        {screen === "complete" && <CompletePanel onRestart={() => { setScreen("map"); }} />}
      </div>

      {/* Screen nav tabs */}
      <div style={{
        display: "flex", gap: 6, marginTop: 20,
        background: "#0f1117", padding: "6px", borderRadius: 12,
        border: `1px solid ${C.border}`,
      }}>
        {[
          { id: "map", label: "1. Plan" },
          { id: "routes", label: "2. Routes" },
          { id: "walking", label: "3. Walking" },
          { id: "complete", label: "4. Done" },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => navTo(id)}
            style={{
              padding: "7px 14px",
              background: screen === id ? C.accent : "transparent",
              color: screen === id ? "#0f1117" : C.muted,
              fontWeight: screen === id ? 700 : 500,
              fontSize: 12, border: "none", borderRadius: 8,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Color legend */}
      <div style={{ marginTop: 16, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {[
          { color: C.fresh, label: "Both sides fresh" },
          { color: C.partial, label: "One side covered" },
          { color: C.covered, label: "Both sides covered" },
          { color: C.planned, label: "Planned route" },
          { color: C.current, label: "Walking now" },
          { color: C.dot, label: "You are here" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            <span style={{ color: "#4b5563", fontSize: 11 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
