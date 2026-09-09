const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^\d{2}:\d{2}$/
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000

export type TeacherBookingResponseRequest = {
  bookingId: string
  response: 'accepted' | 'declined'
}

export type TeacherAttendanceAuditRequest = {
  teacherId: string
  studentId: string
  subjectId?: string
  date: string
  minutes?: number
}

export class TeacherBookingSecurityValidationError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message)
    this.name = 'TeacherBookingSecurityValidationError'
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function safeId(value: unknown, reason: string): string {
  const id = cleanText(value, 160)
  if (!SAFE_ID_PATTERN.test(id)) throw new TeacherBookingSecurityValidationError(reason, 'Mã dữ liệu không hợp lệ.')
  return id
}

function safeDate(value: unknown): string {
  const date = cleanText(value, 10)
  if (!DATE_PATTERN.test(date)) throw new TeacherBookingSecurityValidationError('ATTENDANCE_DATE_INVALID', 'Ngày điểm danh không hợp lệ.')
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new TeacherBookingSecurityValidationError('ATTENDANCE_DATE_INVALID', 'Ngày điểm danh không tồn tại.')
  }
  return date
}

export function normalizeTeacherBookingResponseRequest(value: unknown): TeacherBookingResponseRequest {
  const data = record(value)
  const response = cleanText(data.response, 20)
  if (response !== 'accepted' && response !== 'declined') {
    throw new TeacherBookingSecurityValidationError('BOOKING_RESPONSE_INVALID', 'Phản hồi nhận lớp không hợp lệ.')
  }
  return {
    bookingId: safeId(data.bookingId, 'BOOKING_ID_INVALID'),
    response,
  }
}

export function normalizeTeacherAttendanceAuditRequest(value: unknown): TeacherAttendanceAuditRequest {
  const data = record(value)
  const subjectId = cleanText(data.subjectId, 160)
  const minutes = Number(data.minutes)
  return {
    teacherId: safeId(data.teacherId, 'TEACHER_ID_INVALID'),
    studentId: safeId(data.studentId, 'STUDENT_ID_INVALID'),
    ...(subjectId ? { subjectId: safeId(subjectId, 'SUBJECT_ID_INVALID') } : {}),
    date: safeDate(data.date),
    ...(Number.isFinite(minutes) && minutes > 0 && minutes <= 600 ? { minutes } : {}),
  }
}

