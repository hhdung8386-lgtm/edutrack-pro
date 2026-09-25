import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import {
  AlarmClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, Hourglass,
  Info, LogIn, Search, UserRound, UsersRound, X, XCircle,
} from 'lucide-react'
import { db } from '@/lib/firebase'
import type { BookingRequest } from '@/types'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSpinner'
import { getVietnamClock } from '@/lib/bookingLiveStatus'
import {
  addToTeacherCheckinSummary,
  emptyTeacherCheckinSummary,
  formatVietnamTime,
  getTeacherCheckin,
  summarizeTeacherCheckins,
  teacherCheckinLabel,
  teacherCheckinTone,
  type TeacherCheckinInfo,
  type TeacherCheckinStatus,
  type TeacherCheckinSummary,
  type TeacherCheckinTone,
} from '@/lib/teacherCheckin'

type RangeDays = 1 | 7
type StatusFilter = 'all' | 'late' | 'missing' | 'on_time' | 'waiting'
type ViewMode = 'sessions' | 'teachers'

interface CheckinRow {
  booking: BookingRequest
  info: TeacherCheckinInfo
}

interface TeacherRow {
  teacherId: string
  teacherName: string
  teacherCode: string
  summary: TeacherCheckinSummary
}

const TONE_CLASS: Record<TeacherCheckinTone, string> = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  bad: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  muted: 'bg-slate-100 text-slate-500 ring-slate-200',
}

const STATUS_FILTERS: { key: StatusFilter; label: string; statuses: TeacherCheckinStatus[] }[] = [
  { key: 'all', label: 'Tất cả', statuses: [] },
  { key: 'late', label: 'Vào trễ', statuses: ['late'] },
  { key: 'missing', label: 'Chưa bấm Vào lớp', statuses: ['missing', 'missing_live'] },
  { key: 'on_time', label: 'Đúng giờ', statuses: ['on_time', 'early'] },
  { key: 'waiting', label: 'Chưa tới giờ', statuses: ['waiting'] },
]

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function dayLabel(date?: string) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Chưa có ngày'
  const [year, month, day] = date.split('-').map(Number)
  const weekday = WEEKDAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${weekday}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
}

function fullDate(date: string) {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

function csvCell(value: string | number) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function StatusChip({ info }: { info: TeacherCheckinInfo }) {
  const tone = teacherCheckinTone(info)
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${TONE_CLASS[tone]}`}>
      {info.status === 'missing_live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />}
      {teacherCheckinLabel(info)}
    </span>
  )
}

function StatTile({
  label, value, hint, icon, tone, active, onClick,
}: {
  label: string
  value: string | number
  hint?: string
  icon: ReactNode
  tone: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky'
  active?: boolean
  onClick?: () => void
}) {
  const toneClass = {
    slate: 'text-slate-700 bg-slate-100',
    emerald: 'text-emerald-700 bg-emerald-100',
    amber: 'text-amber-700 bg-amber-100',
    rose: 'text-rose-700 bg-rose-100',
    sky: 'text-sky-700 bg-sky-100',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[96px] flex-col justify-between rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        active ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${toneClass}`}>{icon}</span>
      </span>
      <span>
        <span className="block text-2xl font-bold tabular-nums text-slate-900">{value}</span>
        {hint && <span className="mt-0.5 block text-[11px] font-medium text-slate-400">{hint}</span>}
      </span>
    </button>
  )
}

