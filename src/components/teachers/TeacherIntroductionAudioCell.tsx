import { useRef } from 'react'
import { Loader2, Music2, Upload } from 'lucide-react'
import type { AudioState } from '@/lib/useTeacherIntroductionAudios'
import { toast } from '@/stores/toastStore'

export function TeacherIntroductionAudioCell({ teacherId, teacherName, state, onUpload, onRetry }: {
  teacherId: string
  teacherName: string
  state?: AudioState
  onUpload: (id: string, file: File) => Promise<void>
  onRetry: (id: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const busy = !state || state.status === 'loading' || state.status === 'uploading'

  return (
    <div className="flex w-[220px] max-w-full flex-col items-start gap-2" onClick={event => event.stopPropagation()}>
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${state?.status === 'error' ? 'text-rose-600' : state?.url ? 'text-emerald-700' : 'text-slate-500'}`} role="status">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Music2 className="h-3.5 w-3.5" />}
        {!state || state.status === 'loading' ? 'Đang kiểm tra...' : state.status === 'uploading' ? 'Đang tải MP3...' : state.status === 'error' ? 'Chưa xác minh được ghi âm' : state.url ? 'Đã có ghi âm' : 'Chưa có ghi âm'}
      </span>
      {state?.url && !busy && (
        <audio key={state.url} controls preload="none" src={state.url} className="h-9 w-full" aria-label={`Ghi âm giới thiệu của ${teacherName}`} onPlay={event => {
          const current = event.currentTarget
          document.querySelectorAll('audio').forEach(audio => { if (audio !== current) audio.pause() })
        }} onError={() => toast.error('Không phát được MP3. Hãy thử kiểm tra lại ghi âm.')} />
      )}
      <input ref={input} type="file" accept=".mp3,audio/mpeg" className="hidden" aria-label={`Chọn MP3 giới thiệu cho ${teacherName}`} disabled={busy} onChange={event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void onUpload(teacherId, file)
      }} />
      {state?.status === 'error' && (
        <button type="button" onClick={() => onRetry(teacherId)} className="min-h-9 text-xs font-semibold text-sky-700 hover:underline">Kiểm tra lại</button>
      )}
      <button type="button" disabled={busy} onClick={() => input.current?.click()} aria-label={`${state?.url ? 'Thay' : 'Thêm'} MP3 giới thiệu cho ${teacherName}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-violet-500 disabled:cursor-wait disabled:opacity-50">
        <Upload className="h-3.5 w-3.5" />{state?.url ? 'Thay MP3' : 'Thêm MP3'}
      </button>
      <span className="text-[10px] text-slate-400">MP3 dưới 5 MB · Lưu ngay khi chọn</span>
    </div>
  )
}
