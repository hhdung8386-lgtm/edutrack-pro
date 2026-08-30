import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  Clock3,
  Copy,
  ExternalLink,
  Link2,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
  X,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { copyTextToClipboard } from '@/lib/lessonShare'
import {
  createOnlineTrialClass,
  endOnlineTrialClass,
  listOnlineTrialClasses,
  onlineTrialClassErrorMessage,
  type OnlineTrialClassCreateResult,
  type OnlineTrialClassStatus,
  type OnlineTrialClassSummary,
  type OnlineTrialClassTab,
} from '@/lib/onlineTrialClass'
import { filterOnlineTrialClasses } from '@/lib/onlineTrialClassModel'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Ho_Chi_Minh',
})

const STATUS_TABS: Array<{
  key: OnlineTrialClassTab
  label: string
  description: string
}> = [
  { key: 'ready', label: 'Sẵn sàng', description: 'Đã có link, chưa bắt đầu' },
  { key: 'live', label: 'Đang diễn ra', description: 'Phòng đang có phiên học' },
  { key: 'ended', label: 'Đã kết thúc', description: 'Lịch sử phòng học thử' },
]

function statusMeta(status: OnlineTrialClassStatus) {
  if (status === 'live') {
    return {
      label: 'Đang diễn ra',
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dot: 'bg-emerald-500',
    }
  }
  if (status === 'ended') {
    return {
      label: 'Đã kết thúc',
      badge: 'border-slate-200 bg-slate-100 text-slate-600',
      dot: 'bg-slate-400',
    }
  }
  if (status === 'error') {
    return {
      label: 'Thiết lập lỗi',
      badge: 'border-rose-200 bg-rose-50 text-rose-700',
      dot: 'bg-rose-500',
    }
  }
  return {
    label: 'Sẵn sàng',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    dot: 'bg-sky-500',
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Chưa ghi nhận'
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? DATE_TIME_FORMATTER.format(new Date(parsed)) : value
}

function shortRoomId(roomId: string): string {
  if (roomId.length <= 18) return roomId
  return `${roomId.slice(0, 9)}...${roomId.slice(-6)}`
}

function mergeRoom(
  rooms: OnlineTrialClassSummary[],
  incoming: OnlineTrialClassSummary,
): OnlineTrialClassSummary[] {
  const existingIndex = rooms.findIndex((room) => room.roomId === incoming.roomId)
  if (existingIndex < 0) return [incoming, ...rooms]
  return rooms.map((room, index) => index === existingIndex ? incoming : room)
}

function RoomListSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-label="Đang tải danh sách phòng">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="w-full space-y-3">
              <div className="h-5 w-2/3 rounded bg-slate-200" />
              <div className="h-4 w-1/3 rounded bg-slate-100" />
            </div>
            <div className="h-7 w-24 rounded-full bg-slate-100" />
          </div>
          <div className="mt-6 h-10 rounded-lg bg-slate-100" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="h-10 rounded-lg bg-slate-100" />
            <div className="h-10 rounded-lg bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

function LinkField({
  url,
  label,
  copied,
  onCopy,
}: {
  url: string
  label: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </label>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          aria-label={label}
          dir="ltr"
        />
        <Button type="button" variant="outline" onClick={onCopy} className="shrink-0">
          {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? 'Đã sao chép' : 'Sao chép link'}
        </Button>
      </div>
    </div>
  )
}

function CreatedRoomResult({
  result,
  copied,
  onCopy,
  onDismiss,
}: {
  result: OnlineTrialClassCreateResult
  copied: boolean
  onCopy: () => void
  onDismiss: () => void
}) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 sm:p-6"
      aria-labelledby="created-room-heading"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        aria-label="Ẩn thông tin phòng vừa tạo"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="flex items-start gap-3 pr-10">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Phòng đã sẵn sàng</p>
          <h2 id="created-room-heading" className="mt-1 text-xl font-black text-slate-950">
            {result.room.title}
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Mã phòng: <span className="font-mono text-slate-800">{result.room.roomId}</span>
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <LinkField
          url={result.guestUrl}
          label="Link tham gia lớp (dùng chung)"
          copied={copied}
          onCopy={onCopy}
        />
        <a
          href={result.adminUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Mở phòng
        </a>
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5 text-emerald-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Cùng một link như Google Meet: Admin hoặc gia sư đã đăng nhập nhận quyền điều phối; học viên vào phòng chờ và phải được cho phép.
      </p>
    </section>
  )
}

