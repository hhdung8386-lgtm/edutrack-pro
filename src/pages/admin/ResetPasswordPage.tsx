import { useEffect, useState } from 'react'
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Teacher } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSpinner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { recoverTeacherLoginAccount } from '@/lib/teacherLoginRecovery'
import { useAuthStore } from '@/stores/authStore'
import { GraduationCap, Search, RefreshCw, AlertCircle } from 'lucide-react'

export function ResetPasswordPage() {
  const role = useAuthStore((state) => state.role)
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [resetTeacher, setResetTeacher] = useState<Teacher | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetAll, setResetAll] = useState(false)
  const [resettingAll, setResettingAll] = useState(false)
  const [resetCount, setResetCount] = useState(0)

  useEffect(() => {
    if (role !== 'admin') return
    const q = query(collection(db, 'teachers'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Teacher)))
      setLoading(false)
    })
  }, [role])

  if (role !== 'admin') {
    return (
      <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <h1 className="text-lg font-bold text-slate-900">Chỉ Admin hệ thống được khôi phục mật khẩu</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Quản lý học viên và quản lý gia sư không có quyền thay đổi thông tin xác thực của tài khoản khác.
        </p>
      </div>
    )
  }

  const filtered = teachers.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.code.toLowerCase().includes(search.toLowerCase())
  )

  const handleReset = async () => {
    if (!resetTeacher) return
    setResetting(true)
    try {
      await recoverTeacherLoginAccount(resetTeacher.id)
      toast.success(`Đã khôi phục đăng nhập cho gia sư ${resetTeacher.name}`)
      setResetTeacher(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message.replace(/^FirebaseError:\s*/i, '') : ''
      toast.error(message || 'Không thể khôi phục đăng nhập cho gia sư này')
    } finally {
      setResetting(false)
    }
  }

  const handleResetAll = async () => {
    setResettingAll(true)
    setResetCount(0)
    let successCount = 0
    let errorCount = 0

    for (const teacher of teachers) {
      try {
        await recoverTeacherLoginAccount(teacher.id)
        successCount++
        setResetCount(successCount + errorCount)
      } catch (err) {
        errorCount++
        setResetCount(successCount + errorCount)
        console.error(`Failed to reset ${teacher.name}:`, err)
      }
    }

    setResettingAll(false)
    toast.success(`Đã khôi phục đăng nhập cho ${successCount}/${teachers.length} gia sư`)
    if (errorCount > 0) {
      toast.error(`${errorCount} gia sư khôi phục thất bại`)
    }
    setResetAll(false)
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reset Mật khẩu Gia sư</h1>
          <p className="text-sm text-slate-500 mt-0.5">Khôi phục tài khoản legacy và đồng bộ UID đăng nhập chuẩn của gia sư</p>
        </div>
        <Button
          onClick={() => setResetAll(true)}
          variant="primary"
          className="bg-amber-600 hover:bg-amber-700"
        >
          <RefreshCw className="w-4 h-4" />
          Reset Tất cả
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-700">
          <p className="font-semibold mb-1">Mục đích của trang này:</p>
          <p>Đây là luồng tương thích tài khoản cũ. Mỗi lần khôi phục sẽ thu hồi phiên đăng nhập trước đó và liên kết lại đúng tài khoản gia sư. Không cần tạo thêm mật khẩu pilot.</p>
        </div>
      </div>

      <Input
        placeholder="Tìm theo tên hoặc mã gia sư..."
        leftIcon={<Search className="w-4 h-4" />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {loading ? (
        <Card padding="none"><TableSkeleton /></Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="w-8 h-8" />}
          title="Không tìm thấy gia sư"
        />
      ) : (
        <Card padding="none" className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  {['Mã', 'Tên gia sư', 'Môn dạy', 'Level', 'Hành động'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filtered.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-slate-100/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                        {teacher.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {teacher.photoURL ? (
                          <img src={teacher.photoURL} alt={teacher.name} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
                            {teacher.name[0]}
                          </div>
                        )}
                        <span className="font-medium text-slate-700">{teacher.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {(teacher.subjectNames || []).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-600 font-medium">×{teacher.level}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setResetTeacher(teacher)}
                        className="px-3 py-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Confirm dialog for single reset */}
      <ConfirmDialog
        open={!!resetTeacher}
        onClose={() => setResetTeacher(null)}
        onConfirm={handleReset}
        title="Reset mật khẩu"
        description={`Thiết lập lại mật khẩu cho gia sư ${resetTeacher?.name}?`}
        consequence={`Mật khẩu sẽ được thiết lập thành: 1234560`}
        confirmLabel="Reset"
        confirmVariant="primary"
        loading={resetting}
      />

      {/* Confirm dialog for reset all */}
      <ConfirmDialog
        open={resetAll}
        onClose={() => setResetAll(false)}
        onConfirm={handleResetAll}
        title="Reset mật khẩu tất cả gia sư"
        description={`Thiết lập lại mật khẩu cho tất cả ${teachers.length} gia sư?`}
        consequence={`Tất cả gia sư sẽ có mật khẩu: 1234560. Hành động này sẽ mất một chút thời gian...`}
        confirmLabel="Reset Tất cả"
        confirmVariant="primary"
        loading={resettingAll}
      >
        {resettingAll && (
          <div className="mt-4 bg-slate-100 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-700">Đang xử lý: {resetCount}/{teachers.length}</p>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-indigo-500 h-full transition-all"
                style={{ width: `${(resetCount / teachers.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}
