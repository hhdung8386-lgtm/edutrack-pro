import { createHash } from 'node:crypto'

export const ONLINE_CLASSROOM_ACCESS_COLLECTION = 'onlineClassroomPilotAccess'
export const ONLINE_CLASSROOM_ROOMS_COLLECTION = 'onlineClassrooms'
export const ONLINE_CLASSROOM_TOKENS_COLLECTION = 'onlineClassroomTokens'
export const ONLINE_CLASSROOM_TOKEN_BYTES = 24
export const ONLINE_CLASSROOM_JOIN_EARLY_MS = 12 * 60 * 60 * 1000
export const ONLINE_CLASSROOM_JOIN_LATE_MS = 6 * 60 * 60 * 1000
export const ONLINE_CLASSROOM_BOARD_MAX_BYTES = 500_000
export const ONLINE_CLASSROOM_BOARD_MAX_OPERATIONS = 1_500

export type OnlineClassroomTargetType = 'teacher' | 'student'

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
  operations: unknown[]
}

export type OnlineClassroomBoardDraft = Omit<OnlineClassroomBoardSnapshot, 'version'>

export type OnlineClassroomBoardSaveDecision = 'write' | 'noop' | 'conflict'

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

export function validateOnlineClassroomBoardSnapshot(value: unknown): OnlineClassroomBoardSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<OnlineClassroomBoardSnapshot>
  if (!Number.isSafeInteger(candidate.version) || Number(candidate.version) < 0) return null
  if (typeof candidate.studentCanWrite !== 'boolean' || !Array.isArray(candidate.operations)) return null
  if (candidate.operations.length > ONLINE_CLASSROOM_BOARD_MAX_OPERATIONS) return null
  let encoded = ''
  try {
    encoded = JSON.stringify(candidate)
  } catch {
    return null
  }
  if (Buffer.byteLength(encoded, 'utf8') > ONLINE_CLASSROOM_BOARD_MAX_BYTES) return null
  return {
    version: Number(candidate.version),
    studentCanWrite: candidate.studentCanWrite,
    operations: candidate.operations,
  }
}

export function validateOnlineClassroomBoardDraft(value: unknown): OnlineClassroomBoardDraft | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<OnlineClassroomBoardDraft>
  if (typeof candidate.studentCanWrite !== 'boolean' || !Array.isArray(candidate.operations)) return null
  if (candidate.operations.length > ONLINE_CLASSROOM_BOARD_MAX_OPERATIONS) return null
  const draft = {
    studentCanWrite: candidate.studentCanWrite,
    operations: candidate.operations,
  }
  let encoded = ''
  try {
    encoded = JSON.stringify(draft)
  } catch {
    return null
  }
  return Buffer.byteLength(encoded, 'utf8') <= ONLINE_CLASSROOM_BOARD_MAX_BYTES ? draft : null
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
