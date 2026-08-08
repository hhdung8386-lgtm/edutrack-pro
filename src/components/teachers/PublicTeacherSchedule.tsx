import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  LoaderCircle,
} from 'lucide-react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { Link } from 'react-router-dom'
import type { BookingRequest, DayOfWeek, TeacherAvailability } from '@/types'
import { bookingIntervalsOverlap } from '@/lib/bookingConflicts'
import { getTeacherTimezoneOffset } from '@/lib/teacherCountries'
import { DAYS_ORDER, formatUtcOffset, getMondayAtOffset } from '@/lib/timezoneUtils'
import { db } from '@/lib/firebase'

const VIETNAM_OFFSET = 7
const LESSON_MINUTES = 25
const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Thứ 2',
  tue: 'Thứ 3',
  wed: 'Thứ 4',
  thu: 'Thứ 5',
  fri: 'Thứ 6',
  sat: 'Thứ 7',
  sun: 'Chủ nhật',
}

type WeekDate = {
  day: DayOfWeek
  dateISO: string
  dateLabel: string
  weekStartISO: string
}

type SelectedSlot = {
  dateISO: string
  start: string
  end: string
}

function dateISOFromUtc(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function formatDateLabel(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function getCurrentWeek() : WeekDate[] {
  const monday = getMondayAtOffset(new Date(), VIETNAM_OFFSET)
  const weekStartISO = dateISOFromUtc(monday)

  return DAYS_ORDER.map((day, index) => {
    const date = addDays(monday, index)
    return {
      day,
      dateISO: dateISOFromUtc(date),
      dateLabel: formatDateLabel(date),
      weekStartISO,
    }
  })
}

function timeToMinutes(value: string) {
  const [hours = '0', minutes = '0'] = value.split(':')
  return Number(hours) * 60 + Number(minutes)
}

function minutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function rangeContainsLesson(range: { start: string; end: string }, start: string) {
  const rangeStart = timeToMinutes(range.start)
  let rangeEnd = timeToMinutes(range.end)
  const lessonStart = timeToMinutes(start)

  if (rangeEnd < rangeStart) rangeEnd += 24 * 60
  const normalizedLessonStart = lessonStart < rangeStart ? lessonStart + 24 * 60 : lessonStart
  return normalizedLessonStart >= rangeStart && normalizedLessonStart + LESSON_MINUTES <= rangeEnd
}

function getEffectiveSlots(availability: TeacherAvailability | null, weekStartISO: string) {
  return availability?.weekOverrides?.[weekStartISO]?.slots || availability?.slots
}

function getScheduleRowStarts(slots: TeacherAvailability['slots'] | undefined) {
  const ranges = DAYS_ORDER.flatMap((day) => {
    const daySlots = slots?.[day]
    if (!daySlots?.available) return []
    return daySlots.timeRanges.map((range) => {
      const start = timeToMinutes(range.start)
      let end = timeToMinutes(range.end)
      if (end < start) end += 24 * 60
      return { start, end }
    })
  }).filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end))

  if (ranges.length === 0) {
    return Array.from({ length: 25 }, (_, index) => minutesToTime(12 * 60 + index * 30))
  }

  const firstStart = Math.max(0, Math.floor(Math.min(...ranges.map((range) => range.start)) / 30) * 30)
  const latestLessonStart = Math.min(
    24 * 60 + 30,
    Math.floor((Math.max(...ranges.map((range) => range.end)) - LESSON_MINUTES) / 30) * 30,
  )
  const lastStart = Math.max(firstStart, latestLessonStart)

  return Array.from(
    { length: Math.floor((lastStart - firstStart) / 30) + 1 },
    (_, index) => minutesToTime(firstStart + index * 30),
  )
}

function isPastSlot(dateISO: string, start: string) {
  const [year, month, day] = dateISO.split('-').map(Number)
  const vnWallClock = Date.UTC(year, month - 1, day, 0, 0) + timeToMinutes(start) * 60 * 1000
  const instant = vnWallClock - VIETNAM_OFFSET * 60 * 60 * 1000
  return instant <= Date.now()
}

