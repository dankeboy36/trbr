const arduinoTools = [
  'arduino-cli',
  'arduino-language-server',
  'arduino-fwuploader',
] as const
const clangTools = ['clangd', 'clang-format'] as const

export const tools = [...arduinoTools, ...clangTools]

export declare type ArduinoTool = (typeof arduinoTools)[number]
export declare type ClangTool = (typeof clangTools)[number]
export declare type Tool = ArduinoTool | ClangTool

export interface OnProgressParams {
  /** A percentage between 0 and 100 */
  current: number
}

export declare interface GetToolParams {
  tool: Tool
  version: string
  destinationFolderPath: string
  platform?: NodeJS.Platform
  arch?: NodeJS.Architecture
  force?: boolean
  onProgress?: (params: Readonly<OnProgressParams>) => void
  signal?: AbortSignal
}

export declare interface GetToolResult {
  toolPath: string
}

export declare function getTool(
  params: Readonly<GetToolParams>
): Promise<Readonly<GetToolResult>>
