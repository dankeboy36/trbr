// @ts-check

import { Command, Option } from 'commander'
import debug from 'debug'

import packageJson from '../../package.json'
import { arches } from '../lib/decode/decode.js'
import { app } from './app.js'
import { parseAppArgs } from './appArgs.js'

const { name, version } = packageJson

// Replace with groups (https://github.com/tj/commander.js/pull/2328)
const groupSeparator = '\r\n\r\n'

/** @param {string[]} args */
export function parse(args) {
  const program = new Command()
  program
    .name(name)
    .description(
      'TraceBreaker is a simple tool for decoding and analyzing ESP backtraces'
    )
    .helpOption('-h, --help', 'Display help for command')
    .version(version, '-v, --version', 'Display version number')

  program
    .command('decode')
    .alias('d')
    .addOption(
      new Option(
        '-e, --elf-path <path>',
        'Path to the ELF file used for decoding stack traces (mandatory)'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '-i, --input <path>',
        'Path to the file to read the trace input instead of stdin (if absent the CLI runs in interactive mode)' +
          groupSeparator
      )
    )
    .addOption(
      new Option(
        '-t, --tool-path <path>',
        'Path to the GDB tool on the filesystem'
      )
    )
    .addOption(
      new Option(
        '-A, --target-arch [arch]',
        'Select the target architecture for decoding stack traces (valid only with GDB tool path)'
      ).choices(arches)
    )
    .addOption(
      new Option(
        '-b, --fqbn <fqbn>',
        'Fully Qualified Board Name (FQBN) to identify the board'
      )
    )
    .addOption(
      new Option(
        '--arduino-cli-config <path>',
        'Path to the Arduino CLI configuration file (valid only with FQBN)'
      )
    )
    .addOption(
      new Option(
        '--additional-urls <urls>',
        'Comma-separated list of additional URLs for Arduino Boards Manager (valid only with FQBN)' +
          groupSeparator
      )
    )
    .addOption(
      new Option(
        '-c, --coredump-mode',
        'Enable coredump decoding mode (input must be a coredump file)'
      )
    )
    .addOption(
      new Option(
        '-d, --debug',
        'Enable debug output for troubleshooting'
      ).default(false)
    )
    .addOption(
      new Option('-C, --no-color', 'Disable color output in the terminal').env(
        'NO_COLOR'
      )
    )
    .description('Decode stack traces from the specified ELF file')
    .action(async (options) => {
      if (options.debug === true) {
        debug.enable('trbr:*')
      }
      try {
        const appArgs = await parseAppArgs(options)
        app({ ...appArgs, version })
      } catch (err) {
        return program.error(`Error: ${err.message}`)
      }
    })

  program.parse(args)
}
