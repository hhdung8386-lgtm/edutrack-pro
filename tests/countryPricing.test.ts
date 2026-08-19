import assert from 'node:assert/strict'
import test from 'node:test'
import { getCanonicalSubjectRate, getCountryRate } from '../src/lib/countryPricing.ts'
import { formatMoney, formatMoneyTotals, formatPricePerMinute } from '../src/lib/constants.ts'

test('one canonical subject rate applies to every teacher country', () => {
  const legacySubject = {
    pricePerMinute: 2500,
    currency: 'VND',
    pricePerMinuteVN: 2500,
    pricePerMinutePH: 6,
    pricePerMinuteNative: 0.12,
    countryPrices: {
      PH: { price: 6, currency: 'PHP' },
      US: { price: 0.12, currency: 'USD' },
    },
  }

  assert.deepEqual(getCountryRate(legacySubject, 'VN'), { price: 2500, currency: 'VND' })
  assert.deepEqual(getCountryRate(legacySubject, 'PH'), { price: 2500, currency: 'VND' })
  assert.deepEqual(getCountryRate(legacySubject, 'US'), { price: 2500, currency: 'VND' })
})

test('legacy data without canonical price selects one fixed default for every country', () => {
  const legacySubject = {
    countryPrices: {
      VN: { price: 3000, currency: 'VND', isDefault: true },
      PH: { price: 7, currency: 'PHP' },
    },
  }

  assert.deepEqual(getCanonicalSubjectRate(legacySubject), { price: 3000, currency: 'VND' })
  assert.deepEqual(getCountryRate(legacySubject as { pricePerMinute: number }, 'PH'), { price: 3000, currency: 'VND' })
})

test('price label always includes the canonical currency code', () => {
  assert.equal(formatPricePerMinute(1.75, 'PHP'), 'PHP 1.75/phút')
  assert.equal(formatPricePerMinute(2000, 'VND'), 'VND 2.000/phút')
  assert.equal(formatPricePerMinute(0.12, 'USD'), 'USD 0.12/phút')
  assert.equal(formatMoney(525000, 'VND'), 'VND 525.000')
  assert.equal(formatMoney(1.75, 'PHP'), 'PHP 1.75')
  assert.equal(formatMoney(0.12, 'USD'), 'USD 0.12')
  assert.equal(formatMoneyTotals([
    { amount: 525000, currency: 'VND' },
    { amount: 1.75, currency: 'PHP' },
  ]), 'VND 525.000 + PHP 1.75')
})
