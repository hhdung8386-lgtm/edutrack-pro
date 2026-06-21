import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, getDocs, updateDoc, doc, serverTimestamp, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Payroll, Teacher, Lesson } from '@/types'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatVND, getCurrentMonth } from '@/lib/constants'
import { ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp, CheckSquare, Search } from 'lucide-react'
import { subMonths, format } from 'date-fns'
import { toast } from '@/stores/toastStore'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'

export function PayrollPage() {
  const { user } = useAuthStore()
  const [month, setMonth] = useState(getCurrentMonth())
  const [payrolls, setPayrolls] = useState<Payroll[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [paying, setPaying] = useState(false)
  const [search, setSearch] = useState('')
  const [lessons, setLessons] = useState<Lesson[]>([])

  const prevMonth = () => {
    const d = new Date(month + '-01')
    setMonth(format(subMonths(d, 1), 'yyyy-MM'))
  }
  const nextMonth = () => {
    const d = new Date(month + '-01')
    const next = subMonths(d, -1)
    if (next <= new Date()) setMonth(format(next, 'yyyy-MM'))
  }

  useEffect(() => {
    const q = query(collection(db, 'payroll'), where('month', '==', month))
    return onSnapshot(q, (snap) => {
      setPayrolls(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payroll)))
    })
  }, [month])

  useEffect(() => {
    getDocs(collection(db, 'teachers')).then((snap) => {
      setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Teacher)))
    })
  }, [])

  useEffect(() => {
    let active = true
    const start = month + '-01'
    const end = month + '-31'
    getDocs(query(
      collection(db, 'lessons'),
      where('date', '>=', start),
      where('date', '<=', end)
    )).then((snap) => {
      if (!active) return
      setLessons(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson)))
    }).catch((err) => {
      console.error("Error loading lessons for month:", err)
    })
    return () => {
      active = false
    }
  }, [month])

  const [year, mon] = month.split('-')
  const monthLabel = `Tháng ${parseInt(mon)} / ${year}`
  const totalPayroll = payrolls.reduce((s, p) => s + p.amount, 0)

  // Group payroll by teacher
  const teacherPayrolls = teachers.map((t) => {
    const tPayrolls = payrolls.filter((p) => p.teacherId === t.id)
    if (tPayrolls.length === 0) return null
    return {
      teacher: t,
      payrolls: tPayrolls,
      total: tPayrolls.reduce((s, p) => s + p.amount, 0),
      minutes: tPayrolls.reduce((s, p) => s + p.minutes, 0),
      paid: tPayrolls.every((p) => p.paid),
    }
  }).filter(Boolean) as { teacher: Teacher; payrolls: Payroll[]; total: number; minutes: number; paid: boolean }[]

  const filteredTeacherPayrolls = teacherPayrolls.filter(tp => 
    tp.teacher.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleMarkPaid = async () => {
    if (selected.size === 0) return
    setPaying(true)
    try {
      for (const teacherId of selected) {
        const tPayrolls = payrolls.filter((p) => p.teacherId === teacherId)
        for (const p of tPayrolls) {
          await updateDoc(doc(db, 'payroll', p.id), { paid: true, paidAt: serverTimestamp() })
        }
        await addDoc(collection(db, 'adminLogs'), {
          adminId: user?.uid || '',
          action: 'MARK_PAID',
          targetType: 'payroll',
          targetId: teacherId,
          changes: { month, teacherId },
          createdAt: serverTimestamp(),
        })
      }
      toast.success(`Đã đánh dấu thanh toán cho ${selected.size} giáo viên`)
      setSelected(new Set())
    } catch {
      toast.error('Có lỗi xảy ra')
    } finally {
      setPaying(false)
    }
  }

  const exportCSV = () => {
    const rows = [
      ['Giáo viên', 'Level', 'Môn', 'Phút', 'Giá/phút', 'Lương'],
      ...payrolls.map((p) => {
        const t = teachers.find((t) => t.id === p.teacherId)
        return [t?.name, p.level, '', p.minutes, p.pricePerMinute, p.amount]
      }),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `BangLuong_${month}_EduTrackPro.csv`
    a.click()
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lương giáo viên</h1>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="primary" onClick={handleMarkPaid} loading={paying}>
              <CheckSquare className="w-4 h-4" />
              Đánh dấu đã trả ({selected.size})
            </Button>
          )}
          <Button variant="outline" onClick={exportCSV}>
            <Download className="w-4 h-4" />
            Xuất CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-3 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg" aria-label="Tháng trước">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-base font-semibold text-slate-700 min-w-[160px] text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg" aria-label="Tháng sau">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        
        <div className="w-full sm:w-auto">
          <Input
            placeholder="Tìm giáo viên..."
            leftIcon={<Search className="w-4 h-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
        </div>
      </div>

      {/* Total */}
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <p className="text-sm text-slate-500">Tổng lương phải trả {monthLabel}</p>
        <p className="text-4xl font-bold text-emerald-400 mt-1">{formatVND(totalPayroll)}</p>
        <p className="text-xs text-slate-500 mt-1">{teacherPayrolls.length} giáo viên · {payrolls.length} buổi dạy</p>
        <p className="text-[11px] text-slate-400 italic mt-2">
          * Lưu ý: Lương hiển thị của từng giáo viên có thu nhập trên 2.000.000 đ đã tự động khấu trừ 10% thuế TNCN.
        </p>
      </Card>

      {/* Per teacher */}
      <div className="space-y-3">
        {filteredTeacherPayrolls.map(({ teacher, payrolls: tp, total, minutes, paid }) => (
          <Card key={teacher.id} padding="none">
            <div
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-100/20 transition-colors"
              onClick={() => setExpanded(expanded === teacher.id ? null : teacher.id)}
            >
              <input
                type="checkbox"
                aria-label={`Chọn giáo viên ${teacher.name}`}
                checked={selected.has(teacher.id)}
                onChange={(e) => {
                  e.stopPropagation()
                  const next = new Set(selected)
                  if (e.target.checked) next.add(teacher.id)
                  else next.delete(teacher.id)
                  setSelected(next)
                }}
                className="w-4 h-4 accent-indigo-500"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {teacher.photoURL ? (
                  <img src={teacher.photoURL} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-400 flex-shrink-0">
                    {teacher.name[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-slate-700 truncate">{teacher.name}</p>
                  <p className="text-xs text-slate-500">×{teacher.level} · {tp.length} buổi · {minutes} phút</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={paid ? 'success' : 'warning'}>
                  {paid ? 'Đã trả' : 'Chưa trả'}
                </Badge>
                {total > 2000000 ? (
                  <div className="text-right flex flex-col justify-end items-end">
                    <p className="text-[10px] text-slate-400 line-through leading-none">{formatVND(total)}</p>
                    <p className="text-emerald-400 font-bold text-sm leading-tight mt-0.5">{formatVND(total * 0.9)}</p>
                    <p className="text-[9px] text-rose-500 italic font-medium leading-none mt-0.5">-10% thuế</p>
                  </div>
                ) : (
                  <p className="text-emerald-400 font-semibold text-sm">{formatVND(total)}</p>
                )}
                {expanded === teacher.id ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </div>
            </div>

            {expanded === teacher.id && (
              <div className="border-t border-slate-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200/50">
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Học sinh</th>
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Ngày</th>
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Phút</th>
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Giá/phút</th>
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Level</th>
                      <th className="text-right px-5 py-2.5 text-slate-500 font-medium">Lương</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tp.map((p) => {
                      const lesson = lessons.find(l => l.id === p.lessonId)
                      return (
                        <tr key={p.id} className="border-b border-slate-200/30 hover:bg-slate-100/10">
                          <td className="px-5 py-2.5 text-slate-700 font-medium">{lesson?.studentName || '—'}</td>
                          <td className="px-5 py-2.5 text-slate-600">{lesson?.date || '—'}</td>
                          <td className="px-5 py-2.5 text-slate-600">{p.minutes}'</td>
                          <td className="px-5 py-2.5 text-slate-600">{p.pricePerMinute.toLocaleString('vi-VN')}</td>
                          <td className="px-5 py-2.5 text-slate-600">×{p.level}</td>
                          <td className="px-5 py-2.5 text-emerald-400 text-right font-medium">{formatVND(p.amount)}</td>
                        </tr>
                      )
                    })}
                    {total > 2000000 && (
                      <>
                        <tr className="bg-slate-50/50">
                          <td colSpan={5} className="px-5 py-2 text-right text-slate-500 font-medium">Tổng cộng trước thuế (Gross):</td>
                          <td className="px-5 py-2 text-right text-slate-700 font-bold">{formatVND(total)}</td>
                        </tr>
                        <tr className="bg-rose-50/20 text-rose-500">
                          <td colSpan={5} className="px-5 py-2 text-right font-medium">Thuế thu nhập cá nhân (10%):</td>
                          <td className="px-5 py-2 text-right font-bold">-{formatVND(total * 0.1)}</td>
                        </tr>
                        <tr className="bg-emerald-50/20 text-emerald-600 border-t border-slate-200">
                          <td colSpan={5} className="px-5 py-2.5 text-right font-semibold">Lương thực nhận (Net):</td>
                          <td className="px-5 py-2.5 text-right font-bold text-emerald-600 text-sm">{formatVND(total * 0.9)}</td>
                        </tr>
                        <tr>
                          <td colSpan={6} className="px-5 py-2 text-right text-[10px] text-slate-400 italic">
                            * Thu nhập tháng vượt quá 2.000.000 đ sẽ bị khấu trừ 10% thuế TNCN theo quy định.
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ))}

        {filteredTeacherPayrolls.length === 0 && (
          <p className="text-center text-slate-500 py-12">Không có dữ liệu lương tháng này</p>
        )}
      </div>
    </div>
  )
}
