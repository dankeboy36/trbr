/**
 * Heuristically scan a task stack for return addresses, mimicking `esp-coredump` Python logic.
 * @param {Buffer} stackData - Raw stack memory bytes (as a Buffer).
 * @param {number} sp - Current stack pointer (start of valid stack).
 * @param {number} stackStart - Lowest virtual address of stack.
 * @param {number} stackEnd - Highest address (exclusive).
 * @param {function(number): boolean} isValidPC - Function to test if a 32-bit word is a valid PC.
 * @returns {number[]} - Array of guessed PC values (return addresses).
 */
export function analyzeStack(stackData, sp, stackStart, stackEnd, isValidPC) {
  const result = []
  const stackSize = stackEnd - stackStart
  if (stackSize <= 0 || sp < stackStart || sp >= stackEnd) return []

  // Translate SP to offset into buffer
  let offset = sp - stackStart
  offset = Math.max(0, Math.min(offset, stackData.length - 4))

  for (; offset + 4 <= stackData.length; offset += 4) {
    const candidate = stackData.readUInt32LE(offset)
    if (isValidPC(candidate)) {
      if (result.length === 0 || result[result.length - 1] !== candidate) {
        result.push(candidate)
      }
    }
  }

  return result
}

/**
 * Simple ESP32 flash-range PC check
 * @param {number} pc
 * @returns {boolean}
 */
export function defaultIsValidPC(pc) {
  return pc >= 0x40000000 && pc <= 0x50000000
}
