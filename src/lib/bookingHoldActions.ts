import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { BookingRequest, Lesson, Student } from '@/types'
import { getBookingPoints } from '@/lib/points'
import { isBookingCancellable, isBookingPendingRebookFundHold } from '@/lib/bookingLogic'
import { approvedLinkedBookingHoldToRelease, canSettleApprovedLinkedBooking } from '@/lib/linkedBookingHolds'

/**
 * Các thao tác nhả kim cương đang giữ từ Sổ giữ kim cương. Mỗi thao tác là một
 * transaction đọc lại dữ liệu mới nhất và bỏ qua nếu ca đã đổi trạng thái, nên
 * bấm lặp hoặc hai người cùng xử lý cũng không nhả hai lần.
 *
 * Nguyên tắc tiền: đặt lịch chỉ GIỮ (`reservedMinutes`), không trừ quỹ. Vì vậy
 * mọi thao tác ở đây chỉ giảm phần giữ, KHÔNG BAO GIỜ cộng vào `remainingMinutes`.
 */
export type HoldActionResult = 'done' | 'skipped'

function releasedHold(student: Student, points: number) {
  const current = Number(student.reservedMinutes ?? student.heldMinutes ?? 0) || 0
  const released = Math.max(0, Math.min(current, points))
  return { current, released, next: current - released }
}

/** Ca chưa điểm danh (quá hạn hoặc thiếu ngày): nhả giữ chỗ và giải phóng lịch. */
export async function releaseUnlinkedBookingHold(input: {
  bookingId: string
  actorUid: string
  resolution: 'overdue_released' | 'undated_released'
  diagnosis?: string
}): Promise<HoldActionResult> {
  return runTransaction(db, async (tx) => {
    const bookingRef = doc(db, 'bookingRequests', input.bookingId)
    const bookingSnap = await tx.get(bookingRef)
    if (!bookingSnap.exists()) return 'skipped'
    const booking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
    if (!isBookingCancellable(booking) || !booking.studentId) return 'skipped'

    const studentRef = doc(db, 'students', booking.studentId)
    const studentSnap = await tx.get(studentRef)
    const points = getBookingPoints(booking)
    let released = 0
    if (studentSnap.exists()) {
      const hold = releasedHold({ id: studentSnap.id, ...studentSnap.data() } as Student, points)
      released = hold.released
      tx.update(studentRef, { reservedMinutes: hold.next, heldMinutes: hold.next, updatedAt: serverTimestamp() })
    }
    tx.update(bookingRef, {
      status: 'released',
      releasedAt: serverTimestamp(),
      releasedBy: input.actorUid,
      holdResolution: input.resolution,
      holdResolvedAt: serverTimestamp(),
      holdResolvedBy: input.actorUid,
      ...(input.diagnosis ? { overdueResolution: input.diagnosis } : {}),
    })
    tx.set(doc(collection(db, 'adminLogs')), {
      adminId: input.actorUid,
      action: 'HOLD_LEDGER_RELEASE_BOOKING',
      targetType: 'bookingRequest',
      targetId: booking.id,
      changes: {
        studentId: booking.studentId,
        studentCode: booking.studentCode || '',
        requestedDate: booking.requestedDate || '',
        resolution: input.resolution,
        diagnosis: input.diagnosis || '',
        requestedReleasePoints: points,
        releasedPoints: released,
      },
      createdAt: serverTimestamp(),
    })
    return 'done'
  })
}

