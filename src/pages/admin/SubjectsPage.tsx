import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { collection, addDoc, updateDoc, deleteField, doc, onSnapshot, query, orderBy, serverTimestamp, where, getDocs, runTransaction } from 'firebase/firestore'
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
import { ArrowDownAZ, ArrowUpZA, BookOpen, CircleDollarSign, Plus, Pencil, RefreshCw, Search, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react'
import { formatPricePerMinute } from '@/lib/constants'
import { getCanonicalSubjectRate } from '@/lib/countryPricing'
import { isDeletedSubject, isVisibleSubject } from '@/lib/subjectLifecycle'
import { sortSubjectsByName, SubjectSortDirection } from '@/lib/subjectSorting'
import { syncSubjectNameReferences } from '@/lib/subjectNameSync'

function parseCurrencyInput(str: string, currency: string): number {
  if (!str.trim()) return 0
  const curr = (currency || 'VND').toUpperCase()
  let clean = str.trim().replace(/\s+/g, '')

  if (curr === 'VND') {
    // VND mới chỉ nhận số nguyên và khoảng trắng. Vẫn đọc được dữ liệu nhập kiểu
    // cũ 2.500 / 2,500, nhưng từ chối 833.33 để không vô tình lưu thành 83 333.
    if (/^\d+$/.test(clean)) return Number(clean)
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(clean)) return Number(clean.replace(/[.,]/g, ''))
    return Number.NaN
  }

  // Ngoại tệ: khoảng trắng nhóm hàng nghìn, dấu chấm là phần thập phân.
  // Chấp nhận dấu phẩy cũ chỉ khi rõ ràng là nhóm hàng nghìn.
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(clean)) clean = clean.replace(/,/g, '')
  else if (clean.includes(',')) return Number.NaN
  if (!/^\d+(?:\.\d+)?$/.test(clean)) return Number.NaN
  return Number(clean)
}

