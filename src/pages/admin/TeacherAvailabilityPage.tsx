import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { CalendarClock, ChevronLeft, ChevronRight, Clock, Save, Search } from 'lucide-react'
import { db } from '@/lib/firebase'
import { BookingRequest, DayAvailability, DayOfWeek, Teacher, TeacherAvailability, TimeRange } from '@/types'
import { Button } from '@/components/ui/Button'
import { toast } from '@/stores/toastStore'

const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS_EN: Record<DayOfWeek, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

const EMPTY_DAY: DayAvailability = { available: false, timeRanges: [] }
const TIME_WINDOWS = [
  { key: '24h', label: '24h', start: 0, end: 1440 },
  { key: '0-8', label: '0:00-8:00', start: 0, end: 480 },
  { key: '6-14', label: '6:00-14:00', start: 360, end: 840 },
  { key: '12-20', label: '12:00-20:00', start: 720, end: 1200 },
  { key: '18-25', label: '18:00-25:00', start: 1080, end: 1500 },
] as const

function emptySlots(): Record<DayOfWeek, DayAvailability> {
  return {
    mon: { ...EMPTY_DAY, timeRanges: [] },
    tue: { ...EMPTY_DAY, timeRanges: [] },
    wed: { ...EMPTY_DAY, timeRanges: [] },
    thu: { ...EMPTY_DAY, timeRanges: [] },
    fri: { ...EMPTY_DAY, timeRanges: [] },
    sat: { ...EMPTY_DAY, timeRanges: [] },
    sun: { ...EMPTY_DAY, timeRanges: [] },
  }
}

function cloneSlots(slots?: Record<DayOfWeek, DayAvailability>) {
  const base = emptySlots()
  DAYS.forEach((day) => {
    const source = slots?.[day]
    if (source) {
      base[day] = {
        available: !!source.available,
        timeRanges: (source.timeRanges || []).map((range) => ({ ...range })),
      }
    }
  })
  return base
}

