import { useState, useEffect, useMemo } from 'react'
import { addDoc, collection, query, where, getDocs, doc, getDoc, onSnapshot, serverTimestamp, runTransaction, setDoc, limit, orderBy, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student, StudentSubject, Lesson, BookingCancellationRequest, BookingRequest, Teacher, TeacherAvailability, DayOfWeek } from '@/types'
import {
  Search, LogOut, X, ExternalLink, ChevronLeft, ChevronRight, Info, Clock,
  User as UserIcon, Globe, History, GraduationCap, CalendarPlus, Gift, CreditCard,
  Star, Video, BookOpen, CalendarCheck2, Lightbulb, ChevronRight as ChevronRightIcon,
  FileText, Sparkles, ArrowLeft, ArrowUpRight, Award, MapPin, MessageSquareText,
  PlayCircle, UserRound, CheckCircle2, RotateCcw, ClipboardCheck, CalendarDays,
  Trophy, Copy, Camera, Flame, Crown,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '@/components/shared/Logo'
import { DiamondPointsIcon } from '@/components/shared/DiamondPointsIcon'
import { WaveDivider } from '@/components/shared/WaveDivider'
import { normalizeTeacherCountryCode, TeacherAvatar } from '@/components/shared/TeacherAvatar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { useLanguageStore } from '@/stores/languageStore'
import { toast } from '@/stores/toastStore'
import { RewardsTab } from '@/components/parent/RewardsTab'
import { TopUpTab } from '@/components/parent/TopUpTab'
import { BookingExperienceTab, type TeacherRecommendation } from '@/components/parent/BookingExperienceTab'
import { calculateLessonPoints, getBookingPoints, getLessonPoints, getTeacherPointsPer25Minutes } from '@/lib/points'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts'
import { getHeldBookingMinutes, getStudentPackageMinuteSummary } from '@/lib/studentMinutes'
import { rewardMonthKey } from '@/lib/rewards'
import { parseLegacyLessonReport } from '@/components/lessons/lessonReport'
import { bookingConflictMessage, checkBookingCandidates } from '@/lib/bookingConflicts'

const STORAGE_KEY = '123english_parent_session'

function saveSession(code: string, studentId: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, studentId, savedAt: Date.now() }))
}
function loadSession(): { code: string; studentId?: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (Date.now() - data.savedAt > 30 * 24 * 60 * 60 * 1000) { localStorage.removeItem(STORAGE_KEY); return null }
    return { code: data.code, studentId: data.studentId }
  } catch { return null }
}
function clearSession() { localStorage.removeItem(STORAGE_KEY) }

export function ParentDashboardPage() {
  const navigate = useNavigate()
  const [studentCode, setStudentCode] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ student: Student; lessons: Lesson[]; bookings: BookingRequest[] } | null>(null)
  const [autoLoading, setAutoLoading] = useState(true)
  const { lang, setLang } = useLanguageStore()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const codeFromUrl = params.get('code')

    if (codeFromUrl) {
      setStudentCode(codeFromUrl)
      handleLogin(codeFromUrl).finally(() => setAutoLoading(false))
      return
    }

    const session = loadSession()
    if (session) {
      setStudentCode(session.code)
      handleLogin(session.code, session.studentId).finally(() => setAutoLoading(false))
    } else {
      setAutoLoading(false)
    }
  }, [])

  useEffect(() => {
    const studentId = result?.student.id
    if (!studentId) return

    const unsubscribeStudent = onSnapshot(doc(db, 'students', studentId), (snapshot) => {
      if (!snapshot.exists()) return
      setResult((current) => current && current.student.id === studentId
        ? { ...current, student: { id: snapshot.id, ...snapshot.data() } as Student }
        : current)
    }, (snapshotError) => {
      console.error('Keep student diamond balance in sync failed:', snapshotError)
    })

    const bookingQuery = query(
      collection(db, 'bookingRequests'),
      where('studentId', '==', studentId),
      where('status', 'in', ['confirmed', 'pending']),
    )
    const unsubscribeBookings = onSnapshot(bookingQuery, (snapshot) => {
      const nextBookings = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as BookingRequest))
      setResult((current) => current && current.student.id === studentId
        ? { ...current, bookings: nextBookings }
        : current)
    }, (snapshotError) => {
      console.error('Keep student bookings in sync failed:', snapshotError)
    })

    return () => {
      unsubscribeStudent()
      unsubscribeBookings()
    }
  }, [result?.student.id])

  const handleLogin = async (code?: string, cachedStudentId?: string) => {
    setError('')
    const finalCode = (code || studentCode).trim().toUpperCase()
    if (!finalCode) { setError('Vui lòng nhập Mã học sinh'); return }

    setSearching(true)
    try {
      let student: Student | null = null
      if (cachedStudentId) {
        const cachedSnap = await getDoc(doc(db, 'students', cachedStudentId))
        if (cachedSnap.exists() && String(cachedSnap.data().code || '').toUpperCase() === finalCode) {
          student = { id: cachedSnap.id, ...cachedSnap.data() } as Student
        }
      }

      if (!student) {
        const studentQuery = query(collection(db, 'students'), where('code', '==', finalCode), limit(1))
        const studentSnap = await getDocs(studentQuery)
        if (studentSnap.empty) { setError('Không tìm thấy học sinh với mã này'); return }
        student = { id: studentSnap.docs[0].id, ...studentSnap.docs[0].data() } as Student
      }

      const lq = query(collection(db, 'publicLessons'), where('studentId', '==', student.id), where('status', '==', 'approved'))
      const bq = query(collection(db, 'bookingRequests'), where('studentId', '==', student.id), where('status', 'in', ['confirmed', 'pending']))
      const [lSnap, bSnap] = await Promise.all([getDocs(lq), getDocs(bq)])
      const lessons = lSnap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson))
      lessons.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
      const bookings = bSnap.docs.map(d => ({ id: d.id, ...d.data() } as BookingRequest))

      saveSession(finalCode, student.id)
      setResult({ student, lessons, bookings })
    } catch (err) {
      console.error(err)
      setError('Có lỗi xảy ra, vui lòng thử lại')
    } finally {
      setSearching(false)
    }
  }

  const reset = () => { setResult(null); setStudentCode(''); setError(''); clearSession(); navigate('/login') }

  if (autoLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white font-quicksand" aria-label={lang === 'vi' ? 'Đang tải trang học viên' : 'Loading student portal'}>
        <header className="border-b border-slate-200/70 bg-white">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3.5">
            <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-100" />
            <div className="flex-1 space-y-2"><div className="h-4 w-32 animate-pulse rounded bg-slate-200" /><div className="h-2.5 w-24 animate-pulse rounded bg-slate-100" /></div>
            <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
          </div>
        </header>
        <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
          <div className="flex items-center justify-between"><div className="space-y-2"><div className="h-5 w-36 animate-pulse rounded bg-slate-200" /><div className="h-3 w-48 animate-pulse rounded bg-slate-100" /></div><div className="h-10 w-28 animate-pulse rounded-xl bg-sky-100" /></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mx-auto mb-5 h-5 w-32 animate-pulse rounded bg-slate-200" />
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }, (_, index) => <div key={index} className="aspect-square animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          </div>
          <div className="h-44 animate-pulse rounded-2xl border border-sky-100 bg-white" />
        </div>
      </div>
    )
  }

  if (result) return (
    <ParentView
      student={result.student}
      lessons={result.lessons}
      bookings={result.bookings}
      onBack={reset}
      onBookingCancelled={(bookingId, patch) => setResult((current) => current ? {
        ...current,
        student: { ...current.student, ...patch },
        bookings: current.bookings.filter((booking) => booking.id !== bookingId),
      } : current)}
      onBookingCreated={(booking, patch) => setResult((current) => current ? {
        ...current,
        student: { ...current.student, ...patch },
        bookings: [...current.bookings, booking],
      } : current)}
    />
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-sky-50 relative overflow-hidden font-quicksand">
      <div className="absolute top-[-15%] right-[-10%] w-[50%] h-[50%] bg-[#3BB8EB]/8 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-15%] left-[-10%] w-[40%] h-[40%] bg-[#FFE500]/10 rounded-full blur-[100px]" />

      {/* Header */}
      <nav className="relative z-20 bg-white/80 backdrop-blur-md border-b border-sky-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100" aria-label="Quay lại">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Logo className="scale-[0.6] origin-left" />
            <span className="text-[10px] text-slate-400 border-l border-slate-200 pl-2.5 ml-0.5">
              {lang === 'vi' ? 'Cổng Phụ huynh' : 'Parent Portal'}
            </span>
          </div>
          <button
            onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
            className="p-2 text-slate-500 hover:text-slate-800 transition-colors rounded-lg hover:bg-slate-100 flex items-center gap-1 text-[11px] font-bold"
            title={lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="uppercase">{lang}</span>
          </button>
        </div>
      </nav>

      <main className="max-w-lg mx-auto px-4 py-10 relative z-10">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-[#3BB8EB] to-[#2196F3] rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-brand-200/50 rotate-3 hover:rotate-0 transition-transform">
            <BookOpen className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mb-2">
            {lang === 'vi' ? 'Xin chào, Phụ huynh!' : 'Welcome, Parents!'}
          </h2>
          <p className="text-slate-500 text-sm max-w-xs mx-auto leading-relaxed">
            {lang === 'vi' ? 'Nhập mã học viên và SĐT để xem bài tập, nhận xét từ gia sư' : 'Enter student code to view homework & teacher feedback'}
          </p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xl shadow-slate-200/30 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {lang === 'vi' ? 'Mã học sinh *' : 'Student Code *'}
            </label>
            <input
              type="text" value={studentCode} onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()} placeholder={lang === 'vi' ? 'VD: HS8X2K91' : 'E.g. HS8X2K91'}
              className="w-full rounded-xl bg-[#FFE500]/5 border-2 border-[#FFE500]/30 text-slate-900 placeholder-slate-400 px-4 py-3.5 text-lg font-bold tracking-widest uppercase text-center focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600 transition-all"
              autoCapitalize="characters" autoCorrect="off"
            />
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-600 font-medium">
              {error === 'Vui lòng nhập Mã học sinh'
                ? (lang === 'vi' ? 'Vui lòng nhập Mã học sinh' : 'Please enter the Student Code')
                : error === 'Không tìm thấy học sinh với mã này'
                ? (lang === 'vi' ? 'Không tìm thấy học sinh với mã này' : 'No student found with this code')
                : error === 'Có lỗi xảy ra, vui lòng thử lại'
                ? (lang === 'vi' ? 'Có lỗi xảy ra, vui lòng thử lại' : 'An error occurred, please try again')
                : error
              }
            </div>
          )}

          <button onClick={() => handleLogin()} disabled={searching}
            className="w-full py-3.5 bg-[#3BB8EB] hover:bg-[#2da8db] text-white font-bold rounded-xl shadow-lg shadow-brand-200/50 hover:shadow-brand-300/50 hover:-translate-y-0.5 transition-all duration-300 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {searching
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Search className="w-4 h-4" /> {lang === 'vi' ? 'XEM THÔNG TIN HỌC TẬP' : 'VIEW LEARNING INFO'}</>}
          </button>

          <p className="text-[11px] text-slate-400 text-center">
            {lang === 'vi' ? 'Phiên đăng nhập được lưu 30 ngày' : 'Login session saved for 30 days'}
          </p>
        </div>

        <p className="text-xs text-slate-400 text-center mt-6">
          {lang === 'vi' ? 'Mã học sinh được cung cấp bởi trung tâm khi đăng ký' : 'Student code is provided by the center upon registration'}
        </p>
      </main>
    </div>
  )
}

const PROFILE_WEEK_DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function getProfileWeekDates(weekOffset = 0) {
  const monday = new Date()
  monday.setHours(0, 0, 0, 0)
  const day = monday.getDay()
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day))
  monday.setDate(monday.getDate() + weekOffset * 7)
  const weekStartISO = getLocalISODate(monday)

  return PROFILE_WEEK_DAYS.map((weekDay, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return { weekDay, date, weekStartISO }
  })
}

type ProfileTimeSlotStatus = 'available' | 'booked' | 'past' | 'unavailable'

interface ProfileTimeSlot {
  weekDay: DayOfWeek
  dateISO: string
  weekStartISO: string
  start: string
  end: string
  status: ProfileTimeSlotStatus
}

function profileTimeToMinutes(time: string) {
  const [hours = '0', minutes = '0'] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

function profileMinutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function isProfileSlotInsideAvailability(
  availability: TeacherAvailability | null | undefined,
  weekStartISO: string,
  weekDay: DayOfWeek,
  start: string,
  duration: number,
) {
  const slots = availability?.weekOverrides?.[weekStartISO]?.slots || availability?.slots
  const ranges = slots?.[weekDay]?.timeRanges || []
  const startMinutes = profileTimeToMinutes(start)
  const endMinutes = startMinutes + duration
  return ranges.some((range) => startMinutes >= profileTimeToMinutes(range.start) && endMinutes <= profileTimeToMinutes(range.end))
}

function isProfileSlotBooked(bookings: BookingRequest[], dateISO: string, start: string, duration: number) {
  const startMinutes = profileTimeToMinutes(start)
  const endMinutes = startMinutes + duration
  return bookings.some((booking) => {
    if (booking.requestedDate !== dateISO || !['pending', 'confirmed'].includes(booking.status)) return false
    const bookingStart = profileTimeToMinutes(booking.requestedStart)
    const bookingEnd = profileTimeToMinutes(booking.requestedEnd)
    return Math.max(startMinutes, bookingStart) < Math.min(endMinutes, bookingEnd)
  })
}

function getProfileSlotStatus(
  availability: TeacherAvailability | null | undefined,
  bookings: BookingRequest[],
  weekStartISO: string,
  weekDay: DayOfWeek,
  dateISO: string,
  start: string,
  duration = 25,
): ProfileTimeSlotStatus {
  const [year, month, day] = dateISO.split('-').map(Number)
  const [hour, minute] = start.split(':').map(Number)
  const startsAt = new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0)
  const insideAvailability = isProfileSlotInsideAvailability(availability, weekStartISO, weekDay, start, duration)
  if (insideAvailability && isProfileSlotBooked(bookings, dateISO, start, duration)) return 'booked'
  if (startsAt.getTime() <= Date.now()) return 'past'
  if (!insideAvailability) return 'unavailable'
  return 'available'
}

