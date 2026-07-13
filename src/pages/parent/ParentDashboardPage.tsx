import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student, Lesson, BookingRequest, Teacher } from '@/types'
import {
  Search, LogOut, X, ExternalLink, ChevronLeft, ChevronRight, Info, Clock,
  User as UserIcon, Globe, Home, History, GraduationCap, CalendarPlus,
  Star, Video, BookOpen, CalendarCheck2, Lightbulb, ChevronRight as ChevronRightIcon,
  FileText, Sparkles, ArrowLeft,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '@/components/shared/Logo'
import { NotificationDrawer } from '@/components/shared/NotificationDrawer'
import { TeacherAvatar } from '@/components/shared/TeacherAvatar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useLanguageStore } from '@/stores/languageStore'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts'

const STORAGE_KEY = '123english_parent_session'

function saveSession(code: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, savedAt: Date.now() }))
}
function loadSession(): { code: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (Date.now() - data.savedAt > 30 * 24 * 60 * 60 * 1000) { localStorage.removeItem(STORAGE_KEY); return null }
    return { code: data.code }
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
      handleLogin(session.code).finally(() => setAutoLoading(false))
    } else {
      setAutoLoading(false)
    }
  }, [])

  const handleLogin = async (code?: string) => {
    setError('')
    const finalCode = (code || studentCode).trim().toUpperCase()
    if (!finalCode) { setError('Vui lòng nhập Mã học sinh'); return }

    setSearching(true)
    try {
      const q = query(collection(db, 'students'), where('code', '==', finalCode))
      const snap = await getDocs(q)
      if (snap.empty) { setError('Không tìm thấy học sinh với mã này'); return }

      const student = { id: snap.docs[0].id, ...snap.docs[0].data() } as Student

      const lq = query(collection(db, 'publicLessons'), where('studentId', '==', student.id), where('status', '==', 'approved'))
      const lSnap = await getDocs(lq)
      const lessons = lSnap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson))
      lessons.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))

      const bq = query(collection(db, 'bookingRequests'), where('studentId', '==', student.id), where('status', 'in', ['confirmed', 'pending']))
      const bSnap = await getDocs(bq)
      const bookings = bSnap.docs.map(d => ({ id: d.id, ...d.data() } as BookingRequest))

      saveSession(finalCode)
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
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-sky-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#3BB8EB] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">{lang === 'vi' ? 'Đang tải...' : 'Loading...'}</p>
        </div>
      </div>
    )
  }

  if (result) return <ParentView student={result.student} lessons={result.lessons} bookings={result.bookings} onBack={reset} />

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-sky-50 relative overflow-hidden">
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
          <div className="w-20 h-20 bg-gradient-to-br from-[#3BB8EB] to-[#2196F3] rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-sky-200/50 rotate-3 hover:rotate-0 transition-transform">
            <BookOpen className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mb-2">
            {lang === 'vi' ? 'Xin chào, Phụ huynh!' : 'Welcome, Parents!'}
          </h2>
          <p className="text-slate-500 text-sm max-w-xs mx-auto leading-relaxed">
            {lang === 'vi' ? 'Nhập mã học viên và SĐT để xem bài tập, nhận xét từ giáo viên' : 'Enter student code to view homework & teacher feedback'}
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
              className="w-full rounded-xl bg-[#FFE500]/5 border-2 border-[#FFE500]/30 text-slate-900 placeholder-slate-400 px-4 py-3.5 text-lg font-mono font-bold tracking-widest uppercase text-center focus:outline-none focus:ring-2 focus:ring-[#3BB8EB]/40 focus:border-[#3BB8EB] transition-all"
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
            className="w-full py-3.5 bg-[#3BB8EB] hover:bg-[#2da8db] text-white font-bold rounded-xl shadow-lg shadow-sky-200/50 hover:shadow-sky-300/50 hover:-translate-y-0.5 transition-all duration-300 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
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

