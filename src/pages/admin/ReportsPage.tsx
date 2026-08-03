import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { db } from '@/lib/firebase'
import { BookingRequest, Lesson, Student, StudentSubject, Teacher } from '@/types'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { formatVND, getCurrentMonth } from '@/lib/constants'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, subMonths } from 'date-fns'
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  GraduationCap,
  Loader2,
  Search,
  Sparkles,
  Users,
} from 'lucide-react'

type ReportTab = 'funds' | 'monthly' | 'teachers'

type StudentFundRow = {
  id: string
  studentId: string
  studentCode: string
  studentName: string
  studentStatus: Student['status']
  subjectId: string
  subjectName: string
  availableMinutes: number
  bookedMinutes: number
  totalUnlearnedMinutes: number
}

type SubjectFundSummary = {
  id: string
  subjectName: string
  studentCount: number
  availableMinutes: number
  bookedMinutes: number
  totalUnlearnedMinutes: number
  rows: StudentFundRow[]
}

const activeBookingStatuses = new Set<BookingRequest['status']>(['pending', 'confirmed'])

function getStudentPackages(student: Student): StudentSubject[] {
  if (student.subjects && student.subjects.length > 0) return student.subjects
  if (!student.subjectId) return []

  const minutesPerSession = student.minutesPerSession || 50
  return [{
    subjectId: student.subjectId,
    subjectName: student.subjectName || 'Chưa xác định môn',
    totalSessions: student.totalSessions || 0,
    usedSessions: student.usedSessions || 0,
    remainingSessions: student.remainingSessions || 0,
    minutesPerSession,
    totalMinutes: student.totalMinutes ?? ((student.totalSessions || 0) * minutesPerSession),
    usedMinutes: student.usedMinutes ?? ((student.usedSessions || 0) * minutesPerSession),
    remainingMinutes: student.remainingMinutes ?? ((student.remainingSessions || 0) * minutesPerSession),
    pricePerMinute: 0,
  }]
}

