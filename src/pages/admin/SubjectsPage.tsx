import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, where, getDocs } from 'firebase/firestore'
import { db, calculateSalary } from '@/lib/firebase'
import { Subject } from '@/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { BookOpen, Plus, Pencil, Search, Trash2 } from 'lucide-react'

export function parseVietnameseNumber(str: string): number {
  if (!str) return 0;
  // Remove all whitespace
  let clean = str.trim().replace(/\s+/g, '');
  
  if (clean.includes('.') && clean.includes(',')) {
    const lastDot = clean.lastIndexOf('.');
    const lastComma = clean.lastIndexOf(',');
    if (lastComma > lastDot) {
      clean = clean.replace(/\./g, '').replace(/,/g, '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    const lastComma = clean.lastIndexOf(',');
    const charsAfter = clean.length - 1 - lastComma;
    if (charsAfter === 3) {
      clean = clean.replace(/,/g, '');
    } else {
      clean = clean.replace(/,/g, '.');
    }
  } else if (clean.includes('.')) {
    const lastDot = clean.lastIndexOf('.');
    const charsAfter = clean.length - 1 - lastDot;
    if (charsAfter === 3) {
      clean = clean.replace(/\./g, '');
    }
  }
  
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatVietnameseNumberInput(val: number): string {
  if (val === undefined || val === null || isNaN(val)) return '';
  const parts = val.toString().split('.');
  const integerPart = Number(parts[0]).toLocaleString('vi-VN');
  if (parts.length > 1) {
    return `${integerPart},${parts[1]}`;
  }
  return integerPart;
}

const schema = z.object({
  name: z.string().min(2, 'Tên tối thiểu 2 ký tự'),
  currency: z.enum(['VND', 'USD']),
  pricePerMinute: z.any().transform((val) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseVietnameseNumber(val);
    return Number(val);
  }),
  status: z.enum(['active', 'inactive']),
}).refine((data) => {
  const price = data.pricePerMinute;
  if (data.currency === 'USD') {
    return !isNaN(price) && price > 0;
  }
  return !isNaN(price) && price >= 100;
}, {
  message: 'Đơn giá không hợp lệ (VND tối thiểu 100đ, USD tối thiểu > 0)',
  path: ['pricePerMinute']
})
type FormData = z.infer<typeof schema>

function SubjectModal({ subject, onClose }: { subject?: Subject; onClose: () => void }) {
  const isEdit = !!subject
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: (subject ? {
      name: subject.name,
      currency: subject.currency || 'VND',
      pricePerMinute: subject.currency === 'USD' ? String(subject.pricePerMinute) : formatVietnameseNumberInput(subject.pricePerMinute),
      status: subject.status,
    } : { status: 'active', currency: 'VND', pricePerMinute: '2.500' }) as any,
  })

  const rawPrice = watch('pricePerMinute')
  const price = typeof rawPrice === 'number' ? rawPrice : parseVietnameseNumber(rawPrice || '')

  const onSubmit = async (data: FormData) => {
    try {
      if (isEdit && subject) {
        // 1. Update the subject itself
        await updateDoc(doc(db, 'subjects', subject.id), { ...data, updatedAt: serverTimestamp() })
        
        // 2. Sync to related students, lessons, and payrolls in parallel
        const newRate = data.pricePerMinute;
        const newCurrency = data.currency || 'VND';
        
        // Query students, lessons and teachers in parallel
        const [studentsSnap, lessonsSnap, teachersSnap] = await Promise.all([
          getDocs(query(collection(db, 'students'), where('subjectId', '==', subject.id))),
          getDocs(query(collection(db, 'lessons'), where('subjectId', '==', subject.id))),
          getDocs(collection(db, 'teachers'))
        ]);
        
        const teachers = teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))

        // Update students in parallel
        const studentUpdates = studentsSnap.docs.map(studentDoc => {
          const studentData = studentDoc.data();
          const updatedSubjectsArray = (studentData.subjects || []).map((sub: any) => {
            if (sub.subjectId === subject.id) {
              return { ...sub, pricePerMinute: newRate, currency: newCurrency }
            }
            return sub;
          });

          return updateDoc(doc(db, 'students', studentDoc.id), {
            pricePerMinute: newRate,
            currency: newCurrency,
            subjects: updatedSubjectsArray,
            updatedAt: serverTimestamp(),
          });
        });
        
        // Update lessons in parallel, and fetch their payrolls in parallel
        const lessonUpdates: Promise<any>[] = [];
        const payrollQueries: Promise<any>[] = [];
        const lessonNewSalaries: Record<string, number> = {};
        const queriedLessonIds: string[] = [];
        
        lessonsSnap.docs.forEach(lessonDoc => {
          const lessonId = lessonDoc.id;
          const lesson = lessonDoc.data();

          const minutes = Number(lesson.minutes) || 0;
          const teacherLevel = Number(lesson.teacherLevel) || 1;
          const newSalary = lesson.status === 'approved' ? calculateSalary(minutes, newRate, teacherLevel) : 0;
          
          lessonNewSalaries[lessonId] = newSalary;
          queriedLessonIds.push(lessonId);
          
          lessonUpdates.push(
            updateDoc(doc(db, 'lessons', lessonId), {
              pricePerMinute: newRate,
              salary: newSalary,
              currency: newCurrency,
              updatedAt: serverTimestamp(),
            })
          );
          
          payrollQueries.push(
            getDocs(query(collection(db, 'payroll'), where('lessonId', '==', lessonId)))
          );
        });
        
        // Await all student updates, lesson updates, and payroll queries in parallel
        const [, , ...payrollSnaps] = await Promise.all([
          Promise.all(studentUpdates),
          Promise.all(lessonUpdates),
          ...payrollQueries
        ]);
        
        // Update corresponding unpaid payrolls in parallel
        const payrollUpdates: Promise<any>[] = [];
        payrollSnaps.forEach((payrollSnap, index) => {
          const lessonId = queriedLessonIds[index];
          const newSalary = lessonNewSalaries[lessonId];
          
          payrollSnap.docs.forEach((pDoc: any) => {
            const payroll = pDoc.data();
            if (!payroll.paid && !payroll.voided) {
              payrollUpdates.push(
                updateDoc(doc(db, 'payroll', pDoc.id), {
                  amount: newSalary,
                  pricePerMinute: newRate,
                  currency: newCurrency,
                  recalculatedAt: serverTimestamp(),
                })
              );
            }
          });
        });
        
        if (payrollUpdates.length > 0) {
          await Promise.all(payrollUpdates);
        }
        
        toast.success('Đã cập nhật môn học và đồng bộ dữ liệu thành công!')
      } else {
        await addDoc(collection(db, 'subjects'), { ...data, createdAt: serverTimestamp() })
        toast.success('Đã thêm môn học')
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Có lỗi xảy ra khi cập nhật và đồng bộ dữ liệu')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Chỉnh sửa môn học' : 'Thêm môn học'}
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button form="subject-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Lưu thay đổi' : 'Thêm môn học'}
          </Button>
        </div>
      }
    >
      <form id="subject-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
        <Input label="Tên môn học *" placeholder="Tiếng Anh" error={errors.name?.message} {...register('name')} />
        
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Loại tiền tệ</label>
          <select
            className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-4 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            {...register('currency')}
          >
            <option value="VND">VND (đ)</option>
            <option value="USD">USD ($)</option>
          </select>
        </div>

        <Input
          label={`Giá mỗi phút (${watch('currency') || 'VND'}) *`}
          type="text"
          placeholder={(watch('currency') || 'VND') === 'USD' ? '0.15' : '2.500'}
          error={errors.pricePerMinute?.message}
          {...register('pricePerMinute')}
        />

        {/* Salary preview */}
        {price > 0 && (
          <div className="bg-white rounded-xl p-4 space-y-1.5 text-xs text-slate-500">
            <p className="font-medium text-slate-600 mb-2">Ví dụ lương:</p>
            {[{ min: 25, level: 1.0 }, { min: 50, level: 1.2 }, { min: 50, level: 1.5 }].map((ex) => {
              const currency = watch('currency') || 'VND'
              const formattedPrice = currency === 'USD' ? `$${price}` : `${price.toLocaleString('vi-VN')}đ`
              const formattedSalary = currency === 'USD' ? `$${(ex.min * price * ex.level).toFixed(2)}` : `${(ex.min * price * ex.level).toLocaleString('vi-VN')}đ`
              return (
                <div key={`${ex.min}-${ex.level}`} className="flex justify-between">
                  <span>{ex.min} phút × {formattedPrice} × ×{ex.level}</span>
                  <span className="text-emerald-400 font-medium">= {formattedSalary}</span>
                </div>
              )
            })}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Trạng thái</label>
          <select
            className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-4 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            {...register('status')}
          >
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Tạm dừng</option>
          </select>
        </div>
      </form>
    </Modal>
  )
}

