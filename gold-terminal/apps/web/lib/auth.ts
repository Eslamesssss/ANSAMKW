"use client";

import { useEffect, useState } from "react";

/**
 * The admin token is typed in by the operator and kept only in this browser
 * (localStorage, falling back to memory when storage is blocked). It is never
 * part of the build, so the public bundle carries no credential.
 */
const KEY = "gold-terminal.admin-token";
let memory: string | null = null;
const listeners = new Set<(t: string | null) => void>();

export function getAdminToken(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function setAdminToken(token: string | null) {
  memory = token;
  try {
    if (token) window.localStorage.setItem(KEY, token);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: memory only */
  }
  for (const l of listeners) l(token);
}

export function useAdminToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(getAdminToken());
    listeners.add(setToken);
    return () => {
      listeners.delete(setToken);
    };
  }, []);
  return token;
}
