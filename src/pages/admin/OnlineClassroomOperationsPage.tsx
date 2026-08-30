import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity,
  AlertCircle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileVideo2,
  GraduationCap,
  History,
  Link2,
  MonitorUp,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSpinner'
import {
  classroomRoute,
  issueOnlineClassroomInvite,
  onlineClassroomErrorMessage,
} from '@/lib/onlineClassroom'
import {
  extendOnlineClassroomSession,
  getOnlineClassroomOperations,
  onlineClassroomOperationsErrorMessage,
  type OnlineClassroomOperationRow,
} from '@/lib/onlineClassroomOperations'
import {
  getOnlineClassroomRecordingsForBookings,
  onlineClassroomRecordingErrorMessage,
  type OnlineClassroomRecordingSummary,
} from '@/lib/onlineClassroomRecording'
import { getVietnamDateISO } from '@/lib/constants'
import { copyTextToClipboard } from '@/lib/lessonShare'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'

type OperationTab = 'upcoming' | 'live' | 'history'

const DAY_MS = 86_400_000
const JOIN_EARLY_MS = 12 * 60 * 60 * 1_000
const MAX_RANGE_DAYS = 31
const RECORDING_BATCH_SIZE = 100

const DATE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
})

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Ho_Chi_Minh',
})

const TABS: Array<{ key: OperationTab; label: string; icon: typeof CalendarDays }> = [
  { key: 'upcoming', label: 'Sắp tới', icon: CalendarDays },
  { key: 'live', label: 'Đang học', icon: Radio },
  { key: 'history', label: 'Lịch sử', icon: History },
]

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function shiftIsoDate(value: string, days: number): string {
  const dateMs = Date.parse(`${value}T00:00:00.000Z`)
  return new Date(dateMs + days * DAY_MS).toISOString().slice(0, 10)
}

function initialDateRange(): { fromDate: string; toDate: string } {
  const today = getVietnamDateISO()
  return {
    fromDate: shiftIsoDate(today, -7),
    toDate: shiftIsoDate(today, 14),
  }
}

function validateDateRange(fromDate: string, toDate: string): string {
  if (!isValidIsoDate(fromDate) || !isValidIsoDate(toDate)) {
    return 'Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc.'
  }
  const rangeDays = Math.floor(
    (Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / DAY_MS,
  ) + 1
  if (rangeDays < 1) return 'Ngày kết thúc không được sớm hơn ngày bắt đầu.'
  if (rangeDays > MAX_RANGE_DAYS) return `Mỗi lần chỉ xem tối đa ${MAX_RANGE_DAYS} ngày, tính cả hai đầu.`
  return ''
}

function bookingStartMs(row: OnlineClassroomOperationRow): number | null {
  if (!isValidIsoDate(row.requestedDate)) return null
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(row.requestedStart)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || hours < 0 || hours > 25) return null
  const midnightMs = Date.parse(`${row.requestedDate}T00:00:00+07:00`)
  return Number.isFinite(midnightMs) ? midnightMs + (hours * 60 + minutes) * 60_000 : null
}

function timestampMs(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function operationTab(row: OnlineClassroomOperationRow, nowMs: number): OperationTab {
  const backendStatus = row.status?.toLowerCase()
  if (backendStatus === 'ended' || backendStatus === 'unavailable') return 'history'

  const startMs = bookingStartMs(row)
  const hardEndMs = timestampMs(row.hardEndsAt)
  if (startMs !== null && nowMs < startMs) return 'upcoming'
  if (startMs !== null && hardEndMs !== null && nowMs >= startMs && nowMs < hardEndMs) return 'live'
  if (startMs !== null && hardEndMs !== null && nowMs >= hardEndMs) return 'history'

  if (backendStatus === 'upcoming') return 'upcoming'
  if (backendStatus === 'live' || backendStatus === 'active') return 'live'
  return 'history'
}

function formatBookingDate(value: string): string {
  if (!isValidIsoDate(value)) return 'Chưa có ngày'
  return DATE_FORMATTER.format(new Date(`${value}T12:00:00+07:00`))
}

function formatTimestamp(value: string | null): string {
  const parsed = timestampMs(value)
  return parsed === null ? 'Chưa ghi nhận' : DATE_TIME_FORMATTER.format(new Date(parsed))
}

function formatLate(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  if (safeSeconds < 60) return 'Đúng giờ'
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return remainder > 0 ? `Trễ ${minutes} phút ${remainder} giây` : `Trễ ${minutes} phút`
}

function foldText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('vi')
}

