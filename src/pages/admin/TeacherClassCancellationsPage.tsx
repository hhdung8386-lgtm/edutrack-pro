import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import {
  AlertTriangle, CalendarClock, CalendarX2, CheckCircle2, Clock3, Gem, Search, XCircle,
} from 'lucide-react'
import { db } from '@/lib/firebase'
import type { BookingRequest, DayOfWeek, TeacherClassCancellationStatus } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSpinner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { getBookingPoints } from '@/lib/points'
import { isBookingCancellable } from '@/lib/bookingLogic'
import {
  TEACHER_CANCELLATION_REASON_MAX,
  approveTeacherClassCancellation,
  bookingStartMs,
  resolveTeacherClassCancellationWithoutRelease,
} from '@/lib/teacherClassCancellation'

type TabKey = 'pending' | 'approved' | 'rejected' | 'closed'

const TABS: { key: TabKey; label: string; statuses: TeacherClassCancellationStatus[] }[] = [
  { key: 'pending', label: 'Chờ duyệt', statuses: ['pending'] },
  { key: 'approved', label: 'Đã duyệt huỷ', statuses: ['approved'] },
  { key: 'rejected', label: 'Đã từ chối', statuses: ['rejected'] },
  { key: 'closed', label: 'Đã rút / đóng', statuses: ['withdrawn', 'closed'] },
]

const HISTORY_LIMIT = 200

