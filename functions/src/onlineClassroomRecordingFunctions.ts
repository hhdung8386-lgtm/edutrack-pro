import { randomBytes, randomUUID } from 'node:crypto'
import { FieldValue, Firestore, Timestamp, type DocumentReference } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import {
  ONLINE_CLASSROOM_ACCESS_COLLECTION,
  ONLINE_CLASSROOM_ROOMS_COLLECTION,
  isInsideOnlineClassroomJoinWindow,
  isSafeClassroomId,
  onlineClassroomAccessGeneration,
  onlineClassroomAccessId,
  onlineClassroomBookingBlockReason,
  onlineClassroomSessionKey,
  type OnlineClassroomBookingLike,
} from './onlineClassroom'
import {
  ONLINE_CLASSROOM_RECORDING_BY_BOOKING_COLLECTION,
  ONLINE_CLASSROOM_RECORDING_MAX_BYTES,
  ONLINE_CLASSROOM_RECORDING_MEDIA_MUTATION_LEASE_MS,
  ONLINE_CLASSROOM_RECORDING_RETENTION_MS,
  ONLINE_CLASSROOM_RECORDINGS_COLLECTION,
  canAcquireOnlineClassroomRecordingMediaMutation,
  canStartOnlineClassroomRecordingWithConsent,
  canTransitionOnlineClassroomRecordingStatus,
  isOnlineClassroomRecordingExpired,
  isOnlineClassroomRecordingMediaMutationSettled,
  isSafeOnlineClassroomRecordingToken,
  onlineClassroomRecordingExpiresAt,
  onlineClassroomRecordingMediaMutationFence,
  onlineClassroomRecordingMediaMutationMatches,
  onlineClassroomRecordingNoticeMatches,
  onlineClassroomRecordingObjectPath,
  onlineClassroomRecordingPointerMatches,
  onlineClassroomRecordingReplayUrl,
  onlineClassroomRecordingTokenHash,
  resolveOnlineClassroomRecordingIdentityRole,
  type OnlineClassroomRecordingStatus,
  type OnlineClassroomRecordingMediaMutationExpected,
  type OnlineClassroomRecordingMediaMutationOperation,
} from './onlineClassroomRecording'
import {
  loadEligibleContext,
  preauthorizeClassroomRequest,
  resolveTrustedClassroomActor,
  resolveViewer,
  type ClassroomRecordingConsent,
} from './onlineClassroomFunctions'

const db = new Firestore()
const CLASSROOM_ORIGIN = 'https://www.123english.edu.vn'
const RECORDING_CLEANUP_LIMIT = 50
const RECORDING_UPLOAD_STALE_MS = 20 * 60 * 1000
const RECORDING_CONSENT_TTL_MS = 15 * 60 * 1000
const RECORDING_MEDIA_RESPONSE_COOLDOWN_MS = 2 * 60 * 1000
const ALLOWED_RECORDING_MIME_TYPES = new Set([
  'video/webm',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
])

type Booking = OnlineClassroomBookingLike & {
  studentName?: string
  teacherName?: string
  teacherCode?: string
  subjectName?: string
}

type RecordingDocument = {
  recordingId: string
  bookingId: string
  sessionKey: string
  teacherId: string
  studentId: string
  teacherName?: string
  studentName?: string
  subjectName?: string
  requestedDate?: string
  requestedStart?: string
  requestedEnd?: string
  status: OnlineClassroomRecordingStatus
  objectPath: string
  uploadNonce: string
  createdByUid: string
  createdByRole: 'admin' | 'teacher'
  mimeType: string
  fileName: string
  storageDownloadToken?: string
  shareTokenHash?: string
  sizeBytes?: number
  createdAt?: Timestamp
  updatedAt?: Timestamp
  readyAt?: Timestamp
  expiresAt?: Timestamp
  uploadHeartbeatAt?: Timestamp
  uploadSessionUrl?: string
  consentRequestId?: string
  consentAcceptedAt?: Timestamp
  consentTermsVersion?: string
  deleteRequestedReason?: string
  deleteRequestedAt?: Timestamp
  teacherPilotGeneration?: number
  mediaMutationFence?: number
  mediaMutation?: {
    id: string
    fence: number
    operation: OnlineClassroomRecordingMediaMutationOperation
    phase: 'applying' | 'cooldown'
    desiredStorageDownloadToken: string
    claimedAt: Timestamp
    expiresAt: Timestamp
    actorUid: string
  }
}

type RecordingPointer = {
  recordingId?: string
  status?: OnlineClassroomRecordingStatus
  expiresAt?: Timestamp
  updatedAt?: Timestamp
}

type ManagerContext = {
  actorUid: string
  actorRole: 'admin' | 'teacher'
  booking: Booking
  sessionKey: string
  teacherPilotGeneration: number
}

function recordingError(message: string, reason: string, code: 'failed-precondition' | 'permission-denied' | 'not-found' = 'failed-precondition') {
  return new HttpsError(code, message, { reason })
}

function asTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null
}

function publicRecordingConsent(value: Record<string, unknown>): ClassroomRecordingConsent {
  const timestampISO = (candidate: unknown) => candidate instanceof Timestamp
    ? candidate.toDate().toISOString()
    : null
  return {
    requestId: String(value.requestId || ''),
    status: value.status as ClassroomRecordingConsent['status'],
    requestedByRole: value.requestedByRole as ClassroomRecordingConsent['requestedByRole'],
    requestedAt: timestampISO(value.requestedAt),
    acceptedAt: timestampISO(value.acceptedAt),
    declinedAt: timestampISO(value.declinedAt),
    expiresAt: timestampISO(value.expiresAt),
  }
}

function safeUploadOrigin(rawOrigin: unknown): string {
  if (typeof rawOrigin !== 'string') return CLASSROOM_ORIGIN
  const origin = rawOrigin.trim().replace(/\/$/, '')
  if (origin === CLASSROOM_ORIGIN || origin === 'https://123english.edu.vn') return origin
  if (/^http:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}$/.test(origin)) return origin
  return CLASSROOM_ORIGIN
}

function sanitizeMimeType(value: unknown): string {
  if (typeof value !== 'string') return 'video/webm'
  const mimeType = value.trim().toLowerCase()
  return ALLOWED_RECORDING_MIME_TYPES.has(mimeType) ? mimeType : 'video/webm'
}

function safeFileName(booking: Booking): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(booking.requestedDate || '')
    ? booking.requestedDate
    : 'buoi-hoc'
  return `123english-${date}-${booking.id}.webm`.replace(/[^a-zA-Z0-9._-]/g, '-')
}

async function readSystemUser(uid: string) {
  const snapshot = await db.collection('users').doc(uid).get()
  return snapshot.exists ? snapshot.data() || {} : {}
}

