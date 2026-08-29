import { randomBytes } from 'node:crypto'
import { Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  ONLINE_CLASSROOM_ACCESS_COLLECTION,
  ONLINE_CLASSROOM_ROOMS_COLLECTION,
  ONLINE_CLASSROOM_SCREEN_ANNOTATION_SURFACE_DOCUMENT,
  ONLINE_CLASSROOM_TOKENS_COLLECTION,
  ONLINE_CLASSROOM_TOKEN_BYTES,
  decideOnlineClassroomBoardOperationAppend,
  decideOnlineClassroomBoardSave,
  decideOnlineClassroomScreenAnnotationSessionMutation,
  isInsideOnlineClassroomJoinWindow,
  isSafeOnlineClassroomScreenAnnotationSessionId,
  isSafeClassroomId,
  nextOnlineClassroomAccessGeneration,
  onlineClassroomAccessGeneration,
  onlineClassroomAccessId,
  onlineClassroomBookingBlockReason,
  onlineClassroomJoinWindow,
  onlineClassroomInviteMatches,
  onlineClassroomInvitePredatesGeneration,
  onlineClassroomSessionKey,
  onlineClassroomStudentJoinUrl,
  onlineClassroomTokenHash,
  resolveOnlineClassroomTrustedActor,
  validateOnlineClassroomBoardDraft,
  validateOnlineClassroomBoardOperation,
  validateOnlineClassroomBoardSnapshot,
  validateOnlineClassroomScreenAnnotationSession,
  type OnlineClassroomBoardAuthorRole,
  type OnlineClassroomBoardSnapshot,
  type OnlineClassroomBookingLike,
  type OnlineClassroomScreenAnnotationSession,
  type OnlineClassroomTargetType,
} from './onlineClassroom'
import {
  OnlineClassroomJaasConfigurationError,
  createOnlineClassroomJaasJwt,
  onlineClassroomJaasRoomName,
  resolveOnlineClassroomMeetingConfig,
} from './onlineClassroomJaas'

const db = new Firestore()
const CLASSROOM_ORIGIN = 'https://www.123english.edu.vn'
const jaasPrivateKey = defineSecret('JAAS_PRIVATE_KEY')
const ONLINE_CLASSROOM_TOKEN_CLEANUP_LIMIT = 20
const ONLINE_CLASSROOM_RECORDING_NOTICE_MAX_AGE_MS = 4 * 60 * 60 * 1000
const ONLINE_CLASSROOM_BOARD_RATE_WINDOW_MS = 60_000
const ONLINE_CLASSROOM_BOARD_RATE_MAX_OPERATIONS = 120

type Booking = OnlineClassroomBookingLike & {
  studentCode?: string
  studentName?: string
  teacherCode?: string
  teacherName?: string
  subjectName?: string
  curriculumLink?: string
}

type Student = {
  name?: string
  code?: string
  status?: string
  recordType?: string
  learningScheduleType?: string
  classDeliveryMode?: string
  email?: string
  subjects?: Array<{ subjectId?: string; curriculumLink?: string }>
}

type Teacher = {
  name?: string
  code?: string
  status?: string
  loginAccountUid?: string
}

type PrivateRoom = {
  roomName?: string
  boardSnapshot?: unknown
  recordingNotice?: unknown
  recordingConsent?: unknown
}

type ClassroomRecordingNotice = {
  active: boolean
  recordingId: string
  startedByRole: 'admin' | 'teacher'
  startedAt: string | null
}

export type ClassroomRecordingConsent = {
  requestId: string
  status: 'pending' | 'accepted' | 'declined' | 'recording'
  requestedByRole: 'admin' | 'teacher'
  requestedAt: string | null
  acceptedAt: string | null
  declinedAt: string | null
  expiresAt: string | null
}

export type AccessContext = {
  booking: Booking
  student: Student
  teacher: Teacher
  sessionKey: string
  roomName: string
  boardSnapshot: ReturnType<typeof validateOnlineClassroomBoardSnapshot>
  screenAnnotationSession: OnlineClassroomScreenAnnotationSession | null
  recordingNotice: ClassroomRecordingNotice | null
  recordingConsent: ClassroomRecordingConsent | null
  studentPilotGeneration: number
  teacherPilotGeneration: number
}

function screenAnnotationSurfaceRef(sessionKey: string) {
  return db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION)
    .doc(sessionKey)
    .collection('surfaces')
    .doc(ONLINE_CLASSROOM_SCREEN_ANNOTATION_SURFACE_DOCUMENT)
}

function validatedRecordingNotice(value: unknown): ClassroomRecordingNotice | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const notice = value as Record<string, unknown>
  if (notice.active !== true || !isSafeClassroomId(notice.recordingId)) return null
  if (notice.startedByRole !== 'admin' && notice.startedByRole !== 'teacher') return null
  const startedAt = notice.startedAt instanceof Timestamp ? notice.startedAt : null
  if (!startedAt) return null
  const ageMs = Date.now() - startedAt.toMillis()
  if (ageMs < -5 * 60 * 1000 || ageMs > ONLINE_CLASSROOM_RECORDING_NOTICE_MAX_AGE_MS) return null
  return {
    active: true,
    recordingId: notice.recordingId,
    startedByRole: notice.startedByRole,
    startedAt: startedAt.toDate().toISOString(),
  }
}

function validatedRecordingConsent(value: unknown): ClassroomRecordingConsent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const consent = value as Record<string, unknown>
  if (!isSafeClassroomId(consent.requestId)
    || !['pending', 'accepted', 'declined', 'recording'].includes(String(consent.status))
    || (consent.requestedByRole !== 'admin' && consent.requestedByRole !== 'teacher')) return null
  const requestedAt = consent.requestedAt instanceof Timestamp ? consent.requestedAt : null
  const acceptedAt = consent.acceptedAt instanceof Timestamp ? consent.acceptedAt : null
  const declinedAt = consent.declinedAt instanceof Timestamp ? consent.declinedAt : null
  const expiresAt = consent.expiresAt instanceof Timestamp ? consent.expiresAt : null
  const status = consent.status as ClassroomRecordingConsent['status']
  // Expired pending/accepted requests are not actionable and are hidden from
  // the client; a recording status remains visible until the notice clears.
  if (status !== 'recording' && (!expiresAt || expiresAt.toMillis() <= Date.now())) return null
  return {
    requestId: consent.requestId,
    status,
    requestedByRole: consent.requestedByRole,
    requestedAt: requestedAt?.toDate().toISOString() || null,
    acceptedAt: acceptedAt?.toDate().toISOString() || null,
    declinedAt: declinedAt?.toDate().toISOString() || null,
    expiresAt: expiresAt?.toDate().toISOString() || null,
  }
}

function classroomError(code: string): HttpsError {
  const messages: Record<string, string> = {
    BOOKING_NOT_CONFIRMED: 'Buổi học chưa được xác nhận hoặc không còn hiệu lực.',
    BOOKING_ALREADY_COMPLETED: 'Buổi học đã được điểm danh nên phòng đã đóng.',
    BOOKING_MISSING_PARTICIPANTS: 'Buổi học thiếu thông tin gia sư hoặc học viên.',
    GROUP_CLASS_NOT_SUPPORTED: 'Pilot hiện chỉ mở cho lớp 1 kèm 1.',
    BOOKING_TIME_INVALID: 'Buổi học chưa có ngày giờ hợp lệ.',
    PILOT_NOT_ENABLED: 'Admin chưa bật phòng học trực tuyến cho học viên.',
    TEACHER_NOT_ACTIVE: 'Gia sư không còn ở trạng thái đang dạy.',
    STUDENT_NOT_ACTIVE: 'Học viên đang bảo lưu, hết hạn hoặc chưa hoạt động.',
    OFFLINE_CLASS_NOT_SUPPORTED: 'Pilot phòng học trực tuyến không áp dụng cho lớp offline.',
    OUTSIDE_JOIN_WINDOW: 'Phòng mở từ 12 giờ trước buổi học đến 6 giờ sau giờ kết thúc.',
    INVITE_INVALID: 'Link học viên không hợp lệ hoặc đã hết hạn.',
  }
  return new HttpsError('failed-precondition', messages[code] || 'Phòng học hiện chưa sẵn sàng.', { reason: code })
}

