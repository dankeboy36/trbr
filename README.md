# TraceBreaker (`trbr`)

**TraceBreaker** is a simple tool for decoding and analyzing ESP backtraces.

![trbr](/static/trbr.gif)

## Installation

To get started, download the latest binary from the [GitHub release page](https://github.com/dankeboy36/trbr/releases/latest) and unzip it to your preferred location.

> **ⓘ** **TraceBreaker** includes the **[Arduino CLI](https://github.com/arduino/arduino-cli)** as a binary.

## Usage

### Decode Using GDB

Decode stack traces from the specified ELF file directly using GDB:

```sh
trbr decode \
 --elf-path /path/to/elf \
 --tool-path /path/to/gdb \
 --target-arch xtensa
```

When using `-t, --tool-path`, you must specify `-A, --target-arch`. Valid options include:

- `xtensa`, `esp32c2`, `esp32c3`, `esp32c6`, `esp32h2`, `esp32h4`.

### Decode Using Arduino CLI

Decode stack traces from the specified ELF file directly using the Arduino CLI and the [installed core](https://docs.arduino.cc/learn/starting-guide/cores/):

```sh
trbr decode \
 --elf-path /path/to/elf \
 --fqbn esp32:esp32:esp32da
```

When using `-b, --fqbn`, you can also include:

- `-c, --arduino-cli-config` Path to the Arduino CLI configuration file (valid only with FQBN)
- `--additional-urls <urls>` Comma-separated list of additional URLs for Arduino Boards Manager (valid only with FQBN)

### Common Options

- `-i, --input <path>`: Path to the file to read the trace input instead of stdin (if absent, the CLI runs in interactive mode).
- `-d, --debug`: Enable debug output for troubleshooting (default: false)
- `-C, --no-color`: Disable color output in the terminal (env: NO_COLOR)
- `-h, --help`: Display help for the command

### Security Notice

Please be aware that the builds for Windows are not signed, and those for macOS are not notarized.

⚠ Please note that this approach is risky as you are lowering the security on your system, therefore we strongly discourage you from following it.

When you start `trbr`, a warning will appear:

![trbr Not Opened](/static/trbr-not-opened.png)
Follow the instructions from the "If you want to open an app that hasn't been notarized or is from an unidentified developer" section of this page to bypass the security restriction: https://support.apple.com/en-us/HT202491.

### Disclaimer

This project uses the Arduino CLI as a binary. When you download and use **TraceBreaker**, you will be using the **Arduino CLI** for all GDB tool path resolutions based on the Fully Qualified Board Name (FQBN). I rewrote the [ESP Exception Decoder extension](https://github.com/dankeboy36/esp-exception-decoder) logic for the Arduino IDE 2.x, where the Arduino CLI is always available. I appreciate the Arduino CLI project and the people working on it, so I decided to reuse as much of their work as possible. It’s fantastic.

The first time `trbr` requires the **Arduino CLI**, it will unpack the binary to a temporary location. Specifically, it will unpack to `$TMPDIR/.trbr/bin/$ARDUINO_TOOL/$VERSION/$ARDUINO_TOOL`, where `$ARDUINO_TOOL` is `arduino-cli` and `$VERSION` is the version that `trbr` uses. For example:

```sh
% tree .trbr
.trbr
└── bin
    └── arduino-cli
        └── 1.2.0
            └── arduino-cli
```

## License

`trbr` is licensed under the **GNU General Public License v3.0 (GPLv3)**. For more details, check the [LICENSE](LICENSE).

`trbr` includes the **Arduino CLI** as a binary. Refer to the official [Arduino CLI licensing disclosure](https://github.com/arduino/arduino-cli/blob/a39f9fdc0b416e2b5ccf13438bb001cc05e68db4/README.md?plain=1#L46-L51).
