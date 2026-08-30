import { createHash } from 'node:crypto'
import { Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { ONLINE_CLASSROOM_ROOMS_COLLECTION, isSafeClassroomId } from './onlineClassroom'
import {
  OnlineClassroomJaasConfigurationError,
  createOnlineClassroomJaasJwt,
  onlineClassroomJaasRoomName,
  resolveOnlineClassroomMeetingConfig,
} from './onlineClassroomJaas'
import { enqueueOnlineClassroomHardEndTask } from './onlineClassroomLifecycleFunctions'
import {
  ONLINE_TRIAL_CLASSES_COLLECTION,
  ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT,
  ONLINE_TRIAL_CLASS_CREATE_REQUESTS_COLLECTION,
  buildOnlineTrialClassCreationPlan,
  createOnlineTrialClassIdentifiers,
  decideOnlineTrialClassAccess,
  decideOnlineTrialClassViewerRole,
  isOnlineTrialClassRoomName,
  isSafeOnlineTrialClassClientRequestId,
  isSafeOnlineTrialClassId,
  isSafeOnlineTrialClassSessionKey,
  onlineTrialClassCreateRequestDocumentId,
  onlineTrialClassCreateRequestFingerprint,
  onlineTrialClassJoinUrl,
  onlineTrialClassListLimit,
  sanitizeOnlineTrialClassDisplayName,
  validateOnlineTrialClassBinding,
  type OnlineTrialClassState,
} from './onlineTrialClass'

const db = new Firestore()
const jaasPrivateKey = defineSecret('JAAS_PRIVATE_KEY')

function trialClassLogId(trialClassId: string): string {
  return createHash('sha256').update(trialClassId).digest('hex').slice(0, 16)
}

type TrialDocument = {
  kind?: unknown
  trialClassId?: unknown
  title?: unknown
  guestDisplayName?: unknown
  mode?: unknown
  state?: unknown
  roomSessionKey?: unknown
  roomName?: unknown
  joinPath?: unknown
  createdByUid?: unknown
  createdByName?: unknown
  accountingImpact?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  accessExpiresAt?: unknown
  firstOpenedAt?: unknown
  endedAt?: unknown
  endedByUid?: unknown
  endReason?: unknown
}

type TrialRoomDocument = {
  scopeType?: unknown
  scopeId?: unknown
  trialClassId?: unknown
  sessionKey?: unknown
  roomName?: unknown
  hostViewerId?: unknown
  guestViewerId?: unknown
  state?: unknown
  hardEndsAt?: unknown
}

type TrialViewer = {
  role: 'admin' | 'teacher' | 'student'
  displayName: string
  viewerId: string
}

function timestampMs(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null
}

function timestampIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null
}

function trialState(value: unknown): OnlineTrialClassState | null {
  return value === 'ready' || value === 'live' || value === 'ended' || value === 'expired'
    ? value
    : null
}

function effectiveTrialState(data: TrialDocument, nowMs: number): OnlineTrialClassState {
  const state = trialState(data.state) || 'ended'
  const expiresAtMs = timestampMs(data.accessExpiresAt)
  if ((state === 'ready' || state === 'live')
    && (expiresAtMs === null || expiresAtMs <= nowMs)) return 'expired'
  return state
}

function trialClassError(
  reason: string,
  message: string,
  code: 'failed-precondition' | 'not-found' | 'permission-denied' = 'failed-precondition',
): HttpsError {
  return new HttpsError(code, message, { reason })
}

