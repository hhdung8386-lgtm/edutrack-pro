import { randomBytes } from 'node:crypto'
import { Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  ONLINE_CLASSROOM_ACCESS_COLLECTION,
  ONLINE_CLASSROOM_ROOMS_COLLECTION,
  ONLINE_CLASSROOM_TOKENS_COLLECTION,
  ONLINE_CLASSROOM_TOKEN_BYTES,
  decideOnlineClassroomBoardSave,
  isInsideOnlineClassroomJoinWindow,
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
  sanitizeOnlineClassroomDomain,
  validateOnlineClassroomBoardDraft,
  validateOnlineClassroomBoardSnapshot,
  type OnlineClassroomBookingLike,
  type OnlineClassroomTargetType,
} from './onlineClassroom'

const db = new Firestore()
const CLASSROOM_ORIGIN = 'https://www.123english.edu.vn'
const CLASSROOM_DOMAIN = sanitizeOnlineClassroomDomain(process.env.CLASSROOM_JITSI_DOMAIN)
const ONLINE_CLASSROOM_TOKEN_CLEANUP_LIMIT = 20

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
}

type PrivateRoom = {
  roomName?: string
  boardSnapshot?: unknown
}

type AccessContext = {
  booking: Booking
  student: Student
  teacher: Teacher
  sessionKey: string
  roomName: string
  boardSnapshot: ReturnType<typeof validateOnlineClassroomBoardSnapshot>
  studentPilotGeneration: number
  teacherPilotGeneration: number
}

