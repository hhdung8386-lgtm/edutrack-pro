import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isActiveBooking } from '@/lib/bookingConflicts'
import type { BookingRequest, Lesson, LessonScheduleCheckSnapshot } from '@/types'

/**
 * Kiểm tra chéo giữa BUỔI ĐIỂM DANH và LỊCH ĐÃ XẾP (bookingRequests).
 *
 * Hai rủi ro mà giáo vụ cần thấy trước khi duyệt:
 *  1. Gia sư điểm danh SAI NGÀY so với ca đã xếp (học viên có lịch ngày khác).
 *  2. Gia sư điểm danh DƯ trong cùng một ngày cho cùng một học viên.
 *
 * Nguyên tắc chống báo động giả: học viên KHÔNG dùng lịch đặt (lịch cố định)
 * thì không có dữ liệu để đối chiếu -> trả về 'no_booking' và hiển thị trung tính,
 * tuyệt đối không tô đỏ như lỗi.
 */

/** Số lần điểm danh tối đa cho CÙNG học viên + CÙNG gia sư trong 1 ngày. */
export const MAX_DAILY_ATTENDANCE_PER_STUDENT = 3

/** Cửa sổ dò lịch đã xếp quanh ngày điểm danh (ngày trước + sau). */
export const SCHEDULE_MATCH_WINDOW_DAYS = 7

export type ScheduleCheckStatus = LessonScheduleCheckSnapshot['status']

/**
 * Kết quả đối chiếu lịch. Dùng chung kiểu với bản lưu kèm buổi dạy
 * (`Lesson.scheduleCheck`) để hai nơi không bao giờ lệch nhau.
 */
export type LessonScheduleCheck = LessonScheduleCheckSnapshot

export interface AttendanceAudit {
  schedule: LessonScheduleCheck
  /** Các buổi điểm danh còn hiệu lực của CÙNG học viên trong ngày (đã bỏ từ chối/đã huỷ). */
  sameDayLessons: Lesson[]
  /** Trong đó, số buổi do chính gia sư đang xét ghi nhận. */
  sameDayByTeacher: number
}

const INACTIVE_LESSON_STATUSES = new Set(['rejected', 'cancelled'])

/** Buổi còn hiệu lực = chờ duyệt hoặc đã duyệt (từ chối / gia sư tự huỷ thì bỏ qua). */
export function isActiveAttendance(lesson: Pick<Lesson, 'status'>): boolean {
  return !INACTIVE_LESSON_STATUSES.has(lesson.status)
}

