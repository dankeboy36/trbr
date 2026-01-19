# TraceBreaker (`trbr`)

**TraceBreaker** is a simple tool for decoding and analyzing ESP backtraces, supporting ESP32 and ESP8266 platforms.

![trbr](/static/trbr.gif)

## Installation

To get started, download the latest binary for Windows, macOS, or Linux from the [GitHub release page](https://github.com/dankeboy36/trbr/releases/latest) and unzip it to your preferred location.

> **ⓘ** **TraceBreaker** includes the **[Arduino CLI](https://github.com/arduino/arduino-cli)** as a binary.

## Usage

### Decode Using GDB

Decode stack traces from the specified ELF file directly using GDB:

```sh
trbr decode \
 --elf-path /path/to/elf \
 --tool-path /path/to/gdb
```

When using `-t, --tool-path`, you can specify `-A, --target-arch`. Otherwise, it defaults to `xtensa`. Valid options include:

- `xtensa`, `esp32c2`, `esp32c3`, `esp32c6`, `esp32h2`, `esp32h4`, `esp32p4`.

### Decode Using Arduino CLI

Decode stack traces from the specified ELF file directly using the Arduino CLI and the [installed core](https://docs.arduino.cc/learn/starting-guide/cores/):

```sh
trbr decode \
 --elf-path /path/to/elf \
 --fqbn esp32:esp32:esp32da
```

When using `-b, --fqbn`, you can also include:

- `--arduino-cli-config` Path to the Arduino CLI configuration file (valid only with FQBN)
- `--additional-urls <urls>` Comma-separated list of additional URLs for Arduino Boards Manager (valid only with FQBN)

### Decode Coredump Files

TraceBreaker supports decoding coredump files using the `-c, --coredump-mode` option. When this option is enabled, you should provide the coredump file path using the `-i, --input` option.

This mode allows you to decode coredump data instead of standard backtrace input.

Example usage:

```sh
trbr decode \
 --elf-path /path/to/elf \
 --tool-path /path/to/gdb \
 --input /path/to/coredump/file \
 --coredump-mode
```

### Common Options

- `-i, --input <path>`: Path to the file to read the trace input. If omitted, the tool reads from stdin interactively.
- `-d, --debug`: Enable debug output for troubleshooting (default: false)
- `-C, --no-color`: Disable color output in the terminal (env: NO_COLOR)
- `-h, --help`: Display help for the command

### Security Notice

Please be aware that the builds for Windows are [not signed](https://github.com/dankeboy36/trbr/issues/7), and those for macOS are [not notarized](https://github.com/dankeboy36/trbr/issues/8).

#### macOS

> ⚠ Please note that this approach is risky as you are lowering the security on your system, therefore we strongly discourage you from following it.

When you start `trbr`, a warning will appear:

> “trbr” Not Opened

> Apple could not verify “trbr” is free of malware that may harm your Mac or compromise your privacy.

Follow the instructions from the "If you want to open an app that hasn't been notarized or is from an unidentified developer" section of this page to bypass the security restriction: https://support.apple.com/en-us/HT202491.

### Disclaimer

This project uses the Arduino CLI as a binary. When you download and use **TraceBreaker**, you will be using the Arduino CLI for all GDB tool path resolutions based on the Fully Qualified Board Name (FQBN). I rewrote the [ESP Exception Decoder extension](https://github.com/dankeboy36/esp-exception-decoder) logic for the Arduino IDE 2.x, where the Arduino CLI is always available. I appreciate the Arduino CLI project and the people working on it, so I decided to reuse as much of their work as possible. It’s fantastic.

The first time `trbr` requires the Arduino CLI, it will unpack the binary to a temporary location. Specifically, it will unpack to `$TMPDIR/.trbr/bin/$ARDUINO_TOOL/$VERSION/$ARDUINO_TOOL`, where `$ARDUINO_TOOL` is `arduino-cli` and `$VERSION` is the version that `trbr` uses. For example:

```sh
% tree .trbr
.trbr
└── bin
    └── arduino-cli
        └── 1.2.0
            └── arduino-cli
```

## API

![NPM Version](https://img.shields.io/npm/v/trbr)

`trbr` provides an API to programmatically decode ESP backtraces, coredump, and resolve tool paths.

#### ESM:

```js
import { decode, findToolPath, resolveToolPath } from 'trbr'
```

#### CommonJS:

```js
const { decode, findToolPath, resolveToolPath } = require('trbr')
```

### Methods

#### `decode`

Decodes the trace content from an ELF file using GDB.

```js
const input = 'your trace content'

const decodeResult = await decode(
  {
    elfPath: '/path/to/elf',
    toolPath: '/path/to/gdb',
    targetArch: 'xtensa', // optional
  },
  input
)
```

Decodes an ESP coredump (in [ELF format](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/kconfig-reference.html#config-esp-coredump-data-format))

```js
const input = '/path/to/coredump'

const decodeResult = await decode(
  {
    elfPath: '/path/to/elf',
    toolPath: '/path/to/gdb',
    targetArch: 'xtensa', // optional
  },
  {
    inputPath: input,
    coredumpMode: true,
  }
)
```

---

#### `findToolPath`

Finds the GDB tool path in the installed core using the Arduino CLI.

```js
import { FQBN } from 'fqbn'

const toolPath = await findToolPath({
  arduinoCliPath: '/path/to/arduino-cli',
  fqbn: new FQBN('esp32:esp32:esp32da'),
  arduinoCliConfigPath: '/path/to/arduino-cli.yaml', // optional
  additionalUrls:
    'https://example.com/package_example_index.json,https://other.org/package_other_index.json', // optional
})
```

> **ⓘ** The Arduino CLI runs the [`board details`](https://arduino.github.io/arduino-cli/latest/commands/arduino-cli_board_details/) command to retrieve tool paths.

---

#### `resolveToolPath`

Resolves the tool path from the `build_properties` of the [`BoardDetailsResponse`](https://arduino.github.io/arduino-cli/latest/rpc/commands/#boarddetailsresponse).

```js
import { FQBN } from 'fqbn'

const buildProperties = {
  'build.tarch': 'riscv32',
  'build.target': 'esp',
  'tools.riscv32-esp-elf-gdb.path': '/path/to/gdb',
  // other properties
}

const toolPath = await resolveToolPath({
  fqbn: new FQBN('esp32:esp32:esp32h2'),
  buildProperties,
})
```

---

## License

`trbr` is licensed under the **GNU General Public License v3.0 (GPLv3)**. For more details, check the [LICENSE](LICENSE).

`trbr` includes the Arduino CLI as a binary. Refer to the official [Arduino CLI licensing disclosure](https://github.com/arduino/arduino-cli/blob/a39f9fdc0b416e2b5ccf13438bb001cc05e68db4/README.md?plain=1#L46-L51).
