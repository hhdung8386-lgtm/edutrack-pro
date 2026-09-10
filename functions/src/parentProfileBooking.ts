import { createHash } from 'node:crypto'

export const PARENT_PROFILE_BOOKING_REQUESTS_COLLECTION = 'parentProfileBookingRequests'
export const PARENT_PROFILE_BOOKING_SCHEMA_VERSION = 1
export const PARENT_PROFILE_BOOKING_READ_LIMIT = 1000
export const PARENT_PROFILE_BOOKING_MAX_FUTURE_DAYS = 366
export const PARENT_PROFILE_BOOKING_CONFIRMATION_WINDOW_MS = 3 * 60 * 60 * 1000

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,160}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^\d{2}:\d{2}$/
const CONTROL_CHARACTER_PATTERN = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
)
const DAY_VALUES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DURATION_VALUES = [25, 50, 75, 100] as const

export type ParentProfileBookingDay = typeof DAY_VALUES[number]
export type ParentProfileBookingDuration = typeof DURATION_VALUES[number]

export type ParentProfileBookingRequest = {
  studentId: string
  studentCode: string
  teacherId: string
  subjectId: string
  requestedDay: ParentProfileBookingDay
  requestedDate: string
  requestedWeekStart: string
  requestedStart: string
  requestedEnd: string
  requestedMinutes: ParentProfileBookingDuration
  clientRequestId: string
  startsAtMs: number
}

export type ParentProfileBookingLike = {
  id?: unknown
  status?: unknown
  teacherResponse?: unknown
  teacherId?: unknown
  studentId?: unknown
  studentCode?: unknown
  groupClassMemberIds?: unknown
  groupClassId?: unknown
  subjectId?: unknown
  requestedDate?: unknown
  requestedStart?: unknown
  requestedEnd?: unknown
  requestedMinutes?: unknown
  requestedPoints?: unknown
  pointsPer25Minutes?: unknown
  selfServiceCancelled?: unknown
  pendingRebook?: unknown
  rebookHoldPoints?: unknown
  rebookedByBookingId?: unknown
  lessonId?: unknown
  classHuntId?: unknown
  classHuntCompensation?: unknown
}

export type ParentProfileBookingStudentLike = {
  subjectId?: unknown
  subjectName?: unknown
  totalSessions?: unknown
  usedSessions?: unknown
  minutesPerSession?: unknown
  totalMinutes?: unknown
  usedMinutes?: unknown
  subjects?: unknown
  reservedMinutes?: unknown
  heldMinutes?: unknown
}

export type ParentProfileBookingAvailabilityLike = {
  slots?: unknown
  weekOverrides?: unknown
}

export class ParentProfileBookingValidationError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message)
    this.name = 'ParentProfileBookingValidationError'
  }
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function requiredSafeId(value: unknown, reason: string): string {
  const id = cleanText(value, 160)
  if (!SAFE_ID_PATTERN.test(id)) throw new ParentProfileBookingValidationError(reason, 'Mã dữ liệu đặt lịch không hợp lệ.')
  return id
}

function parseDateISO(value: unknown, reason: string): Date {
  const raw = cleanText(value, 10)
  if (!DATE_PATTERN.test(raw)) throw new ParentProfileBookingValidationError(reason, 'Ngày đặt lịch không hợp lệ.')
  const [year, month, day] = raw.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new ParentProfileBookingValidationError(reason, 'Ngày đặt lịch không tồn tại.')
  }
  return parsed
}

function formatDateISO(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function mondayOf(date: Date): Date {
  const day = date.getUTCDay()
  const offset = day === 0 ? -6 : 1 - day
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offset))
}

function weekdayOf(date: Date): ParentProfileBookingDay {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getUTCDay()] as ParentProfileBookingDay
}

