import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  CirclePlus,
  Clock3,
  Gift,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  Trophy,
} from 'lucide-react'
import type { BookingRequest, Lesson, StudentSubject, TopUpBatch } from '@/types'
import { getBookingPoints } from '@/lib/points'
import { DiamondPointsIcon } from '@/components/shared/DiamondPointsIcon'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface StudentCourseOverviewProps {
  subjects: StudentSubject[]
  lessons: Lesson[]
  heldBookings: BookingRequest[]
  unmatchedHeldBookingIds: Set<string>
  studentCreatedAtLabel: string
  onAddSubject: () => void
  onAddRights: (subjectId: string) => void
  onEditSubject: (subjectId: string) => void
  onDeleteSubject: (subjectId: string) => Promise<void>
}

interface CoursePaymentRow {
  id: string
  ordinal: number
  content: string
  learningMinutes: number
  diamonds: number
  paymentDate: string
  note: string
  kind: 'payment' | 'gift'
  usedDiamonds: number
}

interface CourseRow {
  subject: StudentSubject
  registeredMinutes: number
  registeredDiamonds: number
  learnedMinutes: number
  learnedDiamonds: number
  bookedMinutes: number
  bookedDiamonds: number
  remainingMinutes: number
  remainingDiamonds: number
  payments: CoursePaymentRow[]
  gifts: CoursePaymentRow[]
  hasLessonHistory: boolean
  completedAt: string
  isCompleted: boolean
}

const number = (value: number) => Math.max(0, Math.round(Number(value) || 0)).toLocaleString('vi-VN')

function batchDiamonds(batch: TopUpBatch, subject: StudentSubject) {
  if (Number.isFinite(Number(batch.diamonds))) return Math.max(0, Number(batch.diamonds))
  return Math.max(0, Number(batch.totalSessions || 0) * Number(subject.minutesPerSession || 25))
}

function batchLearningMinutes(batch: TopUpBatch, subject: StudentSubject) {
  if (Number.isFinite(Number(batch.learningMinutes))) return Math.max(0, Number(batch.learningMinutes))
  return batchDiamonds(batch, subject)
}

function normalizePayments(subject: StudentSubject, fallbackDate: string): CoursePaymentRow[] {
  const batches = subject.batches?.length
    ? subject.batches
    : [{ id: 'legacy', createdAt: fallbackDate, totalSessions: subject.totalSessions }]
  let usedDiamonds = Math.max(0, Number(subject.usedMinutes || 0))

  return batches.map((batch, index) => {
    const diamonds = batchDiamonds(batch, subject)
    const allocated = Math.min(usedDiamonds, diamonds)
    usedDiamonds = Math.max(0, usedDiamonds - allocated)
    return {
      id: batch.id || String(index + 1),
      ordinal: index + 1,
      content: batch.content?.trim() || (batch.kind === 'gift' ? `Buổi tặng #${String(index + 1).padStart(2, '0')}` : `Thanh toán đợt ${index + 1}`),
      learningMinutes: batchLearningMinutes(batch, subject),
      diamonds,
      paymentDate: batch.paymentDate || batch.createdAt || fallbackDate,
      note: batch.note?.trim() || batch.reason?.trim() || '',
      kind: batch.kind === 'gift' ? 'gift' : 'payment',
      usedDiamonds: allocated,
    }
  })
}

function Metric({ minutes, diamonds, tone = 'slate' }: { minutes: number; diamonds: number; tone?: 'slate' | 'indigo' | 'amber' | 'emerald' }) {
  const tones = {
    slate: 'text-slate-900',
    indigo: 'text-indigo-700',
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
  }
  return (
    <div className="min-w-0">
      <p className={`whitespace-nowrap text-sm font-extrabold tabular-nums ${tones[tone]}`}>{number(minutes)} phút</p>
      <p className="mt-1 inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold tabular-nums text-slate-500">
        <DiamondPointsIcon className="h-3.5 w-3.5" />{number(diamonds)}
      </p>
    </div>
  )
}

