import type { BookingRequest, ClassHuntCompensation, Lesson, StudentSubject } from '../types/index.ts'
import { isBookingHoldingStudentFund } from './bookingLogic.ts'
import { MANUAL_PROMO_BATCH_PREFIX, manualPromoCompensation, manualPromoPointsPer25Minutes, normalizeManualPromoDiscount } from './manualPromoDiscount.ts'
import { calculateLessonPoints, getBookingPoints, getLessonPoints, normalizePointsPer25Minutes } from './points.ts'

/**
 * Áp SALE của khóa cho các ca đã xếp tay giá thường mà chưa học xong (đang giữ
 * chỗ, hoặc buổi đang chờ/bị từ chối). Mỗi ca nhận cùng snapshot như "Xếp lớp
 * nhanh" có giảm giá: kim cương/25' giảm %, lương gia sư chốt theo giá gói giảm %,
 * và một mã lô `manual-promo-…` để duyệt/lương đọc snapshot.
 *
 * Không đụng: ca Class Hunting/ca đã có ưu đãi (đã có snapshot riêng), ca của buổi
 * đã duyệt (lịch sử tiền đã chốt), ca đã nhả/huỷ, ca của khóa khác.
 */
export interface CourseSaleBookingUpdate {
  id: string
  teacherId: string
  holding: boolean
  pointsBefore: number
  pointsAfter: number
  fields: {
    pointsPer25Minutes: number
    requestedPoints: number
    classHuntId: string
    classHuntCompensation: ClassHuntCompensation
    classHuntPromoDiscountPercent: number
  }
}

export interface CourseSaleBookingPlan {
  updates: CourseSaleBookingUpdate[]
  /** Thay đổi tổng kim cương đang giữ (âm = nhả bớt). */
  heldDelta: number
  /** Ca bị bỏ qua vì gia sư/gói thiếu đơn giá VND để chốt lương. */
  missingPriceBookingIds: string[]
}

type PlanBooking = Pick<BookingRequest, 'id' | 'status' | 'subjectId' | 'teacherId' | 'requestedMinutes' | 'requestedPoints' | 'pointsPer25Minutes' | 'lessonId'> & {
  classHuntId?: unknown
  classHuntCompensation?: unknown
  classHuntPromoDiscountPercent?: unknown
  groupClassId?: unknown
}

export function isCourseSaleRepriceCandidate(
  booking: PlanBooking,
  subjectId: string,
  approvedLessonIds: ReadonlySet<string>,
): boolean {
  if (booking.subjectId !== subjectId) return false
  if (booking.classHuntId || booking.classHuntCompensation !== undefined || booking.classHuntPromoDiscountPercent !== undefined) return false
  if (booking.groupClassId) return false
  if (!(Number(booking.requestedMinutes) > 0)) return false
  if (booking.lessonId && approvedLessonIds.has(booking.lessonId)) return false
  if (isBookingHoldingStudentFund(booking)) return true
  // Ca đã đóng vào một buổi chưa duyệt (chờ duyệt / bị từ chối) để duyệt lại đúng giá SALE.
  return booking.status === 'completed' && Boolean(booking.lessonId)
}

export function planCourseSaleBookingReprice({
  bookings,
  course,
  discountPercent,
  approvedLessonIds,
  teacherLevels,
  batchId,
}: {
  bookings: PlanBooking[]
  course: Pick<StudentSubject, 'subjectId' | 'pricePerMinute' | 'currency'>
  discountPercent: number
  approvedLessonIds: ReadonlySet<string>
  teacherLevels: Readonly<Record<string, number>>
  batchId: string
}): CourseSaleBookingPlan {
  const percent = normalizeManualPromoDiscount(discountPercent)
  const updates: CourseSaleBookingUpdate[] = []
  const missingPriceBookingIds: string[] = []
  if (!percent) return { updates, heldDelta: 0, missingPriceBookingIds }

  for (const booking of bookings) {
    if (!isCourseSaleRepriceCandidate(booking, course.subjectId, approvedLessonIds)) continue
    const compensation = manualPromoCompensation(course, teacherLevels[booking.teacherId] ?? 1, percent)
    if (!compensation) {
      missingPriceBookingIds.push(booking.id)
      continue
    }
    const baseRate = Number(booking.pointsPer25Minutes) > 0 ? Number(booking.pointsPer25Minutes) : 25
    const rate = manualPromoPointsPer25Minutes(baseRate, percent)
    const minutes = Number(booking.requestedMinutes)
    const fields = {
      pointsPer25Minutes: rate,
      requestedPoints: calculateLessonPoints(minutes, rate),
      classHuntId: `${MANUAL_PROMO_BATCH_PREFIX}${batchId}`,
      classHuntCompensation: compensation,
      classHuntPromoDiscountPercent: percent,
    }
    updates.push({
      id: booking.id,
      teacherId: booking.teacherId,
      holding: isBookingHoldingStudentFund(booking),
      pointsBefore: getBookingPoints(booking),
      pointsAfter: getBookingPoints({ requestedMinutes: booking.requestedMinutes, ...fields }),
      fields,
    })
  }
  const heldDelta = updates.reduce((sum, update) => sum + (update.holding ? update.pointsAfter - update.pointsBefore : 0), 0)
  return { updates, heldDelta, missingPriceBookingIds }
}

