import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where, onSnapshot, addDoc } from 'firebase/firestore'
import { CalendarClock, ChevronLeft, ChevronRight, Clock, User, BookOpen, Link, CheckCircle2, AlertTriangle, ExternalLink, Image, Upload, X, Trash2, PenSquare } from 'lucide-react'
import { db } from '@/lib/firebase'
import { BookingRequest, DayAvailability, DayOfWeek, TeacherAvailability, TimeRange, Student, Subject, Lesson, Teacher } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { Modal } from '@/components/ui/Modal'
import { getToday } from '@/lib/constants'
import { convertVnDateTimeToTeacher, translateVnSlotsToTeacher } from '@/lib/timezoneUtils'
import { uploadLessonImage } from '@/lib/imageUploader'
import { useLanguageStore } from '@/stores/languageStore'
import { LessonReportForm } from '@/components/lessons/LessonReportForm'
import {
  LessonReportDraft, emptyLessonReport,
  validateLessonReport, composeLessonComment, lessonReportFields,
} from '@/components/lessons/lessonReport'

const isAttendanceAllowed = (booking: BookingRequest) => {
  if (!booking.requestedDate || !booking.requestedEnd) return false
  const [year, month, day] = booking.requestedDate.split('-').map(Number)
  const [hours, minutes] = booking.requestedEnd.split(':').map(Number)
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes)
  const vnTimeMs = utcMs - 7 * 60 * 60 * 1000 // Convert Vietnam (GMT+7) local to UTC time
  const allowedTimeMs = vnTimeMs + 5 * 60 * 1000 // 5 minutes after class ends
  return new Date().getTime() >= allowedTimeMs
}

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

interface ImageUpload {
  url: string
  storageURL: string
  uploading: boolean
}

