export const PARENT_BOOKING_ACCESS_READ_LIMIT = 1000
export const PARENT_BOOKING_ACCESS_MAX_TEACHERS = 60
export const PARENT_BOOKING_ACCESS_MAX_BUSY_DAYS = 14
export const PARENT_BOOKING_CANCELLATION_WINDOW_MS = 60 * 60 * 1000

const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/
const STUDENT_CODE_PATTERN = /^HS[A-Z0-9]{6}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^\d{2}:\d{2}$/
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000

export type ParentBookingAccessRequest = {
  studentId: string
  studentCode: string
  teacherIds: string[]
  busyFromDate?: string
  busyToDate?: string
}

export type ParentBookingCancellationRequest = {
  studentId: string
  studentCode: string
  bookingId: string
  reason: string
}

export class ParentBookingAccessValidationError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message)
    this.name = 'ParentBookingAccessValidationError'
  }
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function safeId(value: unknown, reason: string): string {
  const id = cleanText(value, 160)
  if (!SAFE_ID_PATTERN.test(id)) {
    throw new ParentBookingAccessValidationError(reason, 'Mã dữ liệu lịch học không hợp lệ.')
  }
  return id
}

function studentCode(value: unknown): string {
  const code = cleanText(value, 16).toUpperCase()
  if (!STUDENT_CODE_PATTERN.test(code)) {
    throw new ParentBookingAccessValidationError('PARENT_BOOKING_STUDENT_INVALID', 'Mã học viên không hợp lệ.')
  }
  return code
}

function inputRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function calendarDate(value: unknown, reason: string): { iso: string; millis: number } {
  const iso = cleanText(value, 10)
  if (!DATE_PATTERN.test(iso)) {
    throw new ParentBookingAccessValidationError(reason, 'Khoảng ngày kiểm tra lịch không hợp lệ.')
  }
  const [year, month, day] = iso.split('-').map(Number)
  const millis = Date.UTC(year, month - 1, day)
  const roundTrip = new Date(millis)
  if (
    roundTrip.getUTCFullYear() !== year
    || roundTrip.getUTCMonth() !== month - 1
    || roundTrip.getUTCDate() !== day
  ) {
    throw new ParentBookingAccessValidationError(reason, 'Khoảng ngày kiểm tra lịch không hợp lệ.')
  }
  return { iso, millis }
}

export function normalizeParentBookingAccessRequest(value: unknown): ParentBookingAccessRequest {
  const data = inputRecord(value)
  const rawTeacherIds = Array.isArray(data.teacherIds) ? data.teacherIds : []
  const teacherIds = Array.from(new Set(rawTeacherIds.map((item) => safeId(item, 'PARENT_BOOKING_TEACHER_INVALID'))))
  if (teacherIds.length > PARENT_BOOKING_ACCESS_MAX_TEACHERS) {
    throw new ParentBookingAccessValidationError(
      'PARENT_BOOKING_TEACHER_LIMIT',
      'Danh sách gia sư cần kiểm tra vượt giới hạn an toàn.',
    )
  }
  const rawFromDate = cleanText(data.busyFromDate, 10)
  const rawToDate = cleanText(data.busyToDate, 10)
  if (Boolean(rawFromDate) !== Boolean(rawToDate)) {
    throw new ParentBookingAccessValidationError(
      'PARENT_BOOKING_DATE_WINDOW_INVALID',
      'Khoảng ngày kiểm tra lịch phải có đủ ngày bắt đầu và kết thúc.',
    )
  }
  let busyWindow: Pick<ParentBookingAccessRequest, 'busyFromDate' | 'busyToDate'> = {}
  if (rawFromDate && rawToDate) {
    const fromDate = calendarDate(rawFromDate, 'PARENT_BOOKING_DATE_WINDOW_INVALID')
    const toDate = calendarDate(rawToDate, 'PARENT_BOOKING_DATE_WINDOW_INVALID')
    const maxSpan = (PARENT_BOOKING_ACCESS_MAX_BUSY_DAYS - 1) * 24 * 60 * 60 * 1000
    if (toDate.millis < fromDate.millis || toDate.millis - fromDate.millis > maxSpan) {
      throw new ParentBookingAccessValidationError(
        'PARENT_BOOKING_DATE_WINDOW_INVALID',
        `Khoảng ngày kiểm tra lịch tối đa ${PARENT_BOOKING_ACCESS_MAX_BUSY_DAYS} ngày.`,
      )
    }
    busyWindow = { busyFromDate: fromDate.iso, busyToDate: toDate.iso }
  }
  return {
    studentId: safeId(data.studentId, 'PARENT_BOOKING_STUDENT_INVALID'),
    studentCode: studentCode(data.studentCode),
    teacherIds,
    ...busyWindow,
  }
}