function normalizeTime(value: unknown, reason: string, maxHour: number): string {
  const raw = cleanText(value, 5)
  if (!TIME_PATTERN.test(raw)) throw new ParentProfileBookingValidationError(reason, 'Giờ đặt lịch phải có dạng HH:mm.')
  const [hour, minute] = raw.split(':').map(Number)
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > maxHour || minute < 0 || minute > 59) {
    throw new ParentProfileBookingValidationError(reason, 'Giờ đặt lịch không hợp lệ.')
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function minutesToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

export function normalizeParentProfileBookingRequest(input: Record<string, unknown>): ParentProfileBookingRequest {
  const studentId = requiredSafeId(input.studentId, 'PARENT_BOOKING_STUDENT_ID_INVALID')
  const studentCode = cleanText(input.studentCode, 80)
  if (!studentCode || CONTROL_CHARACTER_PATTERN.test(studentCode)) {
    throw new ParentProfileBookingValidationError('PARENT_BOOKING_STUDENT_CODE_INVALID', 'Mã học viên không hợp lệ.')
  }
  const teacherId = requiredSafeId(input.teacherId, 'PARENT_BOOKING_TEACHER_ID_INVALID')
  const subjectId = requiredSafeId(input.subjectId, 'PARENT_BOOKING_SUBJECT_ID_INVALID')
  const clientRequestId = cleanText(input.clientRequestId, 160)
  if (!CLIENT_REQUEST_ID_PATTERN.test(clientRequestId)) {
    throw new ParentProfileBookingValidationError('PARENT_BOOKING_CLIENT_REQUEST_ID_INVALID', 'Mã chống gửi trùng không hợp lệ.')
  }
  if (!DAY_VALUES.includes(input.requestedDay as ParentProfileBookingDay)) {
    throw new ParentProfileBookingValidationError('PARENT_BOOKING_DAY_INVALID', 'Thứ đặt lịch không hợp lệ.')
  }
  const requestedDay = input.requestedDay as ParentProfileBookingDay
  const requestedDateValue = parseDateISO(input.requestedDate, 'PARENT_BOOKING_DATE_INVALID')
  const requestedDate = formatDateISO(requestedDateValue)
  const requestedWeekStart = formatDateISO(parseDateISO(input.requestedWeekStart, 'PARENT_BOOKING_WEEK_INVALID'))
  if (weekdayOf(requestedDateValue) !== requestedDay || formatDateISO(mondayOf(requestedDateValue)) !== requestedWeekStart) {
    throw new ParentProfileBookingValidationError('PARENT_BOOKING_CALENDAR_INVALID', 'Ngày, thứ và tuần đặt lịch không khớp nhau.')
  }
  const requestedStart = normalizeTime(input.requestedStart, 'PARENT_BOOKING_TIME_INVALID', 23)
  const requestedMinutes = Number(input.requestedMinutes)
  if (!DURATION_VALUES.includes(requestedMinutes as ParentProfileBookingDuration)) {
    throw new ParentProfileBookingValidationError('PARENT_BOOKING_DURATION_INVALID', 'Thời lượng đặt lịch không hợp lệ.')
  }
  const requestedEndMinutes = timeToMinutes(requestedStart) + requestedMinutes
  if (requestedEndMinutes > 25 * 60 + 59) {
    throw new ParentProfileBookingValidationError('PARENT_BOOKING_TIME_INVALID', 'Giờ kết thúc vượt ngoài lịch hỗ trợ.')
  }
  const startsAtMs = Date.UTC(
    requestedDateValue.getUTCFullYear(),
    requestedDateValue.getUTCMonth(),
    requestedDateValue.getUTCDate(),
    0,
    timeToMinutes(requestedStart),
  ) - VIETNAM_OFFSET_MS
  return {
    studentId,
    studentCode,
    teacherId,
    subjectId,
    requestedDay,
    requestedDate,
    requestedWeekStart,
    requestedStart,
    requestedEnd: minutesToTime(requestedEndMinutes),
    requestedMinutes: requestedMinutes as ParentProfileBookingDuration,
    clientRequestId,
    startsAtMs,
  }
}

export function assertParentProfileBookingRequestFuture(request: ParentProfileBookingRequest, nowMs: number): void {
  if (request.startsAtMs <= nowMs) {
    throw new ParentProfileBookingValidationError('PARENT_BOOKING_SLOT_PAST', 'Khung giờ đã qua.')
  }
  if (request.startsAtMs - nowMs > PARENT_PROFILE_BOOKING_MAX_FUTURE_DAYS * DAY_MS) {
    throw new ParentProfileBookingValidationError('PARENT_BOOKING_SLOT_TOO_FAR', 'Khung giờ vượt quá phạm vi đặt lịch hỗ trợ.')
  }
}

export function parentProfileBookingFingerprint(request: ParentProfileBookingRequest): string {
  return createHash('sha256').update(JSON.stringify({
    studentId: request.studentId,
    studentCode: request.studentCode,
    teacherId: request.teacherId,
    subjectId: request.subjectId,
    requestedDay: request.requestedDay,
    requestedDate: request.requestedDate,
    requestedWeekStart: request.requestedWeekStart,
    requestedStart: request.requestedStart,
    requestedMinutes: request.requestedMinutes,
  }), 'utf8').digest('hex')
}

export function parentProfileBookingRequestDocumentId(studentId: string, clientRequestId: string): string {
  return createHash('sha256').update(`${studentId}|${clientRequestId}`, 'utf8').digest('hex')
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function availabilityRangeCovers(range: unknown, start: number, end: number): boolean {
  const data = record(range)
  if (!data) return false
  try {
    const rangeStart = timeToMinutes(normalizeTime(data.start, 'PARENT_BOOKING_AVAILABILITY_INVALID', 25))
    const rangeEnd = timeToMinutes(normalizeTime(data.end, 'PARENT_BOOKING_AVAILABILITY_INVALID', 25))
    return rangeStart <= start && end <= rangeEnd
  } catch {
    return false
  }
}

export function teacherAvailabilityCoversParentBooking(
  availability: ParentProfileBookingAvailabilityLike | null | undefined,
  request: ParentProfileBookingRequest,
): boolean {
  if (!availability) return false
  const overrides = record(availability.weekOverrides)
  const override = record(overrides?.[request.requestedWeekStart])
  const slots = record(override?.slots) || record(availability.slots)
  const day = record(slots?.[request.requestedDay])
  if (!day || day.available !== true || !Array.isArray(day.timeRanges)) return false
  const start = timeToMinutes(request.requestedStart)
  const end = timeToMinutes(request.requestedEnd)
  return day.timeRanges.some((range) => availabilityRangeCovers(range, start, end))
}

type SubjectFundSource = {
  subjectId?: unknown
  subjectName?: unknown
  totalSessions?: unknown
  usedSessions?: unknown
  minutesPerSession?: unknown
  totalMinutes?: unknown
  usedMinutes?: unknown
}

function finiteNonNegative(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function fundFrom(source: SubjectFundSource) {
  const minutesPerSession = finiteNonNegative(source.minutesPerSession, 50) || 50
  const total = finiteNonNegative(source.totalMinutes, finiteNonNegative(source.totalSessions) * minutesPerSession)
  const used = finiteNonNegative(source.usedMinutes, finiteNonNegative(source.usedSessions) * minutesPerSession)
  return {
    subjectId: cleanText(source.subjectId, 160),
    subjectName: cleanText(source.subjectName, 160),
    total,
    remaining: Math.max(0, total - used),
  }
}

function studentFunds(student: ParentProfileBookingStudentLike) {
  const sources = Array.isArray(student.subjects) && student.subjects.length > 0
    ? student.subjects.filter((item): item is SubjectFundSource => !!item && typeof item === 'object' && !Array.isArray(item))
    : [student as SubjectFundSource]
  return sources.map(fundFrom)
}

export function parentProfileBookingQuota(student: ParentProfileBookingStudentLike, subjectId: string) {
  const funds = studentFunds(student)
  const matching = funds.filter((fund) => fund.subjectId === subjectId)
  // The public booking schema has no stable package-row id. Choosing by subject
  // id is safe only when it identifies exactly one current row.
  if (matching.length !== 1) return null
  return {
    subjectId,
    subjectName: matching.find((fund) => fund.subjectName)?.subjectName || '',
    subjectRemainingPoints: matching.reduce((total, fund) => total + fund.remaining, 0),
    totalRemainingPoints: funds.reduce((total, fund) => total + fund.remaining, 0),
  }
}

export function normalizeParentBookingPointRate(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 25
}

export function parentBookingPoints(minutes: number, rate: unknown): number {
  return Math.round((minutes / 25) * normalizeParentBookingPointRate(rate) * 100) / 100
}

export function parentBookingHeldPoints(booking: ParentProfileBookingLike): number {
  const minutes = Number(booking.requestedMinutes)
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  const storedRate = Number(booking.pointsPer25Minutes)
  if (Number.isFinite(storedRate) && storedRate > 0) return parentBookingPoints(minutes, storedRate)
  const storedPoints = Number(booking.requestedPoints)
  return Number.isFinite(storedPoints) && storedPoints >= 0 ? storedPoints : parentBookingPoints(minutes, 25)
}

export function isActiveParentBooking(booking: ParentProfileBookingLike): boolean {
  return (booking.status === 'pending' || booking.status === 'confirmed')
    && !(booking.status === 'pending' && booking.teacherResponse === 'declined')
}

export function isPendingParentRebookHold(booking: ParentProfileBookingLike): boolean {
  const points = Number(booking.rebookHoldPoints)
  return booking.status === 'released'
    && booking.selfServiceCancelled === true
    && booking.pendingRebook === true
    && !booking.rebookedByBookingId
    && Number.isFinite(points)
    && points > 0
}

/**
 * New Class Hunt bookings carry a published compensation snapshot. Rebooking
 * through the general parent flow would replace it with a normal booking, so
 * support must manage that transition. Legacy hunts have no snapshot and keep
 * their historical behavior.
 */
export function isParentManagedClassHuntRebook(booking: ParentProfileBookingLike): boolean {
  return Boolean(cleanText(booking.classHuntId, 160))
    && Object.prototype.hasOwnProperty.call(booking, 'classHuntCompensation')
}

export function parentProfileReusableRebookPoints(input: {
  booking: ParentProfileBookingLike
  request: Pick<ParentProfileBookingRequest, 'studentId' | 'studentCode' | 'subjectId'>
  pendingRebookPoints: number
  effectiveHeldPoints: number
}): number | null {
  const { booking, request } = input
  const reusablePoints = Number(booking.rebookHoldPoints)
  return !isParentManagedClassHuntRebook(booking)
    && booking.studentId === request.studentId
    && booking.studentId !== undefined
    && booking.studentId !== ''
    && booking.subjectId === request.subjectId
    && booking.studentCode === request.studentCode
    && isPendingParentRebookHold(booking)
    && !booking.lessonId
    && Number.isFinite(input.pendingRebookPoints)
    && input.pendingRebookPoints === reusablePoints
    && input.effectiveHeldPoints >= reusablePoints
    ? reusablePoints
    : null
}

function parentBookingLedgerHeldPoints(booking: ParentProfileBookingLike): number {
  return isPendingParentRebookHold(booking)
    ? Number(booking.rebookHoldPoints)
    : parentBookingHeldPoints(booking)
}

export function effectiveParentBookingHolds(
  student: ParentProfileBookingStudentLike,
  bookings: ParentProfileBookingLike[],
  subjectId: string,
  studentId: string,
) {
  const active = bookings.filter((booking) => {
    if (!isActiveParentBooking(booking) && !isPendingParentRebookHold(booking)) return false
    // Group-class rows conflict with an individual member's schedule, but their
    // financial hold belongs to the group-class student document.
    return booking.studentId === studentId
  })
  const activeHeldPoints = active.reduce((total, booking) => total + parentBookingLedgerHeldPoints(booking), 0)
  const subjectHeldPoints = active
    .filter((booking) => booking.subjectId === subjectId)
    .reduce((total, booking) => total + parentBookingLedgerHeldPoints(booking), 0)
  const storedValue = student.reservedMinutes === null || student.reservedMinutes === undefined
    ? student.heldMinutes
    : student.reservedMinutes
  const storedHeldPoints = finiteNonNegative(storedValue)
  return {
    storedHeldPoints,
    activeHeldPoints,
    subjectHeldPoints,
    effectiveHeldPoints: Math.max(storedHeldPoints, activeHeldPoints),
  }
}

export type ParentProfileBookingHoldDecision =
  | { ok: true; additionalHeldPoints: number; heldAfterRequest: number }
  | { ok: false; reason: 'subject-quota' | 'global-quota' | 'invalid-hold' }

export function decideParentProfileBookingHold(input: {
  subjectRemainingPoints: number
  totalRemainingPoints: number
  subjectHeldPoints: number
  effectiveHeldPoints: number
  requestedPoints: number
  reusablePoints: number
  subjectReusablePoints: number
}): ParentProfileBookingHoldDecision {
  const values = Object.values(input)
  if (values.some((value) => !Number.isFinite(value) || value < 0) || input.reusablePoints > input.effectiveHeldPoints) {
    return { ok: false, reason: 'invalid-hold' }
  }
  if (input.subjectReusablePoints > input.reusablePoints || input.subjectReusablePoints > input.subjectHeldPoints) {
    return { ok: false, reason: 'invalid-hold' }
  }
  const subjectHeldAfterReplacement = input.subjectHeldPoints - input.subjectReusablePoints
  if (input.subjectRemainingPoints - subjectHeldAfterReplacement < input.requestedPoints) {
    return { ok: false, reason: 'subject-quota' }
  }
  const additionalHeldPoints = input.requestedPoints - input.reusablePoints
  if (additionalHeldPoints > 0 && input.totalRemainingPoints - input.effectiveHeldPoints < additionalHeldPoints) {
    return { ok: false, reason: 'global-quota' }
  }
  const heldAfterRequest = input.effectiveHeldPoints + additionalHeldPoints
  if (!Number.isFinite(heldAfterRequest) || heldAfterRequest < 0) return { ok: false, reason: 'invalid-hold' }
  return { ok: true, additionalHeldPoints, heldAfterRequest }
}

function bookingInterval(booking: ParentProfileBookingLike): { startMs: number; endMs: number } | null {
  try {
    const date = parseDateISO(booking.requestedDate, 'PARENT_BOOKING_EXISTING_DATE_INVALID')
    const start = timeToMinutes(normalizeTime(booking.requestedStart, 'PARENT_BOOKING_EXISTING_TIME_INVALID', 25))
    const explicitEnd = typeof booking.requestedEnd === 'string' && booking.requestedEnd
      ? timeToMinutes(normalizeTime(booking.requestedEnd, 'PARENT_BOOKING_EXISTING_TIME_INVALID', 25))
      : start + Number(booking.requestedMinutes)
    if (!Number.isFinite(explicitEnd) || explicitEnd <= start || explicitEnd > 25 * 60 + 59) return null
    const midnightMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - VIETNAM_OFFSET_MS
    return { startMs: midnightMs + start * 60_000, endMs: midnightMs + explicitEnd * 60_000 }
  } catch {
    return null
  }
}

function datesSameOrAdjacent(left: unknown, right: string): boolean {
  try {
    const leftDate = parseDateISO(left, 'PARENT_BOOKING_EXISTING_DATE_INVALID').getTime()
    const rightDate = parseDateISO(right, 'PARENT_BOOKING_DATE_INVALID').getTime()
    return Math.abs(leftDate - rightDate) <= DAY_MS
  } catch {
    return false
  }
}

export function parentProfileBookingConflictReason(
  request: ParentProfileBookingRequest,
  bookings: ParentProfileBookingLike[],
): 'teacher' | 'student' | 'both' | 'invalid-existing-booking' | null {
  const candidate = bookingInterval(request)
  if (!candidate) return 'invalid-existing-booking'
  for (const booking of bookings) {
    if (!isActiveParentBooking(booking)) continue
    const teacherConflict = booking.teacherId === request.teacherId
    const memberIds = Array.isArray(booking.groupClassMemberIds) ? booking.groupClassMemberIds : []
    const studentConflict = booking.studentId === request.studentId || memberIds.includes(request.studentId)
    if (!teacherConflict && !studentConflict) continue
    const existing = bookingInterval(booking)
    if (!existing) {
      if (datesSameOrAdjacent(booking.requestedDate, request.requestedDate)) return 'invalid-existing-booking'
      continue
    }
    if (existing.startMs < candidate.endMs && candidate.startMs < existing.endMs) {
      return teacherConflict && studentConflict ? 'both' : teacherConflict ? 'teacher' : 'student'
    }
  }
  return null
}
