import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Eraser,
  Highlighter,
  Lock,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Redo2,
  RotateCcw,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  Unlock,
  X,
} from 'lucide-react'
import {
  createBoardId,
  isBoardManager,
  type BoardOperation,
  type BoardPoint,
  type BoardTool,
  type ValidatedBoardSnapshot,
} from '@/lib/classroomBoard'
import type { OnlineClassroomRole } from '@/lib/onlineClassroom'

type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error'

export type CollaborativeWhiteboardProps = {
  snapshot: ValidatedBoardSnapshot
  role: OnlineClassroomRole
  canUndo: boolean
  canRedo: boolean
  saveStatus: SaveStatus
  pendingOperationCount: number
  onOperation: (operation: BoardOperation) => boolean | void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onStudentCanWriteChange: (enabled: boolean) => void
  onSave: () => void
  variant?: 'board' | 'overlay'
  headerActions?: React.ReactNode
}

type CanvasSize = { width: number; height: number; dpr: number }
type StrokeSize = 'thin' | 'medium' | 'thick'
type ActiveBoardTool = BoardTool | 'pointer'

const BOARD_COLORS = ['#10213a', '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#d97706'] as const

const TOOL_META: Record<BoardTool, { label: string; Icon: typeof PenLine }> = {
  pen: { label: 'Bút viết', Icon: PenLine },
  highlighter: { label: 'Bút đánh dấu', Icon: Highlighter },
  eraser: { label: 'Tẩy', Icon: Eraser },
  rectangle: { label: 'Hình chữ nhật', Icon: Square },
  ellipse: { label: 'Hình tròn hoặc ellipse', Icon: Circle },
  arrow: { label: 'Mũi tên', Icon: MoveUpRight },
  text: { label: 'Gõ chữ', Icon: Type },
}

const OVERLAY_TOOL_META: Record<ActiveBoardTool, { label: string; Icon: typeof PenLine }> = {
  pointer: { label: 'Con trỏ', Icon: MousePointer2 },
  ...TOOL_META,
}

const WIDTHS: Record<Exclude<BoardTool, 'text'>, Record<StrokeSize, number>> = {
  pen: { thin: 2, medium: 4, thick: 7 },
  highlighter: { thin: 10, medium: 16, thick: 24 },
  eraser: { thin: 12, medium: 22, thick: 32 },
  rectangle: { thin: 2, medium: 4, thick: 7 },
  ellipse: { thin: 2, medium: 4, thick: 7 },
  arrow: { thin: 2, medium: 4, thick: 7 },
}

const TEXT_SIZES: Record<StrokeSize, number> = { thin: 16, medium: 22, thick: 30 }

function isShapeTool(tool: BoardTool): tool is 'rectangle' | 'ellipse' | 'arrow' {
  return tool === 'rectangle' || tool === 'ellipse' || tool === 'arrow'
}

