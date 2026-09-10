import { FieldValue, Firestore, Timestamp, type DocumentData } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  isActiveParentBooking,
  parentBookingHeldPoints,
  type ParentProfileBookingLike,
} from './parentProfileBooking'

const db = new Firestore()
const MAX_BOOKING_ROWS = 500
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/

export type ApprovedLessonForBooking = {
  id: string
  status?: unknown
  studentId?: unknown
  studentCode?: unknown
  teacherId?: unknown
  date?: unknown
  subjectId?: unknown
  groupClassId?: unknown
  bookingRequestId?: unknown
  bookingRequestIds?: unknown
  approvedAt?: unknown
}

function text(value: unknown, maxLength = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

/**
 * A booking is settled by reconciliation only when the approved lesson proves
 * the same attendance identity. In particular, lessonId alone is not enough:
 * a pending attendance report intentionally keeps the fund held until approval.
 */
export function isApprovedBookingSettlementCandidate(
  booking: ParentProfileBookingLike,
  lesson: ApprovedLessonForBooking | null | undefined,
): boolean {
  if (!lesson || !isActiveParentBooking(booking) || lesson.status !== 'approved') return false
  if (text(booking.lessonId) !== lesson.id) return false
  if (!text(booking.studentId) || text(booking.studentId) !== text(lesson.studentId)) return false
  if (text(booking.teacherId) !== text(lesson.teacherId)) return false
  if (text(booking.requestedDate, 20) !== text(lesson.date, 20)) return false

  const bookingCode = text(booking.studentCode, 80)
  const lessonCode = text(lesson.studentCode, 80)
  if (bookingCode && lessonCode && bookingCode !== lessonCode) return false

  const bookingSubject = text(booking.subjectId)
  const lessonSubject = text(lesson.subjectId)
  if (bookingSubject && lessonSubject && bookingSubject !== lessonSubject) {
    // A legacy subject transfer is safe only when the approved lesson itself
    // explicitly names this booking. Nearby rows must never be guessed.
    const bookingId = text(booking.id)
    const directlyReferenced = text(lesson.bookingRequestId) === bookingId
      || (Array.isArray(lesson.bookingRequestIds) && lesson.bookingRequestIds.includes(bookingId))
    if (!directlyReferenced) return false
  }

  const bookingGroup = text(booking.groupClassId)
  const lessonGroup = text(lesson.groupClassId)
  return !bookingGroup || !lessonGroup || bookingGroup === lessonGroup
}

export function approvedBookingSettlementIds(
  bookings: ParentProfileBookingLike[],
  lessons: ApprovedLessonForBooking[],
): string[] {
  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]))
  return bookings
    .filter((booking) => {
      const id = text(booking.id)
      return Boolean(id) && isApprovedBookingSettlementCandidate(booking, lessonsById.get(text(booking.lessonId)))
    })
    .map((booking) => text(booking.id))
}

