import type { BookingRequest, Student } from '../types/index.ts'
import { isBookingHoldingStudentFund, isBookingPendingRebookFundHold } from './bookingLogic.ts'
import { getBookingPoints } from './points.ts'

/**
 * Trang "Đồng bộ ca đã duyệt": gom hai loại dữ liệu cũ đang chặn vận hành.
 *
 * 1) Ca đã duyệt nhưng chưa đóng: trước 10/08/2026 duyệt buổi chỉ gắn `lessonId`
 *    mà không đổi ca sang `completed`. Ca vẫn `confirmed` nên bị hiểu là đang giữ
 *    kim cương lần hai. Đóng ca không đụng quỹ đã trừ, buổi dạy hay lương.
 * 2) Ca đang giữ nhưng trỏ môn không còn trong gói của học viên (đổi gói sau khi
 *    đã xếp lịch). Gia sư không điểm danh được và giáo vụ không duyệt được vì môn
 *    của ca khác môn buổi. Chỉ tự chuyển khi học viên có đúng một gói.
 */

export interface RepairLessonFact {
  id: string
  status: string
  studentId: string
  teacherId: string
  subjectId: string
  referencedBookingIds: string[]
  hasSubjectReconciliation: boolean
}

export interface RepairPackageTarget {
  subjectId: string
  subjectName: string
  curriculumLink?: string
}

export type OrphanSubjectBlocker = 'multiple_packages' | 'no_package' | 'lesson_subject_differs' | 'lesson_reconciled'

export interface OrphanSubjectBookingRow {
  booking: BookingRequest
  target: RepairPackageTarget | null
  blocker: OrphanSubjectBlocker | null
}

export interface RepairStudentGroup<Row> {
  studentId: string
  studentCode: string
  studentName: string
  rows: Row[]
  points: number
  /** Số giữ đang lưu trên hồ sơ (reservedMinutes). */
  storedHeld: number
  /** Tổng kim cương thật sự đang giữ sau khi coi ca đã duyệt là đã đóng. */
  ledgerHeldAfter: number
}

function financialHoldPoints(booking: BookingRequest): number {
  if (isBookingHoldingStudentFund(booking)) return getBookingPoints(booking)
  return isBookingPendingRebookFundHold(booking) ? Number(booking.rebookHoldPoints) || 0 : 0
}

