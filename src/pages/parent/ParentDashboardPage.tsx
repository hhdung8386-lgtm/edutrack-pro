import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student, Lesson, BookingRequest } from '@/types'
import { Search, ArrowLeft, LogOut, X, ExternalLink, ChevronLeft, ChevronRight, Calendar, Info, Clock, User as UserIcon, BookOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '@/components/shared/Logo'
import { NotificationDrawer } from '@/components/shared/NotificationDrawer'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
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
          <p className="text-slate-500 text-sm">Đang tải...</p>
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
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/login')} className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100" aria-label="Quay lại">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Logo className="scale-[0.6] origin-left" />
          <span className="text-[10px] text-slate-400 border-l border-slate-200 pl-2.5 ml-0.5">Cổng Phụ huynh</span>
        </div>
      </nav>

      <main className="max-w-lg mx-auto px-4 py-10 relative z-10">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-[#3BB8EB] to-[#2196F3] rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-sky-200/50 rotate-3 hover:rotate-0 transition-transform text-4xl">
            📚
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mb-2">Xin chào, Phụ huynh!</h2>
          <p className="text-slate-500 text-sm max-w-xs mx-auto leading-relaxed">
            Nhập mã học viên và SĐT để xem bài tập, nhận xét từ giáo viên
          </p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xl shadow-slate-200/30 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Mã học sinh *</label>
            <input
              type="text" value={studentCode} onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()} placeholder="VD: HS8X2K91"
              className="w-full rounded-xl bg-[#FFE500]/5 border-2 border-[#FFE500]/30 text-slate-900 placeholder-slate-400 px-4 py-3.5 text-lg font-mono font-bold tracking-widest uppercase text-center focus:outline-none focus:ring-2 focus:ring-[#3BB8EB]/40 focus:border-[#3BB8EB] transition-all"
              autoCapitalize="characters" autoCorrect="off"
            />
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-600 font-medium">{error}</div>
          )}

          <button onClick={() => handleLogin()} disabled={searching}
            className="w-full py-3.5 bg-[#3BB8EB] hover:bg-[#2da8db] text-white font-bold rounded-xl shadow-lg shadow-sky-200/50 hover:shadow-sky-300/50 hover:-translate-y-0.5 transition-all duration-300 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {searching
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Search className="w-4 h-4" /> XEM THÔNG TIN HỌC TẬP</>}
          </button>

          <p className="text-[11px] text-slate-400 text-center">🔒 Phiên đăng nhập được lưu 30 ngày</p>
        </div>

        <p className="text-xs text-slate-400 text-center mt-6">Mã học sinh được cung cấp bởi trung tâm khi đăng ký</p>
      </main>
    </div>
  )
}

