import { FieldValue, Firestore, Timestamp, type DocumentData, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  CLASS_HUNT_PUBLISH_REQUESTS_COLLECTION,
  CLASS_HUNT_SCHEMA_VERSION,
  CLASS_HUNT_MAX_SESSIONS,
  CLASS_HUNTS_COLLECTION,
  ClassHuntValidationError,
  buildClassHuntDraft,
  classHuntSubjectAvailability,
  classHuntCompensationAmount,
  classHuntLessonPoints,
  classHuntPublicSlot,
  classHuntPublishFingerprint,
  classHuntPublishRetryMatches,
  classHuntPublishRequestDocumentId,
  classHuntDateTimeMs,
  createClassHuntId,
  decideClassHuntClaim,
  effectiveClassHuntStatus,
  effectiveClassHuntHeldPoints,
  findClassHuntBookingConflicts,
  hasAcceptedClassHuntContract,
  hasCanonicalClassHuntTeacherLogin,
  hasSufficientClassHuntPointBalance,
  heldPointsForClassHuntSubject,
  isActiveIndividualOnlineStudent,
  isClassHuntTeacherProfileComplete,
  isClassHuntCompensation,
  isClassHuntSessionShape,
  isEligibleOnlineClassHuntTeacher,
  isSafeClassHuntClientRequestId,
  classHuntClaimConflictReason,
  normalizeClassHuntSessionSelectionMode,
  pointsPer25Minutes,
  resolveClassHuntSubjectFund,
  sanitizeClassHuntForTeacher,
  classHuntSubjectRate,
  type ClassHuntBookingLike,
  type ClassHuntCompensation,
  type ClassHuntDraft,
  type ClassHuntSession,
  type ClassHuntSessionSelectionMode,
  type ClassHuntStatus,
  type ClassHuntSubjectRate,
  type ClassHuntStudentLike,
  type ClassHuntTeacherLike,
} from './classHunting'

const db = new Firestore()
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/
const CLASS_HUNT_ADMIN_LIST_LIMIT = 100
const CLASS_HUNT_TEACHER_LIST_LIMIT = 30
const CLASS_HUNT_OPEN_SCAN_LIMIT = 200
const CLASS_HUNT_BOOKING_READ_LIMIT = 1000
const CLASS_HUNT_AGGREGATE_BOOKING_READ_LIMIT = 5000
const FIRESTORE_MULTI_VALUE_QUERY_LIMIT = 30
const CONTRACT_QUERY_LIMIT = 100
const CLASS_HUNT_MATCHING_TEACHER_SCAN_LIMIT = 100
const CONTROL_CHARACTER_PATTERN = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  'g',
)

// A hunt includes student identity and package information. Match the current
// Settings visibility policy: Teacher Manager must not receive student data.
type OperatorRole = 'admin' | 'student_manager'

type OperatorActor = {
  uid: string
  role: OperatorRole
  displayName: string
}

type CanonicalTeacherActor = {
  uid: string
  teacherId: string
  teacher: ClassHuntTeacherLike & DocumentData
}

type StoredClassHunt = {
  id: string
  status: ClassHuntStatus
  studentId: string
  studentCode: string
  studentName: string
  subjectId: string
  subjectName: string
  startDate: string
  selectedDays: string[]
  requestedStart: string
  requestedMinutes: number
  sessionCount: number
  sessionSelectionMode: ClassHuntSessionSelectionMode
  sessions: ClassHuntSession[]
  expiresAtMs: number
  publishedByUid: string
  publishedByName: string
  createdAtMs: number
  bookingIds: string[]
  classHuntCompensation?: ClassHuntCompensation
  eligibleTeacherCount?: number
  claimedByTeacherId?: string
  claimedByUid?: string
  claimedAtMs?: number
  claimedTeacherName?: string
  cancelledByUid?: string
  cancelledAtMs?: number
}

