import assert from 'node:assert/strict'
import test from 'node:test'
import { planCourseSaleApprovedLessonReprice, planCourseSaleBookingReprice } from '../src/lib/courseSaleBookings.ts'
import { resolveCourseSaleApprovalTerms } from '../src/lib/lenientLessonApproval.ts'

const course = { subjectId: 'L1', pricePerMinute: 833, currency: 'VND' }
const base = { subjectId: 'L1', teacherId: 't1', requestedMinutes: 25, requestedPoints: 25, pointsPer25Minutes: 25 }

test('SALE reprices only regular manual sessions that are not settled yet', () => {
  const plan = planCourseSaleBookingReprice({
    course,
    discountPercent: 50,
    approvedLessonIds: new Set(['approved']),
    teacherLevels: { t1: 1 },
    batchId: 'b1',
    bookings: [
      { ...base, id: 'held', status: 'confirmed' },
      { ...base, id: 'pending', status: 'pending' },
      { ...base, id: 'rejectedLesson', status: 'completed', lessonId: 'rejected' },
      { ...base, id: 'approvedLesson', status: 'completed', lessonId: 'approved' },
      { ...base, id: 'released', status: 'released' },
      { ...base, id: 'otherCourse', status: 'confirmed', subjectId: 'X' },
      { ...base, id: 'hunt', status: 'confirmed', classHuntId: 'hunt_1', pointsPer25Minutes: 13 },
      { ...base, id: 'explicitRegular', status: 'confirmed', classHuntPromoDiscountPercent: 0 },
    ] as never,
  })
  assert.deepEqual(plan.updates.map((update) => update.id), ['held', 'pending', 'rejectedLesson'])
  const first = plan.updates[0]
  assert.equal(first.fields.pointsPer25Minutes, 13)
  assert.equal(first.fields.requestedPoints, 13)
  assert.equal(first.fields.classHuntId, 'manual-promo-b1')
  assert.deepEqual(first.fields.classHuntCompensation, { version: 1, ratePerMinute: 417, currency: 'VND', formula: 'flat_per_minute' })
  assert.equal(first.fields.classHuntPromoDiscountPercent, 50)
  // Chỉ ca đang giữ chỗ làm giảm số kim cương giữ: 2 ca x (25 → 13).
  assert.equal(plan.heldDelta, -24)
})

test('no discount or no VND price changes nothing', () => {
  const bookings = [{ ...base, id: 'held', status: 'confirmed' }] as never
  assert.equal(planCourseSaleBookingReprice({ course, discountPercent: 0, approvedLessonIds: new Set(), teacherLevels: {}, batchId: 'b', bookings }).updates.length, 0)
  const noPrice = planCourseSaleBookingReprice({ course: { subjectId: 'L1', pricePerMinute: 0 }, discountPercent: 30, approvedLessonIds: new Set(), teacherLevels: {}, batchId: 'b', bookings })
  assert.equal(noPrice.updates.length, 0)
  assert.deepEqual(noPrice.missingPriceBookingIds, ['held'])
})

test('50-minute session at a 35-diamond tutor keeps the rounding of manual promo', () => {
  const plan = planCourseSaleBookingReprice({
    course, discountPercent: 30, approvedLessonIds: new Set(), teacherLevels: { t1: 1.2 }, batchId: 'b',
    bookings: [{ ...base, id: 'a', status: 'confirmed', requestedMinutes: 50, requestedPoints: 70, pointsPer25Minutes: 35 }] as never,
  })
  assert.equal(plan.updates[0].fields.pointsPer25Minutes, 25)
  assert.equal(plan.updates[0].fields.requestedPoints, 50)
  assert.equal(plan.updates[0].fields.classHuntCompensation.ratePerMinute, Math.round(833 * 1.2 * 0.7))
  assert.equal(plan.heldDelta, -20)
})

