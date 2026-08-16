import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, doc, getDocs, getDocFromServer, getDocsFromServer, query, runTransaction, serverTimestamp, where, onSnapshot } from 'firebase/firestore'
import {
  AlertTriangle,
  BookOpen,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe2,
  GraduationCap,
  History,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { db } from '@/lib/firebase'
import { BookingRequest, DayAvailability, DayOfWeek, Teacher, TeacherAvailability, TimeRange, Student, Subject } from '@/types'
import { Button } from '@/components/ui/Button'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { Modal } from '@/components/ui/Modal'
import { DiamondPointsIcon } from '@/components/shared/DiamondPointsIcon'
import { TeacherProfileDetails } from '@/components/teachers/TeacherProfileDetails'
import { calculateLessonPoints, getBookingPoints, getTeacherPointsPer25Minutes } from '@/lib/points'
import { getStudentPackageMinuteSummary } from '@/lib/studentMinutes'
import {
  bookingConflictMessage,
  bookingIntervalsOverlap,
  checkBookingCandidates,
} from '@/lib/bookingConflicts'
import {
  buildTeacherSubjectFilterOptions,
  normalizeTeacherSubjectLabel,
  teacherMatchesSubjectFilters,
  type TeacherSubjectGroup,
} from '@/lib/teacherSubjects'
import { teacherCountryLabel } from '@/lib/teacherCountries'
import { isBookingAttended, isBookingCancellable } from '@/lib/bookingLogic'

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
const TIME_WINDOWS = [
  { key: '24h', label: '24h', start: 0, end: 1440 },
  { key: '6-14', label: '6:00-14:00', start: 360, end: 840 },
  { key: '12-20', label: '12:00-20:00', start: 720, end: 1200 },
  { key: '18-25', label: '18:00-25:00', start: 1080, end: 1500 },
] as const

type VisibleTeacherSubjectGroup = Exclude<TeacherSubjectGroup, 'legacy'>

const SUBJECT_GROUP_LABELS: Record<VisibleTeacherSubjectGroup, string> = {
  language: 'Ngoại ngữ',
  academic: 'Văn hóa & học thuật',
}

function countryLabel(code: string) {
  return teacherCountryLabel(code)
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

function parseDateISO(dateISO: string): Date {
  const [year, month, day] = dateISO.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function getVietnamNowParts() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000)
  return {
    dateISO: now.toISOString().slice(0, 10),
    time: `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`,
  }
}

function isPastScheduleSlot(dateISO: string, time: string) {
  const now = getVietnamNowParts()
  return dateISO < now.dateISO || (dateISO === now.dateISO && time < now.time)
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
  for (const b of studentBookings) {
    if (b.id === ignoreBookingId) continue
    if (bookingIntervalsOverlap(b, {
      requestedDate: dateISO,
      requestedStart: startTime,
      requestedEnd: endTime,
    })) {
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
  const summary = getStudentPackageMinuteSummary(student)
  const total = summary.totalMinutes
  const used = summary.usedMinutes
  const remaining = summary.remainingMinutes
  const held = customHeldMinutes !== undefined ? customHeldMinutes : (student.reservedMinutes ?? student.heldMinutes ?? 0)
  const available = Math.max(0, remaining - held)

  return { total, used, remaining, held, available }
}

interface SelectedSlot {
  day: DayOfWeek
  dateISO: string
  time: string
}

function buildFutureRecurringSlots(
  baseSlots: SelectedSlot[],
  maxSessions: number,
  todayISO: string,
  currentTime: string
): SelectedSlot[] {
  if (baseSlots.length === 0 || maxSessions <= 0) return []

  const slots: SelectedSlot[] = []
  let weekIndex = 0

  while (slots.length < maxSessions) {
    for (const baseSlot of baseSlots) {
      if (slots.length >= maxSessions) break

      const dateISO = formatDateISO(addDays(parseDateISO(baseSlot.dateISO), weekIndex * 7))
      const isPast = dateISO < todayISO || (dateISO === todayISO && baseSlot.time < currentTime)
      if (isPast) continue

      slots.push({ ...baseSlot, dateISO })
    }
    weekIndex += 1
  }

  return slots
}

export function BookingSchedulesPage() {
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [approvedMinutesByTeacher, setApprovedMinutesByTeacher] = useState<Record<string, number>>({})
  const [subjects, setSubjects] = useState<Subject[]>([])
  // Allow deep-linking to a specific teacher's schedule (e.g. from the student
  // lesson history page): /admin/booking-schedules?teacherId=...
  const [selectedTeacherId, setSelectedTeacherId] = useState(() => searchParams.get('teacherId') || '')
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
  const [availabilityCatalogLoaded, setAvailabilityCatalogLoaded] = useState(false)
  const [availabilityCatalogLoading, setAvailabilityCatalogLoading] = useState(false)
  const [availabilityCatalogError, setAvailabilityCatalogError] = useState(false)

  // Smart filter states
  const [filterGender, setFilterGender] = useState<'all' | 'male' | 'female'>('all')
  const [filterIelts, setFilterIelts] = useState(false)
  const [filterToeic, setFilterToeic] = useState(false)
  const [filterToefl, setFilterToefl] = useState(false)
  const [filterExp, setFilterExp] = useState(false)
  const [filterYob, setFilterYob] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterSubjectKeys, setFilterSubjectKeys] = useState<string[]>([])
  const [filterSubjectMode, setFilterSubjectMode] = useState<'any' | 'all'>('any')
  const [subjectFilterSearch, setSubjectFilterSearch] = useState('')

  // Selection mode states
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([])
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([])

  // Modal states
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleMode, setScheduleMode] = useState<'regular' | 'makeup'>('regular')
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCancelBatchModal, setShowCancelBatchModal] = useState(false)
  const [profileTeacher, setProfileTeacher] = useState<Teacher | null>(null)
  const [teacherListSort, setTeacherListSort] = useState<'name' | 'minutes_desc' | 'minutes_asc'>('minutes_desc')
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null)

  // Form states inside Schedule Modal
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const duration = 25
  const [isRecurring, setIsRecurring] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [scheduleConflictMessage, setScheduleConflictMessage] = useState('')
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
  const selectedSlotsArePast = selectedSlots.length > 0 && selectedSlots.every((slot) => isPastScheduleSlot(slot.dateISO, slot.time))
  const selectedSlotsContainPast = selectedSlots.some((slot) => isPastScheduleSlot(slot.dateISO, slot.time))
  const availabilityFilterActive = filterDays.length > 0
  // Load the teacher directory first. The full availability catalog is fetched
  // lazily only when the admin actually uses the availability filter.
  useEffect(() => {
    async function loadTeachers() {
      setLoading(true)
      try {
        const teachersSnap = await getDocs(query(collection(db, 'teachers'), where('status', '==', 'active')))

        const items = teachersSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Teacher))
          .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        setTeachers(items)
        // Keep the deep-linked/current teacher only if they exist in the active list,
        // otherwise fall back to the first teacher
        setSelectedTeacherId((current) =>
          current && items.some((t) => t.id === current) ? current : (items[0]?.id || '')
        )

        // `totalApprovedMinutes` được cập nhật transactionally khi duyệt buổi học.
        // Chỉ hồ sơ legacy thiếu field mới đọc lịch sử riêng của chính gia sư đó.
        const approvedMinutes = Object.fromEntries(
          items.map((teacher) => [teacher.id, Math.max(0, Number(teacher.totalApprovedMinutes) || 0)]),
        ) as Record<string, number>
        const legacyTeachers = items.filter((teacher) => teacher.totalApprovedMinutes === undefined)
        const legacyLessonSnapshots = await Promise.all(legacyTeachers.map((teacher) => (
          getDocs(query(collection(db, 'lessons'), where('teacherId', '==', teacher.id)))
            .catch((error) => {
              console.error(`Error loading legacy approved minutes for teacher ${teacher.id}:`, error)
              return null
            })
        )))
        legacyLessonSnapshots.forEach((snapshot, index) => {
          if (!snapshot) return
          approvedMinutes[legacyTeachers[index].id] = snapshot.docs.reduce((total, lessonDocument) => {
            const lesson = lessonDocument.data()
            return lesson.status === 'approved' ? total + (Number(lesson.minutes) || 0) : total
          }, 0)
        })
        setApprovedMinutesByTeacher(approvedMinutes)
      } catch (error) {
        console.error('Error loading teachers/availability:', error)
        toast.error('Không tải được danh sách gia sư')
      } finally {
        setLoading(false)
      }
    }
    loadTeachers()
  }, [])

  useEffect(() => {
    if (!availabilityFilterActive || availabilityCatalogLoaded) return

    let active = true
    queueMicrotask(() => {
      if (!active) return
      setAvailabilityCatalogLoading(true)
      setAvailabilityCatalogError(false)
    })
    getDocs(collection(db, 'teacherAvailability'))
      .then((snapshot) => {
        if (!active) return
        const availabilityMap: Record<string, TeacherAvailability> = {}
        snapshot.docs.forEach((documentSnapshot) => {
          availabilityMap[documentSnapshot.id] = {
            id: documentSnapshot.id,
            ...documentSnapshot.data(),
          } as TeacherAvailability
        })
        setAllAvailabilities(availabilityMap)
        setAvailabilityCatalogLoaded(true)
      })
      .catch((error) => {
        if (!active) return
        console.error('Error loading availability filter catalog:', error)
        setAvailabilityCatalogError(true)
        toast.error('Không tải được bộ lọc lịch trống; danh sách gia sư vẫn được giữ nguyên')
      })
      .finally(() => {
        if (active) setAvailabilityCatalogLoading(false)
      })

    return () => { active = false }
  }, [availabilityCatalogLoaded, availabilityFilterActive])

  // Danh mục cũ chỉ là nguồn bổ sung. Hồ sơ năng lực của gia sư vẫn được ưu tiên
  // để các tài khoản chưa có subjectIds không bị mất khỏi bộ lọc môn.
  useEffect(() => {
    getDocs(collection(db, 'subjects'))
      .then((snapshot) => {
        setSubjects(snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        } as Subject)))
      })
      .catch((error) => {
        console.error('Error loading subject catalog:', error)
      })
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
      queueMicrotask(() => setSlots(emptySlots()))
      return
    }

    const teacherId = selectedTeacherId
    const availabilityRef = doc(db, 'teacherAvailability', teacherId)
    let active = true

    queueMicrotask(() => {
      if (active) setSlots(emptySlots())
    })

    const unsubscribe = onSnapshot(availabilityRef, (snap) => {
      if (!active) return
      if (!snap.exists()) {
        setSlots(emptySlots())
        setAllAvailabilities((current) => {
          const next = { ...current }
          delete next[teacherId]
          return next
        })
        return
      }

      const data = { id: snap.id, ...snap.data() } as TeacherAvailability
      const weekOverride = data.weekOverrides?.[weekStartISO]
      setSlots(cloneSlots(weekOverride?.slots || data.slots))
      setAllAvailabilities((current) => ({ ...current, [teacherId]: data }))
    }, (error) => {
      if (!active) return
      console.error('Error loading teacher availability:', error)
      toast.error('Không tải được lịch rảnh gia sư')
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [selectedTeacherId, weekStartISO])

  // Load booked booking requests in real-time
  useEffect(() => {
    if (!selectedTeacherId) {
      // This listener owns bookingRequests, so clearing it here is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBookingRequests([])
      return
    }

    // Nạp theo teacherId (KHÔNG lọc theo requestedWeekStart) vì một số booking cũ có
    // requestedWeekStart sai lệch với requestedDate → nếu lọc theo weekStart sẽ bị bỏ sót,
    // ca đã đặt không hiện trong bảng lịch dù vẫn nằm trong "Lịch đã đặt". findBookingForCell
    // đối chiếu theo requestedDate nên vẫn hiển thị đúng ô/ngày.
    const q = query(
      collection(db, 'bookingRequests'),
      where('teacherId', '==', selectedTeacherId)
    )

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BookingRequest))
      setBookingRequests(list)
      // Đồng bộ modal/chọn hàng loạt khi gia sư vừa điểm danh ở một màn hình khác.
      setSelectedBooking((current) => current
        ? (list.find((booking) => booking.id === current.id) || current)
        : null)
      setSelectedBookingIds((current) => current.filter((id) => {
        const booking = list.find((item) => item.id === id)
        return isBookingCancellable(booking)
      }))
    }, (error) => {
      console.error('Error loading booking requests:', error)
    })

    return unsub
  }, [selectedTeacherId])

  // Fetch selected student's active booking requests for subject-specific available minutes calculation
  useEffect(() => {
    if (!selectedStudent) {
      // Clear data owned by this selection-specific request when the modal resets.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
            .reduce((sum, b) => sum + getBookingPoints(b), 0)
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
      // Clear detail-only data after closing or switching the booking.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStudentFutureBookings([])
      return
    }
    const todayISO = new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0]
    const q = query(
      collection(db, 'bookingRequests'),
      where('studentId', '==', selectedBooking.studentId)
    )
    getDocs(q).then((snap) => {
      // Keep this query single-field so opening the detail modal does not depend on
      // a production-only composite Firestore index. The transaction handlers still
      // re-read every booking before releasing it, so this client filter is display-
      // only and cannot weaken the cancellation guard.
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as BookingRequest))
        .filter(booking => (
          isBookingCancellable(booking)
          && Boolean(booking.requestedDate && booking.requestedDate >= todayISO)
        ))
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
    const latestPlausibleYear = new Date().getFullYear() - 16
    const years = teachers
      .map((t) => t.yob)
      .filter((y): y is number => (
        typeof y === 'number'
        && Number.isInteger(y)
        && y >= 1940
        && y <= latestPlausibleYear
      ))
    return Array.from(new Set(years)).sort((a, b) => b - a)
  }, [teachers])

  const uniqueCountries = useMemo(() => {
    const codes = teachers
      .map((teacher) => teacher.country?.trim().toUpperCase())
      .filter((country): country is string => !!country)
    return Array.from(new Set(codes)).sort((a, b) => countryLabel(a).localeCompare(countryLabel(b), 'vi'))
  }, [teachers])

  const subjectFilterOptions = useMemo(
    () => buildTeacherSubjectFilterOptions(teachers, subjects),
    [teachers, subjects],
  )

  const selectedSubjectFilters = useMemo(() => {
    const selectedKeys = new Set(filterSubjectKeys)
    return subjectFilterOptions.filter((option) => selectedKeys.has(option.key))
  }, [filterSubjectKeys, subjectFilterOptions])

  const visibleSubjectFilterOptions = useMemo(() => {
    const keyword = normalizeTeacherSubjectLabel(subjectFilterSearch)
    if (!keyword) return subjectFilterOptions
    return subjectFilterOptions.filter((option) => option.normalizedName.includes(keyword))
  }, [subjectFilterOptions, subjectFilterSearch])

  const displayedSubjectFilterOptions = useMemo(
    () => visibleSubjectFilterOptions.filter((option) => option.group !== 'legacy'),
    [visibleSubjectFilterOptions],
  )

  const toggleSubjectFilter = (key: string) => {
    if (filterSubjectKeys.includes(key) && filterSubjectKeys.length <= 2) {
      setFilterSubjectMode('any')
    }
    setFilterSubjectKeys((current) => {
      return current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    })
  }

  const filteredTeachers = teachers.filter((teacher) => {
    // 1. Text search filter
    const keyword = normalizeTeacherSubjectLabel(search)
    const searchableTeacher = normalizeTeacherSubjectLabel(`${teacher.name} ${teacher.code}`)
    if (keyword && !searchableTeacher.includes(keyword)) {
      return false
    }

    // 2. Gender filter
    if (filterGender !== 'all') {
      const g = teacher.gender?.toLowerCase()
      if (g !== filterGender) return false
    }

    // 3. Chứng chỉ ngoại ngữ: có điểm HOẶC có chứng chỉ chứa từ khoá.
    // Chọn nhiều chip = gia sư phải thoả TẤT CẢ chip đã chọn.
    const hasCertificate = (keyword: string, score?: string) => {
      if (score && String(score).trim()) return true
      return !!teacher.certificates?.some((c) => c.title?.toLowerCase().includes(keyword))
    }
    if (filterIelts && !hasCertificate('ielts', teacher.ielts)) return false
    if (filterToeic && !hasCertificate('toeic', teacher.toeic)) return false
    if (filterToefl && !hasCertificate('toefl', teacher.toefl)) return false

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

    // 6. Country filter
    if (filterCountry) {
      if ((teacher.country || '').trim().toUpperCase() !== filterCountry) {
        return false
      }
    }

    // 7. Teacher capability filter. Default is OR; admins can require every
    // selected subject when they need a multi-skill teacher.
    if (!teacherMatchesSubjectFilters(teacher, selectedSubjectFilters, filterSubjectMode)) {
      return false
    }

    // 8. Schedule availability filter
    if (filterDays.length > 0 && filterTime) {
      // Keep the directory complete while this optional catalog is loading or
      // unavailable. Once loaded, filtering is identical to the previous flow.
      if (!availabilityCatalogLoaded) return true
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

  const getTeacherApprovedMinutes = (teacher: Teacher) => (
    approvedMinutesByTeacher[teacher.id] ?? (Number(teacher.totalApprovedMinutes) || 0)
  )

  const displayedTeachers = [...filteredTeachers].sort((left, right) => {
    const leftNickname = left.code || left.releasedNickname || ''
    const rightNickname = right.code || right.releasedNickname || ''
    if (teacherListSort === 'name') return leftNickname.localeCompare(rightNickname, 'vi')
    const minuteDifference = getTeacherApprovedMinutes(left) - getTeacherApprovedMinutes(right)
    if (minuteDifference !== 0) return teacherListSort === 'minutes_desc' ? -minuteDifference : minuteDifference
    return leftNickname.localeCompare(rightNickname, 'vi')
  })

  const isCellOpen = (day: DayOfWeek, start: string) => {
    const startMinute = timeToMinutes(start)
    const endMinute = startMinute + 25
    return slots[day].timeRanges.some((range) => rangeCovers(range, startMinute, endMinute))
  }

  const getBookingCreatedAt = (booking: BookingRequest) => {
    const createdAt = booking.createdAt as unknown as {
      toMillis?: () => number
      seconds?: number
    } | undefined
    if (typeof createdAt?.toMillis === 'function') return createdAt.toMillis()
    if (typeof createdAt?.seconds === 'number') return createdAt.seconds * 1000
    return Number.MAX_SAFE_INTEGER
  }

  // Giữ cả booking đã hoàn tất trên timetable để giáo vụ thấy lịch sử giống
  // màn hình gia sư. Ưu tiên bản đã điểm danh nếu dữ liệu cũ có booking trùng ô.
  const findBookingForCell = (dateISO: string, time: string) => {
    const cellStart = timeToMinutes(time)
    const cellEnd = cellStart + 30
    const cellInterval = {
      requestedDate: dateISO,
      requestedStart: time,
      requestedEnd: minutesToTime(cellEnd),
    }
    return bookingRequests
      .filter((req) => {
        if (req.status !== 'confirmed' && req.status !== 'pending' && req.status !== 'completed') return false
        return bookingIntervalsOverlap(req, cellInterval)
      })
      .sort((left, right) => {
        const attendedDiff = Number(isBookingAttended(right)) - Number(isBookingAttended(left))
        if (attendedDiff) return attendedDiff
        const createdAtDiff = getBookingCreatedAt(left) - getBookingCreatedAt(right)
        return createdAtDiff || left.id.localeCompare(right.id)
      })[0]
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
        if (!isBookingCancellable(booking)) {
          toast.info('Ca đã được giáo viên điểm danh nên không thể chọn để hủy.')
          return
        }
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

    const isPast = isPastScheduleSlot(dateISO, time)

    if (isPast) {
      toast.info('Ca đã qua có thể dùng làm mẫu rải lịch từ tuần kế tiếp, hoặc tạo lớp học bù để gia sư điểm danh.')
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
      if (isPast) {
        setMultiSelectMode(true)
        setSelectedBookingIds([])
        return
      }
      // Reset scheduling form
      setScheduleMode('regular')
      setIsRecurring(false)
      setSelectedStudent(null)
      setStudentSearch('')
      setSelectedSubjectId('')
      setShowScheduleModal(true)
    }
  }

  const isSlotSelected = (dateISO: string, time: string) => {
    return selectedSlots.some((s) => s.dateISO === dateISO && s.time === time)
  }

  const handleStudentSelect = (student: Student) => {
    setScheduleConflictMessage('')
    setSelectedStudent(student)
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
    setScheduleConflictMessage('')
    if (!selectedSubjectId) {
      toast.warning('Vui lòng chọn môn học')
      return
    }

    const sub = selectedStudent.subjects?.find(s => s.subjectId === selectedSubjectId)
    if (!sub) {
      toast.warning('Môn học không hợp lệ')
      return
    }

    const pointsPer25Minutes = getTeacherPointsPer25Minutes(selectedTeacher)
    const pointsPerLesson = calculateLessonPoints(duration, pointsPer25Minutes)
    const totalRequiredPoints = selectedSlots.length * pointsPerLesson
    const bookedPointsForSubject = selectedStudentBookings
      .filter((b) => b.subjectId === selectedSubjectId && !b.lessonId)
      .reduce((sum, b) => sum + getBookingPoints(b), 0)
    const availableSubjectPoints = Math.max(0, sub.remainingMinutes - bookedPointsForSubject)
    if (!isRecurring && availableSubjectPoints < totalRequiredPoints) {
      toast.error('Học viên không đủ kim cương khả dụng cho môn học này để xếp lịch!')
      return
    }

    const vietnamNow = getVietnamNowParts()
    const todayISO = vietnamNow.dateISO
    const currentMinutesStr = vietnamNow.time

    if (scheduleMode === 'makeup') {
      if (isRecurring || !selectedSlots.every((slot) => isPastScheduleSlot(slot.dateISO, slot.time))) {
        toast.error('Lớp học bù chỉ áp dụng cho ca đơn lẻ trong quá khứ.')
        return
      }
    } else if (!isRecurring) {
      // Luồng thường không được phép lùi ngày. Ngoại lệ duy nhất là nút học bù.
      for (const slot of selectedSlots) {
        if (isPastScheduleSlot(slot.dateISO, slot.time)) {
          toast.error(`Không thể xếp lịch ca học đơn lẻ trong quá khứ (${slot.dateISO} ${slot.time})!`)
          return
        }
      }
    }

    // Build the same concrete future slot list for the pre-check and transaction.
    // A past weekday can be used as a recurring template, but no recurring booking
    // may ever be written into the past.
    const slotsToCheck = isRecurring
      ? buildFutureRecurringSlots(
        selectedSlots,
        pointsPerLesson > 0 ? Math.floor(availableSubjectPoints / pointsPerLesson) : 0,
        todayISO,
        currentMinutesStr
      )
      : selectedSlots

    // Check overlap client-side before starting transaction to avoid double booking
    for (const slot of slotsToCheck) {
      const startMin = timeToMinutes(slot.time)
      const endMin = startMin + duration
      const endStr = minutesToTime(endMin)

      const overlap = checkStudentOverlap(selectedStudentBookings, slot.dateISO, slot.time, endStr)
      if (overlap) {
        const message = `Không thể xếp lớp: học viên đã có lịch với ${overlap.teacherName} lúc ${slot.time} - ${endStr}, ngày ${slot.dateISO}.`
        setScheduleConflictMessage(message)
        toast.error(message)
        return
      }
    }

    setScheduling(true)
    try {
      const studentId = selectedStudent.id
      let totalScheduled = 0

      // Query latest student bookings first to calculate actual held minutes
      const bookingsSnap = await getDocsFromServer(
        query(
          collection(db, 'bookingRequests'),
          where('studentId', '==', studentId),
          where('status', 'in', ['confirmed', 'pending'])
        )
      )
      const studentBookingsList = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() } as BookingRequest))
      const latestHeldPoints = studentBookingsList
        .filter((b) => !b.lessonId)
        .reduce((sum, b) => sum + getBookingPoints(b), 0)

      // Capture both calendar revisions before conflict detection. The transaction
      // below may only write when these revisions are still current, preventing two
      // near-simultaneous scheduling actions from committing the same time slot.
      const [studentCalendarSnap, teacherCalendarSnap] = await Promise.all([
        getDocFromServer(doc(db, 'students', studentId)),
        getDocFromServer(doc(db, 'teachers', selectedTeacher.id)),
      ])
      if (!studentCalendarSnap.exists()) throw new Error('STUDENT_NOT_FOUND')
      if (!teacherCalendarSnap.exists()) throw new Error('TEACHER_NOT_FOUND')
      const expectedStudentScheduleRevision = Number(studentCalendarSnap.data().bookingScheduleRevision || 0)
      const expectedTeacherScheduleRevision = Number(teacherCalendarSnap.data().bookingScheduleRevision || 0)

      const candidates = []
      if (!isRecurring) {
        selectedSlots.forEach((slot) => {
          candidates.push({
            teacherId: selectedTeacher.id,
            teacherName: selectedTeacher.name,
            studentId,
            studentName: selectedStudent.name,
            studentCode: selectedStudent.code,
            requestedDate: slot.dateISO,
            requestedStart: slot.time,
            requestedEnd: minutesToTime(timeToMinutes(slot.time) + duration),
            requestedMinutes: duration,
          })
        })
      } else {
        const maxSessions = pointsPerLesson > 0 ? Math.floor(availableSubjectPoints / pointsPerLesson) : 0
        const recurringSlots = buildFutureRecurringSlots(selectedSlots, maxSessions, todayISO, currentMinutesStr)
        for (const slot of recurringSlots) {
          candidates.push({
            teacherId: selectedTeacher.id,
            teacherName: selectedTeacher.name,
            studentId,
            studentName: selectedStudent.name,
            studentCode: selectedStudent.code,
            requestedDate: slot.dateISO,
            requestedStart: slot.time,
            requestedEnd: minutesToTime(timeToMinutes(slot.time) + duration),
            requestedMinutes: duration,
          })
        }
      }

      const conflicts = await checkBookingCandidates(candidates)
      if (conflicts.length > 0) {
        const conflictError = new Error('BOOKING_CONFLICT') as Error & { detail?: string }
        conflictError.detail = bookingConflictMessage(conflicts[0])
        throw conflictError
      }

      await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', studentId)
        const teacherRef = doc(db, 'teachers', selectedTeacher.id)
        const [studentSnap, teacherSnap] = await Promise.all([
          tx.get(studentRef),
          tx.get(teacherRef),
        ])
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')
        if (!teacherSnap.exists()) throw new Error('TEACHER_NOT_FOUND')

        const currentStudentScheduleRevision = Number(studentSnap.data().bookingScheduleRevision || 0)
        const currentTeacherScheduleRevision = Number(teacherSnap.data().bookingScheduleRevision || 0)
        if (
          currentStudentScheduleRevision !== expectedStudentScheduleRevision
          || currentTeacherScheduleRevision !== expectedTeacherScheduleRevision
        ) {
          throw new Error('BOOKING_CALENDAR_CHANGED')
        }

        const currentStudent = { id: studentSnap.id, ...studentSnap.data() } as Student
        const fund = getStudentMinuteFund(currentStudent, latestHeldPoints)

        const subInDb = currentStudent.subjects?.find(s => s.subjectId === selectedSubjectId)
        if (!subInDb) throw new Error('SUBJECT_NOT_FOUND')

        const bookedPointsForSubject = studentBookingsList
          .filter((b) => b.subjectId === selectedSubjectId && !b.lessonId)
          .reduce((sum, b) => sum + getBookingPoints(b), 0)
        const availableSubjectPoints = Math.max(0, subInDb.remainingMinutes - bookedPointsForSubject)

        let totalRequired: number
        const bookingsToCreate: Record<string, unknown>[] = []

        if (!isRecurring) {
          totalRequired = selectedSlots.length * pointsPerLesson
          // Gate on the selected subject package only. The global fund can be dragged to 0
          // by another exhausted/over-drawn package and must not block this package.
          if (availableSubjectPoints < totalRequired) {
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
              requestedPoints: pointsPerLesson,
              pointsPer25Minutes,
              adminNote: scheduleMode === 'makeup'
                ? 'Xếp lớp học bù trong quá khứ từ bảng admin'
                : 'Xếp lịch trực tiếp từ bảng admin',
              ...(scheduleMode === 'makeup' ? {
                bookingType: 'makeup',
                isMakeup: true,
                makeupCreatedAt: serverTimestamp(),
              } : {}),
              classroomURL: currentStudent.classroomURL || '',
              createdAt: serverTimestamp(),
              confirmedAt: serverTimestamp(),
              confirmedBy: user?.uid ?? 'admin',
            })
          }
        } else {
          const maxSessions = pointsPerLesson > 0 ? Math.floor(availableSubjectPoints / pointsPerLesson) : 0
          if (maxSessions === 0) {
            throw new Error('NOT_ENOUGH_MINUTES')
          }

          const recurringSlots = buildFutureRecurringSlots(selectedSlots, maxSessions, todayISO, currentMinutesStr)
          for (const slot of recurringSlots) {
            const slotDate = parseDateISO(slot.dateISO)
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
              requestedWeekStart: formatDateISO(getMonday(slotDate)),
              requestedStart: slot.time,
              requestedEnd: minutesToTime(endMin),
              requestedMinutes: duration,
              requestedPoints: pointsPerLesson,
              pointsPer25Minutes,
              adminNote: 'Xếp lịch định kỳ từ bảng admin',
              classroomURL: currentStudent.classroomURL || '',
              createdAt: serverTimestamp(),
              confirmedAt: serverTimestamp(),
              confirmedBy: user?.uid ?? 'admin',
            })
          }

          totalRequired = recurringSlots.length * pointsPerLesson
          totalScheduled = recurringSlots.length
        }

        const nextHeld = fund.held + totalRequired

        // Update student minutes fund
        tx.update(studentRef, {
          reservedMinutes: nextHeld,
          heldMinutes: nextHeld,
          bookingScheduleRevision: currentStudentScheduleRevision + 1,
          bookingScheduleUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        tx.update(teacherRef, {
          bookingScheduleRevision: currentTeacherScheduleRevision + 1,
          bookingScheduleUpdatedAt: serverTimestamp(),
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
          action: scheduleMode === 'makeup'
            ? 'BATCH_SCHEDULE_MAKEUP_CLASSES'
            : isRecurring
            ? 'RECURRING_BATCH_SCHEDULE_CLASSES'
            : 'BATCH_SCHEDULE_CLASSES',
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
            scheduleMode,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success(scheduleMode === 'makeup'
        ? `Đã xếp thành công ${totalScheduled} ca học bù. Gia sư có thể vào Lịch dạy để điểm danh.`
        : `Đã xếp thành công ${totalScheduled} ca học ${isRecurring ? '(Lịch định kỳ lặp lại)' : ''}`)
      setShowScheduleModal(false)
      setSelectedSlots([])
      setSelectedStudent(null)
      setStudentSearch('')
      setIsRecurring(false)
    } catch (error: unknown) {
      console.error('Direct scheduling failed:', error)
      const errorMessage = error instanceof Error ? error.message : ''
      const errorDetail = typeof error === 'object' && error !== null && 'detail' in error
        ? String(error.detail || '')
        : ''
      if (errorMessage === 'BOOKING_CONFLICT') {
        const message = errorDetail || 'Không thể xếp lớp vì lịch bị trùng.'
        setScheduleConflictMessage(message)
        toast.error(message)
        return
      }
      if (errorMessage === 'BOOKING_CALENDAR_CHANGED') {
        toast.error('Lịch vừa được thay đổi ở thao tác khác. Hệ thống chưa tạo ca nào; vui lòng chọn lại lịch mới nhất.')
        return
      }
      if (errorMessage === 'NOT_ENOUGH_MINUTES') {
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
    if (selectedBookingIds.length > 400) {
      toast.warning('Vui lòng hủy tối đa 400 ca mỗi lần để đảm bảo transaction an toàn.')
      return
    }
    setCancellingBatch(true)
    try {
      const cancelledCount = await runTransaction(db, async (tx) => {
        const bookingRefs = selectedBookingIds.map((id) => doc(db, 'bookingRequests', id))
        const bookingSnaps = await Promise.all(bookingRefs.map((bookingRef) => tx.get(bookingRef)))
        const bookingsToCancel = bookingSnaps.flatMap((bookingSnap) => {
          if (!bookingSnap.exists()) return []
          const booking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
          return (booking.status === 'pending' || booking.status === 'confirmed') && !booking.lessonId
            ? [booking]
            : []
        })
        if (bookingsToCancel.length === 0) return 0

        const studentRefunds: Record<string, { points: number; bookings: BookingRequest[] }> = {}
        for (const booking of bookingsToCancel) {
          if (!studentRefunds[booking.studentId]) studentRefunds[booking.studentId] = { points: 0, bookings: [] }
          studentRefunds[booking.studentId].points += getBookingPoints(booking)
          studentRefunds[booking.studentId].bookings.push(booking)
        }
        const studentIds = Object.keys(studentRefunds)
        const studentRefs = studentIds.map((studentId) => doc(db, 'students', studentId))
        const studentSnaps = await Promise.all(studentRefs.map((studentRef) => tx.get(studentRef)))

        studentSnaps.forEach((studentSnap, index) => {
          if (!studentSnap.exists()) return
          const studentData = { id: studentSnap.id, ...studentSnap.data() } as Student
          const currentHeld = studentData.reservedMinutes ?? studentData.heldMinutes ?? 0
          const refundPoints = Math.min(currentHeld, studentRefunds[studentIds[index]].points)
          const nextHeld = currentHeld - refundPoints
          tx.update(studentRefs[index], {
            reservedMinutes: nextHeld,
            heldMinutes: nextHeld,
            updatedAt: serverTimestamp(),
          })
        })

        // Giữ bản ghi lịch sử để còn đối soát; chỉ chuyển trạng thái và nhả hold.
        for (const booking of bookingsToCancel) {
          tx.update(doc(db, 'bookingRequests', booking.id), {
            status: 'released',
            releasedAt: serverTimestamp(),
            releasedBy: user?.uid ?? 'admin',
            releaseReason: 'batch_cancel_schedule',
          })
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
              requestedRefundPoints: info.points,
            })),
          },
          createdAt: serverTimestamp(),
        })
        return bookingsToCancel.length
      })

      if (cancelledCount === 0) toast.warning('Các ca đã được xử lý trước đó, hệ thống không hoàn trùng kim cương.')
      else toast.success(`Đã hủy thành công ${cancelledCount} ca xếp lớp và hoàn trả kim cương cho học viên.`)
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
        if (isBookingAttended(requestNow)) throw new Error('BOOKING_ALREADY_ATTENDED')
        if (!isBookingCancellable(requestNow)) throw new Error('REQUEST_NOT_CONFIRMED')

        const student = { id: studentSnap.id, ...studentSnap.data() } as Student
        const fund = getStudentMinuteFund(student)
        const points = getBookingPoints(requestNow)
        const nextHeld = Math.max(0, fund.held - points)

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
            releasedPoints: points,
            heldMinutesAfter: nextHeld,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success('Đã nhả giữ chỗ và khôi phục quỹ kim cương thành công')
      setShowDetailModal(false)
      setSelectedBooking(null)
    } catch (error: unknown) {
      console.error('Release booking failed:', error)
      toast.error(error instanceof Error && error.message === 'BOOKING_ALREADY_ATTENDED'
        ? 'Ca đã được giáo viên điểm danh nên không thể hủy lịch.'
        : 'Nhả lịch thất bại')
    } finally {
      setReleasing(false)
    }
  }

  const handleCancelBookingById = async (bookingId: string) => {
    const booking = studentFutureBookings.find(b => b.id === bookingId)
    if (!booking) return
    if (!window.confirm(`Bạn có chắc chắn muốn hủy ca học ngày ${booking.requestedDate} (${booking.requestedStart} - ${booking.requestedEnd}) không? ${getBookingPoints(booking)} kim cương sẽ được hoàn về quỹ khả dụng.`)) return

    try {
      const result = await runTransaction(db, async (tx) => {
        const bookingRef = doc(db, 'bookingRequests', booking.id)
        const studentRef = doc(db, 'students', booking.studentId)
        const [bookingSnap, studentSnap] = await Promise.all([
          tx.get(bookingRef),
          tx.get(studentRef),
        ])
        if (!bookingSnap.exists()) throw new Error('BOOKING_NOT_FOUND')
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

        const currentBooking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
        if (
          currentBooking.studentId !== booking.studentId
          || !['pending', 'confirmed'].includes(currentBooking.status)
          || currentBooking.lessonId
        ) return { cancelled: false, points: 0 }

        const studentData = { id: studentSnap.id, ...studentSnap.data() } as Student
        const currentHeld = studentData.reservedMinutes ?? studentData.heldMinutes ?? 0
        const points = getBookingPoints(currentBooking)
        const nextHeld = Math.max(0, currentHeld - points)

        tx.update(studentRef, {
          reservedMinutes: nextHeld,
          heldMinutes: nextHeld,
          updatedAt: serverTimestamp(),
        })

        tx.update(bookingRef, {
          status: 'released',
          releasedAt: serverTimestamp(),
          releasedBy: user?.uid ?? 'admin',
        })
        return { cancelled: true, points }
      })

      if (!result.cancelled) {
        toast.warning('Ca học đã được xử lý trước đó, hệ thống không hoàn trùng kim cương.')
        setStudentFutureBookings(prev => prev.filter(b => b.id !== bookingId))
        return
      }
      setStudentFutureBookings(prev => prev.filter(b => b.id !== bookingId))
      toast.success(`Hủy ca học thành công và hoàn ${result.points} kim cương.`)
    } catch (err) {
      console.error('Cancel booking failed:', err)
      toast.error('Gặp lỗi khi hủy ca học')
    }
  }

  const handleCancelAllStudentBookings = async () => {
    if (studentFutureBookings.length === 0) return
    const studentName = selectedBooking?.studentName || 'học viên'
    if (!window.confirm(`Bạn có chắc chắn muốn hủy toàn bộ ${studentFutureBookings.length} ca học trong tương lai của học viên ${studentName} không? Toàn bộ kim cương đang giữ của các ca này sẽ được hoàn về quỹ khả dụng.`)) return

    setCancellingAll(true)
    try {
      const studentId = selectedBooking!.studentId

      const result = await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', studentId)
        const bookingRefs = studentFutureBookings.map((booking) => doc(db, 'bookingRequests', booking.id))
        const [studentSnap, ...bookingSnaps] = await Promise.all([
          tx.get(studentRef),
          ...bookingRefs.map((bookingRef) => tx.get(bookingRef)),
        ])
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

        const currentBookings = bookingSnaps
          .filter((bookingSnap) => bookingSnap.exists())
          .map((bookingSnap) => ({ id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest))
          .filter((booking) => (
            booking.studentId === studentId
            && ['pending', 'confirmed'].includes(booking.status)
            && !booking.lessonId
          ))
        const totalPointsToRefund = currentBookings.reduce((sum, booking) => sum + getBookingPoints(booking), 0)
        const studentData = { id: studentSnap.id, ...studentSnap.data() } as Student
        const currentHeld = studentData.reservedMinutes ?? studentData.heldMinutes ?? 0
        const nextHeld = Math.max(0, currentHeld - totalPointsToRefund)

        tx.update(studentRef, {
          reservedMinutes: nextHeld,
          heldMinutes: nextHeld,
          updatedAt: serverTimestamp(),
        })

        for (const booking of currentBookings) {
          tx.update(doc(db, 'bookingRequests', booking.id), {
            status: 'released',
            releasedAt: serverTimestamp(),
            releasedBy: user?.uid ?? 'admin',
          })
        }
        return { count: currentBookings.length, points: totalPointsToRefund }
      })

      setStudentFutureBookings([])
      if (result.count === 0) toast.warning('Các ca đã được xử lý trước đó, hệ thống không hoàn trùng kim cương.')
      else toast.success(`Đã hủy ${result.count} ca học của học viên và hoàn trả ${result.points} kim cương.`)
      setShowDetailModal(false)
      setSelectedBooking(null)
    } catch (err) {
      console.error('Cancel all bookings failed:', err)
      toast.error('Gặp lỗi khi hủy toàn bộ ca học')
    } finally {
      setCancellingAll(false)
    }
  }

  const handleOpenBatchSchedule = (mode: 'regular' | 'makeup') => {
    if (selectedSlots.length === 0) {
      toast.warning('Vui lòng chọn các ô OPEN trên lịch dạy')
      return
    }
    const allPast = selectedSlots.every((slot) => isPastScheduleSlot(slot.dateISO, slot.time))
    const hasPast = selectedSlots.some((slot) => isPastScheduleSlot(slot.dateISO, slot.time))
    if (mode === 'makeup' && !allPast) {
      toast.warning('Xếp lớp học bù chỉ nhận các khung giờ đã qua.')
      return
    }
    setScheduleMode(mode)
    // Restore the original workflow: a past weekday is a template for the next
    // available future week. It must stay recurring so no regular booking can be
    // written into the past; makeup remains a separate explicit action.
    setIsRecurring(mode === 'regular' && hasPast)
    setSelectedStudent(null)
    setStudentSearch('')
    setSelectedSubjectId('')
    setScheduleConflictMessage('')
    setShowScheduleModal(true)
  }

  const clearMultiSelection = () => {
    setSelectedSlots([])
    setSelectedBookingIds([])
  }

  const handleWeekChange = (nextWeekStart: Date) => {
    setWeekStart(nextWeekStart)
    clearMultiSelection()
  }

  return (
    <div className="space-y-4 pt-1 lg:pt-3">
      <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">Xếp lớp trực quan (Booking Schedules)</h1>
              <p className="mt-1 text-sm text-slate-600">Chọn gia sư, kiểm tra ca OPEN và xếp lớp cho học viên trên cùng một màn hình.</p>
            </div>
          </div>
          {selectedTeacher && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
              {selectedTeacher.code || selectedTeacher.releasedNickname || 'Chưa cấp nickname'}
            </div>
          )}
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Sidebar: Teachers List */}
        <aside className="contents">
          <div className="order-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2 sm:p-5">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">Bộ lọc gia sư</h2>
                <p className="mt-0.5 text-xs text-slate-500">Kết hợp hồ sơ, môn dạy và lịch trống để thu hẹp danh sách.</p>
              </div>
              {!loading && (
                <p className="text-xs font-bold text-slate-600">{filteredTeachers.length}/{teachers.length} gia sư phù hợp</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-10">
          <label className="block space-y-1.5 2xl:col-span-2">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Tìm gia sư</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tên hoặc mã gia sư..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />
            </span>
          </label>

          {/* Bộ lọc hồ sơ nâng cao */}
          <div className="contents">
            <div className="hidden">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Bộ lọc hồ sơ</span>
              {(filterGender !== 'all' || filterIelts || filterToeic || filterToefl || filterExp || filterYob || filterCountry || filterSubjectKeys.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterGender('all');
                    setFilterIelts(false);
                    setFilterToeic(false);
                    setFilterToefl(false);
                    setFilterExp(false);
                    setFilterYob('');
                    setFilterCountry('');
                    setFilterSubjectKeys([]);
                    setFilterSubjectMode('any');
                    setSubjectFilterSearch('');
                  }}
                  className="text-xs text-indigo-650 hover:text-indigo-755 font-bold transition"
                >
                  Xóa lọc
                </button>
              )}
            </div>

            <div className="relative space-y-1.5 sm:col-span-2 lg:col-span-2 2xl:col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Môn gia sư dạy
              </p>
              <details className="group relative rounded-xl border border-slate-200 bg-white">
                <summary
                  aria-label="Mở bộ lọc môn gia sư dạy"
                  className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 text-xs font-bold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-400 [&::-webkit-details-marker]:hidden"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <BookOpen className="h-4 w-4 flex-none text-indigo-500" />
                    <span className="truncate">
                      {selectedSubjectFilters.length > 0
                        ? `${selectedSubjectFilters.length} môn đã chọn`
                        : 'Tất cả môn học'}
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 flex-none text-slate-400 transition group-open:rotate-180" />
                </summary>

                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_18px_48px_rgba(15,23,42,0.16)]">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      value={subjectFilterSearch}
                      onChange={(event) => setSubjectFilterSearch(event.target.value)}
                      placeholder="Tìm môn, ví dụ IELTS..."
                      aria-label="Tìm môn gia sư dạy"
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs font-semibold outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </label>

                  {selectedSubjectFilters.length > 1 && (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-1.5">
                      <span className="pl-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Khớp</span>
                      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setFilterSubjectMode('any')}
                          aria-pressed={filterSubjectMode === 'any'}
                          className={`min-h-8 rounded-md px-2 transition ${filterSubjectMode === 'any' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          Ít nhất 1
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterSubjectMode('all')}
                          aria-pressed={filterSubjectMode === 'all'}
                          className={`min-h-8 rounded-md px-2 transition ${filterSubjectMode === 'all' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          Tất cả
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                    {(['language', 'academic'] as VisibleTeacherSubjectGroup[]).map((group) => {
                      const groupOptions = displayedSubjectFilterOptions.filter((option) => option.group === group)
                      if (groupOptions.length === 0) return null

                      return (
                        <div key={group} className="space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {SUBJECT_GROUP_LABELS[group]}
                          </p>
                          {groupOptions.map((option) => {
                            const isSelected = filterSubjectKeys.includes(option.key)
                            return (
                              <button
                                key={option.key}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => toggleSubjectFilter(option.key)}
                                className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-xs font-semibold transition ${
                                  isSelected
                                    ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                                    : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className={`flex h-4 w-4 flex-none items-center justify-center rounded border ${isSelected ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                                    {isSelected && <Check className="h-3 w-3" />}
                                  </span>
                                  <span className="truncate">{option.label}</span>
                                </span>
                                <span className="flex-none rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-500 ring-1 ring-slate-200">
                                  {option.teacherCount}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}

                    {displayedSubjectFilterOptions.length === 0 && (
                      <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-500">
                        Không tìm thấy môn phù hợp
                      </p>
                    )}
                  </div>
                </div>
              </details>

              {selectedSubjectFilters.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSubjectFilters.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => toggleSubjectFilter(option.key)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-indigo-50 px-2 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-100"
                      aria-label={`Bỏ lọc môn ${option.label}`}
                    >
                      <span className="max-w-36 truncate">{option.label}</span>
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 2xl:col-span-2">
              {/* Giới tính */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Giới tính</label>
                <div className="flex h-10 gap-1 rounded-lg bg-slate-100 p-0.5 text-[11px] font-bold text-slate-600">
                  {(['all', 'male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFilterGender(g)}
                      aria-pressed={filterGender === g}
                      className={`flex-1 rounded transition ${
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
                <label htmlFor="booking-filter-yob" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Năm sinh</label>
                <select
                  id="booking-filter-yob"
                  value={filterYob}
                  onChange={(e) => setFilterYob(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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

            <div className="space-y-1 2xl:col-span-1">
              <label htmlFor="booking-filter-country" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Quốc tịch
              </label>
              <div className="relative">
                <Globe2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select
                  id="booking-filter-country"
                  value={filterCountry}
                  onChange={(event) => setFilterCountry(event.target.value)}
                  className="h-10 w-full cursor-pointer rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs font-semibold outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Tất cả quốc gia</option>
                  {uniqueCountries.map((country) => (
                    <option key={country} value={country}>
                      {countryLabel(country)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Checkable Chips */}
            <div className="grid self-start grid-cols-2 items-start gap-1.5 pt-5 sm:col-span-2 lg:col-span-2 2xl:col-span-2">
              {([
                { key: 'ielts', label: 'IELTS Cert', active: filterIelts, toggle: () => setFilterIelts(!filterIelts) },
                { key: 'toeic', label: 'TOEIC Cert', active: filterToeic, toggle: () => setFilterToeic(!filterToeic) },
                { key: 'toefl', label: 'TOEFL Cert', active: filterToefl, toggle: () => setFilterToefl(!filterToefl) },
              ]).map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.toggle}
                  aria-pressed={chip.active}
                  className={`h-10 justify-center rounded-lg border px-2.5 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                    chip.active
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
                  }`}
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span>{chip.label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setFilterExp(!filterExp)}
                aria-pressed={filterExp}
                className={`h-10 justify-center rounded-lg border px-2.5 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                  filterExp
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
                }`}
              >
                <BriefcaseBusiness className="h-3.5 w-3.5" />
                <span>Kinh nghiệm &gt; 1 năm</span>
              </button>
            </div>
          </div>

          <label className="block space-y-1.5 2xl:col-span-1">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Khung giờ</span>
            <select
              value={timeWindow}
              onChange={(event) => setTimeWindow(event.target.value)}
              className="h-10 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              {TIME_WINDOWS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {/* Lọc lịch rảnh */}
          <div className="grid gap-3 border-t border-slate-100 pt-4 sm:col-span-2 lg:col-span-4 lg:grid-cols-4 lg:items-end 2xl:col-span-10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Lọc theo lịch trống</span>
              {(search || filterGender !== 'all' || filterIelts || filterToeic || filterToefl || filterExp || filterYob || filterCountry || filterSubjectKeys.length > 0 || filterDays.length > 0 || timeWindow !== '24h') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setFilterGender('all')
                    setFilterIelts(false)
                    setFilterToeic(false)
                    setFilterToefl(false)
                    setFilterExp(false)
                    setFilterYob('')
                    setFilterCountry('')
                    setFilterSubjectKeys([])
                    setFilterSubjectMode('any')
                    setSubjectFilterSearch('')
                    setFilterDays([])
                    setFilterTime('17:00')
                    setTimeWindow('24h')
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-bold transition"
                >
                  Đặt lại
                </button>
              )}
            </div>

            {/* Days list (Mon-Sun) toggles */}
            <div className="flex flex-wrap gap-1 lg:col-span-2">
              {DAYS.map((day) => {
                const isSelected = filterDays.includes(day)
                const label = day === 'sun' ? 'CN' : `T${DAYS.indexOf(day) + 2}`
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={isSelected}
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
                {availabilityCatalogLoading && (
                  <p className="text-[10px] font-semibold text-indigo-600">Đang tải dữ liệu lịch trống…</p>
                )}
                {availabilityCatalogError && (
                  <p className="text-[10px] font-semibold text-amber-600">Chưa áp dụng bộ lọc; danh sách vẫn hiển thị đầy đủ.</p>
                )}
              </div>
            )}
          </div>

            </div>
          </div>

          <div className="order-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:col-start-2 xl:row-start-2">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Danh sách gia sư</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {loading ? 'Đang tải dữ liệu...' : `${filteredTeachers.length}/${teachers.length} gia sư phù hợp`}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {selectedTeacher && !filteredTeachers.some((teacher) => teacher.id === selectedTeacher.id) && (
                <span className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">Ngoài bộ lọc</span>
              )}
              <select
                value={teacherListSort}
                onChange={(event) => setTeacherListSort(event.target.value as 'name' | 'minutes_desc' | 'minutes_asc')}
                className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                aria-label="Sắp xếp danh sách gia sư theo số phút đã dạy"
              >
                <option value="minutes_desc">Dạy nhiều nhất</option>
                <option value="minutes_asc">Dạy ít nhất</option>
                <option value="name">Nickname A-Z</option>
              </select>
            </div>
          </div>

          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1 xl:max-h-[calc(100vh-13rem)]">
            {loading ? (
              <div className="rounded-xl bg-slate-100 p-4 text-sm font-semibold text-slate-500">Đang tải...</div>
            ) : filteredTeachers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
                <p className="text-sm font-bold text-slate-700">Không có gia sư phù hợp</p>
                <p className="mt-1 text-xs text-slate-500">Thử bỏ bớt môn hoặc điều kiện lịch trống.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setFilterGender('all')
                    setFilterIelts(false)
                    setFilterExp(false)
                    setFilterYob('')
                    setFilterCountry('')
                    setFilterSubjectKeys([])
                    setFilterSubjectMode('any')
                    setSubjectFilterSearch('')
                    setFilterDays([])
                    setFilterTime('17:00')
                    setTimeWindow('24h')
                  }}
                  className="mt-3 min-h-10 rounded-lg bg-white px-3 text-xs font-bold text-indigo-700 ring-1 ring-slate-200 transition hover:bg-indigo-50"
                >
                  Xóa tất cả bộ lọc
                </button>
              </div>
            ) : displayedTeachers.map((teacher) => {
              const nickname = teacher.code || teacher.releasedNickname || 'Chưa cấp nickname'
              const approvedMinutes = getTeacherApprovedMinutes(teacher)

              return (
                <div
                  key={teacher.id}
                  data-teacher-id={teacher.id}
                  className={`flex w-full items-center gap-2 rounded-xl border p-2 text-left transition ${
                    selectedTeacherId === teacher.id
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50'
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={selectedTeacherId === teacher.id}
                    onClick={() => {
                      setSelectedTeacherId(teacher.id)
                      clearMultiSelection()
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    {teacher.photoURL ? (
                      <img src={teacher.photoURL} alt={nickname} className="h-11 w-11 flex-none rounded-xl object-cover" />
                    ) : (
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-indigo-50 text-sm font-black text-indigo-700">
                        {nickname.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-slate-900">{nickname}</span>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                        <Globe2 className="h-3 w-3 flex-none" />
                        {teacher.country ? countryLabel(teacher.country.trim().toUpperCase()) : 'Chưa cập nhật quốc gia'}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-bold text-violet-700">
                        {approvedMinutes.toLocaleString('vi-VN')} phút đã dạy
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileTeacher(teacher)}
                    className="min-h-10 flex-none rounded-lg border border-indigo-200 bg-white px-2.5 text-[11px] font-extrabold text-indigo-700 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    aria-label={`Xem profile ${nickname}`}
                  >
                    Profile
                  </button>
                </div>
              )
            })}
          </div>
          </div>
        </aside>

        {/* Main Content: Weekly Booking Calendar */}
        <section className="order-3 min-w-0 space-y-4 xl:order-2 xl:col-start-1 xl:row-start-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              {/* Multi-select toggle button */}
              <button
                type="button"
                aria-pressed={multiSelectMode}
                onClick={() => {
                  const nextMode = !multiSelectMode
                  setMultiSelectMode(nextMode)
                  clearMultiSelection()
                }}
                className={`h-10 px-4 rounded-lg text-sm font-bold transition flex items-center gap-1.5 border ${
                  multiSelectMode
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Xếp lịch nhiều ca
                {multiSelectMode && (selectedSlots.length > 0 || selectedBookingIds.length > 0) && (
                  <span aria-live="polite" className="bg-white text-indigo-700 text-xs px-2 py-0.5 rounded-full font-black">
                    {selectedSlots.length + selectedBookingIds.length}
                  </span>
                )}
              </button>

              {/* Batch Action button */}
              {multiSelectMode && selectedSlots.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpenBatchSchedule('regular')}
                    title={selectedSlotsArePast ? 'Dùng các ca đã chọn làm mẫu và rải lịch từ tuần kế tiếp' : undefined}
                    className="hidden h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white shadow-md transition hover:bg-emerald-700 lg:flex"
                  >
                    Xếp lớp nhanh ({selectedSlots.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenBatchSchedule('makeup')}
                    disabled={!selectedSlotsArePast}
                    title={!selectedSlotsArePast ? 'Chọn ca trong quá khứ để xếp lịch bù' : undefined}
                    className="hidden h-10 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-5 text-sm font-bold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none lg:flex"
                  >
                    <History className="h-4 w-4" />
                    Xếp lớp học bù ({selectedSlots.length})
                  </button>
                </>
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
              <Button variant="outline" size="sm" onClick={() => handleWeekChange(getMonday(addDays(weekStart, -7)))}>
                Tuần trước
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleWeekChange(getMonday(new Date()))}>
                Tuần này
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleWeekChange(getMonday(addDays(weekStart, 7)))}>
                Tuần sau
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-1 text-[11px] font-bold text-slate-600" aria-label="Chú thích trạng thái lịch">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Đã xếp · chưa điểm danh
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Đã điểm danh · khóa hủy
            </span>
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
                      onClick={() => handleWeekChange(getMonday(addDays(weekStart, -7)))}
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
                      onClick={() => handleWeekChange(getMonday(addDays(weekStart, 7)))}
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
                              const attended = isBookingAttended(booking)
                              const isBookingSelected = !attended && selectedBookingIds.includes(booking.id)
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleCellClick(day, iso, start)}
                                  title={attended ? 'Đã điểm danh — không thể hủy lịch' : 'Đã xếp lớp — bấm để xem chi tiết'}
                                  className={`w-full py-1.5 px-0.5 rounded-xl border transition shadow-sm text-center block ${
                                    isBookingSelected
                                      ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-500 text-rose-900'
                                      : attended
                                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200/60'
                                        : 'bg-amber-100/90 hover:bg-amber-200/90 text-amber-900 border-amber-200/50'
                                  }`}
                                >
                                  <div className="font-extrabold text-[11px] truncate tracking-tight flex items-center justify-center gap-0.5">
                                    {attended && <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-emerald-500" />}
                                    <span>{booking.studentCode}</span>
                                    {isBookingSelected && <span className="text-[8px] bg-rose-500 text-white px-1.5 py-0.5 rounded font-black leading-none flex-shrink-0">HỦY</span>}
                                  </div>
                                  <div className={`text-[9px] font-bold truncate leading-tight mt-0.5 max-w-full px-1 block ${attended ? 'text-emerald-700/80' : 'text-amber-800/80'}`} title={booking.studentName}>
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

      {multiSelectMode && selectedSlots.length > 0 && (
        <section
          className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-[45] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_16px_38px_-14px_rgba(15,23,42,0.45)] backdrop-blur lg:hidden"
          aria-label="Thao tác xếp lịch đã chọn"
          aria-live="polite"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-slate-900">Đã chọn {selectedSlots.length} ca</p>
              <p className="truncate text-[11px] font-semibold text-slate-500">
                {selectedSlotsArePast
                  ? 'Chọn rải lịch từ tuần sau hoặc tạo lớp học bù.'
                  : 'Các ca tương lai đã sẵn sàng để xếp lớp.'}
              </p>
            </div>
            <button
              type="button"
              onClick={clearMultiSelection}
              className="flex h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
              Bỏ chọn
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleOpenBatchSchedule('regular')}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99]"
            >
              <CalendarClock className="h-4 w-4" />
              Xếp lớp nhanh ({selectedSlots.length})
            </button>
            <button
              type="button"
              onClick={() => handleOpenBatchSchedule('makeup')}
              disabled={!selectedSlotsArePast}
              title={!selectedSlotsArePast ? 'Chỉ dùng cho các ca đã qua' : undefined}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-extrabold text-amber-900 shadow-sm transition hover:bg-amber-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
            >
              <History className="h-4 w-4" />
              Xếp lớp học bù ({selectedSlots.length})
            </button>
          </div>
        </section>
      )}

      {profileTeacher && (
        <Modal open size="xl" onClose={() => setProfileTeacher(null)} title="Profile gia sư">
          <TeacherProfileDetails
            teacher={profileTeacher}
            subjects={subjects}
            totalApprovedMinutes={getTeacherApprovedMinutes(profileTeacher)}
          />
        </Modal>
      )}

      {/* MODAL 1: Schedule/Assign Class Modal */}
      {showScheduleModal && (
        <Modal
          open
          onClose={() => setShowScheduleModal(false)}
          title={scheduleMode === 'makeup'
            ? `Xếp lịch bù${selectedSlots.length > 1 ? ` cho ${selectedSlots.length} ca` : ''}`
            : selectedSlots.length > 1
            ? `Xếp lớp nhanh cho ${selectedSlots.length} ca học`
            : 'Xếp lớp cho học viên'}
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowScheduleModal(false)}>Hủy</Button>
              <Button variant="primary" loading={scheduling} onClick={executeScheduling} disabled={!selectedStudent || !selectedSubjectId}>
                {scheduleMode === 'makeup' ? 'Xác nhận xếp lịch bù' : 'Xác nhận xếp lớp'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {scheduleMode === 'makeup' && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950" role="status">
                <History className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <p className="text-sm font-black">Đang xếp lịch bù trong quá khứ</p>
                  <p className="mt-0.5 text-xs leading-5 text-amber-800">Ca học vẫn kiểm tra trùng lịch, giữ kim cương và xuất hiện trong Lịch dạy để gia sư điểm danh.</p>
                </div>
              </div>
            )}
            {scheduleConflictMessage && (
              <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800" role="alert" aria-live="assertive">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                <div>
                  <p className="text-sm font-black">Lịch học đang bị trùng</p>
                  <p className="mt-0.5 text-xs leading-5 text-rose-700">{scheduleConflictMessage}</p>
                  <p className="mt-1 text-xs font-semibold text-rose-700">Hệ thống chưa tạo ca học nào. Hãy đóng hộp này và chọn khung giờ khác.</p>
                </div>
              </div>
            )}
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
                  const bookedPointsForSubject = selectedStudentBookings
                    .filter((b) => b.subjectId === selectedSubjectId && !b.lessonId)
                    .reduce((sum, b) => sum + getBookingPoints(b), 0)
                  const availableForSubject = activeSubPkg ? Math.max(0, activeSubPkg.remainingMinutes - bookedPointsForSubject) : 0

                  // Kim cương phải tính theo đơn giá của chính gia sư đang xếp lịch
                  // (gia sư khác nhau có thể tốn số kim cương khác nhau cho cùng 1 buổi).
                  const selectedRate = getTeacherPointsPer25Minutes(selectedTeacher)
                  const pointsForOneLesson = calculateLessonPoints(duration, selectedRate)
                  const requiredPoints = selectedSlots.length * pointsForOneLesson
                  const totalDurationMinutes = selectedSlots.length * duration
                  const isEnough = availableForSubject >= requiredPoints
                  const subjectFutureBookings = selectedStudentBookings
                    .filter((b) => b.subjectId === selectedSubjectId && !b.lessonId)
                    .sort((a, b) => (a.requestedDate || '').localeCompare(b.requestedDate || ''))

                  return (
                    <div className="text-xs border-t border-slate-200/50 pt-2 space-y-2">
                      {/* Admin xem đủ 3 đơn vị: buổi / kim cương / phút.
                          (Học viên nhìn theo kim cương, gia sư check-in theo phút.) */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Khả dụng</p>
                          <p className={`mt-0.5 font-bold ${isEnough ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {pointsForOneLesson > 0 ? Math.floor(availableForSubject / pointsForOneLesson) : 0} buổi
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-sky-600">
                            <DiamondPointsIcon className="h-3 w-3" />{availableForSubject} kim cương
                          </p>
                          <p className="text-[11px] font-semibold text-slate-500">Giá gia sư: {selectedRate} kim cương / 25 phút</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Yêu cầu</p>
                          <p className="mt-0.5 font-bold text-slate-800">
                            {selectedSlots.length} buổi
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-sky-600">
                            <DiamondPointsIcon className="h-3 w-3" />{requiredPoints} kim cương
                          </p>
                          <p className="text-[11px] font-semibold text-slate-500">{totalDurationMinutes} phút học</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                      {!isEnough && (
                        <div className="w-full space-y-1 mt-1 bg-rose-50 p-2.5 rounded-lg border border-rose-100 text-rose-500 font-medium">
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Học viên không đủ kim cương khả dụng để xếp lịch!</span>
                          </div>
                          {bookedPointsForSubject > 0 && (
                            <>
                              <p className="text-[10px] pl-5 leading-normal font-semibold opacity-90">
                                * Đã có {bookedPointsForSubject} kim cương đang được giữ cho {subjectFutureBookings.length} ca tương lai. Vui lòng hủy các ca này hoặc nạp thêm kim cương.
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
                        const bookedPointsForSub = selectedStudentBookings
                          .filter((b) => b.subjectId === sub.subjectId && !b.lessonId)
                          .reduce((sum, b) => sum + getBookingPoints(b), 0)
                        const availablePoints = Math.max(0, sub.remainingMinutes - bookedPointsForSub)
                        const pointsForOneLesson = calculateLessonPoints(duration, getTeacherPointsPer25Minutes(selectedTeacher))
                        const availSessions = pointsForOneLesson > 0 ? Math.floor(availablePoints / pointsForOneLesson) : 0
                        const bookedSessions = selectedStudentBookings.filter((b) => b.subjectId === sub.subjectId && !b.lessonId).length
                        return (
                          <option key={sub.subjectId} value={sub.subjectId}>
                            {sub.subjectName} (Còn {availSessions} buổi / {availablePoints} kim cương - Đã đặt {bookedSessions} buổi)
                          </option>
                        )
                      })}
                    </select>
                  )}
                </div>
              </div>
            )}



            {/* Recurring schedule switch */}
            {selectedStudent && scheduleMode === 'regular' && (
              <div className="rounded-xl border border-indigo-100 bg-slate-50 p-4 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    disabled={selectedSlotsContainPast}
                    className="h-4.5 w-4.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">
                      {selectedSlotsContainPast
                        ? 'Rải lịch từ tuần kế tiếp (bắt buộc với ca mẫu đã qua)'
                        : 'Lặp lại lịch hàng tuần (Xếp lịch định kỳ)'}
                    </span>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      {selectedSlotsContainPast
                        ? 'Hệ thống giữ đúng thứ và giờ đã chọn, tự bỏ qua mọi ngày đã qua rồi bắt đầu ở tuần gần nhất còn hợp lệ.'
                        : 'Hệ thống sẽ tự động xếp ca này định kỳ các tuần tiếp theo cho đến khi học viên hết số phút học.'}
                    </span>
                  </div>
                </label>

                {isRecurring && (() => {
                  // Estimate based on the selected subject package (same rule as the scheduling transaction)
                  const pkg = selectedStudent.subjects?.find(s => s.subjectId === selectedSubjectId)
                  const bookedForSubject = selectedStudentBookings
                    .filter((b) => b.subjectId === selectedSubjectId && !b.lessonId)
                    .reduce((sum, b) => sum + getBookingPoints(b), 0)
                  const availableForSubject = pkg ? Math.max(0, (pkg.remainingMinutes || 0) - bookedForSubject) : 0
                  const pointsForOneLesson = calculateLessonPoints(duration, getTeacherPointsPer25Minutes(selectedTeacher))
                  const maxSessions = pointsForOneLesson > 0 ? Math.floor(availableForSubject / pointsForOneLesson) : 0
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
              {isBookingCancellable(selectedBooking) ? (
                <Button variant="danger" loading={releasing} onClick={handleReleaseBooking}>
                  <Trash2 className="w-4 h-4" />
                  Hủy xếp lớp (Nhả lịch)
                </Button>
              ) : isBookingAttended(selectedBooking) ? (
                <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Đã điểm danh — không thể hủy lịch
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                  Ca không còn hiệu lực — không thể hủy
                </div>
              )}
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
            <div className={`rounded-xl border p-4 space-y-2 ${isBookingAttended(selectedBooking) ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-100 bg-amber-50/50'}`}>
              <p className={`text-xs font-semibold uppercase ${isBookingAttended(selectedBooking) ? 'text-emerald-700' : 'text-amber-700'}`}>Thông tin ca dạy</p>
              <p className="text-sm font-bold text-slate-800">
                Thứ {selectedBooking.requestedDay === 'sun' ? 'Nhật' : selectedBooking.requestedDay === 'mon' ? '2' : selectedBooking.requestedDay === 'tue' ? '3' : selectedBooking.requestedDay === 'wed' ? '4' : selectedBooking.requestedDay === 'thu' ? '5' : selectedBooking.requestedDay === 'fri' ? '6' : '7'}
                {` (${selectedBooking.requestedDate})`} · Từ {selectedBooking.requestedStart} đến {selectedBooking.requestedEnd} ({selectedBooking.requestedMinutes} phút)
              </p>
              <p className="text-xs text-slate-500 font-semibold">Gia sư: {selectedBooking.teacherName} ({selectedBooking.teacherCode})</p>
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
                  <span className={`px-2 py-0.5 rounded-full font-bold ${isBookingAttended(selectedBooking) ? 'bg-emerald-100 text-emerald-800' : isBookingCancellable(selectedBooking) ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                    {isBookingAttended(selectedBooking) ? 'Đã điểm danh' : isBookingCancellable(selectedBooking) ? 'Đã xếp lớp' : 'Không còn hiệu lực'}
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
              Bạn có chắc chắn muốn hủy <span className="font-black text-rose-600">{selectedBookingIds.length}</span> ca học đã xếp của gia sư này?
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
