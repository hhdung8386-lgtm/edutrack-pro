const assert = require('node:assert/strict')
const { generateKeyPairSync, verify } = require('node:crypto')
const test = require('node:test')
const {
  ONLINE_CLASSROOM_JAAS_JWT_TTL_SECONDS,
  ONLINE_CLASSROOM_JAAS_ADMIN_JWT_TTL_SECONDS,
  ONLINE_CLASSROOM_JAAS_PROVISIONED_SETTINGS,
  OnlineClassroomJaasConfigurationError,
  createOnlineClassroomJaasAdminJwt,
  createOnlineClassroomJaasJwt,
  onlineClassroomJaasConferenceFullName,
  onlineClassroomJaasRoomName,
  onlineClassroomJaasWebhookAuthorizationMatches,
  resolveOnlineClassroomJaasSettingsProvisioning,
  resolveOnlineClassroomMeetingConfig,
} = require('../lib/onlineClassroomJaas.js')

const APP_ID = 'vpaas-magic-cookie-1234567890abcdef1234567890abcdef'
const KID = `${APP_ID}/api-key-01`
const ROOM_ALIAS = '123EnglishPilot0123456789abcdef'
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

function decodedPart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

test('falls back to public Jitsi only when every JaaS value is absent', () => {
  assert.deepEqual(resolveOnlineClassroomMeetingConfig({}), {
    meetingProvider: 'public-jitsi',
    meetingDomain: 'meet.jit.si',
  })
  assert.deepEqual(resolveOnlineClassroomMeetingConfig({
    appId: '  ',
    kid: '',
    privateKey: undefined,
  }), {
    meetingProvider: 'public-jitsi',
    meetingDomain: 'meet.jit.si',
  })
})

test('partial JaaS configuration fails closed', () => {
  for (const config of [
    { appId: APP_ID },
    { kid: KID },
    { privateKey },
    { appId: APP_ID, kid: KID },
    { appId: APP_ID, privateKey },
    { kid: KID, privateKey },
  ]) {
    assert.throws(
      () => resolveOnlineClassroomMeetingConfig(config),
      (error) => error instanceof OnlineClassroomJaasConfigurationError
        && error.reason === 'JAAS_CONFIG_PARTIAL',
    )
  }
})

test('malformed AppID, full kid, and private key are rejected without downgrade', () => {
  assert.throws(
    () => resolveOnlineClassroomMeetingConfig({ appId: 'not-an-app', kid: KID, privateKey }),
    (error) => error.reason === 'JAAS_APP_ID_INVALID',
  )
  assert.throws(
    () => resolveOnlineClassroomMeetingConfig({
      appId: APP_ID,
      kid: 'vpaas-magic-cookie-ffffffffffffffffffffffffffffffff/api-key-01',
      privateKey,
    }),
    (error) => error.reason === 'JAAS_KID_INVALID',
  )
  assert.throws(
    () => resolveOnlineClassroomMeetingConfig({ appId: APP_ID, kid: KID, privateKey: 'not a PEM key' }),
    (error) => error.reason === 'JAAS_PRIVATE_KEY_INVALID',
  )
})

test('valid JaaS config creates the full tenant room name', () => {
  const config = resolveOnlineClassroomMeetingConfig({ appId: APP_ID, kid: KID, privateKey })
  assert.equal(config.meetingProvider, 'jaas')
  assert.equal(config.meetingDomain, '8x8.vc')
  assert.equal(onlineClassroomJaasRoomName(config, ROOM_ALIAS), `${APP_ID}/${ROOM_ALIAS}`)
  assert.throws(
    () => onlineClassroomJaasRoomName(config, '../other-room'),
    (error) => error.reason === 'JAAS_ROOM_ALIAS_INVALID',
  )
})

