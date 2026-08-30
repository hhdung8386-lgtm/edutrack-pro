import { createHash } from 'node:crypto'

export const ONLINE_CLASSROOM_ACCESS_COLLECTION = 'onlineClassroomPilotAccess'
export const ONLINE_CLASSROOM_ROOMS_COLLECTION = 'onlineClassrooms'
export const ONLINE_CLASSROOM_BOOKING_CONTROLS_COLLECTION = 'onlineClassroomBookingControls'
export const ONLINE_CLASSROOM_TOKENS_COLLECTION = 'onlineClassroomTokens'
export const ONLINE_CLASSROOM_TOKEN_BYTES = 24
export const ONLINE_CLASSROOM_JOIN_EARLY_MS = 12 * 60 * 60 * 1000
export const ONLINE_CLASSROOM_MAX_EXTENSION_MINUTES = 10
export const ONLINE_CLASSROOM_MAX_EXTENSION_MS = ONLINE_CLASSROOM_MAX_EXTENSION_MINUTES * 60 * 1000
export const ONLINE_CLASSROOM_BOARD_OPERATION_MAX_BYTES = 48_000
export const ONLINE_CLASSROOM_BOARD_MAX_BYTES = 500_000
export const ONLINE_CLASSROOM_BOARD_MAX_OPERATIONS = 1_500
export const ONLINE_CLASSROOM_SCREEN_ANNOTATION_SURFACE_DOCUMENT = 'screen-share'
// Callable timeout is currently 30 seconds. Keeping the credential lease well
// beyond that timeout prevents an expired owner from resuming while a newer
// invocation is changing the same Firebase Auth account.
export const ONLINE_CLASSROOM_CREDENTIAL_ROTATION_LEASE_MS = 2 * 60 * 1000

export type OnlineClassroomTargetType = 'teacher' | 'student'
export type OnlineClassroomBoardAuthorRole = 'admin' | 'teacher' | 'student'
export type OnlineClassroomCredentialMutationState = 'rotating' | 'recovering'

export type OnlineClassroomTrustedActor =
  | { role: 'admin' }
  | { role: 'teacher'; teacherId: string }

export type OnlineClassroomInviteIssuanceDecision =
  | 'allowed'
  | 'untrusted-actor'
  | 'teacher-not-assigned'
  | 'outside-join-window'

export type OnlineClassroomSessionTiming = {
  scheduledStartsAt: Date
  scheduledEndsAt: Date
  hardEndsAt: Date
  extensionMinutes: number
}

export type OnlineClassroomBookingExtensionState = {
  extensionMinutes: number
  extensionUsed: boolean
}

export type OnlineClassroomBoardPoint = {
  x: number
  y: number
}

type OnlineClassroomBoardOperationAuthor = {
  id: string
  authorRole: OnlineClassroomBoardAuthorRole
  createdAt: number
}

export type OnlineClassroomBoardStrokeOperation = OnlineClassroomBoardOperationAuthor & {
  kind: 'stroke'
  tool: 'pen' | 'highlighter' | 'eraser'
  color: string
  width: number
  opacity: number
  points: OnlineClassroomBoardPoint[]
}

export type OnlineClassroomBoardShapeOperation = OnlineClassroomBoardOperationAuthor & {
  kind: 'shape'
  shape: 'rectangle' | 'ellipse' | 'arrow'
  color: string
  width: number
  opacity: number
  start: OnlineClassroomBoardPoint
  end: OnlineClassroomBoardPoint
}

export type OnlineClassroomBoardTextOperation = OnlineClassroomBoardOperationAuthor & {
  kind: 'text'
  color: string
  fontSize: number
  point: OnlineClassroomBoardPoint
  text: string
}

export type OnlineClassroomBoardOperation =
  | OnlineClassroomBoardStrokeOperation
  | OnlineClassroomBoardShapeOperation
  | OnlineClassroomBoardTextOperation

export type OnlineClassroomBookingLike = {
  id: string
  status?: string
  lessonId?: string
  teacherId?: string
  studentId?: string
  subjectId?: string
  requestedDate?: string
  requestedStart?: string
  requestedEnd?: string
  groupClassId?: string
}

export type OnlineClassroomBoardSnapshot = {
  version: number
  generation: number
  studentCanWrite: boolean
  operations: OnlineClassroomBoardOperation[]
}

export type OnlineClassroomBoardDraft = Omit<OnlineClassroomBoardSnapshot, 'version'>

export type OnlineClassroomScreenAnnotationSession = {
  sessionId: string
  active: boolean
  boardSnapshot: OnlineClassroomBoardSnapshot
  startedAtMs?: number
  updatedAtMs?: number
  endedAtMs?: number | null
  startedByRole?: 'admin' | 'teacher'
  startedById?: string
  updatedByRole?: OnlineClassroomBoardAuthorRole
  updatedById?: string
}

