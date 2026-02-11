#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

type LitEnv = 'naga-dev' | 'naga-test'

function parseTargetEnv(rawArg: string | undefined): LitEnv | null {
  if (!rawArg) return null
  const value = rawArg.trim().toLowerCase()
  if (value === 'naga-dev' || value === 'dev') return 'naga-dev'
  if (value === 'naga-test' || value === 'test') return 'naga-test'
  return null
}

function getEnvValue(contents: string, key: string): string | null {
  const regex = new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`, 'm')
  const match = contents.match(regex)
  if (!match) return null
  return match[1]
}

function upsertEnvKey(filePath: string, key: string, value: string): { previous: string | null } {
  const exists = existsSync(filePath)
  const original = exists ? readFileSync(filePath, 'utf8') : ''
  const previous = getEnvValue(original, key)
  const lines = exists ? original.split(/\r?\n/) : []
  const keyRegex = new RegExp(`^\\s*${key}\\s*=`)

  let found = false
  const nextLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trimStart()
    const isComment = trimmed.startsWith('#')
    const isKey = !isComment && keyRegex.test(line)

    if (!isKey) {
      nextLines.push(line)
      continue
    }

    if (!found) {
      nextLines.push(`${key}=${value}`)
      found = true
    }
    // Skip duplicate definitions
  }

  if (!found) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
      nextLines.push('')
    }
    nextLines.push(`${key}=${value}`)
  }

  writeFileSync(filePath, `${nextLines.join('\n').replace(/\n+$/g, '')}\n`, 'utf8')

  return { previous }
}

function main() {
  const target = parseTargetEnv(process.argv[2])

  if (!target) {
    console.error('Usage: bun scripts/switch-lit-env.ts <naga-dev|naga-test|dev|test>')
    process.exit(1)
  }

  const root = process.cwd()
  const frontendEnvPath = resolve(root, 'apps/frontend/.env')
  const litActionsEnvPath = resolve(root, 'lit-actions/.env')

  const frontendResult = upsertEnvKey(frontendEnvPath, 'VITE_LIT_NETWORK', target)
  const litActionsResult = upsertEnvKey(litActionsEnvPath, 'LIT_NETWORK', target)

  console.log(`Switched Lit environment to ${target}`)
  console.log(
    `- apps/frontend/.env: VITE_LIT_NETWORK ${frontendResult.previous ?? '(unset)'} -> ${target}`
  )
  console.log(
    `- lit-actions/.env: LIT_NETWORK ${litActionsResult.previous ?? '(unset)'} -> ${target}`
  )
  console.log('Next: restart frontend dev server and rerun Lit action tests.')
}

main()