const STATUS_META: Record<TeacherClassCancellationStatus, { label: string; className: string }> = {
  pending: { label: 'Chờ duyệt', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  approved: { label: 'Đã duyệt huỷ', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  rejected: { label: 'Đã từ chối', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  withdrawn: { label: 'Gia sư đã rút', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  closed: { label: 'Đã đóng', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Thứ 2', tue: 'Thứ 3', wed: 'Thứ 4', thu: 'Thứ 5', fri: 'Thứ 6', sat: 'Thứ 7', sun: 'Chủ nhật',
}

function dayLabel(booking: BookingRequest) {
  if (booking.requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(booking.requestedDate)) {
    const [year, month, day] = booking.requestedDate.split('-').map(Number)
    const keys: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    return DAY_LABELS[keys[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]]
  }
  return booking.requestedDay ? DAY_LABELS[booking.requestedDay] : ''
}

function formatDate(date?: string) {
  if (!date) return 'Chưa có ngày'
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}/${month}/${year}` : date
}

function formatTimestamp(value?: { toDate?: () => Date }) {
  const date = value?.toDate?.()
  if (!date) return ''
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function hoursUntil(booking: BookingRequest, nowMs: number) {
  const start = bookingStartMs(booking)
  if (start === null) return null
  return (start - nowMs) / 3_600_000
}

function timingChip(booking: BookingRequest, nowMs: number) {
  const hours = hoursUntil(booking, nowMs)
  if (hours === null) return { label: 'Thiếu giờ học', className: 'bg-slate-100 text-slate-600 ring-slate-200' }
  if (hours <= 0) return { label: 'Giờ học đã qua', className: 'bg-slate-100 text-slate-600 ring-slate-200' }
  if (hours < 24) return { label: `Còn ${Math.max(1, Math.round(hours))} giờ`, className: 'bg-rose-50 text-rose-700 ring-rose-200' }
  return { label: `Còn ${Math.round(hours / 24)} ngày`, className: 'bg-sky-50 text-sky-700 ring-sky-200' }
}

export function TeacherClassCancellationsPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<TabKey>('pending')
  const [rows, setRows] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [action, setAction] = useState<{ type: 'approve' | 'reject' | 'close'; booking: BookingRequest } | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const active = TABS.find((item) => item.key === tab) || TABS[0]
    setLoading(true)
    setLoadError(false)
    setRows([])
    // Một điều kiện trên một trường → không cần composite index mới.
    const statusFilter = active.statuses.length === 1
      ? where('teacherCancellationStatus', '==', active.statuses[0])
      : where('teacherCancellationStatus', 'in', active.statuses)
    const q = tab === 'pending'
      ? query(collection(db, 'bookingRequests'), statusFilter)
      : query(collection(db, 'bookingRequests'), statusFilter, limit(HISTORY_LIMIT))
    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as BookingRequest))
      items.sort((left, right) => tab === 'pending'
        // Chờ duyệt: ca sắp diễn ra trước.
        ? `${left.requestedDate || ''} ${left.requestedStart || ''}`.localeCompare(`${right.requestedDate || ''} ${right.requestedStart || ''}`)
        : (right.teacherCancellationResolvedAt?.seconds || right.teacherCancellationRequestedAt?.seconds || 0)
          - (left.teacherCancellationResolvedAt?.seconds || left.teacherCancellationRequestedAt?.seconds || 0))
      setRows(items)
      setLoading(false)
    }, (error) => {
      console.error('Error loading teacher class cancellations:', error)
      setLoadError(true)
      setLoading(false)
    })
  }, [tab])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter((item) => [
      item.teacherName, item.teacherCode, item.studentName, item.studentCode, item.subjectName,
      item.teacherCancellationReason, item.requestedDate,
    ].some((value) => (value || '').toLowerCase().includes(keyword)))
  }, [rows, search])

  const openAction = (type: 'approve' | 'reject' | 'close', booking: BookingRequest) => {
    setAdminNote(type === 'close' ? 'Ca đã được điểm danh hoặc đã huỷ ở nơi khác.' : '')
    setAction({ type, booking })
  }

  const runAction = async () => {
    if (!action || working) return
    const actorUid = user?.uid
    if (!actorUid) {
      toast.error('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.')
      return
    }
    if (action.type === 'reject' && !adminNote.trim()) {
      toast.warning('Vui lòng ghi lý do từ chối để gia sư nắm được.')
      return
    }
    setWorking(true)
    try {
      if (action.type === 'approve') {
        const result = await approveTeacherClassCancellation({ bookingId: action.booking.id, actorUid, adminNote })
        if (result === 'done') toast.success('Đã duyệt huỷ lớp, nhả ca và kim cương đang giữ của học viên.')
        else if (result === 'booking_changed') {
          toast.warning('Ca đã được điểm danh hoặc đã huỷ ở nơi khác nên không nhả thêm kim cương. Hãy đóng yêu cầu này.')
          openAction('close', action.booking)
          return
        } else toast.warning('Yêu cầu đã được xử lý trước đó.')
      } else {
        const result = await resolveTeacherClassCancellationWithoutRelease({
          bookingId: action.booking.id,
          actorUid,
          outcome: action.type === 'reject' ? 'rejected' : 'closed',
          adminNote,
        })
        if (result === 'done') toast.success(action.type === 'reject' ? 'Đã từ chối — ca học giữ nguyên.' : 'Đã đóng yêu cầu.')
        else toast.warning('Yêu cầu đã được xử lý trước đó.')
      }
      setAction(null)
      setAdminNote('')
    } catch (error) {
      console.error('Teacher class cancellation action failed:', error)
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
      toast.error(code === 'permission-denied'
        ? 'Tài khoản chưa có quyền xử lý ca học này.'
        : 'Chưa xử lý được yêu cầu. Vui lòng kiểm tra mạng và thử lại.')
    } finally {
      setWorking(false)
    }
  }

  const actionBooking = action?.booking
  const actionPoints = actionBooking ? getBookingPoints(actionBooking) : 0

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-600">Học vụ</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Yêu cầu huỷ lớp của gia sư</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Gia sư bận xin nghỉ một ca đã xếp. Duyệt = nhả ca khỏi lịch và nhả kim cương đang giữ về cho học viên
            (không trừ buổi). Sau khi duyệt, xếp gia sư khác ở Lịch xếp lớp nếu cần.
          </p>
        </div>
        <Link
          to="/admin/booking-schedules"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          <CalendarClock className="h-4 w-4" />
          Mở Lịch xếp lớp
        </Link>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm gia sư, học viên, môn, lý do..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`h-11 shrink-0 rounded-xl px-4 text-sm font-bold transition ${
                  tab === item.key ? 'bg-slate-950 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item.label}
                {item.key === 'pending' && tab === 'pending' && !loading && (
                  <span className="ml-2 rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white">{rows.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loadError && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          Chưa tải được danh sách yêu cầu. Không có nghĩa là không có yêu cầu — vui lòng tải lại trang.
        </div>
      )}

      {loading ? (
        <Card padding="none"><TableSkeleton /></Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarX2 className="h-8 w-8" />}
          title={tab === 'pending' ? 'Không có yêu cầu huỷ lớp đang chờ' : 'Chưa có yêu cầu phù hợp'}
          description="Khi gia sư bấm Yêu cầu huỷ lớp trên Lịch dạy, yêu cầu sẽ hiện tại đây."
        />
      ) : (
        <div className="grid gap-4">
          {filtered.map((booking) => {
            const status = booking.teacherCancellationStatus || 'pending'
            const meta = STATUS_META[status] || STATUS_META.pending
            const isPending = status === 'pending'
            const stillCancellable = isBookingCancellable(booking)
            const timing = timingChip(booking, nowMs)
            const points = getBookingPoints(booking)
            return (
              <article key={booking.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="grid gap-4 p-4 lg:grid-cols-[1fr_260px] lg:p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${meta.className}`}>{meta.label}</span>
                      {isPending && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${timing.className}`}>
                          <Clock3 className="h-3.5 w-3.5" />
                          {timing.label}
                        </span>
                      )}
                      {booking.groupClassId && (
                        <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700 ring-1 ring-violet-200">Lớp nhóm</span>
                      )}
                      <span className="text-xs font-medium text-slate-400">
                        Gửi lúc {formatTimestamp(booking.teacherCancellationRequestedAt) || '—'}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl bg-rose-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-600">Gia sư xin nghỉ</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{booking.teacherName || '—'}</p>
                        <p className="mt-1 font-mono text-xs font-semibold text-rose-700">{booking.teacherCode}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">
                          {dayLabel(booking)} {formatDate(booking.requestedDate)}, {booking.requestedStart}-{booking.requestedEnd}
                          <span className="ml-2 text-slate-400">({booking.requestedMinutes} phút)</span>
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Học viên</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{booking.studentName || '—'}</p>
                        <p className="mt-1 font-mono text-xs font-semibold text-indigo-500">{booking.studentCode}</p>
                        <p className="mt-2 text-sm text-slate-500">{booking.subjectName || 'Chưa có môn học'}</p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm text-slate-700">
                      <span className="font-semibold text-rose-700">Lý do: </span>
                      <span className="break-words">{booking.teacherCancellationReason || '—'}</span>
                    </div>
                    {booking.teacherCancellationAdminNote && (
                      <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
                        <span className="font-semibold">Ghi chú giáo vụ: </span>
                        <span className="break-words">{booking.teacherCancellationAdminNote}</span>
                        {booking.teacherCancellationResolvedAt && (
                          <span className="ml-1 text-xs text-indigo-400">({formatTimestamp(booking.teacherCancellationResolvedAt)})</span>
                        )}
                      </div>
                    )}
                  </div>

                  <aside className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-900">Kim cương đang giữ cho ca</p>
                    <p className="mt-2 flex items-center gap-2 text-2xl font-bold tabular-nums text-slate-900">
                      <Gem className="h-5 w-5 text-sky-500" />
                      {points.toLocaleString('vi-VN')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {isPending && stillCancellable
                        ? 'Sẽ được nhả về khả dụng của học viên khi duyệt huỷ.'
                        : 'Chỉ ghi nhận, không nhả thêm kim cương.'}
                    </p>

                    {isPending && !stillCancellable && (
                      <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        Ca đã được điểm danh hoặc đã huỷ ở nơi khác. Chỉ cần đóng yêu cầu.
                      </p>
                    )}

                    {isPending && (
                      <div className="mt-4 grid gap-2">
                        {stillCancellable ? (
                          <>
                            <Button variant="danger" onClick={() => openAction('approve', booking)}>
                              <CheckCircle2 className="h-4 w-4" />
                              Duyệt huỷ lớp
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => openAction('reject', booking)}
                              className="bg-white"
                            >
                              <XCircle className="h-4 w-4" />
                              Từ chối
                            </Button>
                          </>
                        ) : (
                          <Button variant="outline" onClick={() => openAction('close', booking)} className="bg-white">
                            Đóng yêu cầu
                          </Button>
                        )}
                      </div>
                    )}
                  </aside>
                </div>
              </article>
            )
          })}
          {tab !== 'pending' && rows.length >= HISTORY_LIMIT && (
            <p className="text-center text-xs font-semibold text-slate-400">Đang hiển thị {HISTORY_LIMIT} yêu cầu gần nhất của mục này.</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => {
          setAction(null)
          setAdminNote('')
        }}
        onConfirm={runAction}
        loading={working}
        confirmVariant={action?.type === 'approve' ? 'danger' : 'primary'}
        confirmLabel={action?.type === 'approve' ? 'Duyệt huỷ lớp' : action?.type === 'reject' ? 'Từ chối yêu cầu' : 'Đóng yêu cầu'}
        confirmDisabled={action?.type === 'reject' && !adminNote.trim()}
        title={action?.type === 'approve' ? 'Duyệt huỷ lớp?' : action?.type === 'reject' ? 'Từ chối yêu cầu huỷ?' : 'Đóng yêu cầu?'}
        description={actionBooking
          ? `${actionBooking.teacherName || actionBooking.teacherCode} · ${actionBooking.studentName} (${actionBooking.studentCode}) · ${formatDate(actionBooking.requestedDate)} ${actionBooking.requestedStart}-${actionBooking.requestedEnd}`
          : undefined}
        consequence={action?.type === 'approve'
          ? `Ca sẽ bị nhả khỏi lịch gia sư và học viên; ${actionPoints} kim cương đang giữ được trả về khả dụng. Không tạo buổi học, không tính lương.`
          : action?.type === 'reject'
            ? 'Ca học giữ nguyên, gia sư vẫn phải dạy. Gia sư sẽ thấy ghi chú của bạn trên Lịch dạy.'
            : 'Không thay đổi ca học và kim cương, chỉ đóng yêu cầu.'}
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-slate-700">
            {action?.type === 'reject' ? 'Lý do từ chối (bắt buộc)' : 'Ghi chú cho gia sư (không bắt buộc)'}
          </span>
          <textarea
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value.slice(0, TEACHER_CANCELLATION_REASON_MAX))}
            rows={3}
            placeholder={action?.type === 'reject' ? 'Ví dụ: Không tìm được gia sư thay, nhờ bạn cố gắng dạy ca này.' : 'Ví dụ: Đã xếp gia sư khác dạy thay.'}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />
        </label>
      </ConfirmDialog>
    </div>
  )
}
