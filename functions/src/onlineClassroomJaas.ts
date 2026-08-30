import {
  createHash,
  createPrivateKey,
  randomBytes,
  sign,
  timingSafeEqual,
  type KeyObject,
} from 'node:crypto'

export const ONLINE_CLASSROOM_JAAS_DOMAIN = '8x8.vc'
export const ONLINE_CLASSROOM_PUBLIC_JITSI_DOMAIN = 'meet.jit.si'
// Three hours covers the longest allowed classroom recording plus transient
// reconnects. The token is still constrained to one literal room, while the
// application continues to revalidate booking/pilot access independently.
export const ONLINE_CLASSROOM_JAAS_JWT_TTL_SECONDS = 3 * 60 * 60
export const ONLINE_CLASSROOM_JAAS_ADMIN_JWT_TTL_SECONDS = 2 * 60
export const ONLINE_CLASSROOM_JAAS_PROVISIONED_SETTINGS = Object.freeze({
  lobbyEnabled: true as const,
  lobbyType: 'WAIT_FOR_APPROVAL' as const,
  maxOccupants: 4 as const,
})
const ONLINE_CLASSROOM_JAAS_CLOCK_SKEW_SECONDS = 10
const ONLINE_CLASSROOM_JAAS_APP_ID_PATTERN = /^vpaas-magic-cookie-[A-Za-z0-9_-]{16,128}$/
const ONLINE_CLASSROOM_JAAS_ROOM_ALIAS_PATTERN = /^[A-Za-z0-9_-]{1,200}$/

export type OnlineClassroomMeetingProvider = 'public-jitsi' | 'jaas'
export type OnlineClassroomMeetingRole = 'admin' | 'teacher' | 'student'

export type OnlineClassroomPublicJitsiConfig = {
  meetingProvider: 'public-jitsi'
  meetingDomain: typeof ONLINE_CLASSROOM_PUBLIC_JITSI_DOMAIN
}

export type OnlineClassroomJaasConfig = {
  meetingProvider: 'jaas'
  meetingDomain: typeof ONLINE_CLASSROOM_JAAS_DOMAIN
  appId: string
  kid: string
  privateKey: KeyObject
}

export type OnlineClassroomMeetingConfig =
  | OnlineClassroomPublicJitsiConfig
  | OnlineClassroomJaasConfig

export type OnlineClassroomJaasProvisioningDecision =
  | {
    ok: true
    status: 200
    body: typeof ONLINE_CLASSROOM_JAAS_PROVISIONED_SETTINGS
  }
  | {
    ok: false
    status: 400 | 401 | 403 | 405 | 503
    body: { error: string }
  }

export type OnlineClassroomJaasConfigurationReason =
  | 'JAAS_CONFIG_PARTIAL'
  | 'JAAS_APP_ID_INVALID'
  | 'JAAS_KID_INVALID'
  | 'JAAS_PRIVATE_KEY_INVALID'
  | 'JAAS_ROOM_ALIAS_INVALID'
  | 'JAAS_VIEWER_ID_INVALID'
  | 'JAAS_TOKEN_EXPIRY_INVALID'

export class OnlineClassroomJaasConfigurationError extends Error {
  constructor(public readonly reason: OnlineClassroomJaasConfigurationReason) {
    super(reason)
    this.name = 'OnlineClassroomJaasConfigurationError'
  }
}

function optionalConfigValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The JaaS Console sends the configured Authorization value verbatim. An
 * empty server-side value intentionally makes this check optional, while a
 * configured value is compared without data-dependent byte comparisons.
 */
export function onlineClassroomJaasWebhookAuthorizationMatches(
  configuredAuthorization: unknown,
  providedAuthorization: unknown,
): boolean {
  const configured = optionalConfigValue(configuredAuthorization)
  if (!configured) return true
  const provided = optionalConfigValue(providedAuthorization)
  const configuredBytes = Buffer.from(configured, 'utf8')
  const providedBytes = Buffer.from(provided, 'utf8')
  return configuredBytes.length === providedBytes.length
    && timingSafeEqual(configuredBytes, providedBytes)
}

