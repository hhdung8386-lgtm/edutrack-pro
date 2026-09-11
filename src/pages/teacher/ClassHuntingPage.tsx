import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  DollarSign,
  Flame,
  Info,
  Loader2,
  Monitor,
  RefreshCw,
  Target,
  Users,
  XCircle,
} from 'lucide-react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/shared/EmptyState'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { calculateSalary, db } from '@/lib/firebase'
import {
  claimClassHunt,
  classHuntErrorReason,
  isClassHuntTaken,
  listTeacherClassHunts,
  type TeacherClassHunt,
} from '@/lib/classHunting'
import type { DayOfWeek } from '@/types'

const POLL_INTERVAL_MS = 120_000
const PREVIEW_SLOT_COUNT = 5
const ALL_MONTHS = 'all'
const UNKNOWN_MONTH = 'unknown'

const WEEKDAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Thứ 2',
  tue: 'Thứ 3',
  wed: 'Thứ 4',
  thu: 'Thứ 5',
  fri: 'Thứ 6',
  sat: 'Thứ 7',
  sun: 'Chủ nhật',
}

const OUTLINE_BUTTON = 'inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-slate-900 bg-white px-4 text-sm font-bold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const PRIMARY_BUTTON = 'inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-orange-300'
const CONFIRM_BUTTON = PRIMARY_BUTTON.replace('uppercase tracking-wide ', '')
const TAKEN_BUTTON = 'inline-flex min-h-[46px] w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-200 px-4 text-sm font-bold text-slate-500'

function firstSlotDate(hunt: TeacherClassHunt): string {
  return hunt.slots.map((slot) => slot.date).filter(Boolean).sort()[0] || ''
}

function dayMonth(date?: string) {
  const [year, month, day] = (date || '').split('-')
  return year && month && day ? `${day}/${month}` : 'chưa xác định'
}

function monthKeyOf(hunt: TeacherClassHunt) {
  const date = firstSlotDate(hunt)
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : UNKNOWN_MONTH
}

function monthLabel(key: string) {
  if (key === UNKNOWN_MONTH) return 'Chưa xác định tháng'
  const [year, month] = key.split('-')
  return `Tháng ${month}/${year}`
}

