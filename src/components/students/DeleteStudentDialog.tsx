import { useState, type FormEvent } from 'react'
import { ShieldAlert } from 'lucide-react'
import type { Student } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface DeleteStudentDialogProps {
  student: Student
  loading: boolean
  onClose: () => void
  onConfirm: (password: string) => Promise<void>
}

export function DeleteStudentDialog({ student, loading, onClose, onConfirm }: DeleteStudentDialogProps) {
  const [password, setPassword] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!password || loading) return
    await onConfirm(password)
  }

  return (
    <Modal
      open
      onClose={loading ? () => undefined : onClose}
      size="sm"
      title="Xóa học viên có bảo vệ"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Hủy</Button>
          <Button form="delete-student-form" type="submit" variant="danger" loading={loading} disabled={!password}>
            Xóa học viên
          </Button>
        </div>
      }
    >
      <form id="delete-student-form" onSubmit={submit} className="space-y-4">
        <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Hệ thống sẽ sao lưu đầy đủ hồ sơ trước khi xóa và nhả các lịch đang giữ chỗ.
            Lịch sử buổi đã duyệt vẫn được giữ nguyên.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Học viên</p>
          <p className="mt-1 font-bold text-slate-900">{student.name}</p>
          <p className="mt-0.5 font-mono text-xs text-indigo-700">{student.code}</p>
        </div>
        <Input
          autoFocus
          label="Mật khẩu xóa học viên *"
          type="password"
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Nhập mật khẩu bảo vệ"
          disabled={loading}
        />
        <p className="text-xs leading-5 text-slate-500">Mật khẩu chỉ được kiểm tra trên máy chủ và không được lưu trong trình duyệt.</p>
      </form>
    </Modal>
  )
}
