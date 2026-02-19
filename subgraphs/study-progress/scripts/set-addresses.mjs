#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFESTS = [
  path.join(ROOT, 'subgraph.tempo.yaml'),
  path.join(ROOT, 'subgraph.tempo.local.yaml'),
]

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      out[key] = 'true'
      continue
    }
    out[key] = next
    i++
  }
  return out
}

function asAddress(value, name) {
  if (!value) {
    throw new Error(`Missing ${name}. Provide --${name} or env var.`)
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`Invalid ${name}: ${value}`)
  }
  return value
}

function asStartBlock(value, name) {
  if (value == null) return '0'
  if (!/^\d+$/.test(String(value))) {
    throw new Error(`Invalid ${name}: ${value}`)
  }
  return String(value)
}

function patchSection(content, sectionName, address, startBlock) {
  const marker = `name: ${sectionName}`
  const start = content.indexOf(marker)
  if (start === -1) {
    throw new Error(`Could not find section "${sectionName}"`)
  }

  const nextSection = content.indexOf('\n  - kind: ethereum', start + marker.length)
  const end = nextSection === -1 ? content.length : nextSection
  const section = content.slice(start, end)

  const addressPattern = /(address:\s*)\"0x[a-fA-F0-9]{40}\"/
  const startBlockPattern = /(startBlock:\s*)\d+/

  if (!addressPattern.test(section) || !startBlockPattern.test(section)) {
    throw new Error(`Could not locate address/startBlock in section "${sectionName}"`)
  }

  let patched = section
  patched = patched.replace(addressPattern, `$1\"${address}\"`)
  patched = patched.replace(startBlockPattern, `$1${startBlock}`)

  return content.slice(0, start) + patched + content.slice(end)
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  const registry =
    args.registry ||
    process.env.TEMPO_STUDY_SET_REGISTRY ||
    process.env.STUDY_SET_REGISTRY
  const attempts =
    args.attempts ||
    process.env.TEMPO_STUDY_ATTEMPTS ||
    process.env.STUDY_ATTEMPTS

  const registryStart = args['registry-start'] ?? process.env.STUDY_SET_REGISTRY_START_BLOCK
  const attemptsStart = args['attempts-start'] ?? process.env.STUDY_ATTEMPTS_START_BLOCK

  const registryAddress = asAddress(registry, 'registry')
  const attemptsAddress = asAddress(attempts, 'attempts')
  const registryStartBlock = asStartBlock(registryStart, 'registry-start')
  const attemptsStartBlock = asStartBlock(attemptsStart, 'attempts-start')

  for (const manifestPath of MANIFESTS) {
    const original = fs.readFileSync(manifestPath, 'utf8')
    let updated = patchSection(original, 'StudyAttemptsV1', attemptsAddress, attemptsStartBlock)
    updated = patchSection(updated, 'StudySetRegistryV1', registryAddress, registryStartBlock)
    fs.writeFileSync(manifestPath, updated, 'utf8')
    console.log(`updated ${path.relative(ROOT, manifestPath)}`)
  }

  console.log('done')
  console.log(`StudyAttemptsV1: ${attemptsAddress} @ ${attemptsStartBlock}`)
  console.log(`StudySetRegistryV1: ${registryAddress} @ ${registryStartBlock}`)
}

main()
