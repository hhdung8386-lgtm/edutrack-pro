// Chấm công giờ vào lớp của gia sư — phần tính toán thuần (không đọc/ghi Firestore).
// Nguồn dữ liệu: các trường teacherClassroomEntry* trên bookingRequests, do callable
// recordTeacherClassroomEntry ghi bằng GIỜ MÁY CHỦ khi gia sư bấm "Vào lớp" ở Lịch dạy.

const VN_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * Mốc bắt đầu ghi nhận. Ca bắt đầu trước mốc này mà không có giờ bấm thì là
 * "Chưa có dữ liệu" (tính năng chưa chạy), không phải gia sư bỏ lớp.
 */
// Từ 00:00 ngày 26/09/2026 (giờ VN): hôm deploy (25/09) gia sư còn mở trang bản cũ chưa ghi được giờ bấm.
export const TEACHER_CHECKIN_TRACKING_SINCE_MS = Date.UTC(2026, 8, 25, 17, 0)

/** Trễ từ mốc này trở lên thì tô đỏ, dưới mốc tô vàng. */
export const TEACHER_CHECKIN_SERIOUS_LATE_MINUTES = 5

export type TeacherCheckinStatus =
  | 'early'
  | 'on_time'
  | 'late'
  | 'waiting'
  | 'missing_live'
  | 'missing'
  | 'no_data'
  | 'unknown'

export interface TeacherCheckinBooking {
  requestedDate?: string
  requestedStart?: string
  requestedEnd?: string
  requestedMinutes?: number
  teacherClassroomEntryFirstAt?: { toMillis?: () => number } | null
  teacherClassroomEntryLateMinutes?: number
  teacherClassroomEntryCount?: number
}

export interface TeacherCheckinInfo {
  status: TeacherCheckinStatus
  /** Giờ bấm "Vào lớp" lần đầu (ms), null nếu chưa bấm. */
  firstAtMs: number | null
  /** Phút trễ so với giờ bắt đầu; âm = vào sớm; null nếu chưa bấm. */
  lateMinutes: number | null
  clickCount: number
  startMs: number | null
  endMs: number | null
}

function vietnamDateTimeMs(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  if (hours > 23 || minutes > 59) return null
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return Date.UTC(year, month - 1, day, hours, minutes) - VN_OFFSET_MS
}

/** Cùng quy tắc với backend (functions/src/teacherClassroomEntry.ts). */
export function teacherCheckinWindowMs(booking: TeacherCheckinBooking): { startMs: number; endMs: number } | null {
  const date = booking.requestedDate || ''
  const startMs = vietnamDateTimeMs(date, booking.requestedStart || '')
  if (startMs === null) return null
  let endMs = vietnamDateTimeMs(date, booking.requestedEnd || '')
  const minutes = Number(booking.requestedMinutes)
  if (endMs === null) endMs = startMs + (Number.isFinite(minutes) && minutes > 0 ? minutes : 25) * 60_000
  if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000
  return { startMs, endMs }
}

function firstEntryMs(booking: TeacherCheckinBooking): number | null {
  const value = booking.teacherClassroomEntryFirstAt
  if (!value || typeof value.toMillis !== 'function') return null
  const ms = value.toMillis()
  return Number.isFinite(ms) ? ms : null
}

export function getTeacherCheckin(booking: TeacherCheckinBooking, nowMs: number): TeacherCheckinInfo {
  const window = teacherCheckinWindowMs(booking)
  const firstAtMs = firstEntryMs(booking)
  const clickCount = Math.max(0, Math.floor(Number(booking.teacherClassroomEntryCount) || 0))
  const base = { firstAtMs, clickCount, startMs: window?.startMs ?? null, endMs: window?.endMs ?? null }

  if (firstAtMs !== null) {
    const stored = Number(booking.teacherClassroomEntryLateMinutes)
    const lateMinutes = Number.isFinite(stored)
      ? stored
      : window ? Math.trunc((firstAtMs - window.startMs) / 60_000) + 0 : null
    if (lateMinutes === null) return { ...base, status: 'unknown', lateMinutes: null }
    const status: TeacherCheckinStatus = lateMinutes >= 1 ? 'late' : lateMinutes <= -1 ? 'early' : 'on_time'
    return { ...base, status, lateMinutes }
  }

  if (!window) return { ...base, status: 'unknown', lateMinutes: null }
  if (window.startMs < TEACHER_CHECKIN_TRACKING_SINCE_MS) return { ...base, status: 'no_data', lateMinutes: null }
  if (nowMs < window.startMs) return { ...base, status: 'waiting', lateMinutes: null }
  if (nowMs <= window.endMs) return { ...base, status: 'missing_live', lateMinutes: null }
  return { ...base, status: 'missing', lateMinutes: null }
}

