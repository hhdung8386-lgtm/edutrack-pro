import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Clock3,
  Copy,
  Gift,
  ImageOff,
  Maximize2,
  Minimize2,
  MonitorUp,
  PenLine,
  RefreshCw,
  Sparkles,
  UserCheck,
  Users,
  UserX,
  Video,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { CollaborativeWhiteboard } from '@/components/classroom/CollaborativeWhiteboard'
import { ScreenShareAnnotationStage } from '@/components/classroom/ScreenShareAnnotationStage'
import {
  JitsiClassroom,
  type JitsiConnectionState,
  type JitsiKnockingParticipant,
  type JitsiScreenShareState,
} from '@/components/classroom/JitsiClassroom'
import { Logo } from '@/components/shared/Logo'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  boardMessageSurface,
  createBoardId,
  isBoardOperationGenerationCurrent,
  makeBoardMessage,
  parseBoardMessage,
  sanitizeBoardSnapshot,
  serializeBoardMessage,
  type BoardMessagePayload,
  type BoardOperation,
  type ValidatedBoardSnapshot,
} from '@/lib/classroomBoard'
import type { JitsiExternalApi } from '@/lib/jitsiExternalApi'
import {
  broadcastJitsiTextMessage,
  broadcastJitsiTextMessages,
  isJitsiParticipantModerator,
} from '@/lib/jitsiExternalApi'
import {
  endOnlineTrialClass,
  getOnlineTrialClassAccess,
  onlineTrialClassErrorMessage,
  type TrialClassroomAccess,
} from '@/lib/onlineTrialClass'
import type { OnlineClassroomRole } from '@/lib/onlineClassroom'
import {
  assembleTrialBoardImageChunks,
  chunkTrialBoardImage,
  compareTrialBoardImageOrder,
  makeTrialBoardImageClearMessage,
  parseTrialBoardImageMessage,
  serializeTrialBoardImageMessage,
} from '@/lib/trialBoardImage'
import {
  isTrialScreenCaptureCurrent,
  nextTrialScreenHistoryVersion,
  resolveTrialScreenShareTransition,
} from '@/lib/trialScreenShare'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'

const EMPTY_BOARD: ValidatedBoardSnapshot = {
  version: 0,
  generation: 0,
  studentCanWrite: true,
  operations: [],
}

const EMPTY_SCREEN_SHARE: JitsiScreenShareState = {
  active: false,
  local: false,
  participantIds: [],
}

const TRIAL_GIFT_NAMESPACE = '123english-trial-gift-v1'

type GiftKind = 'trophy' | 'star' | 'heart'

type GiftEvent = {
  namespace: typeof TRIAL_GIFT_NAMESPACE
  id: string
  kind: GiftKind
  senderName: string
  sentAt: number
}

type BoardBackgroundImage = {
  id: string
  dataUrl: string
  sourceName: string
  sentAt: number
}

type IncomingBoardImage = {
  totalChunks: number
  chunks: Array<string | undefined>
  receivedAt: number
  sentAt: number
}

const GIFT_META: Record<GiftKind, { label: string; icon: string; message: string }> = {
  trophy: { label: 'Cúp +5', icon: '🏆', message: 'Tuyệt vời! Bạn nhận được 5 cúp' },
  star: { label: 'Ngôi sao', icon: '⭐', message: 'Một ngôi sao cho câu trả lời hay' },
  heart: { label: 'Trái tim', icon: '💛', message: 'Cố gắng rất tốt, tiếp tục nhé!' },
}

function isManager(role: OnlineClassroomRole): boolean {
  return role === 'admin' || role === 'teacher'
}

function roleLabel(role: OnlineClassroomRole): string {
  if (role === 'admin') return 'Admin điều phối'
  if (role === 'teacher') return 'Gia sư'
  return 'Học viên'
}

function connectionLabel(state: JitsiConnectionState): string {
  if (state === 'connected') return 'Kết nối ổn định'
  if (state === 'joining') return 'Đang vào lớp'
  if (state === 'ended') return 'Đã rời lớp'
  if (state === 'error') return 'Mất kết nối'
  return 'Đang chuẩn bị'
}

function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function fullJoinUrl(trialClassId: string, serverUrl?: string): string {
  const fallback = `/lop-hoc-thu/${encodeURIComponent(trialClassId)}`
  const candidate = serverUrl || fallback
  if (/^https?:\/\//i.test(candidate)) return candidate
  return typeof window === 'undefined' ? candidate : `${window.location.origin}${candidate.startsWith('/') ? candidate : `/${candidate}`}`
}

function parseGiftMessage(raw: string): GiftEvent | null {
  if (!raw || raw.length > 2_000) return null
  try {
    const value = JSON.parse(raw) as Partial<GiftEvent>
    if (value.namespace !== TRIAL_GIFT_NAMESPACE
      || !value.id
      || !value.senderName
      || !value.sentAt
      || !value.kind
      || !Object.prototype.hasOwnProperty.call(GIFT_META, value.kind)) return null
    if (Math.abs(Date.now() - value.sentAt) > 5 * 60_000) return null
    return value as GiftEvent
  } catch {
    return null
  }
}

function copySnapshot(snapshot: ValidatedBoardSnapshot): ValidatedBoardSnapshot {
  return {
    ...snapshot,
    operations: [...snapshot.operations],
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: 'image/webp' | 'image/jpeg',
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : ''), { once: true })
    reader.addEventListener('error', () => reject(reader.error || new Error('READ_IMAGE_FAILED')), { once: true })
    reader.readAsDataURL(blob)
  })
}

function isSafeScreenFrameUrl(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 32
    && value.length <= 8_000_000
    && /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(value)
}

async function compressClipboardImage(blob: Blob): Promise<string> {
  if (!blob.type.startsWith('image/')) throw new Error('CLIPBOARD_IMAGE_REQUIRED')
  const bitmap = await createImageBitmap(blob)
  try {
    const attempts = [
      { maxWidth: 1440, maxHeight: 900, type: 'image/webp' as const, quality: 0.74 },
      { maxWidth: 1280, maxHeight: 800, type: 'image/webp' as const, quality: 0.62 },
      { maxWidth: 1080, maxHeight: 720, type: 'image/jpeg' as const, quality: 0.62 },
    ]
    for (const attempt of attempts) {
      const scale = Math.min(1, attempt.maxWidth / bitmap.width, attempt.maxHeight / bitmap.height)
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('IMAGE_CANVAS_UNAVAILABLE')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.drawImage(bitmap, 0, 0, width, height)
      const encoded = await canvasToBlob(canvas, attempt.type, attempt.quality)
      if (!encoded) continue
      const dataUrl = await blobToDataUrl(encoded)
      if (dataUrl.length <= 520_000) return dataUrl
    }
    throw new Error('CLIPBOARD_IMAGE_TOO_LARGE')
  } finally {
    bitmap.close()
  }
}

function ClassroomLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f6f8fb] px-5">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-xl shadow-slate-900/5">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
          <RefreshCw className="h-7 w-7 animate-spin text-amber-600" />
        </span>
        <h1 className="mt-4 text-lg font-black text-[#10213a]">Đang chuẩn bị phòng học thử</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Hệ thống đang xác nhận quyền và tạo kết nối riêng tư.</p>
      </div>
    </div>
  )
}

