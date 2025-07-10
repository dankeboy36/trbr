// @ts-check

export async function readStdinString() {
  if (!process.stdin.isTTY) {
    let stdinInput = ''
    for await (const chunk of process.stdin) {
      stdinInput += chunk
    }
    return stdinInput.trim()
  }
  return undefined
}
