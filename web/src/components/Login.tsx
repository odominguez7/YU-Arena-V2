import { useState, type FormEvent } from "react";

interface LoginProps {
  onLogin: (code: string) => Promise<void>;
}

export default function Login({ onLogin }: LoginProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setError("");
    setLoading(true);
    try {
      await onLogin(code.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">
          <span className="accent">YU</span> Arena
        </h1>
        <p className="login-subtitle">Enter your access code to get started</p>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            autoFocus
            className="login-input"
          />
          <button type="submit" disabled={loading} className="btn btn-primary login-btn">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}