function ClassroomStatePage({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f6f8fb] px-5">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-xl shadow-slate-900/5 sm:p-9">
        <Logo clickable className="mx-auto h-9 w-auto" />
        <span className="mx-auto mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
          <Video className="h-7 w-7 text-amber-600" />
        </span>
        <h1 className="mt-4 text-xl font-black text-[#10213a]">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{message}</p>
        {actionLabel && onAction && (
          <Button className="mt-6 bg-[#10213a] hover:bg-[#1b3558]" onClick={onAction}>
            <RefreshCw className="h-4 w-4" />
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

function GuestJoinCard({
  roomId,
  initialName,
  busy,
  error,
  onJoin,
}: {
  roomId: string
  initialName: string
  busy: boolean
  error: string
  onJoin: (displayName: string) => void
}) {
  const [name, setName] = useState(initialName)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = name.replace(/\s+/g, ' ').trim().slice(0, 80)
    if (normalized.length < 2) return
    onJoin(normalized)
  }

  return (
    <div className="min-h-[100dvh] bg-[#f6f8fb] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_30px_90px_-48px_rgba(15,23,42,0.35)] lg:grid-cols-[1.15fr_.85fr]">
        <div className="relative hidden overflow-hidden bg-[#0a1019] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-amber-300/10 blur-3xl" />
          <Logo clickable={false} className="relative h-10 w-auto brightness-0 invert" />
          <div className="relative max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-black text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              Trial Class · phòng chờ an toàn
            </span>
            <h1 className="mt-5 text-4xl font-black leading-tight">Học trực tiếp ngay trên 123English.</h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-slate-300">Camera, micro, chia sẻ màn hình và bảng trắng tương tác nằm trong cùng một không gian học.</p>
          </div>
          <p className="relative text-xs font-semibold text-slate-400">Link này không tạo booking, không trừ phút học và không phát sinh lương.</p>
        </div>

        <div className="flex items-center px-5 py-8 sm:px-10 lg:px-12">
          <form onSubmit={submit} className="w-full">
            <Logo className="h-9 w-auto lg:hidden" />
            <span className="mt-8 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 lg:mt-0">
              <Video className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-2xl font-black text-[#10213a]">Sẵn sàng vào lớp?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Nhập tên để gia sư nhận ra bạn. Sau đó bạn sẽ chờ gia sư cho phép vào phòng.</p>

            <label className="mt-7 block text-sm font-extrabold text-slate-700" htmlFor="trial-display-name">Tên hiển thị</label>
            <input
              id="trial-display-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoComplete="name"
              autoFocus
              placeholder="Ví dụ: Nguyễn Minh Anh"
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
            />
            <p className="mt-2 text-xs text-slate-400">Mã phòng: {roomId.slice(0, 12).toUpperCase()}</p>

            {error && (
              <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-800" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={busy}
              disabled={name.trim().length < 2}
              className="mt-6 bg-[#10213a] font-black hover:bg-[#1b3558]"
            >
              <Video className="h-5 w-5" />
              Tiếp tục vào phòng học
            </Button>
            <p className="mt-5 text-center text-xs leading-5 text-slate-400">Khi tiếp tục, trình duyệt sẽ hỏi quyền camera và micro. Bạn có thể tắt từng thiết bị trước khi vào lớp.</p>
          </form>
        </div>
      </div>
    </div>
  )
}

function TrialClassroomRoom({ trialClassId }: { trialClassId: string }) {
  const { user, role: authRole } = useAuthStore()
  const authenticatedManager = Boolean(user && (authRole === 'admin' || authRole === 'teacher'))
  const initialGuestName = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.sessionStorage.getItem('123english_trial_display_name') || ''
  }, [])

  const [guestName, setGuestName] = useState(initialGuestName)
  const [joinRequested, setJoinRequested] = useState(authenticatedManager)
  const effectiveJoinRequested = joinRequested || authenticatedManager
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'ended'>('idle')
  const [pageError, setPageError] = useState('')
  const [access, setAccess] = useState<TrialClassroomAccess | null>(null)
  const [connectionState, setConnectionState] = useState<JitsiConnectionState>('loading')
  const [conferenceJoined, setConferenceJoined] = useState(false)
  const [conferenceStartedAt, setConferenceStartedAt] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [remoteParticipantCount, setRemoteParticipantCount] = useState(0)
  const [waitingRoomReady, setWaitingRoomReady] = useState(false)
  const [knockingParticipants, setKnockingParticipants] = useState<JitsiKnockingParticipant[]>([])
  const [screenShareState, setScreenShareState] = useState<JitsiScreenShareState>(EMPTY_SCREEN_SHARE)
  const [screenAnnotationOpen, setScreenAnnotationOpen] = useState(false)
  const [screenFrameUrl, setScreenFrameUrl] = useState('')
  const [screenFrameState, setScreenFrameState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [screenFrameError, setScreenFrameError] = useState('')
  const [screenBoardSnapshot, setScreenBoardSnapshot] = useState<ValidatedBoardSnapshot>(EMPTY_BOARD)
  const [screenHistoryAvailability, setScreenHistoryAvailability] = useState({ canUndo: false, canRedo: false })
  const [controlsCollapsed, setControlsCollapsed] = useState(false)
  const [meetingExpanded, setMeetingExpanded] = useState(false)
  const [whiteboardOpen, setWhiteboardOpen] = useState(false)
  const [boardSnapshot, setBoardSnapshot] = useState<ValidatedBoardSnapshot>(EMPTY_BOARD)
  const [boardBackground, setBoardBackground] = useState<BoardBackgroundImage | null>(null)
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false })
  const [pastingImage, setPastingImage] = useState(false)
  const [dataChannelReady, setDataChannelReady] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [endingRoom, setEndingRoom] = useState(false)
  const [activeGift, setActiveGift] = useState<GiftEvent | null>(null)

  const apiRef = useRef<JitsiExternalApi | null>(null)
  const localParticipantIdRef = useRef('')
  const participantIdsRef = useRef(new Set<string>())
  const screenShareStateRef = useRef<JitsiScreenShareState>(EMPTY_SCREEN_SHARE)
  const stableScreenPresenterIdRef = useRef('')
  const screenFrameCaptureRef = useRef<Promise<void> | null>(null)
  const screenFrameCaptureEpochRef = useRef(0)
  const screenFrameUrlRef = useRef('')
  const boardRef = useRef<ValidatedBoardSnapshot>(EMPTY_BOARD)
  const screenBoardRef = useRef<ValidatedBoardSnapshot>(EMPTY_BOARD)
  const boardBackgroundRef = useRef<BoardBackgroundImage | null>(null)
  const incomingBoardImagesRef = useRef(new Map<string, IncomingBoardImage>())
  const latestBoardImageOrderRef = useRef({ sentAt: 0, imageId: '' })
  const pastingImageRef = useRef(false)
  const snapshotRequestAtRef = useRef(new Map<string, number>())
  const participantModeratorCacheRef = useRef(new Map<string, { value: boolean | null; expiresAt: number }>())
  const participantModeratorPromiseRef = useRef(new Map<string, Promise<boolean | null>>())
  const undoRef = useRef<ValidatedBoardSnapshot[]>([])
  const redoRef = useRef<ValidatedBoardSnapshot[]>([])
  const screenUndoRef = useRef<ValidatedBoardSnapshot[]>([])
  const screenRedoRef = useRef<ValidatedBoardSnapshot[]>([])
  const giftTimerRef = useRef<number | null>(null)
  const deferredSyncTimersRef = useRef(new Set<number>())

  const manager = Boolean(access && isManager(access.role))
  const joinUrl = fullJoinUrl(trialClassId, access?.joinUrl)

  const updateBoard = useCallback((next: ValidatedBoardSnapshot) => {
    const sanitized = sanitizeBoardSnapshot(next)
    boardRef.current = sanitized
    setBoardSnapshot(sanitized)
  }, [])

  const updateScreenBoard = useCallback((next: ValidatedBoardSnapshot) => {
    const sanitized = sanitizeBoardSnapshot(next)
    screenBoardRef.current = sanitized
    setScreenBoardSnapshot(sanitized)
  }, [])

  const updateBoardBackground = useCallback((next: BoardBackgroundImage | null) => {
    boardBackgroundRef.current = next
    setBoardBackground(next)
  }, [])

  const syncHistoryAvailability = useCallback(() => {
    setHistoryAvailability({
      canUndo: undoRef.current.length > 0,
      canRedo: redoRef.current.length > 0,
    })
  }, [])

  const syncScreenHistoryAvailability = useCallback(() => {
    setScreenHistoryAvailability({
      canUndo: screenUndoRef.current.length > 0,
      canRedo: screenRedoRef.current.length > 0,
    })
  }, [])

  const broadcastBoard = useCallback((payload: BoardMessagePayload) => {
    if (!access || !dataChannelReady) return
    const serialized = serializeBoardMessage(makeBoardMessage(trialClassId, access.role, payload))
    if (!serialized) return
    void broadcastJitsiTextMessage(apiRef.current, serialized, localParticipantIdRef.current)
  }, [access, dataChannelReady, trialClassId])

  const broadcastScreenBoard = useCallback((payload: BoardMessagePayload) => {
    if (!access || !dataChannelReady) return
    const serialized = serializeBoardMessage(makeBoardMessage(trialClassId, access.role, payload, 'screen'))
    if (!serialized) return
    void broadcastJitsiTextMessage(apiRef.current, serialized, localParticipantIdRef.current)
  }, [access, dataChannelReady, trialClassId])

  const broadcastBoardBackground = useCallback(async (background = boardBackgroundRef.current) => {
    if (!background || !apiRef.current) return
    const messages = chunkTrialBoardImage({
      trialClassId,
      imageId: background.id,
      dataUrl: background.dataUrl,
      sentAt: background.sentAt,
    }).map(serializeTrialBoardImageMessage)
    if (messages.length === 0) {
      toast.error('Ảnh chụp vượt giới hạn đồng bộ của bảng trắng.')
      return
    }
    await broadcastJitsiTextMessages(apiRef.current, messages, localParticipantIdRef.current)
  }, [trialClassId])

  const showGift = useCallback((event: GiftEvent) => {
    if (giftTimerRef.current !== null) window.clearTimeout(giftTimerRef.current)
    setActiveGift(event)
    giftTimerRef.current = window.setTimeout(() => {
      setActiveGift(null)
      giftTimerRef.current = null
    }, 3_200)
  }, [])

  const scheduleSync = useCallback((callback: () => void, delayMs: number) => {
    const timer = window.setTimeout(() => {
      deferredSyncTimersRef.current.delete(timer)
      callback()
    }, delayMs)
    deferredSyncTimersRef.current.add(timer)
  }, [])

  const loadAccess = useCallback(async (displayName?: string) => {
    if (!/^[A-Za-z0-9_-]{16,180}$/.test(trialClassId)) {
      setPageError('Link phòng học không hợp lệ.')
      setLoadState('error')
      return
    }
    setLoadState('loading')
    setPageError('')
    try {
      const result = await getOnlineTrialClassAccess(trialClassId, displayName)
      if (result.status === 'ended' || result.status === 'expired') {
        setLoadState('ended')
        return
      }
      setAccess(result)
      setLoadState('ready')
    } catch (error) {
      const message = onlineTrialClassErrorMessage(error)
      if (/đã kết thúc|không còn/i.test(message)) setLoadState('ended')
      else {
        setPageError(message)
        setLoadState('error')
      }
    }
  }, [trialClassId])

  useEffect(() => {
    if (!effectiveJoinRequested) return
    const timer = window.setTimeout(() => {
      void loadAccess(authenticatedManager ? undefined : guestName)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [authenticatedManager, effectiveJoinRequested, guestName, loadAccess])

  useEffect(() => {
    if (!conferenceStartedAt) return
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - conferenceStartedAt) / 1_000)))
    const animationFrame = window.requestAnimationFrame(update)
    const timer = window.setInterval(update, 1_000)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.clearInterval(timer)
    }
  }, [conferenceStartedAt])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (screenAnnotationOpen) setScreenAnnotationOpen(false)
      else if (whiteboardOpen) setWhiteboardOpen(false)
      else if (meetingExpanded) setMeetingExpanded(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [meetingExpanded, screenAnnotationOpen, whiteboardOpen])

  useEffect(() => () => {
    if (giftTimerRef.current !== null) window.clearTimeout(giftTimerRef.current)
    for (const timer of deferredSyncTimersRef.current) window.clearTimeout(timer)
    deferredSyncTimersRef.current.clear()
  }, [])

  const handleGuestJoin = (displayName: string) => {
    setGuestName(displayName)
    window.sessionStorage.setItem('123english_trial_display_name', displayName)
    setJoinRequested(true)
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl)
      toast.success('Đã sao chép link phòng học. Một link dùng cho cả gia sư và học viên.')
    } catch {
      window.prompt('Sao chép link phòng học:', joinUrl)
    }
  }

  const captureScreenShareFrame = useCallback(async () => {
    const shareAtCaptureStart = screenShareStateRef.current
    if (!shareAtCaptureStart.active) return
    if (screenFrameCaptureRef.current) return screenFrameCaptureRef.current
    const api = apiRef.current
    const capture = api?.captureLargeVideoScreenshot
    if (!api || !capture) {
      setScreenFrameState('error')
      setScreenFrameError('Trình gọi video chưa hỗ trợ lấy khung trình chiếu để chú thích.')
      return
    }
    const presenterId = shareAtCaptureStart.participantIds[0]
      || (shareAtCaptureStart.local ? localParticipantIdRef.current : '')
    if (!presenterId) {
      setScreenFrameState('loading')
      setScreenFrameError('')
      return
    }

    setScreenFrameState('loading')
    setScreenFrameError('')
    const captureEpoch = ++screenFrameCaptureEpochRef.current
    const work = (async () => {
      try {
        try {
          api.executeCommand('setTileView', false)
          api.executeCommand('setLargeVideoParticipant', presenterId, 'desktop')
          await new Promise<void>((resolve) => window.setTimeout(resolve, 300))
        } catch {
          // Jitsi thường tự chọn desktop; vẫn tiếp tục chụp khung hiện tại.
        }
        const result = await capture.call(api)
        if (!isTrialScreenCaptureCurrent(
          captureEpoch,
          screenFrameCaptureEpochRef.current,
          screenShareStateRef.current.active,
        )) return
        if (!isSafeScreenFrameUrl(result?.dataURL)) {
          throw new Error(result?.error || 'Chưa nhận được hình ảnh trình chiếu.')
        }
        screenFrameUrlRef.current = result.dataURL
        setScreenFrameUrl(result.dataURL)
        setScreenFrameState('ready')
        setScreenFrameError('')
      } catch (error) {
        if (!isTrialScreenCaptureCurrent(
          captureEpoch,
          screenFrameCaptureEpochRef.current,
          screenShareStateRef.current.active,
        )) return
        setScreenFrameState(screenFrameUrlRef.current ? 'ready' : 'error')
        setScreenFrameError(error instanceof Error ? error.message : 'Chưa làm mới được khung trình chiếu.')
      } finally {
        try {
          const currentShare = screenShareStateRef.current
          const currentPresenterId = currentShare.participantIds[0]
            || (currentShare.local ? localParticipantIdRef.current : '')
          if (currentShare.active && currentPresenterId) {
            api.executeCommand('setTileView', false)
            api.executeCommand('setLargeVideoParticipant', currentPresenterId, 'desktop')
          } else {
            api.executeCommand('setTileView', true)
          }
        } catch {
          // Khôi phục bố cục là tối ưu hiển thị, không được làm hỏng annotation.
        }
        if (screenFrameCaptureEpochRef.current === captureEpoch) screenFrameCaptureRef.current = null
      }
    })()
    screenFrameCaptureRef.current = work
    return work
  }, [])

  const applyClipboardImage = useCallback(async (blob: Blob, sourceName = 'Ảnh chụp màn hình') => {
    if (!access || (access.role === 'student' && !boardRef.current.studentCanWrite)) {
      toast.warning('Gia sư đang khóa quyền thao tác trên bảng trắng.')
      return
    }
    if (!dataChannelReady) {
      toast.warning('Hãy vào cuộc gọi và chờ kết nối đồng bộ trước khi dán ảnh.')
      return
    }
    if (pastingImageRef.current) return
    pastingImageRef.current = true
    setPastingImage(true)
    try {
      const imageId = createBoardId('board-image')
      const sentAt = Math.max(Date.now(), latestBoardImageOrderRef.current.sentAt + 1)
      const background: BoardBackgroundImage = {
        id: imageId,
        dataUrl: await compressClipboardImage(blob),
        sourceName: sourceName.slice(0, 100) || 'Ảnh chụp màn hình',
        sentAt,
      }
      latestBoardImageOrderRef.current = { sentAt, imageId }
      incomingBoardImagesRef.current.clear()
      updateBoardBackground(background)
      await broadcastBoardBackground(background)
      toast.success('Đã dán và đồng bộ ảnh chụp lên bảng trắng. Hai bên có thể viết trực tiếp lên ảnh.')
    } catch (error) {
      toast.error(error instanceof Error && error.message === 'CLIPBOARD_IMAGE_TOO_LARGE'
        ? 'Ảnh chụp quá lớn để đồng bộ an toàn. Hãy chụp riêng vùng nội dung cần học rồi dán lại.'
        : 'Chưa đọc được ảnh trong clipboard. Hãy chụp màn hình rồi thử Ctrl + V lại.')
    } finally {
      pastingImageRef.current = false
      setPastingImage(false)
    }
  }, [access, broadcastBoardBackground, dataChannelReady, updateBoardBackground])

  const readImageFromClipboard = useCallback(async () => {
    try {
      if (!navigator.clipboard?.read) throw new Error('CLIPBOARD_READ_UNAVAILABLE')
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (!imageType) continue
        await applyClipboardImage(await item.getType(imageType), 'Ảnh từ clipboard')
        return
      }
      toast.warning('Clipboard chưa có ảnh. Hãy chụp màn hình trước rồi bấm dán ảnh.')
    } catch {
      toast.warning('Trình duyệt chưa cho đọc clipboard bằng nút. Hãy dùng Ctrl + V khi bảng trắng đang mở.')
    }
  }, [applyClipboardImage])

  const clearBoardBackground = useCallback(() => {
    if (!access || !boardBackgroundRef.current || (access.role === 'student' && !boardRef.current.studentCanWrite)) return
    const clearedImageId = boardBackgroundRef.current.id
    const sentAt = Math.max(Date.now(), latestBoardImageOrderRef.current.sentAt + 1)
    latestBoardImageOrderRef.current = { sentAt, imageId: clearedImageId }
    incomingBoardImagesRef.current.clear()
    updateBoardBackground(null)
    const message = makeTrialBoardImageClearMessage({ trialClassId, imageId: clearedImageId, sentAt })
    if (message) {
      void broadcastJitsiTextMessage(
        apiRef.current,
        serializeTrialBoardImageMessage(message),
        localParticipantIdRef.current,
      )
    }
    toast.info('Đã gỡ ảnh nền khỏi bảng trắng.')
  }, [access, trialClassId, updateBoardBackground])

  useEffect(() => {
    if (!whiteboardOpen) return
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const items = Array.from(event.clipboardData?.items || [])
      const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'))
      const image = imageItem?.getAsFile()
      if (!image) return
      event.preventDefault()
      void applyClipboardImage(image, image.name || 'Ảnh chụp màn hình')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [applyClipboardImage, whiteboardOpen])

  const handleAnswerKnocking = (participantId: string, approved: boolean) => {
    apiRef.current?.executeCommand('answerKnockingParticipant', participantId, approved)
    setKnockingParticipants((current) => current.filter((participant) => participant.id !== participantId))
  }

  const handleBoardOperation = (operation: BoardOperation): boolean => {
    const current = boardRef.current
    if (!access || (access.role === 'student' && !current.studentCanWrite)) return false
    if (current.operations.some((candidate) => candidate.id === operation.id)) return true
    undoRef.current = [...undoRef.current.slice(-39), copySnapshot(current)]
    redoRef.current = []
    syncHistoryAvailability()
    const next = sanitizeBoardSnapshot({
      ...current,
      version: current.version + 1,
      operations: [...current.operations, operation],
    })
    updateBoard(next)
    broadcastBoard({ type: 'operation', boardVersion: next.version, operation })
    return true
  }

  const broadcastSnapshot = useCallback((snapshot = boardRef.current) => {
    broadcastBoard({ type: 'snapshot', snapshot })
  }, [broadcastBoard])

  const replaceBoardWithHistory = (next: ValidatedBoardSnapshot, target: 'undo' | 'redo') => {
    const current = boardRef.current
    if (target === 'undo') redoRef.current = [...redoRef.current.slice(-39), copySnapshot(current)]
    else undoRef.current = [...undoRef.current.slice(-39), copySnapshot(current)]
    syncHistoryAvailability()
    const versioned = sanitizeBoardSnapshot({ ...next, version: current.version + 1 })
    updateBoard(versioned)
    broadcastSnapshot(versioned)
  }

  const handleUndo = () => {
    const previous = undoRef.current.pop()
    if (previous) replaceBoardWithHistory(previous, 'undo')
    else syncHistoryAvailability()
  }

  const handleRedo = () => {
    const next = redoRef.current.pop()
    if (next) replaceBoardWithHistory(next, 'redo')
    else syncHistoryAvailability()
  }

  const handleClearBoard = () => {
    if (!access || !isManager(access.role)) return
    const current = boardRef.current
    undoRef.current = [...undoRef.current.slice(-39), copySnapshot(current)]
    redoRef.current = []
    syncHistoryAvailability()
    const next = sanitizeBoardSnapshot({
      version: current.version + 1,
      generation: current.generation + 1,
      studentCanWrite: current.studentCanWrite,
      operations: [],
    })
    updateBoard(next)
    broadcastSnapshot(next)
    if (boardBackgroundRef.current) clearBoardBackground()
  }

  const handleStudentWriteChange = (enabled: boolean) => {
    if (!access || !isManager(access.role)) return
    const current = boardRef.current
    const next = sanitizeBoardSnapshot({ ...current, version: current.version + 1, studentCanWrite: enabled })
    updateBoard(next)
    broadcastSnapshot(next)
    toast.info(enabled ? 'Học viên có thể viết trên bảng.' : 'Đã khóa quyền viết của học viên.')
  }

  const broadcastScreenSnapshot = useCallback((snapshot = screenBoardRef.current) => {
    broadcastScreenBoard({ type: 'snapshot', snapshot })
  }, [broadcastScreenBoard])

  const isScreenSnapshotAuthority = useCallback(() => Boolean(
    access
    && isManager(access.role)
    && screenShareStateRef.current.active
    && screenShareStateRef.current.local
  ), [access])

  const handleScreenBoardOperation = (operation: BoardOperation): boolean => {
    const current = screenBoardRef.current
    if (!access || (access.role === 'student' && !current.studentCanWrite)) return false
    if (current.generation === 0 && !isScreenSnapshotAuthority()) return false
    if (current.operations.some((candidate) => candidate.id === operation.id)) return true
    screenUndoRef.current = [...screenUndoRef.current.slice(-39), copySnapshot(current)]
    screenRedoRef.current = []
    syncScreenHistoryAvailability()
    const next = sanitizeBoardSnapshot({
      ...current,
      version: current.version + 1,
      operations: [...current.operations, operation],
    })
    updateScreenBoard(next)
    broadcastScreenBoard({
      type: 'operation',
      boardVersion: next.version,
      boardGeneration: next.generation,
      operation,
    })
    return true
  }

  const replaceScreenBoardWithHistory = (next: ValidatedBoardSnapshot, target: 'undo' | 'redo') => {
    const current = screenBoardRef.current
    if (target === 'undo') screenRedoRef.current = [...screenRedoRef.current.slice(-39), copySnapshot(current)]
    else screenUndoRef.current = [...screenUndoRef.current.slice(-39), copySnapshot(current)]
    syncScreenHistoryAvailability()
    const versioned = sanitizeBoardSnapshot({
      ...next,
      ...nextTrialScreenHistoryVersion(current.version, current.generation, next.generation),
    })
    updateScreenBoard(versioned)
    broadcastScreenSnapshot(versioned)
  }

  const handleScreenUndo = () => {
    if (!isScreenSnapshotAuthority()) return
    const previous = screenUndoRef.current.pop()
    if (previous) replaceScreenBoardWithHistory(previous, 'undo')
    else syncScreenHistoryAvailability()
  }

  const handleScreenRedo = () => {
    if (!isScreenSnapshotAuthority()) return
    const next = screenRedoRef.current.pop()
    if (next) replaceScreenBoardWithHistory(next, 'redo')
    else syncScreenHistoryAvailability()
  }

  const handleScreenClear = () => {
    if (!isScreenSnapshotAuthority()) return
    const current = screenBoardRef.current
    screenUndoRef.current = [...screenUndoRef.current.slice(-39), copySnapshot(current)]
    screenRedoRef.current = []
    syncScreenHistoryAvailability()
    const next = sanitizeBoardSnapshot({
      version: current.version + 1,
      generation: current.generation + 1,
      studentCanWrite: current.studentCanWrite,
      operations: [],
    })
    updateScreenBoard(next)
    broadcastScreenSnapshot(next)
  }

  const handleScreenStudentWriteChange = (enabled: boolean) => {
    if (!isScreenSnapshotAuthority()) return
    const current = screenBoardRef.current
    const next = sanitizeBoardSnapshot({ ...current, version: current.version + 1, studentCanWrite: enabled })
    updateScreenBoard(next)
    broadcastScreenSnapshot(next)
    toast.info(enabled ? 'Học viên có thể chú thích lên bài trình chiếu.' : 'Đã khóa quyền chú thích của học viên.')
  }

  const resolveSenderModerator = async (senderId: string, fresh = false): Promise<boolean | null> => {
    const cached = participantModeratorCacheRef.current.get(senderId)
    if (!fresh && cached && cached.expiresAt > Date.now()) return cached.value
    const inFlight = participantModeratorPromiseRef.current.get(senderId)
    if (!fresh && inFlight) return inFlight
    const pending = isJitsiParticipantModerator(apiRef.current, senderId).then((value) => {
      participantModeratorCacheRef.current.set(senderId, { value, expiresAt: Date.now() + 10_000 })
      return value
    })
    participantModeratorPromiseRef.current.set(senderId, pending)
    void pending.finally(() => {
      if (participantModeratorPromiseRef.current.get(senderId) === pending) {
        participantModeratorPromiseRef.current.delete(senderId)
      }
    })
    return pending
  }

  const handleRealtimeText = async (text: string, senderId: string) => {
    const imageMessage = parseTrialBoardImageMessage(text, trialClassId)
    const gift = imageMessage ? null : parseGiftMessage(text)
    const message = imageMessage || gift ? null : parseBoardMessage(text, trialClassId)
    if (!imageMessage && !gift && !message) return
    const surface = message ? boardMessageSurface(message) : 'board'
    const targetBoard = surface === 'screen' ? screenBoardRef.current : boardRef.current
    const privilegedMessage = Boolean(gift
      || message?.type === 'snapshot'
      || message?.type === 'frame-refresh'
      || (imageMessage && !boardRef.current.studentCanWrite)
      || (message?.type === 'operation' && !targetBoard.studentCanWrite))
    const senderIsModerator = await resolveSenderModerator(senderId, privilegedMessage)

    if (imageMessage) {
      if (senderIsModerator !== true && !boardRef.current.studentCanWrite) return
      const incomingOrder = { sentAt: imageMessage.sentAt, imageId: imageMessage.imageId }
      if (compareTrialBoardImageOrder(incomingOrder, latestBoardImageOrderRef.current) <= 0) return
      if (imageMessage.type === 'image-clear') {
        latestBoardImageOrderRef.current = incomingOrder
        incomingBoardImagesRef.current.clear()
        updateBoardBackground(null)
        return
      }
      const now = Date.now()
      for (const [imageId, pending] of incomingBoardImagesRef.current) {
        if (now - pending.receivedAt > 2 * 60_000) incomingBoardImagesRef.current.delete(imageId)
      }
      const existing = incomingBoardImagesRef.current.get(imageMessage.imageId)
      const pending = existing?.totalChunks === imageMessage.totalChunks && existing.sentAt === imageMessage.sentAt
        ? existing
        : {
            totalChunks: imageMessage.totalChunks,
            chunks: Array<string | undefined>(imageMessage.totalChunks),
            receivedAt: now,
            sentAt: imageMessage.sentAt,
          }
      if (!existing && incomingBoardImagesRef.current.size >= 4) {
        const oldest = [...incomingBoardImagesRef.current.entries()]
          .sort((left, right) => left[1].receivedAt - right[1].receivedAt)[0]
        if (oldest) incomingBoardImagesRef.current.delete(oldest[0])
      }
      pending.chunks[imageMessage.chunkIndex] = imageMessage.data
      pending.receivedAt = now
      incomingBoardImagesRef.current.set(imageMessage.imageId, pending)
      const assembled = assembleTrialBoardImageChunks(pending.chunks)
      if (assembled && compareTrialBoardImageOrder(incomingOrder, latestBoardImageOrderRef.current) > 0) {
        latestBoardImageOrderRef.current = incomingOrder
        incomingBoardImagesRef.current.delete(imageMessage.imageId)
        updateBoardBackground({
          id: imageMessage.imageId,
          dataUrl: assembled,
          sourceName: 'Ảnh bài học được đồng bộ',
          sentAt: imageMessage.sentAt,
        })
        toast.info('Ảnh bài học mới đã được đồng bộ lên bảng trắng.')
      }
      return
    }
    if (gift) {
      if (senderIsModerator !== true) return
      showGift(gift)
      return
    }
    if (!message || !access) return

    if (surface === 'screen') {
      if (message.type === 'frame-refresh') {
        const currentShare = screenShareStateRef.current
        if (senderIsModerator === true
          && currentShare.active
          && currentShare.participantIds.includes(senderId)) {
          scheduleSync(() => { void captureScreenShareFrame() }, 180)
        }
        return
      }
      if (message.type === 'snapshot-request' || message.type === 'hello' || message.type === 'snapshot-refresh') {
        const now = Date.now()
        const requestKey = `${senderId}:screen`
        const lastRequestAt = snapshotRequestAtRef.current.get(requestKey) || 0
        if (now - lastRequestAt < 4_000) return
        snapshotRequestAtRef.current.set(requestKey, now)
        if (isScreenSnapshotAuthority()) broadcastScreenSnapshot()
        return
      }
      if (message.type === 'snapshot') {
        if (senderIsModerator !== true) return
        const currentShare = screenShareStateRef.current
        if (currentShare.active
          && currentShare.participantIds.length > 0
          && !currentShare.participantIds.includes(senderId)) return
        const incoming = sanitizeBoardSnapshot(message.snapshot)
        const current = screenBoardRef.current
        if (incoming.generation > current.generation
          || (incoming.generation === current.generation && incoming.version >= current.version)) {
          screenUndoRef.current = []
          screenRedoRef.current = []
          syncScreenHistoryAvailability()
          updateScreenBoard(incoming)
        }
        return
      }
      if (message.type === 'operation') {
        const current = screenBoardRef.current
        if (!isBoardOperationGenerationCurrent(message, current.generation)) {
          if (isScreenSnapshotAuthority()) broadcastScreenSnapshot()
          else broadcastScreenBoard({ type: 'snapshot-request' })
          return
        }
        if (current.operations.some((operation) => operation.id === message.operation.id)) return
        if (senderIsModerator !== true && !current.studentCanWrite) return
        const operation: BoardOperation = {
          ...message.operation,
          authorRole: senderIsModerator === true ? 'teacher' : 'student',
        }
        updateScreenBoard(sanitizeBoardSnapshot({
          ...current,
          version: Math.max(current.version + 1, message.boardVersion),
          operations: [...current.operations, operation],
        }))
      }
      return
    }

    if (message.type === 'snapshot-request' || message.type === 'hello') {
      const now = Date.now()
      const requestKey = `${senderId}:board`
      const lastRequestAt = snapshotRequestAtRef.current.get(requestKey) || 0
      if (now - lastRequestAt < 4_000) return
      snapshotRequestAtRef.current.set(requestKey, now)
      if (isManager(access.role)) {
        broadcastSnapshot()
        void broadcastBoardBackground()
      }
      return
    }
    if (message.type === 'snapshot') {
      if (senderIsModerator !== true) return
      const incoming = sanitizeBoardSnapshot(message.snapshot)
      if (incoming.version >= boardRef.current.version) {
        undoRef.current = []
        redoRef.current = []
        syncHistoryAvailability()
        updateBoard(incoming)
      }
      return
    }
    if (message.type === 'operation') {
      const current = boardRef.current
      if (current.operations.some((operation) => operation.id === message.operation.id)) return
      if (senderIsModerator !== true && !current.studentCanWrite) return
      const operation: BoardOperation = {
        ...message.operation,
        authorRole: senderIsModerator === true ? 'teacher' : 'student',
      }
      updateBoard(sanitizeBoardSnapshot({
        ...current,
        version: Math.max(current.version + 1, message.boardVersion),
        operations: [...current.operations, operation],
      }))
    }
  }

  const handleScreenShareStateChange = useCallback((nextState: JitsiScreenShareState) => {
    const previous = screenShareStateRef.current
    const normalized: JitsiScreenShareState = {
      active: nextState.active,
      local: nextState.local,
      participantIds: Array.from(new Set(nextState.participantIds.filter(Boolean))),
    }
    const previousStablePresenterId = stableScreenPresenterIdRef.current
    const transition = resolveTrialScreenShareTransition(
      previous.active,
      previousStablePresenterId,
      normalized.active,
      normalized.participantIds,
    )
    stableScreenPresenterIdRef.current = transition.stablePresenterId
    const newShare = transition.newShare
    const presenterResolved = normalized.active
      && !previousStablePresenterId
      && Boolean(transition.stablePresenterId)

    screenShareStateRef.current = normalized
    setScreenShareState(normalized)

    if (!normalized.active) {
      screenFrameCaptureEpochRef.current += 1
      screenFrameCaptureRef.current = null
      screenFrameUrlRef.current = ''
      setScreenFrameUrl('')
      setScreenFrameState('idle')
      setScreenFrameError('')
      setScreenAnnotationOpen(false)
      return
    }

    setWhiteboardOpen(false)
    setScreenAnnotationOpen(true)

    if (newShare) {
      screenFrameCaptureEpochRef.current += 1
      screenFrameCaptureRef.current = null
      screenFrameUrlRef.current = ''
      setScreenFrameUrl('')
      setScreenFrameState('loading')
      setScreenFrameError('')
      screenUndoRef.current = []
      screenRedoRef.current = []
      syncScreenHistoryAvailability()
      if (manager && normalized.local) {
        const current = screenBoardRef.current
        const resetSnapshot = sanitizeBoardSnapshot({
          version: current.version + 1,
          generation: current.generation + 1,
          studentCanWrite: current.studentCanWrite,
          operations: [],
        })
        updateScreenBoard(resetSnapshot)
        scheduleSync(() => broadcastScreenSnapshot(resetSnapshot), 120)
      } else {
        updateScreenBoard({
          version: 0,
          generation: 0,
          studentCanWrite: false,
          operations: [],
        })
        scheduleSync(() => broadcastScreenBoard({ type: 'snapshot-request' }), 160)
      }
    }

    const capturePresenterId = normalized.participantIds[0]
      || (normalized.local ? localParticipantIdRef.current : '')
    if (capturePresenterId && (newShare || presenterResolved || !screenFrameUrlRef.current)) {
      scheduleSync(() => { void captureScreenShareFrame() }, 500)
    }
  }, [broadcastScreenBoard, broadcastScreenSnapshot, captureScreenShareFrame, manager, scheduleSync, syncScreenHistoryAvailability, updateScreenBoard])

  const refreshSharedScreenFrame = useCallback(async () => {
    if (!manager || !screenShareStateRef.current.local) {
      toast.warning('Chỉ gia sư đang chia sẻ mới có thể đổi khung bài giảng cho cả lớp.')
      return
    }
    await captureScreenShareFrame()
    broadcastScreenBoard({ type: 'frame-refresh' })
  }, [broadcastScreenBoard, captureScreenShareFrame, manager])

  const handleSendGift = useCallback((kind: GiftKind) => {
    if (!access || !isManager(access.role)) return
    const event: GiftEvent = {
      namespace: TRIAL_GIFT_NAMESPACE,
      id: createBoardId('gift'),
      kind,
      senderName: access.displayName,
      sentAt: Date.now(),
    }
    showGift(event)
    void broadcastJitsiTextMessage(apiRef.current, JSON.stringify(event), localParticipantIdRef.current)
  }, [access, showGift])

  const handleEndRoom = async () => {
    if (!access || !manager || endingRoom) return
    setEndingRoom(true)
    try {
      await endOnlineTrialClass(trialClassId)
      try {
        apiRef.current?.executeCommand('endConference')
      } catch {
        apiRef.current?.executeCommand('hangup')
      }
      setShowEndConfirm(false)
      setLoadState('ended')
      toast.success('Đã kết thúc phòng học thử cho tất cả mọi người.')
    } catch (error) {
      toast.error(onlineTrialClassErrorMessage(error))
    } finally {
      setEndingRoom(false)
    }
  }

  if (!effectiveJoinRequested) {
    return (
      <GuestJoinCard
        roomId={trialClassId}
        initialName={initialGuestName}
        busy={false}
        error=""
        onJoin={handleGuestJoin}
      />
    )
  }
  if (loadState === 'idle' || loadState === 'loading') return <ClassroomLoading />
  if (loadState === 'ended') {
    return <ClassroomStatePage title="Phòng học đã kết thúc" message="Link này đã được Admin hoặc gia sư đóng. Trial Class không phát sinh buổi dạy, phút học hoặc lương." />
  }
  if (loadState === 'error' || !access) {
    if (!authenticatedManager) {
      return (
        <GuestJoinCard
          roomId={trialClassId}
          initialName={guestName}
          busy={false}
          error={pageError}
          onJoin={(displayName) => {
            setGuestName(displayName)
            setJoinRequested(true)
            void loadAccess(displayName)
          }}
        />
      )
    }
    return <ClassroomStatePage title="Chưa thể mở phòng học" message={pageError || 'Phòng học chưa sẵn sàng.'} actionLabel="Thử lại" onAction={() => void loadAccess()} />
  }
  const screenSnapshotAuthority = manager && screenShareState.active && screenShareState.local

  return (
    <div className="min-h-[100dvh] bg-[#f6f8fb] font-[var(--font-quicksand)] text-[#10213a]">
      <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <Logo className="h-8 w-auto" />
            <span className="hidden h-8 w-px bg-slate-200 sm:block" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-black sm:text-lg">{access.title || 'Phòng học thử trực tuyến'}</h1>
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-sky-800">Trial Class</span>
              </div>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{roleLabel(access.role)} · không liên kết booking</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {conferenceJoined && (
              <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 font-mono text-xs font-black tabular-nums text-white" title="Chỉ là thời gian đang ở trong phòng, không dùng tính lương">
                <Clock3 className="h-4 w-4 text-amber-300" />
                {formatElapsed(elapsedSeconds)}
              </span>
            )}
            <span className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-extrabold ${connectionState === 'connected' ? 'bg-emerald-50 text-emerald-800' : connectionState === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
              {connectionState === 'connected' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {connectionLabel(connectionState)}
            </span>
            {manager && (
              <Button variant="outline" size="sm" onClick={() => void handleCopyLink()} className="border-sky-200 bg-sky-50 text-sky-800">
                <Copy className="h-4 w-4" />
                <span className="hidden sm:inline">Sao chép link lớp</span>
              </Button>
            )}
            {manager && (
              <Button variant="danger" size="sm" onClick={() => setShowEndConfirm(true)}>
                Kết thúc lớp
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className={`mx-auto max-w-[1800px] px-3 py-3 sm:px-5 sm:py-5 ${meetingExpanded ? 'max-w-none p-0' : ''}`}>
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold leading-5 text-emerald-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Trial Class độc lập: thời gian hiển thị chỉ hỗ trợ theo dõi cuộc gọi, không cộng/trừ phút, không tạo buổi dạy và không tính lương.</p>
        </div>

        <section className={`${meetingExpanded ? 'fixed inset-0 z-[80] flex h-[100dvh] flex-col rounded-none p-2' : 'relative flex flex-col rounded-[1.75rem] p-2.5'} overflow-hidden bg-[#080b10] text-white shadow-[0_30px_80px_-48px_rgba(2,6,23,0.95)]`}>
          <div className="mb-2.5 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[#10151d] px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${screenShareState.active ? 'animate-pulse bg-emerald-400' : connectionState === 'connected' ? 'bg-sky-400' : 'bg-slate-500'}`} />
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{screenShareState.active ? 'Đang trình chiếu bài học' : 'Lớp học thử trực tiếp 123English'}</p>
                {!controlsCollapsed && <p className="truncate text-[11px] font-semibold text-slate-400">{remoteParticipantCount + (conferenceJoined ? 1 : 0)} người · {roleLabel(access.role)}</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {conferenceJoined && (
                <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-2.5 font-mono text-xs font-black tabular-nums">
                  <Clock3 className="h-4 w-4 text-amber-300" />
                  {formatElapsed(elapsedSeconds)}
                </span>
              )}
              {manager && !controlsCollapsed && (
                <button
                  type="button"
                  disabled={!conferenceJoined}
                  onClick={() => apiRef.current?.executeCommand('toggleShareScreen')}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-45 ${screenShareState.local ? 'bg-rose-500 text-white' : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'}`}
                >
                  <MonitorUp className="h-4 w-4" />
                  <span className="hidden sm:inline">{screenShareState.local ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}</span>
                </button>
              )}
              {!controlsCollapsed && (
                <button
                  type="button"
                  disabled={!conferenceJoined}
                  onClick={() => apiRef.current?.executeCommand('toggleVirtualBackgroundDialog')}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-black hover:bg-white/15 disabled:opacity-45"
                >
                  <Sparkles className="h-4 w-4 text-fuchsia-300" />
                  <span className="hidden sm:inline">Hiệu ứng nền</span>
                </button>
              )}
              {screenShareState.active && (
                <button
                  type="button"
                  onClick={() => {
                    setWhiteboardOpen(false)
                    setScreenAnnotationOpen(true)
                    if (!screenFrameUrlRef.current) scheduleSync(() => { void captureScreenShareFrame() }, 0)
                  }}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black ${screenAnnotationOpen ? 'border-cyan-300 bg-cyan-300 text-slate-950' : 'border-cyan-300/30 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20'}`}
                >
                  <PenLine className="h-4 w-4" />
                  <span className={controlsCollapsed ? 'sr-only' : 'hidden sm:inline'}>Chú thích màn hình</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setScreenAnnotationOpen(false)
                  setWhiteboardOpen(true)
                }}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black ${whiteboardOpen ? 'border-amber-300 bg-amber-300 text-slate-950' : 'border-white/15 bg-white/10 text-white hover:bg-white/15'}`}
              >
                <PenLine className="h-4 w-4" />
                <span className={controlsCollapsed ? 'sr-only' : 'hidden sm:inline'}>Bảng trắng</span>
              </button>
              <button
                type="button"
                onClick={() => setControlsCollapsed((current) => !current)}
                className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 hover:bg-white/15"
                aria-label={controlsCollapsed ? 'Hiện điều khiển' : 'Thu gọn điều khiển'}
              >
                {controlsCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setMeetingExpanded((current) => !current)}
                className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 hover:bg-white/15"
                aria-label={meetingExpanded ? 'Thoát toàn màn hình' : 'Mở toàn màn hình'}
              >
                {meetingExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {manager && knockingParticipants.length > 0 && (
            <div className="mb-2.5 rounded-2xl border border-sky-300/30 bg-sky-400/10 p-3" role="status" aria-live="polite">
              <p className="flex items-center gap-2 text-xs font-black text-sky-100"><Users className="h-4 w-4" />Có người đang xin vào lớp</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {knockingParticipants.map((participant) => (
                  <div key={participant.id} className="flex min-w-0 flex-1 basis-[280px] items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2">
                    <p className="min-w-0 truncate text-sm font-extrabold">{participant.name}</p>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => handleAnswerKnocking(participant.id, false)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-300/25 bg-rose-500/15 px-3 text-xs font-black text-rose-100 hover:bg-rose-500/25"><UserX className="h-4 w-4" />Từ chối</button>
                      <button type="button" onClick={() => handleAnswerKnocking(participant.id, true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-400 px-3 text-xs font-black text-slate-950 hover:bg-emerald-300"><UserCheck className="h-4 w-4" />Cho vào</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {manager && !controlsCollapsed && conferenceJoined && (
            <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-black text-slate-300"><Gift className="h-4 w-4 text-amber-300" />Tặng động lực:</span>
              {(Object.keys(GIFT_META) as GiftKind[]).map((kind) => (
                <button key={kind} type="button" onClick={() => handleSendGift(kind)} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-extrabold hover:bg-white/15">
                  <span aria-hidden="true">{GIFT_META[kind].icon}</span>{GIFT_META[kind].label}
                </button>
              ))}
            </div>
          )}

          <div className={`${meetingExpanded ? 'min-h-0 flex-1' : 'h-[min(74dvh,820px)] min-h-[520px]'}`}>
            <JitsiClassroom
              meetingProvider={access.meetingProvider}
              meetingDomain={access.meetingDomain}
              meetingAppId={access.meetingAppId}
              meetingJwt={access.meetingJwt}
              roomName={access.roomName}
              displayName={access.displayName}
              observerMode={access.role === 'admin'}
              canShareScreen={manager}
              manageWaitingRoom={manager}
              endedDescription="Bảng trắng của Trial Class chỉ đồng bộ trong lúc phiên học còn kết nối. Bạn có thể vào lại nếu lớp chưa bị kết thúc."
              onApiReady={(api) => {
                apiRef.current = api
                if (!api) {
                  localParticipantIdRef.current = ''
                  participantIdsRef.current = new Set()
                  screenShareStateRef.current = EMPTY_SCREEN_SHARE
                  stableScreenPresenterIdRef.current = ''
                  screenFrameCaptureEpochRef.current += 1
                  screenFrameCaptureRef.current = null
                  screenFrameUrlRef.current = ''
                  participantModeratorCacheRef.current.clear()
                  participantModeratorPromiseRef.current.clear()
                  snapshotRequestAtRef.current.clear()
                  setRemoteParticipantCount(0)
                  setDataChannelReady(false)
                  setWaitingRoomReady(false)
                  setScreenShareState(EMPTY_SCREEN_SHARE)
                  setScreenAnnotationOpen(false)
                  setScreenFrameUrl('')
                  setScreenFrameState('idle')
                  setScreenFrameError('')
                }
              }}
              onConferenceJoined={(participantId) => {
                localParticipantIdRef.current = participantId
                setConferenceJoined(true)
                setConferenceStartedAt(Date.now())
              }}
              onParticipantJoined={(participantId) => {
                participantIdsRef.current.add(participantId)
                setRemoteParticipantCount(participantIdsRef.current.size)
                if (manager) scheduleSync(() => {
                  broadcastSnapshot()
                  if (isScreenSnapshotAuthority()) broadcastScreenSnapshot()
                  void broadcastBoardBackground()
                }, 350)
              }}
              onParticipantLeft={(participantId) => {
                participantIdsRef.current.delete(participantId)
                participantModeratorCacheRef.current.delete(participantId)
                participantModeratorPromiseRef.current.delete(participantId)
                snapshotRequestAtRef.current.delete(participantId)
                snapshotRequestAtRef.current.delete(`${participantId}:board`)
                snapshotRequestAtRef.current.delete(`${participantId}:screen`)
                setRemoteParticipantCount(participantIdsRef.current.size)
                setKnockingParticipants((current) => current.filter((participant) => participant.id !== participantId))
              }}
              onWaitingRoomReadyChange={setWaitingRoomReady}
              onKnockingParticipant={(participant) => setKnockingParticipants((current) => {
                const exists = current.some((candidate) => candidate.id === participant.id)
                return exists ? current.map((candidate) => candidate.id === participant.id ? participant : candidate) : [...current, participant]
              })}
              onDataChannelOpened={() => {
                setDataChannelReady(true)
                const boardPayload: BoardMessagePayload = manager
                  ? { type: 'snapshot', snapshot: boardRef.current }
                  : { type: 'snapshot-request' }
                const screenPayload: BoardMessagePayload = isScreenSnapshotAuthority()
                  ? { type: 'snapshot', snapshot: screenBoardRef.current }
                  : { type: 'snapshot-request' }
                const serialized = [
                  serializeBoardMessage(makeBoardMessage(trialClassId, access.role, boardPayload)),
                  serializeBoardMessage(makeBoardMessage(trialClassId, access.role, screenPayload, 'screen')),
                ].filter((value): value is string => Boolean(value))
                if (serialized.length > 0) {
                  void broadcastJitsiTextMessages(apiRef.current, serialized, localParticipantIdRef.current)
                }
                if (manager && boardBackgroundRef.current) {
                  scheduleSync(() => void broadcastBoardBackground(boardBackgroundRef.current), 250)
                }
              }}
              onTextMessage={(text, senderId) => { void handleRealtimeText(text, senderId) }}
              onScreenShareStateChange={handleScreenShareStateChange}
              onConnectionStateChange={(nextState) => {
                setConnectionState(nextState)
                if (nextState === 'ended' || nextState === 'error') {
                  setConferenceJoined(false)
                  setConferenceStartedAt(0)
                  setElapsedSeconds(0)
                  setDataChannelReady(false)
                  screenShareStateRef.current = EMPTY_SCREEN_SHARE
                  stableScreenPresenterIdRef.current = ''
                  screenFrameCaptureEpochRef.current += 1
                  screenFrameCaptureRef.current = null
                  screenFrameUrlRef.current = ''
                  setScreenShareState(EMPTY_SCREEN_SHARE)
                  setScreenAnnotationOpen(false)
                  setScreenFrameUrl('')
                  setScreenFrameState('idle')
                  setScreenFrameError('')
                  setWaitingRoomReady(false)
                }
              }}
              onEnded={() => {
                setConferenceJoined(false)
                setConferenceStartedAt(0)
                setElapsedSeconds(0)
                setConnectionState('ended')
                setDataChannelReady(false)
                screenShareStateRef.current = EMPTY_SCREEN_SHARE
                stableScreenPresenterIdRef.current = ''
                screenFrameCaptureEpochRef.current += 1
                screenFrameCaptureRef.current = null
                screenFrameUrlRef.current = ''
                setScreenShareState(EMPTY_SCREEN_SHARE)
                setScreenAnnotationOpen(false)
                setScreenFrameUrl('')
                setScreenFrameState('idle')
                setScreenFrameError('')
              }}
              onError={(message) => toast.error(message)}
            />
          </div>

          {manager && conferenceJoined && !waitingRoomReady && (
            <p className="mt-2 text-center text-[11px] font-semibold text-amber-200">Đang kết nối bộ điều khiển phòng chờ; link vẫn được bảo vệ và học viên phải chờ duyệt.</p>
          )}
        </section>
      </main>

      {screenAnnotationOpen && screenShareState.active && (
        <div className="fixed inset-0 z-[95] bg-slate-950/80 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label="Chú thích trên màn hình chia sẻ">
          <div className="mx-auto h-full max-w-[1680px]">
            <ScreenShareAnnotationStage
              frameUrl={screenFrameUrl}
              loading={screenFrameState === 'loading'}
              error={screenFrameError}
              canRefreshFrame={manager && screenShareState.local}
              onRefresh={refreshSharedScreenFrame}
              onReturnToLive={() => setScreenAnnotationOpen(false)}
              showReturnToLiveOnDesktop
              returnToLiveLabel="Thu nhỏ"
              snapshot={screenBoardSnapshot}
              role={access.role}
              canUndo={screenSnapshotAuthority && screenHistoryAvailability.canUndo}
              canRedo={screenSnapshotAuthority && screenHistoryAvailability.canRedo}
              saveStatus={dataChannelReady ? 'saved' : 'error'}
              pendingOperationCount={0}
              onOperation={handleScreenBoardOperation}
              onUndo={handleScreenUndo}
              onRedo={handleScreenRedo}
              onClear={handleScreenClear}
              onStudentCanWriteChange={handleScreenStudentWriteChange}
              onSave={() => {
                if (!isScreenSnapshotAuthority()) return
                broadcastScreenSnapshot()
                toast.success('Đã đồng bộ lớp chú thích tới người đang ở trong phòng.')
              }}
            />
          </div>
        </div>
      )}

      {whiteboardOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/75 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label="Bảng trắng tương tác">
          <div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 px-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#10213a]">Bảng trắng tương tác</p>
                <p className="text-[11px] font-semibold text-slate-500">{dataChannelReady ? 'Chụp màn hình rồi Ctrl + V để cả hai cùng viết lên ảnh' : 'Đang chờ kênh đồng bộ cuộc gọi'}</p>
              </div>
              <button type="button" onClick={() => setWhiteboardOpen(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Thu nhỏ bảng trắng"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 p-2 sm:p-3">
              <CollaborativeWhiteboard
                snapshot={boardSnapshot}
                role={access.role}
                backgroundImageUrl={boardBackground?.dataUrl}
                backgroundImageAlt={boardBackground?.sourceName || 'Ảnh bài học trên bảng trắng'}
                backgroundImageFit="fill"
                canUndo={historyAvailability.canUndo}
                canRedo={historyAvailability.canRedo}
                saveStatus={dataChannelReady ? 'saved' : 'error'}
                pendingOperationCount={0}
                saveActionLabel="Đồng bộ lại cho cả lớp"
                onOperation={handleBoardOperation}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onClear={handleClearBoard}
                onStudentCanWriteChange={handleStudentWriteChange}
                onSave={() => {
                  broadcastSnapshot()
                  toast.success('Đã đồng bộ bảng trắng tới người đang ở trong phòng.')
                }}
                headerActions={(
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={pastingImage || !dataChannelReady || (access.role === 'student' && !boardSnapshot.studentCanWrite)}
                      onClick={() => void readImageFromClipboard()}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-extrabold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Chụp màn hình rồi dùng nút này hoặc nhấn Ctrl + V"
                    >
                      {pastingImage ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
                      {pastingImage ? 'Đang nén ảnh' : 'Dán ảnh (Ctrl + V)'}
                    </button>
                    {boardBackground && (
                      <button type="button" onClick={clearBoardBackground} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50">
                        <ImageOff className="h-4 w-4" />Gỡ ảnh
                      </button>
                    )}
                    <button type="button" onClick={() => setWhiteboardOpen(false)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50">
                      <Minimize2 className="h-4 w-4" />Thu nhỏ
                    </button>
                  </div>
                )}
              />
            </div>
          </div>
        </div>
      )}

      {activeGift && (
        <div className="pointer-events-none fixed inset-x-4 top-[18%] z-[120] flex justify-center" aria-live="polite">
          <div className="animate-bounce rounded-3xl border border-amber-200/70 bg-slate-950/92 px-6 py-5 text-center text-white shadow-[0_24px_80px_-28px_rgba(245,158,11,.9)] backdrop-blur-xl">
            <div className="text-6xl drop-shadow-lg" aria-hidden="true">{GIFT_META[activeGift.kind].icon}</div>
            <p className="mt-2 text-lg font-black">{GIFT_META[activeGift.kind].message}</p>
            <p className="mt-1 text-xs font-semibold text-amber-200">Từ {activeGift.senderName}</p>
          </div>
        </div>
      )}

      <Modal
        open={showEndConfirm}
        onClose={() => { if (!endingRoom) setShowEndConfirm(false) }}
        title="Kết thúc Trial Class?"
        size="sm"
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShowEndConfirm(false)} disabled={endingRoom}>Tiếp tục lớp</Button>
            <Button variant="danger" loading={endingRoom} onClick={() => void handleEndRoom()}>Kết thúc cho tất cả</Button>
          </div>
        )}
      >
        <p className="text-sm leading-6 text-slate-600">Mọi người sẽ rời cuộc gọi và link này không thể dùng để vào lại. Thao tác không tạo buổi dạy, không trừ phút và không tính lương.</p>
      </Modal>
    </div>
  )
}

export function TrialClassroomPage() {
  const { trialClassId = '' } = useParams<{ trialClassId: string }>()
  return <TrialClassroomRoom key={trialClassId} trialClassId={trialClassId} />
}