export function teacherCheckinLabel(info: Pick<TeacherCheckinInfo, 'status' | 'lateMinutes'>): string {
  switch (info.status) {
    case 'early': return `Sớm ${Math.abs(info.lateMinutes || 0)} phút`
    case 'on_time': return 'Đúng giờ'
    case 'late': return `Trễ ${info.lateMinutes} phút`
    case 'waiting': return 'Chưa tới giờ'
    case 'missing_live': return 'Chưa vào lớp'
    case 'missing': return 'Không bấm Vào lớp'
    case 'no_data': return 'Chưa có dữ liệu'
    default: return 'Thiếu giờ học'
  }
}

export type TeacherCheckinTone = 'good' | 'warn' | 'bad' | 'muted' | 'info'

export function teacherCheckinTone(info: Pick<TeacherCheckinInfo, 'status' | 'lateMinutes'>): TeacherCheckinTone {
  if (info.status === 'early' || info.status === 'on_time') return 'good'
  if (info.status === 'late') return (info.lateMinutes || 0) >= TEACHER_CHECKIN_SERIOUS_LATE_MINUTES ? 'bad' : 'warn'
  if (info.status === 'missing' || info.status === 'missing_live') return 'bad'
  if (info.status === 'waiting') return 'info'
  return 'muted'
}

/** "19:58:07" theo giờ Việt Nam, không phụ thuộc múi giờ máy của admin. */
export function formatVietnamTime(ms: number, withSeconds = true): string {
  const iso = new Date(ms + VN_OFFSET_MS).toISOString()
  return iso.slice(11, withSeconds ? 19 : 16)
}

/** "25/09" theo giờ Việt Nam. */
export function formatVietnamDayMonth(ms: number): string {
  const iso = new Date(ms + VN_OFFSET_MS).toISOString()
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

export interface TeacherCheckinSummary {
  total: number
  onTime: number
  late: number
  missing: number
  waiting: number
  noData: number
  /** Tổng phút trễ của các ca trễ (để tính trung bình). */
  lateMinutesTotal: number
  maxLateMinutes: number
  /** % ca đúng giờ trên số ca đã tới giờ và có dữ liệu; null nếu chưa có ca nào. */
  onTimeRate: number | null
}

export function emptyTeacherCheckinSummary(): TeacherCheckinSummary {
  return { total: 0, onTime: 0, late: 0, missing: 0, waiting: 0, noData: 0, lateMinutesTotal: 0, maxLateMinutes: 0, onTimeRate: null }
}

export function addToTeacherCheckinSummary(summary: TeacherCheckinSummary, info: TeacherCheckinInfo): TeacherCheckinSummary {
  const next = { ...summary, total: summary.total + 1 }
  if (info.status === 'early' || info.status === 'on_time') next.onTime += 1
  else if (info.status === 'late') {
    next.late += 1
    next.lateMinutesTotal += info.lateMinutes || 0
    next.maxLateMinutes = Math.max(next.maxLateMinutes, info.lateMinutes || 0)
  } else if (info.status === 'missing' || info.status === 'missing_live') next.missing += 1
  else if (info.status === 'waiting') next.waiting += 1
  else next.noData += 1
  const evaluated = next.onTime + next.late + next.missing
  next.onTimeRate = evaluated > 0 ? Math.round((next.onTime / evaluated) * 100) : null
  return next
}

export function summarizeTeacherCheckins(infos: TeacherCheckinInfo[]): TeacherCheckinSummary {
  return infos.reduce(addToTeacherCheckinSummary, emptyTeacherCheckinSummary())
}