export function normalizeParentBookingCancellationRequest(value: unknown): ParentBookingCancellationRequest {
  const data = inputRecord(value)
  return {
    studentId: safeId(data.studentId, 'PARENT_BOOKING_STUDENT_INVALID'),
    studentCode: studentCode(data.studentCode),
    bookingId: safeId(data.bookingId, 'PARENT_BOOKING_ID_INVALID'),
    reason: cleanText(data.reason, 500),
  }
}

function timestampMillis(value: unknown): number | null {
  if (value && typeof value === 'object') {
    const candidate = value as { toMillis?: () => number; _seconds?: unknown; seconds?: unknown }
    if (typeof candidate.toMillis === 'function') {
      const millis = candidate.toMillis()
      return Number.isFinite(millis) ? millis : null
    }
    const seconds = Number(candidate._seconds ?? candidate.seconds)
    if (Number.isFinite(seconds)) return seconds * 1000
  }
  if (value instanceof Date) return value.getTime()
  return null
}

function optionalText(data: Record<string, unknown>, key: string, maxLength = 500): string | undefined {
  const value = cleanText(data[key], maxLength)
  return value || undefined
}

function optionalNumber(data: Record<string, unknown>, key: string): number | undefined {
  const value = Number(data[key])
  return Number.isFinite(value) ? value : undefined
}

function optionalBoolean(data: Record<string, unknown>, key: string): boolean | undefined {
  return typeof data[key] === 'boolean' ? data[key] : undefined
}

function optionalStringArray(data: Record<string, unknown>, key: string): string[] | undefined {
  if (!Array.isArray(data[key])) return undefined
  const values = (data[key] as unknown[])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.slice(0, 160))
    .slice(0, 100)
  return values.length > 0 ? values : undefined
}

/**
 * A Class Hunt rate is bound to the original booking. Do not expose that rate
 * to a parent, and do not let self-service cancellation create a rebook hold
 * which a normal booking flow would later price as an ordinary lesson.
 *
 * A legacy hunt has no nested snapshot, so it deliberately keeps the legacy
 * path. Any present nested value is protected even when malformed: support
 * staff must inspect it rather than silently discarding the immutable marker.
 */
export function isParentManagedClassHuntBooking(booking: Record<string, unknown>): boolean {
  return Boolean(cleanText(booking.classHuntId, 160))
    && Object.prototype.hasOwnProperty.call(booking, 'classHuntCompensation')
}

const BOOKING_TIMESTAMP_FIELDS = [
  'createdAt',
  'confirmedAt',
  'rejectedAt',
  'releasedAt',
  'completedAt',
  'teacherConfirmationDeadlineAt',
  'teacherRespondedAt',
  'rebookedAt',
] as const

