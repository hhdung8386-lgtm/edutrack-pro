import assert from 'node:assert/strict'
import test from 'node:test'
import type { Student } from '../src/types/index.ts'
import {
  areCoursePackagesUnchanged,
  appendCourseBatch,
  deleteCourseEntry,
  editCourseEntry,
  getCourseEntry,
  getRemainingAfterFundChange,
  getStatusAfterCourseRightsAdded,
} from '../src/lib/studentCourseLedger.ts'

test('snapshot comparison accepts reordered Firestore map fields, including nested payment maps', () => {
  const subjects = studentFixture().subjects!
  const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)]))
      : value
  assert.equal(areCoursePackagesUnchanged(reorder(subjects) as typeof subjects, subjects), true)
})

test('rounded overview counters are not a valid persisted form baseline', () => {
  const subjects = studentFixture().subjects!
  subjects[0] = { ...subjects[0], totalMinutes: 1200, usedMinutes: 18, remainingMinutes: 1182, usedSessions: 0.72, remainingSessions: 47.28 }
  const display = subjects.map((course) => ({ ...course, remainingSessions: Math.floor(course.remainingMinutes / course.minutesPerSession) }))
  assert.equal(areCoursePackagesUnchanged(subjects, display), false)
  assert.equal(areCoursePackagesUnchanged(subjects, subjects.map((course) => ({ ...course }))), true)
})

test('snapshot comparison rejects genuine concurrent top-up or attendance counter changes', () => {
  const subjects = studentFixture().subjects!
  for (const field of ['totalMinutes', 'usedMinutes', 'remainingMinutes', 'totalSessions', 'usedSessions', 'remainingSessions'] as const) {
    const changed = subjects.map((course) => ({ ...course, [field]: course[field] + 1 }))
    assert.equal(areCoursePackagesUnchanged(changed, subjects), false, field)
  }
})

test('snapshot comparison rejects another operator changing SALE or course metadata', () => {
  const subjects = studentFixture().subjects!
  assert.equal(areCoursePackagesUnchanged(subjects.map((course) => ({ ...course, promoDiscountPercent: 30 })), subjects), false)
  assert.equal(areCoursePackagesUnchanged(subjects.map((course) => ({ ...course, timetableNote: 'Changed by another operator' })), subjects), false)
  assert.equal(areCoursePackagesUnchanged([], subjects), false)
})

test('snapshot comparison retains payment FIFO order as part of the stale-write guard', () => {
  const subjects = studentFixture().subjects!
  const changed = subjects.map((course) => ({ ...course, batches: [...(course.batches || [])].reverse() }))
  assert.equal(areCoursePackagesUnchanged(changed, subjects), false)
})

function studentFixture(): Student {
  return {
    id: 'student-1',
    code: 'HS001',
    name: 'Học viên',
    parentPhone: '0900000000',
    subjectId: 'english',
    subjectName: 'Tiếng Anh',
    totalSessions: 30,
    usedSessions: 8,
    remainingSessions: 22,
    minutesPerSession: 25,
    totalMinutes: 750,
    usedMinutes: 200,
    remainingMinutes: 550,
    status: 'active',
    subjects: [{
      subjectId: 'english',
      subjectName: 'Tiếng Anh',
      totalSessions: 30,
      usedSessions: 8,
      remainingSessions: 22,
      minutesPerSession: 25,
      totalMinutes: 750,
      usedMinutes: 200,
      remainingMinutes: 550,
      pricePerMinute: 0,
      batches: [
        { id: 'batch-1', createdAt: '01/08/2026', totalSessions: 20, kind: 'payment', learningMinutes: 500, diamonds: 500, content: 'Đợt 1' },
        { id: 'batch-2', createdAt: '10/08/2026', totalSessions: 10, kind: 'payment', learningMinutes: 250, diamonds: 250, content: 'Đợt 2' },
      ],
    }],
    createdAt: {} as Student['createdAt'],
    updatedAt: {} as Student['updatedAt'],
  }
}

const editInput = {
  learningMinutes: 250,
  diamonds: 250,
  content: 'Thanh toán đợt 2',
  paymentDate: '10/08/2026',
  note: 'Đã kiểm tra',
}

