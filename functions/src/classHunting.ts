import { createHash, randomBytes } from 'node:crypto'

/**
 * Server-owned data contract for the class-hunting flow.  Nothing in this
 * module trusts browser time, a browser-selected teacher, or a client-side
 * availability calculation.  The callable layer is responsible for reading
 * Firestore and uses these deterministic helpers to make the same decision on
 * every retry.
 */

export const CLASS_HUNTS_COLLECTION = 'classHunts'
export const CLASS_HUNT_PUBLISH_REQUESTS_COLLECTION = 'classHuntPublishRequests'
export const CLASS_HUNT_SCHEMA_VERSION = 1
export const CLASS_HUNT_DEFAULT_TTL_MINUTES = 24 * 60
export const CLASS_HUNT_MIN_TTL_MINUTES = 5
export const CLASS_HUNT_MAX_TTL_MINUTES = 7 * 24 * 60
export const CLASS_HUNT_MAX_SESSIONS = 24
export const CLASS_HUNT_MINUTES = [25, 50, 75, 100] as const

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,160}$/
const SAFE_DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/
const TIME_PATTERN = /^\d{1,2}:[0-5]\d$/
const CONTROL_CHARACTER_PATTERN = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  'g',
)

export type ClassHuntDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type ClassHuntStatus = 'open' | 'claimed' | 'cancelled' | 'expired'

export interface ClassHuntSession {
  dateISO: string
  day: ClassHuntDay
  requestedWeekStart: string
  requestedStart: string
  requestedEnd: string
  requestedMinutes: number
}

/** Public callable shape. Internal field names deliberately never leave Functions. */
export interface ClassHuntPublicSlot {
  date: string
  weekday: ClassHuntDay
  start: string
  end: string
  minutes: number
}

export interface ClassHuntDraft {
  studentId: string
  subjectId: string
  startDate: string
  selectedDays: ClassHuntDay[]
  requestedStart: string
  requestedMinutes: number
  sessionCount: number
  expiresInMinutes: number
  sessions: ClassHuntSession[]
}

export interface ClassHuntTeacherLike {
  id?: unknown
  status?: unknown
  isTester?: unknown
  teachingFormats?: unknown
  subjectIds?: unknown
  loginAccountUid?: unknown
  code?: unknown
  name?: unknown
  photoURL?: unknown
  pointsPer25Minutes?: unknown
}

export interface ClassHuntAvailabilityLike {
  slots?: unknown
  weekOverrides?: unknown
}

export interface ClassHuntStudentLike {
  id?: unknown
  code?: unknown
  name?: unknown
  status?: unknown
  recordType?: unknown
  classDeliveryMode?: unknown
  learningScheduleType?: unknown
  subjectId?: unknown
  subjectName?: unknown
  subjects?: unknown
  totalSessions?: unknown
  usedSessions?: unknown
  minutesPerSession?: unknown
  totalMinutes?: unknown
  usedMinutes?: unknown
  reservedMinutes?: unknown
  heldMinutes?: unknown
}

export interface ClassHuntBookingLike {
  id?: unknown
  status?: unknown
  teacherResponse?: unknown
  lessonId?: unknown
  teacherId?: unknown
  studentId?: unknown
  groupClassMemberIds?: unknown
  subjectId?: unknown
  requestedDate?: unknown
  requestedStart?: unknown
  requestedEnd?: unknown
  requestedMinutes?: unknown
  requestedPoints?: unknown
  pointsPer25Minutes?: unknown
  pendingRebook?: unknown
  rebookHoldPoints?: unknown
  rebookedByBookingId?: unknown
}

export interface ClassHuntStoredLike {
  status?: unknown
  expiresAtMs?: unknown
  claimedByTeacherId?: unknown
  claimedByUid?: unknown
  bookingIds?: unknown
  subjectName?: unknown
  sessions?: unknown
  requestedMinutes?: unknown
  subjectId?: unknown
  studentId?: unknown
}

export class ClassHuntValidationError extends Error {
  readonly reason: string

