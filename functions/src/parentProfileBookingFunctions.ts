import { FieldValue, Firestore, type DocumentData, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  PARENT_PROFILE_BOOKING_CONFIRMATION_WINDOW_MS,
  PARENT_PROFILE_BOOKING_READ_LIMIT,
  PARENT_PROFILE_BOOKING_REQUESTS_COLLECTION,
  PARENT_PROFILE_BOOKING_SCHEMA_VERSION,
  ParentProfileBookingValidationError,
  assertParentProfileBookingRequestFuture,
  decideParentProfileBookingHold,
  effectiveParentBookingHolds,
  isParentManagedClassHuntRebook,
  normalizeParentBookingPointRate,
  normalizeParentProfileBookingRequest,
  parentBookingPoints,
  parentProfileBookingConflictReason,
  parentProfileBookingFingerprint,
  parentProfileBookingQuota,
  parentProfileBookingRequestDocumentId,
  parentProfileReusableRebookPoints,
  teacherAvailabilityCoversParentBooking,
  type ParentProfileBookingLike,
  type ParentProfileBookingRequest,
  type ParentProfileBookingStudentLike,
} from './parentProfileBooking'

const db = new Firestore()
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/

function callableError(
  code: 'invalid-argument' | 'not-found' | 'failed-precondition' | 'already-exists' | 'resource-exhausted',
  reason: string,
  message: string,
): HttpsError {
  return new HttpsError(code, message, { reason })
}

function normalizedRequest(data: unknown): ParentProfileBookingRequest {
  try {
    return normalizeParentProfileBookingRequest(
      data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {},
    )
  } catch (cause) {
    if (cause instanceof ParentProfileBookingValidationError) {
      throw callableError('invalid-argument', cause.reason, cause.message)
    }
    throw cause
  }
}

function assertFuture(request: ParentProfileBookingRequest, nowMs: number): void {
  try {
    assertParentProfileBookingRequestFuture(request, nowMs)
  } catch (cause) {
    if (cause instanceof ParentProfileBookingValidationError) {
      throw callableError('failed-precondition', cause.reason, cause.message)
    }
    throw cause
  }
}

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function safeRevision(value: unknown, reason: string): number {
  const revision = Number(value ?? 0)
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw callableError('failed-precondition', reason, 'Phiên bản lịch hiện tại không hợp lệ; chưa tạo yêu cầu nào.')
  }
  return revision
}

function completeBookingQuery(
  snapshot: { size: number; docs: QueryDocumentSnapshot[] },
  reason: string,
): ParentProfileBookingLike[] {
  if (snapshot.size > PARENT_PROFILE_BOOKING_READ_LIMIT) {
    throw callableError('resource-exhausted', reason, 'Lịch sử đặt lịch vượt giới hạn kiểm tra an toàn; chưa tạo yêu cầu nào.')
  }
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))
}

function deduplicateBookings(groups: ParentProfileBookingLike[][]): ParentProfileBookingLike[] {
  const byId = new Map<string, ParentProfileBookingLike>()
  let anonymousIndex = 0
  groups.flat().forEach((booking) => {
    const id = typeof booking.id === 'string' && booking.id ? booking.id : `anonymous-${anonymousIndex++}`
    byId.set(id, booking)
  })
  return [...byId.values()]
}

function bookingResponse(id: string, data: DocumentData, createdAtMs: number, deadlineAtMs: number) {
  return {
    id,
    status: data.status,
    teacherResponse: data.teacherResponse,
    teacherId: data.teacherId,
    teacherCode: data.teacherCode,
    teacherName: data.teacherName,
    teacherPhotoURL: data.teacherPhotoURL,
    studentId: data.studentId,
    studentCode: data.studentCode,
    studentName: data.studentName,
    subjectId: data.subjectId,
    subjectName: data.subjectName,
    requestedDay: data.requestedDay,
    requestedDate: data.requestedDate,
    requestedWeekStart: data.requestedWeekStart,
    requestedStart: data.requestedStart,
    requestedEnd: data.requestedEnd,
    requestedMinutes: data.requestedMinutes,
    requestedPoints: data.requestedPoints,
    pointsPer25Minutes: data.pointsPer25Minutes,
    availableMinutesAtRequest: data.availableMinutesAtRequest,
    heldMinutesAtRequest: data.heldMinutesAtRequest,
    heldImmediately: data.heldImmediately,
    heldMinutesAfterRequest: data.heldMinutesAfterRequest,
    note: data.note,
    createdAtMs,
    teacherConfirmationDeadlineAtMs: deadlineAtMs,
  }
}

