import { readFileSync } from "node:fs";
import path from "node:path";
import { bucketEnd, type Timeframe } from "@gold/core";
import { WebSocketServer, type WebSocket } from "ws";
import { SYNTHETIC_DIR } from "./helpers";

type Manifest = { rest: Record<string, string>; klines: Record<string, string> };

/**
 * Mock of the Binance USDⓈ-M REST API backed by fixture bodies. Klines are
 * served as of `now()` (no future bars), every response carries
 * X-MBX-USED-WEIGHT-1M, and failures can be injected per call.
 */
export function mockBinanceRest(now: () => number, dir = SYNTHETIC_DIR) {
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest;
  const klines = new Map<string, unknown[][]>(Object.entries(manifest.klines).map(([tf, f]) => [tf, JSON.parse(readFileSync(path.join(dir, f), "utf8"))]));
  const overrides = new Map<string, unknown>();
  const calls: URL[] = [];
  const failNext: { status: number; body: unknown; headers?: Record<string, string> }[] = [];
  let used = 0;

  const impl = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    used += 1;
    const headers = { "content-type": "application/json", "x-mbx-used-weight-1m": String(used) };
    const injected = failNext.shift();
    if (injected) return new Response(JSON.stringify(injected.body), { status: injected.status, headers: { ...headers, ...injected.headers } });
    if (url.searchParams.has("apikey") || url.searchParams.has("signature")) return new Response(JSON.stringify({ code: -2015, msg: "no keys expected" }), { status: 401, headers });
    if (url.pathname === "/fapi/v1/klines") {
      if (url.searchParams.get("symbol") !== "XAUUSDT") return new Response(JSON.stringify({ code: -1121, msg: "Invalid symbol." }), { status: 400, headers });
      const tf = url.searchParams.get("interval") as Timeframe;
      const rows = klines.get(tf) ?? [];
      const start = Number(url.searchParams.get("startTime") ?? -Infinity);
      const end = Number(url.searchParams.get("endTime") ?? Infinity);
      const limit = Number(url.searchParams.get("limit") ?? 500);
      const visible = rows.filter((r) => bucketEnd(r[0] as number, tf) <= now() && (r[0] as number) >= start && (r[0] as number) <= end);
      return new Response(JSON.stringify(start > -Infinity ? visible.slice(0, limit) : visible.slice(-limit)), { status: 200, headers });
    }
    if (overrides.has(url.pathname)) return new Response(JSON.stringify(overrides.get(url.pathname)), { status: 200, headers });
    if (url.pathname === "/fapi/v1/time") return new Response(JSON.stringify({ serverTime: now() + 250 }), { status: 200, headers });
    const file = manifest.rest[url.pathname];
    if (!file) return new Response(JSON.stringify({ code: -1000, msg: "unknown endpoint" }), { status: 404, headers });
    return new Response(readFileSync(path.join(dir, file)), { status: 200, headers });
  }) as typeof fetch;

  return {
    impl,
    calls,
    failNext,
    count: (pathname: string) => calls.filter((u) => u.pathname === pathname).length,
    override: (pathname: string, body: unknown) => overrides.set(pathname, body),
    readRest: (pathname: string) => JSON.parse(readFileSync(path.join(dir, manifest.rest[pathname]!), "utf8")),
  };
}

/** Local combined-stream WebSocket server for /market/stream and /public/stream. */
export async function mockBinanceWs() {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((r) => wss.once("listening", () => r()));
  const port = (wss.address() as { port: number }).port;
  const sockets = new Map<WebSocket, { path: string; streams: string[] }>();
  const connections: { path: string; streams: string[] }[] = [];
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", "ws://x");
    const info = { path: url.pathname, streams: (url.searchParams.get("streams") ?? "").split("/").filter(Boolean) };
    connections.push(info);
    sockets.set(ws, info);
    ws.on("close", () => sockets.delete(ws));
  });
  return {
    marketUrl: `ws://127.0.0.1:${port}/market/stream`,
    bookUrl: `ws://127.0.0.1:${port}/public/stream`,
    connections,
    /** Deliver a combined-stream frame to every socket subscribed to its stream. */
    send(raw: string) {
      const stream = (JSON.parse(raw) as { stream: string }).stream;
      for (const [s, info] of sockets) if (info.streams.includes(stream)) s.send(raw);
    },
    dropAll() {
      for (const s of sockets.keys()) s.terminate();
    },
    close: () =>
      new Promise<void>((r) => {
        for (const s of wss.clients) s.terminate();
        wss.close(() => r());
      }),
  };
}

export function recordedFrames(dir = SYNTHETIC_DIR): { receivedAt: number; raw: string }[] {
  return readFileSync(path.join(dir, "ws_frames.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
