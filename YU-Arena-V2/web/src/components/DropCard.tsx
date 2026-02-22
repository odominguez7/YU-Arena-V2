import CountdownTimer from "./CountdownTimer";

interface DropCardProps {
  drop: {
    id: string;
    title: string;
    status: string;
    spots_available: number;
    price_cents: number;
    expires_at: string;
    claims_count?: number;
  };
  onClick: () => void;
  onExpired?: () => void;
}

export default function DropCard({ drop, onClick, onExpired }: DropCardProps) {
  const price = `$${(drop.price_cents / 100).toFixed(0)}`;

  return (
    <div className={`drop-card status-${drop.status}`} onClick={onClick}>
      <div className="drop-card-header">
        <span className="drop-card-title">{drop.title}</span>
        {drop.status === "live" && (
          <CountdownTimer expiresAt={drop.expires_at} onExpired={onExpired} />
        )}
        {drop.status === "filled" && <span className="status-tag filled">Filled</span>}
        {drop.status === "expired" && <span className="status-tag expired">Expired</span>}
        {drop.status === "cancelled" && <span className="status-tag cancelled">Cancelled</span>}
      </div>
      <div className="drop-card-meta">
        <span>{drop.spots_available} spot{drop.spots_available !== 1 ? "s" : ""}</span>
        <span>{price}</span>
        <span>{drop.claims_count ?? 0} claim{(drop.claims_count ?? 0) !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}
