import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ImageOff,
  Loader2,
  RefreshCw,
  Radio,
} from 'lucide-react'
import {
  CollaborativeWhiteboard,
  type CollaborativeWhiteboardProps,
} from '@/components/classroom/CollaborativeWhiteboard'

export type ContainRect = {
  left: number
  top: number
  width: number
  height: number
}

// Kept beside the component so the geometry used by the image and canvas has
// one implementation. It is intentionally exported for focused unit tests.
// eslint-disable-next-line react-refresh/only-export-components
export function computeContainRect(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number,
): ContainRect {
  if (
    !Number.isFinite(containerWidth)
    || !Number.isFinite(containerHeight)
    || !Number.isFinite(mediaWidth)
    || !Number.isFinite(mediaHeight)
    || containerWidth <= 0
    || containerHeight <= 0
    || mediaWidth <= 0
    || mediaHeight <= 0
  ) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }

  const scale = Math.min(containerWidth / mediaWidth, containerHeight / mediaHeight)
  const width = mediaWidth * scale
  const height = mediaHeight * scale
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  }
}

export type ScreenShareAnnotationStageProps = Omit<CollaborativeWhiteboardProps, 'variant'> & {
  frameUrl: string
  loading: boolean
  error: string
  canRefreshFrame: boolean
  onRefresh: () => void | Promise<void>
  onReturnToLive: () => void
  showReturnToLiveOnDesktop?: boolean
  returnToLiveLabel?: string
}

type Dimensions = { width: number; height: number }
type FrameLoadState = Dimensions & { url: string; failed: boolean }

const EMPTY_DIMENSIONS: Dimensions = { width: 0, height: 0 }
const EMPTY_FRAME_LOAD_STATE: FrameLoadState = { ...EMPTY_DIMENSIONS, url: '', failed: false }