  constructor(reason: string, message: string) {
    super(message)
    this.name = 'ClassHuntValidationError'
    this.reason = reason
  }
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(CONTROL_CHARACTER_PATTERN, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
}

function requiredDocumentId(value: unknown, reason: string): string {
  const normalized = cleanText(value, 160)
  if (!SAFE_DOCUMENT_ID_PATTERN.test(normalized)) {
    throw new ClassHuntValidationError(reason, 'Mã dữ liệu lớp không hợp lệ.')
  }
  return normalized
}

function finiteInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function finiteNonNegative(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function normalizeTime(value: unknown, reason: string): string {
  const raw = cleanText(value, 5)
  if (!TIME_PATTERN.test(raw)) {
    throw new ClassHuntValidationError(reason, 'Giờ học phải có dạng HH:mm.')
  }
  const [hour, minute] = raw.split(':').map(Number)
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 25 || minute < 0 || minute > 59) {
    throw new ClassHuntValidationError(reason, 'Giờ học không hợp lệ.')
  }
  return minutesToTime(hour * 60 + minute)
}

function parseDateISO(value: unknown, reason: string): Date {
  const raw = cleanText(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ClassHuntValidationError(reason, 'Ngày bắt đầu phải có dạng YYYY-MM-DD.')
  }
  const [year, month, day] = raw.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, day))
  if (!Number.isFinite(result.getTime())
    || result.getUTCFullYear() !== year
    || result.getUTCMonth() !== month - 1
    || result.getUTCDate() !== day) {
    throw new ClassHuntValidationError(reason, 'Ngày bắt đầu không tồn tại.')
  }
  return result
}

function formatDateISO(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function addCalendarDays(date: Date, count: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + count))
}

function dayOfDate(date: Date): ClassHuntDay {
  const day = date.getUTCDay()
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day] as ClassHuntDay
}

function mondayOf(date: Date): Date {
  const sundayBasedDay = date.getUTCDay()
  const offset = sundayBasedDay === 0 ? -6 : 1 - sundayBasedDay
  return addCalendarDays(date, offset)
}

function vietnamNowParts(nowMs: number) {
  const vietnam = new Date(nowMs + VIETNAM_OFFSET_MS)
  return {
    dateISO: `${vietnam.getUTCFullYear()}-${String(vietnam.getUTCMonth() + 1).padStart(2, '0')}-${String(vietnam.getUTCDate()).padStart(2, '0')}`,
    minuteOfDay: vietnam.getUTCHours() * 60 + vietnam.getUTCMinutes(),
  }
}

export function classHuntDateTimeMs(dateISO: string, time: string): number | null {
  try {
    const date = parseDateISO(dateISO, 'CLASS_HUNT_DATE_INVALID')
    const normalizedTime = normalizeTime(time, 'CLASS_HUNT_TIME_INVALID')
    const minuteOfDay = timeToMinutes(normalizedTime)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, minuteOfDay - 7 * 60)
  } catch {
    return null
  }
}

export function classHuntPublicSlot(session: ClassHuntSession): ClassHuntPublicSlot {
  return {
    date: session.dateISO,
    weekday: session.day,
    start: session.requestedStart,
    end: session.requestedEnd,
    minutes: session.requestedMinutes,
  }
}

export function isSafeClassHuntClientRequestId(value: unknown): value is string {
  return typeof value === 'string' && CLIENT_REQUEST_ID_PATTERN.test(value)
}

export function classHuntPublishRequestDocumentId(actorUid: string, clientRequestId: string): string {
  return createHash('sha256').update(`${actorUid}|${clientRequestId}`, 'utf8').digest('hex')
}

export function createClassHuntId(): string {
  return `hunt_${randomBytes(18).toString('base64url')}`
}

export function normalizeClassHuntDays(value: unknown): ClassHuntDay[] {
  if (!Array.isArray(value)) {
    throw new ClassHuntValidationError('CLASS_HUNT_DAYS_INVALID', 'Vui lòng chọn ít nhất một thứ học.')
  }
  const allowed = new Set<ClassHuntDay>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
  const days = Array.from(new Set(value.filter((item): item is ClassHuntDay => typeof item === 'string' && allowed.has(item as ClassHuntDay))))
  if (days.length === 0 || days.length !== value.length) {
    throw new ClassHuntValidationError('CLASS_HUNT_DAYS_INVALID', 'Danh sách thứ học không hợp lệ.')
  }
  return days
}