function error(
  code: 'aborted' | 'already-exists' | 'failed-precondition' | 'invalid-argument' | 'not-found' | 'permission-denied' | 'unauthenticated',
  reason: string,
  message: string,
): HttpsError {
  return new HttpsError(code, message, { reason })
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(CONTROL_CHARACTER_PATTERN, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
}

function safeId(value: unknown, reason: string, message: string): string {
  const result = cleanText(value, 160)
  if (!SAFE_ID_PATTERN.test(result)) throw error('invalid-argument', reason, message)
  return result
}

function timestampMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis()
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function serverTimestampMillis(nowMs: number): Timestamp {
  return Timestamp.fromMillis(nowMs)
}

function isOperatorRole(value: unknown): value is OperatorRole {
  return value === 'admin' || value === 'student_manager'
}

function hasAcceptedContract(documents: Array<{ data(): DocumentData }>): boolean {
  // This deliberately follows the current teacher route gate, including legacy
  // contracts that have status pending. A stricter business policy can be
  // introduced later without silently locking existing teachers out.
  return documents.some((document) => hasAcceptedClassHuntContract(document.data() || {}))
}

function requireStoredHunt(id: string, data: DocumentData): StoredClassHunt {
  if (data.schemaVersion !== CLASS_HUNT_SCHEMA_VERSION || data.kind !== 'class_hunt') {
    throw error('failed-precondition', 'CLASS_HUNT_DATA_INVALID', 'Dữ liệu lớp săn không thuộc phiên bản được hỗ trợ.')
  }
  const status = data.status
  if (status !== 'open' && status !== 'claimed' && status !== 'cancelled' && status !== 'expired') {
    throw error('failed-precondition', 'CLASS_HUNT_DATA_INVALID', 'Dữ liệu lớp săn không còn hợp lệ.')
  }
  const studentId = safeId(data.studentId, 'CLASS_HUNT_DATA_INVALID', 'Dữ liệu học viên của lớp săn không hợp lệ.')
  const subjectId = safeId(data.subjectId, 'CLASS_HUNT_DATA_INVALID', 'Dữ liệu môn học của lớp săn không hợp lệ.')
  const sessions = Array.isArray(data.sessions) && data.sessions.every(isClassHuntSessionShape)
    ? data.sessions as ClassHuntSession[]
    : []
  if (sessions.length < 1 || sessions.length > CLASS_HUNT_MAX_SESSIONS || new Set(sessions.map((session) => `${session.dateISO}|${session.requestedStart}`)).size !== sessions.length) {
    throw error('failed-precondition', 'CLASS_HUNT_DATA_INVALID', 'Danh sách buổi học của lớp săn không hợp lệ.')
  }
  const requestedMinutes = Number(data.requestedMinutes)
  if (!Number.isSafeInteger(requestedMinutes) || !sessions.every((session) => session.requestedMinutes === requestedMinutes)) {
    throw error('failed-precondition', 'CLASS_HUNT_DATA_INVALID', 'Thời lượng lớp săn không khớp.')
  }
  const expiresAtMs = timestampMillis(data.expiresAtMs ?? data.expiresAt)
  if (expiresAtMs === null) throw error('failed-precondition', 'CLASS_HUNT_DATA_INVALID', 'Hạn nhận lớp không hợp lệ.')
  const createdAtMs = timestampMillis(data.createdAtMs ?? data.createdAt)
  if (createdAtMs === null) throw error('failed-precondition', 'CLASS_HUNT_DATA_INVALID', 'Thời điểm tạo lớp săn không hợp lệ.')
  const sessionCount = Number(data.sessionCount)
  if (!Number.isSafeInteger(sessionCount) || sessionCount !== sessions.length) {
    throw error('failed-precondition', 'CLASS_HUNT_DATA_INVALID', 'Số buổi của lớp săn không khớp.')
  }
  let sessionSelectionMode: ClassHuntSessionSelectionMode
  try {
    sessionSelectionMode = normalizeClassHuntSessionSelectionMode(data.sessionSelectionMode)
  } catch {
    throw error('failed-precondition', 'CLASS_HUNT_DATA_INVALID', 'Cách xếp buổi của lớp săn không hợp lệ.')
  }
  let classHuntCompensation: ClassHuntCompensation | undefined
  if (data.classHuntCompensation !== undefined) {
    if (!isClassHuntCompensation(data.classHuntCompensation)) {
      throw error('failed-precondition', 'CLASS_HUNT_COMPENSATION_INVALID', 'Đơn giá riêng của lớp không còn hợp lệ.')
    }
    try {
      // Verify the complete immutable class amount as well as the individual
      // rate. A corrupted snapshot must never silently fall back to the
      // teacher profile, subject price, or current Settings.
      classHuntCompensationAmount(data.classHuntCompensation, requestedMinutes, sessionCount)
    } catch {
      throw error('failed-precondition', 'CLASS_HUNT_COMPENSATION_INVALID', 'Đơn giá riêng của lớp không còn hợp lệ.')
    }
    classHuntCompensation = { ...data.classHuntCompensation }
  }
  const bookingIds = Array.isArray(data.bookingIds)
    ? data.bookingIds.filter((value): value is string => typeof value === 'string' && SAFE_ID_PATTERN.test(value))
    : []
  if (status === 'claimed' && (bookingIds.length !== sessions.length || new Set(bookingIds).size !== bookingIds.length)) {
    throw error('failed-precondition', 'CLASS_HUNT_DATA_INVALID', 'Lớp đã nhận có danh sách lịch không hợp lệ.')
  }
  return {
    id,
    status,
    studentId,
    studentCode: cleanText(data.studentCode, 80),
    studentName: cleanText(data.studentName, 160),
    subjectId,
    subjectName: cleanText(data.subjectName, 160) || 'Môn học',
    startDate: cleanText(data.startDate, 10),
    selectedDays: Array.isArray(data.selectedDays) ? data.selectedDays.filter((value): value is string => typeof value === 'string') : [],
    requestedStart: cleanText(data.requestedStart, 5),
    requestedMinutes,
    sessionCount,
    sessionSelectionMode,
    sessions,
    expiresAtMs,
    publishedByUid: cleanText(data.publishedByUid, 160),
    publishedByName: cleanText(data.publishedByName, 100),
    createdAtMs,
    bookingIds,
    ...(classHuntCompensation ? { classHuntCompensation } : {}),
    ...(Number.isSafeInteger(Number(data.eligibleTeacherCount)) && Number(data.eligibleTeacherCount) >= 0
      ? { eligibleTeacherCount: Number(data.eligibleTeacherCount) }
      : {}),
    ...(typeof data.claimedByTeacherId === 'string' ? { claimedByTeacherId: data.claimedByTeacherId } : {}),
    ...(typeof data.claimedByUid === 'string' ? { claimedByUid: data.claimedByUid } : {}),
    ...(timestampMillis(data.claimedAtMs ?? data.claimedAt) !== null ? { claimedAtMs: timestampMillis(data.claimedAtMs ?? data.claimedAt)! } : {}),
    ...(typeof data.claimedTeacherName === 'string' ? { claimedTeacherName: cleanText(data.claimedTeacherName, 160) } : {}),
    ...(typeof data.cancelledByUid === 'string' ? { cancelledByUid: data.cancelledByUid } : {}),
    ...(timestampMillis(data.cancelledAtMs ?? data.cancelledAt) !== null ? { cancelledAtMs: timestampMillis(data.cancelledAtMs ?? data.cancelledAt)! } : {}),
  }
}

function allSessionsStillFuture(hunt: StoredClassHunt, nowMs: number): boolean {
  return hunt.sessions.every((session) => {
    const startsAtMs = classHuntDateTimeMs(session.dateISO, session.requestedStart)
    return startsAtMs !== null && startsAtMs > nowMs
  })
}

function teacherIdentityFromDocuments(uid: string, userData: DocumentData, teacherData: DocumentData | undefined): CanonicalTeacherActor {
  const teacherId = safeId(userData.teacherId, 'CLASS_HUNT_TEACHER_LINK_INVALID', 'Tài khoản gia sư chưa được liên kết đúng hồ sơ.')
  if (userData.role !== 'teacher') {
    throw error('permission-denied', 'CLASS_HUNT_TEACHER_REQUIRED', 'Chỉ gia sư đang hoạt động mới được nhận lớp.')
  }
  if (!teacherData || teacherData.status !== 'active' || !hasCanonicalClassHuntTeacherLogin({
    teacherId,
    uid,
    teacherLoginAccountUid: teacherData.loginAccountUid,
    userTeacherId: userData.teacherId,
    userRole: userData.role,
  })) {
    throw error('permission-denied', 'CLASS_HUNT_TEACHER_IDENTITY_INVALID', 'Liên kết tài khoản gia sư không còn hợp lệ.')
  }
  if (!isEligibleOnlineClassHuntTeacher(teacherData)) {
    throw error('failed-precondition', 'CLASS_HUNT_TEACHER_NOT_ELIGIBLE', 'Hồ sơ gia sư chưa đủ điều kiện nhận lớp online.')
  }
  if (!isClassHuntTeacherProfileComplete(teacherData)) {
    throw error('failed-precondition', 'CLASS_HUNT_TEACHER_PROFILE_INCOMPLETE', 'Vui lòng hoàn thiện hồ sơ và thông tin nhận lương trước khi nhận lớp.')
  }
  return { uid, teacherId, teacher: teacherData as ClassHuntTeacherLike & DocumentData }
}

async function requireClassHuntOperator(uid: string | undefined): Promise<OperatorActor> {
  if (!uid) throw error('unauthenticated', 'CLASS_HUNT_AUTH_REQUIRED', 'Vui lòng đăng nhập lại để quản lý lớp săn.')
  const snapshot = await db.collection('users').doc(uid).get()
  const user = snapshot.data() || {}
  if (!isOperatorRole(user.role)) {
    throw error('permission-denied', 'CLASS_HUNT_OPERATOR_REQUIRED', 'Chỉ Admin hoặc Học vụ có quyền xem hồ sơ học viên được quản lý lớp săn.')
  }
  return {
    uid,
    role: user.role,
    displayName: cleanText(user.name || user.displayName || user.username || user.email, 100) || 'Học vụ 123English',
  }
}

function requireClassHuntClientRequestId(value: unknown): string {
  if (!isSafeClassHuntClientRequestId(value)) {
    throw error('invalid-argument', 'CLASS_HUNT_CLIENT_REQUEST_ID_INVALID', 'Mã chống gửi trùng lớp săn không hợp lệ. Vui lòng tải lại và thử lại.')
  }
  return value
}

function hasRequestedClassHuntCompensation(data: Record<string, unknown>): boolean {
  // Older deployed clients do not send this property at all. Preserve their
  // legacy no-rate flow for compatibility, but treat every explicit value
  // (including null/zero) as an attempt to create a priced class and enforce
  // the admin-only boundary before any record is created.
  return Object.prototype.hasOwnProperty.call(data, 'compensationRatePerMinute')
}

/**
 * Network retries must recover a committed publish before doing any fresh
 * schedule/fund preflight. Otherwise a teacher claim or a later booking could
 * make the same client request look invalid and invite a duplicate retry.
 */
async function existingPublishedHuntForRetry(
  actorUid: string,
  clientRequestId: string,
  data: Record<string, unknown>,
): Promise<StoredClassHunt | null> {
  const requestRef = db.collection(CLASS_HUNT_PUBLISH_REQUESTS_COLLECTION)
    .doc(classHuntPublishRequestDocumentId(actorUid, clientRequestId))
  const requestSnapshot = await requestRef.get()
  if (!requestSnapshot.exists) return null
  const previous = requestSnapshot.data() || {}
  if (previous.actorUid !== actorUid) {
    throw error('failed-precondition', 'CLASS_HUNT_PUBLISH_IDEMPOTENCY_INVALID', 'Dấu vết gửi lớp cũ không hợp lệ.')
  }
  const huntId = safeId(previous.huntId, 'CLASS_HUNT_PUBLISH_TARGET_MISSING', 'Yêu cầu đăng lớp cũ không còn dữ liệu để khôi phục.')
  const huntSnapshot = await db.collection(CLASS_HUNTS_COLLECTION).doc(huntId).get()
  if (!huntSnapshot.exists) {
    throw error('failed-precondition', 'CLASS_HUNT_PUBLISH_TARGET_MISSING', 'Yêu cầu đăng lớp cũ không còn dữ liệu để khôi phục.')
  }
  const hunt = requireStoredHunt(huntSnapshot.id, huntSnapshot.data() || {})
  if (!classHuntPublishRetryMatches(data, hunt)) {
    throw error('already-exists', 'CLASS_HUNT_PUBLISH_IDEMPOTENCY_CONFLICT', 'Mã gửi lớp này đã được dùng với nội dung khác.')
  }
  return hunt
}

function noRemainingClassHuntSessionMessage(availability: ReturnType<typeof classHuntSubjectAvailability>): string {
  if (availability
    && availability.remainingSessions !== undefined
    && availability.remainingSessions > 0
    && availability.heldBookingCount > 0) {
    return `Gói học đang ghi nhận còn ${availability.remainingSessions} buổi, nhưng ${availability.heldBookingCount} ca đã được giữ; không còn buổi khả dụng để xếp thêm.`
  }
  return 'Gói học không còn buổi chưa được xếp.'
}

function draftFromRequest(
  data: Record<string, unknown>,
  studentId: string,
  student: ClassHuntStudentLike,
  studentBookings: ClassHuntBookingLike[],
  nowMs: number,
): ClassHuntDraft {
  let sessionSelectionMode: ClassHuntSessionSelectionMode
  try {
    sessionSelectionMode = normalizeClassHuntSessionSelectionMode(data.sessionSelectionMode)
  } catch (cause) {
    if (cause instanceof ClassHuntValidationError) {
      throw error('invalid-argument', cause.reason, cause.message)
    }
    throw cause
  }

  const build = (sessionCount: unknown) => {
    try {
      return buildClassHuntDraft({
        studentId,
        subjectId: data.subjectId,
        startDate: data.startDate,
        selectedDays: data.weekdays,
        requestedStart: data.startTime,
        requestedMinutes: data.minutes,
        sessionCount,
        sessionSelectionMode,
        expiresInMinutes: data.expiresInMinutes,
        compensationRatePerMinute: data.compensationRatePerMinute,
      }, nowMs)
    } catch (cause) {
      if (cause instanceof ClassHuntValidationError) {
        throw error('invalid-argument', cause.reason, cause.message)
      }
      throw cause
    }
  }

  if (sessionSelectionMode === 'specific') {
    const draft = build(data.sessionCount)
    const availability = classHuntSubjectAvailability({
      student,
      subjectId: draft.subjectId,
      bookings: studentBookings,
    })
    const remainingSessionCount = availability?.availableSessionCount ?? null
    if (remainingSessionCount !== null) {
      if (remainingSessionCount < 1) {
        throw error('failed-precondition', 'CLASS_HUNT_NO_REMAINING_SESSIONS', noRemainingClassHuntSessionMessage(availability))
      }
      if (draft.sessionCount > remainingSessionCount) {
        throw error(
          'failed-precondition',
          'CLASS_HUNT_SESSION_COUNT_EXCEEDS_REMAINING',
          availability && availability.heldBookingCount > 0
            ? `Gói học chỉ còn ${remainingSessionCount} buổi khả dụng sau khi trừ ${availability.heldBookingCount} ca đã được giữ.`
            : `Gói học chỉ còn ${remainingSessionCount} buổi chưa được xếp.`,
        )
      }
    }
    return draft
  }

  // Build one canonical slot first so duration, dates and IDs are validated
  // before resolving the package-owned all-remaining count.
  const provisional = build(1)
  const subjectFund = resolveClassHuntSubjectFund(student, provisional.subjectId)
  if (!subjectFund || subjectFund.remainingMinutes <= 0) {
    throw error('failed-precondition', 'CLASS_HUNT_SUBJECT_NOT_ELIGIBLE', 'Học viên không có gói môn đang hoạt động phù hợp để săn lớp.')
  }
  if (subjectFund.minutesPerSession !== provisional.requestedMinutes) {
    throw error(
      'failed-precondition',
      'CLASS_HUNT_ALL_DURATION_MISMATCH',
      'Để xếp toàn bộ buổi còn lại, thời lượng mỗi buổi phải khớp thời lượng của gói học.',
    )
  }
  const availability = classHuntSubjectAvailability({
    student,
    subjectId: provisional.subjectId,
    bookings: studentBookings,
  })
  const remainingSessionCount = availability?.availableSessionCount ?? null
  if (remainingSessionCount === null) {
    throw error(
      'failed-precondition',
      'CLASS_HUNT_ALL_SESSION_LEDGER_UNAVAILABLE',
      'Gói học chưa có số buổi còn lại chính xác. Vui lòng chọn số buổi nhất định hoặc cập nhật gói học.',
    )
  }
  if (remainingSessionCount < 1) {
    throw error('failed-precondition', 'CLASS_HUNT_NO_REMAINING_SESSIONS', noRemainingClassHuntSessionMessage(availability))
  }
  if (remainingSessionCount > CLASS_HUNT_MAX_SESSIONS) {
    throw error(
      'failed-precondition',
      'CLASS_HUNT_ALL_ATOMIC_LIMIT',
      `Gói còn ${remainingSessionCount} buổi. Một yêu cầu CLASS HUNTING chỉ có thể tạo an toàn tối đa ${CLASS_HUNT_MAX_SESSIONS} buổi; vui lòng tách kế hoạch.`,
    )
  }
  return build(remainingSessionCount)
}

async function findIndividualStudentByCode(studentCode: unknown): Promise<{ id: string; data: DocumentData }> {
  const code = cleanText(studentCode, 80)
  if (!code) throw error('invalid-argument', 'CLASS_HUNT_STUDENT_CODE_INVALID', 'Mã học viên là bắt buộc.')
  const snapshot = await db.collection('students').where('code', '==', code).limit(2).get()
  if (snapshot.empty) throw error('not-found', 'CLASS_HUNT_STUDENT_NOT_FOUND', 'Không tìm thấy học viên theo mã đã chọn.')
  if (snapshot.size !== 1) throw error('failed-precondition', 'CLASS_HUNT_STUDENT_CODE_AMBIGUOUS', 'Mã học viên đang trùng dữ liệu; cần xử lý dữ liệu trước khi đăng lớp.')
  return { id: snapshot.docs[0].id, data: snapshot.docs[0].data() }
}

function assertStudentCanBeHunted(student: ClassHuntStudentLike, subjectId: string): { subjectName: string } {
  if (!isActiveIndividualOnlineStudent(student)) {
    throw error('failed-precondition', 'CLASS_HUNT_STUDENT_NOT_ELIGIBLE', 'Săn lớp chỉ áp dụng cho học viên 1 kèm 1 online đang hoạt động.')
  }
  const subjectFund = resolveClassHuntSubjectFund(student, subjectId)
  if (!subjectFund || subjectFund.remainingMinutes <= 0) {
    throw error('failed-precondition', 'CLASS_HUNT_SUBJECT_NOT_ELIGIBLE', 'Học viên không có gói môn đang hoạt động phù hợp để săn lớp.')
  }
  return { subjectName: subjectFund.subjectName || 'Môn học' }
}

function deduplicateBookings(...groups: ClassHuntBookingLike[][]): ClassHuntBookingLike[] {
  const byId = new Map<string, ClassHuntBookingLike>()
  let anonymous = 0
  groups.flat().forEach((booking) => {
    const key = typeof booking.id === 'string' && booking.id ? booking.id : `anonymous-${anonymous++}`
    byId.set(key, booking)
  })
  return [...byId.values()]
}

function assertNoStudentScheduleConflict(studentId: string, sessions: ClassHuntSession[], bookings: ClassHuntBookingLike[]): void {
  const conflicts = findClassHuntBookingConflicts({ teacherId: '__unassigned__', studentId, sessions, bookings })
  if (conflicts.length > 0) {
    throw error('failed-precondition', 'CLASS_HUNT_STUDENT_CONFLICT', 'Học viên đã có lịch trùng một hoặc nhiều buổi được chọn.')
  }
}

function assertTeacherClaimContext(input: {
  hunt: StoredClassHunt
  teacherId: string
  teacher: ClassHuntTeacherLike
  student: ClassHuntStudentLike
  teacherBookings: ClassHuntBookingLike[]
  studentBookings: ClassHuntBookingLike[]
  studentScheduleBookings?: ClassHuntBookingLike[]
  /**
   * The offer feed deliberately does not pre-filter a tutor's calendar. This
   * lets a tutor decide to claim a class outside their declared availability;
   * the atomic claim still blocks a real teaching-time collision.
   */
  includeTeacherSchedule?: boolean
  nowMs: number
}): { totalRequiredPoints: number; pointsPerLesson: number; nextHeld: number; curriculumLink: string } {
  const {
    hunt,
    teacherId,
    teacher,
    student,
    teacherBookings,
    studentBookings,
    studentScheduleBookings = studentBookings,
    includeTeacherSchedule = true,
    nowMs,
  } = input
  if (!allSessionsStillFuture(hunt, nowMs)) {
    throw error('failed-precondition', 'CLASS_HUNT_SESSION_PASSED', 'Một hoặc nhiều buổi của lớp săn đã qua giờ; vui lòng chọn lớp khác.')
  }
  if (!isActiveIndividualOnlineStudent(student)) {
    throw error(
      'failed-precondition',
      'CLASS_HUNT_STUDENT_NOT_ELIGIBLE',
      'Học viên không còn ở trạng thái lớp cá nhân online đang hoạt động.',
    )
  }
  if (cleanText(student.code, 80) !== hunt.studentCode) {
    throw error(
      'failed-precondition',
      'CLASS_HUNT_STUDENT_SELECTION_CHANGED',
      'Mã học viên không còn khớp yêu cầu đã đăng.',
    )
  }
  // No subject-tag filter: any eligible tutor may claim and decides from the
  // subject name whether the class fits. Money and timetable guards remain.
  const allBookings = includeTeacherSchedule
    ? deduplicateBookings(teacherBookings, studentScheduleBookings)
    : studentScheduleBookings
  const conflicts = findClassHuntBookingConflicts({
    teacherId: includeTeacherSchedule ? teacherId : '',
    studentId: hunt.studentId,
    sessions: hunt.sessions,
    bookings: allBookings,
  })
  const conflictReason = classHuntClaimConflictReason(conflicts)
  if (conflictReason === 'teacher') {
    throw error('failed-precondition', 'CLASS_HUNT_TEACHER_BOOKING_CONFLICT', 'Gia sư đã có ca dạy trùng với lớp này. Chưa tạo buổi nào.')
  }
  if (conflictReason === 'student') {
    throw error('failed-precondition', 'CLASS_HUNT_STUDENT_BOOKING_CONFLICT', 'Học viên vừa có lịch trùng với lớp này. Chưa tạo buổi nào.')
  }
  const subjectFund = resolveClassHuntSubjectFund(student, hunt.subjectId)
  if (!subjectFund || subjectFund.remainingMinutes <= 0) {
    throw error('failed-precondition', 'CLASS_HUNT_SUBJECT_NOT_ELIGIBLE', 'Gói môn của học viên không còn hợp lệ.')
  }
  const rate = pointsPer25Minutes(teacher.pointsPer25Minutes)
  const pointsPerLesson = classHuntLessonPoints(hunt.requestedMinutes, rate)
  const totalRequiredPoints = pointsPerLesson * hunt.sessions.length
  const subjectAlreadyHeld = heldPointsForClassHuntSubject(studentBookings, hunt.subjectId)
  const effectiveHold = effectiveClassHuntHeldPoints(student, studentBookings)
  if (!hasSufficientClassHuntPointBalance({
    subjectRemainingPoints: subjectFund.remainingMinutes,
    subjectHeldPoints: subjectAlreadyHeld,
    availablePoints: effectiveHold.availablePoints,
    totalRequiredPoints,
  })) {
    throw error('failed-precondition', 'CLASS_HUNT_NOT_ENOUGH_POINTS', 'Quỹ kim cương của học viên không còn đủ cho lớp này. Chưa giữ chỗ hay tạo buổi nào.')
  }
  return {
    totalRequiredPoints,
    pointsPerLesson,
    nextHeld: effectiveHold.heldPoints + totalRequiredPoints,
    curriculumLink: subjectFund.curriculumLink,
  }
}

function isoFromMillis(value: number): string {
  return new Date(value).toISOString()
}

function subjectSources(student: ClassHuntStudentLike): Array<Record<string, unknown>> {
  const subjects = student.subjects
  if (Array.isArray(subjects) && subjects.length > 0) {
    return subjects.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
  }
  return [student as Record<string, unknown>]
}

function lookupSubjects(
  student: ClassHuntStudentLike,
  studentEligible: boolean,
  bookings?: ClassHuntBookingLike[],
) {
  if (!studentEligible) return []
  const subjectIds = [...new Set(subjectSources(student)
    .map((source) => cleanText(source.subjectId, 160))
    .filter((id) => SAFE_ID_PATTERN.test(id)))]
  return subjectIds.flatMap((id) => {
    const fund = resolveClassHuntSubjectFund(student, id)
    if (!fund || fund.remainingMinutes <= 0) return []
    const availability = bookings
      ? classHuntSubjectAvailability({ student, subjectId: id, bookings })
      : null
    return [{
      id,
      name: fund.subjectName || 'Môn học',
      remainingPoints: fund.remainingMinutes,
      ...(fund.remainingSessions !== undefined ? { remainingSessions: fund.remainingSessions } : {}),
      minutesPerSession: fund.minutesPerSession,
      ...(availability ? {
        heldBookingCount: availability.heldBookingCount,
        heldPoints: availability.heldPoints,
        availablePoints: availability.availablePoints,
      } : {}),
      eligibleForHunt: true,
    }]
  })
}

function serializeLookupStudent(id: string, student: ClassHuntStudentLike, eligibleForHunt: boolean) {
  const deliveryMode = cleanText(student.classDeliveryMode, 20)
    || (student.learningScheduleType === 'offline' ? 'offline' : 'online')
  return {
    id,
    code: cleanText(student.code, 80),
    name: cleanText(student.name, 160),
    status: cleanText(student.status, 30),
    learningScheduleType: cleanText(student.learningScheduleType, 30),
    deliveryMode,
    eligibleForHunt,
  }
}

/**
 * Class-level pay is payroll-sensitive. Student managers may still manage the
 * scheduling lifecycle, but the rate itself is returned only to a system
 * admin (or separately to the teacher who is deciding whether to claim).
 */
function serializeAdminHunt(hunt: StoredClassHunt, nowMs = Date.now(), includeCompensation = false) {
  return {
    id: hunt.id,
    status: effectiveClassHuntStatus(hunt, nowMs),
    student: { id: hunt.studentId, code: hunt.studentCode, name: hunt.studentName },
    subject: { id: hunt.subjectId, name: hunt.subjectName },
    slots: hunt.sessions.map(classHuntPublicSlot),
    minutes: hunt.requestedMinutes,
    sessionCount: hunt.sessions.length,
    sessionSelectionMode: hunt.sessionSelectionMode,
    expiresAt: isoFromMillis(hunt.expiresAtMs),
    createdAt: isoFromMillis(hunt.createdAtMs),
    bookingIds: hunt.bookingIds,
    ...(includeCompensation && hunt.classHuntCompensation ? {
      classHuntCompensation: { ...hunt.classHuntCompensation },
    } : {}),
    ...(hunt.eligibleTeacherCount !== undefined ? { eligibleTeacherCount: hunt.eligibleTeacherCount } : {}),
    ...(hunt.claimedByTeacherId ? {
      claimedTeacher: {
        id: hunt.claimedByTeacherId,
        name: hunt.claimedTeacherName || 'Gia sư',
      },
    } : {}),
    ...(hunt.claimedAtMs ? { claimedAt: isoFromMillis(hunt.claimedAtMs) } : {}),
    ...(hunt.cancelledAtMs ? { cancelledAt: isoFromMillis(hunt.cancelledAtMs) } : {}),
  }
}

function teacherPayLevel(teacher: ClassHuntTeacherLike & DocumentData): number {
  // Same fallback as approval: `teacherData.level ?? 1`, and never zero.
  const level = Number(teacher.level)
  return Number.isFinite(level) && level > 0 ? level : 1
}

function serializeTeacherHunt(
  hunt: StoredClassHunt,
  subjectRate: ClassHuntSubjectRate | null = null,
  teacherLevel = 1,
) {
  const sanitized = sanitizeClassHuntForTeacher({
    id: hunt.id,
    status: hunt.status,
    subjectName: hunt.subjectName,
    requestedMinutes: hunt.requestedMinutes,
    sessions: hunt.sessions,
    expiresAtMs: hunt.expiresAtMs,
    classHuntCompensation: hunt.classHuntCompensation,
  })
  if (!sanitized) throw error('failed-precondition', 'CLASS_HUNT_DATA_INVALID', 'Lớp săn không còn dữ liệu lịch hợp lệ.')
  return {
    id: sanitized.id,
    status: sanitized.status,
    subject: { id: hunt.subjectId, name: sanitized.subjectName },
    slots: sanitized.sessions.map(classHuntPublicSlot),
    minutes: sanitized.requestedMinutes,
    sessionCount: sanitized.sessions.length,
    sessionSelectionMode: hunt.sessionSelectionMode,
    expiresAt: isoFromMillis(sanitized.expiresAtMs),
    ...(sanitized.classHuntCompensation ? {
      classHuntCompensation: { ...sanitized.classHuntCompensation },
    } : subjectRate ? {
      // No class snapshot: approval pays the package subject price x level.
      subjectRate: { ...subjectRate, teacherLevel },
    } : {}),
  }
}

function isLookupOnlyPreviewRequest(data: Record<string, unknown>): boolean {
  return data.subjectId === undefined
    && data.startDate === undefined
    && data.weekdays === undefined
    && data.startTime === undefined
    && data.minutes === undefined
    && data.sessionCount === undefined
    && data.sessionSelectionMode === undefined
    // A supplied rate is never a harmless lookup-only field: even a malformed
    // or otherwise incomplete draft is an explicit attempt to use the
    // payroll-sensitive path and must pass the admin-only gate below.
    && !hasRequestedClassHuntCompensation(data)
}

async function classHuntLookupPreview(data: Record<string, unknown>) {
  const found = await findIndividualStudentByCode(data.studentCode)
  const student = found.data as ClassHuntStudentLike
  const baseEligible = isActiveIndividualOnlineStudent(student)
  const warnings: string[] = []
  let bookings: ClassHuntBookingLike[] | undefined = []
  if (baseEligible) {
    const bookingsSnapshot = await db.collection('bookingRequests')
      .where('studentId', '==', found.id)
      .limit(CLASS_HUNT_BOOKING_READ_LIMIT + 1)
      .get()
    if (bookingsSnapshot.size > CLASS_HUNT_BOOKING_READ_LIMIT) {
      bookings = undefined
      warnings.push('Lịch học viên quá lớn để tính chính xác quỹ đang giữ khi tra cứu. Hệ thống sẽ đối soát lại an toàn trước khi đăng lớp.')
    } else {
      bookings = bookingsSnapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      } as ClassHuntBookingLike))
    }
  }
  const subjects = lookupSubjects(student, baseEligible, bookings)
  const eligibleForHunt = baseEligible && subjects.length > 0
  if (!baseEligible) {
    warnings.push('Săn lớp chỉ áp dụng cho học viên 1 kèm 1 online đang hoạt động.')
  } else if (subjects.length === 0) {
    warnings.push('Học viên chưa có gói môn còn hiệu lực để mở yêu cầu lớp.')
  }
  return {
    student: serializeLookupStudent(found.id, student, eligibleForHunt),
    subjects,
    slots: [],
    eligibleTeachers: [],
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}

