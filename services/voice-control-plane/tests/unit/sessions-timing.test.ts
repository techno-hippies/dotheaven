import { describe, expect, test } from 'bun:test'
import {
  classifyAttestationTimingForScheduler,
  getAttestationWindows,
  isIdempotentAttestationError,
  validateAttestationWindow,
} from '../../src/routes/sessions'

describe('session attestation timing windows', () => {
  test('no-show window matches contract interval [start+grace, start+grace+duration]', () => {
    const startTime = 1_700_000_000
    const windows = getAttestationWindows({
      startTime,
      durationMins: 30,
      graceMins: 5,
      minOverlapMins: 10,
    })

    expect(windows.noShowEarliest).toBe(startTime + 5 * 60)
    expect(windows.noShowLatest).toBe(startTime + (5 + 30) * 60)
  })

  test('completed window matches contract interval [start+minOverlap, end+2h]', () => {
    const startTime = 1_700_000_000
    const windows = getAttestationWindows({
      startTime,
      durationMins: 30,
      graceMins: 5,
      minOverlapMins: 10,
    })

    expect(windows.completedEarliest).toBe(startTime + 10 * 60)
    expect(windows.completedLatest).toBe(startTime + 30 * 60 + 2 * 60 * 60)
  })

  test('no-show attestation is rejected before grace and after no-show window', () => {
    const startTime = 1_700_000_000
    const windows = getAttestationWindows({
      startTime,
      durationMins: 30,
      graceMins: 5,
      minOverlapMins: 10,
    })

    const tooEarly = validateAttestationWindow('no-show-host', startTime + 4 * 60, windows)
    expect(tooEarly).toEqual({ ok: false, error: 'grace_not_over' })

    const tooLate = validateAttestationWindow('no-show-guest', startTime + 36 * 60, windows)
    expect(tooLate).toEqual({ ok: false, error: 'no_show_too_late' })

    const valid = validateAttestationWindow('no-show-host', startTime + 20 * 60, windows)
    expect(valid).toEqual({ ok: true })
  })

  test('scheduler timing classification maps retryable and terminal timing errors', () => {
    expect(classifyAttestationTimingForScheduler('grace_not_over')).toBe('not_due_yet')
    expect(classifyAttestationTimingForScheduler('overlap_not_met')).toBe('not_due_yet')
    expect(classifyAttestationTimingForScheduler('no_show_too_late')).toBe('window_missed')
    expect(classifyAttestationTimingForScheduler('completed_too_late')).toBe('window_missed')
    expect(classifyAttestationTimingForScheduler('booking_not_found')).toBeNull()
  })

  test('idempotent attestation error classification catches booked-status conflicts', () => {
    expect(isIdempotentAttestationError('booking status is Attested, expected Booked')).toBe(true)
    expect(isIdempotentAttestationError('execution reverted: status is not booked')).toBe(true)
    expect(isIdempotentAttestationError('rpc timeout')).toBe(false)
  })
})
