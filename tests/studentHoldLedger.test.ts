import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStudentHoldLedger, classifyStudentHold, studentHoldPoints } from '../src/lib/studentHoldLedger.ts'
import type { BookingRequest } from '../src/types/index.ts'

const TODAY = '2026-09-11'

function booking(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id: 'b',
    status: 'confirmed',
    teacherId: 't1',
    teacherName: 'Karen',
    studentId: 's1',
    studentCode: 'HSXM9FEM',
    studentName: 'Minh Chánh',
    subjectId: 'sub',
    requestedDate: '2026-09-20',
    requestedStart: '20:00',
    requestedEnd: '20:25',
    requestedMinutes: 25,
    requestedPoints: 25,
    ...overrides,
  } as BookingRequest
}

test('classifies every fund-holding row exactly once', () => {
  assert.equal(classifyStudentHold(booking(), TODAY), 'future')
  assert.equal(classifyStudentHold(booking({ requestedDate: TODAY }), TODAY), 'future')
  assert.equal(classifyStudentHold(booking({ requestedDate: '2026-09-01' }), TODAY), 'overdue')
  assert.equal(classifyStudentHold(booking({ requestedDate: '2026-09-01', lessonId: 'l1' }), TODAY), 'linked')
  assert.equal(classifyStudentHold(booking({ status: 'pending', requestedDate: undefined }), TODAY), 'undated')
  assert.equal(classifyStudentHold(booking({ status: 'released', pendingRebook: true, rebookHoldPoints: 50 }), TODAY), 'pending_rebook')
  assert.equal(classifyStudentHold(booking({ status: 'released' }), TODAY), null)
  assert.equal(classifyStudentHold(booking({ status: 'completed', lessonId: 'l1' }), TODAY), null)
  assert.equal(classifyStudentHold(booking({ status: 'released', pendingRebook: true, rebookHoldPoints: 50, rebookedByBookingId: 'x' }), TODAY), null)
})

test('ledger total equals the booking-book hold used by the student list', () => {
  // "Đã đặt 200 phút" nhưng Lịch đã đặt (chỉ ca tương lai chưa điểm danh) trống:
  // toàn bộ phần giữ nằm ở ca quá hạn và ca đã gắn điểm danh.
  const rows = [
    booking({ id: 'o1', requestedDate: '2026-08-29' }),
    booking({ id: 'o2', requestedDate: '2026-08-29', requestedStart: '20:30' }),
    booking({ id: 'l1', requestedDate: '2026-09-05', lessonId: 'lesson-1', requestedMinutes: 50, requestedPoints: undefined, pointsPer25Minutes: 25 }),
    booking({ id: 'r1', status: 'released', pendingRebook: true, rebookHoldPoints: 50, requestedDate: '2026-09-12' }),
    booking({ id: 'n1', requestedDate: undefined, requestedMinutes: 50, requestedPoints: 50 }),
    booking({ id: 'done', status: 'completed', lessonId: 'lesson-0' }),
  ]
  const ledger = buildStudentHoldLedger(rows, TODAY)
  assert.equal(ledger.totalPoints, 200)
  assert.deepEqual(ledger.pointsByKind, { future: 0, overdue: 50, linked: 50, pending_rebook: 50, undated: 50 })
  assert.deepEqual(ledger.byKind.overdue.map((item) => item.booking.id), ['o1', 'o2'])
  assert.equal(ledger.items.length, 5)
  assert.equal(studentHoldPoints(rows[5]), 0)
})
