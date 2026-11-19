import type { BookingRequest, ClassHuntCompensation, Lesson, StudentSubject, Teacher } from '@/types'
import { isActiveAttendanceBooking } from './bookingLogic.ts'
import { bookingTimeToMinutes } from './bookingTime.ts'
import { classHuntCompensationFromBookings, classHuntCompensationFromLesson } from './classHuntCompensation.ts'
import { getCountryRate } from './countryPricing.ts'
import { courseSalePricePerMinute, manualPromoPointsPer25Minutes, normalizeManualPromoDiscount } from './manualPromoDiscount.ts'
import { calculateLessonPoints, getBookingPoints, getLessonPoints, normalizePointsPer25Minutes } from './points.ts'

/**
 * Duyệt buổi dạy (quyết định vận hành 2026-09-25): admin đã có bước xác nhận
 * nên KHÔNG còn quy tắc đối chiếu lịch nào chặn việc duyệt. Quy tắc duy nhất
 * còn lại là gói môn phải đủ phút (không duyệt khi đã hết buổi).
 *
 * Việc gắn ca đặt vẫn phải an toàn về tiền: chỉ ca còn giữ chỗ và chưa thuộc
 * buổi khác mới được đóng + nhả giữ chỗ, nên mỗi ca chỉ được tiêu đúng một lần.
 * Ca không gắn được thì để nguyên, xử lý sau ở trang Ca học quá hạn.
 */

/**
 * Ca còn dùng được cho buổi này: của đúng học viên, đang giữ chỗ và chưa thuộc
 * buổi khác, hoặc đã do chính buổi này đóng.
 */
export function isBookingUsableForLessonApproval(
  booking: Pick<BookingRequest, 'status' | 'lessonId' | 'teacherResponse' | 'studentId'>,
  lessonId: string,
  studentId: string,
): boolean {
  if (booking.studentId !== studentId) return false
  if (booking.lessonId && booking.lessonId !== lessonId) return false
  if (booking.status === 'completed') return booking.lessonId === lessonId
  return isActiveAttendanceBooking(booking)
}

export function usableLessonApprovalBookings<T extends BookingRequest>(
  bookings: T[],
  lessonId: string,
  studentId: string,
): T[] {
  const seen = new Set<string>()
  return bookings.filter((booking) => {
    if (seen.has(booking.id)) return false
    seen.add(booking.id)
    return isBookingUsableForLessonApproval(booking, lessonId, studentId)
  })
}

function bookingStartSortKey(booking: BookingRequest): number {
  const start = bookingTimeToMinutes(booking.requestedStart)
  return Number.isFinite(start) ? start : Number.MAX_SAFE_INTEGER
}

/**
 * Chọn ca đặt để gắn khi đối chiếu chặt không xác định được.
 * 1. Ca buổi dạy đã ghi tham chiếu (còn dùng được) và ca đã do chính buổi này đóng.
 * 2. Bù thêm ca cùng học viên + gia sư + ngày theo thứ tự giờ, không vượt số phút buổi.
 * 3. Không chọn được gì mà chỉ có đúng một ca trong ngày thì gắn ca đó.
 */
export function selectLenientApprovalBookings(input: {
  lessonId: string
  studentId: string
  lessonMinutes: number
  referenced: BookingRequest[]
  sameDay: BookingRequest[]
}): BookingRequest[] {
  const { lessonId, studentId } = input
  const lessonMinutes = Math.max(0, Number(input.lessonMinutes) || 0)
  const selected = usableLessonApprovalBookings([
    ...input.referenced,
    ...input.sameDay.filter((booking) => booking.status === 'completed' && booking.lessonId === lessonId),
  ], lessonId, studentId)
  const selectedIds = new Set(selected.map((booking) => booking.id))
  const candidates = usableLessonApprovalBookings(input.sameDay, lessonId, studentId)
    .filter((booking) => !selectedIds.has(booking.id) && booking.status !== 'completed')
    .sort((left, right) => (
      bookingStartSortKey(left) - bookingStartSortKey(right)
      || left.id.localeCompare(right.id)
    ))

  if (lessonMinutes > 0) {
    let remaining = lessonMinutes - selected.reduce((sum, booking) => sum + (Number(booking.requestedMinutes) || 0), 0)
    for (const candidate of candidates) {
      if (remaining <= 0) break
      const minutes = Number(candidate.requestedMinutes) || 0
      if (minutes <= 0 || minutes > remaining) continue
      selected.push(candidate)
      remaining -= minutes
    }
  }

  if (selected.length === 0 && candidates.length === 1) return [candidates[0]]
  return selected
}

/**
 * Kim cương trừ khi duyệt. Ca gắn khớp đúng số phút buổi thì dùng giá của ca
 * (như trước đây); lệch phút hoặc không có ca thì tính theo chính buổi dạy.
 */
export function lessonApprovalPoints(
  lesson: Pick<Lesson, 'minutes' | 'attendanceStatus'> & Partial<Pick<Lesson, 'points' | 'pointsPer25Minutes'>>,
  bookings: BookingRequest[],
  teacher: Partial<Teacher> | null | undefined,
  isZeroMinuteExcusedAbsence: boolean,
): number {
  const isAbsenceLesson = lesson.attendanceStatus === 'with_permission'
    || lesson.attendanceStatus === 'without_permission'
    || isZeroMinuteExcusedAbsence
  if (isAbsenceLesson || bookings.length === 0) return getLessonPoints(lesson, teacher)
  const bookingMinutes = bookings.reduce((sum, booking) => sum + (Number(booking.requestedMinutes) || 0), 0)
  if (bookingMinutes !== Number(lesson.minutes)) {
    // Buổi duyệt lưu rate của ca đầu tiên; tính theo đúng rate đó để huỷ duyệt hoàn lại khớp.
    const bookingRate = bookings[0].pointsPer25Minutes
    return getLessonPoints(
      bookingRate ? { ...lesson, pointsPer25Minutes: bookingRate } : lesson,
      teacher,
    )
  }
  return bookings.reduce((sum, booking) => sum + getBookingPoints(booking, teacher), 0)
}

