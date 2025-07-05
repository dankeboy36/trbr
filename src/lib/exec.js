// @ts-check

import { execFile } from 'node:child_process'

/**
 * @param {string} file
 * @param {string[]} [args=[]]
 * @param {import('node:child_process').ExecFileOptions} [options={}]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export async function exec(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error)
      } else {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        })
      }
    })
  })
}