function validateStoredRetry(
  request: ParentProfileBookingRequest,
  fingerprint: string,
  marker: DocumentData,
): { bookingId: string; createdAtMs: number; deadlineAtMs: number } {
  if (marker.schemaVersion !== PARENT_PROFILE_BOOKING_SCHEMA_VERSION
    || marker.kind !== 'parent_profile_booking_request'
    || marker.studentId !== request.studentId
    || marker.studentCode !== request.studentCode
    || marker.fingerprint !== fingerprint) {
    throw callableError('already-exists', 'PARENT_BOOKING_IDEMPOTENCY_CONFLICT', 'Mã gửi lịch đã được dùng với nội dung khác.')
  }
  const bookingId = text(marker.bookingId, 160)
  const createdAtMs = Number(marker.createdAtMs)
  const deadlineAtMs = Number(marker.teacherConfirmationDeadlineAtMs)
  if (!SAFE_ID_PATTERN.test(bookingId) || !Number.isFinite(createdAtMs) || !Number.isFinite(deadlineAtMs)) {
    throw callableError('failed-precondition', 'PARENT_BOOKING_IDEMPOTENCY_INVALID', 'Dấu vết gửi lịch cũ không hợp lệ.')
  }
  return { bookingId, createdAtMs, deadlineAtMs }
}

