import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleStop,
  Clock3,
  Copy,
  ExternalLink,
  FileVideo2,
  Info,
  LockKeyhole,
  Maximize2,
  Minimize2,
  Minus,
  MonitorUp,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserX,
  Video,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { CollaborativeWhiteboard } from '@/components/classroom/CollaborativeWhiteboard'
import { ScreenShareAnnotationStage } from '@/components/classroom/ScreenShareAnnotationStage'
import {
  ClassroomGiftOverlay,
  ClassroomGiftTray,
} from '@/components/classroom/ClassroomGiftExperience'
import {
  JitsiClassroom,
  type JitsiKnockingParticipant,
  type JitsiConnectionState,
} from '@/components/classroom/JitsiClassroom'
import { Logo } from '@/components/shared/Logo'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  MAX_BOARD_OPERATIONS,
  boardMessageSurface,
  isBoardManager,
  makeBoardMessage,
  parseBoardMessage,
  sanitizeBoardSnapshot,
  sanitizeScreenAnnotationSession,
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
  appendOnlineClassroomScreenAnnotationOperation,
  beginOnlineClassroomScreenAnnotation,
  endOnlineClassroomScreenAnnotation,
  readClassroomToken,
  rememberClassroomToken,
  removeClassroomTokenFromAddressBar,
  issueOnlineClassroomInvite,
  requestOnlineClassroomRecordingConsent,
  requestOnlineClassroomAccess,
  respondOnlineClassroomRecordingConsent,
  saveOnlineClassroomBoard,
  saveOnlineClassroomScreenAnnotation,
  type OnlineClassroomAccess,
  type OnlineClassroomScreenAnnotationSession,
} from '@/lib/onlineClassroom'
import { formatClassroomElapsed, onlineClassroomMeetingTimer } from '@/lib/bookingTime'
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
type WhiteboardWindowMode = 'normal' | 'maximized' | 'minimized'
type RecordingState = 'idle' | 'starting' | 'recording' | 'stopping'
type RecordingHydrationState = 'idle' | 'loading' | 'ready' | 'error'
type ClassroomScreenShareState = {
  active: boolean
  local: boolean
  participantIds: string[]
}
type ScreenFrameState = 'idle' | 'loading' | 'ready' | 'error'
type ReadyRecording = OnlineClassroomRecordingMetadata & {
  replayUrl: string
  studentShareUrl?: string
}
type ClassroomRouteScope = Readonly<{
  bookingId: string
  routeEpoch: object
  loadEpoch: number
}>
type BoardOperationPipeline = {
  scope: ClassroomRouteScope
  promise: Promise<void>
}
type PendingBoardOperation = {
  operation: BoardOperation
  generation: number
}
type ScreenAnnotationOperationPipeline = BoardOperationPipeline & {
  sessionId: string
}
type BoardRefreshPipeline = {
  scope: ClassroomRouteScope
  queued: boolean
  promise: Promise<void>
}

const EMPTY_BOARD: ValidatedBoardSnapshot = {
  version: 0,
  generation: 0,
  studentCanWrite: true,
  operations: [],
}
const REVALIDATE_INTERVAL_MS = 60_000
const BOARD_SYNC_INTERVAL_MS = 5_000
const MAX_HISTORY_ENTRIES = 50
const MAX_RECORDING_DURATION_MS = 3 * 60 * 60 * 1000
const RECORDING_HEARTBEAT_INTERVAL_MS = 60_000
const RECORDING_HEARTBEAT_BYTE_STEP = 8 * 1024 * 1024
const EMPTY_SCREEN_SHARE_STATE: ClassroomScreenShareState = { active: false, local: false, participantIds: [] }

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return ''
  return typeof error.code === 'string' ? error.code.replace(/^functions\//, '') : ''
}

function errorReason(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('details' in error)) return ''
  const details = error.details
  if (typeof details !== 'object' || details === null || !('reason' in details)) return ''
  return typeof details.reason === 'string' ? details.reason : ''
}

function isTerminalBoardOperationError(error: unknown): boolean {
  const code = errorCode(error)
  if (['permission-denied', 'unauthenticated', 'failed-precondition', 'not-found', 'invalid-argument']
    .includes(code)) return true
  return code === 'resource-exhausted' && errorReason(error) !== 'BOARD_RATE_LIMITED'
}

function isTerminalScreenAnnotationOperationError(error: unknown): boolean {
  const code = errorCode(error)
  if (['permission-denied', 'unauthenticated', 'failed-precondition', 'not-found', 'invalid-argument']
    .includes(code)) return true
  return code === 'resource-exhausted' && errorReason(error) !== 'SCREEN_ANNOTATION_RATE_LIMITED'
}

