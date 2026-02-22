#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASE_URL="${BASE_URL:-https://yu-arena-381932264033.us-east1.run.app}"
SCOUT_KEY="${SCOUT_KEY:-YU123}"
CLOSER_KEY="${CLOSER_KEY:-yu-closer-key-demo}"
ROOM_ID="${ROOM_ID:-}"
ROOM_NAME_HINT="${ROOM_NAME_HINT:-}"
AUTO_SELECT="${AUTO_SELECT:-0}"

usage() {
  cat <<'EOF'
Usage:
  ./run-agents.sh [room_id] [base_url]
  ./run-agents.sh [--room-id <id>] [--room-name <name>] [--base-url <url>] [--auto-select]

Notes:
  - If no room ID is provided and multiple rooms exist, you will be prompted to choose one.
  - Set --auto-select (or AUTO_SELECT=1) to keep non-interactive auto-picking behavior.
  - ROOM_NAME_HINT env var works like --room-name.
EOF
}

POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --room-id)
      [[ $# -ge 2 ]] || { echo "Missing value for --room-id"; exit 1; }
      ROOM_ID="$2"
      shift 2
      ;;
    --room-name)
      [[ $# -ge 2 ]] || { echo "Missing value for --room-name"; exit 1; }
      ROOM_NAME_HINT="$2"
      shift 2
      ;;
    --base-url)
      [[ $# -ge 2 ]] || { echo "Missing value for --base-url"; exit 1; }
      BASE_URL="$2"
      shift 2
      ;;
    --auto-select)
      AUTO_SELECT="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      POSITIONAL_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ -z "${ROOM_ID}" && ${#POSITIONAL_ARGS[@]} -ge 1 ]]; then
  ROOM_ID="${POSITIONAL_ARGS[0]}"
fi
if [[ ${#POSITIONAL_ARGS[@]} -ge 2 ]]; then
  BASE_URL="${POSITIONAL_ARGS[1]}"
fi

pick_best_room_id() {
  local rooms_json="$1"
  local base_url="$2"
  local name_hint="$3"

  python3 - "$rooms_json" "$base_url" "$name_hint" <<'PY'
import json
import sys
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import urlopen

rooms_json = sys.argv[1]
base_url = sys.argv[2].rstrip("/")
name_hint = sys.argv[3].strip().lower()

def parse_ts(value):
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0

def fetch_room_detail(room_id):
    url = f"{base_url}/api/rooms/{room_id}"
    try:
        with urlopen(url, timeout=3) as response:
            return json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, json.JSONDecodeError):
        return {}

def room_score(room):
    room_id = room.get("id", "")
    detail = fetch_room_detail(room_id) if room_id else {}
    recent_events = detail.get("recent_events") or []

    # Presence is agent heartbeats only, so it is not a reliable "active UI room" signal.
    agent_names = {"scout", "closer"}
    latest_human_ts = 0.0
    latest_non_agent_ts = 0.0
    for event in recent_events:
        actor = str(event.get("actor", "")).strip().lower()
        event_ts = parse_ts(event.get("created_at"))
        if actor and actor not in agent_names:
            latest_non_agent_ts = max(latest_non_agent_ts, event_ts)
            if actor == "human":
                latest_human_ts = max(latest_human_ts, event_ts)

    created_ts = parse_ts(room.get("created_at"))

    # Prefer rooms with recent human input, then recent non-agent input, then newest room.
    return (latest_human_ts, latest_non_agent_ts, created_ts)

try:
    rooms = json.loads(rooms_json)
except json.JSONDecodeError:
    print("")
    sys.exit(0)

if not rooms:
    print("")
    sys.exit(0)

if name_hint:
    for room in rooms:
        room_name = str(room.get("name", "")).strip().lower()
        if room_name == name_hint:
            print(room.get("id", ""))
            sys.exit(0)
    for room in rooms:
        room_name = str(room.get("name", "")).strip().lower()
        if name_hint in room_name:
            print(room.get("id", ""))
            sys.exit(0)

best = max(rooms, key=room_score)
print(best.get("id", ""))
PY
}

match_room_id_by_name() {
  local rooms_json="$1"
  local name_hint="$2"

  python3 - "$rooms_json" "$name_hint" <<'PY'
import json
import sys

rooms_json = sys.argv[1]
name_hint = sys.argv[2].strip().lower()

try:
    rooms = json.loads(rooms_json)
except json.JSONDecodeError:
    print("")
    sys.exit(0)

if not rooms or not name_hint:
    print("")
    sys.exit(0)

for room in rooms:
    room_name = str(room.get("name", "")).strip().lower()
    if room_name == name_hint:
        print(room.get("id", ""))
        sys.exit(0)
for room in rooms:
    room_name = str(room.get("name", "")).strip().lower()
    if name_hint in room_name:
        print(room.get("id", ""))
        sys.exit(0)

print("")
PY
}

pick_room_interactively() {
  local rooms_json="$1"

  mapfile -t room_lines < <(python3 - "$rooms_json" <<'PY'
import json
import sys

try:
    rooms = json.loads(sys.argv[1])
except json.JSONDecodeError:
    sys.exit(0)

for room in rooms:
    rid = str(room.get("id", "")).strip()
    name = str(room.get("name", "")).replace("\t", " ").strip()
    created = str(room.get("created_at", "")).strip()
    if rid:
        print(f"{rid}\t{name}\t{created}")
PY
  )

  if [[ ${#room_lines[@]} -eq 0 ]]; then
    echo ""
    return 0
  fi

  if [[ ${#room_lines[@]} -eq 1 ]]; then
    IFS=$'\t' read -r only_id _ <<<"${room_lines[0]}"
    echo "${only_id}"
    return 0
  fi

  echo "Multiple rooms found:" >&2
  for i in "${!room_lines[@]}"; do
    IFS=$'\t' read -r rid rname rcreated <<<"${room_lines[$i]}"
    printf "  [%d] %s (%s)\n" "$((i + 1))" "${rname}" "${rcreated}" >&2
  done

  local choice
  while true; do
    read -r -p "Select room number: " choice >&2
    if [[ "${choice}" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#room_lines[@]} )); then
      IFS=$'\t' read -r selected_id _ <<<"${room_lines[$((choice - 1))]}"
      echo "${selected_id}"
      return 0
    fi
    echo "Invalid selection. Choose a number between 1 and ${#room_lines[@]}." >&2
  done
}

if [[ -z "${ROOM_ID}" ]]; then
  ROOMS_JSON="$(curl -fsS "${BASE_URL}/api/rooms" || true)"
  if [[ -z "${ROOMS_JSON}" ]]; then
    echo "Failed to fetch rooms from ${BASE_URL}."
    echo "Provide ROOM_ID explicitly:"
    echo "  $0 <room_id> [base_url]"
    exit 1
  fi

  if [[ -n "${ROOM_NAME_HINT}" ]]; then
    ROOM_ID="$(match_room_id_by_name "${ROOMS_JSON}" "${ROOM_NAME_HINT}" || true)"
    if [[ -z "${ROOM_ID}" ]]; then
      echo "Could not find room matching name: ${ROOM_NAME_HINT}"
      echo "Tip: run without --room-name to choose from a list."
      exit 1
    fi
    echo "No room ID provided. Using room matched by name: ${ROOM_ID}"
  elif [[ -t 0 && "${AUTO_SELECT}" != "1" ]]; then
    ROOM_ID="$(pick_room_interactively "${ROOMS_JSON}" || true)"
    echo "No room ID provided. Using selected room: ${ROOM_ID}"
  else
    ROOM_ID="$(pick_best_room_id "${ROOMS_JSON}" "${BASE_URL}" "" || true)"
    echo "No room ID provided. Auto-selected active/recent room: ${ROOM_ID}"
  fi

  if [[ -z "${ROOM_ID}" ]]; then
    echo "No room ID provided and no rooms found at ${BASE_URL}."
    echo "Create a room first, then run:"
    echo "  $0 <room_id> [base_url]"
    exit 1
  fi
fi

cleanup() {
  echo
  echo "Stopping agents..."
  kill "${SCOUT_PID:-}" "${CLOSER_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting agents for room: ${ROOM_ID}"
echo "Base URL: ${BASE_URL}"
echo "Scout key: ${SCOUT_KEY}"
echo "Closer key: ${CLOSER_KEY}"
echo

(
  cd "${ROOT_DIR}/agents/scout"
  ROOM_ID="${ROOM_ID}" BASE_URL="${BASE_URL}" API_KEY="${SCOUT_KEY}" node index.js
) &
SCOUT_PID=$!

(
  cd "${ROOT_DIR}/agents/closer"
  ROOM_ID="${ROOM_ID}" BASE_URL="${BASE_URL}" API_KEY="${CLOSER_KEY}" node index.js
) &
CLOSER_PID=$!

echo "Scout PID: ${SCOUT_PID}"
echo "Closer PID: ${CLOSER_PID}"
echo "Press Ctrl+C to stop both."
echo

wait
