import { useEffect, useMemo, useState } from 'react'
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

// Khi TẠO MỚI: bắt buộc có SĐT + email phụ huynh.
// Khi SỬA hồ sơ cũ: giữ tuỳ chọn để admin không bị chặn khi chỉnh các hồ sơ
// đã tồn tại từ trước chưa kịp bổ sung liên hệ (tránh phải bịa dữ liệu giả).
const makeSchema = (requireContact: boolean) => z.object({
  code: z.string().min(1, 'Mã học viên không được để trống').toUpperCase(),
  name: z.string().min(2, 'Tên tối thiểu 2 ký tự'),
  parentPhone: requireContact
    ? z.string().min(1, 'Vui lòng nhập SĐT phụ huynh').regex(/^(0[3-9]\d{8})$/, 'SĐT không hợp lệ (VD: 0901234567)')
    : z.string().regex(/^(0[3-9]\d{8})$/, 'SĐT không hợp lệ (VD: 0901234567)').optional().or(z.literal('')),
  email: requireContact
    ? z.string().min(1, 'Vui lòng nhập email phụ huynh').email('Email không hợp lệ (VD: phuhuynh@gmail.com)')
    : z.string().email('Email không hợp lệ (VD: phuhuynh@gmail.com)').optional().or(z.literal('')),
  branchId: z.string().optional(),
  // Chỉ còn 2 nhóm: cố định (mặc định) hoặc linh hoạt. Hồ sơ cũ chưa phân loại được hiểu là cố định.
  learningScheduleType: z.enum(['fixed', 'flexible']).default('fixed'),
  classroomURL: z.string().optional().or(z.literal('')),
})

type FormData = z.infer<ReturnType<typeof makeSchema>>

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
  const schema = useMemo(() => makeSchema(!isEdit), [isEdit])
  const { register, handleSubmit, setValue, getValues, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: student
      ? {
          code: student.code,
          name: student.name,
          parentPhone: student.parentPhone,
          email: student.email || '',
          branchId: student.branchId || '',
          // Chưa phân loại được hiểu là cố định
          learningScheduleType: student.learningScheduleType === 'flexible' ? 'flexible' : 'fixed',
          classroomURL: student.classroomURL || '',
        }
      : { code: '', branchId: '', learningScheduleType: 'fixed', classroomURL: '', email: '' },
  })
  const scheduleType = watch('learningScheduleType')

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
          learningScheduleType: data.learningScheduleType,
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
          learningScheduleType: data.learningScheduleType,
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
        {/* Phân loại học viên: 2 nút tick giống form gia sư */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {([
            { value: 'fixed', label: 'Học viên cố định' },
            { value: 'flexible', label: 'Học viên linh hoạt' },
          ] as const).map((option) => {
            const checked = scheduleType === option.value
            return (
              <label
                key={option.value}
                className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition active:scale-[0.98] ${checked ? 'bg-brand-400 text-slate-950 shadow-sm' : 'text-slate-600 hover:bg-white'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setValue('learningScheduleType', option.value, { shouldDirty: true })}
                  className="h-4 w-4 rounded border-slate-400 text-amber-500 focus:ring-amber-400"
                />
                <span className="whitespace-nowrap">{option.label}</span>
              </label>
            )
          })}
        </div>
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
          label={isEdit ? 'SĐT phụ huynh' : 'SĐT phụ huynh *'}
          placeholder="0901234567"
          error={errors.parentPhone?.message}
          {...register('parentPhone')}
        />
        <Input
          label={isEdit ? 'Email phụ huynh' : 'Email phụ huynh *'}
          type="email"
          placeholder={isEdit ? 'phuhuynh@gmail.com' : 'phuhuynh@gmail.com (bắt buộc)'}
          error={errors.email?.message}
          {...register('email')}
        />
        {isEdit && (!watch('parentPhone') || !watch('email')) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-5 text-amber-800">
            Hồ sơ này còn thiếu {!watch('parentPhone') && !watch('email') ? 'SĐT và email' : !watch('parentPhone') ? 'SĐT' : 'email'} phụ huynh — nên bổ sung để liên hệ và gửi thông báo.
          </div>
        )}
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