async function buildOperatorContext(data: Record<string, unknown>, nowMs: number) {
  const selectedStudentId = safeId(
    data.studentId,
    'CLASS_HUNT_STUDENT_SELECTION_INVALID',
    'Học viên đã chọn không hợp lệ. Vui lòng kiểm tra lại mã học viên.',
  )
  const found = await findIndividualStudentByCode(data.studentCode)
  if (found.id !== selectedStudentId) {
    throw error(
      'failed-precondition',
      'CLASS_HUNT_STUDENT_SELECTION_CHANGED',
      'Mã học viên vừa trỏ sang hồ sơ khác. Vui lòng kiểm tra lại trước khi đăng lớp.',
    )
  }
  const student = found.data as ClassHuntStudentLike & DocumentData
  const requestedSubjectId = safeId(data.subjectId, 'CLASS_HUNT_SUBJECT_ID_INVALID', 'Gói học đã chọn không hợp lệ.')
  const { subjectName } = assertStudentCanBeHunted(student, requestedSubjectId)
  const [studentBookingsSnapshot, groupMemberBookingsSnapshot] = await Promise.all([
    db.collection('bookingRequests')
      .where('studentId', '==', found.id)
      .limit(CLASS_HUNT_BOOKING_READ_LIMIT + 1)
      .get(),
    db.collection('bookingRequests')
      .where('groupClassMemberIds', 'array-contains', found.id)
      .limit(CLASS_HUNT_BOOKING_READ_LIMIT + 1)
      .get(),
  ])
  if (studentBookingsSnapshot.size > CLASS_HUNT_BOOKING_READ_LIMIT
    || groupMemberBookingsSnapshot.size > CLASS_HUNT_BOOKING_READ_LIMIT) {
    logger.warn('Class hunt operator student booking scan reached its safety bound', {
      studentId: found.id,
    })
    throw error(
      'failed-precondition',
      'CLASS_HUNT_BOOKING_SCAN_LIMIT',
      'Lịch học viên đang quá lớn để đối soát an toàn. Vui lòng liên hệ quản trị viên.',
    )
  }
  const studentBookings = studentBookingsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() } as ClassHuntBookingLike))
  const studentScheduleBookings = deduplicateBookings(
    studentBookings,
    groupMemberBookingsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() } as ClassHuntBookingLike)),
  )
  const draft = draftFromRequest(data, found.id, student, studentBookings, nowMs)
  // `draftFromRequest` validates the same canonical subject ID. Keep this
  // fail-closed assertion in case that helper is later refactored.
  if (draft.subjectId !== requestedSubjectId) {
    throw error('failed-precondition', 'CLASS_HUNT_SUBJECT_NOT_ELIGIBLE', 'Gói học đã chọn không còn hợp lệ.')
  }
  assertNoStudentScheduleConflict(found.id, draft.sessions, studentScheduleBookings)
  return {
    draft,
    student,
    subjectName,
    studentBookings,
    studentScheduleBookings,
  }
}

