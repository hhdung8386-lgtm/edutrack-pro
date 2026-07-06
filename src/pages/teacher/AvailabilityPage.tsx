import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc, getDocs, setDoc, collection, query, where, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { DayOfWeek, DayAvailability, TimeRange, TeacherAvailability, BookingRequest, Teacher } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { toast } from '@/stores/toastStore'
import { Calendar, Clock, Save, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle } from 'lucide-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import { convertVnDateTimeToTeacher, translateVnSlotsToTeacher, translateTeacherSlotsToVn } from '@/lib/timezoneUtils'

const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS_VI: Record<DayOfWeek, string> = {
  mon: 'Thứ 2',
  tue: 'Thứ 3',
  wed: 'Thứ 4',
  thu: 'Thứ 5',
  fri: 'Thứ 6',
  sat: 'Thứ 7',
  sun: 'Chủ nhật',
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

function formatDateISO(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatShortDate(date: Date) {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
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

function rangeCovers(range: TimeRange, start: number, end: number) {
  return timeToMinutes(range.start) <= start && timeToMinutes(range.end) >= end
}

function getVisibleStarts(windowKey: string) {
  const activeWindow = TIME_WINDOWS.find((item) => item.key === windowKey) || TIME_WINDOWS[0]
  const starts: string[] = []
  for (let cursor = activeWindow.start; cursor < activeWindow.end; cursor += 30) {
    starts.push(minutesToTime(cursor))
  }
  return starts
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

export function AvailabilityPage() {
  const { teacherId } = useAuthStore()
  const { t } = useLanguageStore()
  const [searchParams] = useSearchParams()
  const isSetupRequired = searchParams.get('setupRequired') === 'true'

  const [availability, setAvailability] = useState<TeacherAvailability | null>(null)
  const [slots, setSlots] = useState<Record<DayOfWeek, DayAvailability>>(emptySlots())
  const [dbSlots, setDbSlots] = useState<Record<DayOfWeek, DayAvailability> | null>(null)
  const [localDbSlots, setLocalDbSlots] = useState<Record<DayOfWeek, DayAvailability> | null>(null)
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [note, setNote] = useState('')
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Timestamp | null>(null)

  // Filtering states (similar to Admin view)
  const [tempTimeWindow, setTempTimeWindow] = useState<string>('24h')
  const [tempDuration, setTempDuration] = useState<25 | 50>(25)
  const [timeWindow, setTimeWindow] = useState<string>('24h')
  const [duration, setDuration] = useState<25 | 50>(25)

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const weekStartISO = formatDateISO(weekStart)
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const visibleStarts = useMemo(() => getVisibleStarts(timeWindow), [timeWindow])

  // Fetch teacher profile for timezone settings
  useEffect(() => {
    if (!teacherId) return
    getDoc(doc(db, 'teachers', teacherId)).then((snap) => {
      if (snap.exists()) {
        setTeacher({ id: snap.id, ...snap.data() } as Teacher)
      }
    }).catch(err => console.error('Error loading teacher profile:', err))
  }, [teacherId])

  // Fetch teacher's availability for the selected week
  useEffect(() => {
    if (!teacherId) {
      setLoading(false)
      return
    }

    async function loadAvailability() {
      setLoading(true)
      try {
        const snap = await getDoc(doc(db, 'teacherAvailability', teacherId as string))
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as TeacherAvailability
          setAvailability(data)
          
          const weekOverride = data.weekOverrides?.[weekStartISO]
          const loadedSlots = weekOverride?.slots || data.slots
          if (loadedSlots) {
            const offsetVal = teacher?.timezoneOffset ?? 7
            const translated = translateVnSlotsToTeacher(loadedSlots, offsetVal)
            setSlots(translated)
            setLocalDbSlots(translated)
            setDbSlots(cloneSlots(loadedSlots))
          } else {
            setSlots(emptySlots())
            setDbSlots(null)
            setLocalDbSlots(null)
          }
          setNote(weekOverride?.note || data.note || '')
          if (data.updatedAt) setLastUpdated(data.updatedAt)
        } else {
          setAvailability(null)
          setSlots(emptySlots())
          setDbSlots(null)
          setLocalDbSlots(null)
          setNote('')
        }
      } catch (error) {
        console.error('Error loading teacher availability:', error)
        toast.error('Không tải được lịch rảnh của bạn')
      } finally {
        setLoading(false)
      }
    }

    loadAvailability()
  }, [teacherId, weekStartISO, teacher])

  // Fetch booking requests to mark RESERVED cells
  useEffect(() => {
    if (!teacherId) return

    async function loadBookingRequests() {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'bookingRequests'),
            where('teacherId', '==', teacherId)
          )
        )
        const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BookingRequest))
        setBookingRequests(items)
      } catch (error) {
        console.error('Error loading bookings for teacher:', error)
      }
    }

    loadBookingRequests()
  }, [teacherId])

  const localBookings = useMemo(() => {
    const offset = teacher?.timezoneOffset ?? 7
    if (offset === 7) return bookingRequests
    
    return bookingRequests.map((req) => {
      const localStart = convertVnDateTimeToTeacher(req.requestedDate || '', req.requestedStart || '', offset)
      const localEnd = convertVnDateTimeToTeacher(req.requestedDate || '', req.requestedEnd || '', offset)
      
      const [yr, mo, dy] = localStart.dateISO.split('-').map(Number)
      const dObj = new Date(yr, mo - 1, dy)
      const dayIdx = dObj.getDay()
      const daysMap: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
      const localDay = daysMap[dayIdx]

      return {
        ...req,
        requestedDate: localStart.dateISO,
        requestedStart: localStart.timeStr,
        requestedEnd: localEnd.timeStr,
        requestedDay: localDay,
      }
    })
  }, [bookingRequests, teacher?.timezoneOffset])

  const handleApplyFilters = () => {
    setTimeWindow(tempTimeWindow)
    setDuration(tempDuration)
  }

  // Toggles cell slot availability status
  const isCellOpen = (day: DayOfWeek, start: string) => {
    const startMinute = timeToMinutes(start)
    const endMinute = startMinute + duration
    return slots[day].timeRanges.some((range) => rangeCovers(range, startMinute, endMinute))
  }

  const isCellOpenInDb = (day: DayOfWeek, start: string) => {
    if (!localDbSlots) return false
    const startMinute = timeToMinutes(start)
    const endMinute = startMinute + duration
    return localDbSlots[day].timeRanges.some((range) => rangeCovers(range, startMinute, endMinute))
  }

  const isCellReserved = (dateISO: string, time: string) => {
    const startMinute = timeToMinutes(time)
    const endMinute = startMinute + duration

    return localBookings.some((req) => {
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
    const isOpen = slots[day].timeRanges.some((range) => rangeCovers(range, startMinute, endMinute))

    if (isOpen) {
      // Locking mechanism: if the cell was already OPEN in the DB, they cannot remove it
      if (isCellOpenInDb(day, start)) {
        toast.error('Lịch đã lưu trước đó không thể tự hủy hoặc sửa. Hãy liên hệ quản lý nếu muốn thay đổi!')
        return
      }
    }

    setSlots((current) => {
      const dayRanges = current[day].timeRanges
      const timeRanges = isOpen
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

  // Saves current slots as the new default for current week and all future weeks
  const handleSaveCurrentAndFuture = async () => {
    if (!teacherId) return
    setSaving(true)
    try {
      const retainedOverrides = Object.fromEntries(
        Object.entries(availability?.weekOverrides || {}).filter(([week]) => week < weekStartISO)
      )

      const offset = teacher?.timezoneOffset ?? 7
      const vnSlots = translateTeacherSlotsToVn(slots, offset)

      await setDoc(doc(db, 'teacherAvailability', teacherId as string), {
        teacherId,
        slots: vnSlots,
        note,
        weekOverrides: retainedOverrides,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      const snap = await getDoc(doc(db, 'teacherAvailability', teacherId as string))
      if (snap.exists()) {
        const data = snap.data() as TeacherAvailability
        setAvailability(data)
        setLastUpdated(data.updatedAt)
        
        const weekOverride = data.weekOverrides?.[weekStartISO]
        const loadedSlots = weekOverride?.slots || data.slots
        const translated = translateVnSlotsToTeacher(loadedSlots, offset)
        setSlots(translated)
        setLocalDbSlots(translated)
        setDbSlots(cloneSlots(loadedSlots))
      }
      toast.success(t('avail.saved'))
      setShowConfirmModal(false)
    } catch (e) {
      console.error(e)
      toast.error(t('avail.save_fail'))
    } finally {
      setSaving(false)
    }
  }

  if (loading && !availability) return <LoadingSpinner />

  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-6xl mx-auto">
      {isSetupRequired && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-800 shadow-sm animate-pulse">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">Yêu cầu thiết lập lịch trống ban đầu</h4>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Bạn đang được chuyển hướng đến đây vì tài khoản chưa có lịch trống rảnh dạy. Vui lòng chọn các khung giờ rảnh của bạn trên bảng và nhấn <strong>"Lưu lịch dạy trống tương lai"</strong> ở cuối trang để hoàn tất thiết lập tài khoản và mở khóa các tính năng khác (như Điểm danh, Lịch dạy).
            </p>
          </div>
        </div>
      )}

      {/* Hero Banner */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#3BB8EB] via-[#45c6f5] to-[#2b8fb8] p-6 lg:p-8 text-white shadow-lg">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold">{t('avail.title')}</h1>
            <p className="text-sm text-white/80 mt-1">{t('avail.subtitle')}</p>
          </div>
        </div>
        {lastUpdated && (
          <div className="relative mt-4 flex items-center gap-1.5 text-xs text-white/70">
            <CheckCircle className="w-3.5 h-3.5" />
            {t('avail.last_updated')} {lastUpdated.toDate().toLocaleString('vi-VN')}
          </div>
        )}
      </div>

      {/* Filter / Navigation Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          {/* Dropdown select time window */}
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

          {/* Radio buttons for duration */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="duration"
                checked={tempDuration === 25}
                onChange={() => setTempDuration(25)}
                className="h-4 w-4 text-sky-600 border-slate-300 focus:ring-sky-500 cursor-pointer"
              />
              25 phút
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="duration"
                checked={tempDuration === 50}
                onChange={() => setTempDuration(50)}
                className="h-4 w-4 text-sky-600 border-slate-300 focus:ring-sky-500 cursor-pointer"
              />
              50 phút
            </label>
          </div>

          {/* View Button */}
          <button
            type="button"
            onClick={handleApplyFilters}
            className="h-10 px-6 rounded-lg bg-[#3BB8EB] hover:bg-[#2da8db] text-white font-bold text-sm transition shadow-sm"
          >
            Xem
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

      {/* Warning Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-800 text-xs leading-normal">
        <span className="text-lg">⚠️</span>
        <div>
          <p className="font-bold text-sm text-amber-900">Cân nhắc kỹ lịch dạy trống trước khi lưu!</p>
          <p className="mt-0.5 font-medium opacity-90">
            Các khung giờ lịch dạy rảnh sau khi bấm lưu sẽ <strong className="underline">không thể tự chỉnh sửa hoặc hủy/xóa được</strong>. Muốn thay đổi, bạn phải liên hệ với quản lý. Hãy cân nhắc lịch!
          </p>
        </div>
      </div>

      {/* Grid schedule table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-sm">
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
                  <div className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">{DAY_LABELS_VI[day]}</div>
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
                          ĐÃ XẾP LỚP
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

      {/* Note */}
      <Card>
        <label className="block text-sm font-semibold text-slate-700 mb-2">{t('avail.note')}</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('avail.note_placeholder')}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3BB8EB]/40 focus:border-[#3BB8EB] resize-none transition-all"
          rows={3}
        />
      </Card>

      {/* Save Button */}
      <div className="sticky bottom-20 lg:bottom-4 z-10">
        <Button
          fullWidth
          loading={saving}
          onClick={() => setShowConfirmModal(true)}
          className="!bg-gradient-to-r !from-[#3BB8EB] !to-[#2b8fb8] hover:!from-[#2ba8d8] hover:!to-[#237fa5] !shadow-lg !shadow-[#3BB8EB]/30 !rounded-xl !py-3.5"
        >
          <Save className="w-4 h-4 mr-2" />
          Lưu lịch dạy trống tương lai
        </Button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <Modal
          open
          onClose={() => setShowConfirmModal(false)}
          title="Xác nhận lưu lịch dạy tương lai"
          footer={
            <div className="flex gap-3 justify-end w-full">
              <Button variant="ghost" onClick={() => setShowConfirmModal(false)}>Hủy</Button>
              <Button onClick={handleSaveCurrentAndFuture} loading={saving} className="bg-gradient-to-r from-[#3BB8EB] to-[#2b8fb8] text-white">
                Tôi đã cân nhắc lịch và đồng ý
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-slate-600 leading-normal">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 mx-auto mb-2">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <p className="font-extrabold text-slate-800 text-center text-base">Xác nhận lưu lịch dạy?</p>
            <p className="text-center text-xs text-slate-500">
              Lịch này sau khi lưu sẽ được áp dụng cho tuần đã chọn và <strong className="text-[#3BB8EB] font-bold">tất cả các tuần trong tương lai</strong>. Các khung giờ rảnh sau khi lưu sẽ <strong className="text-rose-600 font-bold">không thể tự chỉnh sửa hoặc tự xóa được</strong>. Muốn thay đổi, bạn phải liên hệ với quản lý.
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