function drawOperation(context: CanvasRenderingContext2D, operation: BoardOperation, size: CanvasSize) {
  if (size.width <= 0 || size.height <= 0) return

  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'

  if (operation.kind === 'text') {
    context.globalCompositeOperation = 'source-over'
    context.globalAlpha = 1
    context.fillStyle = operation.color
    context.font = `700 ${operation.fontSize}px Quicksand, sans-serif`
    context.textBaseline = 'top'
    const x = operation.point.x * size.width
    const y = operation.point.y * size.height
    operation.text.split('\n').slice(0, 4).forEach((line, index) => {
      context.fillText(line, x, y + index * operation.fontSize * 1.25, Math.max(80, size.width - x - 12))
    })
    context.restore()
    return
  }

  if (operation.kind === 'shape') {
    context.globalCompositeOperation = 'source-over'
    context.globalAlpha = operation.opacity
    context.strokeStyle = operation.color
    context.lineWidth = operation.width
    const startX = operation.start.x * size.width
    const startY = operation.start.y * size.height
    const endX = operation.end.x * size.width
    const endY = operation.end.y * size.height

    context.beginPath()
    if (operation.shape === 'rectangle') {
      context.rect(startX, startY, endX - startX, endY - startY)
    } else if (operation.shape === 'ellipse') {
      const centerX = (startX + endX) / 2
      const centerY = (startY + endY) / 2
      context.ellipse(centerX, centerY, Math.abs(endX - startX) / 2, Math.abs(endY - startY) / 2, 0, 0, Math.PI * 2)
    } else {
      const angle = Math.atan2(endY - startY, endX - startX)
      const headLength = Math.max(12, operation.width * 4)
      context.moveTo(startX, startY)
      context.lineTo(endX, endY)
      context.moveTo(endX, endY)
      context.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6))
      context.moveTo(endX, endY)
      context.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6))
    }
    context.stroke()
    context.restore()
    return
  }

  const points = operation.points
  if (points.length === 0) {
    context.restore()
    return
  }

  context.globalCompositeOperation = operation.tool === 'eraser' ? 'destination-out' : 'source-over'
  context.globalAlpha = operation.opacity
  context.strokeStyle = operation.color
  context.fillStyle = operation.color
  context.lineWidth = operation.width

  const first = points[0]
  const startX = first.x * size.width
  const startY = first.y * size.height

  if (points.length === 1) {
    context.beginPath()
    context.arc(startX, startY, Math.max(1, operation.width / 2), 0, Math.PI * 2)
    context.fill()
    context.restore()
    return
  }

  context.beginPath()
  context.moveTo(startX, startY)
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    context.lineTo(point.x * size.width, point.y * size.height)
  }
  context.stroke()
  context.restore()
}

function ToolButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-10 min-w-10 items-center justify-center rounded-xl border px-2.5 text-sm font-extrabold transition focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-amber-300 bg-amber-100 text-amber-900'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}