test('editing metadata preserves every course quota total', () => {
  const result = editCourseEntry({
    student: studentFixture(),
    subjectId: 'english',
    batchId: 'batch-2',
    fallbackDate: '01/08/2026',
    input: editInput,
    heldPointsForSubject: 100,
    totalHeldPoints: 100,
    linkedTopUpTransaction: false,
  })

  assert.equal(result.totals.totalMinutes, 750)
  assert.equal(result.totals.usedMinutes, 200)
  assert.equal(result.totals.remainingMinutes, 550)
  assert.equal(result.updatedBatch.note, 'Đã kiểm tra')
})

test('adding a fourth payment appends history without a three-installment limit', () => {
  const existing = [1, 2, 3].map((ordinal) => ({
    id: `batch-${ordinal}`,
    createdAt: `0${ordinal}/08/2026`,
    totalSessions: 10,
    kind: 'payment' as const,
    learningMinutes: 250,
    diamonds: 250,
    content: `Thanh toán đợt ${ordinal}`,
  }))
  const fourth = {
    id: 'batch-4',
    createdAt: '04/08/2026',
    totalSessions: 10,
    kind: 'payment' as const,
    learningMinutes: 250,
    diamonds: 250,
    content: 'Thanh toán đợt 4',
  }

  const result = appendCourseBatch(existing, fourth)
  assert.deepEqual(result.map((batch) => batch.id), ['batch-1', 'batch-2', 'batch-3', 'batch-4'])
  assert.equal(existing.length, 3)
})

test('adding course rights reactivates expired students but preserves a manual reservation', () => {
  assert.equal(getStatusAfterCourseRightsAdded('expired', 250), 'active')
  assert.equal(getStatusAfterCourseRightsAdded('active', 250), 'active')
  assert.equal(getStatusAfterCourseRightsAdded('reserved', 250), 'reserved')
  assert.equal(getStatusAfterCourseRightsAdded('reserved', 0), 'reserved')
})

test('editing diamonds updates subject and student aggregates by the same delta', () => {
  const result = editCourseEntry({
    student: studentFixture(),
    subjectId: 'english',
    batchId: 'batch-2',
    fallbackDate: '01/08/2026',
    input: { ...editInput, diamonds: 300 },
    heldPointsForSubject: 100,
    totalHeldPoints: 100,
    linkedTopUpTransaction: false,
  })

  assert.equal(result.subjects[0].totalMinutes, 800)
  assert.equal(result.subjects[0].usedMinutes, 200)
  assert.equal(result.subjects[0].remainingMinutes, 600)
  assert.equal(result.totals.totalMinutes, 800)
  assert.equal(result.totals.remainingMinutes, 600)
  assert.equal(result.subjects[0].totalMinutes, result.subjects[0].usedMinutes + result.subjects[0].remainingMinutes)
})

test('editing cannot reduce quota below diamonds already used', () => {
  const student = studentFixture()
  student.usedMinutes = 400
  student.remainingMinutes = 350
  student.usedSessions = 16
  student.remainingSessions = 14
  student.subjects = [{ ...student.subjects![0], usedMinutes: 400, remainingMinutes: 350, usedSessions: 16, remainingSessions: 14 }]

  assert.throws(() => editCourseEntry({
    student,
    subjectId: 'english',
    batchId: 'batch-1',
    fallbackDate: '01/08/2026',
    input: { ...editInput, diamonds: 1 },
    heldPointsForSubject: 0,
    totalHeldPoints: 0,
    linkedTopUpTransaction: false,
  }), /đã sử dụng/)
})

function overdrawnStudent(): Student {
  // Đã học 3.010 KC nhưng tổng chỉ 2.900 KC; đồng bộ lưu còn lại = 0.
  const student = studentFixture()
  student.totalMinutes = 2900
  student.usedMinutes = 3010
  student.remainingMinutes = 0
  student.subjects = [{
    ...student.subjects![0],
    totalMinutes: 2900,
    usedMinutes: 3010,
    remainingMinutes: 0,
    remainingSessions: 0,
    batches: [
      { id: 'batch-1', createdAt: '24/07/2026', totalSessions: 50, kind: 'payment', learningMinutes: 1250, diamonds: 1250, content: 'Thanh toán đợt 1' },
      { id: 'batch-2', createdAt: '24/07/2026', totalSessions: 10, kind: 'payment', learningMinutes: 250, diamonds: 250, content: 'Thanh toán đợt 2' },
      { id: 'batch-3', createdAt: '25/07/2026', totalSessions: 56, kind: 'payment', learningMinutes: 1400, diamonds: 1400, content: 'Thanh toán đợt 3' },
    ],
  }]
  return student
}

