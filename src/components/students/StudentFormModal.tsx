import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db, generateUniqueCode } from '@/lib/firebase'
import { Student } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'

interface Branch {
  id: string
  name: string
  address: string
  status: string
}

const schema = z.object({
  code: z.string().min(1, 'Mã học viên không được để trống').toUpperCase(),
  name: z.string().min(2, 'Tên tối thiểu 2 ký tự'),
  parentPhone: z.string().regex(/^(0[3-9]\d{8})$/, 'SĐT không hợp lệ (VD: 0901234567)').optional().or(z.literal('')),
  email: z.string().email('Email không hợp lệ (VD: phuhuynh@gmail.com)').optional().or(z.literal('')),
  branchId: z.string().optional(),
  classroomURL: z.string().optional().or(z.literal('')),
})

type FormData = z.infer<typeof schema>

const DEFAULT_BRANCH_KEYWORD = 'binh tan'

const normalizeBranchName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()

interface Props {
  student?: Student
  onClose: () => void
}

export function StudentFormModal({ student, onClose }: Props) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [generatedCode, setGeneratedCode] = useState('')
  const isEdit = !!student
  const { register, handleSubmit, setValue, getValues, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: student
      ? {
          code: student.code,
          name: student.name,
          parentPhone: student.parentPhone,
          email: student.email || '',
          branchId: student.branchId || '',
          classroomURL: student.classroomURL || '',
        }
      : { code: '', branchId: '', classroomURL: '', email: '' },
  })

  useEffect(() => {
    if (!isEdit && !generatedCode) {
      generateUniqueCode('student').then(setGeneratedCode).catch((err) => {
        console.error(err)
        toast.error('Không thể sinh mã học viên')
      })
    }
  }, [isEdit, generatedCode])

  useEffect(() => {
    if (!isEdit && generatedCode) {
      setValue('code', generatedCode)
    }
  }, [generatedCode, isEdit, setValue])

  useEffect(() => {
    getDocs(query(collection(db, 'branches'), where('status', '==', 'active'))).then((snap) => {
      const activeBranches = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Branch))
      setBranches(activeBranches)

      if (!isEdit && !getValues('branchId')) {
        const defaultBranch = activeBranches.find((branch) =>
          normalizeBranchName(branch.name).includes(DEFAULT_BRANCH_KEYWORD)
        )
        if (defaultBranch) {
          setValue('branchId', defaultBranch.id)
        }
      }
    })
  }, [getValues, isEdit, setValue])

  const onSubmit = async (data: FormData) => {
    try {
      const branch = data.branchId ? branches.find((b) => b.id === data.branchId) : null
      if (isEdit && student) {
        await updateDoc(doc(db, 'students', student.id), {
          name: data.name,
          parentPhone: data.parentPhone,
          email: data.email?.trim() || '',
          branchId: data.branchId || '',
          branchName: branch?.name || '',
          classroomURL: data.classroomURL || '',
          updatedAt: serverTimestamp(),
        })
        toast.success('Đã cập nhật học viên')
      } else {
        const studentCode = generatedCode || await generateUniqueCode('student')
        await addDoc(collection(db, 'students'), {
          code: studentCode,
          name: data.name,
          parentPhone: data.parentPhone,
          email: data.email?.trim() || '',
          subjectId: '',
          subjectName: '',
          branchId: data.branchId || '',
          branchName: branch?.name || '',
          totalSessions: 0,
          usedSessions: 0,
          remainingSessions: 0,
          minutesPerSession: 50,
          totalMinutes: 0,
          usedMinutes: 0,
          remainingMinutes: 0,
          status: 'inactive',
          subjects: [],
          classroomURL: data.classroomURL || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        toast.success(`Đã thêm học viên — Mã: ${studentCode}`)
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
        <div>
          <Input
            label="Mã học viên *"
            placeholder="Mã sẽ được hệ thống tạo tự động"
            error={errors.code?.message}
            defaultValue={student ? student.code : generatedCode}
            {...register('code')}
            readOnly
          />
          {!isEdit && (
            <p className="mt-1.5 text-xs text-slate-500">Hệ thống sẽ tự sinh mã cho học viên mới.</p>
          )}
        </div>
        <Input
          label="Tên học viên *"
          placeholder="Nguyễn Văn A"
          error={errors.name?.message}
          {...register('name')}
        />
        <Input
          label="SĐT phụ huynh"
          placeholder="0901234567"
          error={errors.parentPhone?.message}
          {...register('parentPhone')}
        />
        <Input
          label="Email phụ huynh"
          type="email"
          placeholder="phuhuynh@gmail.com (không bắt buộc)"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Link phòng học"
          placeholder="https://zoom.us/j/... hoặc link MS Teams, Meet"
          error={errors.classroomURL?.message}
          {...register('classroomURL')}
        />
        {!isEdit && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm leading-6 text-slate-600">
            Học viên sẽ được tạo chưa có môn học. Admin có thể thêm gói môn tại trang chi tiết sau khi tạo tài khoản.
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Chi nhánh</label>
          <select
            className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-4 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            {...register('branchId')}
          >
            <option value="">-- Chọn chi nhánh --</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </form>
    </Modal>
  )
}