function RoomCard({
  room,
  copied,
  ending,
  onCopy,
  onEnd,
}: {
  room: OnlineTrialClassSummary
  copied: boolean
  ending: boolean
  onCopy: () => void
  onEnd: () => void
}) {
  const meta = statusMeta(room.status)
  const active = room.status === 'ready' || room.status === 'live'

  return (
    <Card padding="none" className="overflow-hidden rounded-2xl shadow-sm">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-slate-950" title={room.title}>{room.title}</h3>
            <p className="mt-1 font-mono text-xs font-semibold text-slate-500" title={room.roomId}>
              {shortRoomId(room.roomId)}
            </p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-black ${meta.badge}`}>
            <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden="true" />
            {meta.label}
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="font-bold text-slate-500">Tạo lúc</dt>
            <dd className="mt-1 font-semibold text-slate-800">{formatTimestamp(room.createdAt)}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">Bắt đầu</dt>
            <dd className="mt-1 font-semibold text-slate-800">{formatTimestamp(room.startedAt)}</dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="font-bold text-slate-500">Link hết hạn</dt>
            <dd className="mt-1 font-semibold text-slate-800">{formatTimestamp(room.accessExpiresAt)}</dd>
          </div>
        </dl>

        {room.status === 'ended' && room.endedAt && (
          <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            Kết thúc lúc {formatTimestamp(room.endedAt)}
          </p>
        )}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCopy}
            disabled={!room.guestUrl}
            title={!room.guestUrl ? 'Máy chủ chưa trả link tham gia cho phòng này.' : undefined}
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? 'Đã sao chép' : 'Sao chép link'}
          </Button>
          {room.adminUrl ? (
            <a
              href={room.adminUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Mở phòng
            </a>
          ) : (
            <Button type="button" variant="secondary" disabled>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Chưa có link phòng
            </Button>
          )}
        </div>
        {active && (
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            loading={ending}
            onClick={onEnd}
          >
            <CircleStop className="h-4 w-4" aria-hidden="true" />
            Kết thúc phòng
          </Button>
        )}
      </div>
    </Card>
  )
}

export function OnlineClassroomOperationsPage() {
  const role = useAuthStore((state) => state.role)
  const [rooms, setRooms] = useState<OnlineTrialClassSummary[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createError, setCreateError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [activeTab, setActiveTab] = useState<OnlineTrialClassTab>('ready')
  const [search, setSearch] = useState('')
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [creatingMode, setCreatingMode] = useState<'later' | 'instant' | null>(null)
  const [createdResult, setCreatedResult] = useState<OnlineTrialClassCreateResult | null>(null)
  const [copiedRoomId, setCopiedRoomId] = useState('')
  const [manualCopyUrl, setManualCopyUrl] = useState('')
  const [endingRoomId, setEndingRoomId] = useState('')
  const [endCandidate, setEndCandidate] = useState<OnlineTrialClassSummary | null>(null)
  const createMenuRef = useRef<HTMLDivElement>(null)
  const copyTimerRef = useRef<number | null>(null)

  const loadRooms = useCallback(async () => {
    if (role !== 'admin') return
    setLoading(true)
    setError('')
    try {
      const result = await listOnlineTrialClasses({ limit: 100 })
      setRooms(result.rooms)
      setHasMore(result.hasMore)
    } catch (loadError) {
      setRooms([])
      setHasMore(false)
      setError(onlineTrialClassErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    let active = true
    if (role !== 'admin') {
      return () => {
        active = false
      }
    }
    void listOnlineTrialClasses({ limit: 100 }).then((result) => {
      if (!active) return
      setRooms(result.rooms)
      setHasMore(result.hasMore)
    }).catch((loadError) => {
      if (!active) return
      setRooms([])
      setHasMore(false)
      setError(onlineTrialClassErrorMessage(loadError))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [refreshVersion, role])

  useEffect(() => {
    if (!createMenuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!createMenuRef.current?.contains(event.target as Node)) setCreateMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCreateMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [createMenuOpen])

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
  }, [])

  const counts = useMemo(() => ({
    ready: rooms.filter((room) => room.status === 'ready').length,
    live: rooms.filter((room) => room.status === 'live').length,
    ended: rooms.filter((room) => room.status === 'ended' || room.status === 'error').length,
  }), [rooms])

  const visibleRooms = useMemo(
    () => filterOnlineTrialClasses(rooms, activeTab, search),
    [activeTab, rooms, search],
  )

  const copyGuestLink = async (roomId: string, url: string | null) => {
    if (!url) {
      toast.error('Phòng này chưa có link tham gia để sao chép.')
      return
    }
    const copied = await copyTextToClipboard(url)
    if (!copied) {
      setManualCopyUrl(url)
      toast.warning('Trình duyệt chưa cho phép sao chép tự động. Hãy sao chép thủ công ở ô bên dưới.')
      return
    }
    setManualCopyUrl('')
    setCopiedRoomId(roomId)
    toast.success('Đã sao chép link lớp. Cùng một link dùng cho gia sư và học viên.')
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => setCopiedRoomId(''), 2_500)
  }

  const createRoom = async (mode: 'later' | 'instant') => {
    if (creatingMode) return
    setCreateMenuOpen(false)
    setCreateError('')
    setCreatingMode(mode)
    const pendingWindow = mode === 'instant' ? window.open('about:blank', '_blank') : null
    if (pendingWindow) pendingWindow.opener = null

    try {
      const result = await createOnlineTrialClass({ mode })
      setCreatedResult(result)
      setRooms((current) => mergeRoom(current, result.room))
      setActiveTab(result.room.status === 'error' ? 'ended' : result.room.status)
      toast.success(mode === 'instant' ? 'Đã tạo và mở phòng với quyền Admin điều phối.' : 'Đã tạo link phòng học thử.')
      if (mode === 'instant') {
        if (pendingWindow) {
          pendingWindow.location.href = result.adminUrl
        } else {
          toast.warning('Trình duyệt đã chặn tab mới. Dùng nút Mở phòng bên dưới.')
        }
      }
    } catch (createRoomError) {
      pendingWindow?.close()
      const message = onlineTrialClassErrorMessage(createRoomError)
      setCreateError(message)
      toast.error(message)
    } finally {
      setCreatingMode(null)
    }
  }

  const confirmEndRoom = async () => {
    if (!endCandidate || endingRoomId) return
    const room = endCandidate
    setEndingRoomId(room.roomId)
    try {
      const endedRoom = await endOnlineTrialClass(room.roomId)
      setRooms((current) => mergeRoom(current, endedRoom))
      if (createdResult?.room.roomId === endedRoom.roomId) {
        setCreatedResult((current) => current ? { ...current, room: endedRoom } : null)
      }
      setEndCandidate(null)
      toast.success('Đã kết thúc phòng học thử.')
    } catch (endError) {
      toast.error(onlineTrialClassErrorMessage(endError))
    } finally {
      setEndingRoomId('')
    }
  }

  if (role !== 'admin') {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-black text-slate-950">Chỉ Admin được quản lý phòng học thử</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Vui lòng dùng tài khoản Admin đã được xác thực.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <header className="overflow-visible rounded-3xl bg-slate-950 p-5 text-white shadow-lg sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-slate-950">
              <Video className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">123English Trial Class</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Phòng học thử trực tuyến</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-300">
                Tạo phòng riêng và gửi một link dùng chung cho gia sư, học viên. Phòng này không tạo booking, không ghi phút học và không phát sinh lương.
              </p>
            </div>
          </div>

          <div ref={createMenuRef} className="relative shrink-0">
            <Button
              type="button"
              size="lg"
              className="w-full bg-amber-400 font-black text-slate-950 shadow-none hover:bg-amber-300 focus:ring-amber-400 lg:w-auto"
              aria-haspopup="menu"
              aria-expanded={createMenuOpen}
              onClick={() => setCreateMenuOpen((open) => !open)}
              loading={creatingMode !== null}
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              {creatingMode === 'later' ? 'Đang tạo link' : creatingMode === 'instant' ? 'Đang mở phòng' : 'Tạo phòng'}
              {!creatingMode && <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            </Button>
            {createMenuOpen && (
              <div
                role="menu"
                aria-label="Chọn cách tạo phòng học thử"
                className="absolute right-0 z-30 mt-2 w-full min-w-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-2xl lg:w-[320px]"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-h-16 w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  onClick={() => void createRoom('later')}
                >
                  <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-black">Tạo link dùng sau</span>
                    <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">Tạo phòng, sao chép link rồi mở khi cần.</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="mt-1 flex min-h-16 w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  onClick={() => void createRoom('instant')}
                >
                  <Radio className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-black">Bắt đầu ngay</span>
                    <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">Tạo phòng và mở ngay với quyền Admin điều phối.</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {createError && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-black">Chưa tạo được phòng</p>
            <p className="mt-1 leading-6">{createError}</p>
          </div>
          <button type="button" onClick={() => setCreateError('')} className="rounded-lg p-2 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500" aria-label="Đóng thông báo lỗi">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {createdResult && (
        <CreatedRoomResult
          result={createdResult}
          copied={copiedRoomId === createdResult.room.roomId}
          onCopy={() => void copyGuestLink(createdResult.room.roomId, createdResult.guestUrl)}
          onDismiss={() => setCreatedResult(null)}
        />
      )}

      {manualCopyUrl && (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-amber-900">Sao chép link thủ công</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">Chạm vào ô dưới đây, chọn toàn bộ rồi sao chép.</p>
            </div>
            <button type="button" onClick={() => setManualCopyUrl('')} className="rounded-lg p-2 text-amber-800 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500" aria-label="Đóng hướng dẫn sao chép thủ công">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <input
            type="text"
            readOnly
            value={manualCopyUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-3 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
            aria-label="Link cần sao chép thủ công"
            dir="ltr"
          />
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Tổng quan phòng học thử">
        {STATUS_TABS.map((tab) => {
          const meta = statusMeta(tab.key)
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-24 rounded-2xl border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${activeTab === tab.key ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              aria-pressed={activeTab === tab.key}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-black text-slate-800">{tab.label}</span>
                <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} aria-hidden="true" />
              </span>
              <span className="mt-2 block text-2xl font-black text-slate-950">{counts[tab.key]}</span>
              <span className="mt-1 block text-xs font-medium text-slate-500">{tab.description}</span>
            </button>
          )
        })}
      </section>

      <Card padding="none" className="overflow-hidden rounded-2xl">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Danh sách phòng</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">Mỗi phòng là một lớp học thử độc lập.</p>
            </div>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1 sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <label htmlFor="trial-class-search" className="sr-only">Tìm phòng học thử</label>
                <input
                  id="trial-class-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm theo tên hoặc mã phòng"
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                aria-label="Tải lại danh sách phòng"
                title="Tải lại"
                onClick={() => {
                  setLoading(true)
                  setError('')
                  setRefreshVersion((version) => version + 1)
                }}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="hidden sm:inline">Tải lại</span>
              </Button>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Trạng thái phòng học thử">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                aria-controls="trial-class-list"
                onClick={() => setActiveTab(tab.key)}
                className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-black focus:outline-none focus:ring-2 focus:ring-indigo-500 ${activeTab === tab.key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'}`}
              >
                {tab.label} <span className="ml-1 opacity-70">{counts[tab.key]}</span>
              </button>
            ))}
          </div>
          {hasMore && (
            <p className="mt-3 text-xs font-semibold text-amber-700">
              Đang hiển thị 100 phòng gần nhất. Dùng ô tìm kiếm để thu hẹp danh sách hiện tại.
            </p>
          )}
        </div>

        <div id="trial-class-list" role="tabpanel" className="bg-slate-50/70 p-4 sm:p-5">
          {loading ? (
            <RoomListSkeleton />
          ) : error ? (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-white px-5 py-10 text-center">
              <AlertCircle className="mx-auto h-9 w-9 text-rose-500" aria-hidden="true" />
              <h3 className="mt-3 text-base font-black text-slate-950">Chưa tải được danh sách phòng</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm font-medium leading-6 text-slate-600">{error}</p>
              <Button type="button" variant="outline" className="mt-5" onClick={() => void loadRooms()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Thử lại
              </Button>
            </div>
          ) : visibleRooms.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="h-8 w-8" />}
              title={search ? 'Không tìm thấy phòng phù hợp' : `Chưa có phòng ở mục ${statusMeta(activeTab).label.toLowerCase()}`}
              description={search ? 'Hãy thử từ khóa khác hoặc chuyển trạng thái phòng.' : activeTab === 'ready' ? 'Tạo link dùng sau để chuẩn bị một lớp học thử mới.' : 'Phòng sẽ tự xuất hiện tại đây khi trạng thái thay đổi.'}
              action={activeTab === 'ready' && !search ? { label: 'Tạo phòng học thử', onClick: () => { void createRoom('later') } } : undefined}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleRooms.map((room) => (
                <RoomCard
                  key={room.roomId}
                  room={room}
                  copied={copiedRoomId === room.roomId}
                  ending={endingRoomId === room.roomId}
                  onCopy={() => void copyGuestLink(room.roomId, room.guestUrl)}
                  onEnd={() => setEndCandidate(room)}
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      <section className="grid gap-4 rounded-2xl border border-sky-200 bg-sky-50 p-5 sm:grid-cols-[auto_1fr] sm:p-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-600 text-white">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-black text-slate-950">Phòng học thử độc lập với vận hành khóa học</h2>
          <ul className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-slate-700 md:grid-cols-3">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />Không tạo booking hoặc buổi dạy.</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />Không ghi phút, kim cương hoặc học phí.</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />Không tính lương hay ảnh hưởng báo cáo.</li>
          </ul>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(endCandidate)}
        onClose={() => {
          if (!endingRoomId) setEndCandidate(null)
        }}
        onConfirm={() => void confirmEndRoom()}
        title="Kết thúc phòng học thử?"
        description={endCandidate ? `Người đang tham gia phòng ${endCandidate.title} sẽ không thể tiếp tục phiên học.` : undefined}
        consequence="Thao tác này kết thúc phiên hiện tại. Phòng vẫn được giữ trong lịch sử để Admin đối soát."
        confirmLabel="Kết thúc phòng"
        confirmVariant="danger"
        loading={Boolean(endingRoomId)}
      />

      <p className="sr-only" aria-live="polite">
        {copiedRoomId ? 'Đã sao chép link tham gia.' : ''}
      </p>
    </div>
  )
}
