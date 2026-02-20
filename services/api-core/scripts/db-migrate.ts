import { readdirSync } from 'node:fs'
import { join } from 'node:path'

type ExecOptions = {
  dbName: string
  remote: boolean
  args?: string[]
}

function runWranglerJson(commandOrFile: { command?: string; file?: string }, opts: ExecOptions): unknown {
  const args = ['d1', 'execute', opts.dbName, opts.remote ? '--remote' : '--local', '--json']
  if (commandOrFile.command) {
    args.push('--command', commandOrFile.command)
  }
  if (commandOrFile.file) {
    args.push('--file', commandOrFile.file)
  }
  if (opts.args?.length) {
    args.push(...opts.args)
  }

  const proc = Bun.spawnSync([process.execPath, 'x', 'wrangler', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  })
  if (proc.exitCode !== 0) {
    const stderr = Buffer.from(proc.stderr).toString('utf8')
    const stdout = Buffer.from(proc.stdout).toString('utf8')
    throw new Error(`wrangler failed (exit=${proc.exitCode}): ${stderr.trim() || stdout.trim()}`)
  }

  const stdout = Buffer.from(proc.stdout).toString('utf8').trim()
  try {
    return stdout ? JSON.parse(stdout) : []
  } catch {
    throw new Error(`wrangler returned non-JSON output: ${stdout.slice(0, 500)}`)
  }
}

function assertSuccess(payload: unknown, label: string): void {
  if (!Array.isArray(payload)) return
  for (const item of payload) {
    if (!item || typeof item !== 'object') continue
    if ((item as { success?: unknown }).success === false) {
      const serialized = JSON.stringify(item)
      throw new Error(`${label} failed: ${serialized}`)
    }
  }
}

function hasAppliedMigration(payload: unknown): boolean {
  if (!Array.isArray(payload) || payload.length === 0) return false
  const first = payload[0] as { results?: Array<Record<string, unknown>> } | undefined
  const row = first?.results?.[0]
  return Boolean(row && Number(row.applied ?? 0) === 1)
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

function isAlreadyAppliedError(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('duplicate column name')
    || normalized.includes('already exists')
}

async function main() {
  const remote = process.argv.includes('--remote')
  const markAllApplied = process.argv.includes('--mark-all-applied')
  const dbName = process.env.API_CORE_D1_DATABASE || process.env.D1_DATABASE || 'api-core'
  const opts: ExecOptions = { dbName, remote }

  const migrationsDir = join(process.cwd(), 'migrations')
  const migrationFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  if (migrationFiles.length === 0) {
    console.log('[db-migrate] No migration files found')
    return
  }

  const createTablePayload = runWranglerJson(
    {
      command: `
        CREATE TABLE IF NOT EXISTS _schema_migrations (
          name TEXT PRIMARY KEY,
          applied_at INTEGER NOT NULL
        );
      `,
    },
    opts,
  )
  assertSuccess(createTablePayload, 'create _schema_migrations')

  let appliedCount = 0
  let skippedCount = 0
  for (const fileName of migrationFiles) {
    const escaped = escapeSqlLiteral(fileName)
    const existsPayload = runWranglerJson(
      {
        command: `SELECT 1 AS applied FROM _schema_migrations WHERE name='${escaped}' LIMIT 1;`,
      },
      opts,
    )
    assertSuccess(existsPayload, `check migration ${fileName}`)
    if (hasAppliedMigration(existsPayload)) {
      skippedCount += 1
      continue
    }

    if (markAllApplied) {
      const markPayload = runWranglerJson(
        {
          command: `INSERT INTO _schema_migrations (name, applied_at) VALUES ('${escaped}', CAST(strftime('%s','now') AS INTEGER));`,
        },
        opts,
      )
      assertSuccess(markPayload, `mark migration ${fileName}`)
      appliedCount += 1
      continue
    }

    try {
      const filePayload = runWranglerJson({ file: `./migrations/${fileName}` }, opts)
      assertSuccess(filePayload, `apply migration ${fileName}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!isAlreadyAppliedError(message)) {
        throw error
      }
      console.log(`[db-migrate] ${fileName} already reflected in schema; marking as applied`)
    }

    const markPayload = runWranglerJson(
      {
        command: `INSERT INTO _schema_migrations (name, applied_at) VALUES ('${escaped}', CAST(strftime('%s','now') AS INTEGER));`,
      },
      opts,
    )
    assertSuccess(markPayload, `record migration ${fileName}`)
    appliedCount += 1
  }

  console.log(
    `[db-migrate] db=${dbName} mode=${remote ? 'remote' : 'local'} applied=${appliedCount} skipped=${skippedCount}${markAllApplied ? ' (mark-only)' : ''}`,
  )
}

await main()
