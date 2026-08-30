import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { pseudonymousJaasUserId } from './onlineClassroomJaas'

export const ONLINE_CLASSROOM_ATTENDANCE_SESSIONS_COLLECTION = 'onlineClassroomSessions'
export const ONLINE_CLASSROOM_ATTENDANCE_EVENTS_COLLECTION = 'events'
export const ONLINE_CLASSROOM_JAAS_SIGNATURE_TOLERANCE_SECONDS = 5 * 60
export const ONLINE_CLASSROOM_JAAS_WEBHOOK_MAX_BYTES = 128 * 1024

export const ONLINE_CLASSROOM_JAAS_ATTENDANCE_EVENT_TYPES = [
  'ROOM_CREATED',
  'ROOM_DESTROYED',
  'PARTICIPANT_JOINED',
  'PARTICIPANT_LEFT',
  'PARTICIPANT_JOINED_LOBBY',
  'PARTICIPANT_LEFT_LOBBY',
] as const

export type OnlineClassroomJaasAttendanceEventType =
  typeof ONLINE_CLASSROOM_JAAS_ATTENDANCE_EVENT_TYPES[number]
export type OnlineClassroomAttendanceParticipantRole = 'teacher' | 'student' | 'unknown'

export type OnlineClassroomJaasAttendanceEventData = {
  id?: string
  participantId?: string
  participantJid?: string
  moderator?: boolean
  disconnectReason?: string
  isBreakout: boolean
  breakoutRoomId?: string
}

export type OnlineClassroomJaasAttendanceEvent = {
  eventType: OnlineClassroomJaasAttendanceEventType
  idempotencyKey: string
  sessionId: string
  timestamp: number
  fqn: string
  appId: string
  roomAlias: string
  data: OnlineClassroomJaasAttendanceEventData
}

export type OnlineClassroomAttendanceRoomBinding = {
  bookingId: string
  sessionKey: string
  roomName: string
  teacherId: string
  studentId: string
}

/**
 * Immutable timing/binding evidence copied from the private room into the
 * attendance history. Keeping this separately from the current pilot access
 * generation means rotating pilot access cannot hide an earlier real class.
 */
export type OnlineClassroomAttendanceEffectiveSession = {
  sessionKey: string
  extensionMinutes: number
  scheduledStartsAtMs: number
  scheduledEndsAtMs: number
  hardEndsAtMs: number
  timingSource: 'room' | 'legacy-booking-fallback'
}

type ParticipantEventType =
  | 'PARTICIPANT_JOINED'
  | 'PARTICIPANT_LEFT'
  | 'PARTICIPANT_JOINED_LOBBY'
  | 'PARTICIPANT_LEFT_LOBBY'

export type OnlineClassroomAttendanceParticipantSummary = {
  joinEventCount: number
  leftEventCount: number
  lobbyJoinEventCount: number
  lobbyLeftEventCount: number
  firstJoinedAtMs: number | null
  lastJoinedAtMs: number | null
  firstLeftAtMs: number | null
  lastLeftAtMs: number | null
  present: boolean
  presenceStateAtMs: number | null
  presenceStateOrder: number
  presenceStateEventType: 'PARTICIPANT_JOINED' | 'PARTICIPANT_LEFT' | 'ROOM_DESTROYED' | null
  firstLobbyJoinedAtMs: number | null
  lastLobbyJoinedAtMs: number | null
  firstLobbyLeftAtMs: number | null
  lastLobbyLeftAtMs: number | null
  inLobby: boolean
  lobbyStateAtMs: number | null
  lobbyStateOrder: number
  lobbyStateEventType:
    | 'PARTICIPANT_JOINED_LOBBY'
    | 'PARTICIPANT_LEFT_LOBBY'
    | 'PARTICIPANT_JOINED'
    | 'ROOM_DESTROYED'
    | null
}

export type OnlineClassroomAttendanceSummary = {
  schemaVersion: 1
  eventCount: number
  breakoutEventCount: number
  unknownParticipantEventCount: number
  firstEventAtMs: number | null
  lastEventAtMs: number | null
  lastEventSortKey: string
  lastEventType: OnlineClassroomJaasAttendanceEventType | null
  lastSessionId: string
  roomCreatedEventCount: number
  roomDestroyedEventCount: number
  roomCreatedAtMs: number | null
  roomDestroyedAtMs: number | null
  roomOpen: boolean
  roomStateAtMs: number | null
  roomStateOrder: number
  roomStateEventType: 'ROOM_CREATED' | 'ROOM_DESTROYED' | null
  teacher: OnlineClassroomAttendanceParticipantSummary
  student: OnlineClassroomAttendanceParticipantSummary
}

