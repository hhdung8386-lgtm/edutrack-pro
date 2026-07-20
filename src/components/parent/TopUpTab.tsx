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

export function TopUpTab({ student, lang }: { student: Student; lang: string }) {
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
  const minutesPerSession = student.minutesPerSession || 50
  const minuteSummary = getStudentPackageMinuteSummary(student)
  const totalMinutes = minuteSummary.totalMinutes
  const usedMinutes = Math.max(0, student.usedMinutes ?? student.usedSessions * minutesPerSession)
  const remainingMinutes = minuteSummary.remainingMinutes
  const heldMinutes = Math.max(0, student.reservedMinutes ?? student.heldMinutes ?? 0)
  const availableMinutes = Math.max(0, remainingMinutes - heldMinutes)
  const usedPercent = totalMinutes > 0 ? Math.min(100, Math.round((usedMinutes / totalMinutes) * 100)) : 0
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
      <section>
        <div className="flex items-start justify-between gap-3 px-1">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-950">{lang === 'vi' ? 'Ví học' : 'Learning wallet'}</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{lang === 'vi' ? 'Quản lý quỹ kim cương, sao và các ưu đãi của bạn.' : 'Manage your diamond balance, stars and benefits.'}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-sky-100 bg-white px-3 text-[11px] font-extrabold text-sky-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-brand-300 active:scale-[0.98]"
          >
            <History className="h-4 w-4" />
            {lang === 'vi' ? 'Lịch sử giao dịch' : 'Transaction history'}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-4 rounded-[26px] border border-sky-100 bg-gradient-to-br from-[#f3f8ff] via-white to-[#eef8ff] p-4 shadow-[0_20px_45px_-34px_rgba(2,132,199,0.65)] sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
              <WalletCards className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-700">{lang === 'vi' ? 'Kim cương trong gói' : 'Diamonds in your package'}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{lang === 'vi' ? 'Cập nhật theo dữ liệu học và lịch đã đặt' : 'Updated from lessons and reserved classes'}</p>
            </div>
          </div>

          <div className="mt-5 grid items-end gap-4 sm:grid-cols-[auto_1fr]">
            <div>
              <div className="flex items-end gap-2">
                <strong className="text-4xl font-black leading-none tracking-[-0.05em] tabular-nums text-slate-950 sm:text-5xl">{availableMinutes.toLocaleString('vi-VN')}</strong>
                <DiamondPointsIcon className="mb-0.5 h-5 w-5 text-violet-600" />
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Kim cương còn lại' : 'Available diamonds'}</p>
            </div>
            <div className="pb-1">
              <div className="flex justify-end">
                <span className="rounded-xl bg-white px-3 py-1.5 text-xs font-black tabular-nums text-sky-700 ring-1 ring-sky-100">{usedPercent}% {lang === 'vi' ? 'hoàn thành' : 'completed'}</span>
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-200/80" aria-label={lang === 'vi' ? 'Tiến độ sử dụng kim cương' : 'Diamond balance progress'}>
                <span className="h-full bg-sky-600" style={{ width: `${usedPercent}%` }} />
                <span className="h-full bg-amber-400" style={{ width: `${heldPercent}%` }} />
                <span className="h-full bg-emerald-400" style={{ width: `${availablePercent}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 divide-x divide-slate-200 rounded-2xl bg-white px-2 py-4 ring-1 ring-slate-200/80">
            <WalletMetric value={usedMinutes} label={lang === 'vi' ? 'Đã học' : 'Completed'} color="text-sky-700" lang={lang} />
            <WalletMetric value={heldMinutes} label={lang === 'vi' ? 'Đã đặt' : 'Reserved'} color="text-amber-600" lang={lang} />
            <WalletMetric value={totalMinutes} label={lang === 'vi' ? 'Tổng' : 'Total'} color="text-emerald-600" lang={lang} />
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between border-b border-slate-200/80 px-1 pb-3">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-950">{lang === 'vi' ? 'Nạp gói học' : 'Top up a package'}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Chọn gói phù hợp và thanh toán bằng chuyển khoản.' : 'Choose a package and pay by bank transfer.'}</p>
        </div>
      </div>
      {loadError && <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">{lang === 'vi' ? 'Tính năng nạp tiền đang chờ Admin hoàn tất quyền dữ liệu.' : 'Top-up is waiting for Admin to finish data permissions.'}</div>}
      {packagesLoading ? <PackageSkeleton /> : packages.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center"><CreditCard className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">{lang === 'vi' ? 'Admin chưa mở gói nạp tiền' : 'No top-up packages available'}</p></div> : (
        <div className="space-y-3">
          {packages.map((pkg) => <button key={pkg.id} onClick={() => setSelectedId(pkg.id)} className={`w-full rounded-2xl bg-white p-4 text-left transition ${selectedId === pkg.id ? 'ring-2 ring-sky-600 shadow-[0_12px_35px_-22px_rgba(2,132,199,.72)]' : 'ring-1 ring-slate-200 hover:ring-brand-300'}`}>
            <div className="flex items-start gap-3"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selectedId === pkg.id ? 'border-sky-600 bg-gradient-to-b from-brand-400 to-brand-500 text-brand-900' : 'border-slate-300'}`}>{selectedId === pkg.id && <Check className="h-3.5 w-3.5" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-black text-slate-900">{pkg.name}</p><strong className="text-lg font-black text-sky-700 tabular-nums">{formatMoney(pkg.price, pkg.currency)}</strong></div><div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600"><span className="rounded-lg bg-slate-100 px-2 py-1">{pkg.sessions} {lang === 'vi' ? 'buổi' : 'sessions'}</span><span className="rounded-lg bg-slate-100 px-2 py-1">{pkg.minutesPerSession} {lang === 'vi' ? 'phút/buổi' : 'min/session'}</span><span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-violet-700"><DiamondPointsIcon className="h-3.5 w-3.5" />{pkg.totalMinutes.toLocaleString('vi-VN')}</span></div></div></div>
          </button>)}
        </div>
      )}

      {settingsLoading ? <PaymentSkeleton /> : !settings?.qrImageURL ? <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">{lang === 'vi' ? 'Admin chưa cấu hình mã QR thanh toán.' : 'Payment QR has not been configured.'}</div> : (
        <section className="rounded-2xl bg-[#eef6ff] p-4 ring-1 ring-blue-100">
          <h3 className="flex items-center gap-2 font-black text-slate-900"><QrCode className="h-5 w-5 text-sky-600" />{lang === 'vi' ? 'Thanh toán chuyển khoản' : 'Bank transfer'}</h3>
          <div className="mt-4 grid gap-5 sm:grid-cols-[224px_1fr] sm:items-center">
            <PaymentQrImage
              src={settings.qrImageURL}
              alt={lang === 'vi' ? 'Mã QR thanh toán' : 'Payment QR code'}
              lang={lang}
              onCopy={copyQrImage}
              copying={copyingQr}
            />
            <div className="space-y-3 text-sm">
              <InfoRow label={lang === 'vi' ? 'Ngân hàng' : 'Bank'} value={settings.bankName} />
              <InfoRow label={lang === 'vi' ? 'Chủ tài khoản' : 'Account holder'} value={settings.accountName || ''} />
              <InfoRow label={lang === 'vi' ? 'Số tài khoản' : 'Account number'} value={settings.accountNumber || ''} copy={() => copy(settings.accountNumber || '')} />
              <InfoRow label={lang === 'vi' ? 'Nội dung chuyển khoản' : 'Transfer content'} value={transferContent} accent copy={() => copy(transferContent)} />
            </div>
          </div>
        </section>
      )}

      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><h3 className="font-black text-slate-900">{lang === 'vi' ? 'Cách xác nhận' : 'How confirmation works'}</h3><ol className="mt-3 space-y-2 text-sm leading-5 text-slate-600"><li>1. {lang === 'vi' ? 'Chọn đúng gói học.' : 'Select a package.'}</li><li>2. {lang === 'vi' ? 'Quét QR và nhập đúng nội dung chuyển khoản.' : 'Scan QR and use the exact transfer content.'}</li><li>3. {lang === 'vi' ? 'Bấm gửi xác nhận; Admin kiểm tra trước khi cộng kim cương.' : 'Submit confirmation; Admin verifies before adding diamonds.'}</li></ol></div>
      {settings?.supportNote && (
        <section className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 ring-1 ring-sky-100">
              <Headphones className="h-4.5 w-4.5" />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900">{lang === 'vi' ? 'Hỗ trợ nạp tiền' : 'Top-up support'}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{settings.supportNote.replace(/[–—]/g, '-')}</p>
            </div>
          </div>
        </section>
      )}
      <Button fullWidth size="lg" onClick={submit} loading={submitting} disabled={!selected || !settings?.qrImageURL || pending} className="bg-gradient-to-b from-brand-400 to-brand-500 text-brand-900 hover:brightness-105 focus:ring-brand-300">
        {pending ? <><Clock3 className="h-4 w-4" />{lang === 'vi' ? 'Đang chờ Admin xác nhận' : 'Waiting for Admin'}</> : lang === 'vi' ? 'Tôi đã chuyển khoản' : 'I have transferred'}
      </Button>

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
