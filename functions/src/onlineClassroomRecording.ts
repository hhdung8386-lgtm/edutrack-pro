import { createHash } from 'node:crypto'

export const ONLINE_CLASSROOM_RECORDINGS_COLLECTION = 'onlineClassroomRecordings'
export const ONLINE_CLASSROOM_RECORDING_BY_BOOKING_COLLECTION = 'onlineClassroomRecordingByBooking'
export const ONLINE_CLASSROOM_RECORDING_TOKENS_COLLECTION = 'onlineClassroomRecordingTokens'
export const ONLINE_CLASSROOM_RECORDING_OBJECT_PREFIX = 'private-class-recordings'

export const ONLINE_CLASSROOM_RECORDING_RETENTION_HOURS = 72
export const ONLINE_CLASSROOM_RECORDING_RETENTION_MS = ONLINE_CLASSROOM_RECORDING_RETENTION_HOURS * 60 * 60 * 1000
export const ONLINE_CLASSROOM_RECORDING_MAX_BYTES = 1_342_177_280 // 1.25 GiB
export const ONLINE_CLASSROOM_RECORDING_TOKEN_BYTES = 32

export const ONLINE_CLASSROOM_RECORDING_STATUSES = [
  'preparing',
  'uploading',
  'ready',
  'failed',
  'deleting',
  'deleted',
  'expired',
] as const

export type OnlineClassroomRecordingStatus = typeof ONLINE_CLASSROOM_RECORDING_STATUSES[number]
export type OnlineClassroomRecordingDeleteReason =
  | 'expired'
  | 'download_confirmed'
  | 'admin_deleted'
  | 'upload_abandoned'

export type OnlineClassroomRecordingTimeLike = number | Date | { toMillis: () => number }

const SAFE_RESOURCE_ID = /^[A-Za-z0-9_-]{16,160}$/
const SAFE_BEARER_TOKEN = /^[A-Za-z0-9_-]{32,256}$/

const STATUS_TRANSITIONS: Readonly<Record<OnlineClassroomRecordingStatus, ReadonlySet<OnlineClassroomRecordingStatus>>> = {
  preparing: new Set(['preparing', 'uploading', 'failed', 'deleting', 'expired']),
  uploading: new Set(['uploading', 'ready', 'failed', 'deleting', 'expired']),
  ready: new Set(['ready', 'deleting', 'expired']),
  failed: new Set(['failed', 'deleting', 'expired']),
  deleting: new Set(['deleting', 'deleted', 'expired']),
  deleted: new Set(['deleted']),
  expired: new Set(['expired']),
}

function timeToMillis(value: OnlineClassroomRecordingTimeLike): number {
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  return value.toMillis()
}

function assertFiniteMillis(value: OnlineClassroomRecordingTimeLike, label: string): number {
  const millis = timeToMillis(value)
  if (!Number.isSafeInteger(millis) || millis < 0) throw new RangeError(`${label} không phải timestamp hợp lệ.`)
  return millis
}

export function isSafeOnlineClassroomRecordingId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_RESOURCE_ID.test(value)
}

export function isSafeOnlineClassroomRecordingToken(value: unknown): value is string {
  return typeof value === 'string' && SAFE_BEARER_TOKEN.test(value)
}

export function onlineClassroomRecordingPointerMatches(value: unknown, recordingId: string): boolean {
  if (!isSafeOnlineClassroomRecordingId(recordingId)) return false
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return (value as Record<string, unknown>).recordingId === recordingId
}

export function onlineClassroomRecordingNoticeMatches(value: unknown, recordingId: string): boolean {
  if (!isSafeOnlineClassroomRecordingId(recordingId)) return false
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const notice = (value as Record<string, unknown>).recordingNotice
  return typeof notice === 'object'
    && notice !== null
    && !Array.isArray(notice)
    && (notice as Record<string, unknown>).recordingId === recordingId
}

export function isOnlineClassroomRecordingStatus(value: unknown): value is OnlineClassroomRecordingStatus {
  return typeof value === 'string'
    && (ONLINE_CLASSROOM_RECORDING_STATUSES as readonly string[]).includes(value)
}