function requireStaff(uid: string | undefined): Promise<string> {
  if (!uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại để đồng bộ lịch học.')
  return db.collection('users').doc(uid).get().then((snapshot) => {
    const role = snapshot.data()?.role
    if (!['admin', 'student_manager', 'teacher_manager'].includes(String(role))) {
      throw new HttpsError('permission-denied', 'Tài khoản không có quyền đồng bộ lịch học.')
    }
    return uid
  })
}

function inputText(value: unknown, field: string, maxLength: number): string {
  const result = text(value, maxLength)
  if (!SAFE_ID_PATTERN.test(result)) {
    throw new HttpsError('invalid-argument', `${field} không hợp lệ.`)
  }
  return result
}

function storedHeldPoints(student: DocumentData): number {
  const raw = student.reservedMinutes ?? student.heldMinutes
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function remainingActiveHeldPoints(
  bookings: ParentProfileBookingLike[],
  settledIds: Set<string>,
): number {
  return bookings.reduce((total, booking) => {
    if (settledIds.has(text(booking.id)) || booking.studentId === undefined) return total
    return isActiveParentBooking(booking) ? total + parentBookingHeldPoints(booking) : total
  }, 0)
}

export type BookingLedgerRepairResult = {
  repairedCount: number
  bookingIds: string[]
  heldPointsBefore: number
  heldPointsAfter: number
}

/**
 * Repairs old approval records that linked a lesson but forgot to settle the
 * booking row. The callable is staff-only and intentionally accepts one
 * student per call so the transaction and audit trail stay reviewable.
 */
export const reconcileApprovedBookingStatuses = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 10,
}, async (request): Promise<BookingLedgerRepairResult> => {
  const actorUid = await requireStaff(request.auth?.uid)
  const studentId = inputText(request.data?.studentId, 'Mã hồ sơ học viên', 160)
  const expectedCode = text(request.data?.studentCode, 80).toUpperCase()
  if (!expectedCode) throw new HttpsError('invalid-argument', 'Thiếu mã học viên.')

  const studentRef = db.collection('students').doc(studentId)
  const bookingQuery = db.collection('bookingRequests')
    .where('studentId', '==', studentId)
    .limit(MAX_BOOKING_ROWS + 1)
  const auditRef = db.collection('adminLogs').doc()

  const result = await db.runTransaction(async (transaction): Promise<BookingLedgerRepairResult> => {
    const [studentSnapshot, bookingSnapshot] = await Promise.all([
      transaction.get(studentRef),
      transaction.get(bookingQuery),
    ])
    if (!studentSnapshot.exists) throw new HttpsError('not-found', 'Không tìm thấy học viên.')
    if (bookingSnapshot.size > MAX_BOOKING_ROWS) {
      throw new HttpsError('resource-exhausted', 'Lịch học viên quá lớn để đồng bộ an toàn; vui lòng báo Admin hệ thống.')
    }

    const student = studentSnapshot.data() || {}
    if (text(student.code, 80).toUpperCase() !== expectedCode) {
      throw new HttpsError('failed-precondition', 'Mã học viên không khớp hồ sơ hiện tại.')
    }

    const bookings = bookingSnapshot.docs.map((snapshot) => ({
      id: snapshot.id,
      ...snapshot.data(),
    })) as ParentProfileBookingLike[]
    const lessonIds = [...new Set(bookings
      .filter((booking) => isActiveParentBooking(booking))
      .map((booking) => text(booking.lessonId))
      .filter(Boolean))]
    const lessonSnapshots = await Promise.all(lessonIds.map((lessonId) => (
      transaction.get(db.collection('lessons').doc(lessonId))
    )))
    const lessons = lessonSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() })) as ApprovedLessonForBooking[]
    const settledIds = new Set(approvedBookingSettlementIds(bookings, lessons))
    const heldPointsBefore = storedHeldPoints(student)
    const activeHeldPointsAfter = remainingActiveHeldPoints(bookings, settledIds)
    // Preserve an explicitly larger stored hold. It can represent a separate
    // audited obligation that is not represented by a calendar booking row.
    const heldPointsAfter = Math.max(heldPointsBefore, activeHeldPointsAfter)

    if (settledIds.size === 0) {
      return { repairedCount: 0, bookingIds: [], heldPointsBefore, heldPointsAfter }
    }

    const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]))
    for (const booking of bookings) {
      const bookingId = text(booking.id)
      if (!settledIds.has(bookingId)) continue
      const lesson = lessonsById.get(text(booking.lessonId))
      const completedAt = lesson?.approvedAt instanceof Timestamp
        ? lesson.approvedAt
        : FieldValue.serverTimestamp()
      transaction.update(db.collection('bookingRequests').doc(bookingId), {
        status: 'completed',
        completedAt,
        updatedAt: FieldValue.serverTimestamp(),
        ledgerRepairedAt: FieldValue.serverTimestamp(),
        ledgerRepairedBy: actorUid,
      })
    }
    transaction.update(studentRef, {
      reservedMinutes: heldPointsAfter,
      heldMinutes: heldPointsAfter,
      bookingScheduleRevision: Number(student.bookingScheduleRevision || 0) + 1,
      bookingScheduleUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(auditRef, {
      action: 'RECONCILE_APPROVED_BOOKING_STATUSES',
      targetType: 'student',
      targetId: studentId,
      studentCode: expectedCode,
      bookingIds: [...settledIds],
      repairedCount: settledIds.size,
      heldPointsBefore,
      heldPointsAfter,
      actorUid,
      source: 'reconcileApprovedBookingStatuses',
      createdAt: FieldValue.serverTimestamp(),
    })

    return {
      repairedCount: settledIds.size,
      bookingIds: [...settledIds],
      heldPointsBefore,
      heldPointsAfter,
    }
  })

  logger.info('Approved booking statuses reconciled', {
    actorUid,
    studentId,
    repairedCount: result.repairedCount,
    bookingIds: result.bookingIds,
  })
  return result
})
