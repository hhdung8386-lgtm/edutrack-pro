import { useMemo, useState } from 'react'
import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { CalendarDays, Gift, ReceiptText } from 'lucide-react'
import { db } from '@/lib/firebase'
import type { BookingRequest, Student } from '@/types'
import { getBookingPoints } from '@/lib/points'
import { deleteCourseEntry, getBatchDiamonds, getBatchLearningMinutes, getCourseEntry, getStudentSubjects } from '@/lib/studentCourseLedger'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DiamondPointsIcon } from '@/components/shared/DiamondPointsIcon'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'

interface DeleteCourseEntryDialogProps {
  student: Student
  subjectId: string
  batchId: string
  onClose: () => void
}

function studentCreatedAtLabel(student: Student) {
  const createdAt = student.createdAt as Student['createdAt'] | undefined
  if (createdAt?.toDate) return createdAt.toDate().toLocaleDateString('vi-VN')
  return new Date().toLocaleDateString('vi-VN')
}

export function DeleteCourseEntryDialog({ student, subjectId, batchId, onClose }: DeleteCourseEntryDialogProps) {
  const { user } = useAuthStore()
  const [deleting, setDeleting] = useState(false)
  const fallbackDate = studentCreatedAtLabel(student)
  const entry = useMemo(
    () => getCourseEntry(student, subjectId, batchId, fallbackDate),
    [batchId, fallbackDate, student, subjectId],
  )
  const isGift = entry?.batch.kind === 'gift'

  const handleDelete = async () => {
    if (!entry || deleting) return
    setDeleting(true)
    try {
      // Query by studentId only so this action does not require a new composite index.
      // Every candidate is read again inside the transaction before quota is changed.
      const bookingSnapshot = await getDocs(query(
        collection(db, 'bookingRequests'),
        where('studentId', '==', student.id),
      ))
      const bookingRefs = bookingSnapshot.docs.map((bookingDocument) => bookingDocument.ref)
      const studentRef = doc(db, 'students', student.id)
      const topUpTransactionRef = doc(db, 'topUpTransactions', batchId)
      const logRef = doc(collection(db, 'adminLogs'))

      await runTransaction(db, async (tx) => {
        const [studentSnapshot, topUpTransactionSnapshot, ...bookingSnapshots] = await Promise.all([
          tx.get(studentRef),
          tx.get(topUpTransactionRef),
          ...bookingRefs.map((bookingRef) => tx.get(bookingRef)),
        ])
        if (!studentSnapshot.exists()) throw new Error('Không tìm thấy học viên')

        const currentStudent = { id: studentSnapshot.id, ...studentSnapshot.data() } as Student
        const currentSubjects = getStudentSubjects(currentStudent)
        const activeBookings = bookingSnapshots.flatMap((bookingSnapshot) => {
          if (!bookingSnapshot.exists()) return []
          const booking = { id: bookingSnapshot.id, ...bookingSnapshot.data() } as BookingRequest
          return (booking.status === 'pending' || booking.status === 'confirmed') && !booking.lessonId
            ? [booking]
            : []
        })
        const heldPointsForSubject = activeBookings.reduce((sum, booking) => {
          const belongsToSubject = booking.subjectId === subjectId
            || (currentSubjects.length === 1 && !currentSubjects.some((subject) => subject.subjectId === booking.subjectId))
          return sum + (belongsToSubject ? getBookingPoints(booking) : 0)
        }, 0)
        const bookingHeldTotal = activeBookings.reduce((sum, booking) => sum + getBookingPoints(booking), 0)
        const storedHeldTotal = Number(currentStudent.reservedMinutes ?? currentStudent.heldMinutes ?? 0)
        const totalHeldPoints = Math.max(storedHeldTotal, bookingHeldTotal)

        const result = deleteCourseEntry({
          student: currentStudent,
          subjectId,
          batchId,
          heldPointsForSubject,
          totalHeldPoints,
          linkedTopUpTransaction: topUpTransactionSnapshot.exists(),
        })
        const currentSubject = currentSubjects.find((subject) => subject.subjectId === subjectId)
        if (!currentSubject) throw new Error('Khóa học không còn tồn tại; hãy tải lại trang')

        tx.update(studentRef, {
          subjects: result.subjects,
          ...result.totals,
          subjectId: result.primarySubject?.subjectId || '',
          subjectName: result.primarySubject?.subjectName || '',
          minutesPerSession: result.primarySubject?.minutesPerSession || 25,
          status: result.status,
          updatedAt: serverTimestamp(),
        })
        tx.set(logRef, {
          adminId: user?.uid || '',
          action: isGift ? 'DELETE_GIFT_ENTRY' : 'DELETE_COURSE_PAYMENT_ENTRY',
          targetType: 'student',
          targetId: student.id,
          changes: {
            subjectId,
            subjectName: currentSubject.subjectName,
            batchId,
            deleted: result.deletedBatch,
            learningMinutesRemoved: getBatchLearningMinutes(result.deletedBatch, currentSubject),
            diamondsRemoved: getBatchDiamonds(result.deletedBatch, currentSubject),
            totalDiamondsAfter: result.totals.totalMinutes,
            remainingDiamondsAfter: result.totals.remainingMinutes,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success(isGift ? 'Đã xóa buổi tặng và tính lại quỹ học viên' : 'Đã xóa đợt thanh toán và tính lại quỹ học viên')
      onClose()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Không thể xóa đợt cộng quyền')
    } finally {
      setDeleting(false)
    }
  }

  if (!entry) {
    return (
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onClose}
        title="Không thể mở đợt cộng quyền"
        description="Dữ liệu đã thay đổi hoặc không còn tồn tại. Hãy đóng và tải lại trang."
        confirmLabel="Đóng"
      />
    )
  }

  return (
    <ConfirmDialog
      open
      onClose={() => { if (!deleting) onClose() }}
      onConfirm={handleDelete}
      title={isGift ? 'Xóa buổi tặng?' : 'Xóa đợt thanh toán?'}
      description={`${entry.subject.subjectName} · ${entry.batch.content?.trim() || (isGift ? `Buổi tặng #${entry.ordinal}` : `Thanh toán đợt ${entry.ordinal}`)}`}
      confirmLabel="Xóa đợt này"
      confirmVariant="danger"
      loading={deleting}
    >
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 text-slate-600"><CalendarDays className="h-4 w-4 text-indigo-500" />Phút học</span>
          <strong className="tabular-nums text-slate-900">− {entry.learningMinutes.toLocaleString('vi-VN')} phút</strong>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 text-slate-600"><DiamondPointsIcon className="h-4 w-4" />Kim cương</span>
          <strong className="tabular-nums text-rose-700">− {entry.diamonds.toLocaleString('vi-VN')}</strong>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
          <span className="inline-flex items-center gap-2 text-slate-600">{isGift ? <Gift className="h-4 w-4 text-violet-500" /> : <ReceiptText className="h-4 w-4 text-indigo-500" />}Ngày ghi nhận</span>
          <strong className="text-slate-900">{entry.batch.paymentDate || entry.batch.createdAt}</strong>
        </div>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Hệ thống chỉ xóa khi quỹ còn lại vẫn đủ cho phần đã học và mọi lịch đang giữ kim cương. Giao dịch nạp tự động và dữ liệu cũ chưa tách đợt sẽ được giữ nguyên.
      </p>
    </ConfirmDialog>
  )
}
