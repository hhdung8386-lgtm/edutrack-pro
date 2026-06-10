import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Lesson, Teacher } from '@/types'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { formatVND, getCurrentMonth } from '@/lib/constants'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts'
import { subMonths, format } from 'date-fns'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'

const TABS = ['Tổng quan', 'Theo tháng', 'Theo giáo viên', 'Xuất báo cáo']

export function ReportsPage() {
  const [tab, setTab] = useState(0)
  const [month, setMonth] = useState(getCurrentMonth())
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [chartData, setChartData] = useState<{ month: string; count: number; salary: number }[]>([])

  useEffect(() => {
    let active = true
    const fetchLessons = async () => {
      try {
        const q = query(
          collection(db, 'lessons'),
          where('status', '==', 'approved'),
          where('date', '>=', `${month}-01`),
          where('date', '<=', `${month}-31`)
        )
        const snap = await getDocs(q)
        if (active) {
          setLessons(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson)))
        }
      } catch (err) {
        console.error(err)
      }
    }
    fetchLessons()
    return () => { active = false }
  }, [month])

  useEffect(() => {
    getDocs(collection(db, 'teachers')).then((snap) => {
      setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Teacher)))
    })

    // Build chart data for 6 months
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i)
      return format(d, 'yyyy-MM')
    })

    Promise.all(
      months.map((m) => {
        const q = query(
          collection(db, 'lessons'),
          where('status', '==', 'approved'),
          where('date', '>=', `${m}-01`),
          where('date', '<=', `${m}-31`)
        )
        return getDocs(q).then((snap) => {
          const docs = snap.docs.map((d) => d.data() as Lesson)
          return {
            month: m.slice(5) + '/' + m.slice(2, 4),
            count: docs.length,
            salary: docs.reduce((s, l) => s + (l.salary || 0), 0),
          }
        })
      })
    ).then(setChartData).catch((err) => {
      console.error('[reports-chart]', err)
    })
  }, [])

  const prevMonth = () => {
    const d = new Date(month + '-01')
    setMonth(format(subMonths(d, 1), 'yyyy-MM'))
  }
  const nextMonth = () => {
    const d = new Date(month + '-01')
    const next = subMonths(d, -1)
    if (next <= new Date()) setMonth(format(next, 'yyyy-MM'))
  }

  const totalSalary = lessons.reduce((s, l) => s + (l.salary || 0), 0)
  const totalMinutes = lessons.reduce((s, l) => s + l.minutes, 0)

  const teacherStats = teachers.map((t) => {
    const tLessons = lessons.filter((l) => l.teacherId === t.id)
    return {
      ...t,
      lessonCount: tLessons.length,
      salary: tLessons.reduce((s, l) => s + (l.salary || 0), 0),
      minutes: tLessons.reduce((s, l) => s + l.minutes, 0),
    }
  }).filter((t) => t.lessonCount > 0)

  const exportCSV = () => {
    const rows = [
      ['Ngày', 'Học viên', 'Giáo viên', 'Môn học', 'Sách học', 'Phút', 'Lương', 'Trạng thái'],
      ...lessons.map((l) => [l.date, l.studentName, l.teacherName, l.subjectName, l.book || '—', l.minutes, l.salary, l.status]),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `BaoCao_${month}_EduTrackPro.csv`
    a.click()
  }

  const [year, mon] = month.split('-')
  const monthLabel = `Tháng ${parseInt(mon)} / ${year}`

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Báo cáo</h1>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-white p-1 rounded-xl overflow-x-auto flex-wrap sm:flex-nowrap w-fit">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              tab === i ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Buổi tháng này', value: lessons.length, color: 'text-indigo-400' },
              { label: 'Tổng phút', value: `${totalMinutes}'`, color: 'text-slate-700' },
              { label: 'Tổng lương', value: formatVND(totalSalary), color: 'text-emerald-400' },
              { label: 'Giáo viên hoạt động', value: teacherStats.length, color: 'text-amber-400' },
            ].map((s) => (
              <Card key={s.label} className="text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-1">{s.label}</p>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title="Buổi dạy theo tháng" subtitle="6 tháng gần nhất" />
            <div className="h-52">
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#6366F1" radius={[4, 4, 0, 0]} name="Buổi dạy" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader title="Lương theo tháng" subtitle="6 tháng gần nhất" />
            <div className="h-52">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    formatter={(v: any) => [formatVND(v), 'Lương']} />
                  <Line type="monotone" dataKey="salary" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {(tab === 1 || tab === 2 || tab === 3) && (
        <div className="flex items-center gap-3 mb-2">
          <button onClick={prevMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg" aria-label="Tháng trước">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-base font-semibold text-slate-700 min-w-[160px] text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg" aria-label="Tháng sau">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {tab === 1 && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  {['Ngày', 'Học viên', 'Giáo viên', 'Môn', 'Sách học', 'Phút', 'Lương', 'Trạng thái'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {lessons.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-100/20">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{l.date}</td>
                    <td className="px-4 py-3 text-slate-700">{l.studentName}</td>
                    <td className="px-4 py-3 text-slate-600">{l.teacherName}</td>
                    <td className="px-4 py-3 text-slate-500">{l.subjectName}</td>
                    <td className="px-4 py-3 text-slate-600 italic max-w-[150px] truncate" title={l.book || ''}>{l.book || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{l.minutes}'</td>
                    <td className="px-4 py-3 text-emerald-400 font-medium">{formatVND(l.salary || 0)}</td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-300">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-slate-600">Tổng cộng</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{totalMinutes}'</td>
                  <td className="px-4 py-3 font-semibold text-emerald-400">{formatVND(totalSalary)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {tab === 2 && (
        <div className="space-y-3">
          {teacherStats.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Không có dữ liệu</p>
          ) : teacherStats.map((t) => (
            <Card key={t.id}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {t.photoURL ? (
                    <img src={t.photoURL} alt={t.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-400 flex-shrink-0">
                      {t.name[0]}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-slate-700">{t.name}</p>
                    <p className="text-xs text-slate-500">×{t.level} · {t.lessonCount} buổi · {t.minutes} phút</p>
                  </div>
                </div>
                <p className="text-emerald-400 font-semibold text-sm">{formatVND(t.salary)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 3 && (
        <Card className="max-w-md">
          <CardHeader title="Xuất báo cáo" />
          <p className="text-sm text-slate-500 mb-4">
            Tháng <span className="text-slate-700 font-medium">{monthLabel}</span> · {lessons.length} buổi · Tổng {formatVND(totalSalary)}
          </p>
          <Button onClick={exportCSV} fullWidth>
            <Download className="w-4 h-4" />
            Xuất Excel (CSV)
          </Button>
        </Card>
      )}
    </div>
  )
}
