import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { CalendarClock, ChevronLeft, ChevronRight, Clock, Plus, Save, Search, X } from 'lucide-react'
import { db } from '@/lib/firebase'
import { DayAvailability, DayOfWeek, Teacher, TeacherAvailability, TimeRange } from '@/types'
import { Button } from '@/components/ui/Button'
import { toast } from '@/stores/toastStore'

const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Thứ 2',
  tue: 'Thứ 3',
  wed: 'Thứ 4',
  thu: 'Thứ 5',
  fri: 'Thứ 6',
  sat: 'Thứ 7',
  sun: 'CN',
}

const TIME_OPTIONS: string[] = []
for (let h = 0; h <= 24; h += 1) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 24) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

const EMPTY_DAY: DayAvailability = { available: false, timeRanges: [] }

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

function getWeekDates(weekStart: Date) {
  return DAYS.map((day, index) => ({ day, date: addDays(weekStart, index), iso: formatDateISO(addDays(weekStart, index)) }))
}

export function TeacherAvailabilityPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [availability, setAvailability] = useState<TeacherAvailability | null>(null)
  const [slots, setSlots] = useState<Record<DayOfWeek, DayAvailability>>(emptySlots())
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [loading, setLoading] = useState(true)
  const [savingMode, setSavingMode] = useState<'week' | 'future' | null>(null)

  const weekStartISO = formatDateISO(weekStart)
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
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

  const filteredTeachers = teachers.filter((teacher) => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return true
    return `${teacher.name} ${teacher.code}`.toLowerCase().includes(keyword)
  })

  const toggleDay = (day: DayOfWeek) => {
    setSlots((current) => {
      const nextOn = !current[day].available
      return {
        ...current,
        [day]: {
          available: nextOn,
          timeRanges: nextOn ? current[day].timeRanges.length ? current[day].timeRanges : [{ start: '08:00', end: '12:00' }] : [],
        },
      }
    })
  }

  const addTimeRange = (day: DayOfWeek) => {
    setSlots((current) => ({
      ...current,
      [day]: {
        available: true,
        timeRanges: [...current[day].timeRanges, { start: '13:00', end: '17:00' }],
      },
    }))
  }

  const removeTimeRange = (day: DayOfWeek, index: number) => {
    setSlots((current) => {
      const timeRanges = current[day].timeRanges.filter((_, itemIndex) => itemIndex !== index)
      return {
        ...current,
        [day]: { available: timeRanges.length > 0, timeRanges },
      }
    })
  }

  const updateTimeRange = (day: DayOfWeek, index: number, field: keyof TimeRange, value: string) => {
    setSlots((current) => ({
      ...current,
      [day]: {
        ...current[day],
        available: true,
        timeRanges: current[day].timeRanges.map((range, itemIndex) =>
          itemIndex === index ? { ...range, [field]: value } : range
        ),
      },
    }))
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
              <p className="mt-1 text-sm text-white/85">Admin chọn giáo viên, chỉnh lịch theo tuần và quyết định lưu riêng tuần này hoặc áp dụng cho tương lai.</p>
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
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black text-slate-900">Tuần {formatShortDate(weekStart)} - {formatShortDate(addDays(weekStart, 6))}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Lưu tuần này chỉ ảnh hưởng đúng tuần đang xem. Lưu hiện tại và tương lai sẽ làm mẫu lịch mới cho các tuần sau.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setWeekStart(getMonday(addDays(weekStart, -7)))}>
                <ChevronLeft className="h-4 w-4" />
                Tuần trước
              </Button>
              <Button variant="outline" onClick={() => setWeekStart(getMonday(new Date()))}>Tuần này</Button>
              <Button variant="outline" onClick={() => setWeekStart(getMonday(addDays(weekStart, 7)))}>
                Tuần sau
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-7">
            {weekDates.map(({ day, date }) => {
              const slot = slots[day]
              const isOn = slot.available
              return (
                <div key={day} className={`overflow-hidden rounded-2xl border-2 transition ${isOn ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
                  <button
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`w-full px-3 py-4 text-center transition ${isOn ? 'bg-emerald-100' : 'bg-slate-50 hover:bg-slate-100'}`}
                  >
                    <p className={`text-sm font-black ${isOn ? 'text-emerald-700' : 'text-slate-500'}`}>{DAY_LABELS[day]}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{formatShortDate(date)}</p>
                    <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${isOn ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-500'}`}>
                      {isOn ? 'Rảnh' : 'Bận'}
                    </span>
                  </button>

                  {isOn && (
                    <div className="space-y-2 p-2.5">
                      {slot.timeRanges.map((range, index) => (
                        <div key={index} className="relative rounded-xl border border-emerald-200 bg-white p-2">
                          <button
                            type="button"
                            onClick={() => removeTimeRange(day, index)}
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-500 transition hover:bg-rose-200"
                            aria-label="Xóa khung giờ"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <div className="space-y-1.5">
                            <select
                              value={range.start}
                              onChange={(event) => updateTimeRange(day, index, 'start', event.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold outline-none focus:border-emerald-400"
                            >
                              {TIME_OPTIONS.map((time) => <option key={time} value={time}>{time}</option>)}
                            </select>
                            <div className="text-center text-[10px] font-black text-slate-300">↓</div>
                            <select
                              value={range.end}
                              onChange={(event) => updateTimeRange(day, index, 'end', event.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold outline-none focus:border-emerald-400"
                            >
                              {TIME_OPTIONS.map((time) => <option key={time} value={time}>{time}</option>)}
                            </select>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addTimeRange(day)}
                        className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-emerald-300 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Thêm khung giờ
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
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
