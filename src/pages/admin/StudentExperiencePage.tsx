import { Children, FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, runTransaction,
  serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import {
  Check, Clock3, CreditCard, Gift, ImagePlus, Package, Pencil,
  Plus, QrCode, Star, Trash2, X,
} from 'lucide-react'
import { db, storage } from '@/lib/firebase'
import {
  PaymentSettings, RewardCategory, RewardGift, RewardRedemption,
  Student, StudentSubject, Subject, TopUpPackage, TopUpRequest,
} from '@/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { formatMoney } from '@/lib/constants'

type Tab = 'gifts' | 'redemptions' | 'payment' | 'requests'
type GiftForm = Omit<RewardGift, 'id' | 'createdAt' | 'updatedAt'>
type PackageForm = Omit<TopUpPackage, 'id' | 'subjectName' | 'createdAt' | 'updatedAt'>
type PackageErrors = Partial<Record<'name' | 'subjectId' | 'sessions' | 'minutesPerSession' | 'totalMinutes' | 'price' | 'validityDays', string>>
type DeleteTarget = { kind: 'gift' | 'package'; id: string; name: string } | null

const emptyGift: GiftForm = {
  name: '', description: '', category: 'other' as Exclude<RewardCategory, 'all'>,
  points: 5, stock: 1, status: 'active' as const, featured: false, imageURL: '',
}

const emptyPackage: PackageForm = {
  name: '', subjectId: '', totalMinutes: 500, sessions: 10,
  minutesPerSession: 50, price: 0, currency: 'VND', validityDays: 60,
  description: '', status: 'active' as const, featured: false,
}

export function StudentExperiencePage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('gifts')
  const [gifts, setGifts] = useState<RewardGift[]>([])
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([])
  const [packages, setPackages] = useState<TopUpPackage[]>([])
  const [requests, setRequests] = useState<TopUpRequest[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [settings, setSettings] = useState<PaymentSettings>({ bankName: '', accountName: '', accountNumber: '', qrImageURL: '', transferPrefix: 'NAP' })
  const [giftModal, setGiftModal] = useState(false)
  const [packageModal, setPackageModal] = useState(false)
  const [editingGift, setEditingGift] = useState<RewardGift | null>(null)
  const [editingPackage, setEditingPackage] = useState<TopUpPackage | null>(null)
  const [giftForm, setGiftForm] = useState(emptyGift)
  const [packageForm, setPackageForm] = useState(emptyPackage)
  const [packageErrors, setPackageErrors] = useState<PackageErrors>({})
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState('')
  const [uploading, setUploading] = useState<'gift' | 'qr' | ''>('')
  const [dataError, setDataError] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => onSnapshot(collection(db, 'rewardCatalog'), (snap) => setGifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as RewardGift)).sort((a, b) => a.points - b.points)), () => setDataError(true)), [])
  useEffect(() => onSnapshot(collection(db, 'rewardRedemptions'), (snap) => setRedemptions(snap.docs.map(d => ({ id: d.id, ...d.data() } as RewardRedemption)).sort(byNewest)), () => setDataError(true)), [])
  useEffect(() => onSnapshot(collection(db, 'topUpPackages'), (snap) => setPackages(snap.docs.map(d => ({ id: d.id, ...d.data() } as TopUpPackage)).sort((a, b) => a.price - b.price)), () => setDataError(true)), [])
  useEffect(() => onSnapshot(collection(db, 'topUpRequests'), (snap) => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as TopUpRequest)).sort(byNewest)), () => setDataError(true)), [])
  useEffect(() => onSnapshot(collection(db, 'subjects'), (snap) => setSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)).filter(s => s.status === 'active'))), [])
  useEffect(() => onSnapshot(doc(db, 'paymentSettings', 'main'), (snap) => {
    if (snap.exists()) setSettings(snap.data() as PaymentSettings)
  }), [])

  const pendingRedemptions = useMemo(() => redemptions.filter(r => r.status === 'pending'), [redemptions])
  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'pending'), [requests])

  const openGift = (gift?: RewardGift) => {
    setEditingGift(gift || null)
    setGiftForm(gift ? {
      name: gift.name, description: gift.description || '', category: gift.category,
      points: gift.points, stock: gift.stock, status: gift.status,
      featured: !!gift.featured, imageURL: gift.imageURL || '',
    } : emptyGift)
    setGiftModal(true)
  }

  const saveGift = async (event: FormEvent) => {
    event.preventDefault()
    if (!giftForm.name.trim() || giftForm.points < 1 || giftForm.stock < 0) return toast.error('Vui lòng nhập đúng tên, số sao và tồn kho')
    setSaving(true)
    try {
      const payload = { ...giftForm, name: giftForm.name.trim(), description: (giftForm.description || '').trim(), updatedAt: serverTimestamp() }
      if (editingGift) await updateDoc(doc(db, 'rewardCatalog', editingGift.id), payload)
      else await addDoc(collection(db, 'rewardCatalog'), { ...payload, createdAt: serverTimestamp() })
      toast.success(editingGift ? 'Đã cập nhật quà tặng' : 'Đã thêm quà tặng')
      setGiftModal(false)
    } catch (error) { console.error(error); toast.error('Không thể lưu quà tặng') }
    finally { setSaving(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const collectionName = deleteTarget.kind === 'gift' ? 'rewardCatalog' : 'topUpPackages'
      await deleteDoc(doc(db, collectionName, deleteTarget.id))
      toast.success(deleteTarget.kind === 'gift' ? 'Đã xóa quà tặng' : 'Đã xóa gói nạp')
      setDeleteTarget(null)
    } catch (error) {
      console.error(error)
      toast.error(deleteTarget.kind === 'gift' ? 'Không thể xóa quà tặng' : 'Không thể xóa gói nạp')
    } finally {
      setDeleting(false)
    }
  }

  const openPackage = (item?: TopUpPackage) => {
    setEditingPackage(item || null)
    setPackageForm(item ? {
      name: item.name, subjectId: item.subjectId, totalMinutes: item.totalMinutes,
      sessions: item.sessions, minutesPerSession: item.minutesPerSession,
      price: item.price, currency: item.currency || 'VND', validityDays: item.validityDays || 60,
      description: item.description || '', status: item.status, featured: !!item.featured,
    } : emptyPackage)
    setPackageErrors({})
    setPackageModal(true)
  }

  const savePackage = async (event: FormEvent) => {
    event.preventDefault()
    const subject = subjects.find(s => s.id === packageForm.subjectId)
    const errors: PackageErrors = {}
    if (!packageForm.name.trim()) errors.name = 'Vui lòng nhập tên gói.'
    if (!subject) errors.subjectId = 'Vui lòng chọn môn học.'
    if (packageForm.sessions < 1) errors.sessions = 'Số buổi phải từ 1 trở lên.'
    if (packageForm.minutesPerSession < 1) errors.minutesPerSession = 'Số phút mỗi buổi phải từ 1 trở lên.'
    if (packageForm.totalMinutes < 1) errors.totalMinutes = 'Tổng kim cương phải từ 1 trở lên.'
    if (packageForm.price < 0) errors.price = 'Giá gói không được là số âm.'
    if ((packageForm.validityDays || 0) < 1) errors.validityDays = 'Hiệu lực phải từ 1 ngày trở lên.'
    setPackageErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast.error('Chưa thể lưu: vui lòng kiểm tra các ô màu đỏ.')
      return
    }
    if (!subject) return
    setSaving(true)
    try {
      const payload = { ...packageForm, name: packageForm.name.trim(), subjectName: subject.name, updatedAt: serverTimestamp() }
      if (editingPackage) await updateDoc(doc(db, 'topUpPackages', editingPackage.id), payload)
      else await addDoc(collection(db, 'topUpPackages'), { ...payload, createdAt: serverTimestamp() })
      toast.success(editingPackage ? 'Đã cập nhật gói nạp' : 'Đã thêm gói nạp')
      setPackageModal(false)
    } catch (error: unknown) {
      console.error(error)
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      toast.error(code.includes('permission-denied') ? 'Firebase đang từ chối quyền lưu gói nạp. Vui lòng cập nhật Firestore Rules.' : 'Không thể lưu gói nạp. Vui lòng thử lại.')
    }
    finally { setSaving(false) }
  }

  const uploadImage = async (file: File, type: 'gift' | 'qr') => {
    if (!file.type.startsWith('image/')) return toast.error('Vui lòng chọn tệp ảnh')
    if (file.size > 5 * 1024 * 1024) return toast.error('Ảnh không được vượt quá 5MB')
    setUploading(type)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const objectRef = ref(storage, `${type === 'gift' ? 'reward-gifts' : 'payment-qr'}/${Date.now()}_${safeName}`)
      await uploadBytes(objectRef, file, { contentType: file.type })
      const url = await getDownloadURL(objectRef)
      if (type === 'gift') setGiftForm(current => ({ ...current, imageURL: url }))
      else setSettings(current => ({ ...current, qrImageURL: url }))
      toast.success('Đã tải ảnh lên')
    } catch (error) { console.error(error); toast.error('Không thể tải ảnh lên') }
    finally { setUploading('') }
  }

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault()
    if (!settings.bankName.trim() || !settings.accountName.trim() || !settings.accountNumber.trim() || !settings.qrImageURL) return toast.error('Vui lòng nhập đủ ngân hàng, tài khoản và mã QR')
    setSaving(true)
    try {
      await setDoc(doc(db, 'paymentSettings', 'main'), { ...settings, updatedAt: serverTimestamp() }, { merge: true })
      toast.success('Đã lưu cấu hình thanh toán')
    } catch (error) { console.error(error); toast.error('Không thể lưu cấu hình thanh toán') }
    finally { setSaving(false) }
  }

  const reviewRedemption = async (item: RewardRedemption, action: 'approved' | 'rejected') => {
    setReviewing(`reward-${item.id}`)
    try {
      await runTransaction(db, async (tx) => {
        const requestRef = doc(db, 'rewardRedemptions', item.id)
        const studentRef = doc(db, 'students', item.studentId)
        const giftRef = doc(db, 'rewardCatalog', item.giftId)
        const transactionRef = doc(db, 'rewardTransactions', `redemption_${item.id}`)
        const [requestSnap, studentSnap, giftSnap, rewardTxSnap] = await Promise.all([
          tx.get(requestRef), tx.get(studentRef), tx.get(giftRef), tx.get(transactionRef),
        ])
        if (!requestSnap.exists() || requestSnap.data().status !== 'pending') throw new Error('Yêu cầu này đã được xử lý')
        if (action === 'rejected') {
          tx.update(requestRef, { status: 'rejected', reviewedAt: serverTimestamp(), reviewedBy: user?.uid || '' })
          return
        }
        if (!studentSnap.exists() || !giftSnap.exists()) throw new Error('Không tìm thấy học viên hoặc quà tặng')
        if (rewardTxSnap.exists()) throw new Error('Yêu cầu này đã được trừ sao')
        const student = studentSnap.data() as Student
        const gift = giftSnap.data() as RewardGift
        const balance = Number(student.rewardPoints || 0)
        if (balance < item.points) throw new Error('Học viên không đủ sao')
        if (Number(gift.stock || 0) < 1) throw new Error('Quà đã hết tồn kho')
        tx.update(studentRef, { rewardPoints: balance - item.points, updatedAt: serverTimestamp() })
        tx.update(giftRef, { stock: gift.stock - 1, updatedAt: serverTimestamp() })
        tx.update(requestRef, { status: 'approved', reviewedAt: serverTimestamp(), reviewedBy: user?.uid || '' })
        tx.set(transactionRef, { type: 'redemption', studentId: item.studentId, redemptionId: item.id, giftId: item.giftId, points: -item.points, createdAt: serverTimestamp(), createdBy: user?.uid || '' })
      })
      toast.success(action === 'approved' ? 'Đã duyệt đổi quà và trừ sao' : 'Đã từ chối yêu cầu')
    } catch (error) { console.error(error); toast.error(error instanceof Error ? error.message : 'Không thể xử lý yêu cầu') }
    finally { setReviewing('') }
  }

  const reviewTopUp = async (item: TopUpRequest, action: 'approved' | 'rejected') => {
    setReviewing(`topup-${item.id}`)
    try {
      await runTransaction(db, async (tx) => {
        const requestRef = doc(db, 'topUpRequests', item.id)
        const studentRef = doc(db, 'students', item.studentId)
        const packageRef = doc(db, 'topUpPackages', item.packageId)
        const subjectRef = doc(db, 'subjects', item.subjectId)
        const ledgerRef = doc(db, 'topUpTransactions', item.id)
        const [requestSnap, studentSnap, packageSnap, subjectSnap, ledgerSnap] = await Promise.all([
          tx.get(requestRef), tx.get(studentRef), tx.get(packageRef), tx.get(subjectRef), tx.get(ledgerRef),
        ])
        if (!requestSnap.exists() || requestSnap.data().status !== 'pending') throw new Error('Yêu cầu này đã được xử lý')
        if (action === 'rejected') {
          tx.update(requestRef, { status: 'rejected', reviewedAt: serverTimestamp(), reviewedBy: user?.uid || '' })
          return
        }
        if (!studentSnap.exists() || !packageSnap.exists() || !subjectSnap.exists()) throw new Error('Thiếu dữ liệu học viên, môn học hoặc gói nạp')
        if (ledgerSnap.exists()) throw new Error('Gói này đã được cộng trước đó')
        const student = { id: studentSnap.id, ...studentSnap.data() } as Student
        const pack = packageSnap.data() as TopUpPackage
        if (pack.status !== 'active') throw new Error('Gói nạp đã ngừng hoạt động')
        if (pack.totalMinutes !== item.totalMinutes || pack.sessions !== item.sessions || pack.price !== item.price) throw new Error('Gói nạp đã thay đổi; hãy từ chối và yêu cầu học viên tạo lại')
        const subject = subjectSnap.data() as Subject
        const subjectsList = [...(student.subjects || [])]
        const index = subjectsList.findIndex(s => s.subjectId === item.subjectId)
        const existing = index >= 0 ? subjectsList[index] : undefined
        const minutesPerSession = pack.minutesPerSession || Math.max(1, Math.round(pack.totalMinutes / pack.sessions))
        const addedBatch = { id: item.id, createdAt: new Date().toLocaleDateString('vi-VN'), totalSessions: pack.sessions }
        const nextSubject: StudentSubject = existing ? {
          ...existing,
          totalSessions: existing.totalSessions + pack.sessions,
          remainingSessions: existing.remainingSessions + pack.sessions,
          totalMinutes: existing.totalMinutes + pack.totalMinutes,
          remainingMinutes: existing.remainingMinutes + pack.totalMinutes,
          batches: [...(existing.batches || []), addedBatch],
        } : {
          subjectId: item.subjectId, subjectName: item.subjectName,
          totalSessions: pack.sessions, usedSessions: 0, remainingSessions: pack.sessions,
          minutesPerSession, totalMinutes: pack.totalMinutes, usedMinutes: 0,
          remainingMinutes: pack.totalMinutes, pricePerMinute: subject.pricePerMinute || 0,
          currency: subject.currency || pack.currency || 'VND', batches: [addedBatch],
        }
        if (index >= 0) subjectsList[index] = nextSubject
        else subjectsList.push(nextSubject)
        const totals = subjectsList.reduce((sum, entry) => ({
          totalSessions: sum.totalSessions + entry.totalSessions,
          usedSessions: sum.usedSessions + entry.usedSessions,
          remainingSessions: sum.remainingSessions + entry.remainingSessions,
          totalMinutes: sum.totalMinutes + entry.totalMinutes,
          usedMinutes: sum.usedMinutes + entry.usedMinutes,
          remainingMinutes: sum.remainingMinutes + entry.remainingMinutes,
        }), { totalSessions: 0, usedSessions: 0, remainingSessions: 0, totalMinutes: 0, usedMinutes: 0, remainingMinutes: 0 })
        tx.update(studentRef, { subjects: subjectsList, ...totals, updatedAt: serverTimestamp() })
        tx.update(requestRef, { status: 'approved', reviewedAt: serverTimestamp(), reviewedBy: user?.uid || '' })
        tx.set(ledgerRef, { ...item, requestId: item.id, status: 'approved', approvedAt: serverTimestamp(), approvedBy: user?.uid || '' })
      })
      toast.success(action === 'approved' ? 'Đã xác nhận thanh toán và cộng phút học' : 'Đã từ chối yêu cầu')
    } catch (error) { console.error(error); toast.error(error instanceof Error ? error.message : 'Không thể xử lý yêu cầu') }
    finally { setReviewing('') }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-500">Trải nghiệm học viên</p><h1 className="mt-1 text-2xl font-black text-slate-900">Quà tặng & nạp tiền</h1><p className="mt-1 text-sm text-slate-500">Quản lý sao, quà tặng, gói học và xác nhận chuyển khoản.</p></div>
        <div className="flex gap-2 rounded-xl bg-white p-1 ring-1 ring-slate-200 overflow-x-auto">
          {([
            ['gifts', 'Quà tặng', Gift], ['redemptions', `Đổi quà (${pendingRedemptions.length})`, Star],
            ['payment', 'QR & gói nạp', QrCode], ['requests', `Duyệt nạp (${pendingRequests.length})`, CreditCard],
          ] as const).map(([key, label, Icon]) => <button key={key} onClick={() => setTab(key)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${tab === key ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}><Icon className="h-4 w-4" />{label}</button>)}
        </div>
      </div>

      {dataError && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Firebase Rules cho Quà & nạp tiền chưa được xuất bản. Cập nhật Rules trước khi thêm dữ liệu.</div>}

      {tab === 'gifts' && <>
        <div className="flex justify-end"><Button onClick={() => openGift()}><Plus className="h-4 w-4" />Thêm quà</Button></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{gifts.map(gift => <Card key={gift.id} className="overflow-hidden p-0">
          <div className="aspect-[16/8] bg-slate-100">{gift.imageURL ? <img src={gift.imageURL} alt={gift.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Gift className="h-10 w-10 text-slate-300" /></div>}</div>
          <div className="p-4"><div className="flex justify-between gap-3"><div><h3 className="font-black text-slate-900">{gift.name}</h3><p className="mt-1 text-xs font-bold text-amber-600">{gift.points} sao · tồn {gift.stock}</p></div><span className={`h-fit rounded-full px-2 py-1 text-[10px] font-bold ${gift.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{gift.status === 'active' ? 'Đang mở' : 'Đã ẩn'}</span></div><div className="mt-4 flex gap-2"><Button variant="outline" size="sm" onClick={() => openGift(gift)}><Pencil className="h-3.5 w-3.5" />Sửa</Button><Button variant="ghost" size="sm" aria-label={`Xóa quà ${gift.name}`} onClick={() => setDeleteTarget({ kind: 'gift', id: gift.id, name: gift.name })}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button></div></div>
        </Card>)}</div>
        {gifts.length === 0 && <Empty icon={Gift} text="Chưa có quà tặng. Hãy thêm quà đầu tiên." />}
      </>}

      {tab === 'redemptions' && <RequestList empty="Chưa có yêu cầu đổi quà.">{redemptions.map(item => <RequestCard key={item.id} title={item.giftName} subtitle={`${item.studentName} · ${item.studentCode}`} amount={`${item.points} sao`} status={item.status}>{item.status === 'pending' && <><Button size="sm" loading={reviewing === `reward-${item.id}`} onClick={() => reviewRedemption(item, 'approved')}><Check className="h-4 w-4" />Duyệt</Button><Button size="sm" variant="outline" disabled={!!reviewing} onClick={() => reviewRedemption(item, 'rejected')}><X className="h-4 w-4" />Từ chối</Button></>}</RequestCard>)}</RequestList>}

      {tab === 'payment' && <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <Card><form onSubmit={saveSettings} className="space-y-4"><div><h2 className="font-black text-slate-900">Thông tin nhận chuyển khoản</h2><p className="mt-1 text-xs text-slate-500">Học viên chỉ nhìn thấy cấu hình đã lưu tại đây.</p></div><Input label="Ngân hàng" value={settings.bankName} onChange={e => setSettings({ ...settings, bankName: e.target.value })} /><Input label="Tên chủ tài khoản" value={settings.accountName} onChange={e => setSettings({ ...settings, accountName: e.target.value })} /><Input label="Số tài khoản" value={settings.accountNumber} onChange={e => setSettings({ ...settings, accountNumber: e.target.value })} /><Input label="Tiền tố nội dung chuyển khoản" value={settings.transferPrefix || ''} onChange={e => setSettings({ ...settings, transferPrefix: e.target.value.toUpperCase() })} hint="Ví dụ: NAP → NAP HS123456" /><Textarea label="Ghi chú hỗ trợ" rows={3} value={settings.supportNote || ''} onChange={e => setSettings({ ...settings, supportNote: e.target.value })} /><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-600">Mã QR thanh toán</span><div className="flex items-center gap-3">{settings.qrImageURL ? <img src={settings.qrImageURL} className="h-24 w-24 rounded-xl object-contain ring-1 ring-slate-200" alt="QR" /> : <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-slate-100"><QrCode className="h-8 w-8 text-slate-300" /></div>}<span className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><ImagePlus className="mr-1 inline h-4 w-4" />{uploading === 'qr' ? 'Đang tải...' : 'Chọn ảnh QR'}<input className="hidden" type="file" accept="image/*" disabled={!!uploading} onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], 'qr')} /></span></div></label><Button type="submit" loading={saving} fullWidth>Lưu cấu hình QR</Button></form></Card>
        <div className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-black text-slate-900">Gói nạp kim cương</h2><p className="text-xs text-slate-500">Gói đang mở sẽ hiển thị cho học viên. Môn học dùng để cộng đúng quỹ kim cương khi duyệt.</p></div><Button size="sm" onClick={() => openPackage()}><Plus className="h-4 w-4" />Thêm gói</Button></div>{packages.map(item => <Card key={item.id}><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50"><Package className="h-5 w-5 text-indigo-500" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{item.name}</h3>{item.featured && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Nổi bật</span>}</div><p className="mt-1 text-xs text-slate-500">{item.subjectName} · {item.sessions} buổi · {item.totalMinutes} kim cương</p></div><strong className="text-indigo-600">{formatMoney(item.price, item.currency)}</strong><div className="flex gap-1"><Button size="sm" variant="outline" aria-label={`Sửa gói ${item.name}`} onClick={() => openPackage(item)}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" aria-label={`Xóa gói ${item.name}`} onClick={() => setDeleteTarget({ kind: 'package', id: item.id, name: item.name })}><Trash2 className="h-4 w-4 text-rose-500" /></Button></div></div></Card>)}{packages.length === 0 && <Empty icon={Package} text="Chưa có gói nạp." />}</div>
      </div>}

      {tab === 'requests' && <RequestList empty="Chưa có yêu cầu xác nhận chuyển khoản.">{requests.map(item => <RequestCard key={item.id} title={item.packageName} subtitle={`${item.studentName} · ${item.studentCode} · ${item.transferContent}`} amount={formatMoney(item.price, item.currency)} status={item.status}>{item.status === 'pending' && <><Button size="sm" loading={reviewing === `topup-${item.id}`} onClick={() => reviewTopUp(item, 'approved')}><Check className="h-4 w-4" />Đã nhận tiền</Button><Button size="sm" variant="outline" disabled={!!reviewing} onClick={() => reviewTopUp(item, 'rejected')}><X className="h-4 w-4" />Từ chối</Button></>}</RequestCard>)}</RequestList>}

      <Modal open={giftModal} onClose={() => setGiftModal(false)} title={editingGift ? 'Chỉnh sửa quà tặng' : 'Thêm quà tặng'} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setGiftModal(false)}>Hủy</Button><Button form="gift-form" type="submit" loading={saving}>Lưu quà tặng</Button></div>}><form id="gift-form" onSubmit={saveGift} className="space-y-4"><Input label="Tên quà *" value={giftForm.name} onChange={e => setGiftForm({ ...giftForm, name: e.target.value })} /><Textarea label="Mô tả" rows={3} value={giftForm.description} onChange={e => setGiftForm({ ...giftForm, description: e.target.value })} /><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Input label="Số sao cần *" type="number" min={1} value={giftForm.points} onChange={e => setGiftForm({ ...giftForm, points: Number(e.target.value) })} /><Input label="Tồn kho *" type="number" min={0} value={giftForm.stock} onChange={e => setGiftForm({ ...giftForm, stock: Number(e.target.value) })} /></div><Select label="Trạng thái" value={giftForm.status} onChange={value => setGiftForm({ ...giftForm, status: value as 'active' | 'inactive' })} options={[{ value: 'active', label: 'Đang mở' }, { value: 'inactive', label: 'Ẩn' }]} /><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={giftForm.featured} onChange={e => setGiftForm({ ...giftForm, featured: e.target.checked })} />Ưu tiên hiển thị quà này</label><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-600">Ảnh quà</span><div className="flex items-center gap-3">{giftForm.imageURL ? <img src={giftForm.imageURL} className="h-20 w-24 rounded-xl object-cover" alt={giftForm.name || 'Ảnh quà tặng'} /> : <div className="flex h-20 w-24 items-center justify-center rounded-xl bg-slate-100"><Gift className="text-slate-300" /></div>}<span className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"><ImagePlus className="mr-1 inline h-4 w-4" />{uploading === 'gift' ? 'Đang tải...' : 'Chọn ảnh'}<input className="hidden" type="file" accept="image/*" disabled={!!uploading} onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], 'gift')} /></span></div></label></form></Modal>

      <Modal open={packageModal} onClose={() => setPackageModal(false)} title={editingPackage ? 'Chỉnh sửa gói nạp' : 'Thêm gói nạp'} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPackageModal(false)}>Hủy</Button><Button form="package-form" type="submit" loading={saving}>Lưu gói nạp</Button></div>}>
        <form id="package-form" onSubmit={savePackage} className="space-y-4" noValidate>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs leading-5 text-indigo-800">
            Các trường có dấu <strong>*</strong> là bắt buộc. Gói đang mở sẽ hiển thị cho học viên; môn học được dùng để cộng đúng quỹ kim cương khi duyệt thanh toán.
          </div>
          <Input autoFocus label="Tên gói *" error={packageErrors.name} value={packageForm.name} onChange={e => { setPackageForm({ ...packageForm, name: e.target.value }); setPackageErrors(current => ({ ...current, name: undefined })) }} />
          <Select label="Môn học *" error={packageErrors.subjectId} value={packageForm.subjectId} onChange={value => { setPackageForm({ ...packageForm, subjectId: value }); setPackageErrors(current => ({ ...current, subjectId: undefined })) }} options={[{ value: '', label: 'Chọn môn học' }, ...subjects.map(s => ({ value: s.id, label: s.name }))]} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Số buổi *" error={packageErrors.sessions} type="number" min={1} value={packageForm.sessions} onChange={e => { const sessions = Number(e.target.value); setPackageForm({ ...packageForm, sessions, totalMinutes: sessions * packageForm.minutesPerSession }); setPackageErrors(current => ({ ...current, sessions: undefined, totalMinutes: undefined })) }} />
            <Input label="Phút / buổi *" error={packageErrors.minutesPerSession} type="number" min={1} value={packageForm.minutesPerSession} onChange={e => { const minutesPerSession = Number(e.target.value); setPackageForm({ ...packageForm, minutesPerSession, totalMinutes: packageForm.sessions * minutesPerSession }); setPackageErrors(current => ({ ...current, minutesPerSession: undefined, totalMinutes: undefined })) }} />
          </div>
          <Input label="Tổng kim cương" error={packageErrors.totalMinutes} type="number" min={1} value={packageForm.totalMinutes} onChange={e => { setPackageForm({ ...packageForm, totalMinutes: Number(e.target.value) }); setPackageErrors(current => ({ ...current, totalMinutes: undefined })) }} />
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Input label="Giá gói *" error={packageErrors.price} type="number" min={0} value={packageForm.price} onChange={e => { setPackageForm({ ...packageForm, price: Number(e.target.value) }); setPackageErrors(current => ({ ...current, price: undefined })) }} />
            <Input label="Tiền tệ" value={packageForm.currency} onChange={e => setPackageForm({ ...packageForm, currency: e.target.value.toUpperCase() })} />
          </div>
          <Input label="Hiệu lực (ngày)" error={packageErrors.validityDays} type="number" min={1} value={packageForm.validityDays} onChange={e => { setPackageForm({ ...packageForm, validityDays: Number(e.target.value) }); setPackageErrors(current => ({ ...current, validityDays: undefined })) }} />
          <Textarea label="Mô tả" rows={3} value={packageForm.description} onChange={e => setPackageForm({ ...packageForm, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Trạng thái" value={packageForm.status} onChange={value => setPackageForm({ ...packageForm, status: value as 'active' | 'inactive' })} options={[{ value: 'active', label: 'Đang mở' }, { value: 'inactive', label: 'Ẩn' }]} />
            <label className="mt-7 flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={packageForm.featured} onChange={e => setPackageForm({ ...packageForm, featured: e.target.checked })} />Gói nổi bật</label>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={deleteTarget?.kind === 'gift' ? 'Xóa quà tặng?' : 'Xóa gói nạp?'}
        description={deleteTarget ? `Bạn sắp xóa “${deleteTarget.name}”. Thao tác này không thể hoàn tác.` : undefined}
        consequence={deleteTarget?.kind === 'gift' ? 'Các yêu cầu đổi quà đã tạo vẫn được giữ nguyên để đối soát.' : 'Các yêu cầu nạp đã tạo vẫn được giữ nguyên để đối soát.'}
        confirmLabel="Xóa"
        confirmVariant="danger"
        loading={deleting}
      />
    </div>
  )
}

function byNewest<T extends { createdAt?: { toMillis?: () => number } }>(a: T, b: T) { return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0) }

function Select({ label, value, options, onChange, error }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; error?: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-600">{label}</span><select value={value} aria-invalid={!!error} onChange={e => onChange(e.target.value)} className={`min-h-[44px] w-full rounded-lg border bg-white px-3 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 ${error ? 'border-rose-500' : 'border-slate-300'}`}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{error && <p className="mt-1.5 text-xs text-rose-500">{error}</p>}</label>
}

function Empty({ icon: Icon, text }: { icon: typeof Gift; text: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><Icon className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">{text}</p></div> }

function RequestList({ children, empty }: { children: ReactNode; empty: string }) { return <div className="space-y-3">{Children.count(children) ? children : <Empty icon={Clock3} text={empty} />}</div> }

function RequestCard({ title, subtitle, amount, status, children }: { title: string; subtitle: string; amount: string; status: string; children?: ReactNode }) {
  return <Card><div className="flex flex-col gap-3 md:flex-row md:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{title}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status === 'pending' ? 'bg-amber-50 text-amber-700' : status === 'approved' || status === 'fulfilled' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{status === 'pending' ? 'Chờ duyệt' : status === 'approved' ? 'Đã duyệt' : status === 'fulfilled' ? 'Đã giao' : 'Từ chối'}</span></div><p className="mt-1 break-words text-xs text-slate-500">{subtitle}</p></div><strong className="shrink-0 text-indigo-600">{amount}</strong>{children && <div className="flex shrink-0 gap-2">{children}</div>}</div></Card>
}
