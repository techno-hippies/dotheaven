/**
 * Build script: places sidecar runner script in src-tauri/binaries/
 * with the correct target-triple suffix.
 *
 * For dev: the sidecar is a shell script that invokes `bun run` on the source.
 * For production: would need native compilation (pkg or similar) due to
 * @xmtp/node-bindings containing native NAPI addons that can't be compiled
 * by `bun build --compile`.
 */

import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

const isWindows = process.platform === 'win32'
const ext = isWindows ? '.exe' : ''
const targetTriple = execSync('rustc --print host-tuple').toString().trim()
const binDir = join(__dirname, '..', 'frontend', 'src-tauri', 'binaries')
const outName = `xmtp-sidecar-${targetTriple}${ext}`
const outPath = join(binDir, outName)

if (!existsSync(binDir)) {
  mkdirSync(binDir, { recursive: true })
}

if (isWindows) {
  // Windows: batch script that runs bun
  const sidecarDir = join(__dirname).replace(/\\/g, '/')
  writeFileSync(
    outPath,
    `@echo off\r\nbun run "${sidecarDir}/src/index.ts" %*\r\n`
  )
} else {
  // Unix: shell script that runs bun
  const sidecarDir = __dirname
  writeFileSync(
    outPath,
    `#!/bin/sh\nexec bun run "${sidecarDir}/src/index.ts" "$@"\n`
  )
  chmodSync(outPath, 0o755)
}

console.log(`[build] Sidecar script placed at: binaries/${outName}`)
console.log(`[build] Target triple: ${targetTriple}`)
