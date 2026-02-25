import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../api";

interface Offering {
  id: string;
  name: string;
  default_price_cents: number;
  default_spots: number;
}

export default function CreateDrop() {
  const navigate = useNavigate();
  const location = useLocation();
  const block = (location.state as { block?: { offering_id: string; id: string; default_spots: number } })?.block;

  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [offeringId, setOfferingId] = useState(block?.offering_id ?? "");
  const [spots, setSpots] = useState(block?.default_spots?.toString() ?? "1");
  const [price, setPrice] = useState("");
  const [timer, setTimer] = useState("90");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Offering[]>("/offerings").then((o) => {
      setOfferings(o);
      if (!offeringId && o.length > 0) {
        setOfferingId(o[0].id);
        setPrice((o[0].default_price_cents / 100).toString());
        setSpots(o[0].default_spots.toString());
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const off = offerings.find((o) => o.id === offeringId);
    if (off) {
      setPrice((off.default_price_cents / 100).toString());
      if (!block) setSpots(off.default_spots.toString());
    }
  }, [offeringId, offerings, block]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const drop = await api<{ id: string; whatsapp_sent?: number; whatsapp_total?: number }>("/drops", {
        method: "POST",
        body: {
          offering_id: offeringId,
          schedule_block_id: block?.id ?? undefined,
          title: title.trim() || undefined,
          spots_available: parseInt(spots) || 1,
          price_cents: Math.round(parseFloat(price) * 100) || 0,
          timer_seconds: parseInt(timer) || 90,
        },
      });
      const total = drop.whatsapp_total ?? 0;
      const sent = drop.whatsapp_sent ?? 0;
      if (total > 0) {
        navigate(`/drop/${drop.id}`, {
          state: { message: `WhatsApp sent to ${sent}/${total} rush list members` },
        });
      } else {
        navigate(`/drop/${drop.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create drop");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-narrow">
      <div className="back-link" onClick={() => navigate("/")}>← Back</div>
      <h2 style={{ marginBottom: 20 }}>Create Drop</h2>
      <form onSubmit={handleSubmit} className="create-form">
        <label>
          Offering
          <select value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>

        <label>
          Title (optional)
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto-generated from offering" />
        </label>

        <div className="form-row">
          <label>
            Spots
            <input type="number" min={1} value={spots} onChange={(e) => setSpots(e.target.value)} />
          </label>
          <label>
            Price ($)
            <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label>
            Timer (sec)
            <input type="number" min={10} value={timer} onChange={(e) => setTimer(e.target.value)} />
          </label>
        </div>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" disabled={loading} className="btn btn-primary login-btn">
          {loading ? "Launching..." : "Launch Drop"}
        </button>
      </form>
    </div>
  );
}
