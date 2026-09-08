import { FieldValue, Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  TeacherBookingSecurityValidationError,
  attendanceAuditWindowDates,
  normalizeTeacherAttendanceAuditRequest,
  normalizeTeacherBookingResponseRequest,
  teacherAttendanceAuditBookingResponse,
  teacherBookingResponseConflict,
} from './teacherBookingSecurity'

const db = new Firestore()
const READ_LIMIT = 1000

function callableError(
  code: 'unauthenticated' | 'permission-denied' | 'invalid-argument' | 'not-found' | 'failed-precondition' | 'resource-exhausted',
  reason: string,
  message: string,
): HttpsError {
  return new HttpsError(code, message, { reason })
}

function normalized<T>(factory: () => T): T {
  try {
    return factory()
  } catch (cause) {
    if (cause instanceof TeacherBookingSecurityValidationError) {
      throw callableError('invalid-argument', cause.reason, cause.message)
    }
    throw cause
  }
}

async function canonicalTeacher(uid: string | undefined): Promise<{ uid: string; teacherId: string }> {
  if (!uid) throw callableError('unauthenticated', 'TEACHER_LOGIN_REQUIRED', 'Vui lòng đăng nhập lại.')
  const userSnapshot = await db.collection('users').doc(uid).get()
  const user = userSnapshot.data() || {}
  const teacherId = typeof user.teacherId === 'string' ? user.teacherId : ''
  if (user.role !== 'teacher' || !teacherId) {
    throw callableError('permission-denied', 'TEACHER_ACCESS_REQUIRED', 'Chỉ gia sư được thực hiện thao tác này.')
  }
  const teacherSnapshot = await db.collection('teachers').doc(teacherId).get()
  const teacher = teacherSnapshot.data() || {}
  if (!teacherSnapshot.exists || teacher.status === 'resigned') {
    throw callableError('permission-denied', 'TEACHER_PROFILE_INACTIVE', 'Hồ sơ gia sư không còn hoạt động.')
  }
  const canonicalUid = typeof teacher.loginAccountUid === 'string' ? teacher.loginAccountUid : ''
  if (canonicalUid && canonicalUid !== uid) {
    throw callableError('permission-denied', 'TEACHER_IDENTITY_MISMATCH', 'Phiên đăng nhập không còn khớp hồ sơ gia sư.')
  }
  return { uid, teacherId }
}

function queryRows(
  snapshot: { size: number; docs: QueryDocumentSnapshot[] },
  reason: string,
): Array<Record<string, unknown> & { id: string }> {
  if (snapshot.size > READ_LIMIT) {
    throw callableError('resource-exhausted', reason, 'Dữ liệu lịch vượt giới hạn kiểm tra an toàn.')
  }
  return snapshot.docs.map((document) => ({
    id: document.id,
    ...(document.data() as Record<string, unknown>),
  }))
}

function conflictParticipantIds(booking: Record<string, unknown>): string[] {
  const raw = [booking.studentId]
  if (Array.isArray(booking.groupClassMemberIds)) raw.push(...booking.groupClassMemberIds)
  const ids = Array.from(new Set(raw.filter((value): value is string => (
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value)
  ))))
  if (ids.length === 0 || ids.length > 50) {
    throw callableError(
      'failed-precondition',
      'BOOKING_PARTICIPANTS_INVALID',
      'Danh sách học viên của yêu cầu nhận lớp không hợp lệ.',
    )
  }
  return ids
}

