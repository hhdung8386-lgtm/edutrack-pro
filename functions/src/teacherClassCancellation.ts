/**
 * Gia sư xin huỷ (xin nghỉ) một ca đã xếp. Gia sư chỉ GỬI yêu cầu; giáo vụ
 * duyệt mới nhả ca và kim cương đang giữ của học viên. Yêu cầu nằm ngay trên
 * dòng bookingRequests (trường phẳng để admin lọc bằng index một trường).
 */
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^\d{2}:\d{2}$/
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000

export const TEACHER_CANCELLATION_REASON_MAX = 500
export const TEACHER_CANCELLATION_REASON_MIN = 5
export const TEACHER_CANCELLATION_NOTICE_MS = 60 * 60 * 1000
export const LATE_CANCELLATION_PENALTY_AMOUNT_VND = 50_000
/** Đề xuất lịch học bù: ghi chú cho giáo vụ, tối đa 3 lịch, trong 7 ngày tới (giờ VN). */
export const TEACHER_CANCELLATION_MAKEUP_MAX = 3
export const TEACHER_CANCELLATION_MAKEUP_WINDOW_DAYS = 7

export type TeacherClassCancellationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'closed'

export type TeacherClassCancellationRequest = {
  bookingId: string
  action: 'request' | 'withdraw'
  reason: string
  acceptLatePenalty: boolean
  /**
   * Chỉ là ghi chú hiển thị cho giáo vụ, không tạo ca. `null` = client cũ chưa có
   * mục này (vẫn nhận yêu cầu như trước); client mới luôn gửi 1–3 lịch.
   */
  makeupProposals: TeacherCancellationMakeupProposal[] | null
}

/** Ngày giờ theo giờ Việt Nam (cùng quy ước với requestedDate/requestedStart của ca). */
export type TeacherCancellationMakeupProposal = { date: string; time: string }

export class TeacherClassCancellationValidationError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message)
    this.name = 'TeacherClassCancellationValidationError'
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

export function normalizeTeacherClassCancellationRequest(value: unknown): TeacherClassCancellationRequest {
  const data = record(value)
  const bookingId = cleanText(data.bookingId, 160)
  if (!SAFE_ID_PATTERN.test(bookingId)) {
    throw new TeacherClassCancellationValidationError('BOOKING_ID_INVALID', 'Mã ca học không hợp lệ.')
  }
  const action = cleanText(data.action, 20) || 'request'
  if (action !== 'request' && action !== 'withdraw') {
    throw new TeacherClassCancellationValidationError('CANCELLATION_ACTION_INVALID', 'Thao tác không hợp lệ.')
  }
  const rawReason = typeof data.reason === 'string' ? data.reason.trim() : ''
  if (action === 'request') {
    if (rawReason.length < TEACHER_CANCELLATION_REASON_MIN) {
      throw new TeacherClassCancellationValidationError('CANCELLATION_REASON_REQUIRED', 'Vui lòng nhập lý do xin huỷ lớp.')
    }
    if (rawReason.length > TEACHER_CANCELLATION_REASON_MAX) {
      throw new TeacherClassCancellationValidationError('CANCELLATION_REASON_TOO_LONG', 'Lý do quá dài.')
    }
  }
  return {
    bookingId,
    action,
    reason: action === 'request' ? rawReason : '',
    acceptLatePenalty: action === 'request' && data.acceptLatePenalty === true,
    makeupProposals: action === 'request' ? normalizeMakeupProposals(data.makeupProposals) : null,
  }
}

function makeupProposalMs(date: string, time: string): number | null {
  return bookingStartMs({ requestedDate: date, requestedStart: time })
}

/** Kiểm tra định dạng, số lượng và trùng lặp. Mốc thời gian kiểm tra ở makeupProposalWindowBlocker. */
export function normalizeMakeupProposals(value: unknown): TeacherCancellationMakeupProposal[] | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) {
    throw new TeacherClassCancellationValidationError('MAKEUP_PROPOSALS_INVALID', 'Đề xuất lịch học bù không hợp lệ.')
  }
  if (value.length > TEACHER_CANCELLATION_MAKEUP_MAX) {
    throw new TeacherClassCancellationValidationError('MAKEUP_PROPOSALS_TOO_MANY', 'Chỉ được đề xuất tối đa 3 lịch học bù.')
  }
  const result: TeacherCancellationMakeupProposal[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const row = record(item)
    const date = cleanText(row.date, 10)
    const time = cleanText(row.time, 5)
    if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time) || makeupProposalMs(date, time) === null) {
      throw new TeacherClassCancellationValidationError('MAKEUP_PROPOSALS_INVALID', 'Mỗi lịch học bù cần có ngày và giờ hợp lệ.')
    }
    const key = `${date} ${time}`
    if (seen.has(key)) {
      throw new TeacherClassCancellationValidationError('MAKEUP_PROPOSALS_DUPLICATE', 'Các lịch học bù đề xuất không được trùng nhau.')
    }
    seen.add(key)
    result.push({ date, time })
  }
  if (result.length === 0) {
    throw new TeacherClassCancellationValidationError('MAKEUP_PROPOSALS_REQUIRED', 'Vui lòng đề xuất ít nhất 1 lịch học bù.')
  }
  return result
}

