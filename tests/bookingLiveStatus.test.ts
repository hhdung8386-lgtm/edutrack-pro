import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareBookingsByTime,
  getBookingLiveStatus,
  getVietnamClock,
} from '../src/lib/bookingLiveStatus.ts'

test('vietnam clock is GMT+7', () => {
  // 2026-09-25 13:10 UTC = 20:10 giờ Việt Nam
  assert.deepEqual(getVietnamClock(Date.UTC(2026, 8, 25, 13, 10)), { date: '2026-09-25', minutes: 20 * 60 + 10 })
  // 18:30 UTC đã sang ngày hôm sau ở Việt Nam
  assert.deepEqual(getVietnamClock(Date.UTC(2026, 8, 25, 18, 30)), { date: '2026-09-26', minutes: 60 + 30 })
})

test('status follows start/end time of today', () => {
  const clock = { date: '2026-09-25', minutes: 20 * 60 + 10 }
  const at = (start: string, end: string, date = '2026-09-25') =>
    getBookingLiveStatus({ requestedDate: date, requestedStart: start, requestedEnd: end }, clock)
  assert.equal(at('20:00', '20:25'), 'live')
  assert.equal(at('20:10', '20:35'), 'live')
  assert.equal(at('20:30', '20:55'), 'upcoming')
  assert.equal(at('19:30', '19:55'), 'ended')
  assert.equal(at('19:45', '20:10'), 'ended')
  assert.equal(at('08:00', '08:25', '2026-09-26'), 'upcoming')
  assert.equal(at('21:00', '21:25', '2026-09-24'), 'ended')
})

test('missing end time falls back to minutes; midnight crossing stays live', () => {
  assert.equal(getBookingLiveStatus(
    { requestedDate: '2026-09-25', requestedStart: '20:00', requestedEnd: '', requestedMinutes: 25 },
    { date: '2026-09-25', minutes: 20 * 60 + 20 },
  ), 'live')
  assert.equal(getBookingLiveStatus(
    { requestedDate: '2026-09-25', requestedStart: '23:45', requestedEnd: '00:10' },
    { date: '2026-09-25', minutes: 23 * 60 + 55 },
  ), 'live')
})

test('time sort is earliest first across dates, then student name', () => {
  const rows = [
    { requestedDate: '2026-09-26', requestedStart: '08:00', studentName: 'A' },
    { requestedDate: '2026-09-25', requestedStart: '21:00', studentName: 'An LM' },
    { requestedDate: '2026-09-25', requestedStart: '8:30', studentName: 'B' },
    { requestedDate: '2026-09-25', requestedStart: '08:00', studentName: 'Andy' },
    { requestedDate: '2026-09-25', requestedStart: '08:00', studentName: 'Andrew' },
  ]
  const sorted = [...rows].sort(compareBookingsByTime).map((r) => `${r.requestedDate} ${r.requestedStart} ${r.studentName}`)
  assert.deepEqual(sorted, [
    '2026-09-25 08:00 Andrew',
    '2026-09-25 08:00 Andy',
    '2026-09-25 8:30 B',
    '2026-09-25 21:00 An LM',
    '2026-09-26 08:00 A',
  ])
})
