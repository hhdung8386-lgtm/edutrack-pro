import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firstDayOfMonthISO, liveWindowStartISO, mergeById, shiftDateISO } from '../src/lib/liveDataWindow.ts'

test('shiftDateISO crosses month and year boundaries', () => {
  assert.equal(shiftDateISO('2026-11-09', -14), '2026-10-26')
  assert.equal(shiftDateISO('2026-01-02', -3), '2025-12-30')
  assert.equal(shiftDateISO('2028-02-28', 1), '2028-02-29')
})

test('window keeps the recent two weeks when viewing now or the future', () => {
  assert.equal(liveWindowStartISO('2026-11-09'), '2026-10-26')
  assert.equal(liveWindowStartISO('2026-11-09', '2026-11-09'), '2026-10-26')
  assert.equal(liveWindowStartISO('2026-11-09', '2026-12-28'), '2026-10-26')
  // tuần đang xem vẫn trong 14 ngày gần nhất (kể cả 2 ngày đệm múi giờ)
  assert.equal(liveWindowStartISO('2026-11-09', '2026-10-28'), '2026-10-26')
})

test('window extends to the start of the month of an older viewed week', () => {
  assert.equal(liveWindowStartISO('2026-11-09', '2026-10-19'), '2026-10-01')
  assert.equal(liveWindowStartISO('2026-11-09', '2026-10-05'), '2026-10-01')
  // tuần bắt đầu ngày 1 → lùi 2 ngày đệm sang tháng trước
  assert.equal(liveWindowStartISO('2026-11-09', '2026-09-01'), '2026-08-01')
  assert.equal(firstDayOfMonthISO('2026-07-31'), '2026-07-01')
})

test('mergeById keeps one row per id, later lists win', () => {
  const merged = mergeById([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'a', v: 2 }])
  assert.deepEqual(merged.sort((x, y) => x.id.localeCompare(y.id)), [{ id: 'a', v: 2 }, { id: 'b', v: 1 }])
})
