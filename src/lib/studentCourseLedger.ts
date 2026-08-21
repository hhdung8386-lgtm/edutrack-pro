import type { Student, StudentSubject, TopUpBatch } from '../types'

export interface CourseEntryEditInput {
  learningMinutes: number
  diamonds: number
  content: string
  paymentDate: string
  note: string
}

export interface CourseLedgerTotals {
  totalSessions: number
  usedSessions: number
  remainingSessions: number
  totalMinutes: number
  usedMinutes: number
  remainingMinutes: number
}

export interface CourseEntryEditResult {
  subjects: StudentSubject[]
  totals: CourseLedgerTotals
  primarySubject: StudentSubject | null
  previousBatch: TopUpBatch
  updatedBatch: TopUpBatch
  status: Student['status']
}

const roundSessions = (value: number) => Math.round(value * 100) / 100

export function getStudentSubjects(student: Student): StudentSubject[] {
  if (student.subjects?.length) return student.subjects.map((subject) => ({ ...subject }))
  if (!student.subjectId) return []

  const minutesPerSession = student.minutesPerSession || 50
  const totalMinutes = student.totalMinutes ?? (student.totalSessions * minutesPerSession)
  const usedMinutes = student.usedMinutes ?? ((student.usedSessions || 0) * minutesPerSession)
  const remainingMinutes = student.remainingMinutes ?? Math.max(0, totalMinutes - usedMinutes)

  return [{
    subjectId: student.subjectId,
    subjectName: student.subjectName || 'Chưa rõ',
    totalSessions: student.totalSessions || roundSessions(totalMinutes / minutesPerSession),
    usedSessions: student.usedSessions || roundSessions(usedMinutes / minutesPerSession),
    remainingSessions: student.remainingSessions || roundSessions(remainingMinutes / minutesPerSession),
    minutesPerSession,
    totalMinutes,
    usedMinutes,
    remainingMinutes,
    pricePerMinute: 0,
  }]
}

export function getBatchDiamonds(batch: TopUpBatch, subject: StudentSubject) {
  if (Number.isFinite(Number(batch.diamonds))) return Math.max(0, Number(batch.diamonds))
  return Math.max(0, Number(batch.totalSessions || 0) * Number(subject.minutesPerSession || 25))
}

export function getBatchLearningMinutes(batch: TopUpBatch, subject: StudentSubject) {
  if (Number.isFinite(Number(batch.learningMinutes))) return Math.max(0, Number(batch.learningMinutes))
  return getBatchDiamonds(batch, subject)
}

export function getCourseEntry(
  student: Student,
  subjectId: string,
  batchId: string,
  fallbackDate: string,
) {
  const subject = getStudentSubjects(student).find((item) => item.subjectId === subjectId)
  if (!subject) return null

  const batches = subject.batches?.length
    ? subject.batches
    : [{
        id: 'legacy',
        createdAt: fallbackDate,
        totalSessions: subject.totalSessions,
        kind: 'payment' as const,
      }]
  const batchIndex = batches.findIndex((item) => item.id === batchId)
  if (batchIndex === -1) return null
  const batch = batches[batchIndex]

  return {
    subject,
    batch,
    ordinal: batchIndex + 1,
    learningMinutes: getBatchLearningMinutes(batch, subject),
    diamonds: getBatchDiamonds(batch, subject),
  }
}