test('overdrawn course can raise an under-entered installment and repays the overdraft first', () => {
  const result = editCourseEntry({
    student: overdrawnStudent(),
    subjectId: 'english',
    batchId: 'batch-1',
    fallbackDate: '24/07/2026',
    input: { ...editInput, learningMinutes: 1250, diamonds: 1750, content: 'Thanh toán đợt 1', paymentDate: '24/07/2026' },
    heldPointsForSubject: 105,
    totalHeldPoints: 105,
    linkedTopUpTransaction: false,
  })

  assert.equal(result.subjects[0].totalMinutes, 3400)
  assert.equal(result.subjects[0].usedMinutes, 3010)
  assert.equal(result.subjects[0].remainingMinutes, 390)
  assert.equal(result.totals.remainingMinutes, 390)
  assert.equal(result.updatedBatch.diamonds, 1750)
  assert.equal(result.status, 'active')
})

test('overdrawn course accepts a raise that still leaves it overdrawn and metadata-only edits', () => {
  const partial = editCourseEntry({
    student: overdrawnStudent(),
    subjectId: 'english',
    batchId: 'batch-1',
    fallbackDate: '24/07/2026',
    input: { ...editInput, learningMinutes: 1250, diamonds: 1300 },
    heldPointsForSubject: 105,
    totalHeldPoints: 105,
    linkedTopUpTransaction: false,
  })
  assert.equal(partial.subjects[0].totalMinutes, 2950)
  assert.equal(partial.subjects[0].remainingMinutes, 0)

  const metadata = editCourseEntry({
    student: overdrawnStudent(),
    subjectId: 'english',
    batchId: 'batch-2',
    fallbackDate: '24/07/2026',
    input: { ...editInput, content: 'Đã đối soát' },
    heldPointsForSubject: 105,
    totalHeldPoints: 105,
    linkedTopUpTransaction: false,
  })
  assert.equal(metadata.subjects[0].remainingMinutes, 0)
  assert.equal(metadata.updatedBatch.content, 'Đã đối soát')
})

test('overdrawn course still rejects reducing an installment', () => {
  assert.throws(() => editCourseEntry({
    student: overdrawnStudent(),
    subjectId: 'english',
    batchId: 'batch-1',
    fallbackDate: '24/07/2026',
    input: { ...editInput, learningMinutes: 1250, diamonds: 1200 },
    heldPointsForSubject: 0,
    totalHeldPoints: 0,
    linkedTopUpTransaction: false,
  }), /đã sử dụng/)
})

test('a genuinely inconsistent ledger is still rejected', () => {
  const student = studentFixture()
  student.subjects = [{ ...student.subjects![0], remainingMinutes: 999 }]
  assert.throws(() => editCourseEntry({
    student,
    subjectId: 'english',
    batchId: 'batch-1',
    fallbackDate: '01/08/2026',
    input: { ...editInput, diamonds: 600 },
    heldPointsForSubject: 0,
    totalHeldPoints: 0,
    linkedTopUpTransaction: false,
  }), /đang lệch/)
})

test('remaining after a top-up repays an overdraft but is unchanged for healthy courses', () => {
  assert.equal(getRemainingAfterFundChange(overdrawnStudent().subjects![0], 500), 390)
  assert.equal(getRemainingAfterFundChange(overdrawnStudent().subjects![0], 50), 0)
  assert.equal(getRemainingAfterFundChange(studentFixture().subjects![0], 250), 800)
})

test('editing cannot reduce remaining quota below an active booking hold', () => {
  assert.throws(() => editCourseEntry({
    student: studentFixture(),
    subjectId: 'english',
    batchId: 'batch-1',
    fallbackDate: '01/08/2026',
    input: { ...editInput, diamonds: 100 },
    heldPointsForSubject: 200,
    totalHeldPoints: 200,
    linkedTopUpTransaction: false,
  }), /đang giữ/)
})

