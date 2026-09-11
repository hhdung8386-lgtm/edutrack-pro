import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeLinkedLessonIds,
  isBookingAttended,
  isBookingCancellable,
  isBookingSettledByApprovedLesson,
  lessonSettlementFacts,
  settleApprovedLessonBookings,
} from '../src/lib/bookingLogic.ts'
import { buildStudentHoldLedger } from '../src/lib/studentHoldLedger.ts'
import type { BookingRequest } from '../src/types/index.ts'

const TODAY = '2026-09-11'

function booking(id: string, overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id,
    status: 'confirmed',
    teacherId: 't1',
    teacherName: 'Thúy Ngân',
    studentId: 's1',
    studentCode: 'HS37UIUB',
    studentName: 'Jayden Vu',
    subjectId: 'sub',
    requestedDate: '2026-07-25',
    requestedStart: '09:00',
    requestedEnd: '09:25',
    requestedMinutes: 25,
    requestedPoints: 25,
    ...overrides,
  } as BookingRequest
}

const facts = lessonSettlementFacts([
  { id: 'approved-own', status: 'approved', studentId: 's1' },
  { id: 'pending-own', status: 'pending', studentId: 's1' },
  { id: 'cancelled-own', status: 'cancelled', studentId: 's1' },
  { id: 'approved-other', status: 'approved', studentId: 's2' },
])

test('a pre-2026-08-10 approval that left the booking confirmed is a closed session, not a hold', () => {
  const legacy = booking('legacy', { lessonId: 'approved-own' })
  assert.equal(isBookingSettledByApprovedLesson(legacy, facts), true)
  const [settled] = settleApprovedLessonBookings([legacy], facts)
  assert.equal(settled.status, 'completed')
  assert.equal(legacy.status, 'confirmed')
  // Lịch vẫn hiển thị đã đóng, không có nút hủy.
  assert.equal(isBookingAttended(settled), true)
  assert.equal(isBookingCancellable(settled), false)
})

test('unsettled links keep holding diamonds so nothing is released by mistake', () => {
  assert.equal(isBookingSettledByApprovedLesson(booking('a', { lessonId: 'pending-own' }), facts), false)
  assert.equal(isBookingSettledByApprovedLesson(booking('b', { lessonId: 'cancelled-own' }), facts), false)
  assert.equal(isBookingSettledByApprovedLesson(booking('c', { lessonId: 'approved-other' }), facts), false)
  assert.equal(isBookingSettledByApprovedLesson(booking('d', { lessonId: 'unknown' }), facts), false)
  assert.equal(isBookingSettledByApprovedLesson(booking('e'), facts), false)
})

test('hold ledger no longer lists approved sessions as unclosed holds', () => {
  const rows = [
    booking('legacy-1', { lessonId: 'approved-own' }),
    booking('legacy-2', { lessonId: 'approved-own', requestedStart: '09:30', requestedEnd: '09:55' }),
    booking('awaiting', { lessonId: 'pending-own', requestedDate: '2026-09-10' }),
    booking('future', { requestedDate: '2026-09-20' }),
  ]
  const before = buildStudentHoldLedger(rows, TODAY)
  assert.equal(before.totalPoints, 100)
  const after = buildStudentHoldLedger(settleApprovedLessonBookings(rows, facts), TODAY)
  assert.equal(after.totalPoints, 50)
  assert.deepEqual(after.byKind.linked.map((item) => item.booking.id), ['awaiting'])
  assert.deepEqual(after.byKind.future.map((item) => item.booking.id), ['future'])
})

test('lesson ids are collected once from live linked bookings only', () => {
  assert.deepEqual(activeLinkedLessonIds([
    booking('a', { lessonId: 'l2' }),
    booking('b', { lessonId: 'l1' }),
    booking('c', { lessonId: 'l1', status: 'pending' }),
    booking('d', { lessonId: 'l3', status: 'completed' }),
    booking('e'),
  ]), ['l1', 'l2'])
  const untouched = [booking('x')]
  assert.equal(settleApprovedLessonBookings(untouched, facts), untouched)
})
