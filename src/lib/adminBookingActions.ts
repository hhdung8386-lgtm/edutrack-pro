import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import app, { db } from '@/lib/firebase'
import { getTeacherCheckin } from '@/lib/teacherCheckin'
import type { BookingRequest } from '@/types'

export type AdminAbsenceType = 'with_permission' | 'without_permission'

const absenceCallable = httpsCallable<
  { bookingId: string; absenceType: AdminAbsenceType; note: string },
  { lessonId: string; lessonCount: number }
>(getFunctions(app, 'asia-southeast1'), 'adminMarkStudentAbsent')

export async function markStudentAbsent(bookingId: string, absenceType: AdminAbsenceType, note: string) {
  const response = await absenceCallable({ bookingId, absenceType, note: note.trim() })
  return response.data
}

export function canDeductTeacherLate(booking: BookingRequest, nowMs: number) {
  if (booking.status !== 'confirmed' || booking.teacherLatePenaltyPayrollId) return false
  const checkin = getTeacherCheckin(booking, nowMs)
  return checkin.status === 'late'
    || ((checkin.status === 'missing_live' || checkin.status === 'missing')
      && checkin.startMs !== null && nowMs >= checkin.startMs + 5 * 60_000)
}

export async function deductTeacherLate(input: {
  bookingId: string
  actorUid: string
  amount: number
  currency: 'VND' | 'PHP' | 'USD'
  note: string
}): Promise<'done' | 'already'> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 100_000_000) {
    throw new Error('PENALTY_AMOUNT_INVALID')
  }
  if (!input.actorUid || input.note.trim().length < 5 || input.note.trim().length > 500) {
    throw new Error('PENALTY_NOTE_INVALID')
  }
  const payrollId = `teacher-late-${input.bookingId}`
  return runTransaction(db, async (tx) => {
    const bookingRef = doc(db, 'bookingRequests', input.bookingId)
    const payrollRef = doc(db, 'payroll', payrollId)
    const [bookingSnap, payrollSnap] = await Promise.all([tx.get(bookingRef), tx.get(payrollRef)])
    if (!bookingSnap.exists()) throw new Error('BOOKING_NOT_FOUND')
    const booking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
    if (booking.teacherLatePenaltyPayrollId === payrollId && payrollSnap.exists()) return 'already'
    if (booking.teacherLatePenaltyPayrollId || payrollSnap.exists()) throw new Error('PENALTY_ALREADY_EXISTS')
    if (!canDeductTeacherLate(booking, Date.now())) throw new Error('TEACHER_NOT_VERIFIED_LATE')
    if (!booking.teacherId || !/^\d{4}-\d{2}-\d{2}$/.test(booking.requestedDate || '')) {
      throw new Error('BOOKING_INCOMPLETE')
    }
    const checkin = getTeacherCheckin(booking, Date.now())
    const lateMinutes = checkin.lateMinutes ?? (checkin.startMs === null ? 0 : Math.floor((Date.now() - checkin.startMs) / 60_000))
    const month = (booking.requestedDate || '').slice(0, 7)
    tx.set(payrollRef, {
      teacherId: booking.teacherId,
      teacherName: booking.teacherName || booking.teacherCode || '',
      lessonId: '',
      type: 'adjustment',
      adjustmentSource: 'teacher_late_arrival',
      sourceBookingId: booking.id,
      adjustmentNote: `Vào lớp trễ ${lateMinutes} phút · ${booking.studentName || booking.studentCode || 'học viên'} · ${booking.requestedDate} ${booking.requestedStart}. ${input.note.trim()}`,
      amount: -input.amount,
      minutes: 0,
      pricePerMinute: 0,
      level: 0,
      month,
      currency: input.currency,
      paid: false,
      createdBy: input.actorUid,
      createdAt: serverTimestamp(),
    })
    tx.update(bookingRef, {
      teacherLatePenaltyPayrollId: payrollId,
      teacherLatePenaltyAt: serverTimestamp(),
      teacherLatePenaltyBy: input.actorUid,
    })
    tx.set(doc(collection(db, 'adminLogs')), {
      adminId: input.actorUid,
      action: 'TEACHER_LATE_ARRIVAL_DEDUCTION',
      targetType: 'bookingRequest',
      targetId: booking.id,
      changes: {
        teacherId: booking.teacherId,
        studentId: booking.studentId,
        requestedDate: booking.requestedDate,
        requestedStart: booking.requestedStart,
        recordedFirstEntry: checkin.firstAtMs !== null,
        lateMinutesAtDecision: lateMinutes,
        amount: input.amount,
        currency: input.currency,
        note: input.note.trim(),
        payrollId,
      },
      createdAt: serverTimestamp(),
    })
    return 'done'
  })
}
