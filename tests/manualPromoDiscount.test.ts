import test from 'node:test'
import assert from 'node:assert/strict'
import {
  manualPromoCompensation,
  manualPromoPointsPer25Minutes,
  manualRegularPayPerMinute,
  normalizeManualPromoDiscount,
} from '../src/lib/manualPromoDiscount.ts'
import { classHuntCompensationFromBookings, isClassHuntCompensation } from '../src/lib/classHuntCompensation.ts'

test('only listed percents are accepted, anything else is "no discount"', () => {
  assert.equal(normalizeManualPromoDiscount('30'), 30)
  assert.equal(normalizeManualPromoDiscount(0), 0)
  assert.equal(normalizeManualPromoDiscount(5), 0)
  assert.equal(normalizeManualPromoDiscount(60), 0)
  assert.equal(normalizeManualPromoDiscount('abc'), 0)
})

test('diamonds per 25 minutes drop by the percent, whole number, min 1', () => {
  assert.equal(manualPromoPointsPer25Minutes(25, 0), 25)
  assert.equal(manualPromoPointsPer25Minutes(25, 30), 18)
  assert.equal(manualPromoPointsPer25Minutes(25, 50), 13)
  assert.equal(manualPromoPointsPer25Minutes(1, 50), 1)
})

test('tutor pay = package price x level, reduced by the percent', () => {
  const pkg = { pricePerMinute: 833, currency: 'VND' }
  assert.deepEqual(manualRegularPayPerMinute(pkg, 1), { price: 833, currency: 'VND' })
  const comp = manualPromoCompensation(pkg, 1, 50)
  assert.deepEqual(comp, { version: 1, ratePerMinute: 417, currency: 'VND', formula: 'flat_per_minute' })
  assert.equal(isClassHuntCompensation(comp), true)
  assert.equal(manualPromoCompensation(pkg, 2, 10)?.ratePerMinute, 1499)
})

test('no VND price or no discount -> no snapshot', () => {
  assert.equal(manualPromoCompensation({ pricePerMinute: 0 }, 1, 30), null)
  assert.equal(manualPromoCompensation({ pricePerMinute: 2, currency: 'USD' }, 1, 30), null)
  assert.equal(manualPromoCompensation({ pricePerMinute: 833, currency: 'VND' }, 1, 0), null)
})

test('payroll reads the snapshot from a manual promo booking', () => {
  const comp = manualPromoCompensation({ pricePerMinute: 833, currency: 'VND' }, 1, 30)!
  const booking = { classHuntId: 'manual-promo-abc', classHuntCompensation: comp }
  assert.deepEqual(classHuntCompensationFromBookings([booking]), comp)
  // Ca thường không bị ảnh hưởng.
  assert.equal(classHuntCompensationFromBookings([{}]), null)
})
