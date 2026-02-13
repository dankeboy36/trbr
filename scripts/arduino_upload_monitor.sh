#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARDUINO_CLI="${ARDUINO_CLI:-"$ROOT_DIR/.arduino-cli/arduino-cli"}"
SKETCH_PATH="${SKETCH_PATH:-"$ROOT_DIR/.tests/sketches/vars_demo"}"
FQBN="${FQBN:-"esp32:esp32:esp32c3"}"
BOARD_OPTIONS="${BOARD_OPTIONS:-}"
PORT="${PORT:-}"
BAUD="${BAUD:-115200}"
SKIP_MONITOR="${SKIP_MONITOR:-0}"
ENABLE_COREDUMP="${ENABLE_COREDUMP:-0}"
MONITOR_SECONDS="${MONITOR_SECONDS:-0}"
MAX_BYTES="${MAX_BYTES:-0}"
OUT_FILE="${OUT_FILE:-}"

CLI_CONFIG_DEFAULT="$ROOT_DIR/.test-resources/envs/cli/arduino-cli.yaml"
CLI_CONFIG="${CLI_CONFIG:-}"
if [[ -z "$CLI_CONFIG" && -f "$CLI_CONFIG_DEFAULT" ]]; then
  CLI_CONFIG="$CLI_CONFIG_DEFAULT"
fi

COMMON_DEBUG_FLAGS="${COMMON_DEBUG_FLAGS:-"-Og -g3 -fno-omit-frame-pointer -fno-optimize-sibling-calls"}"
COREDUMP_DEFINES="-D CONFIG_LOG_DEFAULT_LEVEL=3 \
-D CONFIG_ESP_COREDUMP_ENABLE=1 \
-D CONFIG_ESP_COREDUMP_DATA_FORMAT_ELF=1 \
-D CONFIG_ESP_COREDUMP_FLASH=1 \
-D CONFIG_ESP_COREDUMP_CHECKSUM_CRC32=1 \
-D CONFIG_ESP_COREDUMP_LOG_LVL=0 \
-D CONFIG_ESP_COREDUMP_USE_STACK_SIZE=1 \
-D CONFIG_ESP_COREDUMP_STACK_SIZE=1792 \
-D CONFIG_ESP_COREDUMP_MAX_TASKS_NUM=64 \
-D CONFIG_ESP_COREDUMP_CHECK_BOOT=1"

TIMEOUT_BIN="${TIMEOUT_BIN:-}"

# Dev note:
# This script expects a timeout binary on PATH when MONITOR_SECONDS != 0.
# On macOS, install it via Homebrew:
#   brew install coreutils
# This provides `gtimeout` (and `timeout` if gnubin is added to PATH).

usage() {
  cat <<'EOF'
Compile, upload, and optionally monitor/capture an Arduino sketch.

Usage:
  PORT=/dev/cu.usbmodemXXXX scripts/arduino_upload_monitor.sh [options]

Options:
  --sketch PATH              Sketch folder path
  --fqbn FQBN                Board fqbn
  --board-options VALUE      Board options (repeatable), e.g. CDCOnBoot=cdc
  --port PORT                Serial port
  --baud BAUD                Monitor baudrate (default: 115200)
  --build-property VALUE     Extra --build-property (repeatable)
  --seconds N                Capture timeout seconds (0 = unlimited)
  --max-bytes N              Max capture bytes (0 = unlimited)
  --out FILE                 Capture output file path (enables capture mode)
  --enable-coredump          Add ESP32 coredump build defines
  --skip-monitor             Compile + upload only
  --help                     Show this help

Environment:
  ARDUINO_CLI, CLI_CONFIG, SKETCH_PATH, FQBN, BOARD_OPTIONS, PORT, BAUD
  SKIP_MONITOR=1
  ENABLE_COREDUMP=1
  MONITOR_SECONDS, MAX_BYTES, OUT_FILE
EOF
}

EXTRA_BUILD_PROPERTIES=()
BOARD_OPTIONS_VALUES=()
if [[ -n "$BOARD_OPTIONS" ]]; then
  BOARD_OPTIONS_VALUES+=("$BOARD_OPTIONS")
fi
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sketch)
      SKETCH_PATH="$2"
      shift 2
      ;;
    --fqbn)
      FQBN="$2"
      shift 2
      ;;
    --board-options)
      BOARD_OPTIONS_VALUES+=("$2")
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --baud)
      BAUD="$2"
      shift 2
      ;;
    --build-property)
      EXTRA_BUILD_PROPERTIES+=("$2")
      shift 2
      ;;
    --seconds)
      MONITOR_SECONDS="$2"
      shift 2
      ;;
    --max-bytes)
      MAX_BYTES="$2"
      shift 2
      ;;
    --out)
      OUT_FILE="$2"
      shift 2
      ;;
    --enable-coredump)
      ENABLE_COREDUMP=1
      shift 1
      ;;
    --skip-monitor)
      SKIP_MONITOR=1
      shift 1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -x "$ARDUINO_CLI" ]]; then
  echo "Arduino CLI not found or not executable: $ARDUINO_CLI" >&2
  exit 1
fi

