/**
 * Chấm công giờ vào lớp: ghi lại lúc gia sư bấm "Vào lớp" trên Lịch dạy.
 *
 * - Giờ ghi nhận là giờ MÁY CHỦ (không tin đồng hồ thiết bị của gia sư).
 * - Chỉ ghi các trường phẳng `teacherClassroomEntry*` trên chính dòng
 *   bookingRequests: không đụng trạng thái ca, kim cương, buổi học hay lương.
 * - Lần bấm ĐẦU TIÊN trong khung giờ của ca là giờ vào lớp (dùng để tính trễ);
 *   các lần sau chỉ tăng bộ đếm và cập nhật lần bấm gần nhất.
 */
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^\d{2}:\d{2}$/
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000

/** Bấm sớm hơn mốc này (trước giờ bắt đầu) thì chưa tính là vào lớp. */
export const TEACHER_CLASSROOM_ENTRY_OPENS_BEFORE_MS = 60 * 60 * 1000
/** Hai lần bấm sát nhau (bấm đúp) chỉ ghi một lần. */
export const TEACHER_CLASSROOM_ENTRY_REPEAT_GAP_MS = 10 * 1000

export class TeacherClassroomEntryValidationError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message)
    this.name = 'TeacherClassroomEntryValidationError'
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

export function normalizeTeacherClassroomEntryRequest(value: unknown): { bookingId: string } {
  const raw = record(value).bookingId
  const bookingId = typeof raw === 'string' ? raw.trim() : ''
  if (!SAFE_ID_PATTERN.test(bookingId)) {
    throw new TeacherClassroomEntryValidationError('BOOKING_ID_INVALID', 'Mã ca học không hợp lệ.')
  }
  return { bookingId }
}

function vietnamDateTimeMs(date: string, time: string): number | null {
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  if (hours > 23 || minutes > 59) return null
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return Date.UTC(year, month - 1, day, hours, minutes) - VIETNAM_OFFSET_MS
}

/** Giờ bắt đầu / kết thúc ca theo giờ Việt Nam (booking luôn lưu giờ VN). */
export function bookingWindowMs(booking: Record<string, unknown>): { startMs: number; endMs: number } | null {
  const date = cleanText(booking.requestedDate, 10)
  const startMs = vietnamDateTimeMs(date, cleanText(booking.requestedStart, 5))
  if (startMs === null) return null
  let endMs = vietnamDateTimeMs(date, cleanText(booking.requestedEnd, 5))
  const minutes = Number(booking.requestedMinutes)
  if (endMs === null) endMs = startMs + (Number.isFinite(minutes) && minutes > 0 ? minutes : 25) * 60_000
  // Ca kéo qua nửa đêm (23:45 - 00:10).
  if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000
  return { startMs, endMs }
}

/** Số phút trễ so với giờ bắt đầu; âm = vào sớm. Trễ dưới 1 phút tính là đúng giờ. */
export function classroomEntryLateMinutes(entryMs: number, startMs: number): number {
  // `+ 0` bỏ -0 khi vào sớm dưới 1 phút.
  return Math.trunc((entryMs - startMs) / 60_000) + 0
}

export type TeacherClassroomEntryDecision =
  | { action: 'reject'; reason: 'BOOKING_TEACHER_MISMATCH' | 'BOOKING_NOT_ACTIVE' | 'BOOKING_TIME_INVALID' }
  | { action: 'skip'; reason: 'TOO_EARLY' | 'CLASS_ENDED' | 'REPEATED_CLICK'; firstAtMs: number | null; lateMinutes: number | null; opensAtMs?: number }
  | { action: 'record'; first: boolean; lateMinutes: number; startMs: number; firstAtMs: number }

function timestampMs(value: unknown): number | null {
  if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const ms = (value as { toMillis: () => number }).toMillis()
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

/**
 * Quyết định có ghi giờ vào lớp hay không. Hàm thuần: không đọc/ghi dữ liệu.
 * Gia sư chỉ được ghi cho ca của chính mình, ca đang xếp (confirmed) hoặc đã
 * điểm danh (completed), và chỉ trong khung từ 60 phút trước giờ học đến hết ca.
 */
export function decideTeacherClassroomEntry(
  booking: Record<string, unknown>,
  teacherId: string,
  nowMs: number,
): TeacherClassroomEntryDecision {
  if (booking.teacherId !== teacherId) return { action: 'reject', reason: 'BOOKING_TEACHER_MISMATCH' }
  if (booking.status !== 'confirmed' && booking.status !== 'completed') {
    return { action: 'reject', reason: 'BOOKING_NOT_ACTIVE' }
  }
  const window = bookingWindowMs(booking)
  if (!window) return { action: 'reject', reason: 'BOOKING_TIME_INVALID' }

  const firstAtMs = timestampMs(booking.teacherClassroomEntryFirstAt)
  const storedLate = Number(booking.teacherClassroomEntryLateMinutes)
  const lateMinutes = firstAtMs !== null
    ? (Number.isFinite(storedLate) ? storedLate : classroomEntryLateMinutes(firstAtMs, window.startMs))
    : null

  const opensAtMs = window.startMs - TEACHER_CLASSROOM_ENTRY_OPENS_BEFORE_MS
  if (nowMs < opensAtMs) return { action: 'skip', reason: 'TOO_EARLY', firstAtMs, lateMinutes, opensAtMs }
  if (nowMs > window.endMs) return { action: 'skip', reason: 'CLASS_ENDED', firstAtMs, lateMinutes }

  const lastAtMs = timestampMs(booking.teacherClassroomEntryLastAt)
  if (firstAtMs !== null && lastAtMs !== null && nowMs - lastAtMs >= 0 && nowMs - lastAtMs < TEACHER_CLASSROOM_ENTRY_REPEAT_GAP_MS) {
    return { action: 'skip', reason: 'REPEATED_CLICK', firstAtMs, lateMinutes }
  }

  if (firstAtMs !== null && lateMinutes !== null) {
    return { action: 'record', first: false, lateMinutes, startMs: window.startMs, firstAtMs }
  }
  return {
    action: 'record',
    first: true,
    lateMinutes: classroomEntryLateMinutes(nowMs, window.startMs),
    startMs: window.startMs,
    firstAtMs: nowMs,
  }
}
