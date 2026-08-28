import { createHash } from 'node:crypto'

export const ONLINE_CLASSROOM_ACCESS_COLLECTION = 'onlineClassroomPilotAccess'
export const ONLINE_CLASSROOM_ROOMS_COLLECTION = 'onlineClassrooms'
export const ONLINE_CLASSROOM_TOKENS_COLLECTION = 'onlineClassroomTokens'
export const ONLINE_CLASSROOM_TOKEN_BYTES = 24
export const ONLINE_CLASSROOM_JOIN_EARLY_MS = 12 * 60 * 60 * 1000
export const ONLINE_CLASSROOM_JOIN_LATE_MS = 6 * 60 * 60 * 1000
export const ONLINE_CLASSROOM_BOARD_OPERATION_MAX_BYTES = 48_000
export const ONLINE_CLASSROOM_BOARD_MAX_BYTES = 500_000
export const ONLINE_CLASSROOM_BOARD_MAX_OPERATIONS = 1_500

export type OnlineClassroomTargetType = 'teacher' | 'student'
export type OnlineClassroomBoardAuthorRole = 'admin' | 'teacher' | 'student'

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
  studentCanWrite: boolean
  operations: OnlineClassroomBoardOperation[]
}

export type OnlineClassroomBoardDraft = Omit<OnlineClassroomBoardSnapshot, 'version'>

export type OnlineClassroomBoardSaveDecision = 'write' | 'noop' | 'conflict'

export type OnlineClassroomBoardAppendDecision =
  | 'append'
  | 'duplicate'
  | 'locked'
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
  studentId?: string
  teacherId?: string
  requestedDate?: string
  requestedStart?: string
}

export function onlineClassroomAccessGeneration(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
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
      && enabledAccessIds.has(onlineClassroomAccessId('student', booking.studentId))
      && enabledAccessIds.has(onlineClassroomAccessId('teacher', booking.teacherId)),
    )
    ;(enabled ? pilot : legacy).push(booking)
  }
  return { pilot, legacy }
}

export function onlineClassroomPilotReminderDeliveryId(
  booking: OnlineClassroomReminderBookingLike,
  reminderType: string,
): string {
  const businessKey = [
    booking.id,
    booking.studentId || '',
    booking.teacherId || '',
    booking.requestedDate || '',
    booking.requestedStart || '',
    reminderType,
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

export function onlineClassroomJoinWindow(booking: OnlineClassroomBookingLike): { opensAt: Date; closesAt: Date } | null {
  const start = parseVietnamBookingTime(booking.requestedDate, booking.requestedStart)
  const end = parseVietnamBookingTime(booking.requestedDate, booking.requestedEnd)
  if (!start || !end || end.getTime() <= start.getTime()) return null
  return {
    opensAt: new Date(start.getTime() - ONLINE_CLASSROOM_JOIN_EARLY_MS),
    closesAt: new Date(end.getTime() + ONLINE_CLASSROOM_JOIN_LATE_MS),
  }
}

export function onlineClassroomBookingBlockReason(booking: OnlineClassroomBookingLike): string | null {
  if (booking.status !== 'confirmed') return 'BOOKING_NOT_CONFIRMED'
  if (booking.lessonId) return 'BOOKING_ALREADY_COMPLETED'
  if (!booking.teacherId || !booking.studentId) return 'BOOKING_MISSING_PARTICIPANTS'
  if (booking.groupClassId) return 'GROUP_CLASS_NOT_SUPPORTED'
  if (!onlineClassroomJoinWindow(booking)) return 'BOOKING_TIME_INVALID'
  return null
}

export function isInsideOnlineClassroomJoinWindow(booking: OnlineClassroomBookingLike, nowMs: number): boolean {
  const window = onlineClassroomJoinWindow(booking)
  return Boolean(window && nowMs >= window.opensAt.getTime() && nowMs <= window.closesAt.getTime())
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
  if (!isRecord(value) || !hasExactKeys(value, ['version', 'studentCanWrite', 'operations'])) return null
  if (!Number.isSafeInteger(value.version) || Number(value.version) < 0) return null
  if (typeof value.studentCanWrite !== 'boolean') return null
  const rawEncodedBytes = jsonByteLength(value)
  if (rawEncodedBytes === null || rawEncodedBytes > ONLINE_CLASSROOM_BOARD_MAX_BYTES) return null
  const operations = validateOnlineClassroomBoardOperations(value.operations)
  if (!operations) return null
  const snapshot: OnlineClassroomBoardSnapshot = {
    version: Number(value.version),
    studentCanWrite: value.studentCanWrite,
    operations,
  }
  const encodedBytes = jsonByteLength(snapshot)
  return encodedBytes !== null && encodedBytes <= ONLINE_CLASSROOM_BOARD_MAX_BYTES ? snapshot : null
}

export function validateOnlineClassroomBoardDraft(value: unknown): OnlineClassroomBoardDraft | null {
  if (!isRecord(value) || !hasExactKeys(value, ['studentCanWrite', 'operations'])) return null
  if (typeof value.studentCanWrite !== 'boolean') return null
  const rawEncodedBytes = jsonByteLength(value)
  if (rawEncodedBytes === null || rawEncodedBytes > ONLINE_CLASSROOM_BOARD_MAX_BYTES) return null
  const operations = validateOnlineClassroomBoardOperations(value.operations)
  if (!operations) return null
  const draft: OnlineClassroomBoardDraft = {
    studentCanWrite: value.studentCanWrite,
    operations,
  }
  const encodedBytes = jsonByteLength(draft)
  return encodedBytes !== null && encodedBytes <= ONLINE_CLASSROOM_BOARD_MAX_BYTES ? draft : null
}

export function decideOnlineClassroomBoardOperationAppend(
  current: OnlineClassroomBoardSnapshot | null,
  operation: OnlineClassroomBoardOperation,
  viewerRole: OnlineClassroomBoardAuthorRole,
): OnlineClassroomBoardAppendResult {
  const boardSnapshot = current || { version: 0, studentCanWrite: true, operations: [] }
  const authoritativeOperation: OnlineClassroomBoardOperation = { ...operation, authorRole: viewerRole }
  const duplicate = boardSnapshot.operations.find((candidate) => candidate.id === authoritativeOperation.id)
  if (duplicate) {
    return {
      decision: JSON.stringify(duplicate) === JSON.stringify(authoritativeOperation) ? 'duplicate' : 'conflict',
      boardSnapshot,
      operation: authoritativeOperation,
    }
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
  const currentVersion = current?.version ?? 0
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion !== currentVersion) return 'conflict'
  if (!current) return 'write'

  // Version authority stays on the server. A client may only prove which
  // snapshot it read (expectedVersion) and submit the next content.
  const currentDraft: OnlineClassroomBoardDraft = {
    studentCanWrite: current.studentCanWrite,
    operations: current.operations,
  }
  return JSON.stringify(currentDraft) === JSON.stringify(next) ? 'noop' : 'write'
}
