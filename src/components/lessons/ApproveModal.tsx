import { useState } from 'react'
import { runTransaction, doc, collection, serverTimestamp } from 'firebase/firestore'
import { db, calculateSalary } from '@/lib/firebase'
import { Lesson } from '@/types'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { formatVND } from '@/lib/constants'
import { useAuthStore } from '@/stores/authStore'

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
      await runTransaction(
        db,
        async (tx) => {
          const studentRef = doc(db, 'students', lesson.studentId)
          const lessonRef = doc(db, 'lessons', lesson.id)
          const studentSnap = await tx.get(studentRef)
          if (!studentSnap.exists()) throw new Error('Học viên không tồn tại')
          const student = studentSnap.data()

          const [teacherSnap, subjectSnap] = await Promise.all([
            tx.get(doc(db, 'teachers', lesson.teacherId)),
            tx.get(doc(db, 'subjects', student.subjectId)),
          ])

          const teacherData = teacherSnap.data()
          const teacherLevel = (lesson.teacherLevel ?? teacherData?.level ?? 1) || 1
          const pricePerMinute = subjectSnap.data()?.pricePerMinute ?? 0
          const subjectId = student.subjectId
          const subjectName = student.subjectName || subjectSnap.data()?.name || ''

          const salary = calculateSalary(lesson.minutes, pricePerMinute, teacherLevel)
          const month = lesson.date.slice(0, 7)

          const mps = student.minutesPerSession || 50
          const totalMinutes = student.totalMinutes ?? (student.totalSessions * mps)
          const prevUsedMinutes = student.usedMinutes ?? ((student.usedSessions || 0) * mps)
          const prevRemainingMinutes = student.remainingMinutes ?? (totalMinutes - prevUsedMinutes)
          const prevHeldMinutes = Number(student.reservedMinutes ?? student.heldMinutes ?? 0) || 0

          const newUsedMinutes = prevUsedMinutes + lesson.minutes
          const newRemainingMinutes = totalMinutes - newUsedMinutes
          const newHeldMinutes = Math.max(0, prevHeldMinutes - lesson.minutes)
          const newRemainingSessions = Math.floor(newRemainingMinutes / mps)
          const newUsedSessionsRaw = newUsedMinutes / mps
          const newUsedSessions =
            Math.abs(newUsedSessionsRaw - Math.round(newUsedSessionsRaw)) < 0.001
              ? Math.round(newUsedSessionsRaw)
              : Math.round(newUsedSessionsRaw * 100) / 100

          tx.update(lessonRef, {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: user?.uid,
            salary,
            teacherLevel,
            pricePerMinute,
            subjectId,
            subjectName,
            sessionsBeforeApproval: student.remainingSessions,
            sessionsAfterApproval: newRemainingSessions,
            minutesBeforeApproval: prevRemainingMinutes,
            minutesAfterApproval: newRemainingMinutes,
          })

          tx.update(studentRef, {
            usedMinutes: newUsedMinutes,
            remainingMinutes: newRemainingMinutes,
            totalMinutes,
            minutesPerSession: mps,
            usedSessions: newUsedSessions,
            remainingSessions: newRemainingSessions,
            reservedMinutes: newHeldMinutes,
            heldMinutes: newHeldMinutes,
            status: newRemainingMinutes <= 0 ? 'expired' : 'active',
            updatedAt: serverTimestamp(),
          })

          const publicLessonRef = doc(db, 'publicLessons', lesson.id)
          tx.set(publicLessonRef, {
            id: lesson.id,
            studentId: lesson.studentId,
            studentCode: lesson.studentCode,
            studentName: lesson.studentName,
            teacherId: lesson.teacherId,
            teacherCode: lesson.teacherCode,
            teacherName: lesson.teacherName,
            subjectId,
            subjectName,
            date: lesson.date,
            minutes: lesson.minutes,
            comment: lesson.comment || '',
            homework: lesson.homework || '',
            book: lesson.book || '',
            imageURLs: lesson.imageURLs || [],
            status: 'approved',
            createdAt: lesson.createdAt || serverTimestamp(),
            approvedAt: serverTimestamp(),
          })

          const payrollRef = doc(collection(db, 'payroll'))
          tx.set(payrollRef, {
            teacherId: lesson.teacherId,
            teacherName: lesson.teacherName,
            lessonId: lesson.id,
            amount: salary,
            minutes: lesson.minutes,
            pricePerMinute,
            level: teacherLevel,
            month,
            paid: false,
            createdAt: serverTimestamp(),
          })

          const logRef = doc(collection(db, 'adminLogs'))
          tx.set(logRef, {
            adminId: user?.uid || '',
            action: 'APPROVE_LESSON',
            targetType: 'lesson',
            targetId: lesson.id,
            changes: {
              status: { from: 'pending', to: 'approved' },
              salary,
              minutesDeducted: lesson.minutes,
              minutesBefore: prevRemainingMinutes,
              minutesAfter: newRemainingMinutes,
              heldMinutesBefore: prevHeldMinutes,
              heldMinutesAfter: newHeldMinutes,
            },
            createdAt: serverTimestamp(),
          })
        },
        { maxAttempts: 3 },
      )

      toast.success('Đã duyệt buổi dạy thành công')
      onClose()
    } catch (err: any) {
      console.error(err)
      const code = err?.code || ''
      if (code === 'resource-exhausted' || code === 'unavailable') {
        toast.error('Hệ thống đang bận, vui lòng thử lại sau ít giây')
      } else {
        toast.error('Duyệt thất bại, vui lòng thử lại')
      }
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
        {lesson.book && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 flex-shrink-0">Sách học</span>
            <span className="text-[#3BB8EB] font-bold truncate max-w-[150px]" title={lesson.book}>{lesson.book}</span>
          </div>
        )}
        <div className="border-t border-slate-200 pt-2 mt-2 space-y-1">
          {lesson.minutesBeforeApproval != null && (
            <div className="flex justify-between">
              <span className="text-slate-500">Phút còn lại</span>
              <span className="text-amber-400 font-medium">
                {lesson.minutesBeforeApproval} → {lesson.minutesBeforeApproval - lesson.minutes} phút
              </span>
            </div>
          )}
          {lesson.pricePerMinute != null && (
            <div className="flex justify-between">
              <span className="text-slate-500">Lương giáo viên</span>
               <span className="text-emerald-500 font-semibold">
                + {formatVND(calculateSalary(lesson.minutes, lesson.pricePerMinute, lesson.teacherLevel ?? 1))}
              </span>
            </div>
          )}
        </div>
      </div>
    </ConfirmDialog>
  )
}
