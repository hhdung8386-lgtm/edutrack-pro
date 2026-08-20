import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  CalendarCheck2,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Phone,
  RefreshCw,
  Star,
  Video,
} from 'lucide-react'
import type { BookingCancellationRequest, BookingRequest, StudentSubject } from '@/types'
import { TeacherAvatar } from '@/components/shared/TeacherAvatar'
import { DiamondPointsIcon } from '@/components/shared/DiamondPointsIcon'

interface TeacherSummary {
  photoURL?: string
  country?: string
  code?: string
}

export interface TeacherRecommendation {
  id: string
  nickname: string
  photoURL?: string
  country?: string
  countryLabel?: string
  teachingYears?: number
  pointsPer25Minutes: number
  availableSlotCount: number
  availableDayLabels: string[]
  matchedSubjectNames: string[]
}

interface BookingExperienceTabProps {
  subjectPackages: StudentSubject[]
  bookings: BookingRequest[]
  upcomingBookings: BookingRequest[]
  teacherMap: Record<string, TeacherSummary>
  cancellationRequests: BookingCancellationRequest[]
  roomLinkOf: (booking: BookingRequest | null) => string
  onSelectBooking: (booking: BookingRequest) => void
  onOpenTeacherProfile: (teacherId: string) => void
  onCancelBooking: (booking: BookingRequest) => void
  canManageBooking: (booking: BookingRequest) => boolean
  onPickTeacher: () => void
  showRecommendations: boolean
  onCloseRecommendations: () => void
  recommendedTeachers: TeacherRecommendation[]
  recommendationsLoading: boolean
  recommendationsError: boolean
  onRetryRecommendations: () => void
  onOpenHistory: () => void
  /** Còn buổi đã huỷ chưa đặt lại → khoá nút Huỷ ở mọi buổi khác. */
  rebookRequired?: boolean
  lang: string
}

