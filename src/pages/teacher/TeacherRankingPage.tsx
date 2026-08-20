import { useEffect, useRef, useState } from 'react'
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
import { loadTeacherRanking, type TeacherRankingRow as RankingRow } from '@/lib/teacherRanking'
import { getTeacherCountryOption } from '@/lib/teacherCountries'

const AUTO_REFRESH_MS = 5 * 60 * 1000

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

function rankingCountryLabel(country: string | undefined, lang: 'vi' | 'en') {
  const raw = String(country || '').trim()
  if (!raw) return lang === 'vi' ? 'Chưa cập nhật quốc gia' : 'Country not updated'
  const option = getTeacherCountryOption(raw)
  return option ? (lang === 'vi' ? option.nameVi : option.nameEn) : raw
}

async function loadRankingFallback(month: string): Promise<RankingRow[]> {
  const [lessonSnap, teacherSnap] = await Promise.all([
    // Keep the existing rules-compatible query as a safety fallback. Production
    // normally uses the bounded callable and reaches this path only if it is unavailable.
    getDocs(query(
      collection(db, 'publicLessons'),
      where('status', '==', 'approved'),
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
    .filter((lesson) => (lesson.date || '') >= `${month}-01`
      && (lesson.date || '') <= `${month}-31`
      && Number(lesson.minutes) > 0
      && !!lesson.teacherId)
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
        country: teacher?.country,
        minutes: 0,
        lessons: 0,
      }
      current.minutes += Number(lesson.minutes) || 0
      current.lessons += 1
      aggregates.set(teacherId, current)
    })

  return Array.from(aggregates.values())
    .sort((left, right) => right.minutes - left.minutes
      || right.lessons - left.lessons
      || left.sortName.localeCompare(right.sortName))
    .slice(0, 10)
}

export function TeacherRankingPage() {
  const { lang } = useLanguageStore()
  const { teacherId } = useAuthStore()
  const [month] = useState(getCurrentMonth())
  const [rows, setRows] = useState<RankingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [reloadRequest, setReloadRequest] = useState({ version: 0, force: false })
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const rowsRef = useRef<RankingRow[]>([])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      if (rowsRef.current.length === 0) setLoading(true)
      else setRefreshing(true)
      setError(false)
    })

    const loadRanking = async () => {
      try {
        let ranked: RankingRow[]
        try {
          ranked = await loadTeacherRanking(month, reloadRequest.force)
        } catch (callableError) {
          console.warn('[teacher-ranking] bounded loader unavailable, using compatibility fallback', callableError)
          ranked = await loadRankingFallback(month)
        }
        if (active) {
          rowsRef.current = ranked
          setRows(ranked)
          setLastUpdated(new Date())
        }
      } catch (loadError) {
        console.error('[teacher-ranking]', loadError)
        if (active && rowsRef.current.length === 0) setError(true)
      } finally {
        if (active) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void loadRanking()
    return () => { active = false }
  }, [month, reloadRequest])

  useEffect(() => {
    const requestAutomaticRefresh = () => {
      if (document.visibilityState !== 'visible') return
      setReloadRequest((current) => ({ version: current.version + 1, force: false }))
    }
    const intervalId = window.setInterval(requestAutomaticRefresh, AUTO_REFRESH_MS)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && (!lastUpdated || Date.now() - lastUpdated.getTime() >= AUTO_REFRESH_MS)) {
        requestAutomaticRefresh()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [lastUpdated])

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
              <p className="mt-2 text-[11px] font-semibold text-white/80">
                {lang === 'vi' ? 'Tự động cập nhật mỗi 5 phút' : 'Automatically updates every 5 minutes'}
                {lastUpdated ? ` · ${lastUpdated.toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={refreshing}
            onClick={() => setReloadRequest((current) => ({ version: current.version + 1, force: true }))}
            className="bg-white/15 text-white hover:bg-white/25 hover:text-white"
            title={lang === 'vi' ? 'Tải lại bảng xếp hạng' : 'Reload ranking'}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
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
            <Button type="button" variant="outline" size="sm" onClick={() => setReloadRequest((current) => ({ version: current.version + 1, force: true }))}>
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
                  <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{rankingCountryLabel(row.country, lang)}</p>
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
