import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection, deleteField, doc, getDocFromServer, runTransaction, serverTimestamp,
} from 'firebase/firestore'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Hourglass, Link2Off, ShieldAlert, XCircle } from 'lucide-react'
import { db } from '@/lib/firebase'
import { BookingRequest, Lesson } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { getBookingPoints } from '@/lib/points'
import {
  canSettleApprovedLinkedBooking,
  canUnlinkStaleLessonFromBooking,
  classifyLinkedBookingHold,
  isLinkedBookingHold,
  type LinkedBookingHoldState,
} from '@/lib/linkedBookingHolds'
import { settleApprovedLinkedBooking } from '@/lib/bookingHoldActions'

const DAY_LABELS: Record<string, string> = {
  mon: 'Thứ 2', tue: 'Thứ 3', wed: 'Thứ 4', thu: 'Thứ 5', fri: 'Thứ 6', sat: 'Thứ 7', sun: 'Chủ nhật',
}

const STATE_META: Record<LinkedBookingHoldState, { label: string; hint: string; badge: string; icon: typeof Hourglass }> = {
  awaiting_approval: {
    label: 'Đã điểm danh, chờ duyệt',
    hint: 'Kim cương giữ tới khi admin duyệt buổi dạy. Không hủy ở đây.',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: Hourglass,
  },
  lesson_rejected: {
    label: 'Buổi điểm danh đã bị từ chối',
    hint: 'Ca vẫn bị khóa bởi báo cáo đã từ chối. Gỡ liên kết để hủy ca hoặc cho gia sư điểm danh lại.',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: XCircle,
  },
  lesson_cancelled: {
    label: 'Buổi điểm danh đã bị hủy',
    hint: 'Gia sư đã hủy báo cáo nhưng ca chưa được mở lại. Gỡ liên kết để xử lý tiếp.',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: XCircle,
  },
  lesson_missing: {
    label: 'Không tìm thấy buổi điểm danh',
    hint: 'Ca trỏ tới một buổi dạy không còn tồn tại. Gỡ liên kết để xử lý tiếp.',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: AlertTriangle,
  },
  lesson_approved_unsettled: {
    label: 'Buổi đã duyệt nhưng ca chưa đóng',
    hint: 'Buổi đã trừ quỹ nhưng ca vẫn giữ kim cương nên học viên bị tính hai lần. Đóng ca để nhả phần giữ; buổi dạy và lương giữ nguyên.',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: ShieldAlert,
  },
  link_mismatch: {
    label: 'Liên kết sai học viên/gia sư',
    hint: 'Gỡ liên kết được khi buổi kia không còn chờ duyệt và không ghi nhận ca này; trường hợp khác cần đối soát thủ công.',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: ShieldAlert,
  },
}

type LessonLookup = Record<string, Lesson | null>

interface LinkedBookingHoldsPanelProps {
  /** Ca đang giữ quỹ của phạm vi đang xem; panel tự lọc ra ca có `lessonId`. */
  bookings: BookingRequest[]
  showStudent?: boolean
  compact?: boolean
  /** Gọi sau khi gỡ liên kết để màn hình không dùng listener có thể tải lại dữ liệu. */
  onChanged?: () => void
}

/**
 * Hiển thị các ca vẫn giữ kim cương nhưng đã gắn buổi điểm danh, kèm trạng thái
 * thật của buổi đó. Đây là nhóm ca trước đây không xuất hiện ở "Lịch đã đặt" và
 * không hủy được, khiến học viên "hết kim cương" mà không biết ca nằm ở đâu.
 */
