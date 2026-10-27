import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  BarChart3,
  BadgePercent,
  CalendarDays,
  FileCheck2,
  Gift,
  GraduationCap,
  Heart,
  Info,
  Tag,
  Trophy,
  UserRound,
  X,
} from 'lucide-react'
import { classHuntPromoPointsPer25Minutes } from '@/lib/classHunting'

/** "Quyền lợi dành cho giáo viên": the short list behind the info button on a promo offer. */
const TEACHER_BENEFITS: Array<{ icon: typeof Heart; className: string; text: string }> = [
  { icon: UserRound, className: 'text-rose-500', text: 'Được ưu tiên hiển thị với học viên có nhu cầu gấp nhờ gắn nhãn lớp ưu đãi' },
  { icon: CalendarDays, className: 'text-rose-500', text: 'Tăng cơ hội nhận lớp, đặc biệt trong khung giờ cao điểm' },
  { icon: Trophy, className: 'text-amber-500', text: 'Vẫn đảm bảo mức thu nhập tốt theo đúng chính sách của nền tảng' },
  { icon: BarChart3, className: 'text-violet-500', text: 'Góp phần giúp học viên tiếp cận việc học dễ dàng hơn' },
  { icon: Gift, className: 'text-amber-500', text: 'Đồng hành phát triển cùng cộng đồng giáo dục chất lượng cao' },
]

/** "Đặc quyền dành cho gia sư lớp ưu đãi": the detailed perks behind "Xem đặc quyền gia sư". */
const TUTOR_PERKS: Array<{ icon: typeof Heart; tone: string; title: string; text: string }> = [
  { icon: GraduationCap, tone: 'bg-rose-50 text-rose-600', title: 'Gia sư mới', text: 'Tăng cơ hội nhận lớp, tích lũy kinh nghiệm và tự tin đứng lớp.' },
  { icon: BarChart3, tone: 'bg-amber-50 text-amber-500', title: 'Gia sư hiện tại', text: 'Nhận thêm lớp, mở rộng nguồn thu nhập.' },
  { icon: FileCheck2, tone: 'bg-blue-50 text-blue-600', title: 'Hỗ trợ thực tập', text: 'Ký xác nhận, đóng dấu mộc theo quy định.' },
  { icon: Trophy, tone: 'bg-violet-50 text-violet-600', title: 'Ghi nhận thành tích', text: 'Trao bằng khen cho gia sư tích cực.' },
  { icon: Gift, tone: 'bg-rose-50 text-rose-600', title: 'Quà tặng tri ân', text: 'Gửi quà tận nhà cho gia sư đủ điều kiện.' },
]