test('system top-up entries reject numeric edits but allow metadata corrections', () => {
  assert.throws(() => editCourseEntry({
    student: studentFixture(),
    subjectId: 'english',
    batchId: 'batch-2',
    fallbackDate: '01/08/2026',
    input: { ...editInput, diamonds: 300 },
    heldPointsForSubject: 0,
    totalHeldPoints: 0,
    linkedTopUpTransaction: true,
  }), /giao dịch nạp tự động/)

  const result = editCourseEntry({
    student: studentFixture(),
    subjectId: 'english',
    batchId: 'batch-2',
    fallbackDate: '01/08/2026',
    input: { ...editInput, content: 'Đã đối soát nội dung' },
    heldPointsForSubject: 0,
    totalHeldPoints: 0,
    linkedTopUpTransaction: true,
  })
  assert.equal(result.updatedBatch.content, 'Đã đối soát nội dung')
})

test('legacy course data is materialized without dropping quota fields', () => {
  const legacy = studentFixture()
  legacy.subjects = [{ ...legacy.subjects![0], batches: undefined }]
  const result = editCourseEntry({
    student: legacy,
    subjectId: 'english',
    batchId: 'legacy',
    fallbackDate: '01/08/2026',
    input: { ...editInput, learningMinutes: 750, diamonds: 750 },
    heldPointsForSubject: 0,
    totalHeldPoints: 0,
    linkedTopUpTransaction: false,
  })

  assert.equal(result.subjects[0].batches?.length, 1)
  assert.equal(result.subjects[0].batches?.[0].id, 'legacy')
  assert.equal(result.totals.totalMinutes, 750)
  assert.equal(result.totals.remainingMinutes, 550)
})

test('course entry exposes a stable ordinal for legacy display fallbacks', () => {
  const student = studentFixture()
  student.subjects = [{
    ...student.subjects![0],
    batches: student.subjects![0].batches?.map((batch) => ({ ...batch, content: undefined })),
  }]

  const entry = getCourseEntry(student, 'english', 'batch-2', '01/08/2026')
  assert.equal(entry?.ordinal, 2)
  assert.equal(entry?.batch.content, undefined)
})

test('deleting a manual entry removes only its quota and preserves ledger invariants', () => {
  const result = deleteCourseEntry({
    student: studentFixture(),
    subjectId: 'english',
    batchId: 'batch-2',
    heldPointsForSubject: 100,
    totalHeldPoints: 100,
    linkedTopUpTransaction: false,
  })

  assert.deepEqual(result.subjects[0].batches?.map((batch) => batch.id), ['batch-1'])
  assert.equal(result.deletedBatch.id, 'batch-2')
  assert.equal(result.subjects[0].totalMinutes, 500)
  assert.equal(result.subjects[0].usedMinutes, 200)
  assert.equal(result.subjects[0].remainingMinutes, 300)
  assert.equal(result.totals.totalMinutes, 500)
  assert.equal(result.totals.remainingMinutes, 300)
  assert.equal(result.subjects[0].totalMinutes, result.subjects[0].usedMinutes + result.subjects[0].remainingMinutes)
})

test('deleting rejects immutable automatic top-ups and legacy synthetic entries', () => {
  assert.throws(() => deleteCourseEntry({
    student: studentFixture(),
    subjectId: 'english',
    batchId: 'batch-2',
    heldPointsForSubject: 0,
    totalHeldPoints: 0,
    linkedTopUpTransaction: true,
  }), /giao dịch nạp tự động/)

  const legacy = studentFixture()
  legacy.subjects = [{ ...legacy.subjects![0], batches: undefined }]
  assert.throws(() => deleteCourseEntry({
    student: legacy,
    subjectId: 'english',
    batchId: 'legacy',
    heldPointsForSubject: 0,
    totalHeldPoints: 0,
    linkedTopUpTransaction: false,
  }), /Dữ liệu khóa học cũ/)
})

test('deleting the only entry is blocked so an empty synthetic course is not created', () => {
  const student = studentFixture()
  student.subjects = [{ ...student.subjects![0], batches: [student.subjects![0].batches![0]] }]

  assert.throws(() => deleteCourseEntry({
    student,
    subjectId: 'english',
    batchId: 'batch-1',
    heldPointsForSubject: 0,
    totalHeldPoints: 0,
    linkedTopUpTransaction: false,
  }), /đợt cộng quyền duy nhất/)
})