/**
 * Rate Class Hunting không còn chặn duyệt: lấy rate chung của các ca nếu nhất
 * quán; nếu không thì rate hợp lệ đầu tiên của một ca, rồi rate đã lưu trên buổi.
 */
export function lessonApprovalClassHuntCompensation(
  bookings: BookingRequest[],
  lesson: Pick<Lesson, 'classHuntCompensation'>,
): ClassHuntCompensation | null {
  try {
    return classHuntCompensationFromBookings(bookings)
  } catch {
    for (const booking of bookings) {
      try {
        const single = classHuntCompensationFromBookings([booking])
        if (single) return single
      } catch {
        // Ca có rate hỏng: thử ca kế tiếp.
      }
    }
    return classHuntCompensationFromLesson(lesson)
  }
}

/** Gói môn để trừ: ưu tiên gói trùng môn còn đủ phút, rồi gói trùng môn đầu tiên. */
export function pickApprovalSubjectPackageIndex(
  subjects: Pick<StudentSubject, 'subjectId' | 'remainingMinutes'>[],
  subjectId: string,
  points: number,
): number {
  const indexes = subjects.flatMap((subject, index) => (subject.subjectId === subjectId ? [index] : []))
  if (indexes.length === 0) return -1
  return indexes.find((index) => Number(subjects[index].remainingMinutes || 0) >= points) ?? indexes[0]
}

/** Gói môn mặc định cho ô chọn: gói của buổi dạy, hoặc gói duy nhất của học viên. */
export function defaultApprovalSubjectId(
  subjects: Pick<StudentSubject, 'subjectId'>[],
  lessonSubjectId?: string,
): string {
  if (lessonSubjectId && subjects.some((subject) => subject.subjectId === lessonSubjectId)) return lessonSubjectId
  const uniqueIds = Array.from(new Set(subjects.map((subject) => subject.subjectId).filter(Boolean)))
  return uniqueIds.length === 1 ? uniqueIds[0] : ''
}

export interface ApprovalPricingTerms {
  lessonPoints: number
  pointsPer25Minutes: number
  pricePerMinute: number
  currency: string
  teacherLevel: number
  appliedCourseSalePercent: number
}

/**
 * Chốt kim cương và đơn giá lương khi duyệt buổi học.
 * - Nếu buổi đã có snapshot Class Hunting / Lớp ưu đãi (`classHuntCompensation`),
 *   giữ nguyên snapshot đã chốt (không giảm hai lần).
 * - Nếu không có snapshot nhưng gói môn đang chọn là khóa SALE VND, tự động giảm
 *   cả kim cương/25' lẫn đơn giá lương/phút theo % SALE của khóa.
 */
export function resolveCourseSaleApprovalTerms(input: {
  lesson: Pick<Lesson, 'minutes' | 'attendanceStatus'> & Partial<Pick<Lesson, 'points' | 'pointsPer25Minutes' | 'teacherLevel'>>
  bookings: BookingRequest[]
  teacher: Partial<Teacher> | null | undefined
  subjectPackage: StudentSubject
  classHuntCompensation: ClassHuntCompensation | null
  isZeroMinuteExcusedAbsence: boolean
}): ApprovalPricingTerms {
  const { lesson, bookings, teacher, subjectPackage, classHuntCompensation, isZeroMinuteExcusedAbsence } = input
  const legacyTeacherLevel = (lesson.teacherLevel ?? teacher?.level ?? 1) || 1
  const bookingNow = bookings[0] || null
  const baseRate = normalizePointsPer25Minutes(
    bookingNow?.pointsPer25Minutes ?? lesson.pointsPer25Minutes ?? teacher?.pointsPer25Minutes,
  )
  const basePoints = lessonApprovalPoints(lesson, bookings, teacher, isZeroMinuteExcusedAbsence)
  const legacyRate = getCountryRate(subjectPackage, teacher?.country || 'VN')

  if (classHuntCompensation) {
    return {
      lessonPoints: basePoints,
      pointsPer25Minutes: baseRate,
      pricePerMinute: classHuntCompensation.ratePerMinute,
      currency: classHuntCompensation.currency,
      teacherLevel: 1,
      appliedCourseSalePercent: 0,
    }
  }

  const salePercent = normalizeManualPromoDiscount(subjectPackage.promoDiscountPercent)
  const currency = legacyRate.currency || 'VND'
  if (salePercent > 0 && currency.toUpperCase() === 'VND') {
    const teacherBaseRate = normalizePointsPer25Minutes(teacher?.pointsPer25Minutes)
    const discountedRate = manualPromoPointsPer25Minutes(teacherBaseRate, salePercent)
    const minutes = Number(lesson.minutes) || 0
    const lessonPoints = isZeroMinuteExcusedAbsence || minutes <= 0
      ? 0
      : calculateLessonPoints(minutes, discountedRate)
    return {
      lessonPoints,
      pointsPer25Minutes: discountedRate,
      pricePerMinute: courseSalePricePerMinute(legacyRate.price, salePercent, currency),
      currency,
      teacherLevel: legacyTeacherLevel,
      appliedCourseSalePercent: salePercent,
    }
  }

  return {
    lessonPoints: basePoints,
    pointsPer25Minutes: baseRate,
    pricePerMinute: legacyRate.price,
    currency,
    teacherLevel: legacyTeacherLevel,
    appliedCourseSalePercent: 0,
  }
}