function TeacherProfileContent({ teacher, availability, availabilityLoading, bookings, bookingsLoading, nickname, lang, onBookSlot }: {
  teacher?: TeacherLite
  availability?: TeacherAvailability | null
  availabilityLoading: boolean
  bookings: BookingRequest[]
  bookingsLoading: boolean
  nickname: string
  lang: string
  onBookSlot: (slot: ProfileTimeSlot) => void
}) {
  const approvedCertificates = (teacher?.certificates || []).filter((item) => item.status === 'approved' && !item.voided)
  const pedagogicalCertificates = approvedCertificates.filter((item) => item.category === 'pedagogical' || (item.category === 'other' && /tefl|tesol|celta|delta|teaching|pedagog|sư phạm/i.test(item.title)))
  const foreignLanguageCertificates = approvedCertificates.filter((item) => !pedagogicalCertificates.includes(item))
  const [weekOffset, setWeekOffset] = useState(0)
  const weekDates = useMemo(() => getProfileWeekDates(weekOffset), [weekOffset])
  const weekStartISO = weekDates[0].weekStartISO
  const effectiveSlots = availability?.weekOverrides?.[weekStartISO]?.slots || availability?.slots
  const availableDays = weekDates.filter(({ weekDay }) => {
    const slot = effectiveSlots?.[weekDay]
    return slot?.available && slot.timeRanges?.length > 0
  })
  const todayISO = getLocalISODate(new Date())
  const firstAvailableDay = availableDays.find(({ date }) => getLocalISODate(date) === todayISO)?.weekDay || availableDays[0]?.weekDay || 'mon'
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | null>(null)
  const effectiveSelectedDay = selectedDay && weekDates.some(({ weekDay }) => weekDay === selectedDay) ? selectedDay : firstAvailableDay
  const selectedDate = weekDates.find(({ weekDay }) => weekDay === effectiveSelectedDay)
  const selectedDateISO = selectedDate ? getLocalISODate(selectedDate.date) : ''
  const selectedTimeSlots = Array.from({ length: 48 }, (_, index): ProfileTimeSlot => {
    const start = profileMinutesToTime(index * 30)
    return {
      weekDay: effectiveSelectedDay,
      dateISO: selectedDateISO,
      weekStartISO,
      start,
      end: profileMinutesToTime(index * 30 + 25),
      status: getProfileSlotStatus(availability, bookings, weekStartISO, effectiveSelectedDay, selectedDateISO, start),
    }
  })
  const availableSlotCount = selectedTimeSlots.filter((slot) => slot.status === 'available').length
  const weekNote = availability?.weekOverrides?.[weekStartISO]?.note || availability?.note
  const dayLabels = lang === 'vi'
    ? { mon: 'Thứ 2', tue: 'Thứ 3', wed: 'Thứ 4', thu: 'Thứ 5', fri: 'Thứ 6', sat: 'Thứ 7', sun: 'Chủ Nhật' }
    : { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }
  const shortDayLabels = lang === 'vi'
    ? { mon: 'T2', tue: 'T3', wed: 'T4', thu: 'T5', fri: 'T6', sat: 'T7', sun: 'CN' }
    : { mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su' }
  const formatProfileDate = (date: Date) => `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
  const gender = teacher?.gender === 'female'
    ? (lang === 'vi' ? 'Nữ' : 'Female')
    : teacher?.gender === 'male'
      ? (lang === 'vi' ? 'Nam' : 'Male')
      : (lang === 'vi' ? 'Đang cập nhật' : 'Updating')

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <TeacherAvatar name={nickname} photoURL={teacher?.photoURL} country={teacher?.country} size={72} />
          <div className="min-w-0 flex-1">
            <p className="text-xl font-black tracking-tight text-slate-950">{nickname}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
              {teacher?.country && <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-sky-100"><MapPin className="h-3.5 w-3.5 text-sky-600" />{teacher.country}</span>}
              {typeof teacher?.teachingYears === 'number' && <span className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-sky-100">{teacher.teachingYears} {lang === 'vi' ? 'năm kinh nghiệm' : 'years of experience'}</span>}
            </div>
          </div>
        </div>
        {teacher?.bio && <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-600">{teacher.bio}</p>}
        {/* Chứng nhận hoàn thành đào tạo nội bộ — mặc định hiện cho mọi gia sư (trừ khi admin bỏ tick) */}
        {teacher?.trainedAt123English !== false && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <GraduationCap className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black leading-snug text-emerald-800">
                {lang === 'vi' ? 'Đã hoàn thành Chương trình Đào tạo Gia sư tại Nội Bộ Trung Tâm' : 'Completed the Center’s internal tutor training program'}
              </p>
              <p className="text-[11px] font-semibold text-emerald-600">
                {lang === 'vi' ? 'Thời lượng đào tạo: 60 giờ' : 'Training duration: 60 hours'}
              </p>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-sky-600" />
            <h3 className="text-sm font-black text-slate-900">{lang === 'vi' ? 'Thông tin chuyên môn' : 'Professional information'}</h3>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
            <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Giới tính:' : 'Gender:'}</dt><dd className="min-w-0 truncate font-bold text-slate-800">{gender}</dd></div>
            <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Học vị:' : 'Degree:'}</dt><dd className="min-w-0 truncate font-bold text-slate-800">{teacher?.degreeType || (lang === 'vi' ? 'Đang cập nhật' : 'Updating')}</dd></div>
            <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Trường:' : 'University:'}</dt><dd className="min-w-0 truncate font-bold text-slate-800" title={teacher?.university}>{teacher?.university || (lang === 'vi' ? 'Đang cập nhật' : 'Updating')}</dd></div>
            {typeof teacher?.studentsTaughtCount === 'number' && <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Học viên đã dạy:' : 'Students taught:'}</dt><dd className="min-w-0 truncate font-bold text-slate-800">{teacher.studentsTaughtCount}</dd></div>}
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-sky-600" />
            <h3 className="text-sm font-black text-slate-900">{lang === 'vi' ? 'Chứng chỉ' : 'Certificates'}</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-sky-50/70 p-3 ring-1 ring-sky-100">
              <p className="text-[11px] font-black uppercase tracking-wide text-sky-700">{lang === 'vi' ? 'Năng lực chuyên môn' : 'Professional qualifications'}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {foreignLanguageCertificates.map((certificate, index) => <span key={`${certificate.title}-${index}`} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-sky-800 ring-1 ring-sky-100">{certificate.title}</span>)}
                {foreignLanguageCertificates.length === 0 && <span className="text-xs font-medium text-slate-500">{lang === 'vi' ? 'Đang cập nhật' : 'Updating'}</span>}
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50/70 p-3 ring-1 ring-emerald-100">
              <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">{lang === 'vi' ? 'Sư phạm' : 'Teaching certificates'}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {pedagogicalCertificates.map((certificate, index) => <span key={`${certificate.title}-${index}`} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100">{certificate.title}</span>)}
                {pedagogicalCertificates.length === 0 && <span className="text-xs font-medium text-slate-500">{lang === 'vi' ? 'Đang cập nhật' : 'Updating'}</span>}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-sky-100 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-900">{lang === 'vi' ? 'Lịch rảnh của gia sư' : 'Teacher availability'}</h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">
              {lang === 'vi' ? 'Tuần' : 'Week'} {formatProfileDate(weekDates[0].date)} - {formatProfileDate(weekDates[6].date)}
            </p>
          </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setWeekOffset((value) => value - 1); setSelectedDay(null) }}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 active:scale-[0.97]"
              aria-label={lang === 'vi' ? 'Xem tuần trước' : 'View previous week'}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {lang === 'vi' ? 'Tuần trước' : 'Previous'}
            </button>
            <button
              type="button"
              onClick={() => { setWeekOffset((value) => value + 1); setSelectedDay(null) }}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 active:scale-[0.97]"
              aria-label={lang === 'vi' ? 'Xem tuần sau' : 'View next week'}
            >
              {lang === 'vi' ? 'Tuần sau' : 'Next'}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {availabilityLoading ? (
          <div className="mt-4 space-y-2" aria-label={lang === 'vi' ? 'Đang tải lịch rảnh' : 'Loading availability'}>
            {[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : availableDays.length > 0 ? (
          <div className="mt-4">
            <div className="grid grid-cols-7 gap-1.5 rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-100">
              {weekDates.map(({ weekDay, date }) => {
                const available = availableDays.some((item) => item.weekDay === weekDay)
                const active = effectiveSelectedDay === weekDay
                const isToday = getLocalISODate(date) === todayISO
                return (
                  <button
                    key={weekDay}
                    type="button"
                    onClick={() => setSelectedDay(weekDay)}
                    aria-pressed={active}
                    className={`flex min-h-[58px] flex-col items-center justify-center rounded-xl text-center transition focus:outline-none focus:ring-2 focus:ring-brand-300 active:scale-[0.96] ${active ? 'bg-gradient-to-b from-brand-400 to-brand-500 text-brand-900 shadow-md shadow-brand-200' : available ? 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-brand-50 hover:text-brand-700' : 'bg-white/60 text-slate-400 hover:bg-white hover:text-slate-600'} ${isToday && !active ? 'ring-1 ring-brand-300' : ''}`}
                  >
                    <span className="text-[9px] font-black uppercase">{shortDayLabels[weekDay]}</span>
                    <span className="mt-1 text-sm font-black tabular-nums">{date.getDate()}</span>
                    {available && <span className={`mt-1 h-1 w-1 rounded-full ${active ? 'bg-white' : 'bg-sky-500'}`} />}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_14px_34px_-28px_rgba(2,132,199,0.55)]">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-100 pb-3">
                <p className="text-xs font-black text-slate-900">
                  {dayLabels[effectiveSelectedDay]}
                  <span className="ml-1.5 font-semibold text-slate-500">- {selectedDate ? formatProfileDate(selectedDate.date) : ''}</span>
                </p>
                <div className="flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1 text-[9px] font-bold text-slate-500">
                  <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded border border-sky-400 bg-white" />{lang === 'vi' ? 'Có thể đặt' : 'Available'}</span>
                  <span className="inline-flex items-center gap-1 line-through"><i className="h-2.5 w-2.5 rounded border border-sky-200 bg-[repeating-linear-gradient(-45deg,#f0f9ff_0,#f0f9ff_2px,#dbeafe_2px,#dbeafe_4px)]" />{lang === 'vi' ? 'Đã có lớp' : 'Booked'}</span>
                  <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-slate-100 ring-1 ring-slate-200" />{lang === 'vi' ? 'Không mở' : 'Unavailable'}</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-6 gap-1.5" aria-label={lang === 'vi' ? 'Bảng lịch từng 30 phút' : '30-minute timetable'}>
                {selectedTimeSlots.map((slot) => {
                  const available = slot.status === 'available'
                  const booked = slot.status === 'booked'
                  const past = slot.status === 'past'
                  return (
                    <button
                      key={`${slot.dateISO}-${slot.start}`}
                      type="button"
                      disabled={!available || bookingsLoading}
                      onClick={() => onBookSlot(slot)}
                      aria-label={
                        available
                          ? (lang === 'vi' ? `Đặt lịch lúc ${slot.start}` : `Book ${slot.start}`)
                          : booked
                            ? (lang === 'vi' ? `${slot.start} đã được đặt` : `${slot.start} booked`)
                            : past
                              ? (lang === 'vi' ? `${slot.start} đã qua` : `${slot.start} passed`)
                              : (lang === 'vi' ? `${slot.start} không nằm trong lịch rảnh` : `${slot.start} unavailable`)
                      }
                      className={`flex min-h-9 items-center justify-center rounded-lg px-1 text-[10px] font-extrabold tabular-nums transition focus:outline-none focus:ring-2 focus:ring-brand-300 ${
                        available
                          ? 'border border-brand-300 bg-white text-brand-800 shadow-sm hover:-translate-y-0.5 hover:border-brand-500 hover:bg-brand-400 hover:text-brand-900 active:scale-[0.96]'
                          : booked
                            ? 'cursor-not-allowed border border-sky-100 bg-[repeating-linear-gradient(-45deg,#f8fbff_0,#f8fbff_3px,#e0f2fe_3px,#e0f2fe_5px)] text-sky-400 line-through decoration-2'
                            : past
                              ? 'cursor-not-allowed border border-slate-100 bg-slate-50 text-slate-300'
                              : 'cursor-not-allowed border border-transparent bg-slate-50/70 text-slate-300'
                      }`}
                    >
                      {slot.start}
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <p className="text-[10px] font-semibold leading-4 text-slate-500">
                  {lang === 'vi' ? 'Chọn giờ viền xanh để gửi yêu cầu đặt lịch.' : 'Choose a blue outlined time to request a class.'}
                </p>
                <span className="shrink-0 text-[10px] font-black tabular-nums text-sky-700">{availableSlotCount} {lang === 'vi' ? 'giờ trống' : 'open'}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-sky-200 bg-sky-50/60 px-4 py-5 text-center">
            <CalendarDays className="mx-auto h-7 w-7 text-sky-300" />
            <p className="mt-2 text-sm font-bold text-slate-600">{lang === 'vi' ? 'Gia sư chưa cập nhật lịch rảnh cho tuần này.' : 'The teacher has not updated availability for this week.'}</p>
          </div>
        )}

        {weekNote && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">{weekNote}</p>}
      </section>

      {teacher?.youtubeLink && /^https?:\/\//i.test(teacher.youtubeLink) && (
        <a href={teacher.youtubeLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-400 to-brand-500 px-4 py-2.5 text-sm font-bold text-brand-900 transition hover:brightness-105 active:scale-[0.98]">
          <PlayCircle className="h-4 w-4" />
          {lang === 'vi' ? 'Xem video giới thiệu' : 'Watch introduction video'}
          <ArrowUpRight className="h-4 w-4" />
        </a>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab-based mobile-app style parent view
// Tabs: Hồ sơ · Đổi quà · Đặt lịch · Nạp tiền · Lịch sử (bottom navigation)
// ─────────────────────────────────────────────────────────────────────────────

type ParentTab = 'profile' | 'rewards' | 'booking' | 'topup' | 'history'

const DAY_LABELS_VI = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
const DAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_FULL_VI = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
const DAY_FULL_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getLocalISODate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseISODate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function bookingStartTime(booking: BookingRequest) {
  if (!booking.requestedDate || !booking.requestedStart) return null
  const [year, month, day] = booking.requestedDate.split('-').map(Number)
  const [hour, minute] = booking.requestedStart.split(':').map(Number)
  const date = new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0)
  return Number.isNaN(date.getTime()) ? null : date
}

interface TeacherLite {
  name?: string
  photoURL?: string
  country?: string
  code?: string
  bio?: string
  gender?: Teacher['gender']
  degreeType?: string
  university?: string
  trainedAt123English?: boolean
  teachingYears?: number
  studentsTaughtCount?: number
  subjectNames?: string[]
  strengths?: string[]
  otherStrengths?: string
  certificates?: Teacher['certificates']
  youtubeLink?: string
  status?: Teacher['status']
  subjectIds?: string[]
  teacherGrade?: Teacher['teacherGrade']
  bookingPriority?: number
  level?: number
  pointsPer25Minutes?: number
}

const RECOMMENDATION_GRADE_WEIGHT: Record<string, number> = {
  A: 30,
  B: 22,
  PH: 22,
  SA: 22,
  C: 12,
}

const RECOMMENDATION_DAY_LABELS_VI: Record<DayOfWeek, string> = { mon: 'T2', tue: 'T3', wed: 'T4', thu: 'T5', fri: 'T6', sat: 'T7', sun: 'CN' }
const RECOMMENDATION_DAY_LABELS_EN: Record<DayOfWeek, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }

function normalizeRecommendationText(value?: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

type RecommendationSubject = Pick<StudentSubject, 'subjectId' | 'subjectName'>

function teacherMatchesStudentSubjects(teacher: Teacher, subjects: RecommendationSubject[]) {
  if (subjects.length === 0) return true
  const subjectIds = new Set(subjects.map((item) => item.subjectId).filter(Boolean))
  if ((teacher.subjectIds || []).some((id) => subjectIds.has(id))) return true

  const studentNames = subjects.map((item) => normalizeRecommendationText(item.subjectName)).filter(Boolean)
  const teacherNames = (teacher.subjectNames || []).map(normalizeRecommendationText).filter(Boolean)
  return studentNames.some((studentName) => teacherNames.some((teacherName) => teacherName === studentName || teacherName.includes(studentName) || studentName.includes(teacherName)))
}

function matchedRecommendationSubjects(teacher: Teacher, subjects: RecommendationSubject[]) {
  const teacherIds = new Set(teacher.subjectIds || [])
  const teacherNames = (teacher.subjectNames || []).map(normalizeRecommendationText)
  return subjects
    .filter((item) => teacherIds.has(item.subjectId) || teacherNames.some((name) => {
      const studentName = normalizeRecommendationText(item.subjectName)
      return !!studentName && (name === studentName || name.includes(studentName) || studentName.includes(name))
    }))
    .map((item) => item.subjectName)
}

function recommendationBaseScore(teacher: Teacher) {
  const gradeScore = teacher.teacherGrade ? RECOMMENDATION_GRADE_WEIGHT[teacher.teacherGrade] || 0 : 0
  const profileScore = (teacher.photoURL ? 14 : 0) + (teacher.bio ? 5 : 0) + Math.min(15, Number(teacher.teachingYears || 0) * 3)
  const experienceScore = Math.min(15, Math.floor(Number(teacher.studentsTaughtCount || 0) / 5))
  return gradeScore + profileScore + experienceScore
}

function approvedTeachingMinutes(teacher: Teacher) {
  return Math.max(0, Number(teacher.totalApprovedMinutes || 0))
}

function compareTeacherWorkload(a: Teacher, b: Teacher) {
  const aMinutes = approvedTeachingMinutes(a)
  const bMinutes = approvedTeachingMinutes(b)
  const aHasNoMinutes = aMinutes === 0
  const bHasNoMinutes = bMinutes === 0
  if (aHasNoMinutes !== bHasNoMinutes) return aHasNoMinutes ? -1 : 1
  if (aMinutes !== bMinutes) return aMinutes - bMinutes
  return recommendationBaseScore(b) - recommendationBaseScore(a)
}

function recommendationCountryCode(teacher: Pick<Teacher, 'country' | 'teacherGrade'>) {
  // Dữ liệu chuyển tiếp hiện phân nhóm gia sư nước ngoài bằng teacherGrade.
  // Ưu tiên phân nhóm đã được Admin xác nhận để không hiển thị cờ VN sai cho nhóm SA/PH.
  if (teacher.teacherGrade === 'SA') return 'ZA'
  if (teacher.teacherGrade === 'PH') return 'PH'
  return normalizeTeacherCountryCode(teacher.country)
}

function recommendationCountryLabel(country: string | undefined, lang: string) {
  const labels: Record<string, [string, string]> = {
    VN: ['Việt Nam', 'Vietnam'],
    PH: ['Philippines', 'Philippines'],
    ZA: ['Nam Phi', 'South Africa'],
    JP: ['Nhật Bản', 'Japan'],
    KR: ['Hàn Quốc', 'South Korea'],
    US_EST: ['Hoa Kỳ', 'United States'],
    US_PST: ['Hoa Kỳ', 'United States'],
  }
  const item = country ? labels[normalizeTeacherCountryCode(country)] : undefined
  return item ? item[lang === 'vi' ? 0 : 1] : country || ''
}

function getRecommendationRollingDates() {
  const dayKeys: Record<number, DayOfWeek> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today)
    date.setDate(today.getDate() + offset)
    const monday = new Date(date)
    const weekday = monday.getDay()
    monday.setDate(monday.getDate() + (weekday === 0 ? -6 : 1 - weekday))
    return {
      date,
      weekDay: dayKeys[date.getDay()],
      weekStartISO: getLocalISODate(monday),
    }
  })
}

function recommendationAvailabilitySummary(availability: TeacherAvailability | null, bookings: BookingRequest[], lang: string) {
  const rollingDates = getRecommendationRollingDates()
  const availableDays = new Set<DayOfWeek>()
  let availableSlotCount = 0

  for (const { weekDay, date, weekStartISO } of rollingDates) {
    const dateISO = getLocalISODate(date)
    for (let index = 0; index < 48; index += 1) {
      const start = profileMinutesToTime(index * 30)
      if (getProfileSlotStatus(availability, bookings, weekStartISO, weekDay, dateISO, start) === 'available') {
        availableSlotCount += 1
        availableDays.add(weekDay)
      }
    }
  }

  const labels = lang === 'vi' ? RECOMMENDATION_DAY_LABELS_VI : RECOMMENDATION_DAY_LABELS_EN
  return {
    availableSlotCount,
    availableDayLabels: rollingDates.filter((item) => availableDays.has(item.weekDay)).map((item) => labels[item.weekDay]),
  }
}

interface TeacherLessonReview {
  lessonId: string
  studentId: string
  teacherId: string
  rating: number
}

interface StudentLeaderboardEntry {
  id: string
  name: string
  code: string
  rewardPoints: number
  profileAvatarId?: Student['profileAvatarId']
}

const STUDENT_AVATARS = ['1', '2', '3', '4', '5'] as const

function getCurrentLeaderboardMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).formatToParts(new Date())
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1

  return {
    month,
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    nextStartDate: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
  }
}

// Ảnh nhân vật cậu bé (PNG) — bản giao diện được duyệt. Đặt ở public/student-avatars/.
function studentAvatarUrl(avatarId?: Student['profileAvatarId']) {
  return `/student-avatars/${avatarId || '1'}.png`
}

// Chuỗi tuần học liên tiếp — tính thật từ ngày các buổi đã học, đếm ngược từ tuần
// hiện tại. Nếu tuần này chưa học thì bắt đầu đếm từ tuần trước để không tụt về 0 giữa tuần.
function computeWeekStreak(lessons: Lesson[]): number {
  if (!lessons.length) return 0
  const weekKey = (date: Date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }
  const weeks = new Set(
    lessons
      .map((l) => (l.date ? new Date(l.date) : null))
      .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()))
      .map(weekKey),
  )
  const cursor = new Date()
  if (!weeks.has(weekKey(cursor))) cursor.setDate(cursor.getDate() - 7)
  let streak = 0
  while (weeks.has(weekKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 7)
  }
  return streak
}