async function requireSystemAdmin(uid: string | undefined): Promise<string> {
  if (!uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại bằng tài khoản Admin.')
  const snapshot = await db.collection('users').doc(uid).get()
  if (snapshot.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Chỉ Admin hệ thống được quản lý pilot phòng học.')
  }
  return uid
}

export async function resolveTrustedClassroomActor(uid: string | undefined) {
  if (!uid) return null
  const userSnapshot = await db.collection('users').doc(uid).get()
  const user = userSnapshot.data() || {}
  if (user.role === 'admin') return resolveOnlineClassroomTrustedActor(uid, user, null)
  if (user.role !== 'teacher' || !isSafeClassroomId(user.teacherId)) return null
  const teacherSnapshot = await db.collection('teachers').doc(user.teacherId).get()
  // Pilot selection now lives on the student only. A teacher joins with the
  // existing account, but the immutable canonical UID on teachers/{id} must
  // still match users/{uid}; a forged or stale teacher link remains denied.
  return resolveOnlineClassroomTrustedActor(uid, user, teacherSnapshot.data() || null)
}

async function pilotAccess(type: OnlineClassroomTargetType, id: string): Promise<{
  enabled: boolean
  generation: number
  credentialHardenedUid: string
}> {
  const snapshot = await db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION)
    .doc(onlineClassroomAccessId(type, id))
    .get()
  return {
    enabled: snapshot.data()?.enabled === true,
    generation: onlineClassroomAccessGeneration(snapshot.data()?.generation),
    credentialHardenedUid: typeof snapshot.data()?.credentialHardenedUid === 'string'
      ? snapshot.data()!.credentialHardenedUid
      : '',
  }
}

async function ensurePrivateRoom(
  booking: Booking,
  studentPilotGeneration: number,
  teacherPilotGeneration: number,
): Promise<{ sessionKey: string; roomName: string }> {
  const sessionKey = onlineClassroomSessionKey(booking, studentPilotGeneration, teacherPilotGeneration)
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(sessionKey)
  const roomName = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(roomRef)
    const existing = snapshot.data() as PrivateRoom | undefined
    if (typeof existing?.roomName === 'string' && existing.roomName.length >= 32) return existing.roomName
    const generated = `123EnglishPilot${randomBytes(24).toString('hex')}`
    transaction.set(roomRef, {
      roomName: generated,
      sessionKey,
      studentId: booking.studentId,
      teacherId: booking.teacherId,
      subjectId: booking.subjectId || '',
      requestedDate: booking.requestedDate,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return generated
  })
  return { sessionKey, roomName }
}

export async function loadEligibleContext(bookingId: string): Promise<AccessContext> {
  const bookingSnapshot = await db.collection('bookingRequests').doc(bookingId).get()
  if (!bookingSnapshot.exists) throw new HttpsError('not-found', 'Không tìm thấy buổi học.')
  const booking = { id: bookingSnapshot.id, ...bookingSnapshot.data() } as Booking
  const bookingBlock = onlineClassroomBookingBlockReason(booking)
  if (bookingBlock) throw classroomError(bookingBlock)

  const [studentSnapshot, teacherSnapshot, studentAccess, teacherAccess] = await Promise.all([
    db.collection('students').doc(booking.studentId!).get(),
    db.collection('teachers').doc(booking.teacherId!).get(),
    pilotAccess('student', booking.studentId!),
    pilotAccess('teacher', booking.teacherId!),
  ])
  if (!studentSnapshot.exists || !teacherSnapshot.exists) {
    throw new HttpsError('not-found', 'Không tìm thấy hồ sơ gia sư hoặc học viên.')
  }
  if (!studentAccess.enabled) throw classroomError('PILOT_NOT_ENABLED')

  const student = studentSnapshot.data() as Student
  const teacher = teacherSnapshot.data() as Teacher
  if (teacher.status !== 'active') throw classroomError('TEACHER_NOT_ACTIVE')
  if (!isSafeClassroomId(teacher.loginAccountUid)) {
    throw new HttpsError(
      'failed-precondition',
      'Gia sư chưa có tài khoản đăng nhập chuẩn. Admin cần khôi phục đăng nhập trước khi mở lớp.',
      { reason: 'TEACHER_CANONICAL_UID_REQUIRED' },
    )
  }
  const teacherUserSnapshot = await db.collection('users').doc(teacher.loginAccountUid).get()
  if (!teacherUserSnapshot.exists
    || teacherUserSnapshot.data()?.role !== 'teacher'
    || teacherUserSnapshot.data()?.teacherId !== booking.teacherId) {
    throw new HttpsError(
      'failed-precondition',
      'Tài khoản đăng nhập của gia sư chưa khớp hồ sơ. Admin cần khôi phục đăng nhập trước khi mở lớp.',
      { reason: 'TEACHER_IDENTITY_MISMATCH' },
    )
  }
  if (student.status !== 'active') throw classroomError('STUDENT_NOT_ACTIVE')
  if (student.recordType === 'group_class') throw classroomError('GROUP_CLASS_NOT_SUPPORTED')
  if (student.learningScheduleType === 'offline' || student.classDeliveryMode === 'offline') {
    throw classroomError('OFFLINE_CLASS_NOT_SUPPORTED')
  }

  const { sessionKey, roomName } = await ensurePrivateRoom(
    booking,
    studentAccess.generation,
    teacherAccess.generation,
  )
  const [roomSnapshot, screenAnnotationSnapshot] = await Promise.all([
    db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(sessionKey).get(),
    screenAnnotationSurfaceRef(sessionKey).get(),
  ])
  const boardSnapshot = validateOnlineClassroomBoardSnapshot(roomSnapshot.data()?.boardSnapshot)
  const screenAnnotationSession = validateOnlineClassroomScreenAnnotationSession(
    screenAnnotationSnapshot.data(),
  )
  const recordingNotice = validatedRecordingNotice(roomSnapshot.data()?.recordingNotice)
  const recordingConsent = validatedRecordingConsent(roomSnapshot.data()?.recordingConsent)
  return {
    booking,
    student,
    teacher,
    sessionKey,
    roomName,
    boardSnapshot,
    screenAnnotationSession,
    recordingNotice,
    recordingConsent,
    studentPilotGeneration: studentAccess.generation,
    teacherPilotGeneration: teacherAccess.generation,
  }
}

