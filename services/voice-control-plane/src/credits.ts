/**
 * Credit Ledger — D1 transactional operations
 *
 * All debits use atomic SQL (no JS compute-then-write).
 * Balance never goes negative — clamped in SQL.
 */

import { BASE_GRANT_SECONDS, CELO_BONUS_SECONDS } from './config'

export interface CreditBalance {
  remaining_seconds: number
  base_granted_seconds: number
  bonus_granted_seconds: number
  consumed_seconds: number
}

/** Ensure credit account exists, return current balance */
export async function ensureAccount(db: D1Database, wallet: string): Promise<CreditBalance> {
  const w = wallet.toLowerCase()
  await db.prepare(
    'INSERT OR IGNORE INTO credit_accounts (wallet, updated_at) VALUES (?, ?)',
  ).bind(w, new Date().toISOString()).run()

  return getBalance(db, wallet)
}

/** Get credit balance for a wallet */
export async function getBalance(db: D1Database, wallet: string): Promise<CreditBalance> {
  const w = wallet.toLowerCase()
  const row = await db.prepare(
    'SELECT base_granted_seconds, bonus_granted_seconds, consumed_seconds FROM credit_accounts WHERE wallet = ?',
  ).bind(w).first<{
    base_granted_seconds: number
    bonus_granted_seconds: number
    consumed_seconds: number
  }>()

  if (!row) {
    return { remaining_seconds: 0, base_granted_seconds: 0, bonus_granted_seconds: 0, consumed_seconds: 0 }
  }

  return {
    remaining_seconds: row.base_granted_seconds + row.bonus_granted_seconds - row.consumed_seconds,
    base_granted_seconds: row.base_granted_seconds,
    bonus_granted_seconds: row.bonus_granted_seconds,
    consumed_seconds: row.consumed_seconds,
  }
}

/** Grant base credits (idempotent — skip if already granted) */
export async function grantBase(db: D1Database, wallet: string): Promise<{ granted: boolean; remaining_seconds: number }> {
  const w = wallet.toLowerCase()
  await ensureAccount(db, wallet)

  const existing = await getBalance(db, wallet)
  if (existing.base_granted_seconds > 0) {
    return { granted: false, remaining_seconds: existing.remaining_seconds }
  }

  const now = new Date().toISOString()
  const newRemaining = BASE_GRANT_SECONDS + existing.bonus_granted_seconds - existing.consumed_seconds

  await db.batch([
    db.prepare(
      'UPDATE credit_accounts SET base_granted_seconds = ?, updated_at = ? WHERE wallet = ?',
    ).bind(BASE_GRANT_SECONDS, now, w),
    db.prepare(
      'INSERT INTO credit_events (wallet, delta_seconds, event_type, balance_after_seconds, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(w, BASE_GRANT_SECONDS, 'grant_base', newRemaining, now),
  ])

  return { granted: true, remaining_seconds: newRemaining }
}

/**
 * Grant Celo bonus credits (atomically idempotent).
 *
 * Gate + bonus run in one db.batch() (single D1 transaction).
 * UPDATE is guarded by SQLite changes() from the preceding INSERT OR IGNORE,
 * so it only runs when this call actually inserted the verification row.
 */
export async function grantCeloBonus(db: D1Database, wallet: string): Promise<{ granted: boolean; remaining_seconds: number }> {
  const w = wallet.toLowerCase()
  await ensureAccount(db, wallet)

  const now = new Date().toISOString()

  const [, updateResult, postResult] = await db.batch([
    db.prepare(
      'INSERT OR IGNORE INTO verifications (wallet, celo_verified, bonus_granted_at) VALUES (?, 1, ?)',
    ).bind(w, now),
    db.prepare(`
      UPDATE credit_accounts
      SET bonus_granted_seconds = bonus_granted_seconds + ?1,
          updated_at = ?2
      WHERE wallet = ?3
        AND changes() > 0
    `).bind(CELO_BONUS_SECONDS, now, w),
    db.prepare(
      'SELECT base_granted_seconds + bonus_granted_seconds - consumed_seconds AS remaining FROM credit_accounts WHERE wallet = ?',
    ).bind(w),
  ])

  const remaining = (postResult.results?.[0] as { remaining: number } | undefined)?.remaining ?? 0
  const granted = (updateResult.meta?.changes ?? 0) > 0

  if (!granted) {
    return { granted: false, remaining_seconds: remaining }
  }

  // Event log is best-effort. Bonus is already committed correctly.
  try {
    await db.prepare(
      'INSERT INTO credit_events (wallet, delta_seconds, event_type, balance_after_seconds, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(w, CELO_BONUS_SECONDS, 'grant_celo_bonus', remaining, now).run()
  } catch (e) {
    console.error(`[credits] bonus event log failed for ${w}: ${e}`)
  }

  return { granted: true, remaining_seconds: remaining }
}

/**
 * Debit usage — atomic via db.batch() (single D1 transaction).
 *
 * 1. SELECT pre-update state
 * 2. UPDATE with MIN clamp
 * 3. SELECT post-update state
 *
 * All three run in one transaction, so no TOCTOU.
 * Event log runs after the batch — if it fails, the debit is still
 * applied (correct) and only the audit log is missing. The event
 * insert failure is swallowed so higher layers always get a clean
 * return value matching the committed debit.
 */
export async function debitUsage(
  db: D1Database,
  wallet: string,
  seconds: number,
  connectionId: string,
): Promise<{ remaining_seconds: number; debited: number; clamped: boolean }> {
  if (seconds <= 0) {
    const balance = await getBalance(db, wallet)
    return { remaining_seconds: balance.remaining_seconds, debited: 0, clamped: false }
  }

  const w = wallet.toLowerCase()
  const now = new Date().toISOString()

  // All three statements execute in a single D1 transaction (batch)
  const [preResult, , postResult] = await db.batch([
    db.prepare(
      'SELECT consumed_seconds, base_granted_seconds + bonus_granted_seconds AS total_granted FROM credit_accounts WHERE wallet = ?',
    ).bind(w),
    db.prepare(`
      UPDATE credit_accounts
      SET consumed_seconds = MIN(consumed_seconds + ?1, base_granted_seconds + bonus_granted_seconds),
          updated_at = ?2
      WHERE wallet = ?3
    `).bind(seconds, now, w),
    db.prepare(
      'SELECT consumed_seconds, base_granted_seconds + bonus_granted_seconds AS total_granted FROM credit_accounts WHERE wallet = ?',
    ).bind(w),
  ])

  const pre = preResult.results?.[0] as { consumed_seconds: number; total_granted: number } | undefined
  const post = postResult.results?.[0] as { consumed_seconds: number; total_granted: number } | undefined

  if (!pre || !post) {
    return { remaining_seconds: 0, debited: 0, clamped: false }
  }

  // Exact debit derived from transactional pre/post diff
  const debited = post.consumed_seconds - pre.consumed_seconds
  const remaining = post.total_granted - post.consumed_seconds
  const clamped = debited < seconds

  // Append-only event log — swallow failures so the committed debit is
  // always returned cleanly to callers (avoids retry/double-metering).
  try {
    await db.prepare(
      'INSERT INTO credit_events (wallet, delta_seconds, event_type, balance_after_seconds, connection_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(w, -debited, 'debit_usage', remaining, connectionId, now).run()
  } catch (e) {
    console.error(`[credits] event log failed for ${w} debit=${debited}: ${e}`)
  }

  return { remaining_seconds: remaining, debited, clamped }
}
