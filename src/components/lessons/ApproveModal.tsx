import { useState } from 'react'
import { runTransaction, doc, collection, serverTimestamp, Timestamp, addDoc } from 'firebase/firestore'
import { db, calculateSalary } from '@/lib/firebase'
import { Lesson } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { formatVND } from '@/lib/constants'
import { useAuthStore } from '@/stores/authStore'
import { format } from 'date-fns'

interface ApproveModalProps {
  lesson: Lesson
  onClose: () => void
}

export function ApproveModal({ lesson, onClose }: ApproveModalProps) {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)

  const handleApprove = async () => {
    setLoading(true)
    try {
      await runTransaction(db, async (transaction) => {
        const studentRef = doc(db, 'students', lesson.studentId)
        const lessonRef = doc(db, 'lessons', lesson.id)
        const studentSnap = await transaction.get(studentRef)

        if (!studentSnap.exists()) throw new Error('Học viên không tồn tại')

        const student = studentSnap.data()
        const remaining = student.remainingSessions - 1

        // Get teacher info for salary
        const teacherSnap = await transaction.get(doc(db, 'teachers', lesson.teacherId))
        const teacher = teacherSnap.data()
        const subjectSnap = await transaction.get(doc(db, 'subjects', lesson.subjectId))
        const subject = subjectSnap.data()

        const salary = calculateSalary(lesson.minutes, subject?.pricePerMinute || 0, teacher?.level || 1)
        const month = lesson.date.slice(0, 7)

        // Update lesson
        transaction.update(lessonRef, {
          status: 'approved',
          approvedAt: serverTimestamp(),
          approvedBy: user?.uid,
          salary,
          sessionsBeforeApproval: student.remainingSessions,
          sessionsAfterApproval: remaining,
        })

        // Update student
        transaction.update(studentRef, {
          remainingSessions: remaining,
          usedSessions: (student.usedSessions || 0) + 1,
          status: remaining <= 0 ? 'expired' : 'active',
          updatedAt: serverTimestamp(),
        })

        // Create payroll doc
        const payrollRef = doc(collection(db, 'payroll'))
        transaction.set(payrollRef, {
          teacherId: lesson.teacherId,
          teacherName: lesson.teacherName,
          lessonId: lesson.id,
          amount: salary,
          minutes: lesson.minutes,
          pricePerMinute: subject?.pricePerMinute || 0,
          level: teacher?.level || 1,
          month,
          paid: false,
          createdAt: serverTimestamp(),
        })

        // Log action
        const logRef = doc(collection(db, 'adminLogs'))
        transaction.set(logRef, {
          adminId: user?.uid || '',
          action: 'APPROVE_LESSON',
          targetType: 'lesson',
          targetId: lesson.id,
          changes: { status: { from: 'pending', to: 'approved' }, salary },
          createdAt: serverTimestamp(),
        })
      })

      toast.success('Đã duyệt buổi dạy thành công')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Duyệt thất bại, vui lòng thử lại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={handleApprove}
      title="Xác nhận duyệt buổi dạy"
      confirmLabel="Duyệt buổi dạy"
      loading={loading}
    >
      <div className="bg-white rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Học viên</span>
          <span className="text-slate-700 font-medium">{lesson.studentName} ({lesson.studentCode})</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Giáo viên</span>
          <span className="text-slate-700">{lesson.teacherName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Ngày</span>
          <span className="text-slate-700">{lesson.date}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Thời lượng</span>
          <span className="text-slate-700">{lesson.minutes} phút</span>
        </div>
        <div className="border-t border-slate-200 pt-2 mt-2">
          <div className="flex justify-between">
            <span className="text-slate-500">Buổi còn lại</span>
            <span className="text-amber-400 font-medium">
              {lesson.sessionsBeforeApproval || '?'} → {(lesson.sessionsBeforeApproval || 1) - 1} buổi
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-slate-500">Lương giáo viên</span>
            <span className="text-emerald-400 font-semibold">+ {formatVND(lesson.salary || 0)}</span>
          </div>
        </div>
      </div>
    </ConfirmDialog>
  )
}