function isSafeScreenFrameUrl(value: unknown): value is string {
  return typeof value === 'string'
    && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\r\n]+$/i.test(value)
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
        <div className="mb-3 h-[52px] animate-pulse rounded-2xl border border-slate-200 bg-white lg:hidden" />
        <div className="grid gap-4 lg:grid-cols-[minmax(320px,35fr)_minmax(0,65fr)] lg:gap-2.5 lg:rounded-[1.75rem] lg:bg-[#0b0f14] lg:p-2.5">
          <div className="h-[min(68dvh,720px)] min-h-[460px] animate-pulse rounded-3xl bg-slate-900 lg:h-[calc(100dvh-245px)] lg:min-h-[560px] lg:max-h-[840px]" />
          <div className="hidden h-[calc(100dvh-245px)] min-h-[560px] max-h-[840px] animate-pulse rounded-3xl border border-slate-200 bg-white lg:block" />
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
  const [classroomElapsedSeconds, setClassroomElapsedSeconds] = useState(0)
  const [waitingRoomReady, setWaitingRoomReady] = useState(false)
  const [issuingStudentInvite, setIssuingStudentInvite] = useState(false)
  const [knockingParticipants, setKnockingParticipants] = useState<JitsiKnockingParticipant[]>([])
  const [scheduledMeetingTimer, setScheduledMeetingTimer] = useState({ durationSeconds: 0, elapsedSeconds: 0 })
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
  const [pendingBoardOperationCount, setPendingBoardOperationCount] = useState(0)
  const [boardMutationBusy, setBoardMutationBusy] = useState(false)
  const [screenShareState, setScreenShareState] = useState<ClassroomScreenShareState>(EMPTY_SCREEN_SHARE_STATE)
  const [screenAnnotationSession, setScreenAnnotationSession] = useState<OnlineClassroomScreenAnnotationSession | null>(null)
  const [screenAnnotationHistory, setScreenAnnotationHistory] = useState({ canUndo: false, canRedo: false })
  const [screenAnnotationSaveStatus, setScreenAnnotationSaveStatus] = useState<SaveStatus>('saved')
  const [screenAnnotationBusy, setScreenAnnotationBusy] = useState(false)
  const [screenAnnotationPendingOperationCount, setScreenAnnotationPendingOperationCount] = useState(0)
  const [screenAnnotationError, setScreenAnnotationError] = useState('')
  const [screenFrameUrl, setScreenFrameUrl] = useState('')
  const [screenFrameState, setScreenFrameState] = useState<ScreenFrameState>('idle')
  const [screenFrameError, setScreenFrameError] = useState('')
  const [isMeetingFullscreen, setIsMeetingFullscreen] = useState(false)
  const [isMeetingPseudoFullscreen, setIsMeetingPseudoFullscreen] = useState(false)
  const [meetingControlsCollapsed, setMeetingControlsCollapsed] = useState(false)
  const [whiteboardWindowMode, setWhiteboardWindowMode] = useState<WhiteboardWindowMode>('minimized')

  const accessRef = useRef<OnlineClassroomAccess | null>(null)
  const boardRef = useRef<ValidatedBoardSnapshot>(EMPTY_BOARD)
  const tokenRef = useRef('')
  const jitsiApiRef = useRef<JitsiExternalApi | null>(null)
  const localParticipantIdRef = useRef('')
  const remoteParticipantIdsRef = useRef(new Set<string>())
  const dataChannelReadyRef = useRef(false)
  const connectionStateRef = useRef<JitsiConnectionState>('loading')
  const seenMessageIdsRef = useRef(new Set<string>())
  const pendingBoardOperationsRef = useRef<PendingBoardOperation[]>([])
  const pendingOperationFlushRef = useRef<BoardOperationPipeline | null>(null)
  const undoHistoryRef = useRef<BoardOperation[][]>([])
  const redoHistoryRef = useRef<BoardOperation[][]>([])
  const savedVersionRef = useRef(0)
  const revalidationInFlightRef = useRef<ClassroomRouteScope | null>(null)
  const consecutiveRevalidationFailuresRef = useRef(0)
  const classroomLoadEpochRef = useRef(0)
  const bookingIdRef = useRef(bookingId)
  const activeRouteEpochRef = useRef(routeEpoch)
  const fatalAccessErrorRef = useRef('')
  const conferenceJoinedRef = useRef(false)
  const classroomStartedAtRef = useRef<number | null>(null)
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
  const meetingShellRef = useRef<HTMLDivElement>(null)
  const whiteboardDialogRef = useRef<HTMLDivElement>(null)
  const whiteboardLauncherRef = useRef<HTMLButtonElement>(null)
  const previousWhiteboardWindowModeRef = useRef<WhiteboardWindowMode>('minimized')
  const whiteboardRestoreModeRef = useRef<Exclude<WhiteboardWindowMode, 'minimized'>>('normal')
  const boardMutationRef = useRef<Promise<boolean> | null>(null)
  const screenAnnotationSessionRef = useRef<OnlineClassroomScreenAnnotationSession | null>(null)
  const screenAnnotationUndoRef = useRef<BoardOperation[][]>([])
  const screenAnnotationRedoRef = useRef<BoardOperation[][]>([])
  const screenAnnotationMutationRef = useRef<Promise<void> | null>(null)
  const screenAnnotationMutationEpochRef = useRef(0)
  const screenAnnotationPendingOperationsRef = useRef<PendingBoardOperation[]>([])
  const screenAnnotationOperationFlushRef = useRef<ScreenAnnotationOperationPipeline | null>(null)
  const flushScreenAnnotationOperationsRef = useRef<() => Promise<void>>(async () => undefined)
  const endScreenAnnotationRef = useRef<() => Promise<void>>(async () => undefined)
  const restartScreenAnnotationRef = useRef<() => Promise<void>>(async () => undefined)
  const screenAnnotationRetryTimerRef = useRef<number | null>(null)
  const screenAnnotationEndRetryTimerRef = useRef<number | null>(null)
  const screenAnnotationRetryAttemptRef = useRef(0)
  const screenAnnotationEndRequestedRef = useRef(false)
  const screenAnnotationEndAwaitingFlushRef = useRef(false)
  const screenAnnotationRestartAfterEndRef = useRef(false)
  const screenAnnotationSessionShareEpochRef = useRef(-1)
  const screenFrameInFlightRef = useRef<Promise<void> | null>(null)
  const screenFrameCaptureEpochRef = useRef(0)
  const screenFrameUrlRef = useRef('')
  const screenShareStateRef = useRef<ClassroomScreenShareState>(EMPTY_SCREEN_SHARE_STATE)
  const screenShareEpochRef = useRef(0)

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

  const replaceScreenAnnotationSession = useCallback((next: OnlineClassroomScreenAnnotationSession | null) => {
    screenAnnotationSessionRef.current = next
    setScreenAnnotationSession(next)
  }, [])

  const resetScreenAnnotationHistory = useCallback(() => {
    screenAnnotationUndoRef.current = []
    screenAnnotationRedoRef.current = []
    setScreenAnnotationHistory({ canUndo: false, canRedo: false })
  }, [])

  const rememberScreenAnnotationForUndo = useCallback((operations: BoardOperation[]) => {
    screenAnnotationUndoRef.current = [
      ...screenAnnotationUndoRef.current.slice(-(MAX_HISTORY_ENTRIES - 1)),
      operations,
    ]
    screenAnnotationRedoRef.current = []
    setScreenAnnotationHistory({ canUndo: true, canRedo: false })
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
    setScreenShareState(EMPTY_SCREEN_SHARE_STATE)
    screenShareStateRef.current = EMPTY_SCREEN_SHARE_STATE
    screenShareEpochRef.current += 1
    replaceScreenAnnotationSession(null)
    screenAnnotationSessionShareEpochRef.current = -1
    resetScreenAnnotationHistory()
    setScreenAnnotationSaveStatus('saved')
    setScreenAnnotationBusy(false)
    setScreenAnnotationPendingOperationCount(0)
    setScreenAnnotationError('')
    screenAnnotationMutationEpochRef.current += 1
    screenAnnotationMutationRef.current = null
    screenAnnotationPendingOperationsRef.current = []
    screenAnnotationOperationFlushRef.current = null
    screenAnnotationRetryAttemptRef.current = 0
    screenAnnotationEndRequestedRef.current = false
    screenAnnotationEndAwaitingFlushRef.current = false
    screenAnnotationRestartAfterEndRef.current = false
    if (screenAnnotationRetryTimerRef.current !== null) window.clearTimeout(screenAnnotationRetryTimerRef.current)
    screenAnnotationRetryTimerRef.current = null
    if (screenAnnotationEndRetryTimerRef.current !== null) window.clearTimeout(screenAnnotationEndRetryTimerRef.current)
    screenAnnotationEndRetryTimerRef.current = null
    screenFrameCaptureEpochRef.current += 1
    screenFrameInFlightRef.current = null
    screenFrameUrlRef.current = ''
    setScreenFrameUrl('')
    setScreenFrameState('idle')
    setScreenFrameError('')
    if (boardRefreshTimerRef.current !== null) window.clearTimeout(boardRefreshTimerRef.current)
    boardRefreshTimerRef.current = null
    seenMessageIdsRef.current = new Set()
    pendingBoardOperationsRef.current = []
    pendingOperationFlushRef.current = null
    boardMutationRef.current = null
    setPendingBoardOperationCount(0)
    setBoardMutationBusy(false)
    setWhiteboardWindowMode('minimized')
    whiteboardRestoreModeRef.current = 'normal'
    setMeetingControlsCollapsed(false)
    localParticipantIdRef.current = ''
    remoteParticipantIdsRef.current = new Set()
    setRemoteParticipantCount(0)
    setConferenceJoined(false)
    conferenceJoinedRef.current = false
    classroomStartedAtRef.current = null
    setClassroomElapsedSeconds(0)
    setWaitingRoomReady(false)
    setIssuingStudentInvite(false)
    setKnockingParticipants([])
    setScheduledMeetingTimer({ durationSeconds: 0, elapsedSeconds: 0 })
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
      const initialScreenAnnotation = sanitizeScreenAnnotationSession(result.screenAnnotationSession)
      setScheduledMeetingTimer(onlineClassroomMeetingTimer(result, Date.now()))
      accessRef.current = result
      boardRef.current = initialBoard
      savedVersionRef.current = initialBoard.version
      setAccess(result)
      setBoard(initialBoard)
      replaceScreenAnnotationSession(initialScreenAnnotation)
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
  }, [bookingId, replaceScreenAnnotationSession, resetHistory, resetScreenAnnotationHistory, routeEpoch])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadClassroom(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadClassroom])

  useEffect(() => {
    if (!accessMatchesRoute || !access) return
    document.title = `${access.subjectName || 'Lớp học trực tuyến'} | 123English`
  }, [access, accessMatchesRoute])

  useEffect(() => {
    if (!conferenceJoined) return
    if (classroomStartedAtRef.current === null) classroomStartedAtRef.current = Date.now()
    const updateElapsed = () => {
      const startedAt = classroomStartedAtRef.current
      if (startedAt !== null) setClassroomElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000))
    }
    updateElapsed()
    const interval = window.setInterval(updateElapsed, 1_000)
    return () => window.clearInterval(interval)
  }, [conferenceJoined])

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

  const sendBoardPayload = useCallback(async (
    payload: BoardMessagePayload,
    surface: 'board' | 'screen' = 'board',
  ): Promise<number> => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    if (!isRouteScopeActive(scope)
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
      || connectionStateRef.current !== 'connected'
      || !dataChannelReadyRef.current
      || !localParticipantIdRef.current) return 0
    const message = makeBoardMessage(scope.bookingId, currentAccess.role, payload, surface)
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

    await sendBoardPayload({ type: 'snapshot-refresh', boardVersion: snapshot.version })
  }, [captureRouteScope, isRouteScopeActive, sendBoardPayload])

  const flushPendingBoardOperations = useCallback(async () => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    if (
      !isRouteScopeActive(scope)
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
    ) return

    const existingPipeline = pendingOperationFlushRef.current
    if (existingPipeline && isRouteScopeActive(existingPipeline.scope)) return existingPipeline.promise
    if (pendingBoardOperationsRef.current.length === 0) return

    const pipeline: BoardOperationPipeline = {
      scope,
      promise: Promise.resolve(),
    }
    const work = (async () => {
      while (isRouteScopeActive(scope) && pendingBoardOperationsRef.current.length > 0) {
        const queued = pendingBoardOperationsRef.current[0]
        const operation = queued.operation
        try {
          const result = await appendOnlineClassroomBoardOperation(
            scope.bookingId,
            operation,
            queued.generation,
            tokenRef.current || undefined,
          )
          if (!isRouteScopeActive(scope)) return
          const remoteBoard = sanitizeBoardSnapshot(result.boardSnapshot)
          const visibleBeforeCommit = boardRef.current
          const knownOperationIds = new Set(visibleBeforeCommit.operations.map((item) => item.id))
          const remoteIds = new Set(remoteBoard.operations.map((item) => item.id))
          const remoteHasUnexpectedOperation = remoteBoard.operations
            .some((item) => !knownOperationIds.has(item.id))
          const pendingOperationIds = new Set(pendingBoardOperationsRef.current.map((item) => item.operation.id))
          const remoteRemovedUnexpectedOperation = visibleBeforeCommit.operations.some((item) => (
            !remoteIds.has(item.id)
            && !pendingOperationIds.has(item.id)
          ))
          pendingBoardOperationsRef.current = pendingBoardOperationsRef.current
            .filter((item) => item.operation.id !== operation.id)
          let stillPending = pendingBoardOperationsRef.current
            .filter((item) => item.generation === remoteBoard.generation && !remoteIds.has(item.operation.id))
          pendingBoardOperationsRef.current = stillPending

          // A periodic refresh may have installed a newer authoritative board
          // while this callable response was travelling back. The operation has
          // already been acknowledged above, but an older ACK must never roll
          // back a later clear, lock or collaborator append.
          const liveBoard = boardRef.current
          if (remoteBoard.version < liveBoard.version) {
            const liveIds = new Set(liveBoard.operations.map((item) => item.id))
            stillPending = pendingBoardOperationsRef.current.filter((item) => (
              item.generation === liveBoard.generation && !liveIds.has(item.operation.id)
            ))
            pendingBoardOperationsRef.current = stillPending
            setPendingBoardOperationCount(stillPending.length)
            if (isBoardManager(accessRef.current?.role || 'student')) {
              setSaveStatus(stillPending.length > 0 ? 'dirty' : 'saved')
            }
            continue
          }
          const visibleBoard = {
            ...remoteBoard,
            operations: [
              ...remoteBoard.operations,
              ...stillPending.map((item) => item.operation),
            ].slice(0, MAX_BOARD_OPERATIONS),
          }
          savedVersionRef.current = remoteBoard.version
          replaceBoard(
            visibleBoard,
            isBoardManager(accessRef.current?.role || 'student')
              ? stillPending.length > 0 ? 'dirty' : 'saved'
              : undefined,
          )
          setPendingBoardOperationCount(stillPending.length)
          if (isBoardManager(accessRef.current?.role || 'student')
            && (remoteHasUnexpectedOperation
              || remoteRemovedUnexpectedOperation
              || remoteBoard.generation !== visibleBeforeCommit.generation)) {
            resetHistory()
          }
          setSyncWarning('')
          await sendBoardPayload({ type: 'snapshot-refresh', boardVersion: remoteBoard.version })
        } catch (error) {
          if (!isRouteScopeActive(scope)) return
          if (isTerminalBoardOperationError(error)) {
            pendingBoardOperationsRef.current = pendingBoardOperationsRef.current
              .filter((item) => item.operation.id !== operation.id)
            setPendingBoardOperationCount(pendingBoardOperationsRef.current.length)
            setSyncWarning(`Nét vẽ không được hệ thống nhận: ${onlineClassroomErrorMessage(error)}`)
            try {
              const latestAccess = await requestOnlineClassroomAccess(scope.bookingId, tokenRef.current || undefined)
              if (!isRouteScopeActive(scope) || latestAccess.bookingId !== scope.bookingId) return
              accessRef.current = latestAccess
              setAccess(latestAccess)
              const authoritativeBoard = sanitizeBoardSnapshot(latestAccess.boardSnapshot)
              const authoritativeIds = new Set(authoritativeBoard.operations.map((item) => item.id))
              const retryablePending = pendingBoardOperationsRef.current
                .filter((item) => item.generation === authoritativeBoard.generation
                  && !authoritativeIds.has(item.operation.id))
              pendingBoardOperationsRef.current = retryablePending
              replaceBoard({
                ...authoritativeBoard,
                operations: [
                  ...authoritativeBoard.operations,
                  ...retryablePending.map((item) => item.operation),
                ].slice(0, MAX_BOARD_OPERATIONS),
              })
              savedVersionRef.current = authoritativeBoard.version
              setPendingBoardOperationCount(retryablePending.length)
              resetHistory()
            } catch {
              // Keep the authoritative rejection visible. The normal refresh
              // interval will recover the snapshot when connectivity returns.
            }
            continue
          }
          setSyncWarning(`Nét vẽ đang chờ đồng bộ lên hệ thống: ${onlineClassroomErrorMessage(error)}`)
          setPendingBoardOperationCount(pendingBoardOperationsRef.current.length)
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
  }, [captureRouteScope, isRouteScopeActive, replaceBoard, resetHistory, sendBoardPayload])

  const handleLocalOperation = useCallback((operation: BoardOperation): boolean => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    const previous = boardRef.current
    if (!isRouteScopeActive(scope) || !currentAccess || currentAccess.bookingId !== scope.bookingId) return false
    if (boardMutationRef.current) {
      toast.info('Bảng đang hoàn tất một thao tác quản lý. Hãy viết tiếp sau giây lát.')
      return false
    }
    if (previous.operations.length >= MAX_BOARD_OPERATIONS) {
      toast.warning('Bảng đã đạt giới hạn nét vẽ. Gia sư hãy lưu rồi xóa bảng để tiếp tục.')
      return false
    }
    if (currentAccess.role === 'student' && !previous.studentCanWrite) return false
    if (previous.operations.some((item) => item.id === operation.id)) return false

    const localIsManager = isBoardManager(currentAccess.role)
    if (localIsManager) rememberForUndo(previous.operations)
    const next = {
      ...previous,
      operations: [...previous.operations, operation],
    }
    replaceBoard(next, localIsManager ? 'dirty' : undefined)
    pendingBoardOperationsRef.current.push({ operation, generation: previous.generation })
    setPendingBoardOperationCount(pendingBoardOperationsRef.current.length)
    void flushPendingBoardOperations()
    return true
  }, [captureRouteScope, flushPendingBoardOperations, isRouteScopeActive, rememberForUndo, replaceBoard])

  const commitManagerBoardMutation = useCallback((
    createNext: (current: ValidatedBoardSnapshot) => ValidatedBoardSnapshot,
    retryOnConflict = false,
  ): Promise<boolean> => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    if (
      !isRouteScopeActive(scope)
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
      || !isBoardManager(currentAccess.role)
    ) return Promise.resolve(false)
    const existing = boardMutationRef.current
    if (existing) return existing

    const work = (async () => {
      setBoardMutationBusy(true)
      try {
        await flushPendingBoardOperations()
        if (!isRouteScopeActive(scope)) return false
        if (pendingBoardOperationsRef.current.length > 0) {
          toast.warning('Một số nét vẽ chưa đồng bộ. Hãy kiểm tra mạng rồi thử lại thao tác quản lý bảng.')
          return false
        }

        for (let attempt = 0; attempt < (retryOnConflict ? 3 : 1); attempt += 1) {
          if (!isRouteScopeActive(scope)) return false
          const current = boardRef.current
          const candidate = createNext(current)
          const candidateIds = new Set(candidate.operations.map((operation) => operation.id))
          const removesStoredOperation = current.operations.some((operation) => !candidateIds.has(operation.id))
          const next = removesStoredOperation && candidate.generation === current.generation
            ? { ...candidate, generation: current.generation + 1 }
            : candidate
          replaceBoard(next, 'saving')
          try {
            const result = await saveOnlineClassroomBoard(
              scope.bookingId,
              current.version,
              toCallableBoardDraft(next),
              tokenRef.current || undefined,
            )
            if (!isRouteScopeActive(scope)) return false
            const committed = { ...next, version: result.version }
            savedVersionRef.current = result.version
            replaceBoard(committed, 'saved')
            await sendBoardPayload({ type: 'snapshot-refresh', boardVersion: result.version })
            return true
          } catch (error) {
            if (!isRouteScopeActive(scope)) return false
            if (errorCode(error) !== 'failed-precondition') {
              replaceBoard(current, 'error')
              toast.error(`Chưa lưu được bảng: ${onlineClassroomErrorMessage(error)}`)
              return false
            }
            try {
              const latestAccess = await requestOnlineClassroomAccess(scope.bookingId, tokenRef.current || undefined)
              if (!isRouteScopeActive(scope) || latestAccess.bookingId !== scope.bookingId) return false
              const authoritativeBoard = sanitizeBoardSnapshot(latestAccess.boardSnapshot)
              accessRef.current = latestAccess
              setAccess(latestAccess)
              savedVersionRef.current = authoritativeBoard.version
              replaceBoard(authoritativeBoard, 'saved')
              resetHistory()
            } catch (refreshError) {
              if (!isRouteScopeActive(scope)) return false
              setSaveStatus('error')
              toast.error(`Chưa đồng bộ lại được bảng: ${onlineClassroomErrorMessage(refreshError)}`)
              return false
            }
            if (!retryOnConflict) {
              toast.warning('Bảng vừa có thay đổi từ người khác. Hệ thống đã giữ bản mới nhất; hãy thao tác lại nếu cần.')
              return false
            }
          }
        }
        toast.warning('Bảng đang có nhiều thay đổi đồng thời. Hãy thử lại sau giây lát.')
        return false
      } finally {
        if (isRouteScopeActive(scope)) setBoardMutationBusy(false)
      }
    })()
    boardMutationRef.current = work
    void work.finally(() => {
      if (boardMutationRef.current === work) boardMutationRef.current = null
    })
    return work
  }, [captureRouteScope, flushPendingBoardOperations, isRouteScopeActive, replaceBoard, resetHistory, sendBoardPayload])

  const handleUndo = useCallback(() => {
    const previousOperations = undoHistoryRef.current.pop()
    if (!previousOperations) return
    const current = boardRef.current
    redoHistoryRef.current.push(current.operations)
    setHistoryState({
      canUndo: undoHistoryRef.current.length > 0,
      canRedo: redoHistoryRef.current.length > 0,
    })
    void commitManagerBoardMutation((latest) => ({ ...latest, operations: previousOperations }))
      .then((saved) => { if (!saved) resetHistory() })
  }, [commitManagerBoardMutation, resetHistory])

  const handleRedo = useCallback(() => {
    const nextOperations = redoHistoryRef.current.pop()
    if (!nextOperations) return
    const current = boardRef.current
    undoHistoryRef.current.push(current.operations)
    setHistoryState({
      canUndo: undoHistoryRef.current.length > 0,
      canRedo: redoHistoryRef.current.length > 0,
    })
    void commitManagerBoardMutation((latest) => ({ ...latest, operations: nextOperations }))
      .then((saved) => { if (!saved) resetHistory() })
  }, [commitManagerBoardMutation, resetHistory])

  const handleClear = useCallback(() => {
    const current = boardRef.current
    if (current.operations.length === 0) return
    rememberForUndo(current.operations)
    void commitManagerBoardMutation((latest) => ({
      ...latest,
      generation: latest.generation + 1,
      operations: [],
    }), true).then((saved) => { if (saved) resetHistory() })
  }, [commitManagerBoardMutation, rememberForUndo, resetHistory])

  const handleStudentCanWriteChange = useCallback((enabled: boolean) => {
    const current = boardRef.current
    if (current.studentCanWrite === enabled) return
    void commitManagerBoardMutation((latest) => ({ ...latest, studentCanWrite: enabled }), true)
  }, [commitManagerBoardMutation])

  const reloadScreenAnnotationSession = useCallback(async () => {
    const scope = captureRouteScope()
    if (!isRouteScopeActive(scope)) return null
    const latestAccess = await requestOnlineClassroomAccess(scope.bookingId, tokenRef.current || undefined)
    if (!isRouteScopeActive(scope) || latestAccess.bookingId !== scope.bookingId) return null
    accessRef.current = latestAccess
    setAccess(latestAccess)
    const nextSession = sanitizeScreenAnnotationSession(latestAccess.screenAnnotationSession)
    const previousSession = screenAnnotationSessionRef.current
    replaceScreenAnnotationSession(nextSession)
    if (nextSession?.sessionId !== previousSession?.sessionId
      || nextSession?.boardSnapshot.version !== previousSession?.boardSnapshot.version) {
      resetScreenAnnotationHistory()
    }
    if (nextSession?.sessionId !== previousSession?.sessionId || !nextSession?.active) {
      screenAnnotationSessionShareEpochRef.current = -1
      screenAnnotationPendingOperationsRef.current = []
      setScreenAnnotationPendingOperationCount(0)
    }
    return nextSession
  }, [captureRouteScope, isRouteScopeActive, replaceScreenAnnotationSession, resetScreenAnnotationHistory])

  const signalScreenAnnotationRefresh = useCallback(async (session: OnlineClassroomScreenAnnotationSession) => {
    await sendBoardPayload({
      type: 'snapshot-refresh',
      boardVersion: session.boardSnapshot.version,
    }, 'screen')
  }, [sendBoardPayload])

  const scheduleRequestedScreenAnnotationEnd = useCallback((delayMs = 0) => {
    const scope = captureRouteScope()
    if (!isRouteScopeActive(scope)
      || !screenAnnotationEndRequestedRef.current
      || screenAnnotationEndAwaitingFlushRef.current
      || screenAnnotationMutationRef.current
      || screenAnnotationPendingOperationsRef.current.length > 0
      || screenAnnotationEndRetryTimerRef.current !== null) return

    screenAnnotationEndRetryTimerRef.current = window.setTimeout(() => {
      screenAnnotationEndRetryTimerRef.current = null
      if (!isRouteScopeActive(scope)
        || !screenAnnotationEndRequestedRef.current
        || screenAnnotationEndAwaitingFlushRef.current
        || screenAnnotationMutationRef.current
        || screenAnnotationPendingOperationsRef.current.length > 0) return
      void endScreenAnnotationRef.current()
    }, Math.max(0, delayMs))
  }, [captureRouteScope, isRouteScopeActive])

  const flushScreenAnnotationOperations = useCallback(async () => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    const currentSession = screenAnnotationSessionRef.current
    if (!isRouteScopeActive(scope)
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
      || !currentSession?.active
      || screenAnnotationPendingOperationsRef.current.length === 0) return
    const existing = screenAnnotationOperationFlushRef.current
    if (existing && isRouteScopeActive(existing.scope) && existing.sessionId === currentSession.sessionId) {
      return existing.promise
    }

    const pipeline: ScreenAnnotationOperationPipeline = {
      scope,
      sessionId: currentSession.sessionId,
      promise: Promise.resolve(),
    }
    const work = (async () => {
      while (
        isRouteScopeActive(scope)
        && screenAnnotationSessionRef.current?.sessionId === pipeline.sessionId
        && screenAnnotationSessionRef.current.active
        && screenAnnotationPendingOperationsRef.current.length > 0
      ) {
        const queued = screenAnnotationPendingOperationsRef.current[0]
        const operation = queued.operation
        const knownOperationIdsAtDispatch = new Set(
          sanitizeBoardSnapshot(screenAnnotationSessionRef.current?.boardSnapshot)
            .operations.map((item) => item.id),
        )
        try {
          const result = await appendOnlineClassroomScreenAnnotationOperation(
            scope.bookingId,
            pipeline.sessionId,
            operation,
            queued.generation,
            tokenRef.current || undefined,
          )
          if (!isRouteScopeActive(scope)) return
          const savedSession = sanitizeScreenAnnotationSession(result)
          if (!savedSession || savedSession.sessionId !== pipeline.sessionId) {
            throw new Error('Phiên chú thích trả về không hợp lệ.')
          }
          const liveSession = screenAnnotationSessionRef.current
          if (!liveSession?.active || liveSession.sessionId !== pipeline.sessionId) return

          const authoritativeSnapshot = sanitizeBoardSnapshot(savedSession.boardSnapshot)
          const liveSnapshot = sanitizeBoardSnapshot(liveSession.boardSnapshot)
          const authoritativeIds = new Set(authoritativeSnapshot.operations.map((item) => item.id))
          if (isBoardManager(currentAccess.role)
            && authoritativeSnapshot.operations.some((item) => !knownOperationIdsAtDispatch.has(item.id))) {
            // A collaborator committed while this request was in flight. Whole-
            // snapshot undo entries are no longer safe because they could erase
            // those remote strokes.
            resetScreenAnnotationHistory()
          }

          screenAnnotationPendingOperationsRef.current = screenAnnotationPendingOperationsRef.current
            .filter((item) => item.operation.id !== operation.id)
          const pending = screenAnnotationPendingOperationsRef.current
            .filter((item) => item.generation === authoritativeSnapshot.generation
              && !authoritativeIds.has(item.operation.id))
          screenAnnotationPendingOperationsRef.current = pending

          // A refresh may already have installed a newer authoritative version
          // while this callable response was travelling back to the browser.
          // Never let the older ACK roll that state back.
          if (authoritativeSnapshot.version < liveSnapshot.version) {
            const liveIds = new Set(liveSnapshot.operations.map((item) => item.id))
            const stillPending = pending.filter((item) => !liveIds.has(item.operation.id))
            screenAnnotationPendingOperationsRef.current = stillPending
            setScreenAnnotationPendingOperationCount(stillPending.length)
            setScreenAnnotationSaveStatus(stillPending.length > 0 ? 'saving' : 'saved')
            screenAnnotationRetryAttemptRef.current = 0
            continue
          }

          const visibleSession: OnlineClassroomScreenAnnotationSession = {
            ...savedSession,
            boardSnapshot: {
              ...authoritativeSnapshot,
              operations: [
                ...authoritativeSnapshot.operations,
                ...pending.map((item) => item.operation),
              ].slice(0, MAX_BOARD_OPERATIONS),
            },
          }
          replaceScreenAnnotationSession(visibleSession)
          setScreenAnnotationPendingOperationCount(pending.length)
          setScreenAnnotationSaveStatus(pending.length > 0 ? 'saving' : 'saved')
          setScreenAnnotationError('')
          screenAnnotationRetryAttemptRef.current = 0
          if (screenAnnotationRetryTimerRef.current !== null) {
            window.clearTimeout(screenAnnotationRetryTimerRef.current)
            screenAnnotationRetryTimerRef.current = null
          }
          void signalScreenAnnotationRefresh(savedSession)
        } catch (error) {
          if (!isRouteScopeActive(scope)) return
          setScreenAnnotationSaveStatus('error')
          setScreenAnnotationError(`Nét chú thích đang chờ đồng bộ: ${onlineClassroomErrorMessage(error)}`)
          if (isTerminalScreenAnnotationOperationError(error)) {
            screenAnnotationPendingOperationsRef.current = []
            setScreenAnnotationPendingOperationCount(0)
            screenAnnotationRetryAttemptRef.current = 0
            resetScreenAnnotationHistory()
            try {
              await reloadScreenAnnotationSession()
            } catch {
              // Authenticated refresh will retry on the normal sync interval.
            }
          } else if (screenAnnotationRetryTimerRef.current === null) {
            const retryAttempt = Math.min(8, screenAnnotationRetryAttemptRef.current + 1)
            screenAnnotationRetryAttemptRef.current = retryAttempt
            const rateLimited = errorReason(error) === 'SCREEN_ANNOTATION_RATE_LIMITED'
            const baseDelay = rateLimited ? 10_000 : 1_600
            const maxDelay = rateLimited ? 60_000 : 20_000
            const retryDelay = Math.min(maxDelay, baseDelay * (2 ** (retryAttempt - 1)))
              + Math.floor(Math.random() * 400)
            screenAnnotationRetryTimerRef.current = window.setTimeout(() => {
              screenAnnotationRetryTimerRef.current = null
              void flushScreenAnnotationOperationsRef.current()
            }, retryDelay)
          }
          break
        }
      }
    })()
    pipeline.promise = work
    screenAnnotationOperationFlushRef.current = pipeline
    try {
      await work
    } finally {
      if (screenAnnotationOperationFlushRef.current === pipeline) {
        screenAnnotationOperationFlushRef.current = null
      }
      if (screenAnnotationPendingOperationsRef.current.length === 0) {
        scheduleRequestedScreenAnnotationEnd()
      }
    }
  }, [captureRouteScope, isRouteScopeActive, reloadScreenAnnotationSession, replaceScreenAnnotationSession, resetScreenAnnotationHistory, scheduleRequestedScreenAnnotationEnd, signalScreenAnnotationRefresh])

  useEffect(() => {
    flushScreenAnnotationOperationsRef.current = flushScreenAnnotationOperations
  }, [flushScreenAnnotationOperations])

  const handleScreenAnnotationOperation = useCallback((operation: BoardOperation): boolean => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    const currentSession = screenAnnotationSessionRef.current
    if (!isRouteScopeActive(scope)
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
      || !currentSession?.active
      || screenAnnotationMutationRef.current) return false
    const previousSnapshot = sanitizeBoardSnapshot(currentSession.boardSnapshot)
    if (previousSnapshot.operations.length >= MAX_BOARD_OPERATIONS) {
      toast.warning('Phần chú thích đã đạt giới hạn. Gia sư hãy xóa chú thích để tiếp tục.')
      return false
    }
    if (currentAccess.role === 'student' && !previousSnapshot.studentCanWrite) return false
    if (previousSnapshot.operations.some((item) => item.id === operation.id)) return false

    if (isBoardManager(currentAccess.role)) rememberScreenAnnotationForUndo(previousSnapshot.operations)
    replaceScreenAnnotationSession({
      ...currentSession,
      boardSnapshot: {
        ...previousSnapshot,
        operations: [...previousSnapshot.operations, operation],
      },
    })
    screenAnnotationPendingOperationsRef.current.push({
      operation,
      generation: previousSnapshot.generation,
    })
    setScreenAnnotationPendingOperationCount(screenAnnotationPendingOperationsRef.current.length)
    setScreenAnnotationSaveStatus('saving')
    setScreenAnnotationError('')
    void flushScreenAnnotationOperations()
    return true
  }, [captureRouteScope, flushScreenAnnotationOperations, isRouteScopeActive, rememberScreenAnnotationForUndo, replaceScreenAnnotationSession])

  const commitScreenAnnotationSnapshot = useCallback((requestedSnapshot: ValidatedBoardSnapshot) => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    const currentSession = screenAnnotationSessionRef.current
    if (!isRouteScopeActive(scope)
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
      || !isBoardManager(currentAccess.role)
      || !currentSession?.active) return
    if (screenAnnotationMutationRef.current || screenAnnotationPendingOperationsRef.current.length > 0) {
      toast.info('Đang đồng bộ chú thích. Vui lòng chờ giây lát.')
      return
    }

    const currentSnapshot = sanitizeBoardSnapshot(currentSession.boardSnapshot)
    const requestedIds = new Set(requestedSnapshot.operations.map((operation) => operation.id))
    const removesStoredOperation = currentSnapshot.operations.some((operation) => !requestedIds.has(operation.id))
    const nextSnapshot = removesStoredOperation && requestedSnapshot.generation === currentSnapshot.generation
      ? { ...requestedSnapshot, generation: currentSnapshot.generation + 1 }
      : requestedSnapshot

    replaceScreenAnnotationSession({ ...currentSession, boardSnapshot: nextSnapshot })
    setScreenAnnotationSaveStatus('saving')
    setScreenAnnotationBusy(true)
    setScreenAnnotationError('')
    const mutationEpoch = ++screenAnnotationMutationEpochRef.current
    const work = (async () => {
      try {
        const result = await saveOnlineClassroomScreenAnnotation(
          scope.bookingId,
          currentSession.sessionId,
          currentSession.boardSnapshot.version,
          toCallableBoardDraft(nextSnapshot),
        )
        if (!isRouteScopeActive(scope)) return
        const savedSession = sanitizeScreenAnnotationSession(result)
        if (!savedSession || savedSession.sessionId !== currentSession.sessionId) {
          throw new Error('Phiên chú thích trả về không hợp lệ.')
        }
        replaceScreenAnnotationSession(savedSession)
        setScreenAnnotationSaveStatus('saved')
        await signalScreenAnnotationRefresh(savedSession)
      } catch (error) {
        if (!isRouteScopeActive(scope)) return
        setScreenAnnotationSaveStatus('error')
        setScreenAnnotationError(onlineClassroomErrorMessage(error))
        try {
          await reloadScreenAnnotationSession()
        } catch {
          replaceScreenAnnotationSession(currentSession)
        }
        resetScreenAnnotationHistory()
      } finally {
        if (screenAnnotationMutationEpochRef.current === mutationEpoch) screenAnnotationMutationRef.current = null
        if (isRouteScopeActive(scope)) setScreenAnnotationBusy(false)
      }
    })()
    screenAnnotationMutationRef.current = work
  }, [captureRouteScope, isRouteScopeActive, reloadScreenAnnotationSession, replaceScreenAnnotationSession, resetScreenAnnotationHistory, signalScreenAnnotationRefresh])

  const handleScreenAnnotationUndo = useCallback(() => {
    if (screenAnnotationMutationRef.current || screenAnnotationPendingOperationsRef.current.length > 0) return
    const previousOperations = screenAnnotationUndoRef.current.pop()
    const currentSession = screenAnnotationSessionRef.current
    if (!previousOperations || !currentSession?.active) return
    const currentSnapshot = sanitizeBoardSnapshot(currentSession.boardSnapshot)
    screenAnnotationRedoRef.current.push(currentSnapshot.operations)
    setScreenAnnotationHistory({
      canUndo: screenAnnotationUndoRef.current.length > 0,
      canRedo: screenAnnotationRedoRef.current.length > 0,
    })
    commitScreenAnnotationSnapshot({ ...currentSnapshot, operations: previousOperations })
  }, [commitScreenAnnotationSnapshot])

  const handleScreenAnnotationRedo = useCallback(() => {
    if (screenAnnotationMutationRef.current || screenAnnotationPendingOperationsRef.current.length > 0) return
    const nextOperations = screenAnnotationRedoRef.current.pop()
    const currentSession = screenAnnotationSessionRef.current
    if (!nextOperations || !currentSession?.active) return
    const currentSnapshot = sanitizeBoardSnapshot(currentSession.boardSnapshot)
    screenAnnotationUndoRef.current.push(currentSnapshot.operations)
    setScreenAnnotationHistory({
      canUndo: screenAnnotationUndoRef.current.length > 0,
      canRedo: screenAnnotationRedoRef.current.length > 0,
    })
    commitScreenAnnotationSnapshot({ ...currentSnapshot, operations: nextOperations })
  }, [commitScreenAnnotationSnapshot])

  const handleScreenAnnotationClear = useCallback(() => {
    const currentSession = screenAnnotationSessionRef.current
    if (!currentSession?.active || screenAnnotationMutationRef.current || screenAnnotationPendingOperationsRef.current.length > 0) return
    const currentSnapshot = sanitizeBoardSnapshot(currentSession.boardSnapshot)
    if (currentSnapshot.operations.length === 0) return
    rememberScreenAnnotationForUndo(currentSnapshot.operations)
    commitScreenAnnotationSnapshot({
      ...currentSnapshot,
      generation: currentSnapshot.generation + 1,
      operations: [],
    })
  }, [commitScreenAnnotationSnapshot, rememberScreenAnnotationForUndo])

  const handleScreenStudentCanWriteChange = useCallback((enabled: boolean) => {
    const currentSession = screenAnnotationSessionRef.current
    if (!currentSession?.active || screenAnnotationMutationRef.current || screenAnnotationPendingOperationsRef.current.length > 0) return
    const currentSnapshot = sanitizeBoardSnapshot(currentSession.boardSnapshot)
    if (currentSnapshot.studentCanWrite === enabled) return
    commitScreenAnnotationSnapshot({ ...currentSnapshot, studentCanWrite: enabled })
  }, [commitScreenAnnotationSnapshot])

  const handleBeginScreenAnnotation = useCallback(async (expectedShareEpoch = screenShareEpochRef.current) => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    if (!isRouteScopeActive(scope)
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
      || !isBoardManager(currentAccess.role)
      || !screenShareStateRef.current.active
      || screenShareEpochRef.current !== expectedShareEpoch
      || screenAnnotationMutationRef.current) return
    screenAnnotationEndRequestedRef.current = false
    if (screenAnnotationEndRetryTimerRef.current !== null) {
      window.clearTimeout(screenAnnotationEndRetryTimerRef.current)
      screenAnnotationEndRetryTimerRef.current = null
    }
    setScreenAnnotationBusy(true)
    setScreenAnnotationError('')
    const mutationEpoch = ++screenAnnotationMutationEpochRef.current
    const work = (async () => {
      try {
        const result = await beginOnlineClassroomScreenAnnotation(scope.bookingId)
        if (!isRouteScopeActive(scope)) return
        const session = sanitizeScreenAnnotationSession(result)
        if (!session?.active) throw new Error('Chưa tạo được phiên chú thích màn hình.')
        if (!screenShareStateRef.current.active
          || screenShareEpochRef.current !== expectedShareEpoch
          || screenAnnotationEndRequestedRef.current) {
          screenAnnotationRestartAfterEndRef.current = Boolean(
            screenShareStateRef.current.active
            && screenShareStateRef.current.local
            && isBoardManager(accessRef.current?.role || 'student'),
          )
          const ended = sanitizeScreenAnnotationSession(
            await endOnlineClassroomScreenAnnotation(scope.bookingId, session.sessionId),
          )
          if (isRouteScopeActive(scope)) {
            replaceScreenAnnotationSession(ended)
            screenAnnotationSessionShareEpochRef.current = -1
            screenAnnotationEndRequestedRef.current = false
          }
          return
        }
        screenAnnotationPendingOperationsRef.current = []
        setScreenAnnotationPendingOperationCount(0)
        resetScreenAnnotationHistory()
        replaceScreenAnnotationSession(session)
        screenAnnotationSessionShareEpochRef.current = expectedShareEpoch
        screenAnnotationRestartAfterEndRef.current = false
        screenFrameUrlRef.current = ''
        setScreenFrameUrl('')
        setScreenFrameState('loading')
        setScreenFrameError('')
        setScreenAnnotationSaveStatus('saved')
        await signalScreenAnnotationRefresh(session)
      } catch (error) {
        if (isRouteScopeActive(scope)) setScreenAnnotationError(onlineClassroomErrorMessage(error))
      } finally {
        if (screenAnnotationMutationEpochRef.current === mutationEpoch) screenAnnotationMutationRef.current = null
        if (isRouteScopeActive(scope)) setScreenAnnotationBusy(false)
        if (isRouteScopeActive(scope)
          && screenAnnotationRestartAfterEndRef.current
          && screenShareStateRef.current.active
          && screenShareStateRef.current.local
          && isBoardManager(accessRef.current?.role || 'student')) {
          window.setTimeout(() => void restartScreenAnnotationRef.current(), 0)
        }
      }
    })()
    screenAnnotationMutationRef.current = work
    await work
  }, [captureRouteScope, isRouteScopeActive, replaceScreenAnnotationSession, resetScreenAnnotationHistory, signalScreenAnnotationRefresh])

  const handleEndScreenAnnotation = useCallback(async () => {
    const scope = captureRouteScope()
    const currentAccess = accessRef.current
    if (!isRouteScopeActive(scope)
      || !currentAccess
      || currentAccess.bookingId !== scope.bookingId
      || !isBoardManager(currentAccess.role)) return

    screenAnnotationEndRequestedRef.current = true
    const existingMutation = screenAnnotationMutationRef.current
    if (existingMutation) {
      try {
        await existingMutation
      } catch {
        // The mutation reports its own error; continue reconciling the end.
      }
      if (!isRouteScopeActive(scope)) return
    }

    let currentSession = screenAnnotationSessionRef.current
    if (!currentSession?.active) {
      screenAnnotationEndRequestedRef.current = false
      return
    }
    if (screenAnnotationPendingOperationsRef.current.length > 0) {
      screenAnnotationEndAwaitingFlushRef.current = true
      try {
        await flushScreenAnnotationOperations()
      } finally {
        screenAnnotationEndAwaitingFlushRef.current = false
      }
      if (screenAnnotationPendingOperationsRef.current.length > 0) {
        if (isRouteScopeActive(scope)) {
          setScreenAnnotationError('Vẫn còn nét chưa đồng bộ. Hãy chờ mạng ổn định trước khi tắt chú thích.')
        }
        return
      }
    }
    currentSession = screenAnnotationSessionRef.current
    if (!currentSession?.active) {
      screenAnnotationEndRequestedRef.current = false
      return
    }
    if (screenAnnotationMutationRef.current) {
      scheduleRequestedScreenAnnotationEnd()
      return
    }
    setScreenAnnotationBusy(true)
    const mutationEpoch = ++screenAnnotationMutationEpochRef.current
    const work = (async () => {
      try {
        const result = await endOnlineClassroomScreenAnnotation(scope.bookingId, currentSession.sessionId)
        if (!isRouteScopeActive(scope)) return
        const session = sanitizeScreenAnnotationSession(result)
        replaceScreenAnnotationSession(session)
        screenAnnotationSessionShareEpochRef.current = -1
        screenAnnotationPendingOperationsRef.current = []
        setScreenAnnotationPendingOperationCount(0)
        screenAnnotationEndRequestedRef.current = false
        screenAnnotationRetryAttemptRef.current = 0
        if (screenAnnotationEndRetryTimerRef.current !== null) {
          window.clearTimeout(screenAnnotationEndRetryTimerRef.current)
          screenAnnotationEndRetryTimerRef.current = null
        }
        if (session) await signalScreenAnnotationRefresh(session)
      } catch (error) {
        if (isRouteScopeActive(scope)) {
          setScreenAnnotationError(onlineClassroomErrorMessage(error))
          scheduleRequestedScreenAnnotationEnd(2_500)
        }
      } finally {
        screenFrameUrlRef.current = ''
        if (isRouteScopeActive(scope)) {
          setScreenFrameUrl('')
          setScreenFrameState('idle')
          setScreenAnnotationBusy(false)
        }
        if (screenAnnotationMutationEpochRef.current === mutationEpoch) screenAnnotationMutationRef.current = null
        if (isRouteScopeActive(scope) && screenAnnotationEndRequestedRef.current) {
          scheduleRequestedScreenAnnotationEnd(2_500)
        }
        if (isRouteScopeActive(scope)
          && screenAnnotationRestartAfterEndRef.current
          && !screenAnnotationSessionRef.current?.active
          && screenShareStateRef.current.active
          && screenShareStateRef.current.local
          && isBoardManager(accessRef.current?.role || 'student')) {
          window.setTimeout(() => void restartScreenAnnotationRef.current(), 0)
        }
      }
    })()
    screenAnnotationMutationRef.current = work
    await work
  }, [captureRouteScope, flushScreenAnnotationOperations, isRouteScopeActive, replaceScreenAnnotationSession, scheduleRequestedScreenAnnotationEnd, signalScreenAnnotationRefresh])

  useEffect(() => {
    endScreenAnnotationRef.current = handleEndScreenAnnotation
  }, [handleEndScreenAnnotation])

  const restartScreenAnnotationForLocalShare = useCallback(async () => {
    const inFlightMutation = screenAnnotationMutationRef.current
    if (inFlightMutation) {
      try {
        await inFlightMutation
      } catch {
        // The originating action already surfaced its error.
      }
    }
    if (!screenShareStateRef.current.active
      || !screenShareStateRef.current.local
      || !isBoardManager(accessRef.current?.role || 'student')) return

    const currentShareEpoch = screenShareEpochRef.current
    if (screenAnnotationSessionRef.current?.active
      && screenAnnotationSessionShareEpochRef.current !== currentShareEpoch) {
      screenAnnotationRestartAfterEndRef.current = true
      await handleEndScreenAnnotation()
    }
    if (screenAnnotationSessionRef.current?.active
      && screenAnnotationSessionShareEpochRef.current === currentShareEpoch) {
      screenAnnotationRestartAfterEndRef.current = false
      return
    }
    if (screenShareStateRef.current.active
      && screenShareStateRef.current.local
      && !screenAnnotationSessionRef.current?.active) {
      screenAnnotationRestartAfterEndRef.current = false
      await handleBeginScreenAnnotation(screenShareEpochRef.current)
    }
  }, [handleBeginScreenAnnotation, handleEndScreenAnnotation])

  useEffect(() => {
    restartScreenAnnotationRef.current = restartScreenAnnotationForLocalShare
  }, [restartScreenAnnotationForLocalShare])

  const captureScreenShareFrame = useCallback(async () => {
    const scope = captureRouteScope()
    const captureSessionId = screenAnnotationSessionRef.current?.sessionId || ''
    if (!isRouteScopeActive(scope)
      || !screenShareStateRef.current.active
      || !screenAnnotationSessionRef.current?.active
      || !captureSessionId) return
    if (screenFrameInFlightRef.current) return screenFrameInFlightRef.current
    const api = jitsiApiRef.current
    const capture = api?.captureLargeVideoScreenshot
    if (!capture) {
      setScreenFrameState('error')
      setScreenFrameError('Trình gọi video chưa hỗ trợ lấy khung trình chiếu để chú thích.')
      return
    }
    setScreenFrameState('loading')
    const captureEpoch = ++screenFrameCaptureEpochRef.current
    const work = (async () => {
      try {
        const presenterId = screenShareStateRef.current.participantIds[0] || ''
        if (presenterId) {
          try {
            api.executeCommand('setTileView', false)
            api.executeCommand('setLargeVideoParticipant', presenterId, 'desktop')
            // Jitsi needs a short layout/track switch before the large-video
            // screenshot reliably contains the shared desktop rather than a
            // participant camera or the previous tile frame.
            await new Promise<void>((resolve) => window.setTimeout(resolve, 300))
          } catch {
            // Jitsi thường tự chọn desktop; tiếp tục chụp nếu API ghim không có.
          }
        }
        const result = await capture.call(api)
        if (!isRouteScopeActive(scope) || screenAnnotationSessionRef.current?.sessionId !== captureSessionId) return
        if (!isSafeScreenFrameUrl(result?.dataURL)) {
          throw new Error(result?.error || 'Chưa nhận được hình ảnh trình chiếu.')
        }
        screenFrameUrlRef.current = result.dataURL
        setScreenFrameUrl(result.dataURL)
        setScreenFrameState('ready')
        setScreenFrameError('')
      } catch (error) {
        if (!isRouteScopeActive(scope) || screenAnnotationSessionRef.current?.sessionId !== captureSessionId) return
        setScreenFrameError(error instanceof Error ? error.message : 'Chưa làm mới được khung trình chiếu.')
        setScreenFrameState(screenFrameUrlRef.current ? 'ready' : 'error')
      } finally {
        try {
          // Sau khi lấy khung bài giảng, trả iframe hẹp về dạng lưới để cột
          // bên cạnh ưu tiên camera người học thay vì lặp lại màn hình share.
          api.executeCommand('setTileView', true)
        } catch {
          // Bố cục phụ không được làm hỏng chức năng chụp khung.
        }
        if (screenFrameCaptureEpochRef.current === captureEpoch) screenFrameInFlightRef.current = null
      }
    })()
    screenFrameInFlightRef.current = work
    await work
  }, [captureRouteScope, isRouteScopeActive])

  const refreshSharedScreenFrame = useCallback(async () => {
    const currentAccess = accessRef.current
    const shareState = screenShareStateRef.current
    const localParticipantId = localParticipantIdRef.current
    const localTeacherIsPresenter = Boolean(currentAccess && isBoardManager(currentAccess.role))
      && shareState.active
      && shareState.local
      && Boolean(localParticipantId)
      && shareState.participantIds.includes(localParticipantId)
    if (!localTeacherIsPresenter) {
      toast.warning('Chỉ gia sư đang trình chiếu mới có thể đổi khung bài giảng cho cả lớp.')
      return
    }
    await captureScreenShareFrame()
    await sendBoardPayload({ type: 'frame-refresh' }, 'screen')
  }, [captureScreenShareFrame, sendBoardPayload])

  const handleScreenShareStateChange = useCallback((nextState: ClassroomScreenShareState) => {
    const previous = screenShareStateRef.current
    const normalized: ClassroomScreenShareState = {
      active: nextState.active,
      local: nextState.local,
      participantIds: Array.from(new Set(nextState.participantIds.filter(Boolean))),
    }
    const shareIdentityChanged = previous.active !== normalized.active
      || previous.local !== normalized.local
      || [...previous.participantIds].sort().join('\u0000') !== [...normalized.participantIds].sort().join('\u0000')
    if (shareIdentityChanged) screenShareEpochRef.current += 1
    screenShareStateRef.current = normalized
    setScreenShareState(normalized)
    if (!normalized.active) {
      screenAnnotationRestartAfterEndRef.current = false
      setActivePanel('video')
      screenFrameUrlRef.current = ''
      setScreenFrameUrl('')
      setScreenFrameState('idle')
      setScreenFrameError('')
      if (previous.local && screenAnnotationSessionRef.current?.active && isBoardManager(accessRef.current?.role || 'student')) {
        void handleEndScreenAnnotation()
      }
    } else {
      if (normalized.local && !previous.local && isBoardManager(accessRef.current?.role || 'student')) {
        void restartScreenAnnotationForLocalShare()
        return
      }
      if (screenAnnotationSessionRef.current?.active) return
      if (normalized.local && isBoardManager(accessRef.current?.role || 'student')) {
        // Sharing should be one action for the tutor: once Jitsi confirms the
        // local desktop track, open the protected annotation surface too.
        void handleBeginScreenAnnotation(screenShareEpochRef.current)
      } else {
        // A remote participant may start sharing before the data-channel signal
        // for the annotation session arrives. Refresh once without trusting it.
        void reloadScreenAnnotationSession().catch(() => undefined)
      }
    }
  }, [handleBeginScreenAnnotation, handleEndScreenAnnotation, reloadScreenAnnotationSession, restartScreenAnnotationForLocalShare])

  const handleToggleScreenShare = useCallback(() => {
    const currentAccess = accessRef.current
    if (!currentAccess || !isBoardManager(currentAccess.role)) return
    if (connectionStateRef.current !== 'connected' || !jitsiApiRef.current) {
      toast.warning('Hãy vào cuộc gọi trước khi chia sẻ màn hình.')
      return
    }
    setScreenAnnotationError('')
    jitsiApiRef.current.executeCommand('toggleShareScreen')
  }, [])

  const handleCopyStudentInvite = useCallback(async () => {
    const currentAccess = accessRef.current
    if (!currentAccess || !isBoardManager(currentAccess.role)) return
    if (!conferenceJoinedRef.current || connectionStateRef.current !== 'connected') {
      toast.warning('Hãy vào cuộc gọi trước khi tạo link học viên.')
      return
    }
    if (!waitingRoomReady) {
      toast.warning('Phòng chờ đang được bảo vệ. Vui lòng đợi vài giây rồi thử lại.')
      return
    }
    setIssuingStudentInvite(true)
    try {
      const joinUrl = await issueOnlineClassroomInvite(currentAccess.bookingId)
      await navigator.clipboard.writeText(joinUrl)
      toast.success('Đã sao chép link học viên. Học viên sẽ chờ gia sư cho phép vào lớp.')
    } catch (error) {
      toast.error(onlineClassroomErrorMessage(error))
    } finally {
      setIssuingStudentInvite(false)
    }
  }, [waitingRoomReady])

  const handleAnswerKnockingParticipant = useCallback((participantId: string, approved: boolean) => {
    if (!participantId || !jitsiApiRef.current || !isBoardManager(accessRef.current?.role || 'student')) return
    try {
      jitsiApiRef.current.executeCommand('answerKnockingParticipant', participantId, approved)
      setKnockingParticipants((current) => current.filter((participant) => participant.id !== participantId))
      toast.success(approved ? 'Đã cho học viên vào lớp.' : 'Đã từ chối yêu cầu vào lớp.')
    } catch {
      toast.error('Chưa thể xử lý yêu cầu vào lớp. Vui lòng thử lại.')
    }
  }, [])

  const handleOpenCameraEffects = useCallback(() => {
    if (!conferenceJoinedRef.current || !jitsiApiRef.current) {
      toast.warning('Hãy vào cuộc gọi trước khi chọn hiệu ứng camera.')
      return
    }
    try {
      jitsiApiRef.current.executeCommand('toggleVirtualBackgroundDialog')
    } catch {
      toast.error('Thiết bị này chưa hỗ trợ làm mờ hoặc hình nền ảo.')
    }
  }, [])

  const toggleMeetingFullscreen = useCallback(async () => {
    if (isMeetingPseudoFullscreen) {
      setIsMeetingPseudoFullscreen(false)
      return
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (meetingShellRef.current?.requestFullscreen) {
        await meetingShellRef.current.requestFullscreen()
      } else {
        setIsMeetingPseudoFullscreen(true)
      }
    } catch {
      // iOS/Safari and embedded browsers may reject the native Fullscreen API.
      // Keep the class usable with an in-page fullscreen fallback.
      setIsMeetingPseudoFullscreen(true)
      toast.info('Đã mở lớp học toàn màn hình trong trình duyệt.')
    }
  }, [isMeetingPseudoFullscreen])

  const openWhiteboardWindow = useCallback(() => {
    setWhiteboardWindowMode(whiteboardRestoreModeRef.current)
  }, [])

  const minimizeWhiteboardWindow = useCallback(() => {
    setWhiteboardWindowMode((current) => {
      if (current !== 'minimized') whiteboardRestoreModeRef.current = current
      return 'minimized'
    })
    window.requestAnimationFrame(() => whiteboardLauncherRef.current?.focus())
  }, [])

  const toggleWhiteboardMaximize = useCallback(() => {
    setWhiteboardWindowMode((current) => {
      const next = current === 'maximized' ? 'normal' : 'maximized'
      whiteboardRestoreModeRef.current = next
      return next
    })
  }, [])

  const handleWhiteboardDialogKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true')
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (
      active === first
      || active === event.currentTarget
      || !event.currentTarget.contains(active)
    )) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }, [])

  useEffect(() => {
    const previous = previousWhiteboardWindowModeRef.current
    previousWhiteboardWindowModeRef.current = whiteboardWindowMode
    if (previous !== 'minimized' || whiteboardWindowMode === 'minimized') return
    const frame = window.requestAnimationFrame(() => whiteboardDialogRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [whiteboardWindowMode])

  useEffect(() => {
    const onFullscreenChange = () => setIsMeetingFullscreen(document.fullscreenElement === meetingShellRef.current)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (whiteboardWindowMode !== 'minimized') {
        event.preventDefault()
        event.stopPropagation()
        minimizeWhiteboardWindow()
        return
      }
      if (isMeetingPseudoFullscreen) setIsMeetingPseudoFullscreen(false)
    }
    if (isMeetingPseudoFullscreen) document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isMeetingPseudoFullscreen, minimizeWhiteboardWindow, whiteboardWindowMode])

  useEffect(() => {
    const annotationActive = screenShareState.active && screenAnnotationSession?.active
    if (!annotationActive || screenFrameUrlRef.current) return
    let cancelled = false
    void captureScreenShareFrame().finally(() => {
      if (!cancelled && screenShareStateRef.current.active && screenAnnotationSessionRef.current?.active) {
        setActivePanel('board')
      }
    })
    return () => { cancelled = true }
  }, [captureScreenShareFrame, screenAnnotationSession?.active, screenAnnotationSession?.sessionId, screenShareState.active])

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
          const remoteScreenAnnotation = sanitizeScreenAnnotationSession(result.screenAnnotationSession)
          const currentScreenAnnotation = screenAnnotationSessionRef.current
          if (!screenAnnotationMutationRef.current && (
            remoteScreenAnnotation?.sessionId !== currentScreenAnnotation?.sessionId
            || remoteScreenAnnotation?.active !== currentScreenAnnotation?.active
            || (remoteScreenAnnotation?.boardSnapshot.version ?? -1) >= (currentScreenAnnotation?.boardSnapshot.version ?? -1)
          )) {
            const sessionChanged = remoteScreenAnnotation?.sessionId !== currentScreenAnnotation?.sessionId
            const remoteAdvanced = (remoteScreenAnnotation?.boardSnapshot.version ?? -1)
              > (currentScreenAnnotation?.boardSnapshot.version ?? -1)
            if (sessionChanged || remoteScreenAnnotation?.active !== currentScreenAnnotation?.active || remoteAdvanced) {
              resetScreenAnnotationHistory()
            }
            if (sessionChanged || !remoteScreenAnnotation?.active) {
              screenAnnotationSessionShareEpochRef.current = -1
              screenAnnotationPendingOperationsRef.current = []
              setScreenAnnotationPendingOperationCount(0)
              replaceScreenAnnotationSession(remoteScreenAnnotation)
            } else if (remoteScreenAnnotation) {
              const authoritative = sanitizeBoardSnapshot(remoteScreenAnnotation.boardSnapshot)
              const authoritativeIds = new Set(authoritative.operations.map((operation) => operation.id))
              const stillPending = screenAnnotationPendingOperationsRef.current
                .filter((item) => item.generation === authoritative.generation
                  && !authoritativeIds.has(item.operation.id))
              screenAnnotationPendingOperationsRef.current = stillPending
              setScreenAnnotationPendingOperationCount(stillPending.length)
              replaceScreenAnnotationSession({
                ...remoteScreenAnnotation,
                boardSnapshot: {
                  ...authoritative,
                  operations: [
                    ...authoritative.operations,
                    ...stillPending.map((item) => item.operation),
                  ].slice(0, MAX_BOARD_OPERATIONS),
                },
              })
            }
          }
          const remoteBoard = sanitizeBoardSnapshot(result.boardSnapshot)
          if (remoteBoard.version < savedVersionRef.current) continue
          if (boardMutationRef.current) continue
          const previousBoard = boardRef.current
          const pending = pendingBoardOperationsRef.current
          const remoteOperationIds = new Set(remoteBoard.operations.map((operation) => operation.id))
          const missingPending = pending.filter((item) => (
            item.generation === remoteBoard.generation
            && !remoteOperationIds.has(item.operation.id)
          ))
          pendingBoardOperationsRef.current = missingPending
          const visibleBoard = missingPending.length > 0
            ? {
                ...remoteBoard,
                operations: [
                  ...remoteBoard.operations,
                  ...missingPending.map((item) => item.operation),
                ].slice(0, MAX_BOARD_OPERATIONS),
              }
            : remoteBoard
          replaceBoard(
            visibleBoard,
            isBoardManager(result.role) ? missingPending.length > 0 ? 'dirty' : 'saved' : undefined,
          )
          savedVersionRef.current = remoteBoard.version
          setPendingBoardOperationCount(missingPending.length)
          const previousIds = new Set(previousBoard.operations.map((operation) => operation.id))
          const pendingIds = new Set(pending.map((item) => item.operation.id))
          const hasUnexpectedRemoteChange = remoteBoard.generation !== previousBoard.generation
            || remoteBoard.operations.some((operation) => !previousIds.has(operation.id)
              && !pending.some((item) => item.operation.id === operation.id))
            || previousBoard.operations.some((operation) => (
              !remoteOperationIds.has(operation.id) && !pendingIds.has(operation.id)
            ))
          if (isBoardManager(result.role) && hasUnexpectedRemoteChange) resetHistory()
          if (missingPending.length > 0) void flushPendingBoardOperations()
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
  }, [captureRouteScope, flushPendingBoardOperations, isRouteScopeActive, replaceBoard, replaceScreenAnnotationSession, resetHistory, resetScreenAnnotationHistory])

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

    if (boardMessageSurface(message) === 'screen') {
      if (message.type === 'frame-refresh') {
        const presenterIds = screenShareStateRef.current.participantIds
        if (message.senderRole === 'teacher'
          && screenShareStateRef.current.active
          && presenterIds.includes(senderId)) {
          const frameScope = captureRouteScope()
          const frameSessionId = screenAnnotationSessionRef.current?.sessionId || ''
          const frameShareEpoch = screenShareEpochRef.current
          void captureScreenShareFrame().finally(() => {
            if (isRouteScopeActive(frameScope)
              && screenAnnotationSessionRef.current?.active
              && screenAnnotationSessionRef.current.sessionId === frameSessionId
              && screenShareStateRef.current.active
              && screenShareEpochRef.current === frameShareEpoch) {
              setActivePanel('board')
            }
          })
        }
        return
      }
      // Data-channel only wakes the authenticated callable refresh. Never trust
      // an operation or role received directly from another browser.
      scheduleBoardRefresh()
      return
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
  }, [broadcastSnapshot, captureRouteScope, captureScreenShareFrame, isRouteScopeActive, scheduleBoardRefresh])

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
      if (isRouteScopeActive(scope)) void flushPendingBoardOperations()
    }, 350)
  }, [captureRouteScope, flushPendingBoardOperations, isRouteScopeActive, sendBoardPayload])

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
      setKnockingParticipants((current) => current.filter((participant) => participant.id !== participantId))
    }
    const currentAccess = accessRef.current
    if (!dataChannelReadyRef.current || !currentAccess) return
    if (isBoardManager(currentAccess.role)) {
      window.setTimeout(() => {
        if (isRouteScopeActive(scope)) void broadcastSnapshot()
      }, 600)
    } else {
      window.setTimeout(() => {
        if (isRouteScopeActive(scope)) void flushPendingBoardOperations()
      }, 900)
    }
  }, [broadcastSnapshot, captureRouteScope, flushPendingBoardOperations, isRouteScopeActive])

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
        const remoteScreenAnnotation = sanitizeScreenAnnotationSession(result.screenAnnotationSession)
        const currentScreenAnnotation = screenAnnotationSessionRef.current
        const screenAnnotationChanged = remoteScreenAnnotation?.sessionId !== currentScreenAnnotation?.sessionId
          || remoteScreenAnnotation?.active !== currentScreenAnnotation?.active
          || (remoteScreenAnnotation?.boardSnapshot.version ?? -1) > (currentScreenAnnotation?.boardSnapshot.version ?? -1)
        if (remoteBoard.version > savedVersionRef.current || screenAnnotationChanged) await refreshBoardFromServer()
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
      if (document.visibilityState === 'hidden') void flushPendingBoardOperations()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [captureRouteScope, fatalAccessError, flushPendingBoardOperations, isRouteScopeActive, loadState, refreshBoardFromServer])

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
      if (boardRefreshTimerRef.current !== null) window.clearTimeout(boardRefreshTimerRef.current)
      boardRefreshTimerRef.current = null
      screenFrameCaptureEpochRef.current += 1
      screenFrameInFlightRef.current = null
      screenAnnotationMutationEpochRef.current += 1
      screenAnnotationMutationRef.current = null
      screenAnnotationPendingOperationsRef.current = []
      screenAnnotationOperationFlushRef.current = null
      screenAnnotationRetryAttemptRef.current = 0
      screenAnnotationEndRequestedRef.current = false
      screenAnnotationEndAwaitingFlushRef.current = false
      screenAnnotationRestartAfterEndRef.current = false
      screenAnnotationSessionShareEpochRef.current = -1
      screenShareEpochRef.current += 1
      if (screenAnnotationRetryTimerRef.current !== null) window.clearTimeout(screenAnnotationRetryTimerRef.current)
      screenAnnotationRetryTimerRef.current = null
      if (screenAnnotationEndRetryTimerRef.current !== null) window.clearTimeout(screenAnnotationEndRetryTimerRef.current)
      screenAnnotationEndRetryTimerRef.current = null
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
    if (pendingBoardOperationCount === 0
      && screenAnnotationPendingOperationCount === 0
      && recordingState === 'idle'
      && !boardMutationBusy
      && !screenAnnotationBusy
      && saveStatus !== 'saving'
      && saveStatus !== 'dirty'
      && screenAnnotationSaveStatus !== 'saving'
      && screenAnnotationSaveStatus !== 'dirty') return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [boardMutationBusy, pendingBoardOperationCount, recordingState, saveStatus, screenAnnotationBusy, screenAnnotationPendingOperationCount, screenAnnotationSaveStatus])

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
  const screenAnnotationActive = Boolean(screenShareState.active && screenAnnotationSession?.active)
  const screenAnnotationSnapshot = screenAnnotationSession?.boardSnapshot
    ? sanitizeBoardSnapshot(screenAnnotationSession.boardSnapshot)
    : EMPTY_BOARD
  const keepVideoRenderedOffscreen = screenAnnotationActive && activePanel === 'board'
  const meetingExpanded = isMeetingFullscreen || isMeetingPseudoFullscreen

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
            {conferenceJoined && (
              <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 font-mono text-xs font-black tabular-nums text-white" aria-label={`Thời gian trong lớp ${formatClassroomElapsed(classroomElapsedSeconds)}`}>
                <Clock3 className="h-4 w-4 text-amber-300" />
                {formatClassroomElapsed(classroomElapsedSeconds)}
              </span>
            )}
            <span className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-extrabold ${connectionHealthy ? 'bg-emerald-50 text-emerald-800' : connectionState === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
              {connectionHealthy ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {connectionLabel(connectionState)}
            </span>
            {connectionHealthy && (
              <span className={`inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-extrabold ${remoteParticipantCount > 0 ? 'bg-sky-50 text-sky-800' : 'bg-amber-50 text-amber-800'}`}>
                {remoteParticipantCount > 0 ? `${remoteParticipantCount + 1} người trong lớp` : 'Đang chờ người còn lại'}
              </span>
            )}
            {manager && (
              <Button
                variant="outline"
                size="sm"
                loading={issuingStudentInvite}
                disabled={!connectionHealthy || !conferenceJoined || !waitingRoomReady}
                onClick={() => void handleCopyStudentInvite()}
                title={!waitingRoomReady ? 'Link chỉ mở sau khi phòng chờ đã được bảo vệ' : 'Sao chép link riêng để gửi cho học viên'}
                className="border-sky-200 bg-sky-50 text-sky-800 focus:ring-sky-300"
              >
                <Copy className="h-4 w-4" />
                <span className="hidden sm:inline">Sao chép link học viên</span>
              </Button>
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

        <div
          ref={meetingShellRef}
          className={`relative flex flex-col overflow-hidden bg-[#080b10] text-white shadow-[0_30px_80px_-48px_rgba(2,6,23,0.95)] ${meetingExpanded ? `h-[100dvh] w-screen rounded-none p-2.5 sm:p-3 ${isMeetingPseudoFullscreen ? 'fixed inset-0 z-[100]' : ''}` : 'rounded-[1.75rem] p-2.5'}`}
        >
          <div className="mb-2.5 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[#10151d] px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${screenShareState.active ? 'animate-pulse bg-emerald-400' : connectionHealthy ? 'bg-sky-400' : 'bg-slate-500'}`} />
              <div className="min-w-0">
                <p className="truncate text-sm font-black">
                  {screenShareState.active ? 'Đang trình chiếu bài học' : 'Lớp học trực tiếp 123English'}
                </p>
                <p className={`truncate text-[11px] font-semibold text-slate-400 ${meetingControlsCollapsed ? 'hidden' : ''}`}>
                  {screenShareState.active
                    ? screenAnnotationActive
                      ? 'Gia sư và học viên có thể chú thích đồng bộ trên nội dung chia sẻ'
                      : 'Đang chuẩn bị công cụ viết trên màn hình chia sẻ'
                    : `${remoteParticipantCount + 1} người · ${roleLabel(access.role)}`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {conferenceJoined && (
                <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-2.5 font-mono text-xs font-black tabular-nums text-white" title="Thời gian đã ở trong lớp">
                  <Clock3 className="h-4 w-4 text-amber-300" />
                  {formatClassroomElapsed(classroomElapsedSeconds)}
                </span>
              )}
              {manager && (
                <button
                  type="button"
                  disabled={!connectionHealthy || !conferenceJoined}
                  onClick={handleToggleScreenShare}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-45 ${screenShareState.local ? 'bg-rose-500 text-white hover:bg-rose-400' : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'}`}
                  title={!connectionHealthy || !conferenceJoined ? 'Hãy vào cuộc gọi trước khi chia sẻ' : undefined}
                >
                  <MonitorUp className="h-4 w-4" />
                  <span className={meetingControlsCollapsed ? 'sr-only' : 'hidden sm:inline'}>{screenShareState.local ? 'Dừng trình chiếu' : 'Chia sẻ màn hình'}</span>
                  {!meetingControlsCollapsed && <span className="sm:hidden">{screenShareState.local ? 'Dừng share' : 'Share'}</span>}
                </button>
              )}
              {!meetingControlsCollapsed && (
                <button
                  type="button"
                  disabled={!conferenceJoined}
                  onClick={handleOpenCameraEffects}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-black text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-45"
                  title="Làm mờ hoặc chọn hình nền ảo"
                >
                  <Sparkles className="h-4 w-4 text-fuchsia-300" />
                  <span className="hidden sm:inline">Hiệu ứng nền</span>
                </button>
              )}
              {!meetingControlsCollapsed && manager && screenShareState.active && (
                <button
                  type="button"
                  disabled={screenAnnotationBusy}
                  onClick={() => {
                    if (screenAnnotationActive) {
                      screenAnnotationRestartAfterEndRef.current = false
                      void handleEndScreenAnnotation()
                    } else {
                      void handleBeginScreenAnnotation(screenShareEpochRef.current)
                    }
                  }}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-wait disabled:opacity-55 ${screenAnnotationActive ? 'border-amber-300/40 bg-amber-300 text-slate-950 hover:bg-amber-200' : 'border-white/15 bg-white/10 text-white hover:bg-white/15'}`}
                >
                  <PenLine className="h-4 w-4" />
                  {screenAnnotationBusy ? 'Đang xử lý' : screenAnnotationActive ? 'Tắt chú thích' : 'Bật công cụ viết'}
                </button>
              )}
              <button
                ref={whiteboardLauncherRef}
                type="button"
                onClick={openWhiteboardWindow}
                aria-haspopup="dialog"
                aria-expanded={whiteboardWindowMode !== 'minimized'}
                aria-label={whiteboardWindowMode === 'minimized' ? 'Mở bảng trắng' : 'Bảng trắng đang mở'}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-amber-300 ${whiteboardWindowMode !== 'minimized' ? 'border-amber-300 bg-amber-300 text-slate-950 hover:bg-amber-200' : 'border-white/15 bg-white/10 text-white hover:bg-white/15'}`}
              >
                <PenLine className="h-4 w-4" />
                <span className={meetingControlsCollapsed ? 'sr-only' : 'hidden sm:inline'}>
                  {whiteboardWindowMode === 'minimized' ? 'Mở bảng trắng' : 'Bảng trắng đang mở'}
                </span>
                {pendingBoardOperationCount > 0 && (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-950 px-1.5 py-0.5 text-[10px] text-amber-200" aria-label={`${pendingBoardOperationCount} nét đang chờ đồng bộ`}>
                    {pendingBoardOperationCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setMeetingControlsCollapsed((current) => !current)}
                aria-expanded={!meetingControlsCollapsed}
                className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label={meetingControlsCollapsed ? 'Hiện các điều khiển lớp học' : 'Thu gọn các điều khiển lớp học'}
                title={meetingControlsCollapsed ? 'Hiện điều khiển' : 'Thu gọn điều khiển'}
              >
                {meetingControlsCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => void toggleMeetingFullscreen()}
                className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label={meetingExpanded ? 'Thoát toàn màn hình' : 'Mở toàn màn hình lớp học'}
                title={meetingExpanded ? 'Thoát toàn màn hình' : 'Mở toàn màn hình'}
              >
                {meetingExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {manager && knockingParticipants.length > 0 && (
            <div className="mb-2.5 rounded-2xl border border-sky-300/30 bg-sky-400/10 p-3" role="status" aria-live="polite">
              <p className="text-xs font-black text-sky-100">Có người đang xin vào lớp</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {knockingParticipants.map((participant) => (
                  <div key={participant.id} className="flex min-w-0 flex-1 basis-[280px] items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2">
                    <p className="min-w-0 truncate text-sm font-extrabold text-white">{participant.name}</p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => handleAnswerKnockingParticipant(participant.id, false)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-300/25 bg-rose-500/15 px-3 text-xs font-black text-rose-100 hover:bg-rose-500/25 focus:outline-none focus:ring-2 focus:ring-rose-300"
                      >
                        <UserX className="h-4 w-4" />Từ chối
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAnswerKnockingParticipant(participant.id, true)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-400 px-3 text-xs font-black text-slate-950 hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      >
                        <UserCheck className="h-4 w-4" />Cho vào
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(screenAnnotationError || (screenShareState.active && access.role === 'student' && !screenAnnotationActive)) && (
            <div className={`mb-2.5 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${screenAnnotationError ? 'border-rose-400/30 bg-rose-500/10 text-rose-100' : 'border-amber-300/25 bg-amber-300/10 text-amber-100'}`} role={screenAnnotationError ? 'alert' : 'status'}>
              {screenAnnotationError ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}
              <p>{screenAnnotationError || 'Gia sư đang chia sẻ. Công cụ viết sẽ hiện tự động ngay khi phiên chú thích sẵn sàng.'}</p>
            </div>
          )}

          {screenAnnotationActive && (
          <div className="mb-2.5 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1 lg:hidden" aria-label="Chọn khu vực lớp học">
            <button
              type="button"
              onClick={() => setActivePanel('video')}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-extrabold focus:outline-none focus:ring-2 focus:ring-amber-300 ${activePanel === 'video' ? 'bg-white text-slate-950' : 'text-slate-300'}`}
            >
              <Video className="h-4 w-4" />
              Cuộc gọi
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('board')}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-extrabold focus:outline-none focus:ring-2 focus:ring-amber-300 ${activePanel === 'board' ? 'bg-[#ffc107] text-[#10213a]' : 'text-slate-300'}`}
            >
              <PenLine className="h-4 w-4" />
              {screenAnnotationActive ? 'Chú thích' : 'Bảng học'}
            </button>
          </div>
          )}

          <div className={`grid gap-2.5 ${screenAnnotationActive ? 'lg:grid-cols-[minmax(0,72fr)_minmax(300px,28fr)]' : 'lg:grid-cols-1'} ${meetingExpanded ? 'min-h-0 flex-1' : ''}`}>
            <div className={`${activePanel === 'video' ? 'block' : keepVideoRenderedOffscreen ? 'pointer-events-none fixed -left-[10000px] top-0 h-[360px] w-[640px] min-h-0 overflow-hidden opacity-0 lg:pointer-events-auto lg:visible lg:static lg:block lg:w-auto lg:overflow-visible lg:opacity-100' : 'hidden lg:block'} ${meetingExpanded ? keepVideoRenderedOffscreen ? 'lg:h-full lg:min-h-0 lg:max-h-none' : 'h-full min-h-0 max-h-none' : keepVideoRenderedOffscreen ? 'lg:h-[calc(100dvh-245px)] lg:min-h-[560px] lg:max-h-[840px]' : 'h-[min(68dvh,720px)] min-h-[460px] lg:h-[calc(100dvh-245px)] lg:min-h-[560px] lg:max-h-[840px]'} ${screenAnnotationActive ? 'lg:order-2' : 'lg:order-1'}`}>
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
                scheduledDurationSeconds={scheduledMeetingTimer.durationSeconds}
                scheduledElapsedSeconds={scheduledMeetingTimer.elapsedSeconds}
                onApiReady={(api) => {
                  jitsiApiRef.current = api
                  if (!api) {
                    dataChannelReadyRef.current = false
                    localParticipantIdRef.current = ''
                    conferenceJoinedRef.current = false
                    setConferenceJoined(false)
                    remoteParticipantIdsRef.current = new Set()
                    setRemoteParticipantCount(0)
                    screenShareStateRef.current = EMPTY_SCREEN_SHARE_STATE
                    setScreenShareState(EMPTY_SCREEN_SHARE_STATE)
                    setWaitingRoomReady(false)
                    setKnockingParticipants([])
                  }
                }}
                onConferenceJoined={handleConferenceJoined}
                onParticipantJoined={handleParticipantJoined}
                onParticipantLeft={handleParticipantLeft}
                onWaitingRoomReadyChange={setWaitingRoomReady}
                onKnockingParticipant={(participant) => {
                  setKnockingParticipants((current) => {
                    const existing = current.find((candidate) => candidate.id === participant.id)
                    return existing
                      ? current.map((candidate) => candidate.id === participant.id ? participant : candidate)
                      : [...current, participant]
                  })
                }}
                onDataChannelOpened={handleDataChannelOpened}
                onTextMessage={(text, senderId) => {
                  if (classroomGifts.handleRealtimeMessage(text)) return
                  handleBoardTextMessage(text, senderId)
                }}
                onScreenShareStateChange={handleScreenShareStateChange}
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
                    screenShareStateRef.current = EMPTY_SCREEN_SHARE_STATE
                    setScreenShareState(EMPTY_SCREEN_SHARE_STATE)
                    setWaitingRoomReady(false)
                    setKnockingParticipants([])
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
                  screenShareStateRef.current = EMPTY_SCREEN_SHARE_STATE
                  setScreenShareState(EMPTY_SCREEN_SHARE_STATE)
                  setWaitingRoomReady(false)
                  setKnockingParticipants([])
                  stopRecording()
                }}
                onError={(message) => toast.error(message)}
              />
            </div>

            {screenAnnotationActive && (
            <div className={`${activePanel === 'board' ? 'block' : 'hidden'} lg:block ${meetingExpanded ? 'h-full min-h-0 max-h-none' : 'h-[min(68dvh,720px)] min-h-[460px] lg:h-[calc(100dvh-245px)] lg:min-h-[560px] lg:max-h-[840px]'} lg:order-1`}>
                <ScreenShareAnnotationStage
                  frameUrl={screenFrameUrl}
                  loading={screenFrameState === 'loading'}
                  error={screenFrameError}
                  canRefreshFrame={manager && screenShareState.local}
                  onRefresh={refreshSharedScreenFrame}
                  onReturnToLive={() => setActivePanel('video')}
                  snapshot={screenAnnotationSnapshot}
                  role={access.role}
                  canUndo={screenAnnotationHistory.canUndo && screenAnnotationPendingOperationCount === 0}
                  canRedo={screenAnnotationHistory.canRedo && screenAnnotationPendingOperationCount === 0}
                  saveStatus={screenAnnotationSaveStatus}
                  pendingOperationCount={screenAnnotationPendingOperationCount}
                  onOperation={handleScreenAnnotationOperation}
                  onUndo={handleScreenAnnotationUndo}
                  onRedo={handleScreenAnnotationRedo}
                  onClear={handleScreenAnnotationClear}
                  onStudentCanWriteChange={handleScreenStudentCanWriteChange}
                  onSave={() => {
                    if (manager && !screenAnnotationBusy && screenAnnotationPendingOperationCount === 0) {
                      commitScreenAnnotationSnapshot(screenAnnotationSnapshot)
                    }
                  }}
                />
            </div>
            )}
          </div>

          <div
            className={`absolute inset-0 z-30 ${whiteboardWindowMode === 'minimized' ? 'invisible pointer-events-none' : ''}`}
            aria-hidden={whiteboardWindowMode === 'minimized'}
            inert={whiteboardWindowMode === 'minimized'}
          >
            {whiteboardWindowMode === 'normal' && (
              <button
                type="button"
                onClick={minimizeWhiteboardWindow}
                aria-label="Thu nhỏ bảng trắng và trở lại lớp học"
                tabIndex={-1}
                className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
              />
            )}
            <div
              ref={whiteboardDialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Bảng trắng dùng chung"
              tabIndex={-1}
              onKeyDown={handleWhiteboardDialogKeyDown}
              className={`pointer-events-auto absolute z-10 min-h-0 transition-[inset] duration-200 motion-reduce:transition-none ${whiteboardWindowMode === 'maximized' ? 'inset-0' : 'inset-3 sm:inset-6 lg:inset-x-[6%] lg:inset-y-[5%]'}`}
            >
              <CollaborativeWhiteboard
                snapshot={board}
                role={access.role}
                canUndo={historyState.canUndo && pendingBoardOperationCount === 0 && !boardMutationBusy}
                canRedo={historyState.canRedo && pendingBoardOperationCount === 0 && !boardMutationBusy}
                saveStatus={saveStatus}
                pendingOperationCount={pendingBoardOperationCount}
                onOperation={handleLocalOperation}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onClear={handleClear}
                onStudentCanWriteChange={handleStudentCanWriteChange}
                onSave={() => void flushPendingBoardOperations()}
                headerActions={(
                  <>
                    <button
                      type="button"
                      onClick={minimizeWhiteboardWindow}
                      aria-label="Thu nhỏ bảng trắng"
                      title="Thu nhỏ"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleWhiteboardMaximize}
                      aria-label={whiteboardWindowMode === 'maximized' ? 'Thu gọn cửa sổ bảng trắng' : 'Phóng to bảng trắng'}
                      title={whiteboardWindowMode === 'maximized' ? 'Thu gọn cửa sổ' : 'Phóng to'}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    >
                      {whiteboardWindowMode === 'maximized' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>
                  </>
                )}
              />
            </div>
          </div>

          {whiteboardWindowMode === 'minimized' && (
            <button
              type="button"
              onClick={openWhiteboardWindow}
              className="absolute bottom-4 right-4 z-30 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-amber-300 px-4 text-sm font-black text-slate-950 shadow-[0_16px_40px_-18px_rgba(251,191,36,0.8)] transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-slate-950"
              aria-haspopup="dialog"
            >
              <PenLine className="h-4 w-4" />
              Bảng trắng
              {pendingBoardOperationCount > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-950 px-1.5 py-0.5 text-[10px] text-amber-200">
                  {pendingBoardOperationCount}
                </span>
              )}
            </button>
          )}

          <ClassroomGiftOverlay
            gift={classroomGifts.activeGift}
            pendingGiftCount={classroomGifts.pendingGiftCount}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] font-semibold leading-5 text-slate-500">
          <p className="inline-flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />Bảng được lưu theo buổi học bởi gia sư hoặc Admin.</p>
          <p>Trang này không tự ghi điểm danh, điểm thưởng hoặc dữ liệu tính lương.</p>
        </div>
      </main>

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