function OverlayToolButton({
  active,
  disabled,
  label,
  onClick,
  children,
  danger = false,
}: {
  active?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border px-2.5 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40 md:h-9 md:min-w-9 md:rounded-lg md:px-2 ${
        active
          ? 'border-amber-300 bg-amber-300 text-slate-950'
          : danger
            ? 'border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
            : 'border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  )
}

export function CollaborativeWhiteboard({
  snapshot,
  role,
  canUndo,
  canRedo,
  saveStatus,
  pendingOperationCount,
  onOperation,
  onUndo,
  onRedo,
  onClear,
  onStudentCanWriteChange,
  onSave,
  variant = 'board',
  headerActions,
}: CollaborativeWhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasShellRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<BoardOperation | null>(null)
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 })
  const [tool, setTool] = useState<ActiveBoardTool>(variant === 'overlay' ? 'pointer' : 'pen')
  const [color, setColor] = useState<(typeof BOARD_COLORS)[number]>('#10213a')
  const [strokeSize, setStrokeSize] = useState<StrokeSize>('medium')
  const [confirmClear, setConfirmClear] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [pendingText, setPendingText] = useState<BoardPoint | null>(null)
  const [textDraft, setTextDraft] = useState('')
  const [overlayToolsExpanded, setOverlayToolsExpanded] = useState(false)
  const [boardToolsExpanded, setBoardToolsExpanded] = useState(true)
  const [overlayDesktopToolsVisible, setOverlayDesktopToolsVisible] = useState(true)
  const manager = isBoardManager(role)
  const canDraw = manager || snapshot.studentCanWrite
  const drawingEnabled = canDraw && tool !== 'pointer'

  const redraw = useCallback((draft?: BoardOperation | null) => {
    const canvas = canvasRef.current
    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) return
    const context = canvas.getContext('2d')
    if (!context) return

    context.setTransform(canvasSize.dpr, 0, 0, canvasSize.dpr, 0, 0)
    context.clearRect(0, 0, canvasSize.width, canvasSize.height)
    for (const operation of snapshot.operations) drawOperation(context, operation, canvasSize)
    if (draft) drawOperation(context, draft, canvasSize)
  }, [canvasSize, snapshot.operations])

  useLayoutEffect(() => {
    const shell = canvasShellRef.current
    const canvas = canvasRef.current
    if (!shell || !canvas) return

    const resize = () => {
      const rect = shell.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      setCanvasSize({ width, height, dpr })
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    redraw(draftRef.current)
  }, [redraw])

  useEffect(() => {
    if (!confirmClear) return
    const timeout = window.setTimeout(() => setConfirmClear(false), 6_000)
    return () => window.clearTimeout(timeout)
  }, [confirmClear])

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): BoardPoint | null => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingEnabled || event.button !== 0) return
    const point = pointFromEvent(event)
    if (!point) return
    event.preventDefault()

    if (tool === 'text') {
      setPendingText(point)
      setTextDraft('')
      return
    }

    setIsDrawing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    draftRef.current = isShapeTool(tool)
      ? {
          id: createBoardId('shape'),
          kind: 'shape',
          shape: tool,
          color,
          width: WIDTHS[tool][strokeSize],
          opacity: 1,
          start: point,
          end: point,
          authorRole: role,
          createdAt: Date.now(),
        }
      : {
          id: createBoardId('stroke'),
          kind: 'stroke',
          tool,
          color,
          width: WIDTHS[tool][strokeSize],
          opacity: tool === 'highlighter' ? 0.28 : 1,
          points: [point],
          authorRole: role,
          createdAt: Date.now(),
        }
    redraw(draftRef.current)
  }

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const draft = draftRef.current
    if (!draft || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const point = pointFromEvent(event)
    if (!point) return

    if (draft.kind === 'shape') {
      draftRef.current = { ...draft, end: point }
      redraw(draftRef.current)
      return
    }

    if (draft.kind !== 'stroke' || draft.points.length >= 800) return
    const previous = draft.points[draft.points.length - 1]
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y)
    if (distance < 0.0012) return
    draft.points.push(point)
    redraw(draft)
  }

  const finishStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    const draft = draftRef.current
    if (!draft) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    draftRef.current = null
    setIsDrawing(false)
    if (draft.kind === 'shape' && Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y) < 0.006) {
      redraw()
      return
    }
    const accepted = onOperation(draft.kind === 'stroke' ? { ...draft, points: [...draft.points] } : draft)
    if (accepted === false) redraw()
  }

  const cancelStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    draftRef.current = null
    setIsDrawing(false)
    redraw()
  }

  const handleKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (!manager || !(event.ctrlKey || event.metaKey)) return
    if (event.key.toLowerCase() !== 'z') return
    event.preventDefault()
    if (event.shiftKey) {
      if (canRedo) onRedo()
    } else if (canUndo) {
      onUndo()
    }
  }

  const commitText = () => {
    const text = textDraft.trim()
    if (!pendingText || !text || !canDraw) return
    const accepted = onOperation({
      id: createBoardId('text'),
      kind: 'text',
      point: pendingText,
      text,
      color,
      fontSize: TEXT_SIZES[strokeSize],
      authorRole: role,
      createdAt: Date.now(),
    })
    if (accepted !== false) {
      setPendingText(null)
      setTextDraft('')
    }
  }

  const saveLabel = !manager
    ? pendingOperationCount > 0
      ? `${pendingOperationCount} nét đang chờ đồng bộ`
      : `Đã đồng bộ phiên bản ${snapshot.version}`
    : saveStatus === 'saving'
      ? 'Đang lưu'
      : saveStatus === 'error'
        ? 'Lưu chưa thành công'
        : saveStatus === 'dirty'
          ? 'Chưa lưu thay đổi mới'
          : `Đã lưu phiên bản ${snapshot.version}`
  const textEditorPosition = pendingText
    ? (() => {
        const inset = 12
        const editorWidth = Math.min(256, Math.max(1, canvasSize.width - inset * 2))
        const editorHeightEstimate = 190
        const desiredLeft = pendingText.x * canvasSize.width - editorWidth / 2
        const left = Math.min(
          Math.max(inset, canvasSize.width - editorWidth - inset),
          Math.max(inset, desiredLeft),
        )
        const pointY = pendingText.y * canvasSize.height
        const preferredTop = pointY + inset + editorHeightEstimate <= canvasSize.height
          ? pointY + inset
          : pointY - editorHeightEstimate - inset
        const top = Math.min(
          Math.max(inset, canvasSize.height - editorHeightEstimate - inset),
          Math.max(inset, preferredTop),
        )
        return { left, top }
      })()
    : null

  const chooseOverlayTool = (nextTool: ActiveBoardTool) => {
    draftRef.current = null
    setIsDrawing(false)
    setPendingText(null)
    setTextDraft('')
    setTool(nextTool)
    redraw()
  }

  const renderOverlayControls = () => (
    <div className="flex min-w-max items-center gap-1.5 p-1.5 md:min-w-0">
      <div className="flex shrink-0 items-center gap-1 rounded-xl bg-white/5 p-1">
        {(Object.keys(OVERLAY_TOOL_META) as ActiveBoardTool[]).map((item) => {
          const { Icon, label } = OVERLAY_TOOL_META[item]
          return (
            <OverlayToolButton
              key={item}
              active={tool === item}
              disabled={!canDraw && item !== 'pointer'}
              label={label}
              onClick={() => chooseOverlayTool(item)}
            >
              <Icon className="h-4 w-4" />
            </OverlayToolButton>
          )
        })}
      </div>

      {tool !== 'eraser' && tool !== 'pointer' && (
        <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-white/10 bg-white/5 p-1" aria-label="Chọn màu chú thích">
          {BOARD_COLORS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setColor(item)}
              disabled={!canDraw}
              aria-label={`Chọn màu ${item}`}
              title={`Màu ${item}`}
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-40 md:h-9 md:w-9 md:rounded-lg"
            >
              <span className="h-5 w-5 rounded-full border border-white/25" style={{ backgroundColor: item }} />
              {color === item && <Check className={`absolute h-3 w-3 ${item === '#10213a' || item === '#2563eb' || item === '#dc2626' || item === '#9333ea' ? 'text-white' : 'text-slate-950'}`} />}
            </button>
          ))}
        </div>
      )}

      {tool !== 'pointer' && (
        <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-white/10 bg-white/5 p-1" aria-label="Chọn độ dày nét chú thích">
          {(['thin', 'medium', 'thick'] as StrokeSize[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStrokeSize(item)}
              disabled={!canDraw}
              aria-label={`Độ dày ${item === 'thin' ? 'mảnh' : item === 'medium' ? 'vừa' : 'đậm'}`}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-40 md:h-9 md:w-9 md:rounded-lg ${strokeSize === item ? 'bg-amber-300 text-slate-950' : 'hover:bg-white/10'}`}
            >
              <span className="rounded-full bg-current" style={{ width: WIDTHS.pen[item] + 3, height: WIDTHS.pen[item] + 3 }} />
            </button>
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
        {manager ? (
          <OverlayToolButton
            active={!snapshot.studentCanWrite}
            label={snapshot.studentCanWrite ? 'Khóa quyền viết của học viên' : 'Mở quyền viết cho học viên'}
            onClick={() => onStudentCanWriteChange(!snapshot.studentCanWrite)}
          >
            {snapshot.studentCanWrite ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </OverlayToolButton>
        ) : (
          <span className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold md:h-9 md:rounded-lg ${snapshot.studentCanWrite ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-slate-300'}`}>
            {snapshot.studentCanWrite ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {snapshot.studentCanWrite ? 'Được viết' : 'Chỉ xem'}
          </span>
        )}

        {manager && (
          <>
            <OverlayToolButton label="Hoàn tác" onClick={onUndo} disabled={!canUndo}>
              <Undo2 className="h-4 w-4" />
            </OverlayToolButton>
            <OverlayToolButton label="Làm lại" onClick={onRedo} disabled={!canRedo}>
              <Redo2 className="h-4 w-4" />
            </OverlayToolButton>
            {!confirmClear ? (
              <OverlayToolButton label="Xóa toàn bộ chú thích" onClick={() => setConfirmClear(true)} danger>
                <Trash2 className="h-4 w-4" />
              </OverlayToolButton>
            ) : (
              <div className="flex h-11 shrink-0 items-center gap-1 rounded-xl border border-rose-400/30 bg-rose-500/15 px-1 md:h-9 md:rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    onClear()
                    setConfirmClear(false)
                  }}
                  className="h-9 rounded-lg px-2 text-xs font-extrabold text-rose-100 hover:bg-rose-400/20 focus:outline-none focus:ring-2 focus:ring-rose-300 md:h-7"
                >
                  Xác nhận xóa
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  aria-label="Hủy xóa chú thích"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-slate-300 md:h-7 md:w-7"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <OverlayToolButton label="Lưu chú thích ngay" onClick={onSave}>
              {saveStatus === 'saving' ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </OverlayToolButton>
          </>
        )}
      </div>
    </div>
  )

  if (variant === 'overlay') {
    const ActiveToolIcon = OVERLAY_TOOL_META[tool].Icon
    return (
      <section
        className="pointer-events-none relative h-full min-h-0 w-full overflow-visible bg-transparent"
        aria-label="Lớp chú thích trên màn hình chia sẻ"
        onKeyDown={handleKeyboard}
      >
        {overlayDesktopToolsVisible ? (
          <div className="pointer-events-auto absolute left-1/2 top-3 z-20 hidden max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center rounded-2xl border border-white/15 bg-slate-950/92 shadow-2xl shadow-black/40 backdrop-blur-xl md:flex">
            <div className="min-w-0 overflow-x-auto">{renderOverlayControls()}</div>
            <button
              type="button"
              onClick={() => setOverlayDesktopToolsVisible(false)}
              aria-label="Thu gọn công cụ chú thích"
              title="Thu gọn công cụ"
              className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOverlayDesktopToolsVisible(true)}
            className="pointer-events-auto absolute left-1/2 top-3 z-20 hidden min-h-10 -translate-x-1/2 items-center gap-2 rounded-xl border border-white/15 bg-slate-950/92 px-3 text-xs font-extrabold text-white shadow-xl backdrop-blur-xl hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-300 md:flex"
          >
            <PenLine className="h-4 w-4 text-amber-300" />
            Hiện công cụ viết
            <ChevronDown className="h-4 w-4" />
          </button>
        )}

        <div className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 md:hidden">
          <div className="overflow-hidden rounded-2xl border border-white/15 bg-slate-950/94 text-white shadow-2xl shadow-black/50 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setOverlayToolsExpanded((current) => !current)}
              aria-expanded={overlayToolsExpanded}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-300"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tool === 'pointer' ? 'bg-white/10 text-white' : 'bg-amber-300 text-slate-950'}`}>
                  <ActiveToolIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black">Công cụ chú thích</span>
                  <span className="block truncate text-[10px] font-semibold text-slate-300">{OVERLAY_TOOL_META[tool].label} · {saveLabel}</span>
                </span>
              </span>
              {overlayToolsExpanded ? <ChevronDown className="h-5 w-5 shrink-0" /> : <ChevronUp className="h-5 w-5 shrink-0" />}
            </button>
            {overlayToolsExpanded && (
              <div className="max-h-[52dvh] overflow-auto border-t border-white/10">
                {renderOverlayControls()}
              </div>
            )}
          </div>
        </div>

        <div ref={canvasShellRef} className="absolute inset-0 overflow-hidden bg-transparent">
          <canvas
            ref={canvasRef}
            className={`block h-full w-full select-none ${drawingEnabled ? 'pointer-events-auto cursor-crosshair touch-none' : 'pointer-events-none cursor-default'}`}
            aria-label={drawingEnabled ? 'Vùng chú thích trên màn hình chia sẻ' : tool === 'pointer' ? 'Chế độ con trỏ, không tạo nét mới' : 'Chú thích đang ở chế độ chỉ xem'}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={cancelStroke}
          />

          {!canDraw && (
            <div className="pointer-events-none absolute bottom-16 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-slate-950/90 px-4 py-2 text-xs font-extrabold text-white shadow-lg backdrop-blur md:bottom-4">
              <Lock className="h-3.5 w-3.5" />
              Gia sư đang khóa quyền viết
            </div>
          )}

          {pendingText && canDraw && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                commitText()
              }}
              className="pointer-events-auto absolute z-30 w-64 rounded-2xl border border-amber-300/40 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur-xl"
              style={{
                width: 'min(16rem, calc(100% - 1.5rem))',
                left: `${textEditorPosition?.left ?? 12}px`,
                top: `${textEditorPosition?.top ?? 12}px`,
              }}
            >
              <label htmlFor="classroom-overlay-text" className="text-xs font-extrabold text-slate-100">Nội dung cần thêm</label>
              <textarea
                id="classroom-overlay-text"
                value={textDraft}
                onChange={(event) => setTextDraft(event.target.value.slice(0, 240))}
                onKeyDown={(event) => event.stopPropagation()}
                rows={3}
                maxLength={240}
                autoFocus
                placeholder="Nhập câu hỏi hoặc câu trả lời"
                className="mt-2 w-full resize-none rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-400">{textDraft.length}/240</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingText(null)
                      setTextDraft('')
                    }}
                    className="min-h-9 rounded-lg px-3 text-xs font-extrabold text-slate-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={!textDraft.trim()}
                    className="min-h-9 rounded-lg bg-amber-300 px-3 text-xs font-black text-slate-950 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Thêm chữ
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </section>
    )
  }

  return (
    <section
      className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_24px_70px_-52px_rgba(16,33,58,0.5)]"
      aria-label="Bảng học tương tác"
      onKeyDown={handleKeyboard}
    >
      <header className="border-b border-slate-200 bg-[#fffdf7] px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <PenLine className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-black text-[#10213a]">Bảng học tương tác</h2>
                <p className={`text-[11px] font-bold ${saveStatus === 'error' ? 'text-rose-700' : saveStatus === 'dirty' ? 'text-amber-700' : 'text-slate-500'}`} aria-live="polite">
                  {saveLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!manager && (
              <span className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-extrabold ${snapshot.studentCanWrite ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                {snapshot.studentCanWrite ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {snapshot.studentCanWrite ? 'Được viết' : 'Chỉ xem'}
              </span>
            )}
            {manager && (
              <ToolButton
                active={!snapshot.studentCanWrite}
                label={snapshot.studentCanWrite ? 'Khóa quyền viết của học viên' : 'Mở quyền viết cho học viên'}
                onClick={() => onStudentCanWriteChange(!snapshot.studentCanWrite)}
              >
                {snapshot.studentCanWrite ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                <span className="hidden sm:inline">{snapshot.studentCanWrite ? 'Học viên được viết' : 'Đã khóa học viên'}</span>
              </ToolButton>
            )}
            <button
              type="button"
              onClick={() => setBoardToolsExpanded((current) => !current)}
              aria-expanded={boardToolsExpanded}
              aria-label={boardToolsExpanded ? 'Ẩn công cụ bảng trắng' : 'Hiện công cụ bảng trắng'}
              title={boardToolsExpanded ? 'Ẩn công cụ' : 'Hiện công cụ'}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              {boardToolsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="hidden sm:inline">{boardToolsExpanded ? 'Ẩn công cụ' : 'Hiện công cụ'}</span>
            </button>
            {headerActions}
          </div>
        </div>

        {boardToolsExpanded && (
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Công cụ bảng học">
          <div className="flex shrink-0 items-center gap-1 rounded-2xl bg-slate-100 p-1">
            {(Object.keys(TOOL_META) as BoardTool[]).map((item) => {
              const { Icon, label } = TOOL_META[item]
              return (
                <ToolButton
                  key={item}
                  active={tool === item}
                  label={label}
                  onClick={() => {
                    setTool(item)
                    setPendingText(null)
                  }}
                >
                  <Icon className="h-4 w-4" />
                </ToolButton>
              )
            })}
          </div>

          {tool !== 'eraser' && (
            <div className="flex shrink-0 items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1" aria-label="Chọn màu bút">
              {BOARD_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setColor(item)}
                  aria-label={`Chọn màu ${item}`}
                  title={`Màu ${item}`}
                  className="relative flex h-9 w-9 items-center justify-center rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  <span className="h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: item }} />
                  {color === item && <Check className={`absolute h-3 w-3 ${item === '#10213a' || item === '#2563eb' || item === '#dc2626' || item === '#9333ea' ? 'text-white' : 'text-slate-950'}`} />}
                </button>
              ))}
            </div>
          )}

          <div className="flex shrink-0 items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1" aria-label="Chọn độ dày nét">
            {(['thin', 'medium', 'thick'] as StrokeSize[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStrokeSize(item)}
                aria-label={`Độ dày ${item === 'thin' ? 'mảnh' : item === 'medium' ? 'vừa' : 'đậm'}`}
                className={`flex h-9 w-9 items-center justify-center rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 ${strokeSize === item ? 'bg-amber-100' : 'hover:bg-slate-100'}`}
              >
                <span className="rounded-full bg-slate-800" style={{ width: WIDTHS.pen[item] + 3, height: WIDTHS.pen[item] + 3 }} />
              </button>
            ))}
          </div>

          {manager && (
            <div className="ml-auto flex shrink-0 items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1">
              <ToolButton label="Hoàn tác" onClick={onUndo} disabled={!canUndo}>
                <Undo2 className="h-4 w-4" />
              </ToolButton>
              <ToolButton label="Làm lại" onClick={onRedo} disabled={!canRedo}>
                <Redo2 className="h-4 w-4" />
              </ToolButton>
              {!confirmClear ? (
                <ToolButton label="Xóa toàn bộ bảng" onClick={() => setConfirmClear(true)}>
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </ToolButton>
              ) : (
                <div className="flex items-center gap-1 rounded-xl bg-rose-50 px-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClear()
                      setConfirmClear(false)
                    }}
                    className="flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-extrabold text-rose-700 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xóa bảng
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    aria-label="Hủy xóa bảng"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <ToolButton label="Lưu bảng ngay" onClick={onSave}>
                {saveStatus === 'saving' ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </ToolButton>
            </div>
          )}
        </div>
        )}
      </header>

      <div ref={canvasShellRef} className="relative min-h-0 flex-1 overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className={`block h-full w-full select-none ${canDraw ? 'cursor-crosshair touch-none' : 'cursor-not-allowed'}`}
          aria-label={canDraw ? 'Vùng vẽ bảng học' : 'Bảng học đang ở chế độ chỉ xem'}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={cancelStroke}
        />

        {snapshot.operations.length === 0 && !isDrawing && !pendingText && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
            <div>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-800 ring-1 ring-amber-100">
                <PenLine className="h-6 w-6" />
              </span>
              <p className="mt-4 text-sm font-extrabold text-slate-700">Bảng đang trống</p>
              <p className="mt-1 max-w-xs text-xs font-semibold leading-5 text-slate-500">
                {canDraw ? 'Chọn công cụ phía trên rồi viết trực tiếp bằng chuột, bút cảm ứng hoặc ngón tay.' : 'Gia sư sẽ mở quyền khi đến phần cần học viên viết.'}
              </p>
            </div>
          </div>
        )}

        {!canDraw && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-xs font-extrabold text-slate-700 shadow-lg backdrop-blur">
            <Lock className="h-3.5 w-3.5" />
            Gia sư đang khóa quyền viết
          </div>
        )}

        {pendingText && canDraw && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              commitText()
            }}
            className="absolute z-10 w-64 rounded-2xl border border-amber-200 bg-white p-3 shadow-2xl"
            style={{
              width: 'min(16rem, calc(100% - 1.5rem))',
              left: `${textEditorPosition?.left ?? 12}px`,
              top: `${textEditorPosition?.top ?? 12}px`,
            }}
          >
            <label htmlFor="classroom-board-text" className="text-xs font-extrabold text-slate-700">Nội dung cần thêm</label>
            <textarea
              id="classroom-board-text"
              value={textDraft}
              onChange={(event) => setTextDraft(event.target.value.slice(0, 240))}
              onKeyDown={(event) => event.stopPropagation()}
              rows={3}
              maxLength={240}
              autoFocus
              placeholder="Nhập câu hỏi hoặc câu trả lời"
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-slate-400">{textDraft.length}/240</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setPendingText(null)
                    setTextDraft('')
                  }}
                  className="min-h-9 rounded-lg px-3 text-xs font-extrabold text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!textDraft.trim()}
                  className="min-h-9 rounded-lg bg-[#ffc107] px-3 text-xs font-black text-[#10213a] hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Thêm chữ
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
