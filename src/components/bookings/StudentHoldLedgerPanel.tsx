import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocsFromServer, query, where } from 'firebase/firestore'
import { AlertTriangle, CalendarClock, ClipboardCheck, ExternalLink, RotateCcw, ShieldAlert, Wallet } from 'lucide-react'
import { db } from '@/lib/firebase'
import type { BookingRequest, Lesson } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { LinkedBookingHoldsPanel } from '@/components/bookings/LinkedBookingHoldsPanel'
import { buildStudentHoldLedger, STUDENT_HOLD_KINDS, type StudentHoldKind } from '@/lib/studentHoldLedger'
import {
  canManuallyReleaseDiagnosedOverdueBookingHold,
  canReleaseDiagnosedOverdueBookingHold,
  diagnoseOverdueBookings,
  type DiagnosedOverdueBooking,
  type OverdueDiagnosis,
} from '@/lib/overdueBookingDiagnosis'
import { releasePendingRebookHold, releaseUnlinkedBookingHold, type HoldActionResult } from '@/lib/bookingHoldActions'
import { settleBookingsByApprovedLessons } from '@/lib/linkedLessonSettlement'

const DAY_LABELS: Record<string, string> = {
  mon: 'Thứ 2', tue: 'Thứ 3', wed: 'Thứ 4', thu: 'Thứ 5', fri: 'Thứ 6', sat: 'Thứ 7', sun: 'Chủ nhật',
}

