#!/usr/bin/env bash
set -euo pipefail

TRBR_BIN="./bin/trbr"
ARDUINO_CLI_CONFIG=".test-resources/envs/cli/arduino-cli.yaml"

echo "Checking trbr version..."
"$TRBR_BIN" --version

for BOARD_ID in "$@"; do
  ELF=".tests/coredumps/Dumper/${BOARD_ID}/firmware.elf"
  echo "Testing board: $BOARD_ID"

  for DUMP in esp-coredump-dump.raw esp_partition_read-dump.raw read_flash-dump.raw; do
    INPUT=".tests/coredumps/Dumper/${BOARD_ID}/${DUMP}"
    echo "Decoding $INPUT..."
    "$TRBR_BIN" decode \
      --elf-path "$ELF" \
      --fqbn "esp32:esp32:${BOARD_ID}" \
      --arduino-cli-config $ARDUINO_CLI_CONFIG \
      --input "$INPUT" \
      --coredump-mode
  done
done