async function createStudentInvite(booking: Booking, issuedBy: string): Promise<{
  joinUrl: string
  studentPilotGeneration: number
  teacherPilotGeneration: number
}> {
  await cleanupOnlineClassroomTokensOpportunistically()
  const context = await loadEligibleContext(booking.id)
  const window = onlineClassroomJoinWindow(context.booking)
  if (!window || window.closesAt.getTime() <= Date.now()) throw classroomError('OUTSIDE_JOIN_WINDOW')
  const token = randomBytes(ONLINE_CLASSROOM_TOKEN_BYTES).toString('base64url')
  await db.collection(ONLINE_CLASSROOM_TOKENS_COLLECTION).doc(onlineClassroomTokenHash(token)).set({
    bookingId: context.booking.id,
    sessionKey: context.sessionKey,
    studentId: context.booking.studentId,
    teacherId: context.booking.teacherId,
    studentPilotGeneration: context.studentPilotGeneration,
    teacherPilotGeneration: context.teacherPilotGeneration,
    issuedBy,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromDate(window.closesAt),
  })
  return {
    joinUrl: onlineClassroomStudentJoinUrl(CLASSROOM_ORIGIN, context.booking.id, token),
    studentPilotGeneration: context.studentPilotGeneration,
    teacherPilotGeneration: context.teacherPilotGeneration,
  }
}

async function cleanupOnlineClassroomTokensOpportunistically(): Promise<void> {
  try {
    // Both queries rely only on Firestore's built-in single-field indexes. The
    // small limits keep classroom entry latency and write volume bounded.
    const now = Timestamp.now()
    const [expiredSnapshot, revokedSnapshot] = await Promise.all([
      db.collection(ONLINE_CLASSROOM_TOKENS_COLLECTION)
        .where('expiresAt', '<=', now)
        .limit(ONLINE_CLASSROOM_TOKEN_CLEANUP_LIMIT)
        .get(),
      db.collection(ONLINE_CLASSROOM_TOKENS_COLLECTION)
        .where('revoked', '==', true)
        .limit(ONLINE_CLASSROOM_TOKEN_CLEANUP_LIMIT)
        .get(),
    ])
    const staleTokens = new Map([
      ...expiredSnapshot.docs,
      ...revokedSnapshot.docs,
    ].map((snapshot) => [snapshot.ref.path, snapshot]))
    if (staleTokens.size === 0) return

    const batch = db.batch()
    staleTokens.forEach((snapshot) => batch.delete(snapshot.ref))
    await batch.commit()
  } catch (error) {
    // Cleanup is operational hygiene only. Expiry/revocation/generation checks
    // remain authoritative even when deletion is temporarily unavailable.
    logger.warn('Online classroom token cleanup skipped', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function preauthorizeClassroomRequest(
  request: { auth?: { uid: string } | null; data?: Record<string, unknown> },
  bookingId: string,
): Promise<void> {
  const actor = await resolveTrustedClassroomActor(request.auth?.uid)
  if (actor) return
  const token = typeof request.data?.token === 'string' ? request.data.token.trim() : ''
  if (token.length < 24 || token.length > 200) throw classroomError('INVITE_INVALID')
  const tokenSnapshot = await db.collection(ONLINE_CLASSROOM_TOKENS_COLLECTION)
    .doc(onlineClassroomTokenHash(token))
    .get()
  const invite = tokenSnapshot.data() || {}
  const expiresAt = invite.expiresAt instanceof Timestamp ? invite.expiresAt.toMillis() : 0
  if (!tokenSnapshot.exists
    || invite.bookingId !== bookingId
    || invite.revoked === true
    || expiresAt <= Date.now()) throw classroomError('INVITE_INVALID')
}

export async function createOnlineClassroomEmailInvite(booking: Booking): Promise<{
  joinUrl: string
  studentPilotGeneration: number
  teacherPilotGeneration: number
}> {
  // Reminder delivery must fail closed. Returning null here would let the
  // caller silently fall back to the legacy classroom URL for a pilot class.
  return createStudentInvite(booking, 'email-reminder')
}

async function revokeOnlineClassroomTokens(
  targetType: OnlineClassroomTargetType,
  targetId: string,
  disabledGeneration: number,
  actorUid: string,
): Promise<number> {
  const targetField = targetType === 'student' ? 'studentId' : 'teacherId'
  const snapshot = await db.collection(ONLINE_CLASSROOM_TOKENS_COLLECTION)
    .where(targetField, '==', targetId)
    .get()
  const now = Date.now()
  const tokens = snapshot.docs.filter((tokenSnapshot) => {
    const token = tokenSnapshot.data()
    const expiresAt = token.expiresAt instanceof Timestamp ? token.expiresAt.toMillis() : 0
    return token.revoked !== true
      && expiresAt > now
      && onlineClassroomInvitePredatesGeneration(token, targetType, disabledGeneration)
  })

  for (let offset = 0; offset < tokens.length; offset += 500) {
    const batch = db.batch()
    for (const tokenSnapshot of tokens.slice(offset, offset + 500)) {
      batch.update(tokenSnapshot.ref, {
        revoked: true,
        revokedAt: FieldValue.serverTimestamp(),
        revokedBy: actorUid,
        revokedReason: `${targetType}_pilot_disabled`,
      })
    }
    await batch.commit()
  }
  return tokens.length
}

export const getOnlineClassroomPilotStatus = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  await requireSystemAdmin(request.auth?.uid)
  const type = request.data?.targetType
  const targetId = request.data?.targetId
  if (!['teacher', 'student'].includes(type) || !isSafeClassroomId(targetId)) {
    throw new HttpsError('invalid-argument', 'Đối tượng pilot không hợp lệ.')
  }
  const [snapshot, targetSnapshot] = await Promise.all([
    db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION)
      .doc(onlineClassroomAccessId(type, targetId))
      .get(),
    db.collection(type === 'teacher' ? 'teachers' : 'students').doc(targetId).get(),
  ])
  const canonicalTeacherUid = type === 'teacher' && typeof targetSnapshot.data()?.loginAccountUid === 'string'
    ? targetSnapshot.data()!.loginAccountUid
    : ''
  const canonicalUserSnapshot = type === 'teacher' && isSafeClassroomId(canonicalTeacherUid)
    ? await db.collection('users').doc(canonicalTeacherUid).get()
    : null
  const teacherReady = type === 'teacher'
    && targetSnapshot.exists
    && targetSnapshot.data()?.status === 'active'
    && isSafeClassroomId(canonicalTeacherUid)
    && canonicalUserSnapshot?.data()?.role === 'teacher'
    && canonicalUserSnapshot.data()?.teacherId === targetId
  return {
    // Backward compatible response for cached admin bundles: teachers are
    // automatically ready from their canonical account and no longer need an
    // independent allowlist/password step.
    enabled: type === 'teacher' ? teacherReady : snapshot.data()?.enabled === true,
    credentialHardened: type === 'teacher'
      ? teacherReady
      : null,
    accountReady: type === 'teacher' ? teacherReady : null,
    updatedAt: snapshot.data()?.updatedAt instanceof Timestamp
      ? snapshot.data()!.updatedAt.toDate().toISOString()
      : null,
  }
})

/**
 * Compatibility endpoint for cached admin bundles. Password rotation was
 * retired when pilot selection moved to students; keeping this callable as a
 * fail-closed stub prevents an older browser tab from mutating Auth accounts.
 */
export const rotateOnlineClassroomTeacherPassword = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  await requireSystemAdmin(request.auth?.uid)
  const teacherId = request.data?.teacherId
  if (!isSafeClassroomId(teacherId)) {
    throw new HttpsError('invalid-argument', 'Hồ sơ gia sư không hợp lệ.')
  }
  throw new HttpsError(
    'failed-precondition',
    'Phòng học không còn dùng mật khẩu pilot riêng. Gia sư đăng nhập bằng tài khoản hiện tại.',
    { reason: 'TEACHER_PILOT_PASSWORD_RETIRED' },
  )
})

