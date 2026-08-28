import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  CircleStop,
  Copy,
  ExternalLink,
  FileVideo2,
  Info,
  LockKeyhole,
  MonitorUp,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Video,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { CollaborativeWhiteboard } from '@/components/classroom/CollaborativeWhiteboard'
import {
  ClassroomGiftOverlay,
  ClassroomGiftTray,
} from '@/components/classroom/ClassroomGiftExperience'
import {
  JitsiClassroom,
  type JitsiConnectionState,
} from '@/components/classroom/JitsiClassroom'
import { Logo } from '@/components/shared/Logo'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  MAX_BOARD_OPERATIONS,
  isBoardManager,
  makeBoardMessage,
  parseBoardMessage,
  sanitizeBoardSnapshot,
  serializeBoardMessage,
  toCallableBoardDraft,
  type BoardMessagePayload,
  type BoardOperation,
  type ValidatedBoardSnapshot,
} from '@/lib/classroomBoard'
import {
  onlineClassroomErrorMessage,
  forgetClassroomToken,
  appendOnlineClassroomBoardOperation,
  readClassroomToken,
  rememberClassroomToken,
  removeClassroomTokenFromAddressBar,
  requestOnlineClassroomRecordingConsent,
  requestOnlineClassroomAccess,
  respondOnlineClassroomRecordingConsent,
  saveOnlineClassroomBoard,
  type OnlineClassroomAccess,
} from '@/lib/onlineClassroom'
import { toast } from '@/stores/toastStore'
import { broadcastJitsiTextMessage, type JitsiExternalApi } from '@/lib/jitsiExternalApi'
import {
  ClassroomRecordingUploadError,
  GcsResumableUploader,
  createClassroomRecordingCapture,
  type ClassroomRecordingCapture,
} from '@/lib/classroomRecordingUploader'
import {
  abandonOnlineClassroomRecording,
  createOnlineClassroomRecordingShareLink,
  finalizeOnlineClassroomRecording,
  getOnlineClassroomRecordingForBooking,
  onlineClassroomRecordingErrorMessage,
  startOnlineClassroomRecording,
  touchOnlineClassroomRecordingUpload,
  type OnlineClassroomRecordingMetadata,
  type OnlineClassroomRecordingSummary,
} from '@/lib/onlineClassroomRecording'
import { useOnlineClassroomGifts } from '@/hooks/useOnlineClassroomGifts'

type LoadState = 'loading' | 'ready' | 'error'
type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error'
type ActivePanel = 'video' | 'board'
type RecordingState = 'idle' | 'starting' | 'recording' | 'stopping'
type RecordingHydrationState = 'idle' | 'loading' | 'ready' | 'error'
type ReadyRecording = OnlineClassroomRecordingMetadata & {
  replayUrl: string
  studentShareUrl?: string
}
type ClassroomRouteScope = Readonly<{
  bookingId: string
  routeEpoch: object
  loadEpoch: number
}>
type BoardSavePipeline = {
  scope: ClassroomRouteScope
  queued: boolean
  promise: Promise<boolean>
}
type StudentOperationPipeline = {
  scope: ClassroomRouteScope
  promise: Promise<void>
}
type BoardRefreshPipeline = {
  scope: ClassroomRouteScope
  queued: boolean
  promise: Promise<void>
}

const EMPTY_BOARD: ValidatedBoardSnapshot = {
  version: 0,
  studentCanWrite: true,
  operations: [],
}
const REVALIDATE_INTERVAL_MS = 60_000
const BOARD_SYNC_INTERVAL_MS = 5_000
const MAX_HISTORY_ENTRIES = 50
const MAX_RECORDING_DURATION_MS = 3 * 60 * 60 * 1000
const RECORDING_HEARTBEAT_INTERVAL_MS = 60_000
const RECORDING_HEARTBEAT_BYTE_STEP = 8 * 1024 * 1024

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return ''
  return typeof error.code === 'string' ? error.code.replace(/^functions\//, '') : ''
}

function isHardAccessFailure(error: unknown): boolean {
  return ['permission-denied', 'unauthenticated', 'failed-precondition', 'not-found', 'invalid-argument']
    .includes(errorCode(error))
}