export type OnlineClassroomAttendanceProjection = {
  status: 'live' | 'ended' | null
  teacherFirstJoinedAtMs: number | null
  teacherLastLeftAtMs: number | null
  teacherJoinCount: number
  studentFirstJoinedAtMs: number | null
  studentLastLeftAtMs: number | null
  studentJoinCount: number
  teacherLateSeconds: number | null
}

export type OnlineClassroomJaasSignatureVerification =
  | { ok: true; timestampSeconds: number }
  | {
    ok: false
    reason:
      | 'secret-not-configured'
      | 'signature-header-missing'
      | 'signature-header-invalid'
      | 'signature-timestamp-outside-tolerance'
      | 'signature-mismatch'
  }

export type OnlineClassroomJaasAttendanceParseResult =
  | { ok: true; event: OnlineClassroomJaasAttendanceEvent }
  | {
    ok: false
    reason:
      | 'invalid-json'
      | 'invalid-payload'
      | 'invalid-fqn'
      | 'fqn-not-allowed'
      | 'unsupported-event'
    eventType?: string
  }

const JAAS_APP_ID_PATTERN = /^vpaas-magic-cookie-[A-Za-z0-9_-]{16,128}$/
const JAAS_ROOM_ALIAS_PATTERN = /^[A-Za-z0-9_-]{1,200}$/
const JAAS_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,199}$/
const MAX_FIRESTORE_TIMESTAMP_MILLIS = 253_402_300_799_999
const ATTENDANCE_EVENT_TYPES = new Set<string>(ONLINE_CLASSROOM_JAAS_ATTENDANCE_EVENT_TYPES)
const PARTICIPANT_EVENT_TYPES = new Set<string>([
  'PARTICIPANT_JOINED',
  'PARTICIPANT_LEFT',
  'PARTICIPANT_JOINED_LOBBY',
  'PARTICIPANT_LEFT_LOBBY',
])
const ONLINE_CLASSROOM_ATTENDANCE_MAX_EXTENSION_MINUTES = 10

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeResourceId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 160
    && !value.includes('/')
    && !/[\u0000-\u001f\u007f]/.test(value)
}

function optionalSafeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return undefined
  return /[\u0000-\u001f\u007f]/.test(value) ? undefined : value
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function safeTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && Number(value) >= 0
    && Number(value) <= MAX_FIRESTORE_TIMESTAMP_MILLIS
}

function onlineClassroomAttendanceEventSortKey(
  event: Pick<OnlineClassroomJaasAttendanceEvent, 'eventType' | 'idempotencyKey'>,
): string {
  return `${event.eventType}|${event.idempotencyKey}`
}

export function normalizeOnlineClassroomAttendanceEffectiveSession(
  value: unknown,
): OnlineClassroomAttendanceEffectiveSession | null {
  if (!isRecord(value)
    || !isSafeResourceId(value.sessionKey)
    || !Number.isSafeInteger(value.extensionMinutes)
    || Number(value.extensionMinutes) < 0
    || Number(value.extensionMinutes) > ONLINE_CLASSROOM_ATTENDANCE_MAX_EXTENSION_MINUTES
    || !safeTimestamp(value.scheduledStartsAtMs)
    || !safeTimestamp(value.scheduledEndsAtMs)
    || !safeTimestamp(value.hardEndsAtMs)
    || value.scheduledEndsAtMs <= value.scheduledStartsAtMs
    || value.hardEndsAtMs !== value.scheduledEndsAtMs + Number(value.extensionMinutes) * 60_000
    || (value.timingSource !== 'room' && value.timingSource !== 'legacy-booking-fallback')) {
    return null
  }
  return {
    sessionKey: value.sessionKey,
    extensionMinutes: Number(value.extensionMinutes),
    scheduledStartsAtMs: Number(value.scheduledStartsAtMs),
    scheduledEndsAtMs: Number(value.scheduledEndsAtMs),
    hardEndsAtMs: Number(value.hardEndsAtMs),
    timingSource: value.timingSource,
  }
}

