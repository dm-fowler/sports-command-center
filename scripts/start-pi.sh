#!/usr/bin/env bash

# ------------------------------------------------------------
# Raspberry Pi startup script for Sports Command Center
# ------------------------------------------------------------
# What this script does:
# 1) Starts the local Node server (port 3000)
# 2) Waits until the dashboard is reachable
# 3) Optionally opens Chromium in kiosk mode for TV display
#
# Usage:
#   ./scripts/start-pi.sh
#   ./scripts/start-pi.sh --kiosk
# ------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DASHBOARD_URL="http://localhost:3000/"
HEALTH_URL="http://localhost:3000/health"

KIOSK_MODE="false"
if [[ "${1:-}" == "--kiosk" ]]; then
  KIOSK_MODE="true"
fi

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}"
    exit 1
  fi
}

find_chromium_command() {
  if command -v chromium-browser >/dev/null 2>&1; then
    echo "chromium-browser"
    return
  fi

  if command -v chromium >/dev/null 2>&1; then
    echo "chromium"
    return
  fi

  echo ""
}

wait_for_server() {
  local attempts=40
  local i=1

  while [[ "${i}" -le "${attempts}" ]]; do
    if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
      return 0
    fi

    sleep 0.5
    i=$((i + 1))
  done

  return 1
}

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

require_command "node"
require_command "npm"
require_command "curl"

cd "${PROJECT_ROOT}"

echo "Starting Sports Command Center server..."
npm run start:proxy >/tmp/sports-command-center.log 2>&1 &
SERVER_PID=$!
trap cleanup EXIT INT TERM

if ! wait_for_server; then
  echo "Server did not become healthy in time."
  echo "Check logs: tail -n 100 /tmp/sports-command-center.log"
  exit 1
fi

echo "Dashboard is live at ${DASHBOARD_URL}"
echo "Settings page: http://localhost:3000/settings"

if [[ "${KIOSK_MODE}" == "true" ]]; then
  CHROMIUM_CMD="$(find_chromium_command)"

  if [[ -z "${CHROMIUM_CMD}" ]]; then
    echo "Chromium not found. Install with:"
    echo "  sudo apt update && sudo apt install -y chromium-browser"
    echo "Server is still running in the background."
    wait "${SERVER_PID}"
    exit 0
  fi

  if command -v unclutter >/dev/null 2>&1; then
    echo "Starting unclutter to hide mouse cursor..."
    unclutter -idle 0.5 -root >/dev/null 2>&1 &
  else
    echo "Tip: install unclutter to hide cursor automatically:"
    echo "  sudo apt update && sudo apt install -y unclutter"
  fi

  echo "Launching Chromium in kiosk mode..."
  "${CHROMIUM_CMD}" \
    --kiosk \
    --incognito \
    --noerrdialogs \
    --disable-session-crashed-bubble \
    --disable-infobars \
    "${DASHBOARD_URL}" >/dev/null 2>&1 &

  echo "Kiosk launched. Press Ctrl+C in this terminal to stop the server."
fi

wait "${SERVER_PID}"