if [[ ! -d "$SKETCH_PATH" ]]; then
  echo "Sketch path not found: $SKETCH_PATH" >&2
  exit 1
fi

if [[ "$SKIP_MONITOR" != "1" && -z "$PORT" ]]; then
  echo "PORT is required unless --skip-monitor is used." >&2
  exit 1
fi

C_EXTRA_FLAGS="$COMMON_DEBUG_FLAGS"
CPP_EXTRA_FLAGS="$COMMON_DEBUG_FLAGS"
if [[ "$ENABLE_COREDUMP" == "1" ]]; then
  C_EXTRA_FLAGS="$C_EXTRA_FLAGS $COREDUMP_DEFINES"
  CPP_EXTRA_FLAGS="$CPP_EXTRA_FLAGS $COREDUMP_DEFINES"
fi

BUILD_PROPERTIES=(
  "compiler.c.extra_flags=$C_EXTRA_FLAGS"
  "compiler.cpp.extra_flags=$CPP_EXTRA_FLAGS"
  "compiler.optimization_flags=-Og -g3"
  "build.code_debug=1"
)
if [[ ${#EXTRA_BUILD_PROPERTIES[@]} -gt 0 ]]; then
  BUILD_PROPERTIES+=("${EXTRA_BUILD_PROPERTIES[@]}")
fi

CONFIG_ARGS=()
if [[ -n "$CLI_CONFIG" ]]; then
  CONFIG_ARGS=(--config-file "$CLI_CONFIG")
fi

COMPILE_ARGS=(
  compile
  "$SKETCH_PATH"
  --fqbn "$FQBN"
  --format json
  "${CONFIG_ARGS[@]}"
)
for board_option in "${BOARD_OPTIONS_VALUES[@]}"; do
  COMPILE_ARGS+=(--board-options "$board_option")
done
for prop in "${BUILD_PROPERTIES[@]}"; do
  COMPILE_ARGS+=(--build-property "$prop")
done

echo "Compiling $SKETCH_PATH for $FQBN..."
"$ARDUINO_CLI" "${COMPILE_ARGS[@]}"

if [[ -n "$PORT" ]]; then
  echo "Uploading to $PORT..."
  UPLOAD_ARGS=(
    upload
    --fqbn "$FQBN"
    --port "$PORT"
    "${CONFIG_ARGS[@]}"
  )
  for board_option in "${BOARD_OPTIONS_VALUES[@]}"; do
    UPLOAD_ARGS+=(--board-options "$board_option")
  done
  UPLOAD_ARGS+=("$SKETCH_PATH")
  "$ARDUINO_CLI" "${UPLOAD_ARGS[@]}"
fi

if [[ "$SKIP_MONITOR" == "1" ]]; then
  echo "Skipping monitor (SKIP_MONITOR=1)"
  exit 0
fi

MONITOR_ARGS=(
  "$ARDUINO_CLI"
  monitor
  "${CONFIG_ARGS[@]}"
  --fqbn "$FQBN"
  --port "$PORT"
  --config "baudrate=$BAUD"
)
for board_option in "${BOARD_OPTIONS_VALUES[@]}"; do
  MONITOR_ARGS+=(--board-options "$board_option")
done

if [[ -z "$OUT_FILE" ]]; then
  echo "Monitoring $PORT at $BAUD (interactive)..."
  "${MONITOR_ARGS[@]}"
  exit 0
fi

mkdir -p "$(dirname "$OUT_FILE")"

if [[ "$MONITOR_SECONDS" != "0" && -z "$TIMEOUT_BIN" ]]; then
  if command -v timeout >/dev/null 2>&1; then
    TIMEOUT_BIN="timeout"
  elif command -v gtimeout >/dev/null 2>&1; then
    TIMEOUT_BIN="gtimeout"
  else
    echo "No timeout tool found (timeout/gtimeout). On macOS run: brew install coreutils" >&2
    exit 1
  fi
fi

capture_filter() {
  if [[ "$MAX_BYTES" == "0" ]]; then
    cat
  else
    head -c "$MAX_BYTES"
  fi
}

echo "Monitoring $PORT at $BAUD."
echo "Capturing output to $OUT_FILE."
echo "Limits: seconds=$MONITOR_SECONDS bytes=$MAX_BYTES"

set +e
if [[ "$MONITOR_SECONDS" == "0" ]]; then
  "${MONITOR_ARGS[@]}" 2>&1 | capture_filter | tee "$OUT_FILE"
  monitor_status=${PIPESTATUS[0]}
else
  "$TIMEOUT_BIN" "${MONITOR_SECONDS}s" "${MONITOR_ARGS[@]}" 2>&1 | capture_filter | tee "$OUT_FILE"
  monitor_status=${PIPESTATUS[0]}
fi
set -e

if [[ "$monitor_status" -ne 0 && "$monitor_status" -ne 124 && "$monitor_status" -ne 141 ]]; then
  echo "Monitor exited unexpectedly with status $monitor_status." >&2
  exit "$monitor_status"
fi

captured_bytes="$(wc -c < "$OUT_FILE" | tr -d ' ')"
echo "Capture complete: $captured_bytes bytes written to $OUT_FILE"