export function mergeOnlineClassroomAttendanceSessionHistory(
  value: unknown,
  incoming: OnlineClassroomAttendanceEffectiveSession,
): Record<string, OnlineClassroomAttendanceEffectiveSession> {
  const history: Record<string, OnlineClassroomAttendanceEffectiveSession> = {}
  if (isRecord(value)) {
    for (const [sessionKey, candidate] of Object.entries(value)) {
      const normalized = normalizeOnlineClassroomAttendanceEffectiveSession(candidate)
      if (normalized?.sessionKey === sessionKey) history[sessionKey] = normalized
    }
  }
  history[incoming.sessionKey] = incoming
  return history
}

/**
 * The effective binding follows provider event time, not delivery order. An
 * older retry from an old pilot generation therefore cannot replace a newer
 * session. Events from the same session may still refresh its extension/timing
 * metadata after Admin grants the one permitted extension.
 */
export function shouldUseOnlineClassroomAttendanceEffectiveSession(input: {
  currentSummary: unknown
  currentEffectiveSessionKey: unknown
  incomingSessionKey: string
  event: Pick<OnlineClassroomJaasAttendanceEvent, 'timestamp' | 'eventType' | 'idempotencyKey'>
}): boolean {
  if (input.currentEffectiveSessionKey === input.incomingSessionKey) return true
  const current = normalizeOnlineClassroomAttendanceSummary(input.currentSummary)
  const incomingSortKey = onlineClassroomAttendanceEventSortKey(input.event)
  return current.lastEventAtMs === null
    || input.event.timestamp > current.lastEventAtMs
    || (input.event.timestamp === current.lastEventAtMs && incomingSortKey > current.lastEventSortKey)
}

export type OnlineClassroomAttendancePermanentConflictReason =
  | 'ambiguous-room-alias'
  | 'invalid-room-binding'
  | 'invalid-room-timing'
  | 'booking-room-identity-mismatch'
  | 'room-booking-binding-changed'
  | 'idempotency-key-conflict'

export function isOnlineClassroomAttendancePermanentConflict(
  reason: string,
): reason is OnlineClassroomAttendancePermanentConflictReason {
  return [
    'ambiguous-room-alias',
    'invalid-room-binding',
    'invalid-room-timing',
    'booking-room-identity-mismatch',
    'room-booking-binding-changed',
    'idempotency-key-conflict',
  ].includes(reason)
}

function safeCounter(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
}

function incrementCounter(value: number): number {
  return value < Number.MAX_SAFE_INTEGER ? value + 1 : value
}

function optionalTimestamp(value: unknown): number | null {
  return safeTimestamp(value) ? value : null
}

function earlier(current: number | null, incoming: number): number {
  return current === null ? incoming : Math.min(current, incoming)
}

function later(current: number | null, incoming: number): number {
  return current === null ? incoming : Math.max(current, incoming)
}

function shouldReplaceState(
  currentAtMs: number | null,
  currentOrder: number,
  incomingAtMs: number,
  incomingOrder: number,
): boolean {
  return currentAtMs === null
    || incomingAtMs > currentAtMs
    || (incomingAtMs === currentAtMs && incomingOrder > currentOrder)
}

