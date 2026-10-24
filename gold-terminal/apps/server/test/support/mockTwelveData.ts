import { readFileSync } from "node:fs";
import path from "node:path";
import { bucketEnd, TWELVE_DATA_INTERVAL, TIMEFRAMES, type Timeframe } from "@gold/core";
import { WebSocketServer, type WebSocket } from "ws";
import { parseUtcDatetime } from "../../src/market/twelvedata/parse";
import { SYNTHETIC_DIR } from "./helpers";

type Series = { meta: unknown; values: { datetime: string }[] };

/**
 * Serves recorded Twelve Data REST bodies as the provider would at the
 * current virtual time: only bars that have closed by `now()` are returned,
 * so the server under test cannot see the future.
 */
export function mockTwelveDataFetch(now: () => number, dir = SYNTHETIC_DIR) {
  const byInterval = new Map<string, Series>();
  for (const tf of TIMEFRAMES) {
    const interval = TWELVE_DATA_INTERVAL[tf];
    byInterval.set(interval, JSON.parse(readFileSync(path.join(dir, `time_series_${interval}.json`), "utf8")));
  }
  const tfByInterval = new Map(TIMEFRAMES.map((tf) => [TWELVE_DATA_INTERVAL[tf], tf] as [string, Timeframe]));
  const calls: URL[] = [];
  const failNext: { body: unknown; status: number }[] = [];
  let creditsLeft = 800;

  const impl = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    creditsLeft--;
    const headers = { "content-type": "application/json", "api-credits-used": "1", "api-credits-left": String(creditsLeft) };
    const injected = failNext.shift();
    if (injected) return new Response(JSON.stringify(injected.body), { status: injected.status, headers });
    if (url.searchParams.get("apikey") !== "test-key") return new Response(JSON.stringify({ code: 401, message: "invalid api key", status: "error" }), { status: 401, headers });
    if (url.pathname === "/quote") return new Response(readFileSync(path.join(dir, "quote.json")), { status: 200, headers });
    if (url.pathname === "/time_series") {
      const interval = url.searchParams.get("interval")!;
      const tf = tfByInterval.get(interval)!;
      const s = byInterval.get(interval)!;
      let values = s.values.filter((v) => bucketEnd(parseUtcDatetime(v.datetime), tf) <= now());
      const start = url.searchParams.get("start_date");
      const end = url.searchParams.get("end_date");
      if (start) values = values.filter((v) => parseUtcDatetime(v.datetime) >= parseUtcDatetime(start));
      if (end) values = values.filter((v) => parseUtcDatetime(v.datetime) <= parseUtcDatetime(end));
      values = values.slice(-Number(url.searchParams.get("outputsize") ?? 30));
      return new Response(JSON.stringify({ meta: s.meta, values, status: "ok" }), { status: 200, headers });
    }
    return new Response(JSON.stringify({ code: 404, message: "not found", status: "error" }), { status: 404, headers });
  }) as typeof fetch;

  return { impl, calls, failNext };
}

/** Local WebSocket server that speaks the Twelve Data price-stream protocol. */
export async function mockTwelveDataWs() {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((r) => wss.once("listening", () => r()));
  const port = (wss.address() as { port: number }).port;
  const sockets = new Set<WebSocket>();
  const received: unknown[] = [];
  let connections = 0;
  wss.on("connection", (ws, req) => {
    connections++;
    sockets.add(ws);
    if (!req.url?.includes("apikey=test-key")) {
      ws.close(4001, "unauthorized");
      return;
    }
    ws.on("message", (d) => {
      const msg = JSON.parse(d.toString());
      received.push(msg);
      if (msg.action === "subscribe") ws.send(JSON.stringify({ event: "subscribe-status", status: "ok", success: [{ symbol: "XAU/USD" }], fails: [] }));
      if (msg.action === "heartbeat") ws.send(JSON.stringify({ event: "heartbeat", status: "ok" }));
    });
    ws.on("close", () => sockets.delete(ws));
  });
  return {
    url: `ws://127.0.0.1:${port}`,
    received,
    get connections() {
      return connections;
    },
    send(raw: string) {
      for (const s of sockets) s.send(raw);
    },
    dropAll() {
      for (const s of sockets) s.terminate();
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
