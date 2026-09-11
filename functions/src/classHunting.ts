import { createHash, randomBytes } from 'node:crypto'

/**
 * Server-owned data contract for the class-hunting flow.  Nothing in this
 * module trusts browser time, a browser-selected teacher, or a client-side
 * timetable-conflict calculation. The callable layer is responsible for reading
 * Firestore and uses these deterministic helpers to make the same decision on
 * every retry.
 */

export const CLASS_HUNTS_COLLECTION = 'classHunts'
export const CLASS_HUNT_PUBLISH_REQUESTS_COLLECTION = 'classHuntPublishRequests'
export const CLASS_HUNT_SCHEMA_VERSION = 1
export const CLASS_HUNT_DEFAULT_TTL_MINUTES = 24 * 60
export const CLASS_HUNT_MIN_TTL_MINUTES = 5
export const CLASS_HUNT_MAX_TTL_MINUTES = 7 * 24 * 60
/**
 * A claim creates one booking document per planned session inside one
 * Firestore transaction, alongside the student, teacher, hunt, audit and
 * notification writes. Keep this comfortably below Firestore's 500-write
 * ceiling and within the one-year schedule horizon; this is a transaction
 * safety boundary, not a UI-only product limit.
 */
export const CLASS_HUNT_MAX_SESSIONS = 120
export const CLASS_HUNT_SESSION_HORIZON_DAYS = 366
export const CLASS_HUNT_MINUTES = [25, 50, 75, 100] as const
/** Each weekly timetable slot picked by an operator is one 25-minute lesson. */
export const CLASS_HUNT_SLOT_MINUTES = 25
export const CLASS_HUNT_TEACHER_TYPES = ['vn', 'ph', 'native'] as const
export const CLASS_HUNT_COMPENSATION_VERSION = 1
export const CLASS_HUNT_COMPENSATION_CURRENCY = 'VND' as const
export const CLASS_HUNT_COMPENSATION_FORMULA = 'flat_per_minute' as const

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
export type ClassHuntTeacherType = typeof CLASS_HUNT_TEACHER_TYPES[number]
export type ClassHuntTeacherGender = 'any' | 'female' | 'male'

/**
 * Optional operator request shown to every tutor. It never hides an offer:
 * the feed lists every open class and only the claim rejects a mismatch.
 */
export interface ClassHuntTeacherRequirements {
  teacherTypes: ClassHuntTeacherType[]
  gender: ClassHuntTeacherGender
}

/** One weekly timetable cell. Every generated lesson is CLASS_HUNT_SLOT_MINUTES long. */
export interface ClassHuntWeeklySlot {
  day: ClassHuntDay
  start: string
}
/** A legacy request without this field is treated as a specific-count request. */
export type ClassHuntSessionSelectionMode = 'all_remaining' | 'specific'

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
  sessionSelectionMode: ClassHuntSessionSelectionMode
  expiresInMinutes: number
  sessions: ClassHuntSession[]
  /** Present for plans built from the weekly slot grid (25-minute lessons). */
  weeklySlots?: ClassHuntWeeklySlot[]
  teacherRequirements: ClassHuntTeacherRequirements
  /**
   * Present only for newly published, admin-priced hunts. Its absence is a
   * deliberate compatibility path for offers created before class-level pay
   * existed; callers must never invent a rate for those historical offers.
   */
  classHuntCompensation?: ClassHuntCompensation
}

/**
 * Immutable class-level teacher compensation snapshot. This is intentionally
 * distinct from student diamond rates (`pointsPer25Minutes`) and from a
 * teacher's current level/rate. A Class Hunting claim copies it unchanged to
 * every booking so later profile, subject, or Settings edits cannot re-price
 * an already published class.
 */
export interface ClassHuntCompensation {
  version: typeof CLASS_HUNT_COMPENSATION_VERSION
  ratePerMinute: number
  currency: typeof CLASS_HUNT_COMPENSATION_CURRENCY
  formula: typeof CLASS_HUNT_COMPENSATION_FORMULA
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
  gender?: unknown
  yob?: unknown
  livingArea?: unknown
  degreeType?: unknown
  university?: unknown
  major?: unknown
  teachingYears?: unknown
  bankName?: unknown
  bankAccountNo?: unknown
  bankAccountName?: unknown
  pointsPer25Minutes?: unknown
  country?: unknown
  teacherGrade?: unknown
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
  classHuntCompensation?: unknown
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
  classHuntCompensation?: unknown
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

function finiteNonNegativeInteger(value: unknown): number | null {
  const parsed = finiteInteger(value)
  return parsed !== null && parsed >= 0 ? parsed : null
}

/** Strictly validate a persisted snapshot. Do not coerce historical Firestore
 * data here: a malformed field must not silently fall back to a platform or
 * teacher rate and change what a teacher is paid. */
export function isClassHuntCompensation(value: unknown): value is ClassHuntCompensation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const compensation = value as Record<string, unknown>
  return compensation.version === CLASS_HUNT_COMPENSATION_VERSION
    && typeof compensation.ratePerMinute === 'number'
    && Number.isSafeInteger(compensation.ratePerMinute)
    && compensation.ratePerMinute > 0
    && compensation.currency === CLASS_HUNT_COMPENSATION_CURRENCY
    && compensation.formula === CLASS_HUNT_COMPENSATION_FORMULA
}

