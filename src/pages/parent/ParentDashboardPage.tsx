import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student, Lesson } from '@/types'
import { Search, ArrowLeft, LogOut, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '@/components/shared/Logo'
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
  const [result, setResult] = useState<{ student: Student; lessons: Lesson[] } | null>(null)
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

      const lq = query(collection(db, 'lessons'), where('studentId', '==', student.id), where('status', '==', 'approved'))
      const lSnap = await getDocs(lq)
      const lessons = lSnap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson))
      lessons.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))

      saveSession(finalCode)
      setResult({ student, lessons })
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

  if (result) return <ParentView student={result.student} lessons={result.lessons} onBack={reset} />

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

function ParentView({ student, lessons, onBack }: { student: Student; lessons: Lesson[]; onBack: () => void }) {
  const [viewImage, setViewImage] = useState<string | null>(null)

  const pMps = student.minutesPerSession || 50
  const pTotalMin = student.totalMinutes ?? student.totalSessions * pMps
  const pUsedMin = student.usedMinutes ?? student.usedSessions * pMps
  const pRemainingMin = student.remainingMinutes ?? (pTotalMin - pUsedMin)
  const usedPct = pTotalMin > 0 ? Math.min(100, Math.round((pUsedMin / pTotalMin) * 100)) : 0

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
              {student.code} · {student.subjectName}
            </p>
          </div>
          <Logo className="scale-[0.55] origin-right opacity-80" />
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
              <div className="grid grid-cols-3 divide-x divide-white/15">
                {[
                  { label: 'Tổng buổi', val: student.totalSessions, mins: pTotalMin, color: 'text-white' },
                  { label: 'Đã học', val: student.usedSessions, mins: pUsedMin, color: 'text-sky-200' },
                  { label: 'Còn lại', val: student.remainingSessions, mins: pRemainingMin, color: student.remainingSessions <= 3 ? 'text-[#FFD600]' : 'text-emerald-300' },
                ].map((s) => (
                  <div key={s.label} className="px-3 first:pl-0 last:pr-0">
                    <p className={`text-[32px] font-bold leading-none tracking-tight ${s.color}`}>{s.val}</p>
                    <p className="text-[11px] text-sky-100/80 mt-1 tracking-wide">{s.label}</p>
                    <p className="text-[11px] text-sky-200/60 mt-0.5 font-medium">{s.mins} phút</p>
                  </div>
                ))}
              </div>
            </div>
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

        {/* Analytics: 2 charts */}
        <section className="space-y-3 animate-slide-up [animation-delay:160ms]">
          <div className="flex items-baseline justify-between px-1">
            <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">Phân tích học tập</h3>
            <span className="text-[11px] text-slate-400 font-medium">{lessons.length} buổi tổng cộng</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Monthly bar chart */}
            <div className="md:col-span-3 bg-white border border-slate-200/70 rounded-2xl p-5 hover:shadow-md transition-shadow duration-300">
              <p className="text-[13px] font-semibold text-slate-700 mb-1">Buổi học theo tháng</p>
              <p className="text-[11px] text-slate-400 mb-4">6 tháng gần nhất</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#f1f5f9' }}
                      contentStyle={{
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        fontSize: 12,
                        padding: '8px 12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)',
                      }}
                      formatter={(v, name) => [v as number, name === 'buoi' ? 'buổi' : 'phút']}
                      labelStyle={{ color: '#475569', fontWeight: 600, marginBottom: 4 }}
                    />
                    <Bar dataKey="buoi" fill="#3BB8EB" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Duration distribution pie */}
            <div className="md:col-span-2 bg-white border border-slate-200/70 rounded-2xl p-5 hover:shadow-md transition-shadow duration-300">
              <p className="text-[13px] font-semibold text-slate-700 mb-1">Phân bố thời lượng</p>
              <p className="text-[11px] text-slate-400 mb-4">Buổi theo độ dài</p>
              {durationData.length === 0 ? (
                <p className="text-center text-slate-400 text-xs py-8">Chưa có dữ liệu</p>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-24 h-24 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={durationData}
                          dataKey="value"
                          innerRadius={28}
                          outerRadius={44}
                          paddingAngle={2}
                          stroke="white"
                          strokeWidth={2}
                        >
                          {durationData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    {durationData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2 text-[11px]">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="text-slate-600 flex-1">{d.name}</span>
                        <span className="text-slate-900 font-semibold tabular-nums">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

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
                        {lesson.teacherName}
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
    </div>
  )
}
