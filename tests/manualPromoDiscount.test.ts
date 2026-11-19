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

test('course SALE diamonds keep the minutes and match the per-session charge', async () => {
  const { courseSaleDiamonds } = await import('../src/lib/manualPromoDiscount.ts')
  // Khớp đúng các khóa giáo vụ đã tự tính tay trên production.
  assert.equal(courseSaleDiamonds(300, 30), 216) // Vy Kim: 12 ca x 18 KC
  assert.equal(courseSaleDiamonds(600, 30), 432)
  assert.equal(courseSaleDiamonds(1200, 40), 720)
  assert.equal(courseSaleDiamonds(750, 50), 390)
  assert.equal(courseSaleDiamonds(1500, 50), 780)
  assert.equal(courseSaleDiamonds(500, 10), 460)
  // Không giảm / mức không hợp lệ → giữ nguyên số đã nhập.
  assert.equal(courseSaleDiamonds(500, 0), 500)
  assert.equal(courseSaleDiamonds('500', '7'), 500)
  assert.equal(courseSaleDiamonds(0, 30), 0)
  assert.equal(courseSaleDiamonds('abc', 30), 0)
  // Số không chia hết 25 vẫn làm tròn nguyên, tối thiểu 1.
  assert.equal(courseSaleDiamonds(1, 50), 1)
  assert.equal(courseSaleDiamonds(510, 30), 367)
})

test('course SALE price per minute drops by the percent for VND only', async () => {
  const { courseSalePricePerMinute } = await import('../src/lib/manualPromoDiscount.ts')
  assert.equal(courseSalePricePerMinute(1333, 40, 'VND'), 800) // CAP3 Khóa 2 SALE -40%
  assert.equal(courseSalePricePerMinute(1167, 30), 817) // khớp lương lớp ưu đãi Vy Kim
  assert.equal(courseSalePricePerMinute(1333, 0, 'VND'), 1333)
  assert.equal(courseSalePricePerMinute(1333, undefined, 'VND'), 1333)
  assert.equal(courseSalePricePerMinute(0.5, 40, 'USD'), 0.5)
  assert.equal(courseSalePricePerMinute(0, 40, 'VND'), 0)
})