/**
 * Normalize only a new admin-entered rate. The public callable accepts a
 * numeric form value, then writes the full immutable snapshot server-side so
 * no browser can choose a currency, a multiplier, or a different formula.
 */
export function createClassHuntCompensation(ratePerMinute: unknown): ClassHuntCompensation {
  const normalizedRate = finiteInteger(ratePerMinute)
  if (normalizedRate === null || normalizedRate <= 0) {
    throw new ClassHuntValidationError(
      'CLASS_HUNT_COMPENSATION_RATE_INVALID',
      'Đơn giá lớp phải là số nguyên VND lớn hơn 0.',
    )
  }
  return {
    version: CLASS_HUNT_COMPENSATION_VERSION,
    ratePerMinute: normalizedRate,
    currency: CLASS_HUNT_COMPENSATION_CURRENCY,
    formula: CLASS_HUNT_COMPENSATION_FORMULA,
  }
}

/**
 * Return a VND integer only when the complete scheduled value is representable
 * exactly. This intentionally has no arbitrary business ceiling: it protects
 * the financial invariant instead of silently clamping a legitimate rate.
 */
export function classHuntCompensationAmount(
  compensation: ClassHuntCompensation,
  minutes: number,
  sessionCount = 1,
): number {
  if (!isClassHuntCompensation(compensation)
    || !Number.isSafeInteger(minutes)
    || minutes <= 0
    || !Number.isSafeInteger(sessionCount)
    || sessionCount <= 0) {
    throw new ClassHuntValidationError(
      'CLASS_HUNT_COMPENSATION_AMOUNT_INVALID',
      'Không thể tính đơn giá lớp an toàn.',
    )
  }
  const amount = compensation.ratePerMinute * minutes * sessionCount
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ClassHuntValidationError(
      'CLASS_HUNT_COMPENSATION_AMOUNT_OVERFLOW',
      'Đơn giá lớp vượt quá giới hạn tính toán an toàn.',
    )
  }
  return amount
}

