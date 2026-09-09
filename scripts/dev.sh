#!/usr/bin/env bash
# Local all-in-one launcher: EBS + mock PubSub, frontend dev server, and the
# chat ingest in the foreground so you can type swings right here.
#
#   bash scripts/dev.sh                 # start everything, no game running
#   AUTOSTART=seaside bash scripts/dev.sh
#   AUTOSTART=tournament:weekly-open bash scripts/dev.sh
#   ROUND_SECONDS=30 STORE_PATH=./golf.db.json bash scripts/dev.sh
#
# Ctrl+C stops all three.
set -euo pipefail
cd "$(dirname "$0")/.."

EBS_PORT="${EBS_PORT:-8081}"
WS_PORT="${WS_PORT:-8082}"
FE_PORT="${FE_PORT:-5180}"
ROUND_SECONDS="${ROUND_SECONDS:-15}"
HOLE_INTRO_SECONDS="${HOLE_INTRO_SECONDS:-2}"
RESULT_SECONDS="${RESULT_SECONDS:-2}"
HOLE_COMPLETE_SECONDS="${HOLE_COMPLETE_SECONDS:-3}"
STORE_PATH="${STORE_PATH:-}"
CHANNEL_ID="${CHANNEL_ID:-dev-channel}"
INGEST_SECRET="${INGEST_SECRET:-dev-ingest-secret}"
AUTOSTART="${AUTOSTART:-}"            # "<courseId>" or "tournament:<id>"

EBS_URL="http://127.0.0.1:${EBS_PORT}"
LOG_DIR="$(mktemp -d 2>/dev/null || echo /tmp/golf-dev)"
mkdir -p "$LOG_DIR"
PIDS=()

kill_port() {
  local port="$1" pid
  pid="$(netstat -ano 2>/dev/null | grep LISTENING | grep ":${port} " | awk '{print $NF}' | head -1 || true)"
  if [ -n "${pid:-}" ]; then
    taskkill //F //PID "$pid" >/dev/null 2>&1 || kill -9 "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  echo
  echo "shutting down..."
  for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; done
  kill_port "$EBS_PORT"; kill_port "$WS_PORT"; kill_port "$FE_PORT"
  exit 0
}
trap cleanup INT TERM

# Free the ports in case a previous run is still around.
kill_port "$EBS_PORT"; kill_port "$WS_PORT"; kill_port "$FE_PORT"
sleep 1

echo "logs: $LOG_DIR"

HOST=127.0.0.1 PORT="$EBS_PORT" MOCK_PUBSUB_PORT="$WS_PORT" \
  ROUND_SECONDS="$ROUND_SECONDS" HOLE_INTRO_SECONDS="$HOLE_INTRO_SECONDS" \
  RESULT_SECONDS="$RESULT_SECONDS" HOLE_COMPLETE_SECONDS="$HOLE_COMPLETE_SECONDS" \
  STORE_PATH="$STORE_PATH" INGEST_SECRET="$INGEST_SECRET" \
  npm run --silent start -w @twitch-golf/ebs > "$LOG_DIR/ebs.log" 2>&1 &
PIDS+=($!)

npm run --silent dev -w @twitch-golf/frontend > "$LOG_DIR/frontend.log" 2>&1 &
PIDS+=($!)

printf "waiting for EBS "
for i in $(seq 1 60); do
  if curl -sf "${EBS_URL}/health" >/dev/null 2>&1; then echo "ok"; break; fi
  printf "."
  sleep 0.5
  if [ "$i" -eq 60 ]; then echo " timed out"; echo "--- ebs.log ---"; cat "$LOG_DIR/ebs.log"; cleanup; fi
done

if [ -n "$AUTOSTART" ]; then
  token="$(node -e "process.stdout.write(Buffer.from(JSON.stringify({channel_id:'${CHANNEL_ID}',role:'broadcaster',user_id:'starter',opaque_user_id:'Ustarter'})).toString('base64url'))")"
  if [ "${AUTOSTART#tournament:}" != "$AUTOSTART" ]; then
    body="{\"action\":\"start-tournament\",\"tournamentId\":\"${AUTOSTART#tournament:}\"}"
  else
    body="{\"action\":\"start\",\"courseId\":\"${AUTOSTART}\"}"
  fi
  if curl -sf -X POST "${EBS_URL}/control" -H "authorization: Bearer ${token}" \
       -H "content-type: application/json" -d "$body" >/dev/null; then
    echo "autostarted: ${AUTOSTART}"
  else
    echo "autostart failed (check ${LOG_DIR}/ebs.log)"
  fi
fi

cat <<EOF

  overlay spectator : http://127.0.0.1:${FE_PORT}/video_component.html?role=viewer
  overlay player    : http://127.0.0.1:${FE_PORT}/video_component.html?role=viewer&user=alice
  dashboard         : http://127.0.0.1:${FE_PORT}/dashboard.html?role=broadcaster&user=streamer
  config            : http://127.0.0.1:${FE_PORT}/config.html?role=broadcaster&user=streamer

  Type chat lines below (Ctrl+C to stop everything):
    streamer: !golf start seaside
    alice: !70, 50
    bob: !120, 40
    streamer: !golf skip

EOF

EBS_URL="$EBS_URL" CHANNEL_ID="$CHANNEL_ID" INGEST_SECRET="$INGEST_SECRET" SOURCE=local \
  npm run --silent start -w @twitch-golf/ingest

cleanup