function classroomError(code: string): HttpsError {
  const messages: Record<string, string> = {
    BOOKING_NOT_CONFIRMED: 'Buổi học chưa được xác nhận hoặc không còn hiệu lực.',
    BOOKING_ALREADY_COMPLETED: 'Buổi học đã được điểm danh nên phòng đã đóng.',
    BOOKING_MISSING_PARTICIPANTS: 'Buổi học thiếu thông tin gia sư hoặc học viên.',
    GROUP_CLASS_NOT_SUPPORTED: 'Pilot hiện chỉ mở cho lớp 1 kèm 1.',
    BOOKING_TIME_INVALID: 'Buổi học chưa có ngày giờ hợp lệ.',
    PILOT_NOT_ENABLED: 'Admin chưa cấp đủ quyền pilot cho gia sư và học viên.',
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

async function pilotAccess(type: OnlineClassroomTargetType, id: string): Promise<{ enabled: boolean; generation: number }> {
  const snapshot = await db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION)
    .doc(onlineClassroomAccessId(type, id))
    .get()
  return {
    enabled: snapshot.data()?.enabled === true,
    generation: onlineClassroomAccessGeneration(snapshot.data()?.generation),
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

async function loadEligibleContext(bookingId: string): Promise<AccessContext> {
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
  if (!studentAccess.enabled || !teacherAccess.enabled) throw classroomError('PILOT_NOT_ENABLED')

  const student = studentSnapshot.data() as Student
  const teacher = teacherSnapshot.data() as Teacher
  if (teacher.status !== 'active') throw classroomError('TEACHER_NOT_ACTIVE')
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
  const roomSnapshot = await db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(sessionKey).get()
  const boardSnapshot = validateOnlineClassroomBoardSnapshot(roomSnapshot.data()?.boardSnapshot)
  return {
    booking,
    student,
    teacher,
    sessionKey,
    roomName,
    boardSnapshot,
    studentPilotGeneration: studentAccess.generation,
    teacherPilotGeneration: teacherAccess.generation,
  }
}

async function createStudentInvite(booking: Booking, issuedBy: string): Promise<string> {
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
  return onlineClassroomStudentJoinUrl(CLASSROOM_ORIGIN, context.booking.id, token)
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

export async function createOnlineClassroomEmailInvite(booking: Booking): Promise<string> {
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
  const snapshot = await db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION)
    .doc(onlineClassroomAccessId(type, targetId))
    .get()
  return {
    enabled: snapshot.data()?.enabled === true,
    updatedAt: snapshot.data()?.updatedAt instanceof Timestamp
      ? snapshot.data()!.updatedAt.toDate().toISOString()
      : null,
  }
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

  const targetCollection = type === 'teacher' ? 'teachers' : 'students'
  const targetRef = db.collection(targetCollection).doc(targetId)
  const accessRef = db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION).doc(onlineClassroomAccessId(type, targetId))
  const logRef = db.collection('adminLogs').doc()

  const accessGeneration = await db.runTransaction(async (transaction) => {
    const [targetSnapshot, accessSnapshot] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(accessRef),
    ])
    if (!targetSnapshot.exists) throw new HttpsError('not-found', 'Không tìm thấy hồ sơ cần cấp quyền.')
    const target = targetSnapshot.data() || {}
    if (enabled && type === 'teacher' && target.status !== 'active') throw classroomError('TEACHER_NOT_ACTIVE')
    if (enabled && type === 'student') {
      if (target.status !== 'active') throw classroomError('STUDENT_NOT_ACTIVE')
      if (target.recordType === 'group_class') throw classroomError('GROUP_CLASS_NOT_SUPPORTED')
      if (target.learningScheduleType === 'offline' || target.classDeliveryMode === 'offline') {
        throw classroomError('OFFLINE_CLASS_NOT_SUPPORTED')
      }
    }
    const previous = accessSnapshot.data()?.enabled === true
    const previousGeneration = onlineClassroomAccessGeneration(accessSnapshot.data()?.generation)
    const nextGeneration = nextOnlineClassroomAccessGeneration(previousGeneration, previous, enabled)
    transaction.set(accessRef, {
      targetType: type,
      targetId,
      enabled,
      generation: nextGeneration,
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
      targetType: type,
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
      revokedInviteCount = await revokeOnlineClassroomTokens(type, targetId, accessGeneration, actorUid)
    } catch (error) {
      // Generation rotation above already invalidates every old token, even if
      // the best-effort metadata cleanup fails. Log it for operational retry.
      logger.error('Failed to mark rotated online classroom tokens as revoked', {
        targetType: type,
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
  const joinUrl = await createStudentInvite(booking, `admin:${actorUid}`)
  await db.collection('adminLogs').add({
    adminId: actorUid,
    action: 'ISSUE_ONLINE_CLASSROOM_INVITE',
    targetType: 'booking',
    targetId: bookingId,
    changes: { studentId: booking.studentId || '', teacherId: booking.teacherId || '' },
    createdAt: FieldValue.serverTimestamp(),
  })
  return { joinUrl }
})

async function resolveViewer(
  request: { auth?: { uid: string } | null; data?: Record<string, unknown> },
  context: AccessContext,
): Promise<{ role: 'admin' | 'teacher' | 'student'; displayName: string }> {
  const uid = request.auth?.uid
  if (uid) {
    const userSnapshot = await db.collection('users').doc(uid).get()
    const user = userSnapshot.data() || {}
    if (user.role === 'admin') return { role: 'admin', displayName: 'Admin 123English' }
    if (user.role === 'teacher' && user.teacherId === context.booking.teacherId) {
      if (!isInsideOnlineClassroomJoinWindow(context.booking, Date.now())) throw classroomError('OUTSIDE_JOIN_WINDOW')
      return {
        role: 'teacher',
        displayName: context.teacher.code || context.teacher.name || 'Gia sư 123English',
      }
    }
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
}, async (request) => {
  const bookingId = request.data?.bookingId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  const context = await loadEligibleContext(bookingId)
  const viewer = await resolveViewer(request, context)
  await cleanupOnlineClassroomTokensOpportunistically()
  const subjectPackage = context.student.subjects?.find((item) => item.subjectId === context.booking.subjectId)
  return {
    bookingId,
    roomName: context.roomName,
    meetingDomain: CLASSROOM_DOMAIN,
    publicPilotProvider: CLASSROOM_DOMAIN === 'meet.jit.si',
    role: viewer.role,
    displayName: viewer.displayName,
    studentName: context.student.name || context.booking.studentName || '',
    teacherName: context.teacher.code || context.teacher.name || context.booking.teacherName || '',
    subjectName: context.booking.subjectName || '',
    requestedDate: context.booking.requestedDate || '',
    requestedStart: context.booking.requestedStart || '',
    requestedEnd: context.booking.requestedEnd || '',
    curriculumLink: context.booking.curriculumLink || subjectPackage?.curriculumLink || '',
    boardSnapshot: context.boardSnapshot || { version: 0, studentCanWrite: true, operations: [] },
  }
})

export const saveOnlineClassroomBoard = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  const bookingId = request.data?.bookingId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  const expectedVersion = request.data?.expectedVersion
  if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 0) {
    throw new HttpsError('invalid-argument', 'Phiên bản bảng mong đợi không hợp lệ.')
  }
  const boardDraft = validateOnlineClassroomBoardDraft(request.data?.boardSnapshot)
  if (!boardDraft) throw new HttpsError('invalid-argument', 'Dữ liệu bảng vượt giới hạn hoặc sai định dạng.')
  const context = await loadEligibleContext(bookingId)
  const viewer = await resolveViewer(request, context)
  if (viewer.role === 'student') throw new HttpsError('permission-denied', 'Chỉ gia sư hoặc Admin được lưu bảng.')
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(context.sessionKey)
  const result = await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(roomRef)
    const currentBoard = validateOnlineClassroomBoardSnapshot(currentSnapshot.data()?.boardSnapshot)
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