/**
 * Class Hunting deliberately ignores declared availability and subject tags.
 * This preflight only confirms that at least one active, online,
 * profile-complete tutor exists, so a broadcast is never sent to nobody. The
 * contract, fund and real-calendar checks remain at list/claim time.
 */
async function countMatchingClassHuntTeachers(): Promise<number> {
  // Single-field equality: served by the automatic index, no composite index.
  const snapshot = await db.collection('teachers')
    .where('status', '==', 'active')
    .limit(CLASS_HUNT_MATCHING_TEACHER_SCAN_LIMIT + 1)
    .get()
  const matching = snapshot.docs.filter((document) => {
    const teacher = document.data() as ClassHuntTeacherLike
    return isEligibleOnlineClassHuntTeacher(teacher)
      && isClassHuntTeacherProfileComplete(teacher)
  }).length
  if (snapshot.size > CLASS_HUNT_MATCHING_TEACHER_SCAN_LIMIT) {
    logger.info('Class hunt eligible teacher count reached its display bound')
    // Do not falsely block an otherwise valid publish merely because the
    // bounded preflight cannot inspect every historical teacher profile.
    return Math.max(1, matching)
  }
  return matching
}

function assertMatchingClassHuntTeacherCount(count: number): void {
  if (count > 0) return
  throw error(
    'failed-precondition',
    'CLASS_HUNT_NO_MATCHING_TEACHER',
    'Chưa có hồ sơ gia sư online nào đang hoạt động và đủ hồ sơ để nhận lớp.',
  )
}