function ParentView({ student, lessons, bookings, onBack }: { student: Student; lessons: Lesson[]; bookings: BookingRequest[]; onBack: () => void }) {
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [selectedParentBooking, setSelectedParentBooking] = useState<BookingRequest | null>(null)
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    d.setHours(0, 0, 0, 0)
    return d
  })

  const getMonday = (d: Date) => {
    const copy = new Date(d)
    const day = copy.getDay()
    const diff = copy.getDate() - day + (day === 0 ? -6 : 1)
    copy.setDate(diff)
    copy.setHours(0, 0, 0, 0)
    return copy
  }

  const addDays = (d: Date, days: number) => {
    const copy = new Date(d)
    copy.setDate(copy.getDate() + days)
    return copy
  }

  const getLocalISODate = (date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const weekDates = useMemo(() => {
    return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day, idx) => {
      const d = addDays(weekStart, idx)
      return { day, date: d, iso: getLocalISODate(d) }
    })
  }, [weekStart])

  const visibleStarts = useMemo(() => {
    const starts = []
    for (let min = 0; min < 1440; min += 30) {
      const hrs = Math.floor(min / 60)
      const mns = min % 60
      starts.push(`${String(hrs).padStart(2, '0')}:${String(mns).padStart(2, '0')}`)
    }
    return starts
  }, [])

  const timeToMinutes = (time: string) => {
    const [hours = '0', minutes = '0'] = time.split(':')
    return Number(hours) * 60 + Number(minutes)
  }

  const findBookingForCell = (dateISO: string, time: string) => {
    const cellStart = timeToMinutes(time)
    const cellEnd = cellStart + 30
    return bookings.find((req) => {
      if (req.requestedDate !== dateISO) return false
      const reqStart = timeToMinutes(req.requestedStart)
      const reqEnd = timeToMinutes(req.requestedEnd)
      const overlaps = Math.max(cellStart, reqStart) < Math.min(cellEnd, reqEnd)
      if (dateISO === '2026-06-22' && time === '03:00') {
        console.log('Testing cell 03:00 Monday matching:', {
          dateISO,
          time,
          reqStart,
          reqEnd,
          cellStart,
          cellEnd,
          overlaps
        })
      }
      return overlaps
    })
  }

  const pMps = student.minutesPerSession || 50
  const pTotalMin = student.totalMinutes ?? student.totalSessions * pMps
  const pUsedMin = student.usedMinutes ?? student.usedSessions * pMps
  const pRemainingMin = student.remainingMinutes ?? (pTotalMin - pUsedMin)
  const pHeldMin = student.reservedMinutes ?? student.heldMinutes ?? 0
  const pAvailableMin = Math.max(0, pRemainingMin - pHeldMin)
  const usedPct = pTotalMin > 0 ? Math.min(100, Math.round((pUsedMin / pTotalMin) * 100)) : 0

  const totalSessions25 = Math.floor(pTotalMin / 25)
  const usedSessions25 = Math.floor(pUsedMin / 25)
  const heldSessions25 = Math.floor(pHeldMin / 25)
  const availableSessions25 = Math.floor(pAvailableMin / 25)

  const homeworkLessons = lessons.filter(l => l.homework || l.comment)

  // ─── Analytics ──────────────────────────────────────────────────
  const { monthlyData, durationData, insights } = useMemo(() => {
    // Monthly: last 6 months bucket
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
      return { name: `T${parseInt(m)}/${y.slice(2)}`, buoi: v.count, phut: v.minutes }
    })

    // Duration distribution
    const durBuckets: Record<number, number> = {}
    for (const l of lessons) {
      const m = l.minutes || 0
      if (!m) continue
      durBuckets[m] = (durBuckets[m] || 0) + 1
    }
    const duration = Object.entries(durBuckets)
      .map(([m, c]) => ({ name: `${m} phút`, value: c, mins: parseInt(m) }))
      .sort((a, b) => a.mins - b.mins)

    // Insights
    const totalMinDone = lessons.reduce((s, l) => s + (l.minutes || 0), 0)
    const avgMin = lessons.length > 0 ? Math.round(totalMinDone / lessons.length) : 0
    const last30Days = lessons.filter(l => {
      const d = new Date(l.date)
      const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
      return diff <= 30 && diff >= 0
    })
    const consistencyHint =
      last30Days.length >= 8 ? 'Học rất đều' :
      last30Days.length >= 4 ? 'Học đều đặn' :
      last30Days.length >= 1 ? 'Học chưa đều' :
      'Chưa học gần đây'

    return {
      monthlyData: monthly,
      durationData: duration,
      insights: {
        avgMin,
        totalMin: totalMinDone,
        last30Count: last30Days.length,
        consistency: consistencyHint,
      },
    }
  }, [lessons])

  const PIE_COLORS = ['#3BB8EB', '#FFD600', '#10B981', '#F59E0B']

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="sticky top-0 bg-white/85 backdrop-blur-xl border-b border-slate-200/70 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100"
            aria-label="Đăng xuất"
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
            {/* Notification bell drawer */}
            <NotificationDrawer targetType="students" targetId={student.id} />
            <Logo className="scale-[0.55] origin-right opacity-80" />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8 pb-24">
        {/* Hero progress card */}
        <section className="animate-slide-up">
          <div className="relative bg-gradient-to-br from-slate-900 via-[#1e3a5f] to-[#3BB8EB] rounded-3xl p-7 text-white shadow-[0_20px_60px_-15px_rgba(59,184,235,0.4)] overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#FFD600]/15 rounded-full blur-[80px]" />
            <div className="absolute -bottom-24 -left-16 w-56 h-56 bg-[#3BB8EB]/30 rounded-full blur-[100px]" />

            <div className="relative z-10">
              <p className="text-[11px] uppercase tracking-[0.2em] text-sky-200/80 font-medium mb-1">
                Tiến độ học tập
              </p>
              <h2 className="text-[28px] font-bold leading-none mb-6 tracking-tight">
                {usedPct}<span className="text-sky-200/80 text-xl font-medium">% hoàn thành</span>
              </h2>

              {/* Progress bar */}
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-7">
                <div
                  className="h-full bg-gradient-to-r from-[#FFD600] via-emerald-400 to-sky-300 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${usedPct}%` }}
                />
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 divide-x divide-white/15">
                {[
                  { label: 'Tổng số phút', val: pTotalMin, color: 'text-white' },
                  { label: 'Đã học', val: pUsedMin, color: 'text-sky-200' },
                  { label: 'Giữ chỗ', val: pHeldMin, color: pHeldMin > 0 ? 'text-[#FFD600]' : 'text-sky-100/70' },
                  { label: 'Khả dụng', val: pAvailableMin, color: pAvailableMin <= 0 ? 'text-rose-200' : 'text-emerald-300' },
                ].map((s) => (
                  <div key={s.label} className="px-3 first:pl-0 last:pr-0">
                    <p className={`text-[32px] font-bold leading-none tracking-tight ${s.color}`}>{s.val}</p>
                    <p className="text-[11px] text-sky-100/80 mt-2 tracking-wide font-medium">{s.label}</p>
                    <p className="text-[10px] text-sky-200/50 mt-0.5 uppercase tracking-wider font-semibold">phút</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Classroom Link Card */}
        {student.classroomURL && (
          <section className="animate-slide-up [animation-delay:50ms]">
            <div className="bg-gradient-to-r from-indigo-50 to-indigo-100/50 border border-indigo-200/60 rounded-2xl p-5 flex items-center justify-between gap-4 shadow-sm shadow-indigo-100">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Phòng học trực tuyến
                </h3>
                <p className="text-xs text-slate-500 leading-normal">
                  Bấm vào đây để tham gia lớp học trực tuyến cùng giáo viên.
                </p>
              </div>
              <a
                href={student.classroomURL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-200 hover:shadow-indigo-300 transition-all flex items-center gap-1.5 flex-shrink-0 animate-pulse"
              >
                Vào học ngay
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </section>
        )}

        {/* Textbook/Book Link Card */}
        {student.textbookURL && (
          <section className="animate-slide-up [animation-delay:55ms]">
            <div className="bg-gradient-to-r from-sky-50 to-sky-100/50 border border-sky-200/60 rounded-2xl p-5 flex items-center justify-between gap-4 shadow-sm shadow-sky-100">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-[#3BB8EB]" />
                  Giáo trình / Sách học viên
                </h3>
                <p className="text-xs text-slate-500 leading-normal">
                  Bấm vào đây để mở và xem sách học tập trực tuyến của học viên.
                </p>
              </div>
              <a
                href={student.textbookURL.startsWith('http') ? student.textbookURL : `https://${student.textbookURL}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-[#3BB8EB] hover:bg-[#2da8db] text-white text-xs font-bold rounded-xl shadow-md shadow-sky-200 hover:shadow-sky-300 transition-all flex items-center gap-1.5 flex-shrink-0"
              >
                Xem sách học
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </section>
        )}

        {/* Subject Packages Section */}
        <section className="space-y-4 animate-slide-up [animation-delay:60ms]">
          <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight px-1">Gói học phí các môn</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(student.subjects && student.subjects.length > 0
              ? student.subjects
              : student.subjectId
                ? [{
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
                : []
            ).map((sub) => {
              const totalSess25 = Math.floor(sub.totalMinutes / 25)
              const usedSess25 = Math.floor(sub.usedMinutes / 25)
              const bookedMins = bookings
                .filter((b) => b.subjectId === sub.subjectId && !b.lessonId)
                .reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)
              const bookedSess25 = Math.floor(bookedMins / 25)
              const availMins = Math.max(0, sub.remainingMinutes - bookedMins)
              const availSess25 = Math.floor(availMins / 25)
              const subPct = sub.totalMinutes > 0 ? Math.min(100, Math.round((sub.usedMinutes / sub.totalMinutes) * 100)) : 0

              return (
                <div key={sub.subjectId} className="bg-white border border-slate-200/70 rounded-2xl p-5 hover:shadow-md transition-shadow duration-300">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h4 className="font-bold text-slate-800 text-sm leading-tight truncate max-w-[80%]" title={sub.subjectName}>{sub.subjectName}</h4>
                    <span className="text-[10px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full font-bold">
                      {subPct}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
                    <div
                      className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full"
                      style={{ width: `${subPct}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-center bg-slate-50/70 rounded-xl p-2.5 text-[10px]">
                    <div>
                      <p className="font-bold text-slate-700">{sub.totalMinutes}p</p>
                      <p className="text-[9px] text-slate-500 leading-none mt-1">Tổng thời gian</p>
                    </div>
                    <div>
                      <p className="font-bold text-indigo-500">{sub.usedMinutes}p</p>
                      <p className="text-[9px] text-slate-500 leading-none mt-1">Đã học</p>
                    </div>
                    <div>
                      <p className="font-bold text-amber-600">{bookedMins}p</p>
                      <p className="text-[9px] text-slate-500 leading-none mt-1">Đã đặt</p>
                    </div>
                    <div>
                      <p className={`font-bold ${availMins <= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{availMins}p</p>
                      <p className="text-[9px] text-slate-500 leading-none mt-1">Khả dụng</p>
                    </div>
                  </div>
                  {sub.curriculumLink && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5 justify-between">
                      <span className="text-[11px] font-semibold text-slate-500">Giáo trình:</span>
                      <a
                        href={sub.curriculumLink.startsWith('http') ? sub.curriculumLink : `https://${sub.curriculumLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-0.5"
                      >
                        Xem giáo trình
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                  {sub.timetableNote && (
                    <div className="mt-2 pt-2 border-t border-slate-100/50">
                      <span className="text-[11px] font-semibold text-slate-500 block mb-1">Ghi chú lịch học:</span>
                      <p className="text-[11px] text-slate-700 font-medium whitespace-pre-wrap leading-normal bg-amber-50/50 border border-amber-100/70 p-2.5 rounded-xl">
                        {sub.timetableNote}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Quick insights row */}
        <section className="grid grid-cols-2 gap-3 animate-slide-up [animation-delay:80ms]">
          <div className="bg-white border border-slate-200/70 rounded-2xl p-4 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Buổi 30 ngày qua</p>
            <p className="text-2xl font-bold text-slate-900 mt-1.5 tracking-tight">{insights.last30Count}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{insights.consistency}</p>
          </div>
          <div className="bg-white border border-slate-200/70 rounded-2xl p-4 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Thời lượng TB</p>
            <p className="text-2xl font-bold text-slate-900 mt-1.5 tracking-tight">
              {insights.avgMin} <span className="text-sm font-medium text-slate-500">phút/buổi</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Tổng {insights.totalMin} phút đã học</p>
          </div>
        </section>

        {(() => {
          const weekBookings = bookings.filter((b) => {
            return weekDates.some((wd) => wd.iso === b.requestedDate)
          })

          console.log('ParentView Timetable Debug:', {
            studentCode: student.code,
            bookings,
            weekDates: weekDates.map(wd => wd.iso),
            weekBookings,
            visibleStartsRange: `${visibleStarts[0]} to ${visibleStarts[visibleStarts.length - 1]} (${visibleStarts.length} slots)`
          })

          return (
            <section className="space-y-3 animate-slide-up [animation-delay:160ms]">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  Thời khóa biểu tuần
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setWeekStart(prev => getMonday(addDays(prev, -7)))}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                    title="Tuần trước"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekStart(getMonday(new Date()))}
                    className="px-2.5 py-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                  >
                    Tuần này
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekStart(prev => getMonday(addDays(prev, 7)))}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                    title="Tuần sau"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {weekBookings.length === 0 ? (
                <div className="bg-white border border-slate-200/70 rounded-2xl text-center py-10 px-4">
                  <Info className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 text-xs font-semibold">Không có lịch học trong tuần này</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Tuần {weekDates[0].date.getDate()}/{weekDates[0].date.getMonth() + 1} - {weekDates[6].date.getDate()}/{weekDates[6].date.getMonth() + 1}
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200/70 rounded-2xl p-4 shadow-sm overflow-x-auto">
                  <table className="w-full min-w-[500px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="p-2 text-center text-slate-400 font-bold w-14 border-r border-slate-100">Giờ</th>
                        {weekDates.map(({ day, date }) => {
                          const isToday = date.toDateString() === new Date().toDateString()
                          return (
                            <th key={day} className={`p-2 text-center font-extrabold border-r border-slate-100 min-w-[65px] ${isToday ? 'bg-indigo-50/40 text-indigo-600' : 'text-slate-600'}`}>
                              <div>{date.getDate()}/{date.getMonth() + 1}</div>
                              <div className="text-[8px] uppercase tracking-wide opacity-75 mt-0.5">
                                {day === 'sun' ? 'CN' : `T${day === 'mon' ? '2' : day === 'tue' ? '3' : day === 'wed' ? '4' : day === 'thu' ? '5' : day === 'fri' ? '6' : '7'}`}
                              </div>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const activeStarts = visibleStarts.filter((start) => {
                          return weekDates.some(({ iso }) => findBookingForCell(iso, start))
                        })
                        console.log('activeStarts calculated:', activeStarts)
                        return activeStarts.map((start) => (
                          <tr key={start} className="hover:bg-slate-50/20 transition">
                            <td className="p-2 text-center font-bold text-slate-400 border-r border-slate-100 bg-slate-50/30 align-middle">
                              {start}
                            </td>
                            {weekDates.map(({ day, iso }) => {
                              const booking = findBookingForCell(iso, start)
                              return (
                                <td key={day} className="p-1 border-r border-slate-100 align-middle text-center min-h-[40px]">
                                  {booking ? (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedParentBooking(booking)}
                                      className={`w-full py-1.5 px-1 rounded-xl text-center block transition hover:opacity-90 ${
                                        booking.status === 'confirmed'
                                          ? 'bg-indigo-50 border border-indigo-150 text-indigo-700'
                                          : 'bg-amber-50 border border-amber-150 text-amber-800'
                                      }`}
                                    >
                                      <p className="font-extrabold text-[10px] truncate leading-none">{booking.subjectName}</p>
                                      <p className="text-[8px] opacity-75 mt-0.5 leading-none">{booking.teacherName}</p>
                                    </button>
                                  ) : (
                                    <span className="text-slate-200 select-none">-</span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )
        })()}

        {/* Homework & Comments */}
        <section className="space-y-3 animate-slide-up [animation-delay:240ms]">
          <div className="flex items-baseline justify-between px-1">
            <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">Bài tập & Nhận xét</h3>
            <span className="text-[11px] text-slate-400 font-medium">{homeworkLessons.length} buổi</span>
          </div>

          {homeworkLessons.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl text-center py-14">
              <p className="text-slate-500 text-sm font-medium">Chưa có nhận xét nào</p>
              <p className="text-xs text-slate-400 mt-1">Sẽ hiển thị sau mỗi buổi học được duyệt</p>
            </div>
          ) : (
            <div className="space-y-3">
              {homeworkLessons.map((lesson, i) => (
                <article
                  key={lesson.id}
                  className="bg-white border border-slate-200/70 rounded-2xl p-5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-300 animate-slide-up"
                  style={{ animationDelay: `${280 + i * 40}ms` }}
                >
                  <header className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                    <div>
                      <p className="text-[13px] font-semibold text-slate-900 tabular-nums tracking-tight">
                        {lesson.date}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {lesson.teacherName} {lesson.subjectName && `· ${lesson.subjectName}`}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full tabular-nums">
                      {lesson.minutes} phút
                    </span>
                  </header>

                  {lesson.comment && (
                    <div className="mb-4">
                      <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-[0.15em] mb-2">
                        Nhận xét
                      </p>
                      <div className="relative pl-4">
                        <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-emerald-400 rounded-full" />
                        <p className="text-sm text-slate-700 leading-relaxed">{lesson.comment}</p>
                      </div>
                    </div>
                  )}

                  {lesson.homework && (
                    <div className="mb-4">
                      <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-[0.15em] mb-2">
                        Bài tập về nhà
                      </p>
                      <div className="relative pl-4">
                        <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-amber-400 rounded-full" />
                        <p className="text-sm text-slate-700 leading-relaxed font-medium">{lesson.homework}</p>
                      </div>
                    </div>
                  )}

                  {lesson.imageURLs?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-2">
                        Hình ảnh
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {lesson.imageURLs.map((url, idx) => (
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
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Timeline */}
        <section className="space-y-3 animate-slide-up [animation-delay:320ms]">
          <div className="flex items-baseline justify-between px-1">
            <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">Lịch sử buổi học</h3>
            <span className="text-[11px] text-slate-400 font-medium">{lessons.length} buổi</span>
          </div>
          {lessons.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8 bg-white border border-dashed border-slate-200 rounded-2xl">
              Chưa có buổi học nào
            </p>
          ) : (
            <div className="bg-white border border-slate-200/70 rounded-2xl divide-y divide-slate-100 overflow-hidden">
              {lessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="flex items-center gap-4 py-3 px-5 text-sm hover:bg-slate-50 transition-colors"
                >
                  <span className="text-slate-500 font-mono text-[11px] w-20 shrink-0 tabular-nums">
                    {lesson.date}
                  </span>
                  <span className="text-slate-700 flex-1 truncate font-medium">{lesson.teacherName}</span>
                  <span className="text-slate-400 text-xs shrink-0 tabular-nums">{lesson.minutes} phút</span>
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full shrink-0" />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Image viewer */}
      {viewImage && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setViewImage(null)}
        >
          <button
            className="absolute top-5 right-5 p-2.5 bg-white/15 hover:bg-white/25 backdrop-blur-md rounded-xl text-white transition-colors"
            onClick={() => setViewImage(null)}
            aria-label="Đóng"
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
      {/* Booking Detail Modal */}
      {selectedParentBooking && (
        <Modal
          open
          onClose={() => setSelectedParentBooking(null)}
          title="Chi tiết lịch học"
          footer={
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setSelectedParentBooking(null)}>Đóng</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-2">
              <p className="text-[10px] font-bold uppercase text-indigo-700 tracking-wider">Thời gian học</p>
              <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-500" />
                Thứ {selectedParentBooking.requestedDay === 'sun' ? 'Nhật' : selectedParentBooking.requestedDay === 'mon' ? '2' : selectedParentBooking.requestedDay === 'tue' ? '3' : selectedParentBooking.requestedDay === 'wed' ? '4' : selectedParentBooking.requestedDay === 'thu' ? '5' : selectedParentBooking.requestedDay === 'fri' ? '6' : '7'}
                {` (${selectedParentBooking.requestedDate})`} · {selectedParentBooking.requestedStart} - {selectedParentBooking.requestedEnd}
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-2.5">
                <UserIcon className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">Giáo viên</span>
                  <span className="text-sm font-bold text-slate-800 block mt-1">{selectedParentBooking.teacherName}</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-3 border-t border-slate-100">
                <Info className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">Môn học</span>
                  <span className="text-sm font-bold text-indigo-600 block mt-1">{selectedParentBooking.subjectName}</span>
                </div>
              </div>

              {(() => {
                const roomLink = selectedParentBooking.classroomURL || student.classroomURL
                const subjectPkg = student.subjects?.find((s) => s.subjectId === selectedParentBooking.subjectId)
                return (
                  <>
                    {roomLink && (
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Phòng học trực tuyến</span>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{roomLink}</p>
                        </div>
                        <a
                          href={roomLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 flex-shrink-0 animate-pulse"
                        >
                          Vào phòng học
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                    {subjectPkg?.timetableNote && (
                      <div className="pt-3 border-t border-slate-100">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Ghi chú lịch học</span>
                        <p className="text-xs text-slate-750 font-semibold leading-normal bg-amber-50/50 border border-amber-100/70 p-2.5 rounded-xl whitespace-pre-wrap">
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
    </div>
  )
}
