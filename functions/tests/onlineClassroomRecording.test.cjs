const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ONLINE_CLASSROOM_RECORDING_MAX_BYTES,
  ONLINE_CLASSROOM_RECORDING_RETENTION_HOURS,
  ONLINE_CLASSROOM_RECORDING_RETENTION_MS,
  canAcquireOnlineClassroomRecordingMediaMutation,
  canTransitionOnlineClassroomRecordingStatus,
  canStartOnlineClassroomRecordingWithConsent,
  isOnlineClassroomRecordingExpired,
  isOnlineClassroomRecordingMediaMutationSettled,
  isOnlineClassroomRecordingStatus,
  onlineClassroomRecordingDownloadUrl,
  onlineClassroomRecordingExpiresAt,
  onlineClassroomRecordingMediaMutationMatches,
  onlineClassroomRecordingNoticeMatches,
  onlineClassroomRecordingObjectPath,
  onlineClassroomRecordingPointerMatches,
  onlineClassroomRecordingReplayUrl,
  onlineClassroomRecordingTokenHash,
  resolveOnlineClassroomRecordingIdentityRole,
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

test('quyền bản ghi của gia sư bị thu hồi theo trạng thái, pilot, UID và generation hiện tại', () => {
  const uid = 'teacher-auth-uid'
  const user = { role: 'teacher', teacherId: 'teacher-a' }
  const teacher = { status: 'active', loginAccountUid: uid }
  const access = { enabled: true, credentialHardenedUid: uid, generation: 7 }
  const recording = { teacherId: 'teacher-a', teacherPilotGeneration: 7 }

  assert.equal(resolveOnlineClassroomRecordingIdentityRole(uid, user, teacher, access, recording), 'teacher')
  assert.equal(resolveOnlineClassroomRecordingIdentityRole(uid, user, teacher, { ...access, enabled: false }, recording), null)
  assert.equal(resolveOnlineClassroomRecordingIdentityRole(uid, user, { ...teacher, status: 'resigned' }, access, recording), null)
  assert.equal(resolveOnlineClassroomRecordingIdentityRole(uid, user, { ...teacher, loginAccountUid: 'other-uid' }, access, recording), null)
  assert.equal(resolveOnlineClassroomRecordingIdentityRole(uid, user, teacher, { ...access, credentialHardenedUid: 'other-uid' }, recording), null)
  assert.equal(resolveOnlineClassroomRecordingIdentityRole(uid, user, teacher, { ...access, generation: 8 }, recording), null)
  assert.equal(resolveOnlineClassroomRecordingIdentityRole(uid, { ...user, teacherId: 'teacher-b' }, teacher, access, recording), null)
  assert.equal(resolveOnlineClassroomRecordingIdentityRole(uid, { role: 'student' }, teacher, access, recording), null)

  // Backward compatibility: legacy recordings without a captured generation
  // still require every current teacher invariant and are revoked while pilot
  // is disabled. New recordings additionally stay revoked after re-enabling.
  assert.equal(
    resolveOnlineClassroomRecordingIdentityRole(uid, user, teacher, access, { teacherId: 'teacher-a' }),
    'teacher',
  )
  assert.equal(
    resolveOnlineClassroomRecordingIdentityRole(uid, user, teacher, { ...access, enabled: false }, { teacherId: 'teacher-a' }),
    null,
  )
  assert.equal(
    resolveOnlineClassroomRecordingIdentityRole(uid, user, teacher, access, { ...recording, teacherPilotGeneration: '7' }),
    null,
  )
})

test('Admin giữ quyền bản ghi độc lập với pilot; vai trò học viên không được nâng thành manager', () => {
  assert.equal(
    resolveOnlineClassroomRecordingIdentityRole('admin-uid', { role: 'admin' }, null, null, null),
    'admin',
  )
  assert.equal(
    resolveOnlineClassroomRecordingIdentityRole('student-uid', { role: 'student' }, null, null, { teacherId: 'teacher-a' }),
    null,
  )
})

test('media lease/fence chặn finalize/share/delete chồng nhau và chỉ cho playback khi cooldown đã đồng bộ', () => {
  const now = Date.parse('2026-08-28T08:00:00.000Z')
  const mutation = {
    id: 'media-mutation-00000000000000000001',
    fence: 4,
    operation: 'share',
    phase: 'applying',
    desiredStorageDownloadToken: bearerToken,
    expiresAt: { toMillis: () => now + 60_000 },
  }
  const active = { mediaMutationFence: 4, mediaMutation: mutation }
  assert.equal(canAcquireOnlineClassroomRecordingMediaMutation({}, now), true)
  assert.equal(canAcquireOnlineClassroomRecordingMediaMutation(active, now), false)
  assert.equal(canAcquireOnlineClassroomRecordingMediaMutation({
    ...active,
    mediaMutation: { ...mutation, expiresAt: { toMillis: () => now } },
  }, now), true)
  assert.equal(canAcquireOnlineClassroomRecordingMediaMutation({ mediaMutation: { id: mutation.id } }, now), false)
  assert.equal(onlineClassroomRecordingMediaMutationMatches(active, {
    id: mutation.id,
    fence: 4,
    operation: 'share',
  }, now), true)
  assert.equal(onlineClassroomRecordingMediaMutationMatches(active, {
    id: mutation.id,
    fence: 5,
    operation: 'share',
  }, now), false)

  const settled = {
    storageDownloadToken: bearerToken,
    mediaMutation: { ...mutation, phase: 'cooldown' },
  }
  assert.equal(canAcquireOnlineClassroomRecordingMediaMutation(settled, now), false)
  assert.equal(onlineClassroomRecordingMediaMutationMatches(settled, {
    id: mutation.id,
    fence: 4,
    operation: 'share',
  }, now), false)
  assert.equal(isOnlineClassroomRecordingMediaMutationSettled(settled), true)
  assert.equal(isOnlineClassroomRecordingMediaMutationSettled({
    ...settled,
    storageDownloadToken: 'different-token-abcdefghijklmnopqrstuvwxyz',
  }), false)
})

test('backend chỉ bắt đầu ghi với đúng consent học viên còn hạn', () => {
  const now = Date.parse('2026-08-28T08:00:00.000Z')
  const requestId = 'abcdef0123456789abcdef0123456789abcd'
  const expected = { requestId, bookingId: 'booking-1', sessionKey: 'session-1', studentId: 'student-1' }
  const consent = {
    ...expected,
    status: 'accepted',
    respondedByStudentId: expected.studentId,
    acceptedAt: now - 1_000,
    expiresAt: now + 60_000,
    termsVersion: 'recording-consent-v1',
  }
  assert.equal(canStartOnlineClassroomRecordingWithConsent(consent, expected, now), true)
  assert.equal(canStartOnlineClassroomRecordingWithConsent({ ...consent, status: 'pending' }, expected, now), false)
  assert.equal(canStartOnlineClassroomRecordingWithConsent({ ...consent, expiresAt: now }, expected, now), false)
  assert.equal(canStartOnlineClassroomRecordingWithConsent({ ...consent, respondedByStudentId: 'other' }, expected, now), false)
  assert.equal(canStartOnlineClassroomRecordingWithConsent({ ...consent, termsVersion: 'old' }, expected, now), false)
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
