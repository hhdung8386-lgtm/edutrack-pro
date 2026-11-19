import assert from 'node:assert/strict'
import test from 'node:test'
import { planCourseSaleBookingReprice } from '../src/lib/courseSaleBookings.ts'

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
