// @ts-check

import { arches } from '../lib/index.js'

export const texts = {
  errors: {
    elfPathRequired: '--elf-path is required',
    toolPathOrFqbnRequired: 'Either --tool-path or --fqbn is required',
    toolPathAndFqbnExclusive: '--tool-path and --fqbn cannot be used together',
    targetArchRequired: '--target-arch must be set when using --tool-path',
    targetArchInvalid: `--target-arch must be one of: ${arches.join(', ')}`,
    targetArchAndFqbnExclusive:
      '--target-arch is only valid when using --tool-path, not --fqbn',
    arduinoCliConfigRequiresFqbn:
      '--arduino-cli-config requires --fqbn to be set',
    additionalUrlsRequiresFqbn: '--additional-urls requires --fqbn to be set',
  },
}
