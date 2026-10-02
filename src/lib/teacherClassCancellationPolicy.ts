export const TEACHER_CANCELLATION_NOTICE_MS = 60 * 60 * 1000
export const LATE_CANCELLATION_PENALTY_AMOUNT_VND = 50_000

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000

export interface TeacherCancellationBookingTime {
  requestedDate?: string
  requestedStart?: string
}

/** Mốc bắt đầu ca theo giờ Việt Nam (dữ liệu booking luôn lưu giờ VN). */
export function bookingStartMs(booking: TeacherCancellationBookingTime): number | null {
  const date = booking.requestedDate || ''
  const start = booking.requestedStart || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = start.split(':').map(Number)
  if (hours > 23 || minutes > 59) return null
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return Date.UTC(year, month - 1, day, hours, minutes) - VIETNAM_OFFSET_MS
}

export function lateTeacherCancellationPenaltyApplies(
  booking: TeacherCancellationBookingTime | null | undefined,
  nowMs: number,
) {
  if (!booking) return false
  const startMs = bookingStartMs(booking)
  return startMs !== null && startMs > nowMs && startMs - nowMs < TEACHER_CANCELLATION_NOTICE_MS
}

export function lateCancellationPenaltyPayrollId(bookingId: string) {
  return `teacher-cancellation-${bookingId}`
}

/**
 * Đề xuất lịch học bù khi gia sư xin huỷ lớp: chỉ là GHI CHÚ cho giáo vụ
 * (không tạo ca, không giữ kim cương). Bắt buộc 1–3 lịch, mỗi lịch sau thời
 * điểm gửi và không quá hết ngày thứ 7 kể từ hôm nay (giờ VN) — cùng quy tắc
 * với callable requestTeacherClassCancellation.
 */
export const TEACHER_CANCELLATION_MAKEUP_MAX = 3
export const TEACHER_CANCELLATION_MAKEUP_WINDOW_DAYS = 7

export interface MakeupProposalDraft {
  date: string
  time: string
}

export type MakeupProposalIssue = 'incomplete' | 'invalid' | 'past' | 'out_of_window' | 'duplicate'

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/
const TIME_HM = /^\d{2}:\d{2}$/

function addDaysISO(dateISO: string, days: number) {
  const [year, month, day] = dateISO.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** Ngày YYYY-MM-DD tại một múi giờ cố định (giờ VN = 7). */
export function dateISOAtOffsetMs(nowMs: number, offsetHours: number) {
  return new Date(nowMs + offsetHours * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Khoảng ngày được chọn trên ô nhập, tính theo lịch của gia sư. */
export function makeupProposalDateRange(nowMs: number, teacherOffset: number) {
  const min = dateISOAtOffsetMs(nowMs, teacherOffset)
  return { min, max: addDaysISO(min, TEACHER_CANCELLATION_MAKEUP_WINDOW_DAYS) }
}

/** Đổi ngày giờ gia sư nhập (theo múi giờ của gia sư) sang giờ VN để lưu. */
export function teacherDateTimeToVietnam(dateISO: string, time: string, teacherOffset: number): MakeupProposalDraft | null {
  if (!DATE_ISO.test(dateISO) || !TIME_HM.test(time)) return null
  const [year, month, day] = dateISO.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  if (hours > 23 || minutes > 59) return null
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  const vn = new Date(Date.UTC(year, month - 1, day, hours, minutes) + Math.round((7 - teacherOffset) * 60) * 60_000)
  return {
    date: vn.toISOString().slice(0, 10),
    time: `${String(vn.getUTCHours()).padStart(2, '0')}:${String(vn.getUTCMinutes()).padStart(2, '0')}`,
  }
}

/**
 * Kiểm tra từng dòng (đã đổi sang giờ VN). Dòng trống hoàn toàn bỏ qua; trả về lỗi
 * theo vị trí dòng và danh sách hợp lệ để gửi.
 */
export function evaluateMakeupProposals(rows: MakeupProposalDraft[], teacherOffset: number, nowMs: number) {
  const issues: (MakeupProposalIssue | null)[] = []
  const proposals: MakeupProposalDraft[] = []
  const seen = new Set<string>()
  const lastVietnamDate = addDaysISO(dateISOAtOffsetMs(nowMs, 7), TEACHER_CANCELLATION_MAKEUP_WINDOW_DAYS)
  for (const row of rows.slice(0, TEACHER_CANCELLATION_MAKEUP_MAX)) {
    const date = (row.date || '').trim()
    const time = (row.time || '').trim()
    if (!date && !time) { issues.push(null); continue }
    if (!date || !time) { issues.push('incomplete'); continue }
    const vn = teacherDateTimeToVietnam(date, time, teacherOffset)
    const startMs = vn ? bookingStartMs({ requestedDate: vn.date, requestedStart: vn.time }) : null
    if (!vn || startMs === null) { issues.push('invalid'); continue }
    if (startMs <= nowMs) { issues.push('past'); continue }
    if (vn.date > lastVietnamDate) { issues.push('out_of_window'); continue }
    const key = `${vn.date} ${vn.time}`
    if (seen.has(key)) { issues.push('duplicate'); continue }
    seen.add(key)
    issues.push(null)
    proposals.push(vn)
  }
  return { issues, proposals, valid: proposals.length > 0 && issues.every((issue) => issue === null) }
}

const WEEKDAY_VI = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Thứ 4, 02/10/2026 · 19:00" — dùng cho cả gia sư và giáo vụ. */
export function formatMakeupProposal(dateISO: string, time: string, lang: 'vi' | 'en' = 'vi') {
  if (!DATE_ISO.test(dateISO)) return `${dateISO} · ${time}`
  const [year, month, day] = dateISO.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const label = lang === 'vi' ? WEEKDAY_VI[weekday] : WEEKDAY_EN[weekday]
  return `${label}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year} · ${time}`
}