export const setOnlineClassroomPilotAccess = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  const actorUid = await requireSystemAdmin(request.auth?.uid)
  const type = request.data?.targetType
  const targetId = request.data?.targetId
  const enabled = request.data?.enabled
  if (!['teacher', 'student'].includes(type) || !isSafeClassroomId(targetId) || typeof enabled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Dữ liệu cấp quyền pilot không hợp lệ.')
  }

  if (type === 'teacher') {
    const teacherSnapshot = await db.collection('teachers').doc(targetId).get()
    const teacher = teacherSnapshot.data() || {}
    if (!teacherSnapshot.exists || teacher.status !== 'active') throw classroomError('TEACHER_NOT_ACTIVE')
    const canonicalUid = typeof teacher.loginAccountUid === 'string' ? teacher.loginAccountUid.trim() : ''
    if (!isSafeClassroomId(canonicalUid)) {
      throw new HttpsError(
        'failed-precondition',
        'Gia sư chưa có tài khoản đăng nhập chuẩn. Hãy khôi phục đăng nhập trước.',
        { reason: 'TEACHER_CANONICAL_UID_REQUIRED' },
      )
    }
    const canonicalUserSnapshot = await db.collection('users').doc(canonicalUid).get()
    if (!canonicalUserSnapshot.exists
      || canonicalUserSnapshot.data()?.role !== 'teacher'
      || canonicalUserSnapshot.data()?.teacherId !== targetId) {
      throw new HttpsError(
        'failed-precondition',
        'Tài khoản đăng nhập của gia sư chưa khớp hồ sơ. Hãy khôi phục đăng nhập trước.',
        { reason: 'TEACHER_IDENTITY_MISMATCH' },
      )
    }
    // Cached admin clients may still call this endpoint during rolling deploy.
    // Teacher classroom access is automatic now, so do not rotate generations
    // or revoke student links from an obsolete teacher toggle.
    return { success: true, enabled: true, automatic: true, revokedInviteCount: 0 }
  }

  const targetRef = db.collection('students').doc(targetId)
  const accessRef = db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION).doc(onlineClassroomAccessId('student', targetId))
  const logRef = db.collection('adminLogs').doc()

  const accessGeneration = await db.runTransaction(async (transaction) => {
    const [targetSnapshot, accessSnapshot] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(accessRef),
    ])
    if (!targetSnapshot.exists) throw new HttpsError('not-found', 'Không tìm thấy hồ sơ cần cấp quyền.')
    const target = targetSnapshot.data() || {}
    if (enabled) {
      if (target.status !== 'active') throw classroomError('STUDENT_NOT_ACTIVE')
      if (target.recordType === 'group_class') throw classroomError('GROUP_CLASS_NOT_SUPPORTED')
      if (target.learningScheduleType === 'offline' || target.classDeliveryMode === 'offline') {
        throw classroomError('OFFLINE_CLASS_NOT_SUPPORTED')
      }
    }
    const previous = accessSnapshot.data()?.enabled === true
    const previousGeneration = onlineClassroomAccessGeneration(accessSnapshot.data()?.generation)
    const nextGeneration = nextOnlineClassroomAccessGeneration(previousGeneration, previous, enabled)
    const generationChanged = previous !== enabled
    transaction.set(accessRef, {
      targetType: 'student',
      targetId,
      enabled,
      generation: nextGeneration,
      reminderGenerationDeliveryEnabled: accessSnapshot.exists
        ? accessSnapshot.data()?.reminderGenerationDeliveryEnabled === true || generationChanged
        : true,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid,
      ...(accessSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true })
    // Collection public chỉ giữ boolean hint để ẩn/hiện nút. Callable private
    // ở trên mới là quyền thật; actor/timestamp nằm trong allowlist + adminLog.
    // Hai FieldValue.delete() đồng thời dọn metadata đã từng mirror ở bản cũ.
    transaction.set(targetRef, {
      onlineClassroomPilotEnabled: enabled,
      onlineClassroomPilotUpdatedAt: FieldValue.delete(),
      onlineClassroomPilotUpdatedBy: FieldValue.delete(),
    }, { merge: true })
    transaction.set(logRef, {
      adminId: actorUid,
      action: enabled ? 'ENABLE_ONLINE_CLASSROOM_PILOT' : 'DISABLE_ONLINE_CLASSROOM_PILOT',
      targetType: 'student',
      targetId,
      changes: {
        onlineClassroomPilotEnabled: { from: previous, to: enabled },
        accessGeneration: { from: previousGeneration, to: nextGeneration },
      },
      createdAt: FieldValue.serverTimestamp(),
    })
    return nextGeneration
  })

  let revokedInviteCount = 0
  if (!enabled) {
    try {
      revokedInviteCount = await revokeOnlineClassroomTokens('student', targetId, accessGeneration, actorUid)
    } catch (error) {
      // Generation rotation above already invalidates every old token, even if
      // the best-effort metadata cleanup fails. Log it for operational retry.
      logger.error('Failed to mark rotated online classroom tokens as revoked', {
        targetType: 'student',
        targetId,
        accessGeneration,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { success: true, enabled, revokedInviteCount }
})

export const issueOnlineClassroomInvite = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  const actorUid = await requireSystemAdmin(request.auth?.uid)
  const bookingId = request.data?.bookingId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  const snapshot = await db.collection('bookingRequests').doc(bookingId).get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Không tìm thấy buổi học.')
  const booking = { id: snapshot.id, ...snapshot.data() } as Booking
  const invite = await createStudentInvite(booking, `admin:${actorUid}`)
  await db.collection('adminLogs').add({
    adminId: actorUid,
    action: 'ISSUE_ONLINE_CLASSROOM_INVITE',
    targetType: 'booking',
    targetId: bookingId,
    changes: { studentId: booking.studentId || '', teacherId: booking.teacherId || '' },
    createdAt: FieldValue.serverTimestamp(),
  })
  return { joinUrl: invite.joinUrl }
})

export async function resolveViewer(
  request: { auth?: { uid: string } | null; data?: Record<string, unknown> },
  context: AccessContext,
): Promise<{ role: 'admin' | 'teacher' | 'student'; displayName: string }> {
  const uid = request.auth?.uid
  if (uid) {
    const actor = await resolveTrustedClassroomActor(uid)
    if (actor?.role === 'admin') return { role: 'admin', displayName: 'Admin 123English' }
    if (actor?.role === 'teacher' && actor.teacherId === context.booking.teacherId) {
      if (!isInsideOnlineClassroomJoinWindow(context.booking, Date.now())) throw classroomError('OUTSIDE_JOIN_WINDOW')
      return {
        role: 'teacher',
        displayName: context.teacher.code || context.teacher.name || 'Gia sư 123English',
      }
    }
    // An unrelated signed-in session never receives manager privileges, but a
    // valid student bearer link must still work in that browser. Continue to
    // the token verification below instead of rejecting the magic link.
  }

  const token = typeof request.data?.token === 'string' ? request.data.token.trim() : ''
  if (token.length < 24 || token.length > 200) throw classroomError('INVITE_INVALID')
  const tokenSnapshot = await db.collection(ONLINE_CLASSROOM_TOKENS_COLLECTION)
    .doc(onlineClassroomTokenHash(token))
    .get()
  const invite = tokenSnapshot.data() || {}
  const expiresAt = invite.expiresAt instanceof Timestamp ? invite.expiresAt.toMillis() : 0
  if (!tokenSnapshot.exists
    || !onlineClassroomInviteMatches(
      invite,
      context.booking.id,
      context.sessionKey,
      context.booking.studentId!,
      context.studentPilotGeneration,
      context.teacherPilotGeneration,
    )
    || invite.revoked === true
    || expiresAt <= Date.now()) throw classroomError('INVITE_INVALID')
  if (!isInsideOnlineClassroomJoinWindow(context.booking, Date.now())) throw classroomError('OUTSIDE_JOIN_WINDOW')
  return {
    role: 'student',
    displayName: context.student.name || context.booking.studentName || context.student.code || 'Học viên 123English',
  }
}