export function resolveOnlineClassroomJaasSettingsProvisioning(input: {
  method?: unknown
  appId?: unknown
  configuredAuthorization?: unknown
  providedAuthorization?: unknown
  body?: unknown
}): OnlineClassroomJaasProvisioningDecision {
  if (input.method !== 'POST') {
    return { ok: false, status: 405, body: { error: 'method-not-allowed' } }
  }

  const appId = optionalConfigValue(input.appId)
  if (!ONLINE_CLASSROOM_JAAS_APP_ID_PATTERN.test(appId)) {
    return { ok: false, status: 503, body: { error: 'jaas-app-not-configured' } }
  }
  if (!onlineClassroomJaasWebhookAuthorizationMatches(
    input.configuredAuthorization,
    input.providedAuthorization,
  )) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } }
  }
  if (!isRecord(input.body) || typeof input.body.fqn !== 'string') {
    return { ok: false, status: 400, body: { error: 'invalid-payload' } }
  }

  const fqn = input.body.fqn.trim()
  const separatorIndex = fqn.indexOf('/')
  const requestedAppId = separatorIndex > 0 ? fqn.slice(0, separatorIndex) : ''
  const roomAlias = separatorIndex > 0 ? fqn.slice(separatorIndex + 1) : ''
  if (!ONLINE_CLASSROOM_JAAS_APP_ID_PATTERN.test(requestedAppId)
    || !ONLINE_CLASSROOM_JAAS_ROOM_ALIAS_PATTERN.test(roomAlias)) {
    return { ok: false, status: 400, body: { error: 'invalid-fqn' } }
  }
  if (requestedAppId !== appId) {
    return { ok: false, status: 403, body: { error: 'fqn-not-allowed' } }
  }

  return {
    ok: true,
    status: 200,
    body: ONLINE_CLASSROOM_JAAS_PROVISIONED_SETTINGS,
  }
}

function normalizedPrivateKey(value: string): string {
  // Secret Manager normally preserves PEM line breaks. Supporting the escaped
  // form as well prevents an operator from accidentally storing a single-line
  // key while still validating the resulting key material below.
  return value.includes('\\n') && !value.includes('\n')
    ? value.replace(/\\n/g, '\n').trim()
    : value.trim()
}

function validatedPrivateKey(value: string): KeyObject {
  try {
    const privateKey = createPrivateKey(normalizedPrivateKey(value))
    if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'rsa') {
      throw new Error('Private key is not an RSA private key.')
    }
    return privateKey
  } catch {
    throw new OnlineClassroomJaasConfigurationError('JAAS_PRIVATE_KEY_INVALID')
  }
}

/**
 * Resolve the meeting provider without ever silently downgrading a partially
 * configured JaaS environment to the public meet.jit.si service.
 */
export function resolveOnlineClassroomMeetingConfig(input: {
  appId?: unknown
  kid?: unknown
  privateKey?: unknown
}): OnlineClassroomMeetingConfig {
  const appId = optionalConfigValue(input.appId)
  const kid = optionalConfigValue(input.kid)
  const privateKeyPem = optionalConfigValue(input.privateKey)
  const configuredValues = [appId, kid, privateKeyPem].filter(Boolean).length

  if (configuredValues === 0) {
    return {
      meetingProvider: 'public-jitsi',
      meetingDomain: ONLINE_CLASSROOM_PUBLIC_JITSI_DOMAIN,
    }
  }
  if (configuredValues !== 3) {
    throw new OnlineClassroomJaasConfigurationError('JAAS_CONFIG_PARTIAL')
  }
  if (!ONLINE_CLASSROOM_JAAS_APP_ID_PATTERN.test(appId)) {
    throw new OnlineClassroomJaasConfigurationError('JAAS_APP_ID_INVALID')
  }

  const kidParts = kid.split('/')
  if (kidParts.length !== 2
    || kidParts[0] !== appId
    || !/^[A-Za-z0-9_-]{2,160}$/.test(kidParts[1])) {
    throw new OnlineClassroomJaasConfigurationError('JAAS_KID_INVALID')
  }

  return {
    meetingProvider: 'jaas',
    meetingDomain: ONLINE_CLASSROOM_JAAS_DOMAIN,
    appId,
    kid,
    privateKey: validatedPrivateKey(privateKeyPem),
  }
}

function validatedRoomAlias(roomAlias: string): string {
  const normalized = roomAlias.trim()
  if (!ONLINE_CLASSROOM_JAAS_ROOM_ALIAS_PATTERN.test(normalized)) {
    throw new OnlineClassroomJaasConfigurationError('JAAS_ROOM_ALIAS_INVALID')
  }
  return normalized
}

export function onlineClassroomJaasRoomName(config: OnlineClassroomJaasConfig, roomAlias: string): string {
  return `${config.appId}/${validatedRoomAlias(roomAlias)}`
}

export function onlineClassroomJaasConferenceFullName(
  config: OnlineClassroomJaasConfig,
  roomAlias: string,
): string {
  return `${validatedRoomAlias(roomAlias)}@conference.${config.appId}.8x8.vc`
}