function timeToMinutes(value: unknown): number | null {
  const time = cleanText(value, 5)
  if (!TIME_PATTERN.test(time)) return null
  const [hour, minute] = time.split(':').map(Number)
  if (hour < 0 || hour > 25 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

function interval(booking: Record<string, unknown>): { start: number; end: number } | null {
  const date = cleanText(booking.requestedDate, 10)
  if (!DATE_PATTERN.test(date)) return null
  const [year, month, day] = date.split('-').map(Number)
  const startMinutes = timeToMinutes(booking.requestedStart)
  const explicitEnd = timeToMinutes(booking.requestedEnd)
  const duration = Number(booking.requestedMinutes)
  const endMinutes = explicitEnd ?? (startMinutes === null ? null : startMinutes + duration)
  if (startMinutes === null || endMinutes === null || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return null
  const midnight = Date.UTC(year, month - 1, day) - VIETNAM_OFFSET_MS
  return { start: midnight + startMinutes * 60_000, end: midnight + endMinutes * 60_000 }
}

function participantIds(booking: Record<string, unknown>): Set<string> {
  const ids = new Set<string>()
  const studentId = cleanText(booking.studentId, 160)
  if (studentId) ids.add(studentId)
  if (Array.isArray(booking.groupClassMemberIds)) {
    booking.groupClassMemberIds.forEach((value) => {
      const id = cleanText(value, 160)
      if (id) ids.add(id)
    })
  }
  return ids
}

export function activeBookingForTeacherConflict(booking: Record<string, unknown>): boolean {
  return (booking.status === 'confirmed' || booking.status === 'pending')
    && !(booking.status === 'pending' && booking.teacherResponse === 'declined')
}

export function teacherBookingResponseConflict(
  target: Record<string, unknown>,
  candidates: Record<string, unknown>[],
): Record<string, unknown> | null {
  const targetInterval = interval(target)
  if (!targetInterval) {
    throw new TeacherBookingSecurityValidationError('BOOKING_TIME_INVALID', 'Khung giờ của yêu cầu nhận lớp không hợp lệ.')
  }
  const targetParticipants = participantIds(target)
  for (const candidate of candidates) {
    if (!activeBookingForTeacherConflict(candidate)) continue
    if (candidate.id === target.id) continue
    // Only already-confirmed or explicitly accepted pending rows block a teacher response.
    if (candidate.status === 'pending' && candidate.teacherResponse !== 'accepted') continue
    const teacherConflict = candidate.teacherId === target.teacherId
    const candidateParticipants = participantIds(candidate)
    const studentConflict = [...targetParticipants].some((id) => candidateParticipants.has(id))
    if (!teacherConflict && !studentConflict) continue
    const candidateInterval = interval(candidate)
    if (!candidateInterval) {
      throw new TeacherBookingSecurityValidationError('BOOKING_CONFLICT_DATA_INVALID', 'Dữ liệu lịch liên quan không hợp lệ.')
    }
    if (candidateInterval.start < targetInterval.end && targetInterval.start < candidateInterval.end) return candidate
  }
  return null
}

export function attendanceAuditWindowDates(date: string, windowDays = 7): string[] {
  const safe = safeDate(date)
  const [year, month, day] = safe.split('-').map(Number)
  const base = new Date(Date.UTC(year, month - 1, day))
  const dates: string[] = []
  for (let offset = -windowDays; offset <= windowDays; offset += 1) {
    const value = new Date(base)
    value.setUTCDate(value.getUTCDate() + offset)
    dates.push(`${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`)
  }
  return dates
}

function classHuntCompensationAuditValue(value: unknown): Record<string, unknown> | undefined {
  // Only a truly absent field is the legacy compatibility path. A stored null
  // is malformed and must reach the client as an inert fail-closed sentinel.
  if (value === undefined) return undefined
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  if (
    source
    && source.version === 1
    && Number.isSafeInteger(Number(source.ratePerMinute))
    && Number(source.ratePerMinute) > 0
    && source.currency === 'VND'
    && source.formula === 'flat_per_minute'
  ) {
    return {
      version: 1,
      ratePerMinute: Number(source.ratePerMinute),
      currency: 'VND',
      formula: 'flat_per_minute',
    }
  }
  // Return only an inert sentinel, never an arbitrary malformed object. The
  // client will fail closed before it can create a special-rate attendance.
  return { version: 0, ratePerMinute: 0, currency: '', formula: '' }
}

/** Fields required by evaluateLessonSchedule; identities and notes are deliberately omitted. */
export function teacherAttendanceAuditBookingResponse(
  id: string,
  source: Record<string, unknown>,
  includeOwnClassHuntCompensation = false,
): Record<string, unknown> {
  const response: Record<string, unknown> = {
    id,
    status: cleanText(source.status, 40),
    teacherResponse: cleanText(source.teacherResponse, 20),
    teacherId: cleanText(source.teacherId, 160),
    teacherName: source.teacherId ? 'Gia sư khác' : '',
    studentId: cleanText(source.studentId, 160),
    groupClassMemberIds: Array.isArray(source.groupClassMemberIds)
      ? source.groupClassMemberIds.filter((item): item is string => typeof item === 'string').slice(0, 100)
      : [],
    subjectId: cleanText(source.subjectId, 160),
    subjectName: cleanText(source.subjectName, 160),
    requestedDate: cleanText(source.requestedDate, 10),
    requestedStart: cleanText(source.requestedStart, 5),
    requestedEnd: cleanText(source.requestedEnd, 5),
    requestedMinutes: Number(source.requestedMinutes) || 0,
    lessonId: cleanText(source.lessonId, 160),
  }
  // A tutor must never learn another tutor's negotiated rate just because the
  // two tutors share a student. The callable opts in only for its own booking.
  if (includeOwnClassHuntCompensation) {
    const classHuntId = cleanText(source.classHuntId, 160)
    if (classHuntId) response.classHuntId = classHuntId
    const compensation = classHuntCompensationAuditValue(source.classHuntCompensation)
    if (compensation) response.classHuntCompensation = compensation
  }
  return response
}
