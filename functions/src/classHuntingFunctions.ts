import { FieldValue, Firestore, Timestamp, type DocumentData, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  CLASS_HUNT_DEFAULT_TTL_MINUTES,
  CLASS_HUNT_PUBLISH_REQUESTS_COLLECTION,
  CLASS_HUNT_SCHEMA_VERSION,
  CLASS_HUNTS_COLLECTION,
  ClassHuntValidationError,
  buildClassHuntDraft,
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
  isClassHuntSessionShape,
  isEligibleOnlineClassHuntTeacher,
  isSafeClassHuntClientRequestId,
  isTeacherAvailableForClassHuntSessions,
  pointsPer25Minutes,
  resolveClassHuntSubjectFund,
  sanitizeClassHuntForTeacher,
  teacherMatchesClassHuntSubject,
  type ClassHuntBookingLike,
  type ClassHuntDraft,
  type ClassHuntSession,
  type ClassHuntStatus,
  type ClassHuntStudentLike,
  type ClassHuntTeacherLike,
} from './classHunting'

const db = new Firestore()
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/
const CLASS_HUNT_ADMIN_LIST_LIMIT = 100
const CLASS_HUNT_TEACHER_LIST_LIMIT = 30
const CLASS_HUNT_OPEN_SCAN_LIMIT = 200
const CLASS_HUNT_TEACHER_SCAN_LIMIT = 200
const CLASS_HUNT_BOOKING_READ_LIMIT = 1000
const CLASS_HUNT_AGGREGATE_BOOKING_READ_LIMIT = 5000
const FIRESTORE_MULTI_VALUE_QUERY_LIMIT = 30
const CLASS_HUNT_STUDENT_QUERY_CONCURRENCY = 10
const CLASS_HUNT_DATE_QUERY_CONCURRENCY = 3
const CONTRACT_QUERY_LIMIT = 20
const CANONICAL_LOGIN_PRELOAD_BATCH_SIZE = 100
const CANONICAL_LOGIN_PRELOAD_CONCURRENCY = 3
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
  sessions: ClassHuntSession[]
  expiresAtMs: number
  publishedByUid: string
  publishedByName: string
  createdAtMs: number
  bookingIds: string[]
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

function canonicalLoginUid(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || value.includes('/')) return null
  return value
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
  if (sessions.length < 1 || sessions.length > 24 || new Set(sessions.map((session) => `${session.dateISO}|${session.requestedStart}`)).size !== sessions.length) {
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
    sessions,
    expiresAtMs,
    publishedByUid: cleanText(data.publishedByUid, 160),
    publishedByName: cleanText(data.publishedByName, 100),
    createdAtMs,
    bookingIds,
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
  return { uid, teacherId, teacher: teacherData as ClassHuntTeacherLike & DocumentData }
}

