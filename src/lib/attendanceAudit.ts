import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isActiveBooking } from '@/lib/bookingConflicts'
import { matchesLessonBookingSubject, selectUniqueContiguousBookingSet } from '@/lib/bookingLogic'
import { checkBookingTimeRangeConsistency } from '@/lib/bookingTime'
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

/**
 * Buổi được tính khi dò "điểm danh dư trong ngày".
 * Buổi vắng ghi theo ca 25 phút liền sau là bản ghi có chủ đích (0 phút, không tính
 * tiền lần 2) nên KHÔNG được coi là điểm danh dư, tránh báo động giả cho giáo vụ.
 */
export function countsAsDailyAttendance(lesson: Pick<Lesson, 'status' | 'absenceFollowUpOf'>): boolean {
  return isActiveAttendance(lesson) && !lesson.absenceFollowUpOf
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
  lesson: { id?: string; teacherId: string; studentId?: string; subjectId?: string; date: string; minutes?: number },
  windowDays: number = SCHEDULE_MATCH_WINDOW_DAYS,
): LessonScheduleCheck {
  const base: Pick<LessonScheduleCheck, 'checkedAt' | 'windowDays' | 'scheduledDates'> = {
    checkedAt: lesson.date,
    windowDays,
    scheduledDates: [],
  }

  const active = bookings.filter((b) => isActiveBooking(b) && !!b.requestedDate)
  const matchesLessonStudent = (booking: BookingRequest) => !lesson.studentId || booking.studentId === lesson.studentId
  const matchesLessonSubject = (booking: BookingRequest) => matchesLessonBookingSubject(booking, lesson.subjectId)
  const sameDaySameTutor = active.filter((b) => (
    matchesLessonStudent(b)
    && b.requestedDate === lesson.date
    && b.teacherId === lesson.teacherId
  ))
  const sameDayOwn = sameDaySameTutor.filter((b) => (
    matchesLessonSubject(b)
  ))

  if (sameDayOwn.length > 0) {
    const eligibleOwn = sameDayOwn.filter((booking) => !booking.lessonId || booking.lessonId === lesson.id)
    const uniqueContiguousBookings = selectUniqueContiguousBookingSet(eligibleOwn, Number(lesson.minutes))
    // A fallback match is safe only when every eligible active row belongs to
    // that one class block. A separate same-day row without an explicit saved
    // reference remains ambiguous rather than being silently ignored.
    const matchedBookings = uniqueContiguousBookings.length === eligibleOwn.length
      ? uniqueContiguousBookings
      : []
    const matched = matchedBookings[0] || sameDayOwn[0]
    const hasAmbiguousBookingMatch = Number(lesson.minutes) > 0 && matchedBookings.length === 0
    let timeRangeMismatch: {
      booking: BookingRequest
      actualMinutes: number
      requestedMinutes: number
    } | null = null
    for (const booking of matchedBookings) {
      const consistency = checkBookingTimeRangeConsistency(booking)
      if (consistency.status === 'mismatch') {
        timeRangeMismatch = {
          booking,
          actualMinutes: consistency.actualMinutes,
          requestedMinutes: consistency.requestedMinutes,
        }
        break
      }
    }
    const displayBooking = timeRangeMismatch?.booking || matched
    return {
      ...base,
      status: hasAmbiguousBookingMatch ? 'ambiguous' : (timeRangeMismatch ? 'time_mismatch' : 'matched'),
      scheduledDates: [lesson.date],
      ...(matchedBookings.length > 0 ? { bookingId: matched.id } : {}),
      ...(matchedBookings.length > 1 ? { bookingIds: matchedBookings.map((booking) => booking.id) } : {}),
      // Chỉ set khi có giá trị: buổi được ghi vào Firestore, field undefined sẽ làm hỏng lệnh ghi.
      ...(displayBooking.requestedStart ? { bookingStart: displayBooking.requestedStart } : {}),
      ...(displayBooking.requestedEnd ? { bookingEnd: displayBooking.requestedEnd } : {}),
      ...(timeRangeMismatch ? {
        timeRangeActualMinutes: timeRangeMismatch.actualMinutes,
        timeRangeExpectedMinutes: timeRangeMismatch.requestedMinutes,
      } : {}),
      ...(lesson.minutes && matchedBookings.length === 0 && matched.requestedMinutes !== lesson.minutes
        ? { minutesMismatch: matched.requestedMinutes }
        : {}),
    }
  }

  // Do not report a booked lesson as a harmless fixed-schedule case when the
  // same student/tutor/day has an explicit booking for another subject. This
  // is a protected course-transfer/reconciliation decision, not something an
  // ordinary approval may silently charge to whichever package still has time.
  const sameDayDifferentSubject = sameDaySameTutor.filter((booking) => (
    Boolean(lesson.subjectId)
    && Boolean(booking.subjectId)
    && booking.subjectId !== lesson.subjectId
  ))
  if (sameDayDifferentSubject.length > 0) {
    return {
      ...base,
      status: 'subject_mismatch',
      scheduledDates: [lesson.date],
      bookingSubjectNames: Array.from(new Set(
        sameDayDifferentSubject
          .map((booking) => booking.subjectName)
          .filter((name): name is string => Boolean(name)),
      )).slice(0, 3),
    }
  }

  const ownNearby = active
    .filter((b) => matchesLessonStudent(b) && b.teacherId === lesson.teacherId && matchesLessonSubject(b))
    .sort((a, b) => Math.abs(dayDiff(a.requestedDate!, lesson.date)) - Math.abs(dayDiff(b.requestedDate!, lesson.date)))

  if (ownNearby.length > 0) {
    const scheduledDates = Array.from(new Set(ownNearby.map((b) => b.requestedDate!))).slice(0, 3)
    return { ...base, status: 'mismatch_day', scheduledDates }
  }

  const sameDayOther = active.filter((b) => (
    matchesLessonStudent(b)
    && b.requestedDate === lesson.date
    && matchesLessonSubject(b)
  ))
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
  subjectId?: string
  date: string
  minutes?: number
}): Promise<AttendanceAudit> {
  const [bookings, dayLessons] = await Promise.all([
    fetchStudentBookingsAround(input.studentId, input.date),
    fetchTeacherDayLessons(input.teacherId, input.studentId, input.date),
  ])
  const sameDayLessons = dayLessons.filter(countsAsDailyAttendance)
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
  subjectId?: string
  date: string
  minutes?: number
}): Promise<AttendanceAudit> {
  const [bookings, dayLessons] = await Promise.all([
    fetchStudentBookingsAround(lesson.studentId, lesson.date),
    fetchStudentDayLessons(lesson.studentId, lesson.date),
  ])
  const sameDayLessons = dayLessons.filter(countsAsDailyAttendance)
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
    case 'ambiguous':
      return {
        tone: 'danger',
        title: vi ? 'Không xác định được đúng cụm lịch cho buổi này' : 'The exact booking group cannot be identified',
        detail: vi
          ? 'Có nhiều ca cùng ngày nhưng không tạo thành duy nhất một cụm liền nhau đủ số phút. Hãy kiểm tra lịch trước khi duyệt.'
          : 'There are multiple same-day sessions, but no unique consecutive group with the required duration. Check the schedule before approving.',
      }
    case 'time_mismatch': {
      const actualMinutes = check.timeRangeActualMinutes ?? 0
      const expectedMinutes = check.timeRangeExpectedMinutes ?? 0
      return {
        tone: 'danger',
        title: vi ? 'Giờ lịch không khớp thời lượng đã lưu' : 'The scheduled time does not match the stored duration',
        detail: check.bookingStart && check.bookingEnd
          ? (vi
              ? `Ca ${check.bookingStart} - ${check.bookingEnd} chỉ ${actualMinutes} phút, nhưng lịch đang lưu ${expectedMinutes} phút. Hãy sửa lịch trước khi duyệt.`
              : `${check.bookingStart} - ${check.bookingEnd} is ${actualMinutes} minutes, but the booking stores ${expectedMinutes} minutes. Fix the schedule before approving.`)
          : (vi
              ? 'Khoảng giờ của lịch không khớp thời lượng đã lưu. Hãy sửa lịch trước khi duyệt.'
              : 'The scheduled time range does not match the stored duration. Fix the schedule before approving.'),
      }
    }
    case 'subject_mismatch':
      return {
        tone: 'danger',
        title: vi ? 'Môn của lịch đặt không khớp môn buổi điểm danh' : 'The booking subject does not match the attendance subject',
        detail: check.bookingSubjectNames?.length
          ? (vi
              ? `Lịch đang ghi môn: ${check.bookingSubjectNames.join(', ')}. Không tự trừ sang gói môn khác; cần giáo vụ xác nhận chuyển môn/lịch sử trước khi duyệt.`
              : `The booking is recorded for: ${check.bookingSubjectNames.join(', ')}. Do not automatically charge a different course package; academic staff must confirm the historical course transfer first.`)
          : (vi
              ? 'Không tự trừ sang gói môn khác; cần giáo vụ xác nhận chuyển môn/lịch sử trước khi duyệt.'
              : 'Do not automatically charge a different course package; academic staff must confirm the historical course transfer first.'),
      }
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
