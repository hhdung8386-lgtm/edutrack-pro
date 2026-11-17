import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createCourseSubjectId, getCatalogSubjectId } from '../src/lib/courseIdentity.ts'
import { getStudentSubjectMinuteFunds, resolveStudentSubjectFund } from '../src/lib/studentQuotaCore.ts'
import { pickApprovalSubjectPackageIndex } from '../src/lib/lenientLessonApproval.ts'
import { courseDeletionBlock, studentFieldsAfterCourseRemoval } from '../src/lib/courseDeletion.ts'
import { buildStudentSubjectNamePatch } from '../src/lib/subjectNameSyncCore.ts'
import { editCourseEntry } from '../src/lib/studentCourseLedger.ts'
import { manualPromoCompensation, manualPromoPointsPer25Minutes } from '../src/lib/manualPromoDiscount.ts'
import type { Student, StudentSubject } from '../src/types/index.ts'

const secondId = createCourseSubjectId('english', 'a'.repeat(32))
const thirdId = createCourseSubjectId('english', 'b'.repeat(32))
const course = (subjectId: string, subjectName: string, totalMinutes: number, usedMinutes = 0): StudentSubject => ({
  subjectId, subjectName, totalMinutes, usedMinutes, remainingMinutes: totalMinutes - usedMinutes,
  totalSessions: totalMinutes / 25, usedSessions: usedMinutes / 25,
  remainingSessions: (totalMinutes - usedMinutes) / 25, minutesPerSession: 25,
  pricePerMinute: 1000, currency: 'VND',
  batches: [{ id: '1', createdAt: '17/11/2026', totalSessions: totalMinutes / 25, diamonds: totalMinutes, learningMinutes: totalMinutes }],
})

test('3 courses of the same catalog subject retain separate fund keys; legacy keys stay unchanged', () => {
  const subjects = [course('english', 'English', 500, 100), course(secondId, 'English · Khóa 2', 250), course(thirdId, 'English · Khóa 3', 750)]
  const funds = getStudentSubjectMinuteFunds({ subjects })
  assert.equal(funds.length, 3)
  assert.deepEqual(funds.map((fund) => fund.remainingMinutes), [400, 250, 750])
  assert.equal(resolveStudentSubjectFund({ subjects }, secondId)?.remainingMinutes, 250)
  assert.deepEqual(subjects.map((subject) => getCatalogSubjectId(subject.subjectId)), ['english', 'english', 'english'])
  assert.equal(getCatalogSubjectId('course__not_a_generated_key'), 'course__not_a_generated_key')
})

test('approval never spends another course even when that course has more diamonds', () => {
  const subjects = [course('english', 'English', 500), course(secondId, 'English · Khóa 2', 25)]
  assert.equal(pickApprovalSubjectPackageIndex(subjects, secondId, 50), 1)
  assert.equal(pickApprovalSubjectPackageIndex(subjects, 'english', 50), 0)
})

test('a hold or counted lesson blocks only its own course; removing another course keeps totals', () => {
  const subjects = [course('english', 'English', 500, 100), course(secondId, 'English · Khóa 2', 250)]
  assert.equal(courseDeletionBlock('english', [], [{ subjectId: secondId }]), null)
  assert.equal(courseDeletionBlock(secondId, [], [{ subjectId: secondId }]), 'held-bookings')
  assert.equal(courseDeletionBlock(secondId, [{ subjectId: secondId, status: 'approved' }], []), 'counted-lessons')
  const result = studentFieldsAfterCourseRemoval(subjects, secondId, 'reserved')
  assert.equal(result.totalMinutes, 500)
  assert.equal(result.usedMinutes, 100)
  assert.equal(result.remainingMinutes, 400)
  assert.equal(result.status, 'reserved')
})

test('editing a payment batch in course 2 leaves course 1 and its SALE untouched', () => {
  const subjects = [course('english', 'English', 500, 100), { ...course(secondId, 'English · Khóa 2', 250), promoDiscountPercent: 30 }]
  const student = { subjects, status: 'active' } as Student
  const result = editCourseEntry({ student, subjectId: secondId, batchId: '1', fallbackDate: '17/11/2026',
    input: { learningMinutes: 300, diamonds: 300, content: 'Đợt 1', paymentDate: '17/11/2026', note: '' },
    heldPointsForSubject: 0, totalHeldPoints: 0, linkedTopUpTransaction: false })
  assert.deepEqual(result.subjects[0], subjects[0])
  assert.equal(result.subjects[1].remainingMinutes, 300)
  assert.equal(result.subjects[1].promoDiscountPercent, 30)
  assert.equal(result.totals.remainingMinutes, 700)
})

test('catalog rename preserves course identity, number, price and discount', () => {
  const subjects = [course('english', 'English', 500), { ...course(secondId, 'English · Khóa 2', 250), promoDiscountPercent: 30 }]
  const patch = buildStudentSubjectNamePatch({ subjectId: secondId, subjectName: subjects[1].subjectName, subjects }, 'english', 'Tiếng Anh')!
  const updated = patch.subjects as StudentSubject[]
  assert.equal(patch.subjectName, 'Tiếng Anh · Khóa 2')
  assert.equal(updated[1].subjectName, 'Tiếng Anh · Khóa 2')
  assert.equal(updated[1].subjectId, secondId)
  assert.equal(updated[1].pricePerMinute, 1000)
  assert.equal(updated[1].promoDiscountPercent, 30)
})

test('SALE and operator overrides produce existing immutable diamond/pay snapshots', () => {
  const pkg = { ...course(secondId, 'English · Khóa 2', 500), promoDiscountPercent: 30 }
  assert.equal(manualPromoPointsPer25Minutes(25, pkg.promoDiscountPercent), 18)
  const snapshot = manualPromoCompensation(pkg, 2, pkg.promoDiscountPercent)!
  assert.equal(snapshot.ratePerMinute, 1400)
  assert.equal(manualPromoPointsPer25Minutes(25, 50), 13)
  assert.equal(manualPromoPointsPer25Minutes(25, 0), 25)
  pkg.promoDiscountPercent = 50
  assert.equal(snapshot.ratePerMinute, 1400)
})

test('browser and backend decode identical course keys', () => {
  assert.equal(readFileSync(new URL('../src/lib/courseIdentity.ts', import.meta.url), 'utf8'), readFileSync(new URL('../functions/src/courseIdentity.ts', import.meta.url), 'utf8'))
  assert.throws(() => createCourseSubjectId('english', 'not-a-token'))
  assert.throws(() => createCourseSubjectId(secondId, 'c'.repeat(32)))
})