export const createParentProfileBooking = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 10,
}, async (call) => {
  const request = normalizedRequest(call.data)
  const fingerprint = parentProfileBookingFingerprint(request)
  const markerRef = db.collection(PARENT_PROFILE_BOOKING_REQUESTS_COLLECTION)
    .doc(parentProfileBookingRequestDocumentId(request.studentId, request.clientRequestId))
  const provisionalBookingRef = db.collection('bookingRequests').doc()

  const result = await db.runTransaction(async (transaction) => {
    // Read the idempotency marker first. A committed request must be recoverable
    // even when its slot is now in the past or the student's quota later changed.
    const markerSnapshot = await transaction.get(markerRef)
    if (markerSnapshot.exists) {
      const previous = validateStoredRetry(request, fingerprint, markerSnapshot.data() || {})
      const [bookingSnapshot, currentStudentSnapshot] = await Promise.all([
        transaction.get(db.collection('bookingRequests').doc(previous.bookingId)),
        transaction.get(db.collection('students').doc(request.studentId)),
      ])
      if (!bookingSnapshot.exists) {
        throw callableError('failed-precondition', 'PARENT_BOOKING_IDEMPOTENCY_TARGET_MISSING', 'Yêu cầu cũ không còn booking để khôi phục.')
      }
      const booking = bookingSnapshot.data() || {}
      const currentStudent = currentStudentSnapshot.data() || {}
      if (!currentStudentSnapshot.exists
        || currentStudent.code !== request.studentCode
        || booking.studentId !== request.studentId
        || booking.studentCode !== request.studentCode) {
        throw callableError('failed-precondition', 'PARENT_BOOKING_IDEMPOTENCY_TARGET_INVALID', 'Booking cũ không còn khớp học viên.')
      }
      const currentHeld = Number(currentStudent.reservedMinutes ?? currentStudent.heldMinutes)
      if (!Number.isFinite(currentHeld) || currentHeld < 0) {
        throw callableError('failed-precondition', 'PARENT_BOOKING_HOLD_INVALID', 'Số kim cương giữ chỗ hiện tại không hợp lệ.')
      }
      const rebookWasCleared = markerSnapshot.data()?.rebooked === true
        && !text(currentStudent.pendingRebookBookingId, 160)
      return {
        booking: bookingResponse(bookingSnapshot.id, booking, previous.createdAtMs, previous.deadlineAtMs),
        studentPatch: {
          reservedMinutes: currentHeld,
          heldMinutes: currentHeld,
          ...(rebookWasCleared ? { pendingRebookBookingId: '', pendingRebookPoints: 0 } : {}),
        },
        idempotent: true,
      }
    }

    const attemptNowMs = Date.now()
    assertFuture(request, attemptNowMs)
    const studentRef = db.collection('students').doc(request.studentId)
    const teacherRef = db.collection('teachers').doc(request.teacherId)
    const availabilityRef = db.collection('teacherAvailability').doc(request.teacherId)
    const [studentSnapshot, teacherSnapshot, availabilitySnapshot] = await Promise.all([
      transaction.get(studentRef),
      transaction.get(teacherRef),
      transaction.get(availabilityRef),
    ])
    if (!studentSnapshot.exists) throw callableError('not-found', 'PARENT_BOOKING_STUDENT_NOT_FOUND', 'Không tìm thấy học viên.')
    if (!teacherSnapshot.exists) throw callableError('not-found', 'PARENT_BOOKING_TEACHER_NOT_FOUND', 'Không tìm thấy gia sư.')
    const student = studentSnapshot.data() as ParentProfileBookingStudentLike & DocumentData
    const teacher = teacherSnapshot.data() || {}
    if (text(student.code, 80) !== request.studentCode || studentSnapshot.id !== request.studentId) {
      throw callableError('failed-precondition', 'PARENT_BOOKING_STUDENT_MISMATCH', 'Mã học viên không khớp hồ sơ đã chọn.')
    }
    if (student.status !== 'active') {
      throw callableError('failed-precondition', 'PARENT_BOOKING_STUDENT_INACTIVE', 'Học viên hiện không ở trạng thái có thể đặt lịch.')
    }
    if (teacher.status !== 'active') {
      throw callableError('failed-precondition', 'PARENT_BOOKING_TEACHER_INACTIVE', 'Gia sư hiện không còn nhận lịch.')
    }
    if (!Array.isArray(teacher.subjectIds) || !teacher.subjectIds.includes(request.subjectId)) {
      throw callableError('failed-precondition', 'PARENT_BOOKING_SUBJECT_MISMATCH', 'Gia sư không còn được phân công môn học đã chọn.')
    }
    if (!teacherAvailabilityCoversParentBooking(availabilitySnapshot.data(), request)) {
      throw callableError('failed-precondition', 'PARENT_BOOKING_AVAILABILITY_CHANGED', 'Lịch rảnh của gia sư vừa thay đổi.')
    }

    const teacherBookingsQuery = db.collection('bookingRequests')
      .where('teacherId', '==', request.teacherId)
      .limit(PARENT_PROFILE_BOOKING_READ_LIMIT + 1)
    const studentBookingsQuery = db.collection('bookingRequests')
      .where('studentId', '==', request.studentId)
      .limit(PARENT_PROFILE_BOOKING_READ_LIMIT + 1)
    const memberBookingsQuery = db.collection('bookingRequests')
      .where('groupClassMemberIds', 'array-contains', request.studentId)
      .limit(PARENT_PROFILE_BOOKING_READ_LIMIT + 1)
    const [teacherBookingsSnapshot, studentBookingsSnapshot, memberBookingsSnapshot] = await Promise.all([
      transaction.get(teacherBookingsQuery),
      transaction.get(studentBookingsQuery),
      transaction.get(memberBookingsQuery),
    ])
    const allBookings = deduplicateBookings([
      completeBookingQuery(teacherBookingsSnapshot, 'PARENT_BOOKING_TEACHER_HISTORY_TOO_LARGE'),
      completeBookingQuery(studentBookingsSnapshot, 'PARENT_BOOKING_STUDENT_HISTORY_TOO_LARGE'),
      completeBookingQuery(memberBookingsSnapshot, 'PARENT_BOOKING_MEMBER_HISTORY_TOO_LARGE'),
    ])
    const conflict = parentProfileBookingConflictReason(request, allBookings)
    if (conflict) {
      const reason = conflict === 'invalid-existing-booking'
        ? 'PARENT_BOOKING_EXISTING_DATA_INVALID'
        : 'PARENT_BOOKING_CONFLICT'
      throw callableError('failed-precondition', reason, 'Gia sư hoặc học viên vừa có lịch trùng khung giờ này.')
    }

    const quota = parentProfileBookingQuota(student, request.subjectId)
    if (!quota || quota.subjectRemainingPoints <= 0) {
      throw callableError('failed-precondition', 'PARENT_BOOKING_SUBJECT_NOT_FOUND', 'Gói môn học không còn khả dụng.')
    }
    const rate = normalizeParentBookingPointRate(teacher.pointsPer25Minutes)
    const requestedPoints = parentBookingPoints(request.requestedMinutes, rate)
    const holds = effectiveParentBookingHolds(student, allBookings, request.subjectId, request.studentId)

    const rebookId = text(student.pendingRebookBookingId, 160)
    const pendingRebookPoints = Number(student.pendingRebookPoints || 0)
    if ((rebookId && !SAFE_ID_PATTERN.test(rebookId)) || (!rebookId && pendingRebookPoints !== 0)) {
      throw callableError('failed-precondition', 'PARENT_BOOKING_REBOOK_INVALID', 'Nghĩa vụ đặt lại hiện không hợp lệ.')
    }
    let reusablePoints = 0
    let subjectReusablePoints = 0
    let rebookRef: FirebaseFirestore.DocumentReference | null = null
    if (rebookId) {
      rebookRef = db.collection('bookingRequests').doc(rebookId)
      const rebookSnapshot = await transaction.get(rebookRef)
      if (!rebookSnapshot.exists) {
        throw callableError('failed-precondition', 'PARENT_BOOKING_REBOOK_TARGET_MISSING', 'Ca cần đặt lại không còn tồn tại.')
      }
      const rebook = rebookSnapshot.data() || {}
      if (isParentManagedClassHuntRebook(rebook)) {
        throw callableError(
          'failed-precondition',
          'CLASS_HUNT_COMPENSATION_PARENT_MANAGED',
          'Lớp này có cơ chế xếp lịch riêng. Vui lòng liên hệ học vụ để đổi hoặc hủy lịch.',
        )
      }
      const validatedReusablePoints = parentProfileReusableRebookPoints({
        booking: rebook,
        request,
        pendingRebookPoints,
        effectiveHeldPoints: holds.effectiveHeldPoints,
      })
      if (validatedReusablePoints === null) {
        throw callableError('failed-precondition', 'PARENT_BOOKING_REBOOK_INVALID', 'Ca cần đặt lại không còn khớp nghĩa vụ hiện tại.')
      }
      reusablePoints = validatedReusablePoints
      subjectReusablePoints = reusablePoints
    }

    // Subject quota backs the whole new booking. The global stored hold already
    // contains a rebook obligation, so only the positive difference is new debt.
    const holdDecision = decideParentProfileBookingHold({
      subjectRemainingPoints: quota.subjectRemainingPoints,
      totalRemainingPoints: quota.totalRemainingPoints,
      subjectHeldPoints: holds.subjectHeldPoints,
      effectiveHeldPoints: holds.effectiveHeldPoints,
      requestedPoints,
      reusablePoints,
      subjectReusablePoints,
    })
    if (!holdDecision.ok) {
      const reason = holdDecision.reason === 'invalid-hold'
        ? 'PARENT_BOOKING_HOLD_INVALID'
        : 'PARENT_BOOKING_NOT_ENOUGH_POINTS'
      throw callableError('failed-precondition', reason, holdDecision.reason === 'subject-quota'
        ? 'Quỹ môn học không đủ cho khung giờ này.'
        : 'Quỹ kim cương khả dụng không đủ cho khung giờ này.')
    }
    const { heldAfterRequest } = holdDecision

    const studentRevision = safeRevision(student.bookingScheduleRevision, 'PARENT_BOOKING_STUDENT_REVISION_INVALID')
    const teacherRevision = safeRevision(teacher.bookingScheduleRevision, 'PARENT_BOOKING_TEACHER_REVISION_INVALID')
    const createdAtMs = attemptNowMs
    const deadlineAtMs = createdAtMs + PARENT_PROFILE_BOOKING_CONFIRMATION_WINDOW_MS
    const subjectName = quota.subjectName || request.subjectId
    const bookingData = {
      status: 'pending',
      teacherResponse: 'pending',
      teacherId: request.teacherId,
      teacherCode: text(teacher.code, 80),
      teacherName: text(teacher.name, 160) || text(teacher.code, 80) || 'Gia sư',
      teacherPhotoURL: text(teacher.photoURL, 500),
      studentId: request.studentId,
      studentCode: request.studentCode,
      studentName: text(student.name, 160) || request.studentCode,
      subjectId: request.subjectId,
      subjectName,
      requestedDay: request.requestedDay,
      requestedDate: request.requestedDate,
      requestedWeekStart: request.requestedWeekStart,
      requestedStart: request.requestedStart,
      requestedEnd: request.requestedEnd,
      requestedMinutes: request.requestedMinutes,
      requestedPoints,
      pointsPer25Minutes: rate,
      availableMinutesAtRequest: Math.max(0, quota.subjectRemainingPoints - holds.subjectHeldPoints),
      heldMinutesAtRequest: holds.subjectHeldPoints,
      heldImmediately: true,
      heldMinutesAfterRequest: heldAfterRequest,
      teacherConfirmationDeadlineAt: FieldValue.serverTimestamp(),
      note: '',
      createdAt: FieldValue.serverTimestamp(),
    }

    transaction.update(studentRef, {
      reservedMinutes: heldAfterRequest,
      heldMinutes: heldAfterRequest,
      lastBookingHoldRequestId: provisionalBookingRef.id,
      bookingScheduleRevision: studentRevision + 1,
      bookingScheduleUpdatedAt: FieldValue.serverTimestamp(),
      ...(rebookRef ? { pendingRebookBookingId: '', pendingRebookPoints: 0 } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.update(teacherRef, {
      bookingScheduleRevision: teacherRevision + 1,
      bookingScheduleUpdatedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(provisionalBookingRef, {
      ...bookingData,
      teacherConfirmationDeadlineAt: FirebaseFirestore.Timestamp.fromMillis(deadlineAtMs),
    })
    if (rebookRef) {
      transaction.update(rebookRef, {
        pendingRebook: false,
        rebookedAt: FieldValue.serverTimestamp(),
        rebookedByBookingId: provisionalBookingRef.id,
      })
    }
    transaction.create(markerRef, {
      schemaVersion: PARENT_PROFILE_BOOKING_SCHEMA_VERSION,
      kind: 'parent_profile_booking_request',
      studentId: request.studentId,
      studentCode: request.studentCode,
      clientRequestId: request.clientRequestId,
      fingerprint,
      bookingId: provisionalBookingRef.id,
      rebooked: Boolean(rebookRef),
      createdAtMs,
      teacherConfirmationDeadlineAtMs: deadlineAtMs,
      createdAt: FieldValue.serverTimestamp(),
    })

    return {
      booking: bookingResponse(provisionalBookingRef.id, bookingData, createdAtMs, deadlineAtMs),
      studentPatch: {
        reservedMinutes: heldAfterRequest,
        heldMinutes: heldAfterRequest,
        ...(rebookRef ? { pendingRebookBookingId: '', pendingRebookPoints: 0 } : {}),
      },
      idempotent: false,
    }
  })

  logger.info('Parent profile booking created', {
    bookingId: result.booking.id,
    studentId: request.studentId,
    teacherId: request.teacherId,
    idempotent: result.idempotent,
  })
  return result
})