export function LinkedBookingHoldsPanel({ bookings, showStudent = false, compact = false, onChanged }: LinkedBookingHoldsPanelProps) {
  const { user } = useAuthStore()
  const linked = useMemo(
    () => bookings
      .filter(isLinkedBookingHold)
      .sort((a, b) => (a.requestedDate || '').localeCompare(b.requestedDate || '')
        || (a.requestedStart || '').localeCompare(b.requestedStart || '')),
    [bookings],
  )
  const lessonIdsKey = useMemo(
    () => Array.from(new Set(linked.map((booking) => booking.lessonId as string))).sort().join('|'),
    [linked],
  )
  const [lessons, setLessons] = useState<LessonLookup>({})
  const [loadedKey, setLoadedKey] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [confirmTargets, setConfirmTargets] = useState<BookingRequest[] | null>(null)
  const [settleTarget, setSettleTarget] = useState<BookingRequest | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (!lessonIdsKey) return
    let active = true
    const ids = lessonIdsKey.split('|')
    Promise.all(ids.map((lessonId) => getDocFromServer(doc(db, 'lessons', lessonId))))
      .then((snaps) => {
        if (!active) return
        const next: LessonLookup = {}
        snaps.forEach((snap, index) => {
          next[ids[index]] = snap.exists() ? ({ id: snap.id, ...snap.data() } as Lesson) : null
        })
        setLessons(next)
        setLoadError(false)
        setLoadedKey(lessonIdsKey)
      })
      .catch((error) => {
        if (!active) return
        console.error('Load linked lessons failed:', error)
        setLoadError(true)
        setLoadedKey(lessonIdsKey)
      })
    return () => { active = false }
  }, [lessonIdsKey, reloadToken])

  if (linked.length === 0) return null

  const ready = loadedKey === lessonIdsKey && !loadError
  const rows = linked.map((booking) => {
    const lesson = ready ? (lessons[booking.lessonId as string] ?? null) : undefined
    const state = lesson === undefined ? null : classifyLinkedBookingHold(booking, lesson)
    const canUnlink = lesson !== undefined && canUnlinkStaleLessonFromBooking(booking, lesson)
    const canSettle = lesson !== undefined && canSettleApprovedLinkedBooking(booking, lesson)
    return { booking, state, canUnlink, canSettle }
  })
  const staleRows = rows.filter((row) => row.canUnlink)
  const totalPoints = linked.reduce((sum, booking) => sum + getBookingPoints(booking), 0)

  const unlink = async (targets: BookingRequest[]) => {
    setProcessing(true)
    let done = 0
    let skipped = 0
    try {
      for (const target of targets) {
        const result = await runTransaction(db, async (tx) => {
          const bookingRef = doc(db, 'bookingRequests', target.id)
          const bookingSnap = await tx.get(bookingRef)
          if (!bookingSnap.exists()) return false
          const fresh = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
          if (!fresh.lessonId || fresh.lessonId !== target.lessonId) return false
          const lessonSnap = await tx.get(doc(db, 'lessons', fresh.lessonId))
          const lesson = lessonSnap.exists() ? ({ id: lessonSnap.id, ...lessonSnap.data() } as Lesson) : null
          // Kiểm tra lại trên dữ liệu mới nhất: buổi có thể vừa được mở lại/duyệt ở màn hình khác.
          if (!canUnlinkStaleLessonFromBooking(fresh, lesson)) return false

          tx.update(bookingRef, { lessonId: deleteField(), updatedAt: serverTimestamp() })
          tx.set(doc(collection(db, 'adminLogs')), {
            adminId: user?.uid ?? 'admin',
            action: 'UNLINK_STALE_BOOKING_LESSON',
            targetType: 'bookingRequest',
            targetId: fresh.id,
            changes: {
              studentId: fresh.studentId,
              studentCode: fresh.studentCode || '',
              lessonId: fresh.lessonId,
              lessonStatus: lesson?.status ?? 'missing',
              requestedDate: fresh.requestedDate || '',
              heldPointsUnchanged: getBookingPoints(fresh),
            },
            createdAt: serverTimestamp(),
          })
          return true
        })
        if (result) done++
        else skipped++
      }
      if (done > 0) {
        toast.success(`Đã gỡ liên kết ${done} ca. Kim cương vẫn giữ nguyên; ca tương lai hiện ở danh sách bên dưới, ca đã qua nằm ở trang Rà soát quá hạn.`)
      }
      if (skipped > 0) toast.warning(`${skipped} ca vừa thay đổi ở thao tác khác nên hệ thống bỏ qua, không ghi đè.`)
      setConfirmTargets(null)
      setReloadToken((value) => value + 1)
      onChanged?.()
    } catch (error) {
      console.error('Unlink stale booking lesson failed:', error)
      toast.error(`Gỡ liên kết thất bại${done > 0 ? ` sau khi đã xử lý ${done} ca` : ''}. Vui lòng thử lại.`)
      setReloadToken((value) => value + 1)
      onChanged?.()
    } finally {
      setProcessing(false)
    }
  }

  const settle = async (target: BookingRequest) => {
    setProcessing(true)
    try {
      const result = await settleApprovedLinkedBooking({ bookingId: target.id, actorUid: user?.uid ?? 'admin' })
      if (result === 'done') toast.success('Đã đóng ca đã duyệt. Phần kim cương giữ trùng đã được nhả; quỹ đã học giữ nguyên.')
      else toast.warning('Ca hoặc buổi dạy vừa thay đổi ở thao tác khác nên hệ thống bỏ qua, không ghi đè.')
      setSettleTarget(null)
    } catch (error) {
      console.error('Settle approved linked booking failed:', error)
      toast.error('Chưa đóng được ca này. Vui lòng thử lại.')
    } finally {
      setProcessing(false)
      setReloadToken((value) => value + 1)
      onChanged?.()
    }
  }

  return (
    <div className={`rounded-2xl border border-indigo-200 bg-white ${compact ? 'p-3' : 'p-4 sm:p-5'} space-y-3`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={`font-bold text-slate-900 ${compact ? 'text-xs' : 'text-sm'}`}>
            {linked.length} ca đã gắn buổi điểm danh vẫn đang giữ {totalPoints.toLocaleString('vi-VN')} kim cương
          </p>
          <p className={`text-slate-500 mt-0.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            Các ca này không nằm trong danh sách lịch tương lai. Trạng thái bên dưới cho biết ca đang chờ duyệt hay bị treo.
          </p>
        </div>
        {staleRows.length > 1 && (
          <Button
            size="sm"
            variant="danger"
            loading={processing}
            onClick={() => setConfirmTargets(staleRows.map((row) => row.booking))}
            className="flex-shrink-0"
          >
            <Link2Off className="w-4 h-4" />
            Gỡ {staleRows.length} ca bị treo
          </Button>
        )}
      </div>

      {loadError && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          Không tải được trạng thái buổi điểm danh.
          <button type="button" className="underline" onClick={() => setReloadToken((value) => value + 1)}>Thử lại</button>
        </div>
      )}

      <ul className={`divide-y divide-slate-100 ${compact ? 'max-h-48 overflow-y-auto pr-1' : ''}`}>
        {rows.map(({ booking, state, canUnlink, canSettle }) => {
          const meta = state ? STATE_META[state] : null
          const Icon = meta?.icon
          return (
            <li key={booking.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-xs text-slate-700">
                {showStudent && (
                  <p className="font-bold text-slate-900">
                    {booking.studentName} <span className="font-mono font-medium text-slate-400">{booking.studentCode}</span>
                  </p>
                )}
                <p className="font-semibold">
                  {DAY_LABELS[booking.requestedDay || ''] || ''} ({booking.requestedDate}) · {booking.requestedStart} - {booking.requestedEnd}
                  <span className="text-slate-400"> · </span>{booking.teacherName}
                  <span className="text-slate-400"> · </span>{getBookingPoints(booking)} kim cương
                </p>
                {meta && Icon ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${meta.badge}`}>
                      <Icon className="h-3 w-3" />{meta.label}
                    </span>
                    {!compact && <span className="text-[11px] text-slate-500">{meta.hint}</span>}
                  </div>
                ) : !loadError && (
                  <p className="mt-1 text-[11px] text-slate-400">Đang kiểm tra buổi điểm danh...</p>
                )}
              </div>
              <div className="flex flex-shrink-0 gap-2">
                {state === 'awaiting_approval' && (
                  <Link
                    to="/admin/approvals"
                    target={compact ? '_blank' : undefined}
                    rel={compact ? 'noopener noreferrer' : undefined}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />Mở trang duyệt
                  </Link>
                )}
                {canUnlink && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={processing}
                    onClick={() => setConfirmTargets([booking])}
                    className="text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50"
                  >
                    <Link2Off className="h-3.5 w-3.5" />Gỡ liên kết
                  </Button>
                )}
                {canSettle && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={processing}
                    onClick={() => setSettleTarget(booking)}
                    className="text-xs font-bold text-amber-800 border-amber-200 hover:bg-amber-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />Đóng ca đã duyệt
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={!!confirmTargets}
        onClose={() => { if (!processing) setConfirmTargets(null) }}
        onConfirm={() => { if (confirmTargets) unlink(confirmTargets) }}
        title={confirmTargets && confirmTargets.length > 1 ? `Gỡ liên kết ${confirmTargets.length} ca bị treo` : 'Gỡ liên kết buổi điểm danh không còn hiệu lực'}
        description="Ca sẽ quay về trạng thái chưa điểm danh. Hệ thống kiểm tra lại buổi dạy ngay lúc ghi và bỏ qua ca vừa thay đổi."
        consequence="Không hoàn và không trừ kim cương ở bước này. Sau đó bạn có thể hủy ca tương lai, rà soát ca quá hạn, hoặc để gia sư điểm danh lại."
        confirmLabel="Gỡ liên kết"
        loading={processing}
      />

      <ConfirmDialog
        open={!!settleTarget}
        onClose={() => { if (!processing) setSettleTarget(null) }}
        onConfirm={() => { if (settleTarget) void settle(settleTarget) }}
        title="Đóng ca đã có buổi dạy được duyệt"
        description={settleTarget
          ? `Ca ${settleTarget.requestedDate || ''} ${settleTarget.requestedStart || ''} với ${settleTarget.teacherName || 'gia sư'} đã có buổi dạy được duyệt nhưng vẫn đang giữ ${getBookingPoints(settleTarget)} kim cương.`
          : ''}
        consequence="Ca chuyển sang đã hoàn tất. Hệ thống chỉ nhả phần giữ chưa từng được nhả lúc duyệt; không cộng quỹ, không đổi buổi dạy hay lương."
        confirmLabel="Đóng ca"
        loading={processing}
      />
    </div>
  )
}