function safeExternalUrl(raw: string): string {
  if (!raw || typeof window === 'undefined') return ''
  try {
    const url = new URL(raw, window.location.origin)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

function formatSessionDate(raw: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return raw
  return `${match[3]}/${match[2]}/${match[1]}`
}

function formatConsentExpiry(raw: string | null | undefined): string {
  if (!raw) return ''
  const date = new Date(raw)
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''
}

function roleLabel(role: OnlineClassroomAccess['role']): string {
  if (role === 'admin') return 'Admin quan sát'
  if (role === 'teacher') return 'Gia sư'
  return 'Học viên'
}

function connectionLabel(state: JitsiConnectionState): string {
  if (state === 'connected') return 'Đã kết nối'
  if (state === 'joining') return 'Đang vào lớp'
  if (state === 'ended') return 'Đã rời cuộc gọi'
  if (state === 'error') return 'Lỗi cuộc gọi'
  return 'Đang tải'
}

function recordingMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || ''
}

function formatRecordingBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const megabytes = bytes / (1024 * 1024)
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`
}

function nestedDomExceptionName(error: unknown): string {
  if (error instanceof DOMException) return error.name
  if (error instanceof ClassroomRecordingUploadError && error.cause instanceof DOMException) {
    return error.cause.name
  }
  return ''
}

function ClassroomPageSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-[#f6f8fb] font-[var(--font-quicksand)] text-[#10213a]">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-6">
          <Logo clickable={false} className="h-8 w-auto" />
          <div className="h-9 w-36 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </header>
      <main className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6">
        <div className="mb-4 h-24 animate-pulse rounded-3xl border border-slate-200 bg-white" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-[560px] animate-pulse rounded-3xl bg-slate-900" />
          <div className="h-[560px] animate-pulse rounded-3xl border border-slate-200 bg-white" />
        </div>
      </main>
    </div>
  )
}

function ClassroomErrorPage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f6f8fb] px-4 font-[var(--font-quicksand)] text-[#10213a]">
      <main className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-7 text-center shadow-[0_28px_80px_-52px_rgba(16,33,58,0.6)] sm:p-10">
        <Logo clickable={false} className="mx-auto h-9 w-auto" />
        <span className="mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-800 ring-1 ring-amber-100">
          <LockKeyhole className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-2xl font-black tracking-[-0.03em]">Chưa thể vào lớp học</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{message}</p>
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={onRetry} className="bg-[#ffc107] text-[#10213a] hover:bg-amber-400 focus:ring-amber-300">
            <RefreshCw className="h-4 w-4" />
            Thử lại
          </Button>
          <Link to="/" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300">
            Về trang chính
          </Link>
        </div>
      </main>
    </div>
  )
}

export function OnlineClassroomPage() {
  const { bookingId = '' } = useParams<{ bookingId: string }>()
  // The object identity is the route epoch. Unlike a booking-id-only check it
  // also fences a route that is left and later reopened with the same id.
  const routeEpoch = useMemo(() => ({ bookingId }), [bookingId])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadStateRouteEpoch, setLoadStateRouteEpoch] = useState(routeEpoch)
  const [pageError, setPageError] = useState('')
  const [fatalAccessError, setFatalAccessError] = useState('')
  const [access, setAccess] = useState<OnlineClassroomAccess | null>(null)
  const [classroomToken, setClassroomToken] = useState('')
  const [board, setBoard] = useState<ValidatedBoardSnapshot>(EMPTY_BOARD)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [connectionState, setConnectionState] = useState<JitsiConnectionState>('loading')
  const [conferenceJoined, setConferenceJoined] = useState(false)
  const [remoteParticipantCount, setRemoteParticipantCount] = useState(0)
  const [activePanel, setActivePanel] = useState<ActivePanel>('video')
  const [revalidationWarning, setRevalidationWarning] = useState('')
  const [syncWarning, setSyncWarning] = useState('')
  const [showRecordingConsent, setShowRecordingConsent] = useState(false)
  const [recordingSetupConfirmed, setRecordingSetupConfirmed] = useState(false)
  const [recordingConsentBusy, setRecordingConsentBusy] = useState(false)
  const [recordingConsentError, setRecordingConsentError] = useState('')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [recordingError, setRecordingError] = useState('')
  const [recordingUploadedBytes, setRecordingUploadedBytes] = useState(0)
  const [readyRecording, setReadyRecording] = useState<ReadyRecording | null>(null)
  const [existingRecording, setExistingRecording] = useState<OnlineClassroomRecordingSummary | null>(null)
  const [recordingHydrationState, setRecordingHydrationState] = useState<RecordingHydrationState>('idle')
  const [recordingHydrationError, setRecordingHydrationError] = useState('')
  const [creatingReadyShareLink, setCreatingReadyShareLink] = useState(false)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [pendingStudentOperationCount, setPendingStudentOperationCount] = useState(0)

  const accessRef = useRef<OnlineClassroomAccess | null>(null)
  const boardRef = useRef<ValidatedBoardSnapshot>(EMPTY_BOARD)
  const tokenRef = useRef('')
  const jitsiApiRef = useRef<JitsiExternalApi | null>(null)
  const localParticipantIdRef = useRef('')
  const remoteParticipantIdsRef = useRef(new Set<string>())
  const dataChannelReadyRef = useRef(false)
  const connectionStateRef = useRef<JitsiConnectionState>('loading')
  const seenMessageIdsRef = useRef(new Set<string>())
  const pendingStudentOperationsRef = useRef<BoardOperation[]>([])
  const pendingOperationFlushRef = useRef<StudentOperationPipeline | null>(null)
  const undoHistoryRef = useRef<BoardOperation[][]>([])
  const redoHistoryRef = useRef<BoardOperation[][]>([])
  const saveTimerRef = useRef<number | null>(null)
  const savePipelineRef = useRef<BoardSavePipeline | null>(null)
  const savedVersionRef = useRef(0)
  const revalidationInFlightRef = useRef<ClassroomRouteScope | null>(null)
  const consecutiveRevalidationFailuresRef = useRef(0)
  const classroomLoadEpochRef = useRef(0)
  const bookingIdRef = useRef(bookingId)
  const activeRouteEpochRef = useRef(routeEpoch)
  const fatalAccessErrorRef = useRef('')
  const conferenceJoinedRef = useRef(false)
  const boardRefreshInFlightRef = useRef<BoardRefreshPipeline | null>(null)
  const boardRefreshTimerRef = useRef<number | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingCaptureRef = useRef<ClassroomRecordingCapture | null>(null)
  const recordingUploaderRef = useRef<GcsResumableUploader | null>(null)
  const recordingSessionRef = useRef<{ recordingId: string; replayUrl: string; maxBytes: number } | null>(null)
  const recordingFailureRef = useRef<{ attempt: number; error: unknown } | null>(null)
  const recordingDurationTimerRef = useRef<number | null>(null)
  const recordingHydrationEpochRef = useRef(0)
  const recordingConsentBusyRef = useRef<ClassroomRouteScope | null>(null)
  const readyShareBusyRef = useRef<ClassroomRouteScope | null>(null)
  const recordingAttemptRef = useRef(0)
  const recordingStartLockRef = useRef(false)
  const unmountingRef = useRef(false)

  useLayoutEffect(() => {
    bookingIdRef.current = bookingId
    activeRouteEpochRef.current = routeEpoch
  }, [bookingId, routeEpoch])

  const captureRouteScope = useCallback((): ClassroomRouteScope => ({
    bookingId,
    routeEpoch,
    loadEpoch: classroomLoadEpochRef.current,
  }), [bookingId, routeEpoch])

  const isRouteScopeActive = useCallback((scope: ClassroomRouteScope): boolean => (
    activeRouteEpochRef.current === scope.routeEpoch
    && bookingIdRef.current === scope.bookingId
    && classroomLoadEpochRef.current === scope.loadEpoch
  ), [])

  const loadStateMatchesRoute = loadStateRouteEpoch === routeEpoch
  const accessMatchesRoute = loadStateMatchesRoute && access?.bookingId === bookingId
  const manager = accessMatchesRoute && access ? isBoardManager(access.role) : false
  const curriculumUrl = useMemo(
    () => safeExternalUrl(accessMatchesRoute ? access?.curriculumLink || '' : ''),
    [access?.curriculumLink, accessMatchesRoute],
  )
  const recordingSupported = useMemo(() => {
    if (typeof navigator === 'undefined' || typeof MediaRecorder === 'undefined') return false
    const chromium = /Chrome\//.test(navigator.userAgent) || /Edg\//.test(navigator.userAgent)
    return chromium
      && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
      && typeof navigator.mediaDevices?.getUserMedia === 'function'
  }, [])

  const broadcastGiftSignal = useCallback(async (message: string): Promise<boolean> => {
    if (connectionStateRef.current !== 'connected'
      || !dataChannelReadyRef.current
      || !localParticipantIdRef.current) return false
    try {
      return (await broadcastJitsiTextMessage(
        jitsiApiRef.current,
        message,
        localParticipantIdRef.current,
      )) > 0
    } catch {
      return false
    }
  }, [])

  const classroomGifts = useOnlineClassroomGifts({
    bookingId,
    role: accessMatchesRoute ? access?.role || 'student' : 'student',
    token: classroomToken || undefined,
    enabled: loadState === 'ready' && accessMatchesRoute && !fatalAccessError,
    broadcastSignal: broadcastGiftSignal,
  })

  const replaceBoard = useCallback((nextBoard: ValidatedBoardSnapshot, nextSaveStatus?: SaveStatus) => {
    boardRef.current = nextBoard
    setBoard(nextBoard)
    if (nextSaveStatus) setSaveStatus(nextSaveStatus)
  }, [])

  const resetHistory = useCallback(() => {
    undoHistoryRef.current = []
    redoHistoryRef.current = []
    setHistoryState({ canUndo: false, canRedo: false })
  }, [])

  const rememberForUndo = useCallback((operations: BoardOperation[]) => {
    undoHistoryRef.current = [...undoHistoryRef.current.slice(-(MAX_HISTORY_ENTRIES - 1)), operations]
    redoHistoryRef.current = []
    setHistoryState({ canUndo: true, canRedo: false })
  }, [])

  const loadClassroom = useCallback(async () => {
    const loadEpoch = ++classroomLoadEpochRef.current
    const targetBookingId = bookingId
    setLoadStateRouteEpoch(routeEpoch)
    if (!bookingId) {
      setPageError('Mã buổi học không hợp lệ.')
      setLoadState('error')
      return
    }

    setLoadState('loading')
    setPageError('')
    setFatalAccessError('')
    fatalAccessErrorRef.current = ''
    setAccess(null)
    accessRef.current = null
    setClassroomToken('')
    setReadyRecording(null)
    setExistingRecording(null)
    setRecordingHydrationState('idle')
    setRecordingHydrationError('')
    setCreatingReadyShareLink(false)
    readyShareBusyRef.current = null
    recordingHydrationEpochRef.current += 1
    setRecordingError('')
    setRecordingConsentError('')
    setRecordingConsentBusy(false)
    recordingConsentBusyRef.current = null
    setRecordingSetupConfirmed(false)
    setRecordingState('idle')
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    if (boardRefreshTimerRef.current !== null) window.clearTimeout(boardRefreshTimerRef.current)
    boardRefreshTimerRef.current = null
    seenMessageIdsRef.current = new Set()
    pendingStudentOperationsRef.current = []
    setPendingStudentOperationCount(0)
    localParticipantIdRef.current = ''
    remoteParticipantIdsRef.current = new Set()
    setRemoteParticipantCount(0)
    setConferenceJoined(false)
    conferenceJoinedRef.current = false
    dataChannelReadyRef.current = false
    try {
      const fragmentOrStoredToken = readClassroomToken(bookingId)
      tokenRef.current = fragmentOrStoredToken
      setClassroomToken(fragmentOrStoredToken)

      const result = await requestOnlineClassroomAccess(bookingId, fragmentOrStoredToken || undefined)
      if (loadEpoch !== classroomLoadEpochRef.current || targetBookingId !== bookingIdRef.current) return
      if (fragmentOrStoredToken) rememberClassroomToken(bookingId, fragmentOrStoredToken)
      removeClassroomTokenFromAddressBar()
      const initialBoard = sanitizeBoardSnapshot(result.boardSnapshot)
      accessRef.current = result
      boardRef.current = initialBoard
      savedVersionRef.current = initialBoard.version
      setAccess(result)
      setBoard(initialBoard)
      setSaveStatus('saved')
      resetHistory()
      setLoadState('ready')
    } catch (error) {
      if (loadEpoch !== classroomLoadEpochRef.current || targetBookingId !== bookingIdRef.current) return
      const code = errorCode(error)
      if (!window.location.hash && ['permission-denied', 'not-found'].includes(code)) {
        forgetClassroomToken(bookingId)
      }
      setPageError(onlineClassroomErrorMessage(error))
      setLoadState('error')
    }
  }, [bookingId, resetHistory, routeEpoch])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadClassroom(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadClassroom])

  useEffect(() => {
    if (!accessMatchesRoute || !access) return
    document.title = `${access.subjectName || 'Lớp học trực tuyến'} | 123English`
  }, [access, accessMatchesRoute])

  const hydrateExistingRecording = useCallback(async () => {
    const current = accessRef.current
    if (!current || current.bookingId !== bookingId || !isBoardManager(current.role)) return
    const hydrationEpoch = ++recordingHydrationEpochRef.current
    const targetBookingId = bookingId
    setRecordingHydrationState('loading')
    setRecordingHydrationError('')
    try {
      const recording = await getOnlineClassroomRecordingForBooking(targetBookingId)
      if (hydrationEpoch !== recordingHydrationEpochRef.current || targetBookingId !== bookingIdRef.current) return
      setExistingRecording(recording)
      if (recording?.status === 'ready' && recording.viewUrl) {
        setReadyRecording({ ...recording, replayUrl: recording.viewUrl })
      }
      setRecordingHydrationState('ready')
    } catch (error) {
      if (hydrationEpoch !== recordingHydrationEpochRef.current || targetBookingId !== bookingIdRef.current) return
      setRecordingHydrationError(onlineClassroomRecordingErrorMessage(error))
      setRecordingHydrationState('error')
    }
  }, [bookingId])

  useEffect(() => {
    const current = accessRef.current
    if (loadState !== 'ready' || !current || current.bookingId !== bookingId || !isBoardManager(current.role)) return
    const timeout = window.setTimeout(() => void hydrateExistingRecording(), 0)
    return () => window.clearTimeout(timeout)
  }, [access?.role, bookingId, hydrateExistingRecording, loadState])

  useEffect(() => {
    const current = accessRef.current
    if (
      loadState !== 'ready'
      || !current
      || current.bookingId !== bookingId
      || !isBoardManager(current.role)
      || !existingRecording
      || existingRecording.status === 'ready'
    ) return
    const interval = window.setInterval(() => void hydrateExistingRecording(), 15_000)
    return () => window.clearInterval(interval)
  }, [bookingId, existingRecording, hydrateExistingRecording, loadState])

  const flushBoardSave = useCallback(async (): Promise<boolean> => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    if (
      !isRouteScopeActive(scope)
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
      || !isBoardManager(currentAccess.role)
    ) return false

    const existingPipeline = savePipelineRef.current
    if (existingPipeline && isRouteScopeActive(existingPipeline.scope)) {
      existingPipeline.queued = true
      return existingPipeline.promise
    }

    const pipeline: BoardSavePipeline = {
      scope,
      queued: false,
      promise: Promise.resolve(false),
    }
    const saveWork = (async () => {
      let successful = true
      try {
        do {
          if (!isRouteScopeActive(scope)) return false
          pipeline.queued = false
          const snapshotToSave = boardRef.current
          setSaveStatus('saving')
          const expectedVersion = savedVersionRef.current
          const token = tokenRef.current || undefined
          const result = await saveOnlineClassroomBoard(
            scope.bookingId,
            expectedVersion,
            toCallableBoardDraft(snapshotToSave),
            token,
          )
          if (!isRouteScopeActive(scope)) return false
          savedVersionRef.current = result.version
          if (boardRef.current === snapshotToSave) {
            replaceBoard({ ...snapshotToSave, version: result.version })
          } else if (boardRef.current.version <= result.version) {
            replaceBoard({ ...boardRef.current, version: result.version + 1 }, 'dirty')
          }
        } while (
          isRouteScopeActive(scope)
          && (pipeline.queued || boardRef.current.version > savedVersionRef.current)
        )

        if (!isRouteScopeActive(scope)) return false
        setSaveStatus(boardRef.current.version === savedVersionRef.current ? 'saved' : 'dirty')
      } catch (error) {
        if (!isRouteScopeActive(scope)) return false
        successful = false
        if (errorCode(error) === 'failed-precondition') {
          try {
            const latestAccess = await requestOnlineClassroomAccess(scope.bookingId, tokenRef.current || undefined)
            if (!isRouteScopeActive(scope) || latestAccess.bookingId !== scope.bookingId) return false
            const authoritativeBoard = sanitizeBoardSnapshot(latestAccess.boardSnapshot)
            accessRef.current = latestAccess
            setAccess(latestAccess)
            replaceBoard(authoritativeBoard, 'saved')
            savedVersionRef.current = authoritativeBoard.version
            resetHistory()
            toast.warning('Bảng đã được cập nhật ở một cửa sổ khác. Đã tải lại bản lưu mới nhất để tránh ghi đè.')
          } catch (refreshError) {
            if (!isRouteScopeActive(scope)) return false
            setSaveStatus('error')
            toast.error(`Chưa đồng bộ lại được bảng: ${onlineClassroomErrorMessage(refreshError)}`)
          }
        } else {
          setSaveStatus('error')
          toast.error(`Chưa lưu được bảng: ${onlineClassroomErrorMessage(error)}`)
        }
      }
      return successful
    })()
    pipeline.promise = saveWork
    savePipelineRef.current = pipeline
    try {
      return await saveWork
    } finally {
      if (savePipelineRef.current === pipeline) savePipelineRef.current = null
    }
  }, [captureRouteScope, isRouteScopeActive, replaceBoard, resetHistory])

  const sendBoardPayload = useCallback(async (payload: BoardMessagePayload): Promise<number> => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    if (!isRouteScopeActive(scope)
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
      || connectionStateRef.current !== 'connected'
      || !dataChannelReadyRef.current
      || !localParticipantIdRef.current) return 0
    const message = makeBoardMessage(scope.bookingId, currentAccess.role, payload)
    const serialized = serializeBoardMessage(message)
    if (!serialized) return -1

    try {
      const sent = await broadcastJitsiTextMessage(
        jitsiApiRef.current,
        serialized,
        localParticipantIdRef.current,
      )
      if (!isRouteScopeActive(scope)) return 0
      if (sent > 0) setSyncWarning('')
      return sent
    } catch {
      if (!isRouteScopeActive(scope)) return 0
      setSyncWarning('Kết nối bảng tạm gián đoạn. Thay đổi sẽ được gửi lại khi có người tham gia.')
      return 0
    }
  }, [captureRouteScope, isRouteScopeActive])

  const broadcastSnapshot = useCallback(async (snapshot = boardRef.current) => {
    const scope = captureRouteScope()
    if (!isRouteScopeActive(scope)) return
    const sent = await sendBoardPayload({ type: 'snapshot', snapshot })
    if (sent !== -1 || !isRouteScopeActive(scope)) return

    const saved = await flushBoardSave()
    if (saved && isRouteScopeActive(scope)) {
      await sendBoardPayload({ type: 'snapshot-refresh', boardVersion: snapshot.version })
    }
  }, [captureRouteScope, flushBoardSave, isRouteScopeActive, sendBoardPayload])

  const scheduleManagerBoardSave = useCallback((delayMs = 350) => {
    const scope = captureRouteScope()
    if (!isRouteScopeActive(scope)) return
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      if (!isRouteScopeActive(scope)) return
      void flushBoardSave().then((saved) => {
        if (saved && isRouteScopeActive(scope)) {
          void sendBoardPayload({ type: 'snapshot-refresh', boardVersion: boardRef.current.version })
        }
      })
    }, delayMs)
  }, [captureRouteScope, flushBoardSave, isRouteScopeActive, sendBoardPayload])

  const flushPendingStudentOperations = useCallback(async () => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    if (
      !isRouteScopeActive(scope)
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
      || currentAccess.role !== 'student'
    ) return

    const existingPipeline = pendingOperationFlushRef.current
    if (existingPipeline && isRouteScopeActive(existingPipeline.scope)) return existingPipeline.promise
    if (pendingStudentOperationsRef.current.length === 0) return

    const pipeline: StudentOperationPipeline = {
      scope,
      promise: Promise.resolve(),
    }
    const work = (async () => {
      while (isRouteScopeActive(scope) && pendingStudentOperationsRef.current.length > 0) {
        const operation = pendingStudentOperationsRef.current[0]
        try {
          const result = await appendOnlineClassroomBoardOperation(
            scope.bookingId,
            operation,
            tokenRef.current || undefined,
          )
          if (!isRouteScopeActive(scope)) return
          const remoteBoard = sanitizeBoardSnapshot(result.boardSnapshot)
          pendingStudentOperationsRef.current = pendingStudentOperationsRef.current
            .filter((item) => item.id !== operation.id)
          const remoteIds = new Set(remoteBoard.operations.map((item) => item.id))
          const stillPending = pendingStudentOperationsRef.current
            .filter((item) => !remoteIds.has(item.id))
          const visibleBoard = {
            ...remoteBoard,
            operations: [...remoteBoard.operations, ...stillPending].slice(0, MAX_BOARD_OPERATIONS),
          }
          savedVersionRef.current = remoteBoard.version
          replaceBoard(
            visibleBoard,
            isBoardManager(accessRef.current?.role || 'student')
              ? stillPending.length > 0 ? 'dirty' : 'saved'
              : undefined,
          )
          setPendingStudentOperationCount(stillPending.length)
          setSyncWarning('')
          await sendBoardPayload({ type: 'snapshot-refresh', boardVersion: remoteBoard.version })
        } catch (error) {
          if (!isRouteScopeActive(scope)) return
          setSyncWarning(`Nét vẽ đang chờ đồng bộ lên hệ thống: ${onlineClassroomErrorMessage(error)}`)
          setPendingStudentOperationCount(pendingStudentOperationsRef.current.length)
          break
        }
      }
    })()
    pipeline.promise = work
    pendingOperationFlushRef.current = pipeline
    try {
      await work
    } finally {
      if (pendingOperationFlushRef.current === pipeline) pendingOperationFlushRef.current = null
    }
  }, [captureRouteScope, isRouteScopeActive, replaceBoard, sendBoardPayload])

  const handleLocalOperation = useCallback((operation: BoardOperation) => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    const previous = boardRef.current
    if (!isRouteScopeActive(scope) || !currentAccess || currentAccess.bookingId !== scope.bookingId) return
    if (previous.operations.length >= MAX_BOARD_OPERATIONS) {
      toast.warning('Bảng đã đạt giới hạn nét vẽ. Gia sư hãy lưu rồi xóa bảng để tiếp tục.')
      return
    }
    if (currentAccess.role === 'student' && !previous.studentCanWrite) return
    if (previous.operations.some((item) => item.id === operation.id)) return

    const localIsManager = isBoardManager(currentAccess.role)
    if (localIsManager) rememberForUndo(previous.operations)
    const next = {
      ...previous,
      operations: [...previous.operations, operation],
    }
    replaceBoard(next, localIsManager ? 'dirty' : undefined)
    if (localIsManager) {
      // Manager mutations use the single versioned snapshot pipeline. Mixing
      // append + snapshot writes can resurrect a stroke after Undo/Clear.
      scheduleManagerBoardSave()
      return
    }
    pendingStudentOperationsRef.current.push(operation)
    setPendingStudentOperationCount(pendingStudentOperationsRef.current.length)
    void flushPendingStudentOperations()
  }, [captureRouteScope, flushPendingStudentOperations, isRouteScopeActive, rememberForUndo, replaceBoard, scheduleManagerBoardSave])

  const commitManagerBoard = useCallback((next: ValidatedBoardSnapshot) => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    if (
      !isRouteScopeActive(scope)
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
      || !isBoardManager(currentAccess.role)
    ) return
    replaceBoard(next, 'dirty')
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    void flushBoardSave().then((saved) => {
      if (saved && isRouteScopeActive(scope)) {
        void sendBoardPayload({ type: 'snapshot-refresh', boardVersion: boardRef.current.version })
      }
    })
  }, [captureRouteScope, flushBoardSave, isRouteScopeActive, replaceBoard, sendBoardPayload])

  const handleUndo = useCallback(() => {
    const previousOperations = undoHistoryRef.current.pop()
    if (!previousOperations) return
    const current = boardRef.current
    redoHistoryRef.current.push(current.operations)
    setHistoryState({
      canUndo: undoHistoryRef.current.length > 0,
      canRedo: redoHistoryRef.current.length > 0,
    })
    commitManagerBoard({ ...current, version: current.version + 1, operations: previousOperations })
  }, [commitManagerBoard])

  const handleRedo = useCallback(() => {
    const nextOperations = redoHistoryRef.current.pop()
    if (!nextOperations) return
    const current = boardRef.current
    undoHistoryRef.current.push(current.operations)
    setHistoryState({
      canUndo: undoHistoryRef.current.length > 0,
      canRedo: redoHistoryRef.current.length > 0,
    })
    commitManagerBoard({ ...current, version: current.version + 1, operations: nextOperations })
  }, [commitManagerBoard])

  const handleClear = useCallback(() => {
    const current = boardRef.current
    if (current.operations.length === 0) return
    rememberForUndo(current.operations)
    commitManagerBoard({ ...current, version: current.version + 1, operations: [] })
  }, [commitManagerBoard, rememberForUndo])

  const handleStudentCanWriteChange = useCallback((enabled: boolean) => {
    const current = boardRef.current
    if (current.studentCanWrite === enabled) return
    commitManagerBoard({ ...current, version: current.version + 1, studentCanWrite: enabled })
  }, [commitManagerBoard])

  const refreshBoardFromServer = useCallback(async () => {
    const scope = captureRouteScope()
    if (!isRouteScopeActive(scope)) return
    const existing = boardRefreshInFlightRef.current
    if (existing && isRouteScopeActive(existing.scope)) {
      existing.queued = true
      await existing.promise
      return
    }

    const pipeline: BoardRefreshPipeline = {
      scope,
      queued: false,
      promise: Promise.resolve(),
    }
    const request = (async () => {
      do {
        if (!isRouteScopeActive(scope)) return
        pipeline.queued = false
        try {
          const result = await requestOnlineClassroomAccess(scope.bookingId, tokenRef.current || undefined)
          if (!isRouteScopeActive(scope) || result.bookingId !== scope.bookingId) return
          accessRef.current = result
          setAccess(result)
          const remoteBoard = sanitizeBoardSnapshot(result.boardSnapshot)
          if (remoteBoard.version < savedVersionRef.current) continue
          const saveInFlightForScope = savePipelineRef.current
            && isRouteScopeActive(savePipelineRef.current.scope)
          if (isBoardManager(result.role) && (saveInFlightForScope || saveTimerRef.current !== null)) continue
          const pending = pendingStudentOperationsRef.current
          const remoteOperationIds = new Set(remoteBoard.operations.map((operation) => operation.id))
          const missingPending = pending.filter((operation) => !remoteOperationIds.has(operation.id))
          const visibleBoard = missingPending.length > 0
            ? {
                ...remoteBoard,
                operations: [...remoteBoard.operations, ...missingPending].slice(0, MAX_BOARD_OPERATIONS),
              }
            : remoteBoard
          replaceBoard(
            visibleBoard,
            isBoardManager(result.role) ? missingPending.length > 0 ? 'dirty' : 'saved' : undefined,
          )
          savedVersionRef.current = remoteBoard.version
          if (missingPending.length > 0) void flushPendingStudentOperations()
          setSyncWarning('')
        } catch {
          if (isRouteScopeActive(scope)) {
            setSyncWarning('Chưa tải được bản bảng mới nhất. Hệ thống sẽ tự thử lại.')
          }
        }
      } while (pipeline.queued && isRouteScopeActive(scope))
    })()

    pipeline.promise = request
    boardRefreshInFlightRef.current = pipeline
    try {
      await request
    } finally {
      if (boardRefreshInFlightRef.current === pipeline) {
        boardRefreshInFlightRef.current = null
      }
    }
  }, [captureRouteScope, flushPendingStudentOperations, isRouteScopeActive, replaceBoard])

  const scheduleBoardRefresh = useCallback(() => {
    const scope = captureRouteScope()
    if (!isRouteScopeActive(scope)) return
    if (boardRefreshTimerRef.current !== null) return
    boardRefreshTimerRef.current = window.setTimeout(() => {
      boardRefreshTimerRef.current = null
      if (!isRouteScopeActive(scope)) return
      void refreshBoardFromServer()
    }, 600)
  }, [captureRouteScope, isRouteScopeActive, refreshBoardFromServer])

  const handleBoardTextMessage = useCallback((raw: string, senderId: string) => {
    const scope = captureRouteScope()
    if (!isRouteScopeActive(scope)) return
    const message = parseBoardMessage(raw, scope.bookingId)
    const currentAccess = accessRef.current
    if (
      !message
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
      || !senderId
      || senderId === localParticipantIdRef.current
      || seenMessageIdsRef.current.has(message.messageId)
    ) return

    seenMessageIdsRef.current.add(message.messageId)
    if (seenMessageIdsRef.current.size > 500) {
      seenMessageIdsRef.current = new Set(Array.from(seenMessageIdsRef.current).slice(-250))
    }

    const localIsManager = isBoardManager(currentAccess.role)
    if (message.type === 'hello') {
      if (localIsManager) void broadcastSnapshot()
      return
    }
    if (message.type === 'snapshot-request') {
      if (localIsManager) void broadcastSnapshot()
      return
    }
    if (message.type === 'snapshot-refresh') {
      // Jitsi chỉ là tín hiệu nhanh. Snapshot callable mới là nguồn dữ liệu có
      // xác thực cho cả hai vai trò, kể cả khi phòng có thêm tab quan sát.
      scheduleBoardRefresh()
      return
    }
    if (message.type === 'snapshot') {
      scheduleBoardRefresh()
      return
    }

    // Tương thích client pilot cũ còn gửi operation trực tiếp. Không tin role
    // trong data channel; chỉ tải lại operation đã được backend xác thực.
    scheduleBoardRefresh()
  }, [broadcastSnapshot, captureRouteScope, isRouteScopeActive, scheduleBoardRefresh])

  const startBoardHandshake = useCallback(() => {
    const scope = captureRouteScope()
    if (!isRouteScopeActive(scope)
      || accessRef.current?.bookingId !== scope.bookingId
      || connectionStateRef.current !== 'connected'
      || !dataChannelReadyRef.current
      || !localParticipantIdRef.current) return
    void sendBoardPayload({ type: 'hello' })
    const currentAccess = accessRef.current
    if (currentAccess?.role === 'student') {
      void sendBoardPayload({ type: 'snapshot-request' })
    }
    window.setTimeout(() => {
      if (isRouteScopeActive(scope)) void flushPendingStudentOperations()
    }, 350)
  }, [captureRouteScope, flushPendingStudentOperations, isRouteScopeActive, sendBoardPayload])

  const handleConferenceJoined = useCallback((participantId: string) => {
    const scope = captureRouteScope()
    if (!isRouteScopeActive(scope) || accessRef.current?.bookingId !== scope.bookingId) return
    localParticipantIdRef.current = participantId
    conferenceJoinedRef.current = Boolean(participantId)
    setConferenceJoined(Boolean(participantId))
    window.setTimeout(() => {
      if (isRouteScopeActive(scope)) startBoardHandshake()
    }, 0)
  }, [captureRouteScope, isRouteScopeActive, startBoardHandshake])

  const handleDataChannelOpened = useCallback(() => {
    const scope = captureRouteScope()
    if (!isRouteScopeActive(scope) || accessRef.current?.bookingId !== scope.bookingId) return
    dataChannelReadyRef.current = true
    window.setTimeout(() => {
      if (isRouteScopeActive(scope)) startBoardHandshake()
    }, 0)
  }, [captureRouteScope, isRouteScopeActive, startBoardHandshake])

  const handleParticipantJoined = useCallback((participantId: string) => {
    const scope = captureRouteScope()
    if (!isRouteScopeActive(scope) || accessRef.current?.bookingId !== scope.bookingId) return
    if (participantId && participantId !== localParticipantIdRef.current) {
      remoteParticipantIdsRef.current.add(participantId)
      setRemoteParticipantCount(remoteParticipantIdsRef.current.size)
    }
    const currentAccess = accessRef.current
    if (!dataChannelReadyRef.current || !currentAccess) return
    if (isBoardManager(currentAccess.role)) {
      window.setTimeout(() => {
        if (isRouteScopeActive(scope)) void broadcastSnapshot()
      }, 600)
    } else {
      window.setTimeout(() => {
        if (isRouteScopeActive(scope)) void flushPendingStudentOperations()
      }, 900)
    }
  }, [broadcastSnapshot, captureRouteScope, flushPendingStudentOperations, isRouteScopeActive])

  const handleParticipantLeft = useCallback((participantId: string) => {
    const scope = captureRouteScope()
    if (!isRouteScopeActive(scope) || accessRef.current?.bookingId !== scope.bookingId) return
    remoteParticipantIdsRef.current.delete(participantId)
    setRemoteParticipantCount(remoteParticipantIdsRef.current.size)
  }, [captureRouteScope, isRouteScopeActive])

  useEffect(() => {
    if (loadState !== 'ready' || fatalAccessError) return

    let disposed = false
    const revalidate = async () => {
      const scope = captureRouteScope()
      if (disposed || !isRouteScopeActive(scope)) return
      if (revalidationInFlightRef.current && isRouteScopeActive(revalidationInFlightRef.current)) return
      revalidationInFlightRef.current = scope
      try {
        const result = await requestOnlineClassroomAccess(scope.bookingId, tokenRef.current || undefined)
        if (disposed || !isRouteScopeActive(scope) || result.bookingId !== scope.bookingId) return
        consecutiveRevalidationFailuresRef.current = 0
        setRevalidationWarning('')
        accessRef.current = result
        setAccess(result)

        const remoteBoard = sanitizeBoardSnapshot(result.boardSnapshot)
        if (remoteBoard.version > savedVersionRef.current) await refreshBoardFromServer()
      } catch (error) {
        if (disposed || !isRouteScopeActive(scope)) return
        consecutiveRevalidationFailuresRef.current += 1
        const message = onlineClassroomErrorMessage(error)
        if (isHardAccessFailure(error)) {
          fatalAccessErrorRef.current = message
          setFatalAccessError(message)
        } else {
          setRevalidationWarning(
            `Kết nối kiểm tra quyền đang gián đoạn (lần ${consecutiveRevalidationFailuresRef.current}). Lớp vẫn mở và sẽ tự kiểm tra lại trong một phút.`,
          )
        }
      } finally {
        if (revalidationInFlightRef.current === scope) revalidationInFlightRef.current = null
      }
    }

    const interval = window.setInterval(() => void revalidate(), REVALIDATE_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void revalidate()
      if (document.visibilityState === 'hidden' && isBoardManager(accessRef.current?.role || 'student')) {
        void flushBoardSave()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [captureRouteScope, fatalAccessError, flushBoardSave, isRouteScopeActive, loadState, refreshBoardFromServer])

  useEffect(() => {
    if (loadState !== 'ready' || fatalAccessError) return
    const refreshVisibleBoard = () => {
      if (document.visibilityState === 'visible') void refreshBoardFromServer()
    }
    const interval = window.setInterval(refreshVisibleBoard, BOARD_SYNC_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [fatalAccessError, loadState, refreshBoardFromServer])

  const applyRecordingConsent = useCallback((recordingConsent: OnlineClassroomAccess['recordingConsent']) => {
    const current = accessRef.current
    if (!current) return
    const next = { ...current, recordingConsent }
    accessRef.current = next
    setAccess(next)
  }, [])

  const handleRequestRecordingConsent = useCallback(async () => {
    const scope = captureRouteScope()
    const current = accessRef.current
    if (
      !isRouteScopeActive(scope)
      || !current
      || current.bookingId !== scope.bookingId
      || !isBoardManager(current.role)
      || (recordingConsentBusyRef.current && isRouteScopeActive(recordingConsentBusyRef.current))
    ) return
    recordingConsentBusyRef.current = scope
    setRecordingConsentBusy(true)
    setRecordingConsentError('')
    setRecordingSetupConfirmed(false)
    try {
      const recordingConsent = await requestOnlineClassroomRecordingConsent(scope.bookingId)
      if (!isRouteScopeActive(scope)) return
      applyRecordingConsent(recordingConsent)
      await sendBoardPayload({ type: 'snapshot-refresh', boardVersion: boardRef.current.version })
      if (!isRouteScopeActive(scope)) return
      toast.success('Đã gửi yêu cầu. Học viên cần bấm đồng ý ngay trên màn hình lớp học.')
    } catch (error) {
      if (isRouteScopeActive(scope)) {
        setRecordingConsentError(onlineClassroomRecordingErrorMessage(error))
      }
    } finally {
      if (recordingConsentBusyRef.current === scope) recordingConsentBusyRef.current = null
      if (isRouteScopeActive(scope)) setRecordingConsentBusy(false)
    }
  }, [applyRecordingConsent, captureRouteScope, isRouteScopeActive, sendBoardPayload])

  const handleRespondRecordingConsent = useCallback(async (accepted: boolean) => {
    const scope = captureRouteScope()
    const current = accessRef.current
    const consent = current?.recordingConsent
    if (
      !isRouteScopeActive(scope)
      || !current
      || current.bookingId !== scope.bookingId
      || current.role !== 'student'
      || !consent
      || consent.status !== 'pending'
      || (recordingConsentBusyRef.current && isRouteScopeActive(recordingConsentBusyRef.current))
    ) return
    recordingConsentBusyRef.current = scope
    setRecordingConsentBusy(true)
    setRecordingConsentError('')
    try {
      const recordingConsent = await respondOnlineClassroomRecordingConsent(
        scope.bookingId,
        consent.requestId,
        accepted,
        tokenRef.current || undefined,
      )
      if (!isRouteScopeActive(scope)) return
      applyRecordingConsent(recordingConsent)
      await sendBoardPayload({ type: 'snapshot-refresh', boardVersion: boardRef.current.version })
      if (!isRouteScopeActive(scope)) return
      toast.success(accepted ? 'Bạn đã đồng ý ghi hình buổi học này.' : 'Bạn đã từ chối ghi hình buổi học này.')
    } catch (error) {
      if (isRouteScopeActive(scope)) {
        setRecordingConsentError(onlineClassroomRecordingErrorMessage(error))
      }
    } finally {
      if (recordingConsentBusyRef.current === scope) recordingConsentBusyRef.current = null
      if (isRouteScopeActive(scope)) setRecordingConsentBusy(false)
    }
  }, [applyRecordingConsent, captureRouteScope, isRouteScopeActive, sendBoardPayload])

  const handleCopyReadyRecordingLink = useCallback(async () => {
    const scope = captureRouteScope()
    const current = readyRecording
    if (
      !isRouteScopeActive(scope)
      || !current
      || (readyShareBusyRef.current && isRouteScopeActive(readyShareBusyRef.current))
    ) return
    readyShareBusyRef.current = scope
    setCreatingReadyShareLink(true)
    try {
      const shareUrl = current.studentShareUrl
        || await createOnlineClassroomRecordingShareLink(current.recordingId)
      if (!isRouteScopeActive(scope)) return
      if (!current.studentShareUrl) {
        setReadyRecording((latest) => latest?.recordingId === current.recordingId
          ? { ...latest, studentShareUrl: shareUrl }
          : latest)
      }
      await navigator.clipboard.writeText(shareUrl)
      if (!isRouteScopeActive(scope)) return
      toast.success('Đã sao chép link xem lại riêng cho học viên.')
    } catch (error) {
      if (isRouteScopeActive(scope)) {
        toast.error(onlineClassroomRecordingErrorMessage(error))
      }
    } finally {
      if (readyShareBusyRef.current === scope) readyShareBusyRef.current = null
      if (isRouteScopeActive(scope)) setCreatingReadyShareLink(false)
    }
  }, [captureRouteScope, isRouteScopeActive, readyRecording])

  const stopRecordingInstance = useCallback((scope: ClassroomRouteScope, recorder: MediaRecorder) => {
    if (!isRouteScopeActive(scope) || recorderRef.current !== recorder || recorder.state === 'inactive') return
    if (recordingDurationTimerRef.current !== null) {
      window.clearTimeout(recordingDurationTimerRef.current)
      recordingDurationTimerRef.current = null
    }
    setRecordingState('stopping')
    recorder.stop()
  }, [isRouteScopeActive])

  const stopRecording = useCallback(() => {
    const scope = captureRouteScope()
    const recorder = recorderRef.current
    if (!recorder) return
    stopRecordingInstance(scope, recorder)
  }, [captureRouteScope, stopRecordingInstance])

  const startRecording = useCallback(async () => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    if (!isRouteScopeActive(scope) || currentAccess?.bookingId !== scope.bookingId || !isBoardManager(currentAccess.role)) return
    if (!recordingSupported || !recordingSetupConfirmed || recordingStartLockRef.current || recordingState !== 'idle') return
    const acceptedConsent = currentAccess.recordingConsent
    if (!acceptedConsent || acceptedConsent.status !== 'accepted') {
      setRecordingError('Học viên cần bấm đồng ý ghi hình trước khi giáo viên có thể bắt đầu.')
      return
    }
    const consentRequestId = acceptedConsent.requestId
    if (connectionStateRef.current !== 'connected' || !conferenceJoinedRef.current) {
      setRecordingError('Hãy vào cuộc gọi và chờ trạng thái “Đã kết nối” trước khi bắt đầu ghi.')
      return
    }
    if (fatalAccessErrorRef.current) return

    const attempt = ++recordingAttemptRef.current
    const targetBookingId = scope.bookingId
    const failureState = { attempt, error: null as unknown }
    recordingFailureRef.current = failureState
    const ensureAttemptIsActive = () => {
      if (
        attempt !== recordingAttemptRef.current
        || unmountingRef.current
        || !isRouteScopeActive(scope)
        || fatalAccessErrorRef.current
        || connectionStateRef.current !== 'connected'
        || !conferenceJoinedRef.current
      ) throw new Error('RECORDING_CANCELLED')
    }
    recordingStartLockRef.current = true
    setRecordingError('')
    setRecordingUploadedBytes(0)
    setRecordingState('starting')
    let capture: ClassroomRecordingCapture | null = null
    let session: Awaited<ReturnType<typeof startOnlineClassroomRecording>> | null = null
    let uploader: GcsResumableUploader | null = null
    let durationTimerId: number | null = null
    try {
      capture = await createClassroomRecordingCapture({
        displayConstraints: {
          video: {
            frameRate: { ideal: 24, max: 30 },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
          },
          audio: true,
          preferCurrentTab: true,
        },
        microphoneConstraints: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      recordingCaptureRef.current = capture
      ensureAttemptIsActive()
      if (!capture.hasDisplayAudio) {
        await capture.cleanup()
        if (recordingCaptureRef.current === capture) recordingCaptureRef.current = null
        capture = null
        throw new Error('TAB_AUDIO_REQUIRED')
      }
      if (!capture.hasMicrophoneAudio) {
        await capture.cleanup()
        if (recordingCaptureRef.current === capture) recordingCaptureRef.current = null
        capture = null
        throw new Error('MICROPHONE_AUDIO_REQUIRED')
      }

      const mimeType = recordingMimeType() || 'video/webm'
      session = await startOnlineClassroomRecording(targetBookingId, mimeType, consentRequestId)
      ensureAttemptIsActive()
      const heartbeat = { sentAt: Date.now(), uploadedBytes: 0, inFlight: false }
      const activeUploader = new GcsResumableUploader({
        sessionUrl: session.uploadSessionUrl,
        contentType: mimeType,
        onProgress: ({ uploadedBytes }) => {
          if (!unmountingRef.current && isRouteScopeActive(scope)) {
            setRecordingUploadedBytes(uploadedBytes)
          }
          const now = Date.now()
          const heartbeatDue = now - heartbeat.sentAt >= RECORDING_HEARTBEAT_INTERVAL_MS
            || uploadedBytes - heartbeat.uploadedBytes >= RECORDING_HEARTBEAT_BYTE_STEP
          if (heartbeatDue && !heartbeat.inFlight && session?.recordingId) {
            heartbeat.sentAt = now
            heartbeat.uploadedBytes = uploadedBytes
            heartbeat.inFlight = true
            void touchOnlineClassroomRecordingUpload(session.recordingId, uploadedBytes)
              .catch(() => undefined)
              .finally(() => {
                heartbeat.inFlight = false
              })
          }
        },
      })
      uploader = activeUploader

      recordingCaptureRef.current = capture
      recordingUploaderRef.current = activeUploader
      recordingSessionRef.current = {
        recordingId: session.recordingId,
        replayUrl: session.replayUrl,
        maxBytes: session.maxBytes,
      }
      ensureAttemptIsActive()

      const recorder = new MediaRecorder(capture.stream, { mimeType })
      recorderRef.current = recorder

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size === 0) return
        if (activeUploader.acceptedBytes + event.data.size > session!.maxBytes) {
          failureState.error = new Error('RECORDING_TOO_LARGE')
          activeUploader.abort(failureState.error)
          if (recorder.state !== 'inactive') recorder.stop()
          return
        }
        void activeUploader.append(event.data).catch((error) => {
          if (!failureState.error) {
            failureState.error = error
            activeUploader.abort(error)
            if (recorder.state !== 'inactive') {
              if (!unmountingRef.current && isRouteScopeActive(scope)) setRecordingState('stopping')
              recorder.stop()
            }
          }
        })
      })
      recorder.addEventListener('error', (event) => {
        const mediaError = 'error' in event
          ? (event as Event & { error?: DOMException }).error
          : null
        const error = mediaError || new Error('MEDIA_RECORDER_ERROR')
        failureState.error = error
        activeUploader.abort(error)
        if (recorder.state !== 'inactive') recorder.stop()
      })
      recorder.addEventListener('stop', () => {
        void (async () => {
          if (durationTimerId !== null) {
            window.clearTimeout(durationTimerId)
            if (recordingDurationTimerRef.current === durationTimerId) recordingDurationTimerRef.current = null
            durationTimerId = null
          }
          try {
            if (failureState.error) throw failureState.error
            await activeUploader.finish()
            await touchOnlineClassroomRecordingUpload(session!.recordingId, activeUploader.uploadedBytes).catch(() => undefined)
            const finalized = await finalizeOnlineClassroomRecording(session!.recordingId)
            if (!unmountingRef.current && isRouteScopeActive(scope)) {
              const ready = {
                ...finalized,
                replayUrl: session!.replayUrl,
                studentShareUrl: session!.replayUrl,
              }
              setReadyRecording(ready)
              setExistingRecording({ ...finalized, viewUrl: session!.replayUrl })
              setRecordingHydrationState('ready')
              setRecordingHydrationError('')
              toast.success('Đã lưu bản ghi riêng tư. Link xem lại có hiệu lực tối đa 3 ngày.')
            }
          } catch (error) {
            activeUploader.abort(error)
            await abandonOnlineClassroomRecording(session!.recordingId).catch(() => undefined)
            if (!unmountingRef.current && isRouteScopeActive(scope)) {
              const message = error instanceof Error && error.message === 'RECORDING_TOO_LARGE'
                ? 'Bản ghi vượt giới hạn 1,25 GB nên đã dừng và xóa phần tải dở.'
                : `Chưa lưu trọn vẹn bản ghi: ${onlineClassroomRecordingErrorMessage(error)}`
              setRecordingError(message)
              toast.error(message)
            }
          } finally {
            if (recordingUploaderRef.current === activeUploader) recordingUploaderRef.current = null
            if (recordingSessionRef.current?.recordingId === session!.recordingId) recordingSessionRef.current = null
            if (recordingFailureRef.current === failureState) recordingFailureRef.current = null
            await capture?.cleanup()
            if (recordingCaptureRef.current === capture) recordingCaptureRef.current = null
            if (recorderRef.current === recorder) recorderRef.current = null
            if (!unmountingRef.current && isRouteScopeActive(scope)) setRecordingState('idle')
          }
        })()
      }, { once: true })
      capture.displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') stopRecordingInstance(scope, recorder)
      }, { once: true })

      // Ghi theo từng đoạn nhỏ rồi tải tuần tự để lớp dài không giữ toàn bộ
      // video trong RAM. Uploader phía dưới gom thành chunk 8 MiB cho GCS.
      recorder.start(5_000)
      durationTimerId = window.setTimeout(() => {
        if (recordingDurationTimerRef.current === durationTimerId) recordingDurationTimerRef.current = null
        durationTimerId = null
        stopRecordingInstance(scope, recorder)
      }, MAX_RECORDING_DURATION_MS)
      recordingDurationTimerRef.current = durationTimerId
      setRecordingState('recording')
      setShowRecordingConsent(false)
      setRecordingSetupConfirmed(false)
    } catch (error) {
      if (durationTimerId !== null) {
        window.clearTimeout(durationTimerId)
        if (recordingDurationTimerRef.current === durationTimerId) recordingDurationTimerRef.current = null
        durationTimerId = null
      }
      uploader?.abort(error)
      await capture?.cleanup()
      if (session?.recordingId) {
        await abandonOnlineClassroomRecording(session.recordingId).catch(() => undefined)
      }
      if (recordingCaptureRef.current === capture) recordingCaptureRef.current = null
      if (uploader && recordingUploaderRef.current === uploader) recordingUploaderRef.current = null
      if (session && recordingSessionRef.current?.recordingId === session.recordingId) {
        recordingSessionRef.current = null
      }
      if (recordingFailureRef.current === failureState) recordingFailureRef.current = null
      if (!unmountingRef.current && isRouteScopeActive(scope)) setRecordingState('idle')
      const domErrorName = nestedDomExceptionName(error)
      const rawMessage = error instanceof Error ? error.message : ''
      if (rawMessage === 'RECORDING_CANCELLED') return
      const message = ['NotAllowedError', 'AbortError'].includes(domErrorName)
        ? 'Bạn chưa chọn tab hoặc đã từ chối quyền chia sẻ/micro. Không có video nào được lưu.'
        : rawMessage === 'TAB_AUDIO_REQUIRED'
          ? 'Chrome chưa chia sẻ âm thanh lớp. Hãy chọn đúng tab 123English và bật “Chia sẻ âm thanh của thẻ”.'
          : rawMessage === 'MICROPHONE_AUDIO_REQUIRED'
            ? 'Chưa lấy được âm thanh micro. Hãy cho phép micro rồi bắt đầu lại.'
            : onlineClassroomRecordingErrorMessage(error)
      if (!unmountingRef.current && isRouteScopeActive(scope)) setRecordingError(message)
    } finally {
      if (attempt === recordingAttemptRef.current) recordingStartLockRef.current = false
    }
  }, [captureRouteScope, isRouteScopeActive, recordingSetupConfirmed, recordingState, recordingSupported, stopRecordingInstance])

  useEffect(() => {
    fatalAccessErrorRef.current = fatalAccessError
    if (!fatalAccessError || recordingState === 'idle') return

    const accessRevokedError = new Error('CLASSROOM_ACCESS_REVOKED')
    const startWasPending = recordingStartLockRef.current
    recordingAttemptRef.current += 1
    recordingStartLockRef.current = false
    if (recordingFailureRef.current) recordingFailureRef.current.error = accessRevokedError
    recordingUploaderRef.current?.abort(accessRevokedError)
    void recordingCaptureRef.current?.cleanup()

    if (recordingState === 'stopping') return

    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      setRecordingState('stopping')
      recorder.stop()
    } else if (startWasPending) {
      // Keep this page mounted while the browser's share picker resolves. The
      // start attempt checks its epoch immediately afterwards and abandons it.
      setRecordingState('stopping')
    } else {
      const session = recordingSessionRef.current
      if (session) void abandonOnlineClassroomRecording(session.recordingId).catch(() => undefined)
      setRecordingState('idle')
    }
  }, [fatalAccessError, recordingState])

  useEffect(() => {
    unmountingRef.current = false
    return () => {
      unmountingRef.current = true
      recordingAttemptRef.current += 1
      recordingStartLockRef.current = false
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
      if (boardRefreshTimerRef.current !== null) window.clearTimeout(boardRefreshTimerRef.current)
      boardRefreshTimerRef.current = null
      if (recordingDurationTimerRef.current !== null) window.clearTimeout(recordingDurationTimerRef.current)
      recordingDurationTimerRef.current = null
      const cancellation = new Error('RECORDING_CANCELLED')
      if (recordingFailureRef.current) recordingFailureRef.current.error = cancellation
      recordingUploaderRef.current?.abort(cancellation)
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      else {
        void recordingCaptureRef.current?.cleanup()
        const session = recordingSessionRef.current
        if (session) void abandonOnlineClassroomRecording(session.recordingId).catch(() => undefined)
      }
    }
  }, [bookingId])

  useEffect(() => {
    if (pendingStudentOperationCount === 0 && recordingState === 'idle') return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [pendingStudentOperationCount, recordingState])

  if (!loadStateMatchesRoute || loadState === 'loading') return <ClassroomPageSkeleton />
  if (loadState === 'error') return <ClassroomErrorPage message={pageError} onRetry={() => void loadClassroom()} />
  if (!accessMatchesRoute) return <ClassroomPageSkeleton />
  if (!access) return <ClassroomErrorPage message="Không tìm thấy thông tin lớp học." onRetry={() => void loadClassroom()} />
  if (fatalAccessError && recordingState === 'idle') {
    return <ClassroomErrorPage message={fatalAccessError} onRetry={() => void loadClassroom()} />
  }

  const connectionHealthy = connectionState === 'connected'
  const recordingBusy = recordingState === 'starting' || recordingState === 'stopping'
  const serverRecordingConsent = access.recordingConsent
  const recordingConsentAccepted = serverRecordingConsent?.status === 'accepted'

  return (
    <div className="min-h-[100dvh] bg-[#f6f8fb] font-[var(--font-quicksand)] text-[#10213a]">
      <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <Logo clickable className="h-8 w-auto" />
            <span className="hidden h-8 w-px bg-slate-200 sm:block" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-black sm:text-lg">{access.subjectName || 'Lớp học trực tuyến'}</h1>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-amber-800">Pilot giới hạn</span>
              </div>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-500">
                {access.teacherName || 'Gia sư'} và {access.studentName || 'học viên'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-extrabold ${connectionHealthy ? 'bg-emerald-50 text-emerald-800' : connectionState === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
              {connectionHealthy ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {connectionLabel(connectionState)}
            </span>
            {connectionHealthy && (
              <span className={`inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-extrabold ${remoteParticipantCount > 0 ? 'bg-sky-50 text-sky-800' : 'bg-amber-50 text-amber-800'}`}>
                {remoteParticipantCount > 0 ? `${remoteParticipantCount + 1} người trong lớp` : 'Đang chờ người còn lại'}
              </span>
            )}
            {manager && recordingState === 'idle' && recordingHydrationState === 'ready' && !existingRecording && (
              <Button
                variant="outline"
                size="sm"
                loading={recordingConsentBusy}
                disabled={
                  !connectionHealthy
                  || !conferenceJoined
                  || serverRecordingConsent?.status === 'pending'
                  || serverRecordingConsent?.status === 'recording'
                }
                aria-label={recordingConsentAccepted ? 'Mở bước chọn tab để ghi hình' : 'Gửi yêu cầu học viên đồng ý ghi hình'}
                title={!connectionHealthy || !conferenceJoined ? 'Hãy vào cuộc gọi trước khi ghi hình' : undefined}
                onClick={() => {
                  setRecordingError('')
                  setRecordingConsentError('')
                  if (recordingConsentAccepted) {
                    setShowRecordingConsent(true)
                  } else {
                    void handleRequestRecordingConsent()
                  }
                }}
                className="border-slate-300 bg-white text-slate-700 focus:ring-amber-300"
              >
                <FileVideo2 className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {serverRecordingConsent?.status === 'pending'
                    ? 'Chờ học viên đồng ý'
                    : recordingConsentAccepted
                      ? 'Ghi và lưu 3 ngày'
                      : serverRecordingConsent?.status === 'declined'
                        ? 'Xin phép ghi hình lại'
                        : 'Xin phép ghi hình'}
                </span>
              </Button>
            )}
            {manager && recordingState === 'idle' && (recordingHydrationState === 'idle' || recordingHydrationState === 'loading') && (
              <Button variant="outline" size="sm" disabled className="border-slate-300 bg-white text-slate-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Đang kiểm tra bản ghi</span>
              </Button>
            )}
            {manager && recordingState === 'idle' && recordingHydrationState === 'error' && (
              <Button variant="outline" size="sm" onClick={() => void hydrateExistingRecording()} className="border-rose-300 bg-white text-rose-700 focus:ring-rose-300">
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Kiểm tra lại bản ghi</span>
              </Button>
            )}
            {manager && recordingState === 'idle' && recordingHydrationState === 'ready' && existingRecording && existingRecording.status !== 'ready' && (
              <Button variant="outline" size="sm" disabled className="border-amber-300 bg-amber-50 text-amber-800">
                <FileVideo2 className="h-4 w-4" />
                <span className="hidden sm:inline">Bản ghi đang được xử lý</span>
              </Button>
            )}
            {manager && recordingState === 'recording' && (
              <Button variant="danger" size="sm" onClick={stopRecording}>
                <CircleStop className="h-4 w-4" />
                Dừng và lưu video
              </Button>
            )}
            {manager && recordingBusy && (
              <Button variant="outline" size="sm" disabled className="border-slate-300 bg-white text-slate-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {recordingState === 'starting' ? 'Đang chuẩn bị' : 'Đang hoàn tất'}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-3 py-4 sm:px-6 sm:py-5">
        <section className="mb-4 grid gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_18px_55px_-48px_rgba(16,33,58,0.45)] sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">Buổi học đang mở</p>
            <p className="mt-1 truncate text-sm font-extrabold text-slate-800">{access.subjectName || 'Nội dung theo lịch học'}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <CalendarClock className="h-4 w-4 text-amber-700" />
            <span>{formatSessionDate(access.requestedDate)} · {access.requestedStart || '--:--'} đến {access.requestedEnd || '--:--'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            <span>{roleLabel(access.role)}</span>
          </div>
          {curriculumUrl && (
            <a
              href={curriculumUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-extrabold text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              <BookOpenCheck className="h-4 w-4" />
              Mở giáo trình
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </section>

        {(access.publicPilotProvider || revalidationWarning || syncWarning || recordingHydrationError || recordingState !== 'idle' || access.recordingNotice?.active || serverRecordingConsent || recordingConsentError || readyRecording || recordingError) && (
          <div className="mb-4 grid gap-2 lg:grid-cols-2">
            {access.publicPilotProvider && (
              <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-semibold leading-5 text-sky-950">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p><strong>Pilot dùng meet.jit.si:</strong> âm thanh, hình ảnh và tên hiển thị được Jitsi xử lý. Không đưa dữ liệu nhạy cảm lên bảng. Người tạo phòng có thể được Jitsi yêu cầu xác thực.</p>
              </div>
            )}
            {(revalidationWarning || syncWarning) && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-950" role="status">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{revalidationWarning || syncWarning}</p>
              </div>
            )}
            {recordingHydrationError && manager && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold leading-5 text-rose-950" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Chưa kiểm tra được bản ghi hiện có nên nút bắt đầu đang được khóa để tránh tạo trùng. {recordingHydrationError}</p>
              </div>
            )}
            {serverRecordingConsent?.status === 'pending' && access.role === 'student' && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm font-semibold leading-6 text-amber-950" role="dialog" aria-label="Yêu cầu đồng ý ghi hình">
                <p className="font-black">{serverRecordingConsent.requestedByRole === 'admin' ? 'Admin' : 'Gia sư'} đề nghị ghi hình và ghi âm buổi học</p>
                <p className="mt-1 text-xs leading-5">
                  Bản ghi được giữ riêng tư tối đa 3 ngày và có thể xóa sớm sau khi tải xong.
                  {formatConsentExpiry(serverRecordingConsent.expiresAt) && ` Yêu cầu hết hạn lúc ${formatConsentExpiry(serverRecordingConsent.expiresAt)}.`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    loading={recordingConsentBusy}
                    onClick={() => void handleRespondRecordingConsent(true)}
                    className="bg-emerald-700 text-white hover:bg-emerald-800 focus:ring-emerald-400"
                  >
                    Đồng ý ghi hình
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={recordingConsentBusy}
                    onClick={() => void handleRespondRecordingConsent(false)}
                    className="border-rose-300 bg-white text-rose-700 hover:bg-rose-50 focus:ring-rose-300"
                  >
                    Từ chối
                  </Button>
                </div>
              </div>
            )}
            {serverRecordingConsent?.status === 'pending' && manager && (
              <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-semibold leading-5 text-sky-950" role="status">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Đã gửi yêu cầu ghi hình. Hãy chờ học viên bấm <strong>Đồng ý ghi hình</strong>{formatConsentExpiry(serverRecordingConsent.expiresAt) ? ` trước ${formatConsentExpiry(serverRecordingConsent.expiresAt)}` : ''}.</p>
              </div>
            )}
            {serverRecordingConsent?.status === 'accepted' && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold leading-5 text-emerald-950" role="status">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{manager ? 'Học viên đã đồng ý. Bạn có thể bấm “Ghi và lưu 3 ngày” để chọn đúng tab lớp học.' : 'Bạn đã đồng ý ghi hình cho yêu cầu này. Gia sư có thể bắt đầu ghi trong thời hạn hiển thị.'}</p>
              </div>
            )}
            {serverRecordingConsent?.status === 'declined' && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold leading-5 text-rose-950" role="status">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{manager ? 'Học viên đã từ chối ghi hình. Không có thiết bị ghi nào được bật. Chỉ gửi lại yêu cầu sau khi đã trao đổi rõ.' : 'Bạn đã từ chối ghi hình. Buổi học vẫn tiếp tục nhưng hệ thống không cho bắt đầu bản ghi bằng yêu cầu này.'}</p>
              </div>
            )}
            {recordingConsentError && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold leading-5 text-rose-950" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{recordingConsentError}</p>
              </div>
            )}
            {(recordingState === 'recording' || recordingState === 'stopping') && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold leading-5 text-rose-950" role="status">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-rose-600" />
                <p>
                  {recordingState === 'recording'
                    ? `Đang ghi và tải từng phần lên vùng riêng tư (${formatRecordingBytes(recordingUploadedBytes)} đã tải).`
                    : fatalAccessError
                      ? 'Quyền truy cập đã thay đổi. Hệ thống đang dừng thiết bị ghi và hủy phần tải dở an toàn.'
                      : 'Đang chốt tệp và tạo link xem lại. Không đóng trang cho đến khi hoàn tất.'}
                </p>
              </div>
            )}
            {access.recordingNotice?.active && recordingState === 'idle' && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold leading-5 text-rose-950" role="status" aria-live="polite">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-rose-600" />
                <p><strong>Buổi học đang được ghi.</strong> Chỉ tiếp tục khi bạn đã biết và đồng ý việc ghi hình, ghi âm.</p>
              </div>
            )}
            {readyRecording && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold leading-5 text-emerald-950" role="status">
                <div>
                  <p className="font-black">Bản ghi đã sẵn sàng</p>
                  <p>Tự xóa sau 3 ngày hoặc ngay khi người xem xác nhận đã tải xong.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={readyRecording.replayUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 font-extrabold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    Xem lại <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    disabled={creatingReadyShareLink}
                    onClick={() => void handleCopyReadyRecordingLink()}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 font-extrabold text-emerald-900 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:cursor-wait disabled:opacity-60"
                  >
                    {creatingReadyShareLink ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                    {creatingReadyShareLink ? 'Đang tạo link' : 'Sao chép link học viên'}
                  </button>
                </div>
              </div>
            )}
            {recordingError && !showRecordingConsent && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold leading-5 text-rose-950" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{recordingError}</p>
              </div>
            )}
          </div>
        )}

        {classroomGifts.canSendGift && (
          <div className="mb-4">
            <ClassroomGiftTray
              studentName={access.studentName}
              canSend={classroomGifts.canSendGift}
              sendingGiftType={classroomGifts.sendingGiftType}
              loading={classroomGifts.loadingGifts}
              sendError={classroomGifts.sendError}
              syncWarning={classroomGifts.syncWarning}
              onSend={classroomGifts.sendGift}
            />
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 lg:hidden" aria-label="Chọn khu vực lớp học">
          <button
            type="button"
            onClick={() => setActivePanel('video')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-extrabold focus:outline-none focus:ring-2 focus:ring-amber-300 ${activePanel === 'video' ? 'bg-[#10213a] text-white' : 'text-slate-600'}`}
          >
            <Video className="h-4 w-4" />
            Cuộc gọi
          </button>
          <button
            type="button"
            onClick={() => setActivePanel('board')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-extrabold focus:outline-none focus:ring-2 focus:ring-amber-300 ${activePanel === 'board' ? 'bg-[#ffc107] text-[#10213a]' : 'text-slate-600'}`}
          >
            <PenLine className="h-4 w-4" />
            Bảng học
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
          <div className={`${activePanel === 'video' ? 'block' : 'hidden'} h-[min(68dvh,720px)] min-h-[460px] lg:block lg:h-[calc(100dvh-245px)] lg:min-h-[560px] lg:max-h-[840px]`}>
            <JitsiClassroom
              meetingDomain={access.meetingDomain}
              roomName={access.roomName}
              displayName={access.displayName}
              observerMode={access.role === 'admin'}
              onApiReady={(api) => {
                jitsiApiRef.current = api
                if (!api) {
                  dataChannelReadyRef.current = false
                  localParticipantIdRef.current = ''
                  conferenceJoinedRef.current = false
                  setConferenceJoined(false)
                  remoteParticipantIdsRef.current = new Set()
                  setRemoteParticipantCount(0)
                }
              }}
              onConferenceJoined={handleConferenceJoined}
              onParticipantJoined={handleParticipantJoined}
              onParticipantLeft={handleParticipantLeft}
              onDataChannelOpened={handleDataChannelOpened}
              onTextMessage={(text, senderId) => {
                if (classroomGifts.handleRealtimeMessage(text)) return
                handleBoardTextMessage(text, senderId)
              }}
              onConnectionStateChange={(nextState) => {
                connectionStateRef.current = nextState
                setConnectionState(nextState)
                if (nextState === 'connected') window.setTimeout(startBoardHandshake, 0)
                if (nextState === 'ended' || nextState === 'error') {
                  dataChannelReadyRef.current = false
                  localParticipantIdRef.current = ''
                  conferenceJoinedRef.current = false
                  setConferenceJoined(false)
                  remoteParticipantIdsRef.current = new Set()
                  setRemoteParticipantCount(0)
                  if (recordingStartLockRef.current) {
                    recordingAttemptRef.current += 1
                    recordingStartLockRef.current = false
                    void recordingCaptureRef.current?.cleanup()
                  }
                  stopRecording()
                }
              }}
              onEnded={() => {
                connectionStateRef.current = 'ended'
                setConnectionState('ended')
                conferenceJoinedRef.current = false
                setConferenceJoined(false)
                stopRecording()
              }}
              onError={(message) => toast.error(message)}
            />
          </div>

          <div className={`${activePanel === 'board' ? 'block' : 'hidden'} h-[min(68dvh,720px)] min-h-[460px] lg:block lg:h-[calc(100dvh-245px)] lg:min-h-[560px] lg:max-h-[840px]`}>
            <CollaborativeWhiteboard
              snapshot={board}
              role={access.role}
              canUndo={historyState.canUndo}
              canRedo={historyState.canRedo}
              saveStatus={saveStatus}
              pendingOperationCount={pendingStudentOperationCount}
              onOperation={handleLocalOperation}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onClear={handleClear}
              onStudentCanWriteChange={handleStudentCanWriteChange}
              onSave={() => {
                if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
                saveTimerRef.current = null
                void flushBoardSave()
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] font-semibold leading-5 text-slate-500">
          <p className="inline-flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />Bảng được lưu theo buổi học bởi gia sư hoặc Admin.</p>
          <p>Trang này không tự ghi điểm danh, điểm thưởng hoặc dữ liệu tính lương.</p>
        </div>
      </main>

      <ClassroomGiftOverlay
        gift={classroomGifts.activeGift}
        pendingGiftCount={classroomGifts.pendingGiftCount}
      />

      <Modal
        open={showRecordingConsent}
        onClose={() => {
          if (recordingState !== 'starting') {
            setShowRecordingConsent(false)
            setRecordingSetupConfirmed(false)
            setRecordingError('')
          }
        }}
        title="Ghi và lưu buổi học trên hệ thống"
        size="md"
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              disabled={recordingState === 'starting'}
              onClick={() => {
                setShowRecordingConsent(false)
                setRecordingSetupConfirmed(false)
                setRecordingError('')
              }}
            >
              Hủy
            </Button>
            <Button
              onClick={() => void startRecording()}
              loading={recordingState === 'starting'}
              disabled={!recordingSupported || !recordingSetupConfirmed || !recordingConsentAccepted || !connectionHealthy || !conferenceJoined}
              className="bg-[#ffc107] text-[#10213a] hover:bg-amber-400 focus:ring-amber-300"
            >
              <MonitorUp className="h-4 w-4" />
              Chọn tab và bắt đầu ghi
            </Button>
          </div>
        )}
      >
        <div className="space-y-4 text-sm font-semibold leading-6 text-slate-600">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <p className="font-black">Lưu riêng tư tối đa 3 ngày</p>
            <p className="mt-1 text-xs leading-5">Video được tải từng phần lên hệ thống trong lúc ghi. Người có link xem lại có thể tải về máy; sau khi xác nhận đã tải xong, hệ thống xóa quyền truy cập và tệp ngay.</p>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Hệ thống đã ghi nhận học viên đồng ý cho đúng yêu cầu này.</li>
            <li>Thông báo lại bằng lời trước khi bắt đầu; nếu học viên đổi ý, hãy hủy và không tiếp tục ghi.</li>
            <li>Trong cửa sổ Chrome hoặc Edge, chọn <strong>tab lớp học 123English</strong> và bật <strong>Chia sẻ âm thanh của thẻ</strong>.</li>
            <li>Cho phép micro ở hộp thoại kế tiếp để bản ghi có cả tiếng gia sư và học viên.</li>
            <li>Dùng nút <strong>Dừng và lưu video</strong>, rồi giữ trang mở đến khi link xem lại xuất hiện.</li>
          </ol>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-slate-800">
            <input
              type="checkbox"
              checked={recordingSetupConfirmed}
              onChange={(event) => setRecordingSetupConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 accent-amber-500"
            />
            <span>Học viên đã đồng ý trên hệ thống. Tôi xác nhận sẽ chọn đúng tab lớp học, bật chia sẻ âm thanh và bảo quản link bản ghi.</span>
          </label>
          {!recordingSupported && (
            <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Thiết bị này chưa hỗ trợ. Hãy dùng Chrome hoặc Edge mới nhất trên máy tính.
            </p>
          )}
          {recordingError && (
            <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {recordingError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