function normalizedParticipantSummary(value: unknown): OnlineClassroomAttendanceParticipantSummary {
  const source = isRecord(value) ? value : {}
  const presenceStateEventType = ['PARTICIPANT_JOINED', 'PARTICIPANT_LEFT', 'ROOM_DESTROYED']
    .includes(String(source.presenceStateEventType))
    ? source.presenceStateEventType as OnlineClassroomAttendanceParticipantSummary['presenceStateEventType']
    : null
  const lobbyStateEventType = [
    'PARTICIPANT_JOINED_LOBBY',
    'PARTICIPANT_LEFT_LOBBY',
    'PARTICIPANT_JOINED',
    'ROOM_DESTROYED',
  ].includes(String(source.lobbyStateEventType))
    ? source.lobbyStateEventType as OnlineClassroomAttendanceParticipantSummary['lobbyStateEventType']
    : null
  return {
    joinEventCount: safeCounter(source.joinEventCount),
    leftEventCount: safeCounter(source.leftEventCount),
    lobbyJoinEventCount: safeCounter(source.lobbyJoinEventCount),
    lobbyLeftEventCount: safeCounter(source.lobbyLeftEventCount),
    firstJoinedAtMs: optionalTimestamp(source.firstJoinedAtMs),
    lastJoinedAtMs: optionalTimestamp(source.lastJoinedAtMs),
    firstLeftAtMs: optionalTimestamp(source.firstLeftAtMs),
    lastLeftAtMs: optionalTimestamp(source.lastLeftAtMs),
    present: source.present === true,
    presenceStateAtMs: optionalTimestamp(source.presenceStateAtMs),
    presenceStateOrder: safeCounter(source.presenceStateOrder),
    presenceStateEventType,
    firstLobbyJoinedAtMs: optionalTimestamp(source.firstLobbyJoinedAtMs),
    lastLobbyJoinedAtMs: optionalTimestamp(source.lastLobbyJoinedAtMs),
    firstLobbyLeftAtMs: optionalTimestamp(source.firstLobbyLeftAtMs),
    lastLobbyLeftAtMs: optionalTimestamp(source.lastLobbyLeftAtMs),
    inLobby: source.inLobby === true,
    lobbyStateAtMs: optionalTimestamp(source.lobbyStateAtMs),
    lobbyStateOrder: safeCounter(source.lobbyStateOrder),
    lobbyStateEventType,
  }
}

export function normalizeOnlineClassroomAttendanceSummary(
  value: unknown,
): OnlineClassroomAttendanceSummary {
  const source = isRecord(value) ? value : {}
  const lastEventType = ATTENDANCE_EVENT_TYPES.has(String(source.lastEventType))
    ? source.lastEventType as OnlineClassroomJaasAttendanceEventType
    : null
  const roomStateEventType = source.roomStateEventType === 'ROOM_CREATED'
    || source.roomStateEventType === 'ROOM_DESTROYED'
    ? source.roomStateEventType
    : null
  return {
    schemaVersion: 1,
    eventCount: safeCounter(source.eventCount),
    breakoutEventCount: safeCounter(source.breakoutEventCount),
    unknownParticipantEventCount: safeCounter(source.unknownParticipantEventCount),
    firstEventAtMs: optionalTimestamp(source.firstEventAtMs),
    lastEventAtMs: optionalTimestamp(source.lastEventAtMs),
    lastEventSortKey: typeof source.lastEventSortKey === 'string' ? source.lastEventSortKey : '',
    lastEventType,
    lastSessionId: typeof source.lastSessionId === 'string' ? source.lastSessionId : '',
    roomCreatedEventCount: safeCounter(source.roomCreatedEventCount),
    roomDestroyedEventCount: safeCounter(source.roomDestroyedEventCount),
    roomCreatedAtMs: optionalTimestamp(source.roomCreatedAtMs),
    roomDestroyedAtMs: optionalTimestamp(source.roomDestroyedAtMs),
    roomOpen: source.roomOpen === true,
    roomStateAtMs: optionalTimestamp(source.roomStateAtMs),
    roomStateOrder: safeCounter(source.roomStateOrder),
    roomStateEventType,
    teacher: normalizedParticipantSummary(source.teacher),
    student: normalizedParticipantSummary(source.student),
  }
}

function parsedSignatureHeader(header: string): { timestampSeconds: number; signatures: Buffer[] } | null {
  const timestampValues: number[] = []
  const signatures: Buffer[] = []
  for (const rawPart of header.split(',')) {
    const part = rawPart.trim()
    if (part.startsWith('t=')) {
      const value = part.slice(2)
      if (!/^\d{1,16}$/.test(value)) return null
      const timestamp = Number(value)
      if (!Number.isSafeInteger(timestamp) || timestamp < 0) return null
      timestampValues.push(timestamp)
      continue
    }
    if (!part.startsWith('v1=')) continue
    const encoded = part.slice(3)
    try {
      const decoded = Buffer.from(encoded, 'base64')
      if (decoded.length !== 32 || decoded.toString('base64') !== encoded) return null
      signatures.push(decoded)
    } catch {
      return null
    }
  }
  if (timestampValues.length !== 1 || signatures.length === 0) return null
  return { timestampSeconds: timestampValues[0], signatures }
}