function optionalClassHuntCompensation(ratePerMinute: unknown): ClassHuntCompensation | undefined {
  // Missing is reserved exclusively for compatibility with an offer published
  // before the class-level compensation feature. New UI always sends a rate.
  if (ratePerMinute === undefined || ratePerMinute === null || ratePerMinute === '') return undefined
  return createClassHuntCompensation(ratePerMinute)
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

export function normalizeClassHuntSessionSelectionMode(value: unknown): ClassHuntSessionSelectionMode {
  // Keep historical browser callers and existing idempotent requests working.
  if (value === undefined || value === null || value === '') return 'specific'
  if (value === 'all_remaining' || value === 'specific') return value
  throw new ClassHuntValidationError('CLASS_HUNT_SESSION_SELECTION_INVALID', 'Cách xếp buổi học không hợp lệ.')
}

export function normalizeClassHuntExpiryMinutes(value: unknown): number {
  if (value === undefined || value === null || value === '') return CLASS_HUNT_DEFAULT_TTL_MINUTES
  const minutes = finiteInteger(value)
  if (!minutes || minutes < CLASS_HUNT_MIN_TTL_MINUTES || minutes > CLASS_HUNT_MAX_TTL_MINUTES) {
    throw new ClassHuntValidationError('CLASS_HUNT_EXPIRY_INVALID', 'Thời gian nhận lớp không hợp lệ.')
  }
  return minutes
}

const CLASS_HUNT_DAY_ORDER: ClassHuntDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
// Mirrors the `native` group in src/lib/teacherCountries.ts, plus legacy aliases.
const CLASS_HUNT_NATIVE_TEACHER_COUNTRIES = new Set(['GB', 'UK', 'US', 'US_EST', 'US_PST', 'CA', 'AU', 'NZ', 'IE', 'ZA'])

export function defaultClassHuntTeacherRequirements(): ClassHuntTeacherRequirements {
  return { teacherTypes: [...CLASS_HUNT_TEACHER_TYPES], gender: 'any' }
}

/** A historical offer without requirements is open to every tutor. */
export function normalizeClassHuntTeacherRequirements(value: unknown): ClassHuntTeacherRequirements {
  if (value === undefined || value === null) return defaultClassHuntTeacherRequirements()
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ClassHuntValidationError('CLASS_HUNT_TEACHER_REQUIREMENTS_INVALID', 'Yêu cầu giáo viên không hợp lệ.')
  }
  const raw = value as { teacherTypes?: unknown; gender?: unknown }
  const types = raw.teacherTypes === undefined ? [...CLASS_HUNT_TEACHER_TYPES] : raw.teacherTypes
  if (!Array.isArray(types) || types.some((type) => !CLASS_HUNT_TEACHER_TYPES.includes(type as ClassHuntTeacherType))) {
    throw new ClassHuntValidationError('CLASS_HUNT_TEACHER_REQUIREMENTS_INVALID', 'Loại giáo viên yêu cầu không hợp lệ.')
  }
  const teacherTypes = CLASS_HUNT_TEACHER_TYPES.filter((type) => types.includes(type))
  if (teacherTypes.length === 0) {
    throw new ClassHuntValidationError('CLASS_HUNT_TEACHER_REQUIREMENTS_INVALID', 'Chọn ít nhất một loại giáo viên.')
  }
  const gender = raw.gender === undefined || raw.gender === '' ? 'any' : raw.gender
  if (gender !== 'any' && gender !== 'female' && gender !== 'male') {
    throw new ClassHuntValidationError('CLASS_HUNT_TEACHER_REQUIREMENTS_INVALID', 'Giới tính giáo viên yêu cầu không hợp lệ.')
  }
  return { teacherTypes, gender }
}

export function sameClassHuntTeacherRequirements(left: ClassHuntTeacherRequirements, right: ClassHuntTeacherRequirements): boolean {
  return left.gender === right.gender
    && left.teacherTypes.length === right.teacherTypes.length
    && left.teacherTypes.every((type, index) => type === right.teacherTypes[index])
}

/** A profile without a country follows the app-wide Vietnam default. */
export function classHuntTeacherType(teacher: Pick<ClassHuntTeacherLike, 'country' | 'teacherGrade'> | null | undefined): ClassHuntTeacherType | null {
  const country = typeof teacher?.country === 'string' ? teacher.country.trim().toUpperCase() : ''
  if (country === 'VN') return 'vn'
  if (country === 'PH') return 'ph'
  if (CLASS_HUNT_NATIVE_TEACHER_COUNTRIES.has(country)) return 'native'
  if (country) return null
  if (teacher?.teacherGrade === 'PH') return 'ph'
  if (teacher?.teacherGrade === 'SA') return 'native'
  return 'vn'
}

export type ClassHuntRequirementMismatch = 'gender' | 'teacher_type'

/** Selecting every teacher type means "no type requirement", including other countries. */
export function classHuntTeacherRequirementMismatch(
  teacher: ClassHuntTeacherLike | null | undefined,
  requirements: ClassHuntTeacherRequirements,
): ClassHuntRequirementMismatch | null {
  if (requirements.gender !== 'any' && teacher?.gender !== requirements.gender) return 'gender'
  if (requirements.teacherTypes.length < CLASS_HUNT_TEACHER_TYPES.length) {
    const type = classHuntTeacherType(teacher)
    if (!type || !requirements.teacherTypes.includes(type)) return 'teacher_type'
  }
  return null
}

/** Every active, non-tester tutor sees an offer; the requirement only narrows who can claim it. */
export function classHuntTeacherAudience(
  teachers: ClassHuntTeacherLike[],
  requirements: ClassHuntTeacherRequirements,
): { activeTeacherCount: number; matchingTeacherCount: number } {
  const active = teachers.filter((teacher) => teacher && teacher.status === 'active' && teacher.isTester !== true)
  return {
    activeTeacherCount: active.length,
    matchingTeacherCount: active.filter((teacher) => !classHuntTeacherRequirementMismatch(teacher, requirements)).length,
  }
}