export function normalizeClassHuntDuration(value: unknown): number {
  const minutes = finiteInteger(value)
  if (!minutes || !CLASS_HUNT_MINUTES.includes(minutes as typeof CLASS_HUNT_MINUTES[number])) {
    throw new ClassHuntValidationError('CLASS_HUNT_DURATION_INVALID', 'Thời lượng chỉ có thể là 25, 50, 75 hoặc 100 phút.')
  }
  return minutes
}

export function normalizeClassHuntSessionCount(value: unknown): number {
  const count = finiteInteger(value)
  if (!count || count < 1 || count > CLASS_HUNT_MAX_SESSIONS) {
    throw new ClassHuntValidationError('CLASS_HUNT_SESSION_COUNT_INVALID', `Số buổi phải từ 1 đến ${CLASS_HUNT_MAX_SESSIONS}.`)
  }
  return count
}

export function normalizeClassHuntExpiryMinutes(value: unknown): number {
  if (value === undefined || value === null || value === '') return CLASS_HUNT_DEFAULT_TTL_MINUTES
  const minutes = finiteInteger(value)
  if (!minutes || minutes < CLASS_HUNT_MIN_TTL_MINUTES || minutes > CLASS_HUNT_MAX_TTL_MINUTES) {
    throw new ClassHuntValidationError('CLASS_HUNT_EXPIRY_INVALID', 'Thời gian nhận lớp không hợp lệ.')
  }
  return minutes
}

/** Build immutable Vietnam-calendar sessions. A passed slot is never silently moved. */
export function buildFutureClassHuntSessions(input: {
  startDate: unknown
  selectedDays: unknown
  requestedStart: unknown
  requestedMinutes: unknown
  sessionCount: unknown
  nowMs: number
}): ClassHuntSession[] {
  const start = parseDateISO(input.startDate, 'CLASS_HUNT_START_DATE_INVALID')
  const selectedDays = normalizeClassHuntDays(input.selectedDays)
  const requestedStart = normalizeTime(input.requestedStart, 'CLASS_HUNT_TIME_INVALID')
  const requestedMinutes = normalizeClassHuntDuration(input.requestedMinutes)
  const sessionCount = normalizeClassHuntSessionCount(input.sessionCount)
  const startMinute = timeToMinutes(requestedStart)
  const endMinute = startMinute + requestedMinutes
  if (endMinute > 25 * 60 + 59) {
    throw new ClassHuntValidationError('CLASS_HUNT_TIME_INVALID', 'Khung giờ kết thúc vượt ngoài lịch hỗ trợ.')
  }
  const vietnamNow = vietnamNowParts(input.nowMs)
  const startDateISO = formatDateISO(start)
  if (startDateISO < vietnamNow.dateISO) {
    throw new ClassHuntValidationError('CLASS_HUNT_START_DATE_PAST', 'Ngày bắt đầu không được ở quá khứ.')
  }

  const selected = new Set(selectedDays)
  const sessions: ClassHuntSession[] = []
  // 24 sessions on one weekday fit well within this bound. The guard is also a
  // fail-closed defence if this helper is changed in the future.
  for (let offset = 0; sessions.length < sessionCount && offset <= 366; offset += 1) {
    const date = addCalendarDays(start, offset)
    const dateISO = formatDateISO(date)
    const day = dayOfDate(date)
    if (!selected.has(day)) continue
    if (dateISO === vietnamNow.dateISO && startMinute <= vietnamNow.minuteOfDay) continue
    if (dateISO < vietnamNow.dateISO) continue
    sessions.push({
      dateISO,
      day,
      requestedWeekStart: formatDateISO(mondayOf(date)),
      requestedStart,
      requestedEnd: minutesToTime(endMinute),
      requestedMinutes,
    })
  }
  if (sessions.length !== sessionCount) {
    throw new ClassHuntValidationError('CLASS_HUNT_SESSION_GENERATION_FAILED', 'Không tạo được đủ các buổi học tương lai.')
  }
  return sessions
}

