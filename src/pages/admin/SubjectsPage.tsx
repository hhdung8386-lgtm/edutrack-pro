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

const priceTransform = z.any().transform((val) => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseVietnameseNumber(val);
  return Number(val);
});

const schema = z.object({
  name: z.string().min(2, 'Tên tối thiểu 2 ký tự'),
  currency: z.enum(['VND', 'USD']),
  pricePerMinuteVN: priceTransform,
  pricePerMinutePH: priceTransform,
  pricePerMinuteNative: priceTransform,
  status: z.enum(['active', 'inactive']),
}).refine((data) => {
  const vn = data.pricePerMinuteVN;
  const ph = data.pricePerMinutePH;
  const nat = data.pricePerMinuteNative;
  if (data.currency === 'USD') {
    return !isNaN(vn) && vn > 0 && !isNaN(ph) && ph > 0 && !isNaN(nat) && nat > 0;
  }
  return !isNaN(vn) && vn >= 100 && !isNaN(ph) && ph >= 100 && !isNaN(nat) && nat >= 100;
}, {
  message: 'Các đơn giá không hợp lệ (VND tối thiểu 100đ, USD tối thiểu > 0)',
  path: ['pricePerMinuteVN']
})
type FormData = z.infer<typeof schema>

function SubjectModal({ subject, onClose }: { subject?: Subject; onClose: () => void }) {
  const isEdit = !!subject
  const [otherPrices, setOtherPrices] = useState<Record<string, number>>(subject?.otherCountriesPrices || {})
  const [selectedCountry, setSelectedCountry] = useState('JP')
  const [newPriceForCountry, setNewPriceForCountry] = useState('')

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: (subject ? {
      name: subject.name,
      currency: subject.currency || 'VND',
      pricePerMinuteVN: subject.currency === 'USD' ? String(subject.pricePerMinuteVN ?? subject.pricePerMinute ?? 2.5) : formatVietnameseNumberInput(subject.pricePerMinuteVN ?? subject.pricePerMinute ?? 2500),
      pricePerMinutePH: subject.currency === 'USD' ? String(subject.pricePerMinutePH ?? subject.pricePerMinute ?? 2.5) : formatVietnameseNumberInput(subject.pricePerMinutePH ?? subject.pricePerMinute ?? 2500),
      pricePerMinuteNative: subject.currency === 'USD' ? String(subject.pricePerMinuteNative ?? subject.pricePerMinute ?? 2.5) : formatVietnameseNumberInput(subject.pricePerMinuteNative ?? subject.pricePerMinute ?? 2500),
      status: subject.status,
    } : {
      status: 'active',
      currency: 'VND',
      pricePerMinuteVN: '2.500',
      pricePerMinutePH: '2.500',
      pricePerMinuteNative: '2.500'
    }) as any,
  })

  const rawPriceVN = watch('pricePerMinuteVN')
  const priceVN = typeof rawPriceVN === 'number' ? rawPriceVN : parseVietnameseNumber(rawPriceVN || '')

  const onSubmit = async (data: FormData) => {
    try {
      if (isEdit && subject) {
        // 1. Update the subject itself
        const updatePayload = {
          ...data,
          pricePerMinute: data.pricePerMinuteVN,
          otherCountriesPrices: otherPrices,
          updatedAt: serverTimestamp()
        }
        await updateDoc(doc(db, 'subjects', subject.id), updatePayload)
        
        // 2. Sync to related students, lessons, and payrolls in parallel
        const newRateVN = data.pricePerMinuteVN;
        const newRatePH = data.pricePerMinutePH;
        const newRateNative = data.pricePerMinuteNative;
        const newCurrency = data.currency || 'VND';
        
        // Query ALL students to sync denormalized subjects array properly
        const [studentsSnap, lessonsSnap, teachersSnap] = await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(query(collection(db, 'lessons'), where('subjectId', '==', subject.id))),
          getDocs(collection(db, 'teachers'))
        ]);
        
        const teachers = teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }))
        const teachersMap = new Map(teachers.map(t => [t.id, t]))

        // Update students in parallel
        const studentUpdates = studentsSnap.docs.map(studentDoc => {
          const studentData = studentDoc.data();
          const hasSubject = (studentData.subjects || []).some((sub: any) => sub.subjectId === subject.id) || studentData.subjectId === subject.id;
          if (!hasSubject) return null;

          const updatedSubjectsArray = (studentData.subjects || []).map((sub: any) => {
            if (sub.subjectId === subject.id) {
              return { 
                ...sub, 
                subjectName: data.name, // Sync the name change!
                pricePerMinute: newRateVN,
                pricePerMinuteVN: newRateVN,
                pricePerMinutePH: newRatePH,
                pricePerMinuteNative: newRateNative,
                otherCountriesPrices: otherPrices,
                currency: newCurrency 
              }
            }
            return sub;
          });

          const updateObj: any = {
            subjects: updatedSubjectsArray,
            updatedAt: serverTimestamp(),
          };

          if (studentData.subjectId === subject.id) {
            updateObj.subjectName = data.name; // Sync legacy name!
            updateObj.pricePerMinute = newRateVN;
            updateObj.pricePerMinuteVN = newRateVN;
            updateObj.pricePerMinutePH = newRatePH;
            updateObj.pricePerMinuteNative = newRateNative;
            updateObj.otherCountriesPrices = otherPrices;
            updateObj.currency = newCurrency;
          }

          return updateDoc(doc(db, 'students', studentDoc.id), updateObj);
        }).filter(Boolean) as Promise<any>[];
        
        // Fetch all payrolls first in parallel to check paid status
        const payrollQueries = lessonsSnap.docs.map(lessonDoc =>
          getDocs(query(collection(db, 'payroll'), where('lessonId', '==', lessonDoc.id)))
        );
        
        const [payrollSnaps] = await Promise.all([
          Promise.all(payrollQueries)
        ]);
        
        const lessonUpdates: Promise<any>[] = [];
        const payrollUpdates: Promise<any>[] = [];
        
        lessonsSnap.docs.forEach((lessonDoc, index) => {
          const lessonId = lessonDoc.id;
          const lesson = lessonDoc.data() as any;
          const payrollSnap = payrollSnaps[index];
          
          const isPaid = payrollSnap.docs.some((pDoc: any) => pDoc.data().paid === true);
          if (isPaid) {
            // Protect paid lessons: do not update their rate or salary
            return;
          }

          const teacher = teachersMap.get(lesson.teacherId);
          const teacherCountry = teacher?.country || 'VN';

          let rate = newRateVN;
          if (otherPrices && otherPrices[teacherCountry] !== undefined) {
            rate = otherPrices[teacherCountry];
          } else if (teacherCountry === 'VN') {
            rate = newRateVN;
          } else if (teacherCountry === 'PH') {
            rate = newRatePH;
          } else {
            rate = newRateNative;
          }

          const minutes = Number(lesson.minutes) || 0;
          const teacherLevel = Number(lesson.teacherLevel) || 1;
          const newSalary = lesson.status === 'approved' ? calculateSalary(minutes, rate, teacherLevel, newCurrency) : 0;
          
          lessonUpdates.push(
            updateDoc(doc(db, 'lessons', lessonId), {
              subjectName: data.name, // Sync the name change!
              pricePerMinute: rate,
              salary: newSalary,
              currency: newCurrency,
              updatedAt: serverTimestamp(),
            })
          );

          // Sync publicLessons if they exist
          lessonUpdates.push(
            updateDoc(doc(db, 'publicLessons', lessonId), {
              subjectName: data.name,
            }).catch(() => {/* Ignore error if doc does not exist */})
          );
          
          payrollSnap.docs.forEach((pDoc: any) => {
            const payroll = pDoc.data();
            if (!payroll.paid && !payroll.voided) {
              payrollUpdates.push(
                updateDoc(doc(db, 'payroll', pDoc.id), {
                  amount: newSalary,
                  pricePerMinute: rate,
                  currency: newCurrency,
                  recalculatedAt: serverTimestamp(),
                })
              );
            }
          });
        });
        
        // Execute all student updates, lesson updates, and unpaid payroll updates in parallel
        await Promise.all([
          Promise.all(studentUpdates),
          Promise.all(lessonUpdates),
          Promise.all(payrollUpdates)
        ]);
        
        toast.success('Đã cập nhật môn học và đồng bộ dữ liệu thành công!')
      } else {
        const addPayload = {
          ...data,
          pricePerMinute: data.pricePerMinuteVN,
          otherCountriesPrices: otherPrices,
          createdAt: serverTimestamp()
        }
        await addDoc(collection(db, 'subjects'), addPayload)
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label={`Giá GV Việt Nam (${watch('currency') || 'VND'}) *`}
            type="text"
            placeholder={(watch('currency') || 'VND') === 'USD' ? '0.15' : '2.500'}
            error={errors.pricePerMinuteVN?.message}
            {...register('pricePerMinuteVN')}
          />
          <Input
            label={`Giá GV Philippines (${watch('currency') || 'VND'}) *`}
            type="text"
            placeholder={(watch('currency') || 'VND') === 'USD' ? '0.15' : '2.500'}
            error={errors.pricePerMinutePH?.message}
            {...register('pricePerMinutePH')}
          />
          <Input
            label={`Giá GV Bản xứ / Khác (${watch('currency') || 'VND'}) *`}
            type="text"
            placeholder={(watch('currency') || 'VND') === 'USD' ? '0.15' : '2.500'}
            error={errors.pricePerMinuteNative?.message}
            {...register('pricePerMinuteNative')}
          />
        </div>

        {/* Salary preview */}
        {priceVN > 0 && (
          <div className="bg-slate-50 rounded-xl p-4 space-y-1.5 text-xs text-slate-500 border border-slate-200/50">
            <p className="font-semibold text-slate-700 mb-2">Ví dụ lương (Giáo viên VN):</p>
            {[{ min: 25, level: 1.0 }, { min: 50, level: 1.2 }, { min: 50, level: 1.5 }].map((ex) => {
              const currency = watch('currency') || 'VND'
              const formattedPrice = currency === 'USD' ? `$${priceVN}` : `${priceVN.toLocaleString('vi-VN')}đ`
              const formattedSalary = currency === 'USD' ? `$${(ex.min * priceVN * ex.level).toFixed(2)}` : `${(ex.min * priceVN * ex.level).toLocaleString('vi-VN')}đ`
              return (
                <div key={`${ex.min}-${ex.level}`} className="flex justify-between">
                  <span>{ex.min} phút × {formattedPrice} × ×{ex.level}</span>
                  <span className="text-emerald-600 font-bold">= {formattedSalary}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* rates for other countries */}
        <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-white shadow-sm">
          <p className="text-sm font-bold text-slate-700">Giá theo các quốc gia khác</p>
          <div className="flex gap-2 items-end">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Chọn quốc gia</label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-3 py-2 text-sm min-h-[38px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="JP">Nhật Bản / Japan</option>
                <option value="KR">Hàn Quốc / Korea</option>
                <option value="US_EST">Mỹ / USA (EST)</option>
                <option value="US_PST">Mỹ / USA (PST)</option>
                <option value="US">Mỹ / USA (Chung)</option>
                <option value="UK">Anh / UK</option>
                <option value="CA">Canada</option>
                <option value="AU">Úc / Australia</option>
              </select>
            </div>
            <div className="w-[140px]">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Giá mỗi phút</label>
              <input
                type="text"
                placeholder={(watch('currency') || 'VND') === 'USD' ? '0.15' : '2.500'}
                value={newPriceForCountry}
                onChange={(e) => setNewPriceForCountry(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-3 py-2 text-sm min-h-[38px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const parsed = (watch('currency') || 'VND') === 'USD' ? Number(newPriceForCountry) : parseVietnameseNumber(newPriceForCountry)
                if (isNaN(parsed) || parsed <= 0) {
                  toast.error('Vui lòng nhập đơn giá hợp lệ')
                  return
                }
                setOtherPrices((prev) => ({
                  ...prev,
                  [selectedCountry]: parsed,
                }))
                setNewPriceForCountry('')
                toast.success('Đã thêm mức giá cho quốc gia ' + selectedCountry)
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition min-h-[38px]"
            >
              Thêm
            </button>
          </div>

          {/* List of configured other country rates */}
          {Object.keys(otherPrices).length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500">Mức giá đã thiết lập:</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(otherPrices).map(([code, val]) => {
                  const countryLabels: Record<string, string> = {
                    JP: 'Nhật Bản (JP)',
                    KR: 'Hàn Quốc (KR)',
                    US_EST: 'Mỹ EST (US_EST)',
                    US_PST: 'Mỹ PST (US_PST)',
                    US: 'Mỹ (US)',
                    UK: 'Anh (UK)',
                    CA: 'Canada (CA)',
                    AU: 'Úc (AU)',
                  }
                  return (
                    <div key={code} className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs">
                      <span className="font-bold text-slate-700">{countryLabels[code] || code}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-indigo-600">
                          {(watch('currency') || 'VND') === 'USD' ? `$${val}` : `${val.toLocaleString('vi-VN')}đ`}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setOtherPrices((prev) => {
                              const next = { ...prev }
                              delete next[code]
                              return next
                            })
                            toast.success('Đã xoá mức giá nước ' + code)
                          }}
                          className="text-rose-500 hover:text-rose-700 font-bold ml-1.5"
                        >
                          Xoá
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

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
                    <div className="space-y-1 text-xs">
                      <div>
                        <span className="text-slate-400 font-medium">VN: </span>
                        <span className="text-emerald-600 font-semibold">
                          {subject.currency === 'USD' 
                            ? `$${subject.pricePerMinuteVN ?? subject.pricePerMinute}` 
                            : `${(subject.pricePerMinuteVN ?? subject.pricePerMinute).toLocaleString('vi-VN')}đ`}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">PH: </span>
                        <span className="text-emerald-600 font-semibold">
                          {subject.currency === 'USD' 
                            ? `$${subject.pricePerMinutePH ?? subject.pricePerMinute}` 
                            : `${(subject.pricePerMinutePH ?? subject.pricePerMinute).toLocaleString('vi-VN')}đ`}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Bản xứ/Khác: </span>
                        <span className="text-emerald-600 font-semibold">
                          {subject.currency === 'USD' 
                            ? `$${subject.pricePerMinuteNative ?? subject.pricePerMinute}` 
                            : `${(subject.pricePerMinuteNative ?? subject.pricePerMinute).toLocaleString('vi-VN')}đ`}
                        </span>
                      </div>
                    </div>
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