export function normalizeClassHuntWeeklySlots(value: unknown): ClassHuntWeeklySlot[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ClassHuntValidationError('CLASS_HUNT_SLOTS_INVALID', 'Vui lòng chọn ít nhất một slot học.')
  }
  if (value.length > CLASS_HUNT_DAY_ORDER.length * 48) {
    throw new ClassHuntValidationError('CLASS_HUNT_SLOTS_INVALID', 'Số slot học vượt giới hạn cho phép.')
  }
  const slots = value.map((item) => {
    const raw = (item && typeof item === 'object' ? item : {}) as { day?: unknown; start?: unknown }
    if (typeof raw.day !== 'string' || !CLASS_HUNT_DAY_ORDER.includes(raw.day as ClassHuntDay)) {
      throw new ClassHuntValidationError('CLASS_HUNT_SLOTS_INVALID', 'Thứ học của slot không hợp lệ.')
    }
    const start = normalizeTime(raw.start, 'CLASS_HUNT_SLOTS_INVALID')
    if (timeToMinutes(start) + CLASS_HUNT_SLOT_MINUTES > 24 * 60) {
      throw new ClassHuntValidationError('CLASS_HUNT_SLOTS_INVALID', 'Slot học phải kết thúc trong ngày.')
    }
    return { day: raw.day as ClassHuntDay, start }
  })
  slots.sort((left, right) => CLASS_HUNT_DAY_ORDER.indexOf(left.day) - CLASS_HUNT_DAY_ORDER.indexOf(right.day)
    || timeToMinutes(left.start) - timeToMinutes(right.start))
  for (let index = 1; index < slots.length; index += 1) {
    const previous = slots[index - 1]
    const current = slots[index]
    if (previous.day === current.day && timeToMinutes(current.start) - timeToMinutes(previous.start) < CLASS_HUNT_SLOT_MINUTES) {
      throw new ClassHuntValidationError('CLASS_HUNT_SLOTS_INVALID', 'Các slot trong cùng một ngày không được trùng hoặc chồng giờ.')
    }
  }
  return slots
}

