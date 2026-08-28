import { randomBytes, randomUUID } from 'node:crypto'
import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore'
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
  ONLINE_CLASSROOM_RECORDING_RETENTION_MS,
  ONLINE_CLASSROOM_RECORDINGS_COLLECTION,
  canTransitionOnlineClassroomRecordingStatus,
  isOnlineClassroomRecordingExpired,
  isSafeOnlineClassroomRecordingToken,
  onlineClassroomRecordingExpiresAt,
  onlineClassroomRecordingNoticeMatches,
  onlineClassroomRecordingObjectPath,
  onlineClassroomRecordingPointerMatches,
  onlineClassroomRecordingReplayUrl,
  onlineClassroomRecordingTokenHash,
  type OnlineClassroomRecordingStatus,
} from './onlineClassroomRecording'

const db = new Firestore()
const CLASSROOM_ORIGIN = 'https://www.123english.edu.vn'
const RECORDING_CLEANUP_LIMIT = 50
const RECORDING_UPLOAD_STALE_MS = 4 * 60 * 60 * 1000
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
}

function recordingError(message: string, reason: string, code: 'failed-precondition' | 'permission-denied' | 'not-found' = 'failed-precondition') {
  return new HttpsError(code, message, { reason })
}

function asTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null
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
  const [bookingSnapshot, user] = await Promise.all([
    db.collection('bookingRequests').doc(bookingId).get(),
    readSystemUser(uid),
  ])
  if (!bookingSnapshot.exists) throw recordingError('Không tìm thấy buổi học.', 'BOOKING_NOT_FOUND', 'not-found')
  const booking = { id: bookingSnapshot.id, ...bookingSnapshot.data() } as Booking
  const blockReason = onlineClassroomBookingBlockReason(booking)
  if (blockReason) throw recordingError('Buổi học không còn đủ điều kiện ghi hình.', blockReason)
  if (!isInsideOnlineClassroomJoinWindow(booking, Date.now())) {
    throw recordingError('Chỉ được ghi trong thời gian phòng học đang mở.', 'OUTSIDE_JOIN_WINDOW')
  }

  const actorRole = user.role === 'admin'
    ? 'admin'
    : user.role === 'teacher' && user.teacherId === booking.teacherId
      ? 'teacher'
      : null
  if (!actorRole) throw recordingError('Bạn không có quyền ghi buổi học này.', 'RECORDING_MANAGER_REQUIRED', 'permission-denied')

  const [studentAccess, teacherAccess, studentSnapshot, teacherSnapshot] = await Promise.all([
    db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION).doc(onlineClassroomAccessId('student', booking.studentId!)).get(),
    db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION).doc(onlineClassroomAccessId('teacher', booking.teacherId!)).get(),
    db.collection('students').doc(booking.studentId!).get(),
    db.collection('teachers').doc(booking.teacherId!).get(),
  ])
  if (studentAccess.data()?.enabled !== true || teacherAccess.data()?.enabled !== true) {
    throw recordingError('Admin chưa cấp đủ quyền pilot cho gia sư và học viên.', 'PILOT_NOT_ENABLED')
  }
  if (studentSnapshot.data()?.status !== 'active' || teacherSnapshot.data()?.status !== 'active') {
    throw recordingError('Gia sư hoặc học viên không còn hoạt động.', 'PARTICIPANT_NOT_ACTIVE')
  }

  return {
    actorUid: uid,
    actorRole,
    booking,
    sessionKey: onlineClassroomSessionKey(
      booking,
      onlineClassroomAccessGeneration(studentAccess.data()?.generation),
      onlineClassroomAccessGeneration(teacherAccess.data()?.generation),
    ),
  }
}