export const previewClassHunt = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  // Keep one lightweight instance ready for the read-only code lookup. A
  // cold-start capacity failure otherwise aborts the browser's OPTIONS
  // request before the callable can return a useful validation result.
  minInstances: 1,
  maxInstances: 5,
}, async (request) => {
  const actor = await requireClassHuntOperator(request.auth?.uid)
  const data = (request.data || {}) as Record<string, unknown>
  if (isLookupOnlyPreviewRequest(data)) return classHuntLookupPreview(data)
  if (hasRequestedClassHuntCompensation(data) && actor.role !== 'admin') {
    logger.warn('Non-admin attempted to preview a rate-bearing class hunt', {
      actorUid: actor.uid,
      actorRole: actor.role,
    })
    throw error(
      'permission-denied',
      'CLASS_HUNT_COMPENSATION_ADMIN_REQUIRED',
      'Chỉ Admin được tạo CLASS HUNTING có đơn giá riêng.',
    )
  }
  const nowMs = Date.now()
  const context = await buildOperatorContext(data, nowMs)
  const matchingTeacherCount = await countMatchingClassHuntTeachers()
  const warnings = matchingTeacherCount === 0
    ? ['Chưa có gia sư online nào đang hoạt động và đủ hồ sơ để nhận lớp. Chưa thể đăng lớp.']
    : []
  // Subject price is payroll-adjacent; mirror the class-rate policy and show
  // it only to a system admin.
  const subjectRate = actor.role === 'admin'
    ? classHuntSubjectRate(context.student, context.draft.subjectId)
    : null
  return {
    student: serializeLookupStudent(context.draft.studentId, context.student, true),
    subjects: lookupSubjects(context.student, true),
    subject: { id: context.draft.subjectId, name: context.subjectName },
    ...(subjectRate ? { subjectRate } : {}),
    slots: context.draft.sessions.map(classHuntPublicSlot),
    ...(context.draft.classHuntCompensation ? {
      classHuntCompensation: { ...context.draft.classHuntCompensation },
    } : {}),
    // Preserve this field for older clients without using it to preselect or
    // reserve a tutor. Eligibility is checked when a tutor views and claims.
    eligibleTeachers: [],
    matchingTeacherCount,
    ...(warnings.length > 0 ? { warnings } : {}),
  }
})

export const publishClassHunt = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 5,
}, async (request) => {
  const actor = await requireClassHuntOperator(request.auth?.uid)
  const data = (request.data || {}) as Record<string, unknown>
  if (hasRequestedClassHuntCompensation(data) && actor.role !== 'admin') {
    logger.warn('Non-admin attempted to publish a rate-bearing class hunt', {
      actorUid: actor.uid,
      actorRole: actor.role,
    })
    throw error(
      'permission-denied',
      'CLASS_HUNT_COMPENSATION_ADMIN_REQUIRED',
      'Chỉ Admin được tạo CLASS HUNTING có đơn giá riêng.',
    )
  }
  const clientRequestId = requireClassHuntClientRequestId(data.clientRequestId)
  const existing = await existingPublishedHuntForRetry(actor.uid, clientRequestId, data)
  if (existing) return { hunt: serializeAdminHunt(existing, Date.now(), actor.role === 'admin') }
  const nowMs = Date.now()
  const context = await buildOperatorContext(data, nowMs)
  const matchingTeacherCount = await countMatchingClassHuntTeachers()
  assertMatchingClassHuntTeacherCount(matchingTeacherCount)
  const publishRequestRef = db.collection(CLASS_HUNT_PUBLISH_REQUESTS_COLLECTION)
    .doc(classHuntPublishRequestDocumentId(actor.uid, clientRequestId))
  const newHuntRef = db.collection(CLASS_HUNTS_COLLECTION).doc(createClassHuntId())
  const auditRef = db.collection('adminLogs').doc()
  const notificationRef = db.collection('notifications').doc()

  const result = await db.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(publishRequestRef)
    if (requestSnapshot.exists) {
      const previous = requestSnapshot.data() || {}
      if (typeof previous.huntId !== 'string') {
        throw error('already-exists', 'CLASS_HUNT_PUBLISH_IDEMPOTENCY_CONFLICT', 'Mã gửi lớp này đã được dùng với nội dung khác.')
      }
      const previousHuntSnapshot = await transaction.get(db.collection(CLASS_HUNTS_COLLECTION).doc(previous.huntId))
      if (!previousHuntSnapshot.exists) {
        throw error('failed-precondition', 'CLASS_HUNT_PUBLISH_TARGET_MISSING', 'Yêu cầu đăng lớp cũ không còn dữ liệu để khôi phục.')
      }
      const previousHunt = requireStoredHunt(previousHuntSnapshot.id, previousHuntSnapshot.data() || {})
      if (!classHuntPublishRetryMatches(data, previousHunt)) {
        throw error('already-exists', 'CLASS_HUNT_PUBLISH_IDEMPOTENCY_CONFLICT', 'Mã gửi lớp này đã được dùng với nội dung khác.')
      }
      return previousHunt
    }

    const studentRef = db.collection('students').doc(context.draft.studentId)
    const studentSnapshot = await transaction.get(studentRef)
    if (!studentSnapshot.exists) throw error('not-found', 'CLASS_HUNT_STUDENT_NOT_FOUND', 'Học viên vừa không còn tồn tại.')
    const student = studentSnapshot.data() as ClassHuntStudentLike & DocumentData
    const [studentBookingsSnapshot, groupMemberBookingsSnapshot] = await Promise.all([
      transaction.get(
        db.collection('bookingRequests')
          .where('studentId', '==', context.draft.studentId)
          .limit(CLASS_HUNT_BOOKING_READ_LIMIT + 1),
      ),
      transaction.get(
        db.collection('bookingRequests')
          .where('groupClassMemberIds', 'array-contains', context.draft.studentId)
          .limit(CLASS_HUNT_BOOKING_READ_LIMIT + 1),
      ),
    ])
    if (studentBookingsSnapshot.size > CLASS_HUNT_BOOKING_READ_LIMIT
      || groupMemberBookingsSnapshot.size > CLASS_HUNT_BOOKING_READ_LIMIT) {
      throw error(
        'failed-precondition',
        'CLASS_HUNT_BOOKING_SCAN_LIMIT',
        'Lịch học viên đang quá lớn để đối soát an toàn. Vui lòng liên hệ quản trị viên.',
      )
    }
    const studentBookings = studentBookingsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() } as ClassHuntBookingLike))
    const studentScheduleBookings = deduplicateBookings(
      studentBookings,
      groupMemberBookingsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() } as ClassHuntBookingLike)),
    )
    // Re-resolve all-remaining inside the transaction. A booking or package
    // change after preview must never let a stale browser plan overbook the
    // subject ledger.
    const transactionNowMs = Date.now()
    const draft = draftFromRequest(data, context.draft.studentId, student, studentBookings, transactionNowMs)
    const { subjectName } = assertStudentCanBeHunted(student, draft.subjectId)
    assertNoStudentScheduleConflict(context.draft.studentId, draft.sessions, studentScheduleBookings)

    const expiresAtMs = transactionNowMs + draft.expiresInMinutes * 60_000
    const fingerprint = classHuntPublishFingerprint(draft)
    const hunt = {
      schemaVersion: CLASS_HUNT_SCHEMA_VERSION,
      kind: 'class_hunt',
      status: 'open' as const,
      studentId: context.draft.studentId,
      studentCode: cleanText(student.code, 80),
      studentName: cleanText(student.name, 160),
      subjectId: draft.subjectId,
      subjectName,
      startDate: draft.startDate,
      selectedDays: draft.selectedDays,
      requestedStart: draft.requestedStart,
      requestedMinutes: draft.requestedMinutes,
      sessionCount: draft.sessionCount,
      sessionSelectionMode: draft.sessionSelectionMode,
      sessions: draft.sessions,
      eligibleTeacherCount: matchingTeacherCount,
      ...(draft.classHuntCompensation ? {
        classHuntCompensation: { ...draft.classHuntCompensation },
      } : {}),
      expiresAt: serverTimestampMillis(expiresAtMs),
      expiresAtMs,
      publishedByUid: actor.uid,
      publishedByName: actor.displayName,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: transactionNowMs,
      updatedAt: FieldValue.serverTimestamp(),
      bookingIds: [],
    }
    transaction.create(newHuntRef, hunt)
    transaction.create(publishRequestRef, {
      schemaVersion: CLASS_HUNT_SCHEMA_VERSION,
      kind: 'class_hunt_publish_request',
      actorUid: actor.uid,
      clientRequestId,
      fingerprint,
      huntId: newHuntRef.id,
      createdAt: FieldValue.serverTimestamp(),
    })
    transaction.create(auditRef, {
      adminId: actor.uid,
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'PUBLISH_CLASS_HUNT',
      targetType: 'classHunt',
      targetId: newHuntRef.id,
      changes: {
        studentId: context.draft.studentId,
        subjectId: draft.subjectId,
        sessionCount: draft.sessionCount,
        sessionSelectionMode: draft.sessionSelectionMode,
        requestedMinutes: draft.requestedMinutes,
        expiresAtMs,
        eligibleTeacherCount: matchingTeacherCount,
        classHuntCompensation: draft.classHuntCompensation || null,
      },
      createdAt: FieldValue.serverTimestamp(),
    })
    // Existing notification rules deliberately expose all teacher-targeted
    // documents to active teachers. Keep this broadcast generic: it grants no
    // access and contains no student, class, subject, or schedule information.
    transaction.create(notificationRef, {
      title: 'Có lớp mới đang chờ nhận',
      content: 'Có yêu cầu Class Hunting mới trên hệ thống. Vào mục CLASS HUNTING để xem môn học, lịch và nhận lớp nếu phù hợp với bạn.',
      color: 'sky',
      iconName: 'Calendar',
      kind: 'class_hunt_available',
      targetType: 'teachers',
      targetIds: [],
      senderId: 'system:class-hunt',
      senderName: 'Hệ thống 123English',
      createdAt: FieldValue.serverTimestamp(),
      readBy: [],
    })
    return requireStoredHunt(newHuntRef.id, {
      ...hunt,
      createdAtMs: transactionNowMs,
    })
  })

  logger.info('Class hunt published', { huntId: result.id, actorUid: actor.uid, sessionCount: result.sessions.length })
  return { hunt: serializeAdminHunt(result, Date.now(), actor.role === 'admin') }
})

function requireTeacherNotificationIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw error('invalid-argument', 'TEACHER_NOTIFICATION_IDS_INVALID', 'Danh sách thông báo không hợp lệ.')
  }
  const ids = value.map((item) => safeId(item, 'TEACHER_NOTIFICATION_IDS_INVALID', 'Danh sách thông báo không hợp lệ.'))
  if (new Set(ids).size !== ids.length) {
    throw error('invalid-argument', 'TEACHER_NOTIFICATION_IDS_INVALID', 'Danh sách thông báo không hợp lệ.')
  }
  return ids
}

/**
 * Firestore Rules intentionally keep notifications server-written. Teachers
 * therefore mark only their own eligible teacher notifications through this
 * narrowly scoped callable instead of attempting a client-side update that
 * Rules reject.
 */
export const markTeacherNotificationsRead = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 5,
}, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw error('unauthenticated', 'CLASS_HUNT_AUTH_REQUIRED', 'Vui lòng đăng nhập lại để cập nhật thông báo.')
  const notificationIds = requireTeacherNotificationIds(request.data?.notificationIds)
  const [userSnapshot] = await Promise.all([
    db.collection('users').doc(uid).get(),
  ])
  const user = userSnapshot.data() || {}
  const teacherId = safeId(user.teacherId, 'CLASS_HUNT_TEACHER_LINK_INVALID', 'Tài khoản gia sư chưa được liên kết đúng hồ sơ.')
  if (user.role !== 'teacher') {
    throw error('permission-denied', 'CLASS_HUNT_TEACHER_REQUIRED', 'Chỉ gia sư có thể cập nhật thông báo của mình.')
  }
  const teacherSnapshot = await db.collection('teachers').doc(teacherId).get()
  const teacher = teacherSnapshot.data() || {}
  if (!teacherSnapshot.exists || !hasCanonicalClassHuntTeacherLogin({
    teacherId,
    uid,
    teacherLoginAccountUid: teacher.loginAccountUid,
    userTeacherId: user.teacherId,
    userRole: user.role,
  })) {
    throw error('permission-denied', 'CLASS_HUNT_TEACHER_IDENTITY_INVALID', 'Liên kết tài khoản gia sư không còn hợp lệ.')
  }

  const refs = notificationIds.map((notificationId) => db.collection('notifications').doc(notificationId))
  const snapshots = await db.getAll(...refs)
  const batch = db.batch()
  let updated = 0
  snapshots.forEach((snapshot) => {
    if (!snapshot.exists) return
    const notification = snapshot.data() || {}
    const targetIds = Array.isArray(notification.targetIds)
      ? notification.targetIds.filter((value): value is string => typeof value === 'string')
      : []
    if (notification.targetType !== 'teachers' || (targetIds.length > 0 && !targetIds.includes(teacherId))) {
      throw error('permission-denied', 'TEACHER_NOTIFICATION_TARGET_INVALID', 'Thông báo không thuộc tài khoản gia sư này.')
    }
    batch.update(snapshot.ref, { readBy: FieldValue.arrayUnion(teacherId) })
    updated += 1
  })
  if (updated > 0) await batch.commit()
  return { updated }
})

export const cancelClassHunt = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 5,
}, async (request) => {
  const actor = await requireClassHuntOperator(request.auth?.uid)
  const huntId = safeId(request.data?.huntId, 'CLASS_HUNT_ID_INVALID', 'Mã lớp săn không hợp lệ.')
  const huntRef = db.collection(CLASS_HUNTS_COLLECTION).doc(huntId)
  const auditRef = db.collection('adminLogs').doc()
  const nowMs = Date.now()
  const hunt = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(huntRef)
    if (!snapshot.exists) throw error('not-found', 'CLASS_HUNT_NOT_FOUND', 'Không tìm thấy lớp săn.')
    const current = requireStoredHunt(snapshot.id, snapshot.data() || {})
    if (current.status === 'claimed') {
      throw error('failed-precondition', 'CLASS_HUNT_ALREADY_CLAIMED', 'Lớp đã được nhận nên không thể hủy.')
    }
    if (current.status === 'cancelled') return current
    transaction.update(huntRef, {
      status: 'cancelled',
      cancelledByUid: actor.uid,
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(auditRef, {
      adminId: actor.uid,
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'CANCEL_CLASS_HUNT',
      targetType: 'classHunt',
      targetId: current.id,
      changes: { previousStatus: current.status },
      createdAt: FieldValue.serverTimestamp(),
    })
    return { ...current, status: 'cancelled' as const, cancelledByUid: actor.uid, cancelledAtMs: nowMs }
  })
  return { hunt: serializeAdminHunt(hunt, Date.now(), actor.role === 'admin') }
})

type TeacherHuntStudentContext = {
  student?: ClassHuntStudentLike
  bookings: ClassHuntBookingLike[]
  scheduleBookings: ClassHuntBookingLike[]
  complete: boolean
}

type TeacherHuntReadSet = {
  students: Map<string, TeacherHuntStudentContext>
}

type VisibleClassHunt = {
  hunt: StoredClassHunt
  subjectRate: ClassHuntSubjectRate | null
}

async function loadVisibleClassHuntCandidates(input: {
  teacher: CanonicalTeacherActor
  nowMs: number
  contractAccepted: boolean
}): Promise<VisibleClassHunt[]> {
  const { teacher, nowMs, contractAccepted } = input
  const baseQuery = db.collection(CLASS_HUNTS_COLLECTION)
    // One automatically indexed range keeps TTL-expired documents out of the
    // scan without introducing a status + expiry composite index.
    .where('expiresAtMs', '>', nowMs)
    .orderBy('expiresAtMs', 'asc')
  const visible: VisibleClassHunt[] = []
  let pendingCandidates: StoredClassHunt[] = []
  let scanned = 0
  let cursor: QueryDocumentSnapshot | undefined

  const evaluatePendingCandidates = async () => {
    if (pendingCandidates.length === 0) return
    const readSet = await loadTeacherHuntReadSet(teacher.teacherId, pendingCandidates)
    if (!readSet) {
      throw error(
        'failed-precondition',
        'CLASS_HUNT_FEED_SCAN_LIMIT',
        'Không thể đối soát danh sách lớp an toàn ở thời điểm này. Vui lòng thử lại sau.',
      )
    }
    for (const hunt of pendingCandidates) {
      if (teacherCanSeeHunt(teacher, hunt, nowMs, contractAccepted, readSet)) {
        const student = readSet.students.get(hunt.studentId)?.student
        visible.push({ hunt, subjectRate: student ? classHuntSubjectRate(student, hunt.subjectId) : null })
      }
      if (visible.length === CLASS_HUNT_TEACHER_LIST_LIMIT) break
    }
    pendingCandidates = []
  }

  while (visible.length < CLASS_HUNT_TEACHER_LIST_LIMIT && scanned < CLASS_HUNT_OPEN_SCAN_LIMIT) {
    const pageSize = Math.min(CLASS_HUNT_TEACHER_LIST_LIMIT, CLASS_HUNT_OPEN_SCAN_LIMIT - scanned)
    const query = cursor ? baseQuery.startAfter(cursor).limit(pageSize) : baseQuery.limit(pageSize)
    const snapshot = await query.get()
    if (snapshot.empty) break
    scanned += snapshot.size
    cursor = snapshot.docs[snapshot.docs.length - 1]
    for (const document of snapshot.docs) {
      try {
        const hunt = requireStoredHunt(document.id, document.data() || {})
        if (effectiveClassHuntStatus(hunt, nowMs) === 'open') {
          pendingCandidates.push(hunt)
        }
        // Evaluate a bounded group before it can hide later, claimable
        // offers behind stale or underfunded records.
        if (pendingCandidates.length === CLASS_HUNT_TEACHER_LIST_LIMIT) {
          await evaluatePendingCandidates()
          if (visible.length === CLASS_HUNT_TEACHER_LIST_LIMIT) break
        }
      } catch {
        // Invalid offers are not safe to expose and do not consume a result slot.
      }
    }
    if (snapshot.size < pageSize) break
  }
  await evaluatePendingCandidates()

  if (scanned === CLASS_HUNT_OPEN_SCAN_LIMIT && visible.length < CLASS_HUNT_TEACHER_LIST_LIMIT) {
    logger.warn('Class hunt open scan reached its safety bound', { scanned, returned: visible.length })
    if (visible.length === 0) {
      throw error(
        'failed-precondition',
        'CLASS_HUNT_FEED_SCAN_LIMIT',
        'Không thể đối soát danh sách lớp an toàn ở thời điểm này. Vui lòng thử lại sau.',
      )
    }
  }
  return visible.sort((left, right) => left.hunt.expiresAtMs - right.hunt.expiresAtMs)
}

