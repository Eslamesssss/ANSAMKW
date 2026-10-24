"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { setAdminToken, useAdminToken } from "@/lib/auth";
import { Button } from "./ui";

/** Unlock/lock control for the admin token that state-changing actions need. */
export function AdminAccess() {
  const token = useAdminToken();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const candidate = value.trim();
    if (!candidate) return;
    setBusy(true);
    setError(null);
    try {
      // Verify against the server before storing anything.
      await api("/api/auth/check", undefined, { admin: true, token: candidate });
      setAdminToken(candidate);
      setValue("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => (token ? setAdminToken(null) : setOpen((o) => !o))}
        className={`rounded-md border px-2 py-0.5 text-[11.5px] font-semibold ${token ? "border-bull/40 bg-bull/10 text-bull" : "border-line-2 text-ink-2 hover:text-ink"}`}
        title={token ? "Admin unlocked in this browser — click to lock and forget the token" : "Enter the admin token to edit alerts or run analysis"}
      >
        {token ? "Admin unlocked · Lock" : "Unlock admin"}
      </button>
      {open && !token && (
        <form onSubmit={unlock} className="absolute right-0 top-8 z-30 w-[min(320px,calc(100vw-32px))] space-y-2 rounded-lg border border-line-2 bg-panel p-3 shadow-xl">
          <label className="block text-[11.5px] text-ink-2" htmlFor="admin-token">
            Admin token (ADMIN_API_TOKEN on the server)
          </label>
          <input
            id="admin-token"
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="num w-full rounded border border-line-2 bg-panel-2 px-2 py-1 text-[12px] text-ink outline-none focus:border-gold/60"
            autoFocus
          />
          <p className="text-[10.5px] leading-snug text-ink-3">Stored only in this browser. Needed to edit alert rules, acknowledge alerts and run Claude analysis.</p>
          {error && <p className="text-[11px] text-bear">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button tone="gold" type="submit" disabled={busy || !value.trim()}>
              {busy ? "Checking…" : "Unlock"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
