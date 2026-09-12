import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  DollarSign,
  Flame,
  Info,
  Loader2,
  LogIn,
  Megaphone,
  Monitor,
  MousePointerClick,
  NotebookPen,
  RefreshCw,
  Target,
  Timer,
  UserCheck,
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
  classHuntErrorDetails,
  classHuntErrorReason,
  isClassHuntTaken,
  listTeacherClassHunts,
  type TeacherClassHunt,
} from '@/lib/classHunting'
import { describeClassHuntTeacherRequirements } from '@/lib/classHuntSchedule'
import type { DayOfWeek } from '@/types'

const POLL_INTERVAL_MS = 120_000
const PREVIEW_SLOT_COUNT = 5
const ALL_MONTHS = 'all'
const UNKNOWN_MONTH = 'unknown'
/** Pay is quoted per 25 minutes: every Class Hunting slot is one 25-minute lesson. */
const PAY_UNIT_MINUTES = 25
const ANNOUNCEMENT_STORAGE_KEY = 'teacher-class-hunting-announcement-2026-09'

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
const MINE_BUTTON = 'inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-white px-4 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2'

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
  per25Minutes: number
  total: number
  currency: string
  basis: string
}

/** Mirrors approval: a locked class rate is per minute without level; otherwise subject price x tutor level. */
function huntPay(hunt: TeacherClassHunt): HuntPay | null {
  if (hunt.classHuntCompensation) {
    const rate = hunt.classHuntCompensation.ratePerMinute
    return {
      per25Minutes: rate * PAY_UNIT_MINUTES,
      total: rate * hunt.minutes * hunt.sessionCount,
      currency: 'VND',
      basis: `Đơn giá lớp đã chốt ${formatAmount(rate)}/phút, không nhân level.`,
    }
  }
  if (hunt.subjectRate) {
    const rate = hunt.subjectRate
    const level = rate.teacherLevel && rate.teacherLevel > 0 ? rate.teacherLevel : 1
    return {
      per25Minutes: calculateSalary(PAY_UNIT_MINUTES, rate.pricePerMinute, level, rate.currency),
      total: calculateSalary(hunt.minutes * hunt.sessionCount, rate.pricePerMinute, level, rate.currency),
      currency: rate.currency,
      basis: `Tính theo đơn giá môn ${formatAmount(rate.pricePerMinute, rate.currency)}/phút x level ${level}; số tiền chính thức chốt khi buổi được duyệt.`,
    }
  }
  return null
}

function vietnamDateTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function expiryLabel(expiresAt?: string) {
  const formatted = vietnamDateTime(expiresAt)
  return formatted ? `Mở đến ${formatted}` : 'Nhận theo thứ tự xác nhận'
}

