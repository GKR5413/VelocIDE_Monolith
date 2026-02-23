#!/bin/sh
set -eu

node /app/server/index.js &
api_pid=$!

cleanup() {
  kill "$api_pid" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

nginx -g "daemon off;"
