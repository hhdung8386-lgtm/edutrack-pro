import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import app, { db } from '@/lib/firebase'
import type { BookingRequest, Student, TeacherClassCancellationStatus } from '@/types'
import { getBookingPoints } from '@/lib/points'
import { isBookingCancellable } from '@/lib/bookingLogic'
import {
  LATE_CANCELLATION_PENALTY_AMOUNT_VND,
  bookingStartMs,
  lateCancellationPenaltyPayrollId,
} from '@/lib/teacherClassCancellationPolicy'

export {
  LATE_CANCELLATION_PENALTY_AMOUNT_VND,
  TEACHER_CANCELLATION_NOTICE_MS,
  bookingStartMs,
  lateCancellationPenaltyPayrollId,
  lateTeacherCancellationPenaltyApplies,
} from '@/lib/teacherClassCancellationPolicy'

/**
 * Gia sư xin huỷ lớp (xin nghỉ) → giáo vụ duyệt.
 *
 * - Gia sư chỉ GỬI / RÚT yêu cầu qua callable (Admin SDK). Không nhả ca, không đụng kim cương.
 * - Giáo vụ DUYỆT = nhả ca (`status: 'released'`) + giảm phần kim cương đang giữ của học viên,
 *   đúng như thao tác "Nhả giữ chỗ" sẵn có ở Lịch xếp lớp. Không bao giờ cộng vào quỹ còn lại.
 * - Mọi thao tác đọc lại dữ liệu mới nhất trong transaction nên bấm lặp / hai người cùng duyệt
 *   cũng không nhả hai lần.
 */

export const TEACHER_CANCELLATION_REASON_MIN = 5
export const TEACHER_CANCELLATION_REASON_MAX = 500

const functions = getFunctions(app, 'asia-southeast1')
const cancellationCallable = httpsCallable<
  { bookingId: string; action: 'request' | 'withdraw'; reason?: string; acceptLatePenalty?: boolean },
  unknown
>(functions, 'requestTeacherClassCancellation')

export async function submitTeacherClassCancellation(bookingId: string, reason: string, acceptLatePenalty: boolean) {
  await cancellationCallable({ bookingId, action: 'request', reason: reason.trim(), acceptLatePenalty })
}

export async function withdrawTeacherClassCancellation(bookingId: string) {
  await cancellationCallable({ bookingId, action: 'withdraw' })
}

export function teacherCancellationStatusOf(
  booking: Pick<BookingRequest, 'teacherCancellationStatus'> | null | undefined,
): TeacherClassCancellationStatus | '' {
  const status = booking?.teacherCancellationStatus
  return status === 'pending' || status === 'approved' || status === 'rejected'
    || status === 'withdrawn' || status === 'closed'
    ? status
    : ''
}

/** Cùng điều kiện với callable: ca đã xếp, chưa điểm danh, chưa bắt đầu, chưa có yêu cầu chờ. */
export function canRequestTeacherClassCancellation(booking: BookingRequest | null | undefined, nowMs: number) {
  if (!booking || booking.status !== 'confirmed' || booking.lessonId) return false
  if (teacherCancellationStatusOf(booking) === 'pending') return false
  const startMs = bookingStartMs(booking)
  return startMs !== null && startMs > nowMs
}

