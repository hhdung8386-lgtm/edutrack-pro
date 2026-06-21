import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp, Timestamp, orderBy } from 'firebase/firestore'
import { db, generateUniqueCode, calculateSalary } from '@/lib/firebase'
import { Student, Subject } from '@/types'
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
  subjectId: z.string().min(1, 'Chọn môn học'),
  sessions: z.coerce.number(),
  minutesPerSession: z.coerce.number().min(1, 'Chọn số phút'),
  branchId: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  student?: Student
  onClose: () => void
}

export function StudentFormModal({ student, onClose }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [generatedCode, setGeneratedCode] = useState('')
  const isEdit = !!student
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: student
      ? {
          code: student.code,
          name: student.name,
          parentPhone: student.parentPhone,
          subjectId: student.subjectId,
          sessions: student.totalSessions,
          minutesPerSession: student.minutesPerSession || 50,
          branchId: student.branchId || '',
        }
      : { code: '', sessions: 10, minutesPerSession: 50, branchId: '' },
  })

  const watchedSessions = watch('sessions') || 0
  const watchedMinutesPerSession = watch('minutesPerSession') || 0
  const totalMinutes = watchedSessions * watchedMinutesPerSession

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
    getDocs(query(collection(db, 'subjects'), where('status', '==', 'active'))).then((snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subject)))
    })
    getDocs(query(collection(db, 'branches'), where('status', '==', 'active'))).then((snap) => {
      setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Branch)))
    })
  }, [])

  const onSubmit = async (data: FormData) => {
    try {
      const subject = subjects.find((s) => s.id === data.subjectId)
      const branch = data.branchId ? branches.find((b) => b.id === data.branchId) : null
      if (isEdit && student) {
        const delta = data.sessions - student.totalSessions
        const newRemaining = student.remainingSessions + delta
        const prevMps = student.minutesPerSession || 50
        const usedMinutes = student.usedMinutes ?? (student.usedSessions || 0) * prevMps
        const totalMinutes = data.sessions * data.minutesPerSession
        const remainingMinutes = Math.max(0, totalMinutes - usedMinutes)
        const isSubjectChanged = data.subjectId !== student.subjectId
        const newRate = subject?.pricePerMinute || 0

        await updateDoc(doc(db, 'students', student.id), {
          name: data.name,
          parentPhone: data.parentPhone,
          subjectId: data.subjectId,
          subjectName: subject?.name || '',
          branchId: data.branchId || '',
          branchName: branch?.name || '',
          totalSessions: data.sessions,
          remainingSessions: newRemaining,
          minutesPerSession: data.minutesPerSession,
          totalMinutes,
          usedMinutes,
          remainingMinutes,
          updatedAt: serverTimestamp(),
        })

        // If the subject has changed, automatically sync all lessons and unpaid payrolls in parallel!
        if (isSubjectChanged && subject) {
          const lessonsQ = query(collection(db, 'lessons'), where('studentId', '==', student.id))
          const [lessonsSnap, teachersSnap] = await Promise.all([
            getDocs(lessonsQ),
            getDocs(collection(db, 'teachers')),
          ])
          
          const teachers = teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))

          const lessonUpdates: Promise<any>[] = [];
          const payrollQueries: Promise<any>[] = [];
          const lessonNewSalaries: Record<string, number> = {};
          const lessonRates: Record<string, number> = {};

          lessonsSnap.docs.forEach(lessonDoc => {
            const lessonId = lessonDoc.id
            const lesson = lessonDoc.data()
            const lessonRate = newRate

            const minutes = Number(lesson.minutes) || 0
            const teacherLevel = Number(lesson.teacherLevel) || 1
            const newSalary = lesson.status === 'approved' ? calculateSalary(minutes, lessonRate, teacherLevel) : 0

            lessonNewSalaries[lessonId] = newSalary
            lessonRates[lessonId] = lessonRate

            lessonUpdates.push(
              updateDoc(doc(db, 'lessons', lessonId), {
                subjectId: data.subjectId,
                subjectName: subject.name,
                pricePerMinute: lessonRate,
                salary: newSalary,
                updatedAt: serverTimestamp(),
              })
            )

            if (lesson.status === 'approved') {
              lessonUpdates.push(
                updateDoc(doc(db, 'publicLessons', lessonId), {
                  subjectId: data.subjectId,
                  subjectName: subject.name,
                  updatedAt: serverTimestamp(),
                }).catch(() => {})
              )
            }

            payrollQueries.push(
              getDocs(query(collection(db, 'payroll'), where('lessonId', '==', lessonId)))
            )
          })

          const [, ...payrollSnaps] = await Promise.all([
            Promise.all(lessonUpdates),
            ...payrollQueries
          ])

          const payrollUpdates: Promise<any>[] = []
          payrollSnaps.forEach((payrollSnap, index) => {
            const lessonId = lessonsSnap.docs[index].id
            const newSalary = lessonNewSalaries[lessonId]
            const lessonRate = lessonRates[lessonId]

            payrollSnap.docs.forEach((pDoc: any) => {
              const payroll = pDoc.data()
              if (!payroll.paid && !payroll.voided) {
                payrollUpdates.push(
                  updateDoc(doc(db, 'payroll', pDoc.id), {
                    amount: newSalary,
                    pricePerMinute: lessonRate,
                    recalculatedAt: serverTimestamp(),
                  })
                )
              }
            })
          })

          if (payrollUpdates.length > 0) {
            await Promise.all(payrollUpdates)
          }
        }

        toast.success('Đã cập nhật học viên')
      } else {
        const studentCode = generatedCode || await generateUniqueCode('student')
        const totalMinutes = data.sessions * data.minutesPerSession

        await addDoc(collection(db, 'students'), {
          code: studentCode,
          name: data.name,
          parentPhone: data.parentPhone,
          subjectId: data.subjectId,
          subjectName: subject?.name || '',
          branchId: data.branchId || '',
          branchName: branch?.name || '',
          totalSessions: data.sessions,
          usedSessions: 0,
          remainingSessions: data.sessions,
          minutesPerSession: data.minutesPerSession,
          totalMinutes,
          usedMinutes: 0,
          remainingMinutes: totalMinutes,
          status: 'active',
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
        <Input
          label="Tổng số buổi *"
          type="number"
          placeholder="10"
          error={errors.sessions?.message}
          {...register('sessions')}
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
            <span className="font-semibold">{watchedMinutesPerSession} phút</span>
            <span>=</span>
            <span className="font-semibold text-indigo-700">{totalMinutes} phút</span>
          </div>
        </div>
      </form>
    </Modal>
  )
}
