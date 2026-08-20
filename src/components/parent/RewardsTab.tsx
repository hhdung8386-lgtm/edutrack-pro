import { useEffect, useState, type ReactNode } from 'react'
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore'
import { Gift, History, ImageOff, Star, X } from 'lucide-react'
import { db } from '@/lib/firebase'
import { RewardGift, RewardRedemption, Student } from '@/types'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'

export function RewardsTab({ student, lang, beforeCatalog }: { student: Student; lang: string; beforeCatalog?: ReactNode }) {
  const [gifts, setGifts] = useState<RewardGift[]>([])
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [rewardPoints, setRewardPoints] = useState(student.rewardPoints || 0)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => onSnapshot(doc(db, 'students', student.id), (snap) => {
    if (snap.exists()) setRewardPoints(Number(snap.data().rewardPoints || 0))
  }), [student.id])

  useEffect(() => onSnapshot(collection(db, 'rewardCatalog'), (snap) => {
    setGifts(snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as RewardGift))
      .filter((gift) => gift.status === 'active')
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.points - b.points))
  }, () => setLoadError(true)), [])

  useEffect(() => {
    const q = query(collection(db, 'rewardRedemptions'), where('studentId', '==', student.id))
    return onSnapshot(q, (snap) => {
      setRedemptions(snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as RewardRedemption))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)))
    }, () => setLoadError(true))
  }, [student.id])

  const pendingPoints = redemptions
    .filter((item) => item.status === 'pending')
    .reduce((sum, item) => sum + item.points, 0)
  const availablePoints = Math.max(0, rewardPoints - pendingPoints)

  const redeem = async (gift: RewardGift) => {
    if ((gift.stock ?? 0) <= 0 || availablePoints < gift.points) return
    if (redemptions.some((item) => item.giftId === gift.id && item.status === 'pending')) {
      toast.warning(lang === 'vi' ? 'Quà này đang chờ Admin xác nhận' : 'This gift is already pending review')
      return
    }
    setSubmittingId(gift.id)
    try {
      await addDoc(collection(db, 'rewardRedemptions'), {
        studentId: student.id,
        studentCode: student.code,
        studentName: student.name,
        giftId: gift.id,
        giftName: gift.name,
        points: gift.points,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      toast.success(lang === 'vi' ? 'Đã gửi yêu cầu đổi quà' : 'Redemption request submitted')
    } catch (error) {
      console.error(error)
      toast.error(lang === 'vi' ? 'Không thể gửi yêu cầu đổi quà' : 'Could not submit redemption')
    } finally {
      setSubmittingId(null)
    }
  }

  return (
    <div className="space-y-5 pb-4">
      {beforeCatalog}

      <div className="flex min-h-9 items-center justify-between gap-4">
        <h2 className="text-lg font-black leading-none tracking-tight text-slate-900">{lang === 'vi' ? 'Đổi quà' : 'Rewards'}</h2>
        <button onClick={() => setShowHistory(true)} className="flex shrink-0 items-center gap-1.5 text-xs font-bold leading-none text-slate-500 transition hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2">
          <History className="h-4 w-4" /> {lang === 'vi' ? 'Lịch sử đổi quà' : 'History'}
        </button>
      </div>

      {loadError && <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">{lang === 'vi' ? 'Tính năng đổi quà đang chờ Admin hoàn tất quyền dữ liệu.' : 'Rewards are waiting for Admin to finish data permissions.'}</div>}

      {gifts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center">
          <Gift className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-500">{lang === 'vi' ? 'Admin chưa mở quà tặng' : 'No rewards available yet'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {gifts.map((gift) => {
            const pending = redemptions.some((item) => item.giftId === gift.id && item.status === 'pending')
            const disabled = (gift.stock ?? 0) <= 0 || availablePoints < gift.points || pending
            return (
              <article key={gift.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="aspect-[4/3] bg-slate-100">
                  <RewardImage src={gift.imageURL} alt={gift.name} />
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="line-clamp-2 text-sm font-bold leading-5 text-slate-900">{gift.name}</h3>
                  <p className="mt-1 flex items-center gap-1 text-xs font-black text-amber-600"><Star className="h-3.5 w-3.5 fill-current" /> {gift.points.toLocaleString('vi-VN')} {lang === 'vi' ? 'sao' : 'stars'}</p>
                  <Button onClick={() => redeem(gift)} loading={submittingId === gift.id} disabled={disabled} variant="outline" size="sm" className="mt-3 w-full border-brand-300 text-brand-800 hover:bg-brand-50 focus:ring-brand-300">
                    {pending ? (lang === 'vi' ? 'Đang chờ' : 'Pending') : (gift.stock ?? 0) <= 0 ? (lang === 'vi' ? 'Hết quà' : 'Out of stock') : lang === 'vi' ? 'Đổi quà' : 'Redeem'}
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onClick={() => setShowHistory(false)}>
          <aside className="h-full w-full max-w-sm overflow-y-auto bg-slate-50 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-lg font-black text-slate-900">{lang === 'vi' ? 'Lịch sử đổi quà' : 'Redemption history'}</h2><button onClick={() => setShowHistory(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><X className="h-5 w-5" /></button></div>
            <div className="mt-5 space-y-3">
              {redemptions.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">{lang === 'vi' ? 'Chưa có yêu cầu đổi quà' : 'No redemptions yet'}</p> : redemptions.map((item) => (
                <div key={item.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex justify-between gap-3"><p className="font-bold text-slate-900">{item.giftName}</p><span className={`text-xs font-bold ${item.status === 'approved' || item.status === 'fulfilled' ? 'text-emerald-600' : item.status === 'rejected' ? 'text-rose-600' : 'text-amber-600'}`}>{item.status === 'pending' ? (lang === 'vi' ? 'Chờ duyệt' : 'Pending') : item.status === 'approved' ? (lang === 'vi' ? 'Đã duyệt' : 'Approved') : item.status === 'fulfilled' ? (lang === 'vi' ? 'Đã nhận' : 'Fulfilled') : (lang === 'vi' ? 'Từ chối' : 'Rejected')}</span></div>
                  <p className="mt-2 text-xs font-semibold text-slate-500">{item.points} {lang === 'vi' ? 'sao' : 'stars'}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function RewardImage({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return <div className="flex h-full items-center justify-center bg-slate-50"><ImageOff className="h-9 w-9 text-slate-300" /></div>
  }

  return <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />
}
