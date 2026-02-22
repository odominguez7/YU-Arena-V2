import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

export default function ClaimPage() {
  const { dropId } = useParams<{ dropId: string }>();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setError("");
    setLoading(true);
    try {
      await api(`/drops/${dropId}/claim`, {
        method: "POST",
        body: { claimant_name: name.trim(), claimant_phone: phone.trim() },
        noAuth: true,
      });
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="claim-page">
        <div className="login-card">
          <h1 className="login-title" style={{ fontSize: "1.5rem" }}>You're in!</h1>
          <p className="login-subtitle">The operator will confirm your spot shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="claim-page">
      <div className="login-card">
        <h1 className="login-title" style={{ fontSize: "1.5rem" }}>Claim This Spot</h1>
        <p className="login-subtitle">Enter your info to grab it</p>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="login-input"
            autoFocus
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
            className="login-input"
          />
          <button type="submit" disabled={loading} className="btn btn-primary login-btn">
            {loading ? "Claiming..." : "Claim Spot"}
          </button>
        </form>
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}