async function loadRecordings(bookingIds: string[]) {
  const batches: string[][] = []
  for (let index = 0; index < bookingIds.length; index += RECORDING_BATCH_SIZE) {
    batches.push(bookingIds.slice(index, index + RECORDING_BATCH_SIZE))
  }
  const results = await Promise.all(batches.map((batch) => getOnlineClassroomRecordingsForBookings(batch)))
  return Object.assign({}, ...results) as Record<string, OnlineClassroomRecordingSummary>
}

function tabMeta(tab: OperationTab): { label: string; badge: string } {
  if (tab === 'live') return { label: 'Đang trong khung giờ học', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
  if (tab === 'upcoming') return { label: 'Sắp tới', badge: 'border-sky-200 bg-sky-50 text-sky-700' }
  return { label: 'Đã kết thúc', badge: 'border-slate-200 bg-slate-100 text-slate-600' }
}

function sessionStatusLabel(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === 'active' || normalized === 'live') return 'Webhook đang ghi nhận'
  if (normalized === 'ended' || normalized === 'completed') return 'Webhook đã kết thúc'
  if (normalized === 'upcoming' || normalized === 'scheduled') return 'Chưa đến giờ'
  return status || 'Chưa rõ trạng thái'
}

function ParticipantHistory({
  label,
  firstJoinedAt,
  lastLeftAt,
  joinCount,
}: {
  label: string
  firstJoinedAt: string | null
  lastLeftAt: string | null
  joinCount: number
}) {
  const hasEvent = Boolean(firstJoinedAt || lastLeftAt || joinCount > 0)
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
      <p className="text-[11px] font-black text-slate-700">{label}</p>
      {hasEvent ? (
        <div className="mt-1 space-y-0.5 text-[11px] font-medium leading-4 text-slate-500">
          <p>Vào đầu: {formatTimestamp(firstJoinedAt)}</p>
          <p>Ra gần nhất: {formatTimestamp(lastLeftAt)}</p>
          <p>Số lượt vào: {Math.max(0, joinCount || 0)}</p>
        </div>
      ) : (
        <p className="mt-1 text-[11px] font-medium text-slate-500">Chưa có lượt vào từ webhook.</p>
      )}
    </div>
  )
}

function SessionHistory({ row }: { row: OnlineClassroomOperationRow }) {
  if (!row.session) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 px-2.5 py-2 text-[11px] font-semibold leading-4 text-slate-500">
        Chưa có dữ liệu webhook.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-slate-500">{sessionStatusLabel(row.session.status)}</p>
      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
        <ParticipantHistory
          label="Giáo viên"
          firstJoinedAt={row.session.teacherFirstJoinedAt}
          lastLeftAt={row.session.teacherLastLeftAt}
          joinCount={row.session.teacherJoinCount}
        />
        <ParticipantHistory
          label="Học viên"
          firstJoinedAt={row.session.studentFirstJoinedAt}
          lastLeftAt={row.session.studentLastLeftAt}
          joinCount={row.session.studentJoinCount}
        />
      </div>
      {row.session.teacherFirstJoinedAt && (
        <p className={`text-[11px] font-bold ${row.session.teacherLateSeconds >= 60 ? 'text-amber-700' : 'text-emerald-700'}`}>
          Giáo viên: {formatLate(row.session.teacherLateSeconds)}
        </p>
      )}
    </div>
  )
}