export function shiftDate(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00`)
  if (Number.isNaN(base.getTime())) return date
  base.setDate(base.getDate() + days)
  const y = base.getFullYear()
  const m = String(base.getMonth() + 1).padStart(2, '0')
  const d = String(base.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatShortDate(date: string): string {
  const [y, m, d] = (date || '').split('-')
  if (!y || !m || !d) return date || ''
  return `${d}/${m}/${y}`
}

function windowDates(date: string, windowDays: number): string[] {
  const dates: string[] = []
  for (let offset = -windowDays; offset <= windowDays; offset++) {
    dates.push(shiftDate(date, offset))
  }
  return dates
}

/**
 * Lấy các ca đã đặt của học viên quanh ngày điểm danh.
 * `in` + equality dùng được với index mặc định; nếu môi trường nào đó từ chối,
 * lùi về truy vấn đúng 1 ngày để tính năng vẫn chạy thay vì vỡ luồng điểm danh.
 */
export async function fetchStudentBookingsAround(
  studentId: string,
  date: string,
  windowDays: number = SCHEDULE_MATCH_WINDOW_DAYS,
): Promise<BookingRequest[]> {
  const dates = windowDates(date, windowDays)
  try {
    const snap = await getDocs(query(
      collection(db, 'bookingRequests'),
      where('studentId', '==', studentId),
      where('requestedDate', 'in', dates),
    ))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookingRequest))
  } catch (err) {
    console.warn('[attendance-audit] fallback single-date booking query', err)
    const snap = await getDocs(query(
      collection(db, 'bookingRequests'),
      where('studentId', '==', studentId),
      where('requestedDate', '==', date),
    ))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookingRequest))
  }
}

export function evaluateLessonSchedule(
  bookings: BookingRequest[],
  lesson: { teacherId: string; date: string; minutes?: number },
  windowDays: number = SCHEDULE_MATCH_WINDOW_DAYS,
): LessonScheduleCheck {
  const base: Pick<LessonScheduleCheck, 'checkedAt' | 'windowDays' | 'scheduledDates'> = {
    checkedAt: lesson.date,
    windowDays,
    scheduledDates: [],
  }

  const active = bookings.filter((b) => isActiveBooking(b) && !!b.requestedDate)
  const sameDayOwn = active.filter((b) => b.requestedDate === lesson.date && b.teacherId === lesson.teacherId)

  if (sameDayOwn.length > 0) {
    // Ưu tiên ca trùng thời lượng để không báo lệch phút oan khi có nhiều ca trong ngày.
    const exact = sameDayOwn.find((b) => !lesson.minutes || b.requestedMinutes === lesson.minutes)
    const matched = exact || sameDayOwn[0]
    return {
      ...base,
      status: 'matched',
      scheduledDates: [lesson.date],
      bookingId: matched.id,
      // Chỉ set khi có giá trị: buổi được ghi vào Firestore, field undefined sẽ làm hỏng lệnh ghi.
      ...(matched.requestedStart ? { bookingStart: matched.requestedStart } : {}),
      ...(matched.requestedEnd ? { bookingEnd: matched.requestedEnd } : {}),
      ...(lesson.minutes && matched.requestedMinutes !== lesson.minutes
        ? { minutesMismatch: matched.requestedMinutes }
        : {}),
    }
  }

  const ownNearby = active
    .filter((b) => b.teacherId === lesson.teacherId)
    .sort((a, b) => Math.abs(dayDiff(a.requestedDate!, lesson.date)) - Math.abs(dayDiff(b.requestedDate!, lesson.date)))

  if (ownNearby.length > 0) {
    const scheduledDates = Array.from(new Set(ownNearby.map((b) => b.requestedDate!))).slice(0, 3)
    return { ...base, status: 'mismatch_day', scheduledDates }
  }

  const sameDayOther = active.filter((b) => b.requestedDate === lesson.date)
  if (sameDayOther.length > 0) {
    return {
      ...base,
      status: 'other_teacher',
      otherTeacherNames: Array.from(new Set(sameDayOther.map((b) => b.teacherName).filter(Boolean))).slice(0, 3),
    }
  }

  return { ...base, status: 'no_booking' }
}

function dayDiff(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`).getTime()
  const db_ = new Date(`${b}T00:00:00`).getTime()
  if (Number.isNaN(da) || Number.isNaN(db_)) return 999
  return Math.round((da - db_) / 86_400_000)
}

/** Buổi điểm danh của học viên trong ngày — bản dùng cho GIA SƯ (rules chỉ cho đọc buổi của mình). */
export async function fetchTeacherDayLessons(teacherId: string, studentId: string, date: string): Promise<Lesson[]> {
  const snap = await getDocs(query(
    collection(db, 'lessons'),
    where('teacherId', '==', teacherId),
    where('studentId', '==', studentId),
    where('date', '==', date),
  ))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
}

/** Buổi điểm danh của học viên trong ngày — bản dùng cho ADMIN (thấy mọi gia sư). */
export async function fetchStudentDayLessons(studentId: string, date: string): Promise<Lesson[]> {
  const snap = await getDocs(query(
    collection(db, 'lessons'),
    where('studentId', '==', studentId),
    where('date', '==', date),
  ))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
}

/** Kiểm tra trước khi GIA SƯ gửi điểm danh: lịch đã xếp + số buổi đã ghi trong ngày. */
export async function auditTeacherAttendance(input: {
  teacherId: string
  studentId: string
  date: string
  minutes?: number
}): Promise<AttendanceAudit> {
  const [bookings, dayLessons] = await Promise.all([
    fetchStudentBookingsAround(input.studentId, input.date),
    fetchTeacherDayLessons(input.teacherId, input.studentId, input.date),
  ])
  const sameDayLessons = dayLessons.filter(isActiveAttendance)
  return {
    schedule: evaluateLessonSchedule(bookings, input),
    sameDayLessons,
    sameDayByTeacher: sameDayLessons.filter((l) => l.teacherId === input.teacherId).length,
  }
}