export function buildClassHuntDraft(input: {
  studentId?: unknown
  subjectId?: unknown
  startDate?: unknown
  selectedDays?: unknown
  requestedStart?: unknown
  requestedMinutes?: unknown
  sessionCount?: unknown
  expiresInMinutes?: unknown
}, nowMs: number): ClassHuntDraft {
  const studentId = requiredDocumentId(input.studentId, 'CLASS_HUNT_STUDENT_ID_INVALID')
  const subjectId = requiredDocumentId(input.subjectId, 'CLASS_HUNT_SUBJECT_ID_INVALID')
  const start = parseDateISO(input.startDate, 'CLASS_HUNT_START_DATE_INVALID')
  const selectedDays = normalizeClassHuntDays(input.selectedDays)
  const requestedStart = normalizeTime(input.requestedStart, 'CLASS_HUNT_TIME_INVALID')
  const requestedMinutes = normalizeClassHuntDuration(input.requestedMinutes)
  const sessionCount = normalizeClassHuntSessionCount(input.sessionCount)
  const expiresInMinutes = normalizeClassHuntExpiryMinutes(input.expiresInMinutes)
  const sessions = buildFutureClassHuntSessions({
    startDate: formatDateISO(start), selectedDays, requestedStart, requestedMinutes, sessionCount, nowMs,
  })
  return {
    studentId,
    subjectId,
    startDate: formatDateISO(start),
    selectedDays,
    requestedStart,
    requestedMinutes,
    sessionCount,
    expiresInMinutes,
    sessions,
  }
}

export function classHuntPublishFingerprint(draft: ClassHuntDraft): string {
  return createHash('sha256').update(JSON.stringify({
    studentId: draft.studentId,
    subjectId: draft.subjectId,
    startDate: draft.startDate,
    selectedDays: [...draft.selectedDays].sort(),
    requestedStart: draft.requestedStart,
    requestedMinutes: draft.requestedMinutes,
    sessionCount: draft.sessionCount,
    expiresInMinutes: draft.expiresInMinutes,
    sessions: draft.sessions,
  }), 'utf8').digest('hex')
}

/**
 * Recover a committed publish only when the retry still describes the exact
 * same operator selection. This comparison intentionally avoids rebuilding
 * sessions against the current clock, because a legitimate network retry may
 * arrive after the first slot or another booking has changed.
 */
export function classHuntPublishRetryMatches(input: {
  studentId?: unknown
  studentCode?: unknown
  subjectId?: unknown
  startDate?: unknown
  weekdays?: unknown
  startTime?: unknown
  minutes?: unknown
  sessionCount?: unknown
  expiresInMinutes?: unknown
}, stored: {
  studentId: string
  studentCode: string
  subjectId: string
  startDate: string
  selectedDays: string[]
  requestedStart: string
  requestedMinutes: number
  sessionCount: number
  createdAtMs: number
  expiresAtMs: number
}): boolean {
  if (!Array.isArray(input.weekdays)
    || !input.weekdays.every((day) => typeof day === 'string')
    || new Set(input.weekdays).size !== input.weekdays.length) return false
  const requestedDays = [...input.weekdays].sort()
  const storedDays = [...new Set(stored.selectedDays)].sort()
  const requestedExpiry = input.expiresInMinutes === undefined
    || input.expiresInMinutes === null
    || input.expiresInMinutes === ''
    ? CLASS_HUNT_DEFAULT_TTL_MINUTES
    : finiteInteger(input.expiresInMinutes)
  const storedExpiry = Math.round((stored.expiresAtMs - stored.createdAtMs) / 60_000)
  const requestedStart = (() => {
    try {
      return normalizeTime(input.startTime, 'CLASS_HUNT_TIME_INVALID')
    } catch {
      return null
    }
  })()
  if (requestedStart === null) return false
  return cleanText(input.studentId, 160) === stored.studentId
    && cleanText(input.studentCode, 80) === stored.studentCode
    && cleanText(input.subjectId, 160) === stored.subjectId
    && cleanText(input.startDate, 10) === stored.startDate
    && requestedStart === stored.requestedStart
    && Number(input.minutes) === stored.requestedMinutes
    && Number(input.sessionCount) === stored.sessionCount
    && requestedExpiry !== null
    && requestedExpiry === storedExpiry
    && requestedDays.length === storedDays.length
    && requestedDays.every((day, index) => day === storedDays[index])
}

export function isActiveIndividualOnlineStudent(student: ClassHuntStudentLike | null | undefined): boolean {
  if (!student || student.status !== 'active') return false
  if (student.recordType === 'group_class') return false
  if (student.classDeliveryMode === 'offline') return false
  return student.learningScheduleType !== 'offline'
}