/** Same-state transitions are allowed so callable retries remain idempotent. */
export function canTransitionOnlineClassroomRecordingStatus(
  current: unknown,
  next: unknown,
): current is OnlineClassroomRecordingStatus {
  return isOnlineClassroomRecordingStatus(current)
    && isOnlineClassroomRecordingStatus(next)
    && STATUS_TRANSITIONS[current].has(next)
}

export function onlineClassroomRecordingExpiresAt(
  readyAt: OnlineClassroomRecordingTimeLike,
): number {
  const readyAtMs = assertFiniteMillis(readyAt, 'Thời điểm sẵn sàng')
  const expiresAtMs = readyAtMs + ONLINE_CLASSROOM_RECORDING_RETENTION_MS
  if (!Number.isSafeInteger(expiresAtMs)) throw new RangeError('Thời điểm hết hạn vượt giới hạn an toàn.')
  return expiresAtMs
}

export function isOnlineClassroomRecordingExpired(
  expiresAt: OnlineClassroomRecordingTimeLike | null | undefined,
  now: OnlineClassroomRecordingTimeLike = Date.now(),
): boolean {
  // Legacy/incomplete documents must fail closed: without a trusted expiry
  // timestamp, playback is denied instead of becoming permanent.
  if (expiresAt == null) return true
  return assertFiniteMillis(now, 'Thời điểm hiện tại') >= assertFiniteMillis(expiresAt, 'Thời điểm hết hạn')
}

export function onlineClassroomRecordingObjectPath(recordingId: string, uploadNonce: string): string {
  if (!isSafeOnlineClassroomRecordingId(recordingId)) throw new RangeError('Recording ID không hợp lệ.')
  if (!isSafeOnlineClassroomRecordingId(uploadNonce)) throw new RangeError('Upload nonce không hợp lệ.')
  return `${ONLINE_CLASSROOM_RECORDING_OBJECT_PREFIX}/${recordingId}/${uploadNonce}.webm`
}

export function onlineClassroomRecordingTokenHash(token: string): string {
  if (!isSafeOnlineClassroomRecordingToken(token)) throw new RangeError('Token xem lại bản ghi không hợp lệ.')
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Builds the app route placed in email. The bearer token is kept in the URL
 * fragment so it is not sent in the initial HTTP request, proxy logs or
 * Referer header. The page must immediately move it into sessionStorage and
 * remove the fragment from the address bar.
 */
export function onlineClassroomRecordingReplayUrl(
  origin: string,
  recordingId: string,
  token: string,
): string {
  if (!isSafeOnlineClassroomRecordingId(recordingId)) throw new RangeError('Recording ID không hợp lệ.')
  if (!isSafeOnlineClassroomRecordingToken(token)) throw new RangeError('Token xem lại bản ghi không hợp lệ.')

  let parsedOrigin: URL
  try {
    parsedOrigin = new URL(origin)
  } catch (cause) {
    throw new RangeError('Origin xem lại bản ghi không hợp lệ.', { cause })
  }
  if (!['https:', 'http:'].includes(parsedOrigin.protocol)
    || parsedOrigin.username
    || parsedOrigin.password
    || parsedOrigin.origin === 'null') {
    throw new RangeError('Origin xem lại bản ghi không hợp lệ.')
  }
  return `${parsedOrigin.origin}/xem-lai-buoi-hoc/${encodeURIComponent(recordingId)}#token=${encodeURIComponent(token)}`
}

/**
 * No-IAM fallback for playback after the callable has authorized the caller.
 * This is a bearer URL: it remains usable until the object token is rotated or
 * the live object is deleted, so it must never be stored in public Firestore
 * documents, analytics or logs.
 */
export function onlineClassroomRecordingDownloadUrl(
  bucketName: string,
  objectPath: string,
  downloadToken: string,
): string {
  const safeBucketName = bucketName.trim()
  if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/i.test(safeBucketName)) {
    throw new RangeError('Tên Storage bucket không hợp lệ.')
  }
  if (!objectPath.startsWith(`${ONLINE_CLASSROOM_RECORDING_OBJECT_PREFIX}/`)
    || objectPath.includes('..')
    || objectPath.includes('\\')
    || objectPath.length > 1024) {
    throw new RangeError('Object path bản ghi không hợp lệ.')
  }
  if (!isSafeOnlineClassroomRecordingToken(downloadToken)) {
    throw new RangeError('Storage download token không hợp lệ.')
  }
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(safeBucketName)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(downloadToken)}`
}
