/**
 * Email nhắc lịch dạy cho gia sư. Chỉ là hàm thuần (không đụng Firestore) để
 * test được: chọn ca, gom ca theo gia sư/ngày và dựng nội dung email.
 */

export type TeacherScheduleBooking = {
  id: string
  status?: string
  lessonId?: string
  teacherId?: string
  studentId?: string
  studentCode?: string
  subjectName?: string
  requestedDate?: string
  requestedStart?: string
  requestedEnd?: string
  requestedMinutes?: number
}

export type TeacherScheduleTeacher = {
  code?: string
  name?: string
  email?: string
  status?: string
  timezoneOffset?: number
  country?: string
}

export type TeacherScheduleEmailKind = 'digest' | 'upcoming' | 'manual'

const TEACHER_PORTAL_URL = 'https://www.123english.edu.vn/teacher/schedules'
const BRAND_LOGO_URL = 'https://www.123english.edu.vn/brand-logo.png'
const VIETNAM_OFFSET_HOURS = 7

export function isTeacherReminderEmail(value: string | undefined): value is string {
  const email = value?.trim().toLowerCase() || ''
  // Email đăng nhập nội bộ @edutrackpro.app không có hộp thư thật.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('@edutrackpro.app')
}

function timeToMinutes(value?: string): number | null {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null
  const [hour, minute] = value.split(':').map(Number)
  if (hour < 0 || hour > 25 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

function minutesToTime(value: number): string {
  const normalized = ((value % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function bookingEnd(booking: TeacherScheduleBooking): string | undefined {
  if (timeToMinutes(booking.requestedEnd) !== null) return booking.requestedEnd
  const start = timeToMinutes(booking.requestedStart)
  const duration = Number(booking.requestedMinutes)
  return start !== null && Number.isFinite(duration) && duration > 0 ? minutesToTime(start + duration) : undefined
}

/** Ca còn hiệu lực trên Lịch dạy: đã xác nhận, chưa điểm danh, có gia sư và giờ hợp lệ. */
export function isActiveTeachingBooking(booking: TeacherScheduleBooking): boolean {
  return booking.status === 'confirmed'
    && !booking.lessonId
    && Boolean(booking.teacherId)
    && Boolean(booking.requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(booking.requestedDate))
    && timeToMinutes(booking.requestedStart) !== null
}

function sortBookings<T extends TeacherScheduleBooking>(bookings: T[]): T[] {
  return [...bookings].sort((left, right) =>
    (left.requestedDate || '').localeCompare(right.requestedDate || '')
    || (timeToMinutes(left.requestedStart) ?? 0) - (timeToMinutes(right.requestedStart) ?? 0)
    || left.id.localeCompare(right.id))
}

/** Gom các ca của từng gia sư theo ngày (mỗi gia sư/ngày = một email). */
export function groupTeacherScheduleDays<T extends TeacherScheduleBooking>(bookings: T[]): Array<{ teacherId: string; date: string; bookings: T[] }> {
  const groups = new Map<string, { teacherId: string; date: string; bookings: T[] }>()
  for (const booking of sortBookings(bookings.filter(isActiveTeachingBooking))) {
    const key = `${booking.teacherId}|${booking.requestedDate}`
    const group = groups.get(key) || { teacherId: booking.teacherId!, date: booking.requestedDate!, bookings: [] }
    group.bookings.push(booking)
    groups.set(key, group)
  }
  return [...groups.values()]
}

/**
 * Chia lịch trong ngày thành các "cụm dạy": các ca nối tiếp nhau (ca sau bắt
 * đầu không quá 5 phút sau khi ca trước kết thúc) được nhắc chung một lần.
 */
export function splitTeachingBlocks<T extends TeacherScheduleBooking>(bookings: T[]): Array<{ start: string; bookings: T[] }> {
  const blocks: Array<{ start: string; endMinutes: number; bookings: T[] }> = []
  for (const booking of sortBookings(bookings)) {
    const start = timeToMinutes(booking.requestedStart)
    if (start === null) continue
    const end = timeToMinutes(bookingEnd(booking)) ?? start + 25
    const last = blocks[blocks.length - 1]
    if (last && start <= last.endMinutes + 5) {
      last.bookings.push(booking)
      last.endMinutes = Math.max(last.endMinutes, end)
    } else {
      blocks.push({ start: booking.requestedStart!, endMinutes: end, bookings: [booking] })
    }
  }
  return blocks.map(({ start, bookings: items }) => ({ start, bookings: items }))
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character] ?? character))
}

function formatDate(dateISO: string): string {
  const [year, month, day] = dateISO.split('-')
  return `${day}/${month}/${year}`
}

function localTimeNote(time: string | undefined, offsetHours: number): string {
  const minutes = timeToMinutes(time)
  if (minutes === null || offsetHours === VIETNAM_OFFSET_HOURS) return ''
  return minutesToTime(minutes + Math.round((offsetHours - VIETNAM_OFFSET_HOURS) * 60))
}

function slotTime(booking: TeacherScheduleBooking): string {
  const end = bookingEnd(booking)
  return end ? `${booking.requestedStart}–${end}` : booking.requestedStart || ''
}

// Múi giờ chuẩn (không DST) mà hồ sơ gia sư lưu theo quốc gia, và vùng giờ IANA tương ứng.
// Giữ khớp với src/lib/teacherCountries.ts ở frontend.
const COUNTRY_STANDARD_OFFSETS: Record<string, number> = {
  VN: 7, PH: 8, GB: 0, US: -5, CA: -5, ZA: 2, AU: 10, NZ: 12, IE: 0,
  KE: 3, NG: 1, GH: 0, UG: 3, IN: 5.5, PK: 5, BD: 6, LK: 5.5,
  MM: 6.5, MY: 8, ID: 7, JP: 9, KR: 9, SG: 8, TH: 7,
  UK: 0, US_EST: -5, US_PST: -8,
}
const COUNTRY_TIMEZONES: Record<string, string> = {
  GB: 'Europe/London', UK: 'Europe/London', IE: 'Europe/Dublin',
  US: 'America/New_York', US_EST: 'America/New_York', US_PST: 'America/Los_Angeles',
  CA: 'America/Toronto', AU: 'Australia/Sydney', NZ: 'Pacific/Auckland',
}

/** UTC offset (giờ) thật của vùng giờ tại một thời điểm — có tính giờ mùa hè. */
export function zoneOffsetHours(timeZone: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at)
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value)
    const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour') % 24, value('minute'), value('second'))
    const offset = Math.round(((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 3_600_000) * 4) / 4
    return Number.isFinite(offset) ? offset : null
  } catch {
    return null
  }
}

