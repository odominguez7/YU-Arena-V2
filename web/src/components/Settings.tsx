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

  const fetchMembers = () => {
    api<RushMember[]>("/rush-list").then(setMembers);
  };

  useEffect(fetchMembers, []);

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

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>Settings</h2>

      <div className="card">
        <h3>Business</h3>
        <p>{businessName}</p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Rush List ({members.length})</h3>
        <form onSubmit={addMember} className="rush-form">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="login-input" />
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="login-input" />
          <button type="submit" className="btn btn-primary btn-sm">Add</button>
        </form>
        {error && <p className="login-error">{error}</p>}
        <div className="rush-list">
          {members.map((m) => (
            <div key={m.id} className="rush-item">
              <div>
                <span className="rush-name">{m.name}</span>
                <span className="text-muted" style={{ marginLeft: 8 }}>{m.phone}</span>
              </div>
              <button className="btn btn-sm" onClick={() => removeMember(m.id)}>Remove</button>
            </div>
          ))}
          {members.length === 0 && <p className="text-muted">No members yet</p>}
        </div>
      </div>

      <button className="btn btn-danger" style={{ marginTop: 24 }} onClick={onLogout}>Log Out</button>
    </div>
  );
}