export const getOnlineClassroomAccess = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  secrets: [jaasPrivateKey],
}, async (request) => {
  const bookingId = request.data?.bookingId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  await preauthorizeClassroomRequest(request, bookingId)
  const context = await loadEligibleContext(bookingId)
  const viewer = await resolveViewer(request, context)
  await cleanupOnlineClassroomTokensOpportunistically()
  const subjectPackage = context.student.subjects?.find((item) => item.subjectId === context.booking.subjectId)
  let meetingAccess:
    | {
      meetingProvider: 'public-jitsi'
      meetingDomain: 'meet.jit.si'
      roomName: string
      publicPilotProvider: true
    }
    | {
      meetingProvider: 'jaas'
      meetingDomain: '8x8.vc'
      meetingAppId: string
      meetingJwt: string
      roomName: string
      publicPilotProvider: false
    }
  try {
    const meetingConfig = resolveOnlineClassroomMeetingConfig({
      appId: process.env.CLASSROOM_JAAS_APP_ID,
      kid: process.env.CLASSROOM_JAAS_KID,
      privateKey: jaasPrivateKey.value(),
    })
    if (meetingConfig.meetingProvider === 'public-jitsi') {
      meetingAccess = {
        meetingProvider: 'public-jitsi',
        meetingDomain: meetingConfig.meetingDomain,
        roomName: context.roomName,
        publicPilotProvider: true,
      }
    } else {
      const viewerId = viewer.role === 'admin'
        ? `admin:${request.auth?.uid || ''}`
        : viewer.role === 'teacher'
          ? `teacher:${context.booking.teacherId}`
          : `student:${context.booking.studentId}`
      meetingAccess = {
        meetingProvider: 'jaas',
        meetingDomain: meetingConfig.meetingDomain,
        meetingAppId: meetingConfig.appId,
        meetingJwt: createOnlineClassroomJaasJwt({
          config: meetingConfig,
          roomAlias: context.roomName,
          role: viewer.role,
          displayName: viewer.displayName,
          viewerId,
        }),
        roomName: onlineClassroomJaasRoomName(meetingConfig, context.roomName),
        publicPilotProvider: false,
      }
    }
  } catch (error) {
    // Never log the JWT or key material. A partially configured provider must
    // fail closed instead of silently moving a private class to meet.jit.si.
    logger.error('Online classroom meeting provider configuration rejected', {
      reason: error instanceof OnlineClassroomJaasConfigurationError
        ? error.reason
        : 'JAAS_JWT_SIGNING_FAILED',
    })
    throw new HttpsError(
      'failed-precondition',
      'Dịch vụ phòng học chưa được cấu hình đầy đủ. Vui lòng liên hệ Admin.',
      { reason: 'MEETING_PROVIDER_NOT_CONFIGURED' },
    )
  }
  return {
    bookingId,
    ...meetingAccess,
    role: viewer.role,
    displayName: viewer.displayName,
    studentName: context.student.name || context.booking.studentName || '',
    teacherName: context.teacher.code || context.teacher.name || context.booking.teacherName || '',
    subjectName: context.booking.subjectName || '',
    requestedDate: context.booking.requestedDate || '',
    requestedStart: context.booking.requestedStart || '',
    requestedEnd: context.booking.requestedEnd || '',
    curriculumLink: context.booking.curriculumLink || subjectPackage?.curriculumLink || '',
    boardSnapshot: context.boardSnapshot || { version: 0, generation: 0, studentCanWrite: true, operations: [] },
    screenAnnotationSession: context.screenAnnotationSession,
    recordingNotice: context.recordingNotice,
    recordingConsent: context.recordingConsent,
  }
})

type BoardAppendTransactionResult =
  | {
      outcome: 'appended' | 'duplicate'
      boardSnapshot: OnlineClassroomBoardSnapshot
    }
  | {
      outcome: 'invalid-snapshot'
    }
  | {
      outcome: 'locked' | 'stale-generation' | 'max-operations' | 'max-bytes' | 'conflict'
      currentVersion: number
      currentGeneration: number
    }