/** Legacy teachers without teachingFormats remain compatible with the existing online booking flow. */
export function isEligibleOnlineClassHuntTeacher(teacher: ClassHuntTeacherLike | null | undefined): boolean {
  if (!teacher || teacher.status !== 'active' || teacher.isTester === true) return false
  const formats = Array.isArray(teacher.teachingFormats)
    ? teacher.teachingFormats.filter((item): item is string => typeof item === 'string')
    : []
  return formats.length === 0 || formats.includes('online')
}

export function teacherMatchesClassHuntSubject(teacher: ClassHuntTeacherLike | null | undefined, subjectId: string): boolean {
  return Array.isArray(teacher?.subjectIds) && teacher.subjectIds.some((item) => item === subjectId)
}

function rangeCovers(range: unknown, start: number, end: number): boolean {
  if (!range || typeof range !== 'object') return false
  const data = range as Record<string, unknown>
  try {
    const rangeStart = normalizeTime(data.start, 'CLASS_HUNT_AVAILABILITY_INVALID')
    const rangeEnd = normalizeTime(data.end, 'CLASS_HUNT_AVAILABILITY_INVALID')
    return timeToMinutes(rangeStart) <= start && timeToMinutes(rangeEnd) >= end
  } catch {
    return false
  }
}

export function isTeacherAvailableForClassHuntSessions(
  availability: ClassHuntAvailabilityLike | null | undefined,
  sessions: ClassHuntSession[],
): boolean {
  if (!availability || !availability.slots || typeof availability.slots !== 'object' || sessions.length === 0) return false
  const baseSlots = availability.slots as Record<string, unknown>
  const overrides = availability.weekOverrides && typeof availability.weekOverrides === 'object'
    ? availability.weekOverrides as Record<string, unknown>
    : {}
  return sessions.every((session) => {
    const override = overrides[session.requestedWeekStart]
    const overrideSlots = override && typeof override === 'object' && (override as Record<string, unknown>).slots
    const slots = overrideSlots && typeof overrideSlots === 'object'
      ? overrideSlots as Record<string, unknown>
      : baseSlots
    const dayAvailability = slots[session.day]
    if (!dayAvailability || typeof dayAvailability !== 'object') return false
    const data = dayAvailability as Record<string, unknown>
    // A legacy availability document may not contain `available`; actual ranges
    // are still an explicit availability declaration. A false value always wins.
    if (data.available === false || !Array.isArray(data.timeRanges)) return false
    const start = timeToMinutes(session.requestedStart)
    const end = timeToMinutes(session.requestedEnd)
    return data.timeRanges.some((range) => rangeCovers(range, start, end))
  })
}

export function isActiveClassHuntBooking(booking: ClassHuntBookingLike): boolean {
  return (booking.status === 'pending' || booking.status === 'confirmed')
    && !(booking.status === 'pending' && booking.teacherResponse === 'declined')
}

function classHuntInterval(dateISO: string, start: string, end: string): { startMs: number; endMs: number } | null {
  const startMs = classHuntDateTimeMs(dateISO, start)
  const endMs = classHuntDateTimeMs(dateISO, end)
  if (startMs === null || endMs === null || endMs <= startMs) return null
  return { startMs, endMs }
}

