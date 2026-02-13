#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export ARDUINO_CLI="${ARDUINO_CLI:-"./.arduino-cli/arduino-cli"}"
export SKETCH_PATH="${SKETCH_PATH:-"$ROOT_DIR/.tests/sketches/capturer_crash_loop"}"
export FQBN="${FQBN:-"esp32:esp32:esp32c3"}"
export BOARD_OPTIONS="${BOARD_OPTIONS:-"CDCOnBoot=cdc"}"
export BAUD="${BAUD:-115200}"
export SKIP_MONITOR="${SKIP_MONITOR:-0}"

exec "$ROOT_DIR/scripts/arduino_upload_monitor.sh" "$@"