export const appendOnlineClassroomBoardOperation = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 3,
}, async (request) => {
  const bookingId = request.data?.bookingId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  const operation = validateOnlineClassroomBoardOperation(request.data?.operation)
  if (!operation) throw new HttpsError('invalid-argument', 'Thao tác bảng sai định dạng hoặc vượt giới hạn.')
  const expectedGeneration = request.data?.expectedGeneration ?? 0
  if (!Number.isSafeInteger(expectedGeneration) || Number(expectedGeneration) < 0) {
    throw new HttpsError('invalid-argument', 'Thế hệ bảng mong đợi không hợp lệ.')
  }

  await preauthorizeClassroomRequest(request, bookingId)
  const context = await loadEligibleContext(bookingId)
  const viewer = await resolveViewer(request, context)
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(context.sessionKey)
  const rateActorId = viewer.role === 'admin'
    ? `admin_${request.auth?.uid || 'unknown'}`
    : viewer.role === 'teacher'
      ? `teacher_${context.booking.teacherId}`
      : `student_${context.booking.studentId}`
  const rateRef = db.collection('onlineClassroomBoardRateLimits')
    .doc(`${context.sessionKey}_${rateActorId}`)
  const result = await db.runTransaction<BoardAppendTransactionResult>(async (transaction) => {
    const [currentSnapshot, rateSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(rateRef),
    ])
    const nowMs = Date.now()
    const rateWindowStartedAt = rateSnapshot.data()?.windowStartedAt instanceof Timestamp
      ? rateSnapshot.data()!.windowStartedAt.toMillis()
      : 0
    const withinRateWindow = nowMs - rateWindowStartedAt < ONLINE_CLASSROOM_BOARD_RATE_WINDOW_MS
    const rateCount = withinRateWindow && Number.isSafeInteger(rateSnapshot.data()?.count)
      ? Number(rateSnapshot.data()!.count)
      : 0
    if (rateCount >= ONLINE_CLASSROOM_BOARD_RATE_MAX_OPERATIONS) {
      throw new HttpsError(
        'resource-exhausted',
        'Bạn đang gửi quá nhiều nét vẽ. Hãy chờ vài giây rồi tiếp tục.',
        { reason: 'BOARD_RATE_LIMITED' },
      )
    }
    // Rejected, duplicate and conflicting attempts still consume quota. The
    // transaction returns an outcome so the rate write commits before the
    // callable maps the result to a typed HttpsError below.
    transaction.set(rateRef, {
      sessionKey: context.sessionKey,
      actorId: rateActorId,
      count: rateCount + 1,
      windowStartedAt: withinRateWindow
        ? Timestamp.fromMillis(rateWindowStartedAt)
        : Timestamp.fromMillis(nowMs),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(nowMs + 24 * 60 * 60 * 1000),
    }, { merge: true })

    const rawBoardSnapshot = currentSnapshot.data()?.boardSnapshot
    const currentBoard = validateOnlineClassroomBoardSnapshot(rawBoardSnapshot)
    if (rawBoardSnapshot !== undefined && rawBoardSnapshot !== null && !currentBoard) {
      return { outcome: 'invalid-snapshot' }
    }

    const append = decideOnlineClassroomBoardOperationAppend(
      currentBoard,
      operation,
      viewer.role,
      Number(expectedGeneration),
    )
    if (append.decision !== 'append' && append.decision !== 'duplicate') {
      return {
        outcome: append.decision,
        currentVersion: append.boardSnapshot.version,
        currentGeneration: append.boardSnapshot.generation,
      }
    }
    if (append.decision === 'duplicate') {
      return { outcome: 'duplicate', boardSnapshot: append.boardSnapshot }
    }

    transaction.set(roomRef, {
      boardSnapshot: append.boardSnapshot,
      boardUpdatedAt: FieldValue.serverTimestamp(),
      boardUpdatedBy: viewer.role === 'admin'
        ? `admin:${request.auth?.uid}`
        : viewer.role === 'teacher'
          ? `teacher:${context.booking.teacherId}`
          : `student:${context.booking.studentId}`,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { outcome: 'appended', boardSnapshot: append.boardSnapshot }
  })

  if (result.outcome === 'invalid-snapshot') {
    throw new HttpsError(
      'failed-precondition',
      'Bản bảng đang lưu không hợp lệ. Đã dừng thao tác để tránh ghi đè dữ liệu.',
      { reason: 'BOARD_SNAPSHOT_INVALID' },
    )
  }
  if (result.outcome === 'locked') {
    throw new HttpsError(
      'permission-denied',
      'Gia sư đang khóa quyền viết của học viên.',
      { reason: 'BOARD_STUDENT_WRITE_LOCKED' },
    )
  }
  if (result.outcome === 'stale-generation') {
    throw new HttpsError(
      'failed-precondition',
      'Bảng vừa được xóa hoặc tạo lại. Nét cũ chưa đồng bộ sẽ không được khôi phục.',
      {
        reason: 'BOARD_GENERATION_MISMATCH',
        currentVersion: result.currentVersion,
        currentGeneration: result.currentGeneration,
      },
    )
  }
  if (result.outcome === 'max-operations' || result.outcome === 'max-bytes') {
    throw new HttpsError(
      'resource-exhausted',
      'Bảng đã đạt giới hạn dữ liệu. Gia sư hãy lưu nội dung cần thiết rồi xóa bảng để tiếp tục.',
      { reason: result.outcome === 'max-operations' ? 'BOARD_OPERATION_LIMIT' : 'BOARD_SIZE_LIMIT' },
    )
  }
  if (result.outcome === 'conflict') {
    throw new HttpsError(
      'failed-precondition',
      'Mã thao tác đã tồn tại với nội dung khác. Vui lòng tải lại bảng trước khi tiếp tục.',
      { reason: 'BOARD_OPERATION_ID_CONFLICT', currentVersion: result.currentVersion },
    )
  }
  if (result.outcome !== 'appended' && result.outcome !== 'duplicate') {
    throw new HttpsError('internal', 'Chưa thể đồng bộ bảng học.')
  }

  return {
    success: true,
    appended: result.outcome === 'appended',
    duplicate: result.outcome === 'duplicate',
    version: result.boardSnapshot.version,
    boardSnapshot: result.boardSnapshot,
  }
})

export const saveOnlineClassroomBoard = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 3,
}, async (request) => {
  const bookingId = request.data?.bookingId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  const expectedVersion = request.data?.expectedVersion
  if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 0) {
    throw new HttpsError('invalid-argument', 'Phiên bản bảng mong đợi không hợp lệ.')
  }
  const boardDraft = validateOnlineClassroomBoardDraft(request.data?.boardSnapshot)
  if (!boardDraft) throw new HttpsError('invalid-argument', 'Dữ liệu bảng vượt giới hạn hoặc sai định dạng.')
  await preauthorizeClassroomRequest(request, bookingId)
  const context = await loadEligibleContext(bookingId)
  const viewer = await resolveViewer(request, context)
  if (viewer.role === 'student') throw new HttpsError('permission-denied', 'Chỉ gia sư hoặc Admin được lưu bảng.')
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(context.sessionKey)
  const result = await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(roomRef)
    const rawBoardSnapshot = currentSnapshot.data()?.boardSnapshot
    const currentBoard = validateOnlineClassroomBoardSnapshot(rawBoardSnapshot)
    if (rawBoardSnapshot !== undefined && rawBoardSnapshot !== null && !currentBoard) {
      throw new HttpsError(
        'failed-precondition',
        'Bản bảng đang lưu không hợp lệ. Đã dừng thao tác để tránh ghi đè dữ liệu.',
        { reason: 'BOARD_SNAPSHOT_INVALID' },
      )
    }
    const currentVersion = currentBoard?.version ?? 0
    const decision = decideOnlineClassroomBoardSave(currentBoard, Number(expectedVersion), boardDraft)
    if (decision === 'conflict') {
      throw new HttpsError(
        'failed-precondition',
        'Bảng đã có thay đổi mới hơn. Vui lòng tải lại trước khi lưu.',
        { reason: 'BOARD_VERSION_CONFLICT', currentVersion },
      )
    }
    if (decision === 'noop') return { unchanged: true, version: currentVersion }

    const boardSnapshot = { ...boardDraft, version: currentVersion + 1 }
    transaction.set(roomRef, {
      boardSnapshot,
      boardUpdatedAt: FieldValue.serverTimestamp(),
      boardUpdatedBy: viewer.role === 'admin' ? `admin:${request.auth?.uid}` : `teacher:${context.booking.teacherId}`,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { unchanged: false, version: boardSnapshot.version }
  })
  return { success: true, version: result.version, unchanged: result.unchanged }
})

function throwScreenAnnotationSessionError(
  decision: Exclude<ReturnType<typeof decideOnlineClassroomScreenAnnotationSessionMutation>, 'allowed'>,
): never {
  if (decision === 'session-mismatch') {
    throw new HttpsError(
      'failed-precondition',
      'Phiên chú thích màn hình đã thay đổi. Vui lòng tải lại lớp học.',
      { reason: 'SCREEN_ANNOTATION_SESSION_MISMATCH' },
    )
  }
  if (decision === 'inactive') {
    throw new HttpsError(
      'failed-precondition',
      'Phiên chú thích màn hình đã kết thúc.',
      { reason: 'SCREEN_ANNOTATION_NOT_ACTIVE' },
    )
  }
  throw new HttpsError(
    'failed-precondition',
    'Gia sư chưa bắt đầu phiên chú thích màn hình.',
    { reason: 'SCREEN_ANNOTATION_NOT_STARTED' },
  )
}

function validatedStoredScreenAnnotationSession(
  rawSession: unknown,
): OnlineClassroomScreenAnnotationSession | null {
  const session = validateOnlineClassroomScreenAnnotationSession(rawSession)
  if (rawSession !== undefined && rawSession !== null && !session) {
    throw new HttpsError(
      'failed-precondition',
      'Dữ liệu chú thích màn hình đang lưu không hợp lệ. Đã dừng thao tác để tránh ghi đè.',
      { reason: 'SCREEN_ANNOTATION_SESSION_INVALID' },
    )
  }
  return session
}

type ScreenAnnotationActor<Role extends OnlineClassroomBoardAuthorRole = OnlineClassroomBoardAuthorRole> = {
  role: Role
  id: string
}

