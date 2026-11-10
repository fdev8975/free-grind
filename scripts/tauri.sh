#!/usr/bin/env sh
set -eu

if [ -d "$HOME/.cargo/bin" ]; then
  PATH="$HOME/.cargo/bin:$PATH"
fi

if [ -d "/opt/homebrew/bin" ]; then
  PATH="/opt/homebrew/bin:$PATH"
fi

if [ -d "/usr/local/bin" ]; then
  PATH="/usr/local/bin:$PATH"
fi

export PATH

if ! command -v cargo >/dev/null 2>&1; then
  echo "Error: cargo not found in PATH. Install Rust from https://rustup.rs and reopen your shell."
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun not found in PATH. Install Bun from https://bun.sh and reopen your shell."
  exit 1
fi

# Free Grind server, fixed at build time (no defaults; unset = no Free Grind):
#   FG_API_URL   REST/WebSocket   (Rust, grindr-patched/src/server.rs)
#   FG_MEDIA_URL media host       (Rust + HTTP scope below)
#   FG_RTC_URL   LiveKit host     (CSP below)
#   FG_FCM_PROJECT_ID / FG_FCM_APP_ID / FG_FCM_API_KEY / FG_FCM_SENDER_ID
#                Firebase client config for Free Grind push (Rust, api/server.rs)
#   FG_CA_CERT   extra root CA, test builds only (server/LOCAL-TLS.md)
TAURI_CONFIG="$(bun scripts/free-grind-config.mjs)"
export TAURI_CONFIG

exec bunx tauri "$@"
