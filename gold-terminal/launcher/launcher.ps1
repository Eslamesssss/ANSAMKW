# Gold Intelligence Terminal - Windows launcher (start | stop). Run via START-Windows.bat / STOP-Windows.bat.
param([string]$Action = "start")
# Continue: docker writes normal progress to stderr, which must not abort the script.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Say($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }

function Wait-Docker {
  docker info *> $null
  if ($LASTEXITCODE -eq 0) { return $true }
  $exe = "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $exe) {
    Say "Starting Docker Desktop... (this can take 1-2 minutes)" Yellow
    Start-Process $exe | Out-Null
  } else {
    Say "Docker Desktop is not installed. Install it first (see the guide, step 2)." Red
    return $false
  }
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 2
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { return $true }
  }
  Say "Docker did not start. Open Docker Desktop yourself, wait until it says 'Engine running', then run START again." Red
  return $false
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Say "Docker is not installed. Install Docker Desktop first (see the guide, step 2)." Red
  exit 1
}
if (-not (Wait-Docker)) { exit 1 }

if ($Action -eq "stop") {
  Say "Stopping Gold Intelligence Terminal..." Yellow
  docker compose stop
  Say "Stopped. Your data is kept. Run START-Windows.bat to start again." Green
  exit 0
}

# First run: create the settings file with a random admin password.
if (-not (Test-Path ".env")) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
  $envText = @"
# Gold Intelligence Terminal settings (created automatically on first start)
DATA_MODE=live
ADMIN_API_TOKEN=$token
# Optional: Claude analyst. Paste your Anthropic API key after the = sign, save, then stop and start the tool.
ANTHROPIC_API_KEY=
ANALYST_AUTO_ENABLED=false
"@
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) ".env"), $envText.Replace("`r`n", "`n"), (New-Object System.Text.UTF8Encoding $false))
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) "admin-token.txt"), $token, (New-Object System.Text.UTF8Encoding $false))
  Say "Created settings file (.env) and your admin password in admin-token.txt" Green
}

try {
  $r = Invoke-WebRequest -Uri "https://fapi.binance.com/fapi/v1/ping" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
  Say "Binance Futures is reachable from this network." Green
} catch {
  Say "WARNING: Binance Futures (fapi.binance.com) is NOT reachable from this network." Red
  Say "The tool will start but will show no prices until Binance is reachable (see the guide, Problems section)." Red
}

Say "Starting Gold Intelligence Terminal. The FIRST start takes 5-15 minutes (downloading and building)..." Yellow
# Remove old containers first (saved data lives in a volume and is kept), so a start after an earlier failure is clean.
docker compose down --remove-orphans *> $null
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Say "Docker could not start the tool. See the Problems section of the guide." Red; exit 1 }

Say "Waiting for the dashboard to come up..." Yellow
$ready = $false
for ($i = 0; $i -lt 180 -and -not $ready; $i++) {
  try {
    Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop | Out-Null
    $ready = $true
  } catch { Start-Sleep -Seconds 5 }
}
if (-not $ready) {
  Say "The dashboard did not respond in time. Open http://localhost:3000 in your browser in a few minutes." Yellow
  exit 0
}
Say "Ready! Open http://localhost:3000 in your browser (opening it now)." Green
try { Start-Process "http://localhost:3000" } catch { Say "Could not open the browser automatically; open http://localhost:3000 yourself." Yellow }
