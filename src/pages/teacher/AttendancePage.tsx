import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/languageStore'
import { AlertTriangle } from 'lucide-react'

export function AttendancePage() {
  const navigate = useNavigate()
  const { t } = useLanguageStore()

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center animate-fade-in">
      <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-xl font-bold text-slate-900">Tính năng điểm danh tự do đã bị khóa</h2>
        <p className="text-slate-500 text-sm leading-relaxed">
          Hiện tại, giáo viên bắt buộc phải điểm danh thông qua <strong>Lịch dạy (Timetable)</strong> bằng cách bấm trực tiếp vào buổi học/ca dạy tương ứng để tránh sai lệch thông tin lớp học.
        </p>
      </div>
      <Button variant="primary" onClick={() => navigate('/teacher/schedules')} className="rounded-xl font-bold px-6 shadow-md shadow-sky-200/50">
        Đi tới trang Lịch dạy (Timetable)
      </Button>
    </div>
  )
}