export function storedHeldPoints(student: Pick<Student, 'reservedMinutes' | 'heldMinutes'> | null | undefined): number {
  const value = Number(student?.reservedMinutes ?? student?.heldMinutes ?? 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** Ca `pending/confirmed` trỏ về buổi ĐÃ DUYỆT của chính học viên đó. */
export function isSettledByApprovedLesson(booking: BookingRequest, lesson: RepairLessonFact | null | undefined): boolean {
  return Boolean(
    isBookingHoldingStudentFund(booking)
    && booking.lessonId
    && booking.studentId
    && lesson
    && lesson.id === booking.lessonId
    && lesson.status === 'approved'
    && lesson.studentId === booking.studentId,
  )
}

/**
 * Chỉ đóng hàng loạt khi buổi chứng minh đúng ca: cùng học viên, cùng gia sư
 * (hoặc buổi ghi rõ id ca, trường hợp dạy thay) và không phải buổi hạch toán
 * chuyển môn đặc biệt (xử lý riêng từng ca).
 */
export function isApprovedUnsettledBooking(booking: BookingRequest, lesson: RepairLessonFact | null | undefined): boolean {
  if (!lesson || !isSettledByApprovedLesson(booking, lesson)) return false
  if (lesson.hasSubjectReconciliation) return false
  return !booking.teacherId
    || !lesson.teacherId
    || lesson.teacherId === booking.teacherId
    || lesson.referencedBookingIds.includes(booking.id)
}

/** Tổng kim cương thật sự đang giữ của một học viên, coi ca đã có buổi duyệt là đã đóng. */
export function ledgerHeldPointsAfterSettlement(
  studentBookings: BookingRequest[],
  lessons: ReadonlyMap<string, RepairLessonFact>,
): number {
  return studentBookings.reduce((sum, booking) => {
    if (isSettledByApprovedLesson(booking, booking.lessonId ? lessons.get(booking.lessonId) : null)) return sum
    return sum + financialHoldPoints(booking)
  }, 0)
}

export function studentPackageTargets(student: Pick<Student, 'subjects' | 'subjectId' | 'subjectName'>): RepairPackageTarget[] {
  if (Array.isArray(student.subjects) && student.subjects.length > 0) {
    return student.subjects
      .filter((subject) => Boolean(subject?.subjectId))
      .map((subject) => ({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName || '',
        ...(subject.curriculumLink?.trim() ? { curriculumLink: subject.curriculumLink.trim() } : {}),
      }))
  }
  return student.subjectId ? [{ subjectId: student.subjectId, subjectName: student.subjectName || '' }] : []
}

/**
 * `null` = ca không thuộc diện trỏ môn cũ (hoặc thuộc diện ca đã duyệt cần đóng).
 * Có `blocker` = cần giáo vụ xử lý thủ công, không tự chuyển.
 */
export function classifyOrphanSubjectBooking(
  booking: BookingRequest,
  student: Pick<Student, 'subjects' | 'subjectId' | 'subjectName'>,
  lesson: RepairLessonFact | null | undefined,
): OrphanSubjectBookingRow | null {
  if (!isBookingHoldingStudentFund(booking)) return null
  const packages = studentPackageTargets(student)
  const bookingSubjectId = booking.subjectId || ''
  if (bookingSubjectId && packages.some((item) => item.subjectId === bookingSubjectId)) return null
  if (booking.lessonId && isSettledByApprovedLesson(booking, lesson)) return null

  const uniqueIds = new Set(packages.map((item) => item.subjectId))
  const target = packages.length === 1 && uniqueIds.size === 1 ? packages[0] : null
  const blocker: OrphanSubjectBlocker | null = packages.length === 0
    ? 'no_package'
    : !target
      ? 'multiple_packages'
      : lesson?.hasSubjectReconciliation
        ? 'lesson_reconciled'
        : booking.lessonId && lesson && lesson.status === 'pending' && lesson.subjectId && lesson.subjectId !== target.subjectId
          ? 'lesson_subject_differs'
          : null
  return { booking, target, blocker }
}

export function groupByStudent<Row extends { booking: BookingRequest }>(
  rows: Row[],
  students: ReadonlyMap<string, Student>,
  bookingsByStudent: ReadonlyMap<string, BookingRequest[]>,
  lessons: ReadonlyMap<string, RepairLessonFact>,
  pointsOf: (row: Row) => number = (row) => getBookingPoints(row.booking),
): RepairStudentGroup<Row>[] {
  const grouped = new Map<string, Row[]>()
  rows.forEach((row) => {
    const studentId = row.booking.studentId
    if (!studentId) return
    grouped.set(studentId, [...(grouped.get(studentId) || []), row])
  })
  return Array.from(grouped.entries())
    .map(([studentId, studentRows]) => {
      const student = students.get(studentId)
      const first = studentRows[0].booking
      return {
        studentId,
        studentCode: student?.code || first.studentCode || '',
        studentName: student?.name || first.studentName || 'Học viên',
        rows: [...studentRows].sort((left, right) => (left.booking.requestedDate || '').localeCompare(right.booking.requestedDate || '')
          || (left.booking.requestedStart || '').localeCompare(right.booking.requestedStart || '')),
        points: studentRows.reduce((sum, row) => sum + pointsOf(row), 0),
        storedHeld: storedHeldPoints(student),
        ledgerHeldAfter: ledgerHeldPointsAfterSettlement(bookingsByStudent.get(studentId) || [], lessons),
      }
    })
    .sort((left, right) => right.rows.length - left.rows.length || left.studentName.localeCompare(right.studentName, 'vi'))
}

export const ORPHAN_BLOCKER_LABELS: Record<OrphanSubjectBlocker, string> = {
  multiple_packages: 'Học viên có nhiều gói, cần chọn đúng gói thủ công',
  no_package: 'Học viên chưa có gói nào',
  lesson_subject_differs: 'Buổi điểm danh đang chờ duyệt ghi môn khác gói hiện tại',
  lesson_reconciled: 'Buổi đã hạch toán chuyển môn đặc biệt',
}
