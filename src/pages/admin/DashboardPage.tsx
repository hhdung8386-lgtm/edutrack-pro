import { useEffect, useState } from 'react'
import { collection, query, where, limit, getDocs, getCountFromServer } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Lesson } from '@/types'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CardSkeleton, TableSkeleton } from '@/components/shared/LoadingSpinner'
import { ApproveModal } from '@/components/lessons/ApproveModal'
import { formatVND, getToday } from '@/lib/constants'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Users, GraduationCap, Clock, ClipboardCheck, TrendingUp } from 'lucide-react'
import { format, subMonths } from 'date-fns'
import { useNavigate } from 'react-router-dom'

function KpiCard({ title, value, sub, icon: Icon, color, pulse }: {
  title: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color: string
  pulse?: boolean
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
          <p className={`text-3xl font-bold mt-1.5 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-current/10 ${color}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
      {pulse && (
        <span className="absolute top-3 right-12 w-2 h-2 bg-amber-400 rounded-full animate-ping" />
      )}
    </Card>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const today = getToday()
  const [todayLessons, setTodayLessons] = useState<Lesson[]>([])
  const [pendingLessons, setPendingLessons] = useState<Lesson[]>([])
  const [studentCount, setStudentCount] = useState(0)
  const [teacherCount, setTeacherCount] = useState(0)
  const [chartData, setChartData] = useState<{ month: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [approvingLesson, setApprovingLesson] = useState<Lesson | null>(null)
  const [todayLimit, setTodayLimit] = useState(5)

  useEffect(() => {
    let active = true

    async function loadDashboardLessons() {
      setLoading(true)
      const [todayResult, pendingResult] = await Promise.allSettled([
        getDocs(query(collection(db, 'lessons'), where('date', '==', today), limit(todayLimit))),
        getDocs(query(collection(db, 'lessons'), where('status', '==', 'pending'), limit(20))),
      ])

      if (!active) return

      if (todayResult.status === 'fulfilled') {
        const docs = todayResult.value.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
        docs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
        setTodayLessons(docs)
      } else {
        setTodayLessons([])
      }

      if (pendingResult.status === 'fulfilled') {
        const docs = pendingResult.value.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
        docs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
        setPendingLessons(docs.slice(0, 5))
      } else {
        setPendingLessons([])
      }

      setLoading(false)
    }

    loadDashboardLessons().catch(() => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
    }
  }, [today, todayLimit])

  useEffect(() => {
    // One-shot count queries instead of full-document subscriptions (1 read each)
    getCountFromServer(query(collection(db, 'students'), where('status', '==', 'active')))
      .then((snap) => setStudentCount(snap.data().count))
      .catch((err) => console.error('[dashboard-student-count]', err))

    getCountFromServer(query(collection(db, 'teachers'), where('status', '==', 'active')))
      .then((snap) => setTeacherCount(snap.data().count))
      .catch((err) => console.error('[dashboard-teacher-count]', err))

    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i)
      return format(d, 'yyyy-MM')
    })

    Promise.all(
      months.map(async (m) => {
        try {
          const snap = await getDocs(
            query(
              collection(db, 'lessons'),
              where('date', '>=', m + '-01'),
              where('date', '<=', m + '-31')
            )
          )
          return {
            month: m.slice(5) + '/' + m.slice(2, 4),
            count: snap.docs.filter((docSnap) => docSnap.data().status === 'approved').length
          }
        } catch (err) {
          console.error(`[dashboard-chart-month] Error for ${m}:`, err)
          return {
            month: m.slice(5) + '/' + m.slice(2, 4),
            count: 0
          }
        }
      })
    )
      .then((data) => {
        setChartData(data)
      })
      .catch((err) => {
        console.error('[dashboard-chart]', err)
      })
  }, [])

  const pendingCount = pendingLessons.length

  if (loading) {
    return (
      <div className="space-y-6 pt-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Tổng quan hệ thống — {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Buổi học hôm nay"
          value={todayLessons.length}
          icon={Clock}
          color="text-indigo-400"
        />
        <KpiCard
          title="Chờ duyệt"
          value={pendingCount}
          icon={ClipboardCheck}
          color="text-amber-400"
          pulse={pendingCount > 0}
        />
        <KpiCard
          title="Học viên active"
          value={studentCount}
          icon={Users}
          color="text-emerald-400"
        />
        <KpiCard
          title="Giáo viên active"
          value={teacherCount}
          icon={GraduationCap}
          color="text-rose-400"
        />
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today lessons */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">Buổi dạy hôm nay</h3>
          </div>
          {todayLessons.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-8">Chưa có buổi dạy nào hôm nay</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Học viên</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">Giáo viên</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Phút</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {todayLessons.map((lesson) => (
                    <tr
                      key={lesson.id}
                      className="hover:bg-slate-100/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/admin/approvals`)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-700">{lesson.studentName}</p>
                        <p className="text-xs text-slate-500">{lesson.subjectName}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{lesson.teacherName}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{lesson.minutes}'</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={lesson.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {todayLessons.length >= todayLimit && (
                <div className="flex justify-center p-3 border-t border-slate-200/50">
                  <Button variant="ghost" size="sm" onClick={() => setTodayLimit(prev => prev + 5)}>
                    Xem thêm
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Pending approvals */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Cần duyệt ngay</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/approvals')}>
              Xem tất cả
            </Button>
          </div>
          {pendingLessons.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-8">Không có buổi nào chờ duyệt</p>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {pendingLessons.map((lesson) => (
                <div key={lesson.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-100/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{lesson.studentName}</p>
                    <p className="text-xs text-slate-500">{lesson.teacherName} · {lesson.minutes} phút · {lesson.date}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setApprovingLesson(lesson)}
                  >
                    Duyệt
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader
          title="Buổi dạy theo tháng"
          subtitle="6 tháng gần nhất"
          action={<TrendingUp className="w-5 h-5 text-slate-500" />}
        />
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                labelStyle={{ color: '#64748b' }}
              />
              <Bar dataKey="count" fill="#6366F1" radius={[4, 4, 0, 0]} name="Buổi dạy" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {approvingLesson && (
        <ApproveModal
          lesson={approvingLesson}
          onClose={() => setApprovingLesson(null)}
        />
      )}
    </div>
  )
}