/**
 * Offset của gia sư tại thời điểm `at`. Hồ sơ chỉ lưu giờ chuẩn của quốc gia nên lệch
 * 1 giờ khi có giờ mùa hè (Anh/Mỹ/Canada mùa hè, Úc/NZ tháng 10–4). Nếu giá trị lưu
 * đúng bằng giờ chuẩn của quốc gia thì dùng giờ thật có DST; giá trị admin tự đặt
 * khác đi thì giữ nguyên.
 */
export function teacherOffsetAt(teacher: TeacherScheduleTeacher, at: Date): number {
  const raw = Number(teacher.timezoneOffset)
  const stored = Number.isFinite(raw) && raw >= -12 && raw <= 14 && teacher.timezoneOffset !== undefined && teacher.timezoneOffset !== null
    ? raw
    : undefined
  const code = String(teacher.country || '').trim().toUpperCase()
  const standard = code ? COUNTRY_STANDARD_OFFSETS[code] : undefined
  const zone = code ? COUNTRY_TIMEZONES[code] : undefined
  if (zone && (stored === undefined || stored === standard)) {
    const live = zoneOffsetHours(zone, at)
    if (live !== null) return live
  }
  return stored ?? standard ?? VIETNAM_OFFSET_HOURS
}

/** Thời điểm thật (UTC) của một giờ học tính theo giờ Việt Nam. */
function vietnamInstant(dateISO: string, time?: string): Date {
  const minutes = timeToMinutes(time) ?? 0
  const [year, month, day] = dateISO.split('-').map(Number)
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1, 0, minutes) - VIETNAM_OFFSET_HOURS * 3_600_000)
}

