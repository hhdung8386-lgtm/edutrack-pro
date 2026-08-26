import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  CircleStop,
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
  readClassroomToken,
  rememberClassroomToken,
  removeClassroomTokenFromAddressBar,
  requestOnlineClassroomAccess,
  saveOnlineClassroomBoard,
  type OnlineClassroomAccess,
} from '@/lib/onlineClassroom'
import { toast } from '@/stores/toastStore'
import { broadcastJitsiTextMessage, type JitsiExternalApi } from '@/lib/jitsiExternalApi'

type LoadState = 'loading' | 'ready' | 'error'
type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error'
type ActivePanel = 'video' | 'board'
type RecordingState = 'idle' | 'starting' | 'recording' | 'stopping'

const EMPTY_BOARD: ValidatedBoardSnapshot = {
  version: 0,
  studentCanWrite: true,
  operations: [],
}
const REVALIDATE_INTERVAL_MS = 60_000
const MAX_HISTORY_ENTRIES = 50

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

type RecordingWritable = {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
  abort?: () => Promise<void>
}

type RecordingFileHandle = {
  createWritable: () => Promise<RecordingWritable>
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<RecordingFileHandle>
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
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [pageError, setPageError] = useState('')
  const [fatalAccessError, setFatalAccessError] = useState('')
  const [access, setAccess] = useState<OnlineClassroomAccess | null>(null)
  const [board, setBoard] = useState<ValidatedBoardSnapshot>(EMPTY_BOARD)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [connectionState, setConnectionState] = useState<JitsiConnectionState>('loading')
  const [activePanel, setActivePanel] = useState<ActivePanel>('video')
  const [revalidationWarning, setRevalidationWarning] = useState('')
  const [syncWarning, setSyncWarning] = useState('')
  const [showRecordingConsent, setShowRecordingConsent] = useState(false)
  const [recordingConsent, setRecordingConsent] = useState(false)
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [recordingError, setRecordingError] = useState('')
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [pendingStudentOperationCount, setPendingStudentOperationCount] = useState(0)

  const accessRef = useRef<OnlineClassroomAccess | null>(null)
  const boardRef = useRef<ValidatedBoardSnapshot>(EMPTY_BOARD)
  const tokenRef = useRef('')
  const jitsiApiRef = useRef<JitsiExternalApi | null>(null)
  const localParticipantIdRef = useRef('')
  const dataChannelReadyRef = useRef(false)
  const seenMessageIdsRef = useRef(new Set<string>())
  const pendingStudentOperationsRef = useRef<BoardOperation[]>([])
  const undoHistoryRef = useRef<BoardOperation[][]>([])
  const redoHistoryRef = useRef<BoardOperation[][]>([])
  const saveTimerRef = useRef<number | null>(null)
  const saveInFlightRef = useRef(false)
  const saveCompletionRef = useRef<Promise<boolean> | null>(null)
  const saveQueuedRef = useRef(false)
  const savedVersionRef = useRef(0)
  const revalidationInFlightRef = useRef(false)
  const consecutiveRevalidationFailuresRef = useRef(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingWriterRef = useRef<RecordingWritable | null>(null)
  const recordingWriteChainRef = useRef<Promise<void>>(Promise.resolve())
  const unmountingRef = useRef(false)

  const manager = access ? isBoardManager(access.role) : false
  const curriculumUrl = useMemo(() => safeExternalUrl(access?.curriculumLink || ''), [access?.curriculumLink])
  const recordingSupported = useMemo(() => {
    if (typeof navigator === 'undefined' || typeof MediaRecorder === 'undefined') return false
    const chromium = /Chrome\//.test(navigator.userAgent) || /Edg\//.test(navigator.userAgent)
    return chromium
      && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
      && typeof (window as SaveFilePickerWindow).showSaveFilePicker === 'function'
  }, [])

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
    if (!bookingId) {
      setPageError('Mã buổi học không hợp lệ.')
      setLoadState('error')
      return
    }

    setLoadState('loading')
    setPageError('')
    setFatalAccessError('')
    seenMessageIdsRef.current = new Set()
    pendingStudentOperationsRef.current = []
    setPendingStudentOperationCount(0)
    localParticipantIdRef.current = ''
    dataChannelReadyRef.current = false
    try {
      const fragmentOrStoredToken = readClassroomToken(bookingId)
      tokenRef.current = fragmentOrStoredToken

      const result = await requestOnlineClassroomAccess(bookingId, fragmentOrStoredToken || undefined)
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
      const code = errorCode(error)
      if (!window.location.hash && ['permission-denied', 'not-found'].includes(code)) {
        forgetClassroomToken(bookingId)
      }
      setPageError(onlineClassroomErrorMessage(error))
      setLoadState('error')
    }
  }, [bookingId, resetHistory])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadClassroom(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadClassroom])

  useEffect(() => {
    if (!access) return
    document.title = `${access.subjectName || 'Lớp học trực tuyến'} | 123English`
  }, [access])

  const flushBoardSave = useCallback(async (): Promise<boolean> => {
    const currentAccess = accessRef.current
    if (!currentAccess || !isBoardManager(currentAccess.role)) return false
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true
      return saveCompletionRef.current || false
    }

    saveInFlightRef.current = true
    const saveWork = (async () => {
      let successful = true
      try {
        do {
          saveQueuedRef.current = false
          const snapshotToSave = boardRef.current
          setSaveStatus('saving')
          const expectedVersion = savedVersionRef.current
          const result = await saveOnlineClassroomBoard(
            bookingId,
            expectedVersion,
            toCallableBoardDraft(snapshotToSave),
            tokenRef.current || undefined,
          )
          savedVersionRef.current = result.version
          if (boardRef.current === snapshotToSave) {
            replaceBoard({ ...snapshotToSave, version: result.version })
          } else if (boardRef.current.version <= result.version) {
            replaceBoard({ ...boardRef.current, version: result.version + 1 }, 'dirty')
          }
        } while (saveQueuedRef.current || boardRef.current.version > savedVersionRef.current)

        setSaveStatus(boardRef.current.version === savedVersionRef.current ? 'saved' : 'dirty')
      } catch (error) {
        successful = false
        if (errorCode(error) === 'failed-precondition') {
          try {
            const latestAccess = await requestOnlineClassroomAccess(bookingId, tokenRef.current || undefined)
            const authoritativeBoard = sanitizeBoardSnapshot(latestAccess.boardSnapshot)
            accessRef.current = latestAccess
            setAccess(latestAccess)
            replaceBoard(authoritativeBoard, 'saved')
            savedVersionRef.current = authoritativeBoard.version
            resetHistory()
            toast.warning('Bảng đã được cập nhật ở một cửa sổ khác. Đã tải lại bản lưu mới nhất để tránh ghi đè.')
          } catch (refreshError) {
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
    saveCompletionRef.current = saveWork
    const successful = await saveWork
    saveInFlightRef.current = false
    saveCompletionRef.current = null
    return successful
  }, [bookingId, replaceBoard, resetHistory])

  const queueBoardSave = useCallback(() => {
    const currentAccess = accessRef.current
    if (!currentAccess || !isBoardManager(currentAccess.role)) return
    setSaveStatus('dirty')
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void flushBoardSave()
    }, 1_800)
  }, [flushBoardSave])

  const sendBoardPayload = useCallback(async (payload: BoardMessagePayload): Promise<number> => {
    const currentAccess = accessRef.current
    if (!currentAccess) return 0
    const message = makeBoardMessage(bookingId, currentAccess.role, payload)
    const serialized = serializeBoardMessage(message)
    if (!serialized) return -1

    try {
      const sent = await broadcastJitsiTextMessage(
        jitsiApiRef.current,
        serialized,
        localParticipantIdRef.current,
      )
      if (sent > 0) setSyncWarning('')
      return sent
    } catch {
      setSyncWarning('Kết nối bảng tạm gián đoạn. Thay đổi sẽ được gửi lại khi có người tham gia.')
      return 0
    }
  }, [bookingId])

  const broadcastSnapshot = useCallback(async (snapshot = boardRef.current) => {
    const sent = await sendBoardPayload({ type: 'snapshot', snapshot })
    if (sent !== -1) return

    const saved = await flushBoardSave()
    if (saved) {
      await sendBoardPayload({ type: 'snapshot-refresh', boardVersion: snapshot.version })
    }
  }, [flushBoardSave, sendBoardPayload])

  const flushPendingStudentOperations = useCallback(async () => {
    if (pendingStudentOperationsRef.current.length === 0) return
    const pending = [...pendingStudentOperationsRef.current]
    const deliveredIds = new Set<string>()
    for (const operation of pending) {
      const sent = await sendBoardPayload({
        type: 'operation',
        boardVersion: boardRef.current.version,
        operation,
      })
      if (sent > 0) deliveredIds.add(operation.id)
    }
    pendingStudentOperationsRef.current = pendingStudentOperationsRef.current
      .filter((operation) => !deliveredIds.has(operation.id))
    setPendingStudentOperationCount(pendingStudentOperationsRef.current.length)
  }, [sendBoardPayload])

  const handleLocalOperation = useCallback((operation: BoardOperation) => {
    const currentAccess = accessRef.current
    const previous = boardRef.current
    if (!currentAccess || previous.operations.length >= MAX_BOARD_OPERATIONS) {
      toast.warning('Bảng đã đạt giới hạn nét vẽ. Gia sư hãy lưu rồi xóa bảng để tiếp tục.')
      return
    }
    if (currentAccess.role === 'student' && !previous.studentCanWrite) return
    if (previous.operations.some((item) => item.id === operation.id)) return

    if (isBoardManager(currentAccess.role)) rememberForUndo(previous.operations)
    const next = {
      ...previous,
      version: previous.version + 1,
      operations: [...previous.operations, operation],
    }
    replaceBoard(next, isBoardManager(currentAccess.role) ? 'dirty' : undefined)
    if (isBoardManager(currentAccess.role)) queueBoardSave()

    void sendBoardPayload({ type: 'operation', boardVersion: next.version, operation })
      .then((sent) => {
        if (currentAccess.role === 'student' && sent === 0) {
          if (!pendingStudentOperationsRef.current.some((item) => item.id === operation.id)) {
            pendingStudentOperationsRef.current.push(operation)
            setPendingStudentOperationCount(pendingStudentOperationsRef.current.length)
          }
        }
      })
  }, [queueBoardSave, rememberForUndo, replaceBoard, sendBoardPayload])

  const commitManagerBoard = useCallback((next: ValidatedBoardSnapshot) => {
    const currentAccess = accessRef.current
    if (!currentAccess || !isBoardManager(currentAccess.role)) return
    replaceBoard(next, 'dirty')
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    void flushBoardSave().then((saved) => {
      if (saved) void sendBoardPayload({ type: 'snapshot-refresh', boardVersion: boardRef.current.version })
    })
  }, [flushBoardSave, replaceBoard, sendBoardPayload])

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
    try {
      const result = await requestOnlineClassroomAccess(bookingId, tokenRef.current || undefined)
      accessRef.current = result
      setAccess(result)
      const remoteBoard = sanitizeBoardSnapshot(result.boardSnapshot)
      const pending = result.role === 'student' ? pendingStudentOperationsRef.current : []
      const remoteOperationIds = new Set(remoteBoard.operations.map((operation) => operation.id))
      const missingPending = pending.filter((operation) => !remoteOperationIds.has(operation.id))
      const visibleBoard = missingPending.length > 0
        ? {
            ...remoteBoard,
            version: remoteBoard.version + missingPending.length,
            operations: [...remoteBoard.operations, ...missingPending].slice(0, MAX_BOARD_OPERATIONS),
          }
        : remoteBoard
      if (visibleBoard.version >= boardRef.current.version) {
        replaceBoard(visibleBoard, isBoardManager(result.role) ? 'saved' : undefined)
        savedVersionRef.current = remoteBoard.version
        resetHistory()
      }
      if (missingPending.length > 0) void flushPendingStudentOperations()
    } catch {
      setSyncWarning('Chưa tải được bản bảng mới nhất. Hệ thống sẽ thử lại khi kiểm tra quyền truy cập.')
    }
  }, [bookingId, flushPendingStudentOperations, replaceBoard, resetHistory])

  const handleBoardTextMessage = useCallback((raw: string, senderId: string) => {
    const message = parseBoardMessage(raw, bookingId)
    const currentAccess = accessRef.current
    if (
      !message
      || !currentAccess
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
      // A peer-provided role/version is never authoritative. Managers ignore
      // remote control messages; students reload the callable-backed snapshot.
      if (!localIsManager) void refreshBoardFromServer()
      return
    }
    if (message.type === 'snapshot') {
      if (!localIsManager) void refreshBoardFromServer()
      return
    }

    const current = boardRef.current
    // One-to-one pilot: a manager treats every remote operation as a student
    // operation and enforces the server-backed write lock. A student treats the
    // only remote participant as the manager. senderRole/boardVersion from the
    // Jitsi payload are deliberately ignored and cannot elevate privileges.
    if (localIsManager && !current.studentCanWrite) return
    const remoteOperation: BoardOperation = {
      ...message.operation,
      authorRole: localIsManager ? 'student' : 'teacher',
    }
    if (current.operations.some((operation) => operation.id === remoteOperation.id)) return
    if (current.operations.length >= MAX_BOARD_OPERATIONS) return

    if (localIsManager) rememberForUndo(current.operations)
    const next = {
      ...current,
      version: current.version + 1,
      operations: [...current.operations, remoteOperation],
    }
    replaceBoard(next, localIsManager ? 'dirty' : undefined)
    if (localIsManager) queueBoardSave()
  }, [bookingId, broadcastSnapshot, queueBoardSave, refreshBoardFromServer, rememberForUndo, replaceBoard])

  const handleConferenceJoined = useCallback((participantId: string) => {
    localParticipantIdRef.current = participantId
  }, [])

  const handleDataChannelOpened = useCallback(() => {
    dataChannelReadyRef.current = true
    void sendBoardPayload({ type: 'hello' })
    const currentAccess = accessRef.current
    if (currentAccess?.role === 'student') {
      void sendBoardPayload({ type: 'snapshot-request' })
      window.setTimeout(() => void flushPendingStudentOperations(), 900)
    }
  }, [flushPendingStudentOperations, sendBoardPayload])

  const handleParticipantJoined = useCallback(() => {
    const currentAccess = accessRef.current
    if (!dataChannelReadyRef.current || !currentAccess) return
    if (isBoardManager(currentAccess.role)) {
      window.setTimeout(() => void broadcastSnapshot(), 600)
    } else {
      window.setTimeout(() => void flushPendingStudentOperations(), 900)
    }
  }, [broadcastSnapshot, flushPendingStudentOperations])

  useEffect(() => {
    if (loadState !== 'ready' || fatalAccessError) return

    let disposed = false
    const revalidate = async () => {
      if (disposed || revalidationInFlightRef.current) return
      revalidationInFlightRef.current = true
      try {
        const result = await requestOnlineClassroomAccess(bookingId, tokenRef.current || undefined)
        if (disposed) return
        consecutiveRevalidationFailuresRef.current = 0
        setRevalidationWarning('')
        accessRef.current = result
        setAccess(result)

        const remoteBoard = sanitizeBoardSnapshot(result.boardSnapshot)
        if (remoteBoard.version > boardRef.current.version) {
          if (result.role === 'student' && pendingStudentOperationsRef.current.length > 0) {
            await refreshBoardFromServer()
          } else {
            replaceBoard(remoteBoard, isBoardManager(result.role) ? 'saved' : undefined)
            savedVersionRef.current = remoteBoard.version
            resetHistory()
          }
        }
      } catch (error) {
        if (disposed) return
        consecutiveRevalidationFailuresRef.current += 1
        const message = onlineClassroomErrorMessage(error)
        if (isHardAccessFailure(error) || consecutiveRevalidationFailuresRef.current >= 3) {
          setFatalAccessError(message)
        } else {
          setRevalidationWarning('Kết nối kiểm tra quyền đang gián đoạn. Lớp sẽ tự kiểm tra lại trong một phút.')
        }
      } finally {
        revalidationInFlightRef.current = false
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
  }, [bookingId, fatalAccessError, flushBoardSave, loadState, refreshBoardFromServer, replaceBoard, resetHistory])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    setRecordingState('stopping')
    recorder.stop()
  }, [])

  const startRecording = useCallback(async () => {
    if (!recordingSupported || !recordingConsent) return
    setRecordingError('')
    setRecordingState('starting')
    try {
      const savePicker = (window as SaveFilePickerWindow).showSaveFilePicker
      if (!savePicker) throw new Error('SAVE_PICKER_UNAVAILABLE')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileHandle = await savePicker({
        suggestedName: `123english-${bookingId}-${timestamp}.webm`,
        types: [{ description: 'Video WebM', accept: { 'video/webm': ['.webm'] } }],
      })
      const writer = await fileHandle.createWritable()
      recordingWriterRef.current = writer
      recordingWriteChainRef.current = Promise.resolve()

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 24, max: 30 } },
        audio: true,
      })
      const mimeType = recordingMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recordingStreamRef.current = stream
      recorderRef.current = recorder

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size === 0 || !recordingWriterRef.current) return
        const chunk = event.data
        const activeWriter = recordingWriterRef.current
        recordingWriteChainRef.current = recordingWriteChainRef.current
          .then(() => activeWriter.write(chunk))
      })
      recorder.addEventListener('stop', () => {
        void (async () => {
          const activeWriter = recordingWriterRef.current
          try {
            await recordingWriteChainRef.current
            await activeWriter?.close()
            if (!unmountingRef.current) toast.success('Video đã được lưu trực tiếp vào tệp trên thiết bị. Hệ thống không giữ bản sao.')
          } catch {
            await activeWriter?.abort?.().catch(() => undefined)
            if (!unmountingRef.current) setRecordingError('Tệp video chưa được ghi hoàn chỉnh. Vui lòng kiểm tra dung lượng ổ đĩa rồi thử lại.')
          } finally {
            recordingWriterRef.current = null
            recordingWriteChainRef.current = Promise.resolve()
            recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
            recordingStreamRef.current = null
            recorderRef.current = null
            if (!unmountingRef.current) setRecordingState('idle')
          }
        })()
      }, { once: true })
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop()
      }, { once: true })

      // Write five-second chunks straight to disk so an 80-minute lesson does
      // not accumulate the entire recording in browser memory.
      recorder.start(5_000)
      setRecordingState('recording')
      setShowRecordingConsent(false)
      setRecordingConsent(false)
    } catch (error) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
      recordingStreamRef.current = null
      recorderRef.current = null
      const activeWriter = recordingWriterRef.current
      recordingWriterRef.current = null
      recordingWriteChainRef.current = Promise.resolve()
      await activeWriter?.abort?.().catch(() => undefined)
      setRecordingState('idle')
      const message = error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name)
        ? 'Bạn chưa chọn nơi lưu/màn hình hoặc đã từ chối quyền ghi. Không có video nào được tạo.'
        : 'Chưa thể bắt đầu ghi màn hình. Hãy thử lại bằng Chrome hoặc Edge mới nhất.'
      setRecordingError(message)
    }
  }, [bookingId, recordingConsent, recordingSupported])

  useEffect(() => {
    unmountingRef.current = false
    return () => {
      unmountingRef.current = true
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (pendingStudentOperationCount === 0) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [pendingStudentOperationCount])

  if (loadState === 'loading') return <ClassroomPageSkeleton />
  if (loadState === 'error') return <ClassroomErrorPage message={pageError} onRetry={() => void loadClassroom()} />
  if (!access) return <ClassroomErrorPage message="Không tìm thấy thông tin lớp học." onRetry={() => void loadClassroom()} />
  if (fatalAccessError) return <ClassroomErrorPage message={fatalAccessError} onRetry={() => void loadClassroom()} />

  const connectionHealthy = connectionState === 'connected'
  const recordingBusy = recordingState === 'starting' || recordingState === 'stopping'

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
            {manager && recordingState !== 'recording' && (
              <Button
                variant="outline"
                size="sm"
                disabled={recordingBusy}
                onClick={() => {
                  setRecordingError('')
                  setShowRecordingConsent(true)
                }}
                className="border-slate-300 bg-white text-slate-700 focus:ring-amber-300"
              >
                <FileVideo2 className="h-4 w-4" />
                <span className="hidden sm:inline">Ghi màn hình cục bộ</span>
              </Button>
            )}
            {manager && recordingState === 'recording' && (
              <Button variant="danger" size="sm" onClick={stopRecording}>
                <CircleStop className="h-4 w-4" />
                Dừng và lưu video
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

        {(access.publicPilotProvider || revalidationWarning || syncWarning || recordingState === 'recording') && (
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
            {recordingState === 'recording' && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold leading-5 text-rose-950" role="status">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-rose-600" />
                <p>Đang ghi màn hình đã chọn trên thiết bị này. Bản ghi chưa được tải lên hệ thống.</p>
              </div>
            )}
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
              onApiReady={(api) => {
                jitsiApiRef.current = api
                if (!api) dataChannelReadyRef.current = false
              }}
              onConferenceJoined={handleConferenceJoined}
              onParticipantJoined={handleParticipantJoined}
              onDataChannelOpened={handleDataChannelOpened}
              onTextMessage={(text, senderId) => handleBoardTextMessage(text, senderId)}
              onConnectionStateChange={setConnectionState}
              onEnded={() => setConnectionState('ended')}
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

      <Modal
        open={showRecordingConsent}
        onClose={() => {
          if (recordingState !== 'starting') {
            setShowRecordingConsent(false)
            setRecordingConsent(false)
            setRecordingError('')
          }
        }}
        title="Ghi màn hình trên thiết bị"
        size="md"
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                setShowRecordingConsent(false)
                setRecordingConsent(false)
                setRecordingError('')
              }}
            >
              Hủy
            </Button>
            <Button
              onClick={() => void startRecording()}
              loading={recordingState === 'starting'}
              disabled={!recordingSupported || !recordingConsent}
              className="bg-[#ffc107] text-[#10213a] hover:bg-amber-400 focus:ring-amber-300"
            >
              <MonitorUp className="h-4 w-4" />
              Chọn nơi lưu, màn hình và bắt đầu
            </Button>
          </div>
        )}
      >
        <div className="space-y-4 text-sm font-semibold leading-6 text-slate-600">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <p className="font-black">Bản ghi chỉ nằm trên thiết bị của bạn</p>
            <p className="mt-1 text-xs leading-5">Bạn chọn nơi lưu trước khi ghi; dữ liệu WebM được ghi dần vào tệp để buổi học dài không làm đầy bộ nhớ. 123English không tự tải lên hoặc giữ bản sao.</p>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Thông báo cho gia sư, học viên và người giám hộ nếu cần.</li>
            <li>Chỉ tiếp tục khi mọi người đã đồng ý ghi hình và ghi âm.</li>
            <li>Trong cửa sổ Chrome hoặc Edge, chọn tab lớp học này và bật chia sẻ âm thanh của tab.</li>
            <li>Dùng nút <strong>Dừng và lưu video</strong> và chờ thông báo tệp đã ghi xong.</li>
          </ol>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-slate-800">
            <input
              type="checkbox"
              checked={recordingConsent}
              onChange={(event) => setRecordingConsent(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 accent-amber-500"
            />
            <span>Tôi xác nhận đã thông báo, có sự đồng ý cần thiết và chịu trách nhiệm bảo quản bản ghi.</span>
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