function resolveScreenAnnotationActor<Role extends OnlineClassroomBoardAuthorRole>(
  role: Role,
  authenticatedUid: string | undefined,
  context: AccessContext,
): ScreenAnnotationActor<Role> {
  const id = role === 'admin'
    ? authenticatedUid
    : role === 'teacher'
      ? context.booking.teacherId
      : context.booking.studentId
  if (!isSafeClassroomId(id)) {
    throw new HttpsError(
      'failed-precondition',
      'Không xác định được người thao tác chú thích màn hình.',
      { reason: 'SCREEN_ANNOTATION_ACTOR_INVALID' },
    )
  }
  return { role, id }
}

function nextScreenAnnotationAuditTimestamp(
  session: OnlineClassroomScreenAnnotationSession | null,
): number {
  return Math.max(
    Date.now(),
    session?.startedAtMs ?? 0,
    session?.updatedAtMs ?? 0,
    session?.endedAtMs ?? 0,
  )
}

type ScreenAnnotationAppendTransactionResult =
  | {
      outcome: 'appended' | 'duplicate'
      screenAnnotationSession: OnlineClassroomScreenAnnotationSession
    }
  | {
      outcome: 'session-error'
      decision: Exclude<ReturnType<typeof decideOnlineClassroomScreenAnnotationSessionMutation>, 'allowed'>
    }
  | {
      outcome: 'locked' | 'stale-generation' | 'max-operations' | 'max-bytes' | 'conflict'
      currentVersion: number
      currentGeneration: number
    }

export const beginOnlineClassroomScreenAnnotation = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 3,
}, async (request) => {
  const bookingId = request.data?.bookingId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  await preauthorizeClassroomRequest(request, bookingId)
  const context = await loadEligibleContext(bookingId)
  const viewer = await resolveViewer(request, context)
  if (viewer.role === 'student') {
    throw new HttpsError('permission-denied', 'Chỉ gia sư hoặc Admin được bắt đầu chú thích màn hình.')
  }
  const actor = resolveScreenAnnotationActor(viewer.role, request.auth?.uid, context)

  const surfaceRef = screenAnnotationSurfaceRef(context.sessionKey)
  const result = await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(surfaceRef)
    const current = validatedStoredScreenAnnotationSession(currentSnapshot.data())
    if (current?.active) {
      return { unchanged: true, screenAnnotationSession: current }
    }
    const nowMs = nextScreenAnnotationAuditTimestamp(current)
    const next: OnlineClassroomScreenAnnotationSession = {
      // Generate inside the transaction callback so a Firestore retry returns
      // the exact id that was committed by the successful attempt.
      sessionId: randomBytes(24).toString('base64url'),
      active: true,
      boardSnapshot: { version: 0, generation: 0, studentCanWrite: true, operations: [] },
      startedAtMs: nowMs,
      updatedAtMs: nowMs,
      endedAtMs: null,
      startedByRole: actor.role,
      startedById: actor.id,
      updatedByRole: actor.role,
      updatedById: actor.id,
    }
    transaction.set(surfaceRef, next)
    return { unchanged: false, screenAnnotationSession: next }
  })
  return {
    success: true,
    unchanged: result.unchanged,
    screenAnnotationSession: result.screenAnnotationSession,
  }
})

export const appendOnlineClassroomScreenAnnotationOperation = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 3,
}, async (request) => {
  const bookingId = request.data?.bookingId
  const sessionId = request.data?.sessionId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  if (!isSafeOnlineClassroomScreenAnnotationSessionId(sessionId)) {
    throw new HttpsError('invalid-argument', 'Phiên chú thích màn hình không hợp lệ.')
  }
  const operation = validateOnlineClassroomBoardOperation(request.data?.operation)
  if (!operation) {
    throw new HttpsError('invalid-argument', 'Thao tác chú thích sai định dạng hoặc vượt giới hạn.')
  }
  const expectedGeneration = request.data?.expectedGeneration ?? 0
  if (!Number.isSafeInteger(expectedGeneration) || Number(expectedGeneration) < 0) {
    throw new HttpsError('invalid-argument', 'Thế hệ chú thích mong đợi không hợp lệ.')
  }

  await preauthorizeClassroomRequest(request, bookingId)
  const context = await loadEligibleContext(bookingId)
  const viewer = await resolveViewer(request, context)
  const actor = resolveScreenAnnotationActor(viewer.role, request.auth?.uid, context)
  const surfaceRef = screenAnnotationSurfaceRef(context.sessionKey)
  const rateActorId = `${actor.role}_${actor.id}`
  const rateRef = db.collection('onlineClassroomBoardRateLimits')
    .doc(`${context.sessionKey}_${rateActorId}_screen`)
  const result = await db.runTransaction<ScreenAnnotationAppendTransactionResult>(async (transaction) => {
    const [currentSnapshot, rateSnapshot] = await Promise.all([
      transaction.get(surfaceRef),
      transaction.get(rateRef),
    ])
    const current = validatedStoredScreenAnnotationSession(currentSnapshot.data())
    const requestNowMs = Date.now()
    const auditNowMs = nextScreenAnnotationAuditTimestamp(current)
    const rateWindowStartedAt = rateSnapshot.data()?.windowStartedAt instanceof Timestamp
      ? rateSnapshot.data()!.windowStartedAt.toMillis()
      : 0
    const withinRateWindow = requestNowMs - rateWindowStartedAt < ONLINE_CLASSROOM_BOARD_RATE_WINDOW_MS
    const rateCount = withinRateWindow && Number.isSafeInteger(rateSnapshot.data()?.count)
      ? Number(rateSnapshot.data()!.count)
      : 0
    if (rateCount >= ONLINE_CLASSROOM_BOARD_RATE_MAX_OPERATIONS) {
      throw new HttpsError(
        'resource-exhausted',
        'Bạn đang gửi quá nhiều nét chú thích. Hãy chờ vài giây rồi tiếp tục.',
        { reason: 'SCREEN_ANNOTATION_RATE_LIMITED' },
      )
    }

    // Consume the attempt before branching on duplicate/locked/conflict. Those
    // outcomes are still authenticated callable work and must not bypass the
    // per-actor quota. Returning an outcome (instead of throwing in the
    // transaction) lets this write commit before the callable maps it to an
    // HttpsError below.
    transaction.set(rateRef, {
      sessionKey: context.sessionKey,
      actorId: rateActorId,
      surface: ONLINE_CLASSROOM_SCREEN_ANNOTATION_SURFACE_DOCUMENT,
      count: rateCount + 1,
      windowStartedAt: withinRateWindow
        ? Timestamp.fromMillis(rateWindowStartedAt)
        : Timestamp.fromMillis(requestNowMs),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(requestNowMs + 24 * 60 * 60 * 1000),
    }, { merge: true })

    const sessionDecision = decideOnlineClassroomScreenAnnotationSessionMutation(current, sessionId)
    if (sessionDecision !== 'allowed') {
      return { outcome: 'session-error', decision: sessionDecision }
    }

    const append = decideOnlineClassroomBoardOperationAppend(
      current!.boardSnapshot,
      operation,
      viewer.role,
      Number(expectedGeneration),
    )
    if (append.decision === 'locked'
      || append.decision === 'stale-generation'
      || append.decision === 'max-operations'
      || append.decision === 'max-bytes'
      || append.decision === 'conflict') {
      return {
        outcome: append.decision,
        currentVersion: append.boardSnapshot.version,
        currentGeneration: append.boardSnapshot.generation,
      }
    }
    if (append.decision === 'duplicate') {
      return {
        outcome: 'duplicate',
        screenAnnotationSession: current!,
      }
    }

    const next: OnlineClassroomScreenAnnotationSession = {
      ...current!,
      boardSnapshot: append.boardSnapshot,
      updatedAtMs: auditNowMs,
      updatedByRole: actor.role,
      updatedById: actor.id,
    }
    transaction.set(surfaceRef, next)
    return { outcome: 'appended', screenAnnotationSession: next }
  })

  if (result.outcome === 'session-error') throwScreenAnnotationSessionError(result.decision)
  if (result.outcome === 'locked') {
    throw new HttpsError(
      'permission-denied',
      'Gia sư đang khóa quyền chú thích của học viên.',
      { reason: 'SCREEN_ANNOTATION_STUDENT_WRITE_LOCKED' },
    )
  }
  if (result.outcome === 'stale-generation') {
    throw new HttpsError(
      'failed-precondition',
      'Chú thích vừa được xóa hoặc tạo lại. Nét cũ chưa đồng bộ sẽ không được khôi phục.',
      {
        reason: 'SCREEN_ANNOTATION_GENERATION_MISMATCH',
        currentVersion: result.currentVersion,
        currentGeneration: result.currentGeneration,
      },
    )
  }
  if (result.outcome === 'max-operations' || result.outcome === 'max-bytes') {
    throw new HttpsError(
      'resource-exhausted',
      'Chú thích màn hình đã đạt giới hạn dữ liệu. Gia sư hãy xóa nét cũ để tiếp tục.',
      {
        reason: result.outcome === 'max-operations'
          ? 'SCREEN_ANNOTATION_OPERATION_LIMIT'
          : 'SCREEN_ANNOTATION_SIZE_LIMIT',
      },
    )
  }
  if (result.outcome === 'conflict') {
    throw new HttpsError(
      'failed-precondition',
      'Mã thao tác chú thích đã tồn tại với nội dung khác. Vui lòng tải lại lớp học.',
      {
        reason: 'SCREEN_ANNOTATION_OPERATION_ID_CONFLICT',
        currentVersion: result.currentVersion,
      },
    )
  }
  if (result.outcome !== 'appended' && result.outcome !== 'duplicate') {
    throw new HttpsError('internal', 'Chưa thể đồng bộ chú thích màn hình.')
  }

  return {
    success: true,
    appended: result.outcome === 'appended',
    duplicate: result.outcome === 'duplicate',
    version: result.screenAnnotationSession.boardSnapshot.version,
    boardSnapshot: result.screenAnnotationSession.boardSnapshot,
    screenAnnotationSession: result.screenAnnotationSession,
  }
})

