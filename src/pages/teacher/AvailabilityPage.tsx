import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc, onSnapshot, setDoc, updateDoc, deleteField, collection, query, where, serverTimestamp, Timestamp } from 'firebase/firestore'
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
type SaveMode = 'week' | 'future'
const DAY_LABELS_VI: Record<DayOfWeek, string> = {
  mon: 'Thứ 2',
  tue: 'Thứ 3',
  wed: 'Thứ 4',
  thu: 'Thứ 5',
  fri: 'Thứ 6',
  sat: 'Thứ 7',
  sun: 'Chủ nhật',
}
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
  const { t, lang } = useLanguageStore()
  const [searchParams] = useSearchParams()
  const isSetupRequired = searchParams.get('setupRequired') === 'true'
  const [showSetupAnnouncement, setShowSetupAnnouncement] = useState(isSetupRequired)

  const [availability, setAvailability] = useState<TeacherAvailability | null>(null)
  const [slots, setSlots] = useState<Record<DayOfWeek, DayAvailability>>(emptySlots())
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [note, setNote] = useState('')
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadedAvailabilityKey, setLoadedAvailabilityKey] = useState<string | null>(null)
  const [bookingsLoading, setBookingsLoading] = useState(true)
  const [bookingsError, setBookingsError] = useState(false)
  const [bookingsLoadAttempt, setBookingsLoadAttempt] = useState(0)
  const [savingMode, setSavingMode] = useState<SaveMode | null>(null)
  const [confirmMode, setConfirmMode] = useState<SaveMode | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Timestamp | null>(null)

  // Filtering states (similar to Admin view)
  const [tempTimeWindow, setTempTimeWindow] = useState<string>('24h')
  const [tempDuration, setTempDuration] = useState<25 | 50>(25)
  const [timeWindow, setTimeWindow] = useState<string>('24h')
  const [duration, setDuration] = useState<25 | 50>(25)

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const weekStartISO = formatDateISO(weekStart)
  const availabilityKey = teacherId ? `${teacherId}:${weekStartISO}` : null
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const visibleStarts = useMemo(() => getVisibleStarts(timeWindow), [timeWindow])

  // Fetch profile and availability together so timezone conversion is based on one
  // resolved snapshot. The old two-effect flow rendered once with UTC+7, then put
  // the page back into a spinner and loaded again when the teacher profile arrived.
  useEffect(() => {
    if (!teacherId) {
      setTeacher(null)
      setAvailability(null)
      setSlots(emptySlots())
      setLoadedAvailabilityKey(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const activeTeacherId = teacherId

    async function loadAvailabilityData() {
      setLoading(true)
      setLoadError(false)
      try {
        const [teacherSnap, availabilitySnap] = await Promise.all([
          getDoc(doc(db, 'teachers', activeTeacherId)),
          getDoc(doc(db, 'teacherAvailability', activeTeacherId)),
        ])
        if (cancelled) return

        const resolvedTeacher = teacherSnap.exists()
          ? ({ id: teacherSnap.id, ...teacherSnap.data() } as Teacher)
          : null
        setTeacher(resolvedTeacher)

        if (availabilitySnap.exists()) {
          const data = { id: availabilitySnap.id, ...availabilitySnap.data() } as TeacherAvailability
          setAvailability(data)

          const weekOverride = data.weekOverrides?.[weekStartISO]
          const loadedSlots = weekOverride?.slots || data.slots
          if (loadedSlots) {
            const offsetVal = resolvedTeacher?.timezoneOffset ?? 7
            const translated = translateVnSlotsToTeacher(loadedSlots, offsetVal)
            setSlots(translated)
          } else {
            setSlots(emptySlots())
          }
          setNote(weekOverride?.note || data.note || '')
          setLastUpdated(data.updatedAt || null)
        } else {
          setAvailability(null)
          setSlots(emptySlots())
          setNote('')
          setLastUpdated(null)
        }
        setLoadedAvailabilityKey(`${activeTeacherId}:${weekStartISO}`)
      } catch (error) {
        if (cancelled) return
        console.error('Error loading teacher availability:', error)
        setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAvailabilityData()
    return () => { cancelled = true }
  }, [teacherId, weekStartISO, loadAttempt])

  // Fetch booking requests to mark RESERVED cells
  useEffect(() => {
    if (!teacherId) {
      setBookingRequests([])
      setBookingsLoading(false)
      setBookingsError(false)
      return
    }

    setBookingRequests([])
    setBookingsLoading(true)
    setBookingsError(false)

    let listenerActive = true
    let unsubscribe = () => {}
    const loadTimeout = setTimeout(() => {
      listenerActive = false
      unsubscribe()
      setBookingsError(true)
      setBookingsLoading(false)
    }, 12_000)

    unsubscribe = onSnapshot(
      query(collection(db, 'bookingRequests'), where('teacherId', '==', teacherId)),
      { includeMetadataChanges: true },
      (snap) => {
        if (!listenerActive) return
        const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BookingRequest))
        setBookingRequests(items)
        if (!snap.metadata.fromCache) {
          clearTimeout(loadTimeout)
          setBookingsLoading(false)
        }
      },
      (error) => {
        if (!listenerActive) return
        listenerActive = false
        clearTimeout(loadTimeout)
        unsubscribe()
        console.error('Error loading bookings for teacher:', error)
        setBookingsError(true)
        setBookingsLoading(false)
      }
    )

    return () => {
      listenerActive = false
      clearTimeout(loadTimeout)
      unsubscribe()
    }
  }, [teacherId, bookingsLoadAttempt])

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

  const reloadSavedAvailability = async () => {
    if (!teacherId) return
    const snap = await getDoc(doc(db, 'teacherAvailability', teacherId))
    if (!snap.exists()) return

    const data = { id: snap.id, ...snap.data() } as TeacherAvailability
    const offset = teacher?.timezoneOffset ?? 7
    const weekOverride = data.weekOverrides?.[weekStartISO]
    const loadedSlots = weekOverride?.slots || data.slots || emptySlots()
    setAvailability(data)
    setLastUpdated(data.updatedAt)
    setSlots(translateVnSlotsToTeacher(loadedSlots, offset))
    setNote(weekOverride?.note || data.note || '')
  }

  // Đóng/mở ca riêng của tuần đang xem. Giữ nguyên lịch gốc và mọi override khác.
  const handleSaveWeekOnly = async () => {
    if (!teacherId || !availability) return
    setSavingMode('week')
    try {
      const offset = teacher?.timezoneOffset ?? 7
      const vnSlots = translateTeacherSlotsToVn(slots, offset)

      await updateDoc(doc(db, 'teacherAvailability', teacherId), {
        [`weekOverrides.${weekStartISO}`]: {
          slots: vnSlots,
          note,
          updatedAt: new Date().toISOString(),
        },
        updatedAt: serverTimestamp(),
      })

      await reloadSavedAvailability()
      toast.success(lang === 'vi' ? 'Đã lưu thay đổi riêng cho tuần này.' : 'This week was updated.')
      setConfirmMode(null)
    } catch (error) {
      console.error('Save teacher weekly availability failed:', error)
      toast.error(t('avail.save_fail'))
    } finally {
      setSavingMode(null)
    }
  }

  // Cập nhật lịch gốc nhưng vẫn bảo toàn các tuần đặc biệt do admin/gia sư đã lưu.
  const handleSaveCurrentAndFuture = async () => {
    if (!teacherId) return
    setSavingMode('future')
    try {
      const offset = teacher?.timezoneOffset ?? 7
      const vnSlots = translateTeacherSlotsToVn(slots, offset)

      const availabilityRef = doc(db, 'teacherAvailability', teacherId as string)
      if (availability) {
        await updateDoc(availabilityRef, {
          slots: vnSlots,
          note,
          [`weekOverrides.${weekStartISO}`]: deleteField(),
          updatedAt: serverTimestamp(),
        })
      } else {
        await setDoc(availabilityRef, {
          teacherId,
          slots: vnSlots,
          note,
          weekOverrides: {},
          updatedAt: serverTimestamp(),
        })
      }

      await reloadSavedAvailability()
      toast.success(t('avail.saved'))
      setConfirmMode(null)
    } catch (error) {
      console.error('Save teacher future availability failed:', error)
      toast.error(t('avail.save_fail'))
    } finally {
      setSavingMode(null)
    }
  }

  if (loadError || bookingsError) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Card>
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">
            {lang === 'vi' ? 'Chưa tải đủ dữ liệu lịch rảnh' : 'Unable to load availability data'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {lang === 'vi'
              ? 'Kết nối dữ liệu đang gián đoạn. Lịch đã lưu của bạn không bị thay đổi; vui lòng thử tải lại.'
              : 'The data connection was interrupted. Your saved availability is unchanged; please try again.'}
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              setLoadError(false)
              setBookingsError(false)
              setLoadedAvailabilityKey(null)
              setLoadAttempt((attempt) => attempt + 1)
              setBookingsLoadAttempt((attempt) => attempt + 1)
            }}
          >
            {lang === 'vi' ? 'Thử tải lại' : 'Try again'}
          </Button>
        </Card>
      </div>
    )
  }
  if (loading || bookingsLoading || loadedAvailabilityKey !== availabilityKey) return <LoadingSpinner />

  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-6xl mx-auto">
      {showSetupAnnouncement && (
        <Modal
          open={showSetupAnnouncement}
          onClose={() => setShowSetupAnnouncement(false)}
          title={t('avail.announcement_title')}
          footer={
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setShowSetupAnnouncement(false)}>
                {t('avail.understand')}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-sm text-slate-600 leading-relaxed py-2">
            <p className="font-semibold text-slate-800">
              {t('avail.announcement_p1')}
            </p>
            <p>
              {t('avail.announcement_p2')}
            </p>
            <p className="font-medium text-slate-800">
              {t('avail.announcement_p3')}
            </p>
            <p className="text-right font-bold text-indigo-600 mt-4">
              123English
            </p>
          </div>
        </Modal>
      )}

      {isSetupRequired && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-800 shadow-sm animate-pulse">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">{t('avail.setup_required_title')}</h4>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              {t('avail.setup_required_desc')}
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
            {t('avail.last_updated')} {lastUpdated.toDate().toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN')}
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
              {t('avail.25_min')}
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="duration"
                checked={tempDuration === 50}
                onChange={() => setTempDuration(50)}
                className="h-4 w-4 text-sky-600 border-slate-300 focus:ring-sky-500 cursor-pointer"
              />
              {t('avail.50_min')}
            </label>
          </div>

          {/* View Button */}
          <button
            type="button"
            onClick={handleApplyFilters}
            className="h-10 px-6 rounded-lg bg-[#3BB8EB] hover:bg-[#2da8db] text-white font-bold text-sm transition shadow-sm"
          >
            {t('avail.view')}
          </button>
        </div>

        {/* Quick week controls */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(addDays(weekStart, -7)))}>
            {t('avail.prev_week')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(new Date()))}>
            {t('avail.current_week')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(addDays(weekStart, 7)))}>
            {t('avail.next_week')}
          </Button>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-800 text-xs leading-normal">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-bold text-sm text-amber-900">
            {lang === 'vi' ? 'Có thể đóng lại ca trống chưa xếp lớp' : 'Unbooked availability can be closed'}
          </p>
          <p className="mt-0.5 font-medium opacity-90">
            {lang === 'vi'
              ? 'Ca đã xếp lớp luôn được bảo vệ. Hãy dùng “Lưu riêng tuần này” khi chỉ bận tạm thời để không ảnh hưởng lịch các tuần khác.'
              : 'Booked slots are always protected. Use “Save this week only” for temporary changes so other weeks remain unchanged.'}
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
                  title={t('avail.prev_week')}
                >
                  <ChevronLeft className="h-4 w-4 mx-auto" />
                </button>
              </th>
              {/* Day headers */}
              {weekDates.map(({ day, date }) => (
                <th key={day} className="p-3 text-center border-r border-slate-200 font-semibold text-slate-700 min-w-[90px]">
                  <div className="text-sm font-black text-slate-800">{formatShortHeaderDate(date)}</div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">
                    {lang === 'en' ? DAY_LABELS_EN[day] : DAY_LABELS_VI[day]}
                  </div>
                </th>
              ))}
              {/* Navigation column header (next week) */}
              <th className="p-2 text-center w-12">
                <button
                  type="button"
                  onClick={() => setWeekStart(getMonday(addDays(weekStart, 7)))}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition"
                  title={t('avail.next_week')}
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
                          {t('avail.booked')}
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

      {/* Save actions */}
      <div className="sticky bottom-20 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-200/70 backdrop-blur lg:bottom-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            fullWidth
            disabled={!availability || savingMode !== null}
            loading={savingMode === 'week'}
            onClick={() => setConfirmMode('week')}
            className="!min-h-[50px] !rounded-xl"
          >
            <Clock className="mr-2 h-4 w-4" />
            {lang === 'vi' ? 'Lưu riêng tuần này' : 'Save this week only'}
          </Button>
          <Button
            fullWidth
            disabled={savingMode !== null}
            loading={savingMode === 'future'}
            onClick={() => setConfirmMode('future')}
            className="!min-h-[50px] !rounded-xl !bg-gradient-to-r !from-[#3BB8EB] !to-[#2b8fb8] hover:!from-[#2ba8d8] hover:!to-[#237fa5]"
          >
            <Save className="mr-2 h-4 w-4" />
            {t('avail.save_future')}
          </Button>
        </div>
        {!availability && (
          <p className="mt-2 text-center text-[11px] font-semibold text-slate-500">
            {lang === 'vi'
              ? 'Lần thiết lập đầu tiên cần lưu lịch tương lai.'
              : 'Initial setup must be saved as future availability.'}
          </p>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmMode && (
        <Modal
          open
          onClose={() => savingMode === null && setConfirmMode(null)}
          title={confirmMode === 'week'
            ? (lang === 'vi' ? 'Xác nhận lịch riêng tuần này' : 'Confirm this week')
            : t('avail.confirm_title')}
          footer={
            <div className="flex gap-3 justify-end w-full">
              <Button variant="ghost" disabled={savingMode !== null} onClick={() => setConfirmMode(null)}>{t('avail.confirm_cancel')}</Button>
              <Button
                onClick={confirmMode === 'week' ? handleSaveWeekOnly : handleSaveCurrentAndFuture}
                loading={savingMode === confirmMode}
                className="bg-gradient-to-r from-[#3BB8EB] to-[#2b8fb8] text-white"
              >
                {t('avail.confirm_ok')}
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-slate-600 leading-normal">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 mx-auto mb-2">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <p className="font-extrabold text-slate-800 text-center text-base">
              {confirmMode === 'week'
                ? (lang === 'vi' ? 'Chỉ thay đổi tuần đang chọn?' : 'Change only the selected week?')
                : t('avail.confirm_body_title')}
            </p>
            <p className="text-center text-xs text-slate-500">
              {confirmMode === 'week'
                ? (lang === 'vi'
                    ? 'Lịch gốc, booking đã xếp và lịch đặc biệt của các tuần khác được giữ nguyên.'
                    : 'The recurring schedule, booked classes, and all other weekly overrides stay unchanged.')
                : (lang === 'vi'
                    ? 'Lịch này trở thành lịch trống mặc định. Các tuần đặc biệt đã lưu vẫn được giữ nguyên và ca đã xếp lớp không bị hủy.'
                    : 'This becomes the default availability. Saved weekly overrides and booked classes remain unchanged.')}
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
