import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, CircleAlert, History, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useLanguageStore } from '@/stores/languageStore'
import { useTeacherAttendanceFeature } from '@/hooks/useTeacherAttendanceFeature'

interface TeacherAttendanceGateProps {
  children: ReactNode
}

export function TeacherAttendanceGate({ children }: TeacherAttendanceGateProps) {
  const navigate = useNavigate()
  const { lang } = useLanguageStore()
  const { enabled, loading, error, retry } = useTeacherAttendanceFeature()

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <section className="mx-auto max-w-3xl pt-2 lg:pt-8" aria-labelledby="attendance-setting-error-title">
        <div className="rounded-3xl border border-amber-200 bg-white px-5 py-10 text-center shadow-sm sm:px-10">
          <CircleAlert className="mx-auto h-10 w-10 text-amber-600" />
          <h1 id="attendance-setting-error-title" className="mt-4 text-xl font-black text-slate-950">
            {lang === 'vi' ? 'Chưa tải được cài đặt Điểm danh' : 'Unable to load attendance settings'}
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            {lang === 'vi'
              ? 'Kết nối dữ liệu đang gián đoạn. Hệ thống chưa kết luận trang đang mở hay bị khóa; vui lòng thử lại.'
              : 'The data connection was interrupted. The page state could not be verified; please try again.'}
          </p>
          <Button className="mt-5" onClick={retry}>
            {lang === 'vi' ? 'Thử tải lại' : 'Try again'}
          </Button>
        </div>
      </section>
    )
  }

  if (enabled) return <>{children}</>

  return (
    <section className="mx-auto max-w-3xl pt-2 lg:pt-8" aria-labelledby="attendance-locked-title">
      <div className="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
        <div className="h-2 bg-amber-400" />
        <div className="px-5 py-8 text-center sm:px-10 sm:py-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <LockKeyhole className="h-8 w-8" />
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            {lang === 'vi' ? 'Cài đặt hệ thống' : 'System setting'}
          </p>
          <h1 id="attendance-locked-title" className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            {lang === 'vi' ? 'Trang Điểm danh đang tạm khóa' : 'Attendance page is temporarily locked'}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
            {lang === 'vi'
              ? 'Admin chỉ tạm khóa trang Điểm danh riêng. Gia sư vẫn điểm danh bình thường từ Lịch dạy; lịch sử và toàn bộ dữ liệu đã có được giữ nguyên.'
              : 'Only the standalone attendance page is paused. Teachers can still submit attendance from Class schedules; all existing data remains unchanged.'}
          </p>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={() => navigate('/teacher/schedules')} className="justify-center bg-amber-400 text-slate-950 hover:bg-amber-500">
              <CalendarClock className="h-4 w-4" />
              {lang === 'vi' ? 'Xem lịch dạy' : 'View classes'}
            </Button>
            <Button variant="outline" onClick={() => navigate('/teacher/history')} className="justify-center">
              <History className="h-4 w-4" />
              {lang === 'vi' ? 'Xem lịch sử buổi học' : 'View lesson history'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