export function SubjectsPage() {
  const { user } = useAuthStore()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editSubject, setEditSubject] = useState<Subject | null>(null)
  const [deletingSubject, setDeletingSubject] = useState<Subject | null>(null)
  const [deleteInfo, setDeleteInfo] = useState<{ studentCount: number; lessonCount: number } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'subjects'), orderBy('createdAt', 'desc')),
      (snap) => {
        setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subject)))
        setLoading(false)
      },
      (err) => {
        console.error('Error loading subjects:', err)
        toast.error('Không có quyền truy cập danh sách môn học hoặc lỗi kết nối')
        setLoading(false)
      }
    )
  }, [])

  // Pre-fetch references when opening delete confirm
  useEffect(() => {
    if (!deletingSubject) { setDeleteInfo(null); return }
    let cancelled = false
    Promise.all([
      getDocs(query(collection(db, 'students'), where('subjectId', '==', deletingSubject.id))),
      getDocs(query(collection(db, 'lessons'), where('subjectId', '==', deletingSubject.id))),
    ]).then(([sSnap, lSnap]) => {
      if (!cancelled) setDeleteInfo({ studentCount: sSnap.size, lessonCount: lSnap.size })
    })
    return () => { cancelled = true }
  }, [deletingSubject])

  const handleDelete = async () => {
    if (!deletingSubject) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'subjects', deletingSubject.id))
      await addDoc(collection(db, 'adminLogs'), {
        adminId: user?.uid || '',
        action: 'DELETE_SUBJECT',
        targetType: 'subject',
        targetId: deletingSubject.id,
        changes: {
          name: deletingSubject.name,
          pricePerMinute: deletingSubject.pricePerMinute,
          studentsAffected: deleteInfo?.studentCount ?? 0,
          lessonsAffected: deleteInfo?.lessonCount ?? 0,
        },
        createdAt: serverTimestamp(),
      })
      toast.success(`Đã xoá môn "${deletingSubject.name}"`)
      setDeletingSubject(null)
    } catch (err) {
      console.error(err)
      toast.error('Xoá thất bại')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = subjects.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Môn học</h1>
          <p className="text-sm text-slate-500 mt-0.5">{subjects.length} môn học</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" />
          Thêm môn học
        </Button>
      </div>

      <Input
        placeholder="Tìm môn học..."
        leftIcon={<Search className="w-4 h-4" />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {filtered.length === 0 && !loading ? (
        <EmptyState
          icon={<BookOpen className="w-8 h-8" />}
          title="Chưa có môn học nào"
          action={{ label: 'Thêm môn học', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <Card padding="none">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                {['Tên môn', 'Giá / phút', 'Trạng thái', 'Hành động'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filtered.map((subject) => (
                <tr key={subject.id} className="hover:bg-slate-100/20 transition-colors">
                  <td className="px-5 py-4 font-medium text-slate-700">{subject.name}</td>
                  <td className="px-5 py-4">
                    <span className="text-emerald-400 font-semibold">
                      {subject.currency === 'USD' ? `$${subject.pricePerMinute}` : `${subject.pricePerMinute.toLocaleString('vi-VN')}đ`}
                    </span>
                    <span className="text-slate-500 text-xs"> / phút</span>
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={subject.status} /></td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditSubject(subject)}>
                        <Pencil className="w-3.5 h-3.5" />
                        Sửa
                      </Button>
                      <button
                        onClick={() => setDeletingSubject(subject)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                        title="Xoá môn học"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Xoá
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showAdd && <SubjectModal onClose={() => setShowAdd(false)} />}
      {editSubject && <SubjectModal subject={editSubject} onClose={() => setEditSubject(null)} />}

      {deletingSubject && (
        <ConfirmDialog
          open
          onClose={() => setDeletingSubject(null)}
          onConfirm={handleDelete}
          title={`Xoá môn "${deletingSubject.name}"?`}
          confirmLabel="Xoá vĩnh viễn"
          confirmVariant="danger"
          loading={deleting}
        >
          {deleteInfo === null ? (
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-500 text-center">
              Đang kiểm tra dữ liệu liên quan...
            </div>
          ) : deleteInfo.studentCount > 0 || deleteInfo.lessonCount > 0 ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm space-y-2">
              <p className="font-semibold text-rose-700">⚠ Môn này đang được sử dụng:</p>
              <ul className="text-rose-700 space-y-1 pl-4 list-disc">
                {deleteInfo.studentCount > 0 && (
                  <li><strong>{deleteInfo.studentCount}</strong> học viên đang học môn này</li>
                )}
                {deleteInfo.lessonCount > 0 && (
                  <li><strong>{deleteInfo.lessonCount}</strong> buổi học đã ghi với môn này</li>
                )}
              </ul>
              <p className="text-rose-600 text-xs pt-1">
                Xoá sẽ làm các học viên/buổi học mất tham chiếu môn. Khuyên: chỉnh sang "Tạm dừng" thay vì xoá.
              </p>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700">
              ✓ Không có học viên hay buổi học nào dùng môn này — an toàn để xoá.
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
