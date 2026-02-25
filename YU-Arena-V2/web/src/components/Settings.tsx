import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";

interface RushMember {
  id: string;
  phone: string;
  name: string;
  opted_in_at: string;
}

interface SettingsProps {
  businessName: string;
  onLogout: () => void;
}

export default function Settings({ businessName, onLogout }: SettingsProps) {
  const [members, setMembers] = useState<RushMember[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [whatsappConfigured, setWhatsappConfigured] = useState<boolean | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testingPhone, setTestingPhone] = useState<string | null>(null);

  const fetchMembers = () => {
    api<RushMember[]>("/rush-list").then(setMembers);
  };

  useEffect(fetchMembers, []);
  useEffect(() => {
    api<{ configured: boolean; from_number?: string | null }>("/whatsapp/status")
      .then((r) => setWhatsappConfigured(r.configured))
      .catch(() => setWhatsappConfigured(false));
  }, []);

  const addMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !name.trim()) return;
    setError("");
    try {
      await api("/rush-list", { method: "POST", body: { phone: phone.trim(), name: name.trim() } });
      setPhone("");
      setName("");
      fetchMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    }
  };

  const removeMember = async (id: string) => {
    await api(`/rush-list/${id}`, { method: "DELETE" });
    fetchMembers();
  };

  const prioritizeMember = async (id: string) => {
    await api(`/rush-list/${id}/prioritize`, { method: "POST" });
    fetchMembers();
  };

  const testWhatsApp = async () => {
    setTestResult(null);
    try {
      const r = await api<{ sent: number; total: number; message: string }>("/whatsapp/test", { method: "POST" });
      setTestResult(`${r.sent}/${r.total} delivered. ${r.total > 0 ? "Check your phone (and spam)." : "Check Cloud Run logs for errors."}`);
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : "Test failed");
    }
  };

  const testToNumber = async (phone: string) => {
    setTestResult(null);
    setTestingPhone(phone);
    try {
      const r = await api<{ ok: boolean; error?: string }>("/whatsapp/test-to", { method: "POST", body: { phone } });
      setTestResult(r.ok ? `Sent to ${phone}. Check your phone!` : `Failed: ${r.error || "Unknown error"}`);
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTestingPhone(null);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>Settings</h2>

      {whatsappConfigured === true && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>WhatsApp</h3>
          <p className="text-muted" style={{ marginBottom: 8 }}>
            Sending from your Twilio sandbox. Recipients must join first: from WhatsApp, send &quot;join &lt;code&gt;&quot; to the sandbox number.
          </p>
          <p className="text-muted" style={{ marginBottom: 8 }}>Send a test message to all rush list members.</p>
          <button className="btn btn-primary btn-sm" onClick={testWhatsApp}>Test Broadcast</button>
          {testResult && <p style={{ marginTop: 8, fontSize: "0.9rem" }}>{testResult}</p>}
        </div>
      )}

      {whatsappConfigured === false && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--yellow)", background: "rgba(253,203,110,0.15)" }}>
          <h3 style={{ color: "var(--yellow)" }}>⚠️ WhatsApp Not Configured</h3>
          <p className="text-muted" style={{ marginTop: 8, fontSize: "0.9rem" }}>
            Rush list members will not receive WhatsApp messages when you launch a drop. Set these env vars on your server (e.g. Cloud Run):
          </p>
          <code style={{ display: "block", marginTop: 8, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 6, fontSize: "0.8rem" }}>
            TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, BASE_URL
          </code>
          <p className="text-muted" style={{ marginTop: 8, fontSize: "0.85rem" }}>
            Use your Twilio WhatsApp sandbox number for TWILIO_WHATSAPP_FROM. Recipients must join the sandbox first (send &quot;join &lt;code&gt;&quot; to the sandbox number).
          </p>
        </div>
      )}

      <div className="card">
        <h3>Business</h3>
        <p>{businessName}</p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Rush List ({members.length})</h3>
        {members.length > 0 && (
          <div style={{ padding: "12px 14px", marginBottom: 12, background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <strong style={{ color: "var(--accent-light)" }}>Test WhatsApp</strong>
            <p className="text-muted" style={{ fontSize: "0.85rem", marginTop: 4, marginBottom: 0 }}>
              Click the purple <strong>Test WhatsApp</strong> button next to each contact below to send a test message. Results appear above the list.
            </p>
          </div>
        )}
        <p className="text-muted" style={{ fontSize: "0.85rem", marginBottom: 12 }}>
          When a drop is launched, WhatsApp is sent to all members. Click <strong>1st</strong> to prioritize who gets notified first.
        </p>
        {testResult && (
          <div className="test-result-banner" style={{ padding: 12, marginBottom: 12, background: "var(--surface-2)", borderRadius: 8 }}>
            {testResult}
          </div>
        )}
        <form onSubmit={addMember} className="rush-form">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="login-input" />
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="login-input" />
          <button type="submit" className="btn btn-primary btn-sm">Add</button>
        </form>
        {error && <p className="login-error">{error}</p>}
        <div className="rush-list">
          {members.map((m) => (
            <div key={m.id} className="rush-item">
              <div className="rush-item-header">
                <span className="rush-name">{m.name}</span>
                <span className="text-muted" style={{ marginLeft: 8 }}>{m.phone}</span>
              </div>
              <div className="rush-item-actions">
                <button
                  className="btn btn-primary rush-test-btn"
                  onClick={() => testToNumber(m.phone)}
                  disabled={testingPhone === m.phone}
                >
                  {testingPhone === m.phone ? "Sending…" : "Test WhatsApp"}
                </button>
                <button className="btn btn-sm" onClick={() => prioritizeMember(m.id)}>1st</button>
                <button className="btn btn-sm" onClick={() => removeMember(m.id)}>Remove</button>
              </div>
            </div>
          ))}
          {members.length === 0 && <p className="text-muted">No members yet. Add contacts above.</p>}
        </div>
      </div>

      <button className="btn btn-danger" style={{ marginTop: 24 }} onClick={onLogout}>Log Out</button>
    </div>
  );
}
