import type { ComponentType, CSSProperties } from 'react'
import {
  Gift,
  Loader2,
  PartyPopper,
  Rocket,
  Star,
  Trophy,
  type LucideProps,
} from 'lucide-react'
import {
  ONLINE_CLASSROOM_GIFT_CATALOG,
  type OnlineClassroomGiftEvent,
  type OnlineClassroomGiftType,
} from '@/lib/onlineClassroomGifts'
import './ClassroomGiftExperience.css'

type GiftIcon = ComponentType<LucideProps>

const giftIcons: Record<OnlineClassroomGiftType, GiftIcon> = {
  'gold-star': Star,
  'champion-cup': Trophy,
  rocket: Rocket,
  celebration: PartyPopper,
}

type ClassroomGiftTrayProps = {
  studentName: string
  canSend: boolean
  sendingGiftType: OnlineClassroomGiftType | null
  loading?: boolean
  sendError?: string
  syncWarning?: string
  onSend: (giftType: OnlineClassroomGiftType) => void | Promise<void>
}

export function ClassroomGiftTray({
  studentName,
  canSend,
  sendingGiftType,
  loading = false,
  sendError = '',
  syncWarning = '',
  onSend,
}: ClassroomGiftTrayProps) {
  if (!canSend) return null
  const safeStudentName = studentName.trim() || 'học viên'

  return (
    <section
      className="rounded-2xl border border-amber-200 bg-amber-50/95 p-3 shadow-sm"
      aria-labelledby="classroom-gift-tray-title"
    >
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="classroom-gift-tray-title" className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <Gift className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            Tặng lời khen cho {safeStudentName}
          </h2>
          <p className="mt-0.5 text-xs font-medium text-slate-600">
            Quà chỉ tạo hiệu ứng trong lớp, không cộng kim cương và không ảnh hưởng lương.
          </p>
        </div>
        {loading && (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-amber-800">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Đồng bộ
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ONLINE_CLASSROOM_GIFT_CATALOG.map((item) => {
          const Icon = giftIcons[item.type]
          const isSending = sendingGiftType === item.type
          return (
            <button
              key={item.type}
              type="button"
              disabled={Boolean(sendingGiftType)}
              onClick={() => void onSend(item.type)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
              aria-label={`Tặng ${item.title} cho ${safeStudentName}`}
              title={item.title}
            >
              {isSending
                ? <Loader2 className="h-4 w-4 animate-spin text-amber-600" aria-hidden="true" />
                : <Icon className="h-4 w-4 text-amber-600" strokeWidth={2.25} aria-hidden="true" />}
              <span>{isSending ? 'Đang gửi' : item.shortLabel}</span>
            </button>
          )
        })}
      </div>

      {(sendError || syncWarning) && (
        <p className="mt-2.5 text-xs font-semibold text-rose-700" role="alert">
          {sendError || `Mất tín hiệu đồng bộ quà: ${syncWarning}`}
        </p>
      )}
    </section>
  )
}

type ClassroomGiftOverlayProps = {
  gift: OnlineClassroomGiftEvent | null
  pendingGiftCount?: number
}

const particleLayout = [
  { x: '-142px', y: '-70px', delay: '80ms', rotate: '-22deg' },
  { x: '-104px', y: '-144px', delay: '220ms', rotate: '18deg' },
  { x: '-54px', y: '-176px', delay: '40ms', rotate: '44deg' },
  { x: '12px', y: '-188px', delay: '160ms', rotate: '-35deg' },
  { x: '74px', y: '-162px', delay: '280ms', rotate: '28deg' },
  { x: '132px', y: '-104px', delay: '100ms', rotate: '54deg' },
  { x: '-154px', y: '-16px', delay: '300ms', rotate: '38deg' },
  { x: '154px', y: '-28px', delay: '20ms', rotate: '-48deg' },
] as const

export function ClassroomGiftOverlay({ gift, pendingGiftCount = 0 }: ClassroomGiftOverlayProps) {
  if (!gift) return null
  const Icon = giftIcons[gift.giftType]

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-live="polite" aria-atomic="true">
      <p className="sr-only">
        {gift.senderName} tặng {gift.title} cho {gift.recipientName}. {gift.message}
      </p>
      <div key={gift.id} className="classroom-gift-stage absolute inset-x-4 bottom-[14%] mx-auto w-fit max-w-[calc(100vw-2rem)]">
        <div className="classroom-gift-halo" aria-hidden="true" />
        {particleLayout.map((particle, index) => (
          <span
            key={`${gift.id}-particle-${index}`}
            className="classroom-gift-particle"
            style={{
              '--gift-particle-x': particle.x,
              '--gift-particle-y': particle.y,
              '--gift-particle-delay': particle.delay,
              '--gift-particle-rotate': particle.rotate,
            } as CSSProperties}
            aria-hidden="true"
          />
        ))}
        <div className="classroom-gift-icon-wrap" aria-hidden="true">
          <Icon className="classroom-gift-icon h-16 w-16 sm:h-20 sm:w-20" strokeWidth={1.8} />
        </div>
        <div className="classroom-gift-card relative mt-3 min-w-[260px] max-w-sm rounded-2xl border border-white/20 bg-slate-950/90 px-5 py-3.5 text-center text-white shadow-2xl shadow-amber-950/30 backdrop-blur-md">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">
            {gift.senderName} tặng {gift.recipientName}
          </p>
          <p className="mt-1 text-lg font-black tracking-tight text-white">{gift.title}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-200">{gift.message}</p>
          {pendingGiftCount > 0 && (
            <p className="mt-2 text-[11px] font-semibold text-amber-200">
              Còn {pendingGiftCount} lời khen đang chờ
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