export const respondToBookingRequest = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 10,
}, async (call) => {
  const actor = await canonicalTeacher(call.auth?.uid)
  const request = normalized(() => normalizeTeacherBookingResponseRequest(call.data))
  const bookingRef = db.collection('bookingRequests').doc(request.bookingId)

  await db.runTransaction(async (transaction) => {
    const bookingSnapshot = await transaction.get(bookingRef)
    if (!bookingSnapshot.exists) throw callableError('not-found', 'BOOKING_NOT_FOUND', 'Không tìm thấy yêu cầu nhận lớp.')
    const booking: Record<string, unknown> & { id: string } = {
      id: bookingSnapshot.id,
      ...(bookingSnapshot.data() as Record<string, unknown>),
    }
    if (booking.teacherId !== actor.teacherId) {
      throw callableError('permission-denied', 'BOOKING_TEACHER_MISMATCH', 'Yêu cầu không thuộc gia sư đang đăng nhập.')
    }
    if (booking.status !== 'pending' || (booking.teacherResponse && booking.teacherResponse !== 'pending')) {
      throw callableError('failed-precondition', 'BOOKING_ALREADY_RESPONDED', 'Yêu cầu này đã được phản hồi hoặc xử lý.')
    }

    if (request.response === 'accepted') {
      // Query only this teacher and the affected students. This remains bounded
      // as the platform grows and still finds group-class conflicts through
      // array-contains-any. Each query filters inactive history before the
      // fail-closed limit, then the pure checker validates exact time overlap.
      const participants = conflictParticipantIds(booking)
      const participantChunks: string[][] = []
      for (let index = 0; index < participants.length; index += 30) {
        participantChunks.push(participants.slice(index, index + 30))
      }
      const queries = ['pending', 'confirmed'].flatMap((status) => [
        db.collection('bookingRequests')
          .where('teacherId', '==', actor.teacherId)
          .where('status', '==', status)
          .limit(READ_LIMIT + 1),
        ...participantChunks.map((ids) => db.collection('bookingRequests')
          .where('studentId', 'in', ids)
          .where('status', '==', status)
          .limit(READ_LIMIT + 1)),
        ...participantChunks.map((ids) => db.collection('bookingRequests')
          .where('groupClassMemberIds', 'array-contains-any', ids)
          .where('status', '==', status)
          .limit(READ_LIMIT + 1)),
      ])
      const snapshots = await Promise.all(queries.map((query) => transaction.get(query)))
      const byId = new Map<string, Record<string, unknown>>()
      snapshots.forEach((snapshot) => queryRows(snapshot, 'BOOKING_CONFLICT_HISTORY_TOO_LARGE')
        .forEach((row) => byId.set(String(row.id), row)))
      try {
        const conflict = teacherBookingResponseConflict(booking, [...byId.values()])
        if (conflict) {
          throw callableError('failed-precondition', 'BOOKING_CONFLICT', 'Khung giờ vừa trùng với một lớp khác.')
        }
      } catch (cause) {
        if (cause instanceof TeacherBookingSecurityValidationError) {
          throw callableError('failed-precondition', cause.reason, cause.message)
        }
        throw cause
      }
    }

    transaction.update(bookingRef, {
      teacherResponse: request.response,
      teacherRespondedAt: FieldValue.serverTimestamp(),
      teacherRespondedBy: actor.uid,
    })
  })
  return { bookingId: request.bookingId, response: request.response }
})

export const getTeacherAttendanceAuditData = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 20,
}, async (call) => {
  const actor = await canonicalTeacher(call.auth?.uid)
  const request = normalized(() => normalizeTeacherAttendanceAuditRequest(call.data))
  if (request.teacherId !== actor.teacherId) {
    throw callableError('permission-denied', 'TEACHER_IDENTITY_MISMATCH', 'Chỉ được kiểm tra lịch của chính gia sư.')
  }
  const dates = attendanceAuditWindowDates(request.date)
  let bookingSnapshot
  try {
    bookingSnapshot = await db.collection('bookingRequests')
      .where('studentId', '==', request.studentId)
      .where('requestedDate', 'in', dates)
      .limit(READ_LIMIT + 1)
      .get()
  } catch {
    bookingSnapshot = await db.collection('bookingRequests')
      .where('studentId', '==', request.studentId)
      .where('requestedDate', '==', request.date)
      .limit(READ_LIMIT + 1)
      .get()
  }
  const lessonSnapshot = await db.collection('lessons')
    .where('teacherId', '==', actor.teacherId)
    .where('studentId', '==', request.studentId)
    .where('date', '==', request.date)
    .limit(READ_LIMIT + 1)
    .get()
  const bookings = queryRows(bookingSnapshot, 'ATTENDANCE_BOOKING_HISTORY_TOO_LARGE')
  const lessons = queryRows(lessonSnapshot, 'ATTENDANCE_LESSON_HISTORY_TOO_LARGE')
  const sameDayByTeacher = lessons.filter((lesson) => (
    lesson.status !== 'rejected'
    && lesson.status !== 'cancelled'
    && !lesson.absenceFollowUpOf
  )).length
  return {
    bookings: bookings.map((booking) => teacherAttendanceAuditBookingResponse(String(booking.id), booking)),
    sameDayByTeacher,
  }
})