export type OnlineClassroomScreenAnnotationSessionDecision =
  | 'allowed'
  | 'missing'
  | 'inactive'
  | 'session-mismatch'

export type OnlineClassroomBoardSaveDecision = 'write' | 'noop' | 'conflict'

export type OnlineClassroomBoardAppendDecision =
  | 'append'
  | 'duplicate'
  | 'locked'
  | 'stale-generation'
  | 'max-operations'
  | 'max-bytes'
  | 'conflict'

export type OnlineClassroomBoardAppendResult = {
  decision: OnlineClassroomBoardAppendDecision
  boardSnapshot: OnlineClassroomBoardSnapshot
  operation: OnlineClassroomBoardOperation
}

export type OnlineClassroomInviteLike = {
  bookingId?: unknown
  sessionKey?: unknown
  studentId?: unknown
  studentPilotGeneration?: unknown
  teacherPilotGeneration?: unknown
}

export type OnlineClassroomReminderBookingLike = {
  id: string
  lessonId?: string
  studentId?: string
  teacherId?: string
  requestedDate?: string
  requestedStart?: string
  groupClassId?: string
}

export function onlineClassroomAccessGeneration(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
}

export function onlineClassroomCredentialRotationFence(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
}

function optionalTimeToMillis(value: unknown): number | null {
  if (Number.isSafeInteger(value) && Number(value) >= 0) return Number(value)
  if (!value || typeof value !== 'object' || typeof (value as { toMillis?: unknown }).toMillis !== 'function') {
    return null
  }
  try {
    const millis = (value as { toMillis: () => number }).toMillis()
    return Number.isSafeInteger(millis) && millis >= 0 ? millis : null
  } catch {
    return null
  }
}

/**
 * A malformed active marker is intentionally not stealable. This preserves a
 * fail-closed boundary during rolling deploys from the older nonce-only
 * implementation; a stale malformed marker requires explicit operational
 * repair instead of guessing that no Auth writer is still alive.
 */
export function canAcquireOnlineClassroomCredentialMutation(
  access: unknown,
  now: number = Date.now(),
): boolean {
  if (!isRecord(access)) return true
  if (!['rotating', 'recovering', 'rotation_cooldown', 'recovery_cooldown']
    .includes(String(access.credentialRotationState))) return true
  if (!isSafeClassroomId(access.credentialRotationNonce)
    || onlineClassroomCredentialRotationFence(access.credentialRotationFence) < 1) {
    const legacyUpdatedAt = optionalTimeToMillis(access.updatedAt)
    return access.credentialRotationState === 'rotating'
      && legacyUpdatedAt !== null
      && legacyUpdatedAt + ONLINE_CLASSROOM_CREDENTIAL_ROTATION_LEASE_MS <= now
  }
  const expiresAt = optionalTimeToMillis(access.credentialRotationLeaseExpiresAt)
  return expiresAt !== null && expiresAt <= now
}

export function onlineClassroomCredentialMutationMatches(
  access: unknown,
  expected: {
    state: OnlineClassroomCredentialMutationState
    nonce: string
    fence: number
  },
  now: number = Date.now(),
): boolean {
  if (!isRecord(access)
    || !isSafeClassroomId(expected.nonce)
    || !Number.isSafeInteger(expected.fence)
    || expected.fence < 1
    || access.credentialRotationState !== expected.state
    || access.credentialRotationNonce !== expected.nonce
    || access.credentialRotationFence !== expected.fence) return false
  const expiresAt = optionalTimeToMillis(access.credentialRotationLeaseExpiresAt)
  return expiresAt !== null && expiresAt > now
}

export function nextOnlineClassroomAccessGeneration(
  currentValue: unknown,
  currentEnabled: boolean,
  nextEnabled: boolean,
): number {
  const current = onlineClassroomAccessGeneration(currentValue)
  return currentEnabled === nextEnabled ? current : current + 1
}

export function onlineClassroomInvitePredatesGeneration(
  invite: OnlineClassroomInviteLike,
  targetType: OnlineClassroomTargetType,
  generation: number,
): boolean {
  const value = targetType === 'student'
    ? invite.studentPilotGeneration
    : invite.teacherPilotGeneration
  const inviteGeneration = Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : -1
  return inviteGeneration < onlineClassroomAccessGeneration(generation)
}

export function onlineClassroomAccessId(type: OnlineClassroomTargetType, id: string): string {
  return `${type}_${id}`
}

export function isSafeClassroomId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 160
    && !value.includes('/')
}

/**
 * A teacher link stored only on users/{uid} is not an authorization boundary:
 * legacy Firestore rules allow a teacher to update that document. The teacher
 * profile owns the canonical login UID and its rules do not allow teachers to
 * edit that field, so privileged classroom actions must require both sides to
 * match. Legacy profiles without a canonical UID fail closed and can be fixed
 * with the existing Admin "Khôi phục đăng nhập" flow.
 */