export function teacherCancellationErrorMessage(error: unknown, lang: 'vi' | 'en') {
  const details = typeof error === 'object' && error !== null && 'details' in error
    ? (error as { details?: { reason?: string } }).details
    : undefined
  const reason = details?.reason || ''
  const vi: Record<string, string> = {
    BOOKING_NOT_FOUND: 'Không tìm thấy ca học. Vui lòng tải lại lịch.',
    BOOKING_TEACHER_MISMATCH: 'Ca học không thuộc tài khoản gia sư đang đăng nhập.',
    BOOKING_NOT_CONFIRMED: 'Ca này không còn ở trạng thái đã xếp lớp.',
    BOOKING_ALREADY_ATTENDED: 'Ca đã được điểm danh nên không thể xin huỷ.',
    CANCELLATION_ALREADY_PENDING: 'Ca này đã có yêu cầu huỷ đang chờ duyệt.',
    BOOKING_TIME_INVALID: 'Ca học chưa có ngày giờ hợp lệ. Vui lòng liên hệ giáo vụ.',
    BOOKING_ALREADY_STARTED: 'Ca học đã bắt đầu hoặc đã qua. Vui lòng liên hệ giáo vụ trực tiếp.',
    CANCELLATION_NOT_PENDING: 'Yêu cầu huỷ đã được giáo vụ xử lý.',
    CANCELLATION_REASON_REQUIRED: `Vui lòng nhập lý do (ít nhất ${TEACHER_CANCELLATION_REASON_MIN} ký tự).`,
    CANCELLATION_REASON_TOO_LONG: `Lý do tối đa ${TEACHER_CANCELLATION_REASON_MAX} ký tự.`,
    TEACHER_PROFILE_INACTIVE: 'Hồ sơ gia sư không còn hoạt động.',
    LATE_CANCELLATION_PENALTY_CONSENT_REQUIRED: 'Huỷ lớp khi còn dưới 1 giờ sẽ bị trừ 50.000đ. Vui lòng bấm “Chấp nhận bị trừ 50k” để xác nhận.',
  }
  const en: Record<string, string> = {
    BOOKING_NOT_FOUND: 'This class could not be found. Please reload the schedule.',
    BOOKING_TEACHER_MISMATCH: 'This class does not belong to the signed-in tutor.',
    BOOKING_NOT_CONFIRMED: 'This class is no longer scheduled.',
    BOOKING_ALREADY_ATTENDED: 'Attendance was already submitted for this class.',
    CANCELLATION_ALREADY_PENDING: 'A cancellation request for this class is already pending.',
    BOOKING_TIME_INVALID: 'This class has no valid date/time. Please contact the academic team.',
    BOOKING_ALREADY_STARTED: 'This class has already started. Please contact the academic team directly.',
    CANCELLATION_NOT_PENDING: 'The academic team has already handled this request.',
    CANCELLATION_REASON_REQUIRED: `Please enter a reason (at least ${TEACHER_CANCELLATION_REASON_MIN} characters).`,
    CANCELLATION_REASON_TOO_LONG: `The reason can be at most ${TEACHER_CANCELLATION_REASON_MAX} characters.`,
    TEACHER_PROFILE_INACTIVE: 'This tutor profile is no longer active.',
    LATE_CANCELLATION_PENALTY_CONSENT_REQUIRED: 'Cancelling with less than one hour notice deducts 50,000 VND. Please confirm the deduction.',
  }
  const table = lang === 'vi' ? vi : en
  if (reason && table[reason]) return table[reason]
  return lang === 'vi'
    ? 'Chưa gửi được yêu cầu. Vui lòng kiểm tra mạng và thử lại.'
    : 'The request could not be sent. Please check your connection and try again.'
}

export type AdminCancellationResult = 'done' | 'skipped' | 'booking_changed'

/**
 * Giáo vụ DUYỆT: nhả ca + nhả phần kim cương đang giữ đúng bằng số điểm của ca.
 * Nếu ca đã được điểm danh / đã nhả ở nơi khác thì KHÔNG nhả gì, trả 'booking_changed'
 * để giao diện đề nghị đóng yêu cầu.
 */
