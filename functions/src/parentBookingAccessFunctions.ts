import { FieldValue, Firestore, type DocumentData, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  PARENT_BOOKING_ACCESS_READ_LIMIT,
  ParentBookingAccessValidationError,
  assertParentCancellationAllowed,
  normalizeParentBookingAccessRequest,
  normalizeParentBookingCancellationRequest,
  parentBookingResponse,
  parentBusySlotResponse,
  parentCancellationResponse,
} from './parentBookingAccess'

const db = new Firestore()

function callableError(
  code: 'invalid-argument' | 'not-found' | 'failed-precondition' | 'resource-exhausted',
  reason: string,
  message: string,
): HttpsError {
  return new HttpsError(code, message, { reason })
}

function normalized<T>(factory: () => T): T {
  try {
    return factory()
  } catch (cause) {
    if (cause instanceof ParentBookingAccessValidationError) {
      throw callableError('invalid-argument', cause.reason, cause.message)
    }
    throw cause
  }
}

function documentData(snapshot: QueryDocumentSnapshot): DocumentData & { id: string } {
  return { id: snapshot.id, ...snapshot.data() }
}

function completeQuery(
  snapshot: { size: number; docs: QueryDocumentSnapshot[] },
  reason: string,
): Array<DocumentData & { id: string }> {
  if (snapshot.size > PARENT_BOOKING_ACCESS_READ_LIMIT) {
    throw callableError('resource-exhausted', reason, 'Dữ liệu lịch vượt giới hạn kiểm tra an toàn.')
  }
  return snapshot.docs.map(documentData)
}

function uniqueSafeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => (
    typeof item === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(item)
  )))).slice(0, 50)
}

async function verifiedStudent(studentId: string, studentCode: string) {
  const snapshot = await db.collection('students').doc(studentId).get()
  const data = snapshot.data() || {}
  if (!snapshot.exists || String(data.code || '').trim().toUpperCase() !== studentCode) {
    // Deliberately use one generic answer so this endpoint cannot enumerate IDs/codes.
    throw callableError('not-found', 'PARENT_BOOKING_STUDENT_NOT_FOUND', 'Không tìm thấy hồ sơ học viên phù hợp.')
  }
  return { snapshot, data }
}

export const getParentBookingState = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 20,
}, async (call) => {
  const request = normalized(() => normalizeParentBookingAccessRequest(call.data))
  const { data: student } = await verifiedStudent(request.studentId, request.studentCode)
  const recordIds = Array.from(new Set([request.studentId, ...uniqueSafeIds(student.groupClassIds)]))

  const ownBookingQueries = recordIds.map((recordId) => db.collection('bookingRequests')
    .where('studentId', '==', recordId)
    .where('status', 'in', ['pending', 'confirmed'])
    .limit(PARENT_BOOKING_ACCESS_READ_LIMIT + 1)
    .get())
  const hasBusyWindow = Boolean(request.busyFromDate && request.busyToDate)
  const teacherChunkSize = hasBusyWindow ? 30 : 1
  const teacherChunks: string[][] = []
  for (let index = 0; index < request.teacherIds.length; index += teacherChunkSize) {
    teacherChunks.push(request.teacherIds.slice(index, index + teacherChunkSize))
  }
  // Query only active lifecycle rows before applying the hard read limit. A
  // teacher's completed history can be large and must not make availability
  // disappear for every parent. Firestore supports the equality + IN merge
  // used here without widening the returned data.
  const busyQueries = teacherChunks.flatMap((teacherIds) => (
    ['pending', 'confirmed'].map((status) => {
      const baseQuery = db.collection('bookingRequests')
        .where('teacherId', 'in', teacherIds)
        .where('status', '==', status)
      const scopedQuery = request.busyFromDate && request.busyToDate
        ? baseQuery
          .where('requestedDate', '>=', request.busyFromDate)
          .where('requestedDate', '<=', request.busyToDate)
        : baseQuery
      return scopedQuery.limit(PARENT_BOOKING_ACCESS_READ_LIMIT + 1).get()
    })
  ))

  const [ownSnapshots, busySnapshots, cancellationSnapshot] = await Promise.all([
    Promise.all(ownBookingQueries),
    Promise.all(busyQueries),
    db.collection('bookingCancellationRequests')
      .where('studentId', '==', request.studentId)
      .limit(PARENT_BOOKING_ACCESS_READ_LIMIT + 1)
      .get(),
  ])
  const ownById = new Map<string, DocumentData & { id: string }>()
  ownSnapshots.forEach((snapshot) => completeQuery(snapshot, 'PARENT_BOOKING_HISTORY_TOO_LARGE')
    .forEach((booking) => ownById.set(booking.id, booking)))
  const busyById = new Map<string, DocumentData & { id: string }>()
  busySnapshots.forEach((snapshot) => completeQuery(snapshot, 'PARENT_BOOKING_TEACHER_HISTORY_TOO_LARGE')
    .forEach((booking) => busyById.set(booking.id, booking)))
  const cancellations = completeQuery(cancellationSnapshot, 'PARENT_BOOKING_CANCELLATIONS_TOO_LARGE')

  return {
    bookings: [...ownById.values()].map((booking) => parentBookingResponse(booking.id, booking)),
    busySlots: [...busyById.values()].map((booking) => parentBusySlotResponse(booking.id, booking)),
    cancellationRequests: cancellations.map((item) => parentCancellationResponse(item.id, item)),
    studentPatch: {
      reservedMinutes: Number(student.reservedMinutes ?? student.heldMinutes ?? 0),
      heldMinutes: Number(student.reservedMinutes ?? student.heldMinutes ?? 0),
      pendingRebookBookingId: typeof student.pendingRebookBookingId === 'string' ? student.pendingRebookBookingId : '',
      pendingRebookPoints: Number(student.pendingRebookPoints || 0),
    },
  }
})