function calendarDatesAreSameOrAdjacent(left: string, right: string): boolean {
  try {
    const leftDate = parseDateISO(left, 'CLASS_HUNT_BOOKING_DATE_INVALID')
    const rightDate = parseDateISO(right, 'CLASS_HUNT_BOOKING_DATE_INVALID')
    return Math.abs(leftDate.getTime() - rightDate.getTime()) <= 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

export type ClassHuntConflictReason = 'teacher' | 'student'

export interface ClassHuntConflict {
  bookingId: string
  session: ClassHuntSession
  reasons: ClassHuntConflictReason[]
}

export function findClassHuntBookingConflicts(input: {
  teacherId: string
  studentId: string
  sessions: ClassHuntSession[]
  bookings: ClassHuntBookingLike[]
}): ClassHuntConflict[] {
  const conflicts: ClassHuntConflict[] = []
  for (const booking of input.bookings) {
    if (!isActiveClassHuntBooking(booking)
      || typeof booking.requestedDate !== 'string'
      || typeof booking.requestedStart !== 'string'
      || typeof booking.requestedEnd !== 'string') continue
    for (const session of input.sessions) {
      const bookingInterval = classHuntInterval(booking.requestedDate, booking.requestedStart, booking.requestedEnd)
      const sessionInterval = classHuntInterval(session.dateISO, session.requestedStart, session.requestedEnd)
      const overlaps = bookingInterval && sessionInterval
        ? bookingInterval.startMs < sessionInterval.endMs && sessionInterval.startMs < bookingInterval.endMs
        // A corrupted booking must not become a safe hole in a timetable. Limit
        // the fail-closed effect to the same/adjacent date, which is the only
        // date range an extended (24:xx/25:xx) slot can overlap.
        : calendarDatesAreSameOrAdjacent(booking.requestedDate, session.dateISO)
      if (!overlaps) continue
      const reasons: ClassHuntConflictReason[] = []
      if (booking.teacherId === input.teacherId) reasons.push('teacher')
      const memberIds = Array.isArray(booking.groupClassMemberIds)
        ? booking.groupClassMemberIds.filter((value): value is string => typeof value === 'string')
        : []
      if (booking.studentId === input.studentId || memberIds.includes(input.studentId)) reasons.push('student')
      if (reasons.length > 0) {
        conflicts.push({
          bookingId: typeof booking.id === 'string' ? booking.id : '',
          session,
          reasons,
        })
      }
    }
  }
  return conflicts
}

type SubjectFundSource = {
  subjectId?: unknown
  subjectName?: unknown
  curriculumLink?: unknown
  totalSessions?: unknown
  usedSessions?: unknown
  minutesPerSession?: unknown
  totalMinutes?: unknown
  usedMinutes?: unknown
}

export interface ClassHuntSubjectFund {
  subjectId: string
  subjectName: string
  curriculumLink: string
  totalMinutes: number
  usedMinutes: number
  remainingMinutes: number
}

function subjectFundFrom(source: SubjectFundSource): ClassHuntSubjectFund {
  const minutesPerSession = finiteNonNegative(source.minutesPerSession, 50) || 50
  const totalMinutes = finiteNonNegative(source.totalMinutes,
    finiteNonNegative(source.totalSessions, 0) * minutesPerSession)
  const usedMinutes = finiteNonNegative(source.usedMinutes,
    finiteNonNegative(source.usedSessions, 0) * minutesPerSession)
  return {
    subjectId: cleanText(source.subjectId, 160),
    subjectName: cleanText(source.subjectName, 160),
    curriculumLink: cleanText(source.curriculumLink, 500),
    totalMinutes,
    usedMinutes,
    remainingMinutes: Math.max(0, totalMinutes - usedMinutes),
  }
}

export function resolveClassHuntSubjectFund(student: ClassHuntStudentLike, subjectId: string): ClassHuntSubjectFund | null {
  const sources = Array.isArray(student.subjects) && student.subjects.length > 0
    ? student.subjects.filter((item): item is SubjectFundSource => !!item && typeof item === 'object')
    : [student as SubjectFundSource]
  const matching = sources
    .map(subjectFundFrom)
    .filter((fund) => fund.subjectId === subjectId)
  // Approval debits one concrete package row. Aggregating duplicate subject IDs
  // here would let a hunt reserve a balance that no approval entry point can
  // later settle atomically. Treat duplicate legacy rows as an ambiguity that
  // must be reconciled before Class Hunting is used.
  return matching.length === 1 ? matching[0] : null
}

/**
 * The existing teacher route accepts several legacy contract representations.
 * Keep that compatibility in one pure predicate so preview, list, and claim
 * cannot silently disagree about who is eligible to receive a class hunt.
 */
export function hasAcceptedClassHuntContract(contract: unknown): boolean {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return false
  const value = contract as { type?: unknown; status?: unknown }
  return value.type === 'terms_of_service'
    || value.status === 'agreed'
    || value.status === 'pending'
    || value.status === 'approved'
}

/**
 * A teacher profile is claimable only when its canonical login points back to
 * the same teacher record and the user document is still a teacher. Keep the
 * identity check pure so candidate discovery cannot drift from claim-time
 * authorization.
 */
export function hasCanonicalClassHuntTeacherLogin(input: {
  teacherId: unknown
  uid: unknown
  teacherLoginAccountUid: unknown
  userTeacherId: unknown
  userRole: unknown
}): boolean {
  return typeof input.teacherId === 'string'
    && input.teacherId.length > 0
    && typeof input.uid === 'string'
    && input.uid.length > 0
    && input.teacherLoginAccountUid === input.uid
    && input.userTeacherId === input.teacherId
    && input.userRole === 'teacher'
}

/**
 * This preserves the two independent money guards used by Class Hunting:
 * the selected subject fund and the student's aggregate available fund. Both
 * are denominated in points (the legacy field name still says "Minutes").
 */
export function hasSufficientClassHuntPointBalance(input: {
  subjectRemainingPoints: number
  subjectHeldPoints: number
  availablePoints: number
  totalRequiredPoints: number
}): boolean {
  return input.subjectRemainingPoints - input.subjectHeldPoints >= input.totalRequiredPoints
    && input.availablePoints >= input.totalRequiredPoints
}

export function studentClassHuntTotals(student: ClassHuntStudentLike): { remainingMinutes: number; heldMinutes: number; availableMinutes: number } {
  const sources = Array.isArray(student.subjects) && student.subjects.length > 0
    ? student.subjects.filter((item): item is SubjectFundSource => !!item && typeof item === 'object')
    : [student as SubjectFundSource]
  const remainingMinutes = sources.map(subjectFundFrom).reduce((total, fund) => total + fund.remainingMinutes, 0)
  const heldSource = student.reservedMinutes === null || student.reservedMinutes === undefined
    ? student.heldMinutes
    : student.reservedMinutes
  const heldMinutes = finiteNonNegative(heldSource, 0)
  return { remainingMinutes, heldMinutes, availableMinutes: Math.max(0, remainingMinutes - heldMinutes) }
}

export function pointsPer25Minutes(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 25
}

export function classHuntLessonPoints(minutes: number, rate: unknown): number {
  return Math.round((minutes / 25) * pointsPer25Minutes(rate) * 100) / 100
}

export function classHuntBookingPoints(booking: ClassHuntBookingLike): number {
  const minutes = Number(booking.requestedMinutes)
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  if (booking.pointsPer25Minutes !== undefined && booking.pointsPer25Minutes !== null
    && Number.isFinite(Number(booking.pointsPer25Minutes)) && Number(booking.pointsPer25Minutes) > 0) {
    return classHuntLessonPoints(minutes, booking.pointsPer25Minutes)
  }
  const stored = Number(booking.requestedPoints)
  if (Number.isFinite(stored) && stored >= 0) return stored
  return classHuntLessonPoints(minutes, 25)
}

/**
 * A self-service cancellation may keep its original hold while the student is
 * required to rebook. That released row remains money-bearing until the new
 * booking closes it, even though it is no longer an active calendar slot.
 */
export function classHuntBookingHeldPoints(booking: ClassHuntBookingLike): number {
  if (isActiveClassHuntBooking(booking)) return classHuntBookingPoints(booking)
  if (booking.status !== 'released'
    || booking.pendingRebook !== true
    || (typeof booking.rebookedByBookingId === 'string' && booking.rebookedByBookingId.length > 0)) return 0
  const held = Number(booking.rebookHoldPoints)
  return Number.isFinite(held) && held > 0 ? held : 0
}

export function heldPointsForClassHuntSubject(bookings: ClassHuntBookingLike[], subjectId: string): number {
  return bookings
    // A booking can receive lessonId before attendance approval completes. It
    // remains reserved while its status is pending/confirmed, so excluding it
    // here would make a real hold look spendable again.
    .filter((booking) => booking.subjectId === subjectId)
    .reduce((total, booking) => total + classHuntBookingHeldPoints(booking), 0)
}

export function heldPointsForClassHuntBookings(bookings: ClassHuntBookingLike[]): number {
  return bookings.reduce((total, booking) => total + classHuntBookingHeldPoints(booking), 0)
}

/**
 * `reservedMinutes` is a legacy name for the held diamond balance. Prefer the
 * greater of that stored value and the active booking ledger: a stale-low
 * profile field must never let a new claim spend an existing hold twice.
 */
export function effectiveClassHuntHeldPoints(
  student: ClassHuntStudentLike,
  bookings: ClassHuntBookingLike[],
): { storedHeldPoints: number; activeBookingHeldPoints: number; heldPoints: number; availablePoints: number } {
  const totals = studentClassHuntTotals(student)
  const activeBookingHeldPoints = heldPointsForClassHuntBookings(bookings)
  const heldPoints = Math.max(totals.heldMinutes, activeBookingHeldPoints)
  return {
    storedHeldPoints: totals.heldMinutes,
    activeBookingHeldPoints,
    heldPoints,
    availablePoints: Math.max(0, totals.remainingMinutes - heldPoints),
  }
}

export type ClassHuntClaimDecision = 'claimable' | 'already-claimed' | 'idempotent' | 'not-open' | 'expired'

export function effectiveClassHuntStatus(input: {
  status: ClassHuntStatus
  expiresAtMs: unknown
  sessions: ClassHuntSession[]
}, nowMs: number): ClassHuntStatus {
  if (input.status !== 'open') return input.status
  const expiresAtMs = Number(input.expiresAtMs)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return 'expired'
  return input.sessions.every((session) => {
    const startsAtMs = classHuntDateTimeMs(session.dateISO, session.requestedStart)
    return startsAtMs !== null && startsAtMs > nowMs
  }) ? 'open' : 'expired'
}

export function decideClassHuntClaim(input: {
  status: unknown
  expiresAtMs: unknown
  claimedByTeacherId?: unknown
  requestedTeacherId: string
  nowMs: number
}): ClassHuntClaimDecision {
  if (input.status === 'claimed') {
    return input.claimedByTeacherId === input.requestedTeacherId ? 'idempotent' : 'already-claimed'
  }
  if (input.status !== 'open') return 'not-open'
  const expiresAtMs = Number(input.expiresAtMs)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= input.nowMs) return 'expired'
  return 'claimable'
}

export function isClassHuntSessionShape(value: unknown): value is ClassHuntSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<ClassHuntSession>
  if (typeof session.dateISO !== 'string' || typeof session.requestedWeekStart !== 'string'
    || typeof session.requestedStart !== 'string' || typeof session.requestedEnd !== 'string'
    || typeof session.requestedMinutes !== 'number'
    || !['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(session.day || '')) return false
  if (!CLASS_HUNT_MINUTES.includes(session.requestedMinutes as typeof CLASS_HUNT_MINUTES[number])) return false
  const startMs = classHuntDateTimeMs(session.dateISO, session.requestedStart)
  const endMs = classHuntDateTimeMs(session.dateISO, session.requestedEnd)
  if (startMs === null || endMs === null || endMs <= startMs
    || endMs - startMs !== session.requestedMinutes * 60 * 1000) return false
  try {
    const date = parseDateISO(session.dateISO, 'CLASS_HUNT_DATE_INVALID')
    return session.day === dayOfDate(date) && session.requestedWeekStart === formatDateISO(mondayOf(date))
  } catch {
    return false
  }
}

export function sanitizeClassHuntForTeacher(input: {
  id: string
  status: ClassHuntStatus
  subjectName?: unknown
  requestedMinutes?: unknown
  sessions?: unknown
  expiresAtMs?: unknown
}): {
  id: string
  status: ClassHuntStatus
  subjectName: string
  requestedMinutes: number
  sessions: ClassHuntSession[]
  expiresAtMs: number
} | null {
  const sessions = Array.isArray(input.sessions) && input.sessions.every(isClassHuntSessionShape)
    ? input.sessions as ClassHuntSession[]
    : null
  const expiresAtMs = Number(input.expiresAtMs)
  const requestedMinutes = Number(input.requestedMinutes)
  if (!sessions || !Number.isFinite(expiresAtMs) || !CLASS_HUNT_MINUTES.includes(requestedMinutes as typeof CLASS_HUNT_MINUTES[number])) return null
  return {
    id: input.id,
    status: input.status,
    subjectName: cleanText(input.subjectName, 160) || 'Môn học',
    requestedMinutes,
    sessions: sessions.map((session) => ({ ...session })),
    expiresAtMs,
  }
}
