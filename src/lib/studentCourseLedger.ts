import type { Student, StudentSubject, TopUpBatch } from '../types'
import { courseSaleDiamonds } from './manualPromoDiscount.ts'

/** Firestore map key order is not a change; array order and every value are. */
export function areCoursePackagesUnchanged(current: StudentSubject[], baseline: StudentSubject[]): boolean {
  const ordered = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(ordered)
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => {
        result[key] = ordered((value as Record<string, unknown>)[key])
        return result
      }, {})
    }
    return value
  }
  return JSON.stringify(ordered(current)) === JSON.stringify(ordered(baseline))
}

/** Ghi thêm lịch sử theo kiểu append; không giới hạn số đợt và không ghi đè dữ liệu cũ. */
export function appendCourseBatch(existing: TopUpBatch[] | undefined, batch: TopUpBatch): TopUpBatch[] {
  return [...(existing || []).map((item) => ({ ...item })), { ...batch }]
}

/**
 * Cộng quyền học sẽ mở lại hồ sơ đã hết quỹ, nhưng không được tự ý bỏ trạng
 * thái bảo lưu do giáo vụ đã chọn. Các trạng thái khác giữ hành vi hiện hữu:
 * có quỹ thì học viên trở lại nhóm đang học.
 */
export function getStatusAfterCourseRightsAdded(
  currentStatus: Student['status'],
  remainingMinutes: number,
): Student['status'] {
  if (currentStatus === 'reserved') return 'reserved'
  return remainingMinutes > 0 ? 'active' : currentStatus
}

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

export interface CourseEntryDeleteResult {
  subjects: StudentSubject[]
  totals: CourseLedgerTotals
  primarySubject: StudentSubject | null
  deletedBatch: TopUpBatch
  status: Student['status']
}

const roundSessions = (value: number) => Math.round(value * 100) / 100

function totalCourseLedger(subjects: StudentSubject[]): CourseLedgerTotals {
  return subjects.reduce<CourseLedgerTotals>((summary, subject) => ({
    totalSessions: summary.totalSessions + Number(subject.totalSessions || 0),
    usedSessions: summary.usedSessions + Number(subject.usedSessions || 0),
    remainingSessions: summary.remainingSessions + Number(subject.remainingSessions || 0),
    totalMinutes: summary.totalMinutes + Number(subject.totalMinutes || 0),
    usedMinutes: summary.usedMinutes + Number(subject.usedMinutes || 0),
    remainingMinutes: summary.remainingMinutes + Number(subject.remainingMinutes || 0),
  }), { totalSessions: 0, usedSessions: 0, remainingSessions: 0, totalMinutes: 0, usedMinutes: 0, remainingMinutes: 0 })
}

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

/**
 * Học viên học vượt quỹ (đã dùng > tổng) được đồng bộ về "còn lại = 0". Đây là
 * trạng thái hợp lệ, không phải sổ lệch: phần nạp/sửa thêm phải bù phần vượt trước.
 */
export function isCourseOverdrawn(subject: StudentSubject) {
  const expectedRemaining = Number(subject.totalMinutes || 0) - Number(subject.usedMinutes || 0)
  return expectedRemaining < 0 && Math.abs(Number(subject.remainingMinutes || 0)) <= 0.01
}

