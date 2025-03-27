// @ts-check

declare type BaseDecodeParams = {
  trace?: string
  verbose?: boolean
  noColor?: boolean
}

declare type RiscvDecodeTarget =
  | 'esp32c2'
  | 'esp32c3'
  | 'esp32c6'
  | 'esp32h2'
  | 'esp32h4'

declare type DecodeTarget = 'xtensa' | RiscvDecodeTarget

export declare type DecodeParams<T = DecodeTarget> = Readonly<
  BaseDecodeParams & {
    toolPath: string
    elfPath: string
    targetArch: T
  }
>

/**
 * `0x12345678` or `this::loop`
 */
export declare type Address = string

export declare type GDBLine = {
  address: Address
  /**
   * `36` or `??`
   */
  lineNumber: string
}

export declare type ParsedGDBLine = GDBLine & {
  file: string
  /**
   * `loop()` or `??`
   */
  method: string
}

export declare type Location = Address | GDBLine | ParsedGDBLine

export declare type AllocLocation = [location: Location, size: number]

export declare type Exception = [message: string, code: number]

export declare type DecodeResult = Readonly<{
  exception?: Exception | undefined
  registerLocations: Readonly<Record<string, Location>>
  stacktraceLines: (GDBLine | ParsedGDBLine)[]
  allocLocation?: AllocLocation | undefined
}>

export type Debug = (formatter: any, ...args: any[]) => void

export interface DecodeOptions {
  signal?: AbortSignal
  debug?: Debug
}

export declare function decode(params: DecodeParams): Promise<DecodeResult>
