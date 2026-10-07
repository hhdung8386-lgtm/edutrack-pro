import assert from 'node:assert/strict'
import test from 'node:test'
import { planLessonCurrencyCorrection } from '../src/lib/lessonCurrencyCorrection.ts'

const lesson = { status: 'approved', currency: 'PHP', minutes: 50, pricePerMinute: 833.34, teacherLevel: 1 }
const rate = { price: 833.34, currency: 'VND' }
test('historical PHP label is corrected without converting the VND amount', () => {
  assert.deepEqual(planLessonCurrencyCorrection(lesson, rate, [{ paid: false }]), { currency: 'VND', salary: 41667 })
  assert.deepEqual(planLessonCurrencyCorrection({ ...lesson, currency: 'VND' }, rate, [{ paid: false }]), { currency: 'VND', salary: 41667 })
})
test('paid and reopened-paid records are protected', () => {
  assert.throws(() => planLessonCurrencyCorrection(lesson, rate, [{ paid: true }]), /thanh toán/)
  assert.throws(() => planLessonCurrencyCorrection({ ...lesson, payrollPaidBeforeReopen: true }, rate, []), /thanh toán/)
  assert.doesNotThrow(() => planLessonCurrencyCorrection(lesson, rate, [{ paid: true, voided: true }]))
})
test('ambiguous pricing, missing snapshots and special compensation are blocked', () => {
  assert.throws(() => planLessonCurrencyCorrection(lesson, { ...rate, price: 900 }, []), /chưa khớp/)
  assert.throws(() => planLessonCurrencyCorrection({ ...lesson, teacherLevel: undefined }, rate, []), /chưa khớp/)
  assert.throws(() => planLessonCurrencyCorrection({ ...lesson, status: 'pending' }, rate, []), /đã duyệt/)
  assert.throws(() => planLessonCurrencyCorrection({ ...lesson, classHuntCompensation: {} }, rate, []), /đặc biệt/)
})
