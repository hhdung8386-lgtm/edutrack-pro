import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultApprovalSubjectId,
  isBookingUsableForLessonApproval,
  lessonApprovalClassHuntCompensation,
  lessonApprovalPoints,
  pickApprovalSubjectPackageIndex,
  selectLenientApprovalBookings,
  usableLessonApprovalBookings,
} from '../src/lib/lenientLessonApproval.ts'
import type { BookingRequest } from '../src/types/index.ts'

function booking(id: string, overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id,
    studentId: 'student-1',
    teacherId: 'teacher-1',
    requestedDate: '2026-09-07',
    requestedStart: '19:00',
    requestedEnd: '19:25',
    requestedMinutes: 25,
    pointsPer25Minutes: 25,
    status: 'confirmed',
    ...overrides,
  } as BookingRequest
}

test('a booking is usable only while it is free or already closed by the same lesson', () => {
  assert.equal(isBookingUsableForLessonApproval(booking('a'), 'lesson-1', 'student-1'), true)
  assert.equal(isBookingUsableForLessonApproval(booking('a', { lessonId: 'lesson-1' }), 'lesson-1', 'student-1'), true)
  assert.equal(isBookingUsableForLessonApproval(booking('a', { lessonId: 'lesson-2' }), 'lesson-1', 'student-1'), false)
  assert.equal(isBookingUsableForLessonApproval(booking('a', { status: 'released' }), 'lesson-1', 'student-1'), false)
  assert.equal(isBookingUsableForLessonApproval(booking('a', { status: 'rejected' }), 'lesson-1', 'student-1'), false)
  assert.equal(isBookingUsableForLessonApproval(booking('a', { status: 'completed', lessonId: 'lesson-1' }), 'lesson-1', 'student-1'), true)
  assert.equal(isBookingUsableForLessonApproval(booking('a', { status: 'completed', lessonId: 'lesson-2' }), 'lesson-1', 'student-1'), false)
  assert.equal(isBookingUsableForLessonApproval(booking('a', { status: 'completed' }), 'lesson-1', 'student-1'), false)
})

test('a booking of another student is never usable', () => {
  assert.equal(isBookingUsableForLessonApproval(booking('a', { studentId: 'student-2' }), 'lesson-1', 'student-1'), false)
  assert.deepEqual(selectLenientApprovalBookings({
    lessonId: 'lesson-1',
    studentId: 'student-1',
    lessonMinutes: 25,
    referenced: [booking('foreign', { studentId: 'student-2' })],
    sameDay: [],
  }), [])
})

test('usable bookings are de-duplicated so a hold is never released twice', () => {
  const rows = usableLessonApprovalBookings([booking('a'), booking('a'), booking('b', { status: 'released' })], 'lesson-1', 'student-1')
  assert.deepEqual(rows.map((row) => row.id), ['a'])
})

test('a 50-minute lesson links two 25-minute bookings separated by a gap', () => {
  const selected = selectLenientApprovalBookings({
    lessonId: 'lesson-1',
    studentId: 'student-1',
    lessonMinutes: 50,
    referenced: [],
    sameDay: [
      booking('late', { requestedStart: '22:00', requestedEnd: '22:25' }),
      booking('early', { requestedStart: '21:30', requestedEnd: '21:55' }),
    ],
  })
  assert.deepEqual(selected.map((row) => row.id), ['early', 'late'])
})

test('referenced bookings come first and are topped up from the same day', () => {
  const selected = selectLenientApprovalBookings({
    lessonId: 'lesson-1',
    studentId: 'student-1',
    lessonMinutes: 50,
    referenced: [booking('ref', { requestedStart: '22:00' })],
    sameDay: [booking('ref', { requestedStart: '22:00' }), booking('other', { requestedStart: '21:30' })],
  })
  assert.deepEqual(selected.map((row) => row.id), ['ref', 'other'])
})

test('never takes more booked minutes than the lesson lasted', () => {
  const selected = selectLenientApprovalBookings({
    lessonId: 'lesson-1',
    studentId: 'student-1',
    lessonMinutes: 25,
    referenced: [],
    sameDay: [booking('a', { requestedStart: '19:00' }), booking('b', { requestedStart: '20:00' })],
  })
  assert.deepEqual(selected.map((row) => row.id), ['a'])
})