export function resolveOnlineClassroomTrustedActor(
  uid: string,
  user: unknown,
  teacher: unknown,
): OnlineClassroomTrustedActor | null {
  if (!uid || !isRecord(user)) return null
  if (user.role === 'admin') return { role: 'admin' }
  if (user.role !== 'teacher' || !isSafeClassroomId(user.teacherId) || !isRecord(teacher)) return null
  return teacher.loginAccountUid === uid
    ? { role: 'teacher', teacherId: user.teacherId }
    : null
}

/**
 * Admins may prepare an invite before the room opens. A teacher may issue one
 * only for their own booking while that booking's join window is active. The
 * caller must pass a trusted actor resolved through the canonical teacher UID
 * boundary above; null deliberately fails closed.
 */
export function decideOnlineClassroomInviteIssuance(
  actor: OnlineClassroomTrustedActor | null,
  booking: OnlineClassroomBookingLike,
  nowMs: number,
  extensionMinutes = 0,
): OnlineClassroomInviteIssuanceDecision {
  if (!actor) return 'untrusted-actor'
  if (actor.role === 'admin') return 'allowed'
  if (actor.teacherId !== booking.teacherId) return 'teacher-not-assigned'
  return isInsideOnlineClassroomJoinWindow(booking, nowMs, extensionMinutes)
    ? 'allowed'
    : 'outside-join-window'
}

export function onlineClassroomSessionKey(
  booking: OnlineClassroomBookingLike,
  studentPilotGeneration = 0,
  teacherPilotGeneration = 0,
): string {
  const identity = [
    booking.id,
    booking.studentId || '',
    booking.teacherId || '',
    booking.subjectId || '',
    booking.requestedDate || '',
    booking.requestedStart || '',
    booking.requestedEnd || '',
    String(onlineClassroomAccessGeneration(studentPilotGeneration)),
    String(onlineClassroomAccessGeneration(teacherPilotGeneration)),
  ].join('|')
  return createHash('sha256').update(identity, 'utf8').digest('hex').slice(0, 40)
}

export function partitionOnlineClassroomReminderBookings<T extends OnlineClassroomReminderBookingLike>(
  bookings: T[],
  enabledAccessIds: ReadonlySet<string>,
): { pilot: T[]; legacy: T[] } {
  const pilot: T[] = []
  const legacy: T[] = []
  for (const booking of bookings) {
    const enabled = Boolean(
      booking.studentId
      && booking.teacherId
      && !booking.lessonId
      && !booking.groupClassId
      && enabledAccessIds.has(onlineClassroomAccessId('student', booking.studentId)),
    )
    ;(enabled ? pilot : legacy).push(booking)
  }
  return { pilot, legacy }
}

export function onlineClassroomPilotReminderDeliveryId(
  booking: OnlineClassroomReminderBookingLike,
  reminderType: string,
  studentPilotGeneration?: number,
  teacherPilotGeneration?: number,
): string {
  const businessKey = [
    booking.id,
    booking.studentId || '',
    booking.teacherId || '',
    booking.requestedDate || '',
    booking.requestedStart || '',
    reminderType,
    // Keep the legacy value byte-for-byte stable until the reminder worker is
    // upgraded to pass generations. Once supplied, rotating either pilot
    // access reissues the email with the new private room link.
    ...(studentPilotGeneration === undefined && teacherPilotGeneration === undefined
      ? []
      : [
        String(onlineClassroomAccessGeneration(studentPilotGeneration)),
        String(onlineClassroomAccessGeneration(teacherPilotGeneration)),
      ]),
  ].join('|')
  const digest = createHash('sha256').update(businessKey, 'utf8').digest('hex').slice(0, 32)
  return `pilot_${digest}_${reminderType}`
}

export function onlineClassroomTokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function onlineClassroomInviteMatches(
  invite: OnlineClassroomInviteLike,
  bookingId: string,
  sessionKey: string,
  studentId: string,
  studentPilotGeneration: number,
  teacherPilotGeneration: number,
): boolean {
  return invite.bookingId === bookingId
    && invite.sessionKey === sessionKey
    && invite.studentId === studentId
    && invite.studentPilotGeneration === studentPilotGeneration
    && invite.teacherPilotGeneration === teacherPilotGeneration
}