test('deleting cannot consume used quota or active booking holds', () => {
  const usedStudent = studentFixture()
  usedStudent.usedMinutes = 400
  usedStudent.remainingMinutes = 350
  usedStudent.subjects = [{ ...usedStudent.subjects![0], usedMinutes: 400, remainingMinutes: 350 }]
  assert.throws(() => deleteCourseEntry({
    student: usedStudent,
    subjectId: 'english',
    batchId: 'batch-1',
    heldPointsForSubject: 0,
    totalHeldPoints: 0,
    linkedTopUpTransaction: false,
  }), /đã được sử dụng/)

  assert.throws(() => deleteCourseEntry({
    student: studentFixture(),
    subjectId: 'english',
    batchId: 'batch-2',
    heldPointsForSubject: 400,
    totalHeldPoints: 400,
    linkedTopUpTransaction: false,
  }), /đang giữ/)
})

test('deleting a safe entry preserves a reserved student status', () => {
  const student = studentFixture()
  student.status = 'reserved'
  const result = deleteCourseEntry({
    student,
    subjectId: 'english',
    batchId: 'batch-2',
    heldPointsForSubject: 0,
    totalHeldPoints: 0,
    linkedTopUpTransaction: false,
  })
  assert.equal(result.status, 'reserved')
})

test('SALE repricing keeps minutes, lowers diamonds per batch and never blocks on holds', async () => {
  const { repriceCourseForSale } = await import('../src/lib/studentCourseLedger.ts')
  const student = {
    id: 's', status: 'active',
    subjects: [
      {
        subjectId: 'cap3', subjectName: 'CAP3', minutesPerSession: 25, pricePerMinute: 1333, currency: 'VND',
        totalMinutes: 1550, usedMinutes: 100, remainingMinutes: 1450, totalSessions: 62, usedSessions: 4, remainingSessions: 58,
        batches: [
          { id: '1', kind: 'payment', createdAt: '01/11/2026', totalSessions: 60, learningMinutes: 1500, diamonds: 1500 },
          { id: '2', kind: 'gift', createdAt: '02/11/2026', totalSessions: 2, learningMinutes: 50, diamonds: 50 },
        ],
      },
      { subjectId: 'other', subjectName: 'Other', minutesPerSession: 25, totalMinutes: 100, usedMinutes: 0, remainingMinutes: 100, totalSessions: 4, usedSessions: 0, remainingSessions: 4 },
    ],
  } as unknown as Student
  const result = repriceCourseForSale({ student, subjectId: 'cap3', discountPercent: 30 })
  const course = result.subjects[0]
  assert.equal(course.batches?.[0].diamonds, 1080)
  assert.equal(course.batches?.[0].learningMinutes, 1500)
  assert.equal(course.batches?.[1].diamonds, 36)
  assert.equal(course.totalMinutes, 1116)
  assert.equal(course.usedMinutes, 100)
  assert.equal(course.remainingMinutes, 1016)
  assert.equal(result.totals.totalMinutes, 1216)
  assert.equal(result.changes.length, 2)
  // Bỏ SALE: kim cương quay về bằng số phút.
  const back = repriceCourseForSale({ student: { ...student, subjects: result.subjects } as Student, subjectId: 'cap3', discountPercent: 0 })
  assert.equal(back.subjects[0].totalMinutes, 1550)
  assert.equal(back.subjects[0].remainingMinutes, 1450)
  // Đợt nạp tự động giữ nguyên; đợt đã đúng không bị ghi lại.
  const locked = repriceCourseForSale({ student, subjectId: 'cap3', discountPercent: 30, lockedBatchIds: ['1'] })
  assert.equal(locked.subjects[0].batches?.[0].diamonds, 1500)
  assert.equal(locked.changes.length, 1)
  // Quỹ đã dùng nhiều hơn quỹ mới: còn lại về 0, không ném lỗi.
  const heavy = { ...student, subjects: [{ ...(student.subjects![0]), usedMinutes: 1200, remainingMinutes: 350 }] } as Student
  const over = repriceCourseForSale({ student: heavy, subjectId: 'cap3', discountPercent: 50 })
  assert.equal(over.subjects[0].totalMinutes, 806)
  assert.equal(over.subjects[0].remainingMinutes, 0)
  assert.equal(over.status, 'expired')
})