async function loadRecordingManagerContext(uid: string | undefined, bookingId: string): Promise<ManagerContext> {
  if (!uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại trước khi ghi buổi học.')
  const [bookingSnapshot, actor] = await Promise.all([
    db.collection('bookingRequests').doc(bookingId).get(),
    resolveTrustedClassroomActor(uid),
  ])
  if (!bookingSnapshot.exists) throw recordingError('Không tìm thấy buổi học.', 'BOOKING_NOT_FOUND', 'not-found')
  const booking = { id: bookingSnapshot.id, ...bookingSnapshot.data() } as Booking
  const blockReason = onlineClassroomBookingBlockReason(booking)
  if (blockReason) throw recordingError('Buổi học không còn đủ điều kiện ghi hình.', blockReason)
  if (!isInsideOnlineClassroomJoinWindow(booking, Date.now())) {
    throw recordingError('Chỉ được ghi trong thời gian phòng học đang mở.', 'OUTSIDE_JOIN_WINDOW')
  }

  const actorRole = actor?.role === 'admin'
    ? 'admin'
    : actor?.role === 'teacher' && actor.teacherId === booking.teacherId
      ? 'teacher'
      : null
  if (!actorRole) throw recordingError('Bạn không có quyền ghi buổi học này.', 'RECORDING_MANAGER_REQUIRED', 'permission-denied')

  const [studentAccess, teacherAccess, studentSnapshot, teacherSnapshot] = await Promise.all([
    db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION).doc(onlineClassroomAccessId('student', booking.studentId!)).get(),
    db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION).doc(onlineClassroomAccessId('teacher', booking.teacherId!)).get(),
    db.collection('students').doc(booking.studentId!).get(),
    db.collection('teachers').doc(booking.teacherId!).get(),
  ])
  if (studentAccess.data()?.enabled !== true) {
    throw recordingError('Admin chưa bật phòng học trực tuyến cho học viên.', 'PILOT_NOT_ENABLED')
  }
  if (studentSnapshot.data()?.status !== 'active' || teacherSnapshot.data()?.status !== 'active') {
    throw recordingError('Gia sư hoặc học viên không còn hoạt động.', 'PARTICIPANT_NOT_ACTIVE')
  }
  const canonicalTeacherUid = typeof teacherSnapshot.data()?.loginAccountUid === 'string'
    ? teacherSnapshot.data()!.loginAccountUid
    : ''
  if (!isSafeClassroomId(canonicalTeacherUid)) {
    throw recordingError(
      'Gia sư chưa có tài khoản đăng nhập chuẩn. Admin cần khôi phục đăng nhập trước khi ghi.',
      'TEACHER_CANONICAL_UID_REQUIRED',
    )
  }
  const canonicalTeacherUser = await db.collection('users').doc(canonicalTeacherUid).get()
  if (!canonicalTeacherUser.exists
    || canonicalTeacherUser.data()?.role !== 'teacher'
    || canonicalTeacherUser.data()?.teacherId !== booking.teacherId) {
    throw recordingError(
      'Tài khoản đăng nhập của gia sư chưa khớp hồ sơ. Admin cần khôi phục đăng nhập trước khi ghi.',
      'TEACHER_IDENTITY_MISMATCH',
    )
  }

  const studentPilotGeneration = onlineClassroomAccessGeneration(studentAccess.data()?.generation)
  const teacherPilotGeneration = onlineClassroomAccessGeneration(teacherAccess.data()?.generation)
  return {
    actorUid: uid,
    actorRole,
    booking,
    sessionKey: onlineClassroomSessionKey(
      booking,
      studentPilotGeneration,
      teacherPilotGeneration,
    ),
    teacherPilotGeneration,
  }
}

async function resolveRecordingIdentityRole(
  uid: string,
  recording: RecordingDocument,
): Promise<'admin' | 'teacher' | null> {
  const user = await readSystemUser(uid)
  if (user.role === 'admin') {
    return resolveOnlineClassroomRecordingIdentityRole(uid, user, null, null, recording)
  }
  if (user.role !== 'teacher'
    || !isSafeClassroomId(user.teacherId)
    || user.teacherId !== recording.teacherId) return null

  const [teacherSnapshot, accessSnapshot] = await Promise.all([
    db.collection('teachers').doc(user.teacherId).get(),
    db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION)
      .doc(onlineClassroomAccessId('teacher', user.teacherId))
      .get(),
  ])
  return resolveOnlineClassroomRecordingIdentityRole(
    uid,
    user,
    teacherSnapshot.data() || null,
    accessSnapshot.data() || null,
    recording,
  )
}

