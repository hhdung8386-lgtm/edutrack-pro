import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where, onSnapshot } from 'firebase/firestore'
import { CalendarClock, ChevronLeft, ChevronRight, Clock, Save, Search, User, BookOpen, Link, Check, AlertTriangle, Trash2, ExternalLink } from 'lucide-react'
import { db } from '@/lib/firebase'
import { BookingRequest, DayAvailability, DayOfWeek, Teacher, TeacherAvailability, TimeRange, Student, Subject } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { Modal } from '@/components/ui/Modal'

const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS: Record<DayOfWeek, string> = {
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

const TIME_WINDOWS = [
  { key: '24h', label: '24h', start: 0, end: 1440 },
  { key: '6-14', label: '6:00-14:00', start: 360, end: 840 },
  { key: '12-20', label: '12:00-20:00', start: 720, end: 1200 },
  { key: '18-25', label: '18:00-25:00', start: 1080, end: 1500 },
] as const

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

function getStudentMinuteFund(student: Student) {
  const minutesPerSession = student.minutesPerSession || 50
  const total = student.totalMinutes ?? student.totalSessions * minutesPerSession
  const used = student.usedMinutes ?? student.usedSessions * minutesPerSession
  const remaining = student.remainingMinutes ?? Math.max(0, total - used)
  const held = student.reservedMinutes ?? student.heldMinutes ?? 0
  const available = Math.max(0, remaining - held)

  return { total, used, remaining, held, available }
}

interface SelectedSlot {
  day: DayOfWeek
  dateISO: string
  time: string
}

export function BookingSchedulesPage() {
  const { user } = useAuthStore()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [availability, setAvailability] = useState<TeacherAvailability | null>(null)
  const [slots, setSlots] = useState<Record<DayOfWeek, DayAvailability>>(emptySlots())
  const [search, setSearch] = useState('')
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [timeWindow, setTimeWindow] = useState<string>('24h')

  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  // Selection mode states
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([])

  // Modal states
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null)

  // Form states inside Schedule Modal
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [duration, setDuration] = useState<25 | 50>(50)
  const [classroomURL, setClassroomURL] = useState('')
  const [scheduling, setScheduling] = useState(false)

  // Release booking state
  const [releasing, setReleasing] = useState(false)

  const weekStartISO = formatDateISO(weekStart)
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const visibleStarts = useMemo(() => getVisibleStarts(timeWindow), [timeWindow])
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId)

  // Load teachers
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
        console.error('Error loading teachers:', error)
        toast.error('Không tải được danh sách giáo viên')
      } finally {
        setLoading(false)
      }
    }
    loadTeachers()
  }, [])

  // Load students for scheduling
  useEffect(() => {
    const q = query(collection(db, 'students'), where('status', '==', 'active'))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student))
      setStudents(list)
    })
    return unsub
  }, [])

  // Load teacher availability
  useEffect(() => {
    if (!selectedTeacherId) {
      setAvailability(null)
      setSlots(emptySlots())
      return
    }

    async function loadAvailability() {
      const snap = await getDoc(doc(db, 'teacherAvailability', selectedTeacherId))
      if (!snap.exists()) {
        setAvailability(null)
        setSlots(emptySlots())
        return
      }

      const data = { id: snap.id, ...snap.data() } as TeacherAvailability
      const weekOverride = data.weekOverrides?.[weekStartISO]
      setAvailability(data)
      setSlots(cloneSlots(weekOverride?.slots || data.slots))
    }

    loadAvailability().catch((error) => {
      console.error('Error loading teacher availability:', error)
      toast.error('Không tải được lịch rảnh giáo viên')
    })
  }, [selectedTeacherId, weekStartISO])

  // Load booked booking requests in real-time
  useEffect(() => {
    if (!selectedTeacherId) {
      setBookingRequests([])
      return
    }

    const q = query(
      collection(db, 'bookingRequests'),
      where('teacherId', '==', selectedTeacherId),
      where('requestedWeekStart', '==', weekStartISO)
    )

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BookingRequest))
      setBookingRequests(list)
    }, (error) => {
      console.error('Error loading booking requests:', error)
    })

    return unsub
  }, [selectedTeacherId, weekStartISO])

  const filteredTeachers = teachers.filter((teacher) => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return true
    return `${teacher.name} ${teacher.code}`.toLowerCase().includes(keyword)
  })

  const isCellOpen = (day: DayOfWeek, start: string) => {
    const startMinute = timeToMinutes(start)
    const endMinute = startMinute + 30
    return slots[day].timeRanges.some((range) => rangeCovers(range, startMinute, endMinute))
  }

  // Find booking request overlapping this 30-min cell
  const findBookingForCell = (dateISO: string, time: string) => {
    const cellStart = timeToMinutes(time)
    const cellEnd = cellStart + 30
    return bookingRequests.find((req) => {
      if (req.requestedDate !== dateISO) return false
      if (req.status !== 'confirmed' && req.status !== 'pending') return false

      const reqStart = timeToMinutes(req.requestedStart)
      const reqEnd = timeToMinutes(req.requestedEnd)

      return Math.max(cellStart, reqStart) < Math.min(cellEnd, reqEnd)
    })
  }

  // Filter students based on search keyword
  const filteredStudents = useMemo(() => {
    const keyword = studentSearch.trim().toLowerCase()
    if (!keyword) return []
    return students.filter(s => `${s.name} ${s.code}`.toLowerCase().includes(keyword))
  }, [studentSearch, students])

  // Get selected student's active subjects/packages
  const studentSubjects = useMemo(() => {
    if (!selectedStudent) return []
    return selectedStudent.subjects || []
  }, [selectedStudent])

  const handleCellClick = (day: DayOfWeek, dateISO: string, time: string) => {
    const booking = findBookingForCell(dateISO, time)
    if (booking) {
      setSelectedBooking(booking)
      setShowDetailModal(true)
      return
    }

    if (!isCellOpen(day, time)) return

    const slot: SelectedSlot = { day, dateISO, time }

    if (multiSelectMode) {
      setSelectedSlots((current) => {
        const exists = current.some((s) => s.dateISO === dateISO && s.time === time)
        if (exists) {
          return current.filter((s) => !(s.dateISO === dateISO && s.time === time))
        } else {
          return [...current, slot]
        }
      })
    } else {
      setSelectedSlots([slot])
      // Reset scheduling form
      setSelectedStudent(null)
      setStudentSearch('')
      setSelectedSubjectId('')
      setClassroomURL('')
      setShowScheduleModal(true)
    }
  }

  const isSlotSelected = (dateISO: string, time: string) => {
    return selectedSlots.some((s) => s.dateISO === dateISO && s.time === time)
  }

  const handleStudentSelect = (student: Student) => {
    setSelectedStudent(student)
    setClassroomURL(student.classroomURL || '')
    setDuration(student.minutesPerSession === 25 ? 25 : 50)
    // Pre-select first active subject if available
    const activeSub = student.subjects?.[0]
    if (activeSub) {
      setSelectedSubjectId(activeSub.subjectId)
    } else {
      setSelectedSubjectId('')
    }
  }

  // Execute scheduling transaction
  const executeScheduling = async () => {
    if (!selectedStudent || !selectedTeacher || selectedSlots.length === 0) return
    if (!selectedSubjectId) {
      toast.warning('Vui lòng chọn môn học')
      return
    }

    const sub = selectedStudent.subjects?.find(s => s.subjectId === selectedSubjectId)
    if (!sub) {
      toast.warning('Môn học không hợp lệ')
      return
    }

    setScheduling(true)
    try {
      const studentId = selectedStudent.id
      const slotsCount = selectedSlots.length
      const totalRequired = slotsCount * duration

      await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', studentId)
        const studentSnap = await tx.get(studentRef)
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

        const currentStudent = { id: studentSnap.id, ...studentSnap.data() } as Student
        const fund = getStudentMinuteFund(currentStudent)

        if (fund.available < totalRequired) {
          throw new Error('NOT_ENOUGH_MINUTES')
        }

        const nextHeld = fund.held + totalRequired

        // Update student minutes fund
        tx.update(studentRef, {
          reservedMinutes: nextHeld,
          heldMinutes: nextHeld,
          classroomURL: classroomURL.trim(),
          updatedAt: serverTimestamp(),
        })

        // Create booking requests
        for (const slot of selectedSlots) {
          const bookingRef = doc(collection(db, 'bookingRequests'))
          const startMin = timeToMinutes(slot.time)
          const endMin = startMin + duration

          tx.set(bookingRef, {
            status: 'confirmed',
            teacherId: selectedTeacher.id,
            teacherCode: selectedTeacher.code,
            teacherName: selectedTeacher.name,
            teacherPhotoURL: selectedTeacher.photoURL || '',
            studentId: currentStudent.id,
            studentCode: currentStudent.code,
            studentName: currentStudent.name,
            subjectId: selectedSubjectId,
            subjectName: sub.subjectName,
            requestedDay: slot.day,
            requestedDate: slot.dateISO,
            requestedWeekStart: weekStartISO,
            requestedStart: slot.time,
            requestedEnd: minutesToTime(endMin),
            requestedMinutes: duration,
            adminNote: 'Xếp lịch trực tiếp từ bảng admin',
            createdAt: serverTimestamp(),
            confirmedAt: serverTimestamp(),
            confirmedBy: user?.uid ?? 'admin',
            heldMinutesAfterConfirm: nextHeld,
          })
        }

        // Add admin log
        tx.set(doc(collection(db, 'adminLogs')), {
          adminId: user?.uid ?? 'admin',
          action: 'BATCH_SCHEDULE_CLASSES',
          targetType: 'student',
          targetId: studentId,
          changes: {
            teacherId: selectedTeacher.id,
            teacherName: selectedTeacher.name,
            slotsCount,
            duration,
            totalRequired,
            heldMinutesAfter: nextHeld,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success(`Đã xếp thành công ${slotsCount} lớp học`)
      setShowScheduleModal(false)
      setSelectedSlots([])
      setSelectedStudent(null)
      setStudentSearch('')
    } catch (error: any) {
      console.error('Direct scheduling failed:', error)
      if (error?.message === 'NOT_ENOUGH_MINUTES') {
        toast.error('Quỹ phút khả dụng của học viên không đủ để xếp lịch!')
      } else {
        toast.error('Xếp lớp thất bại, vui lòng thử lại!')
      }
    } finally {
      setScheduling(false)
    }
  }

  // Release booking holds (cancel booking)
  const handleReleaseBooking = async () => {
    if (!selectedBooking) return
    setReleasing(true)
    try {
      await runTransaction(db, async (tx) => {
        const requestRef = doc(db, 'bookingRequests', selectedBooking.id)
        const studentRef = doc(db, 'students', selectedBooking.studentId)
        const [requestSnap, studentSnap] = await Promise.all([
          tx.get(requestRef),
          tx.get(studentRef),
        ])

        if (!requestSnap.exists()) throw new Error('REQUEST_NOT_FOUND')
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

        const requestNow = requestSnap.data() as BookingRequest
        if (requestNow.status !== 'confirmed') throw new Error('REQUEST_NOT_CONFIRMED')

        const student = { id: studentSnap.id, ...studentSnap.data() } as Student
        const fund = getStudentMinuteFund(student)
        const minutes = Number(requestNow.requestedMinutes) || 0
        const nextHeld = Math.max(0, fund.held - minutes)

        // Restore student minute balance
        tx.update(studentRef, {
          reservedMinutes: nextHeld,
          heldMinutes: nextHeld,
          updatedAt: serverTimestamp(),
        })

        // Update booking status to released
        tx.update(requestRef, {
          status: 'released',
          releasedAt: serverTimestamp(),
          releasedBy: user?.uid ?? 'admin',
          heldMinutesAfterRelease: nextHeld,
        })

        // Add admin log
        tx.set(doc(collection(db, 'adminLogs')), {
          adminId: user?.uid ?? 'admin',
          action: 'RELEASE_BOOKING_HOLD',
          targetType: 'bookingRequest',
          targetId: selectedBooking.id,
          changes: {
            studentId: selectedBooking.studentId,
            releasedMinutes: minutes,
            heldMinutesAfter: nextHeld,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success('Đã nhả giữ chỗ & khôi phục quỹ phút thành công')
      setShowDetailModal(false)
      setSelectedBooking(null)
    } catch (error: any) {
      console.error('Release booking failed:', error)
      toast.error('Nhả lịch thất bại')
    } finally {
      setReleasing(false)
    }
  }

  const handleOpenBatchSchedule = () => {
    if (selectedSlots.length === 0) {
      toast.warning('Vui lòng chọn các ô OPEN trên lịch dạy')
      return
    }
    setSelectedStudent(null)
    setStudentSearch('')
    setSelectedSubjectId('')
    setClassroomURL('')
    setShowScheduleModal(true)
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white shadow-lg shadow-indigo-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <CalendarClock className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Xếp lớp trực quan (Booking Schedules)</h1>
              <p className="mt-1 text-sm text-white/85">Xếp lớp nhanh cho học viên vào các ca đã mở (OPEN) của giáo viên.</p>
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
        {/* Sidebar: Teachers List */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm giáo viên..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            />
          </label>

          <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="rounded-xl bg-slate-100 p-4 text-sm font-semibold text-slate-500">Đang tải...</div>
            ) : filteredTeachers.map((teacher) => (
              <button
                key={teacher.id}
                type="button"
                onClick={() => {
                  setSelectedTeacherId(teacher.id)
                  setSelectedSlots([])
                }}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                  selectedTeacherId === teacher.id
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50'
                }`}
              >
                {teacher.photoURL ? (
                  <img src={teacher.photoURL} alt={teacher.name} className="h-11 w-11 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-sm font-black text-indigo-700">
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

        {/* Main Content: Weekly Booking Calendar */}
        <section className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              {/* Time window selector */}
              <div className="relative">
                <select
                  value={timeWindow}
                  onChange={(e) => setTimeWindow(e.target.value)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold outline-none focus:border-indigo-400 min-w-[140px] appearance-none pr-8 cursor-pointer"
                >
                  {TIME_WINDOWS.map((item) => (
                    <option key={item.key} value={item.key}>
                      Ca: {item.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">▼</div>
              </div>

              {/* Multi-select toggle button */}
              <button
                type="button"
                onClick={() => {
                  setMultiSelectMode(!multiSelectMode)
                  setSelectedSlots([])
                }}
                className={`h-10 px-4 rounded-lg text-sm font-bold transition flex items-center gap-1.5 border ${
                  multiSelectMode
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {multiSelectMode ? 'Đang chọn nhiều' : 'Chọn nhiều ca'}
                {multiSelectMode && selectedSlots.length > 0 && (
                  <span className="bg-white text-indigo-700 text-xs px-2 py-0.5 rounded-full font-black">
                    {selectedSlots.length}
                  </span>
                )}
              </button>

              {/* Batch Action button */}
              {multiSelectMode && selectedSlots.length > 0 && (
                <button
                  type="button"
                  onClick={handleOpenBatchSchedule}
                  className="h-10 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition shadow-md flex items-center gap-1.5 animate-pulse"
                >
                  Xếp lớp nhanh
                </button>
              )}
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

          {/* Grid Schedule Table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[750px] border-collapse text-sm">
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
                      <div className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">{DAY_LABELS[day]}</div>
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
                  <tr key={start} className="hover:bg-slate-50/20 transition">
                    {/* Time column header */}
                    <td className="p-3 text-center font-bold text-slate-500 border-r border-slate-200 align-middle bg-slate-50/50">
                      {start}
                    </td>
                    {/* Day cells */}
                    {weekDates.map(({ day, iso }) => {
                      const open = isCellOpen(day, start)
                      const booking = findBookingForCell(iso, start)
                      const isSelected = isSlotSelected(iso, start)

                      return (
                        <td
                          key={day}
                          className={`p-1.5 border-r border-slate-200 align-middle text-center min-h-[52px] transition-all ${
                            isSelected ? 'bg-indigo-50/80 ring-2 ring-indigo-500 ring-inset' : ''
                          }`}
                        >
                          {booking ? (
                            <button
                              type="button"
                              onClick={() => handleCellClick(day, iso, start)}
                              className="w-full py-1.5 px-2 rounded-xl bg-amber-100/90 hover:bg-amber-200/90 text-amber-900 border border-amber-200/50 transition shadow-sm text-left block"
                            >
                              <div className="font-extrabold text-[11px] truncate tracking-tight">
                                AC {booking.studentName}
                              </div>
                              <div className="text-[9px] font-semibold text-amber-700/80 mt-0.5 truncate">
                                {booking.studentCode} · {booking.subjectName}
                              </div>
                            </button>
                          ) : open ? (
                            <button
                              type="button"
                              onClick={() => handleCellClick(day, iso, start)}
                              className={`w-full py-2.5 px-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition shadow-sm ${
                                isSelected
                                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/30'
                              }`}
                            >
                              {isSelected ? 'ĐÃ CHỌN' : 'OPEN'}
                            </button>
                          ) : (
                            <span className="text-slate-300 text-sm font-semibold select-none">-</span>
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
        </section>
      </div>

      {/* MODAL 1: Schedule/Assign Class Modal */}
      {showScheduleModal && (
        <Modal
          open
          onClose={() => setShowScheduleModal(false)}
          title={selectedSlots.length > 1 ? `Xếp lớp nhanh cho ${selectedSlots.length} ca học` : 'Xếp lớp cho học viên'}
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowScheduleModal(false)}>Hủy</Button>
              <Button variant="primary" loading={scheduling} onClick={executeScheduling} disabled={!selectedStudent || !selectedSubjectId}>
                Xác nhận xếp lớp
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Display selected times summary */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Thời gian đã chọn:</p>
              <div className="max-h-[100px] overflow-y-auto space-y-1 pr-1">
                {selectedSlots.map((s, idx) => (
                  <p key={idx} className="text-sm font-semibold text-slate-800">
                    {DAY_LABELS[s.day]} ({s.dateISO}) · Lớp từ {s.time}
                  </p>
                ))}
              </div>
            </div>

            {/* Search Student */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">Tìm kiếm học viên *</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value)
                    if (selectedStudent) setSelectedStudent(null)
                  }}
                  placeholder="Gõ mã hoặc tên học viên để tìm..."
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-4 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              {/* Student suggestions list */}
              {!selectedStudent && studentSearch.trim() && (
                <div className="max-h-[180px] overflow-y-auto border border-slate-200 rounded-lg bg-white shadow-lg space-y-1 p-1">
                  {filteredStudents.length === 0 ? (
                    <p className="text-xs text-slate-500 p-2">Không tìm thấy học viên nào</p>
                  ) : (
                    filteredStudents.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => handleStudentSelect(st)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded-md flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-slate-800">{st.name}</p>
                          <p className="text-xs text-slate-500 font-mono">{st.code}</p>
                        </div>
                        <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded">Chọn</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Display Selected Student Info */}
            {selectedStudent && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600/10 border border-indigo-600/20 rounded-xl flex items-center justify-center">
                    <User className="text-indigo-600 w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{selectedStudent.name}</h3>
                    <p className="text-xs text-slate-500 font-mono">{selectedStudent.code} · SĐT: {selectedStudent.parentPhone || '—'}</p>
                  </div>
                </div>

                {/* Minute Balance Fund Info */}
                {(() => {
                  const fund = getStudentMinuteFund(selectedStudent)
                  const totalRequired = selectedSlots.length * duration
                  const isEnough = fund.available >= totalRequired
                  return (
                    <div className="flex items-center justify-between text-xs border-t border-slate-200/50 pt-2 flex-wrap gap-2">
                      <div>
                        <span className="text-slate-500 font-semibold">Khả dụng: </span>
                        <span className={`font-bold ${isEnough ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {fund.available} phút
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-semibold">Yêu cầu: </span>
                        <span className="font-bold text-slate-800">
                          {totalRequired} phút
                        </span>
                      </div>
                      {!isEnough && (
                        <div className="w-full flex items-center gap-1.5 text-rose-500 font-bold mt-1 bg-rose-50 p-2 rounded-lg border border-rose-100">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>Học viên không đủ phút khả dụng để xếp lịch!</span>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Subject Selector */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-600">Gói môn học áp dụng *</label>
                  {studentSubjects.length === 0 ? (
                    <p className="text-xs text-rose-500 font-semibold">Học viên này chưa được gán môn học nào!</p>
                  ) : (
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500"
                    >
                      {studentSubjects.map((sub) => (
                        <option key={sub.subjectId} value={sub.subjectId}>
                          {sub.subjectName} (Còn {sub.remainingSessions} buổi / {sub.remainingMinutes} phút)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            {/* Set Lesson Duration */}
            <div className="space-y-1">
              <label className="block text-sm font-bold text-slate-700">Thời lượng mỗi ca học *</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="modal-duration"
                    checked={duration === 25}
                    onChange={() => setDuration(25)}
                    className="h-4 w-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  25 phút
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="modal-duration"
                    checked={duration === 50}
                    onChange={() => setDuration(50)}
                    className="h-4 w-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  50 phút
                </label>
              </div>
            </div>

            {/* Classroom Link (Optional override/fill) */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">Link phòng học của học viên</label>
              <div className="relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  value={classroomURL}
                  onChange={(e) => setClassroomURL(e.target.value)}
                  placeholder="https://zoom.us/j/... hoặc MS Teams"
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-4 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>
              <p className="text-[11px] text-slate-400">Tự động điền từ thông tin học viên. Thay đổi ở đây sẽ cập nhật vào hồ sơ học viên.</p>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 2: Booking Detail Modal */}
      {showDetailModal && selectedBooking && (
        <Modal
          open
          onClose={() => {
            setShowDetailModal(false)
            setSelectedBooking(null)
          }}
          title="Chi tiết ca học đã xếp"
          footer={
            <div className="flex gap-3 justify-between w-full">
              <Button variant="danger" loading={releasing} onClick={handleReleaseBooking}>
                <Trash2 className="w-4 h-4" />
                Hủy xếp lớp (Nhả lịch)
              </Button>
              <Button variant="ghost" onClick={() => {
                setShowDetailModal(false)
                setSelectedBooking(null)
              }}>
                Đóng
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase text-amber-700">Thông tin ca dạy</p>
              <p className="text-sm font-bold text-slate-800">
                Thứ {selectedBooking.requestedDay === 'sun' ? 'Nhật' : selectedBooking.requestedDay === 'mon' ? '2' : selectedBooking.requestedDay === 'tue' ? '3' : selectedBooking.requestedDay === 'wed' ? '4' : selectedBooking.requestedDay === 'thu' ? '5' : selectedBooking.requestedDay === 'fri' ? '6' : '7'}
                {` (${selectedBooking.requestedDate})`} · Từ {selectedBooking.requestedStart} đến {selectedBooking.requestedEnd} ({selectedBooking.requestedMinutes} phút)
              </p>
              <p className="text-xs text-slate-500 font-semibold">Giáo viên: {selectedBooking.teacherName} ({selectedBooking.teacherCode})</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <p className="text-xs font-semibold uppercase text-slate-400">Thông tin học viên</p>
              <div>
                <h3 className="font-bold text-slate-900 text-base">{selectedBooking.studentName}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedBooking.studentCode}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs mt-2 border-t border-slate-100 pt-3">
                <div>
                  <span className="text-slate-500 font-semibold">Môn học: </span>
                  <span className="text-slate-800 font-bold">{selectedBooking.subjectName}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Trạng thái: </span>
                  <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                    Đã xếp lớp
                  </span>
                </div>
              </div>

              {/* Classroom URL display */}
              {(() => {
                // Find student classroom link or booking link
                const st = students.find(s => s.id === selectedBooking.studentId)
                const roomLink = st?.classroomURL || selectedBooking.note
                return roomLink ? (
                  <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-xs text-slate-500 font-semibold block">Phòng học trực tuyến:</span>
                      <p className="text-[11px] text-slate-400 truncate">{roomLink}</p>
                    </div>
                    <a
                      href={roomLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0 border border-indigo-200/50"
                    >
                      Mở lớp học
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : null
              })()}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
