import assert from 'node:assert/strict'
import test from 'node:test'
import {
  checkBookingTimeRangeConsistency,
  formatClassroomElapsed,
  onlineClassroomMeetingTimer,
} from '../src/lib/bookingTime.ts'

test('detects a stored duration that disagrees with the displayed time range', () => {
  assert.deepEqual(checkBookingTimeRangeConsistency({
    requestedStart: '20:30',
    requestedEnd: '20:55',
    requestedMinutes: 50,
  }), {
    status: 'mismatch',
    actualMinutes: 25,
    requestedMinutes: 50,
  })
})

test('accepts a matching time range including the 24:xx convention', () => {
  assert.deepEqual(checkBookingTimeRangeConsistency({
    requestedStart: '24:00',
    requestedEnd: '24:50',
    requestedMinutes: 50,
  }), {
    status: 'consistent',
    actualMinutes: 50,
    requestedMinutes: 50,
  })
})

test('meeting timer uses Vietnam booking time and keeps seconds when joining late', () => {
  const nowMs = Date.UTC(2026, 7, 29, 12, 5, 9) // 19:05:09 tại Việt Nam
  assert.deepEqual(onlineClassroomMeetingTimer({
    requestedDate: '2026-08-29',
    requestedStart: '19:00',
    requestedEnd: '19:50',
  }, nowMs), {
    durationSeconds: 3_000,
    elapsedSeconds: 309,
  })
})

test('meeting timer supports the repository 24:xx cross-midnight convention', () => {
  const nowMs = Date.UTC(2026, 7, 29, 17, 10) // 00:10 ngày kế tiếp tại Việt Nam
  assert.deepEqual(onlineClassroomMeetingTimer({
    requestedDate: '2026-08-29',
    requestedStart: '24:00',
    requestedEnd: '24:25',
  }, nowMs), {
    durationSeconds: 1_500,
    elapsedSeconds: 600,
  })
})

test('meeting timer adds only the validated classroom extension', () => {
  const nowMs = Date.UTC(2026, 7, 29, 12, 5, 9)
  assert.deepEqual(onlineClassroomMeetingTimer({
    requestedDate: '2026-08-29',
    requestedStart: '19:00',
    requestedEnd: '19:50',
    extensionMinutes: 10,
  }, nowMs), {
    durationSeconds: 3_600,
    elapsedSeconds: 309,
  })
  assert.equal(onlineClassroomMeetingTimer({
    requestedDate: '2026-08-29',
    requestedStart: '19:00',
    requestedEnd: '19:50',
    extensionMinutes: 11,
  }, nowMs).durationSeconds, 3_000)
})

test('classroom elapsed label remains compact before and after one hour', () => {
  assert.equal(formatClassroomElapsed(0), '00:00')
  assert.equal(formatClassroomElapsed(125), '02:05')
  assert.equal(formatClassroomElapsed(3_661), '1:01:01')
})