async function loadTeacherHuntReadSet(
  teacherId: string,
  hunts: StoredClassHunt[],
): Promise<TeacherHuntReadSet | null> {
  const studentIds = [...new Set(hunts.map((hunt) => hunt.studentId))]
  if (studentIds.length > FIRESTORE_MULTI_VALUE_QUERY_LIMIT) {
    logger.warn('Class hunt teacher feed exceeded the aggregate student bound', { teacherId, students: studentIds.length })
    return null
  }
  const [studentSnapshots, directBookingsSnapshot, groupMemberBookingsSnapshot] = await Promise.all([
    db.getAll(...studentIds.map((studentId) => db.collection('students').doc(studentId))),
    db.collection('bookingRequests')
      .where('studentId', 'in', studentIds)
      .limit(CLASS_HUNT_AGGREGATE_BOOKING_READ_LIMIT + 1)
      .get(),
    db.collection('bookingRequests')
      .where('groupClassMemberIds', 'array-contains-any', studentIds)
      .limit(CLASS_HUNT_AGGREGATE_BOOKING_READ_LIMIT + 1)
      .get(),
  ])
  if (directBookingsSnapshot.size > CLASS_HUNT_AGGREGATE_BOOKING_READ_LIMIT
    || groupMemberBookingsSnapshot.size > CLASS_HUNT_AGGREGATE_BOOKING_READ_LIMIT) {
    logger.warn('Class hunt aggregate booking scan reached its safety bound', {
      teacherId,
      directBookings: directBookingsSnapshot.size,
      groupMemberBookings: groupMemberBookingsSnapshot.size,
    })
    return null
  }

  const studentData = new Map(studentSnapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => [snapshot.id, snapshot.data() as ClassHuntStudentLike]))
  const directBookingsByStudent = new Map<string, ClassHuntBookingLike[]>()
  const scheduleBookingsByStudent = new Map<string, ClassHuntBookingLike[]>()
  studentIds.forEach((studentId) => {
    directBookingsByStudent.set(studentId, [])
    scheduleBookingsByStudent.set(studentId, [])
  })
  directBookingsSnapshot.docs.forEach((document) => {
    const booking = { id: document.id, ...document.data() } as ClassHuntBookingLike
    if (typeof booking.studentId !== 'string' || !directBookingsByStudent.has(booking.studentId)) return
    directBookingsByStudent.get(booking.studentId)?.push(booking)
    scheduleBookingsByStudent.get(booking.studentId)?.push(booking)
  })
  groupMemberBookingsSnapshot.docs.forEach((document) => {
    const booking = { id: document.id, ...document.data() } as ClassHuntBookingLike
    const memberIds = Array.isArray(booking.groupClassMemberIds)
      ? booking.groupClassMemberIds.filter((memberId): memberId is string => typeof memberId === 'string')
      : []
    memberIds.forEach((studentId) => {
      if (scheduleBookingsByStudent.has(studentId)) scheduleBookingsByStudent.get(studentId)?.push(booking)
    })
  })
  const students = new Map<string, TeacherHuntStudentContext>()
  studentIds.forEach((studentId) => {
    const bookings = directBookingsByStudent.get(studentId) || []
    const scheduleBookings = deduplicateBookings(scheduleBookingsByStudent.get(studentId) || [])
    students.set(studentId, { student: studentData.get(studentId), bookings, scheduleBookings, complete: true })
  })
  return {
    students,
  }
}

function teacherCanSeeHunt(
  teacher: CanonicalTeacherActor,
  hunt: StoredClassHunt,
  nowMs: number,
  contractAccepted: boolean,
  readSet: TeacherHuntReadSet,
): boolean {
  if (!contractAccepted || effectiveClassHuntStatus(hunt, nowMs) !== 'open') return false
  const studentContext = readSet.students.get(hunt.studentId)
  if (!studentContext?.student || !studentContext.complete) return false
  try {
    assertTeacherClaimContext({
      hunt,
      teacherId: teacher.teacherId,
      teacher: teacher.teacher,
      student: studentContext.student,
      teacherBookings: [],
      studentBookings: studentContext.bookings,
      studentScheduleBookings: studentContext.scheduleBookings,
      includeTeacherSchedule: false,
      nowMs,
    })
    return true
  } catch {
    return false
  }
}

export const listClassHunts = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 5,
}, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw error('unauthenticated', 'CLASS_HUNT_AUTH_REQUIRED', 'Vui lòng đăng nhập lại để xem lớp săn.')
  const scope = request.data?.scope
  const requestedStatus = request.data?.status
  if (requestedStatus !== undefined && requestedStatus !== 'open' && requestedStatus !== 'claimed' && requestedStatus !== 'cancelled' && requestedStatus !== 'expired') {
    throw error('invalid-argument', 'CLASS_HUNT_STATUS_INVALID', 'Trạng thái lớp săn không hợp lệ.')
  }
  const userSnapshot = await db.collection('users').doc(uid).get()
  const user = userSnapshot.data() || {}
  const nowMs = Date.now()

  if (isOperatorRole(user.role)) {
    if (scope !== 'admin') throw error('permission-denied', 'CLASS_HUNT_SCOPE_INVALID', 'Học vụ chỉ được xem danh sách quản trị lớp săn.')
    // Do not combine status + ordering: that would add a Firestore composite
    // index, which this backend-only MVP deliberately avoids.
    const snapshot = await db.collection(CLASS_HUNTS_COLLECTION).orderBy('createdAt', 'desc').limit(CLASS_HUNT_ADMIN_LIST_LIMIT).get()
    const hunts = snapshot.docs
      .map((document) => {
        try { return requireStoredHunt(document.id, document.data() || {}) } catch { return null }
      })
      .filter((hunt): hunt is StoredClassHunt => hunt !== null)
      .filter((hunt) => !requestedStatus || effectiveClassHuntStatus(hunt, nowMs) === requestedStatus)
      .map((hunt) => serializeAdminHunt(hunt, nowMs, user.role === 'admin'))
    return { hunts }
  }

  if (scope !== 'teacher') throw error('permission-denied', 'CLASS_HUNT_SCOPE_INVALID', 'Gia sư chỉ được xem lớp phù hợp của chính mình.')
  const teacherId = safeId(user.teacherId, 'CLASS_HUNT_TEACHER_LINK_INVALID', 'Tài khoản gia sư chưa được liên kết đúng hồ sơ.')
  const teacherSnapshot = await db.collection('teachers').doc(teacherId).get()
  const teacher = teacherIdentityFromDocuments(uid, user, teacherSnapshot.data())
  const contractsSnapshot = await db.collection('contracts')
    .where('teacherId', '==', teacher.teacherId)
    .limit(CONTRACT_QUERY_LIMIT + 1)
    .get()
  if (contractsSnapshot.size > CONTRACT_QUERY_LIMIT) {
    logger.warn('Class hunt teacher contract scan reached its safety bound', {
      teacherId: teacher.teacherId,
    })
    throw error(
      'failed-precondition',
      'CLASS_HUNT_CONTRACT_SCAN_LIMIT',
      'Không thể đối soát hợp đồng gia sư an toàn. Vui lòng liên hệ quản trị viên.',
    )
  }
  const contractAccepted = hasAcceptedContract(contractsSnapshot.docs)
  if (!contractAccepted) return { hunts: [] }
  const eligible = await loadVisibleClassHuntCandidates({ teacher, nowMs, contractAccepted })
  return {
    hunts: eligible.map(({ hunt, subjectRate }) => serializeTeacherHunt(hunt, subjectRate, teacherPayLevel(teacher.teacher))),
  }
})

