import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { collection, addDoc, updateDoc, deleteDoc, deleteField, doc, onSnapshot, query, orderBy, serverTimestamp, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
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
import { BookOpen, CircleDollarSign, Plus, Pencil, Search, Trash2 } from 'lucide-react'
import { formatPricePerMinute } from '@/lib/constants'
import { getCanonicalSubjectRate } from '@/lib/countryPricing'
import { sortSubjectsByName } from '@/lib/subjectSorting'

function parseVietnameseNumber(str: string): number {
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

function formatVietnameseNumberInput(val: number): string {
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
  status: z.enum(['active', 'inactive']),
})
type FormData = z.infer<typeof schema>

const CURRENCY_OPTIONS = ['VND', 'PHP', 'USD', 'JPY', 'KRW', 'GBP', 'CAD', 'AUD'] as const

function SubjectModal({ subject, onClose }: { subject?: Subject; onClose: () => void }) {
  const isEdit = !!subject
  const initialRate = subject ? getCanonicalSubjectRate(subject) : { price: 2500, currency: 'VND' }
  const [currency, setCurrency] = useState(initialRate.currency)
  const [priceInput, setPriceInput] = useState(() => formatVietnameseNumberInput(initialRate.price))

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: subject?.name || '',
      status: subject?.status || 'active',
    },
  })

  const onSubmit = async (data: FormData) => {
    try {
      const pricePerMinute = parseVietnameseNumber(priceInput)
      if (!Number.isFinite(pricePerMinute) || pricePerMinute <= 0) {
        toast.error('Vui lòng nhập một đơn giá mỗi phút hợp lệ')
        return
      }

      if (isEdit && subject) {
        const updatePayload = {
          ...data,
          pricePerMinute,
          currency,
          // Khi Admin chủ động lưu môn học theo quy tắc mới, xóa cấu hình giá
          // nhiều quốc gia cũ trên chính môn này. Snapshot gói học/lịch sử đã
          // phát sinh vẫn giữ nguyên và không bị quét sửa hồi tố.
          pricePerMinuteVN: deleteField(),
          pricePerMinutePH: deleteField(),
          pricePerMinuteNative: deleteField(),
          otherCountriesPrices: deleteField(),
          countryPrices: deleteField(),
          updatedAt: serverTimestamp()
        }
        await updateDoc(doc(db, 'subjects', subject.id), updatePayload)
        
        // Giá môn là dữ liệu danh mục cho các giao dịch mới. Không quét toàn bộ
        // học viên/lịch sử và không hồi tố bảng lương khi chỉ sửa danh mục:
        // các gói đã mua, buổi đã duyệt và bảng lương phải giữ nguyên snapshot.
        
        toast.success('Đã cập nhật môn học; gói đã mua và lịch sử tài chính được giữ nguyên')
      } else {
        const addPayload = {
          ...data,
          pricePerMinute,
          currency,
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
      <form id="subject-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Input label="Tên môn học *" placeholder="Tiếng Anh" error={errors.name?.message} {...register('name')} />
        
        <div className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
              <CircleDollarSign className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Đơn giá mặc định của môn học</p>
              <p className="text-xs text-slate-500 mt-0.5">Mỗi môn chỉ có một tiền tệ và một giá mỗi phút, áp dụng cho mọi gia sư.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[180px_minmax(0,1fr)]">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-500">Tiền tệ mặc định *</label>
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                className="w-full rounded-lg bg-slate-50 border border-slate-200 text-slate-900 px-3 py-2 text-sm min-h-[42px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CURRENCY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-500">Giá mỗi phút *</label>
              <div className="relative">
                <input
                  type="text"
                  value={priceInput}
                  onChange={(event) => setPriceInput(event.target.value)}
                  placeholder={currency === 'VND' ? '2.500' : '0,12'}
                  className="w-full rounded-lg bg-white border border-slate-200 text-slate-900 pl-3 pr-12 py-2 text-sm min-h-[42px] focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">/ phút</span>
              </div>
            </div>
          </div>
          {subject && (subject.countryPrices || subject.pricePerMinutePH || subject.pricePerMinuteNative || subject.otherCountriesPrices) && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-800">
              Môn này đang có cấu hình nhiều mức giá từ phiên bản cũ. Khi bấm “Lưu thay đổi”, hệ thống chỉ giữ lại đơn giá mặc định ở trên; gói đã mua, buổi đã duyệt và bảng lương cũ không bị thay đổi.
            </p>
          )}
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
        setSubjects(sortSubjectsByName(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subject))))
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
    if (!deletingSubject) {
      const timer = window.setTimeout(() => setDeleteInfo(null), 0)
      return () => window.clearTimeout(timer)
    }
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

  const filtered = sortSubjectsByName(subjects.filter(s => s.name.toLowerCase().includes(search.toLowerCase())))

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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
                        {(() => {
                          const rate = getCanonicalSubjectRate(subject)
                          return formatPricePerMinute(rate.price, rate.currency)
                        })()}
                      </span>
                      {(subject.countryPrices || subject.pricePerMinutePH || subject.pricePerMinuteNative || subject.otherCountriesPrices) && (
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">Dữ liệu giá cũ · lưu lại để chuẩn hóa</span>
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
