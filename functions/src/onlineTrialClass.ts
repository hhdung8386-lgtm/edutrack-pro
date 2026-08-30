import { createHash, randomBytes } from 'node:crypto'

export const ONLINE_TRIAL_CLASSES_COLLECTION = 'onlineTrialClasses'
export const ONLINE_TRIAL_CLASS_CREATE_REQUESTS_COLLECTION = 'onlineTrialClassCreateRequests'
export const ONLINE_TRIAL_CLASS_ORIGIN = 'https://www.123english.edu.vn'
export const ONLINE_TRIAL_CLASS_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const ONLINE_TRIAL_CLASS_DEFAULT_LIST_LIMIT = 50
export const ONLINE_TRIAL_CLASS_MAX_LIST_LIMIT = 100
export const ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT = 'none' as const
export const ONLINE_TRIAL_CLASS_ROOM_PREFIX = '123EnglishTrial'

const ONLINE_TRIAL_CLASS_ID_PATTERN = /^tr_[A-Za-z0-9_-]{32}$/
const ONLINE_TRIAL_CLASS_SESSION_KEY_PATTERN = /^trial_[a-f0-9]{48}$/
const ONLINE_TRIAL_CLASS_ROOM_NAME_PATTERN = /^123EnglishTrial[a-f0-9]{48}$/
const ONLINE_TRIAL_CLASS_CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,160}$/

export type OnlineTrialClassState = 'ready' | 'live' | 'ended' | 'expired'
export type OnlineTrialClassMode = 'later' | 'instant'

export type OnlineTrialClassIdentifiers = {
  trialClassId: string
  sessionKey: string
  roomName: string
  guestViewerId: string
}

export type OnlineTrialClassCreationPlan = {
  trial: {
    schemaVersion: 1
    kind: 'trial_class'
    trialClassId: string
    title: string
    guestDisplayName: string
    mode: OnlineTrialClassMode
    state: 'ready'
    roomSessionKey: string
    roomName: string
    joinPath: string
    createdByUid: string
    createdByName: string
    accountingImpact: typeof ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT
    createdAtMs: number
    updatedAtMs: number
    accessExpiresAtMs: number
  }
  room: {
    schemaVersion: 1
    scopeType: 'trial'
    scopeId: string
    trialClassId: string
    sessionKey: string
    roomName: string
    hostViewerId: string
    guestViewerId: string
    state: 'scheduled'
    accountingImpact: typeof ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT
    createdAtMs: number
    updatedAtMs: number
    hardEndsAtMs: number
  }
}

export type OnlineTrialClassAccessDecision =
  | 'allowed'
  | 'ended'
  | 'expired'
  | 'invalid-state'

export type OnlineTrialClassViewerRole = 'admin' | 'teacher' | 'student'

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function sanitizeOnlineTrialClassTitle(value: unknown): string {
  return cleanText(value, 120) || 'Lớp học thử 123English'
}

export function sanitizeOnlineTrialClassDisplayName(value: unknown): string {
  return cleanText(value, 100) || 'Học viên học thử'
}

export function normalizeOnlineTrialClassMode(value: unknown): OnlineTrialClassMode {
  return value === 'instant' ? 'instant' : 'later'
}

export function isSafeOnlineTrialClassId(value: unknown): value is string {
  return typeof value === 'string' && ONLINE_TRIAL_CLASS_ID_PATTERN.test(value)
}

export function isSafeOnlineTrialClassSessionKey(value: unknown): value is string {
  return typeof value === 'string' && ONLINE_TRIAL_CLASS_SESSION_KEY_PATTERN.test(value)
}

export function isOnlineTrialClassRoomName(value: unknown): value is string {
  return typeof value === 'string' && ONLINE_TRIAL_CLASS_ROOM_NAME_PATTERN.test(value)
}

export function isSafeOnlineTrialClassClientRequestId(value: unknown): value is string {
  return typeof value === 'string' && ONLINE_TRIAL_CLASS_CLIENT_REQUEST_ID_PATTERN.test(value)
}

export function createOnlineTrialClassIdentifiers(): OnlineTrialClassIdentifiers {
  return {
    // 192 bits of server-generated entropy make the stable URL a capability
    // without exposing a booking, student, teacher, or sequential identifier.
    trialClassId: `tr_${randomBytes(24).toString('base64url')}`,
    sessionKey: `trial_${randomBytes(24).toString('hex')}`,
    roomName: `${ONLINE_TRIAL_CLASS_ROOM_PREFIX}${randomBytes(24).toString('hex')}`,
    guestViewerId: `trial-guest:${randomBytes(24).toString('base64url')}`,
  }
}

