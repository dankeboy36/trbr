# TraceBreaker (trbr)

**TraceBreaker** is a simple tool to decode and analyze ESP backtraces.

## Installation

To get started, download the latest binary from the [GitHub release page](https://github.com/dankeboy36/trbr/releases/latest). It comes with the [Arduino CLI](https://github.com/arduino/arduino-cli) included.

## Usage

### Decode ESP Stack Traces

Run the following command to decode a stack trace:

```sh
trbr decode -e <path-to-elf> -i <trace-file>
```

### Important Notes

- `-e, --elf-path` **(required)**: Path to your ELF file.
- You need to specify one of the following:
  - `-t, --tool-path` (with `-A, --target-arch`), **or**
  - `-b, --fqbn` (fully qualified board name). These options can't be used together.
- When using `-b, --fqbn`, you can also include:
  - `-c, --arduino-cli-config` (path to Arduino CLI config)
  - `--additional-urls <urls>` (for additional board URLs).
- When using `-t, --tool-path`, `-A, --target-arch` must be specified. Valid options include:
  - `xtensa`, `esp32c2`, `esp32c3`, `esp32c6`, `esp32h2`, `esp32h4`.

#### Options:

- `-i, --input <path>`: Path to the trace input file (defaults to interactive mode if not specified).
- `-d, --debug`: Enable debug mode.
- `-C, --no-color`: Disable colored output.
- `-h, --help`: Show help.

### Example:

To decode a crash log with your ELF file:

```bash
trbr decode -e firmware.elf -i crash.log
```

## License

`trbr` is licensed under the **GNU General Public License v3.0 (GPLv3)**. For more details, check the [LICENSE](LICENSE).

This project includes the **Arduino CLI binary**.