function CourseIdentity({ subject, paymentCount }: { subject: StudentSubject; paymentCount: number }) {
  return (
    <div className="flex min-w-[170px] items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
        <BookOpen className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold text-slate-950">{subject.subjectName}</p>
        <p className="mt-1 text-[11px] font-medium text-slate-500">{paymentCount} đợt thanh toán</p>
      </div>
    </div>
  )
}

function CourseDetailModal({ row, onClose, onEdit, onDelete }: {
  row: CourseRow
  onClose: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
}) {
  const summaryCards: Array<{ label: string; minutes: number; diamonds: number; icon: LucideIcon; tone: string }> = [
    { label: 'Đăng ký', minutes: row.registeredMinutes, diamonds: row.registeredDiamonds, icon: Clock3, tone: 'text-indigo-600 bg-indigo-50' },
    { label: 'Đã học', minutes: row.learnedMinutes, diamonds: row.learnedDiamonds, icon: BookOpen, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Đã đặt', minutes: row.bookedMinutes, diamonds: row.bookedDiamonds, icon: CalendarDays, tone: 'text-amber-600 bg-amber-50' },
    { label: 'Còn lại', minutes: row.remainingMinutes, diamonds: row.remainingDiamonds, icon: Trophy, tone: 'text-sky-600 bg-sky-50' },
  ]

  return (
    <Modal open onClose={onClose} size="xl" title="Chi tiết khóa học" footer={
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEdit}><Pencil className="h-4 w-4" />Sửa khóa học</Button>
          <Button variant="ghost" disabled={row.hasLessonHistory} title={row.hasLessonHistory ? 'Không thể xóa khóa học đã có lịch sử học' : 'Xóa khóa học'} onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-rose-500" />Xóa
          </Button>
        </div>
        <Button variant="outline" onClick={onClose}>Đóng</Button>
      </div>
    }>
      <div className="space-y-6">
        <section className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-[0_18px_50px_-38px_rgba(49,46,129,0.55)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
                <BookOpen className="h-7 w-7" />
              </span>
              <div>
                <h3 className="text-xl font-black tracking-tight text-slate-950">{row.subject.subjectName}</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${row.isCompleted ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}`}>
                    {row.isCompleted ? 'Đã hoàn thành' : 'Đang học'}
                  </span>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{row.payments.length} đợt thanh toán</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50/70">
              <div className="px-5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Tổng phút</p>
                <p className="mt-1 text-lg font-black tabular-nums text-indigo-700">{number(row.registeredMinutes)}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Tổng kim cương</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-lg font-black tabular-nums text-sky-700"><DiamondPointsIcon className="h-5 w-5" />{number(row.registeredDiamonds)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map(({ label, minutes, diamonds, icon: Icon, tone }) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4.5 w-4.5" /></div>
              <p className="mt-3 text-xs font-bold text-slate-500">{label}</p>
              <p className="mt-1 text-base font-black tabular-nums text-slate-950">{number(minutes)} phút</p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold tabular-nums text-slate-500"><DiamondPointsIcon className="h-3.5 w-3.5" />{number(diamonds)}</p>
            </article>
          ))}
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-indigo-600" />
            <h3 className="text-base font-extrabold text-slate-950">Lịch sử thanh toán / cộng thêm</h3>
          </div>
          {row.payments.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-3">Đợt</th><th className="px-4 py-3">Nội dung</th><th className="px-4 py-3">Phút</th><th className="px-4 py-3">Kim cương</th><th className="px-4 py-3">Ngày thanh toán</th><th className="px-4 py-3">Ghi chú</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {row.payments.map((payment) => (
                      <tr key={payment.id} className="transition-colors hover:bg-indigo-50/35">
                        <td className="px-4 py-3"><span className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-extrabold text-indigo-700">Đợt {payment.ordinal}</span></td>
                        <td className="px-4 py-3 font-bold text-slate-800">{payment.content}</td>
                        <td className="px-4 py-3 font-bold tabular-nums text-indigo-700">{number(payment.learningMinutes)} phút</td>
                        <td className="px-4 py-3"><span className="inline-flex items-center gap-1 font-bold tabular-nums text-sky-700"><DiamondPointsIcon className="h-3.5 w-3.5" />{number(payment.diamonds)}</span></td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">{payment.paymentDate}</td>
                        <td className="px-4 py-3 text-slate-500">{payment.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-slate-100 md:hidden">
                {row.payments.map((payment) => (
                  <article key={payment.id} className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3"><strong className="text-sm text-slate-900">{payment.content}</strong><span className="shrink-0 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-extrabold text-indigo-700">Đợt {payment.ordinal}</span></div>
                    <div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-slate-400">Quyền học</p><p className="mt-1 font-bold text-slate-700">{number(payment.learningMinutes)} phút · <span className="text-sky-700">{number(payment.diamonds)} KC</span></p></div><div><p className="text-slate-400">Ngày thanh toán</p><p className="mt-1 font-bold text-slate-700">{payment.paymentDate}</p></div></div>
                    {payment.note && <p className="text-xs leading-5 text-slate-500">{payment.note}</p>}
                  </article>
                ))}
              </div>
            </div>
          ) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm font-medium text-slate-500">Chưa có lịch sử thanh toán riêng cho khóa học này.</div>}
        </section>
      </div>
    </Modal>
  )
}

export function StudentCourseOverview({
  subjects,
  lessons,
  heldBookings,
  unmatchedHeldBookingIds,
  studentCreatedAtLabel,
  onAddSubject,
  onAddRights,
  onEditSubject,
  onDeleteSubject,
}: StudentCourseOverviewProps) {
  const [detailSubjectId, setDetailSubjectId] = useState<string | null>(null)

  const rows = useMemo<CourseRow[]>(() => subjects.map((subject) => {
    const subjectLessons = lessons.filter((lesson) => lesson.status === 'approved' && lesson.subjectId === subject.subjectId)
    const subjectBookings = heldBookings.filter((booking) => booking.subjectId === subject.subjectId || (subjects.length === 1 && unmatchedHeldBookingIds.has(booking.id)))
    const payments = normalizePayments(subject, studentCreatedAtLabel)
    const registeredMinutes = payments.reduce((sum, payment) => sum + payment.learningMinutes, 0) || Number(subject.totalMinutes || 0)
    const learnedMinutes = subjectLessons.reduce((sum, lesson) => sum + Math.max(0, Number(lesson.minutes || 0)), 0)
    const bookedMinutes = subjectBookings.reduce((sum, booking) => sum + Math.max(0, Number(booking.requestedMinutes || 0)), 0)
    const bookedDiamonds = subjectBookings.reduce((sum, booking) => sum + getBookingPoints(booking), 0)
    const remainingDiamonds = Math.max(0, Number(subject.remainingMinutes || 0) - bookedDiamonds)
    return {
      subject,
      registeredMinutes,
      registeredDiamonds: Number(subject.totalMinutes || 0),
      learnedMinutes,
      learnedDiamonds: Number(subject.usedMinutes || 0),
      bookedMinutes,
      bookedDiamonds,
      remainingMinutes: Math.max(0, registeredMinutes - learnedMinutes - bookedMinutes),
      remainingDiamonds,
      payments: payments.filter((payment) => payment.kind === 'payment'),
      gifts: payments.filter((payment) => payment.kind === 'gift'),
      hasLessonHistory: lessons.some((lesson) => lesson.subjectId === subject.subjectId),
      completedAt: subjectLessons[0]?.date || '—',
      isCompleted: Number(subject.remainingMinutes || 0) <= 0 && bookedDiamonds <= 0,
    }
  }), [heldBookings, lessons, studentCreatedAtLabel, subjects, unmatchedHeldBookingIds])

  const activeRows = rows.filter((row) => !row.isCompleted)
  const completedRows = rows.filter((row) => row.isCompleted)
  const giftRows = rows.flatMap((row) => row.gifts.map((gift) => ({ ...gift, subjectName: row.subject.subjectName })))
  const detailRow = rows.find((row) => row.subject.subjectId === detailSubjectId) || null

  return (
    <section className="space-y-5" aria-labelledby="course-entitlements-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo-500">Quyền học</p>
          <h2 id="course-entitlements-title" className="mt-1 text-xl font-black tracking-tight text-slate-950">Khóa học của học viên</h2>
          <p className="mt-1 text-sm text-slate-500">Theo dõi riêng thời lượng học, kim cương và từng đợt thanh toán.</p>
        </div>
        <Button variant="outline" onClick={onAddSubject} className="border-indigo-200 bg-white text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50"><Plus className="h-4 w-4" />Thêm môn học</Button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_20px_55px_-44px_rgba(76,29,149,0.55)]">
        <div className="flex items-center gap-3 border-b border-violet-100 bg-violet-50/60 px-4 py-3.5 sm:px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-violet-600 ring-1 ring-violet-100"><Gift className="h-4.5 w-4.5" /></span>
          <h3 className="font-extrabold text-slate-950">Buổi tặng</h3><span className="rounded-md bg-white px-2 py-0.5 text-xs font-black text-violet-700 ring-1 ring-violet-100">{giftRows.length}</span>
        </div>
        {giftRows.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {giftRows.map((gift) => {
              const remaining = Math.max(0, gift.diamonds - gift.usedDiamonds)
              return <article key={`${gift.subjectName}-${gift.id}`} className="grid gap-3 px-4 py-4 sm:grid-cols-[1.2fr_1fr_1.2fr_auto] sm:items-center sm:px-5">
                <div><p className="text-sm font-extrabold text-slate-900">{gift.content}</p><p className="mt-1 text-xs font-medium text-slate-500">{gift.subjectName}</p></div>
                <Metric minutes={gift.learningMinutes} diamonds={gift.diamonds} tone="indigo" />
                <div><p className="text-xs font-semibold text-slate-700">{gift.note || 'Không có ghi chú'}</p><p className="mt-1 text-[11px] text-slate-400">Ngày tặng: {gift.paymentDate}</p></div>
                <span className={`w-fit rounded-lg px-2.5 py-1 text-xs font-bold ${remaining > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{remaining > 0 ? 'Chưa dùng' : 'Đã dùng'}</span>
              </article>
            })}
          </div>
        ) : <div className="px-5 py-7 text-center text-sm font-medium text-slate-500">Chưa có buổi tặng nào được ghi nhận.</div>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-[0_22px_60px_-46px_rgba(30,64,175,0.55)]">
        <div className="flex items-center gap-3 border-b border-indigo-100 bg-indigo-50/60 px-4 py-3.5 sm:px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-indigo-600 ring-1 ring-indigo-100"><BookOpen className="h-4.5 w-4.5" /></span>
          <h3 className="font-extrabold text-slate-950">Đang học</h3><span className="rounded-md bg-white px-2 py-0.5 text-xs font-black text-indigo-700 ring-1 ring-indigo-100">{activeRows.length}</span>
        </div>
        {activeRows.length > 0 ? <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Khóa học</th><th className="px-4 py-3">Đăng ký</th><th className="px-4 py-3">Đã học</th><th className="px-4 py-3">Đã đặt</th><th className="px-4 py-3">Còn lại</th><th className="px-4 py-3 text-center">Thao tác</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {activeRows.map((row) => <tr key={row.subject.subjectId} className="transition-colors hover:bg-indigo-50/35">
                  <td className="px-5 py-4"><CourseIdentity subject={row.subject} paymentCount={row.payments.length} /></td>
                  <td className="px-4 py-4"><Metric minutes={row.registeredMinutes} diamonds={row.registeredDiamonds} /></td>
                  <td className="px-4 py-4"><Metric minutes={row.learnedMinutes} diamonds={row.learnedDiamonds} tone="indigo" /></td>
                  <td className="px-4 py-4"><Metric minutes={row.bookedMinutes} diamonds={row.bookedDiamonds} tone="amber" /></td>
                  <td className="px-4 py-4"><Metric minutes={row.remainingMinutes} diamonds={row.remainingDiamonds} tone="emerald" /></td>
                  <td className="px-4 py-4"><div className="flex justify-center gap-2"><button type="button" onClick={() => onAddRights(row.subject.subjectId)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700 transition hover:-translate-y-0.5 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 active:translate-y-0" aria-label={`Cộng thêm quyền học cho ${row.subject.subjectName}`}><Plus className="h-5 w-5" /></button><button type="button" onClick={() => setDetailSubjectId(row.subject.subjectId)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 active:translate-y-0" aria-label={`Xem chi tiết ${row.subject.subjectName}`}><ChevronRight className="h-5 w-5" /></button></div></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-100 md:hidden">
            {activeRows.map((row) => <article key={row.subject.subjectId} className="p-4">
              <CourseIdentity subject={row.subject} paymentCount={row.payments.length} />
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3"><div><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Đăng ký</p><Metric minutes={row.registeredMinutes} diamonds={row.registeredDiamonds} /></div><div><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Đã học</p><Metric minutes={row.learnedMinutes} diamonds={row.learnedDiamonds} tone="indigo" /></div><div><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Đã đặt</p><Metric minutes={row.bookedMinutes} diamonds={row.bookedDiamonds} tone="amber" /></div><div><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Còn lại</p><Metric minutes={row.remainingMinutes} diamonds={row.remainingDiamonds} tone="emerald" /></div></div>
              <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => onAddRights(row.subject.subjectId)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-50 text-sm font-bold text-indigo-700 ring-1 ring-inset ring-indigo-100"><CirclePlus className="h-4 w-4" />Cộng thêm</button><button type="button" onClick={() => setDetailSubjectId(row.subject.subjectId)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-slate-700 ring-1 ring-inset ring-slate-200">Chi tiết<ChevronRight className="h-4 w-4" /></button></div>
            </article>)}
          </div>
          <div className="border-t border-indigo-100 bg-indigo-50/45 px-4 py-3 text-xs font-medium text-indigo-700 sm:px-5">Dùng nút “+” để cộng quyền học; nút “›” mở lịch sử và thông tin chi tiết.</div>
        </> : <div className="px-5 py-9 text-center text-sm font-medium text-slate-500">Chưa có khóa học đang hoạt động.</div>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-[0_22px_60px_-46px_rgba(5,150,105,0.5)]">
        <div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50/60 px-4 py-3.5 sm:px-5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-emerald-600 ring-1 ring-emerald-100"><Trophy className="h-4.5 w-4.5" /></span><h3 className="font-extrabold text-slate-950">Đã hoàn thành</h3><span className="rounded-md bg-white px-2 py-0.5 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">{completedRows.length}</span></div>
        {completedRows.length > 0 ? <div className="divide-y divide-slate-100">{completedRows.map((row) => <article key={row.subject.subjectId} className="grid gap-4 px-4 py-4 sm:grid-cols-[1.5fr_1fr_1fr_auto] sm:items-center sm:px-5"><CourseIdentity subject={row.subject} paymentCount={row.payments.length} /><div><p className="text-[11px] font-bold text-slate-400">Tổng thời lượng</p><Metric minutes={row.registeredMinutes} diamonds={row.registeredDiamonds} /></div><div><p className="text-[11px] font-bold text-slate-400">Hoàn thành</p><p className="mt-1 text-sm font-extrabold text-emerald-700">{row.completedAt}</p></div><button type="button" onClick={() => setDetailSubjectId(row.subject.subjectId)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-300">Xem chi tiết<ChevronRight className="h-4 w-4" /></button></article>)}</div> : <div className="px-5 py-7 text-center text-sm font-medium text-slate-500">Chưa có khóa học đã hoàn thành.</div>}
      </section>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[11px] font-medium text-slate-500"><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-indigo-500" />Phút = thời lượng học thực tế</span><span className="inline-flex items-center gap-1.5"><DiamondPointsIcon className="h-3.5 w-3.5" />Kim cương = quỹ dùng để đặt và duyệt buổi</span></div>

      {detailRow && <CourseDetailModal row={detailRow} onClose={() => setDetailSubjectId(null)} onEdit={() => { setDetailSubjectId(null); onEditSubject(detailRow.subject.subjectId) }} onDelete={async () => { await onDeleteSubject(detailRow.subject.subjectId) }} />}
    </section>
  )
}