/** Quỹ còn lại sau khi tổng kim cương của khóa thay đổi `diamondsDelta`. */
export function getRemainingAfterFundChange(subject: StudentSubject, diamondsDelta: number) {
  if (isCourseOverdrawn(subject)) {
    return Math.max(0, Number(subject.totalMinutes || 0) + diamondsDelta - Number(subject.usedMinutes || 0))
  }
  return Number(subject.remainingMinutes || 0) + diamondsDelta
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
  if (!isCourseOverdrawn(previousSubject) && Math.abs(expectedRemaining - Number(previousSubject.remainingMinutes || 0)) > 0.01) {
    throw new Error('Quỹ khóa học đang lệch giữa tổng, đã dùng và còn lại. Hãy đối soát dữ liệu trước khi sửa đợt.')
  }

  const diamondsDelta = input.diamonds - previousDiamonds
  const nextTotalMinutes = Number(previousSubject.totalMinutes || 0) + diamondsDelta
  const nextRemainingMinutes = getRemainingAfterFundChange(previousSubject, diamondsDelta)
  const usedMinutes = Number(previousSubject.usedMinutes || 0)

  // Tăng kim cương (sửa đợt nhập thiếu) luôn được phép, kể cả khi học viên đang
  // học vượt quỹ; chỉ chặn khi đợt bị giảm.
  if (diamondsDelta < 0) {
    if (nextTotalMinutes < usedMinutes || nextRemainingMinutes < 0) {
      throw new Error(`Không thể giảm dưới ${usedMinutes.toLocaleString('vi-VN')} kim cương đã sử dụng.`)
    }
    if (nextRemainingMinutes < heldPointsForSubject) {
      throw new Error(`Khóa học đang giữ ${heldPointsForSubject.toLocaleString('vi-VN')} kim cương cho lịch đặt; không thể giảm xuống thấp hơn mức này.`)
    }
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

  const totals = totalCourseLedger(subjects)

  if (diamondsDelta < 0 && totals.remainingMinutes < totalHeldPoints) {
    throw new Error(`Học viên đang giữ tổng cộng ${totalHeldPoints.toLocaleString('vi-VN')} kim cương cho lịch đặt; không thể giảm quỹ xuống thấp hơn mức này.`)
  }

  const primarySubject = subjects.find((subject) => subject.remainingMinutes > 0) || subjects[0] || null
  const status = student.status === 'reserved'
    ? 'reserved'
    : totals.remainingMinutes > 0 ? 'active' : 'expired'

  return { subjects, totals, primarySubject, previousBatch, updatedBatch, status }
}

export function deleteCourseEntry({
  student,
  subjectId,
  batchId,
  heldPointsForSubject,
  totalHeldPoints,
  linkedTopUpTransaction,
}: {
  student: Student
  subjectId: string
  batchId: string
  heldPointsForSubject: number
  totalHeldPoints: number
  linkedTopUpTransaction: boolean
}): CourseEntryDeleteResult {
  const subjects = getStudentSubjects(student)
  const subjectIndex = subjects.findIndex((item) => item.subjectId === subjectId)
  if (subjectIndex === -1) throw new Error('Khóa học không còn tồn tại; hãy tải lại trang')

  const previousSubject = subjects[subjectIndex]
  if (!previousSubject.batches?.length || batchId === 'legacy') {
    throw new Error('Dữ liệu khóa học cũ chưa tách riêng từng đợt. Hãy dùng “Xóa khóa học” nếu khóa học chưa phát sinh lịch sử.')
  }
  if (previousSubject.batches.length === 1) {
    throw new Error('Đây là đợt cộng quyền duy nhất. Hãy dùng “Xóa khóa học” để tránh tạo khóa học rỗng.')
  }

  const batchIndex = previousSubject.batches.findIndex((batch) => batch.id === batchId)
  if (batchIndex === -1) throw new Error('Đợt cộng quyền đã thay đổi hoặc không còn tồn tại; hãy tải lại trang')
  if (linkedTopUpTransaction) {
    throw new Error('Đợt này được tạo từ giao dịch nạp tự động nên không thể xóa. Lịch sử giao dịch phải được giữ nguyên để đối soát.')
  }

  const expectedRemaining = Number(previousSubject.totalMinutes || 0) - Number(previousSubject.usedMinutes || 0)
  if (Math.abs(expectedRemaining - Number(previousSubject.remainingMinutes || 0)) > 0.01) {
    throw new Error('Quỹ khóa học đang lệch giữa tổng, đã dùng và còn lại. Hãy đối soát dữ liệu trước khi xóa đợt.')
  }

  const deletedBatch = { ...previousSubject.batches[batchIndex] }
  const deletedDiamonds = getBatchDiamonds(deletedBatch, previousSubject)
  const nextTotalMinutes = Number(previousSubject.totalMinutes || 0) - deletedDiamonds
  const nextRemainingMinutes = Number(previousSubject.remainingMinutes || 0) - deletedDiamonds
  const usedMinutes = Number(previousSubject.usedMinutes || 0)

  if (nextTotalMinutes < usedMinutes || nextRemainingMinutes < 0) {
    throw new Error(`Không thể xóa vì ${deletedDiamonds.toLocaleString('vi-VN')} kim cương của đợt đã được sử dụng một phần hoặc toàn bộ.`)
  }
  if (nextRemainingMinutes < heldPointsForSubject) {
    throw new Error(`Khóa học đang giữ ${heldPointsForSubject.toLocaleString('vi-VN')} kim cương cho lịch đặt; không thể xóa đợt này.`)
  }

  const minutesPerSession = Number(previousSubject.minutesPerSession || 25)
  const batches = previousSubject.batches
    .filter((_, index) => index !== batchIndex)
    .map((batch) => ({ ...batch }))
  const updatedSubject: StudentSubject = {
    ...previousSubject,
    totalSessions: roundSessions(nextTotalMinutes / minutesPerSession),
    remainingSessions: roundSessions(nextRemainingMinutes / minutesPerSession),
    totalMinutes: nextTotalMinutes,
    remainingMinutes: nextRemainingMinutes,
    batches,
  }
  subjects[subjectIndex] = updatedSubject

  const totals = totalCourseLedger(subjects)
  if (totals.remainingMinutes < totalHeldPoints) {
    throw new Error(`Học viên đang giữ tổng cộng ${totalHeldPoints.toLocaleString('vi-VN')} kim cương cho lịch đặt; không thể xóa đợt này.`)
  }

  const primarySubject = subjects.find((subject) => subject.remainingMinutes > 0) || subjects[0] || null
  const status = student.status === 'reserved'
    ? 'reserved'
    : totals.remainingMinutes > 0 ? 'active' : 'expired'

  return { subjects, totals, primarySubject, deletedBatch, status }
}

export interface CourseSaleRepriceBatchChange {
  batchId: string
  learningMinutes: number
  diamondsBefore: number
  diamondsAfter: number
}

export interface CourseSaleRepriceResult {
  subjects: StudentSubject[]
  totals: CourseLedgerTotals
  primarySubject: StudentSubject | null
  status: Student['status']
  totalBefore: number
  totalAfter: number
  remainingAfter: number
  changes: CourseSaleRepriceBatchChange[]
}

/**
 * Quy lại kim cương của khóa theo ưu đãi SALE: mỗi đợt giữ nguyên số phút học,
 * kim cương = phút quy theo mức trừ mỗi ca đã giảm (0% → kim cương = phút).
 * Không chặn khi quỹ còn lại thấp hơn lịch đang giữ: giáo vụ tự đối soát quỹ buổi.
 * Đợt gắn giao dịch nạp tự động (`lockedBatchIds`) giữ nguyên để không lệch sổ giao dịch.
 */
export function repriceCourseForSale({
  student,
  subjectId,
  discountPercent,
  lockedBatchIds = [],
}: {
  student: Student
  subjectId: string
  discountPercent: number
  lockedBatchIds?: string[]
}): CourseSaleRepriceResult {
  const subjects = getStudentSubjects(student)
  const subjectIndex = subjects.findIndex((item) => item.subjectId === subjectId)
  if (subjectIndex === -1) throw new Error('Khóa học không còn tồn tại; hãy tải lại trang')
  const previousSubject = subjects[subjectIndex]
  if (!previousSubject.batches?.length) {
    throw new Error('Khóa học cũ chưa tách từng đợt nên chưa tự quy đổi được. Hãy sửa kim cương ở chi tiết khóa học.')
  }

  const locked = new Set(lockedBatchIds)
  const changes: CourseSaleRepriceBatchChange[] = []
  const batches = previousSubject.batches.map((batch) => {
    const learningMinutes = getBatchLearningMinutes(batch, previousSubject)
    const diamondsBefore = getBatchDiamonds(batch, previousSubject)
    const diamondsAfter = courseSaleDiamonds(learningMinutes, discountPercent)
    if (locked.has(batch.id) || !(learningMinutes > 0) || diamondsAfter === diamondsBefore) return { ...batch }
    changes.push({ batchId: batch.id, learningMinutes, diamondsBefore, diamondsAfter })
    return {
      ...batch,
      learningMinutes,
      diamonds: diamondsAfter,
      totalSessions: roundSessions(diamondsAfter / Number(previousSubject.minutesPerSession || 25)),
    }
  })

  const delta = changes.reduce((sum, change) => sum + change.diamondsAfter - change.diamondsBefore, 0)
  const totalBefore = Number(previousSubject.totalMinutes || 0)
  const totalAfter = totalBefore + delta
  // Quỹ âm được giữ về 0 như trạng thái học vượt quỹ hiện hữu; số đã dùng không đổi.
  const remainingAfter = Math.max(0, getRemainingAfterFundChange(previousSubject, delta))
  const minutesPerSession = Number(previousSubject.minutesPerSession || 25)
  subjects[subjectIndex] = {
    ...previousSubject,
    batches,
    totalMinutes: totalAfter,
    remainingMinutes: remainingAfter,
    totalSessions: roundSessions(totalAfter / minutesPerSession),
    remainingSessions: roundSessions(remainingAfter / minutesPerSession),
  }

  const totals = totalCourseLedger(subjects)
  const primarySubject = subjects.find((subject) => subject.remainingMinutes > 0) || subjects[0] || null
  const status = student.status === 'reserved' || student.status === 'inactive'
    ? student.status
    : totals.remainingMinutes > 0 ? 'active' : 'expired'
  return { subjects, totals, primarySubject, status, totalBefore, totalAfter, remainingAfter, changes }
}