export function parseVietnamBookingTime(dateISO?: string, time?: string): Date | null {
  if (!dateISO || !time || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || !/^\d{1,2}:[0-5]\d$/.test(time)) return null
  const [year, month, day] = dateISO.split('-').map(Number)
  const [rawHour, minute] = time.split(':').map(Number)
  if (!year || !month || !day || !Number.isInteger(rawHour) || !Number.isInteger(minute)
    || rawHour < 0 || rawHour > 25 || minute < 0 || minute > 59) return null

  // Date.UTC rolls invalid dates (for example 2026-02-30) into the next month.
  // Reject that normalization so a malformed booking cannot silently open a
  // classroom on a different calendar day.
  const calendarDate = new Date(Date.UTC(year, month - 1, day))
  if (!Number.isFinite(calendarDate.getTime())
    || calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day) return null

  // Booking UI uses an extended wall clock after midnight (24:30, 25:00,
  // ...). Convert that convention explicitly instead of relying on Date.UTC
  // to normalize an invalid clock value implicitly.
  const totalMinutes = rawHour * 60 + minute
  const dayOffset = Math.floor(totalMinutes / (24 * 60))
  const minuteOfDay = totalMinutes % (24 * 60)
  const hourOfDay = Math.floor(minuteOfDay / 60)
  const minuteOfHour = minuteOfDay % 60
  return new Date(Date.UTC(year, month - 1, day + dayOffset, hourOfDay - 7, minuteOfHour))
}

export function normalizeOnlineClassroomExtensionMinutes(value: unknown): number {
  return Number.isSafeInteger(value)
    && Number(value) >= 0
    && Number(value) <= ONLINE_CLASSROOM_MAX_EXTENSION_MINUTES
    ? Number(value)
    : 0
}

function parseOnlineClassroomExtensionState(
  value: { extensionMinutes?: unknown; extensionUsed?: unknown } | null | undefined,
): OnlineClassroomBookingExtensionState | null {
  if (!value) return { extensionMinutes: 0, extensionUsed: false }
  if (value.extensionMinutes !== undefined
    && (!Number.isSafeInteger(value.extensionMinutes)
      || Number(value.extensionMinutes) < 0
      || Number(value.extensionMinutes) > ONLINE_CLASSROOM_MAX_EXTENSION_MINUTES)) {
    return null
  }
  if (value.extensionUsed !== undefined && typeof value.extensionUsed !== 'boolean') return null
  const extensionMinutes = normalizeOnlineClassroomExtensionMinutes(value.extensionMinutes)
  const extensionUsed = value.extensionUsed === true || extensionMinutes > 0
  // `used` without a duration cannot enforce the effective hard end and is a
  // partial/corrupt write, so callers must fail closed rather than guessing.
  if (extensionUsed && extensionMinutes === 0) return null
  return { extensionMinutes, extensionUsed }
}

/**
 * Resolve the booking-scoped control together with a generation-scoped room.
 * Either side may be absent during rollout, but two different non-zero values
 * are a corruption signal. This lets a legacy extended room seed the central
 * control once without allowing a later pilot generation to reset it to zero.
 */
export function resolveOnlineClassroomBookingExtensionState(
  bookingControl: { extensionMinutes?: unknown; extensionUsed?: unknown } | null | undefined,
  room: { extensionMinutes?: unknown; extensionUsed?: unknown } | null | undefined,
): OnlineClassroomBookingExtensionState | null {
  const controlState = parseOnlineClassroomExtensionState(bookingControl)
  const roomState = parseOnlineClassroomExtensionState(room)
  if (!controlState || !roomState) return null
  if (controlState.extensionMinutes > 0
    && roomState.extensionMinutes > 0
    && controlState.extensionMinutes !== roomState.extensionMinutes) {
    return null
  }
  const extensionMinutes = Math.max(
    controlState.extensionMinutes,
    roomState.extensionMinutes,
  )
  return {
    extensionMinutes,
    extensionUsed: controlState.extensionUsed || roomState.extensionUsed || extensionMinutes > 0,
  }
}

export function onlineClassroomSessionTiming(
  booking: OnlineClassroomBookingLike,
  extensionMinutes: unknown = 0,
): OnlineClassroomSessionTiming | null {
  const start = parseVietnamBookingTime(booking.requestedDate, booking.requestedStart)
  const end = parseVietnamBookingTime(booking.requestedDate, booking.requestedEnd)
  if (!start || !end || end.getTime() <= start.getTime()) return null
  const normalizedExtension = normalizeOnlineClassroomExtensionMinutes(extensionMinutes)
  return {
    scheduledStartsAt: start,
    scheduledEndsAt: end,
    hardEndsAt: new Date(end.getTime() + normalizedExtension * 60_000),
    extensionMinutes: normalizedExtension,
  }
}

export function onlineClassroomSessionExtensionAvailable(
  timing: OnlineClassroomSessionTiming,
  extensionUsed: boolean,
  nowMs: number,
): boolean {
  return !extensionUsed
    && timing.extensionMinutes === 0
    && Number.isFinite(nowMs)
    && nowMs >= timing.scheduledStartsAt.getTime()
    && nowMs < timing.hardEndsAt.getTime()
}

