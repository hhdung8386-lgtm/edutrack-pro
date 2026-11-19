import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

const CHECK_INTERVAL_MS = 5 * 60 * 1000
const MIN_GAP_MS = 60 * 1000
const SNOOZE_MS = 15 * 60 * 1000

async function fetchLatestBuildId(): Promise<string | null> {
  try {
    const response = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return null
    const data: unknown = await response.json()
    const buildId = data && typeof data === 'object' && 'buildId' in data ? (data as { buildId: unknown }).buildId : null
    return typeof buildId === 'string' && buildId ? buildId : null
  } catch {
    return null // mất mạng / đang deploy: thử lại lần sau, không làm phiền người dùng
  }
}

/**
 * Tab mở cả ngày vẫn chạy bản cũ nên chức năng mới (vd tự điền SALE) không có tác dụng.
 * Khi máy chủ đã có bản mới thì hiện thanh nhắc tải lại; không tự tải lại để khỏi mất
 * nội dung giáo vụ đang nhập.
 */
export function AppUpdateBanner() {
  const [latestBuildId, setLatestBuildId] = useState<string | null>(null)
  const [snoozedUntil, setSnoozedUntil] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const lastCheckRef = useRef(0)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    let cancelled = false
    const check = async (force = false) => {
      const now = Date.now()
      if (!force && now - lastCheckRef.current < MIN_GAP_MS) return
      lastCheckRef.current = now
      const buildId = await fetchLatestBuildId()
      if (cancelled) return
      setNowMs(Date.now())
      if (buildId && buildId !== __APP_BUILD_ID__) setLatestBuildId(buildId)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    const timer = window.setInterval(() => void check(true), CHECK_INTERVAL_MS)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    void check(true)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!latestBuildId || nowMs < snoozedUntil) return null

  return (
    <div role="status" className="fixed inset-x-3 bottom-3 z-[1000] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-2xl sm:inset-x-auto sm:right-4">
      <RefreshCw className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-5">
        <strong className="block text-slate-950">Hệ thống vừa có bản cập nhật mới</strong>
        Tải lại trang để dùng đúng chức năng mới nhất. Lưu nội dung đang nhập trước khi tải lại.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-10 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          Tải lại
        </button>
        <button
          type="button"
          onClick={() => { const until = Date.now() + SNOOZE_MS; setSnoozedUntil(until); setNowMs(Date.now()) }}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
          aria-label="Nhắc lại sau 15 phút"
          title="Nhắc lại sau 15 phút"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
