import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where, onSnapshot } from 'firebase/firestore'
import { CalendarClock, ChevronLeft, ChevronRight, Clock, Save, Search, User, BookOpen, Link, Check, AlertTriangle, Trash2, ExternalLink, X } from 'lucide-react'
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

function parseDateISO(dateISO: string): Date {
  const [year, month, day] = dateISO.split('-').map(Number)
  return new Date(year, month - 1, day)
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

function checkStudentOverlap(
  studentBookings: BookingRequest[],
  dateISO: string,
  startTime: string,
  endTime: string,
  ignoreBookingId?: string
): BookingRequest | null {
  const startMins = timeToMinutes(startTime)
  const endMins = timeToMinutes(endTime)
  
  for (const b of studentBookings) {
    if (b.id === ignoreBookingId) continue
    if (b.requestedDate !== dateISO) continue
    
    const bStart = timeToMinutes(b.requestedStart)
    const bEnd = timeToMinutes(b.requestedEnd)
    
    // Check overlap
    if (startMins < bEnd && bStart < endMins) {
      return b
    }
  }
  
  return null
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

function getStudentMinuteFund(student: Student, customHeldMinutes?: number) {
  const minutesPerSession = student.minutesPerSession || 50
  const total = student.totalMinutes ?? student.totalSessions * minutesPerSession
  const used = student.usedMinutes ?? student.usedSessions * minutesPerSession
  const remaining = student.remainingMinutes ?? Math.max(0, total - used)
  const held = customHeldMinutes !== undefined ? customHeldMinutes : (student.reservedMinutes ?? student.heldMinutes ?? 0)
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
  const [searchParams] = useSearchParams()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  // Allow deep-linking to a specific teacher's schedule (e.g. from the student
  // lesson history page): /admin/booking-schedules?teacherId=...
  const [selectedTeacherId, setSelectedTeacherId] = useState(() => searchParams.get('teacherId') || '')
  const [availability, setAvailability] = useState<TeacherAvailability | null>(null)
  const [slots, setSlots] = useState<Record<DayOfWeek, DayAvailability>>(emptySlots())
  const [search, setSearch] = useState('')
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [timeWindow, setTimeWindow] = useState<string>('24h')

  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  const [filterDays, setFilterDays] = useState<DayOfWeek[]>([])
  const [filterTime, setFilterTime] = useState('17:00')
  const [allAvailabilities, setAllAvailabilities] = useState<Record<string, TeacherAvailability>>({})

  // Smart filter states
  const [filterGender, setFilterGender] = useState<'all' | 'male' | 'female'>('all')
  const [filterIelts, setFilterIelts] = useState(false)
  const [filterExp, setFilterExp] = useState(false)
  const [filterYob, setFilterYob] = useState('')

  // Selection mode states
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([])
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([])

  // Modal states
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCancelBatchModal, setShowCancelBatchModal] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null)

  // Form states inside Schedule Modal
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const duration = 25
  const [classroomURL, setClassroomURL] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [selectedStudentBookings, setSelectedStudentBookings] = useState<BookingRequest[]>([])
  const [studentFutureBookings, setStudentFutureBookings] = useState<BookingRequest[]>([])
  const [cancellingAll, setCancellingAll] = useState(false)

  // Release booking state
  const [releasing, setReleasing] = useState(false)
  const [cancellingBatch, setCancellingBatch] = useState(false)

  const weekStartISO = formatDateISO(weekStart)
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const visibleStarts = useMemo(() => getVisibleStarts(timeWindow), [timeWindow])
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId)

  // Load teachers and availabilities
  useEffect(() => {
    async function loadTeachersAndAvailability() {
      setLoading(true)
      try {
        const [teachersSnap, availSnap] = await Promise.all([
          getDocs(query(collection(db, 'teachers'), where('status', '==', 'active'))),
          getDocs(collection(db, 'teacherAvailability'))
        ])

        const items = teachersSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Teacher))
          .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        setTeachers(items)
        // Keep the deep-linked/current teacher only if they exist in the active list,
        // otherwise fall back to the first teacher
        setSelectedTeacherId((current) =>
          current && items.some((t) => t.id === current) ? current : (items[0]?.id || '')
        )

        const avMap: Record<string, TeacherAvailability> = {}
        availSnap.docs.forEach(docSnap => {
          avMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() } as TeacherAvailability
        })
        setAllAvailabilities(avMap)
      } catch (error) {
        console.error('Error loading teachers/availability:', error)
        toast.error('Không tải được danh sách giáo viên')
      } finally {
        setLoading(false)
      }
    }
    loadTeachersAndAvailability()
  }, [])

  // When arriving via deep link (?teacherId=...), scroll the selected teacher
  // into view in the sidebar list once teachers are loaded
  useEffect(() => {
    if (loading) return
    const target = searchParams.get('teacherId')
    if (!target) return
    const el = document.querySelector(`[data-teacher-id="${target}"]`)
    if (el) el.scrollIntoView({ block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

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

  // Fetch selected student's active booking requests for subject-specific available minutes calculation
  useEffect(() => {
    if (!selectedStudent) {
      setSelectedStudentBookings([])
      return
    }
    const q = query(
      collection(db, 'bookingRequests'),
      where('studentId', '==', selectedStudent.id),
      where('status', 'in', ['confirmed', 'pending'])
    )
    getDocs(q).then((snap) => {
      const list = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BookingRequest))
      setSelectedStudentBookings(list)

      // Once bookings are known, make sure the pre-selected package actually has
      // available minutes (remaining - already booked). If not, switch to the first
      // package that does, so admins are not blocked by an exhausted default package.
      const subs = selectedStudent.subjects || []
      if (subs.length > 1) {
        const availableOf = (subjectId: string) => {
          const pkg = subs.find(s => s.subjectId === subjectId)
          if (!pkg) return 0
          const booked = list
            .filter((b) => b.subjectId === subjectId && !b.lessonId)
            .reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)
          return Math.max(0, (pkg.remainingMinutes || 0) - booked)
        }
        setSelectedSubjectId((currentId) => {
          if (currentId && availableOf(currentId) > 0) return currentId
          const better = subs.find(s => availableOf(s.subjectId) > 0)
          return better ? better.subjectId : currentId
        })
      }
    }).catch((error) => {
      console.error('Error loading student booking requests:', error)
    })
  }, [selectedStudent])

  // Fetch all future booking requests for selected student when detail modal opens
  useEffect(() => {
    if (!selectedBooking?.studentId) {
      setStudentFutureBookings([])
      return
    }
    const todayISO = new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0]
    const q = query(
      collection(db, 'bookingRequests'),
      where('studentId', '==', selectedBooking.studentId),
      where('status', 'in', ['confirmed', 'pending']),
      where('requestedDate', '>=', todayISO)
    )
    getDocs(q).then((snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingRequest))
      docs.sort((a, b) => {
        const dateA = a.requestedDate || ''
        const dateB = b.requestedDate || ''
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB)
        }
        return (a.requestedStart || '').localeCompare(b.requestedStart || '')
      })
      setStudentFutureBookings(docs)
    }).catch(err => {
      console.error('Error loading student future bookings:', err)
    })
  }, [selectedBooking])

  const uniqueYobs = useMemo(() => {
    const years = teachers
      .map((t) => t.yob)
      .filter((y): y is number => typeof y === 'number' && y > 0)
    return Array.from(new Set(years)).sort((a, b) => b - a)
  }, [teachers])

  const filteredTeachers = teachers.filter((teacher) => {
    // 1. Text search filter
    const keyword = search.trim().toLowerCase()
    if (keyword && !`${teacher.name} ${teacher.code}`.toLowerCase().includes(keyword)) {
      return false
    }

    // 2. Gender filter
    if (filterGender !== 'all') {
      const g = teacher.gender?.toLowerCase()
      if (g !== filterGender) return false
    }

    // 3. IELTS filter
    if (filterIelts) {
      const hasIeltsScore = !!teacher.ielts
      const hasIeltsCert = teacher.certificates?.some(
        (c) => c.title?.toLowerCase().includes('ielts')
      )
      if (!hasIeltsScore && !hasIeltsCert) {
        return false
      }
    }

    // 4. Experience > 1 year filter
    if (filterExp) {
      const years = typeof teacher.teachingYears === 'number' ? teacher.teachingYears : 0
      if (years < 1) {
        return false
      }
    }

    // 5. Birth Year filter
    if (filterYob) {
      if (String(teacher.yob) !== filterYob) {
        return false
      }
    }

    // 6. Schedule availability filter
    if (filterDays.length > 0 && filterTime) {
      const avail = allAvailabilities[teacher.id]
      if (!avail) return false

      const weekOverride = avail.weekOverrides?.[weekStartISO]
      const currentSlots = weekOverride?.slots || avail.slots
      if (!currentSlots) return false

      const startMinute = timeToMinutes(filterTime)
      const endMinute = startMinute + duration

      // Must be available on all selected days
      for (const day of filterDays) {
        const daySlots = currentSlots[day]
        if (!daySlots || !daySlots.timeRanges) return false
        const isAvailable = daySlots.timeRanges.some((range) => rangeCovers(range, startMinute, endMinute))
        if (!isAvailable) return false
      }
    }

    return true
  })

  const isCellOpen = (day: DayOfWeek, start: string) => {
    const startMinute = timeToMinutes(start)
    const endMinute = startMinute + 25
    return slots[day].timeRanges.some((range) => rangeCovers(range, startMinute, endMinute))
  }

  const doesSlotCover50 = (day: DayOfWeek, start: string) => {
    const startMinute = timeToMinutes(start)
    const endMinute = startMinute + 50
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
      if (multiSelectMode) {
        setSelectedBookingIds((current) => {
          const exists = current.includes(booking.id)
          if (exists) {
            return current.filter((id) => id !== booking.id)
          } else {
            return [...current, booking.id]
          }
        })
      } else {
        setSelectedBooking(booking)
        setShowDetailModal(true)
      }
      return
    }

    if (!isCellOpen(day, time)) return

    const todayISO = new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0]
    let isPast = false
    if (dateISO < todayISO) {
      isPast = true
    } else if (dateISO === todayISO) {
      const now = new Date(new Date().getTime() + 7 * 60 * 60 * 1000)
      const currentHour = now.getUTCHours()
      const currentMinute = now.getUTCMinutes()
      const currentMinutesStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`
      if (time < currentMinutesStr) {
        isPast = true
      }
    }

    if (isPast) {
      toast.info('Bạn đã chọn khung giờ đã qua. Khung giờ này chỉ được xếp nếu chọn Lịch định kỳ (bắt đầu từ tuần sau).')
    }

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
    // Pre-select the first subject package that still has remaining minutes,
    // so an exhausted/negative package (e.g. old tutor package) is not selected by default
    const subs = student.subjects || []
    const subWithBalance = subs.find(s => (s.remainingMinutes || 0) > 0)
    const activeSub = subWithBalance || subs[0]
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

    const totalRequired = selectedSlots.length * duration
    const bookedMinutesForSubject = selectedStudentBookings
      .filter((b) => b.subjectId === selectedSubjectId && !b.lessonId)
      .reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)
    const availableSubjectMinutes = Math.max(0, sub.remainingMinutes - bookedMinutesForSubject)
    if (!isRecurring && availableSubjectMinutes < totalRequired) {
      toast.error('Học viên không đủ phút khả dụng cho môn học này để xếp lịch!')
      return
    }

    const todayISO = new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0]
    const now = new Date(new Date().getTime() + 7 * 60 * 60 * 1000)
    const currentHour = now.getUTCHours()
    const currentMinute = now.getUTCMinutes()
    const currentMinutesStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`

    // 1. If not recurring, block past slots completely
    if (!isRecurring) {
      for (const slot of selectedSlots) {
        const isPast = slot.dateISO < todayISO || (slot.dateISO === todayISO && slot.time < currentMinutesStr)
        if (isPast) {
          toast.error(`Không thể xếp lịch ca học đơn lẻ trong quá khứ (${slot.dateISO} ${slot.time})!`)
          return
        }
      }
    }

    // Check overlap client-side before starting transaction to avoid double booking
    for (const slot of selectedSlots) {
      const startMin = timeToMinutes(slot.time)
      const endMin = startMin + duration
      const endStr = minutesToTime(endMin)

      if (isRecurring) {
        // For recurring, check future offset weeks
        // Cap by the selected subject package's available minutes (remaining - already booked).
        // Do NOT use the student's global fund here: one exhausted/negative package must not
        // block scheduling on another package that still has minutes.
        const maxSessions = Math.floor(availableSubjectMinutes / duration)
        let sessionsScheduled = 0
        let weekIndex = 0
        while (sessionsScheduled < maxSessions) {
          for (const sSlot of selectedSlots) {
            if (sessionsScheduled >= maxSessions) break
            const slotDate = addDays(parseDateISO(sSlot.dateISO), weekIndex * 7)
            const slotDateISO = formatDateISO(slotDate)
            
            // Skip past slots in the first week
            if (weekIndex === 0) {
              const isPast = slotDateISO < todayISO || (slotDateISO === todayISO && sSlot.time < currentMinutesStr)
              if (isPast) {
                continue
              }
            }

            const overlap = checkStudentOverlap(selectedStudentBookings, slotDateISO, sSlot.time, endStr)
            if (overlap) {
              toast.error(`Trùng lịch học viên! Khung giờ ${sSlot.time} - ${endStr} ngày ${slotDateISO} đã được xếp cho giáo viên ${overlap.teacherName}. Không thể xếp đè!`)
              return
            }
            sessionsScheduled++
          }
          weekIndex++
        }
      } else {
        const overlap = checkStudentOverlap(selectedStudentBookings, slot.dateISO, slot.time, endStr)
        if (overlap) {
          toast.error(`Trùng lịch học viên! Khung giờ ${slot.time} - ${endStr} ngày ${slot.dateISO} đã được xếp cho giáo viên ${overlap.teacherName}. Không thể xếp đè!`)
          return
        }
      }
    }

    setScheduling(true)
    try {
      const studentId = selectedStudent.id
      let totalScheduled = 0

      // Query latest student bookings first to calculate actual held minutes
      const bookingsSnap = await getDocs(
        query(
          collection(db, 'bookingRequests'),
          where('studentId', '==', studentId),
          where('status', 'in', ['confirmed', 'pending'])
        )
      )
      const studentBookingsList = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() } as BookingRequest))
      const latestHeldMinutes = studentBookingsList
        .filter((b) => !b.lessonId)
        .reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)

      await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', studentId)
        const studentSnap = await tx.get(studentRef)
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

        const currentStudent = { id: studentSnap.id, ...studentSnap.data() } as Student
        const fund = getStudentMinuteFund(currentStudent, latestHeldMinutes)

        const subInDb = currentStudent.subjects?.find(s => s.subjectId === selectedSubjectId)
        if (!subInDb) throw new Error('SUBJECT_NOT_FOUND')

        const bookedMinutesForSubject = studentBookingsList
          .filter((b) => b.subjectId === selectedSubjectId && !b.lessonId)
          .reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)
        const availableSubjectMinutes = Math.max(0, subInDb.remainingMinutes - bookedMinutesForSubject)

        let totalRequired = 0
        let bookingsToCreate: any[] = []

        if (!isRecurring) {
          totalRequired = selectedSlots.length * duration
          // Gate on the selected subject package only. The global fund can be dragged to 0
          // by another exhausted/over-drawn package and must not block this package.
          if (availableSubjectMinutes < totalRequired) {
            throw new Error('NOT_ENOUGH_MINUTES')
          }
          totalScheduled = selectedSlots.length

          for (const slot of selectedSlots) {
            const startMin = timeToMinutes(slot.time)
            const endMin = startMin + duration

            bookingsToCreate.push({
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
              classroomURL: currentStudent.classroomURL || '',
              createdAt: serverTimestamp(),
              confirmedAt: serverTimestamp(),
              confirmedBy: user?.uid ?? 'admin',
            })
          }
        } else {
          const maxSessions = Math.floor(availableSubjectMinutes / duration)
          if (maxSessions === 0) {
            throw new Error('NOT_ENOUGH_MINUTES')
          }

          let sessionsScheduled = 0
          let weekIndex = 0
          while (sessionsScheduled < maxSessions) {
            for (const slot of selectedSlots) {
              if (sessionsScheduled >= maxSessions) break

              // Calculate date for the slot in the current week offset
              const slotDate = addDays(parseDateISO(slot.dateISO), weekIndex * 7)
              const slotDateISO = formatDateISO(slotDate)
              const slotWeekStart = formatDateISO(getMonday(slotDate))

              // Skip past slots in the first week (weekIndex === 0)
              if (weekIndex === 0) {
                const isPast = slotDateISO < todayISO || (slotDateISO === todayISO && slot.time < currentMinutesStr)
                if (isPast) {
                  continue
                }
              }

              const startMin = timeToMinutes(slot.time)
              const endMin = startMin + duration

              bookingsToCreate.push({
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
                requestedDate: slotDateISO,
                requestedWeekStart: slotWeekStart,
                requestedStart: slot.time,
                requestedEnd: minutesToTime(endMin),
                requestedMinutes: duration,
                adminNote: 'Xếp lịch định kỳ từ bảng admin',
                classroomURL: currentStudent.classroomURL || '',
                createdAt: serverTimestamp(),
                confirmedAt: serverTimestamp(),
                confirmedBy: user?.uid ?? 'admin',
              })

              sessionsScheduled++
            }
            weekIndex++
          }

          totalRequired = sessionsScheduled * duration
          totalScheduled = sessionsScheduled
        }

        const nextHeld = fund.held + totalRequired

        // Update student minutes fund
        tx.update(studentRef, {
          reservedMinutes: nextHeld,
          heldMinutes: nextHeld,
          updatedAt: serverTimestamp(),
        })

        // Set booking documents
        for (const booking of bookingsToCreate) {
          const bookingRef = doc(collection(db, 'bookingRequests'))
          tx.set(bookingRef, {
            ...booking,
            heldMinutesAfterConfirm: nextHeld,
          })
        }

        // Add admin log
        tx.set(doc(collection(db, 'adminLogs')), {
          adminId: user?.uid ?? 'admin',
          action: isRecurring ? 'RECURRING_BATCH_SCHEDULE_CLASSES' : 'BATCH_SCHEDULE_CLASSES',
          targetType: 'student',
          targetId: studentId,
          changes: {
            teacherId: selectedTeacher.id,
            teacherName: selectedTeacher.name,
            slotsCount: totalScheduled,
            duration,
            totalRequired,
            heldMinutesAfter: nextHeld,
            isRecurring,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success(`Đã xếp thành công ${totalScheduled} ca học ${isRecurring ? '(Lịch định kỳ lặp lại)' : ''}`)
      setShowScheduleModal(false)
      setSelectedSlots([])
      setSelectedStudent(null)
      setStudentSearch('')
      setIsRecurring(false)
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

  // Execute batch cancellation
  const executeBatchCancel = async () => {
    if (selectedBookingIds.length === 0) return
    setCancellingBatch(true)
    try {
      const bookingSnaps = await Promise.all(
        selectedBookingIds.map((id) => getDoc(doc(db, 'bookingRequests', id)))
      )

      const bookingsToCancel = bookingSnaps
        .filter((snap) => snap.exists())
        .map((snap) => ({ id: snap.id, ...snap.data() } as BookingRequest))

      if (bookingsToCancel.length === 0) {
        toast.warning('Không tìm thấy thông tin các ca cần hủy')
        setCancellingBatch(false)
        return
      }

      // Group bookings by studentId
      const studentRefunds: Record<string, { minutes: number; bookings: BookingRequest[] }> = {}
      for (const booking of bookingsToCancel) {
        if (!studentRefunds[booking.studentId]) {
          studentRefunds[booking.studentId] = { minutes: 0, bookings: [] }
        }
        studentRefunds[booking.studentId].minutes += booking.requestedMinutes
        studentRefunds[booking.studentId].bookings.push(booking)
      }

      await runTransaction(db, async (tx) => {
        // Update each student's minutes balance
        for (const studentId of Object.keys(studentRefunds)) {
          const studentRef = doc(db, 'students', studentId)
          const studentSnap = await tx.get(studentRef)
          if (!studentSnap.exists()) continue

          const studentData = { id: studentSnap.id, ...studentSnap.data() } as Student
          const currentHeld = studentData.reservedMinutes ?? studentData.heldMinutes ?? 0
          const refundMinutes = studentRefunds[studentId].minutes
          const nextHeld = Math.max(0, currentHeld - refundMinutes)

          tx.update(studentRef, {
            reservedMinutes: nextHeld,
            heldMinutes: nextHeld,
            updatedAt: serverTimestamp(),
          })
        }

        // Delete all selected booking documents
        for (const booking of bookingsToCancel) {
          tx.delete(doc(db, 'bookingRequests', booking.id))
        }

        // Add admin log
        tx.set(doc(collection(db, 'adminLogs')), {
          adminId: user?.uid ?? 'admin',
          action: 'BATCH_CANCEL_CLASSES',
          targetType: 'student',
          changes: {
            bookingCount: bookingsToCancel.length,
            bookingIds: selectedBookingIds,
            refundSummary: Object.entries(studentRefunds).map(([id, info]) => ({
              studentId: id,
              refundMinutes: info.minutes,
            })),
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success(`Đã hủy thành công ${bookingsToCancel.length} ca xếp lớp và hoàn trả phút cho học viên!`)
      setSelectedBookingIds([])
      setShowCancelBatchModal(false)
    } catch (error) {
      console.error('Batch cancel failed:', error)
      toast.error('Gặp lỗi khi hủy ca xếp lớp hàng loạt')
    } finally {
      setCancellingBatch(false)
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

  const handleCancelBookingById = async (bookingId: string) => {
    const booking = studentFutureBookings.find(b => b.id === bookingId)
    if (!booking) return
    if (!window.confirm(`Bạn có chắc chắn muốn hủy ca học ngày ${booking.requestedDate} (${booking.requestedStart} - ${booking.requestedEnd}) không? Số phút sẽ được hoàn trả.`)) return

    try {
      await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', booking.studentId)
        const studentSnap = await tx.get(studentRef)
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

        const studentData = { id: studentSnap.id, ...studentSnap.data() } as Student
        const currentHeld = studentData.reservedMinutes ?? studentData.heldMinutes ?? 0
        const nextHeld = Math.max(0, currentHeld - (booking.requestedMinutes || 0))

        tx.update(studentRef, {
          reservedMinutes: nextHeld,
          heldMinutes: nextHeld,
          updatedAt: serverTimestamp(),
        })

        tx.update(doc(db, 'bookingRequests', booking.id), {
          status: 'released',
          releasedAt: serverTimestamp(),
          releasedBy: user?.uid ?? 'admin',
        })
      })

      setStudentFutureBookings(prev => prev.filter(b => b.id !== bookingId))
      toast.success('Hủy ca học thành công!')
    } catch (err) {
      console.error('Cancel booking failed:', err)
      toast.error('Gặp lỗi khi hủy ca học')
    }
  }

  const handleCancelAllStudentBookings = async () => {
    if (studentFutureBookings.length === 0) return
    const studentName = selectedBooking?.studentName || 'học viên'
    if (!window.confirm(`⚠️ BẠN CÓ CHẮC CHẮN muốn hủy TOÀN BỘ ${studentFutureBookings.length} ca học trong tương lai của học viên ${studentName} không? Toàn bộ số phút của các ca này sẽ được hoàn trả.`)) return

    setCancellingAll(true)
    try {
      const totalMinutesToRefund = studentFutureBookings.reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)
      const studentId = selectedBooking!.studentId

      await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', studentId)
        const studentSnap = await tx.get(studentRef)
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

        const studentData = { id: studentSnap.id, ...studentSnap.data() } as Student
        const currentHeld = studentData.reservedMinutes ?? studentData.heldMinutes ?? 0
        const nextHeld = Math.max(0, currentHeld - totalMinutesToRefund)

        tx.update(studentRef, {
          reservedMinutes: nextHeld,
          heldMinutes: nextHeld,
          updatedAt: serverTimestamp(),
        })

        for (const booking of studentFutureBookings) {
          tx.update(doc(db, 'bookingRequests', booking.id), {
            status: 'released',
            releasedAt: serverTimestamp(),
            releasedBy: user?.uid ?? 'admin',
          })
        }
      })

      setStudentFutureBookings([])
      toast.success(`Đã hủy toàn bộ ${studentFutureBookings.length} ca học của học viên và hoàn trả ${totalMinutesToRefund} phút.`)
      setShowDetailModal(false)
      setSelectedBooking(null)
    } catch (err) {
      console.error('Cancel all bookings failed:', err)
      toast.error('Gặp lỗi khi hủy toàn bộ ca học')
    } finally {
      setCancellingAll(false)
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

          {/* Bộ lọc hồ sơ nâng cao */}
          <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Bộ lọc hồ sơ</span>
              {(filterGender !== 'all' || filterIelts || filterExp || filterYob) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterGender('all');
                    setFilterIelts(false);
                    setFilterExp(false);
                    setFilterYob('');
                  }}
                  className="text-xs text-indigo-650 hover:text-indigo-755 font-bold transition"
                >
                  Xóa lọc
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Giới tính */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Giới tính</label>
                <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold text-slate-600">
                  {(['all', 'male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFilterGender(g)}
                      className={`flex-1 py-1 rounded transition ${
                        filterGender === g ? 'bg-white text-indigo-700 shadow-sm' : 'hover:text-slate-800'
                      }`}
                    >
                      {g === 'all' ? 'Tất cả' : g === 'male' ? 'Nam' : 'Nữ'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Năm sinh */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Năm sinh</label>
                <select
                  value={filterYob}
                  onChange={(e) => setFilterYob(e.target.value)}
                  className="h-[27px] w-full rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold outline-none focus:border-indigo-400 cursor-pointer"
                >
                  <option value="">Tất cả</option>
                  {uniqueYobs.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Checkable Chips */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => setFilterIelts(!filterIelts)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
                  filterIelts
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
                }`}
              >
                <span>🎓 IELTS Cert</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterExp(!filterExp)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
                  filterExp
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
                }`}
              >
                <span>💼 Kinh nghiệm &gt; 1 năm</span>
              </button>
            </div>
          </div>

          {/* Lọc lịch rảnh */}
          <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Lọc theo lịch trống</span>
              {filterDays.length > 0 && (
                <button
                  onClick={() => { setFilterDays([]); setFilterTime('17:00'); }}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-bold transition"
                >
                  Xóa lọc
                </button>
              )}
            </div>

            {/* Days list (Mon-Sun) toggles */}
            <div className="flex flex-wrap gap-1">
              {DAYS.map((day) => {
                const isSelected = filterDays.includes(day)
                const label = day === 'sun' ? 'CN' : `T${DAYS.indexOf(day) + 2}`
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setFilterDays(prev => 
                        prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                      )
                    }}
                    className={`flex-1 min-w-[36px] h-8 rounded-lg text-xs font-bold transition flex items-center justify-center border ${
                      isSelected 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-500/20' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Time select dropdown */}
            {filterDays.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400">Chọn khung giờ bắt đầu</label>
                <div className="relative">
                  <select
                    value={filterTime}
                    onChange={(e) => setFilterTime(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold outline-none focus:border-indigo-400 appearance-none pr-8 cursor-pointer"
                  >
                    {getVisibleStarts('24h').map((time) => (
                      <option key={time} value={time}>
                        Ca trống từ {time}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">▼</div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="rounded-xl bg-slate-100 p-4 text-sm font-semibold text-slate-500">Đang tải...</div>
            ) : filteredTeachers.map((teacher) => (
              <button
                key={teacher.id}
                type="button"
                data-teacher-id={teacher.id}
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
                  const nextMode = !multiSelectMode
                  setMultiSelectMode(nextMode)
                  setSelectedSlots([])
                  setSelectedBookingIds([])
                }}
                className={`h-10 px-4 rounded-lg text-sm font-bold transition flex items-center gap-1.5 border ${
                  multiSelectMode
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {multiSelectMode ? 'Đang chọn nhiều' : 'Chọn nhiều ca'}
                {multiSelectMode && (selectedSlots.length > 0 || selectedBookingIds.length > 0) && (
                  <span className="bg-white text-indigo-700 text-xs px-2 py-0.5 rounded-full font-black">
                    {selectedSlots.length + selectedBookingIds.length}
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
                  Xếp lớp nhanh ({selectedSlots.length})
                </button>
              )}

              {/* Batch Cancel button */}
              {multiSelectMode && selectedBookingIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCancelBatchModal(true)}
                  className="h-10 px-5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm transition shadow-md flex items-center gap-1.5"
                >
                  <Trash2 className="w-4.5 h-4.5" />
                  Hủy {selectedBookingIds.length} ca đã xếp
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
                    <th key={day} className="p-3 text-center border-r border-slate-200 font-semibold text-slate-700 w-[12%] max-w-[12%] min-w-[90px]">
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
                  <tr key={start} className="h-12 hover:bg-slate-50/20 transition">
                    {/* Time column header */}
                    <td className="p-2 border-r border-slate-200 font-bold text-xs text-slate-500 text-center select-none bg-slate-50/50">
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
                            (() => {
                              const isBookingSelected = selectedBookingIds.includes(booking.id)
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleCellClick(day, iso, start)}
                                  className={`w-full py-1.5 px-0.5 rounded-xl border transition shadow-sm text-center block ${
                                    isBookingSelected
                                      ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-500 text-rose-900'
                                      : 'bg-amber-100/90 hover:bg-amber-200/90 text-amber-900 border border-amber-200/50'
                                  }`}
                                >
                                  <div className="font-extrabold text-[11px] truncate tracking-tight flex items-center justify-center gap-0.5">
                                    <span>{booking.studentCode}</span>
                                    {isBookingSelected && <span className="text-[8px] bg-rose-500 text-white px-1.5 py-0.5 rounded font-black leading-none flex-shrink-0">HỦY</span>}
                                  </div>
                                  <div className="text-[9px] text-amber-800/80 font-bold truncate leading-tight mt-0.5 max-w-full px-1 block" title={booking.studentName}>
                                    {booking.studentName}
                                  </div>
                                </button>
                              )
                            })()
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
                  const activeSubPkg = selectedStudent.subjects?.find(s => s.subjectId === selectedSubjectId)
                  const bookedMinutesForSubject = selectedStudentBookings
                    .filter((b) => b.subjectId === selectedSubjectId && !b.lessonId)
                    .reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)
                  const availableForSubject = activeSubPkg ? Math.max(0, activeSubPkg.remainingMinutes - bookedMinutesForSubject) : 0

                  const totalRequired = selectedSlots.length * duration
                  const isEnough = availableForSubject >= totalRequired
                  const subjectFutureBookings = selectedStudentBookings
                    .filter((b) => b.subjectId === selectedSubjectId && !b.lessonId)
                    .sort((a, b) => (a.requestedDate || '').localeCompare(b.requestedDate || ''))

                  return (
                    <div className="flex items-center justify-between text-xs border-t border-slate-200/50 pt-2 flex-wrap gap-2">
                      <div>
                        <span className="text-slate-500 font-semibold">Khả dụng: </span>
                        <span className={`font-bold ${isEnough ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {availableForSubject} phút
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-semibold">Yêu cầu: </span>
                        <span className="font-bold text-slate-800">
                          {totalRequired} phút
                        </span>
                      </div>
                      {!isEnough && (
                        <div className="w-full space-y-1 mt-1 bg-rose-50 p-2.5 rounded-lg border border-rose-100 text-rose-500 font-medium">
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Học viên không đủ phút khả dụng để xếp lịch!</span>
                          </div>
                          {bookedMinutesForSubject > 0 && (
                            <>
                              <p className="text-[10px] pl-5 leading-normal font-semibold opacity-90">
                                * Đã có {bookedMinutesForSubject} phút ({Math.floor(bookedMinutesForSubject / 25)} buổi) được đặt lịch trong tương lai. Vui lòng hủy các ca tương lai này hoặc nạp thêm buổi học.
                              </p>
                              {subjectFutureBookings.length > 0 && (
                                <div className="mt-2 text-[10px] pl-5 space-y-1 text-slate-500 max-h-[120px] overflow-y-auto border-t border-rose-100 pt-1.5 font-semibold">
                                  <p className="text-rose-500 font-bold">Danh sách ca tương lai đã đặt ({subjectFutureBookings.length}):</p>
                                  {subjectFutureBookings.map((b, idx) => (
                                    <div key={b.id || idx} className="flex justify-between pr-2">
                                      <span>{idx + 1}. {DAY_LABELS[b.requestedDay as DayOfWeek] || b.requestedDay} ({b.requestedDate})</span>
                                      <span>{b.requestedStart} - {b.requestedEnd}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
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
                      {studentSubjects.map((sub) => {
                        const bookedMinutesForSub = selectedStudentBookings
                          .filter((b) => b.subjectId === sub.subjectId && !b.lessonId)
                          .reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)
                        const availMinutes = Math.max(0, sub.remainingMinutes - bookedMinutesForSub)
                        const availSessions = Math.floor(availMinutes / (sub.minutesPerSession || 25))
                        const bookedSessions = Math.floor(bookedMinutesForSub / (sub.minutesPerSession || 25))
                        return (
                          <option key={sub.subjectId} value={sub.subjectId}>
                            {sub.subjectName} (Còn {availSessions}b / {availMinutes}m khả dụng - Đã đặt {bookedSessions}b)
                          </option>
                        )
                      })}
                    </select>
                  )}
                </div>
              </div>
            )}



            {/* Recurring schedule switch */}
            {selectedStudent && (
              <div className="rounded-xl border border-indigo-100 bg-slate-50 p-4 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="h-4.5 w-4.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">Lặp lại lịch hàng tuần (Xếp lịch định kỳ)</span>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      Hệ thống sẽ tự động xếp ca này định kỳ các tuần tiếp theo cho đến khi học viên hết số phút học.
                    </span>
                  </div>
                </label>

                {isRecurring && (() => {
                  // Estimate based on the selected subject package (same rule as the scheduling transaction)
                  const pkg = selectedStudent.subjects?.find(s => s.subjectId === selectedSubjectId)
                  const bookedForSubject = selectedStudentBookings
                    .filter((b) => b.subjectId === selectedSubjectId && !b.lessonId)
                    .reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)
                  const availableForSubject = pkg ? Math.max(0, (pkg.remainingMinutes || 0) - bookedForSubject) : 0
                  const maxSessions = Math.floor(availableForSubject / duration)
                  const slotsPerWeek = Math.max(1, selectedSlots.length)
                  const maxWeeks = Math.ceil(maxSessions / slotsPerWeek)
                  return (
                    <div className="mt-2 text-xs font-bold text-indigo-600 border-t border-slate-200/50 pt-2 flex justify-between">
                      <span>Dự kiến xếp liên tục:</span>
                      <span>{maxWeeks} tuần ({maxSessions} ca)</span>
                    </div>
                  )
                })()}
              </div>
            )}
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

              {/* Classroom URL & Curriculum Link display */}
              {(() => {
                // Find student classroom link or booking link
                const st = students.find(s => s.id === selectedBooking.studentId)
                const roomLink = st?.classroomURL || selectedBooking.note
                const subjectPkg = st?.subjects?.find(s => s.subjectId === selectedBooking.subjectId)
                const curriculumLink = subjectPkg?.curriculumLink

                return (
                  <>
                    {roomLink && (
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
                    )}
                    {curriculumLink && (
                      <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <span className="text-xs text-slate-500 font-semibold block">Giáo trình môn học:</span>
                          <p className="text-[11px] text-slate-400 truncate">{curriculumLink}</p>
                        </div>
                        <a
                          href={curriculumLink.startsWith('http') ? curriculumLink : `https://${curriculumLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0 border border-sky-200/50"
                        >
                          Xem giáo trình
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                    {subjectPkg?.timetableNote && (
                      <div className="mt-2 pt-3 border-t border-slate-100">
                        <span className="text-xs text-slate-500 font-semibold block">Note timetable học viên:</span>
                        <p className="text-xs text-slate-700 font-medium mt-1 bg-amber-50/70 border border-amber-200/50 p-2.5 rounded-xl whitespace-pre-wrap">
                          {subjectPkg.timetableNote}
                        </p>
                      </div>
                    )}
                    {st?.textbookURL && (
                      <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <span className="text-xs text-slate-500 font-semibold block">Link sách học viên:</span>
                          <p className="text-[11px] text-slate-400 truncate">{st.textbookURL}</p>
                        </div>
                        <a
                          href={st.textbookURL.startsWith('http') ? st.textbookURL : `https://${st.textbookURL}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-[#3BB8EB] text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0 border border-sky-200/50"
                        >
                          Mở sách học viên
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Future bookings chip list */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-slate-400">Ca học tương lai ({studentFutureBookings.length})</p>
                {studentFutureBookings.length > 0 && (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={cancellingAll}
                    onClick={handleCancelAllStudentBookings}
                    className="h-7 text-[10px] px-2 py-1 font-extrabold uppercase tracking-wider"
                  >
                    Hủy tất cả ca học
                  </Button>
                )}
              </div>
              
              {studentFutureBookings.length === 0 ? (
                <p className="text-xs text-slate-400 font-medium italic">Không có ca học nào trong tương lai.</p>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                  {studentFutureBookings.map((b) => (
                    <div
                      key={b.id}
                      className="group flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100/70 transition-all font-medium"
                    >
                      <span className="text-[11px]">
                        <strong>Thứ {b.requestedDay === 'sun' ? 'Nhật' : b.requestedDay === 'mon' ? '2' : b.requestedDay === 'tue' ? '3' : b.requestedDay === 'wed' ? '4' : b.requestedDay === 'thu' ? '5' : b.requestedDay === 'fri' ? '6' : '7'} ({b.requestedDate})</strong>: {b.requestedStart}-{b.requestedEnd} ({b.teacherName})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCancelBookingById(b.id)}
                        className="text-slate-400 hover:text-rose-500 rounded-md hover:bg-rose-50 p-0.5 transition-colors"
                        title="Hủy ca học này"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 3: Batch Cancel Confirmation Modal */}
      {showCancelBatchModal && selectedBookingIds.length > 0 && (
        <Modal
          open
          onClose={() => setShowCancelBatchModal(false)}
          title="Xác nhận hủy lịch xếp lớp hàng loạt"
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowCancelBatchModal(false)}>Hủy</Button>
              <Button variant="danger" loading={cancellingBatch} onClick={executeBatchCancel}>
                Hủy {selectedBookingIds.length} ca học
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600 font-semibold">
              Bạn có chắc chắn muốn hủy <span className="font-black text-rose-600">{selectedBookingIds.length}</span> ca học đã xếp của giáo viên này?
            </p>
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-xs space-y-1.5 text-rose-800">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                Lưu ý quan trọng:
              </p>
              <ul className="list-disc pl-4 space-y-1 font-semibold">
                <li>Các ca học này sẽ bị xóa bỏ hoàn toàn khỏi lịch.</li>
                <li>Quỹ phút giữ chỗ sẽ được tự động hoàn trả đầy đủ cho học sinh.</li>
                <li>Hành động này không thể khôi phục sau khi bấm xác nhận.</li>
              </ul>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