/** Click-to-toggle popover that closes on outside click or Escape (works on touch, unlike hover). */
function Popover({
  trigger,
  children,
  label,
  align = 'left',
}: {
  trigger: (props: { open: boolean; toggle: () => void; controls: string }) => ReactNode
  children: (close: () => void) => ReactNode
  label: string
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [shift, setShift] = useState(0)
  const rootRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLSpanElement>(null)
  const id = useId()

  // Keep the panel inside the viewport on narrow screens.
  useLayoutEffect(() => {
    if (!open || !panelRef.current) return
    const rect = panelRef.current.getBoundingClientRect()
    const margin = 12
    if (rect.right > window.innerWidth - margin) setShift((value) => value - (rect.right - (window.innerWidth - margin)))
    else if (rect.left < margin) setShift((value) => value + (margin - rect.left))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={rootRef} className="relative inline-flex">
      {trigger({ open, toggle: () => { setShift(0); setOpen((value) => !value) }, controls: id })}
      {open && (
        <span
          ref={panelRef}
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          id={id}
          role="dialog"
          aria-label={label}
          className={`absolute top-full z-30 mt-2 block w-[min(24rem,calc(100vw-2.5rem))] rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children(() => setOpen(false))}
        </span>
      )}
    </span>
  )
}

function TeacherBenefitsList() {
  return (
    <>
      <span className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
        <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />Quyền lợi dành cho giáo viên
      </span>
      <ul className="mt-2 space-y-1.5">
        {TEACHER_BENEFITS.map(({ icon: Icon, className, text }) => (
          <li key={text} className="flex items-start gap-2 text-xs leading-5 text-slate-700">
            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${className}`} />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** "Lớp ưu đãi" chip with a SALE sticker; the (i) opens "Quyền lợi dành cho giáo viên". */
export function PromoSaleChip() {
  return (
    <span className="relative inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 py-1 pl-2.5 pr-1 text-xs font-extrabold text-orange-600">
      <Gift className="h-3.5 w-3.5" aria-hidden="true" />
      Lớp ưu đãi
      <span className="-mt-3 -rotate-12 rounded bg-rose-600 px-1 text-[9px] font-black uppercase leading-4 text-white shadow-sm" aria-hidden="true">Sale</span>
      <Popover
        label="Quyền lợi dành cho giáo viên"
        trigger={({ open, toggle, controls }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={controls}
            aria-label="Xem quyền lợi dành cho giáo viên"
            className="flex h-6 w-6 items-center justify-center rounded-full text-amber-500 transition hover:bg-amber-100"
          >
            <Info className="h-4 w-4" />
          </button>
        )}
      >
        {() => <TeacherBenefitsList />}
      </Popover>
    </span>
  )
}

/** Red "Giảm giá ưu đãi X%" pill shown under "Đơn giá lớp". */
export function PromoDiscountPill({ percent, className = '' }: { percent: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-extrabold text-rose-600 ${className}`}>
      <BadgePercent className="h-3.5 w-3.5" aria-hidden="true" />Giảm giá ưu đãi {percent}%
    </span>
  )
}

/** "Xem đặc quyền gia sư" link with the "Đặc quyền dành cho gia sư lớp ưu đãi" panel. */
export function PromoPerksButton({ align = 'left' }: { align?: 'left' | 'right' }) {
  return (
    <Popover
      label="Đặc quyền dành cho gia sư lớp ưu đãi"
      align={align}
      trigger={({ open, toggle, controls }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={controls}
          className="inline-flex min-h-7 items-center gap-1 rounded-md px-1 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
        >
          <Info className="h-3.5 w-3.5" />Xem đặc quyền gia sư
        </button>
      )}
    >
      {(close) => (
        <>
          <span className="flex items-start justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-extrabold text-rose-600">
              <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />Đặc quyền dành cho gia sư lớp ưu đãi
            </span>
            <button type="button" onClick={close} aria-label="Đóng" className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </span>
          <ul className="mt-3 space-y-3">
            {TUTOR_PERKS.map(({ icon: Icon, tone, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4.5 w-4.5" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-slate-900">{title}</span>
                  <span className="block text-xs leading-5 text-slate-600">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Popover>
  )
}

/** Chip row: "Lớp ưu đãi" · "SALE X%" · "Xem đặc quyền gia sư". */
export function PromoTagRow({ percent, className = '' }: { percent: number; className?: string }) {
  return (
    <span className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-600 ring-1 ring-inset ring-orange-200">
        <Gift className="h-3.5 w-3.5" aria-hidden="true" />Lớp ưu đãi
      </span>
      <span className="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-extrabold uppercase text-rose-600 ring-1 ring-inset ring-rose-200">Sale {percent}%</span>
      <PromoPerksButton />
    </span>
  )
}

/** Promo summary box for operators: tags, the class rate basis and the tutor discount. */
export function PromoRateCard({ percent, className = '' }: { percent: number; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-3 ${className}`}>
      <PromoTagRow percent={percent} />
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Đơn giá lớp</p>
        <p className="mt-1 text-sm font-extrabold text-slate-950">Theo đơn giá môn × level</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-rose-600">
          <Tag className="h-4 w-4" aria-hidden="true" />Áp dụng giảm thù lao {percent}%
        </p>
        <p className="mt-1.5 text-xs text-slate-500">Gia sư xem mức thù lao sau ưu đãi trước khi nhận lớp.</p>
        <p className="mt-1 text-xs font-semibold text-slate-600">
          Học viên: {classHuntPromoPointsPer25Minutes(percent)} kim cương / 25 phút (thay vì 25), số phút học không đổi.
        </p>
      </div>
    </div>
  )
}