test('planCourseSaleApprovedLessonReprice syncs over-deducted approved SALE lessons and skips synced/Class Hunting/non-approved', () => {
  const plan = planCourseSaleApprovedLessonReprice({
    course: { subjectId: 'CAP2', promoDiscountPercent: 40 },
    teacherPoints: { t1: 25 },
    lessons: [
      { id: 'l1', status: 'approved', subjectId: 'CAP2', teacherId: 't1', minutes: 50, date: '2026-11-11', points: 50, pointsPer25Minutes: 25 },
      { id: 'l2', status: 'approved', subjectId: 'CAP2', teacherId: 't1', minutes: 50, date: '2026-11-09', points: 50, pointsPer25Minutes: 25 },
      { id: 'alreadySynced', status: 'approved', subjectId: 'CAP2', teacherId: 't1', minutes: 50, date: '2026-11-08', points: 30, pointsPer25Minutes: 15 },
      { id: 'pendingLesson', status: 'pending', subjectId: 'CAP2', teacherId: 't1', minutes: 50, date: '2026-11-12', points: 50, pointsPer25Minutes: 25 },
      { id: 'classHunt', status: 'approved', subjectId: 'CAP2', teacherId: 't1', minutes: 50, date: '2026-11-07', points: 50, pointsPer25Minutes: 25, classHuntId: 'hunt_99' },
      { id: 'zeroMin', status: 'approved', subjectId: 'CAP2', teacherId: 't1', minutes: 0, date: '2026-11-06', points: 0, pointsPer25Minutes: 25 },
      { id: 'otherCourse', status: 'approved', subjectId: 'OTHER', teacherId: 't1', minutes: 50, date: '2026-11-05', points: 50, pointsPer25Minutes: 25 },
    ],
  })
  assert.equal(plan.percent, 40)
  assert.deepEqual(plan.updates.map((u) => u.id), ['l1', 'l2'])
  assert.equal(plan.totalBefore, 100)
  assert.equal(plan.totalAfter, 60)
  assert.equal(plan.refundDiamonds, 40)
  assert.equal(plan.updates[0].rateAfter, 15)
  assert.equal(plan.updates[0].pointsAfter, 30)
})

test('resolveCourseSaleApprovalTerms applies SALE discount to both points and price when no Class Hunting snapshot', () => {
  const salePkg = {
    subjectId: 'CAP2',
    subjectName: 'VN-SINGLE-BGD-CAP2',
    totalSessions: 48,
    usedSessions: 0,
    remainingSessions: 48,
    minutesPerSession: 25,
    totalMinutes: 720,
    usedMinutes: 0,
    remainingMinutes: 720,
    pricePerMinute: 1200,
    currency: 'VND',
    promoDiscountPercent: 40,
  }
  const terms = resolveCourseSaleApprovalTerms({
    lesson: { minutes: 50, attendanceStatus: 'present', pointsPer25Minutes: 25, teacherLevel: 1 },
    bookings: [],
    teacher: { pointsPer25Minutes: 25, country: 'VN', level: 1 },
    subjectPackage: salePkg,
    classHuntCompensation: null,
    isZeroMinuteExcusedAbsence: false,
  })
  assert.equal(terms.pointsPer25Minutes, 15)
  assert.equal(terms.lessonPoints, 30)
  assert.equal(terms.pricePerMinute, 720)
  assert.equal(terms.appliedCourseSalePercent, 40)

  // Must not double-discount when classHuntCompensation is already present.
  const withHunt = resolveCourseSaleApprovalTerms({
    lesson: { minutes: 50, attendanceStatus: 'present', pointsPer25Minutes: 15, teacherLevel: 1 },
    bookings: [{ id: 'b1', requestedMinutes: 50, pointsPer25Minutes: 15, requestedPoints: 30 } as never],
    teacher: { pointsPer25Minutes: 25, country: 'VN', level: 1 },
    subjectPackage: salePkg,
    classHuntCompensation: { version: 1, ratePerMinute: 720, currency: 'VND', formula: 'flat_per_minute' },
    isZeroMinuteExcusedAbsence: false,
  })
  assert.equal(withHunt.pointsPer25Minutes, 15)
  assert.equal(withHunt.lessonPoints, 30)
  assert.equal(withHunt.pricePerMinute, 720)
  assert.equal(withHunt.appliedCourseSalePercent, 0)
})
