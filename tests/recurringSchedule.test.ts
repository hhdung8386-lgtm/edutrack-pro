import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildFutureRecurringSlots,
  estimateRecurringWeeks,
  recurringSessionTarget,
} from '../src/lib/recurringSchedule.ts'

test('all mode uses every available session while custom mode stays bounded', () => {
  assert.equal(recurringSessionTarget('all', 3, 18), 18)
  assert.equal(recurringSessionTarget('custom', 6, 18), 6)
  assert.equal(recurringSessionTarget('custom', 30, 18), 18)
})

test('week estimate rounds up partial weeks', () => {
  assert.equal(estimateRecurringWeeks(18, 2), 9)
  assert.equal(estimateRecurringWeeks(6, 2), 3)
})

test('past templates are skipped and recurring slots keep weekday/time', () => {
  const slots = buildFutureRecurringSlots([
    { day: 'mon', dateISO: '2026-08-17', time: '08:00' },
    { day: 'thu', dateISO: '2026-08-20', time: '08:00' },
  ], 3, '2026-08-19', '09:00')

  assert.deepEqual(slots, [
    { day: 'thu', dateISO: '2026-08-20', time: '08:00' },
    { day: 'mon', dateISO: '2026-08-24', time: '08:00' },
    { day: 'thu', dateISO: '2026-08-27', time: '08:00' },
  ])
})
