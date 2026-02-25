import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { api } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import CountdownTimer from "./CountdownTimer";
import ClaimRow from "./ClaimRow";

interface Claim {
  id: string;
  claimant_name: string;
  claimant_phone: string;
  status: string;
  claimed_at: string;
  confirmed_at: string | null;
}

interface DropData {
  id: string;
  operator_id: string;
  title: string;
  status: string;
  spots_available: number;
  price_cents: number;
  timer_seconds: number;
  expires_at: string;
  launched_at: string;
  claims: Claim[];
}

export default function DropDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [drop, setDrop] = useState<DropData | null>(null);
  const flashMessage = (location.state as { message?: string } | null)?.message;
  const [error, setError] = useState("");
  const { events } = useWebSocket(drop?.operator_id ?? null);

  const fetchDrop = useCallback(async () => {
    try {
      const d = await api<DropData>(`/drops/${id}`);
      setDrop(d);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load drop");
    }
  }, [id]);

  useEffect(() => { fetchDrop(); }, [fetchDrop]);
  useEffect(() => { if (events.length > 0) fetchDrop(); }, [events, fetchDrop]);

  const handleAction = async (action: string, extra?: Record<string, unknown>) => {
    try {
      await api(`/drops/${id}`, { method: "PATCH", body: { action, ...extra } });
      fetchDrop();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  if (error && !drop) {
    return <div className="page-narrow"><p className="login-error">{error}</p></div>;
  }
  if (!drop) {
    return <div className="page-narrow"><p className="text-muted">Loading...</p></div>;
  }

  const confirmedCount = drop.claims.filter((c) => c.status === "confirmed").length;
  const price = `$${(drop.price_cents / 100).toFixed(0)}`;
  const isFilled = drop.status === "filled";

  return (
    <div className="page-narrow">
      <div className="back-link" onClick={() => navigate("/")}>← Dashboard</div>

      <div className="drop-detail-header">
        <h2>{drop.title}</h2>
        {drop.status === "live" && (
          <CountdownTimer expiresAt={drop.expires_at} onExpired={fetchDrop} />
        )}
        {drop.status !== "live" && (
          <span className={`status-tag ${drop.status}`}>{drop.status}</span>
        )}
      </div>

      {flashMessage && (
        <div className="filled-banner" style={{ backgroundColor: "var(--accent)" }}>
          {flashMessage}
        </div>
      )}
      {isFilled && (
        <div className="filled-banner">
          Filled! Recovered {price}
        </div>
      )}

      <div className="stats-bar" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-label">Spots</div><div className="stat-value">{drop.spots_available}</div></div>
        <div className="stat-card"><div className="stat-label">Price</div><div className="stat-value">{price}</div></div>
        <div className="stat-card"><div className="stat-label">Confirmed</div><div className="stat-value">{confirmedCount}/{drop.spots_available}</div></div>
      </div>

      {drop.status === "live" && (
        <div className="drop-actions">
          <button className="btn" onClick={() => handleAction("extend", { additional_seconds: 30 })}>+30s</button>
          <button className="btn" onClick={() => handleAction("extend", { additional_seconds: 60 })}>+60s</button>
          <button className="btn btn-danger" onClick={() => handleAction("cancel")}>Stop Drop</button>
        </div>
      )}

      {error && <p className="login-error" style={{ marginTop: 8 }}>{error}</p>}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Claims ({drop.claims.length})</h3>
        {drop.claims.length === 0 && <p className="text-muted">No claims yet</p>}
        {drop.claims.map((c) => (
          <ClaimRow key={c.id} claim={c} onUpdate={fetchDrop} />
        ))}
      </div>
    </div>
  );
}
