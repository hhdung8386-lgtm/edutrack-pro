import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { CalendarDays, Gift, Info, ReceiptText } from 'lucide-react'
import { db } from '@/lib/firebase'
import type { Student, StudentSubject, TopUpBatch } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { DiamondPointsIcon } from '@/components/shared/DiamondPointsIcon'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { isSelectableSubject } from '@/lib/subjectLifecycle'
import { appendCourseBatch } from '@/lib/studentCourseLedger'

const schema = z.object({
  subjectId: z.string().min(1, 'Chọn môn học'),
  minutes: z.coerce.number().int('Số phút phải là số nguyên').min(1, 'Tối thiểu 1 phút'),
  diamonds: z.coerce.number().int('Kim cương phải là số nguyên').min(1, 'Tối thiểu 1 kim cương'),
  content: z.string().trim().min(2, 'Nhập nội dung cộng quyền học').max(120, 'Tối đa 120 ký tự'),
  paymentDate: z.string().min(1, 'Chọn ngày ghi nhận'),
  note: z.string().max(200, 'Tối đa 200 ký tự').optional(),
})

type FormInput = z.input<typeof schema>
type FormData = z.output<typeof schema>
type AddMode = 'payment' | 'gift'

interface AddSessionsModalProps {
  student: Student
  onClose: () => void
  initialSubjectId?: string
  mode?: AddMode
}

function fallbackSubjects(student: Student): StudentSubject[] {
  if (student.subjects?.length) return student.subjects.map((subject) => ({ ...subject }))
  if (!student.subjectId) return []
  const minutesPerSession = student.minutesPerSession || 50
  return [{
    subjectId: student.subjectId,
    subjectName: student.subjectName || 'Chưa rõ',
    totalSessions: student.totalSessions || 0,
    usedSessions: student.usedSessions || 0,
    remainingSessions: student.remainingSessions || 0,
    minutesPerSession,
    totalMinutes: student.totalMinutes ?? (student.totalSessions * minutesPerSession),
    usedMinutes: student.usedMinutes ?? ((student.usedSessions || 0) * minutesPerSession),
    remainingMinutes: student.remainingMinutes ?? ((student.remainingSessions || 0) * minutesPerSession),
    pricePerMinute: 0,
  }]
}

function todayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function displayDate(iso: string) {
  const [year, month, day] = iso.split('-')
  return year && month && day ? `${day}/${month}/${year}` : iso
}

