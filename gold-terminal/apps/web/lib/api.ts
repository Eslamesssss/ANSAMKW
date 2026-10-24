import { getAdminToken, setAdminToken } from "./auth";

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(typeof body === "object" && body && "reason" in body ? String((body as { reason: unknown }).reason) : typeof body === "object" && body && "detail" in body ? String((body as { detail: unknown }).detail) : `HTTP ${status}`);
  }
}

/**
 * Calls the API. State-changing requests (any non-GET) carry the operator's
 * admin token; pass `{ admin: true }` to send it on a GET (token check).
 */
export async function api<T>(path: string, init?: RequestInit, opts: { admin?: boolean; token?: string } = {}): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const token = method !== "GET" || opts.admin ? (opts.token ?? getAdminToken()) : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // A stored token the server rejects (e.g. rotated) is dropped so the UI re-locks.
    if (res.status === 401 && token && !opts.token) setAdminToken(null);
    throw new ApiError(res.status, body);
  }
  return body as T;
}