export function editCourseEntry({
  student,
  subjectId,
  batchId,
  fallbackDate,
  input,
  heldPointsForSubject,
  totalHeldPoints,
  linkedTopUpTransaction,
}: {
  student: Student
  subjectId: string
  batchId: string
  fallbackDate: string
  input: CourseEntryEditInput
  heldPointsForSubject: number
  totalHeldPoints: number
  linkedTopUpTransaction: boolean
}): CourseEntryEditResult {
  const subjects = getStudentSubjects(student)
  const subjectIndex = subjects.findIndex((item) => item.subjectId === subjectId)
  if (subjectIndex === -1) throw new Error('Khóa học không còn tồn tại; hãy tải lại trang')

  const previousSubject = subjects[subjectIndex]
  const batches: TopUpBatch[] = previousSubject.batches?.length
    ? previousSubject.batches.map((batch) => ({ ...batch }))
    : [{
        id: 'legacy',
        createdAt: fallbackDate,
        totalSessions: previousSubject.totalSessions,
        kind: 'payment',
      }]
  const batchIndex = batches.findIndex((batch) => batch.id === batchId)
  if (batchIndex === -1) throw new Error('Đợt cộng quyền đã thay đổi hoặc không còn tồn tại; hãy tải lại trang')

  const previousBatch = batches[batchIndex]
  const previousDiamonds = getBatchDiamonds(previousBatch, previousSubject)
  const previousLearningMinutes = getBatchLearningMinutes(previousBatch, previousSubject)
  const numericChanged = previousDiamonds !== input.diamonds || previousLearningMinutes !== input.learningMinutes

  if (linkedTopUpTransaction && numericChanged) {
    throw new Error('Đợt này được tạo từ giao dịch nạp tự động. Chỉ được sửa nội dung, ngày và ghi chú để không lệch sổ giao dịch.')
  }

  const expectedRemaining = Number(previousSubject.totalMinutes || 0) - Number(previousSubject.usedMinutes || 0)
  if (Math.abs(expectedRemaining - Number(previousSubject.remainingMinutes || 0)) > 0.01) {
    throw new Error('Quỹ khóa học đang lệch giữa tổng, đã dùng và còn lại. Hãy đối soát dữ liệu trước khi sửa đợt.')
  }

  const diamondsDelta = input.diamonds - previousDiamonds
  const nextTotalMinutes = Number(previousSubject.totalMinutes || 0) + diamondsDelta
  const nextRemainingMinutes = Number(previousSubject.remainingMinutes || 0) + diamondsDelta
  const usedMinutes = Number(previousSubject.usedMinutes || 0)

  if (nextTotalMinutes < usedMinutes || nextRemainingMinutes < 0) {
    throw new Error(`Không thể giảm dưới ${usedMinutes.toLocaleString('vi-VN')} kim cương đã sử dụng.`)
  }
  if (nextRemainingMinutes < heldPointsForSubject) {
    throw new Error(`Khóa học đang giữ ${heldPointsForSubject.toLocaleString('vi-VN')} kim cương cho lịch đặt; không thể giảm xuống thấp hơn mức này.`)
  }

  const minutesPerSession = Number(previousSubject.minutesPerSession || 25)
  const kind = previousBatch.kind === 'gift' ? 'gift' : 'payment'
  const updatedBatch: TopUpBatch = {
    ...previousBatch,
    totalSessions: roundSessions(input.diamonds / minutesPerSession),
    kind,
    learningMinutes: input.learningMinutes,
    diamonds: input.diamonds,
    content: input.content.trim(),
    paymentDate: input.paymentDate,
    reason: kind === 'gift' ? input.content.trim() : (previousBatch.reason || ''),
    note: input.note.trim(),
  }
  batches[batchIndex] = updatedBatch

  const updatedSubject: StudentSubject = {
    ...previousSubject,
    totalSessions: roundSessions(nextTotalMinutes / minutesPerSession),
    remainingSessions: roundSessions(nextRemainingMinutes / minutesPerSession),
    totalMinutes: nextTotalMinutes,
    remainingMinutes: nextRemainingMinutes,
    batches,
  }
  subjects[subjectIndex] = updatedSubject

  const totals = subjects.reduce<CourseLedgerTotals>((summary, subject) => ({
    totalSessions: summary.totalSessions + Number(subject.totalSessions || 0),
    usedSessions: summary.usedSessions + Number(subject.usedSessions || 0),
    remainingSessions: summary.remainingSessions + Number(subject.remainingSessions || 0),
    totalMinutes: summary.totalMinutes + Number(subject.totalMinutes || 0),
    usedMinutes: summary.usedMinutes + Number(subject.usedMinutes || 0),
    remainingMinutes: summary.remainingMinutes + Number(subject.remainingMinutes || 0),
  }), { totalSessions: 0, usedSessions: 0, remainingSessions: 0, totalMinutes: 0, usedMinutes: 0, remainingMinutes: 0 })

  if (totals.remainingMinutes < totalHeldPoints) {
    throw new Error(`Học viên đang giữ tổng cộng ${totalHeldPoints.toLocaleString('vi-VN')} kim cương cho lịch đặt; không thể giảm quỹ xuống thấp hơn mức này.`)
  }

  const primarySubject = subjects.find((subject) => subject.remainingMinutes > 0) || subjects[0] || null
  const status = student.status === 'reserved'
    ? 'reserved'
    : totals.remainingMinutes > 0 ? 'active' : 'expired'

  return { subjects, totals, primarySubject, previousBatch, updatedBatch, status }
}
