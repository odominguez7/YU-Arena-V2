import { useState, useEffect, useCallback } from "react";
import { api, setToken, getToken } from "../api";

interface Operator {
  id: string;
  business_name: string;
  phone: string | null;
  whatsapp_from_number: string | null;
  created_at: string;
}

export function useAuth() {
  const [operator, setOperator] = useState<Operator | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const op = await api<Operator>("/auth/me");
      setOperator(op);
    } catch {
      setToken(null);
      setOperator(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (accessCode: string) => {
    const res = await api<{ token: string; operator: Operator }>("/auth/login", {
      method: "POST",
      body: { access_code: accessCode },
      noAuth: true,
    });
    setToken(res.token);
    setOperator(res.operator);
  };

  const logout = () => {
    setToken(null);
    setOperator(null);
  };

  return { operator, loading, login, logout };
}