function claimedAtLabel(claimedAt?: string) {
  const formatted = vietnamDateTime(claimedAt)
  return formatted ? `Nhận lúc ${formatted}` : 'Vừa được nhận'
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

interface ClaimFailure {
  title: string
  message: string
  conflicts: Array<{ date: string; start: string; end: string }>
  /** The offer is gone for everyone; the list refreshes after closing. */
  refresh: boolean
}

/** Every rejected claim ends in a popup that says exactly why nothing was booked. */
function claimFailureFor(claimError: unknown): ClaimFailure {
  const details = classHuntErrorDetails(claimError)
  const reason = details.reason
  if (isClassHuntTaken(claimError)) {
    return { title: 'Lớp đã có gia sư khác nhận', message: 'Chậm một nhịp rồi! Lớp này vừa được giáo viên khác nhận. Mình săn lớp tiếp theo nha!', conflicts: [], refresh: true }
  }
  if (reason === 'CLASS_HUNT_TEACHER_BOOKING_CONFLICT') {
    return {
      title: 'Nhận lớp không thành công',
      message: 'Bạn đang có ca dạy trùng giờ với lớp này nên hệ thống chưa nhận lớp. Chưa có buổi nào được tạo.',
      conflicts: details.conflicts,
      refresh: false,
    }
  }
  if (reason === 'CLASS_HUNT_STUDENT_BOOKING_CONFLICT') {
    return {
      title: 'Nhận lớp không thành công',
      message: 'Học viên vừa có lịch trùng với một số buổi của lớp này. Giáo vụ cần điều chỉnh lịch trước khi lớp được nhận.',
      conflicts: details.conflicts,
      refresh: true,
    }
  }
  if (reason === 'CLASS_HUNT_TEACHER_GENDER_MISMATCH' || reason === 'CLASS_HUNT_TEACHER_TYPE_MISMATCH' || reason === 'CLASS_HUNT_TEACHER_TESTER') {
    return { title: 'Nhận lớp không thành công', message: details.message || 'Hồ sơ của bạn chưa phù hợp yêu cầu giáo viên của lớp này.', conflicts: [], refresh: false }
  }
  if (reason === 'CLASS_HUNT_NOT_ENOUGH_POINTS') {
    return {
      title: 'Nhận lớp không thành công',
      message: details.requiredPoints !== undefined && details.availablePoints !== undefined
        ? `Theo đơn giá kim cương của bạn, lớp cần ${details.requiredPoints} kim cương nhưng học viên chỉ còn ${details.availablePoints} kim cương khả dụng. Chưa có buổi nào được tạo.`
        : 'Quỹ kim cương của học viên không đủ cho lớp này theo đơn giá của bạn. Chưa có buổi nào được tạo.',
      conflicts: [],
      refresh: false,
    }
  }
  if (reason === 'CLASS_HUNT_CONTRACT_REQUIRED') {
    return { title: 'Nhận lớp không thành công', message: 'Bạn cần hoàn tất hợp đồng/điều khoản gia sư trước khi nhận lớp.', conflicts: [], refresh: false }
  }
  if (['CLASS_HUNT_EXPIRED', 'CLASS_HUNT_NOT_OPEN', 'CLASS_HUNT_NOT_FOUND', 'CLASS_HUNT_SESSION_PASSED', 'CLASS_HUNT_STUDENT_NOT_ELIGIBLE', 'CLASS_HUNT_SUBJECT_NOT_ELIGIBLE', 'CLASS_HUNT_COMPENSATION_INVALID'].includes(reason)) {
    return { title: 'Lớp không còn nhận được', message: details.message || 'Lớp này đã đóng hoặc không còn hợp lệ. Danh sách sẽ được cập nhật.', conflicts: [], refresh: true }
  }
  return {
    title: 'Nhận lớp không thành công',
    message: reason.startsWith('CLASS_HUNT_') && details.message ? details.message : 'Chưa nhận được lớp do lỗi kết nối. Hãy làm mới danh sách và thử lại.',
    conflicts: [],
    refresh: false,
  }
}

/** The operator's note (subject, level, learner needs), in red so it is read before claiming. */
function ClassNote({ note, compact = false }: { note?: string; compact?: boolean }) {
  if (!note) return null
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 ${compact ? 'px-3 py-2' : 'px-3.5 py-2.5'}`} role="note">
      <NotebookPen className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-rose-600">Lưu ý của lớp</p>
        <p className={`mt-0.5 whitespace-pre-line break-words font-bold text-rose-700 ${compact ? 'text-[13px] leading-5' : 'text-sm leading-6'}`}>{note}</p>
      </div>
    </div>
  )
}

/**
 * The teacher endpoint returns a deliberately sanitized offer. This page must
 * never fetch classHunts from Firestore, derive eligibility locally, or render
 * student details; eligibility and the first-claim transaction stay server-side.
 */
export function TeacherClassHuntingPage() {
  const navigate = useNavigate()
  const teacherId = useAuthStore((state) => state.teacherId)
  const [hunts, setHunts] = useState<TeacherClassHunt[]>([])
  // Offers claimed recently (server list, carries the claiming tutor's nickname).
  const [claimedHunts, setClaimedHunts] = useState<TeacherClassHunt[]>([])
  // Offers this tutor lost to a faster claim stay visible until the server list catches up.
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
  const [claimFailure, setClaimFailure] = useState<ClaimFailure | null>(null)
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
      const feed = await listTeacherClassHunts()
      if (!mountedRef.current) return
      // The callable already scopes this to the signed-in teacher. Keep this
      // defensive client filter so stale responses cannot show closed offers.
      setHunts(feed.open.filter((hunt) => hunt.status === 'open'))
      setClaimedHunts(feed.claimed)
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

  const takenList = useMemo(() => {
    const byId = new Map<string, TeacherClassHunt>()
    Object.values(takenHunts).forEach((hunt) => byId.set(hunt.id, hunt))
    // The server copy wins: it has the claim time and the tutor's nickname.
    claimedHunts.forEach((hunt) => byId.set(hunt.id, hunt))
    // Newest first; a claim lost in this session has no server time yet, so it leads.
    return [...byId.values()].sort((left, right) => (right.claimedAt || '9999').localeCompare(left.claimedAt || '9999'))
  }, [claimedHunts, takenHunts])
  const takenIds = useMemo(() => new Set(takenList.map((hunt) => hunt.id)), [takenList])
  const openHunts = useMemo(() => hunts.filter((hunt) => !takenIds.has(hunt.id)), [hunts, takenIds])

  const monthKeys = useMemo(() => Array.from(new Set([...openHunts, ...takenList].map(monthKeyOf)))
    .sort((left, right) => {
      if (left === UNKNOWN_MONTH) return 1
      if (right === UNKNOWN_MONTH) return -1
      return right.localeCompare(left)
    }), [openHunts, takenList])
  const activeMonth = monthKeys.includes(monthFilter) ? monthFilter : ALL_MONTHS
  const inActiveMonth = useCallback(
    (hunt: TeacherClassHunt) => activeMonth === ALL_MONTHS || monthKeyOf(hunt) === activeMonth,
    [activeMonth],
  )

  const groups = useMemo(() => monthKeys
    .filter((key) => activeMonth === ALL_MONTHS || key === activeMonth)
    .map((key) => ({
      key,
      hunts: openHunts
        .filter((hunt) => monthKeyOf(hunt) === key)
        .sort((left, right) => firstSlotDate(left).localeCompare(firstSlotDate(right))),
    }))
    .filter((group) => group.hunts.length > 0), [activeMonth, monthKeys, openHunts])
  const visibleTaken = useMemo(() => takenList.filter(inActiveMonth), [inActiveMonth, takenList])

  const markTaken = (hunt: TeacherClassHunt) => {
    setTakenHunts((current) => ({ ...current, [hunt.id]: { ...hunt, status: 'claimed' } }))
  }

  const openSchedule = (hunt: TeacherClassHunt) => {
    setShowAllSlots(false)
    setScheduleHunt(hunt)
  }

  const openConfirm = (hunt: TeacherClassHunt) => {
    if (claimingId || takenIds.has(hunt.id)) return
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
      setConfirmingHunt(null)
      if (outcome === 'taken') {
        markTaken(hunt)
        setClaimFailure({ title: 'Lớp đã có gia sư khác nhận', message: 'Chậm một nhịp rồi! Lớp này vừa được giáo viên khác nhận. Mình săn lớp tiếp theo nha!', conflicts: [], refresh: false })
      } else {
        toast.success('Nhận lớp thành công! Lớp đã được thêm vào lịch dạy của bạn.')
      }
      await refresh(true)
    } catch (claimError) {
      console.error('Claim class hunt failed:', claimError)
      const failure = claimFailureFor(claimError)
      if (isClassHuntTaken(claimError)) markTaken(hunt)
      // A retry with a fresh request id is safe after a definite rejection.
      delete requestIdsRef.current[hunt.id]
      setConfirmingHunt(null)
      setClaimFailure(failure)
      if (failure.refresh) await refresh(true)
    } finally {
      if (mountedRef.current) setClaimingId(null)
    }
  }

  const scheduleSlots = scheduleHunt?.slots || []
  const visibleSlots = showAllSlots ? scheduleSlots : scheduleSlots.slice(0, PREVIEW_SLOT_COUNT)
  const hiddenSlotCount = Math.max(0, scheduleSlots.length - PREVIEW_SLOT_COUNT)
  const scheduleTaken = Boolean(scheduleHunt && takenIds.has(scheduleHunt.id))
  const confirmingPay = confirmingHunt ? huntPay(confirmingHunt) : null

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-3 pt-2 lg:pt-6">
      <ClassHuntingAnnouncement />

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
        {!loading && (
          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" /><strong className="tabular-nums text-slate-900">{openHunts.length}</strong> lớp đang chờ nhận</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" /><strong className="tabular-nums text-slate-900">{takenList.length}</strong> lớp đã có gia sư nhận (7 ngày qua)</span>
          </p>
        )}
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
      ) : (
        <>
          {openHunts.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={<Target className="h-8 w-8" />}
                title="Chưa có lớp đang mở"
                description="Hiện chưa có lớp nào đang chờ nhận. Lớp mới sẽ hiển thị tại đây ngay khi được đăng."
                action={{ label: 'Làm mới danh sách', onClick: () => void refresh() }}
              />
            </Card>
          ) : groups.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={<CalendarDays className="h-8 w-8" />}
                title="Tháng này chưa có lớp đang mở"
                description="Các lớp đang mở bắt đầu ở tháng khác."
                action={{ label: 'Xem tất cả các tháng', onClick: () => setMonthFilter(ALL_MONTHS) }}
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

                  {group.hunts.map((hunt) => {
                    const pay = huntPay(hunt)
                    const requirement = describeClassHuntTeacherRequirements(hunt.teacherRequirements)
                    return (
                      <article key={hunt.id} className="rounded-2xl border border-rose-300 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_minmax(0,15rem)] lg:items-stretch lg:gap-0">
                          <div className="min-w-0 lg:pr-6">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-extrabold uppercase text-white">
                                <Flame className="h-3.5 w-3.5" />Lớp mới
                              </span>
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                <Clock3 className="h-3.5 w-3.5" />{expiryLabel(hunt.expiresAt)}
                              </span>
                            </div>
                            <h3 className="mt-3 break-words text-xl font-black text-slate-950 sm:text-2xl">{hunt.subject.name}</h3>
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
                            {requirement && (
                              <p className={`mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${hunt.requirementMatch === false ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800'}`}>
                                <UserCheck className="h-3.5 w-3.5" />
                                Yêu cầu: {requirement}
                                {hunt.requirementMatch === false && <span className="font-semibold">(hồ sơ của bạn chưa khớp)</span>}
                              </p>
                            )}
                            {hunt.note && <div className="mt-3"><ClassNote note={hunt.note} /></div>}
                          </div>

                          <div className="flex items-center gap-3 border-t border-slate-100 pt-4 lg:border-l lg:border-t-0 lg:px-6 lg:pt-0">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-900">
                              <DollarSign className="h-5 w-5" strokeWidth={2.5} />
                            </span>
                            {pay ? (
                              <div className="min-w-0">
                                <p className="text-xl font-black tabular-nums text-rose-600">
                                  {formatAmount(pay.per25Minutes, pay.currency)}<span className="whitespace-nowrap text-base font-extrabold">/{PAY_UNIT_MINUTES} phút</span>
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
                            <button type="button" onClick={() => openConfirm(hunt)} disabled={Boolean(claimingId)} className={PRIMARY_BUTTON}>
                              {claimingId === hunt.id && <Loader2 className="h-4 w-4 animate-spin" />}
                              Nhận lớp
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </section>
              ))}
            </div>
          )}

          {visibleTaken.length > 0 && (
            <section className="space-y-3" aria-labelledby="class-hunt-taken">
              <div className="flex items-center gap-4">
                <h2 id="class-hunt-taken" className="whitespace-nowrap text-lg font-black uppercase tracking-tight text-slate-700 sm:text-xl">
                  Lớp đã có gia sư nhận
                </h2>
                <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
              </div>
              <p className="text-sm leading-6 text-slate-500">
                Các lớp được nhận trong 7 ngày gần đây. Mỗi lớp chỉ dành cho một giáo viên nên các lớp này không còn nhận được nữa.
              </p>

              {visibleTaken.map((hunt) => {
                const mine = hunt.claimedByMe === true
                const requirement = describeClassHuntTeacherRequirements(hunt.teacherRequirements)
                const nickname = mine
                  ? (hunt.claimedTeacherCode ? `${hunt.claimedTeacherCode} (bạn)` : 'Bạn')
                  : hunt.claimedTeacherCode || 'Gia sư khác'
                return (
                  <article
                    key={hunt.id}
                    className={`rounded-2xl border p-4 sm:p-5 ${mine ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_minmax(0,15rem)] lg:items-stretch lg:gap-0">
                      <div className="min-w-0 lg:pr-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-extrabold uppercase ${mine ? 'bg-emerald-600 text-white' : 'bg-slate-200/80 text-slate-600'}`}>
                            <CheckCircle2 className="h-3.5 w-3.5" />{mine ? 'Bạn đã nhận lớp này' : 'Đã có gia sư nhận'}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-500 ring-1 ring-inset ring-slate-200">
                            <Clock3 className="h-3.5 w-3.5" />{claimedAtLabel(hunt.claimedAt)}
                          </span>
                        </div>
                        <h3 className="mt-3 break-words text-lg font-black text-slate-700 sm:text-xl">{hunt.subject.name}</h3>
                        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{hunt.minutes} phút/buổi</span>
                          <span className="text-slate-300" aria-hidden="true">•</span>
                          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{hunt.sessionCount} buổi</span>
                          <span className="text-slate-300" aria-hidden="true">•</span>
                          <span>Bắt đầu {dayMonth(firstSlotDate(hunt))}</span>
                        </p>
                        {requirement && (
                          <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-inset ring-slate-200">
                            <UserCheck className="h-3.5 w-3.5" />Yêu cầu: {requirement}
                          </p>
                        )}
                        {hunt.note && <div className="mt-3"><ClassNote note={hunt.note} compact /></div>}
                      </div>

                      <div className={`flex items-center gap-3 border-t pt-4 lg:border-l lg:border-t-0 lg:px-6 lg:pt-0 ${mine ? 'border-emerald-100' : 'border-slate-200'}`}>
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${mine ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                          <UserCheck className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Gia sư nhận lớp</p>
                          <p className="mt-0.5 break-words text-base font-black text-slate-800">{nickname}</p>
                        </div>
                      </div>

                      <div className={`flex flex-col justify-center gap-2.5 border-t pt-4 sm:flex-row lg:flex-col lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 ${mine ? 'border-emerald-100' : 'border-slate-200'}`}>
                        <button type="button" onClick={() => openSchedule(hunt)} className={OUTLINE_BUTTON}>
                          Xem lịch {hunt.sessionCount} buổi
                        </button>
                        {mine ? (
                          <button type="button" onClick={() => navigate('/teacher/schedules')} className={MINE_BUTTON}>
                            Xem lịch dạy của tôi
                          </button>
                        ) : (
                          <button type="button" disabled className={TAKEN_BUTTON}>Đã có gia sư nhận</button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </section>
          )}
        </>
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
              <button type="button" disabled className={TAKEN_BUTTON}>{scheduleHunt.claimedByMe ? 'Bạn đã nhận lớp' : 'Đã có gia sư nhận'}</button>
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
            {scheduleHunt.note && <div className="mb-4"><ClassNote note={scheduleHunt.note} /></div>}
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
              {scheduleTaken
                ? 'Lớp này đã có gia sư nhận nên không còn nhận được nữa.'
                : 'Vui lòng kiểm tra kỹ toàn bộ lịch học trước khi nhận lớp.'}
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
            {confirmingHunt.note && <div className="mb-4"><ClassNote note={confirmingHunt.note} /></div>}
            <p className="text-base leading-7 text-slate-700">
              Bạn đang nhận lớp <strong className="text-slate-950">{confirmingHunt.subject.name}</strong> gồm {confirmingHunt.sessionCount} buổi, bắt đầu từ ngày {dayMonth(firstSlotDate(confirmingHunt))}.
            </p>
            {confirmingPay && (
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Thù lao dự kiến {formatAmount(confirmingPay.per25Minutes, confirmingPay.currency)}/{PAY_UNIT_MINUTES} phút, tổng {formatAmount(confirmingPay.total, confirmingPay.currency)}. {confirmingPay.basis}
              </p>
            )}
            {describeClassHuntTeacherRequirements(confirmingHunt.teacherRequirements) && (
              <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-slate-600">
                <UserCheck className="mt-1 h-4 w-4 shrink-0 text-sky-600" />
                Lớp yêu cầu: {describeClassHuntTeacherRequirements(confirmingHunt.teacherRequirements)}. Hệ thống kiểm tra khi bạn xác nhận.
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
              <span>
                {confirmingHunt.note
                  ? 'Tôi đã đọc lưu ý của lớp, kiểm tra lịch học, hiểu quy định hủy lớp và đồng ý nhận lớp.'
                  : 'Tôi đã kiểm tra lịch học, hiểu quy định hủy lớp và đồng ý nhận lớp.'}
              </span>
            </label>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(claimFailure)}
        onClose={() => setClaimFailure(null)}
        title={claimFailure?.title}
        footer={(
          <button type="button" onClick={() => setClaimFailure(null)} className={OUTLINE_BUTTON} data-modal-initial-focus>
            Đã hiểu
          </button>
        )}
      >
        {claimFailure && (
          <div role="alert">
            <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <XCircle className="h-6 w-6 shrink-0 text-rose-500" />
              <p className="text-sm leading-6 text-rose-900">{claimFailure.message}</p>
            </div>
            {claimFailure.conflicts.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-bold text-slate-900">Các buổi bị trùng giờ</p>
                <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {claimFailure.conflicts.map((conflict) => (
                    <li key={`${conflict.date}-${conflict.start}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="text-slate-700">{dayMonth(conflict.date)}/{conflict.date.slice(0, 4)}</span>
                      <span className="font-semibold tabular-nums text-slate-900">{conflict.start}{conflict.end ? ` – ${conflict.end}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

const ANNOUNCEMENT_STEPS: Array<{ icon: typeof LogIn; text: ReactNode }> = [
  { icon: LogIn, text: 'Đăng nhập vào hệ thống LMS.' },
  { icon: Target, text: <>Truy cập mục <strong className="font-extrabold text-slate-900">Class Hunting</strong>.</> },
  { icon: ClipboardList, text: 'Xem kỹ thông tin lớp học, bao gồm môn học, trình độ, hình thức học, lịch học, địa điểm và mức học phí.' },
  { icon: MousePointerClick, text: <>Nếu lớp học phù hợp, chọn <strong className="font-extrabold text-slate-900">Nhận lớp</strong> để đăng ký.</> },
]

/** Center announcement for the Class Hunting page; collapsible and remembered per device. */
function ClassHuntingAnnouncement() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY) === 'collapsed' } catch { return false }
  })

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, next ? 'collapsed' : 'open') } catch { /* private mode */ }
  }

  return (
    <section aria-labelledby="class-hunting-announcement-title" className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-rose-600 via-rose-500 to-orange-500 px-4 py-3 text-white sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/30">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">Thông báo</p>
            <h2 id="class-hunting-announcement-title" className="text-[15px] font-black uppercase leading-tight tracking-tight sm:text-lg">
              Cập nhật tính năng Class Hunting
            </h2>
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls="class-hunting-announcement-body"
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-xs font-bold ring-1 ring-inset ring-white/30 transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {collapsed ? <>Xem<ChevronDown className="h-4 w-4" /></> : <>Thu gọn<ChevronUp className="h-4 w-4" /></>}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div id="class-hunting-announcement-body" className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
          <p className="text-sm leading-6 text-slate-700">
            Nhằm giúp giáo viên chủ động tìm kiếm và nhận lớp thuận tiện hơn, từ nay trung tâm sẽ cập nhật các lớp mới tại mục <strong className="font-extrabold text-slate-900">Class Hunting</strong> trên hệ thống LMS.
          </p>

          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Quy trình nhận lớp</p>
            {/* Phones: a tight numbered list so the classes stay near the top. */}
            <ol className="mt-2.5 grid gap-2 sm:grid-cols-2 sm:gap-2.5 lg:grid-cols-4">
              {ANNOUNCEMENT_STEPS.map((step, index) => {
                const StepIcon = step.icon
                return (
                  <li key={index} className="flex items-start gap-2.5 sm:gap-3 sm:rounded-xl sm:border sm:border-slate-200 sm:bg-slate-50/70 sm:p-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[11px] font-black tabular-nums text-white sm:h-7 sm:w-7 sm:text-xs">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <StepIcon className="hidden h-4 w-4 text-rose-600 sm:block" aria-hidden="true" />
                      <p className="text-[13px] leading-5 text-slate-700 sm:mt-1">{step.text}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
            <Timer className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <p className="text-[13px] leading-6 text-amber-950">
              Thầy cô có nhu cầu vui lòng thường xuyên kiểm tra Class Hunting và nhanh tay nhận lớp phù hợp với lịch trình của mình. <strong className="font-extrabold">Mỗi lớp chỉ dành cho một giáo viên.</strong> Vì vậy, thầy cô nào xác nhận nhận lớp trước sẽ được ưu tiên; sau khi lớp đã có giáo viên nhận thành công, lớp sẽ không còn hiển thị để nhận nữa.
            </p>
          </div>

          <p className="text-right text-[13px] leading-5 text-slate-600">
            Trân trọng,
            <span className="block font-extrabold text-slate-900">Trung tâm 123English</span>
          </p>
        </div>
      )}
    </section>
  )
}