async function requireSystemAdmin(uid: string | undefined): Promise<{
  uid: string
  displayName: string
}> {
  if (!uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại bằng tài khoản Admin.')
  const snapshot = await db.collection('users').doc(uid).get()
  const user = snapshot.data() || {}
  if (user.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Chỉ Admin hệ thống được tạo và quản lý lớp học thử.')
  }
  const displayName = sanitizeOnlineTrialClassDisplayName(
    user.name || user.displayName || user.fullName || 'Admin 123English',
  )
  return { uid, displayName }
}

async function resolveTrialViewer(
  uid: string | undefined,
  requestedDisplayName: unknown,
  defaultGuestDisplayName: unknown,
): Promise<TrialViewer> {
  const guestDisplayName = sanitizeOnlineTrialClassDisplayName(
    requestedDisplayName || defaultGuestDisplayName,
  )
  if (!uid) {
    return {
      role: 'student',
      displayName: guestDisplayName,
      viewerId: `anonymous:${guestDisplayName}`,
    }
  }

  const userSnapshot = await db.collection('users').doc(uid).get()
  const user = userSnapshot.data() || {}
  const teacherSnapshot = user.role === 'teacher' && isSafeClassroomId(user.teacherId)
    ? await db.collection('teachers').doc(user.teacherId).get()
    : null
  const teacher = teacherSnapshot?.data() || {}
  const role = decideOnlineTrialClassViewerRole({
    authenticatedUid: uid,
    userRole: user.role,
    userTeacherId: user.teacherId,
    teacherStatus: teacher.status,
    teacherLoginAccountUid: teacher.loginAccountUid,
  })
  if (role === 'admin') {
    return {
      role: 'admin',
      displayName: sanitizeOnlineTrialClassDisplayName(
        user.name || user.displayName || user.fullName || 'Admin 123English',
      ),
      viewerId: `admin:${uid}`,
    }
  }

  // A users/{uid}.role value is not enough to grant moderation because legacy
  // teacher accounts can edit parts of that profile. The immutable canonical
  // UID on teachers/{teacherId} must point back to this authenticated account.
  if (role === 'teacher') {
    return {
      role: 'teacher',
      displayName: sanitizeOnlineTrialClassDisplayName(
        teacher.name || teacher.code || user.name || 'Gia sư 123English',
      ),
      viewerId: `teacher:${user.teacherId}`,
    }
  }

  return {
    role: 'student',
    displayName: sanitizeOnlineTrialClassDisplayName(
      requestedDisplayName || user.name || user.displayName || defaultGuestDisplayName,
    ),
    viewerId: `guest-account:${uid}`,
  }
}

function trialDocumentFromPlan(plan: ReturnType<typeof buildOnlineTrialClassCreationPlan>['trial']) {
  const {
    createdAtMs,
    updatedAtMs,
    accessExpiresAtMs,
    ...data
  } = plan
  return {
    ...data,
    createdAt: Timestamp.fromMillis(createdAtMs),
    updatedAt: Timestamp.fromMillis(updatedAtMs),
    accessExpiresAt: Timestamp.fromMillis(accessExpiresAtMs),
    hardEndTaskStatus: 'pending',
  }
}

function roomDocumentFromPlan(plan: ReturnType<typeof buildOnlineTrialClassCreationPlan>['room']) {
  const {
    createdAtMs,
    updatedAtMs,
    hardEndsAtMs,
    ...data
  } = plan
  return {
    ...data,
    createdAt: Timestamp.fromMillis(createdAtMs),
    updatedAt: Timestamp.fromMillis(updatedAtMs),
    hardEndsAt: Timestamp.fromMillis(hardEndsAtMs),
  }
}

function serializeTrialClass(
  trialClassId: string,
  data: TrialDocument,
  nowMs: number,
) {
  const joinUrl = onlineTrialClassJoinUrl(trialClassId)
  const state = effectiveTrialState(data, nowMs)
  const createdAt = timestampIso(data.createdAt)
  const startedAt = timestampIso(data.firstOpenedAt)
  const endedAt = timestampIso(data.endedAt)
  const accessExpiresAt = timestampIso(data.accessExpiresAt)
  return {
    roomId: trialClassId,
    trialClassId,
    title: typeof data.title === 'string' ? data.title : 'Lớp học thử 123English',
    status: state,
    state,
    mode: data.mode === 'instant' ? 'instant' : 'later',
    createdAt,
    startedAt,
    endedAt,
    accessExpiresAt,
    participantCount: 0,
    joinUrl,
    guestUrl: joinUrl,
    adminUrl: joinUrl,
    hostUrl: joinUrl,
    studentUrl: joinUrl,
    createdByName: typeof data.createdByName === 'string' ? data.createdByName : null,
    accountingImpact: ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT,
  }
}

function validatedTrialBinding(
  trialClassId: string,
  trial: TrialDocument,
  room: TrialRoomDocument,
): {
  sessionKey: string
  roomName: string
  accessExpiresAtMs: number
  hostViewerId: string
  guestViewerId: string
} | null {
  const accessExpiresAtMs = timestampMs(trial.accessExpiresAt)
  const roomHardEndsAtMs = timestampMs(room.hardEndsAt)
  if (!validateOnlineTrialClassBinding({
    trialClassId,
    trialKind: trial.kind,
    trialRoomSessionKey: trial.roomSessionKey,
    trialRoomName: trial.roomName,
    trialAccessExpiresAtMs: accessExpiresAtMs,
    roomScopeType: room.scopeType,
    roomScopeId: room.scopeId,
    roomTrialClassId: room.trialClassId,
    roomSessionKey: room.sessionKey,
    roomName: room.roomName,
    roomHostViewerId: room.hostViewerId,
    roomGuestViewerId: room.guestViewerId,
    roomHardEndsAtMs,
  })) return null
  if (!isSafeOnlineTrialClassSessionKey(trial.roomSessionKey)
    || !isOnlineTrialClassRoomName(trial.roomName)
    || accessExpiresAtMs === null
    || typeof room.hostViewerId !== 'string'
    || typeof room.guestViewerId !== 'string') return null
  return {
    sessionKey: trial.roomSessionKey,
    roomName: trial.roomName,
    accessExpiresAtMs,
    hostViewerId: room.hostViewerId,
    guestViewerId: room.guestViewerId,
  }
}

async function registerTrialHardEnd(
  trialClassId: string,
  sessionKey: string,
  hardEndMs: number,
): Promise<void> {
  await enqueueOnlineClassroomHardEndTask(sessionKey, hardEndMs)
  try {
    await db.collection(ONLINE_TRIAL_CLASSES_COLLECTION).doc(trialClassId).update({
      hardEndTaskStatus: 'scheduled',
      hardEndTaskUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  } catch (error) {
    // The deterministic task is already authoritative. A metadata update must
    // never turn a safely scheduled room into an unavailable room.
    logger.warn('Trial classroom hard-end metadata could not be updated', {
      trialClassLogId: trialClassLogId(trialClassId),
      reason: error instanceof Error ? error.message : 'UNKNOWN',
    })
  }
}

export const createOnlineTrialClass = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 5,
}, async (request) => {
  const admin = await requireSystemAdmin(request.auth?.uid)
  const clientRequestId = request.data?.clientRequestId
  if (!isSafeOnlineTrialClassClientRequestId(clientRequestId)) {
    throw new HttpsError(
      'invalid-argument',
      'Mã chống tạo trùng không hợp lệ. Vui lòng tải lại trang và thử lại.',
      { reason: 'TRIAL_CLASS_CLIENT_REQUEST_ID_INVALID' },
    )
  }

  const fingerprint = onlineTrialClassCreateRequestFingerprint({
    mode: request.data?.mode,
    title: request.data?.title,
    guestDisplayName: request.data?.guestDisplayName,
  })
  const requestRef = db.collection(ONLINE_TRIAL_CLASS_CREATE_REQUESTS_COLLECTION)
    .doc(onlineTrialClassCreateRequestDocumentId(admin.uid, clientRequestId))
  const identifiers = createOnlineTrialClassIdentifiers()
  const nowMs = Date.now()
  const plan = buildOnlineTrialClassCreationPlan({
    identifiers,
    adminUid: admin.uid,
    createdByName: admin.displayName,
    title: request.data?.title,
    guestDisplayName: request.data?.guestDisplayName,
    mode: request.data?.mode,
    createdAtMs: nowMs,
  })

  const result = await db.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef)
    if (requestSnapshot.exists) {
      const requestData = requestSnapshot.data() || {}
      if (requestData.fingerprint !== fingerprint) {
        throw new HttpsError(
          'already-exists',
          'Yêu cầu tạo phòng này đã được dùng với nội dung khác.',
          { reason: 'TRIAL_CLASS_IDEMPOTENCY_CONFLICT' },
        )
      }
      if (!isSafeOnlineTrialClassId(requestData.trialClassId)) {
        throw trialClassError(
          'TRIAL_CLASS_IDEMPOTENCY_DATA_INVALID',
          'Dữ liệu chống tạo trùng không còn hợp lệ. Admin cần kiểm tra hệ thống.',
        )
      }
      const existingRef = db.collection(ONLINE_TRIAL_CLASSES_COLLECTION)
        .doc(requestData.trialClassId)
      const existingSnapshot = await transaction.get(existingRef)
      if (!existingSnapshot.exists) {
        throw trialClassError(
          'TRIAL_CLASS_IDEMPOTENCY_TARGET_MISSING',
          'Phòng của yêu cầu cũ không còn tồn tại. Vui lòng tạo yêu cầu mới.',
          'not-found',
        )
      }
      return {
        trialClassId: existingSnapshot.id,
        data: existingSnapshot.data() as TrialDocument,
        created: false,
      }
    }

    const trialRef = db.collection(ONLINE_TRIAL_CLASSES_COLLECTION).doc(plan.trial.trialClassId)
    const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(plan.room.sessionKey)
    const [trialCollision, roomCollision] = await Promise.all([
      transaction.get(trialRef),
      transaction.get(roomRef),
    ])
    if (trialCollision.exists || roomCollision.exists) {
      throw new HttpsError('aborted', 'Không thể cấp mã phòng an toàn. Vui lòng thử lại.', {
        reason: 'TRIAL_CLASS_IDENTIFIER_COLLISION',
      })
    }

    const trialData = trialDocumentFromPlan(plan.trial)
    transaction.set(trialRef, trialData)
    transaction.set(roomRef, roomDocumentFromPlan(plan.room))
    transaction.set(requestRef, {
      schemaVersion: 1,
      kind: 'trial_class_create_request',
      createdByUid: admin.uid,
      fingerprint,
      trialClassId: plan.trial.trialClassId,
      createdAt: Timestamp.fromMillis(nowMs),
      expiresAt: Timestamp.fromMillis(plan.trial.accessExpiresAtMs),
    })
    return {
      trialClassId: plan.trial.trialClassId,
      data: trialData as TrialDocument,
      created: true,
    }
  })

  const sessionKey = result.data.roomSessionKey
  const hardEndMs = timestampMs(result.data.accessExpiresAt)
  if (!isSafeOnlineTrialClassSessionKey(sessionKey) || hardEndMs === null) {
    throw trialClassError(
      'TRIAL_CLASS_DATA_INVALID',
      'Phòng học thử chưa có lịch tự đóng hợp lệ. Admin cần kiểm tra hệ thống.',
    )
  }
  try {
    await registerTrialHardEnd(result.trialClassId, sessionKey, hardEndMs)
  } catch (error) {
    logger.error('Trial classroom hard-end task could not be registered', {
      trialClassLogId: trialClassLogId(result.trialClassId),
      reason: error instanceof Error ? error.message : 'UNKNOWN',
    })
    throw new HttpsError(
      'unavailable',
      'Chưa thể bảo đảm phòng tự đóng sau 7 ngày. Vui lòng bấm tạo lại để tiếp tục an toàn.',
      { reason: 'TRIAL_CLASS_HARD_END_NOT_SCHEDULED' },
    )
  }

  const room = serializeTrialClass(result.trialClassId, result.data, Date.now())
  return {
    room,
    created: result.created,
    joinUrl: room.joinUrl,
    guestUrl: room.joinUrl,
    adminUrl: room.joinUrl,
  }
})

