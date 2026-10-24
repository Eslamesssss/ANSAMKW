#!/usr/bin/env bash
# Gold Intelligence Terminal - macOS/Linux launcher (start | stop).
set -u
ACTION="${1:-start}"
cd "$(dirname "$0")/.." || exit 1
say() { printf '%s\n' "$1"; }

if ! command -v docker >/dev/null 2>&1; then
  say "Docker is not installed. Install Docker Desktop first (see the guide, step 2)."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  if [ "$(uname)" = "Darwin" ]; then
    say "Starting Docker Desktop... (this can take 1-2 minutes)"
    open -a Docker || true
  else
    say "Docker is not running. Start it (sudo systemctl start docker) and run this again."
  fi
  for _ in $(seq 1 90); do docker info >/dev/null 2>&1 && break; sleep 2; done
  docker info >/dev/null 2>&1 || { say "Docker did not start. Open Docker Desktop, wait for 'Engine running', then try again."; exit 1; }
fi

if [ "$ACTION" = "stop" ]; then
  say "Stopping Gold Intelligence Terminal..."
  docker compose stop
  say "Stopped. Your data is kept. Run the START file to start again."
  exit 0
fi

if [ ! -f .env ]; then
  TOKEN="$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')"
  cat > .env <<ENV
# Gold Intelligence Terminal settings (created automatically on first start)
DATA_MODE=live
ADMIN_API_TOKEN=$TOKEN
# Optional: Claude analyst. Paste your Anthropic API key after the = sign, save, then stop and start the tool.
ANTHROPIC_API_KEY=
ANALYST_AUTO_ENABLED=false
ENV
  printf '%s' "$TOKEN" > admin-token.txt
  say "Created settings file (.env) and your admin password in admin-token.txt"
fi

if curl -fsS -m 10 https://fapi.binance.com/fapi/v1/ping >/dev/null 2>&1; then
  say "Binance Futures is reachable from this network."
else
  say "WARNING: Binance Futures (fapi.binance.com) is NOT reachable from this network."
  say "The tool will start but will show no prices until Binance is reachable (see the guide, Problems section)."
fi

say "Starting Gold Intelligence Terminal. The FIRST start takes 5-15 minutes (downloading and building)..."
# Remove old containers first (saved data lives in a volume and is kept), so a start after an earlier failure is clean.
docker compose down --remove-orphans >/dev/null 2>&1 || true
docker compose up -d --build || { say "Docker could not start the tool. See the Problems section of the guide."; exit 1; }

say "Waiting for the dashboard to come up..."
for _ in $(seq 1 180); do
  if curl -fsS -m 5 http://localhost:3000 >/dev/null 2>&1; then
    say "Ready! Opening http://localhost:3000"
    if [ "$(uname)" = "Darwin" ]; then open http://localhost:3000; else xdg-open http://localhost:3000 >/dev/null 2>&1 || true; fi
    exit 0
  fi
  sleep 5
done
say "The dashboard did not respond in time. Open http://localhost:3000 in your browser in a few minutes."