function numberFormat(value: number) {
  return value.toLocaleString('vi-VN')
}

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('funds')
  const [month, setMonth] = useState(getCurrentMonth())
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([])
  const [chartData, setChartData] = useState<{ month: string; count: number; salary: number }[]>([])
  const [fundsLoading, setFundsLoading] = useState(true)
  const [fundsError, setFundsError] = useState('')
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | Student['status']>('all')
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    const fetchLessons = async () => {
      try {
        const monthQuery = query(
          collection(db, 'lessons'),
          where('date', '>=', `${month}-01`),
          where('date', '<=', `${month}-31`),
        )
        const snap = await getDocs(monthQuery)
        if (active) {
          setLessons(
            snap.docs
              .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Lesson))
              .filter((lesson) => lesson.status === 'approved'),
          )
        }
      } catch (error) {
        console.error('[reports-month]', error)
      }
    }
    fetchLessons()
    return () => { active = false }
  }, [month])

  useEffect(() => {
    let active = true
    getDocs(collection(db, 'teachers')).then((snap) => {
      if (active) setTeachers(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Teacher)))
    }).catch((error) => console.error('[reports-teachers]', error))

    const months = Array.from({ length: 6 }, (_, index) => {
      const date = subMonths(new Date(), 5 - index)
      return format(date, 'yyyy-MM')
    })

    Promise.all(
      months.map(async (targetMonth) => {
        const monthQuery = query(
          collection(db, 'lessons'),
          where('date', '>=', `${targetMonth}-01`),
          where('date', '<=', `${targetMonth}-31`),
        )
        const snap = await getDocs(monthQuery)
        const approved = snap.docs
          .map((docSnap) => docSnap.data() as Lesson)
          .filter((lesson) => lesson.status === 'approved')
        return {
          month: `${targetMonth.slice(5)}/${targetMonth.slice(2, 4)}`,
          count: approved.length,
          salary: approved.reduce((sum, lesson) => sum + (lesson.salary || 0), 0),
        }
      }),
    ).then((data) => {
      if (active) setChartData(data)
    }).catch((error) => console.error('[reports-chart]', error))

    return () => { active = false }
  }, [])

  useEffect(() => {
    setFundsLoading(true)
    setFundsError('')

    const unsubStudents = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        setStudents(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Student)))
        setFundsLoading(false)
      },
      (error) => {
        console.error('[reports-students]', error)
        setFundsError('Không thể tải quỹ học viên. Vui lòng thử lại.')
        setFundsLoading(false)
      },
    )

    const activeBookingsQuery = query(
      collection(db, 'bookingRequests'),
      where('status', 'in', ['pending', 'confirmed']),
    )
    const unsubBookings = onSnapshot(
      activeBookingsQuery,
      (snap) => setBookingRequests(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BookingRequest))),
      (error) => {
        console.error('[reports-bookings]', error)
        setFundsError('Không thể tải lịch đã đặt. Vui lòng thử lại.')
      },
    )

    return () => {
      unsubStudents()
      unsubBookings()
    }
  }, [])

  const fundRows = useMemo(() => {
    const bookingsByStudent = new Map<string, BookingRequest[]>()
    bookingRequests
      .filter((booking) => activeBookingStatuses.has(booking.status) && !booking.lessonId)
      .forEach((booking) => {
        const current = bookingsByStudent.get(booking.studentId) || []
        current.push(booking)
        bookingsByStudent.set(booking.studentId, current)
      })

    const rows: StudentFundRow[] = []
    students.forEach((student) => {
      const studentBookings = bookingsByStudent.get(student.id) || []
      const usedBookingIds = new Set<string>()
      const packages = getStudentPackages(student)

      packages.forEach((pkg, packageIndex) => {
        const matchingBookings = studentBookings.filter((booking) => {
          if (booking.subjectId) return booking.subjectId === pkg.subjectId
          if (booking.subjectName) return booking.subjectName.trim().toLocaleLowerCase() === pkg.subjectName.trim().toLocaleLowerCase()
          return packageIndex === 0 && pkg.subjectId === student.subjectId
        })
        matchingBookings.forEach((booking) => usedBookingIds.add(booking.id))

        const minutesPerSession = pkg.minutesPerSession || student.minutesPerSession || 50
        const remainingMinutes = Math.max(
          0,
          pkg.remainingMinutes ?? ((pkg.remainingSessions || 0) * minutesPerSession),
        )
        const bookedMinutes = matchingBookings.reduce((sum, booking) => sum + (booking.requestedMinutes || 0), 0)
        const availableMinutes = Math.max(0, remainingMinutes - bookedMinutes)
        const totalUnlearnedMinutes = availableMinutes + bookedMinutes

        if (totalUnlearnedMinutes > 0) {
          rows.push({
            id: `${student.id}:${pkg.subjectId || pkg.subjectName}`,
            studentId: student.id,
            studentCode: student.code,
            studentName: student.name,
            studentStatus: student.status,
            subjectId: pkg.subjectId || 'unknown-subject',
            subjectName: pkg.subjectName || 'Chưa xác định môn',
            availableMinutes,
            bookedMinutes,
            totalUnlearnedMinutes,
          })
        }
      })

      studentBookings
        .filter((booking) => !usedBookingIds.has(booking.id))
        .forEach((booking) => {
          const bookedMinutes = booking.requestedMinutes || 0
          if (bookedMinutes <= 0) return
          rows.push({
            id: `${student.id}:unmapped:${booking.id}`,
            studentId: student.id,
            studentCode: student.code,
            studentName: student.name,
            studentStatus: student.status,
            subjectId: booking.subjectId || 'unknown-subject',
            subjectName: booking.subjectName || 'Chưa xác định môn',
            availableMinutes: 0,
            bookedMinutes,
            totalUnlearnedMinutes: bookedMinutes,
          })
        })
    })

    return rows.sort((left, right) => (
      left.subjectName.localeCompare(right.subjectName, 'vi')
      || right.totalUnlearnedMinutes - left.totalUnlearnedMinutes
      || left.studentName.localeCompare(right.studentName, 'vi')
    ))
  }, [bookingRequests, students])

  const subjects = useMemo(() => {
    const bySubject = new Map<string, SubjectFundSummary>()
    fundRows.forEach((row) => {
      const key = `${row.subjectId}:${row.subjectName}`
      const current = bySubject.get(key) || {
        id: key,
        subjectName: row.subjectName,
        studentCount: 0,
        availableMinutes: 0,
        bookedMinutes: 0,
        totalUnlearnedMinutes: 0,
        rows: [],
      }
      current.rows.push(row)
      current.availableMinutes += row.availableMinutes
      current.bookedMinutes += row.bookedMinutes
      current.totalUnlearnedMinutes += row.totalUnlearnedMinutes
      bySubject.set(key, current)
    })

    return Array.from(bySubject.values())
      .map((subject) => ({ ...subject, studentCount: new Set(subject.rows.map((row) => row.studentId)).size }))
      .sort((left, right) => right.totalUnlearnedMinutes - left.totalUnlearnedMinutes || left.subjectName.localeCompare(right.subjectName, 'vi'))
  }, [fundRows])

  const filteredSubjects = useMemo(() => {
    const queryText = search.trim().toLocaleLowerCase()
    return subjects
      .filter((subject) => subjectFilter === 'all' || subject.id === subjectFilter)
      .map((subject) => ({
        ...subject,
        rows: subject.rows.filter((row) => {
          const matchesStatus = statusFilter === 'all' || row.studentStatus === statusFilter
          const matchesSearch = !queryText
            || `${row.studentCode} ${row.studentName} ${row.subjectName}`.toLocaleLowerCase().includes(queryText)
          return matchesStatus && matchesSearch
        }),
      }))
      .filter((subject) => subject.rows.length > 0)
      .map((subject) => ({
        ...subject,
        studentCount: new Set(subject.rows.map((row) => row.studentId)).size,
        availableMinutes: subject.rows.reduce((sum, row) => sum + row.availableMinutes, 0),
        bookedMinutes: subject.rows.reduce((sum, row) => sum + row.bookedMinutes, 0),
        totalUnlearnedMinutes: subject.rows.reduce((sum, row) => sum + row.totalUnlearnedMinutes, 0),
      }))
  }, [search, statusFilter, subjectFilter, subjects])

  const displayedRows = useMemo(() => filteredSubjects.flatMap((subject) => subject.rows), [filteredSubjects])
  const totals = useMemo(() => ({
    students: new Set(displayedRows.map((row) => row.studentId)).size,
    availableMinutes: displayedRows.reduce((sum, row) => sum + row.availableMinutes, 0),
    bookedMinutes: displayedRows.reduce((sum, row) => sum + row.bookedMinutes, 0),
    totalUnlearnedMinutes: displayedRows.reduce((sum, row) => sum + row.totalUnlearnedMinutes, 0),
  }), [displayedRows])

  const chartFundData = useMemo(() => filteredSubjects.slice(0, 8).map((subject) => ({
    name: subject.subjectName.length > 22 ? `${subject.subjectName.slice(0, 22)}…` : subject.subjectName,
    available: subject.availableMinutes,
    booked: subject.bookedMinutes,
  })), [filteredSubjects])

  const totalSalary = lessons.reduce((sum, lesson) => sum + (lesson.salary || 0), 0)
  const totalMinutes = lessons.reduce((sum, lesson) => sum + lesson.minutes, 0)
  const teacherStats = teachers.map((teacher) => {
    const teacherLessons = lessons.filter((lesson) => lesson.teacherId === teacher.id)
    return {
      ...teacher,
      lessonCount: teacherLessons.length,
      salary: teacherLessons.reduce((sum, lesson) => sum + (lesson.salary || 0), 0),
      minutes: teacherLessons.reduce((sum, lesson) => sum + lesson.minutes, 0),
    }
  }).filter((teacher) => teacher.lessonCount > 0)

  const exportExcel = () => {
    const summarySheet = XLSX.utils.json_to_sheet(filteredSubjects.map((subject) => ({
      'Môn học': subject.subjectName,
      'Số học viên': subject.studentCount,
      'Phút khả dụng': subject.availableMinutes,
      'Phút đã đặt': subject.bookedMinutes,
      'Tổng phút chưa học': subject.totalUnlearnedMinutes,
    })))
    const detailSheet = XLSX.utils.json_to_sheet(displayedRows.map((row) => ({
      'Môn học': row.subjectName,
      'Mã học viên': row.studentCode,
      'Học viên': row.studentName,
      'Trạng thái': row.studentStatus === 'active' ? 'Đang học' : row.studentStatus === 'reserved' ? 'Bảo lưu' : row.studentStatus === 'expired' ? 'Hết buổi' : 'Tạm dừng',
      'Phút khả dụng': row.availableMinutes,
      'Phút đã đặt': row.bookedMinutes,
      'Tổng phút chưa học': row.totalUnlearnedMinutes,
    })))
    summarySheet['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 22 }]
    detailSheet['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 22 }]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Tổng hợp theo môn')
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Chi tiết học viên')
    XLSX.writeFile(workbook, `Quy_hoc_vien_theo_mon_${format(new Date(), 'yyyyMMdd')}.xlsx`)
  }

  const prevMonth = () => {
    const date = new Date(`${month}-01`)
    setMonth(format(subMonths(date, 1), 'yyyy-MM'))
  }
  const nextMonth = () => {
    const date = subMonths(new Date(`${month}-01`), -1)
    if (date <= new Date()) setMonth(format(date, 'yyyy-MM'))
  }

  const [year, monthNumber] = month.split('-')
  const monthLabel = `Tháng ${parseInt(monthNumber, 10)} / ${year}`
  const tabs: { id: ReportTab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'funds', label: 'Quỹ học viên theo môn', icon: BookOpen },
    { id: 'monthly', label: 'Hoạt động theo tháng', icon: CalendarDays },
    { id: 'teachers', label: 'Theo gia sư', icon: GraduationCap },
  ]

  return (
    <div className="mx-auto max-w-[1520px] space-y-6 px-0 pb-8 pt-2 lg:pt-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-[0_18px_38px_-32px_rgba(180,120,0,0.45)] lg:flex-row lg:items-end lg:justify-between lg:p-6">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800">
            <Sparkles className="h-3.5 w-3.5" />
            Báo cáo vận hành quỹ học viên
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Quỹ học viên theo môn học</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Theo dõi chính xác số phút học viên chưa học, tách rõ phần khả dụng và phần đã giữ chỗ trong từng khóa học.</p>
        </div>
        <Button onClick={exportExcel} disabled={fundsLoading || displayedRows.length === 0} className="w-full bg-brand-500 text-brand-950 hover:bg-brand-400 sm:w-auto">
          <Download className="h-4 w-4" />
          Xuất Excel
        </Button>
      </section>

      <nav className="flex w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm" aria-label="Nhóm báo cáo">
        {tabs.map((item) => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-bold transition-all active:scale-[0.98] ${active ? 'bg-brand-400 text-brand-950 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          )
        })}
      </nav>

      {tab === 'funds' && (
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Học viên còn quỹ', value: totals.students, icon: Users, tone: 'bg-sky-50 text-sky-700 ring-sky-100' },
              { label: 'Tổng phút chưa học', value: `${numberFormat(totals.totalUnlearnedMinutes)} phút`, icon: BarChart3, tone: 'bg-brand-50 text-brand-800 ring-brand-100' },
              { label: 'Phút khả dụng', value: `${numberFormat(totals.availableMinutes)} phút`, icon: Sparkles, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
              { label: 'Phút đã đặt', value: `${numberFormat(totals.bookedMinutes)} phút`, icon: CalendarDays, tone: 'bg-violet-50 text-violet-700 ring-violet-100' },
            ].map((metric) => {
              const Icon = metric.icon
              return (
                <Card key={metric.label} className="p-4 sm:p-5">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${metric.tone}`}><Icon className="h-5 w-5" /></div>
                  <p className="mt-4 text-xl font-black tabular-nums tracking-tight text-slate-950 sm:text-2xl">{metric.value}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{metric.label}</p>
                </Card>
              )
            })}
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_390px]">
            <Card className="overflow-hidden p-0">
              <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                <CardHeader title="Phân bổ quỹ theo môn" subtitle="So sánh phút khả dụng và đã đặt của các môn có học viên đang còn quỹ." />
              </div>
              <div className="h-[292px] p-4 sm:p-6">
                {chartFundData.length > 0 ? (
                  <ResponsiveContainer>
                    <BarChart data={chartFundData} layout="vertical" margin={{ top: 2, right: 18, left: 16, bottom: 2 }}>
                      <CartesianGrid horizontal={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={124} tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 12px 24px -16px rgba(15, 23, 42, .38)' }}
                        formatter={(value, name) => [`${numberFormat(Number(value || 0))} phút`, name === 'available' ? 'Khả dụng' : 'Đã đặt']}
                      />
                      <Bar dataKey="available" stackId="fund" fill="#34d399" radius={[0, 0, 0, 0]} name="available" />
                      <Bar dataKey="booked" stackId="fund" fill="#a78bfa" radius={[0, 6, 6, 0]} name="booked" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyFundState />}
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <div className="flex items-center gap-2 text-slate-950"><BookOpen className="h-5 w-5 text-brand-600" /><h2 className="font-black">Cách tính báo cáo</h2></div>
              <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
                <p><strong className="text-slate-900">Khả dụng</strong> là số phút còn lại trong gói sau khi trừ các lịch đang chờ hoặc đã được giữ chỗ.</p>
                <p><strong className="text-slate-900">Đã đặt</strong> gồm lịch ở trạng thái chờ xác nhận và đã xác nhận, chưa chuyển thành buổi học.</p>
                <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-xs font-semibold leading-5 text-brand-900">Tổng phút chưa học = phút khả dụng + phút đã đặt. Mỗi học viên được gom đúng theo môn đang đăng ký.</div>
              </div>
            </Card>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.32)] sm:p-5">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_230px_190px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, mã học viên hoặc môn học" className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-800 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100" />
              </label>
              <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100">
                <option value="all">Tất cả môn học</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.subjectName}</option>)}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100">
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang học</option>
                <option value="reserved">Bảo lưu</option>
                <option value="inactive">Tạm dừng</option>
                <option value="expired">Hết buổi</option>
              </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
              <span>Đang hiển thị {numberFormat(displayedRows.length)} gói học của {numberFormat(totals.students)} học viên.</span>
              <span>{numberFormat(filteredSubjects.length)} môn học</span>
            </div>
          </section>

          {fundsLoading ? (
            <FundLoadingState />
          ) : fundsError ? (
            <Card className="border-rose-200 bg-rose-50 p-8 text-center"><p className="font-bold text-rose-700">{fundsError}</p></Card>
          ) : filteredSubjects.length === 0 ? (
            <EmptyFundState large />
          ) : (
            <section className="space-y-4">
              {filteredSubjects.map((subject) => {
                const isExpanded = expandedSubjects.has(subject.id)
                return (
                  <article key={subject.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_32px_-28px_rgba(15,23,42,0.36)]">
                    <button
                      type="button"
                      onClick={() => setExpandedSubjects((current) => {
                        const next = new Set(current)
                        if (next.has(subject.id)) next.delete(subject.id)
                        else next.add(subject.id)
                        return next
                      })}
                      className="flex w-full flex-col gap-4 p-4 text-left transition hover:bg-slate-50 sm:p-5 lg:flex-row lg:items-center lg:justify-between"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><BookOpen className="h-5 w-5" /></div>
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-black text-slate-950 sm:text-lg">{subject.subjectName}</h2>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{numberFormat(subject.studentCount)} học viên còn quỹ học</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-right sm:gap-7">
                        <FundMetric label="Khả dụng" value={subject.availableMinutes} className="text-emerald-600" />
                        <FundMetric label="Đã đặt" value={subject.bookedMinutes} className="text-violet-600" />
                        <FundMetric label="Tổng chưa học" value={subject.totalUnlearnedMinutes} className="text-slate-950" />
                      </div>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {isExpanded && (
                      <div className="border-t border-slate-100">
                        <div className="hidden overflow-x-auto md:block">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-5 py-3">Học viên</th>
                                <th className="px-4 py-3">Trạng thái</th>
                                <th className="px-4 py-3 text-right">Khả dụng</th>
                                <th className="px-4 py-3 text-right">Đã đặt</th>
                                <th className="px-5 py-3 text-right">Tổng chưa học</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {subject.rows.map((row) => <FundStudentRow key={row.id} row={row} />)}
                            </tbody>
                          </table>
                        </div>
                        <div className="space-y-2 p-3 md:hidden">
                          {subject.rows.map((row) => <FundStudentCard key={row.id} row={row} />)}
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </section>
          )}
        </div>
      )}

      {tab !== 'funds' && (
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-900" aria-label="Tháng trước"><ChevronLeft className="h-5 w-5" /></button>
          <span className="min-w-[160px] text-center text-base font-bold text-slate-700">{monthLabel}</span>
          <button onClick={nextMonth} className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-900" aria-label="Tháng sau"><ChevronRight className="h-5 w-5" /></button>
        </div>
      )}

      {tab === 'monthly' && (
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Buổi đã duyệt', value: lessons.length, icon: CalendarDays, tone: 'text-brand-700 bg-brand-50' },
              { label: 'Tổng phút dạy', value: `${numberFormat(totalMinutes)} phút`, icon: BarChart3, tone: 'text-sky-700 bg-sky-50' },
              { label: 'Tổng lương', value: formatVND(totalSalary), icon: Sparkles, tone: 'text-emerald-700 bg-emerald-50' },
              { label: 'Gia sư hoạt động', value: teacherStats.length, icon: GraduationCap, tone: 'text-violet-700 bg-violet-50' },
            ].map((metric) => {
              const Icon = metric.icon
              return <Card key={metric.label} className="p-4 sm:p-5"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${metric.tone}`}><Icon className="h-5 w-5" /></span><p className="mt-4 text-xl font-black text-slate-950">{metric.value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{metric.label}</p></Card>
            })}
          </section>
          <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card className="p-5"><CardHeader title="Buổi dạy theo tháng" subtitle="6 tháng gần nhất" /><div className="mt-5 h-64"><ResponsiveContainer><BarChart data={chartData}><CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} /><Bar dataKey="count" fill="#fbbf24" radius={[6, 6, 0, 0]} name="Buổi dạy" /></BarChart></ResponsiveContainer></div></Card>
            <Card className="p-5"><CardHeader title="Lương theo tháng" subtitle="6 tháng gần nhất" /><div className="mt-5 h-64"><ResponsiveContainer><LineChart data={chartData}><CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(value) => [formatVND(Number(value || 0)), 'Lương']} /><Line type="monotone" dataKey="salary" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} /></LineChart></ResponsiveContainer></div></Card>
          </section>
        </div>
      )}

      {tab === 'teachers' && (
        <section className="space-y-3">
          {teacherStats.length === 0 ? <EmptyFundState /> : teacherStats.map((teacher) => (
            <Card key={teacher.id} className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  {teacher.photoURL ? <img src={teacher.photoURL} alt={teacher.name} className="h-11 w-11 rounded-xl object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 font-black text-brand-700">{teacher.name[0]}</div>}
                  <div className="min-w-0"><p className="truncate font-black text-slate-900">{teacher.name}</p><p className="mt-1 text-xs font-semibold text-slate-500">{teacher.lessonCount} buổi đã duyệt · {numberFormat(teacher.minutes)} phút</p></div>
                </div>
                <p className="shrink-0 text-sm font-black text-emerald-600">{formatVND(teacher.salary)}</p>
              </div>
            </Card>
          ))}
        </section>
      )}
    </div>
  )
}

