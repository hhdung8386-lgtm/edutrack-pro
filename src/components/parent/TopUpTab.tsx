import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore'
import { Check, ChevronRight, Clock3, Copy, CreditCard, Crown, Headphones, History, ImageOff, QrCode, Sparkles, Star, WalletCards, X } from 'lucide-react'
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
      .sort((a, b) => a.price - b.price)
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
  const hasFiftyMinutePackage = packages.some((item) => item.minutesPerSession === 50)
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


  return (
    <div className="space-y-5 pb-4">
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

      {/* Chọn gói học */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-black tracking-tight text-slate-950">{lang === 'vi' ? 'Chọn gói học' : 'Choose a package'}</h2>
      </div>
      {loadError && <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">{lang === 'vi' ? 'Tính năng nạp tiền đang chờ Admin hoàn tất quyền dữ liệu.' : 'Top-up is waiting for Admin to finish data permissions.'}</div>}
      {packagesLoading ? <PackageSkeleton /> : packages.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center"><CreditCard className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">{lang === 'vi' ? 'Admin chưa mở gói nạp tiền' : 'No top-up packages available'}</p></div> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3">
          {packages.map((pkg, rank) => {
            const tierIndex = tierIndexFor(rank, packages.length)
            const tier = PACKAGE_TIERS[tierIndex]
            const stars = Math.ceil((tierIndex + 1) / 2)
            const isTop = packages.length >= 3 && rank === packages.length - 1
            const highlights = (pkg.description || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 4)
            const discount = (pkg.originalPrice || 0) > pkg.price ? (pkg.originalPrice || 0) - pkg.price : 0
            return (
              <article key={pkg.id} className={`@container relative flex flex-col overflow-hidden rounded-[26px] bg-white ${isTop ? 'shadow-[0_18px_40px_-16px_rgba(245,158,11,0.65)] ring-2 ring-amber-400' : `shadow-[0_12px_28px_-20px_rgba(15,23,42,0.45)] ring-1 ${tier.ring}`}`}>
                <div className={`relative h-[124px] overflow-hidden bg-gradient-to-br ${tier.band}`}>
                  <span aria-hidden className="absolute -left-8 -top-10 h-28 w-28 rounded-full bg-white/45" />
                  <span aria-hidden className="absolute -bottom-10 right-16 h-24 w-24 rounded-full bg-white/35" />
                  <Sparkles aria-hidden className={`absolute left-[46%] top-3 h-4 w-4 ${tier.star} opacity-70`} />
                  <Sparkles aria-hidden className={`absolute bottom-4 left-[38%] h-3 w-3 ${tier.star} opacity-50`} />
                  <div className="relative z-10 flex h-full flex-col items-start justify-between p-3.5 pr-[104px] @[290px]:pr-[136px]">
                    {pkg.category?.trim() ? <span className={`max-w-full truncate rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide shadow-sm ${tier.tag}`}>{pkg.category.trim()}</span> : <span />}
                    <span className="flex items-center gap-0.5" role="img" aria-label={`${stars}/3`}>
                      {[0, 1, 2].map((n) => <Star key={n} className={`h-4 w-4 fill-current ${n < stars ? tier.star : 'text-white/80'}`} />)}
                    </span>
                  </div>
                  <img src={tier.mascot} alt="" width={360} height={360} loading="lazy" decoding="async" className="pointer-events-none absolute -bottom-2 right-1 h-[104px] w-[104px] object-contain mix-blend-multiply @[290px]:h-[132px] @[290px]:w-[132px]" />
                  {(pkg.featured || isTop) && (
                    <span className={`absolute right-2.5 top-2.5 z-20 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black shadow-md ${pkg.featured ? 'bg-rose-500 text-white' : 'bg-gradient-to-r from-amber-400 to-orange-500 text-white'}`}>
                      {!pkg.featured && <Crown className="h-3 w-3" />}
                      {pkg.featured ? (lang === 'vi' ? 'Phổ biến' : 'Popular') : 'VIP'}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col px-3.5 pb-4 pt-3">
                  <h3 className="text-base font-black uppercase leading-tight tracking-tight text-slate-900 @[290px]:text-lg">{pkg.name}</h3>
                  {highlights.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {highlights.map((line) => (
                        <li key={line} className="flex items-start gap-1.5 text-[11.5px] font-semibold leading-[1.15rem] text-slate-700 @[290px]:text-xs">
                          <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white ${tier.check}`}><Check className="h-3 w-3" strokeWidth={3.5} /></span>
                          <span className="min-w-0">{line}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-auto space-y-2.5 pt-3">
                    <p className={`rounded-xl py-1.5 text-center text-[13px] font-extrabold ${tier.pill}`}>{pkg.sessions} {lang === 'vi' ? 'buổi' : 'sessions'} × {pkg.minutesPerSession} {lang === 'vi' ? 'phút' : 'min'}</p>
                    <div className="min-h-[1.5rem]">
                      {discount > 0 && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs font-bold text-slate-400 line-through tabular-nums">{formatVnd(pkg.originalPrice || 0, pkg.currency)}</span>
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-600 ring-1 ring-rose-100">{lang === 'vi' ? 'Giảm' : 'Save'} {formatVnd(discount, pkg.currency)}</span>
                        </div>
                      )}
                    </div>
                    <strong className="block whitespace-nowrap text-[27px] font-black leading-none tracking-tight tabular-nums text-rose-600 @[290px]:text-4xl">{formatVnd(pkg.price, pkg.currency)}</strong>
                    <button
                      type="button"
                      onClick={() => { setSelectedId(pkg.id); setShowPayment(true) }}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-brand-300 to-brand-500 px-5 text-sm font-black uppercase tracking-wide text-brand-900 shadow-md shadow-brand-200 transition hover:brightness-105 active:scale-[0.98]"
                    >
                      {lang === 'vi' ? 'Chọn gói' : 'Select'}<ChevronRight className="h-4 w-4" strokeWidth={3} />
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
      <p className="flex items-start gap-1.5 rounded-2xl bg-sky-50 px-3 py-2.5 text-[11px] font-semibold leading-5 text-slate-600 ring-1 ring-sky-100">
        <span className="mt-0.5">ⓘ</span>
        {hasFiftyMinutePackage
          ? (lang === 'vi' ? '30 buổi × 50 phút tương đương 60 buổi × 25 phút. Học viên có thể linh hoạt lựa chọn thời lượng khi đặt lịch.' : '30 sessions × 50 min equals 60 sessions × 25 min. Students can flexibly choose the lesson length when booking.')
          : (lang === 'vi' ? 'Mỗi buổi học 25 phút. Học viên có thể linh hoạt lựa chọn thời lượng khi đặt lịch.' : 'Each lesson is 25 minutes. Students can flexibly choose the lesson length when booking.')}
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

// 6 bậc màu tăng dần: xanh bạc hà (dễ gần) → vàng VIP. Linh vật thương hiệu nằm trong /public/package-mascots.
const PACKAGE_TIERS = [
  { band: 'from-emerald-200 via-emerald-100 to-teal-50', ring: 'ring-emerald-200', tag: 'bg-white/85 text-emerald-700', star: 'text-emerald-500', pill: 'bg-emerald-50 text-emerald-800', check: 'bg-emerald-500', mascot: '/package-mascots/lion.jpg' },
  { band: 'from-sky-200 via-sky-100 to-cyan-50', ring: 'ring-sky-200', tag: 'bg-white/85 text-sky-700', star: 'text-sky-500', pill: 'bg-sky-50 text-sky-800', check: 'bg-sky-500', mascot: '/package-mascots/elephant.jpg' },
  { band: 'from-violet-200 via-violet-100 to-fuchsia-50', ring: 'ring-violet-200', tag: 'bg-white/85 text-violet-700', star: 'text-violet-500', pill: 'bg-violet-50 text-violet-800', check: 'bg-violet-500', mascot: '/package-mascots/giraffe.jpg' },
  { band: 'from-pink-200 via-rose-100 to-orange-50', ring: 'ring-pink-200', tag: 'bg-white/85 text-pink-700', star: 'text-pink-500', pill: 'bg-pink-50 text-pink-800', check: 'bg-pink-500', mascot: '/package-mascots/lion.jpg' },
  { band: 'from-orange-200 via-amber-100 to-yellow-50', ring: 'ring-orange-200', tag: 'bg-white/85 text-orange-700', star: 'text-orange-500', pill: 'bg-orange-50 text-orange-800', check: 'bg-orange-500', mascot: '/package-mascots/elephant.jpg' },
  { band: 'from-amber-300 via-yellow-200 to-amber-50', ring: 'ring-amber-300', tag: 'bg-white/90 text-amber-800', star: 'text-amber-500', pill: 'bg-amber-50 text-amber-900', check: 'bg-amber-500', mascot: '/package-mascots/giraffe.jpg' },
]

// Gói rẻ nhất luôn là bậc đầu, gói đắt nhất luôn là bậc VIP, các gói giữa dàn đều.
function tierIndexFor(rank: number, total: number) {
  if (total <= 1) return 0
  return Math.round((rank * (PACKAGE_TIERS.length - 1)) / (total - 1))
}

function formatVnd(amount: number, currency?: string) {
  if (!currency || currency.toUpperCase() === 'VND') return `${Math.round(amount).toLocaleString('vi-VN')}đ`
  return formatMoney(amount, currency)
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