/** Only fields needed by the parent portal are returned. Unknown/internal fields never leak. */
export function parentBookingResponse(id: string, source: Record<string, unknown>): Record<string, unknown> {
  const response: Record<string, unknown> = {
    id,
    status: cleanText(source.status, 40),
    teacherId: cleanText(source.teacherId, 160),
    // Parents identify tutors by the released nickname/code, never by an internal legal name.
    teacherCode: cleanText(source.teacherCode, 80),
    teacherName: cleanText(source.teacherCode, 80),
    teacherPhotoURL: cleanText(source.teacherPhotoURL, 500),
    studentId: cleanText(source.studentId, 160),
    studentCode: cleanText(source.studentCode, 80),
    studentName: cleanText(source.studentName, 160),
    requestedDay: cleanText(source.requestedDay, 8),
    requestedDate: cleanText(source.requestedDate, 10),
    requestedWeekStart: cleanText(source.requestedWeekStart, 10),
    requestedStart: cleanText(source.requestedStart, 5),
    requestedEnd: cleanText(source.requestedEnd, 5),
    requestedMinutes: optionalNumber(source, 'requestedMinutes'),
  }
  const textFields = [
    'groupClassId', 'groupClassCode', 'groupClassName', 'subjectId', 'subjectName',
    'note', 'classroomURL', 'curriculumLink', 'confirmedBy', 'rejectedBy',
    'releasedBy', 'lessonId', 'currency', 'teacherResponse', 'teacherRespondedBy',
    'rebookedByBookingId', 'classHuntId',
  ] as const
  textFields.forEach((key) => {
    const value = optionalText(source, key, ['classroomURL', 'curriculumLink'].includes(key) ? 2048 : 500)
    if (value !== undefined) response[key] = value
  })
  const numberFields = [
    'availableMinutesAtRequest', 'heldMinutesAtRequest', 'requestedPoints',
    'pointsPer25Minutes', 'heldMinutesAfterRequest', 'heldMinutesAfterRelease',
    'cancellationPolicyMinutes', 'cancelledMinutes', 'rebookHoldPoints',
  ] as const
  numberFields.forEach((key) => {
    const value = optionalNumber(source, key)
    if (value !== undefined) response[key] = value
  })
  const booleanFields = ['heldImmediately', 'selfServiceCancelled', 'pendingRebook'] as const
  booleanFields.forEach((key) => {
    const value = optionalBoolean(source, key)
    if (value !== undefined) response[key] = value
  })
  const groupClassMemberIds = optionalStringArray(source, 'groupClassMemberIds')
  if (groupClassMemberIds) response.groupClassMemberIds = groupClassMemberIds
  BOOKING_TIMESTAMP_FIELDS.forEach((key) => {
    const millis = timestampMillis(source[key])
    if (millis !== null) response[`${key}Ms`] = millis
  })
  if (isParentManagedClassHuntBooking(source)) response.parentRebookManaged = true
  return response
}

/** Busy slots intentionally contain no student identity, notes, URLs, or accounting fields. */
export function parentBusySlotResponse(id: string, source: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    status: cleanText(source.status, 40),
    teacherId: cleanText(source.teacherId, 160),
    requestedDate: cleanText(source.requestedDate, 10),
    requestedStart: cleanText(source.requestedStart, 5),
    requestedEnd: cleanText(source.requestedEnd, 5),
    requestedMinutes: optionalNumber(source, 'requestedMinutes'),
  }
}

export function parentCancellationResponse(id: string, source: Record<string, unknown>): Record<string, unknown> {
  const response: Record<string, unknown> = {
    id,
    bookingId: cleanText(source.bookingId, 160),
    studentId: cleanText(source.studentId, 160),
    studentCode: cleanText(source.studentCode, 80),
    studentName: cleanText(source.studentName, 160),
    status: cleanText(source.status, 40),
  }
  const requestedAtMs = timestampMillis(source.requestedAt)
  const resolvedAtMs = timestampMillis(source.resolvedAt ?? source.reviewedAt)
  if (requestedAtMs !== null) response.requestedAtMs = requestedAtMs
  if (resolvedAtMs !== null) response.resolvedAtMs = resolvedAtMs
  return response
}