/** Buổi đã duyệt nhưng ca vẫn giữ kim cương: đóng ca, nhả phần giữ chưa từng được nhả. */
export async function settleApprovedLinkedBooking(input: {
  bookingId: string
  actorUid: string
}): Promise<HoldActionResult> {
  return runTransaction(db, async (tx) => {
    const bookingRef = doc(db, 'bookingRequests', input.bookingId)
    const bookingSnap = await tx.get(bookingRef)
    if (!bookingSnap.exists()) return 'skipped'
    const booking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
    if (!booking.lessonId || !booking.studentId) return 'skipped'

    const lessonSnap = await tx.get(doc(db, 'lessons', booking.lessonId))
    const lesson = lessonSnap.exists() ? ({ id: lessonSnap.id, ...lessonSnap.data() } as Lesson) : null
    if (!lesson || !canSettleApprovedLinkedBooking(booking, lesson)) return 'skipped'

    const studentRef = doc(db, 'students', booking.studentId)
    const studentSnap = await tx.get(studentRef)
    const holdToRelease = approvedLinkedBookingHoldToRelease(booking, lesson)
    let released = 0
    if (holdToRelease > 0 && studentSnap.exists()) {
      const hold = releasedHold({ id: studentSnap.id, ...studentSnap.data() } as Student, holdToRelease)
      released = hold.released
      tx.update(studentRef, { reservedMinutes: hold.next, heldMinutes: hold.next, updatedAt: serverTimestamp() })
    }
    // Buổi dạy giữ nguyên (đã tính quỹ và lương); chỉ đóng dòng booking còn treo.
    tx.update(bookingRef, {
      status: 'completed',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      holdResolution: 'approved_lesson_settled',
      holdResolvedAt: serverTimestamp(),
      holdResolvedBy: input.actorUid,
    })
    tx.set(doc(collection(db, 'adminLogs')), {
      adminId: input.actorUid,
      action: 'HOLD_LEDGER_SETTLE_APPROVED_BOOKING',
      targetType: 'bookingRequest',
      targetId: booking.id,
      changes: {
        studentId: booking.studentId,
        studentCode: booking.studentCode || '',
        lessonId: lesson.id,
        lessonDate: lesson.date,
        requestedDate: booking.requestedDate || '',
        lessonHoldConsumed: lesson.bookingHoldConsumed === true,
        requestedReleasePoints: holdToRelease,
        releasedPoints: released,
      },
      createdAt: serverTimestamp(),
    })
    return 'done'
  })
}

/** Học viên tự hủy (giữ kim cương chờ đặt lại): giáo vụ gỡ nghĩa vụ và nhả phần giữ. */
export async function releasePendingRebookHold(input: {
  bookingId: string
  actorUid: string
}): Promise<HoldActionResult> {
  return runTransaction(db, async (tx) => {
    const bookingRef = doc(db, 'bookingRequests', input.bookingId)
    const bookingSnap = await tx.get(bookingRef)
    if (!bookingSnap.exists()) return 'skipped'
    const booking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
    if (!isBookingPendingRebookFundHold(booking) || !booking.studentId) return 'skipped'

    const studentRef = doc(db, 'students', booking.studentId)
    const studentSnap = await tx.get(studentRef)
    const points = Number(booking.rebookHoldPoints) || 0
    let released = 0
    if (studentSnap.exists()) {
      const student = { id: studentSnap.id, ...studentSnap.data() } as Student
      const hold = releasedHold(student, points)
      released = hold.released
      tx.update(studentRef, {
        reservedMinutes: hold.next,
        heldMinutes: hold.next,
        // Chỉ gỡ khóa nếu nghĩa vụ đang treo chính là ca này.
        ...(student.pendingRebookBookingId === booking.id
          ? { pendingRebookBookingId: '', pendingRebookPoints: 0 }
          : {}),
        updatedAt: serverTimestamp(),
      })
    }
    tx.update(bookingRef, {
      pendingRebook: false,
      holdResolution: 'pending_rebook_released',
      holdResolvedAt: serverTimestamp(),
      holdResolvedBy: input.actorUid,
    })
    tx.set(doc(collection(db, 'adminLogs')), {
      adminId: input.actorUid,
      action: 'HOLD_LEDGER_RELEASE_PENDING_REBOOK',
      targetType: 'bookingRequest',
      targetId: booking.id,
      changes: {
        studentId: booking.studentId,
        studentCode: booking.studentCode || '',
        requestedDate: booking.requestedDate || '',
        rebookHoldPoints: points,
        releasedPoints: released,
      },
      createdAt: serverTimestamp(),
    })
    return 'done'
  })
}
