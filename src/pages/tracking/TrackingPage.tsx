import { useState, useEffect } from 'react'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student, Teacher, Lesson } from '@/types'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { GraduationCap, Search, ArrowLeft, Share2, User, BookOpen } from 'lucide-react'
import { maskPhone } from '@/lib/constants'
import { useSearchParams } from 'react-router-dom'

type TrackTab = 'student' | 'teacher'

export function TrackingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<TrackTab>(
    searchParams.get('teacher') ? 'teacher' : 'student'
  )
  const [code, setCode] = useState(searchParams.get('student') || searchParams.get('teacher') || '')
  const [searching, setSearching] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [studentResult, setStudentResult] = useState<{ student: Student; lessons: Lesson[] } | null>(null)
  const [teacherResult, setTeacherResult] = useState<{ teacher: Teacher; lessonCount: number } | null>(null)

  useEffect(() => {
    const prefill = searchParams.get('student') || searchParams.get('teacher')
    if (prefill) {
      handleSearch(prefill)
    }
  }, [])

  const handleSearch = async (searchCode?: string) => {
    const c = (searchCode || code).trim().toUpperCase()
    if (!c) return
    setSearching(true)
    setNotFound(false)
    setStudentResult(null)
    setTeacherResult(null)

    try {
      if (tab === 'student') {
        const q = query(collection(db, 'students'), where('code', '==', c))
        const snap = await getDocs(q)
        if (snap.empty) { setNotFound(true); return }
        const student = { id: snap.docs[0].id, ...snap.docs[0].data() } as Student

        const lq = query(
          collection(db, 'lessons'),
          where('studentId', '==', student.id),
          where('status', '==', 'approved')
        )
        const lSnap = await getDocs(lq)
        const lessons = lSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
        lessons.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
        setStudentResult({ student, lessons })

        setSearchParams({ student: c })
      } else {
        const q = query(collection(db, 'teachers'), where('code', '==', c))
        const snap = await getDocs(q)
        if (snap.empty) { setNotFound(true); return }
        const teacher = { id: snap.docs[0].id, ...snap.docs[0].data() } as Teacher

        const lq = query(
          collection(db, 'lessons'),
          where('teacherId', '==', teacher.id),
          where('status', '==', 'approved')
        )
        const lSnap = await getDocs(lq)
        setTeacherResult({ teacher, lessonCount: lSnap.size })

        setSearchParams({ teacher: c })
      }
    } finally {
      setSearching(false)
    }
  }

  const reset = () => {
    setStudentResult(null)
    setTeacherResult(null)
    setCode('')
    setNotFound(false)
    setSearchParams({})
  }

  const shareUrl = window.location.href

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/10 via-transparent to-slate-900 pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 bg-slate-50/95 backdrop-blur border-b border-slate-200 z-10">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-4 h-4 text-slate-900" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-900 leading-tight">EduTrack Pro</h1>
            <p className="text-[10px] text-slate-500">Tra cứu thông tin học tập</p>
          </div>
          {(studentResult || teacherResult) && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareUrl)
              }}
              className="p-2 text-slate-500 hover:text-slate-900 transition-colors"
              aria-label="Chia sẻ link"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6">
        {!studentResult && !teacherResult ? (
          <div className="space-y-5">
            {(notFound || true) && (
              <div className="text-center py-4">
                <h2 className="text-xl font-bold text-slate-900 mb-1">Tra cứu thông tin</h2>
                <p className="text-sm text-slate-500">Nhập mã được cung cấp bởi trung tâm</p>
              </div>
            )}

            {/* Tab buttons */}
            <div className="flex bg-white p-1 rounded-xl">
              {(['student', 'teacher'] as TrackTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setNotFound(false) }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2
                    ${tab === t ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  {t === 'student' ? <User className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
                  {t === 'student' ? 'Học viên' : 'Giáo viên'}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={tab === 'student' ? 'VD: HS8X2K91' : 'VD: GV3K91A0'}
                aria-label="Nhập mã tra cứu"
                className="w-full rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-500
                  px-5 py-4 text-xl font-mono font-bold tracking-widest uppercase text-center
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[60px]"
                autoCapitalize="characters"
                autoCorrect="off"
              />
              <Button fullWidth size="lg" loading={searching} onClick={() => handleSearch()}>
                <Search className="w-5 h-5" />
                Tra cứu
              </Button>
            </div>

            {notFound && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-center">
                <p className="text-rose-400 font-medium">Không tìm thấy kết quả</p>
                <p className="text-slate-500 text-sm mt-1">Mã "{code}" không tồn tại trong hệ thống</p>
              </div>
            )}
          </div>
        ) : studentResult ? (
          <StudentResult
            student={studentResult.student}
            lessons={studentResult.lessons}
            onBack={reset}
          />
        ) : teacherResult ? (
          <TeacherResult
            teacher={teacherResult.teacher}
            lessonCount={teacherResult.lessonCount}
            onBack={reset}
          />
        ) : null}
      </main>
    </div>
  )
}