export function buildTeacherScheduleEmail(
  teacher: TeacherScheduleTeacher,
  days: Array<{ date: string; bookings: TeacherScheduleBooking[] }>,
  kind: TeacherScheduleEmailKind,
) {
  const nonEmptyDays = days.filter((day) => day.bookings.length > 0)
  if (nonEmptyDays.length === 0) throw new Error('Cannot build a teacher schedule email without classes')

  const offsetFor = (date: string, time?: string) => teacherOffsetAt(teacher, vietnamInstant(date, time))
  const showLocal = nonEmptyDays.some((day) => day.bookings.some((booking) => offsetFor(day.date, booking.requestedStart) !== VIETNAM_OFFSET_HOURS))
  const teacherLabel = teacher.code?.trim() || teacher.name?.trim() || 'Teacher'
  const totalClasses = nonEmptyDays.reduce((sum, day) => sum + day.bookings.length, 0)
  const firstDay = nonEmptyDays[0]
  const firstStart = sortBookings(firstDay.bookings)[0]?.requestedStart || ''

  const heading = kind === 'upcoming'
    ? `Sắp đến giờ dạy · Class starting soon (${firstStart})`
    : kind === 'digest'
      ? `Lịch dạy ngày mai · Tomorrow's schedule (${formatDate(firstDay.date)})`
      : 'Lịch dạy sắp tới · Upcoming schedule'
  const subject = kind === 'upcoming'
    ? `[123English] Nhắc giờ dạy ${firstStart} ${formatDate(firstDay.date)}`
    : kind === 'digest'
      ? `[123English] Lịch dạy ngày ${formatDate(firstDay.date)} (${totalClasses} ca)`
      : `[123English] Lịch dạy sắp tới của bạn (${totalClasses} ca)`

  const textDays = nonEmptyDays.map((day) => {
    const rows = sortBookings(day.bookings).map((booking, index) => {
      const local = showLocal ? ` (giờ của bạn/your time: ${localTimeNote(booking.requestedStart, offsetFor(day.date, booking.requestedStart))})` : ''
      return `  ${index + 1}. ${slotTime(booking)}${local} · HV ${booking.studentCode?.trim() || '—'} · ${booking.subjectName?.trim() || '—'}`
    }).join('\n')
    return `Ngày ${formatDate(day.date)}:\n${rows}`
  }).join('\n\n')

  const text = `[AUTO REMINDER]

Xin chào ${teacherLabel},

${heading}
Giờ hiển thị theo giờ Việt Nam (GMT+7)${showLocal ? ', kèm giờ địa phương của bạn' : ''}.

${textDays}

Xem Lịch dạy và vào lớp: ${TEACHER_PORTAL_URL}

Vui lòng vào lớp đúng giờ và chuẩn bị bài trước. Nếu không thể dạy, hãy gửi "Yêu cầu huỷ lớp" trên Lịch dạy hoặc báo Giáo vụ sớm nhất có thể.

Trân trọng,
123English – Bộ phận Học vụ`

  const htmlDays = nonEmptyDays.map((day) => {
    const rows = sortBookings(day.bookings).map((booking, index) => {
      const local = showLocal
        ? `<br><span style="color:#637689;font-size:12px;font-weight:400">Giờ của bạn: ${escapeHtml(localTimeNote(booking.requestedStart, offsetFor(day.date, booking.requestedStart)))}</span>`
        : ''
      return `<tr>
        <td style="padding:11px 14px;border-top:${index === 0 ? '0' : '1px solid #e4edf3'};color:#14213d;font-size:14px;font-weight:700;white-space:nowrap;vertical-align:top">${escapeHtml(slotTime(booking))}${local}</td>
        <td style="padding:11px 14px;border-top:${index === 0 ? '0' : '1px solid #e4edf3'};color:#26384a;font-size:13px;line-height:1.55">Học viên <strong style="font-family:Consolas,monospace">${escapeHtml(booking.studentCode?.trim() || '—')}</strong><br>${escapeHtml(booking.subjectName?.trim() || '—')}</td>
      </tr>`
    }).join('')
    return `<h2 style="margin:22px 0 10px;font-size:16px;color:#14213d">Ngày ${escapeHtml(formatDate(day.date))} · ${day.bookings.length} ca</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:1px solid #dce8ef;border-radius:12px;background:#ffffff">${rows}</table>`
  }).join('')

  const html = `<!doctype html>
<html lang="vi">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:0;background:#f4f8fb;font-family:Arial,Helvetica,sans-serif;color:#14213d">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f8fb">
      <tr><td align="center" style="padding:28px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #dce8ef;border-radius:18px;overflow:hidden">
          <tr><td align="center" style="padding:22px 24px 18px;background:#fff315;border-bottom:5px solid #1caee4"><img src="${BRAND_LOGO_URL}" width="220" alt="123English" style="display:block;width:100%;max-width:220px;height:auto;border:0"></td></tr>
          <tr><td style="padding:26px 28px 12px">
            <div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#e7f7fd;color:#087da8;font-size:12px;font-weight:700;letter-spacing:.5px">AUTO REMINDER · GIA SƯ</div>
            <h1 style="margin:16px 0 8px;font-size:22px;line-height:1.3;color:#14213d">${escapeHtml(heading)}</h1>
            <p style="margin:0 0 6px;color:#26384a;font-size:15px;line-height:1.7">Xin chào <strong>${escapeHtml(teacherLabel)}</strong>,</p>
            <p style="margin:0;color:#637689;font-size:13px;line-height:1.6">Giờ hiển thị theo giờ Việt Nam (GMT+7)${showLocal ? ', kèm giờ địa phương của bạn' : ''}.</p>
            ${htmlDays}
            <div style="margin:24px 0 18px"><a href="${TEACHER_PORTAL_URL}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#1caee4;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Mở Lịch dạy · Open schedule</a></div>
            <p style="margin:0 0 18px;color:#26384a;font-size:14px;line-height:1.7">Vui lòng vào lớp đúng giờ và chuẩn bị bài trước. Nếu không thể dạy, hãy gửi <strong>"Yêu cầu huỷ lớp"</strong> trên Lịch dạy hoặc báo Giáo vụ sớm nhất có thể.</p>
            <p style="margin:0 0 20px;color:#26384a;font-size:14px;line-height:1.65">Trân trọng,<br><strong>123English</strong><br><em>Bộ phận Học vụ</em></p>
          </td></tr>
          <tr><td align="center" style="padding:18px 24px;background:#14213d;color:#cbd8e4;font-size:12px;line-height:1.6">Email nhắc lịch dạy tự động từ 123English<br><a href="https://www.123english.edu.vn" style="color:#62cdf1;text-decoration:none">www.123english.edu.vn</a></td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`

  return { subject, text, html }
}