const DAY_NAMES_VI = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function localISO(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseISO(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

function teacherNickname(teacher: TeacherSummary | undefined, fallbackCode: string | undefined, lang: string) {
  const code = (teacher?.code || fallbackCode || '').trim()
  if (code && !/^GV[A-Z0-9]{4,}$/i.test(code)) return code
  return lang === 'vi' ? 'Gia sư' : 'Teacher'
}

function normalizeLink(link?: string) {
  if (!link?.trim()) return ''
  return /^https?:\/\//i.test(link) ? link : `https://${link}`
}

function displayCourseName(subjectName: string | undefined, lang: string) {
  const value = subjectName?.trim() || ''
  if (!value || /chưa\s*xếp|chua\s*xep/i.test(value)) {
    return lang === 'vi' ? 'Lớp học 1 kèm 1' : '1-on-1 class'
  }
  return value
}

function ScheduleCard({
  booking,
  teacher,
  subjectPackage,
  roomLink,
  cancellationPending,
  rebookRequired,
  canCancel,
  onDetail,
  onTeacherProfile,
  onCancel,
  lang,
}: {
  booking: BookingRequest
  teacher?: TeacherSummary
  subjectPackage?: StudentSubject
  roomLink: string
  cancellationPending: boolean
  rebookRequired?: boolean
  canCancel: boolean
  onDetail: () => void
  onTeacherProfile: () => void
  onCancel: () => void
  lang: string
}) {
  const nickname = teacherNickname(teacher, booking.teacherCode, lang)
  const curriculumLink = normalizeLink(booking.curriculumLink || subjectPackage?.curriculumLink)
  const classroomLink = normalizeLink(roomLink)
  const confirmed = booking.status === 'confirmed'
  const courseName = displayCourseName(booking.subjectName, lang)

  return (
    <article className="overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-[0_12px_32px_-24px_rgba(180,120,0,0.45)]">
      <div className="grid grid-cols-[76px_minmax(0,1fr)]">
        <div className="flex flex-col items-center justify-center bg-gradient-to-b from-brand-400 to-brand-500 px-2 py-5 text-brand-900">
          <span className="text-sm font-black tabular-nums">{booking.requestedStart}</span>
          <span className="my-1 h-px w-7 bg-white/40" />
          <span className="text-xs font-bold tabular-nums text-brand-900/70">{booking.requestedEnd}</span>
        </div>

        <div className="min-w-0 p-3.5 sm:p-4">
          <div className="flex items-start gap-3">
            <button type="button" onClick={onTeacherProfile} className="rounded-full focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2" aria-label={lang === 'vi' ? `Xem hồ sơ gia sư ${nickname}` : `View ${nickname} profile`}>
              <TeacherAvatar name={nickname} photoURL={teacher?.photoURL} country={teacher?.country} size={46} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button type="button" onClick={onTeacherProfile} className="block max-w-full truncate text-left text-sm font-black text-slate-950 hover:text-brand-700">
                    {nickname}
                  </button>
                  <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">
                    {courseName}
                  </p>
                  {booking.groupClassId && (
                    <p className="mt-1 text-[10px] font-extrabold uppercase tracking-wide text-cyan-700">
                      {lang === 'vi' ? `Lớp nhóm · ${booking.groupClassCode || ''}` : `Group class · ${booking.groupClassCode || ''}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-lg px-2 py-1 text-[10px] font-black ${confirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {confirmed ? (lang === 'vi' ? 'Sắp diễn ra' : 'Upcoming') : (lang === 'vi' ? 'Chờ xác nhận' : 'Pending')}
                  </span>
                  {canCancel && ['pending', 'confirmed'].includes(booking.status) && (
                    <button
                      type="button"
                      onClick={onCancel}
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition active:scale-[0.98] ${rebookRequired ? 'text-red-500 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'}`}
                      title={rebookRequired
                        ? (lang === 'vi' ? 'Bạn cần đặt lại buổi đã huỷ trước khi huỷ buổi tiếp theo' : 'Rebook your cancelled session before cancelling another')
                        : cancellationPending ? (lang === 'vi' ? 'Chuyển yêu cầu cũ sang hủy tự động' : 'Process the previous request automatically') : undefined}
                    >
                      {lang === 'vi' ? 'Hủy buổi' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500 sm:mt-2.5">
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{booking.requestedMinutes} {lang === 'vi' ? 'phút' : 'minutes'}</span>
            <span className="inline-flex items-center gap-1"><Video className="h-3.5 w-3.5" />{lang === 'vi' ? 'Lớp trực tuyến' : 'Online class'}</span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {confirmed && classroomLink ? (
              <a href={classroomLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-400 to-brand-500 px-3 text-xs font-black text-brand-900 transition hover:brightness-105 active:scale-[0.98]">
                <Video className="h-4 w-4" />{lang === 'vi' ? 'Vào lớp' : 'Join class'}
              </a>
            ) : (
              <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 text-center text-xs font-bold text-slate-400">
                <Video className="h-4 w-4" />{lang === 'vi' ? 'Chưa có link lớp' : 'Class link pending'}
              </span>
            )}
            {curriculumLink ? (
              <a href={curriculumLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand-300 bg-white px-3 text-xs font-black text-brand-700 transition hover:bg-brand-50 active:scale-[0.98]">
                <BookOpen className="h-4 w-4" />{lang === 'vi' ? 'Xem trước giáo trình' : 'Preview curriculum'}
              </a>
            ) : (
              <button type="button" onClick={onDetail} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]">
                <CalendarCheck2 className="h-4 w-4" />{lang === 'vi' ? 'Xem chi tiết' : 'View details'}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export function BookingExperienceTab({
  subjectPackages,
  bookings,
  upcomingBookings,
  teacherMap,
  cancellationRequests,
  roomLinkOf,
  onSelectBooking,
  onOpenTeacherProfile,
  onCancelBooking,
  canManageBooking,
  onPickTeacher,
  showRecommendations,
  onCloseRecommendations,
  recommendedTeachers,
  recommendationsLoading,
  recommendationsError,
  onRetryRecommendations,
  onOpenHistory,
  rebookRequired,
  lang,
}: BookingExperienceTabProps) {
  const todayISO = localISO(new Date())
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(todayISO)
  const [showUpcoming, setShowUpcoming] = useState(false)

  const bookingsByDate = useMemo(() => {
    const grouped: Record<string, BookingRequest[]> = {}
    for (const booking of bookings) {
      if (!booking.requestedDate || booking.lessonId || booking.status === 'released' || booking.status === 'rejected') continue
      if (!grouped[booking.requestedDate]) grouped[booking.requestedDate] = []
      grouped[booking.requestedDate].push(booking)
    }
    Object.values(grouped).forEach((items) => items.sort((a, b) => a.requestedStart.localeCompare(b.requestedStart)))
    return grouped
  }, [bookings])

  // Trạng thái của từng ngày trên lịch, bám đúng dữ liệu hệ thống đang có:
  //  - đã học      : booking đã sinh buổi học (có lessonId)
  //  - đã đặt      : status 'confirmed', chưa học
  //  - chờ xác nhận: status 'pending' (gia sư/trung tâm chưa duyệt)
  //  - đã hủy      : status 'released' hoặc 'rejected'
  const dayStatusByDate = useMemo(() => {
    const map: Record<string, { taught: boolean; booked: boolean; pending: boolean; cancelled: boolean }> = {}
    for (const booking of bookings) {
      const date = booking.requestedDate
      if (!date) continue
      if (!map[date]) map[date] = { taught: false, booked: false, pending: false, cancelled: false }
      if (booking.lessonId) map[date].taught = true
      else if (booking.status === 'confirmed') map[date].booked = true
      else if (booking.status === 'pending') map[date].pending = true
      else if (booking.status === 'released' || booking.status === 'rejected') map[date].cancelled = true
    }
    return map
  }, [bookings])

  const STATUS_LEGEND = [
    { key: 'booked', dot: 'bg-brand-500', label: lang === 'vi' ? 'Đã đặt' : 'Booked' },
    { key: 'pending', dot: 'bg-orange-400', label: lang === 'vi' ? 'Chờ xác nhận' : 'Pending' },
    { key: 'taught', dot: 'bg-emerald-500', label: lang === 'vi' ? 'Đã học' : 'Completed' },
    { key: 'cancelled', dot: 'bg-rose-400', label: lang === 'vi' ? 'Đã hủy' : 'Cancelled' },
  ]

  const weeks = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
    const cursor = new Date(first)
    cursor.setDate(first.getDate() - ((first.getDay() + 6) % 7))
    const rows: { date: Date; iso: string; inMonth: boolean }[][] = []
    for (let week = 0; week < 6; week++) {
      const row: { date: Date; iso: string; inMonth: boolean }[] = []
      for (let day = 0; day < 7; day++) {
        row.push({ date: new Date(cursor), iso: localISO(cursor), inMonth: cursor.getMonth() === calendarMonth.getMonth() })
        cursor.setDate(cursor.getDate() + 1)
      }
      rows.push(row)
      if (cursor.getMonth() !== calendarMonth.getMonth() && cursor.getDate() > 7) break
    }
    return rows
  }, [calendarMonth])

  const selectedBookings = bookingsByDate[selectedDate] || []
  const selectedDateObject = parseISO(selectedDate)
  const dayNames = lang === 'vi' ? DAY_NAMES_VI : DAY_NAMES_EN
  const weekHeader = lang === 'vi' ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const pendingCancellationIds = useMemo(
    () => new Set(cancellationRequests.filter((item) => item.status === 'pending').map((item) => item.bookingId)),
    [cancellationRequests],
  )
  const upcomingOutsideSelection = upcomingBookings.filter((booking) => booking.requestedDate !== selectedDate).slice(0, showUpcoming ? 6 : 2)

  const renderScheduleCard = (booking: BookingRequest) => (
    <ScheduleCard
      key={booking.id}
      booking={booking}
      teacher={teacherMap[booking.teacherId]}
      subjectPackage={subjectPackages.find((item) => item.subjectId === booking.subjectId)}
      roomLink={roomLinkOf(booking)}
      cancellationPending={pendingCancellationIds.has(booking.id)}
      rebookRequired={rebookRequired}
      canCancel={canManageBooking(booking)}
      onDetail={() => onSelectBooking(booking)}
      onTeacherProfile={() => onOpenTeacherProfile(booking.teacherId)}
      onCancel={() => onCancelBooking(booking)}
      lang={lang}
    />
  )

  const rebookBanner = rebookRequired ? (
    <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-900 shadow-[0_10px_30px_-18px_rgba(220,38,38,0.6)]">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
        <RefreshCw className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-red-700">{lang === 'vi' ? 'Bạn còn 1 buổi cần đặt lại' : 'You have 1 session to rebook'}</p>
        <p className="mt-0.5 text-xs font-semibold leading-5 text-red-800/90">
          {lang === 'vi'
            ? 'Kim cương đang được giữ. Hãy chọn khung giờ để đặt lại — sau khi đặt xong bạn mới có thể huỷ buổi khác.'
            : 'Your diamonds are held. Pick a slot to rebook — you can cancel other sessions again once you do.'}
        </p>
        <button
          type="button"
          onClick={onPickTeacher}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-red-500 px-3.5 text-xs font-black text-white shadow-sm shadow-red-200 transition hover:bg-red-600 active:scale-[0.98]"
        >
          {lang === 'vi' ? 'Đặt lại ngay' : 'Rebook now'}
        </button>
      </div>
    </div>
  ) : null

  if (showRecommendations) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 px-1">
          <button
            type="button"
            onClick={onCloseRecommendations}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 active:scale-[0.97]"
            aria-label={lang === 'vi' ? 'Quay lại tiến độ học tập' : 'Back to learning progress'}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-black tracking-tight text-slate-950">
              {lang === 'vi' ? 'Đề xuất gia sư phù hợp với bạn' : 'Recommended teachers for you'}
            </h2>
          </div>
        </div>

        {recommendationsLoading && recommendedTeachers.length === 0 ? (
          <div className="space-y-3" aria-label={lang === 'vi' ? 'Đang tìm gia sư phù hợp' : 'Finding suitable teachers'}>
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex gap-3">
                  <div className="h-16 w-16 animate-pulse rounded-2xl bg-slate-100" />
                  <div className="flex-1 space-y-2 py-1"><div className="h-4 w-28 animate-pulse rounded bg-slate-100" /><div className="h-3 w-40 animate-pulse rounded bg-slate-100" /><div className="h-3 w-32 animate-pulse rounded bg-slate-100" /></div>
                </div>
                <div className="mt-4 h-11 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ))}
          </div>
        ) : recommendationsError && recommendedTeachers.length === 0 ? (
          <div className="rounded-2xl border border-rose-100 bg-white px-5 py-7 text-center">
            <p className="text-sm font-black text-slate-900">{lang === 'vi' ? 'Chưa tải được danh sách gợi ý' : 'Suggestions could not be loaded'}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">{lang === 'vi' ? 'Dữ liệu đặt lịch của bạn vẫn an toàn. Vui lòng thử tải lại.' : 'Your booking data is safe. Please try again.'}</p>
            <button type="button" onClick={onRetryRecommendations} className="mt-4 min-h-10 rounded-xl bg-gradient-to-b from-brand-400 to-brand-500 px-4 text-xs font-black text-brand-900 transition hover:brightness-105 active:scale-[0.98]">{lang === 'vi' ? 'Thử lại' : 'Try again'}</button>
          </div>
        ) : recommendedTeachers.length > 0 ? (
          <div className="space-y-3">
            {recommendedTeachers.slice(0, 6).map((teacher) => (
              <article key={teacher.id} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.5)] sm:p-4">
                <div className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[64px_minmax(0,1fr)_auto]">
                  <button
                    type="button"
                    onClick={() => onOpenTeacherProfile(teacher.id)}
                    className="rounded-full focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                    aria-label={lang === 'vi' ? `Xem hồ sơ và lịch rảnh của ${teacher.nickname}` : `View ${teacher.nickname}'s profile and availability`}
                  >
                    <TeacherAvatar name={teacher.nickname} photoURL={teacher.photoURL} country={teacher.country} size={64} />
                  </button>

                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenTeacherProfile(teacher.id)}
                      className="block max-w-full truncate text-left text-base font-black text-slate-950 transition hover:text-brand-700"
                    >
                      {teacher.nickname}
                    </button>
                    <div className="mt-1 flex items-center gap-1.5" aria-label={lang === 'vi' ? 'Đánh giá 5 trên 5 sao' : 'Rated 5 out of 5 stars'}>
                      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
                        {Array.from({ length: 5 }).map((_, starIndex) => <Star key={starIndex} className="h-3.5 w-3.5 fill-amber-400 text-amber-400 sm:h-4 sm:w-4" />)}
                      </span>
                      <span className="text-xs font-black tabular-nums text-slate-700">5.0</span>
                    </div>
                    {typeof teacher.teachingYears === 'number' && (
                      <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                        {teacher.teachingYears} {lang === 'vi' ? 'năm kinh nghiệm' : 'years experience'}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="inline-flex items-center gap-1 text-sky-700" aria-label={`${teacher.pointsPer25Minutes} ${lang === 'vi' ? 'kim cương' : 'diamonds'}`}>
                      <DiamondPointsIcon className="h-5 w-5" />
                      <strong className="text-xl font-black leading-none tabular-nums">{teacher.pointsPer25Minutes}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenTeacherProfile(teacher.id)}
                      className="inline-flex min-h-10 min-w-[84px] items-center justify-center rounded-xl bg-gradient-to-b from-brand-400 to-brand-500 px-3 text-xs font-black text-brand-900 shadow-sm shadow-brand-200 transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 active:scale-[0.97] sm:min-w-[96px] sm:text-sm"
                    >
                      {lang === 'vi' ? 'Đặt lịch' : 'Book'}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenTeacherProfile(teacher.id)}
                  className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-3 text-left transition hover:border-amber-200 hover:bg-amber-100/70 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 active:scale-[0.995]"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-amber-800">
                      {teacher.availableSlotCount > 0 ? (lang === 'vi' ? 'Rảnh trong 7 ngày tới' : 'Available in the next 7 days') : (lang === 'vi' ? 'Đang cập nhật lịch rảnh' : 'Availability is being updated')}
                    </span>
                    <span className="mt-1 block truncate text-[11px] font-semibold text-amber-700">
                      {teacher.availableSlotCount > 0
                        ? <>{teacher.availableSlotCount} {lang === 'vi' ? 'khung giờ' : 'time slots'}{teacher.availableDayLabels.length ? ` · ${teacher.availableDayLabels.join(', ')}` : ''}</>
                        : (lang === 'vi' ? 'Mở hồ sơ để kiểm tra lịch mới nhất' : 'Open the profile for the latest schedule')}
                    </span>
                  </span>
                  <CalendarCheck2 className="h-5 w-5 shrink-0 text-amber-600" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-brand-300 bg-white px-5 py-7 text-center">
            <CalendarCheck2 className="mx-auto h-8 w-8 text-brand-300" />
            <p className="mt-3 text-sm font-black text-slate-900">{lang === 'vi' ? 'Chưa có gia sư phù hợp đang mở lịch' : 'No suitable teacher is currently available'}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">{lang === 'vi' ? 'Học vụ sẽ kiểm tra môn học và khung giờ để hỗ trợ bạn.' : 'The academic team can check your subject and preferred time.'}</p>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-900">{lang === 'vi' ? 'Chưa tìm được lịch phù hợp?' : 'Need a different time?'}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{lang === 'vi' ? 'Liên hệ trung tâm để học vụ tư vấn và xếp lịch phù hợp.' : 'Contact the center for scheduling support.'}</p>
            </div>
            <a href="tel:0906966691" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-400 to-brand-500 px-4 text-xs font-black text-brand-900 transition hover:brightness-105 active:scale-[0.98]"><Phone className="h-4 w-4" />{lang === 'vi' ? 'Liên hệ học vụ' : 'Contact support'}</a>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {rebookBanner}
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-slate-950">{lang === 'vi' ? 'Lịch học của bạn' : 'Your schedule'}</h2>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Chọn ngày để xem lịch học.' : 'Select a date to view classes.'}</p>
        </div>
        <button type="button" onClick={onPickTeacher} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-400 to-brand-500 px-3.5 text-xs font-extrabold text-brand-900 transition hover:brightness-105 active:scale-[0.98]">
          <CalendarPlus className="h-4 w-4" />{lang === 'vi' ? 'Đặt lịch mới' : 'Book a class'}
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_16px_38px_-32px_rgba(2,132,199,0.5)] sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-brand-50 hover:text-brand-700 active:scale-[0.96]" aria-label={lang === 'vi' ? 'Tháng trước' : 'Previous month'}><ChevronLeft className="h-5 w-5" /></button>
          <p className="text-base font-extrabold text-slate-900">{lang === 'vi' ? 'Tháng' : 'Month'} {calendarMonth.getMonth() + 1}/{calendarMonth.getFullYear()}</p>
          <button type="button" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-brand-50 hover:text-brand-700 active:scale-[0.96]" aria-label={lang === 'vi' ? 'Tháng sau' : 'Next month'}><ChevronRight className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-7">
          {weekHeader.map((label, index) => <div key={label} className={`py-2 text-center text-[11px] font-extrabold ${index === 6 ? 'text-rose-500' : index === 5 ? 'text-brand-600' : 'text-slate-400'}`}>{label}</div>)}
        </div>
        <div className="space-y-1">
          {weeks.map((row, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-7 gap-1">
              {row.map((cell) => {
                const dayBookings = bookingsByDate[cell.iso] || []
                const status = dayStatusByDate[cell.iso]
                const active = selectedDate === cell.iso
                const today = todayISO === cell.iso
                const weekend = cell.date.getDay()
                // Mỗi trạng thái xuất hiện trong ngày là một chấm màu riêng
                const dots = [
                  status?.taught && 'bg-emerald-500',
                  status?.booked && 'bg-brand-500',
                  status?.pending && 'bg-orange-400',
                  status?.cancelled && 'bg-rose-400',
                ].filter(Boolean) as string[]
                const statusText = [
                  status?.taught && (lang === 'vi' ? 'đã học' : 'completed'),
                  status?.booked && (lang === 'vi' ? 'đã đặt' : 'booked'),
                  status?.pending && (lang === 'vi' ? 'chờ xác nhận' : 'pending'),
                  status?.cancelled && (lang === 'vi' ? 'đã hủy' : 'cancelled'),
                ].filter(Boolean).join(', ')
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setSelectedDate(cell.iso)}
                    className={`relative flex min-h-12 flex-col items-center justify-center rounded-2xl text-xs font-bold transition active:scale-[0.96] ${
                      active
                        ? 'bg-gradient-to-b from-brand-400 to-brand-500 text-brand-900 shadow-md shadow-brand-200'
                        : today
                          ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-300'
                          : 'hover:bg-slate-50'
                    } ${!cell.inMonth && !active ? 'text-slate-300' : weekend === 0 && !active ? 'text-rose-500' : weekend === 6 && !active ? 'text-brand-700' : !active ? 'text-slate-700' : ''}`}
                    aria-label={`${cell.iso}${statusText ? `, ${statusText}` : ''}${dayBookings.length ? `, ${dayBookings.length} ${lang === 'vi' ? 'buổi' : 'classes'}` : ''}`}
                  >
                    {cell.date.getDate()}
                    {dots.length > 0 && (
                      <span className="mt-1 flex items-center gap-0.5">
                        {dots.slice(0, 3).map((dot, dotIndex) => (
                          <span key={dotIndex} className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-brand-900/70' : dot}`} />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        {/* Chú thích màu trạng thái */}
        <div className="mt-4 border-t border-slate-100 pt-3.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {STATUS_LEGEND.map((item) => (
              <span key={item.key} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                {item.label}
              </span>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={() => setShowUpcoming((value) => !value)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-extrabold text-brand-700 hover:bg-brand-50 active:scale-[0.98]">
              {lang === 'vi' ? 'Xem lịch sắp tới' : 'Upcoming classes'}<ChevronRight className={`h-4 w-4 transition-transform ${showUpcoming ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 px-1">
          <h3 className="text-base font-extrabold text-slate-950">
            {selectedDate === todayISO
              ? (lang === 'vi' ? `Lịch hôm nay (${selectedBookings.length} buổi)` : `Today (${selectedBookings.length} classes)`)
              : `${dayNames[selectedDateObject.getDay()]}, ${selectedDate.split('-').reverse().join('/')}`}
          </h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Chọn một buổi để xem đầy đủ thông tin.' : 'Choose a class to view full details.'}</p>
        </div>
        <div className="space-y-3">
          {selectedBookings.length > 0 ? selectedBookings.map(renderScheduleCard) : (
            <div className="rounded-2xl border border-dashed border-brand-300 bg-white px-5 py-8 text-center">
              <CalendarCheck2 className="mx-auto h-9 w-9 text-brand-300" />
              <p className="mt-3 text-sm font-extrabold text-slate-800">{lang === 'vi' ? 'Ngày này chưa có lịch học' : 'No classes on this date'}</p>
              <p className="mx-auto mt-1 max-w-xs text-xs font-medium leading-5 text-slate-500">{lang === 'vi' ? 'Bạn có thể chọn gia sư và khung giờ phù hợp ngay bây giờ.' : 'Choose a teacher and a suitable time now.'}</p>
              <button type="button" onClick={onPickTeacher} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-400 to-brand-500 px-4 text-xs font-extrabold text-brand-900 hover:brightness-105 active:scale-[0.98]"><CalendarPlus className="h-4 w-4" />{lang === 'vi' ? 'Đặt lịch ngay' : 'Book now'}</button>
            </div>
          )}
        </div>
      </section>

      {showUpcoming && upcomingOutsideSelection.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2 px-1"><History className="h-4 w-4 text-brand-600" /><h3 className="text-sm font-extrabold text-slate-900">{lang === 'vi' ? 'Lịch sắp tới' : 'Upcoming classes'}</h3></div>
          <div className="space-y-3">{upcomingOutsideSelection.map(renderScheduleCard)}</div>
        </section>
      )}

      <section className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-xs leading-5 text-slate-700">
        <p className="font-extrabold text-brand-800">{lang === 'vi' ? 'Lưu ý khi học' : 'Class notes'}</p>
        <p className="mt-1">{lang === 'vi' ? 'Thời gian theo giờ Việt Nam (GMT+7). Vui lòng vào lớp trước 5 phút. Chỉ được hủy trước giờ học ít nhất 1 giờ.' : 'Times follow Vietnam time (GMT+7). Join 5 minutes early. Classes can only be cancelled at least one hour before they start.'}</p>
      </section>

      <button type="button" onClick={onOpenHistory} className="group flex w-full items-center gap-4 rounded-2xl border border-brand-200 bg-white p-4 text-left transition hover:border-brand-300 hover:bg-brand-50 active:scale-[0.99]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Star className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-slate-900">{lang === 'vi' ? 'Xem nhận xét buổi học' : 'View lesson feedback'}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{lang === 'vi' ? 'Theo dõi số sao và nhận xét gia sư đã gửi sau mỗi buổi.' : 'Review the stars and feedback teachers sent after each class.'}</span></span>
        <ChevronRight className="h-5 w-5 shrink-0 text-brand-600 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  )
}
