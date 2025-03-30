declare type RiscvDecodeTarget =
  | 'esp32c2'
  | 'esp32c3'
  | 'esp32c6'
  | 'esp32h2'
  | 'esp32h4'

declare type DecodeTarget = typeof defaultTargetArch | RiscvDecodeTarget

export declare type DecodeParams = {
  toolPath: string
  elfPath: string
  targetArch?: DecodeTarget
}

/** `0x12345678` or `this::loop` */
export declare type Address = string

export declare type GDBLine = {
  address: Address
  /** `36` or `??` */
  lineNumber: string
}

export declare type ParsedGDBLine = GDBLine & {
  file: string
  /** `loop()` or `??` */
  method: string
}

export declare type Location = Address | GDBLine | ParsedGDBLine

export declare type AllocLocation = [location: Location, size: number]

export declare type Exception = [message: string, code: number]

export declare type DecodeResult = {
  exception?: Exception | undefined
  registerLocations: Record<string, Location>
  stacktraceLines: (GDBLine | ParsedGDBLine)[]
  allocLocation?: AllocLocation | undefined
}

export type Debug = (formatter: any, ...args: any[]) => void

export interface DecodeOptions {
  signal?: AbortSignal
  debug?: Debug
}

export declare class AbortError extends Error {
  constructor()
}

export declare const arches: (
  | typeof defaultTargetArch
  | 'esp32c2'
  | 'esp32c3'
  | 'esp32c6'
  | 'esp32h2'
  | 'esp32h4'
)[]

export declare const defaultTargetArch = 'xtensa'

export declare function decode(
  params: DecodeParams,
  input: string,
  options?: DecodeOptions
): Promise<DecodeResult>

export declare function isDecodeTarget(arg: unknown): arg is DecodeTarget

export declare function isRiscvFQBN(
  fqbn: import('fqbn').FQBN
): fqbn is import('fqbn').FQBN & { boardId: RiscvDecodeTarget }

export declare type FindTooPathParams = {
  toolPathOrFqbn: string
  arduinoCliConfig?: string
  additionalUrls?: string
}

export declare function findToolPath(params: FindTooPathParams): Promise<string>

export declare function resolveToolPath(
  fqbn: import('fqbn').FQBN,
  buildProperties: Record<string, string>
): Promise<string>

export function isGDBLine(arg: unknown): arg is GDBLine

export function isParsedGDBLine(arg: unknown): arg is ParsedGDBLine