/** Weekly slot grid: each selected cell becomes one 25-minute lesson in date order. */
export function buildFutureClassHuntSlotSessions(input: {
  startDate: unknown
  weeklySlots: unknown
  sessionCount: unknown
  nowMs: number
}): ClassHuntSession[] {
  const start = parseDateISO(input.startDate, 'CLASS_HUNT_START_DATE_INVALID')
  const weeklySlots = normalizeClassHuntWeeklySlots(input.weeklySlots)
  const sessionCount = normalizeClassHuntSessionCount(input.sessionCount)
  const vietnamNow = vietnamNowParts(input.nowMs)
  if (formatDateISO(start) < vietnamNow.dateISO) {
    throw new ClassHuntValidationError('CLASS_HUNT_START_DATE_PAST', 'Ngày bắt đầu không được ở quá khứ.')
  }
  const sessions: ClassHuntSession[] = []
  for (let offset = 0; sessions.length < sessionCount && offset <= CLASS_HUNT_SESSION_HORIZON_DAYS; offset += 1) {
    const date = addCalendarDays(start, offset)
    const dateISO = formatDateISO(date)
    const day = dayOfDate(date)
    for (const slot of weeklySlots) {
      if (slot.day !== day) continue
      const startMinute = timeToMinutes(slot.start)
      if (dateISO === vietnamNow.dateISO && startMinute <= vietnamNow.minuteOfDay) continue
      sessions.push({
        dateISO,
        day,
        requestedWeekStart: formatDateISO(mondayOf(date)),
        requestedStart: slot.start,
        requestedEnd: minutesToTime(startMinute + CLASS_HUNT_SLOT_MINUTES),
        requestedMinutes: CLASS_HUNT_SLOT_MINUTES,
      })
      if (sessions.length === sessionCount) break
    }
  }
  if (sessions.length !== sessionCount) {
    throw new ClassHuntValidationError(
      'CLASS_HUNT_SESSION_GENERATION_FAILED',
      `Trong ${CLASS_HUNT_SESSION_HORIZON_DAYS} ngày tới, các slot đã chọn chỉ tạo được ${sessions.length} buổi. Hãy chọn thêm slot hoặc giảm số buổi.`,
    )
  }
  return sessions
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
  // A weekly plan of up to 52 sessions fits within this horizon. The guard is
  // also a fail-closed defence if this helper is changed in the future.
  for (let offset = 0; sessions.length < sessionCount && offset <= CLASS_HUNT_SESSION_HORIZON_DAYS; offset += 1) {
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
  sessionSelectionMode?: unknown
  expiresInMinutes?: unknown
  compensationRatePerMinute?: unknown
  weeklySlots?: unknown
  teacherRequirements?: unknown
}, nowMs: number): ClassHuntDraft {
  const studentId = requiredDocumentId(input.studentId, 'CLASS_HUNT_STUDENT_ID_INVALID')
  const subjectId = requiredDocumentId(input.subjectId, 'CLASS_HUNT_SUBJECT_ID_INVALID')
  const start = parseDateISO(input.startDate, 'CLASS_HUNT_START_DATE_INVALID')
  const usesWeeklySlots = input.weeklySlots !== undefined && input.weeklySlots !== null
  const weeklySlots = usesWeeklySlots ? normalizeClassHuntWeeklySlots(input.weeklySlots) : undefined
  // The slot grid replaces weekday + start time + duration. Legacy clients keep
  // sending those fields and still get the original fixed-duration series.
  const selectedDays = weeklySlots
    ? CLASS_HUNT_DAY_ORDER.filter((day) => weeklySlots.some((slot) => slot.day === day))
    : normalizeClassHuntDays(input.selectedDays)
  const requestedStart = weeklySlots ? weeklySlots[0].start : normalizeTime(input.requestedStart, 'CLASS_HUNT_TIME_INVALID')
  const requestedMinutes = weeklySlots ? CLASS_HUNT_SLOT_MINUTES : normalizeClassHuntDuration(input.requestedMinutes)
  const sessionCount = normalizeClassHuntSessionCount(input.sessionCount)
  const sessionSelectionMode = normalizeClassHuntSessionSelectionMode(input.sessionSelectionMode)
  const expiresInMinutes = normalizeClassHuntExpiryMinutes(input.expiresInMinutes)
  const teacherRequirements = normalizeClassHuntTeacherRequirements(input.teacherRequirements)
  const classHuntCompensation = optionalClassHuntCompensation(input.compensationRatePerMinute)
  if (classHuntCompensation) {
    // Validate the whole class amount at creation time. No value is rounded or
    // capped; a value that cannot remain exact is rejected before it reaches
    // an immutable financial record.
    classHuntCompensationAmount(classHuntCompensation, requestedMinutes, sessionCount)
  }
  const sessions = weeklySlots
    ? buildFutureClassHuntSlotSessions({ startDate: formatDateISO(start), weeklySlots, sessionCount, nowMs })
    : buildFutureClassHuntSessions({
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
    sessionSelectionMode,
    expiresInMinutes,
    sessions,
    ...(weeklySlots ? { weeklySlots } : {}),
    teacherRequirements,
    ...(classHuntCompensation ? { classHuntCompensation } : {}),
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
    sessionSelectionMode: draft.sessionSelectionMode,
    expiresInMinutes: draft.expiresInMinutes,
    sessions: draft.sessions,
    weeklySlots: draft.weeklySlots || null,
    teacherRequirements: draft.teacherRequirements,
    classHuntCompensation: draft.classHuntCompensation || null,
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
  sessionSelectionMode?: unknown
  expiresInMinutes?: unknown
  compensationRatePerMinute?: unknown
  weeklySlots?: unknown
  teacherRequirements?: unknown
}, stored: {
  studentId: string
  studentCode: string
  subjectId: string
  startDate: string
  selectedDays: string[]
  requestedStart: string
  requestedMinutes: number
  sessionCount: number
  sessionSelectionMode?: unknown
  createdAtMs: number
  expiresAtMs: number
  classHuntCompensation?: unknown
  weeklySlots?: unknown
  teacherRequirements?: unknown
}): boolean {
  let requirementsMatch = false
  try {
    requirementsMatch = sameClassHuntTeacherRequirements(
      normalizeClassHuntTeacherRequirements(input.teacherRequirements),
      normalizeClassHuntTeacherRequirements(stored.teacherRequirements),
    )
  } catch {
    return false
  }
  if (!requirementsMatch) return false

  const inputUsesSlots = input.weeklySlots !== undefined && input.weeklySlots !== null
  const storedUsesSlots = stored.weeklySlots !== undefined && stored.weeklySlots !== null
  if (inputUsesSlots !== storedUsesSlots) return false
  if (inputUsesSlots) {
    try {
      const requestedSlots = normalizeClassHuntWeeklySlots(input.weeklySlots)
      const storedSlots = normalizeClassHuntWeeklySlots(stored.weeklySlots)
      if (requestedSlots.length !== storedSlots.length
        || requestedSlots.some((slot, index) => slot.day !== storedSlots[index].day || slot.start !== storedSlots[index].start)) {
        return false
      }
    } catch {
      return false
    }
    // Keep the legacy weekday/time comparison below meaningful for slot plans.
    input = {
      ...input,
      weekdays: [...new Set(stored.selectedDays)],
      startTime: stored.requestedStart,
      minutes: stored.requestedMinutes,
    }
  }

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
  const requestedSelectionMode = (() => {
    try {
      return normalizeClassHuntSessionSelectionMode(input.sessionSelectionMode)
    } catch {
      return null
    }
  })()
  const storedSelectionMode = (() => {
    try {
      return normalizeClassHuntSessionSelectionMode(stored.sessionSelectionMode)
    } catch {
      return null
    }
  })()
  if (requestedSelectionMode === null || storedSelectionMode === null) return false
  let requestedCompensation: ClassHuntCompensation | undefined
  try {
    requestedCompensation = optionalClassHuntCompensation(input.compensationRatePerMinute)
  } catch {
    return false
  }
  const storedCompensation = stored.classHuntCompensation
  const compensationMatches = storedCompensation === undefined || storedCompensation === null
    ? requestedCompensation === undefined
    : isClassHuntCompensation(storedCompensation)
      && requestedCompensation !== undefined
      && storedCompensation.ratePerMinute === requestedCompensation.ratePerMinute
      && storedCompensation.currency === requestedCompensation.currency
      && storedCompensation.formula === requestedCompensation.formula
      && storedCompensation.version === requestedCompensation.version
  return cleanText(input.studentId, 160) === stored.studentId
    && cleanText(input.studentCode, 80) === stored.studentCode
    && cleanText(input.subjectId, 160) === stored.subjectId
    && cleanText(input.startDate, 10) === stored.startDate
    && requestedStart === stored.requestedStart
    && Number(input.minutes) === stored.requestedMinutes
    && requestedSelectionMode === storedSelectionMode
    // "All remaining" is resolved against a server-owned package snapshot.
    // A retry must recover that immutable plan even if a browser still holds a
    // stale display count from before the publish completed.
    && (requestedSelectionMode === 'all_remaining' || Number(input.sessionCount) === stored.sessionCount)
    && requestedExpiry !== null
    && requestedExpiry === storedExpiry
    && requestedDays.length === storedDays.length
    && requestedDays.every((day, index) => day === storedDays[index])
    && compensationMatches
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

// Mirrors the required profile fields in src/lib/teacherProfile.ts. It is kept
// server-owned here so a caller cannot bypass the teacher UI and claim a class
// without the profile and payout details that the app already requires.
const CLASS_HUNT_REQUIRED_TEACHER_PROFILE_FIELDS = [
  'photoURL',
  'gender',
  'yob',
  'livingArea',
  'degreeType',
  'university',
  'major',
  'teachingYears',
  'bankName',
  'bankAccountNo',
  'bankAccountName',
] as const

export function isClassHuntTeacherProfileComplete(teacher: ClassHuntTeacherLike | null | undefined): boolean {
  if (!teacher) return false
  return CLASS_HUNT_REQUIRED_TEACHER_PROFILE_FIELDS.every((field) => {
    const value = teacher[field]
    // Match the existing browser policy: numerical values must be positive;
    // strings and legacy scalar values must be non-empty after trimming.
    return typeof value === 'number' ? value > 0 : Boolean(value && String(value).trim())
  })
}

/**
 * Retained for historical tests and reporting only. Class Hunting no longer
 * filters offers by a tutor's tagged subjects: every eligible tutor can see
 * and claim a class, and decides from the subject name whether it fits.
 */
export function teacherMatchesClassHuntSubject(teacher: ClassHuntTeacherLike | null | undefined, subjectId: string): boolean {
  return Array.isArray(teacher?.subjectIds) && teacher.subjectIds.some((item) => item === subjectId)
}

export interface ClassHuntSubjectRate {
  pricePerMinute: number
  currency: string
}

/**
 * Mirrors `getCanonicalSubjectRate` in src/lib/countryPricing.ts over the exact
 * package row approval later debits. Display only: payroll still resolves the
 * rate from that same row at approval time (price x tutor level).
 */
export function classHuntSubjectRate(student: ClassHuntStudentLike, subjectId: string): ClassHuntSubjectRate | null {
  const sources = Array.isArray(student.subjects) && student.subjects.length > 0
    ? student.subjects.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : [student as Record<string, unknown>]
  const matching = sources.filter((source) => cleanText(source.subjectId, 160) === subjectId)
  if (matching.length !== 1) return null
  const row = matching[0]
  const countryPrices = row.countryPrices && typeof row.countryPrices === 'object' && !Array.isArray(row.countryPrices)
    ? Object.values(row.countryPrices as Record<string, unknown>)
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : []
  const legacyDefault = countryPrices.find((rate) => rate.isDefault === true)
    || (row.countryPrices as Record<string, Record<string, unknown> | undefined> | undefined)?.VN
  const pricePerMinute = Number(row.pricePerMinute) > 0
    ? Number(row.pricePerMinute)
    : Number(row.pricePerMinuteVN) > 0
      ? Number(row.pricePerMinuteVN)
      : Number(legacyDefault?.price) || 0
  if (!Number.isFinite(pricePerMinute) || pricePerMinute <= 0) return null
  return {
    pricePerMinute,
    currency: cleanText(row.currency, 10) || cleanText(legacyDefault?.currency, 10) || 'VND',
  }
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

/**
 * A teacher-side overlap takes precedence in the claim response because the
 * teacher can act on it. A student-side overlap is still blocked separately
 * so no claim can create an invalid student timetable.
 */
export function classHuntClaimConflictReason(
  conflicts: ClassHuntConflict[],
): ClassHuntConflictReason | null {
  if (conflicts.some((conflict) => conflict.reasons.includes('teacher'))) return 'teacher'
  if (conflicts.some((conflict) => conflict.reasons.includes('student'))) return 'student'
  return null
}

function classHuntBookingInterval(booking: ClassHuntBookingLike): { startMs: number; endMs: number } | null {
  if (typeof booking.requestedDate !== 'string' || typeof booking.requestedStart !== 'string') return null
  const startMs = classHuntDateTimeMs(booking.requestedDate, booking.requestedStart)
  if (startMs === null) return null

  // `requestedMinutes` is the canonical duration throughout the application.
  // Prefer it over an obsolete display end so a legacy record cannot leave a
  // false gap in the claim-time timetable check.
  const requestedMinutes = Number(booking.requestedMinutes)
  if (CLASS_HUNT_MINUTES.includes(requestedMinutes as typeof CLASS_HUNT_MINUTES[number])) {
    return { startMs, endMs: startMs + requestedMinutes * 60_000 }
  }

  if (typeof booking.requestedEnd !== 'string') return null
  return classHuntInterval(booking.requestedDate, booking.requestedStart, booking.requestedEnd)
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
      || typeof booking.requestedStart !== 'string') continue
    for (const session of input.sessions) {
      const bookingInterval = classHuntBookingInterval(booking)
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
  minutesPerSession: number
  totalMinutes: number
  usedMinutes: number
  remainingMinutes: number
  /** Present only when the package has an exact, non-ambiguous session ledger. */
  remainingSessions?: number
}

function subjectFundFrom(source: SubjectFundSource): ClassHuntSubjectFund {
  const minutesPerSession = finiteNonNegative(source.minutesPerSession, 50) || 50
  const totalSessions = finiteNonNegativeInteger(source.totalSessions)
  const usedSessions = finiteNonNegativeInteger(source.usedSessions)
  const totalMinutes = finiteNonNegative(source.totalMinutes,
    finiteNonNegative(source.totalSessions, 0) * minutesPerSession)
  const usedMinutes = finiteNonNegative(source.usedMinutes,
    finiteNonNegative(source.usedSessions, 0) * minutesPerSession)
  return {
    subjectId: cleanText(source.subjectId, 160),
    subjectName: cleanText(source.subjectName, 160),
    curriculumLink: cleanText(source.curriculumLink, 500),
    minutesPerSession,
    totalMinutes,
    usedMinutes,
    remainingMinutes: Math.max(0, totalMinutes - usedMinutes),
    ...(totalSessions !== null && usedSessions !== null
      ? { remainingSessions: Math.max(0, totalSessions - usedSessions) }
      : {}),
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

export interface ClassHuntSubjectAvailability {
  /** Raw package ledger: completed lessons have already been deducted here. */
  remainingSessions?: number
  /** Active bookings and unrebooked holds consume scheduling slots too. */
  availableSessionCount?: number
  heldBookingCount: number
  heldPoints: number
  /** Lower of the subject and aggregate diamond balances after active holds. */
  availablePoints: number
}

/**
 * Resolve the raw package balance together with active booking holds. A
 * `lessonId` is intentionally irrelevant here: attendance creates it before
 * approval, while the booking remains financially held until approval settles
 * it.
 */
export function classHuntSubjectAvailability(input: {
  student: ClassHuntStudentLike
  subjectId: string
  bookings: ClassHuntBookingLike[]
}): ClassHuntSubjectAvailability | null {
  const fund = resolveClassHuntSubjectFund(input.student, input.subjectId)
  if (!fund) return null
  const heldBookings = input.bookings.filter((booking) => (
    booking.subjectId === input.subjectId
    && (isActiveClassHuntBooking(booking) || classHuntBookingHeldPoints(booking) > 0)
  ))
  const effectiveHold = effectiveClassHuntHeldPoints(input.student, input.bookings)
  const heldPoints = heldPointsForClassHuntSubject(input.bookings, input.subjectId)
  return {
    ...(fund.remainingSessions === undefined ? {} : {
      remainingSessions: fund.remainingSessions,
      availableSessionCount: Math.max(0, fund.remainingSessions - heldBookings.length),
    }),
    heldBookingCount: heldBookings.length,
    heldPoints,
    availablePoints: Math.max(0, Math.min(
      fund.remainingMinutes - heldPoints,
      effectiveHold.availablePoints,
    )),
  }
}

/**
 * How many package sessions may still be planned before a new Class Hunting
 * request. Return null rather than inventing a value for legacy packages that
 * do not have a reliable session ledger.
 */
export function availableClassHuntSessionCount(input: {
  student: ClassHuntStudentLike
  subjectId: string
  bookings: ClassHuntBookingLike[]
}): number | null {
  return classHuntSubjectAvailability(input)?.availableSessionCount ?? null
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
 * The signed-in users/{uid} document must still be a teacher pointing at this
 * teacher record (Rules forbid a teacher changing role or teacherId). Most
 * existing profiles never stored `loginAccountUid`; when it is present it must
 * match, when it is empty the users link is the source of truth. Keep the
 * identity check pure so discovery cannot drift from claim-time authorization.
 */
export function hasCanonicalClassHuntTeacherLogin(input: {
  teacherId: unknown
  uid: unknown
  teacherLoginAccountUid: unknown
  userTeacherId: unknown
  userRole: unknown
}): boolean {
  const teacherLoginAccountUid = typeof input.teacherLoginAccountUid === 'string'
    ? input.teacherLoginAccountUid.trim()
    : ''
  return typeof input.teacherId === 'string'
    && input.teacherId.length > 0
    && typeof input.uid === 'string'
    && input.uid.length > 0
    && (!teacherLoginAccountUid || teacherLoginAccountUid === input.uid)
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

/** A hunt has no tutor yet, so its plan is priced at the standard tutor rate. */
export const CLASS_HUNT_STANDARD_POINTS_PER_25_MINUTES = 25

/**
 * Diamonds are the canonical package balance. The legacy session counters
 * (`totalSessions`/`usedSessions`) drift whenever a lesson length or tutor rate
 * differs from the package default, so they must never size a hunt: a package
 * with 430 spendable diamonds is 8 standard 50-minute lessons, not whatever the
 * stale counter says. Claim time still re-checks the claiming tutor's own rate.
 */
export function affordableClassHuntSessionCount(availablePoints: number, minutes: number): number {
  const pointsPerLesson = classHuntLessonPoints(minutes, CLASS_HUNT_STANDARD_POINTS_PER_25_MINUTES)
  if (!Number.isFinite(availablePoints) || availablePoints <= 0 || !(pointsPerLesson > 0)) return 0
  // Guard binary rounding (e.g. 99.99999 for 100) without rounding a real shortfall up.
  return Math.floor((availablePoints + 1e-6) / pointsPerLesson)
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
  classHuntCompensation?: unknown
}): {
  id: string
  status: ClassHuntStatus
  subjectName: string
  requestedMinutes: number
  sessions: ClassHuntSession[]
  expiresAtMs: number
  classHuntCompensation?: ClassHuntCompensation
} | null {
  const sessions = Array.isArray(input.sessions) && input.sessions.every(isClassHuntSessionShape)
    ? input.sessions as ClassHuntSession[]
    : null
  const expiresAtMs = Number(input.expiresAtMs)
  const requestedMinutes = Number(input.requestedMinutes)
  const hasClassHuntCompensation = input.classHuntCompensation !== undefined
  const classHuntCompensation = hasClassHuntCompensation && isClassHuntCompensation(input.classHuntCompensation)
    ? input.classHuntCompensation
    : undefined
  if (!sessions
    || !Number.isFinite(expiresAtMs)
    || !CLASS_HUNT_MINUTES.includes(requestedMinutes as typeof CLASS_HUNT_MINUTES[number])
    || (hasClassHuntCompensation && !classHuntCompensation)) return null
  return {
    id: input.id,
    status: input.status,
    subjectName: cleanText(input.subjectName, 160) || 'Môn học',
    requestedMinutes,
    sessions: sessions.map((session) => ({ ...session })),
    expiresAtMs,
    ...(classHuntCompensation ? {
      classHuntCompensation: { ...classHuntCompensation },
    } : {}),
  }
}
