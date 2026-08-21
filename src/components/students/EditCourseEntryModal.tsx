import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { CalendarDays, Gift, Info, ReceiptText } from 'lucide-react'
import { db } from '@/lib/firebase'
import type { BookingRequest, Student } from '@/types'
import { getBookingPoints } from '@/lib/points'
import { editCourseEntry, getCourseEntry, getStudentSubjects } from '@/lib/studentCourseLedger'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { DiamondPointsIcon } from '@/components/shared/DiamondPointsIcon'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'

const schema = z.object({
  learningMinutes: z.coerce.number().int('Số phút phải là số nguyên').min(1, 'Tối thiểu 1 phút'),
  diamonds: z.coerce.number().int('Kim cương phải là số nguyên').min(1, 'Tối thiểu 1 kim cương'),
  content: z.string().trim().min(2, 'Nhập nội dung').max(120, 'Tối đa 120 ký tự'),
  paymentDate: z.string().min(1, 'Chọn ngày ghi nhận'),
  note: z.string().max(200, 'Tối đa 200 ký tự').optional(),
})

type FormInput = z.input<typeof schema>
type FormData = z.output<typeof schema>

interface EditCourseEntryModalProps {
  student: Student
  subjectId: string
  batchId: string
  onClose: () => void
}

function displayDate(iso: string) {
  const [year, month, day] = iso.split('-')
  return year && month && day ? `${day}/${month}/${year}` : iso
}

function inputDate(value: string) {
  const trimmed = value.trim()
  const viMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (viMatch) return `${viMatch[3]}-${viMatch[2].padStart(2, '0')}-${viMatch[1].padStart(2, '0')}`
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (isoMatch) return trimmed
  return new Date().toISOString().slice(0, 10)
}

function studentCreatedAtLabel(student: Student) {
  const createdAt = student.createdAt as Student['createdAt'] | undefined
  if (createdAt?.toDate) return createdAt.toDate().toLocaleDateString('vi-VN')
  return new Date().toLocaleDateString('vi-VN')
}

