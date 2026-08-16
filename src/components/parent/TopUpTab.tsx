import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore'
import { Check, ChevronRight, Clock3, Copy, CreditCard, Headphones, History, ImageOff, QrCode, WalletCards, X } from 'lucide-react'
import { db } from '@/lib/firebase'
import { PaymentSettings, Student, TopUpPackage, TopUpRequest } from '@/types'
import { formatMoney } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import { toast } from '@/stores/toastStore'
import { getStudentPackageMinuteSummary } from '@/lib/studentMinutes'
import { DiamondPointsIcon } from '@/components/shared/DiamondPointsIcon'

export function TopUpTab({
  student,
  lang,
  usedMinutesOverride,
  heldMinutesOverride,
  remainingMinutesOverride,
  availableMinutesOverride,
}: {
  student: Student
  lang: string
  usedMinutesOverride?: number
  heldMinutesOverride?: number
  remainingMinutesOverride?: number
  availableMinutesOverride?: number
}) {
  const [settings, setSettings] = useState<PaymentSettings | null>(null)
  const [packages, setPackages] = useState<TopUpPackage[]>([])
  const [requests, setRequests] = useState<TopUpRequest[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [packagesLoading, setPackagesLoading] = useState(true)
  const [copyingQr, setCopyingQr] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showPayment, setShowPayment] = useState(false)

  useEffect(() => onSnapshot(doc(db, 'paymentSettings', 'main'), (snap) => {
    setSettings(snap.exists() ? snap.data() as PaymentSettings : null)
    setSettingsLoading(false)
  }, () => {
    setLoadError(true)
    setSettingsLoading(false)
  }), [])
  useEffect(() => onSnapshot(collection(db, 'topUpPackages'), (snap) => {
    const next = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as TopUpPackage))
      .filter((item) => item.status === 'active')
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.price - b.price)
    setPackages(next)
    setSelectedId((current) => next.some(item => item.id === current) ? current : next[0]?.id || '')
    setPackagesLoading(false)
  }, () => {
    setLoadError(true)
    setPackagesLoading(false)
  }), [])
  useEffect(() => {
    const q = query(collection(db, 'topUpRequests'), where('studentId', '==', student.id))
    return onSnapshot(q, (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TopUpRequest))), () => setLoadError(true))
  }, [student.id])

  const selected = useMemo(() => packages.find((item) => item.id === selectedId) || null, [packages, selectedId])
  const transferContent = `${settings?.transferPrefix?.trim() || 'NAP'} ${student.code}`.toUpperCase()
  const pending = requests.some((item) => item.status === 'pending')
  const minuteSummary = getStudentPackageMinuteSummary(student)
  const totalMinutes = minuteSummary.totalMinutes
  const usedMinutes = Math.max(minuteSummary.usedMinutes, usedMinutesOverride ?? 0)
  const remainingMinutes = Math.max(0, remainingMinutesOverride ?? minuteSummary.remainingMinutes)
  const heldMinutes = Math.max(
    0,
    heldMinutesOverride ?? student.reservedMinutes ?? student.heldMinutes ?? 0,
  )
  const availableMinutes = Math.max(0, availableMinutesOverride ?? (remainingMinutes - heldMinutes))
  // Thanh tỷ lệ mô tả quỹ đã tiêu, không dùng phần học vượt của khóa cũ để
  // che khuất số dư hợp lệ của khóa mới. Số thực tế đã học vẫn hiển thị riêng.
  const consumedFundMinutes = Math.max(0, totalMinutes - remainingMinutes)
  const usedPercent = totalMinutes > 0 ? Math.min(100, Math.round((consumedFundMinutes / totalMinutes) * 100)) : 0
  const heldPercent = totalMinutes > 0 ? Math.min(100 - usedPercent, Math.round((heldMinutes / totalMinutes) * 100)) : 0
  const availablePercent = totalMinutes > 0 ? Math.min(100 - usedPercent - heldPercent, Math.round((availableMinutes / totalMinutes) * 100)) : 0

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success(lang === 'vi' ? 'Đã sao chép' : 'Copied')
  }

  const copyQrImage = async () => {
    const imageUrl = settings?.qrImageURL
    if (!imageUrl || copyingQr) return

    setCopyingQr(true)
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Image clipboard is not supported')
      }

      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error('Could not load QR image')
      const sourceBlob = await response.blob()
      let clipboardBlob = sourceBlob

      if (sourceBlob.type !== 'image/png') {
        const bitmap = await createImageBitmap(sourceBlob)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Could not prepare QR image')
        context.drawImage(bitmap, 0, 0)
        bitmap.close()
        clipboardBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not convert QR image')), 'image/png')
        })
      }

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': clipboardBlob })])
      toast.success(lang === 'vi' ? 'Đã sao chép ảnh QR' : 'QR image copied')
    } catch {
      try {
        await navigator.clipboard.writeText(imageUrl)
        toast.warning(lang === 'vi' ? 'Thiết bị chưa hỗ trợ sao chép ảnh. Đã sao chép liên kết QR.' : 'Image copy is not supported. The QR link was copied instead.')
      } catch {
        toast.error(lang === 'vi' ? 'Không thể sao chép ảnh QR' : 'Could not copy QR image')
      }
    } finally {
      setCopyingQr(false)
    }
  }

  const submit = async () => {
    if (!selected || !settings?.qrImageURL || pending) return
    setSubmitting(true)
    try {
      await addDoc(collection(db, 'topUpRequests'), {
        studentId: student.id, studentCode: student.code, studentName: student.name,
        packageId: selected.id, packageName: selected.name,
        subjectId: selected.subjectId, subjectName: selected.subjectName,
        totalMinutes: selected.totalMinutes, sessions: selected.sessions,
        price: selected.price, currency: selected.currency || 'VND',
        transferContent, status: 'pending', createdAt: serverTimestamp(),
      })
      toast.success(lang === 'vi' ? 'Đã gửi yêu cầu xác nhận chuyển khoản' : 'Payment confirmation request submitted')
    } catch (error) {
      console.error(error)
      toast.error(lang === 'vi' ? 'Không thể gửi yêu cầu' : 'Could not submit request')
    } finally { setSubmitting(false) }
  }

  const sessions25 = (totalMin: number) => Math.round(totalMin / 25)

  return (
    <div className="space-y-5 pb-4">
      {/* Hero: kim cương khả dụng + nút Nạp kim cương */}
      <section className="relative overflow-hidden rounded-[26px] border border-sky-100 bg-gradient-to-br from-[#f4faff] via-white to-[#eaf6ff] p-5 shadow-[0_20px_45px_-34px_rgba(2,132,199,0.65)]">
        <div className="relative z-10 max-w-[62%]">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
            {lang === 'vi' ? 'Kim cương khả dụng' : 'Available diamonds'}
          </p>
          <div className="mt-1 flex items-end gap-2">
            <strong className="text-5xl font-black leading-none tracking-[-0.05em] tabular-nums text-sky-600">{availableMinutes.toLocaleString('vi-VN')}</strong>
            <DiamondPointsIcon className="mb-1 h-6 w-6" />
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Kim cương' : 'Diamonds'}</p>
          <button
            type="button"
            onClick={() => setShowPayment(true)}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-b from-brand-400 to-brand-500 px-5 text-sm font-black text-brand-900 shadow-md shadow-brand-200 transition hover:brightness-105 active:scale-[0.98]"
          >
            + {lang === 'vi' ? 'Nạp kim cương' : 'Top up diamonds'}
          </button>
        </div>
        {/* Trang trí cụm kim cương xanh (thay ảnh mascot) */}
        <div className="pointer-events-none absolute -right-4 -top-2 z-0 opacity-90">
          <DiamondPointsIcon className="absolute right-16 top-6 h-8 w-8 rotate-6" />
          <DiamondPointsIcon className="absolute right-4 top-2 h-16 w-16 -rotate-6" />
          <DiamondPointsIcon className="absolute right-24 top-16 h-6 w-6" />
          <DiamondPointsIcon className="absolute right-8 top-24 h-11 w-11 rotate-12" />
          <DiamondPointsIcon className="absolute right-28 top-28 h-7 w-7 -rotate-12" />
        </div>
      </section>

      {/* Đã đặt / Đã học */}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setShowHistory(true)} className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 transition hover:ring-brand-300 active:scale-[0.99]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><WalletCards className="h-5 w-5" /></span>
          <span className="min-w-0">
            <span className="block text-xs font-bold text-slate-500">{lang === 'vi' ? 'Kim cương đã đặt' : 'Reserved diamonds'}</span>
            <span className="mt-0.5 flex items-center gap-1 text-lg font-black tabular-nums text-slate-900">{heldMinutes.toLocaleString('vi-VN')}<DiamondPointsIcon className="h-4 w-4" /></span>
          </span>
        </button>
        <button type="button" onClick={() => setShowHistory(true)} className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 transition hover:ring-emerald-300 active:scale-[0.99]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><History className="h-5 w-5" /></span>
          <span className="min-w-0">
            <span className="block text-xs font-bold text-slate-500">{lang === 'vi' ? 'Kim cương đã học' : 'Used diamonds'}</span>
            <span className="mt-0.5 flex items-center gap-1 text-lg font-black tabular-nums text-slate-900">{usedMinutes.toLocaleString('vi-VN')}<DiamondPointsIcon className="h-4 w-4" /></span>
          </span>
        </button>
      </div>

      {/* Nạp kim cương — chọn gói */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-black tracking-tight text-slate-950">{lang === 'vi' ? 'Nạp kim cương' : 'Top up diamonds'}</h2>
      </div>
      {loadError && <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">{lang === 'vi' ? 'Tính năng nạp tiền đang chờ Admin hoàn tất quyền dữ liệu.' : 'Top-up is waiting for Admin to finish data permissions.'}</div>}
      {packagesLoading ? <PackageSkeleton /> : packages.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center"><CreditCard className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">{lang === 'vi' ? 'Admin chưa mở gói nạp tiền' : 'No top-up packages available'}</p></div> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {packages.map((pkg, idx) => {
            const active = selectedId === pkg.id
            return (
              <button key={pkg.id} onClick={() => { setSelectedId(pkg.id); setShowPayment(true) }} className={`relative flex flex-col items-center rounded-2xl bg-white p-4 pt-5 text-center transition ${active ? 'ring-2 ring-sky-600 shadow-[0_12px_35px_-22px_rgba(2,132,199,.72)]' : 'ring-1 ring-slate-200 hover:ring-brand-300'}`}>
                {pkg.featured && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-black text-amber-900 shadow-sm">{lang === 'vi' ? 'Phổ biến' : 'Popular'}</span>}
                {!pkg.featured && idx === packages.length - 1 && packages.length > 1 && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-rose-400 px-2.5 py-0.5 text-[10px] font-black text-white shadow-sm">{lang === 'vi' ? 'Tiết kiệm nhất' : 'Best value'}</span>}
                <DiamondPointsIcon className="h-9 w-9" />
                <span className="mt-2 flex items-center gap-1 text-2xl font-black tabular-nums text-slate-900">{pkg.totalMinutes.toLocaleString('vi-VN')}<DiamondPointsIcon className="h-5 w-5" /></span>
                <span className="mt-1 text-sm font-black text-sky-700 tabular-nums">{formatMoney(pkg.price, pkg.currency)}</span>
                <span className="mt-2 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">≈ {sessions25(pkg.totalMinutes)} {lang === 'vi' ? 'buổi học' : 'sessions'}</span>
              </button>
            )
          })}
        </div>
      )}
      <p className="flex items-start gap-1.5 px-1 text-[11px] font-semibold leading-5 text-slate-500">
        <span className="mt-0.5">ⓘ</span>
        {lang === 'vi' ? 'Ghi chú: 25 kim cương ≈ 1 buổi học 25 phút với gia sư Việt Nam/Philippines.' : 'Note: 25 diamonds ≈ one 25-minute lesson with a Vietnam/Philippines teacher.'}
      </p>

      {/* Lịch sử nạp & sử dụng (preview) */}
      <div className="flex items-center justify-between px-1 pt-1">
        <h2 className="text-lg font-black tracking-tight text-slate-950">{lang === 'vi' ? 'Lịch sử nạp & sử dụng' : 'Top-up & usage history'}</h2>
        <button type="button" onClick={() => setShowHistory(true)} className="inline-flex items-center gap-0.5 text-xs font-extrabold text-sky-700 transition hover:text-sky-800">{lang === 'vi' ? 'Xem tất cả' : 'View all'}<ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
      <div className="space-y-2.5">
        {requests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center"><History className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-500">{lang === 'vi' ? 'Chưa có giao dịch nạp gói.' : 'No top-up transactions yet.'}</p></div>
        ) : requests.slice().sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 4).map((request) => (
          <div key={request.id} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-slate-200">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><DiamondPointsIcon className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-slate-900">{lang === 'vi' ? 'Nạp kim cương' : 'Top up'} – {request.packageName}</p>
              <p className="text-[11px] font-semibold text-slate-500">{request.createdAt?.toDate ? request.createdAt.toDate().toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') : ''}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="flex items-center justify-end gap-1 text-sm font-black tabular-nums text-emerald-600">+{request.totalMinutes.toLocaleString('vi-VN')}<DiamondPointsIcon className="h-3.5 w-3.5" /></p>
              <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-black ${request.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : request.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{request.status === 'approved' ? (lang === 'vi' ? 'Đã duyệt' : 'Approved') : request.status === 'rejected' ? (lang === 'vi' ? 'Từ chối' : 'Rejected') : (lang === 'vi' ? 'Chờ duyệt' : 'Pending')}</span>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL: bấm "Nạp kim cương" mới hiện thanh toán chuyển khoản */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center" onClick={() => setShowPayment(false)}>
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="flex items-center gap-2 text-base font-black text-slate-900"><QrCode className="h-5 w-5 text-sky-600" />{lang === 'vi' ? 'Thanh toán chuyển khoản' : 'Bank transfer'}</h3>
              <button type="button" onClick={() => setShowPayment(false)} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" aria-label={lang === 'vi' ? 'Đóng' : 'Close'}><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {selected && (
                <div className="flex items-center justify-between rounded-2xl bg-sky-50 px-4 py-3 ring-1 ring-sky-100">
                  <span className="text-sm font-black text-slate-800">{selected.name}</span>
                  <span className="flex items-center gap-2 text-sm font-black text-sky-700"><span className="tabular-nums">{formatMoney(selected.price, selected.currency)}</span></span>
                </div>
              )}
              {settingsLoading ? <PaymentSkeleton /> : !settings?.qrImageURL ? <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">{lang === 'vi' ? 'Admin chưa cấu hình mã QR thanh toán.' : 'Payment QR has not been configured.'}</div> : (
                <>
                  <PaymentQrImage src={settings.qrImageURL} alt={lang === 'vi' ? 'Mã QR thanh toán' : 'Payment QR code'} lang={lang} onCopy={copyQrImage} copying={copyingQr} />
                  <div className="space-y-3 text-sm">
                    <InfoRow label={lang === 'vi' ? 'Ngân hàng' : 'Bank'} value={settings.bankName} />
                    <InfoRow label={lang === 'vi' ? 'Chủ tài khoản' : 'Account holder'} value={settings.accountName || ''} />
                    <InfoRow label={lang === 'vi' ? 'Số tài khoản' : 'Account number'} value={settings.accountNumber || ''} copy={() => copy(settings.accountNumber || '')} />
                    <InfoRow label={lang === 'vi' ? 'Nội dung chuyển khoản' : 'Transfer content'} value={transferContent} accent copy={() => copy(transferContent)} />
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"><h4 className="text-sm font-black text-slate-900">{lang === 'vi' ? 'Cách xác nhận' : 'How confirmation works'}</h4><ol className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600"><li>1. {lang === 'vi' ? 'Quét QR hoặc chuyển khoản theo thông tin trên.' : 'Scan the QR or transfer using the details above.'}</li><li>2. {lang === 'vi' ? 'Nhập ĐÚNG nội dung chuyển khoản.' : 'Use the EXACT transfer content.'}</li><li>3. {lang === 'vi' ? 'Bấm gửi xác nhận; Admin kiểm tra rồi cộng kim cương.' : 'Submit; Admin verifies before adding diamonds.'}</li></ol></div>
                </>
              )}
            </div>
            <div className="border-t border-slate-100 p-4">
              <Button fullWidth size="lg" onClick={submit} loading={submitting} disabled={!selected || !settings?.qrImageURL || pending} className="bg-gradient-to-b from-brand-400 to-brand-500 text-brand-900 hover:brightness-105 focus:ring-brand-300">
                {pending ? <><Clock3 className="h-4 w-4" />{lang === 'vi' ? 'Đang chờ Admin xác nhận' : 'Waiting for Admin'}</> : lang === 'vi' ? 'Tôi đã chuyển khoản' : 'I have transferred'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onClick={() => setShowHistory(false)}>
          <aside className="flex h-full w-full max-w-sm flex-col bg-slate-50 shadow-2xl" onClick={(event) => event.stopPropagation()} aria-label={lang === 'vi' ? 'Lịch sử giao dịch' : 'Transaction history'}>
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">{lang === 'vi' ? 'Lịch sử giao dịch' : 'Transaction history'}</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">{requests.length} {lang === 'vi' ? 'yêu cầu nạp gói' : 'top-up requests'}</p>
              </div>
              <button type="button" onClick={() => setShowHistory(false)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-300" aria-label={lang === 'vi' ? 'Đóng lịch sử giao dịch' : 'Close transaction history'}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {requests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center">
                  <History className="mx-auto h-9 w-9 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-500">{lang === 'vi' ? 'Chưa có giao dịch nạp gói.' : 'No top-up transactions yet.'}</p>
                </div>
              ) : requests
                .slice()
                .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
                .map((request) => (
                  <article key={request.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-black text-slate-900">{request.packageName}</h3>
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-violet-700"><DiamondPointsIcon className="h-3.5 w-3.5" />{request.totalMinutes.toLocaleString('vi-VN')}</p>
                      </div>
                      <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black ${request.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : request.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                        {request.status === 'approved' ? (lang === 'vi' ? 'Đã duyệt' : 'Approved') : request.status === 'rejected' ? (lang === 'vi' ? 'Từ chối' : 'Rejected') : (lang === 'vi' ? 'Chờ duyệt' : 'Pending')}
                      </span>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
                      <p className="text-[11px] font-semibold text-slate-500">{request.createdAt?.toDate ? request.createdAt.toDate().toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US') : (lang === 'vi' ? 'Đang cập nhật thời gian' : 'Date updating')}</p>
                      <strong className="text-sm font-black tabular-nums text-sky-700">{formatMoney(request.price, request.currency)}</strong>
                    </div>
                  </article>
                ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function WalletMetric({ value, label, color, lang }: { value: number; label: string; color: string; lang: string }) {
  return (
    <div className="px-2 text-center">
      <p className={`text-xl font-black leading-none tabular-nums ${color}`}>{value.toLocaleString('vi-VN')}</p>
      <p className="mt-2 text-[11px] font-bold text-slate-600">{label}</p>
      <p className="mt-1 flex justify-center"><DiamondPointsIcon className="h-3.5 w-3.5 text-violet-500" /></p>
    </div>
  )
}

function PackageSkeleton() {
  return <div className="space-y-3" aria-label="Đang tải gói nạp"><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /></div>
}

function PaymentSkeleton() {
  return <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-100" aria-label="Đang tải thông tin thanh toán"><div className="h-5 w-44 animate-pulse rounded-lg bg-sky-100" /><div className="mt-4 grid gap-5 sm:grid-cols-[224px_1fr] sm:items-center"><div className="mx-auto aspect-square w-full max-w-[224px] animate-pulse rounded-xl bg-white" /><div className="space-y-4">{[1, 2, 3, 4].map(item => <div key={item}><div className="h-3 w-24 animate-pulse rounded bg-sky-100" /><div className="mt-2 h-5 w-40 animate-pulse rounded bg-white" /></div>)}</div></div></div>
}

function PaymentQrImage({ src, alt, lang, onCopy, copying }: { src: string; alt: string; lang: string; onCopy: () => void; copying: boolean }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="mx-auto flex aspect-square w-full max-w-[224px] flex-col items-center justify-center rounded-xl bg-white p-4 text-center ring-1 ring-sky-100">
        <ImageOff className="h-8 w-8 text-slate-300" />
        <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{lang === 'vi' ? 'Không tải được mã QR. Vui lòng dùng thông tin chuyển khoản bên cạnh.' : 'QR could not be loaded. Please use the bank details.'}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[224px]">
      <img src={src} alt={alt} className="aspect-square w-full rounded-xl bg-white object-contain p-2 ring-1 ring-sky-100" onError={() => setFailed(true)} />
      <button
        type="button"
        onClick={onCopy}
        disabled={copying}
        className="mt-2.5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white px-3 text-xs font-extrabold text-sky-700 ring-1 ring-brand-300 transition hover:bg-sky-50 disabled:cursor-wait disabled:opacity-60 active:scale-[0.98]"
      >
        <Copy className="h-4 w-4" />
        {copying ? (lang === 'vi' ? 'Đang sao chép...' : 'Copying...') : (lang === 'vi' ? 'Sao chép ảnh QR' : 'Copy QR image')}
      </button>
    </div>
  )
}

function InfoRow({ label, value, copy, accent }: { label: string; value: string; copy?: () => void; accent?: boolean }) {
  return <div><p className="text-[11px] font-semibold text-slate-500">{label}</p><div className="mt-0.5 flex items-center justify-between gap-2"><strong className={`break-all ${accent ? 'text-sky-700' : 'text-slate-900'}`}>{value || 'Chưa cập nhật'}</strong>{copy && <button onClick={copy} className="shrink-0 rounded-lg bg-white p-2 text-sky-600 ring-1 ring-sky-100 hover:bg-sky-50 active:scale-[0.98]" aria-label="Copy"><Copy className="h-4 w-4" /></button>}</div></div>
}
