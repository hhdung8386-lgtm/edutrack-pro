import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { updateDoc, doc, serverTimestamp, addDoc, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'

const schema = z.object({
  sessions: z.coerce.number().min(1, 'Tối thiểu 1 buổi'),
  reason: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function AddSessionsModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const { user } = useAuthStore()
  const { register, watch, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { sessions: 5 },
  })

  const sessionsToAdd = watch('sessions') || 0

  const onSubmit = async (data: FormData) => {
    try {
      const newTotal = student.totalSessions + data.sessions
      const newRemaining = student.remainingSessions + data.sessions

      await updateDoc(doc(db, 'students', student.id), {
        totalSessions: newTotal,
        remainingSessions: newRemaining,
        status: newRemaining > 0 ? 'active' : student.status,
        updatedAt: serverTimestamp(),
      })

      await addDoc(collection(db, 'adminLogs'), {
        adminId: user?.uid || '',
        action: 'ADD_SESSIONS',
        targetType: 'student',
        targetId: student.id,
        changes: {
          sessionsAdded: data.sessions,
          reason: data.reason || '',
          totalBefore: student.totalSessions,
          totalAfter: newTotal,
          remainingBefore: student.remainingSessions,
          remainingAfter: newRemaining,
        },
        createdAt: serverTimestamp(),
      })

      toast.success(`Đã cấp thêm ${data.sessions} buổi cho ${student.name}`)
      onClose()
    } catch (err) {
      toast.error('Có lỗi xảy ra')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Cấp thêm buổi học"
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button form="add-sessions-form" type="submit" loading={isSubmitting}>Xác nhận</Button>
        </div>
      }
    >
      <form id="add-sessions-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
        <div className="bg-slate-800 rounded-xl p-4 text-sm">
          <p className="text-slate-400 mb-1">Học viên</p>
          <p className="font-semibold text-slate-100">{student.name}</p>
          <p className="text-xs text-indigo-400 font-mono mt-0.5">{student.code}</p>
        </div>

        <Input
          label="Số buổi thêm *"
          type="number"
          min={1}
          error={errors.sessions?.message}
          {...register('sessions')}
        />

        <Textarea
          label="Lý do (tùy chọn)"
          placeholder="Vd: Gia hạn khoá học tháng 5"
          rows={2}
          {...register('reason')}
        />

        {/* Preview */}
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Hiện tại</span>
            <span className="text-slate-200 font-medium">{student.remainingSessions} buổi</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Thêm</span>
            <span className="text-emerald-400 font-medium">+ {sessionsToAdd} buổi</span>
          </div>
          <div className="flex justify-between border-t border-slate-700 pt-1 mt-1">
            <span className="text-slate-300 font-medium">Tổng sau khi thêm</span>
            <span className="text-indigo-400 font-bold">{student.remainingSessions + Number(sessionsToAdd)} buổi</span>
          </div>
        </div>
      </form>
    </Modal>
  )
}