function FundMetric({ label, value, className }: { label: string; value: number; className: string }) {
  return <div><p className={`text-sm font-black tabular-nums ${className}`}>{numberFormat(value)}p</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p></div>
}

function FundStudentRow({ row }: { row: StudentFundRow }) {
  return <tr className="transition hover:bg-slate-50"><td className="px-5 py-3.5"><p className="font-bold text-slate-900">{row.studentName}</p><p className="mt-0.5 font-mono text-[11px] text-slate-500">{row.studentCode}</p></td><td className="px-4 py-3.5"><StatusBadge status={row.studentStatus} /></td><td className="px-4 py-3.5 text-right font-bold tabular-nums text-emerald-600">{numberFormat(row.availableMinutes)}p</td><td className="px-4 py-3.5 text-right font-bold tabular-nums text-violet-600">{numberFormat(row.bookedMinutes)}p</td><td className="px-5 py-3.5 text-right font-black tabular-nums text-slate-950">{numberFormat(row.totalUnlearnedMinutes)}p</td></tr>
}

function FundStudentCard({ row }: { row: StudentFundRow }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900">{row.studentName}</p><p className="mt-0.5 font-mono text-[11px] text-slate-500">{row.studentCode}</p></div><StatusBadge status={row.studentStatus} /></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><FundMetric label="Khả dụng" value={row.availableMinutes} className="text-emerald-600" /><FundMetric label="Đã đặt" value={row.bookedMinutes} className="text-violet-600" /><FundMetric label="Tổng" value={row.totalUnlearnedMinutes} className="text-slate-950" /></div></div>
}

function EmptyFundState({ large = false }: { large?: boolean }) {
  return <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center ${large ? 'min-h-72 py-10' : 'min-h-full py-6'}`}><BookOpen className="h-9 w-9 text-slate-300" /><p className="mt-3 font-bold text-slate-700">Chưa có quỹ học viên phù hợp</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Khi học viên có phút khả dụng hoặc lịch đã đặt, báo cáo sẽ tự động hiển thị tại đây.</p></div>
}

function FundLoadingState() {
  return <div className="grid grid-cols-1 gap-4"><div className="h-20 animate-pulse rounded-2xl bg-slate-100" /><div className="h-20 animate-pulse rounded-2xl bg-slate-100" /><div className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Đang tổng hợp quỹ học viên…</div></div>
}