export function ScreenShareAnnotationStage({
  frameUrl,
  loading,
  error,
  canRefreshFrame,
  onRefresh,
  onReturnToLive,
  showReturnToLiveOnDesktop = false,
  returnToLiveLabel = 'Xem camera',
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
}: ScreenShareAnnotationStageProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const annotationSurfaceRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState<Dimensions>(EMPTY_DIMENSIONS)
  const [frameLoadState, setFrameLoadState] = useState<FrameLoadState>(EMPTY_FRAME_LOAD_STATE)
  const [frameDecodeError, setFrameDecodeError] = useState('')
  const canManageAnnotations = role === 'teacher' || role === 'admin'
  const frameSize = frameLoadState

  useEffect(() => {
    if (!frameUrl || frameUrl === frameLoadState.url) return

    let cancelled = false
    const nextImage = new Image()
    nextImage.onload = () => {
      if (cancelled) return
      setFrameDecodeError('')
      setFrameLoadState({
        url: frameUrl,
        failed: false,
        width: nextImage.naturalWidth,
        height: nextImage.naturalHeight,
      })
    }
    nextImage.onerror = () => {
      if (!cancelled) setFrameDecodeError('Ảnh màn hình chia sẻ không tải được.')
    }
    nextImage.src = frameUrl
    return () => {
      cancelled = true
      nextImage.onload = null
      nextImage.onerror = null
    }
  }, [frameLoadState.url, frameUrl])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const measure = () => {
      const rect = viewport.getBoundingClientRect()
      const next = {
        width: Math.max(0, rect.width),
        height: Math.max(0, rect.height),
      }
      setViewportSize((current) => (
        Math.abs(current.width - next.width) < 0.25
        && Math.abs(current.height - next.height) < 0.25
          ? current
          : next
      ))
    }

    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const containRect = useMemo(() => computeContainRect(
    viewportSize.width,
    viewportSize.height,
    frameSize.width,
    frameSize.height,
  ), [frameSize.height, frameSize.width, viewportSize.height, viewportSize.width])

  const hasFrame = Boolean(frameUrl && frameLoadState.url) && !frameLoadState.failed
  const frameReady = hasFrame && containRect.width > 0 && containRect.height > 0
  const visibleError = (frameUrl ? frameDecodeError : '') || error
  const statusLabel = visibleError
    ? 'Màn hình chia sẻ cần tải lại'
    : loading
      ? frameReady ? 'Đang cập nhật ảnh màn hình' : 'Đang tải màn hình chia sẻ'
      : frameReady
        ? canRefreshFrame
          ? 'Khung cố định đã đồng bộ · làm mới khi đổi slide'
          : 'Khung cố định do gia sư đồng bộ'
        : 'Chưa có ảnh màn hình chia sẻ'
  const frameStyle = frameReady
    ? {
        left: `${containRect.left}px`,
        top: `${containRect.top}px`,
        width: `${containRect.width}px`,
        height: `${containRect.height}px`,
      }
    : undefined

  const focusAnnotationSurface = (event: PointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLCanvasElement)) return
    annotationSurfaceRef.current?.focus({ preventScroll: true })
  }

  const handleAnnotationShortcut = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented
      || !canManageAnnotations
      || !(event.ctrlKey || event.metaKey)
      || event.key.toLowerCase() !== 'z'
    ) return

    event.preventDefault()
    if (event.shiftKey) {
      if (canRedo) onRedo()
    } else if (canUndo) {
      onUndo()
    }
  }

  return (
    <section className="flex h-full min-h-[320px] w-full flex-col overflow-hidden rounded-[1.5rem] border border-slate-800 bg-[#070b12] text-white shadow-[0_24px_70px_-42px_rgba(2,6,23,0.95)] sm:min-h-[420px]" aria-label="Màn hình chia sẻ có chú thích">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-950/95 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${visibleError ? 'bg-rose-500/15 text-rose-300' : frameReady ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-slate-300'}`}>
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : visibleError
                ? <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                : <Radio className="h-4 w-4" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-black">Màn hình bài giảng</h2>
            <p className={`truncate text-[11px] font-semibold ${visibleError ? 'text-rose-300' : 'text-slate-300'}`} aria-live="polite">
              {statusLabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {canRefreshFrame && (
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={loading}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-extrabold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-wait disabled:opacity-55"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span className="hidden sm:inline">Đổi khung bài giảng</span>
            </button>
          )}
          <button
            type="button"
            onClick={onReturnToLive}
            className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-300 px-3 text-xs font-black text-slate-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-slate-950 ${showReturnToLiveOnDesktop ? '' : 'md:hidden'}`}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {returnToLiveLabel}
          </button>
        </div>
      </header>

      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#05080d]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(51,65,85,0.22),transparent_65%)]" aria-hidden="true" />

        {frameUrl && frameLoadState.url && (
          <img
            src={frameLoadState.url}
            alt="Nội dung màn hình đang được chia sẻ"
            draggable={false}
            className={`absolute select-none ${frameReady ? 'opacity-100' : 'opacity-0'}`}
            style={frameStyle}
          />
        )}

        {frameReady && frameStyle && (
          <div
            ref={annotationSurfaceRef}
            role="region"
            tabIndex={0}
            aria-label="Vùng chú thích trên màn hình chia sẻ"
            aria-describedby="screen-annotation-shortcuts"
            aria-keyshortcuts="Control+Z Meta+Z Control+Shift+Z Meta+Shift+Z"
            className="absolute z-10 min-w-0 overflow-hidden rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300"
            style={frameStyle}
            onPointerDownCapture={focusAnnotationSurface}
            onKeyDown={handleAnnotationShortcut}
          >
            <CollaborativeWhiteboard
              snapshot={snapshot}
              role={role}
              canUndo={canUndo}
              canRedo={canRedo}
              saveStatus={saveStatus}
              pendingOperationCount={pendingOperationCount}
              onOperation={onOperation}
              onUndo={onUndo}
              onRedo={onRedo}
              onClear={onClear}
              onStudentCanWriteChange={onStudentCanWriteChange}
              onSave={onSave}
              variant="overlay"
            />
            <span id="screen-annotation-shortcuts" className="sr-only">
              Chọn công cụ rồi vẽ trực tiếp trên bài giảng. Gia sư hoặc quản trị viên có thể nhấn Control Z hoặc Command Z để hoàn tác, thêm Shift để làm lại.
            </span>
          </div>
        )}

        {!frameReady && loading && !visibleError && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center" role="status">
            <div>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <Loader2 className="h-7 w-7 animate-spin text-amber-300" aria-hidden="true" />
              </span>
              <p className="mt-4 text-sm font-extrabold">Đang lấy ảnh màn hình chia sẻ</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">Ảnh và lớp viết sẽ tự căn trùng nhau khi tải xong.</p>
            </div>
          </div>
        )}

        {!frameReady && !loading && !visibleError && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <div>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-slate-300 ring-1 ring-white/15">
                <ImageOff className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-4 text-sm font-extrabold">Chưa có ảnh màn hình chia sẻ</p>
              <p className="mt-1 max-w-sm text-xs font-semibold leading-5 text-slate-400">Hãy trở về lớp trực tiếp hoặc bấm làm mới sau khi gia sư bắt đầu chia sẻ.</p>
            </div>
          </div>
        )}

        {visibleError && (
          <div className={`${frameReady ? 'absolute inset-x-3 top-3 z-30' : 'absolute inset-0 flex items-center justify-center px-6'}`} role="alert">
            <div className={`${frameReady ? 'mx-auto max-w-xl' : 'w-full max-w-md text-center'} rounded-2xl border border-rose-400/30 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur-xl`}>
              <AlertTriangle className={`${frameReady ? 'mr-2 inline h-4 w-4' : 'mx-auto h-8 w-8'} text-rose-300`} aria-hidden="true" />
              <p className={`${frameReady ? 'inline text-xs' : 'mt-3 text-sm'} font-extrabold`}>{visibleError}</p>
              {!frameReady && canRefreshFrame && (
                <button
                  type="button"
                  onClick={() => void onRefresh()}
                  disabled={loading}
                  className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 text-xs font-black text-slate-950 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-wait disabled:opacity-55"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                  Thử tải lại
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
