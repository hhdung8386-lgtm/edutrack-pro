// Soạn tin NHẮC LỊCH HỌC để giáo vụ copy gửi học viên (Zalo, Messenger...).
// Nội dung theo đúng mẫu trung tâm cung cấp; điền tên, mã học viên, ngày, giờ và link lớp.

export interface ReminderSession {
  start: string
  end: string
}

export interface ReminderInput {
  studentName: string
  studentCode?: string
  /** YYYY-MM-DD theo giờ Việt Nam. */
  date: string
  sessions: ReminderSession[]
  classroomLink: string
}

const DAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

/** "Thứ 7, 26/09/2026" */
export function formatReminderDate(date: string): string {
  const parsed = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(parsed)) return date
  const [y, m, d] = date.split('-')
  return `${DAY_LABELS[new Date(parsed).getUTCDay()]}, ${d}/${m}/${y}`
}

/** "20:00 - 20:25 và 20:30 - 20:55" — các ca cùng ngày gộp vào một tin. */
export function formatReminderTimes(sessions: ReminderSession[]): string {
  const ranges = Array.from(new Set([...sessions]
    .sort((a, b) => a.start.localeCompare(b.start, 'en', { numeric: true }))
    .map((s) => (s.end ? `${s.start} - ${s.end}` : s.start))))
  if (ranges.length <= 1) return ranges[0] || ''
  return `${ranges.slice(0, -1).join(', ')} và ${ranges[ranges.length - 1]}`
}

export function buildBookingReminderMessage(input: ReminderInput): string {
  const student = [input.studentName.trim(), (input.studentCode || '').trim()].filter(Boolean).join(' ')
  const classroomLink = input.classroomLink.trim()
  if (!classroomLink) throw new Error('REMINDER_CLASSROOM_LINK_REQUIRED')
  return [
    '[NHẮC LỊCH HỌC TỰ ĐỘNG]',
    '',
    `Kính gửi Quý học viên, ${student}`,
    `Lớp học tiếp theo sẽ diễn ra vào ${formatReminderDate(input.date)} lúc ${formatReminderTimes(input.sessions)}`,
    '',
    `Link vào lớp: ${classroomLink}`,
    '',
    'Quý học viên vui lòng xem trước bài và hoàn thành bài tập (nếu có).',
    '',
    '----------------------',
    '𝐋𝐮̛𝐮 𝐲́: Nếu cần huỷ lớp, Quý học viên vui lòng thông báo cho trung tâm ít nhất 1 tiếng trước giờ học để không bị trừ buổi và sắp xếp học bù trong vòng 7 ngày để duy trì tiến độ học tập.',
    '',
    'Chúc Quý học viên một ngày học tập hiệu quả!',
  ].join('\n')
}
