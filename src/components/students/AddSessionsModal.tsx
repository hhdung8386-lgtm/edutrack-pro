import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { updateDoc, doc, serverTimestamp, addDoc, collection, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student, StudentSubject } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'

const schema = z.object({
  subjectId: z.string().min(1, 'Chọn môn học'),
  sessions: z.coerce.number().min(1, 'Tối thiểu 1 buổi'),
  reason: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function AddSessionsModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const { user } = useAuthStore()

  // Initialize student subjects array for backward compatibility
  const studentSubjects = student.subjects && student.subjects.length > 0
    ? student.subjects
    : student.subjectId
      ? [{
          subjectId: student.subjectId,
          subjectName: student.subjectName || 'Chưa rõ',
          totalSessions: student.totalSessions || 0,
          usedSessions: student.usedSessions || 0,
          remainingSessions: student.remainingSessions || 0,
          minutesPerSession: student.minutesPerSession || 50,
          totalMinutes: student.totalMinutes ?? (student.totalSessions * (student.minutesPerSession || 50)),
          usedMinutes: student.usedMinutes ?? ((student.usedSessions || 0) * (student.minutesPerSession || 50)),
          remainingMinutes: student.remainingMinutes ?? ((student.remainingSessions || 0) * (student.minutesPerSession || 50)),
          pricePerMinute: 0,
        } as StudentSubject]
      : []

  const { register, watch, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      subjectId: studentSubjects[0]?.subjectId || '',
      sessions: 5,
      reason: '',
    },
  })

  const selectedSubjectId = watch('subjectId')
  const selectedPkg = studentSubjects.find(s => s.subjectId === selectedSubjectId)
  const sessionsToAdd = watch('sessions') || 0
  const minutesPerSession = selectedPkg?.minutesPerSession || student.minutesPerSession || 50
  const currentRemainingSessions = selectedPkg?.remainingSessions || student.remainingSessions || 0
  const newTotalMinutes = minutesPerSession ? (currentRemainingSessions + Number(sessionsToAdd)) * minutesPerSession : null

  const onSubmit = async (data: FormData) => {
    try {
      let updatedSubjects = student.subjects && student.subjects.length > 0
        ? [...student.subjects]
        : student.subjectId
          ? [{
              subjectId: student.subjectId,
              subjectName: student.subjectName || 'Chưa rõ',
              totalSessions: student.totalSessions || 0,
              usedSessions: student.usedSessions || 0,
              remainingSessions: student.remainingSessions || 0,
              minutesPerSession: student.minutesPerSession || 50,
              totalMinutes: student.totalMinutes ?? (student.totalSessions * (student.minutesPerSession || 50)),
              usedMinutes: student.usedMinutes ?? ((student.usedSessions || 0) * (student.minutesPerSession || 50)),
              remainingMinutes: student.remainingMinutes ?? ((student.remainingSessions || 0) * (student.minutesPerSession || 50)),
              pricePerMinute: 0,
            }]
          : []

      const sIdx = updatedSubjects.findIndex(s => s.subjectId === data.subjectId)
      if (sIdx === -1) {
        toast.error('Gói môn học không hợp lệ')
        return
      }

      const prevPkg = updatedSubjects[sIdx]
      const addedMinutes = data.sessions * prevPkg.minutesPerSession
      const newTotalSessions = prevPkg.totalSessions + data.sessions
      const newRemainingSessions = prevPkg.remainingSessions + data.sessions
      const newTotalMinutes = prevPkg.totalMinutes + addedMinutes
      const newRemainingMinutes = prevPkg.remainingMinutes + addedMinutes

      // If pricePerMinute is 0, we can fetch it from the global subjects table
      let rate = prevPkg.pricePerMinute || 0
      if (rate === 0) {
        const globalSubjSnap = await getDoc(doc(db, 'subjects', prevPkg.subjectId))
        if (globalSubjSnap.exists()) {
          rate = globalSubjSnap.data().pricePerMinute || 0
        }
      }

      const today = new Date()
      const dateString = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
      const studentCreatedAtString = student.createdAt
        ? new Date((student.createdAt as any).seconds * 1000).toLocaleDateString('vi-VN')
        : dateString

      const currentBatches = prevPkg.batches && prevPkg.batches.length > 0
        ? prevPkg.batches
        : [{
            id: '1',
            createdAt: studentCreatedAtString,
            totalSessions: prevPkg.totalSessions
          }]

      const updatedBatches = [
        ...currentBatches,
        {
          id: String(currentBatches.length + 1),
          createdAt: dateString,
          totalSessions: data.sessions
        }
      ]

      updatedSubjects[sIdx] = {
        ...prevPkg,
        totalSessions: newTotalSessions,
        remainingSessions: newRemainingSessions,
        totalMinutes: newTotalMinutes,
        remainingMinutes: newRemainingMinutes,
        pricePerMinute: rate,
        batches: updatedBatches,
      }

      // Recalculate aggregates
      const aggTotalSessions = updatedSubjects.reduce((sum, s) => sum + s.totalSessions, 0)
      const aggUsedSessions = updatedSubjects.reduce((sum, s) => sum + s.usedSessions, 0)
      const aggRemainingSessions = updatedSubjects.reduce((sum, s) => sum + s.remainingSessions, 0)
      const aggTotalMinutes = updatedSubjects.reduce((sum, s) => sum + s.totalMinutes, 0)
      const aggUsedMinutes = updatedSubjects.reduce((sum, s) => sum + s.usedMinutes, 0)
      const aggRemainingMinutes = updatedSubjects.reduce((sum, s) => sum + s.remainingMinutes, 0)

      const primarySubject = updatedSubjects[0] || null

      await updateDoc(doc(db, 'students', student.id), {
        subjects: updatedSubjects,
        totalSessions: aggTotalSessions,
        usedSessions: aggUsedSessions,
        remainingSessions: aggRemainingSessions,
        totalMinutes: aggTotalMinutes,
        usedMinutes: aggUsedMinutes,
        remainingMinutes: aggRemainingMinutes,
        // Legacy aggregates
        subjectId: primarySubject ? primarySubject.subjectId : '',
        subjectName: primarySubject ? primarySubject.subjectName : '',
        minutesPerSession: primarySubject ? primarySubject.minutesPerSession : 50,
        status: aggRemainingMinutes > 0 ? 'active' : student.status,
        updatedAt: serverTimestamp(),
      })

      await addDoc(collection(db, 'adminLogs'), {
        adminId: user?.uid || '',
        action: 'ADD_SESSIONS',
        targetType: 'student',
        targetId: student.id,
        changes: {
          subjectId: prevPkg.subjectId,
          subjectName: prevPkg.subjectName,
          sessionsAdded: data.sessions,
          minutesAdded: addedMinutes,
          reason: data.reason || '',
          totalBefore: prevPkg.totalSessions,
          totalAfter: newTotalSessions,
          remainingBefore: prevPkg.remainingSessions,
          remainingAfter: newRemainingSessions,
        },
        createdAt: serverTimestamp(),
      })

      toast.success(`Đã cấp thêm ${data.sessions} buổi (${addedMinutes} phút) môn ${prevPkg.subjectName} cho ${student.name}`)
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Có lỗi xảy ra khi cấp buổi')
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
        <div className="bg-white rounded-xl p-4 text-sm">
          <p className="text-slate-500 mb-1">Học viên</p>
          <p className="font-semibold text-slate-900">{student.name}</p>
          <p className="text-xs text-indigo-400 font-mono mt-0.5">{student.code}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Chọn môn học cấp thêm *</label>
          <select
            className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-4 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            {...register('subjectId')}
          >
            {studentSubjects.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.subjectName} ({s.remainingSessions} buổi còn lại)
              </option>
            ))}
          </select>
          {errors.subjectId && <p className="mt-1.5 text-xs text-rose-400">{errors.subjectId.message}</p>}
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
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Môn học đã chọn</span>
            <span className="text-slate-700 font-semibold">{selectedPkg?.subjectName || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Hiện tại</span>
            <span className="text-slate-700 font-medium">{currentRemainingSessions} buổi</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Thêm</span>
            <span className="text-emerald-500 font-medium font-bold">+ {sessionsToAdd} buổi</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
            <span className="text-slate-600 font-medium">Tổng sau khi thêm</span>
            <span className="text-indigo-600 font-bold">{currentRemainingSessions + Number(sessionsToAdd)} buổi</span>
          </div>
          {minutesPerSession ? (
            <div className="mt-3 rounded-lg bg-white/70 border border-indigo-200 p-3 text-sm">
              <div className="text-slate-500 mb-1">Quỹ phút theo phút/buổi</div>
              <div className="flex flex-wrap items-center gap-2 text-slate-700">
                <span className="font-semibold">{currentRemainingSessions + Number(sessionsToAdd)} buổi</span>
                <span>×</span>
                <span className="font-semibold">{minutesPerSession} phút</span>
                <span>=</span>
                <span className="font-semibold text-indigo-700">{newTotalMinutes} phút</span>
              </div>
            </div>
          ) : null}
        </div>
      </form>
    </Modal>
  )
}