/** Ngày YYYY-MM-DD theo giờ Việt Nam của một mốc thời gian. */
function vietnamDateISO(ms: number): string {
  return new Date(ms + VIETNAM_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Mỗi lịch học bù phải ở sau thời điểm gửi và không quá hết ngày thứ 7 kể từ
 * hôm nay (giờ VN). Trả '' nếu hợp lệ.
 */
export function makeupProposalWindowBlocker(
  proposals: TeacherCancellationMakeupProposal[] | null,
  nowMs: number,
): string {
  if (!proposals) return ''
  const today = vietnamDateISO(nowMs)
  const [year, month, day] = today.split('-').map(Number)
  const lastDate = new Date(Date.UTC(year, month - 1, day + TEACHER_CANCELLATION_MAKEUP_WINDOW_DAYS)).toISOString().slice(0, 10)
  for (const proposal of proposals) {
    const startMs = makeupProposalMs(proposal.date, proposal.time)
    if (startMs === null || startMs <= nowMs) return 'MAKEUP_PROPOSAL_IN_PAST'
    if (proposal.date > lastDate) return 'MAKEUP_PROPOSAL_OUT_OF_WINDOW'
  }
  return ''
}

/** Mốc bắt đầu ca theo giờ Việt Nam (dữ liệu booking luôn lưu giờ VN). */
export function bookingStartMs(booking: Record<string, unknown>): number | null {
  const date = cleanText(booking.requestedDate, 10)
  const start = cleanText(booking.requestedStart, 5)
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(start)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = start.split(':').map(Number)
  if (hours > 23 || minutes > 59) return null
  const utc = Date.UTC(year, month - 1, day, hours, minutes)
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return utc - VIETNAM_OFFSET_MS
}

export function teacherCancellationStatusOf(booking: Record<string, unknown>): TeacherClassCancellationStatus | '' {
  const status = cleanText(booking.teacherCancellationStatus, 20)
  return ['pending', 'approved', 'rejected', 'withdrawn', 'closed'].includes(status)
    ? status as TeacherClassCancellationStatus
    : ''
}

export function teacherCancellationPenaltySnapshot(
  booking: Record<string, unknown>,
  nowMs: number,
  acceptLatePenalty: boolean,
): { amount: number; currency: 'VND'; noticeMinutes: number } {
  const startMs = bookingStartMs(booking)
  if (startMs === null || startMs <= nowMs) {
    throw new TeacherClassCancellationValidationError('BOOKING_TIME_INVALID', 'Ca học chưa có ngày giờ hợp lệ.')
  }
  const remainingMs = startMs - nowMs
  const amount = remainingMs < TEACHER_CANCELLATION_NOTICE_MS
    ? LATE_CANCELLATION_PENALTY_AMOUNT_VND
    : 0
  if (amount > 0 && !acceptLatePenalty) {
    throw new TeacherClassCancellationValidationError(
      'LATE_CANCELLATION_PENALTY_CONSENT_REQUIRED',
      'Huỷ lớp khi còn dưới 1 giờ sẽ bị khấu trừ 50.000đ. Vui lòng xác nhận lại.',
    )
  }
  return {
    amount,
    currency: 'VND',
    noticeMinutes: Math.max(0, Math.floor(remainingMs / 60_000)),
  }
}

/**
 * Trả về mã lỗi nếu gia sư KHÔNG được gửi yêu cầu cho ca này, '' nếu hợp lệ.
 * Chỉ ca đã xếp (confirmed), chưa điểm danh, chưa bắt đầu và chưa có yêu cầu
 * đang chờ mới được gửi — tránh xin huỷ ca đã dạy/đã tính lương.
 */
export function teacherCancellationRequestBlocker(
  booking: Record<string, unknown>,
  teacherId: string,
  nowMs: number,
): string {
  if (booking.teacherId !== teacherId) return 'BOOKING_TEACHER_MISMATCH'
  if (booking.status !== 'confirmed') return 'BOOKING_NOT_CONFIRMED'
  if (cleanText(booking.lessonId, 160)) return 'BOOKING_ALREADY_ATTENDED'
  if (teacherCancellationStatusOf(booking) === 'pending') return 'CANCELLATION_ALREADY_PENDING'
  const startMs = bookingStartMs(booking)
  if (startMs === null) return 'BOOKING_TIME_INVALID'
  if (startMs <= nowMs) return 'BOOKING_ALREADY_STARTED'
  return ''
}

export function teacherCancellationWithdrawBlocker(booking: Record<string, unknown>, teacherId: string): string {
  if (booking.teacherId !== teacherId) return 'BOOKING_TEACHER_MISMATCH'
  if (teacherCancellationStatusOf(booking) !== 'pending') return 'CANCELLATION_NOT_PENDING'
  return ''
}

export const TEACHER_CANCELLATION_BLOCKER_MESSAGES: Record<string, string> = {
  BOOKING_TEACHER_MISMATCH: 'Ca học không thuộc gia sư đang đăng nhập.',
  BOOKING_NOT_CONFIRMED: 'Chỉ gửi yêu cầu huỷ cho ca đã được xếp lớp.',
  BOOKING_ALREADY_ATTENDED: 'Ca đã được điểm danh nên không thể xin huỷ.',
  CANCELLATION_ALREADY_PENDING: 'Ca này đã có yêu cầu huỷ đang chờ duyệt.',
  BOOKING_TIME_INVALID: 'Ca học chưa có ngày giờ hợp lệ. Vui lòng liên hệ giáo vụ.',
  BOOKING_ALREADY_STARTED: 'Ca học đã bắt đầu hoặc đã qua. Vui lòng liên hệ giáo vụ.',
  CANCELLATION_NOT_PENDING: 'Yêu cầu huỷ không còn ở trạng thái chờ duyệt.',
  MAKEUP_PROPOSAL_IN_PAST: 'Lịch học bù đề xuất phải ở sau thời điểm hiện tại.',
  MAKEUP_PROPOSAL_OUT_OF_WINDOW: 'Lịch học bù đề xuất phải nằm trong 7 ngày tới.',
}