function slotIsBooked(bookings: BookingRequest[], dateISO: string, start: string, end: string) {
  return bookings.some((booking) => {
    if (!['pending', 'confirmed'].includes(booking.status)) return false
    return bookingIntervalsOverlap(booking, {
      requestedDate: dateISO,
      requestedStart: start,
      requestedEnd: end,
    })
  })
}

export function PublicTeacherSchedule({ teacherId, teacherCountry }: { teacherId: string; teacherCountry?: string }) {
  const [availability, setAvailability] = useState<TeacherAvailability | null>(null)
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)

  useEffect(() => {
    let active = true

    async function loadSchedule() {
      setLoading(true)
      setError(false)
      try {
        const [availabilitySnapshot, bookingSnapshot] = await Promise.all([
          getDoc(doc(db, 'teacherAvailability', teacherId)),
          getDocs(query(collection(db, 'bookingRequests'), where('teacherId', '==', teacherId))).catch(() => null),
        ])

        if (!active) return
        setAvailability(availabilitySnapshot.exists()
          ? ({ id: availabilitySnapshot.id, ...availabilitySnapshot.data() } as TeacherAvailability)
          : null)
        setBookings(bookingSnapshot?.docs
          .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as BookingRequest))
          .filter((booking) => ['pending', 'confirmed'].includes(booking.status)) || [])
      } catch (loadError) {
        console.error('Error loading public teacher schedule:', loadError)
        if (active) {
          setAvailability(null)
          setBookings([])
          setError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadSchedule()
    return () => {
      active = false
    }
  }, [teacherId])

  const weekDates = useMemo(() => getCurrentWeek(), [])
  const weekStartISO = weekDates[0]?.weekStartISO || ''
  const effectiveSlots = getEffectiveSlots(availability, weekStartISO)
  const rowStarts = useMemo(() => getScheduleRowStarts(effectiveSlots), [effectiveSlots])
  const selectedBookingHref = selectedSlot
    ? `/giao-vien?teacher=${encodeURIComponent(teacherId)}&date=${encodeURIComponent(selectedSlot.dateISO)}&start=${encodeURIComponent(selectedSlot.start)}&end=${encodeURIComponent(selectedSlot.end)}`
    : `/giao-vien?teacher=${encodeURIComponent(teacherId)}`
  const teacherOffset = getTeacherTimezoneOffset(teacherCountry)

  const hasConfiguredSchedule = useMemo(
    () => Boolean(effectiveSlots && weekDates.some(({ day }) => {
      const daySlots = effectiveSlots[day]
      return daySlots?.available && daySlots.timeRanges.length > 0
    })),
    [effectiveSlots, weekDates],
  )

  return (
    <section className="overflow-hidden rounded-3xl border border-[#E8C44A] bg-white shadow-[0_18px_50px_rgba(207,166,31,0.14)]">
      <div className="bg-gradient-to-r from-[#FFC107] via-[#FFD84D] to-[#FFE98A] px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-[#8A6200] shadow-sm">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A6200]">Dành cho phụ huynh</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-[#10213A] sm:text-2xl">Lịch rảnh của gia sư</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#6F5300]">
                Chọn một ca OPEN phù hợp để gửi yêu cầu giữ lịch.
              </p>
            </div>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/80 px-3 py-2 text-xs font-black text-[#725300]">
            <Clock3 className="h-3.5 w-3.5" />
            Giờ Việt Nam · UTC+07:00
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-900">Tuần này · {weekDates[0]?.dateLabel}–{weekDates[6]?.dateLabel}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Lịch giáo viên: {formatUtcOffset(teacherOffset)} · Bảng quy đổi theo giờ Việt Nam để phụ huynh dễ chọn.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-black">
            <span className="inline-flex items-center gap-1.5 text-[#1389AE]"><i className="h-2.5 w-2.5 rounded bg-[#39B8E8]" />OPEN</span>
            <span className="inline-flex items-center gap-1.5 text-slate-500"><i className="h-2.5 w-2.5 rounded bg-slate-200" />RESERVED</span>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 text-sm font-bold text-slate-500">
            <LoaderCircle className="mr-2 h-5 w-5 animate-spin text-amber-500" /> Đang tải lịch rảnh...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50 p-6 text-center text-sm font-semibold text-rose-700">
            Chưa thể tải lịch rảnh. Phụ huynh vui lòng tải lại trang hoặc liên hệ học vụ.
          </div>
        ) : !availability || !hasConfiguredSchedule ? (
          <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/60 p-6 text-center text-sm font-semibold leading-6 text-slate-600">
            Gia sư chưa có ca OPEN trong tuần này. Phụ huynh có thể liên hệ học vụ để được tư vấn lịch khác.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#E8E1CF]">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[78px_repeat(7,minmax(116px,1fr))] border-b border-[#E8E1CF] bg-[#FFF9E8]">
                <div className="px-3 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Giờ</div>
                {weekDates.map(({ day, dateLabel }) => (
                  <div key={day} className="border-l border-[#E8E1CF] px-2 py-3 text-center text-xs font-black text-slate-800 sm:text-sm">
                    <span className="block">{DAY_LABELS[day]}</span>
                    <span className="mt-0.5 block text-[11px] font-bold text-slate-500">{dateLabel}</span>
                  </div>
                ))}
              </div>

              <div className="max-h-[540px] overflow-y-auto">
                {rowStarts.map((start) => (
                  <div key={start} className="grid grid-cols-[78px_repeat(7,minmax(116px,1fr))] border-b border-[#F0ECDF] last:border-b-0">
                    <div className="bg-[#FFFCF3] px-3 py-3 text-xs font-black tabular-nums text-slate-500">{start}~</div>
                    {weekDates.map(({ day, dateISO }) => {
                      const daySlots = effectiveSlots?.[day]
                      const end = minutesToTime(timeToMinutes(start) + LESSON_MINUTES)
                      const available = Boolean(
                        daySlots?.available
                        && daySlots.timeRanges.some((range) => rangeContainsLesson(range, start))
                        && !isPastSlot(dateISO, start),
                      )
                      const booked = available && slotIsBooked(bookings, dateISO, start, end)
                      const selected = selectedSlot?.dateISO === dateISO && selectedSlot.start === start

                      return (
                        <div key={`${day}-${start}`} className="border-l border-[#F0ECDF] p-1.5">
                          {booked ? (
                            <div className="flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-1 text-center text-[10px] font-black tracking-wide text-slate-400">
                              RESERVED
                            </div>
                          ) : available ? (
                            <button
                              type="button"
                              onClick={() => setSelectedSlot({ dateISO, start, end })}
                              className={`min-h-12 w-full rounded-xl px-1.5 py-2 text-center text-[10px] font-black tracking-wide transition active:scale-[0.98] ${
                                selected
                                  ? 'bg-[#A87900] text-white shadow-md shadow-amber-200'
                                  : 'bg-gradient-to-b from-[#42C2EC] to-[#159DC5] text-white shadow-sm hover:from-[#55CCEF] hover:to-[#128DB0]'
                              }`}
                              aria-label={`${selected ? 'Đã chọn' : 'Chọn'} ca ${dateISO} ${start} đến ${end}`}
                            >
                              <span className="block text-[9px] font-bold opacity-85">{start}–{end}</span>
                              {selected ? <Check className="mx-auto mt-0.5 h-3.5 w-3.5" /> : 'OPEN'}
                            </button>
                          ) : (
                            <div className="flex min-h-12 items-center justify-center text-lg font-black text-slate-200">×</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedSlot && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-[#FFF9E8] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8A6200]">Ca đã chọn</p>
              <p className="mt-1 text-sm font-black text-slate-900">{selectedSlot.dateISO} · {selectedSlot.start}–{selectedSlot.end} · 25 phút</p>
            </div>
            <Link
              to={selectedBookingHref}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-amber-200 transition hover:-translate-y-0.5 hover:bg-[#EFB000] active:scale-[0.98]"
            >
              Tiếp tục đặt lịch
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
          Kéo ngang trên điện thoại để xem đủ các ngày. OPEN là ca có thể gửi yêu cầu; RESERVED là ca đã có yêu cầu hoặc lịch được giữ.
        </p>
      </div>
    </section>
  )
}
