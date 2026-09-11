import assert from 'node:assert/strict'
import test from 'node:test'
import type { BookingRequest, Student } from '../src/types/index.ts'
import {
  classifyOrphanSubjectBooking,
  groupByStudent,
  isApprovedUnsettledBooking,
  ledgerHeldPointsAfterSettlement,
  type RepairLessonFact,
} from '../src/lib/bookingLedgerRepair.ts'
import { courseLearnedDiamondPremium, courseRemainingMinutes } from '../src/lib/courseProgress.ts'

function booking(overrides: Partial<BookingRequest>): BookingRequest {
  return {
    id: 'b1',
    studentId: 's1',
    studentCode: 'HS1',
    studentName: 'Học viên',
    teacherId: 't1',
    teacherName: 'Gia sư',
    subjectId: 'NEW',
    subjectName: 'Gói mới',
    status: 'confirmed',
    requestedDate: '2026-07-31',
    requestedStart: '19:00',
    requestedEnd: '19:25',
    requestedMinutes: 25,
    requestedPoints: 25,
    ...overrides,
  } as BookingRequest
}

function lesson(overrides: Partial<RepairLessonFact>): RepairLessonFact {
  return {
    id: 'l1',
    status: 'approved',
    studentId: 's1',
    teacherId: 't1',
    subjectId: 'NEW',
    referencedBookingIds: [],
    hasSubjectReconciliation: false,
    ...overrides,
  }
}

test('only a confirmed booking linked to an approved lesson of the same student is closed in bulk', () => {
  const linked = booking({ lessonId: 'l1' })
  assert.equal(isApprovedUnsettledBooking(linked, lesson({})), true)
  assert.equal(isApprovedUnsettledBooking(linked, lesson({ status: 'pending' })), false)
  assert.equal(isApprovedUnsettledBooking(linked, lesson({ studentId: 'other' })), false)
  assert.equal(isApprovedUnsettledBooking(linked, lesson({ hasSubjectReconciliation: true })), false)
  assert.equal(isApprovedUnsettledBooking(booking({ lessonId: 'l1', status: 'completed' }), lesson({})), false)
  // A substitute tutor is accepted only when the approved lesson names this booking.
  assert.equal(isApprovedUnsettledBooking(linked, lesson({ teacherId: 't2' })), false)
  assert.equal(isApprovedUnsettledBooking(linked, lesson({ teacherId: 't2', referencedBookingIds: ['b1'] })), true)
})

test('the stored hold is recalculated from real holds after approved rows are treated as closed', () => {
  const lessons = new Map([['l1', lesson({})], ['l2', lesson({ id: 'l2', status: 'rejected' })]])
  const rows = [
    booking({ id: 'a', lessonId: 'l1' }),
    booking({ id: 'b', lessonId: 'l2' }),
    booking({ id: 'c', requestedDate: '2026-09-20', requestedPoints: 35, pointsPer25Minutes: 35 }),
    booking({ id: 'd', status: 'released', pendingRebook: true, rebookHoldPoints: 25 }),
    booking({ id: 'e', status: 'completed', lessonId: 'l1' }),
  ]
  assert.equal(ledgerHeldPointsAfterSettlement(rows, lessons), 25 + 35 + 25)

  const student = { id: 's1', code: 'HS1', name: 'A', reservedMinutes: 535 } as Student
  const groups = groupByStudent([{ booking: rows[0] }], new Map([['s1', student]]), new Map([['s1', rows]]), lessons)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].storedHeld, 535)
  assert.equal(groups[0].ledgerHeldAfter, 85)
})

test('a booking pointing at a subject the student no longer owns is repointed only when unambiguous', () => {
  const single = { subjects: [{ subjectId: 'NEW', subjectName: 'Gói mới', curriculumLink: ' https://x ' }] } as unknown as Student
  const orphan = booking({ subjectId: 'OLD', subjectName: 'Gói cũ', requestedDate: '2026-09-20' })
  assert.deepEqual(classifyOrphanSubjectBooking(orphan, single, null)?.target, { subjectId: 'NEW', subjectName: 'Gói mới', curriculumLink: 'https://x' })
  assert.equal(classifyOrphanSubjectBooking(orphan, single, null)?.blocker, null)
  assert.equal(classifyOrphanSubjectBooking(booking({ subjectId: 'NEW' }), single, null), null)
  assert.equal(classifyOrphanSubjectBooking(booking({ subjectId: '' }), single, null)?.target?.subjectId, 'NEW')
  assert.equal(classifyOrphanSubjectBooking(booking({ subjectId: 'OLD', status: 'released' }), single, null), null)

  const two = { subjects: [{ subjectId: 'NEW', subjectName: 'A' }, { subjectId: 'OTHER', subjectName: 'B' }] } as unknown as Student
  assert.equal(classifyOrphanSubjectBooking(orphan, two, null)?.blocker, 'multiple_packages')

  // Ngọc Phương: two old-subject slots linked to a pending 50-minute lesson on the current package.
  const pendingLinked = booking({ subjectId: 'OLD', lessonId: 'lp' })
  assert.equal(classifyOrphanSubjectBooking(pendingLinked, single, lesson({ id: 'lp', status: 'pending', subjectId: 'NEW' }))?.blocker, null)
  assert.equal(classifyOrphanSubjectBooking(pendingLinked, single, lesson({ id: 'lp', status: 'pending', subjectId: 'ELSE' }))?.blocker, 'lesson_subject_differs')
  // Already settled by an approved lesson: handled by the close section instead.
  assert.equal(classifyOrphanSubjectBooking(booking({ subjectId: 'OLD', lessonId: 'l1' }), single, lesson({})), null)
})

test('remaining minutes follow remaining diamonds at the package conversion rate', () => {
  // Image 3: 3.225 phút = 3.225 kim cương đăng ký, còn 210 kim cương.
  assert.equal(courseRemainingMinutes({ registeredMinutes: 3225, registeredDiamonds: 3225, remainingDiamonds: 210 }), 210)
  assert.equal(courseRemainingMinutes({ registeredMinutes: 2000, registeredDiamonds: 2800, remainingDiamonds: 280 }), 200)
  assert.equal(courseRemainingMinutes({ registeredMinutes: 0, registeredDiamonds: 0, remainingDiamonds: 40 }), 40)
  assert.equal(courseLearnedDiamondPremium({ registeredMinutes: 3225, registeredDiamonds: 3225, learnedMinutes: 2100, learnedDiamonds: 2490 }), 390)
})
