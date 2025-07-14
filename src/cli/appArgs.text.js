// @ts-check

import { arches } from '../lib/index.js'

export const texts = {
  errors: {
    elfPathRequired: '--elf-path is required',
    toolPathOrFqbnRequired: 'Either --tool-path or --fqbn is required',
    toolPathAndFqbnExclusive: '--tool-path and --fqbn cannot be used together',
    targetArchInvalid: `--target-arch must be one of: ${arches.join(', ')}`,
    fqbnInvalid: '--fqbn must be a valid Arduino Fully Qualified Board Name',
    targetArchAndFqbnExclusive:
      '--target-arch is only valid when using --tool-path, not --fqbn',
    arduinoCliConfigRequiresFqbn:
      '--arduino-cli-config requires --fqbn to be set',
    additionalUrlsRequiresFqbn: '--additional-urls requires --fqbn to be set',
    coredumpModeRequiresInput: '--coredump-mode requires --input to be set',
  },
}