export function TeacherCheckinsPage() {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const todayISO = getVietnamClock(nowMs).date
  const [anchorDate, setAnchorDate] = useState(todayISO)
  const [rangeDays, setRangeDays] = useState<RangeDays>(1)
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [view, setView] = useState<ViewMode>('sessions')
  const [teacherFocus, setTeacherFocus] = useState<{ id: string; name: string } | null>(null)

  // Đồng hồ để trạng thái "Chưa tới giờ" → "Chưa vào lớp" tự đổi.
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const fromDate = rangeDays === 1 ? anchorDate : shiftDate(anchorDate, -6)
  const toDate = anchorDate

  // Một điều kiện khoảng trên một trường (requestedDate) → dùng index sẵn có, không cần index mới.
  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    const q = query(
      collection(db, 'bookingRequests'),
      where('requestedDate', '>=', fromDate),
      where('requestedDate', '<=', toDate),
    )
    return onSnapshot(q, (snapshot) => {
      setBookings(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as BookingRequest))
        // Chỉ ca thật sự phải dạy: đã xếp hoặc đã điểm danh.
        .filter((item) => item.status === 'confirmed' || item.status === 'completed'))
      setLoading(false)
    }, (error) => {
      console.error('Error loading teacher check-ins:', error)
      setLoadError(true)
      setLoading(false)
    })
  }, [fromDate, toDate])

  const rows = useMemo<CheckinRow[]>(() => bookings
    .map((booking) => ({ booking, info: getTeacherCheckin(booking, nowMs) }))
    .sort((left, right) => (
      (left.info.startMs ?? Number.MAX_SAFE_INTEGER) - (right.info.startMs ?? Number.MAX_SAFE_INTEGER)
      || (left.booking.teacherName || '').localeCompare(right.booking.teacherName || '', 'vi')
    )), [bookings, nowMs])

  const searchedRows = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return rows.filter(({ booking }) => {
      if (teacherFocus && booking.teacherId !== teacherFocus.id) return false
      if (!keyword) return true
      return [booking.teacherName, booking.teacherCode, booking.studentName, booking.studentCode, booking.subjectName]
        .some((value) => (value || '').toLowerCase().includes(keyword))
    })
  }, [rows, search, teacherFocus])

  const summary = useMemo(() => summarizeTeacherCheckins(searchedRows.map((row) => row.info)), [searchedRows])

  const visibleRows = useMemo(() => {
    const active = STATUS_FILTERS.find((item) => item.key === statusFilter)
    if (!active || active.statuses.length === 0) return searchedRows
    return searchedRows.filter((row) => active.statuses.includes(row.info.status))
  }, [searchedRows, statusFilter])

  const teacherRows = useMemo<TeacherRow[]>(() => {
    const byTeacher = new Map<string, TeacherRow>()
    searchedRows.forEach(({ booking, info }) => {
      const key = booking.teacherId || booking.teacherCode || booking.teacherName || '—'
      const current = byTeacher.get(key) || {
        teacherId: booking.teacherId,
        teacherName: booking.teacherName || 'Chưa rõ gia sư',
        teacherCode: booking.teacherCode || '',
        summary: emptyTeacherCheckinSummary(),
      }
      current.summary = addToTeacherCheckinSummary(current.summary, info)
      byTeacher.set(key, current)
    })
    return [...byTeacher.values()].sort((left, right) => (
      (right.summary.late + right.summary.missing) - (left.summary.late + left.summary.missing)
      || right.summary.lateMinutesTotal - left.summary.lateMinutesTotal
      || left.teacherName.localeCompare(right.teacherName, 'vi')
    ))
  }, [searchedRows])

  const averageLate = summary.late > 0 ? Math.round(summary.lateMinutesTotal / summary.late) : 0
  const rangeLabel = rangeDays === 1 ? fullDate(toDate) : `${fullDate(fromDate)} – ${fullDate(toDate)}`

  const exportCsv = () => {
    const header = ['Ngày', 'Giờ học', 'Gia sư', 'Mã gia sư', 'Học viên', 'Mã học viên', 'Môn', 'Giờ bấm Vào lớp', 'Trạng thái', 'Phút trễ', 'Số lần bấm', 'Điểm danh']
    const lines = visibleRows.map(({ booking, info }) => [
      booking.requestedDate || '',
      `${booking.requestedStart}-${booking.requestedEnd}`,
      booking.teacherName || '',
      booking.teacherCode || '',
      booking.studentName || '',
      booking.studentCode || '',
      booking.subjectName || '',
      info.firstAtMs !== null ? formatVietnamTime(info.firstAtMs) : '',
      teacherCheckinLabel(info),
      info.lateMinutes !== null ? Math.max(0, info.lateMinutes) : '',
      info.clickCount || '',
      booking.status === 'completed' ? 'Đã điểm danh' : 'Chưa điểm danh',
    ].map(csvCell).join(','))
    const blob = new Blob([`﻿${[header.join(','), ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `gio-vao-lop-gia-su_${fromDate}${rangeDays === 7 ? `_${toDate}` : ''}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const shiftAnchor = (days: number) => setAnchorDate((current) => shiftDate(current, days * rangeDays))

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Giáo vụ · Chấm công</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Giờ vào lớp của gia sư</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Ghi lại lúc gia sư bấm nút <span className="font-semibold text-slate-700">Vào lớp</span> trên Lịch dạy và so với giờ
            bắt đầu ca để biết đúng giờ hay trễ.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={loading || visibleRows.length === 0}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Xuất Excel (CSV)
        </button>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {([1, 7] as RangeDays[]).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setRangeDays(days)}
                  className={`h-9 rounded-lg px-3 text-sm font-bold transition ${rangeDays === days ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {days === 1 ? 'Theo ngày' : '7 ngày'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftAnchor(-1)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                aria-label="Kỳ trước"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <label className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={anchorDate}
                  onChange={(event) => event.target.value && setAnchorDate(event.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  aria-label={rangeDays === 1 ? 'Chọn ngày' : 'Ngày cuối của 7 ngày'}
                />
              </label>
              <button
                type="button"
                onClick={() => shiftAnchor(1)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                aria-label="Kỳ sau"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {anchorDate !== todayISO && (
                <button
                  type="button"
                  onClick={() => setAnchorDate(todayISO)}
                  className="h-11 rounded-xl px-3 text-sm font-bold text-indigo-600 transition hover:bg-indigo-50"
                >
                  Hôm nay
                </button>
              )}
            </div>
          </div>
          <label className="relative block xl:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm gia sư, học viên, môn..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            />
          </label>
        </div>
        <p className="text-xs font-semibold text-slate-400">
          Đang xem: <span className="text-slate-700">{rangeLabel}</span>
          {anchorDate === todayISO && rangeDays === 1 && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Cập nhật trực tiếp</span>}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Ca phải dạy"
          value={summary.total}
          hint={summary.noData > 0 ? `${summary.noData} ca chưa có dữ liệu` : 'Đã xếp + đã điểm danh'}
          icon={<CalendarDays className="h-4 w-4" />}
          tone="slate"
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        <StatTile
          label="Đúng giờ"
          value={summary.onTime}
          hint={summary.onTimeRate !== null ? `${summary.onTimeRate}% ca đã tới giờ` : 'Chưa có ca tới giờ'}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
          active={statusFilter === 'on_time'}
          onClick={() => setStatusFilter('on_time')}
        />
        <StatTile
          label="Vào trễ"
          value={summary.late}
          hint={summary.late > 0 ? `TB ${averageLate} phút · lâu nhất ${summary.maxLateMinutes} phút` : 'Không có ca trễ'}
          icon={<AlarmClock className="h-4 w-4" />}
          tone="amber"
          active={statusFilter === 'late'}
          onClick={() => setStatusFilter('late')}
        />
        <StatTile
          label="Chưa bấm Vào lớp"
          value={summary.missing}
          hint="Ca đã bắt đầu mà chưa bấm"
          icon={<XCircle className="h-4 w-4" />}
          tone="rose"
          active={statusFilter === 'missing'}
          onClick={() => setStatusFilter('missing')}
        />
        <StatTile
          label="Chưa tới giờ"
          value={summary.waiting}
          hint="Ca sắp diễn ra"
          icon={<Hourglass className="h-4 w-4" />}
          tone="sky"
          active={statusFilter === 'waiting'}
          onClick={() => setStatusFilter('waiting')}
        />
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-xs leading-5 text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
        <p>
          <span className="font-bold">Cách tính:</span> giờ vào lớp là lần đầu gia sư bấm <span className="font-semibold">Vào lớp</span> (tính từ 60 phút
          trước giờ học đến hết ca), lấy theo <span className="font-semibold">giờ máy chủ</span> nên gia sư không chỉnh được. Trễ dưới 1 phút tính là đúng giờ.
          Hệ thống ghi giờ bấm nút, không đo được gia sư ở trong Google Meet bao lâu. Gia sư mở phòng bằng link lưu sẵn (không bấm nút) sẽ hiện
          <span className="font-semibold"> Chưa bấm Vào lớp</span>.
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1 md:inline-grid md:w-fit">
          <button
            type="button"
            onClick={() => setView('sessions')}
            className={`inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-bold transition ${view === 'sessions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Clock3 className="h-4 w-4" />
            Theo ca học
          </button>
          <button
            type="button"
            onClick={() => setView('teachers')}
            className={`inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-bold transition ${view === 'teachers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <UsersRound className="h-4 w-4" />
            Theo gia sư
          </button>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {teacherFocus && (
            <button
              type="button"
              onClick={() => setTeacherFocus(null)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-slate-900 px-3 text-xs font-bold text-white transition hover:bg-slate-700"
              title="Bỏ lọc gia sư"
            >
              <UserRound className="h-3.5 w-3.5" />
              {teacherFocus.name}
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {view === 'sessions' && (
            <div className="flex max-w-full gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStatusFilter(item.key)}
                  className={`h-9 shrink-0 rounded-full px-3 text-xs font-bold transition ${
                    statusFilter === item.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loadError && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          Chưa tải được dữ liệu ca học. Không có nghĩa là gia sư không vào lớp — vui lòng tải lại trang.
        </div>
      )}

      {loading ? (
        <Card padding="none"><TableSkeleton /></Card>
      ) : view === 'sessions' ? (
        visibleRows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<LogIn className="h-8 w-8" />}
              title={rows.length === 0 ? 'Không có ca học nào trong khoảng này' : 'Không có ca phù hợp bộ lọc'}
              description={rows.length === 0 ? 'Chọn ngày khác hoặc chuyển sang xem 7 ngày.' : 'Thử bỏ bớt bộ lọc trạng thái hoặc từ khoá tìm kiếm.'}
            />
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="hidden grid-cols-[150px_minmax(0,1.1fr)_minmax(0,1.3fr)_130px_170px] gap-4 border-b border-slate-200 bg-slate-50/70 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
              <span>Ca học</span>
              <span>Gia sư</span>
              <span>Học viên</span>
              <span>Bấm Vào lớp</span>
              <span>Kết quả</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {visibleRows.map(({ booking, info }) => {
                const isLive = info.startMs !== null && info.endMs !== null && nowMs >= info.startMs && nowMs <= info.endMs
                return (
                  <li
                    key={booking.id}
                    className="grid gap-3 px-4 py-4 transition hover:bg-slate-50/60 lg:grid-cols-[150px_minmax(0,1.1fr)_minmax(0,1.3fr)_130px_170px] lg:items-center lg:gap-4 lg:px-5"
                  >
                    <div className="flex items-center justify-between gap-3 lg:block">
                      <div>
                        <p className="font-mono text-sm font-bold text-slate-900">
                          {booking.requestedStart} – {booking.requestedEnd}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
                          {dayLabel(booking.requestedDate)} · {booking.requestedMinutes} phút
                        </p>
                      </div>
                      <div className="lg:hidden"><StatusChip info={info} /></div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{booking.teacherName || 'Chưa rõ gia sư'}</p>
                      <p className="truncate font-mono text-xs font-semibold text-sky-700">{booking.teacherCode}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {booking.groupClassName || booking.studentName}
                        <span className="ml-1.5 font-mono text-xs font-semibold text-indigo-500">{booking.groupClassCode || booking.studentCode}</span>
                      </p>
                      <p className="truncate text-xs text-slate-500">{booking.subjectName || 'Chưa có môn học'}</p>
                    </div>
                    <div className="flex items-baseline gap-2 rounded-xl bg-slate-50 px-3 py-2 lg:block lg:bg-transparent lg:p-0">
                      <span className="text-xs font-semibold text-slate-500 lg:hidden">Bấm Vào lớp:</span>
                      {info.firstAtMs !== null ? (
                        <>
                          <p className="font-mono text-base font-bold tabular-nums text-slate-900">{formatVietnamTime(info.firstAtMs)}</p>
                          {info.clickCount > 1 && <p className="text-[11px] font-medium text-slate-400">bấm {info.clickCount} lần</p>}
                        </>
                      ) : (
                        <p className="font-mono text-base font-bold text-slate-300">—</p>
                      )}
                    </div>
                    <div className="hidden flex-col items-start gap-1.5 lg:flex">
                      <StatusChip info={info} />
                      {booking.status === 'completed' && (
                        <span className="text-[11px] font-semibold text-slate-400">Đã điểm danh</span>
                      )}
                    </div>
                    {booking.status === 'completed' && (
                      <span className="text-[11px] font-semibold text-slate-400 lg:hidden">Đã điểm danh</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      ) : teacherRows.length === 0 ? (
        <Card>
          <EmptyState icon={<UsersRound className="h-8 w-8" />} title="Chưa có gia sư nào có ca trong khoảng này" />
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,0.7fr))_minmax(0,1.2fr)] gap-4 border-b border-slate-200 bg-slate-50/70 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>Gia sư</span>
            <span className="text-right">Số ca</span>
            <span className="text-right">Đúng giờ</span>
            <span className="text-right">Trễ</span>
            <span className="text-right">Chưa bấm</span>
            <span className="text-right">Trễ TB</span>
            <span>Tỉ lệ đúng giờ</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {teacherRows.map((row) => {
              const rate = row.summary.onTimeRate
              const avg = row.summary.late > 0 ? Math.round(row.summary.lateMinutesTotal / row.summary.late) : 0
              return (
                <li key={row.teacherId || row.teacherCode || row.teacherName}>
                  <button
                    type="button"
                    onClick={() => {
                      setTeacherFocus({ id: row.teacherId, name: row.teacherName })
                      setStatusFilter('all')
                      setView('sessions')
                    }}
                    className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-slate-50/70 lg:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,0.7fr))_minmax(0,1.2fr)] lg:items-center lg:gap-4 lg:px-5"
                    title="Xem từng ca của gia sư này"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-900">{row.teacherName}</span>
                      <span className="block truncate font-mono text-xs font-semibold text-sky-700">{row.teacherCode}</span>
                    </span>
                    <span className="grid grid-cols-5 gap-2 text-center text-xs lg:contents">
                      <span className="rounded-lg bg-slate-50 py-1.5 lg:bg-transparent lg:py-0 lg:text-right">
                        <span className="block text-[10px] font-semibold text-slate-400 lg:hidden">Số ca</span>
                        <span className="text-sm font-bold tabular-nums text-slate-800">{row.summary.total}</span>
                      </span>
                      <span className="rounded-lg bg-emerald-50 py-1.5 lg:bg-transparent lg:py-0 lg:text-right">
                        <span className="block text-[10px] font-semibold text-emerald-600 lg:hidden">Đúng giờ</span>
                        <span className="text-sm font-bold tabular-nums text-emerald-700">{row.summary.onTime}</span>
                      </span>
                      <span className="rounded-lg bg-amber-50 py-1.5 lg:bg-transparent lg:py-0 lg:text-right">
                        <span className="block text-[10px] font-semibold text-amber-600 lg:hidden">Trễ</span>
                        <span className="text-sm font-bold tabular-nums text-amber-700">{row.summary.late}</span>
                      </span>
                      <span className="rounded-lg bg-rose-50 py-1.5 lg:bg-transparent lg:py-0 lg:text-right">
                        <span className="block text-[10px] font-semibold text-rose-600 lg:hidden">Chưa bấm</span>
                        <span className="text-sm font-bold tabular-nums text-rose-700">{row.summary.missing}</span>
                      </span>
                      <span className="rounded-lg bg-slate-50 py-1.5 lg:bg-transparent lg:py-0 lg:text-right">
                        <span className="block text-[10px] font-semibold text-slate-400 lg:hidden">Trễ TB</span>
                        <span className="text-sm font-bold tabular-nums text-slate-700">{row.summary.late > 0 ? `${avg}'` : '—'}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className={`block h-full rounded-full ${rate === null ? 'bg-slate-200' : rate >= 90 ? 'bg-emerald-500' : rate >= 70 ? 'bg-amber-400' : 'bg-rose-500'}`}
                          style={{ width: `${rate ?? 0}%` }}
                        />
                      </span>
                      <span className="w-12 text-right text-sm font-bold tabular-nums text-slate-800">{rate === null ? '—' : `${rate}%`}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <p className="text-center text-xs text-slate-400">
        Cần xem lịch chi tiết của gia sư? Mở <Link to="/admin/booking-schedules" className="font-semibold text-indigo-600 hover:underline">Lịch xếp lớp</Link>.
      </p>
    </div>
  )
}