test('SETTINGS_PROVISIONING chỉ mở lobby chờ duyệt cho đúng AppID và room hợp lệ', () => {
  const result = resolveOnlineClassroomJaasSettingsProvisioning({
    method: 'POST',
    appId: APP_ID,
    body: { fqn: `${APP_ID}/${ROOM_ALIAS}` },
  })
  assert.deepEqual(result, {
    ok: true,
    status: 200,
    body: {
      lobbyEnabled: true,
      lobbyType: 'WAIT_FOR_APPROVAL',
      maxOccupants: 4,
    },
  })
  assert.deepEqual(result.body, ONLINE_CLASSROOM_JAAS_PROVISIONED_SETTINGS)
})

test('SETTINGS_PROVISIONING fail closed với method, cấu hình, payload hoặc FQN sai', () => {
  const valid = {
    method: 'POST',
    appId: APP_ID,
    body: { fqn: `${APP_ID}/${ROOM_ALIAS}` },
  }
  const otherAppId = 'vpaas-magic-cookie-fedcba0987654321fedcba0987654321'

  assert.equal(resolveOnlineClassroomJaasSettingsProvisioning({ ...valid, method: 'GET' }).status, 405)
  assert.equal(resolveOnlineClassroomJaasSettingsProvisioning({ ...valid, appId: '' }).status, 503)
  assert.equal(resolveOnlineClassroomJaasSettingsProvisioning({ ...valid, body: {} }).status, 400)
  assert.equal(resolveOnlineClassroomJaasSettingsProvisioning({
    ...valid,
    body: { fqn: `${otherAppId}/${ROOM_ALIAS}` },
  }).status, 403)
  assert.equal(resolveOnlineClassroomJaasSettingsProvisioning({
    ...valid,
    body: { fqn: `${APP_ID}/${ROOM_ALIAS}/nested` },
  }).status, 400)
})

test('Authorization của webhook là tùy chọn nhưng được so khớp constant-time khi cấu hình', () => {
  const authorization = 'Bearer classroom-webhook-secret'
  assert.equal(onlineClassroomJaasWebhookAuthorizationMatches('', undefined), true)
  assert.equal(onlineClassroomJaasWebhookAuthorizationMatches(authorization, authorization), true)
  assert.equal(onlineClassroomJaasWebhookAuthorizationMatches(authorization, 'Bearer wrong-secret'), false)
  assert.equal(onlineClassroomJaasWebhookAuthorizationMatches(authorization, undefined), false)

  assert.equal(resolveOnlineClassroomJaasSettingsProvisioning({
    method: 'POST',
    appId: APP_ID,
    configuredAuthorization: authorization,
    providedAuthorization: 'Bearer wrong-secret',
    body: { fqn: `${APP_ID}/${ROOM_ALIAS}` },
  }).status, 401)
})

test('student JWT is RS256, session-lived, exact-room, non-moderator, and verifiable', () => {
  const config = resolveOnlineClassroomMeetingConfig({ appId: APP_ID, kid: KID, privateKey })
  const nowMs = Date.UTC(2026, 7, 29, 8, 0, 0)
  const token = createOnlineClassroomJaasJwt({
    config,
    roomAlias: ROOM_ALIAS,
    role: 'student',
    displayName: '  Học viên\n123English  ',
    viewerId: 'student:student-a',
    nowMs,
    tokenId: 'fixed-token-id-123456',
  })
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.')
  const header = decodedPart(encodedHeader)
  const payload = decodedPart(encodedPayload)
  const nowSeconds = Math.floor(nowMs / 1000)

  assert.deepEqual(header, { alg: 'RS256', kid: KID, typ: 'JWT' })
  assert.equal(payload.aud, 'jitsi')
  assert.equal(payload.iss, 'chat')
  assert.equal(payload.sub, APP_ID)
  assert.equal(payload.room, ROOM_ALIAS)
  assert.equal(payload.context.room.regex, false)
  assert.equal(payload.context.user.name, 'Học viên 123English')
  assert.equal(payload.context.user.moderator, false)
  assert.match(payload.context.user.id, /^[a-f0-9]{40}$/)
  assert.equal(payload.context.features.recording, false)
  assert.equal(payload.context.features.livestreaming, false)
  assert.equal(payload.context.features.transcription, false)
  assert.equal(payload.iat, nowSeconds)
  assert.equal(payload.nbf, nowSeconds - 10)
  assert.equal(payload.exp, nowSeconds + ONLINE_CLASSROOM_JAAS_JWT_TTL_SECONDS)
  assert.equal(payload.jti, 'fixed-token-id-123456')
  assert.equal(
    verify(
      'RSA-SHA256',
      Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8'),
      publicKey,
      Buffer.from(encodedSignature, 'base64url'),
    ),
    true,
  )
  assert.doesNotMatch(token, /PRIVATE KEY/)
})