/** Kiểm tra lại tại thời điểm ADMIN duyệt — dữ liệu tươi và thấy được cả gia sư khác. */
export async function auditLessonForAdmin(lesson: {
  id?: string
  teacherId: string
  studentId: string
  date: string
  minutes?: number
}): Promise<AttendanceAudit> {
  const [bookings, dayLessons] = await Promise.all([
    fetchStudentBookingsAround(lesson.studentId, lesson.date),
    fetchStudentDayLessons(lesson.studentId, lesson.date),
  ])
  const sameDayLessons = dayLessons.filter(isActiveAttendance)
  return {
    schedule: evaluateLessonSchedule(bookings, lesson),
    sameDayLessons,
    sameDayByTeacher: sameDayLessons.filter((l) => l.teacherId === lesson.teacherId).length,
  }
}

export type AuditTone = 'ok' | 'info' | 'warning' | 'danger'

export interface AuditMessage {
  tone: AuditTone
  title: string
  detail?: string
}

/** Diễn giải kết quả đối chiếu lịch thành thông điệp hiển thị (vi/en). */
export function describeSchedule(check: LessonScheduleCheck | undefined, lang: 'vi' | 'en' = 'vi'): AuditMessage | null {
  if (!check) return null
  const vi = lang === 'vi'
  switch (check.status) {
    case 'matched':
      return {
        tone: check.minutesMismatch ? 'warning' : 'ok',
        title: vi ? 'Khớp lịch đã xếp' : 'Matches the arranged schedule',
        detail: check.minutesMismatch
          ? (vi
              ? `Lệch thời lượng: ca đã xếp ${check.minutesMismatch} phút`
              : `Duration differs: the arranged slot is ${check.minutesMismatch} minutes`)
          : (check.bookingStart ? `${check.bookingStart} - ${check.bookingEnd}` : undefined),
      }
    case 'mismatch_day':
      return {
        tone: 'danger',
        title: vi ? 'Điểm danh SAI NGÀY so với lịch đã xếp' : 'Attendance date does not match the schedule',
        detail: vi
          ? `Lịch đã xếp với gia sư này: ${check.scheduledDates.map(formatShortDate).join(', ')}`
          : `Arranged with this teacher on: ${check.scheduledDates.map(formatShortDate).join(', ')}`,
      }
    case 'other_teacher':
      return {
        tone: 'danger',
        title: vi ? 'Ngày này học viên được xếp với gia sư khác' : 'That day the student is scheduled with another teacher',
        detail: (check.otherTeacherNames || []).length > 0
          ? (vi ? `Gia sư đã xếp: ${check.otherTeacherNames!.join(', ')}` : `Scheduled teacher: ${check.otherTeacherNames!.join(', ')}`)
          : undefined,
      }
    case 'no_booking':
    default:
      return {
        tone: 'info',
        title: vi ? 'Không có lịch đặt để đối chiếu' : 'No booking to cross-check',
        detail: vi
          ? 'Học viên không có ca đặt lịch quanh ngày này (thường là học viên lịch cố định).'
          : 'The student has no booking around this date (usually a fixed-schedule student).',
      }
  }
}

/** Diễn giải số lần điểm danh trong ngày. `extra` = buổi sắp ghi thêm (gia sư) hoặc 0 (admin). */
export function describeDailyCount(
  count: number,
  lang: 'vi' | 'en' = 'vi',
  options: { blocked?: boolean } = {},
): AuditMessage | null {
  const vi = lang === 'vi'
  if (count <= 1) return null
  if (options.blocked || count > MAX_DAILY_ATTENDANCE_PER_STUDENT) {
    return {
      tone: 'danger',
      title: vi
        ? `Điểm danh quá ${MAX_DAILY_ATTENDANCE_PER_STUDENT} lần trong 1 ngày cho học viên này (${count} lần)`
        : `More than ${MAX_DAILY_ATTENDANCE_PER_STUDENT} attendances in one day for this student (${count})`,
      detail: vi
        ? 'Vượt giới hạn cho phép — vui lòng kiểm tra lại, khả năng cao là điểm danh dư.'
        : 'Above the allowed limit — please double-check, this is very likely a duplicate.',
    }
  }
  return {
    tone: 'warning',
    title: vi
      ? `Học viên đã có ${count} buổi điểm danh trong cùng ngày`
      : `The student already has ${count} attendances on the same day`,
    detail: vi ? 'Kiểm tra kỹ để tránh ghi nhận dư buổi.' : 'Double-check to avoid duplicated sessions.',
  }
}
