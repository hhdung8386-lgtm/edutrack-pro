const test = require('node:test')
const assert = require('node:assert/strict')
const { createCourseSubjectId, getCatalogSubjectId } = require('../lib/courseIdentity')
const { coursePromoDiscount, resolveClassHuntSubjectFund, classHuntSubjectAvailability,
  classHuntSubjectRate, classHuntCurriculumLinks, classHuntPromoPointsPer25Minutes,
  classHuntPromoCompensation, teacherMatchesClassHuntSubject } = require('../lib/classHunting')
const { parentProfileBookingQuota } = require('../lib/parentProfileBooking')

const second = createCourseSubjectId('english', 'a'.repeat(32))
const rows = [
  { subjectId: 'english', subjectName: 'English', totalMinutes: 500, usedMinutes: 100, promoDiscountPercent: 0 },
  { subjectId: second, subjectName: 'English · Khóa 2', totalMinutes: 250, usedMinutes: 0, pricePerMinute: 1000,
    currency: 'VND', curriculumLink: 'https://example.com/course-2', promoDiscountPercent: 30 },
]

test('omitted override inherits only the selected course; explicit regular and custom SALE still work', () => {
  assert.equal(coursePromoDiscount(rows, second, {}), 30)
  assert.equal(coursePromoDiscount(rows, 'english', {}), undefined)
  assert.equal(coursePromoDiscount(rows, second, { promoDiscountPercent: null }), undefined)
  assert.equal(coursePromoDiscount(rows, second, { promoDiscountPercent: 50 }), 50)
  assert.equal(coursePromoDiscount(rows, 'missing', {}), undefined)
  assert.throws(() => coursePromoDiscount(rows, second, { promoDiscountPercent: 99 }))
})

test('class hunting holds, curriculum, price and parent booking resolve the same concrete course', () => {
  const student = { subjects: rows, reservedMinutes: 36 }
  const bookings = [{ subjectId: second, status: 'confirmed', requestedMinutes: 50, pointsPer25Minutes: 18 }]
  assert.equal(resolveClassHuntSubjectFund(student, 'english').remainingMinutes, 400)
  assert.equal(resolveClassHuntSubjectFund(student, second).remainingMinutes, 250)
  assert.equal(classHuntSubjectAvailability({ student, subjectId: second, bookings }).availablePoints, 214)
  assert.equal(classHuntSubjectAvailability({ student, subjectId: 'english', bookings }).availablePoints, 400)
  assert.equal(classHuntSubjectRate(student, second).pricePerMinute, 1000)
  assert.equal(classHuntCurriculumLinks(student, second).curriculumLink, 'https://example.com/course-2')
  assert.equal(parentProfileBookingQuota(student, second).subjectRemainingPoints, 250)
  assert.equal(getCatalogSubjectId(second), 'english')
  assert.equal(teacherMatchesClassHuntSubject({ subjectIds: ['english'] }, second), true)
})

test('class hunt default and manual discount use the same existing whole-number price/pay rules', () => {
  const percent = coursePromoDiscount(rows, second, {})
  assert.equal(classHuntPromoPointsPer25Minutes(25, percent), 18)
  const pay = classHuntPromoCompensation({ pricePerMinute: 1000, currency: 'VND', teacherLevel: 2, discountPercent: percent })
  assert.equal(pay.ratePerMinute, 1400)
})