// Vòng tròn tiến độ học tập — ảnh đại diện nằm gọn bên trong vòng, không hiện số %
function ProgressRing({ percent, size = 104, children }: { percent: number; size?: number; children?: React.ReactNode }) {
  const stroke = 8
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const filled = Math.min(100, Math.max(0, percent))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#FFF4C7" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#FFC61A"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled / 100)}
          style={{ transition: 'stroke-dashoffset 900ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ padding: stroke + 4 }}>
        {children}
      </div>
    </div>
  )
}

function StudentProfileOverview({ student, completedLessons, avatarId, leaderboard, savingAvatar, onChooseAvatar, stats, usedPct, lessons, onGoTab, lang }: {
  student: Student
  completedLessons: number
  avatarId?: Student['profileAvatarId']
  leaderboard: StudentLeaderboardEntry[]
  savingAvatar: boolean
  onChooseAvatar: (avatarId: Student['profileAvatarId']) => void
  stats: { total: number; used: number; held: number; available: number }
  usedPct: number
  lessons: Lesson[]
  onGoTab: (tab: ParentTab) => void
  lang: string
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const points = Number(student.rewardPoints || 0)
  const currentRank = leaderboard.findIndex((entry) => entry.id === student.id) + 1
  // Quy đổi theo buổi 25 phút để hai vế cùng đơn vị, không lệch số
  const doneSessions = Math.round(stats.used / 25)
  const totalSessions = Math.round(stats.total / 25)
  const weekStreak = useMemo(() => computeWeekStreak(lessons), [lessons])
  const encourage = usedPct >= 80
    ? (lang === 'vi' ? 'Tuyệt vời! Bạn sắp hoàn thành khóa học' : 'Amazing! You are close to finishing')
    : usedPct >= 40
      ? (lang === 'vi' ? 'Cố lên! Bạn đang học rất tốt' : 'Keep going! You are doing great')
      : (lang === 'vi' ? 'Bắt đầu thôi! Mỗi buổi học đều đáng giá' : 'Let’s go! Every lesson counts')
  const podium = leaderboard.slice(0, 3)
  const restBoard = leaderboard.slice(3)
  // Thứ tự hiển thị bục: hạng 2 - hạng 1 - hạng 3
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean) as StudentLeaderboardEntry[]
  const { month: leaderboardMonth } = getCurrentLeaderboardMonth()
  const leaderboardTitle = lang === 'vi'
    ? `Bảng thi đua tháng ${leaderboardMonth}`
    : `${new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())} leaderboard`

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(student.code)
      toast.success(lang === 'vi' ? 'Đã sao chép mã học viên' : 'Student code copied')
    } catch {
      toast.error(lang === 'vi' ? 'Không thể sao chép mã học viên' : 'Could not copy the student code')
    }
  }

  return (
    <>
      <section className="space-y-4 animate-slide-up">
        {/* Tiêu đề mục — dạng title riêng, đồng bộ với các trang khác (vd "Ví học") */}
        <div className="px-1">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-950">
            {lang === 'vi' ? 'Tiến độ học tập' : 'Learning progress'}
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {lang === 'vi' ? 'Theo dõi hành trình học và thành tích của bạn.' : 'Track your learning journey and achievements.'}
          </p>
        </div>

        {/* Ảnh đại diện nằm trong vòng tiến độ + thanh tiến độ theo buổi */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-5">
            <ProgressRing percent={usedPct}>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="group relative h-full w-full rounded-full focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
                aria-label={lang === 'vi' ? 'Đổi nhân vật đại diện' : 'Change profile character'}
              >
                <img src={studentAvatarUrl(avatarId)} alt="" className="h-full w-full rounded-full object-cover" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-brand-900 shadow-md transition group-hover:bg-brand-600">
                  <Camera className="h-3.5 w-3.5" />
                </span>
              </button>
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black leading-snug text-slate-900">{encourage}</p>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-300 to-brand-500 transition-all duration-700"
                  style={{ width: `${Math.min(100, usedPct)}%` }}
                />
              </div>
              <p className="mt-2 text-xs font-bold text-slate-500 tabular-nums">
                {doneSessions}/{totalSessions} {lang === 'vi' ? 'buổi (25 phút)' : 'sessions (25 min)'}
              </p>
            </div>
          </div>

          {/* 4 ô chỉ số — đều lấy từ dữ liệu thật */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-2xl bg-brand-50 px-3 py-3 ring-1 ring-brand-200">
              <div className="flex items-center gap-1.5"><Star className="h-4 w-4 fill-brand-500 text-brand-500" /><span className="text-xl font-black tabular-nums text-slate-950">{points}</span></div>
              <p className="mt-0.5 text-[10px] font-bold text-slate-500">{lang === 'vi' ? 'Sao' : 'Stars'}</p>
            </div>
            <div className="rounded-2xl bg-sky-50 px-3 py-3 ring-1 ring-sky-100">
              <div className="flex items-center gap-1.5"><BookOpen className="h-4 w-4 text-sky-600" /><span className="text-xl font-black tabular-nums text-slate-950">{completedLessons}</span></div>
              <p className="mt-0.5 text-[10px] font-bold text-slate-500">{lang === 'vi' ? 'Buổi đã học' : 'Lessons done'}</p>
            </div>
            <div className="rounded-2xl bg-cyan-50 px-3 py-3 ring-1 ring-cyan-100">
              <div className="flex items-center gap-1.5"><DiamondPointsIcon className="h-4 w-4" /><span className="text-xl font-black tabular-nums text-slate-950">{stats.available}</span></div>
              <p className="mt-0.5 text-[10px] font-bold text-slate-500">{lang === 'vi' ? 'Kim cương' : 'Diamonds'}</p>
            </div>
            <div className="rounded-2xl bg-orange-50 px-3 py-3 ring-1 ring-orange-100">
              <div className="flex items-center gap-1.5"><Flame className="h-4 w-4 text-orange-500" /><span className="text-xl font-black tabular-nums text-slate-950">{weekStreak}</span></div>
              <p className="mt-0.5 text-[10px] font-bold text-slate-500">{lang === 'vi' ? 'Tuần liên tiếp' : 'Week streak'}</p>
            </div>
          </div>
        </div>

        {/* CTA vàng */}
        <button
          type="button"
          onClick={() => onGoTab('booking')}
          className="group flex w-full items-center gap-4 rounded-3xl bg-gradient-to-br from-brand-300 via-brand-400 to-brand-500 p-5 text-left shadow-[0_18px_40px_-24px_rgba(180,120,0,0.75)] transition hover:brightness-[1.03] active:scale-[0.99]"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-brand-800 shadow-sm">
            <CalendarPlus className="h-7 w-7" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black text-brand-900">{lang === 'vi' ? 'Tiếp tục học hôm nay!' : 'Keep learning today!'}</span>
            <span className="mt-0.5 block text-xs font-semibold leading-5 text-brand-900/75">
              {lang === 'vi' ? 'Đặt lịch ngay để không bỏ lỡ thói quen học tập nhé.' : 'Book a class so you keep your learning habit.'}
            </span>
          </span>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-brand-900/70 transition-transform group-hover:translate-x-0.5" />
        </button>

        {leaderboard.length > 0 && (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5"><Trophy className="h-5 w-5 text-brand-600" /><h3 className="text-base font-black text-slate-950">{leaderboardTitle}</h3></div>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-[10px] font-extrabold text-brand-700 ring-1 ring-brand-200">{lang === 'vi' ? 'Sao trong tháng' : 'Monthly stars'}</span>
            </div>

            {/* Bục vinh danh top 3: hạng 2 - hạng 1 - hạng 3 */}
            {podium.length > 0 && (
              <div className="mt-5 grid grid-cols-3 items-end gap-2.5">
                {podiumOrder.map((entry) => {
                  const rank = leaderboard.findIndex((item) => item.id === entry.id) + 1
                  const isFirst = rank === 1
                  const isCurrent = entry.id === student.id
                  const ringColor = isFirst ? 'ring-brand-400' : rank === 2 ? 'ring-slate-300' : 'ring-orange-300'
                  const badgeColor = isFirst ? 'bg-brand-500 text-brand-900' : rank === 2 ? 'bg-slate-400 text-white' : 'bg-orange-400 text-white'
                  return (
                    <div
                      key={entry.id}
                      className={`relative flex flex-col items-center rounded-2xl px-2 pb-3 pt-6 ${isFirst ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-slate-50'} ${isCurrent ? 'ring-2 ring-brand-400' : ''}`}
                    >
                      {isFirst && <Crown className="absolute -top-1 left-1/2 h-6 w-6 -translate-x-1/2 fill-brand-400 text-brand-500" />}
                      <div className="relative">
                        <img src={studentAvatarUrl(entry.profileAvatarId)} alt="" className={`rounded-full object-cover ring-[3px] ${ringColor} ${isFirst ? 'h-16 w-16' : 'h-12 w-12'}`} />
                        <span className={`absolute -bottom-1 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full text-[10px] font-black ring-2 ring-white ${badgeColor}`}>{rank}</span>
                      </div>
                      <p className={`mt-2.5 line-clamp-2 text-center text-[11px] font-extrabold leading-tight text-slate-800 ${isFirst ? 'sm:text-xs' : ''}`}>{entry.name}</p>
                      <span className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-black tabular-nums text-brand-700">
                        <Star className="h-3 w-3 fill-brand-500 text-brand-500" />{entry.rewardPoints}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {restBoard.length > 0 && (
              <div className="mt-4 space-y-2">
                {restBoard.map((entry) => {
                  const rank = leaderboard.findIndex((item) => item.id === entry.id) + 1
                  const isCurrent = entry.id === student.id
                  return (
                    <div key={entry.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${isCurrent ? 'bg-brand-50 ring-1 ring-brand-300' : 'bg-slate-50/80'}`}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-black text-slate-500 ring-1 ring-slate-200">{rank}</span>
                      <img src={studentAvatarUrl(entry.profileAvatarId)} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-white" />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-slate-900">{entry.name}</p>{isCurrent && <p className="text-[10px] font-bold text-brand-700">{lang === 'vi' ? 'Vị trí của bạn' : 'Your position'}</p>}</div>
                      <span className="inline-flex items-center gap-1 text-sm font-black tabular-nums text-brand-700"><Star className="h-4 w-4 fill-brand-500 text-brand-500" />{entry.rewardPoints}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {currentRank === 0 && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Tiếp tục tích lũy sao để xuất hiện trong bảng thi đua.' : 'Keep earning stars to enter the leaderboard.'}</p>}
          </div>
        )}
      </section>

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title={lang === 'vi' ? 'Chọn nhân vật đại diện' : 'Choose your character'} size="sm" footer={<Button fullWidth variant="outline" onClick={() => setPickerOpen(false)}>{lang === 'vi' ? 'Đóng' : 'Close'}</Button>}>
        <p className="mb-4 text-sm leading-6 text-slate-600">{lang === 'vi' ? 'Chọn một nhân vật. Lựa chọn sẽ được lưu vào hồ sơ học viên và hiển thị ở bảng thi đua.' : 'Choose a character. It will be saved to the student profile and leaderboard.'}</p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {STUDENT_AVATARS.map((item) => {
            const active = avatarId === item || (!avatarId && item === '1')
            return <button key={item} type="button" disabled={savingAvatar} onClick={() => { onChooseAvatar(item); setPickerOpen(false) }} className={`relative aspect-square overflow-hidden rounded-2xl transition focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 ${active ? 'ring-4 ring-brand-500' : 'ring-1 ring-slate-200 hover:-translate-y-0.5 hover:ring-brand-300'}`} aria-label={`${lang === 'vi' ? 'Nhân vật' : 'Character'} ${item}`}><img src={studentAvatarUrl(item)} alt="" className="h-full w-full object-cover" />{active && <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-500 text-brand-900"><CheckCircle2 className="h-4 w-4" /></span>}</button>
          })}
        </div>
      </BottomSheet>
    </>
  )
}

// Phụ huynh/học viên chỉ thấy nickname của gia sư. Tuyệt đối không fallback
// sang tên thật từ teacher/lesson/booking vì đây là màn hình dành cho học viên.
function teacherNickname(t: TeacherLite | undefined, fallbackCode?: string, genericLabel = 'Gia sư') {
  const code = (t?.code || fallbackCode || '').trim()
  if (code && !/^GV[A-Z0-9]{4,}$/i.test(code)) return code
  return genericLabel
}

function ParentView({ student, lessons, bookings, onBack, onBookingCancelled, onBookingCreated }: {
  student: Student
  lessons: Lesson[]
  bookings: BookingRequest[]
  onBack: () => void
  onBookingCancelled: (bookingId: string, patch: Partial<Student>) => void
  onBookingCreated: (booking: BookingRequest, patch: Partial<Student>) => void
}) {
  const { lang, setLang } = useLanguageStore()
  const genericTeacherLabel = lang === 'vi' ? 'Gia sư' : 'Teacher'
  const navigate = useNavigate()
  const [tab, setTab] = useState<ParentTab>('booking')
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [selectedParentBooking, setSelectedParentBooking] = useState<BookingRequest | null>(null)
  const [detailLesson, setDetailLesson] = useState<Lesson | null>(null)
  const [teacherMap, setTeacherMap] = useState<Record<string, TeacherLite>>({})
  const [teacherAvailabilityMap, setTeacherAvailabilityMap] = useState<Record<string, TeacherAvailability | null>>({})
  const [teacherScheduleBookings, setTeacherScheduleBookings] = useState<Record<string, BookingRequest[]>>({})
  const [teacherScheduleLoading, setTeacherScheduleLoading] = useState<Record<string, boolean>>({})
  const [profileTeacherId, setProfileTeacherId] = useState<string | null>(null)
  const [profileBookingSlot, setProfileBookingSlot] = useState<ProfileTimeSlot | null>(null)
  const [profileBookingDuration, setProfileBookingDuration] = useState<25 | 50>(25)
  const [profileBookingSubjectId, setProfileBookingSubjectId] = useState('')
  const [submittingProfileBooking, setSubmittingProfileBooking] = useState(false)
  const [teacherReviews, setTeacherReviews] = useState<Record<string, number>>({})
  const [cancellationRequests, setCancellationRequests] = useState<BookingCancellationRequest[]>([])
  const [cancelReason, setCancelReason] = useState('')
  const [submittingCancellation, setSubmittingCancellation] = useState(false)
  const [cancellationDialog, setCancellationDialog] = useState<{ booking: BookingRequest; mode: 'confirm' | 'blocked' | 'rebook' } | null>(null)
  const [profileAvatarId, setProfileAvatarId] = useState<Student['profileAvatarId']>(student.profileAvatarId)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const [leaderboard, setLeaderboard] = useState<StudentLeaderboardEntry[]>([])
  const [showTeacherSuggestions, setShowTeacherSuggestions] = useState(false)
  const [recommendedTeachers, setRecommendedTeachers] = useState<TeacherRecommendation[]>([])
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [recommendationsError, setRecommendationsError] = useState(false)
  const [recommendationReload, setRecommendationReload] = useState(0)

  useEffect(() => {
    setProfileAvatarId(student.profileAvatarId)
  }, [student.profileAvatarId])

  useEffect(() => {
    const leaderboardQuery = query(
      collection(db, 'students'),
      where('monthlyRewardMonth', '==', rewardMonthKey()),
    )
    return onSnapshot(leaderboardQuery, (snap) => {
      const topStudents = snap.docs
        .map((item) => ({ id: item.id, data: item.data() as Student }))
        .filter(({ data }) => data.status !== 'reserved')
        .sort((left, right) => Number(right.data.monthlyRewardPoints || 0) - Number(left.data.monthlyRewardPoints || 0) || left.id.localeCompare(right.id))
        .slice(0, 7)
      setLeaderboard(topStudents.map(({ id, data }) => {
        return {
          id,
          name: data.name || data.code || (lang === 'vi' ? 'Học viên' : 'Student'),
          code: data.code || '',
          rewardPoints: Number(data.monthlyRewardPoints || 0),
          profileAvatarId: data.profileAvatarId,
        }
      }))
    }, (error) => {
      console.error('Load student leaderboard failed:', error)
      setLeaderboard([])
    })
  }, [lang])

  const chooseProfileAvatar = async (avatarId: Student['profileAvatarId']) => {
    if (!avatarId || savingAvatar || avatarId === profileAvatarId) return
    const previous = profileAvatarId
    setProfileAvatarId(avatarId)
    setSavingAvatar(true)
    try {
      await updateDoc(doc(db, 'students', student.id), {
        profileAvatarId: avatarId,
        updatedAt: serverTimestamp(),
      })
      toast.success(lang === 'vi' ? 'Đã cập nhật nhân vật đại diện' : 'Profile character updated')
    } catch (error) {
      console.error('Update student avatar failed:', error)
      setProfileAvatarId(previous)
      toast.error(lang === 'vi' ? 'Chưa thể lưu nhân vật. Vui lòng thử lại.' : 'Could not save the character. Please try again.')
    } finally {
      setSavingAvatar(false)
    }
  }

  useEffect(() => {
    const requestQuery = query(collection(db, 'bookingCancellationRequests'), where('studentId', '==', student.id))
    return onSnapshot(requestQuery, (snap) => {
      setCancellationRequests(snap.docs.map((item) => ({ id: item.id, ...item.data() } as BookingCancellationRequest)))
    }, (error) => {
      console.error('Load cancellation requests failed:', error)
    })
  }, [student.id])

  useEffect(() => {
    const reviewQuery = query(collection(db, 'teacherLessonReviews'), where('studentId', '==', student.id))
    return onSnapshot(reviewQuery, (snap) => {
      const reviews: Record<string, number> = {}
      snap.docs.forEach((item) => {
        const review = item.data() as TeacherLessonReview
        if (review.lessonId && Number.isInteger(review.rating)) reviews[review.lessonId] = review.rating
      })
      setTeacherReviews(reviews)
    }, (error) => {
      console.error('Load teacher reviews failed:', error)
    })
  }, [student.id])

  const openCancellationDialog = (booking: BookingRequest) => {
    if (!['pending', 'confirmed'].includes(booking.status)) return

    // Còn buổi đã huỷ chưa đặt lại → cảnh báo, không cho huỷ tiếp.
    if (student.pendingRebookBookingId) {
      setSelectedParentBooking(null)
      setCancelReason('')
      setCancellationDialog({ booking, mode: 'rebook' })
      return
    }

    const startsAt = bookingStartTime(booking)
    const mode = booking.status === 'pending'
      ? 'confirm'
      : (!startsAt || startsAt.getTime() - Date.now() < 60 * 60 * 1000 ? 'blocked' : 'confirm')
    setCancelReason('')
    setSelectedParentBooking(null)
    setCancellationDialog({ booking, mode })
  }

  const submitCancellationRequest = async () => {
    const booking = cancellationDialog?.booking
    if (!booking || cancellationDialog.mode !== 'confirm' || !['pending', 'confirmed'].includes(booking.status)) return

    const startsAt = bookingStartTime(booking)
    if (booking.status === 'confirmed' && (!startsAt || startsAt.getTime() - Date.now() < 60 * 60 * 1000)) {
      setCancellationDialog({ booking, mode: 'blocked' })
      return
    }

    setSubmittingCancellation(true)
    try {
      const pendingRequest = cancellationRequests.find((item) => item.bookingId === booking.id && item.status === 'pending')
      const nextPatch = await runTransaction(db, async (tx): Promise<Partial<Student>> => {
        const bookingRef = doc(db, 'bookingRequests', booking.id)
        const studentRef = doc(db, 'students', student.id)
        const [bookingSnap, studentSnap] = await Promise.all([tx.get(bookingRef), tx.get(studentRef)])

        if (!bookingSnap.exists()) throw new Error('BOOKING_NOT_FOUND')
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

        const currentBooking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
        const currentStudent = { id: studentSnap.id, ...studentSnap.data() } as Student
        if (!['pending', 'confirmed'].includes(currentBooking.status) || currentBooking.lessonId) throw new Error('BOOKING_ALREADY_PROCESSED')
        if (currentBooking.studentId !== student.id || currentBooking.studentCode !== student.code) throw new Error('STUDENT_MISMATCH')
        // Chặn huỷ liên tục ở server: còn nghĩa vụ đặt lại thì không cho huỷ buổi khác.
        if (currentStudent.pendingRebookBookingId) throw new Error('REBOOK_REQUIRED')

        const currentStartsAt = bookingStartTime(currentBooking)
        if (currentBooking.status === 'confirmed' && (!currentStartsAt || currentStartsAt.getTime() - Date.now() < 60 * 60 * 1000)) throw new Error('CANCELLATION_WINDOW_CLOSED')

        const points = getBookingPoints(currentBooking, teacherMap[currentBooking.teacherId])
        const currentHeld = currentStudent.reservedMinutes ?? currentStudent.heldMinutes ?? 0
        if (points <= 0) throw new Error('INVALID_HELD_POINTS')
        const wasHolding = currentBooking.status === 'confirmed' || currentBooking.heldImmediately === true
        if (!wasHolding || currentHeld < points) throw new Error('INVALID_HELD_POINTS')

        // GIỮ nguyên kim cương đã đặt (reserved không đổi) và ghi nhận nghĩa vụ đặt lại.
        tx.update(bookingRef, {
          status: 'released',
          releasedAt: serverTimestamp(),
          releasedBy: `student:${student.code}`,
          heldMinutesAfterRelease: currentHeld,
          selfServiceCancelled: true,
          cancellationPolicyMinutes: currentBooking.status === 'confirmed' ? 60 : 0,
          cancellationReason: cancelReason.trim(),
          cancelledMinutes: currentBooking.requestedMinutes,
          pendingRebook: true,
          rebookHoldPoints: points,
        })
        tx.update(studentRef, {
          pendingRebookBookingId: currentBooking.id,
          pendingRebookPoints: points,
          updatedAt: serverTimestamp(),
        })
        if (pendingRequest) {
          tx.update(doc(db, 'bookingCancellationRequests', pendingRequest.id), {
            status: 'approved',
            reviewedAt: serverTimestamp(),
            reviewedBy: `student:${student.code}`,
          })
        }

        return { reservedMinutes: currentHeld, heldMinutes: currentHeld, pendingRebookBookingId: currentBooking.id, pendingRebookPoints: points }
      })

      onBookingCancelled(booking.id, nextPatch)
      toast.info(lang === 'vi'
        ? `Đã huỷ buổi học. Kim cương đang được giữ — hãy đặt lại một buổi mới để hoàn tất.`
        : `Class cancelled. Your diamonds are held — please rebook a session to complete.`)
      setCancelReason('')
      setCancellationDialog(null)
      setTab('booking')
    } catch (error) {
      console.error('Automatic cancellation failed:', error)
      const code = error instanceof Error ? error.message : ''
      if (code === 'CANCELLATION_WINDOW_CLOSED') {
        setCancellationDialog({ booking, mode: 'blocked' })
      } else if (code === 'REBOOK_REQUIRED') {
        toast.warning(lang === 'vi' ? 'Bạn cần đặt lại buổi đã huỷ trước khi huỷ buổi tiếp theo.' : 'Please rebook your cancelled session before cancelling another.')
        setCancellationDialog(null)
        setTab('booking')
      } else if (code === 'BOOKING_ALREADY_PROCESSED') {
        toast.info(lang === 'vi' ? 'Buổi học này đã được xử lý trước đó.' : 'This class was already processed.')
        setCancellationDialog(null)
      } else {
        toast.error(lang === 'vi' ? 'Chưa thể hủy buổi học. Vui lòng thử lại.' : 'Could not cancel the class. Please try again.')
      }
    } finally {
      setSubmittingCancellation(false)
    }
  }

  const submitTeacherRating = async (lesson: Lesson, rating: number) => {
    if (!lesson.id || !lesson.teacherId || rating < 1 || rating > 5 || teacherReviews[lesson.id]) return
    await setDoc(doc(db, 'teacherLessonReviews', lesson.id), {
      lessonId: lesson.id,
      studentId: student.id,
      studentCode: student.code,
      teacherId: lesson.teacherId,
      rating,
      createdAt: serverTimestamp(),
    })
    setTeacherReviews((current) => ({ ...current, [lesson.id]: rating }))
    toast.success(lang === 'vi' ? 'Đã gửi đánh giá gia sư.' : 'Teacher rating submitted.')
  }

  // Fetch photo + country of every teacher appearing in lessons/bookings (public read)
  useEffect(() => {
    const ids = new Set<string>()
    lessons.forEach(l => l.teacherId && ids.add(l.teacherId))
    bookings.forEach(b => b.teacherId && ids.add(b.teacherId))
    if (ids.size === 0) return

    Promise.all(
      Array.from(ids).map(async (id) => {
        try {
          const [snap, availabilitySnap] = await Promise.all([
            getDoc(doc(db, 'teachers', id)),
            getDoc(doc(db, 'teacherAvailability', id)).catch(() => null),
          ])
          if (!snap.exists()) return null
          const t = snap.data() as Teacher
          return [id, {
            name: t.name || undefined,
            photoURL: t.photoURL || undefined,
            country: t.country || undefined,
            code: t.code || undefined,
            bio: t.bio || undefined,
            gender: t.gender,
            degreeType: t.degreeType || undefined,
            university: t.university || undefined,
            trainedAt123English: t.trainedAt123English,
            teachingYears: t.teachingYears,
            studentsTaughtCount: t.studentsTaughtCount,
            subjectNames: t.subjectNames || [],
            strengths: t.strengths || [],
            otherStrengths: t.otherStrengths || undefined,
            certificates: t.certificates || [],
            youtubeLink: t.youtubeLink || undefined,
            status: t.status,
            subjectIds: t.subjectIds || [],
            teacherGrade: t.teacherGrade,
            bookingPriority: t.bookingPriority,
            level: t.level,
          }, availabilitySnap?.exists()
            ? ({ id: availabilitySnap.id, ...availabilitySnap.data() } as TeacherAvailability)
            : null] as const
        } catch { return null }
      })
    ).then((entries) => {
      const map: Record<string, TeacherLite> = {}
      const availabilityMap: Record<string, TeacherAvailability | null> = {}
      for (const e of entries) {
        if (!e) continue
        map[e[0]] = e[1]
        availabilityMap[e[0]] = e[2]
      }
      setTeacherMap(map)
      setTeacherAvailabilityMap(availabilityMap)
    })
  }, [lessons, bookings])

  useEffect(() => {
    if (!profileTeacherId) return
    let active = true
    setTeacherScheduleLoading((current) => ({ ...current, [profileTeacherId]: true }))
    const teacherBookingQuery = query(collection(db, 'bookingRequests'), where('teacherId', '==', profileTeacherId))
    getDocs(teacherBookingQuery)
      .then((snapshot) => {
        if (!active) return
        const activeBookings = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() } as BookingRequest))
          .filter((booking) => ['pending', 'confirmed'].includes(booking.status))
        setTeacherScheduleBookings((current) => ({ ...current, [profileTeacherId]: activeBookings }))
      })
      .catch((error) => {
        console.error('Load teacher timetable bookings failed:', error)
        if (active) setTeacherScheduleBookings((current) => ({ ...current, [profileTeacherId]: [] }))
      })
      .finally(() => {
        if (active) setTeacherScheduleLoading((current) => ({ ...current, [profileTeacherId]: false }))
      })
    return () => { active = false }
  }, [profileTeacherId])

  // ─── Minute fund stats ───────────────────────────────────────────
  const packageMinuteSummary = getStudentPackageMinuteSummary(student)
  const approvedLessonPointsBySubject = useMemo(() => {
    return lessons.reduce<Record<string, number>>((totals, lesson) => {
      const subjectId = lesson.subjectId || student.subjectId || '__legacy__'
      totals[subjectId] = (totals[subjectId] || 0) + getLessonPoints(lesson, teacherMap[lesson.teacherId])
      return totals
    }, {})
  }, [lessons, student.subjectId, teacherMap])
  const approvedLessonPoints = useMemo(
    () => Object.values(approvedLessonPointsBySubject).reduce((sum, points) => sum + points, 0),
    [approvedLessonPointsBySubject],
  )
  const pTotalMin = packageMinuteSummary.totalMinutes
  // Prefer the larger value so a temporarily incomplete public mirror cannot
  // reduce a valid stored balance, while stale under-counts are repaired from
  // the approved lesson history.
  const pUsedMin = Math.max(packageMinuteSummary.usedMinutes, approvedLessonPoints)
  const pRemainingMin = Math.max(0, pTotalMin - pUsedMin)
  const pHeldMin = useMemo(() => {
    return bookings
      .filter(b => !b.lessonId && (b.status === 'pending' || b.status === 'confirmed'))
      .reduce((sum, b) => sum + getBookingPoints(b, teacherMap[b.teacherId]), 0)
  }, [bookings, teacherMap])
  const pAvailableMin = Math.max(0, pRemainingMin - pHeldMin)
  const usedPct = pTotalMin > 0 ? Math.min(100, Math.round((pUsedMin / pTotalMin) * 100)) : 0

  // ─── Bookings ────────────────────────────────────────────────────
  const todayISO = getLocalISODate(new Date())
  const upcomingBookings = useMemo(() => {
    return bookings
      .filter(b => !b.lessonId && b.requestedDate && b.requestedDate >= todayISO)
      .sort((a, b) => {
        const d = (a.requestedDate || '').localeCompare(b.requestedDate || '')
        if (d !== 0) return d
        return (a.requestedStart || '').localeCompare(b.requestedStart || '')
      })
  }, [bookings, todayISO])
  const nextBooking = upcomingBookings[0] || null

  // ─── Subject packages (with legacy fallback) ─────────────────────
  const subjectPackages = useMemo(() => {
    let packages: StudentSubject[] = []
    if (student.subjects && student.subjects.length > 0) packages = student.subjects
    if (student.subjectId) {
      if (packages.length === 0) packages = [{
        subjectId: student.subjectId,
        subjectName: student.subjectName || 'Chưa rõ',
        totalSessions: student.totalSessions || 0,
        usedSessions: student.usedSessions || 0,
        remainingSessions: student.remainingSessions || 0,
        minutesPerSession: student.minutesPerSession || 50,
        totalMinutes: student.totalMinutes ?? (student.totalSessions * (student.minutesPerSession || 50)),
        usedMinutes: student.usedMinutes ?? ((student.usedSessions || 0) * (student.minutesPerSession || 50)),
        remainingMinutes: student.remainingMinutes ?? ((student.remainingSessions || 0) * (student.minutesPerSession || 50)),
        pricePerMinute: 0,
      }]
    }
    return packages.map((subject) => {
      const historyPoints = approvedLessonPointsBySubject[subject.subjectId]
        ?? (packages.length === 1 ? approvedLessonPoints : 0)
      const storedUsed = Number(subject.usedMinutes) || 0
      const usedMinutes = Math.max(storedUsed, historyPoints)
      const minutesPerSession = Number(subject.minutesPerSession) || 25
      const totalMinutes = subject.totalMinutes !== null && subject.totalMinutes !== undefined
        ? Number(subject.totalMinutes) || 0
        : (Number(subject.totalSessions) || 0) * minutesPerSession
      const totalSessions = Number(subject.totalSessions) || (totalMinutes / minutesPerSession)
      const usedSessions = Math.round((usedMinutes / minutesPerSession) * 100) / 100
      return {
        ...subject,
        totalMinutes,
        totalSessions,
        usedMinutes,
        remainingMinutes: Math.max(0, totalMinutes - usedMinutes),
        usedSessions,
        remainingSessions: Math.max(0, totalSessions - usedSessions),
      }
    })
  }, [approvedLessonPoints, approvedLessonPointsBySubject, student])

  // Recommendation matching only needs stable subject identities. The full package objects
  // also contain calculated balances that change after teacher data is enriched; depending on
  // those objects would restart this Firestore request and flash the skeleton repeatedly.
  const recommendationSubjectSignature = JSON.stringify(
    subjectPackages
      .map(({ subjectId, subjectName }) => ({
        subjectId: String(subjectId || '').trim(),
        subjectName: String(subjectName || '').trim(),
      }))
      .sort((left, right) => (
        left.subjectId.localeCompare(right.subjectId)
        || left.subjectName.localeCompare(right.subjectName)
      )),
  )
  const recommendationSubjects = useMemo<RecommendationSubject[]>(
    () => JSON.parse(recommendationSubjectSignature) as RecommendationSubject[],
    [recommendationSubjectSignature],
  )

  useEffect(() => {
    if (!showTeacherSuggestions) return
    let active = true

    const loadRecommendations = async () => {
      setRecommendationsLoading(true)
      setRecommendationsError(false)
      try {
        const activeSnapshot = await getDocs(query(
          collection(db, 'teachers'),
          where('status', '==', 'active'),
        ))
        const activeTeachers = activeSnapshot.docs
          .map((item) => ({ id: item.id, ...item.data() } as Teacher))
          .sort(compareTeacherWorkload)
        const subjectMatches = activeTeachers.filter((teacher) => teacherMatchesStudentSubjects(teacher, recommendationSubjects))
        const subjectMatchIds = new Set(subjectMatches.map((teacher) => teacher.id))
        const fallbackTeachers = activeTeachers.filter((teacher) => !subjectMatchIds.has(teacher.id))
        // Học viên mới thường chưa có đủ dữ liệu môn học. Luôn bổ sung ứng viên đang hoạt động,
        // nhưng vẫn giữ nhóm khớp môn ở phía trước và ưu tiên gia sư có 0 phút đã dạy.
        const orderedCandidates = [...subjectMatches, ...fallbackTeachers]
        const recommendationCountries = ['VN', 'PH', 'ZA'] as const
        // Giữ một pool cân bằng theo quốc gia để nhóm có ít gia sư hơn (đặc biệt Nam Phi)
        // không bị loại khỏi top toàn cục trước khi kiểm tra lịch rảnh.
        const candidates = recommendationCountries.flatMap((countryCode) => (
          orderedCandidates
            .filter((teacher) => recommendationCountryCode(teacher) === countryCode)
            .slice(0, 16)
        ))

        const enriched = await Promise.all(candidates.map(async (teacher) => {
          const [availabilitySnapshot, bookingSnapshot] = await Promise.all([
            getDoc(doc(db, 'teacherAvailability', teacher.id)).catch(() => null),
            getDocs(query(collection(db, 'bookingRequests'), where('teacherId', '==', teacher.id))).catch(() => null),
          ])
          const availability = availabilitySnapshot?.exists()
            ? ({ id: availabilitySnapshot.id, ...availabilitySnapshot.data() } as TeacherAvailability)
            : null
          const activeBookings = bookingSnapshot?.docs
            .map((item) => ({ id: item.id, ...item.data() } as BookingRequest))
            .filter((booking) => ['pending', 'confirmed'].includes(booking.status)) || []
          const availabilitySummary = recommendationAvailabilitySummary(availability, activeBookings, lang)
          return { teacher, availability, activeBookings, ...availabilitySummary }
        }))

        if (!active) return

        const teacherUpdates: Record<string, TeacherLite> = {}
        const availabilityUpdates: Record<string, TeacherAvailability | null> = {}
        const bookingUpdates: Record<string, BookingRequest[]> = {}
        enriched.forEach(({ teacher, availability, activeBookings }) => {
          teacherUpdates[teacher.id] = {
            name: teacher.name || undefined,
            photoURL: teacher.photoURL || undefined,
            country: recommendationCountryCode(teacher) || teacher.country || undefined,
            code: teacher.code || undefined,
            bio: teacher.bio || undefined,
            gender: teacher.gender,
            degreeType: teacher.degreeType || undefined,
            university: teacher.university || undefined,
            teachingYears: teacher.teachingYears,
            studentsTaughtCount: teacher.studentsTaughtCount,
            subjectNames: teacher.subjectNames || [],
            strengths: teacher.strengths || [],
            otherStrengths: teacher.otherStrengths || undefined,
            certificates: teacher.certificates || [],
            youtubeLink: teacher.youtubeLink || undefined,
            status: teacher.status,
            subjectIds: teacher.subjectIds || [],
            teacherGrade: teacher.teacherGrade,
            bookingPriority: teacher.bookingPriority,
            level: teacher.level,
            pointsPer25Minutes: getTeacherPointsPer25Minutes(teacher),
          }
          availabilityUpdates[teacher.id] = availability
          bookingUpdates[teacher.id] = activeBookings
        })
        setTeacherMap((current) => ({ ...current, ...teacherUpdates }))
        setTeacherAvailabilityMap((current) => ({ ...current, ...availabilityUpdates }))
        setTeacherScheduleBookings((current) => ({ ...current, ...bookingUpdates }))

        const eligibleRecommendations = enriched
          .filter((item) => item.availableSlotCount > 0)
          .sort((a, b) => {
            const workloadDifference = compareTeacherWorkload(a.teacher, b.teacher)
            return workloadDifference || b.availableSlotCount - a.availableSlotCount
          })

        // Luôn có ứng viên cho học viên mới chưa phát sinh buổi học. Mỗi quốc gia ưu tiên
        // người đang có lịch rảnh; nếu lịch chưa được cập nhật thì dùng ứng viên dự phòng.
        const recommendationsByCountry = recommendationCountries.map((countryCode) => {
          const available = eligibleRecommendations
            .filter((item) => recommendationCountryCode(item.teacher) === countryCode)
          const availableIds = new Set(available.map((item) => item.teacher.id))
          const fallback = enriched
            .filter((item) => recommendationCountryCode(item.teacher) === countryCode && !availableIds.has(item.teacher.id))
            .sort((a, b) => compareTeacherWorkload(a.teacher, b.teacher))
          return [...available, ...fallback].slice(0, 2)
        })

        // Xen kẽ quốc gia: VN 1 → Philippines 1 → Nam Phi 1 → VN 2 → Philippines 2 → Nam Phi 2.
        const interleavedRecommendations = [0, 1].flatMap((position) => (
          recommendationsByCountry
            .map((countryTeachers) => countryTeachers[position])
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
        ))

        const suggestions = interleavedRecommendations
          .map(({ teacher, availableSlotCount, availableDayLabels }): TeacherRecommendation => ({
            id: teacher.id,
            nickname: teacherNickname(teacher, teacher.code, genericTeacherLabel),
            photoURL: teacher.photoURL || undefined,
            country: recommendationCountryCode(teacher) || teacher.country || undefined,
            countryLabel: recommendationCountryLabel(recommendationCountryCode(teacher) || teacher.country, lang),
            teachingYears: teacher.teachingYears,
            pointsPer25Minutes: getTeacherPointsPer25Minutes(teacher),
            availableSlotCount,
            availableDayLabels,
            matchedSubjectNames: matchedRecommendationSubjects(teacher, recommendationSubjects),
          }))

        setRecommendedTeachers(suggestions)
      } catch (error) {
        console.error('Load teacher recommendations failed:', error)
        if (active) {
          setRecommendationsError(true)
        }
      } finally {
        if (active) setRecommendationsLoading(false)
      }
    }

    void loadRecommendations()
    return () => { active = false }
  }, [showTeacherSuggestions, recommendationReload, recommendationSubjects, lang, genericTeacherLabel])

  const profileSubjectPackage = subjectPackages.find(
    (item) => item.subjectId === profileBookingSubjectId,
  ) || subjectPackages[0]
  const profileSubjectHeldMinutes = profileSubjectPackage
    ? getHeldBookingMinutes(bookings, profileSubjectPackage.subjectId)
    : 0
  const profileAvailableMinutes = profileSubjectPackage
    ? Math.max(0, profileSubjectPackage.remainingMinutes - profileSubjectHeldMinutes)
    : pAvailableMin
  const profileTeacher = profileTeacherId ? teacherMap[profileTeacherId] : undefined
  const profileBookingPoints = calculateLessonPoints(profileBookingDuration, getTeacherPointsPer25Minutes(profileTeacher))

  // ─── Analytics ───────────────────────────────────────────────────
  const openProfileBooking = (slot: ProfileTimeSlot) => {
    setProfileBookingDuration(25)
    setProfileBookingSubjectId(subjectPackages[0]?.subjectId || student.subjectId || '')
    setProfileBookingSlot(slot)
  }

  const profileDurationIsAvailable = Boolean(
    profileTeacherId
    && profileBookingSlot
    && isProfileSlotInsideAvailability(
      teacherAvailabilityMap[profileTeacherId],
      profileBookingSlot.weekStartISO,
      profileBookingSlot.weekDay,
      profileBookingSlot.start,
      profileBookingDuration,
    )
    && !isProfileSlotBooked(
      teacherScheduleBookings[profileTeacherId] || [],
      profileBookingSlot.dateISO,
      profileBookingSlot.start,
      profileBookingDuration,
    )
  )

  const submitProfileBooking = async () => {
    if (!profileTeacherId || !profileBookingSlot || !profileDurationIsAvailable) return
    if (profileAvailableMinutes < profileBookingPoints) {
      toast.warning(lang === 'vi' ? 'Quỹ kim cương khả dụng chưa đủ cho thời lượng đã chọn.' : 'Your available diamond balance is not enough for this duration.')
      return
    }

    const teacher = teacherMap[profileTeacherId]
    const subjectPackage = subjectPackages.find((item) => item.subjectId === profileBookingSubjectId) || subjectPackages[0]
    if (!teacher || !subjectPackage) {
      toast.error(lang === 'vi' ? 'Chưa đủ thông tin gia sư hoặc môn học để đặt lịch.' : 'Teacher or subject information is incomplete.')
      return
    }

    setSubmittingProfileBooking(true)
    try {
      const latestSnapshot = await getDocs(query(collection(db, 'bookingRequests'), where('teacherId', '==', profileTeacherId)))
      const latestBookings = latestSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as BookingRequest))
        .filter((booking) => ['pending', 'confirmed'].includes(booking.status))
      setTeacherScheduleBookings((current) => ({ ...current, [profileTeacherId]: latestBookings }))

      const stillAvailable = isProfileSlotInsideAvailability(
        teacherAvailabilityMap[profileTeacherId],
        profileBookingSlot.weekStartISO,
        profileBookingSlot.weekDay,
        profileBookingSlot.start,
        profileBookingDuration,
      ) && !isProfileSlotBooked(latestBookings, profileBookingSlot.dateISO, profileBookingSlot.start, profileBookingDuration)

      if (!stillAvailable) {
        toast.warning(lang === 'vi' ? 'Khung giờ này vừa được người khác đặt. Vui lòng chọn khung khác.' : 'This time was just booked. Please choose another slot.')
        return
      }

      const requestedEnd = profileMinutesToTime(profileTimeToMinutes(profileBookingSlot.start) + profileBookingDuration)
      const conflicts = await checkBookingCandidates([{
        teacherId: profileTeacherId,
        teacherName: teacher.name,
        studentId: student.id,
        studentName: student.name,
        studentCode: student.code,
        requestedDate: profileBookingSlot.dateISO,
        requestedStart: profileBookingSlot.start,
        requestedEnd,
        requestedMinutes: profileBookingDuration,
      }])
      if (conflicts.length > 0) {
        toast.error(bookingConflictMessage(conflicts[0], lang === 'vi' ? 'vi' : 'en'))
        return
      }

      const bookingRef = doc(collection(db, 'bookingRequests'))
      const createdAt = Timestamp.now()
      const teacherConfirmationDeadlineAt = Timestamp.fromMillis(createdAt.toMillis() + 3 * 60 * 60 * 1000)
      const bookingPayload: BookingRequest = {
        id: bookingRef.id,
        status: 'pending' as const,
        teacherResponse: 'pending',
        teacherId: profileTeacherId,
        teacherCode: teacher.code || '',
        teacherName: teacher.name || teacher.code || 'Gia sư',
        teacherPhotoURL: teacher.photoURL || '',
        studentId: student.id,
        studentCode: student.code,
        studentName: student.name,
        subjectId: subjectPackage.subjectId,
        subjectName: subjectPackage.subjectName,
        requestedDay: profileBookingSlot.weekDay,
        requestedDate: profileBookingSlot.dateISO,
        requestedWeekStart: profileBookingSlot.weekStartISO,
        requestedStart: profileBookingSlot.start,
        requestedEnd,
        requestedMinutes: profileBookingDuration,
        requestedPoints: profileBookingPoints,
        pointsPer25Minutes: getTeacherPointsPer25Minutes(teacher),
        availableMinutesAtRequest: profileAvailableMinutes,
        heldMinutesAtRequest: profileSubjectHeldMinutes,
        heldImmediately: true,
        teacherConfirmationDeadlineAt,
        note: '',
        createdAt,
      }
      const { heldAfterRequest, patch } = await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', student.id)
        const studentSnap = await tx.get(studentRef)
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')
        const currentStudent = { id: studentSnap.id, ...studentSnap.data() } as Student

        // Nếu đang có nghĩa vụ đặt lại: buổi mới này DÙNG LẠI kim cương đã giữ, chỉ trừ thêm phần chênh lệch.
        const rebookId = currentStudent.pendingRebookBookingId || ''
        let reusablePoints = 0
        if (rebookId) {
          const rebookSnap = await tx.get(doc(db, 'bookingRequests', rebookId))
          if (!rebookSnap.exists()) throw new Error('REBOOK_TARGET_MISSING')
          reusablePoints = Number((rebookSnap.data() as BookingRequest).rebookHoldPoints || 0)
        }

        const currentFund = getStudentPackageMinuteSummary(currentStudent)
        const currentHeld = currentStudent.reservedMinutes ?? currentStudent.heldMinutes ?? 0
        const currentAvailable = Math.max(0, currentFund.remainingMinutes - currentHeld)
        const extraNeeded = Math.max(0, profileBookingPoints - reusablePoints)
        if (currentAvailable < extraNeeded) throw new Error('NOT_ENOUGH_POINTS')

        const heldAfter = currentHeld + profileBookingPoints - reusablePoints
        tx.update(studentRef, {
          reservedMinutes: heldAfter,
          heldMinutes: heldAfter,
          lastBookingHoldRequestId: bookingRef.id,
          ...(rebookId ? { pendingRebookBookingId: '', pendingRebookPoints: 0 } : {}),
          updatedAt: serverTimestamp(),
        })
        tx.set(bookingRef, {
          ...bookingPayload,
          heldMinutesAfterRequest: heldAfter,
          createdAt: serverTimestamp(),
        })
        if (rebookId) {
          tx.update(doc(db, 'bookingRequests', rebookId), {
            pendingRebook: false,
            rebookedAt: serverTimestamp(),
            rebookedByBookingId: bookingRef.id,
          })
        }
        const nextPatch: Partial<Student> = { reservedMinutes: heldAfter, heldMinutes: heldAfter }
        if (rebookId) { nextPatch.pendingRebookBookingId = ''; nextPatch.pendingRebookPoints = 0 }
        return { heldAfterRequest: heldAfter, patch: nextPatch }
      })
      const createdBooking = { ...bookingPayload, heldMinutesAfterRequest: heldAfterRequest }
      setTeacherScheduleBookings((current) => ({
        ...current,
        [profileTeacherId]: [...(current[profileTeacherId] || []), createdBooking],
      }))
      onBookingCreated(createdBooking, patch)
      setProfileBookingSlot(null)
      toast.success(lang === 'vi' ? `Đã giữ ${profileBookingPoints} kim cương và gửi lịch cho gia sư xác nhận.` : `${profileBookingPoints} diamonds are now held and the teacher has been asked to confirm.`)
    } catch (error) {
      console.error('Profile timetable booking failed:', error)
      const code = error instanceof Error ? error.message : ''
      toast.error(code === 'NOT_ENOUGH_POINTS'
        ? (lang === 'vi' ? 'Quỹ kim cương khả dụng không đủ để đặt khung giờ này.' : 'Your available diamond balance is not enough for this slot.')
        : (lang === 'vi' ? 'Chưa thể gửi yêu cầu đặt lịch. Vui lòng thử lại.' : 'Could not send the booking request. Please try again.'))
    } finally {
      setSubmittingProfileBooking(false)
    }
  }

  const { monthlyData, durationData, insights } = useMemo(() => {
    const buckets: Record<string, { count: number; minutes: number }> = {}
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets[key] = { count: 0, minutes: 0 }
    }
    for (const l of lessons) {
      const key = l.date?.slice(0, 7)
      if (key && buckets[key]) {
        buckets[key].count++
        buckets[key].minutes += l.minutes || 0
      }
    }
    const monthly = Object.entries(buckets).map(([k, v]) => {
      const [y, m] = k.split('-')
      return {
        name: lang === 'vi' ? `T${parseInt(m)}/${y.slice(2)}` : `M${parseInt(m)}/${y.slice(2)}`,
        buoi: v.count,
        phut: v.minutes
      }
    })

    const durBuckets: Record<number, number> = {}
    for (const l of lessons) {
      const m = l.minutes || 0
      if (!m) continue
      durBuckets[m] = (durBuckets[m] || 0) + 1
    }
    const duration = Object.entries(durBuckets)
      .map(([m, c]) => ({ name: `${m} ${lang === 'vi' ? 'phút' : 'min'}`, value: c, mins: parseInt(m) }))
      .sort((a, b) => a.mins - b.mins)

    const totalMinDone = lessons.reduce((s, l) => s + (l.minutes || 0), 0)
    const avgMin = lessons.length > 0 ? Math.round(totalMinDone / lessons.length) : 0
    const last30Days = lessons.filter(l => {
      const d = new Date(l.date)
      const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
      return diff <= 30 && diff >= 0
    })
    const consistencyHint =
      last30Days.length >= 8 ? (lang === 'vi' ? 'Học rất đều' : 'Very consistent') :
      last30Days.length >= 4 ? (lang === 'vi' ? 'Học đều đặn' : 'Consistent') :
      last30Days.length >= 1 ? (lang === 'vi' ? 'Học chưa đều' : 'Inconsistent') :
      (lang === 'vi' ? 'Chưa học gần đây' : 'No recent classes')

    return {
      monthlyData: monthly,
      durationData: duration,
      insights: { avgMin, totalMin: totalMinDone, last30Count: last30Days.length, consistency: consistencyHint },
    }
  }, [lessons, lang])

  const PIE_COLORS = ['#3BB8EB', '#FFD600', '#10B981', '#F59E0B']

  const dayFull = lang === 'vi' ? DAY_FULL_VI : DAY_FULL_EN
  const roomLinkOf = (b: BookingRequest | null) => (b?.classroomURL || student.classroomURL || '')
  const studentGivenName = student.name.trim().split(/\s+/).slice(-1)[0] || student.name

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [tab])

  const NAV_ITEMS: { key: ParentTab; label: string; labelEn: string; icon: typeof UserIcon }[] = [
    { key: 'profile', label: 'Hồ sơ', labelEn: 'Profile', icon: UserIcon },
    { key: 'rewards', label: 'Đổi quà', labelEn: 'Rewards', icon: Gift },
    { key: 'booking', label: 'Đặt lịch', labelEn: 'Reserve', icon: CalendarPlus },
    { key: 'topup', label: 'Ví học', labelEn: 'Learning wallet', icon: CreditCard },
    { key: 'history', label: 'Lịch sử', labelEn: 'History', icon: History },
  ]

  return (
    <div className="min-h-screen bg-white font-quicksand">
      {/* Header vàng brand + dải lượn sóng ngăn cách với nội dung bên dưới */}
      <header className="sticky top-0 z-30 bg-gradient-to-b from-[#FFE04A] via-[#FFD32E] to-[#FFC61A] shadow-[0_6px_18px_-12px_rgba(180,120,0,0.55)]">
        <div className="mx-auto max-w-2xl px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={onBack}
                className="rounded-xl p-2 text-amber-900/70 transition-colors hover:bg-white/40 hover:text-amber-950 active:scale-[0.97] shrink-0"
                aria-label={lang === 'vi' ? 'Đăng xuất' : 'Sign out'}
              >
                <LogOut className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-sm sm:text-base font-black leading-tight tracking-tight text-amber-950">
                  {lang === 'vi' ? 'Chào ' : 'Hello '}<span className="text-white drop-shadow-[0_1px_2px_rgba(146,94,0,0.45)]">{studentGivenName}</span>
                </h1>
                <p className="mt-0.5 truncate text-[10px] sm:text-[11px] font-bold tracking-wide text-amber-900/70 font-mono">
                  {student.code}
                </p>
              </div>
            </div>

            {/* Right side items */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Star balance */}
              <div className="flex h-8 items-center overflow-hidden rounded-full bg-white text-amber-950 shadow-sm ring-1 ring-amber-900/10 text-[11px] sm:text-xs">
                <button
                  type="button"
                  onClick={() => setTab('rewards')}
                  className="flex h-full items-center gap-1 px-2 font-black tabular-nums transition hover:bg-amber-50"
                  aria-label={lang === 'vi' ? 'Xem số Sao' : 'View stars'}
                >
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                  {(student.rewardPoints || 0).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('rewards')}
                  className="grid h-8 w-6 place-items-center border-l border-amber-100 font-bold text-amber-600 transition hover:bg-amber-50"
                  aria-label={lang === 'vi' ? 'Đi đến trang đổi quà' : 'Open rewards'}
                >
                  +
                </button>
              </div>

              {/* Diamond balance */}
              <div className="flex h-8 items-center overflow-hidden rounded-full bg-white text-sky-950 shadow-sm ring-1 ring-amber-900/10 text-[11px] sm:text-xs">
                <button
                  type="button"
                  onClick={() => setTab('topup')}
                  className="flex h-full items-center gap-1 px-2 font-black tabular-nums transition hover:bg-sky-50"
                  aria-label={lang === 'vi' ? 'Xem số dư kim cương' : 'View diamond balance'}
                >
                  <DiamondPointsIcon className="h-3.5 w-3.5" />
                  {pAvailableMin.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('topup')}
                  className="grid h-8 w-6 place-items-center border-l border-sky-100 font-bold text-sky-600 transition hover:bg-sky-50"
                  aria-label={lang === 'vi' ? 'Nạp thêm kim cương' : 'Top up diamonds'}
                >
                  +
                </button>
              </div>

            </div>
          </div>
        </div>
        <WaveDivider height={32} fill="#ffffff" />
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-32 pt-5 sm:pt-6">
        {tab === 'profile' && (
          <div className="space-y-8">
            <StudentProfileOverview
              student={student}
              completedLessons={lessons.length}
              avatarId={profileAvatarId}
              leaderboard={leaderboard}
              savingAvatar={savingAvatar}
              onChooseAvatar={chooseProfileAvatar}
              stats={{ total: pTotalMin, used: pUsedMin, held: pHeldMin, available: pAvailableMin }}
              usedPct={usedPct}
              lessons={lessons}
              onGoTab={setTab}
              lang={lang}
            />
          </div>
        )}
        {tab === 'rewards' && <RewardsTab student={student} lang={lang} />}
        {tab === 'booking' && (
          <BookingExperienceTab
            subjectPackages={subjectPackages}
            bookings={bookings}
            upcomingBookings={upcomingBookings}
            teacherMap={teacherMap}
            roomLinkOf={roomLinkOf}
            onSelectBooking={(booking) => {
              setCancelReason('')
              setSelectedParentBooking(booking)
            }}
            onOpenTeacherProfile={setProfileTeacherId}
            onCancelBooking={openCancellationDialog}
            cancellationRequests={cancellationRequests}
            rebookRequired={Boolean(student.pendingRebookBookingId)}
            onOpenHistory={() => setTab('history')}
            lang={lang}
            onPickTeacher={() => setShowTeacherSuggestions(true)}
            showRecommendations={showTeacherSuggestions}
            onCloseRecommendations={() => setShowTeacherSuggestions(false)}
            recommendedTeachers={recommendedTeachers}
            recommendationsLoading={recommendationsLoading}
            recommendationsError={recommendationsError}
            onRetryRecommendations={() => setRecommendationReload((value) => value + 1)}
          />
        )}
        {tab === 'topup' && (
          <TopUpTab
            student={student}
            lang={lang}
            usedMinutesOverride={pUsedMin}
            heldMinutesOverride={pHeldMin}
          />
        )}
        {tab === 'history' && (
          <HistoryTab
            lessons={lessons}
            teacherMap={teacherMap}
            subjectPackages={subjectPackages}
            rewardPoints={student.rewardPoints || 0}
            teacherReviews={teacherReviews}
            onDetail={setDetailLesson}
            onTeacherProfile={setProfileTeacherId}
            onRateTeacher={submitTeacherRating}
            onRebook={() => {
              setTab('booking')
              setShowTeacherSuggestions(true)
            }}
            onRewards={() => setTab('rewards')}
            lang={lang}
          />
        )}
      </main>

      {/* ─── Bottom Navigation ─── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
        <div className="max-w-2xl mx-auto sm:px-4 sm:pb-3">
          <div className="pointer-events-auto bg-white/95 backdrop-blur-xl border-t border-slate-200/80 sm:border sm:rounded-3xl sm:shadow-[0_10px_40px_-12px_rgba(15,23,42,0.25)] px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-2">
            <div className="grid grid-cols-5">
              {NAV_ITEMS.map(({ key, label, labelEn, icon: Icon }) => {
                const active = tab === key
                const isCenter = key === 'booking'
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className="relative flex flex-col items-center justify-end gap-1 py-1.5 group"
                    aria-label={lang === 'vi' ? label : labelEn}
                  >
                    {isCenter ? (
                      <span className={`flex items-center justify-center w-12 h-12 -mt-7 rounded-full shadow-lg transition-all duration-300 ring-4 ring-white ${
                        active
                          ? 'bg-gradient-to-b from-[#FFD32E] to-[#FFB800] shadow-amber-300/70 scale-105'
                          : 'bg-gradient-to-b from-[#FFDE59] to-[#FFC61A] shadow-amber-200/70 group-hover:scale-105'
                      }`}>
                        <Icon className="w-5.5 h-5.5 w-[22px] h-[22px] text-amber-950" />
                      </span>
                    ) : (
                      <span className={`flex items-center justify-center w-9 h-9 rounded-2xl transition-all duration-300 ${
                        active ? 'bg-amber-100 scale-105' : 'group-hover:bg-slate-100'
                      }`}>
                        <Icon className={`w-[21px] h-[21px] transition-colors ${active ? 'text-amber-600' : 'text-slate-400 group-hover:text-slate-600'}`} strokeWidth={active ? 2.4 : 2} />
                      </span>
                    )}
                    <span className={`text-[10px] font-bold tracking-tight transition-colors ${active ? 'text-amber-700' : 'text-slate-400'}`}>
                      {lang === 'vi' ? label : labelEn}
                    </span>
                    {active && !isCenter && (
                      <span className="absolute -top-[7px] w-1 h-1 rounded-full bg-amber-500 animate-fade-in" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Image viewer ─── */}
      {viewImage && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setViewImage(null)}
        >
          <button
            className="absolute top-5 right-5 p-2.5 bg-white/15 hover:bg-white/25 backdrop-blur-md rounded-xl text-white transition-colors"
            onClick={() => setViewImage(null)}
            aria-label={lang === 'vi' ? 'Đóng' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={viewImage}
            alt=""
            className="max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {profileTeacherId && (
        <BottomSheet
          open
          size="md"
          mobileHeight="compact"
          onClose={() => setProfileTeacherId(null)}
          title={lang === 'vi' ? 'Hồ sơ gia sư' : 'Teacher Profile'}
        >
          <TeacherProfileContent
            teacher={teacherMap[profileTeacherId]}
            availability={teacherAvailabilityMap[profileTeacherId]}
            availabilityLoading={!(profileTeacherId in teacherAvailabilityMap)}
            bookings={teacherScheduleBookings[profileTeacherId] || []}
            bookingsLoading={teacherScheduleLoading[profileTeacherId] ?? true}
            nickname={teacherNickname(teacherMap[profileTeacherId], undefined, genericTeacherLabel)}
            lang={lang}
            onBookSlot={openProfileBooking}
          />
        </BottomSheet>
      )}

      {profileTeacherId && profileBookingSlot && (
        <Modal
          open
          size="sm"
          onClose={() => setProfileBookingSlot(null)}
          title={lang === 'vi' ? 'Xác nhận đặt lịch' : 'Confirm booking'}
          footer={
            <div className="grid w-full grid-cols-2 gap-3">
              <Button variant="outline" disabled={submittingProfileBooking} onClick={() => setProfileBookingSlot(null)}>
                {lang === 'vi' ? 'Quay lại' : 'Back'}
              </Button>
              <Button loading={submittingProfileBooking} disabled={!profileDurationIsAvailable || profileAvailableMinutes < profileBookingPoints} onClick={submitProfileBooking}>
                {lang === 'vi' ? 'Gửi yêu cầu' : 'Send request'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <section className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
              <p className="text-xs font-bold text-slate-500">{lang === 'vi' ? 'Gia sư' : 'Teacher'}</p>
              <p className="mt-1 text-base font-black text-slate-950">{teacherNickname(teacherMap[profileTeacherId], undefined, genericTeacherLabel)}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-sky-100">
                  <p className="text-[10px] font-bold text-slate-400">{lang === 'vi' ? 'Ngày học' : 'Date'}</p>
                  <p className="mt-1 text-sm font-black tabular-nums text-slate-800">{profileBookingSlot.dateISO}</p>
                </div>
                <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-sky-100">
                  <p className="text-[10px] font-bold text-slate-400">{lang === 'vi' ? 'Bắt đầu' : 'Starts at'}</p>
                  <p className="mt-1 text-sm font-black tabular-nums text-sky-700">{profileBookingSlot.start}</p>
                </div>
              </div>
            </section>

            <div>
              <p className="text-xs font-black text-slate-700">{lang === 'vi' ? 'Thời lượng buổi học' : 'Class duration'}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([25, 50] as const).map((minutes) => {
                  const durationAvailable = isProfileSlotInsideAvailability(teacherAvailabilityMap[profileTeacherId], profileBookingSlot.weekStartISO, profileBookingSlot.weekDay, profileBookingSlot.start, minutes)
                    && !isProfileSlotBooked(teacherScheduleBookings[profileTeacherId] || [], profileBookingSlot.dateISO, profileBookingSlot.start, minutes)
                  return (
                    <button
                      key={minutes}
                      type="button"
                      disabled={!durationAvailable}
                      onClick={() => setProfileBookingDuration(minutes)}
                      className={`min-h-11 rounded-xl border px-3 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-brand-300 ${profileBookingDuration === minutes ? 'border-sky-600 bg-gradient-to-b from-brand-400 to-brand-500 text-brand-900' : durationAvailable ? 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50' : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'}`}
                    >
                      {minutes} {lang === 'vi' ? 'phút' : 'minutes'}
                    </button>
                  )
                })}
              </div>
            </div>

            {subjectPackages.length > 1 && (
              <label className="block">
                <span className="text-xs font-black text-slate-700">{lang === 'vi' ? 'Môn học' : 'Subject'}</span>
                <select value={profileBookingSubjectId} onChange={(event) => setProfileBookingSubjectId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100">
                  {subjectPackages.map((subject) => <option key={subject.subjectId} value={subject.subjectId}>{subject.subjectName}</option>)}
                </select>
              </label>
            )}

            <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600">
              <p>{lang === 'vi' ? `Quỹ kim cương khả dụng của môn: ${profileAvailableMinutes.toLocaleString('vi-VN')}. Buổi ${profileBookingDuration} phút với gia sư này dùng ${profileBookingPoints} kim cương.` : `Available subject balance: ${profileAvailableMinutes.toLocaleString('en-US')} diamonds. This ${profileBookingDuration}-minute class uses ${profileBookingPoints} diamonds.`}</p>
              <p>{lang === 'vi' ? 'Yêu cầu sẽ ở trạng thái chờ xác nhận. Khi gửi thành công, khung giờ được đánh dấu đã đặt để tránh học viên khác chọn trùng.' : 'The request remains pending confirmation. After submission, the time is marked as booked to prevent duplicate selection.'}</p>
            </div>

            {!profileDurationIsAvailable && <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-xs font-bold leading-5 text-amber-700">{lang === 'vi' ? 'Thời lượng này không còn phù hợp với lịch rảnh hoặc đã trùng một lịch khác.' : 'This duration no longer fits the availability or overlaps another booking.'}</p>}
            {profileAvailableMinutes < profileBookingPoints && <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-xs font-bold leading-5 text-rose-700">{lang === 'vi' ? 'Quỹ kim cương khả dụng của môn chưa đủ cho thời lượng đã chọn.' : 'Your available subject diamond balance is not enough for this duration.'}</p>}
          </div>
        </Modal>
      )}

      {/* ─── Booking Detail Modal ─── */}
      {selectedParentBooking && (
        <Modal
          open
          onClose={() => setSelectedParentBooking(null)}
          title={lang === 'vi' ? 'Chi tiết lịch học' : 'Class Session Details'}
          footer={
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setSelectedParentBooking(null)}>
                {lang === 'vi' ? 'Đóng' : 'Close'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-2">
              <p className="text-[10px] font-bold uppercase text-indigo-700 tracking-wider">
                {lang === 'vi' ? 'Thời gian học' : 'Class Time'}
              </p>
              <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-500" />
                {dayFull[parseISODate(selectedParentBooking.requestedDate || todayISO).getDay()]}
                {` (${selectedParentBooking.requestedDate})`} · {selectedParentBooking.requestedStart} - {selectedParentBooking.requestedEnd}
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <TeacherAvatar
                  name={teacherNickname(teacherMap[selectedParentBooking.teacherId], selectedParentBooking.teacherCode, genericTeacherLabel)}
                  photoURL={teacherMap[selectedParentBooking.teacherId]?.photoURL}
                  country={teacherMap[selectedParentBooking.teacherId]?.country}
                  size={44}
                />
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">
                    {lang === 'vi' ? 'Gia sư' : 'Teacher'}
                  </span>
                  <span className="text-sm font-bold text-slate-800 block mt-1">{teacherNickname(teacherMap[selectedParentBooking.teacherId], selectedParentBooking.teacherCode, genericTeacherLabel)}</span>
                  {teacherMap[selectedParentBooking.teacherId]?.bio && (
                    <p className="text-[11px] text-slate-500 italic mt-1 leading-snug">"{teacherMap[selectedParentBooking.teacherId]?.bio}"</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-3 border-t border-slate-100">
                <Info className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">
                    {lang === 'vi' ? 'Môn học' : 'Subject'}
                  </span>
                  <span className="text-sm font-bold text-indigo-600 block mt-1">{selectedParentBooking.subjectName}</span>
                </div>
              </div>

              {(() => {
                const roomLink = roomLinkOf(selectedParentBooking)
                const subjectPkg = student.subjects?.find((s) => s.subjectId === selectedParentBooking.subjectId)
                return (
                  <>
                    {roomLink && (
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            {lang === 'vi' ? 'Phòng học trực tuyến' : 'Online Classroom'}
                          </span>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{roomLink}</p>
                        </div>
                        <a
                          href={roomLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 flex-shrink-0"
                        >
                          <Video className="w-3.5 h-3.5" />
                          {lang === 'vi' ? 'Vào lớp' : 'Join Class'}
                        </a>
                      </div>
                    )}
                    {subjectPkg?.timetableNote && (
                      <div className="pt-3 border-t border-slate-100">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                          {lang === 'vi' ? 'Ghi chú lịch học' : 'Timetable Note'}
                        </span>
                        <p className="text-xs text-slate-700 font-semibold leading-normal bg-amber-50/50 border border-amber-100/70 p-2.5 rounded-xl whitespace-pre-wrap">
                          {subjectPkg.timetableNote}
                        </p>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            {['pending', 'confirmed'].includes(selectedParentBooking.status) && (() => {
              const pendingRequest = cancellationRequests.find((item) => item.bookingId === selectedParentBooking.id && item.status === 'pending')

              if (pendingRequest) {
                return (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-black text-amber-900">{lang === 'vi' ? 'Yêu cầu hủy cũ đang được xử lý' : 'Previous cancellation is being processed'}</p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">{lang === 'vi' ? 'Bạn vẫn có thể bấm hủy để hệ thống xử lý tự động nếu buổi học còn cách ít nhất 1 giờ.' : 'You can still use automatic cancellation when the class is at least one hour away.'}</p>
                    <Button variant="danger" className="mt-3 w-full" onClick={() => openCancellationDialog(selectedParentBooking)}>
                      {lang === 'vi' ? 'Hủy tự động' : 'Cancel automatically'}
                    </Button>
                  </div>
                )
              }

              return (
                <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
                  <p className="text-sm font-black text-slate-900">{lang === 'vi' ? 'Bạn không thể tham gia buổi học?' : 'Cannot attend this class?'}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{lang === 'vi' ? 'Hủy trước giờ học ít nhất 1 giờ. Hệ thống sẽ hủy ngay và tự động trả lại số phút đang giữ.' : 'Cancel at least one hour before class. The system releases the class and held minutes immediately.'}</p>
                  <Button variant="danger" className="mt-3 w-full" onClick={() => openCancellationDialog(selectedParentBooking)}>
                    {lang === 'vi' ? 'Hủy buổi học' : 'Cancel class'}
                  </Button>
                </div>
              )
            })()}
          </div>
        </Modal>
      )}

      {cancellationDialog && (() => {
        const booking = cancellationDialog.booking
        const teacher = teacherMap[booking.teacherId]
        const teacherName = teacherNickname(teacher, booking.teacherCode, genericTeacherLabel)
        const courseName = !booking.subjectName?.trim() || /chưa\s*xếp|chua\s*xep/i.test(booking.subjectName)
          ? (lang === 'vi' ? 'Lớp học 1 kèm 1' : '1-on-1 class')
          : booking.subjectName
        const isBlocked = cancellationDialog.mode === 'blocked'
        if (cancellationDialog.mode === 'rebook') {
          return (
            <Modal open size="sm" onClose={() => setCancellationDialog(null)}>
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                  <Info className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight text-slate-950">{lang === 'vi' ? 'Chưa thể huỷ buổi này' : 'Cannot cancel yet'}</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    {lang === 'vi'
                      ? 'Bạn còn 1 buổi đã huỷ nhưng chưa đặt lại. Hãy đặt lại buổi đó trước khi huỷ buổi tiếp theo.'
                      : 'You still have a cancelled session that has not been rebooked. Please rebook it before cancelling another one.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
                  {lang === 'vi'
                    ? 'Kim cương của buổi đã huỷ đang được GIỮ để dành cho buổi đặt lại — không bị mất.'
                    : 'The diamonds from your cancelled session are being HELD for the rebooking — nothing is lost.'}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={() => setCancellationDialog(null)}>{lang === 'vi' ? 'Đóng' : 'Close'}</Button>
                  <Button className="bg-red-500 text-white hover:bg-red-600 focus:ring-red-300" onClick={() => { setCancellationDialog(null); setTab('booking'); setShowTeacherSuggestions(true) }}>{lang === 'vi' ? 'Đặt lại ngay' : 'Rebook now'}</Button>
                </div>
              </div>
            </Modal>
          )
        }
        return (
          <Modal open size="sm" onClose={() => !submittingCancellation && setCancellationDialog(null)}>
            <div className="space-y-5">
              <div className="text-center">
                <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${isBlocked ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>
                  <Info className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-xl font-black tracking-tight text-slate-950">
                  {isBlocked
                    ? (lang === 'vi' ? 'Không thể hủy buổi học' : 'Class cannot be cancelled')
                    : (lang === 'vi' ? 'Hủy buổi học?' : 'Cancel this class?')}
                </h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  {isBlocked
                    ? (lang === 'vi' ? 'Buổi học chỉ được hủy trước giờ bắt đầu ít nhất 1 giờ.' : 'A class can only be cancelled at least one hour before it starts.')
                    : (lang === 'vi' ? 'Kiểm tra lại thông tin. Sau khi xác nhận, lịch sẽ được hủy ngay.' : 'Review the class details. The cancellation takes effect immediately after confirmation.')}
                </p>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <div><p className="text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Thời gian' : 'Time'}</p><p className="mt-0.5 font-bold text-slate-900">{booking.requestedDate?.split('-').reverse().join('/')} · {booking.requestedStart} - {booking.requestedEnd}</p></div>
                </div>
                <div className="flex items-start gap-3">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <div><p className="text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Gia sư' : 'Teacher'}</p><p className="mt-0.5 font-bold text-slate-900">{teacherName}</p></div>
                </div>
                <div className="flex items-start gap-3">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <div><p className="text-xs font-semibold text-slate-500">{lang === 'vi' ? 'Khóa học' : 'Course'}</p><p className="mt-0.5 font-bold text-slate-900">{courseName}</p></div>
                </div>
              </div>

              {isBlocked ? (
                <>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm leading-6 text-amber-900">
                    {lang === 'vi' ? 'Nếu cần hỗ trợ khẩn cấp, vui lòng liên hệ trung tâm để được kiểm tra.' : 'For urgent support, please contact the center for assistance.'}
                  </div>
                  <Button fullWidth className="bg-gradient-to-b from-brand-400 to-brand-500 text-brand-900 hover:brightness-105" onClick={() => setCancellationDialog(null)}>
                    {lang === 'vi' ? 'Đã hiểu' : 'Understood'}
                  </Button>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-800">{lang === 'vi' ? 'Lý do hủy (không bắt buộc)' : 'Cancellation reason (optional)'}</label>
                    <textarea
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                      rows={3}
                      placeholder={lang === 'vi' ? 'Nhập lý do nếu bạn muốn lưu lại ghi chú' : 'Add an optional note for this cancellation'}
                      className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
                    {lang === 'vi'
                      ? `Hệ thống sẽ huỷ ngay và ${getBookingPoints(booking, teacherMap[booking.teacherId])} kim cương sẽ được GIỮ để bạn đặt lại một buổi mới (không hoàn về quỹ khả dụng). Bạn cần đặt lại trước khi huỷ buổi khác.`
                      : `The class is cancelled immediately and ${getBookingPoints(booking, teacherMap[booking.teacherId])} diamonds are HELD for you to rebook a new session (not returned to your available balance). You must rebook before cancelling another class.`}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" disabled={submittingCancellation} onClick={() => setCancellationDialog(null)}>{lang === 'vi' ? 'Đóng' : 'Close'}</Button>
                    <Button variant="danger" loading={submittingCancellation} onClick={submitCancellationRequest}>{lang === 'vi' ? 'Xác nhận hủy' : 'Confirm cancellation'}</Button>
                  </div>
                </>
              )}
            </div>
          </Modal>
        )
      })()}

      {/* ─── Lesson Detail Modal (Xem chi tiết) ─── */}
      {detailLesson && (
        <BottomSheet
          open
          size="md"
          mobileHeight="compact"
          onClose={() => setDetailLesson(null)}
          title={lang === 'vi' ? 'Chi tiết buổi học' : 'Lesson Details'}
        >
          <div className="mx-auto w-full max-w-xl space-y-5">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <TeacherAvatar
                name={teacherNickname(teacherMap[detailLesson.teacherId], detailLesson.teacherCode, genericTeacherLabel)}
                photoURL={teacherMap[detailLesson.teacherId]?.photoURL}
                country={teacherMap[detailLesson.teacherId]?.country}
                size={48}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-950">{teacherNickname(teacherMap[detailLesson.teacherId], detailLesson.teacherCode, genericTeacherLabel)}</p>
                {detailLesson.subjectName?.trim() && !/chưa\s*xếp|chua\s*xep/i.test(detailLesson.subjectName) && <p className="truncate text-xs font-semibold text-slate-500">{detailLesson.subjectName}</p>}
                <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                  {detailLesson.date} · {detailLesson.minutes} {lang === 'vi' ? 'phút' : 'min'}
                </p>
              </div>
              {typeof detailLesson.rating === 'number' && detailLesson.rating > 0 && (
                <span className="ml-auto flex items-center gap-1 bg-amber-50 border border-amber-200/70 text-amber-600 text-xs font-bold px-2.5 py-1 rounded-full">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {detailLesson.rating.toFixed(1)}
                </span>
              )}
            </div>

            {(detailLesson.book || detailLesson.pages) && (
              <div className="grid grid-cols-1 gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 sm:grid-cols-2">
                {detailLesson.book && (
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 ring-1 ring-sky-100"><BookOpen className="h-4 w-4" /></span>
                    <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{lang === 'vi' ? 'Sách học' : 'Book'}</p>
                    <p className="text-xs font-bold text-[#3BB8EB] mt-0.5 break-words">{detailLesson.book}</p>
                    </div>
                  </div>
                )}
                {detailLesson.pages && (
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 ring-1 ring-sky-100"><FileText className="h-4 w-4" /></span>
                    <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{lang === 'vi' ? 'Trang học' : 'Pages'}</p>
                    <p className="text-xs font-bold text-slate-700 mt-0.5 break-words">{detailLesson.pages}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(detailLesson.report || detailLesson.comment) && (
              <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">
                  <MessageSquareText className="h-4 w-4" />
                  {lang === 'vi' ? 'Nhận xét của gia sư' : 'Teacher Feedback'}
                </p>
                {(() => {
                  // Buổi cũ chỉ có chuỗi nhận xét -> đọc ngược thành 3 mục cho đồng nhất
                  const detailReport = detailLesson.report || parseLegacyLessonReport(detailLesson.comment || '')
                  return detailReport ? (
                  <div className="space-y-3">
                    {[
                      { label: lang === 'vi' ? 'Kiến thức bài học' : 'Lesson knowledge', value: detailReport.knowledgeComment, done: detailReport.knowledgeDone, icon: Lightbulb },
                      { label: lang === 'vi' ? 'Trò chơi tương tác' : 'Interactive games', value: detailReport.gamesComment, done: detailReport.gamesDone, icon: PlayCircle },
                      { label: lang === 'vi' ? 'Bài tập luyện tập' : 'Practice exercises', value: detailReport.exercisesComment, done: detailReport.exercisesDone, icon: ClipboardCheck },
                    ].map((row) => {
                      const RowIcon = row.icon
                      return (
                        <div key={row.label} className="flex items-start gap-3 rounded-xl bg-emerald-50/60 p-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700 ring-1 ring-emerald-100"><RowIcon className="h-4 w-4" /></span>
                          <p className="min-w-0 text-sm leading-6 text-slate-700"><span className="font-extrabold text-slate-900">{row.label}:</span> {cleanLessonText(row.value) || (row.done ? (lang === 'vi' ? 'Đã hoàn thành' : 'Completed') : (lang === 'vi' ? 'Chưa hoàn thành' : 'Not completed'))}</p>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="relative pl-4">
                    <span className="absolute bottom-1 left-0 top-1 w-[3px] rounded-full bg-emerald-400" />
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{cleanLegacyFeedback(detailLesson.comment || '')}</p>
                  </div>
                )
                })()}
              </div>
            )}

            {detailLesson.homework && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50/65 p-4">
                <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-700">
                  <ClipboardCheck className="h-4 w-4" />
                  {lang === 'vi' ? 'Bài tập về nhà' : 'Homework'}
                </p>
                <div className="relative pl-4">
                  <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-amber-400 rounded-full" />
                  <p className="whitespace-pre-wrap text-sm font-medium leading-6 text-slate-700">{cleanLessonText(detailLesson.homework)}</p>
                </div>
              </div>
            )}

            {detailLesson.imageURLs && detailLesson.imageURLs.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2">
                  {lang === 'vi' ? 'Hình ảnh buổi học' : 'Lesson Images'}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {detailLesson.imageURLs.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt={`Ảnh ${idx + 1}`}
                      className="w-20 h-20 rounded-xl object-cover ring-1 ring-slate-200/70 cursor-pointer hover:ring-2 hover:ring-sky-400 hover:scale-[1.03] transition-all duration-200"
                      onClick={() => setViewImage(url)}
                    />
                  ))}
                </div>
              </div>
            )}

            {!detailLesson.comment && !detailLesson.homework && (!detailLesson.imageURLs || detailLesson.imageURLs.length === 0) && (
              <p className="text-xs text-slate-400 text-center py-4">
                {lang === 'vi' ? 'Buổi học chưa có ghi chú chi tiết' : 'No detailed notes for this lesson'}
              </p>
            )}
          </div>
        </BottomSheet>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: HOME
// ─────────────────────────────────────────────────────────────────────────────
function HomeTab({ student, usedPct, stats, insights, nextBooking, teacherMap, roomLinkOf, dayFull, onGoTab, lang }: {
  student: Student
  usedPct: number
  stats: { total: number; used: number; held: number; available: number }
  insights: { avgMin: number; totalMin: number; last30Count: number; consistency: string }
  nextBooking: BookingRequest | null
  teacherMap: Record<string, TeacherLite>
  roomLinkOf: (b: BookingRequest | null) => string
  dayFull: string[]
  onGoTab: (t: ParentTab) => void
  lang: string
}) {
  const genericTeacherLabel = lang === 'vi' ? 'Gia sư' : 'Teacher'
  return (
    <div className="space-y-6">
      {/* Hero progress card */}
      <section className="animate-slide-up">
        <div className="relative bg-gradient-to-br from-slate-950 via-sky-950 to-sky-600 rounded-3xl p-7 text-white shadow-[0_20px_60px_-15px_rgba(2,132,199,0.4)] overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#FFD600]/15 rounded-full blur-[80px]" />
          <div className="absolute -bottom-24 -left-16 w-56 h-56 bg-sky-500/30 rounded-full blur-[100px]" />

          <div className="relative z-10">
            <p className="text-[11px] uppercase tracking-[0.2em] text-sky-200/80 font-medium mb-1">
              {lang === 'vi' ? 'Tiến độ học tập' : 'Learning Progress'}
            </p>
            <h2 className="text-[28px] font-bold leading-none mb-6 tracking-tight">
              {usedPct}<span className="text-sky-200/80 text-xl font-medium">% {lang === 'vi' ? 'hoàn thành' : 'completed'}</span>
            </h2>

            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-7">
              <div
                className="h-full bg-gradient-to-r from-[#FFD600] via-emerald-400 to-sky-300 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${usedPct}%` }}
              />
            </div>

            <div className="grid grid-cols-4 divide-x divide-white/15">
              {[
                { label: lang === 'vi' ? 'Tổng kim cương' : 'Total diamonds', val: stats.total, color: 'text-white' },
                { label: lang === 'vi' ? 'Đã học' : 'Completed', val: stats.used, color: 'text-sky-200' },
                { label: lang === 'vi' ? 'Giữ chỗ' : 'Booked', val: stats.held, color: stats.held > 0 ? 'text-[#FFD600]' : 'text-sky-100/70' },
                { label: lang === 'vi' ? 'Khả dụng' : 'Available', val: stats.available, color: stats.available <= 0 ? 'text-rose-200' : 'text-emerald-300' },
              ].map((s) => (
                <div key={s.label} className="px-3 first:pl-0 last:pr-0">
                  <p className={`text-[26px] sm:text-[32px] font-bold leading-none tracking-tight ${s.color}`}>{s.val}</p>
                  <p className="text-[10px] sm:text-[11px] text-sky-100/80 mt-2 tracking-wide font-medium">{s.label}</p>
                  <DiamondPointsIcon className="mt-1 h-3.5 w-3.5 text-violet-200" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Next lesson card */}
      {nextBooking && (
        <section className="animate-slide-up [animation-delay:60ms]">
          <div className="bg-white border border-slate-200/70 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center flex-shrink-0">
              <CalendarCheck2 className="w-5 h-5 text-sky-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {lang === 'vi' ? 'Lịch sắp tới' : 'Upcoming Class'}
              </p>
              <p className="text-[13px] font-bold text-slate-900 mt-0.5 truncate">
                {dayFull[parseISODate(nextBooking.requestedDate || '').getDay()]}, {nextBooking.requestedDate?.split('-').reverse().join('/')} · {nextBooking.requestedStart}
              </p>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                {teacherNickname(teacherMap[nextBooking.teacherId], nextBooking.teacherCode, genericTeacherLabel)} · {nextBooking.subjectName}
              </p>
            </div>
            {roomLinkOf(nextBooking) && (
              <a
                href={roomLinkOf(nextBooking)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2.5 bg-gradient-to-b from-brand-400 to-brand-500 text-brand-900 hover:brightness-105 text-xs font-bold rounded-xl shadow-md shadow-brand-200/60 transition-all flex items-center gap-1.5 flex-shrink-0 hover:-translate-y-0.5"
              >
                <Video className="w-3.5 h-3.5" />
                {lang === 'vi' ? 'Vào lớp' : 'Join'}
              </a>
            )}
          </div>
        </section>
      )}

      {/* Classroom link */}
      {student.classroomURL && (
        <section className="animate-slide-up [animation-delay:90ms]">
          <div className="bg-sky-50 border border-sky-200/70 rounded-2xl p-5 flex items-center justify-between gap-4 shadow-sm shadow-sky-100">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                {lang === 'vi' ? 'Phòng học trực tuyến' : 'Online Classroom'}
              </h3>
              <p className="text-xs text-slate-500 leading-normal">
                {lang === 'vi' ? 'Bấm vào đây để tham gia lớp học trực tuyến cùng gia sư.' : 'Click here to join the online classroom with the teacher.'}
              </p>
            </div>
            <a
              href={student.classroomURL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-gradient-to-b from-brand-400 to-brand-500 text-brand-900 hover:brightness-105 text-xs font-bold rounded-xl shadow-md shadow-brand-200 hover:shadow-brand-300 transition-all flex items-center gap-1.5 flex-shrink-0"
            >
              {lang === 'vi' ? 'Vào học ngay' : 'Join Class Now'}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </section>
      )}

      {/* Quick insights */}
      <section className="grid grid-cols-2 gap-3 animate-slide-up [animation-delay:120ms]">
        <div className="bg-white border border-slate-200/70 rounded-2xl p-4 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            {lang === 'vi' ? 'Buổi 30 ngày qua' : 'Sessions last 30 days'}
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1.5 tracking-tight">{insights.last30Count}</p>
          <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{insights.consistency}</p>
        </div>
        <div className="bg-white border border-slate-200/70 rounded-2xl p-4 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            {lang === 'vi' ? 'Thời lượng TB' : 'Avg Duration'}
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1.5 tracking-tight">
            {insights.avgMin} <span className="text-sm font-medium text-slate-500">{lang === 'vi' ? 'phút/buổi' : 'min/session'}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
            {lang === 'vi' ? `Tổng ${insights.totalMin} phút đã học` : `Total ${insights.totalMin} min completed`}
          </p>
        </div>
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-3 gap-3 animate-slide-up [animation-delay:150ms]">
        {[
          { key: 'booking' as ParentTab, icon: CalendarPlus, label: lang === 'vi' ? 'Đặt lịch học' : 'Book Class', color: 'text-sky-600 bg-sky-50 border-sky-100' },
          { key: 'history' as ParentTab, icon: History, label: lang === 'vi' ? 'Lịch sử học' : 'History', color: 'text-sky-600 bg-sky-50 border-sky-100' },
          { key: 'profile' as ParentTab, icon: GraduationCap, label: lang === 'vi' ? 'Khóa học' : 'Courses', color: 'text-sky-600 bg-sky-50 border-sky-100' },
        ].map(({ key, icon: Icon, label, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => onGoTab(key)}
            className="bg-white border border-slate-200/70 rounded-2xl p-4 flex flex-col items-center gap-2.5 hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-300"
          >
            <span className={`w-11 h-11 rounded-2xl border flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </span>
            <span className="text-[11px] font-bold text-slate-700">{label}</span>
          </button>
        ))}
      </section>

      {/* Next teacher preview */}
      {nextBooking && teacherMap[nextBooking.teacherId] && (
        <section className="animate-slide-up [animation-delay:180ms]">
          <div className="bg-white border border-slate-200/70 rounded-2xl p-4 flex items-center gap-3">
            <TeacherAvatar
              name={teacherNickname(teacherMap[nextBooking.teacherId], nextBooking.teacherCode, genericTeacherLabel)}
              photoURL={teacherMap[nextBooking.teacherId]?.photoURL}
              country={teacherMap[nextBooking.teacherId]?.country}
              size={44}
            />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {lang === 'vi' ? 'Gia sư buổi tới' : 'Next Teacher'}
              </p>
              <p className="text-[13px] font-bold text-slate-900 truncate mt-0.5">{teacherNickname(teacherMap[nextBooking.teacherId], nextBooking.teacherCode, genericTeacherLabel)}</p>
              {teacherMap[nextBooking.teacherId]?.bio && (
                <p className="text-[11px] text-slate-500 italic truncate mt-0.5">"{teacherMap[nextBooking.teacherId]?.bio}"</p>
              )}
            </div>
            <Sparkles className="w-4 h-4 text-amber-400 ml-auto flex-shrink-0" />
          </div>
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: ĐẶT LỊCH (calendar view of booked sessions + link to booking flow)
// ─────────────────────────────────────────────────────────────────────────────
export function LegacyBookingTab({ bookings, upcomingBookings, nextBooking, teacherMap, roomLinkOf, dayFull, onSelectBooking, lang, onPickTeacher }: {
  bookings: BookingRequest[]
  upcomingBookings: BookingRequest[]
  nextBooking: BookingRequest | null
  teacherMap: Record<string, TeacherLite>
  roomLinkOf: (b: BookingRequest | null) => string
  dayFull: string[]
  onSelectBooking: (b: BookingRequest) => void
  lang: string
  onPickTeacher: () => void
}) {
  const genericTeacherLabel = lang === 'vi' ? 'Gia sư' : 'Teacher'
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [showAllUpcoming, setShowAllUpcoming] = useState(false)
  const [selectedDayISO, setSelectedDayISO] = useState<string | null>(null)

  const todayISO = getLocalISODate(new Date())

  // Bookings grouped by date (only active holds — not yet turned into lessons)
  const bookingsByDate = useMemo(() => {
    const map: Record<string, BookingRequest[]> = {}
    for (const b of bookings) {
      if (!b.requestedDate || b.lessonId) continue
      if (!map[b.requestedDate]) map[b.requestedDate] = []
      map[b.requestedDate].push(b)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.requestedStart || '').localeCompare(b.requestedStart || ''))
    }
    return map
  }, [bookings])

  // Calendar matrix: weeks starting Monday
  const weeks = useMemo(() => {
    const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1)
    const start = new Date(first)
    const dow = (first.getDay() + 6) % 7 // Mon=0 ... Sun=6
    start.setDate(first.getDate() - dow)
    const out: { date: Date; iso: string; inMonth: boolean }[][] = []
    const cursor = new Date(start)
    for (let w = 0; w < 6; w++) {
      const row: { date: Date; iso: string; inMonth: boolean }[] = []
      for (let d = 0; d < 7; d++) {
        row.push({
          date: new Date(cursor),
          iso: getLocalISODate(cursor),
          inMonth: cursor.getMonth() === calMonth.getMonth(),
        })
        cursor.setDate(cursor.getDate() + 1)
      }
      out.push(row)
      // Stop early if next row is entirely next month
      if (cursor.getMonth() !== calMonth.getMonth() && cursor.getDate() > 7) break
    }
    return out
  }, [calMonth])

  const selectedDayBookings = selectedDayISO ? bookingsByDate[selectedDayISO] || [] : []
  const weekHeader = lang === 'vi' ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="space-y-6">
      {/* Banner */}
      <section className="animate-slide-up">
        <div className="relative bg-gradient-to-r from-sky-100 via-sky-50 to-indigo-50 border border-sky-200/60 rounded-2xl p-5 overflow-hidden">
          <div className="absolute -right-6 -top-6 w-28 h-28 bg-[#3BB8EB]/10 rounded-full blur-xl" />
          <div className="relative z-10 pr-14">
            <p className="text-[13px] font-extrabold text-[#1e3a8a] leading-snug uppercase">
              {lang === 'vi' ? 'Học tiếng Anh online' : 'Learn English Online'}
              <br />
              {lang === 'vi' ? '1 kèm 1 cùng gia sư' : '1-on-1 with teachers'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1.5 font-medium">
              {lang === 'vi' ? 'Linh hoạt thời gian, học mọi lúc mọi nơi' : 'Flexible time, learn anywhere'}
            </p>
          </div>
          <CalendarCheck2 className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 text-[#3BB8EB]/40" />
        </div>
      </section>

      {/* Booking flow buttons — points to the existing booking page */}
      <section className="grid grid-cols-2 gap-3 animate-slide-up [animation-delay:50ms]">
        <button
          type="button"
          onClick={onPickTeacher}
          className="bg-white border border-sky-200/80 text-[#2196F3] rounded-2xl py-3 px-4 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-sky-50 hover:-translate-y-0.5 active:scale-95 transition-all duration-300 shadow-sm"
        >
          <UserIcon className="w-4 h-4" />
          {lang === 'vi' ? 'Chọn gia sư' : 'Choose Teacher'}
        </button>
        <button
          type="button"
          onClick={onPickTeacher}
          className="bg-white border border-sky-200/80 text-[#2196F3] rounded-2xl py-3 px-4 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-sky-50 hover:-translate-y-0.5 active:scale-95 transition-all duration-300 shadow-sm"
        >
          <Clock className="w-4 h-4" />
          {lang === 'vi' ? 'Chọn thời gian' : 'Choose Time'}
        </button>
      </section>

      {/* Month calendar */}
      <section className="animate-slide-up [animation-delay:100ms]">
        <div className="bg-white border border-slate-200/70 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => { setCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)); setSelectedDayISO(null) }}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition active:scale-90"
              aria-label={lang === 'vi' ? 'Tháng trước' : 'Previous month'}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-extrabold text-slate-800 tracking-tight">
              {lang === 'vi' ? 'Tháng' : ''} {calMonth.getMonth() + 1}/{calMonth.getFullYear()}
            </p>
            <button
              type="button"
              onClick={() => { setCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)); setSelectedDayISO(null) }}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition active:scale-90"
              aria-label={lang === 'vi' ? 'Tháng sau' : 'Next month'}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {weekHeader.map((d, i) => (
              <div key={d} className={`text-center text-[10px] font-bold py-1 ${i === 6 ? 'text-rose-400' : i === 5 ? 'text-[#3BB8EB]' : 'text-slate-400'}`}>
                {d}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {weeks.map((row, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {row.map((cell) => {
                  const dayBookings = bookingsByDate[cell.iso] || []
                  const isToday = cell.iso === todayISO
                  const isSelected = cell.iso === selectedDayISO
                  const dow = cell.date.getDay()
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      disabled={dayBookings.length === 0}
                      onClick={() => setSelectedDayISO(isSelected ? null : cell.iso)}
                      className={`relative rounded-xl min-h-[52px] pt-1.5 pb-1 flex flex-col items-center transition-all duration-200 ${
                        isSelected
                          ? 'bg-[#3BB8EB] shadow-md shadow-brand-200'
                          : isToday
                          ? 'bg-sky-50 ring-1 ring-[#3BB8EB]/40'
                          : dayBookings.length > 0
                          ? 'hover:bg-sky-50/70 active:scale-95'
                          : ''
                      } ${dayBookings.length === 0 ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <span className={`text-[12px] font-bold leading-none ${
                        isSelected ? 'text-white'
                        : !cell.inMonth ? 'text-slate-300'
                        : dow === 0 ? 'text-rose-400'
                        : dow === 6 ? 'text-[#3BB8EB]'
                        : 'text-slate-700'
                      }`}>
                        {cell.date.getDate()}
                      </span>
                      {dayBookings.length > 0 && (
                        <span className={`mt-1 text-[8px] font-bold px-1 py-0.5 rounded-md leading-none flex items-center gap-0.5 ${
                          isSelected ? 'bg-white/25 text-white' : 'bg-sky-100 text-sky-700'
                        }`}>
                          <CalendarCheck2 className="w-2 h-2" />
                          {dayBookings[0].requestedStart}
                          {dayBookings.length > 1 && ` +${dayBookings.length - 1}`}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Legend + view all */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
              {lang === 'vi' ? 'Đã đặt lịch' : 'Booked'}
            </span>
            <button
              type="button"
              onClick={() => setShowAllUpcoming(v => !v)}
              className="text-[11px] font-bold text-[#3BB8EB] hover:text-[#2196F3] flex items-center gap-0.5 transition"
            >
              {lang === 'vi' ? 'Xem tất cả lịch đã đặt' : 'View all booked classes'}
              <ChevronRightIcon className={`w-3.5 h-3.5 transition-transform duration-300 ${showAllUpcoming ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {/* Selected day details */}
      {selectedDayISO && selectedDayBookings.length > 0 && (
        <section className="animate-slide-up">
          <div className="bg-white border border-sky-200/70 rounded-2xl p-4 space-y-2.5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {dayFull[parseISODate(selectedDayISO).getDay()]}, {selectedDayISO.split('-').reverse().join('/')}
            </p>
            {selectedDayBookings.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelectBooking(b)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-slate-50/80 hover:bg-sky-50 border border-slate-100 transition text-left active:scale-[0.98]"
              >
                <TeacherAvatar
                  name={teacherNickname(teacherMap[b.teacherId], b.teacherCode, genericTeacherLabel)}
                  photoURL={teacherMap[b.teacherId]?.photoURL}
                  country={teacherMap[b.teacherId]?.country}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">{teacherNickname(teacherMap[b.teacherId], b.teacherCode, genericTeacherLabel)} · {b.subjectName}</p>
                  <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">{b.requestedStart} - {b.requestedEnd}</p>
                </div>
                <ChevronRightIcon className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* All upcoming list */}
      {showAllUpcoming && (
        <section className="animate-slide-up">
          <div className="bg-white border border-slate-200/70 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {upcomingBookings.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">
                {lang === 'vi' ? 'Chưa có lịch học nào sắp tới' : 'No upcoming classes'}
              </p>
            ) : (
              upcomingBookings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onSelectBooking(b)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition text-left"
                >
                  <div className="w-11 text-center flex-shrink-0">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">{(lang === 'vi' ? DAY_LABELS_VI : DAY_LABELS_EN)[parseISODate(b.requestedDate || '').getDay()]}</p>
                    <p className="text-lg font-extrabold text-slate-800 leading-none mt-0.5">{parseISODate(b.requestedDate || '').getDate()}</p>
                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">T{parseISODate(b.requestedDate || '').getMonth() + 1}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{teacherNickname(teacherMap[b.teacherId], b.teacherCode, genericTeacherLabel)} · {b.subjectName}</p>
                    <p className="text-[11px] text-slate-500 tabular-nums mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {b.requestedStart} - {b.requestedEnd}
                    </p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${b.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    {b.status === 'confirmed' ? (lang === 'vi' ? 'Đã xếp' : 'Confirmed') : (lang === 'vi' ? 'Chờ xếp' : 'Pending')}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      )}

      {/* Upcoming highlight card */}
      {nextBooking && (
        <section className="animate-slide-up [animation-delay:150ms]">
          <div className="bg-white border border-slate-200/70 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center flex-shrink-0">
              <CalendarCheck2 className="w-5 h-5 text-[#3BB8EB]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {lang === 'vi' ? 'Lịch sắp tới' : 'Upcoming Class'}
              </p>
              <p className="text-[13px] font-bold text-slate-900 mt-0.5 truncate">
                {dayFull[parseISODate(nextBooking.requestedDate || '').getDay()]}, {nextBooking.requestedDate?.split('-').reverse().join('/')} · {nextBooking.requestedStart}
              </p>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                {teacherNickname(teacherMap[nextBooking.teacherId], nextBooking.teacherCode, genericTeacherLabel)} · {nextBooking.subjectName}
              </p>
            </div>
            {roomLinkOf(nextBooking) && (
              <a
                href={roomLinkOf(nextBooking)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2.5 bg-[#3BB8EB] hover:bg-[#2da8db] text-white text-xs font-bold rounded-xl shadow-md shadow-brand-200/60 transition-all flex items-center gap-1.5 flex-shrink-0 hover:-translate-y-0.5"
              >
                <Video className="w-3.5 h-3.5" />
                {lang === 'vi' ? 'Vào lớp' : 'Join'}
              </a>
            )}
          </div>
        </section>
      )}

      {/* Notes */}
      <section className="animate-slide-up [animation-delay:200ms]">
        <div className="bg-amber-50/60 border border-amber-200/60 rounded-2xl p-4">
          <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-2">
            <Lightbulb className="w-4 h-4" />
            {lang === 'vi' ? 'Lưu ý' : 'Notes'}
          </p>
          <ul className="text-[11px] text-slate-600 space-y-1.5 font-medium list-disc pl-4">
            <li>{lang === 'vi' ? 'Thời gian học tính theo giờ Việt Nam (GMT+7).' : 'Class times follow Vietnam time (GMT+7).'}</li>
            <li>{lang === 'vi' ? 'Vui lòng vào lớp trước giờ học 5 phút.' : 'Please join the class 5 minutes early.'}</li>
            <li>{lang === 'vi' ? 'Hủy trước giờ học ít nhất 1 giờ để hệ thống tự động trả lại số phút đang giữ.' : 'Cancel at least one hour before class so held minutes are released automatically.'}</li>
          </ul>
        </div>
      </section>
    </div>
  )
}

// TAB: LỊCH SỬ
// Dữ liệu báo cáo mới được đọc trực tiếp từ `report`; `comment` chỉ là fallback
// cho các buổi cũ để không phải migrate hoặc ghi đè dữ liệu đang có.
function cleanLegacyFeedback(value: string) {
  return value
    .split('\n')
    .map((line) => line
      .replace(/\u{1F4D6}|\u{2B50}/gu, '')
      .replace(/([123])\uFE0F?\u20E3/gu, '$1.')
      .replace(/\u2713/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim())
    .filter((line) => line && !/^Chấm điểm buổi học:/i.test(line))
    .join('\n')
    .replace(/\s+([123]\.)\s+/g, '\n$1 ')
    .replace(/\s+(Bài tập về nhà:)\s*/gi, '\n$1 ')
}

function cleanLessonText(value: string) {
  return value
    .replace(/([0-9])\uFE0F?\u20E3/gu, '$1.')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\uFE0F|\u20E3/gu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,:;])/g, '$1')
    .trim()
}

function HistoryTab({ lessons, teacherMap, subjectPackages, rewardPoints, teacherReviews, onDetail, onTeacherProfile, onRateTeacher, onRebook, onRewards, lang }: {
  lessons: Lesson[]
  teacherMap: Record<string, TeacherLite>
  subjectPackages: StudentSubject[]
  rewardPoints: number
  teacherReviews: Record<string, number>
  onDetail: (lesson: Lesson) => void
  onTeacherProfile: (teacherId: string) => void
  onRateTeacher: (lesson: Lesson, rating: number) => Promise<void>
  onRebook: () => void
  onRewards: () => void
  lang: string
}) {
  const genericTeacherLabel = lang === 'vi' ? 'Gia sư' : 'Teacher'
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [ratingDrafts, setRatingDrafts] = useState<Record<string, number>>({})
  const [savingReview, setSavingReview] = useState('')

  const saveTeacherRating = async (lesson: Lesson) => {
    const rating = ratingDrafts[lesson.id]
    if (!rating || teacherReviews[lesson.id]) return
    setSavingReview(lesson.id)
    try {
      await onRateTeacher(lesson, rating)
    } catch (error) {
      console.error('Submit teacher rating failed:', error)
      toast.error(lang === 'vi' ? 'Chưa gửi được đánh giá. Vui lòng thử lại.' : 'Could not submit the rating. Please try again.')
    } finally {
      setSavingReview('')
    }
  }

  const months = useMemo(() => {
    const values = new Set<string>()
    lessons.forEach((lesson) => lesson.date && values.add(lesson.date.slice(0, 7)))
    return Array.from(values).sort().reverse()
  }, [lessons])

  const subjects = useMemo(() => {
    const values = new Map<string, string>()
    lessons.forEach((lesson) => {
      if (lesson.subjectId && lesson.subjectName && !/chưa\s*xếp|chua\s*xep/i.test(lesson.subjectName)) {
        values.set(lesson.subjectId, lesson.subjectName)
      }
    })
    return Array.from(values.entries())
  }, [lessons])

  const filtered = useMemo(() => lessons.filter((lesson) =>
    (subjectFilter === 'all' || lesson.subjectId === subjectFilter) &&
    (monthFilter === 'all' || lesson.date?.slice(0, 7) === monthFilter)
  ), [lessons, subjectFilter, monthFilter])

  const dayLabels = lang === 'vi' ? DAY_LABELS_VI : DAY_LABELS_EN

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-extrabold tracking-tight text-slate-950">{lang === 'vi' ? 'Lịch sử buổi học' : 'Lesson history'}</h2>
        <span className="text-xs font-semibold text-slate-400">{filtered.length} {lang === 'vi' ? 'buổi' : 'sessions'}</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,0.42fr)] gap-2">
        <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100">
          <option value="all">{lang === 'vi' ? 'Tất cả môn' : 'All subjects'}</option>
          {subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100">
          <option value="all">{lang === 'vi' ? 'Tất cả tháng' : 'All months'}</option>
          {months.map((month) => {
            const [year, monthNumber] = month.split('-')
            return <option key={month} value={month}>{lang === 'vi' ? `Tháng ${parseInt(monthNumber)}/${year}` : `${parseInt(monthNumber)}/${year}`}</option>
          })}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sky-200 bg-white py-14 text-center">
          <History className="mx-auto h-8 w-8 text-sky-300" />
          <p className="mt-3 text-sm font-extrabold text-slate-700">{lang === 'vi' ? 'Chưa có buổi học nào' : 'No lessons yet'}</p>
          <p className="mt-1 text-xs font-medium text-slate-400">{lang === 'vi' ? 'Buổi học xuất hiện sau khi được trung tâm duyệt.' : 'Lessons appear after center approval.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((lesson, index) => {
            const date = parseISODate(lesson.date)
            const monthKey = lesson.date?.slice(0, 7) || ''
            const previousMonthKey = index > 0 ? filtered[index - 1]?.date?.slice(0, 7) || '' : ''
            const showMonthHeader = index === 0 || monthKey !== previousMonthKey
            const teacher = teacherMap[lesson.teacherId]
            const storedTeacherHint = lesson.teacherCode || lesson.teacherName?.trim().split(/\s+/).slice(-1)[0] || ''
            const nickname = teacherNickname(teacher, storedTeacherHint, genericTeacherLabel)
            const subjectPackage = subjectPackages.find((item) => item.subjectId === lesson.subjectId)
            const rawDocumentLink = subjectPackage?.curriculumLink || ''
            const documentLink = rawDocumentLink ? (rawDocumentLink.startsWith('http') ? rawDocumentLink : `https://${rawDocumentLink}`) : ''
            // Buổi cũ chưa có `report` -> đọc ngược từ chuỗi nhận xét để hiển thị
            // giống hệt buổi mới (tránh cảnh mỗi ngày hiện một kiểu).
            const report = lesson.report || parseLegacyLessonReport(lesson.comment || '')
            const legacyFeedback = report ? '' : cleanLegacyFeedback(lesson.comment || '')
            const hasRating = typeof lesson.rating === 'number' && lesson.rating > 0
            const submittedTeacherRating = teacherReviews[lesson.id] || 0
            const selectedTeacherRating = submittedTeacherRating || ratingDrafts[lesson.id] || 0
            const reportRows = report ? [
              { label: lang === 'vi' ? 'Kiến thức bài học' : 'Lesson knowledge', value: report.knowledgeComment, done: report.knowledgeDone },
              { label: lang === 'vi' ? 'Trò chơi tương tác' : 'Interactive games', value: report.gamesComment, done: report.gamesDone },
              { label: lang === 'vi' ? 'Bài tập luyện tập' : 'Practice exercises', value: report.exercisesComment, done: report.exercisesDone },
            ] : []

            return (
              <div key={lesson.id}>
                {showMonthHeader && <p className="px-1 pb-2 pt-1 text-xs font-bold text-slate-400">{lang === 'vi' ? `Tháng ${date.getMonth() + 1}/${date.getFullYear()}` : `${date.toLocaleString('en', { month: 'long' })} ${date.getFullYear()}`}</p>}
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-34px_rgba(2,132,199,0.45)] sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-12 shrink-0 rounded-xl bg-sky-50 py-2 text-center ring-1 ring-sky-100">
                      <p className="text-[9px] font-extrabold uppercase leading-none text-sky-700">{dayLabels[date.getDay()]}</p>
                      <p className="text-xl font-extrabold leading-tight tabular-nums text-slate-900">{String(date.getDate()).padStart(2, '0')}</p>
                      <p className="text-[9px] font-bold leading-none text-slate-400">T{date.getMonth() + 1}</p>
                    </div>

                    <button type="button" disabled={!lesson.teacherId} onClick={() => lesson.teacherId && onTeacherProfile(lesson.teacherId)} className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2 disabled:cursor-default" aria-label={lang === 'vi' ? 'Xem hồ sơ gia sư' : 'View teacher profile'}>
                      <TeacherAvatar name={nickname} photoURL={teacher?.photoURL} country={teacher?.country} size={42} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-extrabold text-slate-950 transition-colors group-hover:text-sky-700">{nickname}</span>
                        {lesson.subjectName?.trim() && !/chưa\s*xếp|chua\s*xep/i.test(lesson.subjectName) && (
                          <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">{lesson.subjectName}</span>
                        )}
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-500">
                          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{lesson.minutes} {lang === 'vi' ? 'phút' : 'min'}</span>
                          <span className="inline-flex items-center gap-1 text-sky-700"><Video className="h-3.5 w-3.5" />{lang === 'vi' ? 'Đã học' : 'Completed'}</span>
                        </span>
                      </span>
                    </button>

                    <button type="button" onClick={onRebook} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-2.5 text-[11px] font-extrabold text-sky-700 transition hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-brand-300 active:scale-[0.97]">
                      <RotateCcw className="h-3.5 w-3.5" />{lang === 'vi' ? 'Đặt lại' : 'Rebook'}
                    </button>
                  </div>

                  <section className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-3.5 sm:p-4">
                    <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><MessageSquareText className="h-4 w-4 text-sky-600" />{lang === 'vi' ? 'Nhận xét của gia sư' : 'Teacher feedback'}</div>

                    {(lesson.book || lesson.pages) && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-white p-3 text-xs leading-5 text-slate-600 ring-1 ring-sky-100">
                        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                        <p><span className="font-extrabold text-slate-800">{lang === 'vi' ? 'Nội dung học' : 'Learning material'}:</span> {[lesson.book, lesson.pages].filter(Boolean).join(', ')}</p>
                      </div>
                    )}

                    {reportRows.length > 0 ? (
                      <div className="mt-3 space-y-2.5">
                        {reportRows.map((row) => (
                          <div key={row.label} className="flex items-start gap-2.5 text-xs leading-5 text-slate-600">
                            {row.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
                            <p><span className="font-extrabold text-slate-800">{row.label}:</span> {row.value}</p>
                          </div>
                        ))}
                      </div>
                    ) : legacyFeedback ? (
                      <p className="mt-3 whitespace-pre-line text-xs leading-5 text-slate-600">{legacyFeedback}</p>
                    ) : (
                      <p className="mt-3 text-xs font-medium text-slate-500">{lang === 'vi' ? 'Buổi học chưa có nhận xét chi tiết.' : 'No detailed feedback for this lesson.'}</p>
                    )}

                    <button type="button" onClick={() => onDetail(lesson)} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-extrabold text-sky-700 transition hover:bg-white active:scale-[0.98]"><FileText className="h-3.5 w-3.5" />{lang === 'vi' ? 'Xem chi tiết' : 'View details'}<ChevronRight className="h-3.5 w-3.5" /></button>
                  </section>

                  <section className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-2xl border border-sky-100 bg-white p-3.5">
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold text-slate-700">{lang === 'vi' ? 'Điểm gia sư dành cho bạn' : 'Your lesson score'}</p>
                      <div className="mt-2 flex items-center gap-1">
                        {Array.from({ length: 5 }, (_, starIndex) => <Star key={starIndex} className={`h-4 w-4 ${hasRating && starIndex < Number(lesson.rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />)}
                        <span className="ml-1 text-base font-extrabold tabular-nums text-slate-900">{hasRating ? Number(lesson.rating).toFixed(1) : '0.0'}<span className="text-xs text-slate-400">/5</span></span>
                      </div>
                    </div>
                    <button type="button" onClick={onRewards} className="flex min-w-[112px] items-center gap-2 rounded-xl bg-sky-50 px-3 text-left transition hover:bg-sky-100 active:scale-[0.98]">
                      <Gift className="h-5 w-5 shrink-0 text-sky-600" />
                      <span><span className="block text-[10px] font-bold text-slate-500">{lang === 'vi' ? 'Sao đang có' : 'Available stars'}</span><span className="block text-base font-extrabold tabular-nums text-slate-900">{rewardPoints}</span></span>
                    </button>
                  </section>

                  {lesson.teacherId && (
                    <section className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/55 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-extrabold text-slate-900">{lang === 'vi' ? 'Đánh giá gia sư' : 'Rate your teacher'}</p>
                          <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">
                            {submittedTeacherRating
                              ? (lang === 'vi' ? 'Cảm ơn bạn đã gửi đánh giá cho buổi học này.' : 'Thank you for rating this lesson.')
                              : (lang === 'vi' ? 'Chọn từ 1 đến 5 sao, sau đó bấm Gửi đánh giá.' : 'Choose 1 to 5 stars, then submit your rating.')}
                          </p>
                        </div>
                        {submittedTeacherRating > 0 && <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-black text-amber-700 ring-1 ring-amber-200">{submittedTeacherRating}/5</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-1" role="radiogroup" aria-label={lang === 'vi' ? 'Chọn số sao đánh giá gia sư' : 'Select teacher rating'}>
                          {Array.from({ length: 5 }, (_, index) => {
                            const star = index + 1
                            const active = star <= selectedTeacherRating
                            return (
                              <button
                                key={star}
                                type="button"
                                disabled={submittedTeacherRating > 0 || savingReview === lesson.id}
                                onClick={() => setRatingDrafts((current) => ({ ...current, [lesson.id]: star }))}
                                className="flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 active:scale-[0.94] disabled:cursor-default"
                                role="radio"
                                aria-checked={selectedTeacherRating === star}
                                aria-label={`${star} ${lang === 'vi' ? 'sao' : 'stars'}`}
                              >
                                <Star className={`h-6 w-6 transition ${active ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                              </button>
                            )
                          })}
                        </div>
                        {!submittedTeacherRating && (
                          <Button size="sm" loading={savingReview === lesson.id} disabled={!ratingDrafts[lesson.id] || !!savingReview} onClick={() => saveTeacherRating(lesson)} className="bg-gradient-to-b from-brand-400 to-brand-500 text-brand-900 hover:brightness-105">
                            {lang === 'vi' ? 'Gửi đánh giá' : 'Submit rating'}
                          </Button>
                        )}
                      </div>
                    </section>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {documentLink ? (
                      <a href={documentLink} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-white px-2 text-center text-[11px] font-extrabold text-sky-700 transition hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-brand-300 active:scale-[0.98]"><BookOpen className="h-4 w-4" />{lang === 'vi' ? 'Ôn tập tài liệu' : 'Review materials'}</a>
                    ) : (
                      <button type="button" disabled className="flex min-h-11 cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 text-center text-[11px] font-bold text-slate-400"><BookOpen className="h-4 w-4" />{lang === 'vi' ? 'Chưa có tài liệu' : 'No materials'}</button>
                    )}
                    <button type="button" onClick={() => onDetail(lesson)} disabled={!lesson.homework} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-brand-400 to-brand-500 px-2 text-center text-[11px] font-extrabold text-brand-900 transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><ClipboardCheck className="h-4 w-4" />{lesson.homework ? (lang === 'vi' ? 'Xem bài tập' : 'View homework') : (lang === 'vi' ? 'Chưa có bài tập' : 'No homework')}</button>
                  </div>
                </article>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: KHÓA HỌC (subject packages + learning analytics)
// ─────────────────────────────────────────────────────────────────────────────
function CoursesTab({ subjectPackages, bookings, monthlyData, durationData, insights, pieColors, lang }: {
  subjectPackages: NonNullable<Student['subjects']>
  bookings: BookingRequest[]
  monthlyData: { name: string; buoi: number; phut: number }[]
  durationData: { name: string; value: number; mins: number }[]
  insights: { avgMin: number; totalMin: number; last30Count: number; consistency: string }
  pieColors: string[]
  lang: string
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-4 animate-slide-up">
        <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight px-1">
          {lang === 'vi' ? 'Gói học phí các môn' : 'Subject Tuition Packages'}
        </h3>
        {subjectPackages.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200 rounded-2xl text-center py-14">
            <GraduationCap className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-medium">
              {lang === 'vi' ? 'Chưa có gói học nào' : 'No course packages yet'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subjectPackages.map((sub, i) => {
              const bookedMins = getHeldBookingMinutes(bookings, sub.subjectId)
              const availMins = Math.max(0, sub.remainingMinutes - bookedMins)
              const subPct = sub.totalMinutes > 0 ? Math.min(100, Math.round((sub.usedMinutes / sub.totalMinutes) * 100)) : 0

              return (
                <div
                  key={sub.subjectId}
                  className="bg-white border border-slate-200/70 rounded-2xl p-5 hover:shadow-lg hover:shadow-sky-100/50 hover:-translate-y-0.5 transition-all duration-300 animate-slide-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-4 h-4 text-[#3BB8EB]" />
                      </span>
                      <h4 className="font-bold text-slate-800 text-sm leading-tight truncate" title={sub.subjectName}>{sub.subjectName}</h4>
                    </div>
                    <span className="text-[10px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full font-bold flex-shrink-0">
                      {subPct}%
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 font-semibold mb-2">
                    {lang === 'vi' ? 'Tiến độ buổi học' : 'Lesson Progress'} · {Math.floor(sub.usedMinutes / (sub.minutesPerSession || 25))}/{Math.floor(sub.totalMinutes / (sub.minutesPerSession || 25))}
                  </p>

                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
                    <div
                      className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full transition-all duration-700"
                      style={{ width: `${subPct}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-center bg-slate-50/70 rounded-xl p-2.5 text-[10px]">
                    <div>
                      <p className="flex items-center justify-center gap-1 font-bold text-slate-700"><DiamondPointsIcon className="h-3 w-3 text-violet-500" />{sub.totalMinutes}</p>
                      <p className="text-[9px] text-slate-500 leading-none mt-1">
                        {lang === 'vi' ? 'Tổng' : 'Total'}
                      </p>
                    </div>
                    <div>
                      <p className="flex items-center justify-center gap-1 font-bold text-indigo-500"><DiamondPointsIcon className="h-3 w-3 text-violet-500" />{sub.usedMinutes}</p>
                      <p className="text-[9px] text-slate-500 leading-none mt-1">
                        {lang === 'vi' ? 'Đã học' : 'Completed'}
                      </p>
                    </div>
                    <div>
                      <p className="flex items-center justify-center gap-1 font-bold text-amber-600"><DiamondPointsIcon className="h-3 w-3 text-violet-500" />{bookedMins}</p>
                      <p className="text-[9px] text-slate-500 leading-none mt-1">
                        {lang === 'vi' ? 'Đã đặt' : 'Booked'}
                      </p>
                    </div>
                    <div>
                      <p className={`flex items-center justify-center gap-1 font-bold ${availMins <= 0 ? 'text-rose-500' : 'text-emerald-500'}`}><DiamondPointsIcon className="h-3 w-3 text-violet-500" />{availMins}</p>
                      <p className="text-[9px] text-slate-500 leading-none mt-1">
                        {lang === 'vi' ? 'Khả dụng' : 'Available'}
                      </p>
                    </div>
                  </div>

                  {sub.curriculumLink && (
                    <a
                      href={sub.curriculumLink.startsWith('http') ? sub.curriculumLink : `https://${sub.curriculumLink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 w-full py-2 rounded-xl bg-[#3BB8EB] hover:bg-[#2da8db] text-white text-[11px] font-bold transition-all duration-200 flex items-center justify-center gap-1.5 shadow-sm shadow-brand-200 active:scale-95"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      {lang === 'vi' ? 'Xem tài liệu học' : 'View Materials'}
                    </a>
                  )}
                  {sub.timetableNote && (
                    <div className="mt-3 pt-3 border-t border-slate-100/70">
                      <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                        {lang === 'vi' ? 'Ghi chú lịch học:' : 'Timetable note:'}
                      </span>
                      <p className="text-[11px] text-slate-700 font-medium whitespace-pre-wrap leading-normal bg-amber-50/50 border border-amber-100/70 p-2.5 rounded-xl">
                        {sub.timetableNote}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Analytics */}
      <section className="space-y-4 animate-slide-up [animation-delay:120ms]">
        <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight px-1">
          {lang === 'vi' ? 'Thống kê học tập' : 'Learning Analytics'}
        </h3>

        <div className="bg-white border border-slate-200/70 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">
            {lang === 'vi' ? 'Số buổi học 6 tháng gần nhất' : 'Sessions in last 6 months'}
          </p>
          <div className="h-44 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 0, left: -22 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(59,184,235,0.06)' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(value) => [`${value ?? 0} ${lang === 'vi' ? 'buổi' : 'sessions'}`, '']}
                />
                <Bar dataKey="buoi" fill="#0284c7" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {durationData.length > 0 && (
          <div className="bg-white border border-slate-200/70 rounded-2xl p-4">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              {lang === 'vi' ? 'Phân bổ thời lượng buổi học' : 'Session duration distribution'}
            </p>
            <div className="h-44 min-w-0 flex items-center">
              <ResponsiveContainer width="55%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={durationData} dataKey="value" nameKey="name" innerRadius={34} outerRadius={58} paddingAngle={3}>
                    {durationData.map((_, idx) => (
                      <Cell key={idx} fill={pieColors[idx % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {durationData.map((d, idx) => (
                  <div key={d.name} className="flex items-center gap-2 text-[11px]">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: pieColors[idx % pieColors.length] }} />
                    <span className="text-slate-600 font-semibold">{d.name}</span>
                    <span className="text-slate-400 ml-auto tabular-nums font-bold">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200/70 rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
              {lang === 'vi' ? 'Tổng phút đã học' : 'Total minutes'}
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1.5 tracking-tight">{insights.totalMin}</p>
          </div>
          <div className="bg-white border border-slate-200/70 rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
              {lang === 'vi' ? 'TB mỗi buổi' : 'Avg per session'}
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1.5 tracking-tight">
              {insights.avgMin} <span className="text-sm font-medium text-slate-500">{lang === 'vi' ? 'phút' : 'min'}</span>
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
