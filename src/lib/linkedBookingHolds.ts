import type { BookingRequest, Lesson } from '../types/index.ts'
import { isBookingHoldingStudentFund, lessonReferencedBookingIds } from './bookingLogic.ts'
import { getBookingPoints } from './points.ts'

/**
 * Một ca đặt lịch đang giữ kim cương (pending/confirmed) nhưng đã gắn `lessonId`
 * sẽ bị ẩn khỏi danh sách "tương lai" và mọi nút hủy/nhả lịch. Trạng thái của buổi
 * điểm danh được gắn quyết định ca đó là chờ duyệt hợp lệ hay liên kết bị treo.
 */
export type LinkedBookingHoldState =
  | 'awaiting_approval'
  | 'lesson_rejected'
  | 'lesson_cancelled'
  | 'lesson_missing'
  | 'lesson_approved_unsettled'
  | 'link_mismatch'

export function isLinkedBookingHold(booking: BookingRequest | null | undefined): boolean {
  return Boolean(booking && isBookingHoldingStudentFund(booking) && booking.lessonId)
}

/**
 * `lesson` = null nghĩa là đã đọc máy chủ và không còn bản ghi buổi dạy.
 * Không suy luận khi buổi dạy thuộc học viên/gia sư khác: trả về `link_mismatch`.
 */
export function classifyLinkedBookingHold(
  booking: BookingRequest,
  lesson: Lesson | null,
): LinkedBookingHoldState {
  if (!lesson) return 'lesson_missing'
  if (
    lesson.id !== booking.lessonId
    || lesson.studentId !== booking.studentId
    || lesson.teacherId !== booking.teacherId
  ) return 'link_mismatch'
  if (lesson.status === 'pending') return 'awaiting_approval'
  if (lesson.status === 'approved') return 'lesson_approved_unsettled'
  if (lesson.status === 'rejected') return 'lesson_rejected'
  return 'lesson_cancelled'
}

/**
 * Chỉ gỡ liên kết khi buổi dạy chắc chắn không còn hiệu lực. Gỡ liên kết KHÔNG
 * đụng tới quỹ: ca vẫn giữ kim cương và quay về luồng hủy/rà soát quá hạn chuẩn.
 */
export function canUnlinkStaleLessonFromBooking(booking: BookingRequest, lesson: Lesson | null): boolean {
  if (!isLinkedBookingHold(booking)) return false
  const state = classifyLinkedBookingHold(booking, lesson)
  if (state === 'lesson_missing') return true
  if (state === 'link_mismatch') {
    // Con trỏ tới buổi của học viên/gia sư khác. Chỉ gỡ khi buổi đó không còn chờ
    // duyệt và không tự ghi nhận ca này, để việc duyệt/hoàn tác của buổi kia không đổi.
    return Boolean(lesson)
      && lesson?.status !== 'pending'
      && !lessonReferencedBookingIds(lesson as Lesson).includes(booking.id)
      && !lesson?.bookingSubjectReconciliation
  }
  if (state !== 'lesson_rejected' && state !== 'lesson_cancelled') return false
  // Buổi hạch toán chuyển môn là ngoại lệ đã chốt, không xử lý bằng thao tác chung.
  return !lesson?.bookingSubjectReconciliation
}

/**
 * Buổi đã duyệt (đã trừ quỹ) nhưng ca đặt vẫn `confirmed` nên tiếp tục giữ kim cương:
 * học viên bị tính hai lần (đã học + đã đặt). Đóng ca là an toàn vì không đụng quỹ.
 */
export function canSettleApprovedLinkedBooking(booking: BookingRequest, lesson: Lesson | null): boolean {
  if (!lesson || !isLinkedBookingHold(booking)) return false
  if (classifyLinkedBookingHold(booking, lesson) !== 'lesson_approved_unsettled') return false
  return !lesson.bookingSubjectReconciliation
}

/**
 * Số kim cương giữ chỗ cần nhả khi đóng ca. Nếu lúc duyệt buổi đã ghi nhận đúng ca
 * này và đã nhả giữ chỗ (`bookingHoldConsumed`) thì không nhả lần hai.
 */
export function approvedLinkedBookingHoldToRelease(booking: BookingRequest, lesson: Lesson): number {
  const consumedAtApproval = lesson.bookingHoldConsumed === true
    && lessonReferencedBookingIds(lesson).includes(booking.id)
  return consumedAtApproval ? 0 : getBookingPoints(booking)
}

/** Các ca đang trỏ về đúng buổi dạy này và vẫn giữ quỹ, dùng khi từ chối buổi dạy. */
export function bookingsToReopenOnLessonReject(lesson: Lesson, bookings: BookingRequest[]): BookingRequest[] {
  return bookings.filter((booking) => (
    isBookingHoldingStudentFund(booking)
    && booking.lessonId === lesson.id
    && booking.studentId === lesson.studentId
  ))
}

export function lessonRejectBookingIds(lesson: Lesson): string[] {
  return lessonReferencedBookingIds(lesson)
}