/**
 * JaaS signs `${headerTimestamp}.${rawBody}` with HMAC-SHA256 and standard
 * base64. The raw bytes are intentionally accepted here so JSON parsing or
 * whitespace normalization can never change the authenticated message.
 */
export function verifyOnlineClassroomJaasWebhookSignature(input: {
  secret: string
  signatureHeader?: string | null
  rawBody: Uint8Array
  nowMs?: number
  toleranceSeconds?: number
}): OnlineClassroomJaasSignatureVerification {
  if (!input.secret) return { ok: false, reason: 'secret-not-configured' }
  if (!input.signatureHeader) return { ok: false, reason: 'signature-header-missing' }
  const parsed = parsedSignatureHeader(input.signatureHeader)
  if (!parsed) return { ok: false, reason: 'signature-header-invalid' }

  const toleranceSeconds = Number.isSafeInteger(input.toleranceSeconds)
    && Number(input.toleranceSeconds) >= 0
    ? Number(input.toleranceSeconds)
    : ONLINE_CLASSROOM_JAAS_SIGNATURE_TOLERANCE_SECONDS
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000)
  if (Math.abs(nowSeconds - parsed.timestampSeconds) > toleranceSeconds) {
    return { ok: false, reason: 'signature-timestamp-outside-tolerance' }
  }

  const expected = createHmac('sha256', input.secret)
    .update(String(parsed.timestampSeconds), 'utf8')
    .update('.', 'utf8')
    .update(input.rawBody)
    .digest()
  let matched = false
  for (const signature of parsed.signatures) {
    // Evaluate every v1 candidate, even after a match, to avoid leaking which
    // signature in a rotation header was accepted.
    matched = timingSafeEqual(expected, signature) || matched
  }
  return matched
    ? { ok: true, timestampSeconds: parsed.timestampSeconds }
    : { ok: false, reason: 'signature-mismatch' }
}

export function parseOnlineClassroomJaasFqn(
  value: unknown,
  expectedAppId: string,
): { ok: true; appId: string; roomAlias: string; fqn: string }
  | { ok: false; reason: 'invalid-fqn' | 'fqn-not-allowed' } {
  if (typeof value !== 'string' || !JAAS_APP_ID_PATTERN.test(expectedAppId)) {
    return { ok: false, reason: 'invalid-fqn' }
  }
  const fqn = value.trim()
  const separator = fqn.indexOf('/')
  if (separator <= 0 || separator !== fqn.lastIndexOf('/')) {
    return { ok: false, reason: 'invalid-fqn' }
  }
  const appId = fqn.slice(0, separator)
  const roomAlias = fqn.slice(separator + 1)
  if (!JAAS_APP_ID_PATTERN.test(appId) || !JAAS_ROOM_ALIAS_PATTERN.test(roomAlias)) {
    return { ok: false, reason: 'invalid-fqn' }
  }
  if (appId !== expectedAppId) return { ok: false, reason: 'fqn-not-allowed' }
  return { ok: true, appId, roomAlias, fqn }
}

export function parseOnlineClassroomJaasAttendanceEvent(
  rawBody: Uint8Array | string,
  expectedAppId: string,
): OnlineClassroomJaasAttendanceParseResult {
  let payload: unknown
  try {
    const json = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody).toString('utf8')
    payload = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
  if (!isRecord(payload)) return { ok: false, reason: 'invalid-payload' }

  const eventType = typeof payload.eventType === 'string' ? payload.eventType : ''
  const fqn = parseOnlineClassroomJaasFqn(payload.fqn, expectedAppId)
  if (!fqn.ok) return fqn
  if (payload.appId !== fqn.appId) return { ok: false, reason: 'fqn-not-allowed' }
  if (!eventType) return { ok: false, reason: 'invalid-payload' }
  if (!ATTENDANCE_EVENT_TYPES.has(eventType)) {
    return { ok: false, reason: 'unsupported-event', ...(eventType ? { eventType } : {}) }
  }
  if (typeof payload.idempotencyKey !== 'string'
    || typeof payload.sessionId !== 'string'
    || !JAAS_REQUEST_ID_PATTERN.test(payload.idempotencyKey)
    || !JAAS_REQUEST_ID_PATTERN.test(payload.sessionId)
    || !safeTimestamp(payload.timestamp)
    || !isRecord(payload.data)) {
    return { ok: false, reason: 'invalid-payload' }
  }

  const rawData = payload.data
  const participantId = optionalSafeString(rawData.participantId, 300)
  const participantJid = optionalSafeString(rawData.participantJid, 500)
  const id = optionalSafeString(rawData.id, 300)
  const moderator = optionalBoolean(rawData.moderator)
  const disconnectReason = optionalSafeString(rawData.disconnectReason, 80)
  const breakoutRoomId = optionalSafeString(rawData.breakoutRoomId, 300)
  const isBreakout = optionalBoolean(rawData.isBreakout) === true
  return {
    ok: true,
    event: {
      eventType: eventType as OnlineClassroomJaasAttendanceEventType,
      idempotencyKey: payload.idempotencyKey,
      sessionId: payload.sessionId,
      timestamp: Number(payload.timestamp),
      fqn: fqn.fqn,
      appId: fqn.appId,
      roomAlias: fqn.roomAlias,
      data: {
        ...(id ? { id } : {}),
        ...(participantId ? { participantId } : {}),
        ...(participantJid ? { participantJid } : {}),
        ...(moderator !== undefined ? { moderator } : {}),
        ...(disconnectReason ? { disconnectReason } : {}),
        isBreakout,
        ...(breakoutRoomId ? { breakoutRoomId } : {}),
      },
    },
  }
}

