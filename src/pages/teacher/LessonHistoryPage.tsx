import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Lesson } from '@/types'
import { useAuthStore } from '@/stores/authStore'
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
  const monthLabel = `Tháng ${parseInt(mon)} năm ${year}`

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
    <div className="space-y-5 pt-2 lg:pt-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Lịch sử buổi dạy</h1>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg transition-colors" aria-label="Tháng trước">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-base font-semibold text-slate-700 min-w-[180px] text-center">{monthLabel}</span>
        <button onClick={nextMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg transition-colors" aria-label="Tháng sau">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <p className="text-2xl font-bold text-slate-900">{approved.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">Buổi đã dạy</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-slate-900">{totalMinutes}'</p>
          <p className="text-xs text-slate-500 mt-0.5">Tổng phút</p>
        </Card>
        <Card className="text-center">
          <p className="text-xl font-bold text-emerald-400">{formatVND(totalSalary)}</p>
          <p className="text-xs text-slate-500 mt-0.5">Lương tháng này</p>
        </Card>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : lessons.length === 0 ? (
        <EmptyState
          icon={<History className="w-8 h-8" />}
          title="Không có buổi dạy nào"
          description={`Tháng ${monthLabel} chưa có buổi dạy nào`}
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([date, dateLessons]) => (
            <div key={date}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {formatVietnameseDate(date)}
              </p>
              <div className="space-y-2">
                {dateLessons.map((lesson) => (
                  <Card key={lesson.id} padding="sm" className="cursor-pointer" onClick={() => setExpanded(expanded === lesson.id ? null : lesson.id)}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={lesson.status} />
                          <span className="text-sm font-medium text-slate-700">{lesson.studentName}</span>
                          <span className="text-xs text-slate-500">{lesson.studentCode}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{lesson.subjectName} · {lesson.minutes} phút</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {lesson.status === 'approved' ? (
                          <p className="text-sm font-semibold text-emerald-400">{formatVND(lesson.salary || 0)}</p>
                        ) : (
                          <p className="text-xs text-slate-500">Chờ duyệt</p>
                        )}
                        <ChevronDown className={`w-4 h-4 text-slate-500 mt-0.5 ml-auto transition-transform ${expanded === lesson.id ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    {expanded === lesson.id && (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-2 text-sm">
                        {lesson.comment && (
                          <div>
                            <p className="text-xs text-slate-500 mb-0.5">Nhận xét</p>
                            <p className="text-slate-600">{lesson.comment}</p>
                          </div>
                        )}
                        {lesson.homework && (
                          <div>
                            <p className="text-xs text-slate-500 mb-0.5">Bài tập</p>
                            <p className="text-slate-600">{lesson.homework}</p>
                          </div>
                        )}
                        {lesson.imageURLs?.length > 0 && (
                          <div className="flex gap-2">
                            {lesson.imageURLs.map((url, i) => (
                              <img key={i} src={url} alt="" className="w-16 h-16 rounded-lg object-cover" />
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
