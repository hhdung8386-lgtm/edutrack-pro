import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  RefreshCw,
  Target,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import {
  claimClassHunt,
  classHuntErrorReason,
  isClassHuntTaken,
  listTeacherClassHunts,
  type TeacherClassHunt,
} from '@/lib/classHunting'
import type { DayOfWeek } from '@/types'

const POLL_INTERVAL_MS = 120_000

const WEEKDAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Thứ 2',
  tue: 'Thứ 3',
  wed: 'Thứ 4',
  thu: 'Thứ 5',
  fri: 'Thứ 6',
  sat: 'Thứ 7',
  sun: 'Chủ nhật',
}

function formatDate(date?: string) {
  if (!date) return 'Chưa xác định ngày'
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}/${month}/${year}` : date
}

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

function compensationSummary(ratePerMinute: number, minutes: number, sessionCount: number) {
  const perLesson = ratePerMinute * minutes
  const total = perLesson * sessionCount
  return `${formatVND(ratePerMinute)}/phút · ${formatVND(perLesson)}/buổi · ${formatVND(total)}/${sessionCount} buổi`
}

function expiryLabel(expiresAt?: string) {
  if (!expiresAt) return 'Nhận lớp theo thứ tự xác nhận của hệ thống'
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return 'Nhận lớp theo thứ tự xác nhận của hệ thống'
  return `Mở đến ${date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

function clientRequestId(huntId: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `class-hunt-${huntId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * The teacher endpoint returns a deliberately sanitized offer. This page must
 * never fetch classHunts from Firestore, derive eligibility locally, or render
 * student details; eligibility and the first-claim transaction stay server-side.
 */
export function TeacherClassHuntingPage() {
  const [hunts, setHunts] = useState<TeacherClassHunt[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [confirmingHunt, setConfirmingHunt] = useState<TeacherClassHunt | null>(null)
  const mountedRef = useRef(false)
  const inFlightRef = useRef(false)
  const queuedRefreshRef = useRef(false)
  const requestIdsRef = useRef<Record<string, string>>({})

  const refresh = useCallback(async function refreshClassHunts(silent = false): Promise<void> {
    if (inFlightRef.current) {
      // A claim can finish while a background poll is still returning an old
      // open list. Queue one fresh server read instead of showing that stale
      // response until the next interval.
      queuedRefreshRef.current = true
      return
    }
    inFlightRef.current = true
    if (!silent) setRefreshing(true)
    setError('')

    try {
      const nextHunts = await listTeacherClassHunts()
      if (!mountedRef.current) return
      // The callable already scopes this to the signed-in teacher. Keep this
      // defensive client filter so stale responses cannot show closed offers.
      setHunts(nextHunts.filter((hunt) => hunt.status === 'open'))
    } catch (loadError) {
      console.error('Load teacher class hunts failed:', loadError)
      if (mountedRef.current) {
        setError('Chưa tải được danh sách lớp phù hợp. Vui lòng làm mới để thử lại.')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        if (!silent) setRefreshing(false)
      }
      inFlightRef.current = false
      if (queuedRefreshRef.current && mountedRef.current) {
        queuedRefreshRef.current = false
        void refreshClassHunts(true)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const initialLoad = window.setTimeout(() => {
      void refresh()
    }, 0)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true)
    }, POLL_INTERVAL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mountedRef.current = false
      window.clearTimeout(initialLoad)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refresh])

  const handleClaim = async (hunt: TeacherClassHunt) => {
    if (claimingId || hunt.status !== 'open') return
    setClaimingId(hunt.id)
    const requestId = requestIdsRef.current[hunt.id] || clientRequestId(hunt.id)
    requestIdsRef.current[hunt.id] = requestId

    try {
      const result = await claimClassHunt(hunt.id, requestId)
      const outcome = result.outcome || result.status || result.hunt?.status
      if (outcome === 'taken') {
        toast.warning('😭 Ôi, chậm một nhịp rồi! Lớp này vừa được giáo viên khác nhận mất rồi. Mình săn lớp tiếp theo nha!')
      } else {
        toast.success('🎉 Nhanh tay quá cô ơi! Lớp đã chính thức về đội của cô và được thêm vào lịch dạy.')
      }
      setConfirmingHunt(null)
      await refresh(true)
    } catch (claimError) {
      console.error('Claim class hunt failed:', claimError)
      const reason = classHuntErrorReason(claimError)
      if (isClassHuntTaken(claimError)) {
        toast.warning('😭 Ôi, chậm một nhịp rồi! Lớp này vừa được giáo viên khác nhận mất rồi. Mình săn lớp tiếp theo nha!')
        setConfirmingHunt(null)
        await refresh(true)
      } else if (reason === 'CLASS_HUNT_TEACHER_BOOKING_CONFLICT') {
        toast.warning('⏰ Tiếc quá! Cô không thể nhận lớp này vì đã có ca dạy trùng vào khung giờ này. Mình săn một lớp khác phù hợp hơn nha!')
        setConfirmingHunt(null)
        await refresh(true)
      } else if (reason === 'CLASS_HUNT_COMPENSATION_INVALID') {
        toast.warning('Đơn giá của lớp này cần được Admin kiểm tra lại trước khi nhận. Danh sách đã được cập nhật.')
        setConfirmingHunt(null)
        await refresh(true)
      } else if (['CLASS_HUNT_EXPIRED', 'CLASS_HUNT_NOT_OPEN', 'CLASS_HUNT_NOT_FOUND', 'CLASS_HUNT_SESSION_PASSED', 'CLASS_HUNT_SUBJECT_MISMATCH', 'CLASS_HUNT_STUDENT_BOOKING_CONFLICT'].includes(reason)) {
        toast.warning('Lớp này không còn phù hợp hoặc đã đóng. Danh sách đã được cập nhật.')
        setConfirmingHunt(null)
        await refresh(true)
      } else {
        toast.error('Chưa nhận được lớp. Hãy làm mới danh sách và thử lại.')
      }
    } finally {
      if (mountedRef.current) setClaimingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-3 pt-2 lg:pt-6">
      <header className="rounded-2xl border border-brand-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-amber-700">
              <Target className="h-5 w-5" strokeWidth={2} />
              <span className="text-xs font-extrabold tracking-[0.15em]">LỚP MỚI</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">CLASS HUNTING 🎯</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Lớp mới vừa lên sóng! Giáo viên phù hợp và nhanh tay xác nhận trước sẽ được nhận lớp nha.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void refresh()} loading={refreshing} className="self-start whitespace-nowrap sm:self-auto">
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800" role="alert">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p>{error}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3 border-rose-200 bg-white text-rose-700 hover:bg-rose-100" onClick={() => void refresh()}>
              Thử lại
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <section className="space-y-3" role="status" aria-live="polite" aria-busy="true" aria-label="Đang tải lớp mới">
          {[1, 2, 3].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-slate-100" />)}
        </section>
      ) : hunts.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Target className="h-8 w-8" />}
            title="Chưa có lớp mới"
            description="Khi có lớp đúng chuyên môn, hệ thống sẽ hiển thị tại đây để bạn chủ động nhận lớp."
            action={{ label: 'Làm mới danh sách', onClick: () => void refresh() }}
          />
        </Card>
      ) : (
        <section className="grid gap-4" aria-label="Danh sách lớp CLASS HUNTING">
          {hunts.map((hunt) => (
            <article key={hunt.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-300 hover:shadow-card-hover">
              <div className="border-b border-slate-100 bg-amber-50/55 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                    <Target className="h-4 w-4 text-amber-700" />
                    Lớp mới đang chờ nhận
                  </div>
                  <span className="rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-bold text-amber-800">{expiryLabel(hunt.expiresAt)}</span>
                </div>
              </div>

              <div className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Gói học</p>
                    <h2 className="mt-1 break-words text-lg font-black text-slate-950">{hunt.subject.name}</h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-amber-700" />{hunt.minutes} phút mỗi buổi</span>
                      <span>{hunt.sessionCount} buổi cần xếp</span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setConfirmingHunt(hunt)}
                    loading={claimingId === hunt.id}
                    disabled={Boolean(claimingId)}
                    className="w-full whitespace-nowrap sm:w-auto"
                  >
                    ✋ Nhận lớp liền
                  </Button>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-500"><CalendarDays className="h-4 w-4 text-amber-700" />Lịch cần đảm bảo</p>
                  <ul className="mt-3 space-y-2" aria-label="Các buổi học">
                    {hunt.slots.map((slot) => (
                      <li key={`${slot.date}-${slot.start}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-slate-700">
                        <span className="font-bold">{WEEKDAY_LABELS[slot.weekday]} {formatDate(slot.date)}</span>
                        <span className="font-semibold text-slate-600">{slot.start}-{slot.end}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {hunt.classHuntCompensation ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-sm leading-6 text-emerald-950">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">Đơn giá lớp đã chốt</p>
                    <p className="mt-1 font-extrabold">{compensationSummary(hunt.classHuntCompensation.ratePerMinute, hunt.minutes, hunt.sessionCount)}</p>
                    <p className="mt-1 text-xs text-emerald-800">Đơn giá này áp dụng cho lớp này, tính theo phút dạy và không nhân level. Hệ thống lưu cố định trước khi bạn nhận lớp.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-900">
                    Đây là lớp cũ chưa có đơn giá riêng được lưu. Lương sẽ áp dụng theo quy tắc hiện có của hệ thống.
                  </div>
                )}

                <div className="flex items-start gap-2 text-xs leading-5 text-slate-500">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p>Không cần mở lịch rảnh cho khung này. Hệ thống sẽ kiểm tra chuyên môn và ca dạy trùng ngay khi bạn nhận lớp. Không chia sẻ thông tin học viên ngoài buổi học được phân công.</p>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(confirmingHunt)}
        onClose={() => setConfirmingHunt(null)}
        onConfirm={() => confirmingHunt && void handleClaim(confirmingHunt)}
        title="Xác nhận nhận lớp?"
        description={confirmingHunt ? `Bạn sẽ nhận ${confirmingHunt.sessionCount} buổi của gói ${confirmingHunt.subject.name}.${confirmingHunt.classHuntCompensation ? ` Đơn giá đã chốt: ${formatVND(confirmingHunt.classHuntCompensation.ratePerMinute)}/phút, không nhân level.` : ' Đây là lớp cũ chưa lưu đơn giá riêng.'}` : undefined}
        consequence="Không cần mở lịch rảnh cho khung này. Hệ thống sẽ kiểm tra chuyên môn và ca dạy trùng trước khi tạo toàn bộ lịch."
        confirmLabel="✋ Nhận lớp liền"
        loading={Boolean(confirmingHunt && claimingId === confirmingHunt.id)}
        confirmDisabled={!confirmingHunt || Boolean(claimingId)}
      >
        {confirmingHunt && (
          <div className="space-y-3">
            {confirmingHunt.classHuntCompensation && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
                <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">Đơn giá lớp đã chốt</p>
                <p className="mt-1 font-extrabold">{compensationSummary(confirmingHunt.classHuntCompensation.ratePerMinute, confirmingHunt.minutes, confirmingHunt.sessionCount)}</p>
              </div>
            )}
            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Toàn bộ lịch sẽ nhận</p>
              <ul className="mt-2 space-y-2" aria-label="Các buổi cần xác nhận">
                {confirmingHunt.slots.map((slot) => (
                  <li key={`${slot.date}-${slot.start}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-slate-700">
                    <span className="font-bold">{WEEKDAY_LABELS[slot.weekday]} {formatDate(slot.date)}</span>
                    <span className="font-semibold">{slot.start}-{slot.end}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}