export function parseOnlineClassroomAttendanceRoomBinding(input: {
  roomDocumentId: unknown
  roomData: unknown
  expectedRoomName: string
  bookingDocumentId?: unknown
  bookingData?: unknown
}): { ok: true; binding: OnlineClassroomAttendanceRoomBinding }
  | {
    ok: false
    reason: 'invalid-room-binding' | 'booking-room-identity-mismatch'
  } {
  if (!isSafeResourceId(input.roomDocumentId) || !isRecord(input.roomData)) {
    return { ok: false, reason: 'invalid-room-binding' }
  }
  const room = input.roomData
  if (room.roomName !== input.expectedRoomName
    || room.sessionKey !== input.roomDocumentId
    || !isSafeResourceId(room.bookingId)
    || !isSafeResourceId(room.teacherId)
    || !isSafeResourceId(room.studentId)) {
    return { ok: false, reason: 'invalid-room-binding' }
  }
  const binding: OnlineClassroomAttendanceRoomBinding = {
    bookingId: room.bookingId,
    sessionKey: input.roomDocumentId,
    roomName: input.expectedRoomName,
    teacherId: room.teacherId,
    studentId: room.studentId,
  }
  if (input.bookingDocumentId === undefined && input.bookingData === undefined) {
    return { ok: true, binding }
  }
  if (input.bookingDocumentId !== binding.bookingId
    || !isRecord(input.bookingData)
    || input.bookingData.teacherId !== binding.teacherId
    || input.bookingData.studentId !== binding.studentId) {
    return { ok: false, reason: 'booking-room-identity-mismatch' }
  }
  return { ok: true, binding }
}

export function resolveOnlineClassroomAttendanceParticipantRole(
  event: OnlineClassroomJaasAttendanceEvent,
  binding: OnlineClassroomAttendanceRoomBinding,
): OnlineClassroomAttendanceParticipantRole {
  if (!event.data.id) return 'unknown'
  const teacherUserId = pseudonymousJaasUserId(
    event.appId,
    event.roomAlias,
    `teacher:${binding.teacherId}`,
  )
  if (event.data.id === teacherUserId) return 'teacher'
  const studentUserId = pseudonymousJaasUserId(
    event.appId,
    event.roomAlias,
    `student:${binding.studentId}`,
  )
  return event.data.id === studentUserId ? 'student' : 'unknown'
}

export function onlineClassroomJaasAttendanceEventDocumentId(idempotencyKey: string): string {
  return `jaas_${createHash('sha256').update(idempotencyKey, 'utf8').digest('hex')}`
}

export function onlineClassroomJaasAttendanceEventFingerprint(
  event: OnlineClassroomJaasAttendanceEvent,
): string {
  return createHash('sha256').update(JSON.stringify({
    eventType: event.eventType,
    idempotencyKey: event.idempotencyKey,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    fqn: event.fqn,
    appId: event.appId,
    roomAlias: event.roomAlias,
    data: event.data,
  }), 'utf8').digest('hex')
}