test('teacher and admin JWTs receive moderator permission while identities stay room-scoped', () => {
  const config = resolveOnlineClassroomMeetingConfig({ appId: APP_ID, kid: KID, privateKey })
  const common = {
    config,
    roomAlias: ROOM_ALIAS,
    displayName: 'Gia sư A',
    viewerId: 'teacher:teacher-a',
    nowMs: 1_777_000_000_000,
    tokenId: 'fixed-token-id-abcdef',
  }
  const teacherPayload = decodedPart(createOnlineClassroomJaasJwt({ ...common, role: 'teacher' }).split('.')[1])
  const adminPayload = decodedPart(createOnlineClassroomJaasJwt({
    ...common,
    role: 'admin',
    viewerId: 'admin:admin-a',
  }).split('.')[1])
  const studentPayload = decodedPart(createOnlineClassroomJaasJwt({ ...common, role: 'student' }).split('.')[1])

  assert.equal(teacherPayload.context.user.moderator, true)
  assert.equal(adminPayload.context.user.moderator, true)
  assert.equal(studentPayload.context.user.moderator, false)
  assert.notEqual(teacherPayload.context.user.id, adminPayload.context.user.id)
})

test('JWT expiry is capped at the classroom hard end', () => {
  const config = resolveOnlineClassroomMeetingConfig({ appId: APP_ID, kid: KID, privateKey })
  const nowMs = Date.UTC(2026, 7, 29, 8, 0, 0)
  const hardEndMs = nowMs + 25 * 60 * 1000
  const payload = decodedPart(createOnlineClassroomJaasJwt({
    config,
    roomAlias: ROOM_ALIAS,
    role: 'teacher',
    displayName: 'Gia sư A',
    viewerId: 'teacher:teacher-a',
    nowMs,
    expiresAtMs: hardEndMs,
    tokenId: 'fixed-hard-end-token-123',
  }).split('.')[1])
  assert.equal(payload.exp, Math.floor(hardEndMs / 1000))
})

test('backend hard-end JWT is short-lived, admin-only, and signs the exact conference command identity', () => {
  const config = resolveOnlineClassroomMeetingConfig({ appId: APP_ID, kid: KID, privateKey })
  const nowMs = Date.UTC(2026, 7, 29, 8, 0, 0)
  const token = createOnlineClassroomJaasAdminJwt({
    config,
    nowMs,
    tokenId: 'fixed-admin-close-token-123',
  })
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.')
  const payload = decodedPart(encodedPayload)
  const nowSeconds = Math.floor(nowMs / 1000)

  assert.equal(payload.admin, true)
  assert.equal(payload.aud, 'jitsi')
  assert.equal(payload.iss, 'chat')
  assert.equal(payload.sub, APP_ID)
  assert.equal(payload.room, undefined)
  assert.equal(payload.nbf, nowSeconds - 10)
  assert.equal(payload.exp, nowSeconds + ONLINE_CLASSROOM_JAAS_ADMIN_JWT_TTL_SECONDS)
  assert.equal(payload.jti, 'fixed-admin-close-token-123')
  assert.equal(
    onlineClassroomJaasConferenceFullName(config, ROOM_ALIAS),
    `${ROOM_ALIAS}@conference.${APP_ID}.8x8.vc`,
  )
  assert.equal(
    verify(
      'RSA-SHA256',
      Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8'),
      publicKey,
      Buffer.from(encodedSignature, 'base64url'),
    ),
    true,
  )
})