export function onlineClassroomJoinWindow(
  booking: OnlineClassroomBookingLike,
  extensionMinutes: unknown = 0,
): { opensAt: Date; closesAt: Date } | null {
  const timing = onlineClassroomSessionTiming(booking, extensionMinutes)
  if (!timing) return null
  return {
    opensAt: new Date(timing.scheduledStartsAt.getTime() - ONLINE_CLASSROOM_JOIN_EARLY_MS),
    closesAt: timing.hardEndsAt,
  }
}

/**
 * Invitation credentials are issued against the maximum possible hard end so
 * a pre-existing student link remains usable if a manager grants the single
 * extension. Actual room access still checks the persisted extension and
 * therefore fails closed at the scheduled end until that grant exists.
 */
export function onlineClassroomInviteExpiresAt(booking: OnlineClassroomBookingLike): Date | null {
  return onlineClassroomJoinWindow(booking, ONLINE_CLASSROOM_MAX_EXTENSION_MINUTES)?.closesAt || null
}

export function onlineClassroomBookingBlockReason(booking: OnlineClassroomBookingLike): string | null {
  if (booking.status !== 'confirmed') return 'BOOKING_NOT_CONFIRMED'
  if (booking.lessonId) return 'BOOKING_ALREADY_COMPLETED'
  if (!booking.teacherId || !booking.studentId) return 'BOOKING_MISSING_PARTICIPANTS'
  if (booking.groupClassId) return 'GROUP_CLASS_NOT_SUPPORTED'
  if (!onlineClassroomJoinWindow(booking)) return 'BOOKING_TIME_INVALID'
  return null
}

export function isInsideOnlineClassroomJoinWindow(
  booking: OnlineClassroomBookingLike,
  nowMs: number,
  extensionMinutes: unknown = 0,
): boolean {
  const window = onlineClassroomJoinWindow(booking, extensionMinutes)
  // The exact hard-end instant is already closed. This makes the boundary
  // consistent for access, writes, rejoin and the client-side end timer.
  return Boolean(window && nowMs >= window.opensAt.getTime() && nowMs < window.closesAt.getTime())
}

export function sanitizeOnlineClassroomDomain(value: unknown): string {
  if (typeof value !== 'string') return 'meet.jit.si'
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
  return /^[a-z0-9.-]+(?::\d{2,5})?$/.test(domain) ? domain : 'meet.jit.si'
}