export function decideOnlineClassroomJaasAttendanceIdempotency(
  existing: boolean,
  existingFingerprint: unknown,
  incomingFingerprint: string,
): 'create' | 'duplicate' | 'conflict' {
  if (!existing) return 'create'
  return existingFingerprint === incomingFingerprint ? 'duplicate' : 'conflict'
}

function reduceParticipantEvent(
  participant: OnlineClassroomAttendanceParticipantSummary,
  eventType: ParticipantEventType,
  timestamp: number,
): OnlineClassroomAttendanceParticipantSummary {
  const next = { ...participant }
  if (eventType === 'PARTICIPANT_JOINED') {
    next.joinEventCount = incrementCounter(next.joinEventCount)
    next.firstJoinedAtMs = earlier(next.firstJoinedAtMs, timestamp)
    next.lastJoinedAtMs = later(next.lastJoinedAtMs, timestamp)
    if (shouldReplaceState(next.presenceStateAtMs, next.presenceStateOrder, timestamp, 1)) {
      next.present = true
      next.presenceStateAtMs = timestamp
      next.presenceStateOrder = 1
      next.presenceStateEventType = eventType
    }
    // Admission to the room is also authoritative evidence that the person is
    // no longer waiting in the lobby, even if LEFT_LOBBY is omitted or delayed.
    if (shouldReplaceState(next.lobbyStateAtMs, next.lobbyStateOrder, timestamp, 3)) {
      next.inLobby = false
      next.lobbyStateAtMs = timestamp
      next.lobbyStateOrder = 3
      next.lobbyStateEventType = eventType
    }
  } else if (eventType === 'PARTICIPANT_LEFT') {
    next.leftEventCount = incrementCounter(next.leftEventCount)
    next.firstLeftAtMs = earlier(next.firstLeftAtMs, timestamp)
    next.lastLeftAtMs = later(next.lastLeftAtMs, timestamp)
    if (shouldReplaceState(next.presenceStateAtMs, next.presenceStateOrder, timestamp, 2)) {
      next.present = false
      next.presenceStateAtMs = timestamp
      next.presenceStateOrder = 2
      next.presenceStateEventType = eventType
    }
  } else if (eventType === 'PARTICIPANT_JOINED_LOBBY') {
    next.lobbyJoinEventCount = incrementCounter(next.lobbyJoinEventCount)
    next.firstLobbyJoinedAtMs = earlier(next.firstLobbyJoinedAtMs, timestamp)
    next.lastLobbyJoinedAtMs = later(next.lastLobbyJoinedAtMs, timestamp)
    if (shouldReplaceState(next.lobbyStateAtMs, next.lobbyStateOrder, timestamp, 1)) {
      next.inLobby = true
      next.lobbyStateAtMs = timestamp
      next.lobbyStateOrder = 1
      next.lobbyStateEventType = eventType
    }
  } else {
    next.lobbyLeftEventCount = incrementCounter(next.lobbyLeftEventCount)
    next.firstLobbyLeftAtMs = earlier(next.firstLobbyLeftAtMs, timestamp)
    next.lastLobbyLeftAtMs = later(next.lastLobbyLeftAtMs, timestamp)
    if (shouldReplaceState(next.lobbyStateAtMs, next.lobbyStateOrder, timestamp, 2)) {
      next.inLobby = false
      next.lobbyStateAtMs = timestamp
      next.lobbyStateOrder = 2
      next.lobbyStateEventType = eventType
    }
  }
  return next
}

function closeParticipantAtRoomDestroyed(
  participant: OnlineClassroomAttendanceParticipantSummary,
  timestamp: number,
): OnlineClassroomAttendanceParticipantSummary {
  const next = { ...participant }
  if (shouldReplaceState(next.presenceStateAtMs, next.presenceStateOrder, timestamp, 3)) {
    next.present = false
    next.presenceStateAtMs = timestamp
    next.presenceStateOrder = 3
    next.presenceStateEventType = 'ROOM_DESTROYED'
  }
  if (shouldReplaceState(next.lobbyStateAtMs, next.lobbyStateOrder, timestamp, 4)) {
    next.inLobby = false
    next.lobbyStateAtMs = timestamp
    next.lobbyStateOrder = 4
    next.lobbyStateEventType = 'ROOM_DESTROYED'
  }
  return next
}