function formatVietnameseNumberInput(val: number): string {
  if (val === undefined || val === null || isNaN(val)) return ''
  const parts = val.toString().split('.')
  const integerPart = Number(parts[0]).toLocaleString('en-US').replace(/,/g, ' ')
  if (parts.length > 1) {
    return `${integerPart}.${parts[1]}`
  }
  return integerPart
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
  const [isSyncingName, setIsSyncingName] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: subject?.name || '',
      status: subject?.status || 'active',
    },
  })

  const onSubmit = async (data: FormData) => {
    let sourceWasUpdated = false
    try {
      const pricePerMinute = parseCurrencyInput(priceInput, currency)
      if (!Number.isFinite(pricePerMinute) || pricePerMinute <= 0) {
        toast.error(currency === 'VND'
          ? 'VND chỉ nhận số nguyên; dùng khoảng trắng để tách hàng nghìn, ví dụ 2 500'
          : `${currency} dùng dấu chấm cho phần thập phân, ví dụ 5.15`)
        return
      }

      if (isEdit && subject) {
        const normalizedName = data.name.trim()
        const shouldSyncName = normalizedName !== subject.name.trim()
          || subject.nameSyncPending === true
          || subject.nameSyncedValue !== normalizedName
        const updatePayload = {
          ...data,
          name: normalizedName,
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
          ...(shouldSyncName ? { nameSyncPending: true } : {}),
          updatedAt: serverTimestamp()
        }
        await updateDoc(doc(db, 'subjects', subject.id), updatePayload)
        sourceWasUpdated = true

        let syncedReferences = 0
        if (shouldSyncName) {
          const syncSummary = await syncSubjectNameReferences(subject.id, normalizedName)
          syncedReferences = syncSummary.total
          await updateDoc(doc(db, 'subjects', subject.id), {
            nameSyncPending: false,
            nameSyncedValue: normalizedName,
            nameSyncedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
          await addDoc(collection(db, 'adminLogs'), {
            adminId: useAuthStore.getState().user?.uid || '',
            action: 'SYNC_SUBJECT_NAME',
            targetType: 'subject',
            targetId: subject.id,
            changes: {
              previousName: subject.name,
              nextName: normalizedName,
              updatedReferences: syncSummary,
              financialSnapshotsChanged: false,
            },
            createdAt: serverTimestamp(),
          })
        }
        
        // Giá môn là dữ liệu danh mục cho các giao dịch mới. Không quét toàn bộ
        // học viên/lịch sử và không hồi tố bảng lương khi chỉ sửa danh mục:
        // các gói đã mua, buổi đã duyệt và bảng lương phải giữ nguyên snapshot.
        
        toast.success(shouldSyncName
          ? `Đã đổi tên môn và đồng bộ ${syncedReferences.toLocaleString('vi-VN')} nơi liên quan; số dư và lịch sử tài chính được giữ nguyên`
          : 'Đã cập nhật môn học; gói đã mua và lịch sử tài chính được giữ nguyên')
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
      toast.error(isEdit
        ? sourceWasUpdated
          ? 'Tên môn đã được lưu nhưng đồng bộ chưa hoàn tất. Giữ cửa sổ này và bấm Lưu thay đổi lần nữa để tiếp tục an toàn.'
          : 'Không thể lưu thay đổi; dữ liệu hiện tại chưa bị thay đổi.'
        : 'Có lỗi xảy ra khi cập nhật môn học')
    }
  }

  const handleRepairNameSync = async () => {
    if (!subject) return

    const normalizedName = subject.name.trim()
    setIsSyncingName(true)
    try {
      // Đường sửa dữ liệu riêng: không ghi lại giá, trạng thái hay cấu hình
      // quốc gia cũ chỉ để đồng bộ các snapshot tên môn.
      await updateDoc(doc(db, 'subjects', subject.id), {
        nameSyncPending: true,
        updatedAt: serverTimestamp(),
      })

      const syncSummary = await syncSubjectNameReferences(subject.id, normalizedName)

      await updateDoc(doc(db, 'subjects', subject.id), {
        nameSyncPending: false,
        nameSyncedValue: normalizedName,
        nameSyncedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      await addDoc(collection(db, 'adminLogs'), {
        adminId: useAuthStore.getState().user?.uid || '',
        action: 'REPAIR_SUBJECT_NAME_SYNC',
        targetType: 'subject',
        targetId: subject.id,
        changes: {
          subjectName: normalizedName,
          updatedReferences: syncSummary,
          financialSnapshotsChanged: false,
        },
        createdAt: serverTimestamp(),
      })

      toast.success(`Đã đồng bộ lại tên môn tại ${syncSummary.total.toLocaleString('vi-VN')} nơi; giá, phút, kim cương và lương không thay đổi`)
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Đồng bộ tên chưa hoàn tất. Có thể bấm “Đồng bộ lại tên” để chạy tiếp an toàn; dữ liệu tài chính không bị thay đổi.')
    } finally {
      setIsSyncingName(false)
    }
  }

  const needsNameSyncRepair = !!subject && (
    subject.nameSyncPending === true
    || subject.nameSyncedValue !== subject.name.trim()
  )

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Chỉnh sửa môn học' : 'Thêm môn học'}
      footer={
        <div className="flex flex-wrap gap-3 justify-end">
          {needsNameSyncRepair && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleRepairNameSync}
              loading={isSyncingName}
              disabled={isSubmitting}
            >
              <RefreshCw className="h-4 w-4" />
              Đồng bộ lại tên
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button form="subject-form" type="submit" loading={isSubmitting} disabled={isSyncingName}>
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
                  placeholder={currency === 'VND' ? '2 500' : '5.15'}
                  className="w-full rounded-lg bg-white border border-slate-200 text-slate-900 pl-3 pr-12 py-2 text-sm min-h-[42px] focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">/ phút</span>
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                {currency === 'VND'
                  ? 'VND: số nguyên, dùng khoảng trắng để tách hàng nghìn (2 500).'
                  : `${currency}: dùng khoảng trắng để tách hàng nghìn và dấu chấm cho phần thập phân (5.15).`}
              </p>
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
  const [deleteInfo, setDeleteInfo] = useState<{
    studentCount: number
    lessonCount: number
    bookingCount: number
    packageCount: number
    requestCount: number
    incomplete?: boolean
  } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [sortDirection, setSortDirection] = useState<SubjectSortDirection>('asc')

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'subjects'), orderBy('createdAt', 'desc')),
      (snap) => {
        setSubjects(snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Subject))
          .filter(isVisibleSubject))
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
      getDocs(query(collection(db, 'bookingRequests'), where('subjectId', '==', deletingSubject.id))),
      getDocs(query(collection(db, 'topUpPackages'), where('subjectId', '==', deletingSubject.id))),
      getDocs(query(collection(db, 'topUpRequests'), where('subjectId', '==', deletingSubject.id))),
    ]).then(([sSnap, lSnap, bSnap, pSnap, rSnap]) => {
      if (!cancelled) {
        setDeleteInfo({
          studentCount: sSnap.size,
          lessonCount: lSnap.size,
          bookingCount: bSnap.size,
          packageCount: pSnap.size,
          requestCount: rSnap.size,
        })
      }
    }).catch((error) => {
      console.error('Unable to inspect all subject references:', error)
      if (!cancelled) {
        setDeleteInfo({
          studentCount: 0,
          lessonCount: 0,
          bookingCount: 0,
          packageCount: 0,
          requestCount: 0,
          incomplete: true,
        })
      }
    })
    return () => { cancelled = true }
  }, [deletingSubject])

  const handleDelete = async () => {
    if (!deletingSubject) return
    setDeleting(true)
    try {
      const subjectRef = doc(db, 'subjects', deletingSubject.id)
      const packageSnapshot = await getDocs(
        query(collection(db, 'topUpPackages'), where('subjectId', '==', deletingSubject.id)),
      )
      if (packageSnapshot.size > 450) {
        throw new Error('TOO_MANY_DEPENDENT_PACKAGES')
      }

      const logRef = doc(collection(db, 'adminLogs'))
      const result = await runTransaction(db, async (transaction) => {
        const [subjectSnapshot, ...packageSnapshots] = await Promise.all([
          transaction.get(subjectRef),
          ...packageSnapshot.docs.map((packageDocument) => transaction.get(packageDocument.ref)),
        ])

        if (!subjectSnapshot.exists()) throw new Error('SUBJECT_NOT_FOUND')

        const currentSubject = { id: subjectSnapshot.id, ...subjectSnapshot.data() } as Subject
        if (isDeletedSubject(currentSubject)) return { alreadyDeleted: true, pausedPackages: 0 }

        const rate = getCanonicalSubjectRate(currentSubject)
        transaction.update(subjectRef, {
          status: 'inactive',
          isDeleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: user?.uid || '',
          updatedAt: serverTimestamp(),
        })

        let pausedPackages = 0
        packageSnapshots.forEach((packageDocument) => {
          if (!packageDocument.exists() || packageDocument.data().status !== 'active') return
          transaction.update(packageDocument.ref, {
            status: 'inactive',
            updatedAt: serverTimestamp(),
          })
          pausedPackages += 1
        })

        transaction.set(logRef, {
          adminId: user?.uid || '',
          action: 'ARCHIVE_SUBJECT',
          targetType: 'subject',
          targetId: deletingSubject.id,
          changes: {
            deletionMode: 'soft',
            name: currentSubject.name,
            pricePerMinute: rate.price,
            currency: rate.currency,
            previousStatus: currentSubject.status,
            studentsReferenced: deleteInfo?.studentCount ?? null,
            lessonsReferenced: deleteInfo?.lessonCount ?? null,
            bookingsReferenced: deleteInfo?.bookingCount ?? null,
            topUpRequestsReferenced: deleteInfo?.requestCount ?? null,
            pausedPackageCount: pausedPackages,
          },
          createdAt: serverTimestamp(),
        })

        return { alreadyDeleted: false, pausedPackages }
      })

      if (result.alreadyDeleted) toast.info('Môn học này đã được xoá khỏi danh mục trước đó')
      else {
        const packageNote = result.pausedPackages > 0
          ? `; đã tạm dừng ${result.pausedPackages} gói nạp đang mở`
          : ''
        toast.success(`Đã xoá môn khỏi danh mục, toàn bộ dữ liệu cũ vẫn được giữ${packageNote}`)
      }
      setDeletingSubject(null)
    } catch (err) {
      console.error(err)
      if (err instanceof Error && err.message === 'SUBJECT_NOT_FOUND') {
        toast.error('Môn học không còn tồn tại; không có dữ liệu nào bị thay đổi')
      } else if (err instanceof Error && err.message === 'TOO_MANY_DEPENDENT_PACKAGES') {
        toast.error('Có quá nhiều gói liên quan; vui lòng liên hệ kỹ thuật để lưu trữ an toàn')
      } else {
        toast.error('Không thể xoá an toàn; dữ liệu hiện tại vẫn được giữ nguyên')
      }
    } finally {
      setDeleting(false)
    }
  }

  const filtered = sortSubjectsByName(
    subjects.filter((subject) => subject.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))),
    sortDirection,
  )

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
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                <th
                  className="px-5 py-3 text-left text-xs font-medium uppercase text-slate-500"
                  aria-sort={sortDirection === 'asc' ? 'ascending' : 'descending'}
                >
                  <button
                    type="button"
                    onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    title={sortDirection === 'asc' ? 'Đang xếp A-Z, bấm để đổi Z-A' : 'Đang xếp Z-A, bấm để đổi A-Z'}
                  >
                    <span>Tên môn</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 font-bold normal-case text-indigo-700">
                      {sortDirection === 'asc' ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpZA className="h-3.5 w-3.5" />}
                      {sortDirection === 'asc' ? 'A-Z' : 'Z-A'}
                    </span>
                  </button>
                </th>
                {['Giá / phút', 'Trạng thái', 'Hành động'].map((heading) => (
                  <th key={heading} className="px-5 py-3 text-left text-xs font-medium uppercase text-slate-500">{heading}</th>
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
          </div>
        </Card>
      )}

      {showAdd && <SubjectModal onClose={() => setShowAdd(false)} />}
      {editSubject && <SubjectModal subject={editSubject} onClose={() => setEditSubject(null)} />}

      {deletingSubject && (
        <ConfirmDialog
          open
          onClose={() => setDeletingSubject(null)}
          onConfirm={handleDelete}
          title={`Xoá môn "${deletingSubject.name}" khỏi danh mục?`}
          confirmLabel="Xoá khỏi danh mục"
          confirmVariant="danger"
          loading={deleting}
        >
          {deleteInfo === null ? (
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-500 text-center">
              Đang kiểm tra dữ liệu liên quan...
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-bold">Dữ liệu đã có sẽ không bị xoá.</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-700">
                    Hệ thống chỉ ẩn môn khỏi danh mục tạo mới. Tên môn, đơn giá, học viên, lịch học, buổi đã duyệt, lương và yêu cầu cũ vẫn được giữ dưới dạng dữ liệu lịch sử.
                  </p>
                </div>
              </div>
              {deleteInfo.incomplete ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Chưa tải đủ số lượng tham chiếu để hiển thị, nhưng thao tác vẫn dùng xoá mềm và không xoá các bản ghi lịch sử.</span>
                </div>
              ) : (
                <ul className="grid gap-1 text-xs sm:grid-cols-2">
                  <li>Hồ sơ chính: <strong>{deleteInfo.studentCount}</strong></li>
                  <li>Buổi học: <strong>{deleteInfo.lessonCount}</strong></li>
                  <li>Lịch đặt: <strong>{deleteInfo.bookingCount}</strong></li>
                  <li>Yêu cầu nạp: <strong>{deleteInfo.requestCount}</strong></li>
                  <li className="sm:col-span-2">Gói nạp liên quan: <strong>{deleteInfo.packageCount}</strong> — gói đang mở sẽ chuyển sang tạm dừng.</li>
                </ul>
              )}
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
