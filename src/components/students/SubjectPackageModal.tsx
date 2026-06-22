import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { doc, updateDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student, Subject, StudentSubject } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'

const schema = z.object({
  subjectId: z.string().min(1, 'Chọn môn học'),
  totalSessions: z.coerce.number().min(1, 'Tối thiểu 1 buổi'),
  minutesPerSession: z.coerce.number().min(1, 'Chọn số phút'),
})

type FormData = z.infer<typeof schema>

interface Props {
  student: Student
  editingSubjectId?: string // If present, edit mode; otherwise, add mode
  onClose: () => void
}

export function SubjectPackageModal({ student, editingSubjectId, onClose }: Props) {
  const [subjectsList, setSubjectsList] = useState<Subject[]>([])
  const [loading, setLoading] = useState(false)
  const isEdit = !!editingSubjectId

  // Extract current subjects already set up
  const currentSubjects = student.subjects || []

  // Find the package being edited
  const editingPkg = isEdit
    ? currentSubjects.find(s => s.subjectId === editingSubjectId)
    : null

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: editingPkg
      ? {
          subjectId: editingPkg.subjectId,
          totalSessions: editingPkg.totalSessions,
          minutesPerSession: editingPkg.minutesPerSession,
        }
      : {
          subjectId: '',
          totalSessions: 10,
          minutesPerSession: 50,
        },
  })

  const watchedSessions = watch('totalSessions') || 0
  const watchedMinutes = watch('minutesPerSession') || 0
  const previewTotalMinutes = watchedSessions * watchedMinutes

  useEffect(() => {
    // Fetch all active subjects
    getDocs(query(collection(db, 'subjects'), where('status', '==', 'active')))
      .then((snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Subject))
        if (isEdit) {
          setSubjectsList(list)
        } else {
          // Add mode: Filter out subjects the student already has
          const existingIds = currentSubjects.map(cs => cs.subjectId)
          setSubjectsList(list.filter(s => !existingIds.includes(s.id)))
        }
      })
      .catch((err) => {
        console.error(err)
        toast.error('Không thể tải danh sách môn học')
      })
  }, [isEdit, currentSubjects])

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      let updatedSubjects: StudentSubject[] = [...currentSubjects]

      if (isEdit && editingPkg) {
        // Edit mode
        const index = updatedSubjects.findIndex(s => s.subjectId === editingSubjectId)
        if (index !== -1) {
          const prevPkg = updatedSubjects[index]
          const delta = data.totalSessions - prevPkg.totalSessions
          const newRemainingSessions = prevPkg.remainingSessions + delta
          const newTotalMinutes = data.totalSessions * data.minutesPerSession
          const newRemainingMinutes = Math.max(0, newTotalMinutes - prevPkg.usedMinutes)

          updatedSubjects[index] = {
            ...prevPkg,
            totalSessions: data.totalSessions,
            minutesPerSession: data.minutesPerSession,
            remainingSessions: newRemainingSessions,
            totalMinutes: newTotalMinutes,
            remainingMinutes: newRemainingMinutes,
          }
        }
      } else {
        // Add mode
        const selectedSubjectObj = subjectsList.find(s => s.id === data.subjectId)
        if (!selectedSubjectObj) {
          toast.error('Môn học không hợp lệ')
          return
        }

        const newPkg: StudentSubject = {
          subjectId: data.subjectId,
          subjectName: selectedSubjectObj.name,
          totalSessions: data.totalSessions,
          usedSessions: 0,
          remainingSessions: data.totalSessions,
          minutesPerSession: data.minutesPerSession,
          totalMinutes: data.totalSessions * data.minutesPerSession,
          usedMinutes: 0,
          remainingMinutes: data.totalSessions * data.minutesPerSession,
          pricePerMinute: selectedSubjectObj.pricePerMinute || 0,
        }

        updatedSubjects.push(newPkg)
      }

      // Recalculate aggregates
      const aggTotalSessions = updatedSubjects.reduce((sum, s) => sum + s.totalSessions, 0)
      const aggUsedSessions = updatedSubjects.reduce((sum, s) => sum + s.usedSessions, 0)
      const aggRemainingSessions = updatedSubjects.reduce((sum, s) => sum + s.remainingSessions, 0)
      const aggTotalMinutes = updatedSubjects.reduce((sum, s) => sum + s.totalMinutes, 0)
      const aggUsedMinutes = updatedSubjects.reduce((sum, s) => sum + s.usedMinutes, 0)
      const aggRemainingMinutes = updatedSubjects.reduce((sum, s) => sum + s.remainingMinutes, 0)

      // Primary subject falls back to the first subject in the list for legacy compatibility
      const primarySubject = updatedSubjects[0] || null

      await updateDoc(doc(db, 'students', student.id), {
        subjects: updatedSubjects,
        totalSessions: aggTotalSessions,
        usedSessions: aggUsedSessions,
        remainingSessions: aggRemainingSessions,
        totalMinutes: aggTotalMinutes,
        usedMinutes: aggUsedMinutes,
        remainingMinutes: aggRemainingMinutes,
        // Legacy fields mapping to primary subject
        subjectId: primarySubject ? primarySubject.subjectId : '',
        subjectName: primarySubject ? primarySubject.subjectName : '',
        minutesPerSession: primarySubject ? primarySubject.minutesPerSession : 50,
        status: aggRemainingMinutes <= 0 ? 'expired' : 'active',
        updatedAt: serverTimestamp(),
      })

      toast.success(isEdit ? 'Đã cập nhật gói môn học' : 'Đã thêm môn học mới')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Lỗi khi lưu thông tin môn học')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Chỉnh sửa gói môn học' : 'Thêm môn học mới'}
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Hủy</Button>
          <Button form="subject-pkg-form" type="submit" loading={loading}>
            {isEdit ? 'Lưu thay đổi' : 'Thêm môn học'}
          </Button>
        </div>
      }
    >
      <form id="subject-pkg-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Môn học *</label>
          <select
            className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-4 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
            disabled={isEdit}
            {...register('subjectId')}
          >
            <option value="">-- Chọn môn học --</option>
            {subjectsList.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.pricePerMinute?.toLocaleString('vi-VN')}đ/phút)</option>
            ))}
          </select>
          {errors.subjectId && <p className="mt-1.5 text-xs text-rose-400">{errors.subjectId.message}</p>}
        </div>

        <Input
          label="Tổng số buổi *"
          type="number"
          placeholder="10"
          error={errors.totalSessions?.message}
          {...register('totalSessions')}
        />

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Số phút / buổi *</label>
          <select
            className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-4 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            {...register('minutesPerSession')}
          >
            <option value={25}>25 phút</option>
            <option value={50}>50 phút</option>
            <option value={75}>75 phút</option>
            <option value={100}>100 phút</option>
          </select>
          {errors.minutesPerSession && <p className="mt-1.5 text-xs text-rose-400">{errors.minutesPerSession.message}</p>}
        </div>

        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 text-sm">
          <p className="text-slate-500 mb-2">Tổng phút theo quỹ</p>
          <div className="flex flex-wrap items-center gap-2 text-slate-700">
            <span className="font-semibold">{watchedSessions} buổi</span>
            <span>×</span>
            <span className="font-semibold">{watchedMinutes} phút</span>
            <span>=</span>
            <span className="font-semibold text-indigo-700">{previewTotalMinutes} phút</span>
          </div>
        </div>
      </form>
    </Modal>
  )
}