/**
 * Reduce one already-idempotent event into the booking summary. Every state
 * transition is ordered by the provider event timestamp, never arrival time.
 * The immutable event subcollection remains the source for future duration or
 * dispute calculations; this summary deliberately does not mutate payroll.
 */
export function reduceOnlineClassroomAttendanceSummary(
  current: unknown,
  event: OnlineClassroomJaasAttendanceEvent,
  participantRole: OnlineClassroomAttendanceParticipantRole,
): OnlineClassroomAttendanceSummary {
  const next = normalizeOnlineClassroomAttendanceSummary(current)
  next.eventCount = incrementCounter(next.eventCount)
  next.firstEventAtMs = earlier(next.firstEventAtMs, event.timestamp)
  const eventSortKey = onlineClassroomAttendanceEventSortKey(event)
  if (next.lastEventAtMs === null
    || event.timestamp > next.lastEventAtMs
    || (event.timestamp === next.lastEventAtMs && eventSortKey > next.lastEventSortKey)) {
    next.lastEventAtMs = event.timestamp
    next.lastEventSortKey = eventSortKey
    next.lastEventType = event.eventType
    next.lastSessionId = event.sessionId
  }

  if (event.data.isBreakout) {
    next.breakoutEventCount = incrementCounter(next.breakoutEventCount)
    return next
  }

  if (event.eventType === 'ROOM_CREATED') {
    next.roomCreatedEventCount = incrementCounter(next.roomCreatedEventCount)
    next.roomCreatedAtMs = earlier(next.roomCreatedAtMs, event.timestamp)
    if (shouldReplaceState(next.roomStateAtMs, next.roomStateOrder, event.timestamp, 1)) {
      next.roomOpen = true
      next.roomStateAtMs = event.timestamp
      next.roomStateOrder = 1
      next.roomStateEventType = event.eventType
    }
  } else if (event.eventType === 'ROOM_DESTROYED') {
    next.roomDestroyedEventCount = incrementCounter(next.roomDestroyedEventCount)
    next.roomDestroyedAtMs = later(next.roomDestroyedAtMs, event.timestamp)
    if (shouldReplaceState(next.roomStateAtMs, next.roomStateOrder, event.timestamp, 2)) {
      next.roomOpen = false
      next.roomStateAtMs = event.timestamp
      next.roomStateOrder = 2
      next.roomStateEventType = event.eventType
    }
    next.teacher = closeParticipantAtRoomDestroyed(next.teacher, event.timestamp)
    next.student = closeParticipantAtRoomDestroyed(next.student, event.timestamp)
  } else if (participantRole === 'teacher' || participantRole === 'student') {
    next[participantRole] = reduceParticipantEvent(
      next[participantRole],
      event.eventType,
      event.timestamp,
    )
  } else if (PARTICIPANT_EVENT_TYPES.has(event.eventType)) {
    next.unknownParticipantEventCount = incrementCounter(next.unknownParticipantEventCount)
  }
  return next
}

/** Flat compatibility projection consumed by the Admin operations read model. */
export function projectOnlineClassroomAttendanceSummary(
  value: unknown,
  scheduledStartsAtMs?: number | null,
): OnlineClassroomAttendanceProjection {
  const summary = normalizeOnlineClassroomAttendanceSummary(value)
  const status = summary.roomStateEventType === 'ROOM_DESTROYED'
    ? 'ended'
    : summary.roomOpen
      ? 'live'
      : null
  const validScheduledStart = safeTimestamp(scheduledStartsAtMs) ? scheduledStartsAtMs : null
  const teacherLateSeconds = validScheduledStart !== null && summary.teacher.firstJoinedAtMs !== null
    ? Math.max(0, Math.floor((summary.teacher.firstJoinedAtMs - validScheduledStart) / 1000))
    : null
  return {
    status,
    teacherFirstJoinedAtMs: summary.teacher.firstJoinedAtMs,
    teacherLastLeftAtMs: summary.teacher.lastLeftAtMs,
    teacherJoinCount: summary.teacher.joinEventCount,
    studentFirstJoinedAtMs: summary.student.firstJoinedAtMs,
    studentLastLeftAtMs: summary.student.lastLeftAtMs,
    studentJoinCount: summary.student.joinEventCount,
    teacherLateSeconds,
  }
}
