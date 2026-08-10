import { useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { AlertTriangle, Clock3, RefreshCw, Trophy } from 'lucide-react'
import { db } from '@/lib/firebase'
import { Teacher } from '@/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useLanguageStore } from '@/stores/languageStore'
import { getCurrentMonth } from '@/lib/constants'
import { useAuthStore } from '@/stores/authStore'
import { teacherDisplayName } from '@/lib/teacherDisplay'

type RankingRow = {
  teacherId: string
  displayName: string
  sortName: string
  code: string
  photoURL?: string
  minutes: number
  lessons: number
}

type PublishedLesson = {
  teacherId?: string
  teacherCode?: string
  teacherName?: string
  date?: string
  minutes?: number
  status?: string
}

function monthLabel(month: string, lang: 'vi' | 'en') {
  const date = new Date(`${month}-01T00:00:00`)
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' }).format(date)
}

export function TeacherRankingPage() {
  const { lang } = useLanguageStore()
  const { teacherId } = useAuthStore()
  const [month] = useState(getCurrentMonth())
  const [rows, setRows] = useState<RankingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)

    const loadRanking = async () => {
      try {
        const [lessonSnap, teacherSnap] = await Promise.all([
          // Approved lessons are mirrored to publicLessons, which is readable
          // by teachers without widening access to other teachers' private reports.
          getDocs(query(
            collection(db, 'publicLessons'),
            where('date', '>=', `${month}-01`),
            where('date', '<=', `${month}-31`),
          )),
          getDocs(collection(db, 'teachers')),
        ])

        const teachers = new Map<string, Teacher>()
        teacherSnap.docs.forEach((docSnap) => {
          teachers.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Teacher)
        })

        const aggregates = new Map<string, RankingRow>()
        lessonSnap.docs
          .map((docSnap) => docSnap.data() as PublishedLesson)
          .filter((lesson) => (lesson.date || '') >= `${month}-01` && (lesson.date || '') <= `${month}-31` && Number(lesson.minutes) > 0 && !!lesson.teacherId)
          .forEach((lesson) => {
            const teacherId = lesson.teacherId
            if (!teacherId) return
            const teacher = teachers.get(teacherId)
            const teacherCode = teacher?.code || lesson.teacherCode || ''
            const teacherName = teacher?.name || lesson.teacherName || teacherCode || 'Unknown teacher'
            const current = aggregates.get(teacherId) || {
              teacherId,
              displayName: teacherDisplayName(teacherCode, teacherName) || teacherName,
              sortName: teacherName,
              code: teacherCode,
              photoURL: teacher?.photoURL,
              minutes: 0,
              lessons: 0,
            }
            current.minutes += Number(lesson.minutes) || 0
            current.lessons += 1
            aggregates.set(teacherId, current)
          })

        const ranked = Array.from(aggregates.values())
          .sort((left, right) => right.minutes - left.minutes || right.lessons - left.lessons || left.sortName.localeCompare(right.sortName))
          .slice(0, 10)
        if (active) setRows(ranked)
      } catch (loadError) {
        console.error('[teacher-ranking]', loadError)
        if (active) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadRanking()
    return () => { active = false }
  }, [month, reloadVersion])

  return (
    <div className="mx-auto max-w-5xl space-y-6 pt-2 lg:pt-6">
      <div className="rounded-3xl bg-gradient-to-r from-amber-400 to-orange-500 p-6 text-white shadow-lg shadow-amber-200/50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black">{lang === 'vi' ? 'Xếp hạng gia sư' : 'Teacher ranking'}</h1>
              <p className="mt-1 text-sm text-amber-50">
                {lang === 'vi' ? `Top 10 gia sư dạy nhiều phút nhất trong ${monthLabel(month, lang)}.` : `Top 10 teachers by taught minutes in ${monthLabel(month, lang)}.`}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setReloadVersion((current) => current + 1)}
            className="bg-white/15 text-white hover:bg-white/25 hover:text-white"
            title={lang === 'vi' ? 'Tải lại bảng xếp hạng' : 'Reload ranking'}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card padding="none" className="overflow-hidden">
        {loading ? (
          <div className="flex min-h-64 items-center justify-center"><LoadingSpinner /></div>
        ) : error ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
            <AlertTriangle className="h-8 w-8 text-rose-500" />
            <p className="text-sm font-semibold text-slate-600">{lang === 'vi' ? 'Không tải được bảng xếp hạng.' : 'Unable to load the ranking.'}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setReloadVersion((current) => current + 1)}>
              {lang === 'vi' ? 'Thử lại' : 'Try again'}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <Trophy className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-600">{lang === 'vi' ? 'Chưa có buổi dạy được duyệt trong tháng này.' : 'No approved lessons have been recorded this month.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <div key={row.teacherId} className={`flex items-center gap-4 px-4 py-4 sm:px-6 ${row.teacherId === teacherId ? 'bg-amber-50/70' : 'bg-white'}`}>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${index === 0 ? 'bg-amber-100 text-amber-800' : index === 1 ? 'bg-slate-100 text-slate-700' : index === 2 ? 'bg-orange-100 text-orange-800' : 'bg-slate-50 text-slate-500'}`}>
                  {index + 1}
                </div>
                {row.photoURL ? (
                  <img src={row.photoURL} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-black text-sky-700">
                    {row.displayName.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">{row.displayName}{row.teacherId === teacherId && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">{lang === 'vi' ? 'Bạn' : 'You'}</span>}</p>
                  {row.code && row.code.trim() !== row.displayName.trim() && (
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{row.code}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-right">
                  <Clock3 className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-black tabular-nums text-slate-900">{row.minutes.toLocaleString('vi-VN')}</span>
                  <span className="hidden text-xs font-semibold text-slate-500 sm:inline">{lang === 'vi' ? 'phút' : 'min'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default TeacherRankingPage