export const saveOnlineClassroomScreenAnnotation = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 3,
}, async (request) => {
  const bookingId = request.data?.bookingId
  const sessionId = request.data?.sessionId
  const expectedVersion = request.data?.expectedVersion
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  if (!isSafeOnlineClassroomScreenAnnotationSessionId(sessionId)) {
    throw new HttpsError('invalid-argument', 'Phiên chú thích màn hình không hợp lệ.')
  }
  if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 0) {
    throw new HttpsError('invalid-argument', 'Phiên bản chú thích mong đợi không hợp lệ.')
  }
  const boardDraft = validateOnlineClassroomBoardDraft(request.data?.boardSnapshot)
  if (!boardDraft) {
    throw new HttpsError('invalid-argument', 'Dữ liệu chú thích vượt giới hạn hoặc sai định dạng.')
  }

  await preauthorizeClassroomRequest(request, bookingId)
  const context = await loadEligibleContext(bookingId)
  const viewer = await resolveViewer(request, context)
  if (viewer.role === 'student') {
    throw new HttpsError('permission-denied', 'Chỉ gia sư hoặc Admin được lưu chú thích màn hình.')
  }
  const actor = resolveScreenAnnotationActor(viewer.role, request.auth?.uid, context)
  const surfaceRef = screenAnnotationSurfaceRef(context.sessionKey)
  const result = await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(surfaceRef)
    const current = validatedStoredScreenAnnotationSession(currentSnapshot.data())
    const sessionDecision = decideOnlineClassroomScreenAnnotationSessionMutation(current, sessionId)
    if (sessionDecision !== 'allowed') throwScreenAnnotationSessionError(sessionDecision)

    const currentVersion = current!.boardSnapshot.version
    const saveDecision = decideOnlineClassroomBoardSave(
      current!.boardSnapshot,
      Number(expectedVersion),
      boardDraft,
    )
    if (saveDecision === 'conflict') {
      throw new HttpsError(
        'failed-precondition',
        'Chú thích đã có thay đổi mới hơn. Vui lòng tải lại trước khi lưu.',
        { reason: 'SCREEN_ANNOTATION_VERSION_CONFLICT', currentVersion },
      )
    }
    if (saveDecision === 'noop') {
      return { unchanged: true, screenAnnotationSession: current! }
    }

    const nowMs = nextScreenAnnotationAuditTimestamp(current)
    const next: OnlineClassroomScreenAnnotationSession = {
      ...current!,
      boardSnapshot: { ...boardDraft, version: currentVersion + 1 },
      updatedAtMs: nowMs,
      updatedByRole: actor.role,
      updatedById: actor.id,
    }
    transaction.set(surfaceRef, next)
    return { unchanged: false, screenAnnotationSession: next }
  })
  return {
    success: true,
    unchanged: result.unchanged,
    version: result.screenAnnotationSession.boardSnapshot.version,
    screenAnnotationSession: result.screenAnnotationSession,
  }
})

export const endOnlineClassroomScreenAnnotation = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 3,
}, async (request) => {
  const bookingId = request.data?.bookingId
  const sessionId = request.data?.sessionId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  if (!isSafeOnlineClassroomScreenAnnotationSessionId(sessionId)) {
    throw new HttpsError('invalid-argument', 'Phiên chú thích màn hình không hợp lệ.')
  }
  await preauthorizeClassroomRequest(request, bookingId)
  const context = await loadEligibleContext(bookingId)
  const viewer = await resolveViewer(request, context)
  if (viewer.role === 'student') {
    throw new HttpsError('permission-denied', 'Chỉ gia sư hoặc Admin được kết thúc chú thích màn hình.')
  }
  const actor = resolveScreenAnnotationActor(viewer.role, request.auth?.uid, context)

  const surfaceRef = screenAnnotationSurfaceRef(context.sessionKey)
  const result = await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(surfaceRef)
    const current = validatedStoredScreenAnnotationSession(currentSnapshot.data())
    const sessionDecision = decideOnlineClassroomScreenAnnotationSessionMutation(current, sessionId)
    if (sessionDecision === 'missing' || sessionDecision === 'session-mismatch') {
      throwScreenAnnotationSessionError(sessionDecision)
    }
    if (sessionDecision === 'inactive') {
      return { unchanged: true, screenAnnotationSession: current! }
    }
    const nowMs = nextScreenAnnotationAuditTimestamp(current)
    const next: OnlineClassroomScreenAnnotationSession = {
      ...current!,
      active: false,
      updatedAtMs: nowMs,
      endedAtMs: nowMs,
      updatedByRole: actor.role,
      updatedById: actor.id,
    }
    transaction.set(surfaceRef, next)
    return { unchanged: false, screenAnnotationSession: next }
  })
  return {
    success: true,
    unchanged: result.unchanged,
    screenAnnotationSession: result.screenAnnotationSession,
  }
})
