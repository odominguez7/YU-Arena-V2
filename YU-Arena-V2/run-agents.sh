#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASE_URL="${BASE_URL:-https://yu-arena-381932264033.us-east1.run.app}"
ACCESS_CODE="${ACCESS_CODE:-demo1234}"
OPERATOR_ID="${OPERATOR_ID:-}"
DROP_INTERVAL_MS="${DROP_INTERVAL_MS:-30000}"
DROP_TIMER_SECONDS="${DROP_TIMER_SECONDS:-90}"

usage() {
  cat <<'EOF'
Usage:
  ./run-agents.sh [--access-code <code>] [--operator-id <id>] [--base-url <url>]

Options:
  --access-code   Operator access code (default: demo1234)
  --operator-id   Operator ID (auto-detected via login if omitted)
  --base-url      Server URL (default: deployed Cloud Run URL)
  --drop-interval Drop launch interval in ms (default: 30000)
  --drop-timer    Drop timer in seconds (default: 90)
  -h, --help      Show this help

Environment variables:
  BASE_URL          Server URL
  ACCESS_CODE       Operator access code
  OPERATOR_ID       Operator ID (skip login if set with JWT)
  JWT               Pre-authenticated JWT token
  DROP_INTERVAL_MS  Interval between drop scans (ms)
  DROP_TIMER_SECONDS  Timer for each drop (seconds)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --access-code)
      [[ $# -ge 2 ]] || { echo "Missing value for --access-code"; exit 1; }
      ACCESS_CODE="$2"
      shift 2
      ;;
    --operator-id)
      [[ $# -ge 2 ]] || { echo "Missing value for --operator-id"; exit 1; }
      OPERATOR_ID="$2"
      shift 2
      ;;
    --base-url)
      [[ $# -ge 2 ]] || { echo "Missing value for --base-url"; exit 1; }
      BASE_URL="$2"
      shift 2
      ;;
    --drop-interval)
      [[ $# -ge 2 ]] || { echo "Missing value for --drop-interval"; exit 1; }
      DROP_INTERVAL_MS="$2"
      shift 2
      ;;
    --drop-timer)
      [[ $# -ge 2 ]] || { echo "Missing value for --drop-timer"; exit 1; }
      DROP_TIMER_SECONDS="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

# ─── Health check ───────────────────────────────────────

echo "Checking server health at ${BASE_URL}..."
HEALTH=$(curl -fsS "${BASE_URL}/api/health" 2>/dev/null || true)
if [[ -z "${HEALTH}" ]]; then
  echo "ERROR: Server at ${BASE_URL} is not responding."
  echo "Make sure the server is running and try again."
  exit 1
fi
echo "Server is healthy: ${HEALTH}"
echo

# ─── Login to get JWT + operator ID ─────────────────────

if [[ -z "${OPERATOR_ID}" ]]; then
  echo "Logging in with access code..."
  LOGIN_RESPONSE=$(curl -fsS "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"access_code\": \"${ACCESS_CODE}\"}" 2>/dev/null || true)

  if [[ -z "${LOGIN_RESPONSE}" ]]; then
    echo "ERROR: Login failed. Check your access code."
    echo "  Access code used: ${ACCESS_CODE}"
    exit 1
  fi

  JWT=$(echo "${LOGIN_RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || true)
  OPERATOR_ID=$(echo "${LOGIN_RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin)['operator']['id'])" 2>/dev/null || true)
  BIZ_NAME=$(echo "${LOGIN_RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin)['operator']['business_name'])" 2>/dev/null || true)

  if [[ -z "${JWT}" || -z "${OPERATOR_ID}" ]]; then
    echo "ERROR: Could not parse login response."
    echo "Response: ${LOGIN_RESPONSE}"
    exit 1
  fi

  echo "Logged in as: ${BIZ_NAME} (${OPERATOR_ID})"
  echo
fi

# ─── Launch agents ──────────────────────────────────────

cleanup() {
  echo
  echo "Stopping agents..."
  kill "${SCOUT_PID:-}" "${CLOSER_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "═══════════════════════════════════════════"
echo "  YU Arena V2 — Agent Runner"
echo "═══════════════════════════════════════════"
echo "  Server:      ${BASE_URL}"
echo "  Operator:    ${OPERATOR_ID}"
echo "  Drop timer:  ${DROP_TIMER_SECONDS}s"
echo "  Scan interval: $((DROP_INTERVAL_MS / 1000))s"
echo "═══════════════════════════════════════════"
echo

(
  cd "${ROOT_DIR}/agents/scout"
  OPERATOR_ID="${OPERATOR_ID}" \
  BASE_URL="${BASE_URL}" \
  ACCESS_CODE="${ACCESS_CODE}" \
  JWT="${JWT:-}" \
  DROP_INTERVAL_MS="${DROP_INTERVAL_MS}" \
  DROP_TIMER_SECONDS="${DROP_TIMER_SECONDS}" \
  node index.js
) &
SCOUT_PID=$!

sleep 1

(
  cd "${ROOT_DIR}/agents/closer"
  OPERATOR_ID="${OPERATOR_ID}" \
  BASE_URL="${BASE_URL}" \
  ACCESS_CODE="${ACCESS_CODE}" \
  JWT="${JWT:-}" \
  node index.js
) &
CLOSER_PID=$!

echo "Scout PID:  ${SCOUT_PID}"
echo "Closer PID: ${CLOSER_PID}"
echo "Press Ctrl+C to stop both."
echo

wait