async function preloadCanonicalTeacherUsers(candidates: Array<{ id: string; data: ClassHuntTeacherLike & DocumentData }>): Promise<Map<string, DocumentData>> {
  const uids = [...new Set(candidates
    .map((candidate) => canonicalLoginUid(candidate.data.loginAccountUid))
    .filter((uid): uid is string => uid !== null))]
  const usersByUid = new Map<string, DocumentData>()
  const perRound = CANONICAL_LOGIN_PRELOAD_BATCH_SIZE * CANONICAL_LOGIN_PRELOAD_CONCURRENCY

  for (let offset = 0; offset < uids.length; offset += perRound) {
    const round = uids.slice(offset, offset + perRound)
    const batches = Array.from(
      { length: Math.ceil(round.length / CANONICAL_LOGIN_PRELOAD_BATCH_SIZE) },
      (_, index) => round.slice(
        index * CANONICAL_LOGIN_PRELOAD_BATCH_SIZE,
        (index + 1) * CANONICAL_LOGIN_PRELOAD_BATCH_SIZE,
      ),
    )
    const snapshotsByBatch = await Promise.all(batches.map((batch) => (
      db.getAll(...batch.map((uid) => db.collection('users').doc(uid)))
    )))
    snapshotsByBatch.flat().forEach((snapshot) => {
      if (snapshot.exists) usersByUid.set(snapshot.id, snapshot.data() || {})
    })
  }

  return usersByUid
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

function draftFromRequest(data: Record<string, unknown>, studentId: string, nowMs: number): ClassHuntDraft {
  try {
    return buildClassHuntDraft({
      studentId,
      subjectId: data.subjectId,
      startDate: data.startDate,
      selectedDays: data.weekdays,
      requestedStart: data.startTime,
      requestedMinutes: data.minutes,
      sessionCount: data.sessionCount,
      expiresInMinutes: data.expiresInMinutes,
    }, nowMs)
  } catch (cause) {
    if (cause instanceof ClassHuntValidationError) {
      throw error('invalid-argument', cause.reason, cause.message)
    }
    throw cause
  }
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

function addISODate(dateISO: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days))
  if (Number.isNaN(date.getTime())) return null
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function chunksOf<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

async function loadRelevantScheduleBookings(sessions: ClassHuntSession[]): Promise<ClassHuntBookingLike[]> {
  // Include adjacent dates because legacy 24:xx/25:xx slots can overlap the
  // following calendar day. This mirrors findClassHuntBookingConflicts.
  const relevantDates = [...new Set(sessions.flatMap((session) => (
    [-1, 0, 1]
      .map((offset) => addISODate(session.dateISO, offset))
      .filter((date): date is string => Boolean(date))
  )))]
  if (relevantDates.length === 0) return []

  const snapshots = await mapWithConcurrency(
    chunksOf(relevantDates, FIRESTORE_MULTI_VALUE_QUERY_LIMIT),
    CLASS_HUNT_DATE_QUERY_CONCURRENCY,
    (dates) => db.collection('bookingRequests')
      .where('requestedDate', 'in', dates)
      .limit(CLASS_HUNT_AGGREGATE_BOOKING_READ_LIMIT + 1)
      .get(),
  )
  if (snapshots.some((snapshot) => snapshot.size > CLASS_HUNT_AGGREGATE_BOOKING_READ_LIMIT)) {
    logger.warn('Class hunt date booking scan reached its safety bound', {
      dates: relevantDates.length,
      limitPerBatch: CLASS_HUNT_AGGREGATE_BOOKING_READ_LIMIT,
    })
    throw error(
      'failed-precondition',
      'CLASS_HUNT_BOOKING_SCAN_LIMIT',
      'Lịch đang quá lớn để đối soát an toàn. Chưa đăng lớp hay giữ chỗ nào.',
    )
  }
  return deduplicateBookings(...snapshots.map((snapshot) => (
    snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as ClassHuntBookingLike))
  )))
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
  availability: DocumentData | undefined
  teacherBookings: ClassHuntBookingLike[]
  studentBookings: ClassHuntBookingLike[]
  studentScheduleBookings?: ClassHuntBookingLike[]
  nowMs: number
}): { totalRequiredPoints: number; pointsPerLesson: number; nextHeld: number; curriculumLink: string } {
  const {
    hunt,
    teacherId,
    teacher,
    student,
    availability,
    teacherBookings,
    studentBookings,
    studentScheduleBookings = studentBookings,
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
  if (!teacherMatchesClassHuntSubject(teacher, hunt.subjectId)) {
    throw error('failed-precondition', 'CLASS_HUNT_SUBJECT_MISMATCH', 'Môn học của lớp không còn khớp chuyên môn gia sư.')
  }
  if (!isTeacherAvailableForClassHuntSessions(availability, hunt.sessions)) {
    throw error('failed-precondition', 'CLASS_HUNT_AVAILABILITY_CHANGED', 'Lịch rảnh của gia sư đã thay đổi hoặc không phủ đủ toàn bộ các buổi.')
  }
  const allBookings = deduplicateBookings(teacherBookings, studentScheduleBookings)
  const conflicts = findClassHuntBookingConflicts({
    teacherId,
    studentId: hunt.studentId,
    sessions: hunt.sessions,
    bookings: allBookings,
  })
  if (conflicts.length > 0) {
    throw error('failed-precondition', 'CLASS_HUNT_BOOKING_CONFLICT', 'Lịch gia sư hoặc học viên vừa có ca trùng. Chưa tạo buổi nào.')
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

function nonNegativeNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function subjectSources(student: ClassHuntStudentLike): Array<Record<string, unknown>> {
  const subjects = student.subjects
  if (Array.isArray(subjects) && subjects.length > 0) {
    return subjects.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
  }
  return [student as Record<string, unknown>]
}

function lookupSubjects(student: ClassHuntStudentLike, studentEligible: boolean) {
  if (!studentEligible) return []
  const grouped = new Map<string, { name: string; totalSessions: number; usedSessions: number; hasSessionCounts: boolean }>()
  for (const source of subjectSources(student)) {
    const id = cleanText(source.subjectId, 160)
    if (!SAFE_ID_PATTERN.test(id)) continue
    const current = grouped.get(id) || { name: '', totalSessions: 0, usedSessions: 0, hasSessionCounts: false }
    current.name = current.name || cleanText(source.subjectName, 160) || 'Môn học'
    const totalSessions = nonNegativeNumber(source.totalSessions)
    const usedSessions = nonNegativeNumber(source.usedSessions)
    if (totalSessions !== null || usedSessions !== null) {
      current.hasSessionCounts = true
      current.totalSessions += totalSessions || 0
      current.usedSessions += usedSessions || 0
    }
    grouped.set(id, current)
  }
  return [...grouped.entries()].flatMap(([id, aggregate]) => {
    const fund = resolveClassHuntSubjectFund(student, id)
    if (!fund || fund.remainingMinutes <= 0) return []
    return [{
      id,
      name: aggregate.name || fund.subjectName || 'Môn học',
      remainingPoints: fund.remainingMinutes,
      ...(aggregate.hasSessionCounts ? { remainingSessions: Math.max(0, aggregate.totalSessions - aggregate.usedSessions) } : {}),
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

function serializeAdminHunt(hunt: StoredClassHunt, nowMs = Date.now()) {
  return {
    id: hunt.id,
    status: effectiveClassHuntStatus(hunt, nowMs),
    student: { id: hunt.studentId, code: hunt.studentCode, name: hunt.studentName },
    subject: { id: hunt.subjectId, name: hunt.subjectName },
    slots: hunt.sessions.map(classHuntPublicSlot),
    minutes: hunt.requestedMinutes,
    sessionCount: hunt.sessions.length,
    expiresAt: isoFromMillis(hunt.expiresAtMs),
    createdAt: isoFromMillis(hunt.createdAtMs),
    bookingIds: hunt.bookingIds,
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

function serializeTeacherHunt(hunt: StoredClassHunt) {
  const sanitized = sanitizeClassHuntForTeacher({
    id: hunt.id,
    status: hunt.status,
    subjectName: hunt.subjectName,
    requestedMinutes: hunt.requestedMinutes,
    sessions: hunt.sessions,
    expiresAtMs: hunt.expiresAtMs,
  })
  if (!sanitized) throw error('failed-precondition', 'CLASS_HUNT_DATA_INVALID', 'Lớp săn không còn dữ liệu lịch hợp lệ.')
  return {
    id: sanitized.id,
    status: sanitized.status,
    subject: { id: hunt.subjectId, name: sanitized.subjectName },
    slots: sanitized.sessions.map(classHuntPublicSlot),
    minutes: sanitized.requestedMinutes,
    sessionCount: sanitized.sessions.length,
    expiresAt: isoFromMillis(sanitized.expiresAtMs),
  }
}

async function loadEligibleTeachersForPreview(
  draft: ClassHuntDraft,
  student: ClassHuntStudentLike,
  studentBookings: ClassHuntBookingLike[],
  studentScheduleBookings: ClassHuntBookingLike[],
  nowMs: number,
) {
  const teachersSnapshot = await db.collection('teachers')
    // Keep this on a single-field index. Status and online eligibility are
    // verified below and again inside the claim transaction.
    .where('subjectIds', 'array-contains', draft.subjectId)
    .limit(CLASS_HUNT_TEACHER_SCAN_LIMIT + 1)
    .get()
  if (teachersSnapshot.size > CLASS_HUNT_TEACHER_SCAN_LIMIT) {
    logger.warn('Class hunt teacher preview scan reached its safety bound', {
      limit: CLASS_HUNT_TEACHER_SCAN_LIMIT,
    })
    throw error(
      'failed-precondition',
      'CLASS_HUNT_TEACHER_SCAN_LIMIT',
      'Danh sách gia sư đang quá lớn để đối soát an toàn. Vui lòng liên hệ quản trị viên.',
    )
  }
  const candidateProfiles = teachersSnapshot.docs
    .map((document) => ({ id: document.id, data: document.data() as ClassHuntTeacherLike & DocumentData }))
    .filter((teacher) => isEligibleOnlineClassHuntTeacher(teacher.data) && teacherMatchesClassHuntSubject(teacher.data, draft.subjectId))
  const usersByUid = await preloadCanonicalTeacherUsers(candidateProfiles)
  const candidates = candidateProfiles.filter((candidate) => {
    const uid = canonicalLoginUid(candidate.data.loginAccountUid)
    const user = uid ? usersByUid.get(uid) : undefined
    return SAFE_ID_PATTERN.test(candidate.id)
      && Boolean(uid)
      && hasCanonicalClassHuntTeacherLogin({
        teacherId: candidate.id,
        uid,
        teacherLoginAccountUid: candidate.data.loginAccountUid,
        userTeacherId: user?.teacherId,
        userRole: user?.role,
      })
  })
  if (candidates.length === 0) return []
  const relevantBookings = await loadRelevantScheduleBookings(draft.sessions)
  const bookingsByTeacherId = new Map<string, ClassHuntBookingLike[]>()
  relevantBookings.forEach((booking) => {
    if (typeof booking.teacherId !== 'string' || !booking.teacherId) return
    const current = bookingsByTeacherId.get(booking.teacherId) || []
    current.push(booking)
    bookingsByTeacherId.set(booking.teacherId, current)
  })
  const results = await mapWithConcurrency(candidates, CLASS_HUNT_STUDENT_QUERY_CONCURRENCY, async (candidate) => {
    try {
      const availabilitySnapshot = await db.collection('teacherAvailability').doc(candidate.id).get()
      if (!isTeacherAvailableForClassHuntSessions(availabilitySnapshot.data(), draft.sessions)) return null
      const contractsSnapshot = await db.collection('contracts')
        .where('teacherId', '==', candidate.id)
        .limit(CONTRACT_QUERY_LIMIT + 1)
        .get()
      if (contractsSnapshot.size > CONTRACT_QUERY_LIMIT) {
        logger.warn('Class hunt preview skipped teacher with an ambiguous contract read', {
          teacherId: candidate.id,
        })
        return null
      }
      if (!hasAcceptedContract(contractsSnapshot.docs)) return null
      assertTeacherClaimContext({
        hunt: {
          id: 'preview',
          status: 'open',
          studentId: draft.studentId,
          studentCode: cleanText(student.code, 80),
          studentName: '',
          subjectId: draft.subjectId,
          subjectName: '',
          startDate: draft.startDate,
          selectedDays: draft.selectedDays,
          requestedStart: draft.requestedStart,
          requestedMinutes: draft.requestedMinutes,
          sessionCount: draft.sessionCount,
          sessions: draft.sessions,
          expiresAtMs: nowMs + CLASS_HUNT_DEFAULT_TTL_MINUTES * 60_000,
          publishedByUid: '',
          publishedByName: '',
          createdAtMs: nowMs,
          bookingIds: [],
        },
        teacherId: candidate.id,
        teacher: candidate.data,
        student,
        availability: availabilitySnapshot.data(),
        teacherBookings: bookingsByTeacherId.get(candidate.id) || [],
        studentBookings,
        studentScheduleBookings,
        nowMs,
      })
      return {
        id: candidate.id,
        code: cleanText(candidate.data.code, 80),
        name: cleanText(candidate.data.name, 160),
        photoURL: cleanText(candidate.data.photoURL, 500),
        matchedSlots: draft.sessions.length,
        pointsPer25Minutes: pointsPer25Minutes(candidate.data.pointsPer25Minutes),
      }
    } catch {
      return null
    }
  })
  return results.filter((item): item is NonNullable<typeof item> => item !== null)
}

function isLookupOnlyPreviewRequest(data: Record<string, unknown>): boolean {
  return data.subjectId === undefined
    && data.startDate === undefined
    && data.weekdays === undefined
    && data.startTime === undefined
    && data.minutes === undefined
    && data.sessionCount === undefined
}

async function classHuntLookupPreview(data: Record<string, unknown>) {
  const found = await findIndividualStudentByCode(data.studentCode)
  const student = found.data as ClassHuntStudentLike
  const baseEligible = isActiveIndividualOnlineStudent(student)
  const subjects = lookupSubjects(student, baseEligible)
  const eligibleForHunt = baseEligible && subjects.length > 0
  const warnings: string[] = []
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
  const draft = draftFromRequest(data, found.id, nowMs)
  const student = found.data as ClassHuntStudentLike & DocumentData
  const { subjectName } = assertStudentCanBeHunted(student, draft.subjectId)
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
  assertNoStudentScheduleConflict(found.id, draft.sessions, studentScheduleBookings)
  return {
    draft,
    student,
    subjectName,
    studentBookings,
    studentScheduleBookings,
  }
}

export const previewClassHunt = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 5,
}, async (request) => {
  await requireClassHuntOperator(request.auth?.uid)
  const data = (request.data || {}) as Record<string, unknown>
  if (isLookupOnlyPreviewRequest(data)) return classHuntLookupPreview(data)
  const nowMs = Date.now()
  const context = await buildOperatorContext(data, nowMs)
  const eligibleTeachers = await loadEligibleTeachersForPreview(
    context.draft,
    context.student,
    context.studentBookings,
    context.studentScheduleBookings,
    nowMs,
  )
  const rates = eligibleTeachers.map((teacher) => teacher.pointsPer25Minutes)
  return {
    student: serializeLookupStudent(context.draft.studentId, context.student, true),
    subjects: lookupSubjects(context.student, true),
    subject: { id: context.draft.subjectId, name: context.subjectName },
    slots: context.draft.sessions.map(classHuntPublicSlot),
    eligibleTeachers: eligibleTeachers.map(({ id, code, name, photoURL, matchedSlots }) => ({
      id,
      code,
      name,
      photoURL,
      matchedSlots,
    })),
    eligibleTeacherCount: eligibleTeachers.length,
    warnings: eligibleTeachers.length === 0
      ? ['Hiện chưa có gia sư nào đồng thời đúng môn, còn hoạt động, dạy online, rảnh đủ toàn bộ lịch và không bị trùng ca.']
      : (new Set(rates).size > 1
        ? ['Gia sư phù hợp có đơn giá khác nhau; hệ thống chỉ giữ kim cương theo đơn giá chính xác của người nhận lớp.']
        : []),
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
  const clientRequestId = requireClassHuntClientRequestId(data.clientRequestId)
  const existing = await existingPublishedHuntForRetry(actor.uid, clientRequestId, data)
  if (existing) return { hunt: serializeAdminHunt(existing) }
  const nowMs = Date.now()
  const context = await buildOperatorContext(data, nowMs)
  const eligibleTeachers = await loadEligibleTeachersForPreview(
    context.draft,
    context.student,
    context.studentBookings,
    context.studentScheduleBookings,
    nowMs,
  )
  if (eligibleTeachers.length === 0) {
    throw error('failed-precondition', 'CLASS_HUNT_NO_ELIGIBLE_TEACHER', 'Không còn gia sư nào khớp trọn lịch này. Hãy kiểm tra lại trước khi đăng.')
  }
  const fingerprint = classHuntPublishFingerprint(context.draft)
  const publishRequestRef = db.collection(CLASS_HUNT_PUBLISH_REQUESTS_COLLECTION)
    .doc(classHuntPublishRequestDocumentId(actor.uid, clientRequestId))
  const newHuntRef = db.collection(CLASS_HUNTS_COLLECTION).doc(createClassHuntId())
  const auditRef = db.collection('adminLogs').doc()
  const notificationRef = db.collection('notifications').doc()

  const result = await db.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(publishRequestRef)
    if (requestSnapshot.exists) {
      const previous = requestSnapshot.data() || {}
      if (previous.fingerprint !== fingerprint || typeof previous.huntId !== 'string') {
        throw error('already-exists', 'CLASS_HUNT_PUBLISH_IDEMPOTENCY_CONFLICT', 'Mã gửi lớp này đã được dùng với nội dung khác.')
      }
      const previousHuntSnapshot = await transaction.get(db.collection(CLASS_HUNTS_COLLECTION).doc(previous.huntId))
      if (!previousHuntSnapshot.exists) {
        throw error('failed-precondition', 'CLASS_HUNT_PUBLISH_TARGET_MISSING', 'Yêu cầu đăng lớp cũ không còn dữ liệu để khôi phục.')
      }
      return requireStoredHunt(previousHuntSnapshot.id, previousHuntSnapshot.data() || {})
    }

    const studentRef = db.collection('students').doc(context.draft.studentId)
    const studentSnapshot = await transaction.get(studentRef)
    if (!studentSnapshot.exists) throw error('not-found', 'CLASS_HUNT_STUDENT_NOT_FOUND', 'Học viên vừa không còn tồn tại.')
    const student = studentSnapshot.data() as ClassHuntStudentLike & DocumentData
    const { subjectName } = assertStudentCanBeHunted(student, context.draft.subjectId)
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
    assertNoStudentScheduleConflict(context.draft.studentId, context.draft.sessions, studentScheduleBookings)

    const expiresAtMs = nowMs + context.draft.expiresInMinutes * 60_000
    const hunt = {
      schemaVersion: CLASS_HUNT_SCHEMA_VERSION,
      kind: 'class_hunt',
      status: 'open' as const,
      studentId: context.draft.studentId,
      studentCode: cleanText(student.code, 80),
      studentName: cleanText(student.name, 160),
      subjectId: context.draft.subjectId,
      subjectName,
      startDate: context.draft.startDate,
      selectedDays: context.draft.selectedDays,
      requestedStart: context.draft.requestedStart,
      requestedMinutes: context.draft.requestedMinutes,
      sessionCount: context.draft.sessionCount,
      sessions: context.draft.sessions,
      expiresAt: serverTimestampMillis(expiresAtMs),
      expiresAtMs,
      publishedByUid: actor.uid,
      publishedByName: actor.displayName,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
      bookingIds: [],
      eligibleTeacherCount: eligibleTeachers.length,
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
        subjectId: context.draft.subjectId,
        sessionCount: context.draft.sessionCount,
        requestedMinutes: context.draft.requestedMinutes,
        expiresAtMs,
      },
      createdAt: FieldValue.serverTimestamp(),
    })
    // Existing notification rules deliberately expose all teacher-targeted
    // documents to active teachers. Keep this broadcast generic: it grants no
    // access and contains no student, class, subject, or schedule information.
    transaction.create(notificationRef, {
      title: 'Có lớp mới đang chờ nhận',
      content: 'Có lớp online mới phù hợp đang chờ nhận. Mở mục Nhận lớp để xem lớp phù hợp.',
      color: 'sky',
      iconName: 'Calendar',
      targetType: 'teachers',
      targetIds: [],
      senderId: 'system:class-hunt',
      senderName: 'Hệ thống 123English',
      createdAt: FieldValue.serverTimestamp(),
      readBy: [],
    })
    return requireStoredHunt(newHuntRef.id, {
      ...hunt,
      createdAtMs: nowMs,
    })
  })

  logger.info('Class hunt published', { huntId: result.id, actorUid: actor.uid, sessionCount: result.sessions.length })
  return { hunt: serializeAdminHunt(result) }
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
  return { hunt: serializeAdminHunt(hunt) }
})

type TeacherHuntStudentContext = {
  student?: ClassHuntStudentLike
  bookings: ClassHuntBookingLike[]
  scheduleBookings: ClassHuntBookingLike[]
  complete: boolean
}

type TeacherHuntReadSet = {
  availability?: DocumentData
  teacherBookings: ClassHuntBookingLike[]
  students: Map<string, TeacherHuntStudentContext>
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await task(values[index])
    }
  }))
  return results
}

async function loadOpenClassHuntCandidates(
  nowMs: number,
  teacher: ClassHuntTeacherLike,
): Promise<StoredClassHunt[]> {
  const baseQuery = db.collection(CLASS_HUNTS_COLLECTION)
    // One automatically indexed range keeps TTL-expired documents out of the
    // scan without introducing a status + expiry composite index.
    .where('expiresAtMs', '>', nowMs)
    .orderBy('expiresAtMs', 'asc')
  const candidates: StoredClassHunt[] = []
  let scanned = 0
  let cursor: QueryDocumentSnapshot | undefined

  while (candidates.length < CLASS_HUNT_TEACHER_LIST_LIMIT && scanned < CLASS_HUNT_OPEN_SCAN_LIMIT) {
    const pageSize = Math.min(CLASS_HUNT_TEACHER_LIST_LIMIT, CLASS_HUNT_OPEN_SCAN_LIMIT - scanned)
    const query = cursor ? baseQuery.startAfter(cursor).limit(pageSize) : baseQuery.limit(pageSize)
    const snapshot = await query.get()
    if (snapshot.empty) break
    scanned += snapshot.size
    cursor = snapshot.docs[snapshot.docs.length - 1]
    for (const document of snapshot.docs) {
      try {
        const hunt = requireStoredHunt(document.id, document.data() || {})
        if (effectiveClassHuntStatus(hunt, nowMs) === 'open'
          && teacherMatchesClassHuntSubject(teacher, hunt.subjectId)) candidates.push(hunt)
        if (candidates.length === CLASS_HUNT_TEACHER_LIST_LIMIT) break
      } catch {
        // Invalid offers are not safe to expose and do not consume a result slot.
      }
    }
    if (snapshot.size < pageSize) break
  }

  if (scanned === CLASS_HUNT_OPEN_SCAN_LIMIT && candidates.length < CLASS_HUNT_TEACHER_LIST_LIMIT) {
    logger.warn('Class hunt open scan reached its safety bound', { scanned, returned: candidates.length })
  }
  return candidates.sort((left, right) => left.expiresAtMs - right.expiresAtMs)
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
  const [availabilitySnapshot, teacherBookingsSnapshot, studentSnapshots, directBookingsSnapshot, groupMemberBookingsSnapshot] = await Promise.all([
    db.collection('teacherAvailability').doc(teacherId).get(),
    db.collection('bookingRequests').where('teacherId', '==', teacherId).limit(CLASS_HUNT_BOOKING_READ_LIMIT + 1).get(),
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
  if (teacherBookingsSnapshot.size > CLASS_HUNT_BOOKING_READ_LIMIT
    || directBookingsSnapshot.size > CLASS_HUNT_AGGREGATE_BOOKING_READ_LIMIT
    || groupMemberBookingsSnapshot.size > CLASS_HUNT_AGGREGATE_BOOKING_READ_LIMIT) {
    logger.warn('Class hunt aggregate booking scan reached its safety bound', {
      teacherId,
      teacherBookings: teacherBookingsSnapshot.size,
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
    availability: availabilitySnapshot.data(),
    teacherBookings: teacherBookingsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() } as ClassHuntBookingLike)),
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
  if (!teacherMatchesClassHuntSubject(teacher.teacher, hunt.subjectId)) return false
  const studentContext = readSet.students.get(hunt.studentId)
  if (!studentContext?.student || !studentContext.complete) return false
  try {
    assertTeacherClaimContext({
      hunt,
      teacherId: teacher.teacherId,
      teacher: teacher.teacher,
      student: studentContext.student,
      availability: readSet.availability,
      teacherBookings: readSet.teacherBookings,
      studentBookings: studentContext.bookings,
      studentScheduleBookings: studentContext.scheduleBookings,
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
      .map((hunt) => serializeAdminHunt(hunt, nowMs))
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
    return { hunts: [] }
  }
  const contractAccepted = hasAcceptedContract(contractsSnapshot.docs)
  if (!contractAccepted) return { hunts: [] }
  const candidates = await loadOpenClassHuntCandidates(nowMs, teacher.teacher)
  if (candidates.length === 0) return { hunts: [] }
  const readSet = await loadTeacherHuntReadSet(teacher.teacherId, candidates)
  if (!readSet) return { hunts: [] }
  const eligible = candidates.map((hunt) => (
    teacherCanSeeHunt(teacher, hunt, nowMs, contractAccepted, readSet) ? serializeTeacherHunt(hunt) : null
  ))
  return {
    hunts: eligible
      .filter((hunt): hunt is NonNullable<typeof hunt> => hunt !== null),
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
    const availabilityRef = db.collection('teacherAvailability').doc(teacher.teacherId)
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
      availabilitySnapshot,
      contractsSnapshot,
      teacherBookingsSnapshot,
      studentBookingsSnapshot,
      groupMemberBookingsSnapshot,
    ] = await Promise.all([
      transaction.get(studentRef),
      transaction.get(availabilityRef),
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
      availability: availabilitySnapshot.data(),
      teacherBookings,
      studentBookings,
      studentScheduleBookings,
      nowMs: claimNowMs,
    })

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
