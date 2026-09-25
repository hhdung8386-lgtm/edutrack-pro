// Trạng thái hiển thị của một ca đã đặt so với giờ Việt Nam hiện tại.
// Chỉ dùng để gắn tag trên màn hình, không ghi gì vào dữ liệu.

export type BookingLiveStatus = 'upcoming' | 'live' | 'ended'

export interface BookingTimeFields {
  requestedDate?: string
  requestedStart?: string
  requestedEnd?: string
  requestedMinutes?: number
  studentName?: string
  studentCode?: string
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000

/** Ngày (YYYY-MM-DD) và số phút trong ngày theo giờ Việt Nam (GMT+7). */
export function getVietnamClock(nowMs: number): { date: string; minutes: number } {
  const iso = new Date(nowMs + VN_OFFSET_MS).toISOString()
  const [date, time] = iso.split('T')
  const [hh, mm] = time.split(':').map(Number)
  return { date, minutes: hh * 60 + mm }
}

function toMinutes(hhmm: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm || '')
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function getBookingLiveStatus(
  booking: BookingTimeFields,
  clock: { date: string; minutes: number },
): BookingLiveStatus {
  const date = booking.requestedDate || ''
  if (!date || date > clock.date) return 'upcoming'
  if (date < clock.date) return 'ended'

  const start = toMinutes(booking.requestedStart)
  if (start === null) return 'upcoming'
  let end = toMinutes(booking.requestedEnd)
  if (end === null) end = start + (booking.requestedMinutes || 25)
  // Ca kéo qua nửa đêm (vd 23:45 - 00:10) vẫn tính là đang học đến hết giờ.
  if (end <= start) end += 24 * 60

  if (clock.minutes < start) return 'upcoming'
  if (clock.minutes < end) return 'live'
  return 'ended'
}

/** Sắp xếp theo ngày học rồi giờ bắt đầu (sớm nhất trước), cùng giờ thì theo tên học viên. */
export function compareBookingsByTime(a: BookingTimeFields, b: BookingTimeFields): number {
  const dateCompare = (a.requestedDate || '').localeCompare(b.requestedDate || '')
  if (dateCompare !== 0) return dateCompare
  const startA = toMinutes(a.requestedStart) ?? Number.MAX_SAFE_INTEGER
  const startB = toMinutes(b.requestedStart) ?? Number.MAX_SAFE_INTEGER
  if (startA !== startB) return startA - startB
  const nameCompare = (a.studentName || '').trim()
    .localeCompare((b.studentName || '').trim(), 'vi', { sensitivity: 'base' })
  if (nameCompare !== 0) return nameCompare
  return (a.studentCode || '').localeCompare(b.studentCode || '')
}
