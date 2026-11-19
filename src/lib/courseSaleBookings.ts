import type { BookingRequest, ClassHuntCompensation, StudentSubject } from '../types/index.ts'
import { isBookingHoldingStudentFund } from './bookingLogic.ts'
import { MANUAL_PROMO_BATCH_PREFIX, manualPromoCompensation, manualPromoPointsPer25Minutes, normalizeManualPromoDiscount } from './manualPromoDiscount.ts'
import { calculateLessonPoints, getBookingPoints } from './points.ts'

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