test('bookings owned by another lesson or already released are never picked', () => {
  const selected = selectLenientApprovalBookings({
    lessonId: 'lesson-1',
    studentId: 'student-1',
    lessonMinutes: 25,
    referenced: [booking('released', { status: 'released' })],
    sameDay: [
      booking('released', { status: 'released' }),
      booking('taken', { lessonId: 'lesson-2' }),
      booking('taken-done', { status: 'completed', lessonId: 'lesson-2' }),
    ],
  })
  assert.deepEqual(selected, [])
})

test('a lone same-day booking is linked even when its length differs', () => {
  const selected = selectLenientApprovalBookings({
    lessonId: 'lesson-1',
    studentId: 'student-1',
    lessonMinutes: 25,
    referenced: [],
    sameDay: [booking('only', { requestedMinutes: 50, requestedEnd: '19:50' })],
  })
  assert.deepEqual(selected.map((row) => row.id), ['only'])
})

test('a zero-minute excused absence links only an unambiguous booking', () => {
  assert.deepEqual(selectLenientApprovalBookings({
    lessonId: 'lesson-1',
    studentId: 'student-1',
    lessonMinutes: 0,
    referenced: [],
    sameDay: [booking('only')],
  }).map((row) => row.id), ['only'])
  assert.deepEqual(selectLenientApprovalBookings({
    lessonId: 'lesson-1',
    studentId: 'student-1',
    lessonMinutes: 0,
    referenced: [],
    sameDay: [booking('a'), booking('b', { requestedStart: '20:00' })],
  }), [])
})

test('re-approval keeps the bookings already closed by the same lesson', () => {
  const selected = selectLenientApprovalBookings({
    lessonId: 'lesson-1',
    studentId: 'student-1',
    lessonMinutes: 25,
    referenced: [],
    sameDay: [booking('closed', { status: 'completed', lessonId: 'lesson-1' }), booking('free', { requestedStart: '20:00' })],
  })
  assert.deepEqual(selected.map((row) => row.id), ['closed'])
})

test('points follow the bookings when their minutes match the lesson', () => {
  const lesson = { minutes: 50, attendanceStatus: 'present' as const, pointsPer25Minutes: 25 }
  const bookings = [booking('a', { pointsPer25Minutes: 30 }), booking('b', { pointsPer25Minutes: 30 })]
  assert.equal(lessonApprovalPoints(lesson, bookings, null, false), 60)
})

test('points follow the lesson minutes when bookings do not cover it', () => {
  const lesson = { minutes: 75, attendanceStatus: 'present' as const, pointsPer25Minutes: 25 }
  assert.equal(lessonApprovalPoints(lesson, [booking('a', { pointsPer25Minutes: 30 })], null, false), 90)
  assert.equal(lessonApprovalPoints(lesson, [], null, false), 75)
})

test('absences keep the lesson-based charge', () => {
  assert.equal(lessonApprovalPoints({ minutes: 0, attendanceStatus: 'with_permission' }, [booking('a')], null, true), 0)
  assert.equal(lessonApprovalPoints({ minutes: 25, attendanceStatus: 'without_permission', pointsPer25Minutes: 25 }, [booking('a', { pointsPer25Minutes: 40 })], null, false), 25)
})

test('inconsistent class hunt rates fall back instead of blocking approval', () => {
  const compensation = { version: 1, ratePerMinute: 1000, currency: 'VND', formula: 'flat_per_minute' }
  const hunt = booking('hunt', { classHuntId: 'hunt-1', classHuntCompensation: compensation } as Partial<BookingRequest>)
  const plain = booking('plain')
  assert.deepEqual(lessonApprovalClassHuntCompensation([hunt], {}), compensation)
  assert.deepEqual(lessonApprovalClassHuntCompensation([plain, hunt], {}), compensation)
  assert.equal(lessonApprovalClassHuntCompensation([plain], {}), null)
})

test('subject package selection prefers the lesson subject, then the only package', () => {
  const packages = [
    { subjectId: 'a', remainingMinutes: 0 },
    { subjectId: 'b', remainingMinutes: 100 },
    { subjectId: 'a', remainingMinutes: 50 },
  ]
  assert.equal(pickApprovalSubjectPackageIndex(packages, 'a', 25), 2)
  assert.equal(pickApprovalSubjectPackageIndex(packages, 'a', 75), 0)
  assert.equal(pickApprovalSubjectPackageIndex(packages, 'missing', 25), -1)
  assert.equal(defaultApprovalSubjectId(packages, 'b'), 'b')
  assert.equal(defaultApprovalSubjectId(packages, 'missing'), '')
  assert.equal(defaultApprovalSubjectId([{ subjectId: 'only' }], 'missing'), 'only')
})