export function EditCourseEntryModal({ student, subjectId, batchId, onClose }: EditCourseEntryModalProps) {
  const { user } = useAuthStore()
  const fallbackDate = studentCreatedAtLabel(student)
  const entry = useMemo(
    () => getCourseEntry(student, subjectId, batchId, fallbackDate),
    [batchId, fallbackDate, student, subjectId],
  )
  const isGift = entry?.batch.kind === 'gift'

  const { register, control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      learningMinutes: entry?.learningMinutes || 1,
      diamonds: entry?.diamonds || 1,
      content: entry?.batch.content?.trim() || (isGift ? 'Buổi tặng' : 'Thanh toán đợt'),
      paymentDate: inputDate(entry?.batch.paymentDate || entry?.batch.createdAt || fallbackDate),
      note: entry?.batch.note?.trim() || entry?.batch.reason?.trim() || '',
    },
  })

  const nextLearningMinutes = Math.max(0, Number(useWatch({ control, name: 'learningMinutes' }) || 0))
  const nextDiamonds = Math.max(0, Number(useWatch({ control, name: 'diamonds' }) || 0))
  const diamondsDelta = nextDiamonds - Number(entry?.diamonds || 0)
  const nextRemaining = Math.max(0, Number(entry?.subject.remainingMinutes || 0) + diamondsDelta)

  if (!entry) {
    return (
      <Modal open onClose={onClose} title="Không thể mở đợt cộng quyền" footer={<Button onClick={onClose}>Đóng</Button>}>
        <p className="text-sm text-slate-600">Dữ liệu đã thay đổi hoặc không còn tồn tại. Hãy đóng và tải lại trang.</p>
      </Modal>
    )
  }

  const onSubmit = async (data: FormData) => {
    try {
      // Read by studentId only to avoid a composite-index dependency. Transaction reads
      // re-check every candidate before saving so released/completed bookings are ignored.
      const bookingSnapshot = await getDocs(query(
        collection(db, 'bookingRequests'),
        where('studentId', '==', student.id),
      ))
      const bookingRefs = bookingSnapshot.docs.map((bookingDocument) => bookingDocument.ref)
      const studentRef = doc(db, 'students', student.id)
      const logRef = doc(collection(db, 'adminLogs'))
      const topUpTransactionRef = doc(db, 'topUpTransactions', batchId)

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

        const result = editCourseEntry({
          student: currentStudent,
          subjectId,
          batchId,
          fallbackDate: studentCreatedAtLabel(currentStudent),
          input: {
            learningMinutes: data.learningMinutes,
            diamonds: data.diamonds,
            content: data.content,
            paymentDate: displayDate(data.paymentDate),
            note: data.note || '',
          },
          heldPointsForSubject,
          totalHeldPoints,
          linkedTopUpTransaction: topUpTransactionSnapshot.exists(),
        })

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
          action: isGift ? 'EDIT_GIFT_ENTRY' : 'EDIT_COURSE_PAYMENT_ENTRY',
          targetType: 'student',
          targetId: student.id,
          changes: {
            subjectId,
            subjectName: entry.subject.subjectName,
            batchId,
            before: result.previousBatch,
            after: result.updatedBatch,
            totalDiamondsAfter: result.totals.totalMinutes,
            remainingDiamondsAfter: result.totals.remainingMinutes,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success(isGift ? 'Đã sửa buổi tặng và đồng bộ quỹ học viên' : 'Đã sửa đợt thanh toán và đồng bộ quỹ học viên')
      onClose()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Không thể sửa đợt cộng quyền')
    }
  }

  return (
    <Modal open onClose={onClose} title={isGift ? 'Sửa buổi tặng' : 'Sửa đợt thanh toán'} size="lg" footer={
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
        <Button form="edit-course-entry-form" type="submit" loading={isSubmitting}>Lưu thay đổi</Button>
      </div>
    }>
      <form id="edit-course-entry-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm leading-6 text-amber-950">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-600 ring-1 ring-amber-100">{isGift ? <Gift className="h-4.5 w-4.5" /> : <Info className="h-4.5 w-4.5" />}</span>
          <p>Hệ thống sẽ cập nhật đúng đợt này và tính lại tổng/còn lại. Không thể giảm thấp hơn phần đã dùng hoặc đang giữ cho lịch đặt.</p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-700">Khóa học</p>
          <div className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800">{entry.subject.subjectName}</div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-900"><CalendarDays className="h-4.5 w-4.5 text-indigo-600" />Phút học *</div>
            <Input type="number" min={1} error={errors.learningMinutes?.message} {...register('learningMinutes')} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-900"><DiamondPointsIcon className="h-4.5 w-4.5" />Kim cương *</div>
            <Input type="number" min={1} error={errors.diamonds?.message} {...register('diamonds')} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_190px]">
          <Input label={isGift ? 'Lý do tặng *' : 'Nội dung *'} error={errors.content?.message} {...register('content')} />
          <Input label={isGift ? 'Ngày tặng *' : 'Ngày thanh toán *'} type="date" error={errors.paymentDate?.message} {...register('paymentDate')} />
        </div>

        <Textarea label="Ghi chú" rows={3} maxLength={200} error={errors.note?.message} {...register('note')} />

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><ReceiptText className="h-4.5 w-4.5 text-indigo-600" />Sau khi lưu</div>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-slate-500">Phút của đợt</p><p className="mt-1 font-bold tabular-nums text-indigo-700">{nextLearningMinutes.toLocaleString('vi-VN')} phút</p></div>
            <div><p className="text-xs text-slate-500">Chênh lệch quỹ</p><p className={`mt-1 font-bold tabular-nums ${diamondsDelta < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{diamondsDelta > 0 ? '+' : ''}{diamondsDelta.toLocaleString('vi-VN')} KC</p></div>
            <div><p className="text-xs text-slate-500">Còn lại dự kiến</p><p className="mt-1 inline-flex items-center gap-1 font-bold tabular-nums text-sky-700"><DiamondPointsIcon className="h-3.5 w-3.5" />{nextRemaining.toLocaleString('vi-VN')}</p></div>
          </div>
        </div>
      </form>
    </Modal>
  )
}