function RoomSummary({ row }: { row: OnlineClassroomOperationRow }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap gap-1.5">
        <span className={`rounded-lg border px-2 py-1 font-bold ${row.roomCreated ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
          {row.roomCreated ? 'Đã tạo phòng' : 'Chưa tạo phòng'}
        </span>
        <span className={`rounded-lg border px-2 py-1 font-bold ${row.pilotEnabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          {row.pilotEnabled ? 'Pilot đã bật' : 'Pilot chưa bật'}
        </span>
      </div>
      <div className="font-medium leading-5 text-slate-500">
        <p>Kết thúc lịch: {formatTimestamp(row.scheduledEndsAt)}</p>
        <p>Kết thúc cứng: {formatTimestamp(row.hardEndsAt)}</p>
      </div>
      {row.extensionMinutes > 0 ? (
        <p className="font-bold text-amber-700">Đã dùng quyền gia hạn +{row.extensionMinutes} phút.</p>
      ) : row.extensionAvailable ? (
        <p className="font-bold text-indigo-700">Còn một quyền gia hạn +10 phút.</p>
      ) : null}
      {!row.eligible && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 font-semibold leading-5 text-amber-800">
          {row.blockReason || 'Buổi học chưa đủ điều kiện mở phòng.'}
        </p>
      )}
    </div>
  )
}