export function onlineTrialClassCreateRequestDocumentId(
  adminUid: string,
  clientRequestId: string,
): string {
  return createHash('sha256')
    .update(`${adminUid}|${clientRequestId}`, 'utf8')
    .digest('hex')
}

export function onlineTrialClassCreateRequestFingerprint(input: {
  mode?: unknown
  title?: unknown
  guestDisplayName?: unknown
}): string {
  const canonical = JSON.stringify({
    mode: normalizeOnlineTrialClassMode(input.mode),
    title: sanitizeOnlineTrialClassTitle(input.title),
    guestDisplayName: sanitizeOnlineTrialClassDisplayName(input.guestDisplayName),
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

export function onlineTrialClassJoinPath(trialClassId: string): string {
  if (!isSafeOnlineTrialClassId(trialClassId)) throw new Error('ONLINE_TRIAL_CLASS_ID_INVALID')
  return `/lop-hoc-thu/${trialClassId}`
}

export function onlineTrialClassJoinUrl(
  trialClassId: string,
  origin: string = ONLINE_TRIAL_CLASS_ORIGIN,
): string {
  const normalizedOrigin = origin.replace(/\/+$/, '')
  return `${normalizedOrigin}${onlineTrialClassJoinPath(trialClassId)}`
}

export function onlineTrialClassAccessExpiresAtMs(createdAtMs: number): number {
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs <= 0) {
    throw new Error('ONLINE_TRIAL_CLASS_CREATED_AT_INVALID')
  }
  return createdAtMs + ONLINE_TRIAL_CLASS_TTL_MS
}

export function buildOnlineTrialClassCreationPlan(input: {
  identifiers: OnlineTrialClassIdentifiers
  adminUid: string
  createdByName?: unknown
  title?: unknown
  guestDisplayName?: unknown
  mode?: unknown
  createdAtMs: number
}): OnlineTrialClassCreationPlan {
  const { identifiers } = input
  if (!isSafeOnlineTrialClassId(identifiers.trialClassId)
    || !isSafeOnlineTrialClassSessionKey(identifiers.sessionKey)
    || !isOnlineTrialClassRoomName(identifiers.roomName)
    || typeof identifiers.guestViewerId !== 'string'
    || !/^trial-guest:[A-Za-z0-9_-]{32}$/.test(identifiers.guestViewerId)
    || typeof input.adminUid !== 'string'
    || input.adminUid.length === 0
    || input.adminUid.length > 160) {
    throw new Error('ONLINE_TRIAL_CLASS_CREATION_IDENTIFIERS_INVALID')
  }
  const accessExpiresAtMs = onlineTrialClassAccessExpiresAtMs(input.createdAtMs)
  const title = sanitizeOnlineTrialClassTitle(input.title)
  const guestDisplayName = sanitizeOnlineTrialClassDisplayName(input.guestDisplayName)
  const mode = normalizeOnlineTrialClassMode(input.mode)
  const joinPath = onlineTrialClassJoinPath(identifiers.trialClassId)
  return {
    trial: {
      schemaVersion: 1,
      kind: 'trial_class',
      trialClassId: identifiers.trialClassId,
      title,
      guestDisplayName,
      mode,
      state: 'ready',
      roomSessionKey: identifiers.sessionKey,
      roomName: identifiers.roomName,
      joinPath,
      createdByUid: input.adminUid,
      createdByName: cleanText(input.createdByName, 100) || 'Admin 123English',
      accountingImpact: ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT,
      createdAtMs: input.createdAtMs,
      updatedAtMs: input.createdAtMs,
      accessExpiresAtMs,
    },
    room: {
      schemaVersion: 1,
      scopeType: 'trial',
      scopeId: identifiers.trialClassId,
      trialClassId: identifiers.trialClassId,
      sessionKey: identifiers.sessionKey,
      roomName: identifiers.roomName,
      hostViewerId: `trial-host:${input.adminUid}`,
      guestViewerId: identifiers.guestViewerId,
      state: 'scheduled',
      accountingImpact: ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT,
      createdAtMs: input.createdAtMs,
      updatedAtMs: input.createdAtMs,
      hardEndsAtMs: accessExpiresAtMs,
    },
  }
}

export function decideOnlineTrialClassAccess(input: {
  state: unknown
  accessExpiresAtMs: unknown
  nowMs: number
}): OnlineTrialClassAccessDecision {
  if (input.state === 'ended') return 'ended'
  if (input.state === 'expired') return 'expired'
  if (input.state !== 'ready' && input.state !== 'live') return 'invalid-state'
  if (!Number.isSafeInteger(input.accessExpiresAtMs)
    || Number(input.accessExpiresAtMs) <= input.nowMs) return 'expired'
  return 'allowed'
}

/**
 * Resolve moderation without trusting a mutable users/{uid}.role in isolation.
 * A teacher is privileged only when the active canonical teacher profile points
 * back to the authenticated UID; every other identity remains a lobby guest.
 */
export function decideOnlineTrialClassViewerRole(input: {
  authenticatedUid?: unknown
  userRole?: unknown
  userTeacherId?: unknown
  teacherStatus?: unknown
  teacherLoginAccountUid?: unknown
}): OnlineTrialClassViewerRole {
  if (typeof input.authenticatedUid !== 'string'
    || input.authenticatedUid.length === 0
    || input.authenticatedUid.length > 160
    || input.authenticatedUid.includes('/')) return 'student'
  if (input.userRole === 'admin') return 'admin'
  if (input.userRole === 'teacher'
    && typeof input.userTeacherId === 'string'
    && input.userTeacherId.length > 0
    && input.userTeacherId.length <= 160
    && !input.userTeacherId.includes('/')
    && input.teacherStatus === 'active'
    && input.teacherLoginAccountUid === input.authenticatedUid) return 'teacher'
  return 'student'
}

export function validateOnlineTrialClassBinding(input: {
  trialClassId: unknown
  trialKind: unknown
  trialRoomSessionKey: unknown
  trialRoomName: unknown
  trialAccessExpiresAtMs: unknown
  roomScopeType: unknown
  roomScopeId: unknown
  roomTrialClassId: unknown
  roomSessionKey: unknown
  roomName: unknown
  roomHostViewerId: unknown
  roomGuestViewerId: unknown
  roomHardEndsAtMs: unknown
}): boolean {
  return isSafeOnlineTrialClassId(input.trialClassId)
    && input.trialKind === 'trial_class'
    && isSafeOnlineTrialClassSessionKey(input.trialRoomSessionKey)
    && isOnlineTrialClassRoomName(input.trialRoomName)
    && input.roomScopeType === 'trial'
    && input.roomScopeId === input.trialClassId
    && input.roomTrialClassId === input.trialClassId
    && input.roomSessionKey === input.trialRoomSessionKey
    && input.roomName === input.trialRoomName
    && typeof input.roomHostViewerId === 'string'
    && /^trial-host:.{1,160}$/.test(input.roomHostViewerId)
    && typeof input.roomGuestViewerId === 'string'
    && /^trial-guest:[A-Za-z0-9_-]{32}$/.test(input.roomGuestViewerId)
    && Number.isSafeInteger(input.trialAccessExpiresAtMs)
    && input.roomHardEndsAtMs === input.trialAccessExpiresAtMs
}

/** Identity-only binding for signed provider events. It intentionally omits
 * lifecycle timestamps because ROOM_DESTROYED arrives after manual end has
 * shortened the room hard-end while the original seven-day TTL stays immutable.
 */
export function validateOnlineTrialClassWebhookBinding(input: {
  roomDocumentId: unknown
  expectedRoomName: unknown
  roomScopeType: unknown
  roomScopeId: unknown
  roomTrialClassId: unknown
  roomSessionKey: unknown
  roomName: unknown
  roomAccountingImpact: unknown
  trialDocumentId: unknown
  trialKind: unknown
  trialClassId: unknown
  trialRoomSessionKey: unknown
  trialRoomName: unknown
  trialAccountingImpact: unknown
}): boolean {
  return isSafeOnlineTrialClassSessionKey(input.roomDocumentId)
    && isOnlineTrialClassRoomName(input.expectedRoomName)
    && input.roomScopeType === 'trial'
    && input.roomScopeId === input.roomTrialClassId
    && input.roomTrialClassId === input.trialDocumentId
    && input.roomSessionKey === input.roomDocumentId
    && input.roomName === input.expectedRoomName
    && input.roomAccountingImpact === ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT
    && isSafeOnlineTrialClassId(input.trialDocumentId)
    && input.trialKind === 'trial_class'
    && input.trialClassId === input.trialDocumentId
    && input.trialRoomSessionKey === input.roomDocumentId
    && input.trialRoomName === input.expectedRoomName
    && input.trialAccountingImpact === ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT
}

export function onlineTrialClassListLimit(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    return ONLINE_TRIAL_CLASS_DEFAULT_LIST_LIMIT
  }
  return Math.min(Number(value), ONLINE_TRIAL_CLASS_MAX_LIST_LIMIT)
}
