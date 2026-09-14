import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileCode2, RefreshCw } from 'lucide-react'
import type { LessonHomeworkHtmlAttachment } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { useLanguageStore } from '@/stores/languageStore'

const MAX_VIEWER_RESPONSE_BYTES = 1.25 * 1024 * 1024

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${Math.round(bytes)} B`
  return `${(bytes / 1024).toFixed(bytes < 100 * 1024 ? 1 : 0)} KB`
}

interface HomeworkHtmlAttachmentProps {
  attachment: LessonHomeworkHtmlAttachment
  compact?: boolean
}

export function HomeworkHtmlAttachmentButton({ attachment, compact = false }: HomeworkHtmlAttachmentProps) {
  const { lang } = useLanguageStore()
  const [open, setOpen] = useState(false)
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()

    fetch(attachment.fileURL, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP_${response.status}`)
        const declaredSize = Number(response.headers.get('content-length') || 0)
        if (declaredSize > MAX_VIEWER_RESPONSE_BYTES) throw new Error('HTML_RESPONSE_TOO_LARGE')
        const source = await response.text()
        if (new Blob([source]).size > MAX_VIEWER_RESPONSE_BYTES) throw new Error('HTML_RESPONSE_TOO_LARGE')
        return source
      })
      .then((source) => {
        if (!controller.signal.aborted) setHtml(source)
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return
        if (!controller.signal.aborted) setError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [attachment.fileURL, open, reloadKey])

  const sizeLabel = formatFileSize(attachment.sizeBytes)
  const buttonLabel = lang === 'vi' ? 'Mở bài tập tương tác' : 'Open interactive exercise'
  const openViewer = () => {
    setHtml('')
    setError(false)
    setLoading(true)
    setOpen(true)
  }
  const retry = () => {
    setHtml('')
    setError(false)
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  return (
    <>
      <button
        type="button"
        onClick={openViewer}
        className={`inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white font-bold text-sky-700 transition hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-300 active:scale-[0.98] ${compact ? 'px-3 py-2 text-xs' : 'w-full px-4 py-2.5 text-sm'}`}
      >
        <FileCode2 className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">{buttonLabel}</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="xl"
        title={lang === 'vi' ? 'Bài tập tương tác' : 'Interactive exercise'}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{attachment.fileName}</p>
              {sizeLabel && <p className="text-xs font-medium text-slate-500">{sizeLabel}</p>}
            </div>
            <a
              href={attachment.fileURL}
              download={attachment.fileName}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 flex-shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              <Download className="h-4 w-4" />
              {lang === 'vi' ? 'Tải file' : 'Download'}
            </a>
          </div>

          <div className="relative min-h-[58dvh] overflow-hidden rounded-xl border border-slate-200 bg-white sm:min-h-[68vh]">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50 px-6 text-center">
                <div>
                  <FileCode2 className="mx-auto h-9 w-9 text-sky-500" />
                  <p className="mt-3 text-sm font-bold text-slate-700">{lang === 'vi' ? 'Đang mở bài tập...' : 'Opening exercise...'}</p>
                </div>
              </div>
            )}
            {error && !loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50 px-6 text-center">
                <div className="max-w-sm">
                  <ExternalLink className="mx-auto h-9 w-9 text-amber-500" />
                  <p className="mt-3 text-sm font-bold text-slate-800">{lang === 'vi' ? 'Chưa thể mở bài tập' : 'Could not open the exercise'}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{lang === 'vi' ? 'Hãy kiểm tra kết nối mạng rồi thử lại. Bạn vẫn có thể tải file ở phía trên.' : 'Check your connection and try again. You can still download the file above.'}</p>
                  <button
                    type="button"
                    onClick={retry}
                    className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-bold text-white transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 active:scale-[0.98]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {lang === 'vi' ? 'Thử lại' : 'Try again'}
                  </button>
                </div>
              </div>
            )}
            {html && !loading && !error && (
              <iframe
                title={lang === 'vi' ? `Bài tập ${attachment.fileName}` : `Exercise ${attachment.fileName}`}
                srcDoc={html}
                sandbox="allow-scripts allow-forms allow-modals allow-downloads"
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full border-0 bg-white"
              />
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