export const claimClassHunt = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 5,
}, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw error('unauthenticated', 'CLASS_HUNT_AUTH_REQUIRED', 'Vui lòng đăng nhập lại để nhận lớp.')
  const huntId = safeId(request.data?.huntId, 'CLASS_HUNT_ID_INVALID', 'Mã lớp săn không hợp lệ.')
  const clientRequestId = requireClassHuntClientRequestId(request.data?.clientRequestId)
  const huntRef = db.collection(CLASS_HUNTS_COLLECTION).doc(huntId)

  const result = await db.runTransaction(async (transaction: Transaction) => {
    const [huntSnapshot, userSnapshot] = await Promise.all([
      transaction.get(huntRef),
      transaction.get(db.collection('users').doc(uid)),
    ])
    if (!huntSnapshot.exists) throw error('not-found', 'CLASS_HUNT_NOT_FOUND', 'Lớp này không còn tồn tại.')
    const hunt = requireStoredHunt(huntSnapshot.id, huntSnapshot.data() || {})
    const user = userSnapshot.data() || {}
    const teacherId = safeId(user.teacherId, 'CLASS_HUNT_TEACHER_LINK_INVALID', 'Tài khoản gia sư chưa được liên kết đúng hồ sơ.')
    const teacherRef = db.collection('teachers').doc(teacherId)
    const teacherSnapshot = await transaction.get(teacherRef)
    const teacher = teacherIdentityFromDocuments(uid, user, teacherSnapshot.data())
    // A transaction can retry after contention. Check lifecycle from inside
    // the callback, then check it again immediately before writes below.
    const claimDecision = decideClassHuntClaim({
      status: hunt.status,
      expiresAtMs: hunt.expiresAtMs,
      claimedByTeacherId: hunt.claimedByTeacherId,
      requestedTeacherId: teacher.teacherId,
      nowMs: Date.now(),
    })
    if (claimDecision === 'idempotent') {
      return { hunt, bookingIds: hunt.bookingIds, idempotent: true }
    }
    if (claimDecision === 'already-claimed') {
      throw error('already-exists', 'CLASS_HUNT_ALREADY_CLAIMED', 'Lớp này vừa được một gia sư khác nhận trước.')
    }
    if (claimDecision === 'expired') {
      throw error('failed-precondition', 'CLASS_HUNT_EXPIRED', 'Lớp này đã hết hạn nhận.')
    }
    if (claimDecision !== 'claimable') {
      throw error('failed-precondition', 'CLASS_HUNT_NOT_OPEN', 'Lớp này không còn ở trạng thái chờ nhận.')
    }

    const studentRef = db.collection('students').doc(hunt.studentId)
    const contractsQuery = db.collection('contracts')
      .where('teacherId', '==', teacher.teacherId)
      .limit(CONTRACT_QUERY_LIMIT + 1)
    const teacherBookingsQuery = db.collection('bookingRequests')
      .where('teacherId', '==', teacher.teacherId)
      .limit(CLASS_HUNT_BOOKING_READ_LIMIT + 1)
    const studentBookingsQuery = db.collection('bookingRequests')
      .where('studentId', '==', hunt.studentId)
      .limit(CLASS_HUNT_BOOKING_READ_LIMIT + 1)
    const groupMemberBookingsQuery = db.collection('bookingRequests')
      .where('groupClassMemberIds', 'array-contains', hunt.studentId)
      .limit(CLASS_HUNT_BOOKING_READ_LIMIT + 1)
    const [
      studentSnapshot,
      contractsSnapshot,
      teacherBookingsSnapshot,
      studentBookingsSnapshot,
      groupMemberBookingsSnapshot,
    ] = await Promise.all([
      transaction.get(studentRef),
      transaction.get(contractsQuery),
      transaction.get(teacherBookingsQuery),
      transaction.get(studentBookingsQuery),
      transaction.get(groupMemberBookingsQuery),
    ])
    if (!studentSnapshot.exists) throw error('not-found', 'CLASS_HUNT_STUDENT_NOT_FOUND', 'Học viên của lớp này không còn tồn tại.')
    if (contractsSnapshot.size > CONTRACT_QUERY_LIMIT) {
      throw error('failed-precondition', 'CLASS_HUNT_CONTRACT_SCAN_LIMIT', 'Không thể đối soát hợp đồng gia sư an toàn. Vui lòng liên hệ quản trị viên.')
    }
    if (teacherBookingsSnapshot.size > CLASS_HUNT_BOOKING_READ_LIMIT
      || studentBookingsSnapshot.size > CLASS_HUNT_BOOKING_READ_LIMIT
      || groupMemberBookingsSnapshot.size > CLASS_HUNT_BOOKING_READ_LIMIT) {
      throw error('failed-precondition', 'CLASS_HUNT_BOOKING_SCAN_LIMIT', 'Lịch đang quá lớn để đối soát an toàn. Chưa tạo buổi nào.')
    }
    if (!hasAcceptedContract(contractsSnapshot.docs)) {
      throw error('failed-precondition', 'CLASS_HUNT_CONTRACT_REQUIRED', 'Gia sư chưa hoàn tất điều khoản cần thiết để nhận lớp.')
    }
    const claimNowMs = Date.now()
    const finalClaimDecision = decideClassHuntClaim({
      status: hunt.status,
      expiresAtMs: hunt.expiresAtMs,
      claimedByTeacherId: hunt.claimedByTeacherId,
      requestedTeacherId: teacher.teacherId,
      nowMs: claimNowMs,
    })
    if (finalClaimDecision === 'expired') {
      throw error('failed-precondition', 'CLASS_HUNT_EXPIRED', 'Lớp này đã hết hạn nhận.')
    }
    if (finalClaimDecision !== 'claimable') {
      throw error('failed-precondition', 'CLASS_HUNT_NOT_OPEN', 'Lớp này không còn ở trạng thái chờ nhận.')
    }
    const student = studentSnapshot.data() as ClassHuntStudentLike & DocumentData
    const teacherBookings = teacherBookingsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() } as ClassHuntBookingLike))
    const studentBookings = studentBookingsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() } as ClassHuntBookingLike))
    const studentScheduleBookings = deduplicateBookings(
      studentBookings,
      groupMemberBookingsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() } as ClassHuntBookingLike)),
    )
    const accounting = assertTeacherClaimContext({
      hunt,
      teacherId: teacher.teacherId,
      teacher: teacher.teacher,
      student,
      teacherBookings,
      studentBookings,
      studentScheduleBookings,
      nowMs: claimNowMs,
    })
    const compensationAmountPerLesson = hunt.classHuntCompensation
      ? classHuntCompensationAmount(hunt.classHuntCompensation, hunt.requestedMinutes)
      : undefined
    const totalCompensationAmount = hunt.classHuntCompensation
      ? classHuntCompensationAmount(hunt.classHuntCompensation, hunt.requestedMinutes, hunt.sessions.length)
      : undefined

    const teacherCode = cleanText(teacher.teacher.code, 80)
    const teacherName = cleanText(teacher.teacher.name, 160) || teacherCode || 'Gia sư'
    const studentCode = cleanText((student as DocumentData).code, 80)
    const studentName = cleanText((student as DocumentData).name, 160)
    const bookingIds = hunt.sessions.map((_, index) => `${hunt.id}_${index + 1}`)
    const bookingRefs = bookingIds.map((bookingId) => db.collection('bookingRequests').doc(bookingId))
    const existingBookingSnapshots = await Promise.all(bookingRefs.map((bookingRef) => transaction.get(bookingRef)))
    if (existingBookingSnapshots.some((snapshot) => snapshot.exists)) {
      throw error('failed-precondition', 'CLASS_HUNT_BOOKING_ID_COLLISION', 'Không thể cấp lịch lớp an toàn. Vui lòng liên hệ quản trị viên.')
    }

    hunt.sessions.forEach((session, index) => {
      transaction.create(bookingRefs[index], {
        status: 'confirmed',
        teacherResponse: 'accepted',
        teacherRespondedAt: FieldValue.serverTimestamp(),
        teacherRespondedBy: uid,
        teacherId: teacher.teacherId,
        teacherCode,
        teacherName,
        teacherPhotoURL: cleanText(teacher.teacher.photoURL, 500),
        studentId: hunt.studentId,
        studentCode,
        studentName,
        subjectId: hunt.subjectId,
        subjectName: hunt.subjectName,
        classHuntId: hunt.id,
        requestedDay: session.day,
        requestedDate: session.dateISO,
        requestedWeekStart: session.requestedWeekStart,
        requestedStart: session.requestedStart,
        requestedEnd: session.requestedEnd,
        requestedMinutes: session.requestedMinutes,
        requestedPoints: accounting.pointsPerLesson,
        pointsPer25Minutes: pointsPer25Minutes(teacher.teacher.pointsPer25Minutes),
        ...(hunt.classHuntCompensation ? {
          // The booking is the bridge into attendance, approvals, and payroll.
          // Copy the full snapshot rather than a derived value so every later
          // financial step can prove it used the price the tutor saw pre-claim.
          classHuntCompensation: { ...hunt.classHuntCompensation },
        } : {}),
        heldImmediately: true,
        heldMinutesAfterConfirm: accounting.nextHeld,
        adminNote: 'Gia sư nhận lớp qua Săn lớp.',
        ...(accounting.curriculumLink ? { curriculumLink: accounting.curriculumLink } : {}),
        classroomURL: cleanText((student as DocumentData).classroomURL, 500),
        createdAt: FieldValue.serverTimestamp(),
        confirmedAt: FieldValue.serverTimestamp(),
        confirmedBy: `class-hunt:${uid}`,
      })
    })

    const currentStudentRevision = Number((student as DocumentData).bookingScheduleRevision || 0)
    const currentTeacherRevision = Number(teacher.teacher.bookingScheduleRevision || 0)
    transaction.update(studentRef, {
      reservedMinutes: accounting.nextHeld,
      heldMinutes: accounting.nextHeld,
      bookingScheduleRevision: Number.isSafeInteger(currentStudentRevision) ? currentStudentRevision + 1 : 1,
      bookingScheduleUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.update(teacherRef, {
      bookingScheduleRevision: Number.isSafeInteger(currentTeacherRevision) ? currentTeacherRevision + 1 : 1,
      bookingScheduleUpdatedAt: FieldValue.serverTimestamp(),
    })
    transaction.update(huntRef, {
      status: 'claimed',
      claimedByTeacherId: teacher.teacherId,
      claimedByUid: uid,
      claimedTeacherName: teacherName,
      claimedAt: FieldValue.serverTimestamp(),
      claimedAtMs: claimNowMs,
      claimClientRequestId: clientRequestId,
      bookingIds,
      pointsPerLesson: accounting.pointsPerLesson,
      totalHeldPoints: accounting.totalRequiredPoints,
      heldMinutesAfterClaim: accounting.nextHeld,
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(db.collection('adminLogs').doc(), {
      adminId: uid,
      actorUid: uid,
      actorRole: 'teacher',
      actorTeacherId: teacher.teacherId,
      action: 'CLAIM_CLASS_HUNT',
      targetType: 'classHunt',
      targetId: hunt.id,
      changes: {
        studentId: hunt.studentId,
        teacherId: teacher.teacherId,
        bookingIds,
        sessionCount: hunt.sessions.length,
        pointsPerLesson: accounting.pointsPerLesson,
        totalHeldPoints: accounting.totalRequiredPoints,
        heldMinutesAfter: accounting.nextHeld,
        ...(hunt.classHuntCompensation ? {
          classHuntCompensation: { ...hunt.classHuntCompensation },
          compensationAmountPerLesson,
          totalCompensationAmount,
        } : {
          // Explicitly record a compatibility claim so reconciliation can tell
          // a historical no-rate offer from a missing/corrupted snapshot.
          classHuntCompensation: null,
        }),
        clientRequestId,
      },
      createdAt: FieldValue.serverTimestamp(),
    })
    transaction.create(db.collection('notifications').doc(), {
      title: 'Bạn đã nhận lớp thành công',
      content: `Bạn đã nhận thành công ${hunt.sessions.length} buổi học. Lịch dạy đã được cập nhật.`,
      color: 'emerald',
      iconName: 'Calendar',
      targetType: 'teachers',
      targetIds: [teacher.teacherId],
      senderId: 'system:class-hunt',
      senderName: 'Hệ thống 123English',
      createdAt: FieldValue.serverTimestamp(),
      readBy: [],
    })
    return {
      hunt: {
        ...hunt,
        status: 'claimed' as const,
        claimedByTeacherId: teacher.teacherId,
        claimedByUid: uid,
        claimedTeacherName: teacherName,
        claimedAtMs: claimNowMs,
        bookingIds,
      },
      bookingIds,
      idempotent: false,
    }
  })

  logger.info('Class hunt claimed', {
    huntId,
    teacherId: result.hunt.claimedByTeacherId,
    bookingCount: result.bookingIds.length,
    idempotent: result.idempotent,
  })
  return {
    hunt: serializeTeacherHunt(result.hunt),
    bookingIds: result.bookingIds,
    idempotent: result.idempotent,
    outcome: 'claimed',
    status: 'claimed',
  }
})
