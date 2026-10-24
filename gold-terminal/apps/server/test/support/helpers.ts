import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { loadConfig, type Config } from "../../src/config";
import type { Logger } from "../../src/engine/engine";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SYNTHETIC_DIR = path.resolve(here, "../../../../fixtures/synthetic");

export function testConfig(over: Record<string, string> = {}): Config {
  return loadConfig({ NODE_ENV: "test", DATA_MODE: "fixture", TWELVEDATA_API_KEY: "test-key", ANALYST_ALLOW_FIXTURE: "true", ...over } as NodeJS.ProcessEnv);
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

export function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(SYNTHETIC_DIR, name), "utf8"));
}

export function manifest(): { replayStart: string; replayEnd: string } {
  return readFixture("manifest.json") as { replayStart: string; replayEnd: string };
}

/** Controllable clock. */
export function fakeClock(start: number) {
  let t = start;
  return { now: () => t, set: (v: number) => (t = v), advance: (ms: number) => (t += ms) };
}
