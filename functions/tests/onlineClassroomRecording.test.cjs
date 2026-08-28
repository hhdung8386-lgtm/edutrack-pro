const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ONLINE_CLASSROOM_RECORDING_MAX_BYTES,
  ONLINE_CLASSROOM_RECORDING_RETENTION_HOURS,
  ONLINE_CLASSROOM_RECORDING_RETENTION_MS,
  canTransitionOnlineClassroomRecordingStatus,
  isOnlineClassroomRecordingExpired,
  isOnlineClassroomRecordingStatus,
  onlineClassroomRecordingDownloadUrl,
  onlineClassroomRecordingExpiresAt,
  onlineClassroomRecordingNoticeMatches,
  onlineClassroomRecordingObjectPath,
  onlineClassroomRecordingPointerMatches,
  onlineClassroomRecordingReplayUrl,
  onlineClassroomRecordingTokenHash,
} = require('../lib/onlineClassroomRecording.js')

const recordingId = '0123456789abcdef0123456789abcdef0123'
const uploadNonce = 'abcdef0123456789abcdef01'
const bearerToken = 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789'

test('retention bản ghi là đúng 72 giờ và timestamp thiếu phải fail-closed', () => {
  const readyAt = Date.parse('2026-08-28T08:00:00.000Z')
  const expiresAt = onlineClassroomRecordingExpiresAt(readyAt)
  assert.equal(ONLINE_CLASSROOM_RECORDING_RETENTION_HOURS, 72)
  assert.equal(ONLINE_CLASSROOM_RECORDING_RETENTION_MS, 72 * 60 * 60 * 1000)
  assert.equal(expiresAt, Date.parse('2026-08-31T08:00:00.000Z'))
  assert.equal(isOnlineClassroomRecordingExpired(expiresAt, expiresAt - 1), false)
  assert.equal(isOnlineClassroomRecordingExpired(expiresAt, expiresAt), true)
  assert.equal(isOnlineClassroomRecordingExpired(undefined, readyAt), true)
  assert.equal(ONLINE_CLASSROOM_RECORDING_MAX_BYTES, 1_342_177_280)
})

test('state machine cho phép retry idempotent nhưng không hồi sinh bản ghi đã xóa/hết hạn', () => {
  assert.equal(isOnlineClassroomRecordingStatus('preparing'), true)
  assert.equal(isOnlineClassroomRecordingStatus('expired'), true)
  assert.equal(isOnlineClassroomRecordingStatus('unknown'), false)
  assert.equal(canTransitionOnlineClassroomRecordingStatus('preparing', 'uploading'), true)
  assert.equal(canTransitionOnlineClassroomRecordingStatus('uploading', 'ready'), true)
  assert.equal(canTransitionOnlineClassroomRecordingStatus('ready', 'ready'), true)
  assert.equal(canTransitionOnlineClassroomRecordingStatus('ready', 'deleting'), true)
  assert.equal(canTransitionOnlineClassroomRecordingStatus('deleting', 'deleted'), true)
  assert.equal(canTransitionOnlineClassroomRecordingStatus('deleted', 'ready'), false)
  assert.equal(canTransitionOnlineClassroomRecordingStatus('expired', 'ready'), false)
})

test('pointer và thông báo chỉ được cập nhật khi còn trỏ đúng bản ghi', () => {
  const newerRecordingId = 'abcdef0123456789abcdef0123456789abcd'
  assert.equal(onlineClassroomRecordingPointerMatches({ recordingId }, recordingId), true)
  assert.equal(onlineClassroomRecordingPointerMatches({ recordingId: newerRecordingId }, recordingId), false)
  assert.equal(onlineClassroomRecordingNoticeMatches({
    recordingNotice: { active: true, recordingId },
  }, recordingId), true)
  assert.equal(onlineClassroomRecordingNoticeMatches({
    recordingNotice: { active: true, recordingId: newerRecordingId },
  }, recordingId), false)
  assert.equal(onlineClassroomRecordingNoticeMatches({ recordingNotice: null }, recordingId), false)
})

test('object path chỉ dùng ID/nonce an toàn và luôn nằm trong prefix private', () => {
  assert.equal(
    onlineClassroomRecordingObjectPath(recordingId, uploadNonce),
    `private-class-recordings/${recordingId}/${uploadNonce}.webm`,
  )
  assert.throws(() => onlineClassroomRecordingObjectPath('../booking-public', uploadNonce), /không hợp lệ/)
  assert.throws(() => onlineClassroomRecordingObjectPath(recordingId, 'short'), /không hợp lệ/)
})

test('token chỉ lưu hash và magic link giữ token trong fragment', () => {
  assert.equal(onlineClassroomRecordingTokenHash(bearerToken).length, 64)
  assert.notEqual(onlineClassroomRecordingTokenHash(bearerToken), bearerToken)

  const replayUrl = onlineClassroomRecordingReplayUrl(
    'https://www.123english.edu.vn/noise?ignored=1',
    recordingId,
    bearerToken,
  )
  const parsed = new URL(replayUrl)
  assert.equal(parsed.origin, 'https://www.123english.edu.vn')
  assert.equal(parsed.pathname, `/xem-lai-buoi-hoc/${recordingId}`)
  assert.equal(parsed.search, '')
  assert.equal(parsed.hash, `#token=${bearerToken}`)
})

test('Firebase download URL mã hóa object path và từ chối path ngoài vùng private', () => {
  const objectPath = onlineClassroomRecordingObjectPath(recordingId, uploadNonce)
  const url = onlineClassroomRecordingDownloadUrl(
    'edutrack-pro-78f59.firebasestorage.app',
    objectPath,
    bearerToken,
  )
  assert.match(url, /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\//)
  assert.ok(url.includes(encodeURIComponent(objectPath)))
  assert.ok(url.includes(`token=${bearerToken}`))
  assert.throws(
    () => onlineClassroomRecordingDownloadUrl('bucket.example', 'lessons/public.webm', bearerToken),
    /không hợp lệ/,
  )
})
