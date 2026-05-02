import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { generateStudentCode } from '@/lib/firebase'
import { Student, Subject } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'

const schema = z.object({
  name: z.string().min(2, 'Tên tối thiểu 2 ký tự'),
  parentPhone: z.string().regex(/^(0[3-9]\d{8})$/, 'SĐT không hợp lệ (VD: 0901234567)'),
  subjectId: z.string().min(1, 'Chọn môn học'),
  sessions: z.coerce.number().min(1, 'Tối thiểu 1 buổi'),
})

type FormData = z.infer<typeof schema>

interface Props {
  student?: Student
  onClose: () => void
}

export function StudentFormModal({ student, onClose }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const isEdit = !!student
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: student
      ? {
          name: student.name,
          parentPhone: student.parentPhone,
          subjectId: student.subjectId,
          sessions: student.totalSessions,
        }
      : { sessions: 10 },
  })

  useEffect(() => {
    getDocs(query(collection(db, 'subjects'), where('status', '==', 'active'))).then((snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subject)))
    })
  }, [])

  const onSubmit = async (data: FormData) => {
    try {
      const subject = subjects.find((s) => s.id === data.subjectId)
      if (isEdit && student) {
        await updateDoc(doc(db, 'students', student.id), {
          name: data.name,
          parentPhone: data.parentPhone,
          subjectId: data.subjectId,
          subjectName: subject?.name || '',
          updatedAt: serverTimestamp(),
        })
        toast.success('Đã cập nhật học viên')
      } else {
        const code = generateStudentCode()
        await addDoc(collection(db, 'students'), {
          code,
          name: data.name,
          parentPhone: data.parentPhone,
          subjectId: data.subjectId,
          subjectName: subject?.name || '',
          totalSessions: data.sessions,
          usedSessions: 0,
          remainingSessions: data.sessions,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        toast.success(`Đã thêm học viên — Mã: ${code}`)
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Có lỗi xảy ra, vui lòng thử lại')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Chỉnh sửa học viên' : 'Thêm học viên mới'}
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button form="student-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Lưu thay đổi' : 'Thêm học viên'}
          </Button>
        </div>
      }
    >
      <form id="student-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
        <Input
          label="Tên học viên *"
          placeholder="Nguyễn Văn A"
          error={errors.name?.message}
          {...register('name')}
        />
        <Input
          label="SĐT phụ huynh *"
          placeholder="0901234567"
          error={errors.parentPhone?.message}
          {...register('parentPhone')}
        />
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Môn học *</label>
          <select
            className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-4 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            {...register('subjectId')}
          >
            <option value="">-- Chọn môn học --</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {errors.subjectId && <p className="mt-1.5 text-xs text-rose-400">{errors.subjectId.message}</p>}
        </div>
        {!isEdit && (
          <Input
            label="Số buổi ban đầu *"
            type="number"
            min={1}
            placeholder="10"
            error={errors.sessions?.message}
            {...register('sessions')}
          />
        )}
      </form>
    </Modal>
  )
}