function OperationActions({
  row,
  bucket,
  nowMs,
  recording,
  issuedLink,
  issuing,
  extending,
  actionsLocked,
  onIssueInvite,
  onExtend,
}: {
  row: OnlineClassroomOperationRow
  bucket: OperationTab
  nowMs: number
  recording?: OnlineClassroomRecordingSummary
  issuedLink?: string
  issuing: boolean
  extending: boolean
  actionsLocked: boolean
  onIssueInvite: (row: OnlineClassroomOperationRow) => void
  onExtend: (row: OnlineClassroomOperationRow) => void
}) {
  const startMs = bookingStartMs(row)
  const hardEndMs = timestampMs(row.hardEndsAt)
  const opensAt = startMs === null ? null : startMs - JOIN_EARLY_MS
  const canIssueInvite = row.eligible && bucket !== 'history'
  const canOpenAdmin = row.eligible
    && opensAt !== null
    && hardEndMs !== null
    && nowMs >= opensAt
    && nowMs < hardEndMs
  const canExtend = row.eligible
    && row.roomCreated
    && row.extensionAvailable
    && bucket === 'live'
  const openAdminHint = !row.eligible
    ? row.blockReason || 'Buổi học chưa đủ điều kiện.'
    : bucket === 'history'
      ? 'Buổi học đã kết thúc.'
      : opensAt !== null && nowMs < opensAt
        ? 'Phòng Admin mở trước giờ học 12 tiếng.'
        : 'Phòng chưa ở trong khung giờ truy cập.'
  const extensionHint = row.extensionMinutes > 0
    ? 'Buổi học đã dùng quyền gia hạn một lần.'
    : !row.roomCreated
      ? 'Cần tạo phòng trước khi gia hạn.'
      : bucket !== 'live'
        ? 'Chỉ gia hạn khi buổi học đang diễn ra.'
        : 'Buổi học không còn quyền gia hạn.'

  return (
    <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="whitespace-nowrap"
        loading={issuing}
        disabled={!canIssueInvite || actionsLocked}
        title={!canIssueInvite ? row.blockReason || 'Không thể tạo link cho buổi học đã kết thúc.' : undefined}
        onClick={() => onIssueInvite(row)}
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
        {issuedLink ? 'Sao chép lại' : 'Tạo + sao chép link'}
      </Button>

      {canOpenAdmin ? (
        <a
          href={classroomRoute(row.bookingId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 px-3 text-sm font-bold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 active:scale-[0.98]"
          aria-label={`Mở phòng Admin cho ${row.studentName || row.studentCode || 'học viên'}`}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Mở phòng Admin
        </a>
      ) : (
        <Button type="button" size="sm" variant="secondary" disabled title={openAdminHint} className="whitespace-nowrap">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Mở phòng Admin
        </Button>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="whitespace-nowrap border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
        loading={extending}
        disabled={!canExtend || actionsLocked}
        title={!canExtend ? extensionHint : 'Gia hạn buổi học thêm 10 phút. Chỉ dùng được một lần.'}
        onClick={() => onExtend(row)}
      >
        <Clock3 className="h-4 w-4" aria-hidden="true" />
        {row.extensionMinutes > 0 ? `Đã gia hạn +${row.extensionMinutes}` : 'Gia hạn +10 phút'}
      </Button>

      {recording?.viewUrl && (
        <a
          href={recording.viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 active:scale-[0.98]"
          aria-label={`Mở bản xem lại buổi học của ${row.studentName || row.studentCode || 'học viên'}`}
        >
          <FileVideo2 className="h-4 w-4" aria-hidden="true" />
          Mở bản xem lại
        </a>
      )}
    </div>
  )
}

export function OnlineClassroomOperationsPage() {
  const role = useAuthStore((state) => state.role)
  const [defaultRange] = useState(() => initialDateRange())
  const [draftFromDate, setDraftFromDate] = useState(defaultRange.fromDate)
  const [draftToDate, setDraftToDate] = useState(defaultRange.toDate)
  const [appliedRange, setAppliedRange] = useState(defaultRange)
  const [dateError, setDateError] = useState('')
  const [activeTab, setActiveTab] = useState<OperationTab>('upcoming')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<OnlineClassroomOperationRow[]>([])
  const [recordings, setRecordings] = useState<Record<string, OnlineClassroomRecordingSummary>>({})
  const [loading, setLoading] = useState(true)
  const [recordingsLoading, setRecordingsLoading] = useState(false)
  const [error, setError] = useState('')
  const [recordingError, setRecordingError] = useState('')
  const [truncated, setTruncated] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [serverOffsetMs, setServerOffsetMs] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [issuingBookingId, setIssuingBookingId] = useState('')
  const [extendingBookingId, setExtendingBookingId] = useState('')
  const [extensionCandidate, setExtensionCandidate] = useState<OnlineClassroomOperationRow | null>(null)
  const [issuedLinks, setIssuedLinks] = useState<Record<string, string>>({})

  useEffect(() => {
    if (role !== 'admin') return
    const timer = window.setInterval(() => setNowMs(Date.now() + serverOffsetMs), 30_000)
    return () => window.clearInterval(timer)
  }, [role, serverOffsetMs])

  useEffect(() => {
    if (role !== 'admin') return
    let active = true

    const load = async () => {
      setLoading(true)
      setError('')
      setRecordingError('')
      setRecordingsLoading(false)
      setIssuedLinks({})
      try {
        const result = await getOnlineClassroomOperations(appliedRange)
        if (!active) return
        const serverTimeMs = Date.parse(result.serverNow)
        if (Number.isFinite(serverTimeMs)) {
          setServerOffsetMs(serverTimeMs - Date.now())
          setNowMs(serverTimeMs)
        }
        setRows(result.rows)
        setTruncated(result.truncated === true)
        setLoading(false)

        const bookingIds = [...new Set(result.rows.map((row) => row.bookingId).filter(Boolean))]
        if (bookingIds.length === 0) {
          setRecordings({})
          return
        }

        setRecordingsLoading(true)
        try {
          const recordingRows = await loadRecordings(bookingIds)
          if (active) setRecordings(recordingRows)
        } catch (recordingLoadError) {
          if (!active) return
          setRecordings({})
          setRecordingError(onlineClassroomRecordingErrorMessage(recordingLoadError))
        } finally {
          if (active) setRecordingsLoading(false)
        }
      } catch (loadError) {
        if (!active) return
        setRows([])
        setRecordings({})
        setTruncated(false)
        setError(onlineClassroomOperationsErrorMessage(loadError))
        setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [appliedRange, refreshVersion, role])

  const counts = useMemo(() => {
    const next = { upcoming: 0, live: 0, history: 0 }
    rows.forEach((row) => {
      next[operationTab(row, nowMs)] += 1
    })
    return next
  }, [nowMs, rows])

  const visibleRows = useMemo(() => {
    const query = foldText(search.trim())
    const filtered = rows.filter((row) => {
      if (operationTab(row, nowMs) !== activeTab) return false
      if (!query) return true
      return [
        row.studentName,
        row.studentCode,
        row.teacherName,
        row.teacherCode,
        row.subjectName,
        row.bookingId,
      ].some((value) => foldText(value || '').includes(query))
    })
    return [...filtered].sort((left, right) => {
      const comparison = `${left.requestedDate}T${left.requestedStart}`
        .localeCompare(`${right.requestedDate}T${right.requestedStart}`)
      return activeTab === 'history' ? -comparison : comparison
    })
  }, [activeTab, nowMs, rows, search])

  const eligibleCount = useMemo(() => rows.filter((row) => row.eligible).length, [rows])
  const actionsLocked = Boolean(issuingBookingId || extendingBookingId)

  const applyDateRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationError = validateDateRange(draftFromDate, draftToDate)
    setDateError(validationError)
    if (validationError) return
    const nextRange = { fromDate: draftFromDate, toDate: draftToDate }
    if (nextRange.fromDate === appliedRange.fromDate && nextRange.toDate === appliedRange.toDate) {
      setRefreshVersion((current) => current + 1)
    } else {
      setAppliedRange(nextRange)
      setIssuedLinks({})
    }
  }

  const issueInvite = async (row: OnlineClassroomOperationRow) => {
    setIssuingBookingId(row.bookingId)
    try {
      const existingLink = issuedLinks[row.bookingId]
      const joinUrl = existingLink || await issueOnlineClassroomInvite(row.bookingId)
      if (!existingLink) {
        setIssuedLinks((current) => ({ ...current, [row.bookingId]: joinUrl }))
        setRows((current) => current.map((item) => (
          item.bookingId === row.bookingId ? { ...item, roomCreated: true } : item
        )))
      }
      const copied = await copyTextToClipboard(joinUrl)
      if (copied) {
        toast.success(existingLink
          ? 'Đã sao chép lại link học viên.'
          : 'Đã tạo và sao chép link học viên. Link chỉ dùng cho đúng buổi học này.')
      } else {
        setIssuedLinks((current) => ({ ...current, [row.bookingId]: joinUrl }))
        toast.warning('Link đã được tạo nhưng trình duyệt chưa cho phép sao chép. Hãy bấm lại để thử lần nữa.')
      }
    } catch (inviteError) {
      toast.error(onlineClassroomErrorMessage(inviteError))
    } finally {
      setIssuingBookingId('')
    }
  }

  const extendSession = async () => {
    const row = extensionCandidate
    if (!row) return
    setExtendingBookingId(row.bookingId)
    try {
      const result = await extendOnlineClassroomSession({ bookingId: row.bookingId, minutes: 10 })
      const serverTimeMs = Date.parse(result.serverNow)
      if (Number.isFinite(serverTimeMs)) {
        setServerOffsetMs(serverTimeMs - Date.now())
        setNowMs(serverTimeMs)
      }
      setRows((current) => current.map((item) => (
        item.bookingId === row.bookingId
          ? {
              ...item,
              extensionMinutes: result.extensionMinutes,
              extensionAvailable: result.extensionAvailable,
              scheduledEndsAt: result.scheduledEndsAt,
              hardEndsAt: result.hardEndsAt,
            }
          : item
      )))
      toast.success(`Đã gia hạn buổi học thêm ${result.extensionMinutes} phút.`)
    } catch (extensionError) {
      toast.error(onlineClassroomOperationsErrorMessage(extensionError))
      setRefreshVersion((current) => current + 1)
    } finally {
      setExtendingBookingId('')
      setExtensionCandidate(null)
    }
  }

  if (role !== 'admin') {
    return (
      <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center" role="alert">
        <ShieldCheck className="mx-auto h-9 w-9 text-amber-700" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-bold text-slate-900">Chỉ Admin hệ thống được vận hành lớp trực tuyến</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Quản lý học viên và quản lý gia sư không có quyền xem link phòng, lịch sử webhook hoặc bản ghi.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5 pt-2 lg:pt-6" aria-busy={loading}>
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Video className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">Vận hành lớp học trực tuyến</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Theo dõi lớp 1 kèm 1, chuẩn bị link học viên, mở phòng quan sát và xử lý gia hạn trong một màn hình.
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400" aria-live="polite">
              Giờ hệ thống: {DATE_TIME_FORMATTER.format(new Date(nowMs))}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          loading={loading}
          disabled={actionsLocked}
          onClick={() => setRefreshVersion((current) => current + 1)}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Làm mới dữ liệu
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tổng quan lớp trực tuyến">
        <Card padding="sm" className="shadow-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-500">Trong khoảng ngày</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{rows.length}</p>
            </div>
            <CalendarDays className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          </div>
        </Card>
        <Card padding="sm" className="shadow-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-500">Đang trong giờ học</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-emerald-700">{counts.live}</p>
            </div>
            <Radio className="h-6 w-6 text-emerald-600" aria-hidden="true" />
          </div>
        </Card>
        <Card padding="sm" className="shadow-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-500">Đủ điều kiện</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-indigo-700">{eligibleCount}</p>
            </div>
            <CheckCircle2 className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          </div>
        </Card>
        <Card padding="sm" className="shadow-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-500">Có bản xem lại</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-800">{Object.keys(recordings).length}</p>
            </div>
            <FileVideo2 className="h-6 w-6 text-slate-600" aria-hidden="true" />
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">
          <MonitorUp className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" aria-hidden="true" />
          <div>
            <p className="font-black">Điều kiện auto record miễn phí</p>
            <p className="mt-0.5 text-indigo-800">
              Giáo viên cần chọn đúng tab cần ghi và học viên phải bấm đồng ý. Thiếu một trong hai bước thì hệ thống không tạo bản xem lại.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <Activity className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" aria-hidden="true" />
          <div>
            <p className="font-black text-slate-900">Giới hạn dữ liệu vào và ra</p>
            <p className="mt-0.5">
              Lịch sử chỉ hiển thị sự kiện webhook backend đã nhận. Dòng trống không đủ để kết luận giáo viên hoặc học viên vắng mặt.
            </p>
          </div>
        </div>
      </div>

      <Card className="shadow-none">
        <form className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end" onSubmit={applyDateRange}>
          <div>
            <label htmlFor="online-classroom-from-date" className="mb-1.5 block text-sm font-bold text-slate-700">
              Từ ngày
            </label>
            <input
              id="online-classroom-from-date"
              type="date"
              value={draftFromDate}
              max={draftToDate || undefined}
              onChange={(event) => {
                setDraftFromDate(event.target.value)
                setDateError('')
              }}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="online-classroom-to-date" className="mb-1.5 block text-sm font-bold text-slate-700">
              Đến ngày
            </label>
            <input
              id="online-classroom-to-date"
              type="date"
              value={draftToDate}
              min={draftFromDate || undefined}
              max={isValidIsoDate(draftFromDate) ? shiftIsoDate(draftFromDate, MAX_RANGE_DAYS - 1) : undefined}
              onChange={(event) => {
                setDraftToDate(event.target.value)
                setDateError('')
              }}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <Button type="submit" disabled={actionsLocked}>
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Xem khoảng ngày
          </Button>
        </form>
        <div className="mt-2 flex flex-col gap-1 text-xs font-medium text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Tối đa {MAX_RANGE_DAYS} ngày cho mỗi lần tải.</p>
          <p>Đang xem {formatBookingDate(appliedRange.fromDate)} đến {formatBookingDate(appliedRange.toDate)}</p>
        </div>
        {dateError && <p className="mt-2 text-sm font-bold text-rose-700" role="alert">{dateError}</p>}
      </Card>

      {truncated && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800" role="status">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Danh sách đã chạm giới hạn backend. Hãy thu hẹp khoảng ngày để không bỏ sót buổi học.
        </div>
      )}

      {recordingError && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800" role="status">
          <FileVideo2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Không tải được danh sách bản xem lại: {recordingError}
        </div>
      )}

      {error ? (
        <Card className="border-rose-200 bg-rose-50 shadow-none">
          <div className="flex flex-col items-center px-4 py-8 text-center" role="alert">
            <AlertCircle className="h-9 w-9 text-rose-600" aria-hidden="true" />
            <h2 className="mt-3 text-base font-black text-slate-900">Không tải được dữ liệu lớp trực tuyến</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-rose-700">{error}</p>
            <Button type="button" variant="outline" className="mt-4" onClick={() => setRefreshVersion((current) => current + 1)}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Thử lại
            </Button>
          </div>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden shadow-none">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Lọc theo trạng thái buổi học">
                {TABS.map((tab) => {
                  const Icon = tab.icon
                  const selected = activeTab === tab.key
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveTab(tab.key)}
                      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${selected ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {tab.label}
                      <span className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {counts[tab.key]}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="relative w-full xl:max-w-sm">
                <label htmlFor="online-classroom-search" className="sr-only">Tìm lớp trực tuyến</label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="online-classroom-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tên, mã, môn học hoặc booking..."
                  className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            {recordingsLoading && (
              <p className="mt-2 text-xs font-semibold text-slate-500" aria-live="polite">Đang kiểm tra bản xem lại...</p>
            )}
          </div>

          {loading ? (
            <div aria-live="polite" aria-label="Đang tải danh sách lớp trực tuyến">
              <TableSkeleton rows={6} cols={6} />
            </div>
          ) : visibleRows.length === 0 ? (
            <EmptyState
              icon={activeTab === 'live' ? <Radio className="h-8 w-8" /> : <CalendarDays className="h-8 w-8" />}
              title={search ? 'Không tìm thấy buổi học phù hợp' : `Chưa có lớp trong mục ${TABS.find((tab) => tab.key === activeTab)?.label || ''}`}
              description={search
                ? 'Thử tên, mã học viên, mã giáo viên hoặc môn học khác.'
                : 'Đổi khoảng ngày hoặc chọn tab khác để xem dữ liệu.'}
            />
          ) : (
            <>
              <div className="hidden 2xl:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1180px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th scope="col" className="w-[17%] px-4 py-3 text-xs font-black text-slate-600">Buổi học</th>
                        <th scope="col" className="w-[13%] px-4 py-3 text-xs font-black text-slate-600">Học viên</th>
                        <th scope="col" className="w-[13%] px-4 py-3 text-xs font-black text-slate-600">Giáo viên</th>
                        <th scope="col" className="w-[19%] px-4 py-3 text-xs font-black text-slate-600">Phòng và thời gian</th>
                        <th scope="col" className="w-[20%] px-4 py-3 text-xs font-black text-slate-600">Lịch sử webhook</th>
                        <th scope="col" className="w-[18%] px-4 py-3 text-xs font-black text-slate-600">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {visibleRows.map((row) => {
                        const bucket = operationTab(row, nowMs)
                        const meta = tabMeta(bucket)
                        return (
                          <tr key={row.bookingId} className="align-top transition-colors hover:bg-slate-50/70">
                            <td className="px-4 py-4">
                              <span className={`inline-flex rounded-lg border px-2 py-1 text-[11px] font-black ${meta.badge}`}>{meta.label}</span>
                              <p className="mt-2 font-black text-slate-900">{row.subjectName || 'Lớp học 1 kèm 1'}</p>
                              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                                {formatBookingDate(row.requestedDate)}<br />
                                {row.requestedStart || '--:--'} - {row.requestedEnd || '--:--'}
                              </p>
                              <p className="mt-1 break-all font-mono text-[10px] text-slate-400">{row.bookingId}</p>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-start gap-2">
                                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-800">{row.studentName || 'Chưa có tên'}</p>
                                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{row.studentCode || 'Chưa có mã'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-start gap-2">
                                <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-800">{row.teacherName || 'Chưa xếp giáo viên'}</p>
                                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{row.teacherCode || 'Chưa có mã'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4"><RoomSummary row={row} /></td>
                            <td className="px-4 py-4"><SessionHistory row={row} /></td>
                            <td className="px-4 py-4">
                              <OperationActions
                                row={row}
                                bucket={bucket}
                                nowMs={nowMs}
                                recording={recordings[row.bookingId]}
                                issuedLink={issuedLinks[row.bookingId]}
                                issuing={issuingBookingId === row.bookingId}
                                extending={extendingBookingId === row.bookingId}
                                actionsLocked={actionsLocked}
                                onIssueInvite={issueInvite}
                                onExtend={setExtensionCandidate}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-3 p-3 sm:p-4 2xl:hidden">
                {visibleRows.map((row) => {
                  const bucket = operationTab(row, nowMs)
                  const meta = tabMeta(bucket)
                  return (
                    <article key={row.bookingId} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <span className={`inline-flex rounded-lg border px-2 py-1 text-[11px] font-black ${meta.badge}`}>{meta.label}</span>
                          <h2 className="mt-2 text-base font-black text-slate-900">{row.subjectName || 'Lớp học 1 kèm 1'}</h2>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {formatBookingDate(row.requestedDate)}, {row.requestedStart || '--:--'} - {row.requestedEnd || '--:--'}
                          </p>
                        </div>
                        <p className="break-all font-mono text-[10px] text-slate-400">{row.bookingId}</p>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="flex items-center gap-2 text-xs font-black text-slate-500">
                            <UserRound className="h-4 w-4" aria-hidden="true" /> Học viên
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-900">{row.studentName || 'Chưa có tên'}</p>
                          <p className="text-xs font-semibold text-slate-500">{row.studentCode || 'Chưa có mã'}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="flex items-center gap-2 text-xs font-black text-slate-500">
                            <GraduationCap className="h-4 w-4" aria-hidden="true" /> Giáo viên
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-900">{row.teacherName || 'Chưa xếp giáo viên'}</p>
                          <p className="text-xs font-semibold text-slate-500">{row.teacherCode || 'Chưa có mã'}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="mb-2 flex items-center gap-2 text-xs font-black text-slate-700">
                            <BookOpen className="h-4 w-4 text-indigo-600" aria-hidden="true" /> Phòng học
                          </p>
                          <RoomSummary row={row} />
                        </div>
                        <div>
                          <p className="mb-2 flex items-center gap-2 text-xs font-black text-slate-700">
                            <Activity className="h-4 w-4 text-indigo-600" aria-hidden="true" /> Webhook vào và ra
                          </p>
                          <SessionHistory row={row} />
                        </div>
                      </div>

                      <div className="mt-4 border-t border-slate-200 pt-4">
                        <OperationActions
                          row={row}
                          bucket={bucket}
                          nowMs={nowMs}
                          recording={recordings[row.bookingId]}
                          issuedLink={issuedLinks[row.bookingId]}
                          issuing={issuingBookingId === row.bookingId}
                          extending={extendingBookingId === row.bookingId}
                          actionsLocked={actionsLocked}
                          onIssueInvite={issueInvite}
                          onExtend={setExtensionCandidate}
                        />
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </Card>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium leading-5 text-slate-500">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        Link học viên là thông tin riêng của đúng booking. Chỉ sao chép cho đúng học viên và không đăng vào nhóm công khai.
      </div>

      <ConfirmDialog
        open={Boolean(extensionCandidate)}
        onClose={() => {
          if (!extendingBookingId) setExtensionCandidate(null)
        }}
        onConfirm={() => { void extendSession() }}
        title="Gia hạn lớp học thêm 10 phút"
        description={extensionCandidate
          ? `${extensionCandidate.studentName || extensionCandidate.studentCode || 'Học viên'} - ${extensionCandidate.subjectName || 'Lớp học 1 kèm 1'}`
          : undefined}
        confirmLabel="Xác nhận gia hạn"
        loading={Boolean(extendingBookingId)}
      >
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold leading-6 text-amber-800">
          Mỗi buổi chỉ được gia hạn một lần. Sau khi xác nhận, giờ kết thúc cứng sẽ tăng thêm 10 phút.
        </div>
      </ConfirmDialog>
    </div>
  )
}

export default OnlineClassroomOperationsPage
