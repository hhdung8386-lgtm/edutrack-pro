import assert from 'node:assert/strict'
import test from 'node:test'
import type { Student } from '../src/types/index.ts'
import {
  appendCourseBatch,
  deleteCourseEntry,
  editCourseEntry,
  getCourseEntry,
  getStatusAfterCourseRightsAdded,
} from '../src/lib/studentCourseLedger.ts'

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
