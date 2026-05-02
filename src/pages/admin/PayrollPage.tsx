import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, getDocs, updateDoc, doc, serverTimestamp, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Payroll, Teacher } from '@/types'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatVND, getCurrentMonth } from '@/lib/constants'
import { ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp, CheckSquare } from 'lucide-react'
import { subMonths, format } from 'date-fns'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'

export function PayrollPage() {
  const { user } = useAuthStore()
  const [month, setMonth] = useState(getCurrentMonth())
  const [payrolls, setPayrolls] = useState<Payroll[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [paying, setPaying] = useState(false)

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
          <h1 className="text-2xl font-bold text-slate-100">Lương giáo viên</h1>
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

      {/* Month selector */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg" aria-label="Tháng trước">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-base font-semibold text-slate-200 min-w-[160px] text-center">{monthLabel}</span>
        <button onClick={nextMonth} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg" aria-label="Tháng sau">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Total */}
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <p className="text-sm text-slate-400">Tổng lương phải trả {monthLabel}</p>
        <p className="text-4xl font-bold text-emerald-400 mt-1">{formatVND(totalPayroll)}</p>
        <p className="text-xs text-slate-500 mt-1">{teacherPayrolls.length} giáo viên · {payrolls.length} buổi dạy</p>
      </Card>

      {/* Per teacher */}
      <div className="space-y-3">
        {teacherPayrolls.map(({ teacher, payrolls: tp, total, minutes, paid }) => (
          <Card key={teacher.id} padding="none">
            <div
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-700/20 transition-colors"
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
                  <p className="font-medium text-slate-200 truncate">{teacher.name}</p>
                  <p className="text-xs text-slate-500">×{teacher.level} · {tp.length} buổi · {minutes} phút</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={paid ? 'success' : 'warning'}>
                  {paid ? 'Đã trả' : 'Chưa trả'}
                </Badge>
                <p className="text-emerald-400 font-semibold text-sm">{formatVND(total)}</p>
                {expanded === teacher.id ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </div>

            {expanded === teacher.id && (
              <div className="border-t border-slate-700 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Buổi dạy</th>
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Phút</th>
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Giá/phút</th>
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Level</th>
                      <th className="text-right px-5 py-2.5 text-slate-500 font-medium">Lương</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tp.map((p) => (
                      <tr key={p.id} className="border-b border-slate-700/30 hover:bg-slate-700/10">
                        <td className="px-5 py-2.5 text-slate-400">{p.lessonId.slice(0, 8)}…</td>
                        <td className="px-5 py-2.5 text-slate-300">{p.minutes}'</td>
                        <td className="px-5 py-2.5 text-slate-300">{p.pricePerMinute.toLocaleString()}</td>
                        <td className="px-5 py-2.5 text-slate-300">×{p.level}</td>
                        <td className="px-5 py-2.5 text-emerald-400 text-right font-medium">{formatVND(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ))}

        {teacherPayrolls.length === 0 && (
          <p className="text-center text-slate-500 py-12">Không có dữ liệu lương tháng này</p>
        )}
      </div>
    </div>
  )
}