async function requireRecordingManager(uid: string | undefined, recording: RecordingDocument): Promise<'admin' | 'teacher'> {
  if (!uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại.')
  const actorRole = await resolveRecordingIdentityRole(uid, recording)
  if (actorRole) return actorRole
  throw recordingError('Bạn không có quyền quản lý bản ghi này.', 'RECORDING_MANAGER_REQUIRED', 'permission-denied')
}

async function requireRecordingViewer(
  uid: string | undefined,
  recording: RecordingDocument,
  rawToken: unknown,
): Promise<'admin' | 'teacher' | 'student'> {
  if (uid) {
    const actorRole = await resolveRecordingIdentityRole(uid, recording)
    if (actorRole) return actorRole
  }

  const token = typeof rawToken === 'string' ? rawToken.trim() : ''
  if (isSafeOnlineClassroomRecordingToken(token)
    && recording.shareTokenHash === onlineClassroomRecordingTokenHash(token)) return 'student'
  throw recordingError('Link xem lại không hợp lệ hoặc bạn không có quyền truy cập.', 'RECORDING_ACCESS_DENIED', 'permission-denied')
}

function recordingPublicMetadata(recording: RecordingDocument) {
  return {
    recordingId: recording.recordingId,
    bookingId: recording.bookingId,
    status: recording.status,
    teacherName: recording.teacherName || '',
    studentName: recording.studentName || '',
    subjectName: recording.subjectName || '',
    requestedDate: recording.requestedDate || '',
    requestedStart: recording.requestedStart || '',
    requestedEnd: recording.requestedEnd || '',
    fileName: recording.fileName,
    sizeBytes: Number(recording.sizeBytes) || 0,
    readyAt: asTimestamp(recording.readyAt)?.toDate().toISOString() || null,
    expiresAt: asTimestamp(recording.expiresAt)?.toDate().toISOString() || null,
  }
}

function firebasePlaybackUrl(bucketName: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`
}

async function deleteRecordingObject(
  recording: Partial<RecordingDocument>,
  generation?: string,
): Promise<void> {
  if (!recording.objectPath) return
  const file = getStorage().bucket().file(
    recording.objectPath,
    generation ? { generation } : undefined,
  )
  await file.delete({ ignoreNotFound: true })
}

async function cancelResumableUploadSession(sessionUrl: unknown): Promise<void> {
  if (typeof sessionUrl !== 'string'
    || sessionUrl.length < 40
    || sessionUrl.length > 4_000
    || !/^https:\/\/(?:storage|www)\.googleapis\.com\/upload\/storage\//i.test(sessionUrl)) return
  const response = await fetch(sessionUrl, { method: 'DELETE', redirect: 'error' })
  // GCS may answer 499 when a resumable session is successfully cancelled.
  if (!response.ok && ![404, 410, 499].includes(response.status)) {
    throw new Error(`UPLOAD_SESSION_CANCEL_FAILED_${response.status}`)
  }
}

function newRecordingMediaMutation(
  recording: Partial<RecordingDocument>,
  operation: OnlineClassroomRecordingMediaMutationOperation,
  actorUid: string,
  nowMs: number = Date.now(),
) {
  const fence = onlineClassroomRecordingMediaMutationFence(recording.mediaMutationFence) + 1
  return {
    id: randomBytes(18).toString('hex'),
    fence,
    operation,
    phase: 'applying' as const,
    desiredStorageDownloadToken: randomUUID(),
    claimedAt: Timestamp.fromMillis(nowMs),
    expiresAt: Timestamp.fromMillis(nowMs + ONLINE_CLASSROOM_RECORDING_MEDIA_MUTATION_LEASE_MS),
    actorUid,
  }
}

function assertRecordingMediaMutationAvailable(recording: RecordingDocument, nowMs: number = Date.now()) {
  if (!canAcquireOnlineClassroomRecordingMediaMutation(recording, nowMs)) {
    throw recordingError(
      'Bản ghi đang được cập nhật ở một yêu cầu khác. Vui lòng chờ rồi thử lại.',
      'RECORDING_MEDIA_MUTATION_IN_PROGRESS',
    )
  }
}

async function applyRecordingObjectDownloadToken(
  recording: Partial<RecordingDocument>,
  storageDownloadToken: string,
  mutation: OnlineClassroomRecordingMediaMutationExpected,
): Promise<{ generation: string; sizeBytes: number }> {
  if (!recording.objectPath || !recording.recordingId || !recording.bookingId) {
    throw recordingError('Bản ghi thiếu thông tin vùng lưu video.', 'RECORDING_MEDIA_UNAVAILABLE')
  }
  const file = getStorage().bucket().file(recording.objectPath)
  const [metadata] = await file.getMetadata()
  const customMetadata = metadata.metadata && typeof metadata.metadata === 'object'
    ? metadata.metadata
    : {}
  if ((customMetadata.recordingId && customMetadata.recordingId !== recording.recordingId)
    || (customMetadata.bookingId && customMetadata.bookingId !== recording.bookingId)) {
    throw recordingError('Metadata video không khớp bản ghi.', 'RECORDING_MEDIA_IDENTITY_MISMATCH')
  }
  const metageneration = Number(metadata.metageneration)
  const generation = typeof metadata.generation === 'string' ? metadata.generation : ''
  if (!Number.isSafeInteger(metageneration) || metageneration < 1 || !generation) {
    throw recordingError('Metadata phiên bản video không hợp lệ.', 'RECORDING_MEDIA_VERSION_INVALID')
  }
  const versionedFile = getStorage().bucket().file(recording.objectPath, { generation })
  await versionedFile.setMetadata({
    cacheControl: 'private, max-age=0, no-store',
    metadata: {
      ...customMetadata,
      firebaseStorageDownloadTokens: storageDownloadToken,
      recordingId: recording.recordingId,
      bookingId: recording.bookingId,
      recordingMediaMutationId: mutation.id,
      recordingMediaMutationFence: String(mutation.fence),
      recordingMediaMutationOperation: mutation.operation,
    },
  }, { ifMetagenerationMatch: metageneration })
  return { generation, sizeBytes: Number(metadata.size) }
}

async function revokeRecordingObjectDownloadToken(
  recording: Partial<RecordingDocument>,
  mutation: RecordingDocument['mediaMutation'],
): Promise<{ generation?: string; sizeBytes?: number }> {
  if (!recording.objectPath || !mutation) return {}
  return applyRecordingObjectDownloadToken(
    recording,
    mutation.desiredStorageDownloadToken,
    mutation,
  )
}

async function releaseRecordingMediaMutation(
  recordingRef: DocumentReference,
  mutation: OnlineClassroomRecordingMediaMutationExpected,
): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(recordingRef)
    const recording = snapshot.data() as RecordingDocument | undefined
    if (!recording || !onlineClassroomRecordingMediaMutationMatches(recording, mutation)) return
    transaction.set(recordingRef, {
      mediaMutation: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  })
}

export const requestOnlineClassroomRecordingConsent = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  // Firebase clients authenticate inside the callable handler. Cloud Run must
  // accept the HTTP request first; making this explicit also repairs IAM when
  // an interrupted first deployment leaves the service without an invoker.
  invoker: 'public',
}, async (request) => {
  const bookingId = request.data?.bookingId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  const context = await loadRecordingManagerContext(request.auth?.uid, bookingId)
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(context.sessionKey)
  const nowMs = Date.now()
  const recordingConsent = await db.runTransaction(async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef)
    const currentNotice = roomSnapshot.data()?.recordingNotice as Record<string, unknown> | undefined
    if (currentNotice?.active === true) {
      throw recordingError('Buổi học đang được ghi hình.', 'RECORDING_ALREADY_ACTIVE')
    }
    const current = roomSnapshot.data()?.recordingConsent as Record<string, unknown> | undefined
    const currentExpiresAt = asTimestamp(current?.expiresAt)?.toMillis() || 0
    if (current?.status === 'pending'
      && current.requestedByUid === context.actorUid
      && currentExpiresAt > nowMs) {
      return current
    }
    if (current?.status === 'recording') {
      throw recordingError('Buổi học đang được ghi hình.', 'RECORDING_ALREADY_ACTIVE')
    }
    const next = {
      requestId: randomBytes(18).toString('hex'),
      bookingId,
      sessionKey: context.sessionKey,
      status: 'pending',
      requestedByRole: context.actorRole,
      requestedByUid: context.actorUid,
      requestedAt: Timestamp.fromMillis(nowMs),
      acceptedAt: null,
      declinedAt: null,
      expiresAt: Timestamp.fromMillis(nowMs + RECORDING_CONSENT_TTL_MS),
      termsVersion: 'recording-consent-v1',
    }
    transaction.set(roomRef, {
      recordingConsent: next,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    transaction.set(db.collection('adminLogs').doc(), {
      adminId: context.actorUid,
      action: 'REQUEST_ONLINE_CLASSROOM_RECORDING_CONSENT',
      targetType: 'booking',
      targetId: bookingId,
      changes: { requestId: next.requestId, actorRole: context.actorRole },
      createdAt: FieldValue.serverTimestamp(),
    })
    return next
  })
  return { recordingConsent: publicRecordingConsent(recordingConsent) }
})

export const respondOnlineClassroomRecordingConsent = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  // This is a small consent transaction for the limited pilot. Fractional CPU
  // avoids exhausting the regional Cloud Run CPU quota during safe revisions.
  cpu: 'gcf_gen1',
}, async (request) => {
  const bookingId = request.data?.bookingId
  const requestId = request.data?.requestId
  const accepted = request.data?.accepted
  if (!isSafeClassroomId(bookingId)
    || !isSafeClassroomId(requestId)
    || typeof accepted !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Phản hồi đồng ý ghi hình không hợp lệ.')
  }
  await preauthorizeClassroomRequest(request, bookingId)
  const context = await loadEligibleContext(bookingId)
  const viewer = await resolveViewer(request, context)
  if (viewer.role !== 'student') {
    throw recordingError(
      'Chỉ học viên của buổi học được đồng ý hoặc từ chối ghi hình.',
      'RECORDING_STUDENT_CONSENT_REQUIRED',
      'permission-denied',
    )
  }
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(context.sessionKey)
  const nowMs = Date.now()
  const recordingConsent = await db.runTransaction(async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef)
    const current = roomSnapshot.data()?.recordingConsent as Record<string, unknown> | undefined
    if (!current || current.requestId !== requestId || current.bookingId !== bookingId) {
      throw recordingError('Yêu cầu đồng ý ghi hình không còn hiệu lực.', 'RECORDING_CONSENT_NOT_FOUND')
    }
    if (current.status === (accepted ? 'accepted' : 'declined')) return current
    if (current.status !== 'pending') {
      throw recordingError('Yêu cầu ghi hình đã đổi trạng thái.', 'RECORDING_CONSENT_STATE_CHANGED')
    }
    const expiresAt = asTimestamp(current.expiresAt)?.toMillis() || 0
    if (expiresAt <= nowMs) {
      throw recordingError('Yêu cầu đồng ý ghi hình đã hết hạn.', 'RECORDING_CONSENT_EXPIRED')
    }
    const next = {
      ...current,
      status: accepted ? 'accepted' : 'declined',
      acceptedAt: accepted ? Timestamp.fromMillis(nowMs) : null,
      declinedAt: accepted ? null : Timestamp.fromMillis(nowMs),
      respondedByStudentId: context.booking.studentId,
      respondedAt: Timestamp.fromMillis(nowMs),
    }
    transaction.set(roomRef, {
      recordingConsent: next,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    transaction.set(db.collection('adminLogs').doc(), {
      adminId: `student:${context.booking.studentId}`,
      action: accepted
        ? 'ACCEPT_ONLINE_CLASSROOM_RECORDING_CONSENT'
        : 'DECLINE_ONLINE_CLASSROOM_RECORDING_CONSENT',
      targetType: 'booking',
      targetId: bookingId,
      changes: { requestId },
      createdAt: FieldValue.serverTimestamp(),
    })
    return next
  })
  return { recordingConsent: publicRecordingConsent(recordingConsent) }
})

export const startOnlineClassroomRecording = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '512MiB',
}, async (request) => {
  const bookingId = request.data?.bookingId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  const consentRequestId = request.data?.consentRequestId
  if (!isSafeClassroomId(consentRequestId)) {
    throw new HttpsError('invalid-argument', 'Cần học viên đồng ý ghi hình trước khi bắt đầu.')
  }
  const context = await loadRecordingManagerContext(request.auth?.uid, bookingId)
  const mimeType = sanitizeMimeType(request.data?.mimeType)
  const now = Date.now()
  const recordingId = randomBytes(18).toString('hex')
  const uploadNonce = randomBytes(12).toString('hex')
  const shareToken = randomBytes(32).toString('base64url')
  const objectPath = onlineClassroomRecordingObjectPath(recordingId, uploadNonce)
  const recordingRef = db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION).doc(recordingId)
  const pointerRef = db.collection(ONLINE_CLASSROOM_RECORDING_BY_BOOKING_COLLECTION).doc(bookingId)
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(context.sessionKey)
  let staleObjectPath = ''
  let staleUploadSessionUrl = ''

  await db.runTransaction(async (transaction) => {
    const [pointerSnapshot, roomSnapshot] = await Promise.all([
      transaction.get(pointerRef),
      transaction.get(roomRef),
    ])
    const consent = roomSnapshot.data()?.recordingConsent as Record<string, unknown> | undefined
    if (!canStartOnlineClassroomRecordingWithConsent(consent, {
      requestId: consentRequestId,
      bookingId,
      sessionKey: context.sessionKey,
      studentId: context.booking.studentId!,
    }, now)) {
      throw recordingError(
        'Học viên chưa đồng ý hoặc yêu cầu ghi hình đã hết hạn.',
        'RECORDING_CONSENT_REQUIRED',
      )
    }
    const acceptedConsent = consent!
    const pointer = pointerSnapshot.data() as RecordingPointer | undefined
    if (pointer?.recordingId) {
      const existingSnapshot = await transaction.get(db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION).doc(pointer.recordingId))
      const existing = existingSnapshot.data() as RecordingDocument | undefined
      const existingHeartbeatAt = asTimestamp(existing?.uploadHeartbeatAt)?.toMillis()
        || asTimestamp(existing?.updatedAt)?.toMillis()
        || asTimestamp(existing?.createdAt)?.toMillis()
        || 0
      const activeUpload = existing?.status === 'preparing' || existing?.status === 'uploading'
      const uploadIsFresh = activeUpload && now - existingHeartbeatAt < RECORDING_UPLOAD_STALE_MS
      const readyAndAvailable = existing?.status === 'ready' && !isOnlineClassroomRecordingExpired(existing.expiresAt, now)
      if (uploadIsFresh) throw recordingError('Buổi học đang có một bản ghi được tải lên.', 'RECORDING_UPLOAD_IN_PROGRESS')
      if (readyAndAvailable) throw recordingError('Buổi học đã có bản ghi còn hiệu lực.', 'RECORDING_ALREADY_READY')
      if (existing && !canAcquireOnlineClassroomRecordingMediaMutation(existing, now)) {
        throw recordingError(
          'Bản ghi cũ đang được hoàn tất, chia sẻ hoặc hủy ở một yêu cầu khác.',
          'RECORDING_MEDIA_MUTATION_IN_PROGRESS',
        )
      }
      staleObjectPath = existing?.objectPath || ''
      staleUploadSessionUrl = existing?.uploadSessionUrl || ''
      if (existingSnapshot.exists && activeUpload) {
        transaction.set(existingSnapshot.ref, {
          status: 'failed',
          failureReason: 'SUPERSEDED_BY_NEW_RECORDING',
          storageDownloadToken: FieldValue.delete(),
          uploadSessionUrl: FieldValue.delete(),
          uploadHeartbeatAt: FieldValue.delete(),
          updatedAt: Timestamp.fromMillis(now),
        }, { merge: true })
      }
    }

    const expiresAt = Timestamp.fromMillis(onlineClassroomRecordingExpiresAt(now))
    const recording: RecordingDocument = {
      recordingId,
      bookingId,
      sessionKey: context.sessionKey,
      teacherId: context.booking.teacherId!,
      studentId: context.booking.studentId!,
      teacherName: context.booking.teacherCode || context.booking.teacherName || '',
      studentName: context.booking.studentName || '',
      subjectName: context.booking.subjectName || '',
      requestedDate: context.booking.requestedDate || '',
      requestedStart: context.booking.requestedStart || '',
      requestedEnd: context.booking.requestedEnd || '',
      status: 'preparing',
      objectPath,
      uploadNonce,
      createdByUid: context.actorUid,
      createdByRole: context.actorRole,
      teacherPilotGeneration: context.teacherPilotGeneration,
      mimeType,
      fileName: safeFileName(context.booking),
      shareTokenHash: onlineClassroomRecordingTokenHash(shareToken),
      uploadHeartbeatAt: Timestamp.fromMillis(now),
      consentRequestId,
      consentAcceptedAt: asTimestamp(acceptedConsent.acceptedAt) || Timestamp.fromMillis(now),
      consentTermsVersion: typeof acceptedConsent.termsVersion === 'string'
        ? acceptedConsent.termsVersion
        : 'recording-consent-v1',
      createdAt: Timestamp.fromMillis(now),
      updatedAt: Timestamp.fromMillis(now),
      expiresAt,
    }
    transaction.create(recordingRef, recording)
    transaction.set(pointerRef, {
      bookingId,
      recordingId,
      status: 'preparing',
      expiresAt,
      updatedAt: Timestamp.fromMillis(now),
    })
    transaction.set(roomRef, {
      recordingConsent: {
        ...acceptedConsent,
        status: 'recording',
        recordingId,
        startedAt: Timestamp.fromMillis(now),
      },
      updatedAt: Timestamp.fromMillis(now),
    }, { merge: true })
  })

  if (staleObjectPath) {
    await getStorage().bucket().file(staleObjectPath).delete({ ignoreNotFound: true }).catch((error) => {
      logger.warn('Unable to remove stale classroom recording object', { bookingId, staleObjectPath, error })
    })
  }
  if (staleUploadSessionUrl) {
    await cancelResumableUploadSession(staleUploadSessionUrl).catch((error) => {
      logger.warn('Unable to cancel stale classroom recording upload session', { bookingId, error })
    })
  }

  let createdUploadSessionUrl = ''
  try {
    const origin = safeUploadOrigin(request.rawRequest?.headers.origin)
    const bucket = getStorage().bucket()
    const file = bucket.file(objectPath)
    const [uploadSessionUrl] = await file.createResumableUpload({
      origin,
      metadata: {
        contentType: mimeType,
        cacheControl: 'private, max-age=0, no-store',
        contentDisposition: `inline; filename="${safeFileName(context.booking)}"`,
        metadata: {
          recordingId,
          bookingId,
        },
      },
    })
    createdUploadSessionUrl = uploadSessionUrl
    await db.runTransaction(async (transaction) => {
      const [latestSnapshot, pointerSnapshot, roomSnapshot] = await Promise.all([
        transaction.get(recordingRef),
        transaction.get(pointerRef),
        transaction.get(roomRef),
      ])
      const latestConsent = roomSnapshot.data()?.recordingConsent as Record<string, unknown> | undefined
      if (latestSnapshot.data()?.status !== 'preparing'
        || !onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recordingId)
        || latestConsent?.recordingId !== recordingId
        || latestConsent?.status !== 'recording') {
        throw recordingError('Phiên ghi đã bị hủy hoặc thay thế.', 'RECORDING_STATE_CHANGED')
      }
      transaction.update(recordingRef, {
        status: 'uploading',
        uploadSessionUrl,
        uploadHeartbeatAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.set(pointerRef, {
        status: 'uploading',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      transaction.set(roomRef, {
        recordingNotice: {
          active: true,
          recordingId,
          startedByRole: context.actorRole,
          startedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    })
    return {
      recordingId,
      uploadSessionUrl,
      replayUrl: onlineClassroomRecordingReplayUrl(CLASSROOM_ORIGIN, recordingId, shareToken),
      shareToken,
      expiresAt: new Date(onlineClassroomRecordingExpiresAt(now)).toISOString(),
      maxBytes: ONLINE_CLASSROOM_RECORDING_MAX_BYTES,
    }
  } catch (error) {
    const createdSessionSnapshot = await recordingRef.get().catch(() => null)
    await Promise.allSettled([
      cancelResumableUploadSession(createdUploadSessionUrl),
      cancelResumableUploadSession(createdSessionSnapshot?.data()?.uploadSessionUrl),
    ])
    await db.runTransaction(async (transaction) => {
      const [latestSnapshot, pointerSnapshot, roomSnapshot] = await Promise.all([
        transaction.get(recordingRef),
        transaction.get(pointerRef),
        transaction.get(roomRef),
      ])
      const latest = latestSnapshot.data() as RecordingDocument | undefined
      if (!latest || (latest.status !== 'preparing' && latest.status !== 'uploading')) return
      transaction.set(recordingRef, {
        status: 'failed',
        failureReason: 'UPLOAD_SESSION_FAILED',
        uploadSessionUrl: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      if (onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recordingId)) {
        transaction.set(pointerRef, {
          status: 'failed',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      }
      const consent = roomSnapshot.data()?.recordingConsent as Record<string, unknown> | undefined
      if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recordingId)
        || consent?.recordingId === recordingId) {
        transaction.set(roomRef, {
          recordingNotice: FieldValue.delete(),
          recordingConsent: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      }
    }).catch(() => undefined)
    logger.error('Unable to create classroom recording upload session', { bookingId, recordingId, error })
    throw new HttpsError('internal', 'Chưa tạo được vùng lưu bản ghi. Vui lòng thử lại.')
  }
})

export const touchOnlineClassroomRecordingUpload = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  const recordingId = request.data?.recordingId
  const uploadedBytes = Number(request.data?.uploadedBytes)
  if (!isSafeClassroomId(recordingId)
    || !Number.isSafeInteger(uploadedBytes)
    || uploadedBytes < 0
    || uploadedBytes > ONLINE_CLASSROOM_RECORDING_MAX_BYTES) {
    throw new HttpsError('invalid-argument', 'Tiến độ tải bản ghi không hợp lệ.')
  }
  const recordingRef = db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION).doc(recordingId)
  const snapshot = await recordingRef.get()
  if (!snapshot.exists) throw recordingError('Không tìm thấy bản ghi.', 'RECORDING_NOT_FOUND', 'not-found')
  const recording = snapshot.data() as RecordingDocument
  await requireRecordingManager(request.auth?.uid, recording)
  await db.runTransaction(async (transaction) => {
    const latestSnapshot = await transaction.get(recordingRef)
    const latest = latestSnapshot.data() as RecordingDocument | undefined
    if (!latest || (latest.status !== 'preparing' && latest.status !== 'uploading')) {
      throw recordingError('Phiên tải bản ghi không còn hoạt động.', 'RECORDING_NOT_UPLOADING')
    }
    transaction.set(recordingRef, {
      uploadHeartbeatAt: FieldValue.serverTimestamp(),
      uploadedBytes,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  })
  return { success: true }
})

export const finalizeOnlineClassroomRecording = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '512MiB',
}, async (request) => {
  const recordingId = request.data?.recordingId
  if (!isSafeClassroomId(recordingId)) throw new HttpsError('invalid-argument', 'Bản ghi không hợp lệ.')
  const recordingRef = db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION).doc(recordingId)
  const snapshot = await recordingRef.get()
  if (!snapshot.exists) throw recordingError('Không tìm thấy bản ghi.', 'RECORDING_NOT_FOUND', 'not-found')
  const recording = snapshot.data() as RecordingDocument
  const actorRole = await requireRecordingManager(request.auth?.uid, recording)
  if (recording.status === 'ready') return { success: true, ...recordingPublicMetadata(recording) }
  if (recording.status !== 'uploading') throw recordingError('Bản ghi không ở trạng thái có thể hoàn tất.', 'RECORDING_NOT_UPLOADING')
  const pointerRef = db.collection(ONLINE_CLASSROOM_RECORDING_BY_BOOKING_COLLECTION).doc(recording.bookingId)
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(recording.sessionKey)
  const claim = await db.runTransaction(async (transaction) => {
    const [latestSnapshot, pointerSnapshot] = await Promise.all([
      transaction.get(recordingRef),
      transaction.get(pointerRef),
    ])
    const latest = latestSnapshot.data() as RecordingDocument | undefined
    if (!latest) throw recordingError('Không tìm thấy bản ghi.', 'RECORDING_NOT_FOUND', 'not-found')
    if (latest.status === 'ready') return { alreadyReady: true, recording: latest, mutation: null }
    if (latest.status !== 'uploading') {
      throw recordingError('Bản ghi không ở trạng thái có thể hoàn tất.', 'RECORDING_NOT_UPLOADING')
    }
    if (!onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recordingId)) {
      throw recordingError('Bản ghi này đã được thay bằng một phiên ghi mới hơn.', 'RECORDING_SUPERSEDED')
    }
    assertRecordingMediaMutationAvailable(latest)
    const mutation = newRecordingMediaMutation(latest, 'finalize', request.auth?.uid || '')
    transaction.set(recordingRef, {
      mediaMutation: mutation,
      mediaMutationFence: mutation.fence,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { alreadyReady: false, recording: latest, mutation }
  })
  if (claim.alreadyReady || !claim.mutation) {
    return { success: true, ...recordingPublicMetadata(claim.recording) }
  }

  let applied: { generation: string; sizeBytes: number }
  try {
    applied = await applyRecordingObjectDownloadToken(
      claim.recording,
      claim.mutation.desiredStorageDownloadToken,
      claim.mutation,
    )
  } catch (error) {
    if (error instanceof HttpsError) throw error
    throw recordingError('Video chưa tải lên hoàn chỉnh. Vui lòng chờ rồi thử lại.', 'RECORDING_OBJECT_INCOMPLETE')
  }
  const sizeBytes = applied.sizeBytes
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > ONLINE_CLASSROOM_RECORDING_MAX_BYTES) {
    await deleteRecordingObject(claim.recording, applied.generation).catch((error) => {
      throw recordingError(
        'Không thể hủy tệp bản ghi không hợp lệ. Hệ thống sẽ tự thử lại.',
        error instanceof Error ? 'RECORDING_INVALID_OBJECT_DELETE_FAILED' : 'RECORDING_MEDIA_UNAVAILABLE',
      )
    })
    await db.runTransaction(async (transaction) => {
      const [latestSnapshot, pointerSnapshot, roomSnapshot] = await Promise.all([
        transaction.get(recordingRef),
        transaction.get(pointerRef),
        transaction.get(roomRef),
      ])
      const latest = latestSnapshot.data() as RecordingDocument | undefined
      if (!latest || latest.status !== 'uploading'
        || !onlineClassroomRecordingMediaMutationMatches(latest, claim.mutation!)) return
      transaction.set(recordingRef, {
        status: 'failed',
        failureReason: sizeBytes > ONLINE_CLASSROOM_RECORDING_MAX_BYTES ? 'FILE_TOO_LARGE' : 'EMPTY_FILE',
        uploadSessionUrl: FieldValue.delete(),
        storageDownloadToken: FieldValue.delete(),
        mediaMutation: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      if (onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recordingId)) {
        transaction.set(pointerRef, {
          status: 'failed',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      }
      const consent = roomSnapshot.data()?.recordingConsent as Record<string, unknown> | undefined
      if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recordingId)
        || consent?.recordingId === recordingId) {
        transaction.set(roomRef, {
          recordingNotice: FieldValue.delete(),
          recordingConsent: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      }
    })
    throw recordingError(
      sizeBytes > ONLINE_CLASSROOM_RECORDING_MAX_BYTES
        ? 'Bản ghi vượt giới hạn 1,25 GB và đã được hủy.'
        : 'Bản ghi không có dữ liệu video.',
      sizeBytes > ONLINE_CLASSROOM_RECORDING_MAX_BYTES ? 'RECORDING_TOO_LARGE' : 'RECORDING_EMPTY',
    )
  }

  const now = Date.now()
  const readyAt = Timestamp.fromMillis(now)
  const expiresAt = Timestamp.fromMillis(onlineClassroomRecordingExpiresAt(now))
  const storageDownloadToken = claim.mutation.desiredStorageDownloadToken
  await db.runTransaction(async (transaction) => {
    const [latestSnapshot, pointerSnapshot, roomSnapshot] = await Promise.all([
      transaction.get(recordingRef),
      transaction.get(pointerRef),
      transaction.get(roomRef),
    ])
    const latest = latestSnapshot.data() as RecordingDocument | undefined
    if (!latest) throw recordingError('Không tìm thấy bản ghi.', 'RECORDING_NOT_FOUND', 'not-found')
    if (!onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recordingId)) {
      throw recordingError(
        'Bản ghi này đã được thay bằng một phiên ghi mới hơn.',
        'RECORDING_SUPERSEDED',
      )
    }
    if (!canTransitionOnlineClassroomRecordingStatus(latest.status, 'ready')) {
      throw recordingError('Bản ghi đã đổi trạng thái và không thể hoàn tất.', 'RECORDING_STATE_CHANGED')
    }
    if (!onlineClassroomRecordingMediaMutationMatches(latest, claim.mutation!)) {
      throw recordingError('Quyền cập nhật video đã hết hạn hoặc bị thay thế.', 'RECORDING_MEDIA_MUTATION_FENCED')
    }
    transaction.update(recordingRef, {
      status: 'ready',
      sizeBytes,
      readyAt,
      expiresAt,
      storageDownloadToken,
      mediaMutation: {
        ...claim.mutation,
        phase: 'cooldown',
        expiresAt: Timestamp.fromMillis(Date.now() + RECORDING_MEDIA_RESPONSE_COOLDOWN_MS),
      },
      uploadSessionUrl: FieldValue.delete(),
      uploadHeartbeatAt: FieldValue.delete(),
      updatedAt: readyAt,
    })
    transaction.set(pointerRef, {
      bookingId: recording.bookingId,
      recordingId,
      status: 'ready',
      expiresAt,
      updatedAt: readyAt,
    }, { merge: true })
    const consent = roomSnapshot.data()?.recordingConsent as Record<string, unknown> | undefined
    if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recordingId)
      || consent?.recordingId === recordingId) {
      transaction.set(roomRef, {
        recordingNotice: FieldValue.delete(),
        recordingConsent: FieldValue.delete(),
        updatedAt: readyAt,
      }, { merge: true })
    }
    transaction.set(db.collection('adminLogs').doc(), {
      adminId: request.auth?.uid || '',
      action: 'FINALIZE_ONLINE_CLASSROOM_RECORDING',
      targetType: 'online_classroom_recording',
      targetId: recordingId,
      changes: { bookingId: recording.bookingId, sizeBytes, actorRole },
      createdAt: FieldValue.serverTimestamp(),
    })
  })
  return {
    success: true,
    ...recordingPublicMetadata({ ...claim.recording, status: 'ready', sizeBytes, readyAt, expiresAt }),
  }
})

export const abandonOnlineClassroomRecording = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
}, async (request) => {
  const recordingId = request.data?.recordingId
  if (!isSafeClassroomId(recordingId)) throw new HttpsError('invalid-argument', 'Bản ghi không hợp lệ.')
  const recordingRef = db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION).doc(recordingId)
  const snapshot = await recordingRef.get()
  if (!snapshot.exists) return { success: true }
  const recording = snapshot.data() as RecordingDocument
  await requireRecordingManager(request.auth?.uid, recording)
  const pointerRef = db.collection(ONLINE_CLASSROOM_RECORDING_BY_BOOKING_COLLECTION).doc(recording.bookingId)
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(recording.sessionKey)
  const claim = await db.runTransaction(async (transaction) => {
    const [latestSnapshot, pointerSnapshot, roomSnapshot] = await Promise.all([
      transaction.get(recordingRef),
      transaction.get(pointerRef),
      transaction.get(roomRef),
    ])
    const latest = latestSnapshot.data() as RecordingDocument | undefined
    if (!latest || latest.status === 'deleted' || latest.status === 'expired') {
      return { shouldDelete: false, recording: null, mutation: null }
    }
    if (latest.status === 'ready') {
      throw recordingError('Bản ghi đã hoàn tất nên không thể hủy như bản tải dở.', 'RECORDING_ALREADY_READY')
    }
    assertRecordingMediaMutationAvailable(latest)
    const mutation = newRecordingMediaMutation(latest, 'abandon', request.auth?.uid || '')
    transaction.set(recordingRef, {
      status: 'failed',
      failureReason: 'ABANDONED_BY_MANAGER',
      storageDownloadToken: FieldValue.delete(),
      uploadSessionUrl: FieldValue.delete(),
      uploadHeartbeatAt: FieldValue.delete(),
      mediaMutation: mutation,
      mediaMutationFence: mutation.fence,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    if (onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recordingId)) {
      transaction.set(pointerRef, {
        status: 'failed',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    const consent = roomSnapshot.data()?.recordingConsent as Record<string, unknown> | undefined
    if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recordingId)
      || consent?.recordingId === recordingId) {
      transaction.set(roomRef, {
        recordingNotice: FieldValue.delete(),
        recordingConsent: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    return { shouldDelete: true, recording: latest, mutation }
  })
  if (!claim.shouldDelete || !claim.recording || !claim.mutation) return { success: true }
  await cancelResumableUploadSession(claim.recording.uploadSessionUrl)
    .catch((error) => logger.warn('Unable to cancel abandoned upload session', { recordingId, error }))
  const revoked = await revokeRecordingObjectDownloadToken(claim.recording, claim.mutation)
    .catch((): { generation?: string } => ({}))
  await deleteRecordingObject(claim.recording, revoked.generation)
    .catch((error) => logger.warn('Unable to remove abandoned recording object', { recordingId, error }))
  await releaseRecordingMediaMutation(recordingRef, claim.mutation).catch((error) => {
    logger.warn('Unable to release abandoned recording media lease', { recordingId, error })
  })
  return { success: true }
})

export const getOnlineClassroomRecording = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  const recordingId = request.data?.recordingId
  if (!isSafeClassroomId(recordingId)) throw new HttpsError('invalid-argument', 'Bản ghi không hợp lệ.')
  const recordingRef = db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION).doc(recordingId)
  const snapshot = await recordingRef.get()
  if (!snapshot.exists) throw recordingError('Không tìm thấy bản ghi.', 'RECORDING_NOT_FOUND', 'not-found')
  const recording = snapshot.data() as RecordingDocument
  const viewerRole = await requireRecordingViewer(request.auth?.uid, recording, request.data?.token)
  if (recording.status !== 'ready') throw recordingError('Bản ghi chưa sẵn sàng hoặc đã bị xóa.', 'RECORDING_NOT_READY')
  if (isOnlineClassroomRecordingExpired(recording.expiresAt, Date.now())) {
    throw recordingError('Bản ghi đã hết thời hạn 3 ngày và không còn truy cập được.', 'RECORDING_EXPIRED')
  }
  if (recording.mediaMutation && !isOnlineClassroomRecordingMediaMutationSettled(recording)) {
    throw recordingError(
      'Bản ghi đang được cập nhật quyền truy cập. Vui lòng thử lại sau.',
      'RECORDING_MEDIA_MUTATION_IN_PROGRESS',
    )
  }
  if (!recording.storageDownloadToken || !recording.objectPath) {
    throw recordingError('Bản ghi thiếu thông tin phát video.', 'RECORDING_MEDIA_UNAVAILABLE')
  }

  const bucket = getStorage().bucket()
  const mediaUrl = firebasePlaybackUrl(bucket.name, recording.objectPath, recording.storageDownloadToken)
  return {
    ...recordingPublicMetadata(recording),
    viewerRole,
    playbackUrl: mediaUrl,
    downloadUrl: mediaUrl,
  }
})

export const createOnlineClassroomRecordingShareLink = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  const recordingId = request.data?.recordingId
  if (!isSafeClassroomId(recordingId)) throw new HttpsError('invalid-argument', 'Bản ghi không hợp lệ.')
  const recordingRef = db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION).doc(recordingId)
  const snapshot = await recordingRef.get()
  if (!snapshot.exists) throw recordingError('Không tìm thấy bản ghi.', 'RECORDING_NOT_FOUND', 'not-found')
  const recording = snapshot.data() as RecordingDocument
  await requireRecordingManager(request.auth?.uid, recording)
  if (recording.status !== 'ready' || isOnlineClassroomRecordingExpired(recording.expiresAt, Date.now())) {
    throw recordingError('Bản ghi chưa sẵn sàng hoặc đã hết hạn.', 'RECORDING_NOT_READY')
  }
  const shareToken = randomBytes(32).toString('base64url')
  const claim = await db.runTransaction(async (transaction) => {
    const latestSnapshot = await transaction.get(recordingRef)
    const latest = latestSnapshot.data() as RecordingDocument | undefined
    if (!latest || latest.status !== 'ready' || isOnlineClassroomRecordingExpired(latest.expiresAt, Date.now())) {
      throw recordingError('Bản ghi vừa hết hạn hoặc đã bị xóa.', 'RECORDING_NOT_READY')
    }
    assertRecordingMediaMutationAvailable(latest)
    const mutation = newRecordingMediaMutation(latest, 'share', request.auth?.uid || '')
    transaction.set(recordingRef, {
      mediaMutation: mutation,
      mediaMutationFence: mutation.fence,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { recording: latest, mutation }
  })
  await applyRecordingObjectDownloadToken(
    claim.recording,
    claim.mutation.desiredStorageDownloadToken,
    claim.mutation,
  ).catch((error) => {
    if (error instanceof HttpsError) throw error
    throw recordingError('Không thể làm mới quyền truy cập video.', 'RECORDING_MEDIA_UNAVAILABLE')
  })
  await db.runTransaction(async (transaction) => {
    const latestSnapshot = await transaction.get(recordingRef)
    const latest = latestSnapshot.data() as RecordingDocument | undefined
    if (!latest || latest.status !== 'ready' || isOnlineClassroomRecordingExpired(latest.expiresAt, Date.now())) {
      throw recordingError('Bản ghi vừa hết hạn hoặc đã bị xóa.', 'RECORDING_NOT_READY')
    }
    if (!onlineClassroomRecordingMediaMutationMatches(latest, claim.mutation)) {
      throw recordingError('Quyền cập nhật video đã hết hạn hoặc bị thay thế.', 'RECORDING_MEDIA_MUTATION_FENCED')
    }
    transaction.update(recordingRef, {
      shareTokenHash: onlineClassroomRecordingTokenHash(shareToken),
      storageDownloadToken: claim.mutation.desiredStorageDownloadToken,
      mediaMutation: {
        ...claim.mutation,
        phase: 'cooldown',
        expiresAt: Timestamp.fromMillis(Date.now() + RECORDING_MEDIA_RESPONSE_COOLDOWN_MS),
      },
      shareLinkRotatedAt: FieldValue.serverTimestamp(),
      shareLinkRotatedBy: request.auth?.uid || '',
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
  return { replayUrl: onlineClassroomRecordingReplayUrl(CLASSROOM_ORIGIN, recordingId, shareToken) }
})

export const confirmOnlineClassroomRecordingDownloaded = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
}, async (request) => {
  const recordingId = request.data?.recordingId
  if (!isSafeClassroomId(recordingId) || request.data?.confirmed !== true) {
    throw new HttpsError('invalid-argument', 'Cần xác nhận đã tải xong trước khi xóa.')
  }
  const recordingRef = db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION).doc(recordingId)
  const snapshot = await recordingRef.get()
  if (!snapshot.exists) return { success: true, alreadyDeleted: true }
  const recording = snapshot.data() as RecordingDocument
  const viewerRole = await requireRecordingViewer(request.auth?.uid, recording, request.data?.token)
  const pointerRef = db.collection(ONLINE_CLASSROOM_RECORDING_BY_BOOKING_COLLECTION).doc(recording.bookingId)
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(recording.sessionKey)
  const claim = await db.runTransaction(async (transaction) => {
    const [latestSnapshot, pointerSnapshot, roomSnapshot] = await Promise.all([
      transaction.get(recordingRef),
      transaction.get(pointerRef),
      transaction.get(roomRef),
    ])
    const latest = latestSnapshot.data() as RecordingDocument | undefined
    if (!latest || latest.status === 'deleted' || latest.status === 'expired') {
      return { alreadyDeleted: true, recording: null, mutation: null }
    }
    if (viewerRole === 'student') {
      const token = typeof request.data?.token === 'string' ? request.data.token.trim() : ''
      if (!isSafeOnlineClassroomRecordingToken(token)
        || latest.shareTokenHash !== onlineClassroomRecordingTokenHash(token)) {
        throw recordingError('Link xem lại đã được thay đổi và không còn quyền xóa.', 'RECORDING_ACCESS_DENIED', 'permission-denied')
      }
    }
    if (latest.status !== 'ready' && latest.status !== 'deleting') {
      throw recordingError('Bản ghi chưa sẵn sàng để xác nhận tải và xóa.', 'RECORDING_NOT_READY')
    }
    assertRecordingMediaMutationAvailable(latest)
    const mutation = newRecordingMediaMutation(latest, 'delete', request.auth?.uid || `student:${latest.studentId}`)
    transaction.set(recordingRef, {
      status: 'deleting',
      deleteRequestedReason: 'viewer_confirmed_download',
      deleteRequestedAt: FieldValue.serverTimestamp(),
      deleteRequestedByRole: viewerRole,
      deleteRequestedByUid: request.auth?.uid || '',
      storageDownloadToken: FieldValue.delete(),
      mediaMutation: mutation,
      mediaMutationFence: mutation.fence,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    if (onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recordingId)) {
      transaction.set(pointerRef, {
        status: 'deleting',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    const consent = roomSnapshot.data()?.recordingConsent as Record<string, unknown> | undefined
    if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recordingId)
      || consent?.recordingId === recordingId) {
      transaction.set(roomRef, {
        recordingNotice: FieldValue.delete(),
        recordingConsent: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    return { alreadyDeleted: false, recording: latest, mutation }
  })
  if (claim.alreadyDeleted || !claim.recording || !claim.mutation) {
    return { success: true, alreadyDeleted: true }
  }

  const revoked = await revokeRecordingObjectDownloadToken(claim.recording, claim.mutation).catch((error) => {
    logger.warn('Unable to revoke recording media token before delete; object delete will still be attempted', {
      recordingId,
      error: error instanceof Error ? error.message : String(error),
    })
    return {} as { generation?: string }
  })
  await deleteRecordingObject(claim.recording, revoked.generation)
  await db.runTransaction(async (transaction) => {
    const [latestSnapshot, pointerSnapshot, roomSnapshot] = await Promise.all([
      transaction.get(recordingRef),
      transaction.get(pointerRef),
      transaction.get(roomRef),
    ])
    const latest = latestSnapshot.data() as RecordingDocument | undefined
    if (!latest || latest.status === 'deleted' || latest.status === 'expired') return
    if (latest.status !== 'deleting') {
      throw recordingError('Bản ghi đã đổi trạng thái trong lúc xóa.', 'RECORDING_STATE_CHANGED')
    }
    if (!onlineClassroomRecordingMediaMutationMatches(latest, claim.mutation!)) {
      throw recordingError('Quyền xóa video đã hết hạn hoặc bị thay thế.', 'RECORDING_MEDIA_MUTATION_FENCED')
    }
    const now = FieldValue.serverTimestamp()
    transaction.set(recordingRef, {
      status: 'deleted',
      deletedReason: 'viewer_confirmed_download',
      deletedByRole: viewerRole,
      deletedByUid: request.auth?.uid || '',
      deletedAt: now,
      expiresAt: FieldValue.delete(),
      storageDownloadToken: FieldValue.delete(),
      mediaMutation: FieldValue.delete(),
      updatedAt: now,
    }, { merge: true })
    if (onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recordingId)) {
      transaction.set(pointerRef, {
        status: 'deleted',
        expiresAt: FieldValue.delete(),
        updatedAt: now,
      }, { merge: true })
    }
    const consent = roomSnapshot.data()?.recordingConsent as Record<string, unknown> | undefined
    if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recordingId)
      || consent?.recordingId === recordingId) {
      transaction.set(roomRef, {
        recordingNotice: FieldValue.delete(),
        recordingConsent: FieldValue.delete(),
        updatedAt: now,
      }, { merge: true })
    }
  })
  return { success: true, alreadyDeleted: false }
})

export const getOnlineClassroomRecordingsForBookings = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại bằng tài khoản Admin.')
  const user = await readSystemUser(request.auth.uid)
  if (user.role !== 'admin') throw recordingError('Chỉ Admin hệ thống được xem danh sách bản ghi.', 'SYSTEM_ADMIN_REQUIRED', 'permission-denied')
  const rawBookingIds: unknown[] = Array.isArray(request.data?.bookingIds) ? request.data.bookingIds : []
  const bookingIds: string[] = [...new Set(
    rawBookingIds.filter((value: unknown): value is string => isSafeClassroomId(value)),
  )].slice(0, 100)
  if (bookingIds.length === 0) return { recordings: {} }

  const pointerSnapshots = await db.getAll(...bookingIds.map((bookingId) => (
    db.collection(ONLINE_CLASSROOM_RECORDING_BY_BOOKING_COLLECTION).doc(bookingId)
  )))
  const recordingIds: string[] = [...new Set(pointerSnapshots
    .map((snapshot) => snapshot.data()?.recordingId)
    .filter((value: unknown): value is string => isSafeClassroomId(value)))]
  const recordingSnapshots = recordingIds.length > 0
    ? await db.getAll(...recordingIds.map((recordingId) => db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION).doc(recordingId)))
    : []
  const recordingsById = new Map(recordingSnapshots.map((snapshot) => [snapshot.id, snapshot.data() as RecordingDocument]))
  const recordings: Record<string, ReturnType<typeof recordingPublicMetadata> & { viewUrl: string }> = {}
  pointerSnapshots.forEach((pointerSnapshot) => {
    const pointer = pointerSnapshot.data() as RecordingPointer | undefined
    const recording = pointer?.recordingId ? recordingsById.get(pointer.recordingId) : undefined
    if (!recording || recording.status !== 'ready' || isOnlineClassroomRecordingExpired(recording.expiresAt, Date.now())) return
    recordings[pointerSnapshot.id] = {
      ...recordingPublicMetadata(recording),
      viewUrl: `/xem-lai-buoi-hoc/${encodeURIComponent(recording.recordingId)}`,
    }
  })
  return { recordings }
})

export const getOnlineClassroomRecordingForBooking = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  const bookingId = request.data?.bookingId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại.')
  const pointerSnapshot = await db.collection(ONLINE_CLASSROOM_RECORDING_BY_BOOKING_COLLECTION)
    .doc(bookingId)
    .get()
  const recordingId = pointerSnapshot.data()?.recordingId
  if (!isSafeClassroomId(recordingId)) return { recording: null }
  const recordingSnapshot = await db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION)
    .doc(recordingId)
    .get()
  if (!recordingSnapshot.exists) return { recording: null }
  const recording = recordingSnapshot.data() as RecordingDocument
  await requireRecordingManager(request.auth.uid, recording)
  if (recording.status === 'deleted'
    || recording.status === 'expired'
    || recording.status === 'failed'
    || isOnlineClassroomRecordingExpired(recording.expiresAt, Date.now())) {
    return { recording: null }
  }
  return {
    recording: {
      ...recordingPublicMetadata(recording),
      viewUrl: recording.status === 'ready'
        ? `/xem-lai-buoi-hoc/${encodeURIComponent(recording.recordingId)}`
        : '',
    },
  }
})

export const cleanupOnlineClassroomRecordings = onSchedule({
  region: 'asia-southeast1',
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Ho_Chi_Minh',
  timeoutSeconds: 540,
  memory: '512MiB',
}, async () => {
  const now = Timestamp.now()
  const [expiredSnapshot, deletingSnapshot] = await Promise.all([
    db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION)
      .where('expiresAt', '<=', now)
      .limit(RECORDING_CLEANUP_LIMIT)
      .get(),
    db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION)
      .where('status', '==', 'deleting')
      .limit(RECORDING_CLEANUP_LIMIT)
      .get(),
  ])
  const candidates = new Map([
    ...expiredSnapshot.docs,
    ...deletingSnapshot.docs,
  ].map((snapshot) => [snapshot.id, snapshot]))
  let expiredCount = 0
  let deletedRetryCount = 0
  for (const recordingSnapshot of candidates.values()) {
    const recording = recordingSnapshot.data() as RecordingDocument
    try {
      const pointerRef = db.collection(ONLINE_CLASSROOM_RECORDING_BY_BOOKING_COLLECTION).doc(recording.bookingId)
      const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(recording.sessionKey)
      const claim = await db.runTransaction(async (transaction) => {
        const [latestSnapshot, pointerSnapshot, roomSnapshot] = await Promise.all([
          transaction.get(recordingSnapshot.ref),
          transaction.get(pointerRef),
          transaction.get(roomRef),
        ])
        const latest = latestSnapshot.data() as RecordingDocument | undefined
        if (!latest) return { shouldDelete: false, recording: null, mutation: null, deleteRequestedReason: '' }
        const latestExpiresAt = asTimestamp(latest.expiresAt)
        const retryDeleting = latest.status === 'deleting'
        if (!retryDeleting && (!latestExpiresAt || latestExpiresAt.toMillis() > now.toMillis())) {
          return { shouldDelete: false, recording: null, mutation: null, deleteRequestedReason: '' }
        }

        const timestamp = FieldValue.serverTimestamp()
        if (latest.status === 'deleted' || latest.status === 'expired') {
          transaction.set(recordingSnapshot.ref, {
            expiresAt: FieldValue.delete(),
            storageDownloadToken: FieldValue.delete(),
            uploadSessionUrl: FieldValue.delete(),
            uploadHeartbeatAt: FieldValue.delete(),
            mediaMutation: FieldValue.delete(),
            updatedAt: timestamp,
          }, { merge: true })
          if (onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recording.recordingId)) {
            transaction.set(pointerRef, {
              status: latest.status,
              expiresAt: FieldValue.delete(),
              updatedAt: timestamp,
            }, { merge: true })
          }
          if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recording.recordingId)) {
            transaction.set(roomRef, {
              recordingNotice: FieldValue.delete(),
              updatedAt: timestamp,
            }, { merge: true })
          }
          return { shouldDelete: false, recording: null, mutation: null, deleteRequestedReason: '' }
        }

        if (!canAcquireOnlineClassroomRecordingMediaMutation(latest, Date.now())) {
          return { shouldDelete: false, recording: null, mutation: null, deleteRequestedReason: '' }
        }
        const mutation = newRecordingMediaMutation(latest, 'delete', 'system:cleanup')
        transaction.set(recordingSnapshot.ref, {
          ...(retryDeleting ? {} : {
            status: 'deleting',
            deleteRequestedReason: 'expired',
            deleteRequestedAt: timestamp,
          }),
          storageDownloadToken: FieldValue.delete(),
          mediaMutation: mutation,
          mediaMutationFence: mutation.fence,
          updatedAt: timestamp,
        }, { merge: true })
        if (onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recording.recordingId)) {
          transaction.set(pointerRef, {
            status: 'deleting',
            updatedAt: timestamp,
          }, { merge: true })
        }
        if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recording.recordingId)) {
          transaction.set(roomRef, {
            recordingNotice: FieldValue.delete(),
            updatedAt: timestamp,
          }, { merge: true })
        }
        return {
          shouldDelete: true,
          recording: latest,
          mutation,
          deleteRequestedReason: retryDeleting ? latest.deleteRequestedReason : 'expired',
        }
      })
      if (!claim.shouldDelete || !claim.recording || !claim.mutation) continue

      await cancelResumableUploadSession(claim.recording.uploadSessionUrl).catch((error) => {
        logger.warn('Unable to cancel stale recording upload session', { recordingId: recording.recordingId, error })
      })
      const revoked = await revokeRecordingObjectDownloadToken(claim.recording, claim.mutation)
        .catch((): { generation?: string } => ({}))
      await deleteRecordingObject(claim.recording, revoked.generation)
      const finalizedAsExpired = await db.runTransaction(async (transaction) => {
        const [latestSnapshot, pointerSnapshot, roomSnapshot] = await Promise.all([
          transaction.get(recordingSnapshot.ref),
          transaction.get(pointerRef),
          transaction.get(roomRef),
        ])
        const latest = latestSnapshot.data() as RecordingDocument | undefined
        if (!latest) return false
        const timestamp = FieldValue.serverTimestamp()
        if (latest.status !== 'deleting') return false
        if (!onlineClassroomRecordingMediaMutationMatches(latest, claim.mutation!)) return false
        const terminalStatus = latest.deleteRequestedReason === 'expired'
          || isOnlineClassroomRecordingExpired(latest.expiresAt, now.toMillis())
          ? 'expired'
          : 'deleted'
        transaction.set(recordingSnapshot.ref, {
          status: terminalStatus,
          ...(terminalStatus === 'expired' ? { expiredAt: timestamp } : {}),
          expiresAt: FieldValue.delete(),
          storageDownloadToken: FieldValue.delete(),
          uploadSessionUrl: FieldValue.delete(),
          uploadHeartbeatAt: FieldValue.delete(),
          mediaMutation: FieldValue.delete(),
          updatedAt: timestamp,
        }, { merge: true })
        if (onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recording.recordingId)) {
          transaction.set(pointerRef, {
            status: terminalStatus,
            expiresAt: FieldValue.delete(),
            updatedAt: timestamp,
          }, { merge: true })
        }
        if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recording.recordingId)) {
          transaction.set(roomRef, {
            recordingNotice: FieldValue.delete(),
            recordingConsent: FieldValue.delete(),
            updatedAt: timestamp,
          }, { merge: true })
        }
        return terminalStatus === 'expired'
      })
      if (finalizedAsExpired) expiredCount += 1
      else if (claim.deleteRequestedReason !== 'expired') deletedRetryCount += 1
    } catch (error) {
      logger.error('Unable to expire classroom recording', { recordingId: recording.recordingId, error })
    }
  }
  logger.info('Classroom recording cleanup completed', {
    candidates: candidates.size,
    expiredCount,
    deletedRetryCount,
    retentionHours: ONLINE_CLASSROOM_RECORDING_RETENTION_MS / (60 * 60 * 1000),
  })
})
