# trace-breaker

Sniffing out and breaking down ESP backtraces

## Installation

To install the `trbr` CLI globally:

```bash
npm install -g trace-breaker
```

## Usage

### CLI

You can use `trbr` to download Arduino tools with the following command:

```bash
gat get <tool> <version> [options]
```

#### Arguments

- `<tool>`: The tool you want to download. Can be one of: `arduino-cli`, `arduino-language-server`, `arduino-fwuploader`, `clangd`, `clang-format`.
- `<version>`: The version of the tool you want to download.

#### Options

- `-d, --destination-folder-path <path>`: Destination folder path (default: current working directory).
- `-p, --platform <platform>`: Platform (default: current platform).
- `-a, --arch <arch>`: Architecture (default: current architecture).
- `-f, --force`: Force download to overwrite existing files (default: false).
- `--verbose`: Enables verbose output (default: false).
- `--silent`: Disables the progress bar (default: false).

#### Examples

To download the Arduino CLI version `1.1.1` to the current working directory:

```bash
gat get arduino-cli 1.1.1
```

To download `clangd` for the Arduino language server with verbose output:

```bash
gat get clangd 12.0.0 --verbose
```

To download the Arduino CLI version `1.1.1` to a destination folder:

```bash
gat get arduino-cli 1.1.1 --destination-folder-path /path/to/my/folder
```

### API

```js
const { getTool } = require('get-arduino-tools')

getTool({
  tool: 'arduino-cli',
  version: '1.1.1',
  destinationFolderPath: 'path/to/the/dir',
}).then((result) => console.log(result), console.error)
// { toolPath: 'path/to/the/dir/arduino-cli' }
```

### Proxy Support

Use the `HTTP_PROXY` and the `HTTPS_PROXY` environment variables to configure the HTTP proxy addresses.

## Development Setup

To set up the development environment, follow these steps:

1. Clone the repository:

   ```bash
   git clone https://github.com/dankeboy36/get-arduino-tools.git
   cd get-arduino-tools
   ```

2. Install the dependencies:

   ```bash
   npm install
   ```

3. To run tests:

   ```bash
   npm test
   ```

4. Build the CLI

   ```bash
   npm run build:cli
   ```

5. Run the CLI tool locally:

   ```bash
   node bin/cli.js get <tool> <version> [options]
   ```

6. To run the integration tests:

   ```bash
   npm run test:slow
   ```

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
