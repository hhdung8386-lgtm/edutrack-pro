import { useState } from 'react'
import { LockKeyhole, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { setTeacherAttendanceFeature, useTeacherAttendanceFeature } from '@/hooks/useTeacherAttendanceFeature'

/**
 * Công tắc khóa/mở trang Điểm danh ĐỘC LẬP của gia sư, đặt ngay trong trang Lương
 * gia sư để kế toán thao tác tại chỗ khi gia sư xin điểm danh bù.
 *
 * Mặc định là KHÓA — gia sư chấm công theo lịch timetable. Điểm danh từ Lịch dạy
 * KHÔNG bị ảnh hưởng bởi công tắc này, và không có dữ liệu buổi học nào bị đụng tới.
 *
 * Cùng đọc/ghi một chỗ với công tắc ở trang Cài đặt (`paymentSettings/main`), nên
 * bật ở đâu cũng có hiệu lực ngay ở nơi còn lại.
 */
export function TeacherAttendanceLockCard() {
  const { user, role } = useAuthStore()
  const { enabled, loading, error, retry } = useTeacherAttendanceFeature()
  const [saving, setSaving] = useState(false)
  const canEdit = role === 'admin'

  const toggle = async () => {
    if (saving || loading || error || !canEdit) return
    const next = !enabled
    // Mở khóa là hành động ngoại lệ (chỉ để gia sư điểm danh bù) nên hỏi lại cho chắc.
    if (next && !window.confirm(
      'Mở khóa trang Điểm danh cho gia sư?\n\n'
      + 'Khi mở, MỌI gia sư đều tự điểm danh được bằng mã học viên, không cần theo lịch timetable.\n'
      + 'Nhớ khóa lại ngay sau khi gia sư điểm danh bù xong.'
    )) return

    setSaving(true)
    try {
      await setTeacherAttendanceFeature(next, user?.email || user?.uid)
      toast.success(next
        ? 'Đã MỞ trang Điểm danh cho gia sư — nhớ khóa lại sau khi điểm danh bù xong'
        : 'Đã KHÓA trang Điểm danh — gia sư chỉ chấm công theo lịch timetable')
    } catch (err) {
      console.error('Unable to update teacher attendance setting:', err)
      toast.error('Không cập nhật được trạng thái trang Điểm danh')
    } finally {
      setSaving(false)
    }
  }

  const statusLabel = error
    ? 'Lỗi kết nối'
    : loading
      ? 'Đang tải...'
      : saving
        ? 'Đang lưu...'
        : enabled ? 'Đang mở' : 'Đang khóa'

  return (
    <div className={`rounded-2xl border p-4 ${
      enabled ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
    }`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
            enabled ? 'bg-amber-100 text-amber-700 ring-amber-300' : 'bg-slate-100 text-slate-600 ring-slate-200'
          }`}>
            {enabled ? <ShieldCheck className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Quyền chấm công của gia sư</p>
            <h3 className="mt-0.5 text-base font-black text-slate-900">Trang Điểm danh độc lập</h3>
            <p className="mt-1.5 max-w-xl text-xs leading-5 text-slate-600">
              {enabled
                ? 'ĐANG MỞ — gia sư tự điểm danh được bằng mã học viên. Chỉ nên mở khi có gia sư xin điểm danh bù, xong thì khóa lại.'
                : 'ĐANG KHÓA — gia sư chỉ chấm công theo lịch timetable (trang Lịch dạy). Khi gia sư báo cần điểm danh bù thì mở khóa tại đây.'}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-slate-400">
              Không ảnh hưởng điểm danh từ Lịch dạy và không đụng tới buổi học đã ghi nhận.
            </p>
          </div>
        </div>

        {canEdit ? (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Khóa hoặc mở trang Điểm danh độc lập của gia sư"
            disabled={loading || saving || error}
            onClick={toggle}
            className={`relative inline-flex h-11 w-full shrink-0 items-center rounded-xl px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-wait disabled:opacity-60 sm:w-44 ${
              enabled ? 'bg-amber-600' : 'bg-slate-800'
            }`}
          >
            <span className={`absolute h-7 w-7 rounded-lg bg-white shadow-sm transition-all ${
              enabled ? 'right-2' : 'left-2'
            }`} />
            <span className={`relative z-10 w-full text-center text-sm font-black text-white ${
              enabled ? 'pr-8' : 'pl-8'
            }`}>
              {statusLabel}
            </span>
          </button>
        ) : (
          <span className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl px-3 py-2 text-xs font-black ${
            enabled ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
          }`}>
            {enabled ? <ShieldCheck className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
            {statusLabel} · chỉ admin đổi được
          </span>
        )}
      </div>

      {error && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs font-bold text-amber-900">Chưa đọc được trạng thái từ máy chủ — đang tạm coi là khóa.</p>
          <Button size="sm" variant="outline" onClick={retry}>Thử lại</Button>
        </div>
      )}
    </div>
  )
}
