import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Lesson } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { StatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatVND, formatVietnameseDate, getCurrentMonth, VIETNAMESE_MONTHS } from '@/lib/constants'
import { ChevronLeft, ChevronRight, History, ChevronDown } from 'lucide-react'
import { format, subMonths, addMonths } from 'date-fns'

function groupByDate(lessons: Lesson[]): [string, Lesson[]][] {
  const map = new Map<string, Lesson[]>()
  for (const lesson of lessons) {
    const arr = map.get(lesson.date) || []
    arr.push(lesson)
    map.set(lesson.date, arr)
  }
  return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
}

export function LessonHistoryPage() {
  const { teacherId } = useAuthStore()
  const { t, lang } = useLanguageStore()
  const [month, setMonth] = useState(getCurrentMonth())
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const prevMonth = () => {
    const d = new Date(month + '-01')
    setMonth(format(subMonths(d, 1), 'yyyy-MM'))
  }
  const nextMonth = () => {
    const d = new Date(month + '-01')
    const next = addMonths(d, 1)
    if (next <= new Date()) setMonth(format(next, 'yyyy-MM'))
  }

  const [year, mon] = month.split('-')
  const monthLabel = lang === 'vi'
    ? `Tháng ${parseInt(mon)} năm ${year}`
    : `${new Date(Number(year), Number(mon) - 1).toLocaleString('en', { month: 'long' })} ${year}`

  useEffect(() => {
    if (!teacherId) return
    setLoading(true)
    const q = query(
      collection(db, 'lessons'),
      where('teacherId', '==', teacherId)
    )
    return onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Lesson))
        .filter((l) => l.date >= `${month}-01` && l.date <= `${month}-31`)
      docs.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
      setLessons(docs)
      setLoading(false)
    })
  }, [teacherId, month])

  const approved = lessons.filter((l) => l.status === 'approved')
  const totalSalary = approved.reduce((sum, l) => sum + (l.salary || 0), 0)
  const totalMinutes = approved.reduce((sum, l) => sum + l.minutes, 0)
  const groups = groupByDate(lessons)

  return (
    <div className="space-y-5 pt-2 lg:pt-6 max-w-2xl mx-auto animate-fade-in">
      <div className="bg-gradient-to-r from-[#3BB8EB] to-[#2196F3] rounded-2xl p-6 text-white shadow-lg shadow-sky-200/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <h1 className="text-2xl font-bold relative z-10">{t('history.title')}</h1>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Previous month">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-base font-semibold text-slate-700 min-w-[180px] text-center">{monthLabel}</span>
        <button onClick={nextMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Next month">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <p className="text-2xl font-bold text-slate-900">{approved.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t('history.lessons_taught')}</p>
        </Card>
        <Card className="text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <p className="text-2xl font-bold text-slate-900">{totalMinutes}'</p>
          <p className="text-xs text-slate-500 mt-0.5">{t('history.total_minutes')}</p>
        </Card>
        <Card className="text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1 bg-gradient-to-br from-white to-emerald-50/50">
          <p className="text-xl font-bold text-emerald-500">{formatVND(totalSalary)}</p>
          <p className="text-xs text-emerald-600/70 mt-0.5">{t('history.monthly_salary')}</p>
        </Card>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : lessons.length === 0 ? (
        <EmptyState
          icon={<History className="w-8 h-8" />}
          title={t('history.no_lessons')}
          description={`${monthLabel} ${t('history.month_no_lessons')}`}
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([date, dateLessons]) => (
            <div key={date}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {lang === 'vi' ? formatVietnameseDate(date) : new Date(date).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <div className="space-y-2">
                {dateLessons.map((lesson) => (
                  <Card key={lesson.id} padding="sm" className="cursor-pointer hover:shadow-md transition-all duration-300 hover:border-sky-100" onClick={() => setExpanded(expanded === lesson.id ? null : lesson.id)}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={lesson.status} />
                          <span className="text-sm font-medium text-slate-700">{lesson.studentName}</span>
                          <span className="text-xs text-slate-500">{lesson.studentCode}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{lesson.subjectName} · {lesson.minutes} {t('attendance.minutes')}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {lesson.status === 'approved' ? (
                          <p className="text-sm font-semibold text-emerald-500">{formatVND(lesson.salary || 0)}</p>
                        ) : (
                          <p className="text-xs text-slate-500">{t('history.pending')}</p>
                        )}
                        <ChevronDown className={`w-4 h-4 text-slate-400 mt-0.5 ml-auto transition-transform ${expanded === lesson.id ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    {expanded === lesson.id && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-sm">
                        {lesson.comment && (
                          <div>
                            <p className="text-xs text-slate-500 mb-0.5">{t('history.comment')}</p>
                            <p className="text-slate-600">{lesson.comment}</p>
                          </div>
                        )}
                        {lesson.homework && (
                          <div>
                            <p className="text-xs text-slate-500 mb-0.5">{t('history.homework')}</p>
                            <p className="text-slate-600">{lesson.homework}</p>
                          </div>
                        )}
                        {lesson.imageURLs?.length > 0 && (
                          <div className="flex gap-2">
                            {lesson.imageURLs.map((url, i) => (
                              <img key={i} src={url} alt="" className="w-16 h-16 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => {
                                import('@/lib/constants').then(m => m.openBase64InNewTab(url))
                              }} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
