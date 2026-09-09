import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ATTENDANCE_EARLIEST_SUBMISSION_DELAY_MS,
  ATTENDANCE_SUBMISSION_WINDOW_MS,
  attendanceDeadlineMessage,
  bookingClassEndMs,
  canSubmitAttendance,
  getAttendanceDeadline,
} from '../src/lib/attendanceDeadline.ts'

const booking = {
  requestedDate: '2026-09-10',
  requestedEnd: '16:50',
}

test('attendance deadline converts Vietnam wall-clock time and opens after five minutes', () => {
  const classEndMs = bookingClassEndMs(booking)
  assert.equal(classEndMs, Date.UTC(2026, 8, 10, 16, 50) - 7 * 60 * 60 * 1000)
  assert.equal(getAttendanceDeadline(booking, classEndMs! + ATTENDANCE_EARLIEST_SUBMISSION_DELAY_MS - 1).state, 'too_early')
  assert.equal(getAttendanceDeadline(booking, classEndMs! + ATTENDANCE_EARLIEST_SUBMISSION_DELAY_MS).state, 'open')
  assert.equal(canSubmitAttendance(booking, classEndMs! + ATTENDANCE_EARLIEST_SUBMISSION_DELAY_MS), true)
})

test('attendance deadline expires only after twelve hours and remains open at the boundary', () => {
  const classEndMs = bookingClassEndMs(booking)!
  assert.equal(getAttendanceDeadline(booking, classEndMs + ATTENDANCE_SUBMISSION_WINDOW_MS).state, 'open')
  assert.equal(getAttendanceDeadline(booking, classEndMs + ATTENDANCE_SUBMISSION_WINDOW_MS + 1).state, 'expired')
  assert.equal(canSubmitAttendance(booking, classEndMs + ATTENDANCE_SUBMISSION_WINDOW_MS + 1), false)
})

test('cross-midnight 24:xx and malformed legacy schedules fail safely', () => {
  const overnight = bookingClassEndMs({ requestedDate: '2026-09-10', requestedEnd: '24:20' })
  assert.equal(overnight, Date.UTC(2026, 8, 11, 0, 20) - 7 * 60 * 60 * 1000)
  assert.equal(getAttendanceDeadline({ requestedDate: '2026-09-10', requestedEnd: '' }).state, 'invalid')
  assert.equal(getAttendanceDeadline({ requestedDate: '2026-02-31', requestedEnd: '16:50' }).state, 'invalid')
  assert.equal(getAttendanceDeadline(booking, Number.NaN).state, 'invalid')
  assert.match(attendanceDeadlineMessage('expired'), /quá 12 tiếng/i)
})