export interface CourseSaleApprovedLessonUpdate {
  id: string
  date: string
  teacherId: string
  teacherName: string
  minutes: number
  pointsBefore: number
  pointsAfter: number
  rateAfter: number
}

export interface CourseSaleApprovedLessonPlan {
  percent: number
  updates: CourseSaleApprovedLessonUpdate[]
  totalBefore: number
  totalAfter: number
  refundDiamonds: number
}

type PlanApprovedLesson = Pick<Lesson, 'id' | 'status' | 'subjectId' | 'teacherId' | 'minutes' | 'date'> & {
  teacherName?: string
  points?: number | null
  pointsPer25Minutes?: number | null
  classHuntId?: unknown
}

/**
 * Đồng bộ kim cương cho các buổi ĐÃ DUYỆT thuộc khóa SALE nhưng trước đó bị trừ
 * kim cương theo giá thường (vd đổi sang khóa SALE trước khi đồng bộ kim cương,
 * hoặc duyệt buổi không gắn ca ưu đãi).
 *
 * Chỉ giảm kim cương của buổi đang trừ cao hơn mức SALE của khóa (không đụng buổi
 * Class Hunting có rate riêng, không tăng kim cương, không đổi lương gia sư đã chốt).
 */
export function planCourseSaleApprovedLessonReprice({
  lessons,
  course,
  teacherPoints,
}: {
  lessons: PlanApprovedLesson[]
  course: Pick<StudentSubject, 'subjectId' | 'promoDiscountPercent'>
  teacherPoints: Readonly<Record<string, number>>
}): CourseSaleApprovedLessonPlan {
  const percent = normalizeManualPromoDiscount(course.promoDiscountPercent)
  if (!percent) {
    return { percent: 0, updates: [], totalBefore: 0, totalAfter: 0, refundDiamonds: 0 }
  }

  const updates: CourseSaleApprovedLessonUpdate[] = []
  for (const lesson of lessons) {
    if (lesson.status !== 'approved') continue
    if (lesson.subjectId !== course.subjectId) continue
    const minutes = Number(lesson.minutes)
    if (!(minutes > 0)) continue
    // Không đụng buổi Class Hunting thật (có rate thương lượng riêng).
    const huntId = typeof lesson.classHuntId === 'string' ? lesson.classHuntId.trim() : ''
    if (huntId && !huntId.startsWith(MANUAL_PROMO_BATCH_PREFIX)) continue

    const teacherRate = teacherPoints[lesson.teacherId]
    const pointsBefore = getLessonPoints(
      {
        minutes: lesson.minutes,
        points: lesson.points ?? undefined,
        pointsPer25Minutes: lesson.pointsPer25Minutes ?? undefined,
      },
      teacherRate ? { pointsPer25Minutes: teacherRate } : undefined,
    )
    const baseRate = normalizePointsPer25Minutes(teacherRate)
    const rateAfter = manualPromoPointsPer25Minutes(baseRate, percent)
    const pointsAfter = calculateLessonPoints(minutes, rateAfter)
    if (pointsAfter >= pointsBefore) continue

    updates.push({
      id: lesson.id,
      date: lesson.date || '',
      teacherId: lesson.teacherId,
      teacherName: lesson.teacherName || '',
      minutes,
      pointsBefore,
      pointsAfter,
      rateAfter,
    })
  }

  const totalBefore = Math.round(updates.reduce((sum, u) => sum + u.pointsBefore, 0) * 100) / 100
  const totalAfter = Math.round(updates.reduce((sum, u) => sum + u.pointsAfter, 0) * 100) / 100
  const refundDiamonds = Math.max(0, Math.round((totalBefore - totalAfter) * 100) / 100)
  return { percent, updates, totalBefore, totalAfter, refundDiamonds }
}