function formatDateISO(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getMonday(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return copy
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function formatShortDate(date: Date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatShortHeaderDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function getWeekDates(weekStart: Date) {
  return DAYS.map((day, index) => ({ day, date: addDays(weekStart, index), iso: formatDateISO(addDays(weekStart, index)) }))
}

function timeToMinutes(time: string) {
  const [hours = '0', minutes = '0'] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

function minutesToTime(total: number) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function getVisibleStarts(windowKey: string) {
  const activeWindow = TIME_WINDOWS.find((item) => item.key === windowKey) || TIME_WINDOWS[0]
  const starts: string[] = []
  for (let cursor = activeWindow.start; cursor < activeWindow.end; cursor += 30) {
    starts.push(minutesToTime(cursor))
  }
  return starts
}

function rangeCovers(range: TimeRange, start: number, end: number) {
  return timeToMinutes(range.start) <= start && timeToMinutes(range.end) >= end
}

function removeInterval(ranges: TimeRange[], start: number, end: number) {
  const next: TimeRange[] = []

  ranges.forEach((range) => {
    const rangeStart = timeToMinutes(range.start)
    const rangeEnd = timeToMinutes(range.end)

    if (rangeEnd <= start || rangeStart >= end) {
      next.push(range)
      return
    }

    if (rangeStart < start) next.push({ start: range.start, end: minutesToTime(start) })
    if (rangeEnd > end) next.push({ start: minutesToTime(end), end: range.end })
  })

  return next.filter((range) => timeToMinutes(range.end) > timeToMinutes(range.start))
}

function addInterval(ranges: TimeRange[], start: number, end: number) {
  const all = [...ranges, { start: minutesToTime(start), end: minutesToTime(end) }]
    .map(r => ({ ...r }))
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))

  const merged: TimeRange[] = []
  all.forEach((range) => {
    if (merged.length === 0) {
      merged.push(range)
      return
    }
    const last = merged[merged.length - 1]
    const lastEnd = timeToMinutes(last.end)
    const currentStart = timeToMinutes(range.start)

    if (currentStart <= lastEnd) {
      const currentEnd = timeToMinutes(range.end)
      if (currentEnd > lastEnd) {
        last.end = range.end
      }
    } else {
      merged.push(range)
    }
  })

  return merged
}

export function TeacherAvailabilityPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [availability, setAvailability] = useState<TeacherAvailability | null>(null)
  const [slots, setSlots] = useState<Record<DayOfWeek, DayAvailability>>(emptySlots())
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))

  // Temporary states for filters
  const [tempTimeWindow, setTempTimeWindow] = useState<string>('24h')
  const [tempDuration, setTempDuration] = useState<25 | 50>(25)

  // Active states for filters
  const [timeWindow, setTimeWindow] = useState<string>('24h')
  const [duration, setDuration] = useState<25 | 50>(25)

  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [savingMode, setSavingMode] = useState<'week' | 'future' | null>(null)

  const weekStartISO = formatDateISO(weekStart)
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const visibleStarts = useMemo(() => getVisibleStarts(timeWindow), [timeWindow])
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId)

  useEffect(() => {
    async function loadTeachers() {
      setLoading(true)
      try {
        const snap = await getDocs(query(collection(db, 'teachers'), where('status', '==', 'active')))
        const items = snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Teacher))
          .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        setTeachers(items)
        setSelectedTeacherId((current) => current || items[0]?.id || '')
      } catch (error) {
        console.error('Error loading teachers for availability:', error)
        toast.error('Không tải được danh sách giáo viên')
      } finally {
        setLoading(false)
      }
    }

    loadTeachers()
  }, [])

  useEffect(() => {
    if (!selectedTeacherId) {
      setAvailability(null)
      setSlots(emptySlots())
      setNote('')
      return
    }

    async function loadAvailability() {
      const snap = await getDoc(doc(db, 'teacherAvailability', selectedTeacherId))
      if (!snap.exists()) {
        setAvailability(null)
        setSlots(emptySlots())
        setNote('')
        return
      }

      const data = { id: snap.id, ...snap.data() } as TeacherAvailability
      const weekOverride = data.weekOverrides?.[weekStartISO]
      setAvailability(data)
      setSlots(cloneSlots(weekOverride?.slots || data.slots))
      setNote(weekOverride?.note || data.note || '')
    }

    loadAvailability().catch((error) => {
      console.error('Error loading teacher availability:', error)
      toast.error('Không tải được lịch rảnh giáo viên')
    })
  }, [selectedTeacherId, weekStartISO])

  useEffect(() => {
    if (!selectedTeacherId) {
      setBookingRequests([])
      return
    }

    async function loadBookingRequests() {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'bookingRequests'),
            where('teacherId', '==', selectedTeacherId)
          )
        )
        const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BookingRequest))
        setBookingRequests(items)
      } catch (error) {
        console.error('Error loading booking requests for teacher:', error)
      }
    }

    loadBookingRequests()
  }, [selectedTeacherId])

  const filteredTeachers = teachers.filter((teacher) => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return true
    return `${teacher.name} ${teacher.code}`.toLowerCase().includes(keyword)
  })

  const isCellOpen = (day: DayOfWeek, start: string) => {
    const startMinute = timeToMinutes(start)
    const endMinute = startMinute + duration
    return slots[day].timeRanges.some((range) => rangeCovers(range, startMinute, endMinute))
  }

  const isCellReserved = (dateISO: string, time: string) => {
    const startMinute = timeToMinutes(time)
    const endMinute = startMinute + duration

    return bookingRequests.some((req) => {
      if (req.requestedDate !== dateISO) return false
      if (req.status !== 'confirmed' && req.status !== 'pending') return false

      const reqStart = timeToMinutes(req.requestedStart)
      const reqEnd = timeToMinutes(req.requestedEnd)

      return Math.max(startMinute, reqStart) < Math.min(endMinute, reqEnd)
    })
  }

  const toggleCell = (day: DayOfWeek, start: string) => {
    const startMinute = timeToMinutes(start)
    const endMinute = startMinute + duration

    setSlots((current) => {
      const dayRanges = current[day].timeRanges
      const open = dayRanges.some((range) => rangeCovers(range, startMinute, endMinute))
      const timeRanges = open
        ? removeInterval(dayRanges, startMinute, endMinute)
        : addInterval(dayRanges, startMinute, endMinute)

      return {
        ...current,
        [day]: {
          available: timeRanges.length > 0,
          timeRanges,
        },
      }
    })
  }

  const handleApplyFilters = () => {
    setTimeWindow(tempTimeWindow)
    setDuration(tempDuration)
  }

  const saveWeekOnly = async () => {
    if (!selectedTeacherId) return
    setSavingMode('week')
    try {
      await setDoc(doc(db, 'teacherAvailability', selectedTeacherId), {
        teacherId: selectedTeacherId,
        slots: availability?.slots || emptySlots(),
        note: availability?.note || '',
        weekOverrides: {
          ...(availability?.weekOverrides || {}),
          [weekStartISO]: {
            slots,
            note,
            updatedAt: new Date().toISOString(),
          },
        },
        updatedAt: serverTimestamp(),
      }, { merge: true })
      toast.success('Đã lưu lịch riêng cho tuần đang chọn')
    } catch (error) {
      console.error('Error saving weekly availability:', error)
      toast.error('Không lưu được lịch tuần')
    } finally {
      setSavingMode(null)
    }
  }

  const saveCurrentAndFuture = async () => {
    if (!selectedTeacherId) return
    setSavingMode('future')
    try {
      const retainedOverrides = Object.fromEntries(
        Object.entries(availability?.weekOverrides || {}).filter(([week]) => week < weekStartISO)
      )

      await setDoc(doc(db, 'teacherAvailability', selectedTeacherId), {
        teacherId: selectedTeacherId,
        slots,
        note,
        weekOverrides: retainedOverrides,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      toast.success('Đã lưu lịch cho tuần hiện tại và các tuần tương lai')
    } catch (error) {
      console.error('Error saving future availability:', error)
      toast.error('Không lưu được lịch tương lai')
    } finally {
      setSavingMode(null)
    }
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="rounded-3xl bg-gradient-to-br from-sky-500 to-cyan-600 p-6 text-white shadow-lg shadow-sky-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <CalendarClock className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Quản lý lịch rảnh giáo viên</h1>
              <p className="mt-1 text-sm text-white/85">Admin chọn giáo viên, cấu hình lịch mở (OPEN) và xem lịch học viên đã đặt (RESERVED) trực quan theo bảng.</p>
            </div>
          </div>
          {selectedTeacher && (
            <div className="rounded-2xl bg-white/15 px-4 py-3 text-sm font-bold">
              {selectedTeacher.code} · {selectedTeacher.name}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm giáo viên..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </label>

          <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="rounded-xl bg-slate-100 p-4 text-sm font-semibold text-slate-500">Đang tải...</div>
            ) : filteredTeachers.map((teacher) => (
              <button
                key={teacher.id}
                type="button"
                onClick={() => setSelectedTeacherId(teacher.id)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                  selectedTeacherId === teacher.id
                    ? 'border-sky-300 bg-sky-50'
                    : 'border-slate-100 bg-white hover:border-sky-200 hover:bg-slate-50'
                }`}
              >
                {teacher.photoURL ? (
                  <img src={teacher.photoURL} alt={teacher.name} className="h-11 w-11 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sm font-black text-sky-700">
                    {teacher.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-900">{teacher.name}</span>
                  <span className="block truncate text-xs font-semibold text-slate-500">{teacher.code}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-5">
          {/* Filter Bar exactly matching the reference image */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              {/* Dropdown select */}
              <div className="relative">
                <select
                  value={tempTimeWindow}
                  onChange={(e) => setTempTimeWindow(e.target.value)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold outline-none focus:border-sky-400 min-w-[140px] appearance-none pr-8 cursor-pointer"
                >
                  {TIME_WINDOWS.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">▼</div>
              </div>

              {/* Radio buttons */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="duration"
                    checked={tempDuration === 25}
                    onChange={() => setTempDuration(25)}
                    className="h-4 w-4 text-sky-600 border-slate-300 focus:ring-sky-500 cursor-pointer"
                  />
                  25mins
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="duration"
                    checked={tempDuration === 50}
                    onChange={() => setTempDuration(50)}
                    className="h-4 w-4 text-sky-600 border-slate-300 focus:ring-sky-500 cursor-pointer"
                  />
                  50mins
                </label>
              </div>

              {/* View Button */}
              <button
                type="button"
                onClick={handleApplyFilters}
                className="h-10 px-6 rounded-lg bg-[#d946ef] hover:bg-[#c084fc] text-white font-bold text-sm transition shadow-sm"
              >
                View
              </button>
            </div>

            {/* Quick week controls */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(addDays(weekStart, -7)))}>
                Tuần trước
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(new Date()))}>
                Tuần này
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(addDays(weekStart, 7)))}>
                Tuần sau
              </Button>
            </div>
          </div>

          {/* Grid schedule table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  {/* Angle cell for week navigation (previous week) */}
                  <th className="p-2 text-center border-r border-slate-200 w-24">
                    <button
                      type="button"
                      onClick={() => setWeekStart(getMonday(addDays(weekStart, -7)))}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition"
                      title="Tuần trước"
                    >
                      <ChevronLeft className="h-4 w-4 mx-auto" />
                    </button>
                  </th>
                  {/* Day headers */}
                  {weekDates.map(({ day, date }) => (
                    <th key={day} className="p-3 text-center border-r border-slate-200 font-semibold text-slate-700 min-w-[90px]">
                      <div className="text-sm font-black text-slate-800">{formatShortHeaderDate(date)}</div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">{DAY_LABELS_EN[day]}</div>
                    </th>
                  ))}
                  {/* Navigation column header (next week) */}
                  <th className="p-2 text-center w-12">
                    <button
                      type="button"
                      onClick={() => setWeekStart(getMonday(addDays(weekStart, 7)))}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition"
                      title="Tuần sau"
                    >
                      <ChevronRight className="h-4 w-4 mx-auto" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visibleStarts.map((start) => (
                  <tr key={start} className="hover:bg-slate-50/50 transition">
                    {/* Time column header */}
                    <td className="p-3 text-center font-bold text-slate-600 border-r border-slate-200 align-middle">
                      {start}~
                    </td>
                    {/* Day cells */}
                    {weekDates.map(({ day, iso }) => {
                      const reserved = isCellReserved(iso, start)
                      const open = isCellOpen(day, start)

                      return (
                        <td key={day} className="p-2 border-r border-slate-200 align-middle text-center min-h-[50px]">
                          {reserved ? (
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block py-2 select-none">
                              RESERVED
                            </span>
                          ) : open ? (
                            <button
                              type="button"
                              onClick={() => toggleCell(day, start)}
                              className="w-full py-2 px-1 rounded-lg bg-[#3BB8EB] hover:bg-[#2da8db] text-white font-extrabold text-[10px] uppercase tracking-wider transition shadow-sm"
                            >
                              OPEN
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleCell(day, start)}
                              className="w-full py-2 text-slate-300 hover:text-[#3BB8EB] font-black text-sm transition flex items-center justify-center"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      )
                    })}
                    {/* Empty cell to align with next week header */}
                    <td className="p-2"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-sm font-black text-slate-800">Ghi chú nội bộ</label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="VD: Tuần này giáo viên nghỉ sáng thứ 4, ưu tiên lớp tối..."
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </div>

          <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-200/70 backdrop-blur">
            <div className="grid gap-3 md:grid-cols-2">
              <Button
                variant="outline"
                loading={savingMode === 'week'}
                disabled={!selectedTeacherId}
                onClick={saveWeekOnly}
                className="!min-h-[52px]"
              >
                <Clock className="h-4 w-4" />
                Lưu lịch trong tuần này
              </Button>
              <Button
                loading={savingMode === 'future'}
                disabled={!selectedTeacherId}
                onClick={saveCurrentAndFuture}
                className="!min-h-[52px] !bg-sky-600 hover:!bg-sky-700"
              >
                <Save className="h-4 w-4" />
                Lưu tuần này và tương lai
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

