import { useState, type FormEvent } from 'react'
import { ShieldAlert } from 'lucide-react'
import type { Teacher } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface DeleteTeacherDialogProps {
  teacher: Teacher
  loading: boolean
  onClose: () => void
  onConfirm: (password: string) => Promise<void>
}

export function DeleteTeacherDialog({ teacher, loading, onClose, onConfirm }: DeleteTeacherDialogProps) {
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
      title="Xóa gia sư có bảo vệ"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Hủy</Button>
          <Button form="delete-teacher-form" type="submit" variant="danger" loading={loading} disabled={!password}>
            Xóa gia sư
          </Button>
        </div>
      }
    >
      <form id="delete-teacher-form" onSubmit={submit} className="space-y-4">
        <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Hệ thống sẽ sao lưu đầy đủ hồ sơ gia sư trước khi xóa (có thể khôi phục khi cần).
            Lịch sử buổi dạy, lương và lịch học đã ghi nhận vẫn được giữ nguyên.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gia sư</p>
          <p className="mt-1 font-bold text-slate-900">{teacher.name}</p>
          <p className="mt-0.5 font-mono text-xs text-indigo-700">{teacher.code || teacher.email || '—'}</p>
        </div>
        <Input
          autoFocus
          label="Mật khẩu bảo vệ của quản lý *"
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
