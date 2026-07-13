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
import { BookOpen, Plus, Pencil, Search, Trash2, Globe, Info, Lock } from 'lucide-react'

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
  status: z.enum(['active', 'inactive']),
})
type FormData = z.infer<typeof schema>

export const COUNTRY_CURRENCY_MAP: Record<string, { name: string; currency: string; symbol: string; flag: string }> = {
  VN: { name: 'Việt Nam', currency: 'VND', symbol: 'đ', flag: '🇻🇳' },
  PH: { name: 'Philippines', currency: 'PHP', symbol: '₱', flag: '🇵🇭' },
  US: { name: 'Hoa Kỳ', currency: 'USD', symbol: '$', flag: '🇺🇸' },
  JP: { name: 'Nhật Bản', currency: 'JPY', symbol: '¥', flag: '🇯🇵' },
  KR: { name: 'Hàn Quốc', currency: 'KRW', symbol: '₩', flag: '🇰🇷' },
  UK: { name: 'Anh', currency: 'GBP', symbol: '£', flag: '🇬🇧' },
  CA: { name: 'Canada', currency: 'CAD', symbol: 'C$', flag: '🇨🇦' },
  AU: { name: 'Úc', currency: 'AUD', symbol: 'A$', flag: '🇦🇺' },
}

function SubjectModal({ subject, onClose }: { subject?: Subject; onClose: () => void }) {
  const isEdit = !!subject
  const [countryPrices, setCountryPrices] = useState<Record<string, { price: number; currency: string; isDefault?: boolean }>>(() => {
    if (subject?.countryPrices) return subject.countryPrices;
    const initial: Record<string, { price: number; currency: string; isDefault?: boolean }> = {
      VN: { price: subject?.pricePerMinuteVN ?? subject?.pricePerMinute ?? 2500, currency: subject?.currency || 'VND', isDefault: true }
    };
    if (subject?.pricePerMinutePH) {
      initial.PH = { price: subject.pricePerMinutePH, currency: 'PHP' };
    }
    if (subject?.otherCountriesPrices) {
      Object.entries(subject.otherCountriesPrices).forEach(([code, val]) => {
        initial[code] = { price: val, currency: COUNTRY_CURRENCY_MAP[code]?.currency || 'USD' };
      });
    }
    return initial;
  });

  const [selectedCountry, setSelectedCountry] = useState('PH')
  const [priceInput, setPriceInput] = useState('')
  const [editingCountry, setEditingCountry] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      name: subject?.name || '',
      status: subject?.status || 'active',
    },
  })

  // Ghi nhận giá đang nhập dở (nếu có) vào countryPrices để không bị mất khi bấm "Lưu thay đổi"
  const saveCountryPrice = (): Record<string, { price: number; currency: string; isDefault?: boolean }> | null => {
    const currency = COUNTRY_CURRENCY_MAP[selectedCountry].currency
    const parsed = currency === 'USD' ? parseFloat(priceInput) : parseVietnameseNumber(priceInput)
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('Vui lòng nhập đơn giá hợp lệ')
      return null
    }
    const next = {
      ...countryPrices,
      [selectedCountry]: {
        price: parsed,
        currency,
        isDefault: selectedCountry === 'VN'
      }
    }
    setCountryPrices(next)
    setPriceInput('')
    setEditingCountry(null)
    return next
  }

  const onSubmit = async (data: FormData) => {
    try {
      // Nếu còn giá đang nhập dở chưa bấm "Lưu"/"Thêm", tự động ghi nhận trước khi lưu form
      let effectivePrices = countryPrices
      if (priceInput.trim()) {
        const committed = saveCountryPrice()
        if (!committed) return
        effectivePrices = committed
      }

      if (!effectivePrices.VN) {
        toast.error('Vui lòng thiết lập đơn giá mặc định cho Việt Nam')
        return
      }

      const newRateVN = effectivePrices.VN.price;
      const newRatePH = effectivePrices.PH?.price || newRateVN;
      const newRateNative = effectivePrices.US?.price || newRateVN;
      const newCurrency = effectivePrices.VN.currency || 'VND';

      const other: Record<string, number> = {}
      Object.entries(effectivePrices).forEach(([c, i]) => {
        if (c !== 'VN' && c !== 'PH') {
          other[c] = i.price
        }
      })

      if (isEdit && subject) {
        // 1. Update the subject itself
        const updatePayload = {
          ...data,
          pricePerMinute: newRateVN,
          pricePerMinuteVN: newRateVN,
          pricePerMinutePH: newRatePH,
          pricePerMinuteNative: newRateNative,
          otherCountriesPrices: other,
          countryPrices: effectivePrices,
          currency: newCurrency,
          updatedAt: serverTimestamp()
        }
        await updateDoc(doc(db, 'subjects', subject.id), updatePayload)
        
        // 2. Sync to related students, lessons, and payrolls in parallel
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
                otherCountriesPrices: other,
                countryPrices: effectivePrices,
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
            updateObj.otherCountriesPrices = other;
            updateObj.countryPrices = effectivePrices;
            updateObj.currency = newCurrency;
          }

          return updateDoc(doc(db, 'students', studentDoc.id), updateObj);
        }).filter(Boolean) as Promise<any>[];

        // Sync denormalized subject name on teachers and booking requests when renamed
        const nameChanged = data.name !== subject.name;
        const teacherUpdates: Promise<any>[] = [];
        const bookingUpdates: Promise<any>[] = [];
        if (nameChanged) {
          teachersSnap.docs.forEach((tDoc) => {
            const t = tDoc.data() as any;
            const subjectIds: string[] = t.subjectIds || [];
            const idx = subjectIds.indexOf(subject.id);
            if (idx === -1) return;
            // subjectNames is index-aligned with subjectIds; rebuild to avoid sparse entries
            const subjectNames = subjectIds.map((sid, i) =>
              sid === subject.id ? data.name : (t.subjectNames?.[i] ?? '')
            );
            teacherUpdates.push(updateDoc(doc(db, 'teachers', tDoc.id), { subjectNames }));
          });

          const bookingsSnap = await getDocs(
            query(collection(db, 'bookingRequests'), where('subjectId', '==', subject.id))
          );
          bookingsSnap.docs.forEach((bDoc) => {
            if (bDoc.data().subjectName !== data.name) {
              bookingUpdates.push(updateDoc(doc(db, 'bookingRequests', bDoc.id), { subjectName: data.name }));
            }
          });
        }

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
          let cur = newCurrency;
          const rateObj = effectivePrices[teacherCountry] || effectivePrices['VN'];
          if (rateObj) {
            rate = rateObj.price;
            cur = rateObj.currency;
          }

          const minutes = Number(lesson.minutes) || 0;
          const teacherLevel = Number(lesson.teacherLevel) || 1;
          const newSalary = lesson.status === 'approved' ? calculateSalary(minutes, rate, teacherLevel, cur) : 0;
          
          lessonUpdates.push(
            updateDoc(doc(db, 'lessons', lessonId), {
              subjectName: data.name, // Sync the name change!
              pricePerMinute: rate,
              salary: newSalary,
              currency: cur,
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
                  currency: cur,
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
          Promise.all(payrollUpdates),
          Promise.all(teacherUpdates),
          Promise.all(bookingUpdates)
        ]);
        
        toast.success('Đã cập nhật môn học và đồng bộ dữ liệu thành công!')
      } else {
        const addPayload = {
          ...data,
          pricePerMinute: newRateVN,
          pricePerMinuteVN: newRateVN,
          pricePerMinutePH: newRatePH,
          pricePerMinuteNative: newRateNative,
          otherCountriesPrices: other,
          countryPrices: effectivePrices,
          currency: newCurrency,
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
      size="lg"
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
      <form id="subject-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
        <Input label="Tên môn học *" placeholder="Tiếng Anh" error={errors.name?.message} {...register('name')} />
        
        {/* Giá giáo viên theo quốc gia & tiền tệ */}
        <div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-slate-50/50">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Giá giáo viên theo quốc gia & tiền tệ</p>
              <p className="text-xs text-slate-500 mt-0.5">Mỗi quốc gia sẽ có tiền tệ và đơn giá riêng.</p>
            </div>
          </div>

          {/* Form to add/edit country price */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Chọn quốc gia</label>
              <select
                value={selectedCountry}
                disabled={editingCountry !== null}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full rounded-lg bg-slate-50 border border-slate-200 text-slate-900 px-3 py-2 text-sm min-h-[42px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Object.entries(COUNTRY_CURRENCY_MAP).map(([code, info]) => (
                  <option key={code} value={code}>
                    {info.flag} {info.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Tiền tệ</label>
              <div className="w-full rounded-lg bg-slate-100 border border-slate-200 text-slate-500 px-3 py-2.5 text-sm min-h-[42px] flex items-center justify-between">
                <span>
                  {COUNTRY_CURRENCY_MAP[selectedCountry]?.currency} ({COUNTRY_CURRENCY_MAP[selectedCountry]?.symbol})
                </span>
                <Lock className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Giá mỗi phút *</label>
              <div className="relative">
                <input
                  type="text"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (saveCountryPrice()) {
                        toast.success(editingCountry ? 'Đã cập nhật đơn giá!' : 'Đã thêm đơn giá mới!')
                      }
                    }
                  }}
                  placeholder={COUNTRY_CURRENCY_MAP[selectedCountry]?.currency === 'USD' ? '0.12' : '2.500'}
                  className="w-full rounded-lg bg-white border border-slate-200 text-slate-900 pl-3 pr-12 py-2 text-sm min-h-[42px] focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">/ phút</span>
              </div>
            </div>
            <div>
              <button
                type="button"
                onClick={() => {
                  if (saveCountryPrice()) {
                    toast.success(editingCountry ? 'Đã cập nhật đơn giá!' : 'Đã thêm đơn giá mới!')
                  }
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition min-h-[42px] flex items-center justify-center gap-1 shadow-sm shadow-indigo-100"
              >
                {editingCountry ? 'Lưu' : <><Plus className="w-4 h-4" /> Thêm</>}
              </button>
            </div>
          </div>

          {/* Table display */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-150 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Danh sách quốc gia đã thêm ({Object.keys(countryPrices).length})
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-150 uppercase tracking-wider">
                    <th className="px-4 py-3">Quốc gia</th>
                    <th className="px-4 py-3">Tiền tệ</th>
                    <th className="px-4 py-3">Giá mỗi phút</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {Object.entries(countryPrices).map(([code, info]) => {
                    const countryInfo = COUNTRY_CURRENCY_MAP[code]
                    if (!countryInfo) return null
                    const formattedPrice = info.currency === 'USD' 
                      ? `$${info.price}` 
                      : info.currency === 'PHP'
                        ? `₱${info.price}`
                        : info.currency === 'JPY'
                          ? `¥${info.price}`
                          : `${info.price?.toLocaleString('vi-VN')} đ`

                    return (
                      <tr key={code} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 flex items-center gap-2">
                          <span className="text-base select-none">{countryInfo.flag}</span>
                          <span className="font-bold text-slate-800">{countryInfo.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-600">{info.currency} ({countryInfo.symbol})</span>
                            {info.isDefault && (
                              <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full text-[9px]">
                                Mặc định
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-900 font-bold">
                          {formattedPrice}/phút
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCountry(code)
                              setSelectedCountry(code)
                              setPriceInput(info.currency === 'USD' ? String(info.price) : formatVietnameseNumberInput(info.price))
                            }}
                            className="text-indigo-600 hover:text-indigo-800 p-1 rounded hover:bg-indigo-50 transition"
                          >
                            <Pencil className="w-3.5 h-3.5 inline-block" />
                          </button>
                          <button
                            type="button"
                            disabled={code === 'VN'}
                            onClick={() => {
                              setCountryPrices((prev) => {
                                const next = { ...prev }
                                delete next[code]
                                return next
                              })
                              toast.success('Đã xoá mức giá của ' + countryInfo.name)
                            }}
                            className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline-block" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3.5 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-[11px] text-blue-800 leading-relaxed font-medium">
              <p className="font-bold">Giá được tính theo đơn vị tiền tệ của từng quốc gia.</p>
              <p className="mt-0.5 text-blue-600/90">Ví dụ: Giáo viên Philippines: ₱6/phút, Giáo viên Mỹ: $0.12/phút,...</p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-650 mb-1.5">Trạng thái</label>
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
                    <div className="flex flex-wrap gap-1.5 max-w-[320px]">
                      {subject.countryPrices ? (
                        Object.entries(subject.countryPrices).map(([code, info]) => {
                          const formattedPrice = info.currency === 'USD' 
                            ? `$${info.price}` 
                            : info.currency === 'PHP'
                              ? `₱${info.price}`
                              : info.currency === 'JPY'
                                ? `¥${info.price}`
                                : `${info.price?.toLocaleString('vi-VN')}đ`
                          return (
                            <span key={code} className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200/60 rounded px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              <span>{COUNTRY_CURRENCY_MAP[code]?.flag}</span>
                              <span className="font-bold text-slate-800">{code}:</span>
                              <span className="text-emerald-650 font-bold">{formattedPrice}</span>
                            </span>
                          )
                        })
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200/60 rounded px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            <span>🇻🇳</span>
                            <span className="font-bold text-slate-800">VN:</span>
                            <span className="text-emerald-650 font-bold">
                              {subject.currency === 'USD' 
                                ? `$${subject.pricePerMinuteVN ?? subject.pricePerMinute}` 
                                : `${(subject.pricePerMinuteVN ?? subject.pricePerMinute ?? 2500).toLocaleString('vi-VN')}đ`}
                            </span>
                          </span>
                          {(subject.pricePerMinutePH ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200/60 rounded px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              <span>🇵🇭</span>
                              <span className="font-bold text-slate-800">PH:</span>
                              <span className="text-emerald-650 font-bold">
                                {subject.currency === 'USD' 
                                  ? `$${subject.pricePerMinutePH}` 
                                  : `${(subject.pricePerMinutePH ?? 2500).toLocaleString('vi-VN')}đ`}
                              </span>
                            </span>
                          )}
                        </>
                      )}
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