export async function approveTeacherClassCancellation(input: {
  bookingId: string
  actorUid: string
  adminNote?: string
}): Promise<AdminCancellationResult> {
  return runTransaction(db, async (tx) => {
    const bookingRef = doc(db, 'bookingRequests', input.bookingId)
    const bookingSnap = await tx.get(bookingRef)
    if (!bookingSnap.exists()) return 'skipped'
    const booking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
    if (teacherCancellationStatusOf(booking) !== 'pending') return 'skipped'
    if (!isBookingCancellable(booking) || !booking.studentId) return 'booking_changed'

    const studentRef = doc(db, 'students', booking.studentId)
    const studentSnap = await tx.get(studentRef)
    const penaltyAmount = booking.teacherCancellationPenaltyAmount === LATE_CANCELLATION_PENALTY_AMOUNT_VND
      && booking.teacherCancellationPenaltyCurrency === 'VND'
      ? LATE_CANCELLATION_PENALTY_AMOUNT_VND
      : 0
    const penaltyMonth = /^\d{4}-\d{2}-\d{2}$/.test(booking.requestedDate || '')
      ? (booking.requestedDate || '').slice(0, 7)
      : ''
    const penaltyRef = penaltyAmount > 0 && penaltyMonth
      ? doc(db, 'payroll', lateCancellationPenaltyPayrollId(booking.id))
      : null
    const penaltySnap = penaltyRef ? await tx.get(penaltyRef) : null
    const points = getBookingPoints(booking)
    let released = 0
    let nextHeld: number | null = null
    if (studentSnap.exists()) {
      const student = { id: studentSnap.id, ...studentSnap.data() } as Student
      const current = Number(student.reservedMinutes ?? student.heldMinutes ?? 0) || 0
      released = Math.max(0, Math.min(current, points))
      nextHeld = current - released
      tx.update(studentRef, { reservedMinutes: nextHeld, heldMinutes: nextHeld, updatedAt: serverTimestamp() })
    }
    const note = (input.adminNote || '').trim().slice(0, TEACHER_CANCELLATION_REASON_MAX)
    tx.update(bookingRef, {
      status: 'released',
      releasedAt: serverTimestamp(),
      releasedBy: input.actorUid,
      releaseReason: 'teacher_cancellation_approved',
      ...(nextHeld !== null ? { heldMinutesAfterRelease: nextHeld } : {}),
      teacherCancellationStatus: 'approved',
      teacherCancellationResolvedAt: serverTimestamp(),
      teacherCancellationResolvedBy: input.actorUid,
      teacherCancellationAdminNote: note,
      ...(penaltyRef ? { teacherCancellationPenaltyPayrollId: penaltyRef.id } : {}),
    })
    if (penaltyRef && !penaltySnap?.exists()) {
      tx.set(penaltyRef, {
        teacherId: booking.teacherId,
        teacherName: booking.teacherName || booking.teacherCode || '',
        lessonId: '',
        type: 'adjustment',
        adjustmentSource: 'late_teacher_cancellation',
        sourceBookingId: booking.id,
        adjustmentNote: `Huỷ lớp dưới 1 giờ: ${booking.studentName || booking.studentCode || 'học viên'} · ${booking.requestedDate || ''} ${booking.requestedStart || ''}`.trim(),
        amount: -LATE_CANCELLATION_PENALTY_AMOUNT_VND,
        minutes: 0,
        pricePerMinute: 0,
        level: 0,
        month: penaltyMonth,
        currency: 'VND',
        paid: false,
        createdBy: input.actorUid,
        createdAt: serverTimestamp(),
      })
    }
    tx.set(doc(collection(db, 'adminLogs')), {
      adminId: input.actorUid,
      action: 'TEACHER_CLASS_CANCELLATION_APPROVED',
      targetType: 'bookingRequest',
      targetId: booking.id,
      changes: {
        teacherId: booking.teacherId,
        teacherCode: booking.teacherCode || '',
        studentId: booking.studentId,
        studentCode: booking.studentCode || '',
        requestedDate: booking.requestedDate || '',
        requestedStart: booking.requestedStart || '',
        reason: booking.teacherCancellationReason || '',
        requestedReleasePoints: points,
        releasedPoints: released,
        adminNote: note,
        lateCancellationPenaltyAmount: penaltyAmount,
        lateCancellationPenaltyPayrollId: penaltyRef?.id || '',
      },
      createdAt: serverTimestamp(),
    })
    return 'done'
  })
}

/**
 * Giáo vụ TỪ CHỐI (ca vẫn giữ nguyên, gia sư vẫn phải dạy) hoặc ĐÓNG yêu cầu khi ca
 * đã thay đổi ở nơi khác. Không đụng trạng thái ca, không đụng kim cương.
 */
export async function resolveTeacherClassCancellationWithoutRelease(input: {
  bookingId: string
  actorUid: string
  outcome: 'rejected' | 'closed'
  adminNote?: string
}): Promise<AdminCancellationResult> {
  return runTransaction(db, async (tx) => {
    const bookingRef = doc(db, 'bookingRequests', input.bookingId)
    const bookingSnap = await tx.get(bookingRef)
    if (!bookingSnap.exists()) return 'skipped'
    const booking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
    if (teacherCancellationStatusOf(booking) !== 'pending') return 'skipped'
    const note = (input.adminNote || '').trim().slice(0, TEACHER_CANCELLATION_REASON_MAX)
    tx.update(bookingRef, {
      teacherCancellationStatus: input.outcome,
      teacherCancellationResolvedAt: serverTimestamp(),
      teacherCancellationResolvedBy: input.actorUid,
      teacherCancellationAdminNote: note,
    })
    tx.set(doc(collection(db, 'adminLogs')), {
      adminId: input.actorUid,
      action: input.outcome === 'rejected' ? 'TEACHER_CLASS_CANCELLATION_REJECTED' : 'TEACHER_CLASS_CANCELLATION_CLOSED',
      targetType: 'bookingRequest',
      targetId: booking.id,
      changes: {
        teacherId: booking.teacherId,
        studentId: booking.studentId,
        requestedDate: booking.requestedDate || '',
        bookingStatus: booking.status,
        adminNote: note,
      },
      createdAt: serverTimestamp(),
    })
    return 'done'
  })
}
