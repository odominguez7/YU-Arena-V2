const BASE = "/api";

let token: string | null = localStorage.getItem("yu_token");

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem("yu_token", t);
  else localStorage.removeItem("yu_token");
}

export function getToken(): string | null {
  return token;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; noAuth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opts.noAuth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    setToken(null);
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}