async function requireRecordingManager(uid: string | undefined, recording: RecordingDocument): Promise<'admin' | 'teacher'> {
  if (!uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại.')
  const user = await readSystemUser(uid)
  if (user.role === 'admin') return 'admin'
  if (user.role === 'teacher' && user.teacherId === recording.teacherId) return 'teacher'
  throw recordingError('Bạn không có quyền quản lý bản ghi này.', 'RECORDING_MANAGER_REQUIRED', 'permission-denied')
}

async function requireRecordingViewer(
  uid: string | undefined,
  recording: RecordingDocument,
  rawToken: unknown,
): Promise<'admin' | 'teacher' | 'student'> {
  if (uid) {
    const user = await readSystemUser(uid)
    if (user.role === 'admin') return 'admin'
    if (user.role === 'teacher' && user.teacherId === recording.teacherId) return 'teacher'
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

async function deleteRecordingObject(recording: Partial<RecordingDocument>): Promise<void> {
  if (!recording.objectPath) return
  await getStorage().bucket().file(recording.objectPath).delete({ ignoreNotFound: true })
}

export const startOnlineClassroomRecording = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '512MiB',
}, async (request) => {
  const bookingId = request.data?.bookingId
  if (!isSafeClassroomId(bookingId)) throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  const context = await loadRecordingManagerContext(request.auth?.uid, bookingId)
  const mimeType = sanitizeMimeType(request.data?.mimeType)
  const now = Date.now()
  const recordingId = randomBytes(18).toString('hex')
  const uploadNonce = randomBytes(12).toString('hex')
  const shareToken = randomBytes(32).toString('base64url')
  const storageDownloadToken = randomUUID()
  const objectPath = onlineClassroomRecordingObjectPath(recordingId, uploadNonce)
  const recordingRef = db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION).doc(recordingId)
  const pointerRef = db.collection(ONLINE_CLASSROOM_RECORDING_BY_BOOKING_COLLECTION).doc(bookingId)
  let staleObjectPath = ''

  await db.runTransaction(async (transaction) => {
    const pointerSnapshot = await transaction.get(pointerRef)
    const pointer = pointerSnapshot.data() as RecordingPointer | undefined
    if (pointer?.recordingId) {
      const existingSnapshot = await transaction.get(db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION).doc(pointer.recordingId))
      const existing = existingSnapshot.data() as RecordingDocument | undefined
      const existingCreatedAt = asTimestamp(existing?.createdAt)?.toMillis() || 0
      const activeUpload = existing?.status === 'preparing' || existing?.status === 'uploading'
      const uploadIsFresh = activeUpload && now - existingCreatedAt < RECORDING_UPLOAD_STALE_MS
      const readyAndAvailable = existing?.status === 'ready' && !isOnlineClassroomRecordingExpired(existing.expiresAt, now)
      if (uploadIsFresh) throw recordingError('Buổi học đang có một bản ghi được tải lên.', 'RECORDING_UPLOAD_IN_PROGRESS')
      if (readyAndAvailable) throw recordingError('Buổi học đã có bản ghi còn hiệu lực.', 'RECORDING_ALREADY_READY')
      staleObjectPath = existing?.objectPath || ''
      if (existingSnapshot.exists && activeUpload) {
        transaction.set(existingSnapshot.ref, {
          status: 'failed',
          failureReason: 'SUPERSEDED_BY_NEW_RECORDING',
          storageDownloadToken: FieldValue.delete(),
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
      mimeType,
      fileName: safeFileName(context.booking),
      storageDownloadToken,
      shareTokenHash: onlineClassroomRecordingTokenHash(shareToken),
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
  })

  if (staleObjectPath) {
    await getStorage().bucket().file(staleObjectPath).delete({ ignoreNotFound: true }).catch((error) => {
      logger.warn('Unable to remove stale classroom recording object', { bookingId, staleObjectPath, error })
    })
  }

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
          firebaseStorageDownloadTokens: storageDownloadToken,
          recordingId,
          bookingId,
        },
      },
    })
    await Promise.all([
      recordingRef.update({ status: 'uploading', updatedAt: FieldValue.serverTimestamp() }),
      pointerRef.update({ status: 'uploading', updatedAt: FieldValue.serverTimestamp() }),
      db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(context.sessionKey).set({
        recordingNotice: {
          active: true,
          recordingId,
          startedByRole: context.actorRole,
          startedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ])
    return {
      recordingId,
      uploadSessionUrl,
      replayUrl: onlineClassroomRecordingReplayUrl(CLASSROOM_ORIGIN, recordingId, shareToken),
      shareToken,
      expiresAt: new Date(onlineClassroomRecordingExpiresAt(now)).toISOString(),
      maxBytes: ONLINE_CLASSROOM_RECORDING_MAX_BYTES,
    }
  } catch (error) {
    await Promise.allSettled([
      recordingRef.update({ status: 'failed', failureReason: 'UPLOAD_SESSION_FAILED', updatedAt: FieldValue.serverTimestamp() }),
      pointerRef.update({ status: 'failed', updatedAt: FieldValue.serverTimestamp() }),
      db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(context.sessionKey).set({
        recordingNotice: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ])
    logger.error('Unable to create classroom recording upload session', { bookingId, recordingId, error })
    throw new HttpsError('internal', 'Chưa tạo được vùng lưu bản ghi. Vui lòng thử lại.')
  }
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

  const file = getStorage().bucket().file(recording.objectPath)
  const [metadata] = await file.getMetadata().catch(() => {
    throw recordingError('Video chưa tải lên hoàn chỉnh. Vui lòng chờ rồi thử lại.', 'RECORDING_OBJECT_INCOMPLETE')
  })
  const sizeBytes = Number(metadata.size)
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > ONLINE_CLASSROOM_RECORDING_MAX_BYTES) {
    await file.delete({ ignoreNotFound: true }).catch(() => undefined)
    await recordingRef.update({
      status: 'failed',
      failureReason: sizeBytes > ONLINE_CLASSROOM_RECORDING_MAX_BYTES ? 'FILE_TOO_LARGE' : 'EMPTY_FILE',
      updatedAt: FieldValue.serverTimestamp(),
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
  await db.runTransaction(async (transaction) => {
    const pointerRef = db.collection(ONLINE_CLASSROOM_RECORDING_BY_BOOKING_COLLECTION).doc(recording.bookingId)
    const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(recording.sessionKey)
    const [latestSnapshot, pointerSnapshot, roomSnapshot] = await Promise.all([
      transaction.get(recordingRef),
      transaction.get(pointerRef),
      transaction.get(roomRef),
    ])
    const latest = latestSnapshot.data() as RecordingDocument | undefined
    if (!latest) throw recordingError('Không tìm thấy bản ghi.', 'RECORDING_NOT_FOUND', 'not-found')
    if (latest.status === 'ready') return
    if (!onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recordingId)) {
      throw recordingError(
        'Bản ghi này đã được thay bằng một phiên ghi mới hơn.',
        'RECORDING_SUPERSEDED',
      )
    }
    if (!canTransitionOnlineClassroomRecordingStatus(latest.status, 'ready')) {
      throw recordingError('Bản ghi đã đổi trạng thái và không thể hoàn tất.', 'RECORDING_STATE_CHANGED')
    }
    transaction.update(recordingRef, {
      status: 'ready',
      sizeBytes,
      readyAt,
      expiresAt,
      updatedAt: readyAt,
    })
    transaction.set(pointerRef, {
      bookingId: recording.bookingId,
      recordingId,
      status: 'ready',
      expiresAt,
      updatedAt: readyAt,
    }, { merge: true })
    if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recordingId)) {
      transaction.set(roomRef, {
        recordingNotice: FieldValue.delete(),
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
    ...recordingPublicMetadata({ ...recording, status: 'ready', sizeBytes, readyAt, expiresAt }),
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
  await db.runTransaction(async (transaction) => {
    const [latestSnapshot, pointerSnapshot, roomSnapshot] = await Promise.all([
      transaction.get(recordingRef),
      transaction.get(pointerRef),
      transaction.get(roomRef),
    ])
    const latest = latestSnapshot.data() as RecordingDocument | undefined
    if (!latest || latest.status === 'deleted' || latest.status === 'expired') return
    if (latest.status === 'ready') {
      throw recordingError('Bản ghi đã hoàn tất nên không thể hủy như bản tải dở.', 'RECORDING_ALREADY_READY')
    }
    transaction.set(recordingRef, {
      status: 'failed',
      failureReason: 'ABANDONED_BY_MANAGER',
      storageDownloadToken: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    if (onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recordingId)) {
      transaction.set(pointerRef, {
        status: 'failed',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recordingId)) {
      transaction.set(roomRef, {
        recordingNotice: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
  })
  await deleteRecordingObject(recording).catch((error) => logger.warn('Unable to remove abandoned recording object', { recordingId, error }))
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
  await recordingRef.update({
    shareTokenHash: onlineClassroomRecordingTokenHash(shareToken),
    shareLinkRotatedAt: FieldValue.serverTimestamp(),
    shareLinkRotatedBy: request.auth?.uid || '',
    updatedAt: FieldValue.serverTimestamp(),
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
    if (!latest || latest.status === 'deleted' || latest.status === 'expired') return { alreadyDeleted: true }
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
    transaction.set(recordingRef, {
      status: 'deleting',
      deleteRequestedAt: FieldValue.serverTimestamp(),
      deleteRequestedByRole: viewerRole,
      deleteRequestedByUid: request.auth?.uid || '',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    if (onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recordingId)) {
      transaction.set(pointerRef, {
        status: 'deleting',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recordingId)) {
      transaction.set(roomRef, {
        recordingNotice: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    return { alreadyDeleted: false }
  })
  if (claim.alreadyDeleted) return { success: true, alreadyDeleted: true }

  await deleteRecordingObject(recording)
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
    const now = FieldValue.serverTimestamp()
    transaction.set(recordingRef, {
      status: 'deleted',
      deletedReason: 'viewer_confirmed_download',
      deletedByRole: viewerRole,
      deletedByUid: request.auth?.uid || '',
      deletedAt: now,
      expiresAt: FieldValue.delete(),
      storageDownloadToken: FieldValue.delete(),
      updatedAt: now,
    }, { merge: true })
    if (onlineClassroomRecordingPointerMatches(pointerSnapshot.data(), recordingId)) {
      transaction.set(pointerRef, {
        status: 'deleted',
        expiresAt: FieldValue.delete(),
        updatedAt: now,
      }, { merge: true })
    }
    if (onlineClassroomRecordingNoticeMatches(roomSnapshot.data(), recordingId)) {
      transaction.set(roomRef, {
        recordingNotice: FieldValue.delete(),
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

export const cleanupOnlineClassroomRecordings = onSchedule({
  region: 'asia-southeast1',
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Ho_Chi_Minh',
  timeoutSeconds: 540,
  memory: '512MiB',
}, async () => {
  const now = Timestamp.now()
  const snapshot = await db.collection(ONLINE_CLASSROOM_RECORDINGS_COLLECTION)
    .where('expiresAt', '<=', now)
    .limit(RECORDING_CLEANUP_LIMIT)
    .get()
  let expiredCount = 0
  for (const recordingSnapshot of snapshot.docs) {
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
        if (!latest) return { shouldDelete: false, objectPath: '' }
        const latestExpiresAt = asTimestamp(latest.expiresAt)
        if (!latestExpiresAt || latestExpiresAt.toMillis() > now.toMillis()) {
          return { shouldDelete: false, objectPath: '' }
        }

        const timestamp = FieldValue.serverTimestamp()
        if (latest.status === 'deleted' || latest.status === 'expired') {
          transaction.set(recordingSnapshot.ref, {
            expiresAt: FieldValue.delete(),
            storageDownloadToken: FieldValue.delete(),
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
          return { shouldDelete: false, objectPath: '' }
        }

        transaction.set(recordingSnapshot.ref, {
          status: 'deleting',
          deleteRequestedReason: 'expired',
          deleteRequestedAt: timestamp,
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
        return { shouldDelete: true, objectPath: latest.objectPath }
      })
      if (!claim.shouldDelete) continue

      await deleteRecordingObject({ objectPath: claim.objectPath })
      const finalizedAsExpired = await db.runTransaction(async (transaction) => {
        const [latestSnapshot, pointerSnapshot, roomSnapshot] = await Promise.all([
          transaction.get(recordingSnapshot.ref),
          transaction.get(pointerRef),
          transaction.get(roomRef),
        ])
        const latest = latestSnapshot.data() as RecordingDocument | undefined
        if (!latest) return false
        const timestamp = FieldValue.serverTimestamp()
        const terminalStatus = latest.status === 'deleted' ? 'deleted' : 'expired'
        transaction.set(recordingSnapshot.ref, {
          status: terminalStatus,
          ...(terminalStatus === 'expired' ? { expiredAt: timestamp } : {}),
          expiresAt: FieldValue.delete(),
          storageDownloadToken: FieldValue.delete(),
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
            updatedAt: timestamp,
          }, { merge: true })
        }
        return terminalStatus === 'expired'
      })
      if (finalizedAsExpired) expiredCount += 1
    } catch (error) {
      logger.error('Unable to expire classroom recording', { recordingId: recording.recordingId, error })
    }
  }
  logger.info('Classroom recording cleanup completed', {
    candidates: snapshot.size,
    expiredCount,
    retentionHours: ONLINE_CLASSROOM_RECORDING_RETENTION_MS / (60 * 60 * 1000),
  })
})
