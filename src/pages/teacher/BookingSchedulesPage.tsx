import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where, onSnapshot, addDoc } from 'firebase/firestore'
import { CalendarClock, ChevronLeft, ChevronRight, Clock, User, BookOpen, Link, CheckCircle2, AlertTriangle, ExternalLink, Image, Upload, X, Trash2, PenSquare } from 'lucide-react'
import { db } from '@/lib/firebase'
import { BookingRequest, DayAvailability, DayOfWeek, TeacherAvailability, TimeRange, Student, Subject, Lesson } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { Modal } from '@/components/ui/Modal'
import { getToday } from '@/lib/constants'

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
  const [availability, setAvailability] = useState<TeacherAvailability | null>(null)
  const [slots, setSlots] = useState<Record<DayOfWeek, DayAvailability>>(emptySlots())
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [timeWindow, setTimeWindow] = useState<string>('24h')

  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([])
  const [students, setStudents] = useState<Record<string, Student>>({})
  const [loading, setLoading] = useState(true)

  // Modals
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showAttendanceModal, setShowAttendanceModal] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null)

  // Attendance Form States
  const [attendanceStatus, setAttendanceStatus] = useState<'present' | 'with_permission' | 'without_permission'>('present')
  const [book, setBook] = useState('')
  const [comment, setComment] = useState('')
  const [homework, setHomework] = useState('')
  const [images, setImages] = useState<ImageUpload[]>([])
  const [submittingAttendance, setSubmittingAttendance] = useState(false)

  const weekStartISO = formatDateISO(weekStart)
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const visibleStarts = useMemo(() => getVisibleStarts(timeWindow), [timeWindow])

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
          const weekOverride = data.weekOverrides?.[weekStartISO]
          setAvailability(data)
          setSlots(cloneSlots(weekOverride?.slots || data.slots))
        }
      } catch (error) {
        console.error('Error loading availability:', error)
      } finally {
        setLoading(false)
      }
    }

    loadAvailability(currentTeacherId)
  }, [teacherId, weekStartISO])

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
    return bookingRequests.find((req) => {
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

  // Handle image selections and base64 compression/mock-upload
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (images.length + files.length > 5) {
      toast.warning('Tối đa 5 hình ảnh minh chứng')
      return
    }

    for (const file of files) {
      const canvas = document.createElement('canvas')
      const img = document.createElement('img')
      const url = URL.createObjectURL(file)
      img.src = url

      await new Promise((resolve) => { img.onload = resolve })
      const MAX = 800
      let { width, height } = img
      if (width > MAX) { height = (height * MAX) / width; width = MAX }
      if (height > MAX) { width = (width * MAX) / height; height = MAX }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

      const preview = canvas.toDataURL('image/jpeg', 0.6)
      setImages((prev) => [...prev, { url: preview, storageURL: preview, uploading: false }])
      URL.revokeObjectURL(url)
    }
  }

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  // Submit attendance from calendar booking slot
  const submitAttendance = async () => {
    if (!selectedBooking || !teacherId) return
    const bookTitle = book.trim()
    if (!bookTitle) {
      toast.warning('Vui lòng nhập sách học/tài liệu buổi dạy')
      return
    }

    // Word count validation (< 20 words)
    const words = bookTitle.split(/\s+/).filter(Boolean).length
    if (words > 20) {
      toast.warning('Tên sách học không được vượt quá 20 từ!')
      return
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
        const activeSub = studentData.subjects?.find(s => s.subjectId === selectedBooking.subjectId)
        if (activeSub) {
          pricePerMinute = activeSub.pricePerMinute || 0
        } else {
          // fallback to main subject price
          const subSnap = await getDoc(doc(db, 'subjects', selectedBooking.subjectId || ''))
          if (subSnap.exists()) {
            pricePerMinute = subSnap.data().pricePerMinute || 0
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
          comment: comment.trim(),
          homework: homework.trim(),
          book: bookTitle,
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
      setComment('')
      setHomework('')
      setImages([])
      setAttendanceStatus('present')
    } catch (error) {
      console.error('Submit calendar attendance failed:', error)
      toast.error('Điểm danh thất bại, vui lòng thử lại!')
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
              <h1 className="text-2xl font-black">Lịch dạy của tôi (My Schedules)</h1>
              <p className="mt-1 text-sm text-sky-100">Bảng theo dõi ca học, mở rộng chi tiết phòng học và điểm danh nhanh chóng.</p>
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
                Ca: {item.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">▼</div>
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
        {loading ? (
          <div className="py-20 text-center font-bold text-slate-500 text-sm">Đang tải lịch biểu dạy...</div>
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
                  <th key={day} className="p-3 text-center border-r border-slate-200 font-semibold text-slate-700 min-w-[90px]">
                    <div className="text-sm font-black text-slate-800">{formatShortHeaderDate(date)}</div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">{DAY_LABELS_EN[day]}</div>
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
                  <td className="p-3 text-center font-bold text-slate-500 border-r border-slate-200 align-middle bg-slate-50/50">
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
                            className={`w-full py-2 px-1 rounded-xl text-center block transition shadow-sm ${
                              booking.lessonId
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/50'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/50'
                            }`}
                          >
                            <div className="font-extrabold text-[11px] truncate tracking-tight flex items-center justify-center gap-1">
                              {booking.lessonId && <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                              <span>{booking.studentCode}</span>
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
          title="Thông tin lớp học"
          footer={
            <div className="flex gap-3 justify-end w-full">
              {!selectedBooking.lessonId && (
                <Button variant="primary" onClick={() => setShowAttendanceModal(true)} className="flex items-center gap-1.5">
                  <PenSquare className="w-4 h-4" />
                  Điểm danh ngay
                </Button>
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
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase text-sky-700">Ca học</p>
              <p className="text-sm font-bold text-slate-800">
                Thứ {selectedBooking.requestedDay === 'sun' ? 'Nhật' : selectedBooking.requestedDay === 'mon' ? '2' : selectedBooking.requestedDay === 'tue' ? '3' : selectedBooking.requestedDay === 'wed' ? '4' : selectedBooking.requestedDay === 'thu' ? '5' : selectedBooking.requestedDay === 'fri' ? '6' : '7'}
                {` (${selectedBooking.requestedDate})`} · Từ {selectedBooking.requestedStart} đến {selectedBooking.requestedEnd} ({selectedBooking.requestedMinutes} phút)
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <p className="text-xs font-semibold uppercase text-slate-400">Học sinh & môn học</p>
              <div>
                <h3 className="font-bold text-slate-900 text-base">{selectedBooking.studentName}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedBooking.studentCode}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs mt-2 border-t border-slate-100 pt-3">
                <div>
                  <span className="text-slate-500 font-semibold">Môn học: </span>
                  <span className="text-slate-800 font-bold">{selectedBooking.subjectName || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Điểm danh: </span>
                  <span className={`px-2 py-0.5 rounded-full font-bold ${
                    selectedBooking.lessonId ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {selectedBooking.lessonId ? 'Đã hoàn thành' : 'Chưa điểm danh'}
                  </span>
                </div>
              </div>

              {/* Classroom URL display */}
              {(() => {
                const roomLink = students[selectedBooking.studentId]?.classroomURL || selectedBooking.note
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
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0"
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

      {/* MODAL 2: Quick Attendance Modal */}
      {showAttendanceModal && selectedBooking && (
        <Modal
          open
          onClose={() => setShowAttendanceModal(false)}
          title={`Điểm danh: ${selectedBooking.studentName}`}
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowAttendanceModal(false)}>Hủy</Button>
              <Button variant="primary" loading={submittingAttendance} onClick={submitAttendance}>
                Gửi điểm danh
              </Button>
            </div>
          }
        >
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div>
                <span className="text-xs text-slate-500 font-semibold block">Môn học:</span>
                <span className="text-sm font-bold text-slate-800">{selectedBooking.subjectName}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-semibold block">Thời lượng:</span>
                <span className="text-sm font-bold text-slate-800">{selectedBooking.requestedMinutes} phút</span>
              </div>
            </div>

            {/* Attendance Status Selector */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">Trạng thái điểm danh *</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'present', label: 'Đi học đủ' },
                  { key: 'with_permission', label: 'Vắng có phép (0p)' },
                  { key: 'without_permission', label: 'Vắng không phép (25p)' }
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
              <label className="block text-sm font-bold text-slate-700">Sách học / Giáo trình / Tài liệu *</label>
              <input
                type="text"
                value={book}
                onChange={(e) => setBook(e.target.value)}
                placeholder="VD: Let's Go 1 - Unit 2 Lesson 1 (Tối đa 20 từ)"
                disabled={attendanceStatus !== 'present'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            {/* Comments */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">Nhận xét buổi dạy</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Nhận xét tinh thần, sự tập trung và mức độ hiểu bài của học viên..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </div>

            {/* Homework */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">Bài tập về nhà</label>
              <textarea
                value={homework}
                onChange={(e) => setHomework(e.target.value)}
                rows={2}
                placeholder="Nhiệm vụ về nhà cho học viên..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </div>

            {/* Evidence image uploads */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">Hình ảnh minh chứng lớp học</label>
              <div className="grid grid-cols-5 gap-2">
                {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-square border border-slate-200 rounded-lg overflow-hidden">
                    <img src={img.url} alt="upload" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {images.length < 5 && (
                  <label className="border border-dashed border-slate-300 hover:border-indigo-400 rounded-lg aspect-square flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition">
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="text-[10px] text-slate-400 mt-1">Tải ảnh</span>
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
              <p className="text-[11px] text-slate-400">Chụp màn hình buổi học trực tuyến hoặc bảng viết (tối đa 5 ảnh).</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