function StudentResult({ student, lessons, onBack }: { student: Student; lessons: Lesson[]; onBack: () => void }) {
  const usedPctRaw = student.totalSessions > 0
    ? Math.round((student.usedSessions / student.totalSessions) * 100)
    : 0
  const usedPct = Math.min(usedPctRaw, 100)
  const remainingColor =
    student.remainingSessions < 0 ? 'text-rose-600' :
    student.remainingSessions === 0 ? 'text-rose-500' :
    student.remainingSessions <= 3 ? 'text-amber-500' : 'text-emerald-500'

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Tra cứu khác
      </button>

      {/* Student info */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-mono text-sm font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-lg">
            {student.code}
          </span>
          <StatusBadge status={student.status} />
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Họ tên</span>
            <span className="text-slate-900 font-semibold">{student.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Môn học</span>
            <span className="text-slate-700">{student.subjectName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">SĐT phụ huynh</span>
            <span className="text-slate-700">{maskPhone(student.parentPhone)}</span>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-600 mb-4">Tiến độ học tập</h3>
        {(() => {
          const trackMps = student.minutesPerSession || 50
          const trackTotalMin = student.totalMinutes ?? student.totalSessions * trackMps
          const trackUsedMin = student.usedMinutes ?? student.usedSessions * trackMps
          const trackRemainingMin = student.remainingMinutes ?? (trackTotalMin - trackUsedMin)
          return (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-900">{student.totalSessions}</p>
                <p className="text-xs text-slate-500 mt-0.5">Tổng buổi</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{trackTotalMin} phút</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-indigo-400">{student.usedSessions}</p>
                <p className="text-xs text-slate-500 mt-0.5">Đã học</p>
                <p className="text-[11px] text-indigo-300 mt-0.5">{trackUsedMin} phút</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${remainingColor}`}>
                  {student.remainingSessions < 0 ? Math.abs(student.remainingSessions) : student.remainingSessions}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {student.remainingSessions < 0 ? 'Nợ buổi' : 'Còn lại'}
                </p>
                <p className={`text-[11px] mt-0.5 ${trackRemainingMin <= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {trackRemainingMin < 0 ? `Nợ ${Math.abs(trackRemainingMin)}` : trackRemainingMin} phút
                </p>
              </div>
            </div>
          )
        })()}
        <style>{`.progress-bar-tracking { width: ${usedPct}%; }`}</style>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 progress-bar-tracking ${
              student.remainingSessions <= 0 ? 'bg-rose-500' :
              student.remainingSessions <= 3 ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2 text-right">{usedPctRaw}% hoàn thành</p>
      </div>

      {/* Lessons */}
      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Lịch sử buổi học</h3>
        {lessons.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">Chưa có buổi học được duyệt</p>
        ) : (
          <div className="space-y-3">
            {lessons.map((lesson) => (
              <div key={lesson.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{lesson.date}</span>
                  <span className="text-slate-600">{lesson.teacherName} · {lesson.minutes}'</span>
                </div>
                {lesson.comment && (
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Nhận xét</p>
                    <p className="text-sm text-slate-700">{lesson.comment}</p>
                  </div>
                )}
                {lesson.homework && (
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Bài tập</p>
                    <p className="text-sm text-slate-700">{lesson.homework}</p>
                  </div>
                )}
                {lesson.imageURLs?.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-1">
                    {lesson.imageURLs.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TeacherResult({ teacher, lessonCount, onBack }: { teacher: Teacher; lessonCount: number; onBack: () => void }) {
  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Tra cứu khác
      </button>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center gap-4 mb-4">
          {teacher.photoURL ? (
            <img src={teacher.photoURL} alt={teacher.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-indigo-500/20 flex items-center justify-center text-2xl font-bold text-indigo-400 flex-shrink-0">
              {teacher.name[0]}
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-slate-900">{teacher.name}</h2>
            <span className="font-mono text-sm text-emerald-400">{teacher.code}</span>
            <p className="text-sm text-slate-500 mt-1">Giáo viên cấp {teacher.level}</p>
          </div>
        </div>

        {(teacher.subjectNames?.length ?? 0) > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-3">
            {(teacher.subjectNames ?? []).map((s) => (
              <Badge key={s} variant="info">{s}</Badge>
            ))}
          </div>
        )}

        {teacher.bio && (
          <p className="text-sm text-slate-500 leading-relaxed">{teacher.bio}</p>
        )}

        <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
          <span className="text-sm text-slate-500">Số buổi đã dạy</span>
          <span className="text-xl font-bold text-slate-900">{lessonCount}</span>
        </div>
      </div>
    </div>
  )
}