export const listOnlineTrialClasses = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 5,
}, async (request) => {
  await requireSystemAdmin(request.auth?.uid)
  const limit = onlineTrialClassListLimit(request.data?.limit)
  const snapshot = await db.collection(ONLINE_TRIAL_CLASSES_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(limit + 1)
    .get()
  const nowMs = Date.now()
  const rooms = snapshot.docs
    .slice(0, limit)
    .filter((document) => document.data().kind === 'trial_class')
    .map((document) => serializeTrialClass(
      document.id,
      document.data() as TrialDocument,
      nowMs,
    ))
  return {
    rooms,
    hasMore: snapshot.size > limit,
    serverNow: new Date(nowMs).toISOString(),
  }
})

async function expireTrialClass(
  trialClassId: string,
  sessionKey: string,
  accessExpiresAtMs: number,
): Promise<void> {
  const trialRef = db.collection(ONLINE_TRIAL_CLASSES_COLLECTION).doc(trialClassId)
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(sessionKey)
  await db.runTransaction(async (transaction) => {
    const [trialSnapshot, roomSnapshot] = await Promise.all([
      transaction.get(trialRef),
      transaction.get(roomRef),
    ])
    const currentState = trialState(trialSnapshot.data()?.state)
    if (currentState !== 'ready' && currentState !== 'live') return
    transaction.update(trialRef, {
      state: 'expired',
      expiredAt: Timestamp.fromMillis(accessExpiresAtMs),
      updatedAt: FieldValue.serverTimestamp(),
    })
    if (roomSnapshot.exists && roomSnapshot.data()?.state !== 'ended') {
      transaction.set(roomRef, {
        state: 'ending',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
  })
  try {
    await enqueueOnlineClassroomHardEndTask(sessionKey, accessExpiresAtMs)
  } catch (error) {
    logger.error('Expired trial classroom could not enqueue immediate provider close', {
      trialClassId,
      reason: error instanceof Error ? error.message : 'UNKNOWN',
    })
  }
}

export const getOnlineTrialClassAccess = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 10,
  secrets: [jaasPrivateKey],
}, async (request) => {
  const trialClassId = request.data?.trialClassId || request.data?.roomId
  if (!isSafeOnlineTrialClassId(trialClassId)) {
    throw new HttpsError('invalid-argument', 'Link lớp học thử không hợp lệ.')
  }
  const trialRef = db.collection(ONLINE_TRIAL_CLASSES_COLLECTION).doc(trialClassId)
  const initialTrialSnapshot = await trialRef.get()
  if (!initialTrialSnapshot.exists || initialTrialSnapshot.data()?.kind !== 'trial_class') {
    throw trialClassError('TRIAL_CLASS_NOT_FOUND', 'Không tìm thấy lớp học thử.', 'not-found')
  }
  const initialTrial = initialTrialSnapshot.data() as TrialDocument
  if (!isSafeOnlineTrialClassSessionKey(initialTrial.roomSessionKey)) {
    throw trialClassError(
      'TRIAL_CLASS_DATA_INVALID',
      'Phòng học thử chưa được liên kết an toàn. Vui lòng liên hệ Admin.',
      )
  }
  if (effectiveTrialState(initialTrial, Date.now()) === 'ended') {
    throw trialClassError(
      'TRIAL_CLASS_ENDED',
      'Lớp học thử đã kết thúc.',
      'failed-precondition',
    )
  }
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(initialTrial.roomSessionKey)
  const [initialRoomSnapshot, viewer] = await Promise.all([
    roomRef.get(),
    resolveTrialViewer(
      request.auth?.uid,
      request.data?.displayName,
      initialTrial.guestDisplayName,
    ),
  ])
  if (!initialRoomSnapshot.exists) {
    throw trialClassError(
      'TRIAL_CLASS_ROOM_MISSING',
      'Phòng học thử chưa sẵn sàng. Vui lòng liên hệ Admin.',
      'not-found',
    )
  }
  const initialRoom = initialRoomSnapshot.data() as TrialRoomDocument
  const binding = validatedTrialBinding(trialClassId, initialTrial, initialRoom)
  if (!binding) {
    throw trialClassError(
      'TRIAL_CLASS_BINDING_INVALID',
      'Liên kết phòng học thử không khớp. Hệ thống đã từ chối mở phòng để bảo đảm an toàn.',
    )
  }
  const nowMs = Date.now()
  const accessDecision = decideOnlineTrialClassAccess({
    state: initialTrial.state,
    accessExpiresAtMs: binding.accessExpiresAtMs,
    nowMs,
  })
  if (accessDecision === 'expired') {
    await expireTrialClass(trialClassId, binding.sessionKey, binding.accessExpiresAtMs)
    throw trialClassError(
      'TRIAL_CLASS_EXPIRED',
      'Link lớp học thử đã hết hạn sau 7 ngày. Admin vui lòng tạo phòng mới.',
    )
  }
  if (accessDecision !== 'allowed' || initialRoom.state !== 'scheduled') {
    throw trialClassError(
      accessDecision === 'ended' ? 'TRIAL_CLASS_ENDED' : 'TRIAL_CLASS_NOT_AVAILABLE',
      accessDecision === 'ended'
        ? 'Lớp học thử đã kết thúc.'
        : 'Lớp học thử hiện chưa sẵn sàng.',
    )
  }

  // No participant receives a room credential until the deterministic close
  // task is registered. Repeating this operation is safe because task IDs are
  // deterministic and the queue treats an existing task as success.
  try {
    await registerTrialHardEnd(trialClassId, binding.sessionKey, binding.accessExpiresAtMs)
  } catch (error) {
    logger.error('Trial classroom access denied because hard-end is not guaranteed', {
      trialClassLogId: trialClassLogId(trialClassId),
      reason: error instanceof Error ? error.message : 'UNKNOWN',
    })
    throw new HttpsError(
      'unavailable',
      'Phòng chưa thể bảo đảm tự đóng an toàn. Vui lòng thử lại sau.',
      { reason: 'TRIAL_CLASS_HARD_END_NOT_SCHEDULED' },
    )
  }

  const authorized = await db.runTransaction(async (transaction) => {
    const [trialSnapshot, roomSnapshot] = await Promise.all([
      transaction.get(trialRef),
      transaction.get(roomRef),
    ])
    if (!trialSnapshot.exists || !roomSnapshot.exists) {
      throw trialClassError('TRIAL_CLASS_NOT_FOUND', 'Không tìm thấy lớp học thử.', 'not-found')
    }
    const trial = trialSnapshot.data() as TrialDocument
    const room = roomSnapshot.data() as TrialRoomDocument
    const freshState = effectiveTrialState(trial, Date.now())
    if (freshState === 'ended' || freshState === 'expired') {
      throw trialClassError(
        freshState === 'expired' ? 'TRIAL_CLASS_EXPIRED' : 'TRIAL_CLASS_ENDED',
        freshState === 'expired'
          ? 'Link lớp học thử đã hết hạn sau 7 ngày.'
          : 'Lớp học thử đã kết thúc.',
      )
    }
    const freshBinding = validatedTrialBinding(trialClassId, trial, room)
    if (!freshBinding || room.state !== 'scheduled') {
      throw trialClassError(
        'TRIAL_CLASS_BINDING_INVALID',
        'Phòng học thử không còn ở trạng thái an toàn để tham gia.',
      )
    }
    const decision = decideOnlineTrialClassAccess({
      state: trial.state,
      accessExpiresAtMs: freshBinding.accessExpiresAtMs,
      nowMs: Date.now(),
    })
    if (decision !== 'allowed') {
      throw trialClassError(
        decision === 'expired' ? 'TRIAL_CLASS_EXPIRED' : 'TRIAL_CLASS_ENDED',
        decision === 'expired'
          ? 'Link lớp học thử đã hết hạn sau 7 ngày.'
          : 'Lớp học thử đã kết thúc.',
      )
    }
    return { trial, binding: freshBinding }
  })

  try {
    const meetingConfig = resolveOnlineClassroomMeetingConfig({
      appId: process.env.CLASSROOM_JAAS_APP_ID,
      kid: process.env.CLASSROOM_JAAS_KID,
      privateKey: jaasPrivateKey.value(),
    })
    if (meetingConfig.meetingProvider !== 'jaas') {
      throw new OnlineClassroomJaasConfigurationError('JAAS_CONFIG_PARTIAL')
    }
    const roleViewerId = viewer.role === 'student'
      ? authorized.binding.guestViewerId
      : viewer.viewerId
    const joinUrl = onlineTrialClassJoinUrl(trialClassId)
    const meetingJwt = createOnlineClassroomJaasJwt({
      config: meetingConfig,
      roomAlias: authorized.binding.roomName,
      role: viewer.role,
      displayName: viewer.displayName,
      viewerId: roleViewerId,
      expiresAtMs: authorized.binding.accessExpiresAtMs,
    })
    // Sign first, then perform one final transactional lifecycle check. This
    // prevents a missing JaaS secret from falsely marking a room live and
    // narrows the end-vs-access race before returning a usable credential.
    const state = await db.runTransaction(async (transaction) => {
      const [trialSnapshot, roomSnapshot] = await Promise.all([
        transaction.get(trialRef),
        transaction.get(roomRef),
      ])
      if (!trialSnapshot.exists || !roomSnapshot.exists) {
        throw trialClassError('TRIAL_CLASS_NOT_FOUND', 'Không tìm thấy lớp học thử.', 'not-found')
      }
      const trial = trialSnapshot.data() as TrialDocument
      const room = roomSnapshot.data() as TrialRoomDocument
      const latestState = effectiveTrialState(trial, Date.now())
      const latestBinding = validatedTrialBinding(trialClassId, trial, room)
      if ((latestState !== 'ready' && latestState !== 'live') || !latestBinding || room.state !== 'scheduled') {
        throw trialClassError(
          latestState === 'expired' ? 'TRIAL_CLASS_EXPIRED' : 'TRIAL_CLASS_ENDED',
          latestState === 'expired'
            ? 'Link lớp học thử đã hết hạn sau 7 ngày.'
            : 'Lớp học thử đã kết thúc.',
        )
      }
      if ((viewer.role === 'admin' || viewer.role === 'teacher') && latestState === 'ready') {
        transaction.update(trialRef, {
          state: 'live',
          firstOpenedAt: FieldValue.serverTimestamp(),
          firstOpenedByUid: request.auth?.uid || '',
          firstOpenedByRole: viewer.role,
          updatedAt: FieldValue.serverTimestamp(),
        })
        return 'live' as const
      }
      return latestState
    })
    return {
      roomId: trialClassId,
      trialClassId,
      classroomType: 'trial',
      meetingProvider: 'jaas',
      meetingDomain: meetingConfig.meetingDomain,
      meetingAppId: meetingConfig.appId,
      meetingJwt,
      roomName: onlineClassroomJaasRoomName(meetingConfig, authorized.binding.roomName),
      role: viewer.role,
      displayName: viewer.displayName,
      title: typeof authorized.trial.title === 'string'
        ? authorized.trial.title
        : 'Lớp học thử 123English',
      joinUrl,
      guestUrl: joinUrl,
      adminUrl: joinUrl,
      status: state,
      state,
      hardEndsAt: new Date(authorized.binding.accessExpiresAtMs).toISOString(),
      accessExpiresAt: new Date(authorized.binding.accessExpiresAtMs).toISOString(),
      serverNow: new Date().toISOString(),
      accountingImpact: ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT,
      boardSnapshot: { version: 0, generation: 0, studentCanWrite: true, operations: [] },
      screenAnnotationSession: null,
      recordingNotice: null,
      recordingConsent: null,
    }
  } catch (error) {
    if (error instanceof HttpsError) throw error
    logger.error('Trial classroom JaaS credential creation rejected', {
      trialClassLogId: trialClassLogId(trialClassId),
      reason: error instanceof OnlineClassroomJaasConfigurationError
        ? error.reason
        : 'JAAS_JWT_SIGNING_FAILED',
    })
    throw trialClassError(
      'MEETING_PROVIDER_NOT_CONFIGURED',
      'Dịch vụ phòng học riêng chưa được cấu hình đầy đủ. Vui lòng liên hệ Admin.',
    )
  }
})

export const endOnlineTrialClass = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 5,
}, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập bằng tài khoản Admin hoặc gia sư.')
  }
  const moderatorUid = request.auth.uid
  const moderator = await resolveTrialViewer(moderatorUid, undefined, undefined)
  if (moderator.role !== 'admin' && moderator.role !== 'teacher') {
    throw new HttpsError(
      'permission-denied',
      'Chỉ Admin hoặc gia sư đang hoạt động được kết thúc lớp học thử.',
    )
  }
  const trialClassId = request.data?.trialClassId || request.data?.roomId
  if (!isSafeOnlineTrialClassId(trialClassId)) {
    throw new HttpsError('invalid-argument', 'Mã lớp học thử không hợp lệ.')
  }
  const trialRef = db.collection(ONLINE_TRIAL_CLASSES_COLLECTION).doc(trialClassId)
  const nowMs = Date.now()
  const ended = await db.runTransaction(async (transaction) => {
    const trialSnapshot = await transaction.get(trialRef)
    if (!trialSnapshot.exists || trialSnapshot.data()?.kind !== 'trial_class') {
      throw trialClassError('TRIAL_CLASS_NOT_FOUND', 'Không tìm thấy lớp học thử.', 'not-found')
    }
    const trial = trialSnapshot.data() as TrialDocument
    if (!isSafeOnlineTrialClassSessionKey(trial.roomSessionKey)) {
      throw trialClassError('TRIAL_CLASS_DATA_INVALID', 'Dữ liệu phòng học thử không hợp lệ.')
    }
    const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(trial.roomSessionKey)
    const roomSnapshot = await transaction.get(roomRef)
    if (!roomSnapshot.exists) {
      throw trialClassError('TRIAL_CLASS_ROOM_MISSING', 'Không tìm thấy phòng họp của lớp học thử.', 'not-found')
    }
    const room = roomSnapshot.data() as TrialRoomDocument
    const currentState = effectiveTrialState(trial, nowMs)
    if (currentState === 'ended' || currentState === 'expired') {
      return {
        trial,
        sessionKey: trial.roomSessionKey,
        hardEndMs: timestampMs(room.hardEndsAt),
        alreadyEnded: true,
      }
    }
    const binding = validatedTrialBinding(trialClassId, trial, room)
    if (!binding) {
      throw trialClassError(
        'TRIAL_CLASS_BINDING_INVALID',
        'Liên kết phòng học thử không khớp. Hệ thống từ chối thay đổi để bảo đảm an toàn.',
      )
    }
    transaction.update(trialRef, {
      state: 'ended',
      endedAt: Timestamp.fromMillis(nowMs),
      endedByUid: moderatorUid,
      endedByRole: moderator.role,
      endReason: moderator.role === 'admin' ? 'admin_ended' : 'teacher_ended',
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.set(roomRef, {
      state: 'ending',
      hardEndsAt: Timestamp.fromMillis(nowMs),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return {
      trial: {
        ...trial,
        state: 'ended',
        endedAt: Timestamp.fromMillis(nowMs),
      } as TrialDocument,
      sessionKey: binding.sessionKey,
      hardEndMs: nowMs,
      alreadyEnded: false,
    }
  })

  let providerClosure: 'scheduled' | 'recovery-pending' | 'already-ended' = ended.alreadyEnded
    ? 'already-ended'
    : 'scheduled'
  if (!ended.alreadyEnded && ended.hardEndMs !== null) {
    try {
      await enqueueOnlineClassroomHardEndTask(ended.sessionKey, ended.hardEndMs)
    } catch (error) {
      // Access is already revoked transactionally. The one-minute lifecycle
      // sweep will recover provider closure even if this immediate enqueue fails.
      providerClosure = 'recovery-pending'
      logger.error('Ended trial classroom awaits lifecycle sweep recovery', {
        trialClassLogId: trialClassLogId(trialClassId),
        reason: error instanceof Error ? error.message : 'UNKNOWN',
      })
    }
  }

  return {
    room: serializeTrialClass(trialClassId, ended.trial, Date.now()),
    ended: true,
    alreadyEnded: ended.alreadyEnded,
    providerClosure,
    accountingImpact: ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT,
  }
})
