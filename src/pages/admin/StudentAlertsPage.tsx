import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { AlertTriangle, CalendarDays, CheckCircle2, Search, ShieldAlert, UserRoundX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '@/lib/firebase'
import type { Lesson } from '@/types'
import { buildStudentAbsenceAlerts } from '@/lib/studentAbsenceAlerts'
import { getCurrentMonth } from '@/lib/constants'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

function formatDate(dateISO: string) {
  if (!dateISO) return 'Chưa xác định'
  const [year, month, day] = dateISO.split('-')
  return year && month && day ? `${day}/${month}/${year}` : dateISO
}

export function StudentAlertsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [absenceFilter, setAbsenceFilter] = useState<'all' | 'unexcused'>('all')
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())

  useEffect(() => {
    const absenceQuery = query(
      collection(db, 'lessons'),
      where('attendanceStatus', 'in', ['with_permission', 'without_permission']),
    )
    return onSnapshot(
      absenceQuery,
      (snapshot) => {
        setLessons(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Lesson)))
        setLoadError('')
        setLoading(false)
      },
      (error) => {
        console.error('Unable to load student absence alerts:', error)
        setLoadError('Không thể tải dữ liệu điểm danh. Vui lòng kiểm tra quyền truy cập hoặc thử lại sau.')
        setLoading(false)
      },
    )
  }, [])

  const monthLessons = useMemo(
    () => lessons.filter((lesson) => lesson.date?.startsWith(`${selectedMonth}-`)),
    [lessons, selectedMonth],
  )
  const alerts = useMemo(() => buildStudentAbsenceAlerts(monthLessons), [monthLessons])
  const filteredAlerts = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi')
    return alerts.filter((alert) => {
      const matchesSearch = !keyword
        || alert.studentName.toLocaleLowerCase('vi').includes(keyword)
        || alert.studentCode.toLocaleLowerCase('vi').includes(keyword)
      const matchesType = absenceFilter === 'all' || alert.unexcusedAbsences > 0
      return matchesSearch && matchesType
    })
  }, [absenceFilter, alerts, search])

  const unexcusedStudentCount = alerts.filter((alert) => alert.unexcusedAbsences > 0).length
  const totalAbsences = alerts.reduce((sum, alert) => sum + alert.totalAbsences, 0)

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <section className="overflow-hidden rounded-3xl border border-amber-200 bg-amber-50 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm shadow-amber-200">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Theo dõi chuyên cần</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Cảnh báo học viên</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                Tháng {Number(selectedMonth.slice(5, 7))} / {selectedMonth.slice(0, 4)} · Tự động liệt kê học viên có từ 2 báo cáo vắng trở lên. Báo cáo bị từ chối không được tính vào cảnh báo.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[390px]">
            <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-amber-200">
              <p className="text-2xl font-black tabular-nums text-slate-950">{alerts.length}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Học viên cảnh báo</p>
            </div>
            <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-amber-200">
              <p className="text-2xl font-black tabular-nums text-rose-600">{unexcusedStudentCount}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Có vắng KP</p>
            </div>
            <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-amber-200">
              <p className="text-2xl font-black tabular-nums text-amber-700">{totalAbsences}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Tổng lượt vắng</p>
            </div>
          </div>
        </div>
      </section>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" padding="sm">
        <label className="relative block w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <span className="sr-only">Tìm học viên</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo tên hoặc mã học viên..."
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 focus-within:border-amber-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-100">
          <CalendarDays className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="sr-only">Chọn tháng cảnh báo</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="min-w-0 bg-transparent text-sm font-bold outline-none"
            aria-label="Hiển thị cảnh báo theo tháng"
          />
        </label>
        <div className="flex rounded-xl bg-slate-100 p-1" aria-label="Lọc loại vắng">
          <button type="button" onClick={() => setAbsenceFilter('all')} className={`min-h-9 rounded-lg px-3 text-xs font-bold transition ${absenceFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Tất cả</button>
          <button type="button" onClick={() => setAbsenceFilter('unexcused')} className={`min-h-9 rounded-lg px-3 text-xs font-bold transition ${absenceFilter === 'unexcused' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500'}`}>Có vắng không phép</button>
        </div>
      </Card>

      {loading ? (
        <Card><div className="flex min-h-56 items-center justify-center"><LoadingSpinner /></div></Card>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700" role="alert">
          {loadError}
        </div>
      ) : filteredAlerts.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<CheckCircle2 className="h-8 w-8 text-emerald-600" />}
            title={alerts.length === 0 ? 'Chưa có học viên cần cảnh báo' : 'Không có kết quả phù hợp'}
            description={alerts.length === 0 ? 'Danh sách sẽ tự cập nhật khi một học viên có từ 2 báo cáo vắng hợp lệ.' : 'Hãy đổi từ khóa hoặc bộ lọc để xem học viên khác.'}
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredAlerts.map((alert) => (
            <article key={alert.studentId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                    <UserRoundX className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-black text-slate-950">{alert.studentName}</h2>
                    <p className="mt-0.5 font-mono text-xs font-semibold text-slate-500">{alert.studentCode}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">{alert.excusedAbsences} có phép</span>
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200">{alert.unexcusedAbsences} không phép</span>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 font-bold text-slate-700"><AlertTriangle className="h-4 w-4 text-amber-600" /> Tổng cộng {alert.totalAbsences} buổi vắng</span>
                  <span className="flex items-center gap-1.5 text-slate-500"><CalendarDays className="h-4 w-4" /> Gần nhất {formatDate(alert.latestAbsenceDate)}</span>
                </div>
                <div className="space-y-1.5">
                  {alert.recentAbsences.map((absence) => (
                    <div key={absence.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-200">
                      <span className="font-bold text-slate-700">{formatDate(absence.date)} · {absence.subjectName}</span>
                      <span className={absence.attendanceStatus === 'without_permission' ? 'font-semibold text-rose-600' : 'font-semibold text-amber-700'}>
                        {absence.attendanceStatus === 'without_permission' ? 'Vắng không phép' : 'Vắng có phép'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Link to={`/admin/students/${alert.studentId}`} className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-bold text-brand-800 transition hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-300">
                  Mở hồ sơ học viên
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
