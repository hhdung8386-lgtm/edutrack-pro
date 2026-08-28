import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  FileVideo2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  confirmOnlineClassroomRecordingDownloaded,
  createOnlineClassroomRecordingShareLink,
  getOnlineClassroomRecording,
  onlineClassroomRecordingErrorMessage,
  readOnlineClassroomRecordingToken,
  rememberOnlineClassroomRecordingToken,
  removeOnlineClassroomRecordingTokenFromAddressBar,
  type OnlineClassroomRecordingAccess,
} from '@/lib/onlineClassroomRecording'
import { toast } from '@/stores/toastStore'

type PageState = 'loading' | 'ready' | 'error' | 'deleted'

type DownloadWritable = {
  write: (data: Uint8Array<ArrayBuffer>) => Promise<void>
  close: () => Promise<void>
  abort?: () => Promise<void>
}

type DownloadFileHandle = {
  createWritable: () => Promise<DownloadWritable>
}

type DownloadPickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<DownloadFileHandle>
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Chưa xác định'
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${Math.ceil(value / 1024)} KB`
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Chưa xác định'
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('vi-VN', { hour12: false })
    : 'Chưa xác định'
}

export function ClassroomRecordingPage() {
  const { recordingId = '' } = useParams<{ recordingId: string }>()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [recording, setRecording] = useState<OnlineClassroomRecordingAccess | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadedBytes, setDownloadedBytes] = useState(0)
  const [downloadCompleted, setDownloadCompleted] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmed, setDeleteConfirmed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copyingShareLink, setCopyingShareLink] = useState(false)
  const tokenRef = useRef('')

  const loadRecording = useCallback(async () => {
    if (!recordingId) {
      setErrorMessage('Mã bản ghi không hợp lệ.')
      setPageState('error')
      return
    }
    setPageState('loading')
    setErrorMessage('')
    try {
      const token = tokenRef.current || readOnlineClassroomRecordingToken(recordingId)
      tokenRef.current = token
      removeOnlineClassroomRecordingTokenFromAddressBar()
      const result = await getOnlineClassroomRecording(recordingId, token || undefined)
      if (token) rememberOnlineClassroomRecordingToken(recordingId, token)
      setRecording(result)
      setPageState('ready')
      document.title = `Xem lại ${result.subjectName || 'buổi học'} | 123English`
    } catch (error) {
      setErrorMessage(onlineClassroomRecordingErrorMessage(error))
      setPageState('error')
    }
  }, [recordingId])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadRecording(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadRecording])

  const handleDownload = async () => {
    if (!recording || downloading) return
    const picker = (window as DownloadPickerWindow).showSaveFilePicker
    if (!picker) {
      window.open(recording.downloadUrl, '_blank', 'noopener,noreferrer')
      toast.info('Video đã mở ở tab mới. Dùng nút tải của trình duyệt để lưu về máy.')
      return
    }

    setDownloading(true)
    setDownloadedBytes(0)
    let writable: DownloadWritable | null = null
    try {
      const handle = await picker({
        suggestedName: recording.fileName || `123english-${recordingId}.webm`,
        types: [{ description: 'Video WebM', accept: { 'video/webm': ['.webm'] } }],
      })
      writable = await handle.createWritable()
      const response = await fetch(recording.downloadUrl, { cache: 'no-store' })
      if (!response.ok || !response.body) throw new Error(`DOWNLOAD_${response.status}`)
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        await writable.write(value as Uint8Array<ArrayBuffer>)
        setDownloadedBytes((current) => current + value.byteLength)
      }
      await writable.close()
      writable = null
      setDownloadCompleted(true)
      toast.success('Đã tải bản ghi về máy. Bạn có thể xác nhận để xóa bản trên hệ thống.')
    } catch (error) {
      await writable?.abort?.().catch(() => undefined)
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.error('Chưa tải được video. Hãy kiểm tra mạng rồi thử lại.')
    } finally {
      setDownloading(false)
    }
  }

  const handleCopyShareLink = async () => {
    if (!recording || copyingShareLink) return
    setCopyingShareLink(true)
    try {
      const replayUrl = await createOnlineClassroomRecordingShareLink(recording.recordingId)
      await navigator.clipboard.writeText(replayUrl)
      toast.success('Đã tạo và sao chép link xem lại mới cho học viên.')
    } catch (error) {
      toast.error(onlineClassroomRecordingErrorMessage(error))
    } finally {
      setCopyingShareLink(false)
    }
  }

  const handleDeleteAfterDownload = async () => {
    if (!recording || !deleteConfirmed) return
    setDeleting(true)
    try {
      await confirmOnlineClassroomRecordingDownloaded(recording.recordingId, tokenRef.current || undefined)
      setShowDeleteConfirm(false)
      setPageState('deleted')
      setRecording(null)
    } catch (error) {
      toast.error(onlineClassroomRecordingErrorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  if (pageState === 'loading') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f6f8fb] px-4 font-[var(--font-quicksand)]">
        <div className="text-center text-[#10213a]" role="status">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-amber-600" />
          <p className="mt-4 text-sm font-black">Đang kiểm tra quyền xem bản ghi</p>
        </div>
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f6f8fb] px-4 font-[var(--font-quicksand)] text-[#10213a]">
        <main className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-10">
          <Logo clickable={false} className="mx-auto h-9 w-auto" />
          <AlertTriangle className="mx-auto mt-8 h-10 w-10 text-amber-600" />
          <h1 className="mt-4 text-xl font-black">Chưa thể mở bản ghi</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{errorMessage}</p>
          <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => void loadRecording()}>
              <RefreshCw className="h-4 w-4" />
              Thử lại
            </Button>
            <Link to="/" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50">
              Về trang chính
            </Link>
          </div>
        </main>
      </div>
    )
  }

  if (pageState === 'deleted') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f6f8fb] px-4 font-[var(--font-quicksand)] text-[#10213a]">
        <main className="w-full max-w-lg rounded-[2rem] border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-xl font-black">Đã xóa bản ghi khỏi hệ thống</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Link cũ đã ngừng truy cập ngay. Tệp bạn vừa tải trên máy không bị ảnh hưởng.</p>
          <Link to="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#ffc107] px-5 text-sm font-black text-[#10213a] hover:bg-amber-400">
            Về trang chính
          </Link>
        </main>
      </div>
    )
  }

  if (!recording) return null

  const progress = recording.sizeBytes > 0
    ? Math.min(100, Math.round((downloadedBytes / recording.sizeBytes) * 100))
    : 0
  const manager = recording.viewerRole === 'admin' || recording.viewerRole === 'teacher'

  return (
    <div className="min-h-[100dvh] bg-[#f6f8fb] font-[var(--font-quicksand)] text-[#10213a]">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Logo clickable className="h-8 w-auto" />
          <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            Link riêng tư
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-hidden rounded-[1.5rem] border border-slate-800 bg-[#070b12] shadow-sm" aria-label="Video buổi học">
            <video
              className="aspect-video w-full bg-black"
              controls
              playsInline
              preload="metadata"
              src={recording.playbackUrl}
            >
              Trình duyệt của bạn không hỗ trợ phát video WebM.
            </video>
          </section>

          <aside className="space-y-4">
            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <FileVideo2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h1 className="text-lg font-black leading-6">{recording.subjectName || 'Bản ghi buổi học'}</h1>
                  <p className="mt-1 text-xs font-bold text-slate-500">{recording.teacherName || 'Gia sư'} và {recording.studentName || 'học viên'}</p>
                </div>
              </div>

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <dt className="inline-flex items-center gap-2 font-semibold text-slate-500"><CalendarClock className="h-4 w-4" />Buổi học</dt>
                  <dd className="text-right font-black text-slate-800">{formatDate(recording.requestedDate)}<br />{recording.requestedStart} - {recording.requestedEnd}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="font-semibold text-slate-500">Dung lượng</dt>
                  <dd className="font-black text-slate-800">{formatBytes(recording.sizeBytes)}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="inline-flex items-center gap-2 font-semibold text-slate-500"><Clock3 className="h-4 w-4" />Tự xóa lúc</dt>
                  <dd className="text-right font-black text-rose-700">{formatDateTime(recording.expiresAt)}</dd>
                </div>
              </dl>

              <div className="mt-5 space-y-2">
                <Button className="w-full" loading={downloading} onClick={() => void handleDownload()}>
                  <Download className="h-4 w-4" />
                  {downloading ? `Đang tải ${progress}%` : downloadCompleted ? 'Tải lại về máy' : 'Tải video về máy'}
                </Button>
                {manager && (
                  <Button variant="outline" className="w-full" loading={copyingShareLink} onClick={() => void handleCopyShareLink()}>
                    <Copy className="h-4 w-4" />
                    Tạo link cho học viên
                  </Button>
                )}
                <Button variant="outline" className="w-full border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => {
                  setDeleteConfirmed(false)
                  setShowDeleteConfirm(true)
                }}>
                  <Trash2 className="h-4 w-4" />
                  Đã tải xong - xóa ngay
                </Button>
              </div>
            </section>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-5 text-amber-950">
              Bản ghi được giữ tối đa 3 ngày. Nếu xác nhận đã tải xong, hệ thống sẽ khóa link và xóa bản lưu ngay.
            </div>
          </aside>
        </div>
      </main>

      <Modal
        open={showDeleteConfirm}
        onClose={() => {
          if (!deleting) setShowDeleteConfirm(false)
        }}
        title="Xóa bản ghi khỏi hệ thống?"
        size="sm"
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" disabled={deleting} onClick={() => setShowDeleteConfirm(false)}>Giữ lại</Button>
            <Button variant="danger" loading={deleting} disabled={!deleteConfirmed} onClick={() => void handleDeleteAfterDownload()}>
              <Trash2 className="h-4 w-4" />
              Xóa ngay
            </Button>
          </div>
        )}
      >
        <div className="space-y-4 text-sm font-semibold leading-6 text-slate-600">
          <p>Sau khi xóa, video và mọi link xem lại sẽ ngừng hoạt động. Thao tác này không ảnh hưởng tệp đã tải về máy.</p>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <input
              type="checkbox"
              checked={deleteConfirmed}
              onChange={(event) => setDeleteConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-rose-300 accent-rose-600"
            />
            <span>Tôi xác nhận đã tải xong và muốn xóa bản ghi trên hệ thống.</span>
          </label>
        </div>
      </Modal>
    </div>
  )
}