function formatAmount(amount: number, currency = 'VND') {
  if (currency.toUpperCase() === 'VND') return `${Math.round(amount).toLocaleString('vi-VN')}đ`
  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toLocaleString('vi-VN')} ${currency}`
  }
}

interface HuntPay {
  perLesson: number
  total: number
  currency: string
  basis: string
}

/** Mirrors approval: a locked class rate is per minute without level; otherwise subject price x tutor level. */
function huntPay(hunt: TeacherClassHunt): HuntPay | null {
  if (hunt.classHuntCompensation) {
    const rate = hunt.classHuntCompensation.ratePerMinute
    const perLesson = rate * hunt.minutes
    return {
      perLesson,
      total: perLesson * hunt.sessionCount,
      currency: 'VND',
      basis: `Đơn giá lớp đã chốt ${formatAmount(rate)}/phút, không nhân level.`,
    }
  }
  if (hunt.subjectRate) {
    const rate = hunt.subjectRate
    const level = rate.teacherLevel && rate.teacherLevel > 0 ? rate.teacherLevel : 1
    return {
      perLesson: calculateSalary(hunt.minutes, rate.pricePerMinute, level, rate.currency),
      total: calculateSalary(hunt.minutes * hunt.sessionCount, rate.pricePerMinute, level, rate.currency),
      currency: rate.currency,
      basis: `Tính theo đơn giá môn ${formatAmount(rate.pricePerMinute, rate.currency)}/phút x level ${level}; số tiền chính thức chốt khi buổi được duyệt.`,
    }
  }
  return null
}

function expiryLabel(expiresAt?: string) {
  if (!expiresAt) return 'Nhận theo thứ tự xác nhận'
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return 'Nhận theo thứ tự xác nhận'
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

function isClassHuntNotificationForTeacher(data: Record<string, unknown>, teacherId: string): boolean {
  const targetIds = Array.isArray(data.targetIds)
    ? data.targetIds.filter((value): value is string => typeof value === 'string')
    : []
  return (targetIds.length === 0 || targetIds.includes(teacherId))
    && (data.kind === 'class_hunt_available' || data.senderId === 'system:class-hunt')
}

interface HuntCard {
  hunt: TeacherClassHunt
  taken: boolean
}

/**
 * The teacher endpoint returns a deliberately sanitized offer. This page must
 * never fetch classHunts from Firestore, derive eligibility locally, or render
 * student details; eligibility and the first-claim transaction stay server-side.
 */
export function TeacherClassHuntingPage() {
  const teacherId = useAuthStore((state) => state.teacherId)
  const [hunts, setHunts] = useState<TeacherClassHunt[]>([])
  // Offers this tutor lost to a faster claim stay visible (greyed) for the session.
  const [takenHunts, setTakenHunts] = useState<Record<string, TeacherClassHunt>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [monthFilter, setMonthFilter] = useState(ALL_MONTHS)
  const [scheduleHunt, setScheduleHunt] = useState<TeacherClassHunt | null>(null)
  const [showAllSlots, setShowAllSlots] = useState(false)
  const [confirmingHunt, setConfirmingHunt] = useState<TeacherClassHunt | null>(null)
  const [agreed, setAgreed] = useState(false)
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
        const reason = classHuntErrorReason(loadError)
        setError(reason === 'CLASS_HUNT_CONTRACT_SCAN_LIMIT'
          ? 'Hệ thống chưa thể đối soát lịch sử hợp đồng an toàn. Vui lòng liên hệ quản trị viên để kiểm tra hồ sơ.'
          : reason === 'CLASS_HUNT_FEED_SCAN_LIMIT'
            ? 'Hệ thống chưa thể đối soát danh sách lớp an toàn. Vui lòng làm mới để thử lại.'
            : 'Chưa tải được danh sách lớp phù hợp. Vui lòng làm mới để thử lại.')
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

  useEffect(() => {
    if (!teacherId) return undefined
    let receivedInitialSnapshot = false
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('targetType', '==', 'teachers'),
    )
    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      if (!receivedInitialSnapshot) {
        receivedInitialSnapshot = true
        return
      }
      const hasNewClassHunt = snapshot.docChanges().some((change) => (
        change.type === 'added'
        && isClassHuntNotificationForTeacher(change.doc.data() || {}, teacherId)
      ))
      if (hasNewClassHunt) void refresh(true)
    }, (notificationError) => {
      // The feed remains callable-only and continues polling if the optional
      // notification bridge is temporarily unavailable.
      console.warn('Class hunt notification listener failed:', notificationError)
    })
    return unsubscribe
  }, [refresh, teacherId])

  const cards = useMemo<HuntCard[]>(() => [
    ...hunts.filter((hunt) => !takenHunts[hunt.id]).map((hunt) => ({ hunt, taken: false })),
    ...Object.values(takenHunts).map((hunt) => ({ hunt, taken: true })),
  ], [hunts, takenHunts])

  const monthKeys = useMemo(() => Array.from(new Set(cards.map((card) => monthKeyOf(card.hunt))))
    .sort((left, right) => {
      if (left === UNKNOWN_MONTH) return 1
      if (right === UNKNOWN_MONTH) return -1
      return right.localeCompare(left)
    }), [cards])
  const activeMonth = monthKeys.includes(monthFilter) ? monthFilter : ALL_MONTHS

  const groups = useMemo(() => monthKeys
    .filter((key) => activeMonth === ALL_MONTHS || key === activeMonth)
    .map((key) => ({
      key,
      cards: cards
        .filter((card) => monthKeyOf(card.hunt) === key)
        .sort((left, right) => Number(left.taken) - Number(right.taken)
          || firstSlotDate(left.hunt).localeCompare(firstSlotDate(right.hunt))),
    })), [activeMonth, cards, monthKeys])

  const markTaken = (hunt: TeacherClassHunt) => {
    setTakenHunts((current) => ({ ...current, [hunt.id]: { ...hunt, status: 'claimed' } }))
  }

  const openSchedule = (hunt: TeacherClassHunt) => {
    setShowAllSlots(false)
    setScheduleHunt(hunt)
  }

  const openConfirm = (hunt: TeacherClassHunt) => {
    if (claimingId || takenHunts[hunt.id]) return
    setScheduleHunt(null)
    setAgreed(false)
    setConfirmingHunt(hunt)
  }

  const closeConfirm = () => {
    if (claimingId) return
    setConfirmingHunt(null)
  }

  const backToSchedule = () => {
    if (claimingId || !confirmingHunt) return
    const hunt = confirmingHunt
    setConfirmingHunt(null)
    openSchedule(hunt)
  }

  const handleClaim = async (hunt: TeacherClassHunt) => {
    if (claimingId || hunt.status !== 'open' || !agreed) return
    setClaimingId(hunt.id)
    const requestId = requestIdsRef.current[hunt.id] || clientRequestId(hunt.id)
    requestIdsRef.current[hunt.id] = requestId

    try {
      const result = await claimClassHunt(hunt.id, requestId)
      const outcome = result.outcome || result.status || result.hunt?.status
      if (outcome === 'taken') {
        markTaken(hunt)
        toast.warning('Chậm một nhịp rồi! Lớp này vừa được giáo viên khác nhận. Mình săn lớp tiếp theo nha!')
      } else {
        toast.success('Nhận lớp thành công! Lớp đã được thêm vào lịch dạy của bạn.')
      }
      setConfirmingHunt(null)
      await refresh(true)
    } catch (claimError) {
      console.error('Claim class hunt failed:', claimError)
      const reason = classHuntErrorReason(claimError)
      if (isClassHuntTaken(claimError)) {
        markTaken(hunt)
        toast.warning('Chậm một nhịp rồi! Lớp này vừa được giáo viên khác nhận. Mình săn lớp tiếp theo nha!')
        setConfirmingHunt(null)
        await refresh(true)
      } else if (reason === 'CLASS_HUNT_TEACHER_BOOKING_CONFLICT') {
        toast.warning('Bạn đã có ca dạy trùng khung giờ của lớp này nên chưa nhận được. Hãy chọn lớp khác phù hợp hơn.')
        setConfirmingHunt(null)
        await refresh(true)
      } else if (reason === 'CLASS_HUNT_COMPENSATION_INVALID') {
        toast.warning('Đơn giá của lớp này cần được Admin kiểm tra lại trước khi nhận. Danh sách đã được cập nhật.')
        setConfirmingHunt(null)
        await refresh(true)
      } else if (['CLASS_HUNT_EXPIRED', 'CLASS_HUNT_NOT_OPEN', 'CLASS_HUNT_NOT_FOUND', 'CLASS_HUNT_SESSION_PASSED', 'CLASS_HUNT_SUBJECT_MISMATCH', 'CLASS_HUNT_STUDENT_BOOKING_CONFLICT', 'CLASS_HUNT_NOT_ENOUGH_POINTS'].includes(reason)) {
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

  const scheduleSlots = scheduleHunt?.slots || []
  const visibleSlots = showAllSlots ? scheduleSlots : scheduleSlots.slice(0, PREVIEW_SLOT_COUNT)
  const hiddenSlotCount = Math.max(0, scheduleSlots.length - PREVIEW_SLOT_COUNT)
  const scheduleTaken = Boolean(scheduleHunt && takenHunts[scheduleHunt.id])
  const confirmingPay = confirmingHunt ? huntPay(confirmingHunt) : null

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-3 pt-2 lg:pt-6">
      <header className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Target className="mt-1 h-8 w-8 shrink-0 text-rose-600" strokeWidth={2.25} />
            <div className="min-w-0">
              <h1 className="text-2xl font-black uppercase tracking-tight text-slate-950 sm:text-3xl">Lớp đang mở</h1>
              <p className="mt-1 text-sm text-slate-600 sm:text-base">Xem lịch học và nhận lớp phù hợp với bạn.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <label className="relative flex min-h-[46px] items-center rounded-xl border border-slate-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-amber-300">
              <span className="sr-only">Lọc theo tháng bắt đầu</span>
              <CalendarDays className="pointer-events-none absolute left-3.5 h-5 w-5 text-slate-600" />
              <select
                value={activeMonth}
                onChange={(event) => setMonthFilter(event.target.value)}
                className="h-full min-h-[46px] w-full cursor-pointer appearance-none rounded-xl bg-transparent pl-11 pr-10 text-sm font-bold text-slate-900 outline-none sm:w-52"
              >
                <option value={ALL_MONTHS}>Tất cả các tháng</option>
                {monthKeys.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 h-4 w-4 text-slate-600" />
            </label>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800" role="alert">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p>{error}</p>
            <button type="button" className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={() => void refresh()}>
              Thử lại
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <section className="space-y-3" role="status" aria-live="polite" aria-busy="true" aria-label="Đang tải lớp đang mở">
          {[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-slate-100" />)}
        </section>
      ) : cards.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Target className="h-8 w-8" />}
            title="Chưa có lớp đang mở"
            description="Hiện chưa có lớp nào đang chờ nhận. Lớp mới sẽ hiển thị tại đây ngay khi được đăng."
            action={{ label: 'Làm mới danh sách', onClick: () => void refresh() }}
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key} className="space-y-4" aria-labelledby={`class-hunt-month-${group.key}`}>
              <div className="flex items-center gap-4">
                <h2 id={`class-hunt-month-${group.key}`} className="whitespace-nowrap text-xl font-black uppercase tracking-tight text-slate-950 sm:text-2xl">
                  {monthLabel(group.key)}
                </h2>
                <span className="h-px flex-1 bg-slate-300" aria-hidden="true" />
              </div>

              {group.cards.map(({ hunt, taken }) => {
                const pay = huntPay(hunt)
                return (
                  <article
                    key={hunt.id}
                    className={`rounded-2xl border p-4 shadow-sm transition sm:p-5 ${taken ? 'border-slate-200 bg-slate-50' : 'border-rose-300 bg-white hover:shadow-md'}`}
                  >
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_minmax(0,15rem)] lg:items-stretch lg:gap-0">
                      <div className="min-w-0 lg:pr-6">
                        <div className="flex flex-wrap items-center gap-2">
                          {taken ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200/80 px-2.5 py-1 text-xs font-extrabold uppercase text-slate-600">
                              <CheckCircle2 className="h-3.5 w-3.5" />Đã có gia sư nhận
                            </span>
                          ) : (
                            <>
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-extrabold uppercase text-white">
                                <Flame className="h-3.5 w-3.5" />Lớp mới
                              </span>
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                <Clock3 className="h-3.5 w-3.5" />{expiryLabel(hunt.expiresAt)}
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className={`mt-3 break-words text-xl font-black sm:text-2xl ${taken ? 'text-slate-700' : 'text-slate-950'}`}>{hunt.subject.name}</h3>
                        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1.5"><Monitor className="h-4 w-4 text-slate-500" />Online</span>
                          <span className="text-slate-300" aria-hidden="true">•</span>
                          <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-slate-500" />1 học viên</span>
                          <span className="text-slate-300" aria-hidden="true">•</span>
                          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-slate-500" />{hunt.minutes} phút/buổi</span>
                        </p>
                        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-slate-500" />{hunt.sessionCount} buổi đã xếp lịch</span>
                          <span className="text-slate-300" aria-hidden="true">•</span>
                          <span>Bắt đầu {dayMonth(firstSlotDate(hunt))}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-3 border-t border-slate-100 pt-4 lg:border-l lg:border-t-0 lg:px-6 lg:pt-0">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${taken ? 'bg-amber-300' : 'bg-amber-400'} text-slate-900`}>
                          <DollarSign className="h-5 w-5" strokeWidth={2.5} />
                        </span>
                        {pay ? (
                          <div className="min-w-0">
                            <p className="text-xl font-black tabular-nums text-rose-600">
                              {formatAmount(pay.perLesson, pay.currency)}<span className="text-base font-extrabold">/buổi</span>
                            </p>
                            <p className="mt-0.5 text-sm tabular-nums text-slate-500">Tổng dự kiến: {formatAmount(pay.total, pay.currency)}</p>
                          </div>
                        ) : (
                          <p className="text-sm font-semibold leading-5 text-slate-600">Theo đơn giá môn và level của bạn</p>
                        )}
                      </div>

                      <div className="flex flex-col justify-center gap-2.5 border-t border-slate-100 pt-4 sm:flex-row lg:flex-col lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                        <button type="button" onClick={() => openSchedule(hunt)} className={OUTLINE_BUTTON}>
                          Xem lịch {hunt.sessionCount} buổi
                        </button>
                        {taken ? (
                          <button type="button" disabled className={TAKEN_BUTTON}>Đã có gia sư nhận</button>
                        ) : (
                          <button type="button" onClick={() => openConfirm(hunt)} disabled={Boolean(claimingId)} className={PRIMARY_BUTTON}>
                            {claimingId === hunt.id && <Loader2 className="h-4 w-4 animate-spin" />}
                            Nhận lớp
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </section>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(scheduleHunt)}
        onClose={() => setScheduleHunt(null)}
        title={scheduleHunt ? `Lịch học — ${scheduleHunt.subject.name}` : undefined}
        footer={scheduleHunt && (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setScheduleHunt(null)} className={OUTLINE_BUTTON} data-modal-initial-focus>
              Đóng
            </button>
            {scheduleTaken ? (
              <button type="button" disabled className={TAKEN_BUTTON}>Đã có gia sư nhận</button>
            ) : (
              <button type="button" onClick={() => openConfirm(scheduleHunt)} disabled={Boolean(claimingId)} className={PRIMARY_BUTTON}>
                Nhận lớp
              </button>
            )}
          </div>
        )}
      >
        {scheduleHunt && (
          <div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              <span>{scheduleHunt.sessionCount} buổi</span>
              <span className="text-slate-300" aria-hidden="true">•</span>
              <span>Bắt đầu {dayMonth(firstSlotDate(scheduleHunt))}</span>
              <span className="text-slate-300" aria-hidden="true">•</span>
              <span>{scheduleHunt.minutes} phút/buổi</span>
            </p>
            <ol className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Các buổi học">
              {visibleSlots.map((slot, index) => (
                <li key={`${slot.date}-${slot.start}`} className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-3 text-[13px] sm:gap-4 sm:px-4 sm:text-sm">
                  <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  <span className="font-bold text-slate-900">Buổi {index + 1}</span>
                  <span className="truncate text-slate-700">{WEEKDAY_LABELS[slot.weekday]}, {dayMonth(slot.date)}</span>
                  <span className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{slot.start} – {slot.end}</span>
                </li>
              ))}
            </ol>
            {hiddenSlotCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllSlots((value) => !value)}
                aria-expanded={showAllSlots}
                className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-800 transition hover:bg-slate-200"
              >
                {showAllSlots
                  ? <>Thu gọn<ChevronUp className="h-4 w-4" /></>
                  : <>Xem thêm {hiddenSlotCount} buổi<ChevronDown className="h-4 w-4" /></>}
              </button>
            )}
            <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-sky-50 px-4 py-3 text-sm leading-6 text-slate-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              Vui lòng kiểm tra kỹ toàn bộ lịch học trước khi nhận lớp.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(confirmingHunt)}
        onClose={closeConfirm}
        title="Xác nhận nhận lớp?"
        footer={confirmingHunt && (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={backToSchedule} disabled={Boolean(claimingId)} className={OUTLINE_BUTTON} data-modal-initial-focus>
              Quay lại kiểm tra
            </button>
            <button
              type="button"
              onClick={() => void handleClaim(confirmingHunt)}
              disabled={!agreed || Boolean(claimingId)}
              className={CONFIRM_BUTTON}
            >
              {claimingId === confirmingHunt.id && <Loader2 className="h-4 w-4 animate-spin" />}
              Xác nhận nhận lớp
            </button>
          </div>
        )}
      >
        {confirmingHunt && (
          <div>
            <p className="text-base leading-7 text-slate-700">
              Bạn đang nhận lớp <strong className="text-slate-950">{confirmingHunt.subject.name}</strong> gồm {confirmingHunt.sessionCount} buổi, bắt đầu từ ngày {dayMonth(firstSlotDate(confirmingHunt))}.
            </p>
            {confirmingPay && (
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Thù lao dự kiến {formatAmount(confirmingPay.perLesson, confirmingPay.currency)}/buổi, tổng {formatAmount(confirmingPay.total, confirmingPay.currency)}. {confirmingPay.basis}
              </p>
            )}
            <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="font-bold text-amber-900">Lưu ý quan trọng</p>
                <p className="mt-1 text-sm leading-6 text-amber-900/90">
                  Vui lòng kiểm tra kỹ và đảm bảo bạn có thể tham gia đầy đủ các buổi học. Sau khi xác nhận, bạn không thể tự hủy lớp. Trường hợp hủy lớp sẽ bị trừ phí theo quy định của Trung tâm.
                </p>
              </div>
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-800">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                disabled={Boolean(claimingId)}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-orange-600"
              />
              <span>Tôi đã kiểm tra lịch học, hiểu quy định hủy lớp và đồng ý nhận lớp.</span>
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