export function BookingSchedulesPage() {
  const { teacherId } = useAuthStore()
  const { lang, t } = useLanguageStore()
  const [availability, setAvailability] = useState<TeacherAvailability | null>(null)
  const [slots, setSlots] = useState<Record<DayOfWeek, DayAvailability>>(emptySlots())
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [timeWindow, setTimeWindow] = useState<string>('24h')

  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([])
  const [students, setStudents] = useState<Record<string, Student>>({})
  const [loading, setLoading] = useState(true)
  const [teacher, setTeacher] = useState<Teacher | null>(null)

  // Modals
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showAttendanceModal, setShowAttendanceModal] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null)

  // Attendance Form States
  const [attendanceStatus, setAttendanceStatus] = useState<'present' | 'with_permission' | 'without_permission'>('present')
  const [book, setBook] = useState('')
  const [report, setReport] = useState<LessonReportDraft>(emptyLessonReport())
  const [images, setImages] = useState<ImageUpload[]>([])
  const [submittingAttendance, setSubmittingAttendance] = useState(false)

  const weekStartISO = formatDateISO(weekStart)
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const visibleStarts = useMemo(() => getVisibleStarts(timeWindow), [timeWindow])

  // Load teacher profile for timezone settings
  useEffect(() => {
    if (!teacherId) return
    getDoc(doc(db, 'teachers', teacherId)).then((snap) => {
      if (snap.exists()) {
        setTeacher({ id: snap.id, ...snap.data() } as Teacher)
      }
    }).catch(err => console.error('Error loading teacher profile:', err))
  }, [teacherId])

  // Load teacher availability
  useEffect(() => {
    const currentTeacherId = teacherId
    if (!currentTeacherId) {
      setLoading(false)
      return
    }

    async function loadAvailability(tId: string) {
      setLoading(true)
      try {
        const snap = await getDoc(doc(db, 'teacherAvailability', tId))
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as TeacherAvailability
          setAvailability(data)
        }
      } catch (error) {
        console.error('Error loading availability:', error)
      } finally {
        setLoading(false)
      }
    }

    loadAvailability(currentTeacherId)
  }, [teacherId])

  // Update slots state when availability or teacher timezone changes
  useEffect(() => {
    if (!availability) return
    const offset = teacher?.timezoneOffset ?? 7
    const weekOverride = availability.weekOverrides?.[weekStartISO]
    setSlots(translateVnSlotsToTeacher(weekOverride?.slots || availability.slots, offset))
  }, [availability, teacher, weekStartISO])

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
        originalVnDate: req.requestedDate,
        originalVnStart: req.requestedStart,
        originalVnEnd: req.requestedEnd,
        requestedDate: localStart.dateISO,
        requestedStart: localStart.timeStr,
        requestedEnd: localEnd.timeStr,
        requestedDay: localDay,
      }
    })
  }, [bookingRequests, teacher?.timezoneOffset])

  const [pendingAttendanceBookings, setPendingAttendanceBookings] = useState<BookingRequest[]>([])

  // Load pending attendance bookings in real-time
  useEffect(() => {
    if (!teacherId) return

    const q = query(
      collection(db, 'bookingRequests'),
      where('teacherId', '==', teacherId),
      where('status', '==', 'confirmed')
    )

    const unsub = onSnapshot(q, (snap) => {
      const todayStr = getToday()
      const list = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BookingRequest))
        .filter((b) => !b.lessonId && (b.requestedDate || '') <= todayStr && isAttendanceAllowed(b))
      
      // Sort oldest first
      list.sort((a, b) => {
        if (a.requestedDate !== b.requestedDate) {
          return (a.requestedDate || '').localeCompare(b.requestedDate || '')
        }
        return (a.requestedStart || '').localeCompare(b.requestedStart || '')
      })

      setPendingAttendanceBookings(list)

      // Fetch student details if needed
      const studentIdsToFetch = Array.from(new Set(list.map(b => b.studentId)))
      if (studentIdsToFetch.length > 0) {
        Promise.all(studentIdsToFetch.map(id => getDoc(doc(db, 'students', id)))).then(snaps => {
          setStudents(prev => {
            const next = { ...prev }
            snaps.forEach(s => {
              if (s.exists()) {
                next[s.id] = { id: s.id, ...s.data() } as Student
              }
            })
            return next
          })
        })
      }
    }, (error) => {
      console.error('Error loading pending attendance bookings:', error)
    })

    return unsub
  }, [teacherId])

  // Load booked booking requests in real-time
  useEffect(() => {
    if (!teacherId) return

    const q = query(
      collection(db, 'bookingRequests'),
      where('teacherId', '==', teacherId),
      where('requestedWeekStart', '==', weekStartISO)
    )

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BookingRequest))
      setBookingRequests(list)

      // Fetch student details if needed
      const studentIdsToFetch = Array.from(new Set(list.map(b => b.studentId))).filter(id => !students[id])
      if (studentIdsToFetch.length > 0) {
        Promise.all(studentIdsToFetch.map(id => getDoc(doc(db, 'students', id)))).then(snaps => {
          setStudents(prev => {
            const next = { ...prev }
            snaps.forEach(s => {
              if (s.exists()) {
                next[s.id] = { id: s.id, ...s.data() } as Student
              }
            })
            return next
          })
        })
      }
    }, (error) => {
      console.error('Error loading booking requests:', error)
    })

    return unsub
  }, [teacherId, weekStartISO])

  const isCellOpen = (day: DayOfWeek, start: string) => {
    const startMinute = timeToMinutes(start)
    const endMinute = startMinute + 25
    return slots[day].timeRanges.some((range) => rangeCovers(range, startMinute, endMinute))
  }

  const findBookingForCell = (dateISO: string, time: string) => {
    const cellStart = timeToMinutes(time)
    const cellEnd = cellStart + 30
    return localBookings.find((req) => {
      if (req.requestedDate !== dateISO) return false
      if (req.status !== 'confirmed' && req.status !== 'pending') return false

      const reqStart = timeToMinutes(req.requestedStart)
      const reqEnd = timeToMinutes(req.requestedEnd)

      return Math.max(cellStart, reqStart) < Math.min(cellEnd, reqEnd)
    })
  }

  const handleCellClick = (booking: BookingRequest) => {
    setSelectedBooking(booking)
    setShowDetailModal(true)
    
    // Instantly refetch the student details to guarantee the latest curriculumLink
    getDoc(doc(db, 'students', booking.studentId)).then((sSnap) => {
      if (sSnap.exists()) {
        setStudents((prev) => ({
          ...prev,
          [sSnap.id]: { id: sSnap.id, ...sSnap.data() } as Student,
        }))
      }
    }).catch((err) => {
      console.error('Error updating student on click:', err)
    })
  }

  // Handle Attendance status triggers (prefilling books/minutes)
  const handleAttendanceStatusSelect = (status: 'present' | 'with_permission' | 'without_permission') => {
    setAttendanceStatus(status)
    if (status === 'present') {
      setBook('')
    } else if (status === 'with_permission') {
      setBook('Học viên vắng')
    } else if (status === 'without_permission') {
      setBook('Học viên vắng')
    }
  }

  // Handle image selections and background Firebase Storage upload
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (images.length + files.length > 20) {
      toast.warning('Tối đa 20 hình ảnh minh chứng')
      return
    }

    if (!teacherId) return

    for (const file of files) {
      const localPreviewUrl = URL.createObjectURL(file)
      
      // Thêm ảnh vào state dạng đang tải lên (loading)
      setImages((prev) => [...prev, { url: localPreviewUrl, storageURL: '', uploading: true }])

      // Upload ngầm lên Firebase Storage
      uploadLessonImage(teacherId, file).then((downloadURL) => {
        setImages((prev) =>
          prev.map((item) =>
            item.url === localPreviewUrl ? { ...item, storageURL: downloadURL, uploading: false } : item
          )
        )
      }).catch((err) => {
        console.error(err)
        toast.error('Không thể upload ảnh, vui lòng thử lại')
        setImages((prev) => prev.filter((item) => item.url !== localPreviewUrl))
      })
    }
  }

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  // Submit attendance from calendar booking slot
  const submitAttendance = async () => {
    if (!selectedBooking || !teacherId) return
    const isPresent = attendanceStatus === 'present'
    const bookTitle = isPresent ? book.trim() : 'Học viên vắng'

    if (isPresent && !bookTitle) {
      toast.warning('Vui lòng nhập sách học/tài liệu buổi dạy')
      return
    }

    // Word count validation (< 20 words)
    if (isPresent) {
      const words = bookTitle.split(/\s+/).filter(Boolean).length
      if (words > 20) {
        toast.warning('Tên sách học không được vượt quá 20 từ!')
        return
      }
      // Báo cáo chi tiết bắt buộc khi học viên có mặt
      const errKey = validateLessonReport(report)
      if (errKey) {
        toast.warning(t(errKey))
        return
      }
    }

    setSubmittingAttendance(true)
    try {
      const studentId = selectedBooking.studentId
      const minutes = attendanceStatus === 'present'
        ? selectedBooking.requestedMinutes
        : (attendanceStatus === 'without_permission' ? 25 : 0)

      await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', studentId)
        const bookingRef = doc(db, 'bookingRequests', selectedBooking.id)
        const teacherRef = doc(db, 'teachers', teacherId)

        const [studentSnap, teacherSnap] = await Promise.all([
          tx.get(studentRef),
          tx.get(teacherRef),
        ])

        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')
        const studentData = { id: studentSnap.id, ...studentSnap.data() } as Student
        const teacherData = teacherSnap.data()!

        // Load pricing snapshot from subject or student subject rates
        let pricePerMinute = 0
        const teacherCountry = teacherData?.country || 'VN'
        const activeSub = studentData.subjects?.find(s => s.subjectId === selectedBooking.subjectId)
        if (activeSub) {
          if (activeSub.countryPrices) {
            const rateObj = activeSub.countryPrices[teacherCountry] || activeSub.countryPrices['VN']
            pricePerMinute = rateObj?.price || activeSub.pricePerMinute || 0
          } else if (activeSub.otherCountriesPrices && activeSub.otherCountriesPrices[teacherCountry] !== undefined) {
            pricePerMinute = activeSub.otherCountriesPrices[teacherCountry]
          } else if (teacherCountry === 'VN') {
            pricePerMinute = activeSub.pricePerMinuteVN || activeSub.pricePerMinute || 0
          } else if (teacherCountry === 'PH') {
            pricePerMinute = activeSub.pricePerMinutePH || activeSub.pricePerMinute || 0
          } else {
            pricePerMinute = activeSub.pricePerMinuteNative || activeSub.pricePerMinute || 0
          }
        } else {
          // fallback to main subject price
          const subSnap = await getDoc(doc(db, 'subjects', selectedBooking.subjectId || ''))
          if (subSnap.exists()) {
            const subData = subSnap.data()
            if (subData.countryPrices) {
              const rateObj = subData.countryPrices[teacherCountry] || subData.countryPrices['VN']
              pricePerMinute = rateObj?.price || subData.pricePerMinute || 0
            } else if (subData.otherCountriesPrices && subData.otherCountriesPrices[teacherCountry] !== undefined) {
              pricePerMinute = subData.otherCountriesPrices[teacherCountry]
            } else if (teacherCountry === 'VN') {
              pricePerMinute = subData.pricePerMinuteVN || subData.pricePerMinute || 0
            } else if (teacherCountry === 'PH') {
              pricePerMinute = subData.pricePerMinutePH || subData.pricePerMinute || 0
            } else {
              pricePerMinute = subData.pricePerMinuteNative || subData.pricePerMinute || 0
            }
          }
        }

        const mps = studentData.minutesPerSession || 50
        const currentRemainingMinutes = studentData.remainingMinutes ?? (studentData.remainingSessions * mps)

        // 1. Create lesson document
        const lessonRef = doc(collection(db, 'lessons'))
        tx.set(lessonRef, {
          studentId: studentData.id,
          studentCode: studentData.code,
          studentName: studentData.name,
          teacherId,
          teacherCode: teacherData.code,
          teacherName: teacherData.name,
          subjectId: selectedBooking.subjectId || '',
          subjectName: selectedBooking.subjectName || '',
          date: selectedBooking.requestedDate || getToday(),
          minutes,
          // Ghép báo cáo có cấu trúc thành `comment` cho các màn hình cũ;
          // bản có cấu trúc (pages/report/rating) lưu kèm bên dưới.
          comment: isPresent ? composeLessonComment(report) : '',
          homework: isPresent ? report.homework.trim() : '',
          book: bookTitle,
          ...(isPresent
            ? lessonReportFields(report)
            : { pages: '', report: null, rating: null }),
          imageURLs: images.map((i) => i.storageURL).filter(Boolean),
          attendanceStatus,
          status: 'pending',
          sessionsBeforeApproval: studentData.remainingSessions,
          sessionsAfterApproval: studentData.remainingSessions,
          minutesBeforeApproval: currentRemainingMinutes,
          minutesAfterApproval: currentRemainingMinutes,
          teacherLevel: teacherData.level ?? 1,
          pricePerMinute,
          salary: 0,
          bookingRequestId: selectedBooking.id,
          createdAt: serverTimestamp(),
        })

        // 2. Link lessonId directly to booking request
        tx.update(bookingRef, {
          lessonId: lessonRef.id,
        })
      })

      toast.success('Gửi báo cáo điểm danh thành công!')
      setShowAttendanceModal(false)
      setShowDetailModal(false)
      setSelectedBooking(null)

      // Reset form
      setBook('')
      setReport(emptyLessonReport())
      setImages([])
      setAttendanceStatus('present')
    } catch (error) {
      console.error('Submit calendar attendance failed:', error)
      toast.error(t('attendance.submit_fail'))
    } finally {
      setSubmittingAttendance(false)
    }
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="rounded-3xl bg-gradient-to-r from-[#3BB8EB] to-[#2196F3] p-6 text-white shadow-lg shadow-sky-200/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <CalendarClock className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black">{t('sched.title')}</h1>
              <p className="mt-1 text-sm text-sky-100">{t('sched.subtitle')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and navigation controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <select
            value={timeWindow}
            onChange={(e) => setTimeWindow(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold outline-none focus:border-sky-400 min-w-[140px] appearance-none pr-8 cursor-pointer"
          >
            {TIME_WINDOWS.map((item) => (
              <option key={item.key} value={item.key}>
                {t('sched.shift')}: {item.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">▼</div>
        </div>

        {/* Quick week controls */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(addDays(weekStart, -7)))}>
            {t('sched.prev_week')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(new Date()))}>
            {t('sched.this_week')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(addDays(weekStart, 7)))}>
            {t('sched.next_week')}
          </Button>
        </div>
      </div>


      {/* Grid schedule table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="py-20 text-center font-bold text-slate-500 text-sm">{t('sched.loading')}</div>
        ) : (
          <table className="w-full min-w-[750px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="p-2 text-center border-r border-slate-200 w-24">
                  <button
                    type="button"
                    onClick={() => setWeekStart(getMonday(addDays(weekStart, -7)))}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition"
                  >
                    <ChevronLeft className="h-4 w-4 mx-auto" />
                  </button>
                </th>
                {weekDates.map(({ day, date }) => (
                  <th key={day} className="p-3 text-center border-r border-slate-200 font-semibold text-slate-700 w-[12%] max-w-[12%] min-w-[90px]">
                    <div className="text-sm font-black text-slate-800">{formatShortHeaderDate(date)}</div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">{lang === 'en' ? DAY_LABELS_EN[day] : DAY_LABELS[day]}</div>
                  </th>
                ))}
                <th className="p-2 text-center w-12">
                  <button
                    type="button"
                    onClick={() => setWeekStart(getMonday(addDays(weekStart, 7)))}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition"
                  >
                    <ChevronRight className="h-4 w-4 mx-auto" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visibleStarts.map((start) => (
                <tr key={start} className="hover:bg-slate-50/20 transition">
                  <td className="p-2 border-r border-slate-200 font-bold text-xs text-slate-500 text-center select-none bg-slate-50/50">
                    {start}
                  </td>
                  {weekDates.map(({ day, iso }) => {
                    const open = isCellOpen(day, start)
                    const booking = findBookingForCell(iso, start)

                    return (
                      <td key={day} className="p-1.5 border-r border-slate-200 align-middle text-center min-h-[52px]">
                        {booking ? (
                          <button
                            type="button"
                            onClick={() => handleCellClick(booking)}
                            className={`w-full py-1.5 px-0.5 rounded-xl text-center block transition shadow-sm ${
                              booking.lessonId
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/50'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/50'
                            }`}
                          >
                            <div className="font-extrabold text-[11px] truncate tracking-tight flex items-center justify-center gap-0.5">
                              {booking.lessonId && <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                              <span>{booking.studentCode}</span>
                            </div>
                            <div className={`text-[9px] font-bold truncate leading-tight mt-0.5 max-w-full px-1 block ${
                              booking.lessonId ? 'text-emerald-700/80' : 'text-amber-800/80'
                            }`} title={booking.studentName}>
                              {booking.studentName}
                            </div>
                          </button>
                        ) : open ? (
                          <span className="inline-flex py-1 px-2.5 rounded-lg bg-sky-50 text-sky-700 font-extrabold text-[10px] uppercase tracking-wider select-none border border-sky-100">
                            OPEN
                          </span>
                        ) : (
                          <span className="text-slate-300 text-sm font-semibold select-none">-</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="p-2"></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL 1: Lesson Detail Modal */}
      {showDetailModal && selectedBooking && (
        <Modal
          open
          onClose={() => {
            setShowDetailModal(false)
            setSelectedBooking(null)
          }}
          title={t('sched.info')}
          footer={
            <div className="flex gap-3 justify-end w-full">
              {!selectedBooking.lessonId && (() => {
                const student = students[selectedBooking.studentId]
                if (student?.status === 'reserved') {
                  return (
                    <div className="text-xs text-rose-600 font-bold self-center bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5">
                      {lang === 'vi' ? 'Học viên đang bảo lưu' : 'Student is on leave'}
                    </div>
                  )
                }
                const allowed = isAttendanceAllowed(selectedBooking)
                return (
                  <div className="flex flex-col items-end gap-1.5">
                    <Button
                      variant="primary"
                      onClick={() => {
                        // Form mới tinh cho mỗi buổi — tránh nội dung buổi trước dính sang học viên khác
                        setBook('')
                        setReport(emptyLessonReport())
                        setImages([])
                        setAttendanceStatus('present')
                        setShowAttendanceModal(true)
                      }}
                      disabled={!allowed}
                      className="flex items-center gap-1.5"
                    >
                      <PenSquare className="w-4 h-4" />
                      {t('sched.attendance_btn')}
                    </Button>
                    {!allowed && (
                      <span className="text-[10px] text-rose-500 font-bold max-w-[220px] text-right leading-tight">
                        {lang === 'vi' 
                          ? 'Chỉ được điểm danh sau khi buổi học kết thúc 5 phút' 
                          : 'Only allowed 5 minutes after class ends'}
                      </span>
                    )}
                  </div>
                )
              })()}
              <Button variant="ghost" onClick={() => {
                setShowDetailModal(false)
                setSelectedBooking(null)
              }}>
                {t('sched.close')}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase text-sky-700">{t('sched.class_slot')}</p>
              <p className="text-sm font-bold text-slate-800">
                {lang === 'vi' ? 'Thứ ' : ''}
                {lang === 'vi'
                  ? (selectedBooking.requestedDay === 'sun' ? 'Nhật' : selectedBooking.requestedDay === 'mon' ? '2' : selectedBooking.requestedDay === 'tue' ? '3' : selectedBooking.requestedDay === 'wed' ? '4' : selectedBooking.requestedDay === 'thu' ? '5' : selectedBooking.requestedDay === 'fri' ? '6' : '7')
                  : (selectedBooking.requestedDay === 'sun' ? 'Sunday' : selectedBooking.requestedDay === 'mon' ? 'Monday' : selectedBooking.requestedDay === 'tue' ? 'Tuesday' : selectedBooking.requestedDay === 'wed' ? 'Wednesday' : selectedBooking.requestedDay === 'thu' ? 'Thursday' : selectedBooking.requestedDay === 'fri' ? 'Friday' : 'Saturday')
                }
                {` (${selectedBooking.requestedDate})`} · {lang === 'vi' ? 'Từ' : 'From'} {selectedBooking.requestedStart} {lang === 'vi' ? 'đến' : 'to'} {selectedBooking.requestedEnd} ({selectedBooking.requestedMinutes} {lang === 'vi' ? 'phút' : 'min'})
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <p className="text-xs font-semibold uppercase text-slate-400">
                {t('sched.student_subject')}
              </p>
              <div>
                <h3 className="font-bold text-slate-900 text-base">{selectedBooking.studentName}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedBooking.studentCode}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs mt-2 border-t border-slate-100 pt-3">
                <div>
                  <span className="text-slate-500 font-semibold">{t('sched.subject')} </span>
                  <span className="text-slate-800 font-bold">{selectedBooking.subjectName || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">{t('sched.attendance')} </span>
                  <span className={`px-2 py-0.5 rounded-full font-bold ${
                    selectedBooking.lessonId ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {selectedBooking.lessonId ? t('sched.completed') : t('sched.not_checked')}
                  </span>
                </div>
              </div>

              {/* Classroom URL & Curriculum Link display */}
              {(() => {
                const roomLink = students[selectedBooking.studentId]?.classroomURL || selectedBooking.note
                const student = students[selectedBooking.studentId]
                const subjectPkg = student?.subjects?.find(s => s.subjectId === selectedBooking.subjectId)
                const curriculumLink = subjectPkg?.curriculumLink

                return (
                  <>
                    {roomLink && (
                      <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <span className="text-xs text-slate-500 font-semibold block">{t('sched.online_class')}</span>
                          <p className="text-[11px] text-slate-400 truncate">{roomLink}</p>
                        </div>
                        <a
                          href={roomLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0"
                        >
                          {t('sched.open_class')}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                    {curriculumLink && (
                      <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs text-slate-500 font-semibold block">{t('sched.curriculum')}</span>
                          <p className="text-[11px] text-slate-400 truncate">{curriculumLink}</p>
                        </div>
                        <a
                          href={curriculumLink.startsWith('http') ? curriculumLink : `https://${curriculumLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0"
                        >
                          {t('sched.view_curriculum')}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                    {subjectPkg?.supplementaryCurriculumLink && (
                      <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs text-slate-500 font-semibold block">Giáo trình bổ trợ</span>
                          <p className="text-[11px] text-slate-400 truncate">{subjectPkg.supplementaryCurriculumLink}</p>
                        </div>
                        <a
                          href={subjectPkg.supplementaryCurriculumLink.startsWith('http') ? subjectPkg.supplementaryCurriculumLink : `https://${subjectPkg.supplementaryCurriculumLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0"
                        >
                          Mở GT bổ trợ
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                    {student?.textbookURL && (
                      <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs text-slate-500 font-semibold block">{t('sched.textbook_link')}</span>
                          <p className="text-[11px] text-slate-400 truncate">{student.textbookURL}</p>
                        </div>
                        <a
                          href={student.textbookURL.startsWith('http') ? student.textbookURL : `https://${student.textbookURL}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-[#3BB8EB] hover:bg-[#2da8db] text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0"
                        >
                          {t('sched.open_textbook')}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                    {subjectPkg?.studentRequests && subjectPkg.studentRequests.length > 0 && (
                      <div className="mt-2 pt-3 border-t border-slate-100">
                        <span className="text-xs text-rose-500 font-bold block mb-1">📢 Yêu cầu từ học viên:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {subjectPkg.studentRequests.map((req, idx) => (
                            <span key={idx} className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-2.5 py-1 rounded-lg font-bold">
                              {req}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {subjectPkg?.timetableNote && (
                      <div className="mt-2 pt-3 border-t border-slate-100">
                        <span className="text-xs text-slate-500 font-semibold block">{t('sched.timetable_note')}</span>
                        <p className="text-xs text-slate-700 font-semibold mt-1 bg-amber-50/70 border border-amber-200/50 p-2.5 rounded-xl whitespace-pre-wrap">
                          {subjectPkg.timetableNote}
                        </p>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 2: Quick Attendance Modal */}
      {showAttendanceModal && selectedBooking && (
        <Modal
          open
          onClose={() => setShowAttendanceModal(false)}
          title={`${t('sched.attendance_for')} ${selectedBooking.studentName}`}
          size="lg"
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowAttendanceModal(false)}>{t('sched.cancel')}</Button>
              <Button variant="primary" loading={submittingAttendance} onClick={submitAttendance}>
                {t('attendance.submit')}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
            {/* Student Code and Class Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div>
                <span className="text-xs text-slate-500 font-semibold block">{lang === 'vi' ? 'Mã học viên:' : 'Student Code:'}</span>
                <span className="text-sm font-bold text-slate-800 font-mono">{selectedBooking.studentCode}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-semibold block">{t('attendance.subject')}:</span>
                <span className="text-sm font-bold text-slate-800">{selectedBooking.subjectName}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-semibold block">{t('sched.duration')}</span>
                <span className="text-sm font-bold text-slate-800">{selectedBooking.requestedMinutes} {t('attendance.minutes')}</span>
              </div>
            </div>

            {/* Links and materials display inside Attendance Modal */}
            {(() => {
              const roomLink = students[selectedBooking.studentId]?.classroomURL || selectedBooking.note
              const student = students[selectedBooking.studentId]
              const subjectPkg = student?.subjects?.find(s => s.subjectId === selectedBooking.subjectId)
              const curriculumLink = subjectPkg?.curriculumLink

              return (
                <div className="space-y-3 border border-slate-150 rounded-xl p-4 bg-white shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tài liệu & Lớp học / Links & Materials</p>
                  {roomLink && (
                    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
                      <div className="min-w-0 flex-1">
                        <span className="text-xs text-slate-500 font-semibold block">{t('sched.online_class')}</span>
                        <p className="text-[11px] text-slate-400 truncate">{roomLink}</p>
                      </div>
                      <a
                        href={roomLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0"
                      >
                        {t('sched.open_class')}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                  {curriculumLink && (
                    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
                      <div className="min-w-0 flex-1">
                        <span className="text-xs text-slate-500 font-semibold block">{t('sched.curriculum')}</span>
                        <p className="text-[11px] text-slate-400 truncate">{curriculumLink}</p>
                      </div>
                      <a
                        href={curriculumLink.startsWith('http') ? curriculumLink : `https://${curriculumLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0"
                      >
                        {t('sched.view_curriculum')}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                  {subjectPkg?.supplementaryCurriculumLink && (
                    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
                      <div className="min-w-0 flex-1">
                        <span className="text-xs text-slate-500 font-semibold block">Giáo trình bổ trợ</span>
                        <p className="text-[11px] text-slate-400 truncate">{subjectPkg.supplementaryCurriculumLink}</p>
                      </div>
                      <a
                        href={subjectPkg.supplementaryCurriculumLink.startsWith('http') ? subjectPkg.supplementaryCurriculumLink : `https://${subjectPkg.supplementaryCurriculumLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0"
                      >
                        Mở GT bổ trợ
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                  {student?.textbookURL && (
                    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
                      <div className="min-w-0 flex-1">
                        <span className="text-xs text-slate-500 font-semibold block">{t('sched.textbook_link')}</span>
                        <p className="text-[11px] text-slate-400 truncate">{student.textbookURL}</p>
                      </div>
                      <a
                        href={student.textbookURL.startsWith('http') ? student.textbookURL : `https://${student.textbookURL}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-[#3BB8EB] hover:bg-[#2da8db] text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0"
                      >
                        {t('sched.open_textbook')}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                  {subjectPkg?.studentRequests && subjectPkg.studentRequests.length > 0 && (
                    <div className="py-2 border-t border-slate-100 last:border-0">
                      <span className="text-xs text-rose-500 font-bold block mb-1">📢 Yêu cầu từ học viên:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {subjectPkg.studentRequests.map((req, idx) => (
                          <span key={idx} className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-2.5 py-1 rounded-lg font-bold">
                            {req}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {subjectPkg?.timetableNote && (
                    <div className="pt-2 border-t border-slate-100 last:border-0">
                      <span className="text-xs text-slate-500 font-semibold block">{t('sched.timetable_note')}</span>
                      <p className="text-xs text-slate-700 font-semibold mt-1 bg-amber-50/70 border border-amber-200/50 p-2.5 rounded-xl whitespace-pre-wrap">
                        {subjectPkg.timetableNote}
                      </p>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Attendance Status Selector */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">{t('sched.status_label')}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'present', label: t('sched.status_present') },
                  { key: 'with_permission', label: t('sched.status_excused') },
                  { key: 'without_permission', label: t('sched.status_unexcused') }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleAttendanceStatusSelect(item.key as any)}
                    className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition ${
                      attendanceStatus === item.key
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Book/Materials input */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">{t('sched.book_label')}</label>
              <input
                type="text"
                value={book}
                onChange={(e) => setBook(e.target.value)}
                placeholder={t('sched.book_ph')}
                disabled={attendanceStatus !== 'present'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            {/* Structured lesson report (only when student is present) */}
            {attendanceStatus === 'present' && (
              <LessonReportForm value={report} onChange={setReport} />
            )}

            {/* Evidence image uploads */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">{t('sched.proof_images')}</label>
              <div className="grid grid-cols-5 gap-2">
                {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-square border border-slate-200 rounded-lg overflow-hidden">
                    <img src={img.url} alt="upload" className="w-full h-full object-cover" />
                    {img.uploading && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    {!img.uploading && (
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {images.length < 20 && (
                  <label className="border border-dashed border-slate-300 hover:border-indigo-400 rounded-lg aspect-square flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition">
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="text-[10px] text-slate-400 mt-1">{t('sched.upload_image')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
              <p className="text-[11px] text-slate-400">{t('sched.proof_desc')}</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