export function vietnamBookingStartMillis(booking: Record<string, unknown>): number | null {
  const date = cleanText(booking.requestedDate, 10)
  const time = cleanText(booking.requestedStart, 5)
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  const utc = Date.UTC(year, month - 1, day, hour, minute)
  const roundTrip = new Date(Date.UTC(year, month - 1, day))
  if (
    roundTrip.getUTCFullYear() !== year
    || roundTrip.getUTCMonth() !== month - 1
    || roundTrip.getUTCDate() !== day
  ) return null
  return utc - VIETNAM_OFFSET_MS
}

export function parentCancellationPoints(
  booking: Record<string, unknown>,
  teacher: Record<string, unknown>,
): number | null {
  const requestedPoints = Number(booking.requestedPoints)
  if (Number.isSafeInteger(requestedPoints) && requestedPoints > 0) return requestedPoints
  const requestedMinutes = Number(booking.requestedMinutes)
  const rate = Number(booking.pointsPer25Minutes ?? teacher.pointsPer25Minutes ?? 25)
  const points = rate * (requestedMinutes / 25)
  return Number.isSafeInteger(points) && points > 0 ? points : null
}

export function assertParentCancellationAllowed(
  booking: Record<string, unknown>,
  student: Record<string, unknown>,
  teacher: Record<string, unknown>,
  request: ParentBookingCancellationRequest,
  nowMs: number,
): { heldPoints: number; currentHeld: number } {
  if (!['pending', 'confirmed'].includes(String(booking.status)) || cleanText(booking.lessonId, 160)) {
    throw new ParentBookingAccessValidationError('BOOKING_ALREADY_PROCESSED', 'Buổi học đã được xử lý trước đó.')
  }
  if (
    booking.studentId !== request.studentId
    || cleanText(booking.studentCode, 80).toUpperCase() !== request.studentCode
    || cleanText(student.code, 80).toUpperCase() !== request.studentCode
  ) {
    throw new ParentBookingAccessValidationError('STUDENT_MISMATCH', 'Mã học viên không khớp ca học.')
  }
  if (cleanText(booking.groupClassId, 160)) {
    throw new ParentBookingAccessValidationError('GROUP_BOOKING_MANAGED', 'Lịch lớp nhóm do trung tâm quản lý.')
  }
  if (isParentManagedClassHuntBooking(booking)) {
    throw new ParentBookingAccessValidationError(
      'CLASS_HUNT_COMPENSATION_PARENT_MANAGED',
      'Lớp này có cơ chế xếp lịch riêng. Vui lòng liên hệ học vụ để đổi hoặc hủy lịch.',
    )
  }
  if (cleanText(student.pendingRebookBookingId, 160)) {
    throw new ParentBookingAccessValidationError('REBOOK_REQUIRED', 'Hãy đặt lại buổi đang treo trước khi hủy buổi khác.')
  }
  if (booking.status === 'confirmed') {
    const startsAtMs = vietnamBookingStartMillis(booking)
    if (startsAtMs === null || startsAtMs - nowMs < PARENT_BOOKING_CANCELLATION_WINDOW_MS) {
      throw new ParentBookingAccessValidationError('CANCELLATION_WINDOW_CLOSED', 'Đã qua thời hạn tự hủy an toàn.')
    }
  }
  const heldPoints = parentCancellationPoints(booking, teacher)
  const currentHeld = Number(student.reservedMinutes ?? student.heldMinutes)
  const wasHolding = booking.status === 'confirmed' || booking.heldImmediately === true
  if (!wasHolding || heldPoints === null || !Number.isSafeInteger(currentHeld) || currentHeld < heldPoints) {
    throw new ParentBookingAccessValidationError('INVALID_HELD_POINTS', 'Số kim cương đang giữ không hợp lệ.')
  }
  return { heldPoints, currentHeld }
}