const KIND_META: Record<StudentHoldKind, { label: string; tone: string }> = {
  future: { label: 'Tương lai', tone: 'border-slate-200 bg-slate-50 text-slate-700' },
  overdue: { label: 'Quá hạn chưa điểm danh', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  linked: { label: 'Đã gắn điểm danh', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  pending_rebook: { label: 'Chờ đặt lại', tone: 'border-violet-200 bg-violet-50 text-violet-700' },
  undated: { label: 'Thiếu ngày học', tone: 'border-rose-200 bg-rose-50 text-rose-700' },
}

const DIAGNOSIS_META: Record<OverdueDiagnosis, { label: string; tone: string }> = {
  no_lesson: { label: 'Không có buổi điểm danh nào', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  rejected_lesson: { label: 'Buổi điểm danh đã bị từ chối', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  approved_lesson: { label: 'Đã dạy và duyệt, ca chưa được gắn', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  pending_lesson: { label: 'Đã điểm danh, đang chờ duyệt', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  other_teacher_lesson: { label: 'Hôm đó học với gia sư khác', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  ambiguous_lesson: { label: 'Có buổi cùng gia sư nhưng không khớp chắc chắn', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  conflicting_link: { label: 'Liên kết mâu thuẫn, cần đối soát thủ công', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
}

const LESSON_STATUS_LABELS: Record<Lesson['status'], string> = {
  pending: 'chờ duyệt', approved: 'đã duyệt', rejected: 'bị từ chối', cancelled: 'đã hủy',
}

type PendingAction =
  | { type: 'overdue'; item: DiagnosedOverdueBooking; manual: boolean }
  | { type: 'undated'; booking: BookingRequest }
  | { type: 'rebook'; booking: BookingRequest }

interface StudentHoldLedgerPanelProps {
  studentId: string
  /** Đổi giá trị để tải lại, ví dụ khi listener các ca đang giữ vừa thay đổi. */
  refreshKey?: string | number
  /** Ca tương lai đã có ở bảng ngay bên dưới (trang Lịch đã đặt) hay cần mở trang đó. */
  futureLocation?: 'below' | 'link'
}

function todayInVietnam() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function slotLabel(booking: BookingRequest) {
  const day = DAY_LABELS[booking.requestedDay || ''] || ''
  const date = booking.requestedDate ? `${day} (${booking.requestedDate})` : 'Chưa có ngày học'
  return `${date} · ${booking.requestedStart || '--:--'} - ${booking.requestedEnd || '--:--'}`
}

/**
 * Sổ giữ kim cương của MỘT học viên: liệt kê mọi ca đang giữ kim cương, kể cả
 * nhóm trước đây không hiện ở "Lịch đã đặt" (quá hạn, đã gắn điểm danh, chờ đặt
 * lại, thiếu ngày), kèm đúng thao tác an toàn cho từng nhóm.
 */
export function StudentHoldLedgerPanel({ studentId, refreshKey, futureLocation = 'below' }: StudentHoldLedgerPanelProps) {
  const { user } = useAuthStore()
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [lessons, setLessons] = useState<Lesson[] | null>(null)
  const [loadedFor, setLoadedFor] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [processing, setProcessing] = useState(false)
  const todayISO = useMemo(() => todayInVietnam(), [])

  useEffect(() => {
    let active = true
    getDocsFromServer(query(collection(db, 'bookingRequests'), where('studentId', '==', studentId)))
      // Ca còn confirmed nhưng đã có buổi được duyệt là buổi đã học, không phải ca đang giữ.
      .then((snap) => settleBookingsByApprovedLessons(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookingRequest))))
      .then(({ bookings: settled }) => {
        if (!active) return
        setBookings(settled)
        setLessons(null)
        setLoadError(false)
        setLoadedFor(studentId)
      })
      .catch((error) => {
        if (!active) return
        console.error('Load student hold ledger failed:', error)
        setLoadError(true)
        setLoadedFor(studentId)
      })
    return () => { active = false }
  }, [studentId, refreshKey, reloadToken])

  const ready = loadedFor === studentId && !loadError
  const ledger = useMemo(
    () => buildStudentHoldLedger(ready ? bookings : [], todayISO),
    [bookings, ready, todayISO],
  )
  const overdueCount = ledger.byKind.overdue.length

  // Buổi dạy chỉ cần khi có ca quá hạn để chẩn đoán; không đọc nếu không cần.
  useEffect(() => {
    if (!ready || overdueCount === 0 || lessons !== null) return
    let active = true
    getDocsFromServer(query(collection(db, 'lessons'), where('studentId', '==', studentId)))
      .then((snap) => {
        if (active) setLessons(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson)))
      })
      .catch((error) => {
        if (!active) return
        console.error('Load lessons for hold ledger failed:', error)
        setLessons([])
        toast.error('Không tải được buổi dạy để chẩn đoán ca quá hạn.')
      })
    return () => { active = false }
  }, [ready, overdueCount, lessons, studentId])

  const diagnosed = useMemo(
    () => (lessons ? diagnoseOverdueBookings(ledger.byKind.overdue.map((item) => item.booking), lessons, todayISO) : []),
    [ledger, lessons, todayISO],
  )

  if (loadError) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
        Không tải được sổ giữ kim cương của học viên.
        <button type="button" className="underline" onClick={() => setReloadToken((value) => value + 1)}>Thử lại</button>
      </div>
    )
  }
  if (!ready || ledger.items.length === 0) return null

  const reload = () => setReloadToken((value) => value + 1)

  const runAction = async () => {
    if (!pending) return
    const actorUid = user?.uid ?? 'admin'
    setProcessing(true)
    try {
      let result: HoldActionResult
      if (pending.type === 'rebook') {
        result = await releasePendingRebookHold({ bookingId: pending.booking.id, actorUid })
      } else if (pending.type === 'undated') {
        result = await releaseUnlinkedBookingHold({ bookingId: pending.booking.id, actorUid, resolution: 'undated_released' })
      } else {
        result = await releaseUnlinkedBookingHold({
          bookingId: pending.item.booking.id,
          actorUid,
          resolution: 'overdue_released',
          diagnosis: pending.item.diagnosis,
        })
      }
      if (result === 'done') toast.success('Đã nhả kim cương đang giữ. Quỹ của học viên không bị cộng thêm.')
      else toast.warning('Ca này vừa thay đổi ở thao tác khác nên hệ thống bỏ qua, không nhả trùng.')
      setPending(null)
    } catch (error) {
      console.error('Hold ledger action failed:', error)
      toast.error('Chưa xử lý được ca này. Vui lòng thử lại.')
    } finally {
      setProcessing(false)
      reload()
    }
  }

  const pendingBooking = pending ? (pending.type === 'overdue' ? pending.item.booking : pending.booking) : null
  const pendingPoints = pendingBooking ? (ledger.items.find((item) => item.booking.id === pendingBooking.id)?.points ?? 0) : 0

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby={`hold-ledger-${studentId}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h3 id={`hold-ledger-${studentId}`} className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Wallet className="h-4.5 w-4.5 text-indigo-600" />
            Sổ giữ kim cương
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Mọi ca đang giữ kim cương của học viên, gồm cả các ca không nằm trong danh sách lịch tương lai.
          </p>
        </div>
        <p className="text-sm font-extrabold tabular-nums text-slate-900">
          {ledger.totalPoints.toLocaleString('vi-VN')} kim cương · {ledger.items.length} ca
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STUDENT_HOLD_KINDS.map((kind) => (
          <div key={kind} className={`rounded-xl border px-3 py-2 ${KIND_META[kind].tone}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{KIND_META[kind].label}</p>
            <p className="mt-0.5 text-sm font-extrabold tabular-nums">{ledger.byKind[kind].length} ca</p>
            <p className="text-[11px] font-semibold tabular-nums">{ledger.pointsByKind[kind].toLocaleString('vi-VN')} kim cương</p>
          </div>
        ))}
      </div>

      {ledger.byKind.future.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
          <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
          {ledger.byKind.future.length} ca tương lai ({ledger.pointsByKind.future.toLocaleString('vi-VN')} kim cương)
          {futureLocation === 'below'
            ? ' nằm trong danh sách bên dưới, hủy trực tiếp tại đó.'
            : <> — <Link to={`/admin/future-bookings?studentId=${studentId}`} className="font-bold text-indigo-700 underline">mở Lịch đã đặt để hủy</Link></>}
        </p>
      )}

      {overdueCount > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-amber-800">Ca đã qua ngày nhưng chưa điểm danh</p>
            <Link
              to={`/admin/overdue-bookings?studentId=${studentId}`}
              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline"
            >
              Trang rà soát quá hạn<ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {lessons === null ? (
            <p className="text-[11px] text-slate-400">Đang đối chiếu buổi dạy...</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-amber-100 px-3">
              {diagnosed.map((item) => {
                const meta = DIAGNOSIS_META[item.diagnosis]
                const safe = canReleaseDiagnosedOverdueBookingHold(item)
                const manual = !safe && canManuallyReleaseDiagnosedOverdueBookingHold(item)
                return (
                  <li key={item.booking.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-xs text-slate-700">
                      <p className="font-semibold">
                        {slotLabel(item.booking)}<span className="text-slate-400"> · </span>{item.booking.teacherName}
                        <span className="text-slate-400"> · </span>{ledger.items.find((row) => row.booking.id === item.booking.id)?.points ?? 0} kim cương
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${meta.tone}`}>{meta.label}</span>
                        {item.relatedLessons.length > 0 && (
                          <span className="text-[11px] text-slate-500">
                            Buổi liên quan: {item.relatedLessons.map((lesson) => `${lesson.teacherName || 'Gia sư'} ${lesson.minutes} phút (${LESSON_STATUS_LABELS[lesson.status] || lesson.status})`).join('; ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap gap-2">
                      {item.diagnosis === 'pending_lesson' && (
                        <Link to="/admin/approvals" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-100">
                          <ClipboardCheck className="h-3.5 w-3.5" />Mở trang duyệt
                        </Link>
                      )}
                      {item.canLink && (
                        <Link to={`/admin/overdue-bookings?studentId=${studentId}`} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-800 hover:bg-amber-100">
                          <ShieldAlert className="h-3.5 w-3.5" />Gắn vào buổi đã duyệt
                        </Link>
                      )}
                      {(safe || manual) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={processing}
                          onClick={() => setPending({ type: 'overdue', item, manual })}
                          className="text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />{manual ? 'Nhả sau khi đối chiếu' : 'Nhả giữ chỗ'}
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {ledger.byKind.linked.length > 0 && (
        <LinkedBookingHoldsPanel bookings={ledger.byKind.linked.map((item) => item.booking)} onChanged={reload} />
      )}

      {ledger.byKind.pending_rebook.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-violet-800">Học viên tự hủy, kim cương vẫn giữ chờ đặt lại</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-violet-100 px-3">
            {ledger.byKind.pending_rebook.map((item) => (
              <li key={item.booking.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 text-xs font-semibold text-slate-700">
                  Ca đã hủy: {slotLabel(item.booking)}<span className="text-slate-400"> · </span>{item.booking.teacherName}
                  <span className="text-slate-400"> · </span>{item.points} kim cương đang giữ
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={processing}
                  onClick={() => setPending({ type: 'rebook', booking: item.booking })}
                  className="flex-shrink-0 text-xs font-bold text-violet-700 border-violet-200 hover:bg-violet-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />Nhả kim cương chờ đặt lại
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ledger.byKind.undated.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />Ca đang giữ nhưng thiếu ngày học</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-rose-100 px-3">
            {ledger.byKind.undated.map((item) => (
              <li key={item.booking.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 text-xs font-semibold text-slate-700">
                  {slotLabel(item.booking)}<span className="text-slate-400"> · </span>{item.booking.teacherName}
                  <span className="text-slate-400"> · </span>{item.points} kim cương
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={processing}
                  onClick={() => setPending({ type: 'undated', booking: item.booking })}
                  className="flex-shrink-0 text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />Hủy ca và nhả giữ chỗ
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        onClose={() => { if (!processing) setPending(null) }}
        onConfirm={() => { void runAction() }}
        title={pending?.type === 'rebook'
          ? 'Nhả kim cương chờ đặt lại'
          : pending?.type === 'undated' ? 'Hủy ca thiếu ngày học' : 'Nhả giữ chỗ ca quá hạn'}
        description={pendingBooking
          ? `${slotLabel(pendingBooking)} với ${pendingBooking.teacherName || 'gia sư'}${pending?.type === 'overdue' ? `: ${DIAGNOSIS_META[pending.item.diagnosis].label.toLowerCase()}.` : '.'}${pending?.type === 'overdue' && pending.manual ? ' Bạn đã đối chiếu các buổi dạy liên quan hiển thị ở dòng này.' : ''}`
          : ''}
        consequence={pending?.type === 'rebook'
          ? `Học viên hết nghĩa vụ đặt lại buổi này; ${pendingPoints} kim cương trở về khả dụng. Không cộng thêm quỹ.`
          : `Ca được giải phóng khỏi lịch; ${pendingPoints} kim cương giữ chỗ trở về khả dụng. Không cộng thêm quỹ, không đổi buổi dạy hay lương. Hệ thống kiểm tra lại ca ngay lúc ghi.`}
        confirmLabel="Xác nhận nhả"
        confirmVariant="danger"
        loading={processing}
      />
    </section>
  )
}