export function onlineClassroomStudentJoinUrl(origin: string, bookingId: string, token: string): string {
  const safeOrigin = origin.replace(/\/$/, '')
  return `${safeOrigin}/lop-hoc/${encodeURIComponent(bookingId)}#token=${encodeURIComponent(token)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const expectedKeys = new Set(expected)
  const actualKeys = Object.keys(value)
  return actualKeys.length === expectedKeys.size && actualKeys.every((key) => expectedKeys.has(key))
}

function isFiniteNumberBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

function validateOnlineClassroomBoardPoint(value: unknown): OnlineClassroomBoardPoint | null {
  if (!isRecord(value) || !hasExactKeys(value, ['x', 'y'])) return null
  if (!isFiniteNumberBetween(value.x, 0, 1) || !isFiniteNumberBetween(value.y, 0, 1)) return null
  return { x: value.x, y: value.y }
}

function validateOnlineClassroomBoardOperationAuthor(
  value: Record<string, unknown>,
): OnlineClassroomBoardOperationAuthor | null {
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$/.test(value.id)) return null
  if (value.authorRole !== 'admin' && value.authorRole !== 'teacher' && value.authorRole !== 'student') return null
  if (!Number.isSafeInteger(value.createdAt) || Number(value.createdAt) < 0) return null
  return {
    id: value.id,
    authorRole: value.authorRole as OnlineClassroomBoardAuthorRole,
    createdAt: Number(value.createdAt),
  }
}

function jsonByteLength(value: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return null
  }
}

export function validateOnlineClassroomBoardOperation(value: unknown): OnlineClassroomBoardOperation | null {
  if (!isRecord(value)) return null
  const author = validateOnlineClassroomBoardOperationAuthor(value)
  if (!author) return null
  const color = typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)
    ? value.color.toLowerCase()
    : ''
  if (!color) return null

  let operation: OnlineClassroomBoardOperation | null = null
  if (value.kind === 'stroke') {
    if (!hasExactKeys(value, ['id', 'authorRole', 'createdAt', 'kind', 'tool', 'color', 'width', 'opacity', 'points'])) return null
    if (value.tool !== 'pen' && value.tool !== 'highlighter' && value.tool !== 'eraser') return null
    if (!isFiniteNumberBetween(value.width, 1, 36) || !isFiniteNumberBetween(value.opacity, 0.05, 1)) return null
    if (!Array.isArray(value.points) || value.points.length < 1 || value.points.length > 800) return null
    const points = value.points.map(validateOnlineClassroomBoardPoint)
    if (points.some((point) => !point)) return null
    operation = {
      ...author,
      kind: 'stroke',
      tool: value.tool as OnlineClassroomBoardStrokeOperation['tool'],
      color,
      width: value.width,
      opacity: value.opacity,
      points: points as OnlineClassroomBoardPoint[],
    }
  } else if (value.kind === 'shape') {
    if (!hasExactKeys(value, ['id', 'authorRole', 'createdAt', 'kind', 'shape', 'color', 'width', 'opacity', 'start', 'end'])) return null
    if (value.shape !== 'rectangle' && value.shape !== 'ellipse' && value.shape !== 'arrow') return null
    if (!isFiniteNumberBetween(value.width, 1, 18) || !isFiniteNumberBetween(value.opacity, 0.05, 1)) return null
    const start = validateOnlineClassroomBoardPoint(value.start)
    const end = validateOnlineClassroomBoardPoint(value.end)
    if (!start || !end) return null
    operation = {
      ...author,
      kind: 'shape',
      shape: value.shape as OnlineClassroomBoardShapeOperation['shape'],
      color,
      width: value.width,
      opacity: value.opacity,
      start,
      end,
    }
  } else if (value.kind === 'text') {
    if (!hasExactKeys(value, ['id', 'authorRole', 'createdAt', 'kind', 'color', 'fontSize', 'point', 'text'])) return null
    if (!isFiniteNumberBetween(value.fontSize, 12, 48) || typeof value.text !== 'string') return null
    const point = validateOnlineClassroomBoardPoint(value.point)
    const text = value.text.trim()
    if (!point || text.length < 1 || text.length > 240) return null
    operation = {
      ...author,
      kind: 'text',
      color,
      fontSize: value.fontSize,
      point,
      text,
    }
  }

  if (!operation) return null
  const operationBytes = jsonByteLength(operation)
  return operationBytes !== null && operationBytes <= ONLINE_CLASSROOM_BOARD_OPERATION_MAX_BYTES
    ? operation
    : null
}

function validateOnlineClassroomBoardOperations(value: unknown): OnlineClassroomBoardOperation[] | null {
  if (!Array.isArray(value) || value.length > ONLINE_CLASSROOM_BOARD_MAX_OPERATIONS) return null
  const operations: OnlineClassroomBoardOperation[] = []
  const operationIds = new Set<string>()
  for (const candidate of value) {
    const operation = validateOnlineClassroomBoardOperation(candidate)
    if (!operation || operationIds.has(operation.id)) return null
    operationIds.add(operation.id)
    operations.push(operation)
  }
  return operations
}

export function validateOnlineClassroomBoardSnapshot(value: unknown): OnlineClassroomBoardSnapshot | null {
  if (!isRecord(value)) return null
  const hasGeneration = Object.prototype.hasOwnProperty.call(value, 'generation')
  if (!hasExactKeys(
    value,
    hasGeneration
      ? ['version', 'generation', 'studentCanWrite', 'operations']
      : ['version', 'studentCanWrite', 'operations'],
  )) return null
  if (!Number.isSafeInteger(value.version) || Number(value.version) < 0) return null
  if (hasGeneration && (!Number.isSafeInteger(value.generation) || Number(value.generation) < 0)) return null
  if (typeof value.studentCanWrite !== 'boolean') return null
  const rawEncodedBytes = jsonByteLength(value)
  if (rawEncodedBytes === null || rawEncodedBytes > ONLINE_CLASSROOM_BOARD_MAX_BYTES) return null
  const operations = validateOnlineClassroomBoardOperations(value.operations)
  if (!operations) return null
  const snapshot: OnlineClassroomBoardSnapshot = {
    version: Number(value.version),
    generation: hasGeneration ? Number(value.generation) : 0,
    studentCanWrite: value.studentCanWrite,
    operations,
  }
  const encodedBytes = jsonByteLength(snapshot)
  return encodedBytes !== null && encodedBytes <= ONLINE_CLASSROOM_BOARD_MAX_BYTES ? snapshot : null
}

export function validateOnlineClassroomBoardDraft(value: unknown): OnlineClassroomBoardDraft | null {
  if (!isRecord(value)) return null
  const hasGeneration = Object.prototype.hasOwnProperty.call(value, 'generation')
  if (!hasExactKeys(
    value,
    hasGeneration
      ? ['generation', 'studentCanWrite', 'operations']
      : ['studentCanWrite', 'operations'],
  )) return null
  if (hasGeneration && (!Number.isSafeInteger(value.generation) || Number(value.generation) < 0)) return null
  if (typeof value.studentCanWrite !== 'boolean') return null
  const rawEncodedBytes = jsonByteLength(value)
  if (rawEncodedBytes === null || rawEncodedBytes > ONLINE_CLASSROOM_BOARD_MAX_BYTES) return null
  const operations = validateOnlineClassroomBoardOperations(value.operations)
  if (!operations) return null
  const draft: OnlineClassroomBoardDraft = {
    generation: hasGeneration ? Number(value.generation) : 0,
    studentCanWrite: value.studentCanWrite,
    operations,
  }
  const encodedBytes = jsonByteLength(draft)
  return encodedBytes !== null && encodedBytes <= ONLINE_CLASSROOM_BOARD_MAX_BYTES ? draft : null
}

export function validateOnlineClassroomScreenAnnotationSession(
  value: unknown,
): OnlineClassroomScreenAnnotationSession | null {
  if (!isRecord(value)) return null
  const requiredKeys = ['sessionId', 'active', 'boardSnapshot']
  const optionalAuditKeys = [
    'startedAtMs',
    'updatedAtMs',
    'endedAtMs',
    'startedByRole',
    'startedById',
    'updatedByRole',
    'updatedById',
  ]
  const allowedKeys = new Set([...requiredKeys, ...optionalAuditKeys])
  const actualKeys = Object.keys(value)
  if (!requiredKeys.every((key) => actualKeys.includes(key))
    || actualKeys.some((key) => !allowedKeys.has(key))) return null
  if (!isSafeOnlineClassroomScreenAnnotationSessionId(value.sessionId)
    || typeof value.active !== 'boolean') return null
  const boardSnapshot = validateOnlineClassroomBoardSnapshot(value.boardSnapshot)
  if (!boardSnapshot) return null

  const hasKey = (key: string) => Object.prototype.hasOwnProperty.call(value, key)
  const hasStartedAt = hasKey('startedAtMs')
  const hasUpdatedAt = hasKey('updatedAtMs')
  const hasEndedAt = hasKey('endedAtMs')
  const hasStartedByRole = hasKey('startedByRole')
  const hasStartedById = hasKey('startedById')
  const hasUpdatedByRole = hasKey('updatedByRole')
  const hasUpdatedById = hasKey('updatedById')

  if ((hasStartedAt && (!Number.isSafeInteger(value.startedAtMs) || Number(value.startedAtMs) < 0))
    || (hasUpdatedAt && (!Number.isSafeInteger(value.updatedAtMs) || Number(value.updatedAtMs) < 0))
    || (hasEndedAt && !(value.endedAtMs === null
      || (Number.isSafeInteger(value.endedAtMs) && Number(value.endedAtMs) >= 0)))
    || hasStartedByRole !== hasStartedById
    || hasUpdatedByRole !== hasUpdatedById
    || hasStartedAt !== hasStartedByRole
    || hasUpdatedAt !== hasUpdatedByRole
    || (hasEndedAt && !hasUpdatedAt)
    || (hasStartedByRole && !['admin', 'teacher'].includes(String(value.startedByRole)))
    || (hasStartedById && !isSafeClassroomId(value.startedById))
    || (hasUpdatedByRole && !['admin', 'teacher', 'student'].includes(String(value.updatedByRole)))
    || (hasUpdatedById && !isSafeClassroomId(value.updatedById))) return null

  const startedAtMs = hasStartedAt ? Number(value.startedAtMs) : null
  const updatedAtMs = hasUpdatedAt ? Number(value.updatedAtMs) : null
  const endedAtMs = hasEndedAt && value.endedAtMs !== null ? Number(value.endedAtMs) : null
  if ((startedAtMs !== null && updatedAtMs !== null && updatedAtMs < startedAtMs)
    || (startedAtMs !== null && endedAtMs !== null && endedAtMs < startedAtMs)
    || (updatedAtMs !== null && endedAtMs !== null && endedAtMs < updatedAtMs)
    || (hasEndedAt && value.active && value.endedAtMs !== null)
    || (hasEndedAt && !value.active && value.endedAtMs === null)) return null

  return {
    sessionId: value.sessionId,
    active: value.active,
    boardSnapshot,
    ...(hasStartedAt ? { startedAtMs: Number(value.startedAtMs) } : {}),
    ...(hasUpdatedAt ? { updatedAtMs: Number(value.updatedAtMs) } : {}),
    ...(hasEndedAt ? { endedAtMs: value.endedAtMs === null ? null : Number(value.endedAtMs) } : {}),
    ...(hasStartedByRole ? {
      startedByRole: value.startedByRole as 'admin' | 'teacher',
      startedById: value.startedById as string,
    } : {}),
    ...(hasUpdatedByRole ? {
      updatedByRole: value.updatedByRole as OnlineClassroomBoardAuthorRole,
      updatedById: value.updatedById as string,
    } : {}),
  }
}

export function isSafeOnlineClassroomScreenAnnotationSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{15,119}$/.test(value)
}

export function decideOnlineClassroomScreenAnnotationSessionMutation(
  current: OnlineClassroomScreenAnnotationSession | null,
  expectedSessionId: unknown,
): OnlineClassroomScreenAnnotationSessionDecision {
  if (!current) return 'missing'
  if (typeof expectedSessionId !== 'string' || expectedSessionId !== current.sessionId) {
    return 'session-mismatch'
  }
  return current.active ? 'allowed' : 'inactive'
}

export function decideOnlineClassroomBoardOperationAppend(
  current: OnlineClassroomBoardSnapshot | null,
  operation: OnlineClassroomBoardOperation,
  viewerRole: OnlineClassroomBoardAuthorRole,
  expectedGeneration: number = 0,
): OnlineClassroomBoardAppendResult {
  const boardSnapshot = current
    ? { ...current, generation: Number.isSafeInteger(current.generation) ? current.generation : 0 }
    : { version: 0, generation: 0, studentCanWrite: true, operations: [] }
  const authoritativeOperation: OnlineClassroomBoardOperation = { ...operation, authorRole: viewerRole }
  const duplicate = boardSnapshot.operations.find((candidate) => candidate.id === authoritativeOperation.id)
  if (duplicate) {
    return {
      decision: JSON.stringify(duplicate) === JSON.stringify(authoritativeOperation) ? 'duplicate' : 'conflict',
      boardSnapshot,
      operation: authoritativeOperation,
    }
  }
  if (!Number.isSafeInteger(expectedGeneration)
    || expectedGeneration < 0
    || expectedGeneration !== boardSnapshot.generation) {
    return { decision: 'stale-generation', boardSnapshot, operation: authoritativeOperation }
  }
  if (viewerRole === 'student' && !boardSnapshot.studentCanWrite) {
    return { decision: 'locked', boardSnapshot, operation: authoritativeOperation }
  }
  if (boardSnapshot.operations.length >= ONLINE_CLASSROOM_BOARD_MAX_OPERATIONS) {
    return { decision: 'max-operations', boardSnapshot, operation: authoritativeOperation }
  }
  if (!Number.isSafeInteger(boardSnapshot.version + 1)) {
    return { decision: 'conflict', boardSnapshot, operation: authoritativeOperation }
  }

  const nextSnapshot: OnlineClassroomBoardSnapshot = {
    ...boardSnapshot,
    version: boardSnapshot.version + 1,
    operations: [...boardSnapshot.operations, authoritativeOperation],
  }
  const encodedBytes = jsonByteLength(nextSnapshot)
  if (encodedBytes === null || encodedBytes > ONLINE_CLASSROOM_BOARD_MAX_BYTES) {
    return { decision: 'max-bytes', boardSnapshot, operation: authoritativeOperation }
  }
  return { decision: 'append', boardSnapshot: nextSnapshot, operation: authoritativeOperation }
}

export function decideOnlineClassroomBoardSave(
  current: OnlineClassroomBoardSnapshot | null,
  expectedVersion: number,
  next: OnlineClassroomBoardDraft,
): OnlineClassroomBoardSaveDecision {
  const nextGeneration = Number.isSafeInteger(next.generation) ? next.generation : 0
  const normalizedNext: OnlineClassroomBoardDraft = { ...next, generation: nextGeneration }
  const currentVersion = current?.version ?? 0
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion !== currentVersion) return 'conflict'
  if (!current) return nextGeneration === 0 ? 'write' : 'conflict'
  const currentGeneration = Number.isSafeInteger(current.generation) ? current.generation : 0

  // Version authority stays on the server. A client may only prove which
  // snapshot it read (expectedVersion) and submit the next content.
  const currentDraft: OnlineClassroomBoardDraft = {
    generation: currentGeneration,
    studentCanWrite: current.studentCanWrite,
    operations: current.operations,
  }
  const operationsChanged = JSON.stringify(current.operations) !== JSON.stringify(normalizedNext.operations)
  const nextOperationIds = new Set(normalizedNext.operations.map((operation) => operation.id))
  const removesStoredOperation = current.operations.some((operation) => !nextOperationIds.has(operation.id))
  // Removing even one stored operation is a destructive board boundary. It
  // must advance the generation so an append dispatched before undo/clear
  // cannot arrive later and resurrect content that a manager removed.
  if (removesStoredOperation) {
    if (nextGeneration !== currentGeneration + 1) return 'conflict'
  } else if (nextGeneration !== currentGeneration) return 'conflict'
  const sameContent = currentDraft.generation === normalizedNext.generation
    && currentDraft.studentCanWrite === normalizedNext.studentCanWrite
    && !operationsChanged
  return sameContent ? 'noop' : 'write'
}
