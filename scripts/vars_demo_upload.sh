#!/usr/bin/env sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARDUINO_CLI="${ARDUINO_CLI:-"$ROOT_DIR/.arduino-cli/arduino-cli"}"
SKETCH_PATH="${SKETCH_PATH:-"$ROOT_DIR/.tests/sketches/vars_demo"}"
FQBN="${FQBN:-"esp32:esp32:esp32c3"}"
PORT="${PORT:-"/dev/cu.usbmodem1101"}"
BAUD="${BAUD:-115200}"
ENABLE_COREDUMP="${ENABLE_COREDUMP:-0}"
SKIP_MONITOR="${SKIP_MONITOR:-0}"

CLI_CONFIG_DEFAULT="$ROOT_DIR/.test-resources/envs/cli/arduino-cli.yaml"
CLI_CONFIG="${CLI_CONFIG:-}"
if [[ -z "$CLI_CONFIG" && -f "$CLI_CONFIG_DEFAULT" ]]; then
  CLI_CONFIG="$CLI_CONFIG_DEFAULT"
fi

usage() {
  cat <<'EOF'
Usage: scripts/vars_demo_upload.sh [--sketch PATH] [--fqbn FQBN] [--port PORT] [--baud BAUD]

Defaults:
  SKETCH_PATH=.tests/sketches/vars_demo
  FQBN=esp32:esp32:esp32c3
  PORT=/dev/cu.usbmodem1101
  BAUD=115200

Environment overrides:
  ARDUINO_CLI, SKETCH_PATH, FQBN, PORT, BAUD
  ENABLE_COREDUMP=1  (adds coredump defines from ESP32-WROOM-COREDUMP_GUIDE.md)
  SKIP_MONITOR=1     (skip serial monitor)
  CLI_CONFIG=/path/to/arduino-cli.yaml
EOF
}

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
    --port)
      PORT="$2"
      shift 2
      ;;
    --baud)
      BAUD="$2"
      shift 2
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

COMMON_DEBUG_FLAGS="-Og -g3 -fno-omit-frame-pointer -fno-optimize-sibling-calls"
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
for prop in "${BUILD_PROPERTIES[@]}"; do
  COMPILE_ARGS+=(--build-property "$prop")
done

echo "Compiling $SKETCH_PATH for $FQBN..."
"$ARDUINO_CLI" "${COMPILE_ARGS[@]}"

echo "Uploading to $PORT..."
"$ARDUINO_CLI" upload --fqbn "$FQBN" --port "$PORT" "${CONFIG_ARGS[@]}" "$SKETCH_PATH"

if [[ "$SKIP_MONITOR" == "1" ]]; then
  echo "Skipping monitor (SKIP_MONITOR=1)"
  exit 0
fi

echo "Monitoring $PORT at $BAUD..."
"$ARDUINO_CLI" monitor "${CONFIG_ARGS[@]}" --port "$PORT" --config "baudrate=$BAUD"