export function AddSessionsModal({ student, onClose, initialSubjectId, mode = 'gift' }: AddSessionsModalProps) {
  const { user } = useAuthStore()
  const studentSubjects = fallbackSubjects(student)
  const initialSubject = studentSubjects.find((subject) => subject.subjectId === initialSubjectId) || studentSubjects[0]
  const nextPaymentNumber = (initialSubject?.batches || []).filter((batch) => batch.kind !== 'gift').length + 1

  const { register, control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      subjectId: initialSubject?.subjectId || '',
      minutes: 250,
      diamonds: 250,
      content: mode === 'payment' ? `Thanh toán đợt ${nextPaymentNumber}` : 'Buổi tặng',
      paymentDate: todayISO(),
      note: '',
    },
  })

  const selectedSubjectId = useWatch({ control, name: 'subjectId' })
  const selectedPkg = studentSubjects.find((subject) => subject.subjectId === selectedSubjectId)
  const minutesToAdd = Math.max(0, Number(useWatch({ control, name: 'minutes' }) || 0))
  const diamondsToAdd = Math.max(0, Number(useWatch({ control, name: 'diamonds' }) || 0))
  const currentRemainingDiamonds = Math.max(0, Number(selectedPkg?.remainingMinutes || 0))

  const onSubmit = async (data: FormData) => {
    try {
      const studentRef = doc(db, 'students', student.id)
      const subjectRef = doc(db, 'subjects', data.subjectId)
      const logRef = doc(collection(db, 'adminLogs'))

      await runTransaction(db, async (tx) => {
        const [studentSnap, globalSubjectSnap] = await Promise.all([tx.get(studentRef), tx.get(subjectRef)])
        if (!studentSnap.exists()) throw new Error('Không tìm thấy học viên')
        if (!globalSubjectSnap.exists() || !isSelectableSubject(globalSubjectSnap.data())) {
          throw new Error('Môn học đã tạm dừng hoặc bị xóa; không thể cộng thêm quyền học')
        }

        const currentStudent = { id: studentSnap.id, ...studentSnap.data() } as Student
        const updatedSubjects = fallbackSubjects(currentStudent)
        const subjectIndex = updatedSubjects.findIndex((subject) => subject.subjectId === data.subjectId)
        if (subjectIndex === -1) throw new Error('Gói môn học không còn tồn tại; hãy tải lại trang')

        const previous = updatedSubjects[subjectIndex]
        const minutesPerSession = previous.minutesPerSession || 25
        const addedSessions = Math.round((data.diamonds / minutesPerSession) * 100) / 100
        const paymentDate = displayDate(data.paymentDate)
        const batch: TopUpBatch = {
          id: logRef.id,
          createdAt: paymentDate,
          totalSessions: addedSessions,
          kind: mode,
          learningMinutes: data.minutes,
          diamonds: data.diamonds,
          content: data.content.trim(),
          paymentDate,
          reason: mode === 'gift' ? data.content.trim() : '',
          note: data.note?.trim() || '',
        }

        updatedSubjects[subjectIndex] = {
          ...previous,
          totalSessions: Number(previous.totalSessions || 0) + addedSessions,
          remainingSessions: Number(previous.remainingSessions || 0) + addedSessions,
          totalMinutes: Number(previous.totalMinutes || 0) + data.diamonds,
          remainingMinutes: Number(previous.remainingMinutes || 0) + data.diamonds,
          pricePerMinute: Number(previous.pricePerMinute || globalSubjectSnap.data().pricePerMinute || 0),
          batches: appendCourseBatch(previous.batches, batch),
        }

        const totals = updatedSubjects.reduce((summary, subject) => ({
          totalSessions: summary.totalSessions + Number(subject.totalSessions || 0),
          usedSessions: summary.usedSessions + Number(subject.usedSessions || 0),
          remainingSessions: summary.remainingSessions + Number(subject.remainingSessions || 0),
          totalMinutes: summary.totalMinutes + Number(subject.totalMinutes || 0),
          usedMinutes: summary.usedMinutes + Number(subject.usedMinutes || 0),
          remainingMinutes: summary.remainingMinutes + Number(subject.remainingMinutes || 0),
        }), { totalSessions: 0, usedSessions: 0, remainingSessions: 0, totalMinutes: 0, usedMinutes: 0, remainingMinutes: 0 })
        const primarySubject = updatedSubjects.find((subject) => subject.remainingMinutes > 0) || updatedSubjects[0]

        tx.update(studentRef, {
          subjects: updatedSubjects,
          ...totals,
          subjectId: primarySubject?.subjectId || '',
          subjectName: primarySubject?.subjectName || '',
          minutesPerSession: primarySubject?.minutesPerSession || 25,
          status: totals.remainingMinutes > 0 ? 'active' : currentStudent.status,
          updatedAt: serverTimestamp(),
        })
        tx.set(logRef, {
          adminId: user?.uid || '',
          action: mode === 'gift' ? 'ADD_GIFT_SESSIONS' : 'ADD_COURSE_RIGHTS',
          targetType: 'student',
          targetId: student.id,
          changes: {
            subjectId: previous.subjectId,
            subjectName: previous.subjectName,
            learningMinutesAdded: data.minutes,
            diamondsAdded: data.diamonds,
            content: data.content.trim(),
            paymentDate,
            note: data.note?.trim() || '',
            totalDiamondsBefore: previous.totalMinutes,
            totalDiamondsAfter: Number(previous.totalMinutes || 0) + data.diamonds,
            remainingDiamondsBefore: previous.remainingMinutes,
            remainingDiamondsAfter: Number(previous.remainingMinutes || 0) + data.diamonds,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success(mode === 'gift'
        ? `Đã tặng ${data.minutes.toLocaleString('vi-VN')} phút và ${data.diamonds.toLocaleString('vi-VN')} kim cương cho ${student.name}`
        : `Đã cộng quyền học vào môn ${selectedPkg?.subjectName || ''}`)
      onClose()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Không thể cộng quyền học')
    }
  }

  const title = mode === 'gift' ? 'Cấp buổi tặng' : 'Cộng thêm quyền học'

  return (
    <Modal open onClose={onClose} title={title} size="lg" footer={
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
        <Button form="add-sessions-form" type="submit" loading={isSubmitting}>Xác nhận</Button>
      </div>
    }>
      <form id="add-sessions-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm leading-6 text-indigo-900">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 ring-1 ring-indigo-100">{mode === 'gift' ? <Gift className="h-4.5 w-4.5" /> : <Info className="h-4.5 w-4.5" />}</span>
          <p>{mode === 'gift' ? 'Buổi tặng vẫn được cộng vào đúng quỹ môn học và có lịch sử riêng.' : 'Phút học và kim cương sẽ được ghi thành một đợt mới, không làm thay đổi lịch sử các đợt trước.'}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Khóa học *</label>
          <select className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" {...register('subjectId')}>
            {studentSubjects.map((subject) => <option key={subject.subjectId} value={subject.subjectId}>{subject.subjectName}</option>)}
          </select>
          {errors.subjectId && <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.subjectId.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-900"><CalendarDays className="h-4.5 w-4.5 text-indigo-600" />Phút học *</div>
            <Input type="number" min={1} error={errors.minutes?.message} {...register('minutes')} />
            <p className="mt-2 text-xs text-slate-500">Thời lượng học được ghi nhận cho đợt này.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-900"><DiamondPointsIcon className="h-4.5 w-4.5" />Kim cương *</div>
            <Input type="number" min={1} error={errors.diamonds?.message} {...register('diamonds')} />
            <p className="mt-2 text-xs text-slate-500">Quỹ thực tế dùng để đặt và duyệt buổi.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_190px]">
          <Input label={mode === 'gift' ? 'Lý do tặng *' : 'Nội dung *'} placeholder={mode === 'gift' ? 'Ví dụ: Bù sự cố lớp học' : 'Ví dụ: Thanh toán đợt 2'} error={errors.content?.message} {...register('content')} />
          <Input label={mode === 'gift' ? 'Ngày tặng *' : 'Ngày thanh toán *'} type="date" error={errors.paymentDate?.message} {...register('paymentDate')} />
        </div>

        <Textarea label="Ghi chú" placeholder="Nhập ghi chú (không bắt buộc)" rows={3} maxLength={200} error={errors.note?.message} {...register('note')} />

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><ReceiptText className="h-4.5 w-4.5 text-indigo-600" />Sau khi xác nhận</div>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-slate-500">Khóa học</p><p className="mt-1 font-bold text-slate-800">{selectedPkg?.subjectName || '—'}</p></div>
            <div><p className="text-xs text-slate-500">Cộng thêm</p><p className="mt-1 font-bold tabular-nums text-indigo-700">+{minutesToAdd.toLocaleString('vi-VN')} phút</p></div>
            <div><p className="text-xs text-slate-500">Quỹ khả dụng mới</p><p className="mt-1 inline-flex items-center gap-1 font-bold tabular-nums text-sky-700"><DiamondPointsIcon className="h-3.5 w-3.5" />{(currentRemainingDiamonds + diamondsToAdd).toLocaleString('vi-VN')}</p></div>
          </div>
        </div>
      </form>
    </Modal>
  )
}