export const cancelParentBooking = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 10,
}, async (call) => {
  const request = normalized(() => normalizeParentBookingCancellationRequest(call.data))
  const bookingRef = db.collection('bookingRequests').doc(request.bookingId)
  const studentRef = db.collection('students').doc(request.studentId)

  const result = await db.runTransaction(async (transaction) => {
    const [bookingSnapshot, studentSnapshot, cancellationSnapshot] = await Promise.all([
      transaction.get(bookingRef),
      transaction.get(studentRef),
      transaction.get(db.collection('bookingCancellationRequests')
        .where('bookingId', '==', request.bookingId)
        .limit(20)),
    ])
    if (!bookingSnapshot.exists || !studentSnapshot.exists) {
      throw callableError('not-found', 'BOOKING_NOT_FOUND', 'Không tìm thấy buổi học phù hợp.')
    }
    const booking = bookingSnapshot.data() || {}
    const student = studentSnapshot.data() || {}
    const teacherId = typeof booking.teacherId === 'string' ? booking.teacherId : ''
    const teacherSnapshot = teacherId
      ? await transaction.get(db.collection('teachers').doc(teacherId))
      : null
    const teacher = teacherSnapshot?.data() || {}

    let decision: { heldPoints: number; currentHeld: number }
    try {
      decision = assertParentCancellationAllowed(booking, student, teacher, request, Date.now())
    } catch (cause) {
      if (cause instanceof ParentBookingAccessValidationError) {
        throw callableError('failed-precondition', cause.reason, cause.message)
      }
      throw cause
    }

    transaction.update(bookingRef, {
      status: 'released',
      releasedAt: FieldValue.serverTimestamp(),
      releasedBy: `student:${request.studentCode}`,
      heldMinutesAfterRelease: decision.currentHeld,
      selfServiceCancelled: true,
      cancellationPolicyMinutes: booking.status === 'confirmed' ? 60 : 0,
      cancellationReason: request.reason,
      cancelledMinutes: booking.requestedMinutes,
      pendingRebook: true,
      rebookHoldPoints: decision.heldPoints,
    })
    transaction.update(studentRef, {
      pendingRebookBookingId: bookingSnapshot.id,
      pendingRebookPoints: decision.heldPoints,
      updatedAt: FieldValue.serverTimestamp(),
    })
    cancellationSnapshot.docs.forEach((snapshot) => {
      const cancellation = snapshot.data()
      if (
        cancellation.status === 'pending'
        && cancellation.studentId === request.studentId
        && String(cancellation.studentCode || '').trim().toUpperCase() === request.studentCode
      ) {
        transaction.update(snapshot.ref, {
          status: 'approved',
          reviewedAt: FieldValue.serverTimestamp(),
          reviewedBy: `student:${request.studentCode}`,
        })
      }
    })
    return {
      bookingId: bookingSnapshot.id,
      studentPatch: {
        reservedMinutes: decision.currentHeld,
        heldMinutes: decision.currentHeld,
        pendingRebookBookingId: bookingSnapshot.id,
        pendingRebookPoints: decision.heldPoints,
      },
    }
  })

  logger.info('Parent booking cancelled through verified backend transaction', {
    bookingId: request.bookingId,
    studentId: request.studentId,
  })
  return result
})