// ─────────────────────────────────────────────────────────────────────────────
// Tab-based mobile-app style parent view
// Tabs: Home · Đặt Lịch · Lịch Sử · Khóa Học (bottom navigation)
// ─────────────────────────────────────────────────────────────────────────────

type ParentTab = 'home' | 'booking' | 'history' | 'courses'

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

interface TeacherLite {
  name: string
  photoURL?: string
  country?: string
}

function ParentView({ student, lessons, bookings, onBack }: { student: Student; lessons: Lesson[]; bookings: BookingRequest[]; onBack: () => void }) {
  const { lang, setLang } = useLanguageStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<ParentTab>('home')
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [selectedParentBooking, setSelectedParentBooking] = useState<BookingRequest | null>(null)
  const [detailLesson, setDetailLesson] = useState<Lesson | null>(null)
  const [teacherMap, setTeacherMap] = useState<Record<string, TeacherLite>>({})

  // Fetch photo + country of every teacher appearing in lessons/bookings (public read)
  useEffect(() => {
    const ids = new Set<string>()
    lessons.forEach(l => l.teacherId && ids.add(l.teacherId))
    bookings.forEach(b => b.teacherId && ids.add(b.teacherId))
    if (ids.size === 0) return

    Promise.all(
      Array.from(ids).map(async (id) => {
        try {
          const snap = await getDoc(doc(db, 'teachers', id))
          if (!snap.exists()) return null
          const t = snap.data() as Teacher
          return [id, { name: t.name, photoURL: t.photoURL || undefined, country: t.country || undefined }] as const
        } catch { return null }
      })
    ).then((entries) => {
      const map: Record<string, TeacherLite> = {}
      for (const e of entries) if (e) map[e[0]] = e[1]
      setTeacherMap(map)
    })
  }, [lessons, bookings])

  // ─── Minute fund stats ───────────────────────────────────────────
  const pMps = student.minutesPerSession || 50
  const pTotalMin = student.totalMinutes ?? student.totalSessions * pMps
  const pUsedMin = student.usedMinutes ?? student.usedSessions * pMps
  const pRemainingMin = student.remainingMinutes ?? (pTotalMin - pUsedMin)
  const pHeldMin = student.reservedMinutes ?? student.heldMinutes ?? 0
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
    if (student.subjects && student.subjects.length > 0) return student.subjects
    if (student.subjectId) {
      return [{
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
    return []
  }, [student])

  // ─── Analytics ───────────────────────────────────────────────────
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

  const NAV_ITEMS: { key: ParentTab; label: string; labelEn: string; icon: typeof Home }[] = [
    { key: 'home', label: 'Trang chủ', labelEn: 'Home', icon: Home },
    { key: 'booking', label: 'Đặt lịch', labelEn: 'Reserve', icon: CalendarPlus },
    { key: 'history', label: 'Lịch sử', labelEn: 'History', icon: History },
    { key: 'courses', label: 'Khóa học', labelEn: 'Courses', icon: GraduationCap },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="sticky top-0 bg-white/85 backdrop-blur-xl border-b border-slate-200/70 z-30">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100"
            aria-label={lang === 'vi' ? 'Đăng xuất' : 'Sign out'}
          >
            <LogOut className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-semibold text-slate-900 leading-tight truncate tracking-tight">
              {student.name}
            </h1>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5 tracking-wide">
              {student.code}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
              className="p-2 text-slate-500 hover:text-slate-800 transition-colors rounded-lg hover:bg-slate-100 flex items-center gap-1 text-[11px] font-bold"
              title={lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
            >
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span className="uppercase">{lang}</span>
            </button>
            <NotificationDrawer targetType="students" targetId={student.id} />
            <Logo className="scale-[0.55] origin-right opacity-80 hidden sm:block" />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 pb-32">
        {tab === 'home' && (
          <HomeTab
            student={student}
            usedPct={usedPct}
            stats={{ total: pTotalMin, used: pUsedMin, held: pHeldMin, available: pAvailableMin }}
            insights={insights}
            nextBooking={nextBooking}
            teacherMap={teacherMap}
            roomLinkOf={roomLinkOf}
            dayFull={dayFull}
            onGoTab={setTab}
            lang={lang}
          />
        )}
        {tab === 'booking' && (
          <BookingTab
            bookings={bookings}
            upcomingBookings={upcomingBookings}
            nextBooking={nextBooking}
            teacherMap={teacherMap}
            roomLinkOf={roomLinkOf}
            dayFull={dayFull}
            onSelectBooking={setSelectedParentBooking}
            lang={lang}
            onPickTeacher={() => navigate('/giao-vien')}
          />
        )}
        {tab === 'history' && (
          <HistoryTab
            lessons={lessons}
            teacherMap={teacherMap}
            subjectPackages={subjectPackages}
            onDetail={setDetailLesson}
            lang={lang}
          />
        )}
        {tab === 'courses' && (
          <CoursesTab
            subjectPackages={subjectPackages}
            bookings={bookings}
            monthlyData={monthlyData}
            durationData={durationData}
            insights={insights}
            pieColors={PIE_COLORS}
            lang={lang}
          />
        )}
      </main>

      {/* ─── Bottom Navigation ─── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
        <div className="max-w-2xl mx-auto sm:px-4 sm:pb-3">
          <div className="pointer-events-auto bg-white/95 backdrop-blur-xl border-t border-slate-200/80 sm:border sm:rounded-3xl sm:shadow-[0_10px_40px_-12px_rgba(15,23,42,0.25)] px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-2">
            <div className="grid grid-cols-4">
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
                      <span className={`flex items-center justify-center w-12 h-12 -mt-7 rounded-full shadow-lg transition-all duration-300 ring-4 ring-slate-50 ${
                        active
                          ? 'bg-gradient-to-br from-[#3BB8EB] to-[#2196F3] shadow-sky-300/60 scale-105'
                          : 'bg-gradient-to-br from-[#4cc3f2] to-[#3BB8EB] shadow-sky-200/60 group-hover:scale-105'
                      }`}>
                        <Icon className="w-5.5 h-5.5 w-[22px] h-[22px] text-white" />
                      </span>
                    ) : (
                      <span className={`flex items-center justify-center w-9 h-9 rounded-2xl transition-all duration-300 ${
                        active ? 'bg-sky-50 scale-105' : 'group-hover:bg-slate-100'
                      }`}>
                        <Icon className={`w-[21px] h-[21px] transition-colors ${active ? 'text-[#3BB8EB]' : 'text-slate-400 group-hover:text-slate-600'}`} strokeWidth={active ? 2.4 : 2} />
                      </span>
                    )}
                    <span className={`text-[10px] font-bold tracking-tight transition-colors ${active ? 'text-[#3BB8EB]' : 'text-slate-400'}`}>
                      {lang === 'vi' ? label : labelEn}
                    </span>
                    {active && !isCenter && (
                      <span className="absolute -top-[7px] w-1 h-1 rounded-full bg-[#3BB8EB] animate-fade-in" />
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
                  name={selectedParentBooking.teacherName || '?'}
                  photoURL={teacherMap[selectedParentBooking.teacherId]?.photoURL}
                  country={teacherMap[selectedParentBooking.teacherId]?.country}
                  size={44}
                />
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">
                    {lang === 'vi' ? 'Giáo viên' : 'Teacher'}
                  </span>
                  <span className="text-sm font-bold text-slate-800 block mt-1">{selectedParentBooking.teacherName}</span>
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
          </div>
        </Modal>
      )}

      {/* ─── Lesson Detail Modal (Xem chi tiết) ─── */}
      {detailLesson && (
        <Modal
          open
          onClose={() => setDetailLesson(null)}
          title={lang === 'vi' ? 'Chi tiết buổi học' : 'Lesson Details'}
          footer={
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setDetailLesson(null)}>
                {lang === 'vi' ? 'Đóng' : 'Close'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <TeacherAvatar
                name={detailLesson.teacherName || '?'}
                photoURL={teacherMap[detailLesson.teacherId]?.photoURL}
                country={teacherMap[detailLesson.teacherId]?.country}
                size={48}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{detailLesson.teacherName}</p>
                <p className="text-xs text-slate-500 truncate">{detailLesson.subjectName}</p>
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
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 grid grid-cols-2 gap-3">
                {detailLesson.book && (
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{lang === 'vi' ? 'Sách học' : 'Book'}</p>
                    <p className="text-xs font-bold text-[#3BB8EB] mt-0.5 break-words">{detailLesson.book}</p>
                  </div>
                )}
                {detailLesson.pages && (
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{lang === 'vi' ? 'Trang học' : 'Pages'}</p>
                    <p className="text-xs font-bold text-slate-700 mt-0.5 break-words">{detailLesson.pages}</p>
                  </div>
                )}
              </div>
            )}

            {detailLesson.comment && (
              <div>
                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-[0.15em] mb-1.5">
                  {lang === 'vi' ? 'Nhận xét của giáo viên' : 'Teacher Feedback'}
                </p>
                <div className="relative pl-4">
                  <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-emerald-400 rounded-full" />
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{detailLesson.comment}</p>
                </div>
              </div>
            )}

            {detailLesson.homework && (
              <div>
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-[0.15em] mb-1.5">
                  {lang === 'vi' ? 'Bài tập về nhà' : 'Homework'}
                </p>
                <div className="relative pl-4">
                  <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-amber-400 rounded-full" />
                  <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">{detailLesson.homework}</p>
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
        </Modal>
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
  return (
    <div className="space-y-6">
      {/* Hero progress card */}
      <section className="animate-slide-up">
        <div className="relative bg-gradient-to-br from-slate-900 via-[#1e3a5f] to-[#3BB8EB] rounded-3xl p-7 text-white shadow-[0_20px_60px_-15px_rgba(59,184,235,0.4)] overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#FFD600]/15 rounded-full blur-[80px]" />
          <div className="absolute -bottom-24 -left-16 w-56 h-56 bg-[#3BB8EB]/30 rounded-full blur-[100px]" />

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
                { label: lang === 'vi' ? 'Tổng số phút' : 'Total minutes', val: stats.total, color: 'text-white' },
                { label: lang === 'vi' ? 'Đã học' : 'Completed', val: stats.used, color: 'text-sky-200' },
                { label: lang === 'vi' ? 'Giữ chỗ' : 'Booked', val: stats.held, color: stats.held > 0 ? 'text-[#FFD600]' : 'text-sky-100/70' },
                { label: lang === 'vi' ? 'Khả dụng' : 'Available', val: stats.available, color: stats.available <= 0 ? 'text-rose-200' : 'text-emerald-300' },
              ].map((s) => (
                <div key={s.label} className="px-3 first:pl-0 last:pr-0">
                  <p className={`text-[26px] sm:text-[32px] font-bold leading-none tracking-tight ${s.color}`}>{s.val}</p>
                  <p className="text-[10px] sm:text-[11px] text-sky-100/80 mt-2 tracking-wide font-medium">{s.label}</p>
                  <p className="text-[9px] text-sky-200/50 mt-0.5 uppercase tracking-wider font-semibold">
                    {lang === 'vi' ? 'phút' : 'min'}
                  </p>
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
                {nextBooking.teacherName} · {nextBooking.subjectName}
              </p>
            </div>
            {roomLinkOf(nextBooking) && (
              <a
                href={roomLinkOf(nextBooking)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2.5 bg-[#3BB8EB] hover:bg-[#2da8db] text-white text-xs font-bold rounded-xl shadow-md shadow-sky-200/60 transition-all flex items-center gap-1.5 flex-shrink-0 hover:-translate-y-0.5"
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
          <div className="bg-gradient-to-r from-indigo-50 to-indigo-100/50 border border-indigo-200/60 rounded-2xl p-5 flex items-center justify-between gap-4 shadow-sm shadow-indigo-100">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                {lang === 'vi' ? 'Phòng học trực tuyến' : 'Online Classroom'}
              </h3>
              <p className="text-xs text-slate-500 leading-normal">
                {lang === 'vi' ? 'Bấm vào đây để tham gia lớp học trực tuyến cùng giáo viên.' : 'Click here to join the online classroom with the teacher.'}
              </p>
            </div>
            <a
              href={student.classroomURL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-200 hover:shadow-indigo-300 transition-all flex items-center gap-1.5 flex-shrink-0"
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
          { key: 'booking' as ParentTab, icon: CalendarPlus, label: lang === 'vi' ? 'Đặt lịch học' : 'Book Class', color: 'text-[#3BB8EB] bg-sky-50 border-sky-100' },
          { key: 'history' as ParentTab, icon: History, label: lang === 'vi' ? 'Lịch sử học' : 'History', color: 'text-violet-500 bg-violet-50 border-violet-100' },
          { key: 'courses' as ParentTab, icon: GraduationCap, label: lang === 'vi' ? 'Khóa học' : 'Courses', color: 'text-emerald-500 bg-emerald-50 border-emerald-100' },
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
              name={nextBooking.teacherName || '?'}
              photoURL={teacherMap[nextBooking.teacherId]?.photoURL}
              country={teacherMap[nextBooking.teacherId]?.country}
              size={44}
            />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {lang === 'vi' ? 'Giáo viên buổi tới' : 'Next Teacher'}
              </p>
              <p className="text-[13px] font-bold text-slate-900 truncate mt-0.5">{nextBooking.teacherName}</p>
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
function BookingTab({ bookings, upcomingBookings, nextBooking, teacherMap, roomLinkOf, dayFull, onSelectBooking, lang, onPickTeacher }: {
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
              {lang === 'vi' ? '1 kèm 1 cùng giáo viên' : '1-on-1 with teachers'}
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
          {lang === 'vi' ? 'Chọn giáo viên' : 'Choose Teacher'}
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
                          ? 'bg-[#3BB8EB] shadow-md shadow-sky-200'
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
                  name={b.teacherName || '?'}
                  photoURL={teacherMap[b.teacherId]?.photoURL}
                  country={teacherMap[b.teacherId]?.country}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">{b.teacherName} · {b.subjectName}</p>
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
                    <p className="text-xs font-bold text-slate-800 truncate">{b.teacherName} · {b.subjectName}</p>
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
                {nextBooking.teacherName} · {nextBooking.subjectName}
              </p>
            </div>
            {roomLinkOf(nextBooking) && (
              <a
                href={roomLinkOf(nextBooking)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2.5 bg-[#3BB8EB] hover:bg-[#2da8db] text-white text-xs font-bold rounded-xl shadow-md shadow-sky-200/60 transition-all flex items-center gap-1.5 flex-shrink-0 hover:-translate-y-0.5"
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
            <li>{lang === 'vi' ? 'Nếu cần hủy hoặc đổi lịch, vui lòng liên hệ trung tâm trước tối thiểu 2 giờ.' : 'To cancel or reschedule, please contact the center at least 2 hours in advance.'}</li>
          </ul>
        </div>
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: LỊCH SỬ (lesson history cards with teacher avatar + flag + rating)
// ─────────────────────────────────────────────────────────────────────────────
function HistoryTab({ lessons, teacherMap, subjectPackages, onDetail, lang }: {
  lessons: Lesson[]
  teacherMap: Record<string, TeacherLite>
  subjectPackages: Student['subjects'] & {}
  onDetail: (l: Lesson) => void
  lang: string
}) {
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')

  const months = useMemo(() => {
    const set = new Set<string>()
    lessons.forEach(l => l.date && set.add(l.date.slice(0, 7)))
    return Array.from(set).sort().reverse()
  }, [lessons])

  const subjects = useMemo(() => {
    const map = new Map<string, string>()
    lessons.forEach(l => { if (l.subjectId) map.set(l.subjectId, l.subjectName || '') })
    return Array.from(map.entries())
  }, [lessons])

  const filtered = useMemo(() => {
    return lessons.filter(l =>
      (subjectFilter === 'all' || l.subjectId === subjectFilter) &&
      (monthFilter === 'all' || l.date?.slice(0, 7) === monthFilter)
    )
  }, [lessons, subjectFilter, monthFilter])

  const dayLabels = lang === 'vi' ? DAY_LABELS_VI : DAY_LABELS_EN

  let lastMonthKey = ''

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1 animate-slide-up">
        <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">
          {lang === 'vi' ? 'Lịch sử buổi học' : 'Lesson History'}
        </h3>
        <span className="text-[11px] text-slate-400 font-medium">
          {filtered.length} {lang === 'vi' ? 'buổi' : 'sessions'}
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-2 animate-slide-up [animation-delay:40ms]">
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="h-9 flex-1 min-w-0 rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-bold text-slate-600 outline-none focus:border-[#3BB8EB] cursor-pointer shadow-sm"
        >
          <option value="all">{lang === 'vi' ? 'Tất cả môn' : 'All subjects'}</option>
          {subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="h-9 w-32 rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-bold text-slate-600 outline-none focus:border-[#3BB8EB] cursor-pointer shadow-sm"
        >
          <option value="all">{lang === 'vi' ? 'Tất cả tháng' : 'All months'}</option>
          {months.map(m => {
            const [y, mo] = m.split('-')
            return <option key={m} value={m}>{lang === 'vi' ? `Tháng ${parseInt(mo)}/${y}` : `${parseInt(mo)}/${y}`}</option>
          })}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl text-center py-14 animate-slide-up">
          <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">
            {lang === 'vi' ? 'Chưa có buổi học nào' : 'No lessons yet'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {lang === 'vi' ? 'Buổi học sẽ hiển thị sau khi được trung tâm duyệt' : 'Lessons appear after being approved by the center'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((lesson, i) => {
            const d = parseISODate(lesson.date)
            const monthKey = lesson.date?.slice(0, 7) || ''
            const showMonthHeader = monthKey !== lastMonthKey
            lastMonthKey = monthKey
            const teacher = teacherMap[lesson.teacherId]
            const pkg = subjectPackages?.find(s => s.subjectId === lesson.subjectId)
            const docLink = pkg?.curriculumLink
              ? (pkg.curriculumLink.startsWith('http') ? pkg.curriculumLink : `https://${pkg.curriculumLink}`)
              : ''

            return (
              <div key={lesson.id}>
                {showMonthHeader && (
                  <p className="text-[11px] font-bold text-slate-400 px-1 pt-2 pb-2 animate-fade-in">
                    {lang === 'vi' ? `Tháng ${d.getMonth() + 1}/${d.getFullYear()}` : `${d.toLocaleString('en', { month: 'long' })} ${d.getFullYear()}`}
                  </p>
                )}
                <article
                  className="bg-white border border-slate-200/70 rounded-2xl p-4 hover:border-sky-200 hover:shadow-lg hover:shadow-sky-100/50 transition-all duration-300 animate-slide-up"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <div className="flex items-start gap-3">
                    {/* Date badge */}
                    <div className="w-12 flex-shrink-0 text-center bg-slate-50 border border-slate-100 rounded-xl py-2">
                      <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">{dayLabels[d.getDay()]}</p>
                      <p className="text-xl font-extrabold text-slate-800 leading-tight tabular-nums">{String(d.getDate()).padStart(2, '0')}</p>
                      <p className="text-[9px] font-bold text-slate-400 leading-none">T{d.getMonth() + 1}</p>
                    </div>

                    {/* Teacher + lesson info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <TeacherAvatar
                          name={lesson.teacherName || '?'}
                          photoURL={teacher?.photoURL}
                          country={teacher?.country}
                          size={40}
                        />
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-slate-900 truncate">{lesson.teacherName}</p>
                          <p className="text-[11px] text-slate-500 truncate">{lesson.subjectName}</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5 flex-wrap">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="tabular-nums font-semibold">{lesson.minutes} {lang === 'vi' ? 'phút' : 'min'}</span>
                        <span className="text-slate-300">|</span>
                        <span className="inline-flex items-center gap-1 text-[#3BB8EB] font-bold">
                          <Video className="w-3 h-3" />
                          {lang === 'vi' ? 'Đã học' : 'Completed'}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Teacher feedback */}
                  {(lesson.comment || (typeof lesson.rating === 'number' && lesson.rating > 0)) && (
                    <div className="mt-3 bg-sky-50/60 border border-sky-100/70 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          {lang === 'vi' ? 'Nhận xét của giáo viên' : 'Teacher Feedback'}
                        </p>
                        {typeof lesson.rating === 'number' && lesson.rating > 0 && (
                          <span className="flex items-center gap-1 text-[11px] font-extrabold text-amber-500">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            {lesson.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      {lesson.comment && (
                        <p className="text-[12px] text-slate-600 leading-relaxed line-clamp-3">{lesson.comment}</p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-2.5 mt-3">
                    <button
                      type="button"
                      onClick={() => onDetail(lesson)}
                      className="py-2 rounded-xl border border-sky-200 text-[#2196F3] text-[11px] font-bold hover:bg-sky-50 active:scale-95 transition-all duration-200 flex items-center justify-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {lang === 'vi' ? 'Xem chi tiết' : 'View Details'}
                    </button>
                    {docLink ? (
                      <a
                        href={docLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 rounded-xl bg-[#3BB8EB] hover:bg-[#2da8db] text-white text-[11px] font-bold active:scale-95 transition-all duration-200 flex items-center justify-center gap-1.5 shadow-sm shadow-sky-200"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        {lang === 'vi' ? 'Xem tài liệu học' : 'View Materials'}
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="py-2 rounded-xl bg-slate-100 text-slate-400 text-[11px] font-bold cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        {lang === 'vi' ? 'Chưa có tài liệu' : 'No materials'}
                      </button>
                    )}
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
              const bookedMins = bookings
                .filter((b) => b.subjectId === sub.subjectId && !b.lessonId)
                .reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)
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
                      <p className="font-bold text-slate-700">{sub.totalMinutes}p</p>
                      <p className="text-[9px] text-slate-500 leading-none mt-1">
                        {lang === 'vi' ? 'Tổng thời gian' : 'Total time'}
                      </p>
                    </div>
                    <div>
                      <p className="font-bold text-indigo-500">{sub.usedMinutes}p</p>
                      <p className="text-[9px] text-slate-500 leading-none mt-1">
                        {lang === 'vi' ? 'Đã học' : 'Completed'}
                      </p>
                    </div>
                    <div>
                      <p className="font-bold text-amber-600">{bookedMins}p</p>
                      <p className="text-[9px] text-slate-500 leading-none mt-1">
                        {lang === 'vi' ? 'Đã đặt' : 'Booked'}
                      </p>
                    </div>
                    <div>
                      <p className={`font-bold ${availMins <= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{availMins}p</p>
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
                      className="mt-3 w-full py-2 rounded-xl bg-[#3BB8EB] hover:bg-[#2da8db] text-white text-[11px] font-bold transition-all duration-200 flex items-center justify-center gap-1.5 shadow-sm shadow-sky-200 active:scale-95"
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
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 0, left: -22 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(59,184,235,0.06)' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(value) => [`${value ?? 0} ${lang === 'vi' ? 'buổi' : 'sessions'}`, '']}
                />
                <Bar dataKey="buoi" fill="#3BB8EB" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {durationData.length > 0 && (
          <div className="bg-white border border-slate-200/70 rounded-2xl p-4">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              {lang === 'vi' ? 'Phân bổ thời lượng buổi học' : 'Session duration distribution'}
            </p>
            <div className="h-44 flex items-center">
              <ResponsiveContainer width="55%" height="100%">
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