function normalizedDisplayName(value: string, role: OnlineClassroomMeetingRole): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  if (normalized) return normalized
  if (role === 'student') return 'Học viên 123English'
  if (role === 'teacher') return 'Gia sư 123English'
  return 'Admin 123English'
}

export function pseudonymousJaasUserId(appId: string, roomAlias: string, viewerId: string): string {
  const normalizedViewerId = viewerId.trim()
  if (!normalizedViewerId || normalizedViewerId.length > 300) {
    throw new OnlineClassroomJaasConfigurationError('JAAS_VIEWER_ID_INVALID')
  }
  return createHash('sha256')
    .update(`${appId}|${roomAlias}|${normalizedViewerId}`, 'utf8')
    .digest('hex')
    .slice(0, 40)
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

/** Short-lived admin credential used only by the backend room-destroy worker. */
export function createOnlineClassroomJaasAdminJwt(input: {
  config: OnlineClassroomJaasConfig
  nowMs?: number
  tokenId?: string
}): string {
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000)
  const tokenId = input.tokenId && /^[A-Za-z0-9_-]{16,160}$/.test(input.tokenId)
    ? input.tokenId
    : randomBytes(18).toString('base64url')
  const header = {
    alg: 'RS256',
    kid: input.config.kid,
    typ: 'JWT',
  }
  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    sub: input.config.appId,
    admin: true,
    iat: nowSeconds,
    nbf: nowSeconds - ONLINE_CLASSROOM_JAAS_CLOCK_SKEW_SECONDS,
    exp: nowSeconds + ONLINE_CLASSROOM_JAAS_ADMIN_JWT_TTL_SECONDS,
    jti: tokenId,
  }
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`
  const signature = sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), input.config.privateKey)
    .toString('base64url')
  return `${signingInput}.${signature}`
}

/**
 * Generate a short-lived RS256 token that is valid for one literal JaaS room.
 * Paid/provider-side features remain disabled because 123English implements
 * recording and classroom interactions in its own authorized workflow.
 */
export function createOnlineClassroomJaasJwt(input: {
  config: OnlineClassroomJaasConfig
  roomAlias: string
  role: OnlineClassroomMeetingRole
  displayName: string
  viewerId: string
  expiresAtMs?: number
  nowMs?: number
  tokenId?: string
}): string {
  const roomAlias = validatedRoomAlias(input.roomAlias)
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000)
  const moderator = input.role === 'admin' || input.role === 'teacher'
  const defaultExpiresAtSeconds = nowSeconds + ONLINE_CLASSROOM_JAAS_JWT_TTL_SECONDS
  const requestedExpiresAtSeconds = Number.isSafeInteger(input.expiresAtMs)
    && Number(input.expiresAtMs) > 0
    ? Math.floor(Number(input.expiresAtMs) / 1000)
    : defaultExpiresAtSeconds
  const expiresAtSeconds = Math.min(defaultExpiresAtSeconds, requestedExpiresAtSeconds)
  if (expiresAtSeconds <= nowSeconds) {
    throw new OnlineClassroomJaasConfigurationError('JAAS_TOKEN_EXPIRY_INVALID')
  }
  const tokenId = input.tokenId && /^[A-Za-z0-9_-]{16,160}$/.test(input.tokenId)
    ? input.tokenId
    : randomBytes(18).toString('base64url')
  const header = {
    alg: 'RS256',
    kid: input.config.kid,
    typ: 'JWT',
  }
  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    sub: input.config.appId,
    room: roomAlias,
    iat: nowSeconds,
    nbf: nowSeconds - ONLINE_CLASSROOM_JAAS_CLOCK_SKEW_SECONDS,
    // A room-bound token must never outlive the booking's effective hard end.
    // Backend access checks remain authoritative; this is defense in depth for
    // copied credentials and reconnect attempts.
    exp: expiresAtSeconds,
    jti: tokenId,
    context: {
      user: {
        id: pseudonymousJaasUserId(input.config.appId, roomAlias, input.viewerId),
        name: normalizedDisplayName(input.displayName, input.role),
        moderator,
        'hidden-from-recorder': false,
      },
      features: {
        livestreaming: false,
        recording: false,
        transcription: false,
        'outbound-call': false,
        'sip-outbound-call': false,
        'file-upload': false,
      },
      room: {
        regex: false,
      },
    },
  }
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`
  const signature = sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), input.config.privateKey)
    .toString('base64url')
  return `${signingInput}.${signature}`
}
