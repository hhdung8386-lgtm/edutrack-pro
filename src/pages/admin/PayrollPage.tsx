import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, getDocs, writeBatch, doc, serverTimestamp, addDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Payroll, Teacher, Lesson } from '@/types'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatVND, getCurrentMonth, formatMoney, formatPricePerMinute } from '@/lib/constants'
import { ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp, CheckSquare, Search, Gift, MinusCircle, Trash2 } from 'lucide-react'
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
      // Bỏ các dòng đã void (hủy duyệt / xóa thưởng-trừ) khỏi bảng lương
      setPayrolls(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payroll)).filter((p) => !p.voided))
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
  
  // Sum by currency
  const totalsByCurrency = payrolls.reduce((acc, p) => {
    const curr = p.currency || 'VND'
    acc[curr] = (acc[curr] || 0) + p.amount
    return acc
  }, {} as Record<string, number>)

  const formatTotals = () => {
    const keys = Object.keys(totalsByCurrency)
    if (keys.length === 0) return '0đ'
    return keys.map(k => formatMoney(totalsByCurrency[k], k)).join(' + ')
  }

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

  // Chưa trả (trong danh sách đang lọc) — dùng cho "Chọn tất cả"
  const unpaidTeacherIds = filteredTeacherPayrolls.filter((tp) => !tp.paid).map((tp) => tp.teacher.id)
  const allUnpaidSelected = unpaidTeacherIds.length > 0 && unpaidTeacherIds.every((id) => selected.has(id))

  const toggleSelectAll = () => {
    if (allUnpaidSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(unpaidTeacherIds))
    }
  }

  const handleMarkPaid = async () => {
    if (selected.size === 0) return
    setPaying(true)
    try {
      // Firestore giới hạn 500 thao tác/batch — chia lô để trả cho hàng trăm GV một lần
      let batch = writeBatch(db)
      let ops = 0
      const flushIfFull = async () => {
        if (ops >= 450) {
          await batch.commit()
          batch = writeBatch(db)
          ops = 0
        }
      }
      for (const teacherId of selected) {
        const tPayrolls = payrolls.filter((p) => p.teacherId === teacherId && !p.paid)
        for (const p of tPayrolls) {
          batch.update(doc(db, 'payroll', p.id), { paid: true, paidAt: serverTimestamp() })
          ops++
          await flushIfFull()
        }
        batch.set(doc(collection(db, 'adminLogs')), {
          adminId: user?.uid || '',
          action: 'MARK_PAID',
          targetType: 'payroll',
          targetId: teacherId,
          changes: { month, teacherId },
          createdAt: serverTimestamp(),
        })
        ops++
        await flushIfFull()
      }
      if (ops > 0) await batch.commit()
      toast.success(`Đã đánh dấu thanh toán cho ${selected.size} giáo viên`)
      setSelected(new Set())
    } catch {
      toast.error('Có lỗi xảy ra')
    } finally {
      setPaying(false)
    }
  }

  // "Xóa" khoản thưởng/trừ = void (rules không cho delete payroll) — amount về 0 và ẩn khỏi bảng
  const voidAdjustment = async (p: Payroll) => {
    if (!window.confirm(`Xóa khoản ${p.amount >= 0 ? 'thưởng' : 'khấu trừ'} ${formatMoney(Math.abs(p.amount), p.currency)} (${p.adjustmentNote || 'không ghi chú'})?`)) return
    try {
      await updateDoc(doc(db, 'payroll', p.id), {
        voided: true,
        amount: 0,
        voidedAt: serverTimestamp(),
        voidedBy: user?.uid || '',
      })
      toast.success('Đã xóa khoản thưởng/khấu trừ')
    } catch (err) {
      console.error(err)
      toast.error('Không thể xóa, vui lòng thử lại')
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
        <p className="text-4xl font-bold text-emerald-400 mt-1">{formatTotals()}</p>
        <p className="text-xs text-slate-500 mt-1">{teacherPayrolls.length} giáo viên · {payrolls.length} buổi dạy</p>
        <p className="text-[11px] text-slate-400 italic mt-2">
          * Lưu ý: Lương hiển thị của từng giáo viên có thu nhập trên 2.000.000 đ đã tự động khấu trừ 10% thuế TNCN.
        </p>
      </Card>

      {/* Select all */}
      {filteredTeacherPayrolls.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-5 py-3">
          <label className={`flex items-center gap-2.5 text-sm font-medium select-none ${unpaidTeacherIds.length === 0 ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 cursor-pointer'}`}>
            <input
              type="checkbox"
              aria-label="Chọn tất cả giáo viên chưa trả lương"
              checked={allUnpaidSelected}
              disabled={unpaidTeacherIds.length === 0}
              ref={(el) => { if (el) el.indeterminate = !allUnpaidSelected && selected.size > 0 }}
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-indigo-500"
            />
            Chọn tất cả chưa trả ({unpaidTeacherIds.length} giáo viên)
          </label>
          {selected.size > 0 && (
            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1">
              Đã chọn {selected.size} giáo viên — bấm "Đánh dấu đã trả" để thanh toán 1 lần
            </span>
          )}
        </div>
      )}

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
                  <p className="text-xs text-slate-500">
                    ×{teacher.level} · {tp.filter(p => p.type !== 'adjustment').length} buổi · {minutes} phút
                    {tp.some(p => p.type === 'adjustment') && (
                      <span className="ml-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200/60 rounded-md px-1.5 py-0.5">
                        {tp.filter(p => p.type === 'adjustment').length} thưởng/trừ
                      </span>
                    )}
                  </p>
                  {teacher.bankAccountNo ? (
                    <p className="text-[11px] text-emerald-600 font-semibold mt-0.5 font-mono">
                      STK: {teacher.bankAccountNo} - {teacher.bankName} ({teacher.bankAccountName})
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-0.5 italic">Chưa cập nhật STK</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={paid ? 'success' : 'warning'}>
                  {paid ? 'Đã trả' : 'Chưa trả'}
                </Badge>
                {(() => {
                  const teacherCurrency = tp[0]?.currency || 'VND'
                  const isVND = teacherCurrency === 'VND'
                  if (isVND && total > 2000000) {
                    return (
                      <div className="text-right flex flex-col justify-end items-end">
                        <p className="text-[10px] text-slate-400 line-through leading-none">{formatVND(total)}</p>
                        <p className="text-emerald-400 font-bold text-sm leading-tight mt-0.5">{formatVND(total * 0.9)}</p>
                        <p className="text-[9px] text-rose-500 italic font-medium leading-none mt-0.5">-10% thuế</p>
                      </div>
                    )
                  }
                  return (
                    <p className="text-emerald-400 font-semibold text-sm">{formatMoney(total, teacherCurrency)}</p>
                  )
                })()}
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
                    {/* Nhóm 1: các buổi học (điểm danh) */}
                    {tp.filter((p) => p.type !== 'adjustment').map((p) => {
                      const lesson = lessons.find(l => l.id === p.lessonId)
                      return (
                        <tr key={p.id} className="border-b border-slate-200/30 hover:bg-slate-100/10">
                          <td className="px-5 py-2.5 text-slate-700 font-medium">{lesson?.studentName || '—'}</td>
                          <td className="px-5 py-2.5 text-slate-600">{lesson?.date || '—'}</td>
                          <td className="px-5 py-2.5 text-slate-600">{p.minutes}'</td>
                          <td className="px-5 py-2.5 text-slate-600">{formatMoney(p.pricePerMinute, p.currency)}</td>
                          <td className="px-5 py-2.5 text-slate-600">×{p.level}</td>
                          <td className="px-5 py-2.5 text-emerald-400 text-right font-medium">{formatMoney(p.amount, p.currency)}</td>
                        </tr>
                      )
                    })}

                    {/* Nhóm 2: điều chỉnh lương (thưởng / khấu trừ) — gom riêng, không xen giữa các buổi học */}
                    {(() => {
                      const adjustments = tp.filter((p) => p.type === 'adjustment')
                      if (adjustments.length === 0) return null
                      const bonusTotal = adjustments.filter(a => a.amount >= 0).reduce((s, a) => s + a.amount, 0)
                      const dedTotal = adjustments.filter(a => a.amount < 0).reduce((s, a) => s + a.amount, 0)
                      return (
                        <>
                          <tr className="bg-slate-100/70 border-t border-slate-200">
                            <td colSpan={6} className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              Điều chỉnh lương
                              {bonusTotal > 0 && <span className="ml-2 text-emerald-600 normal-case">· Thưởng +{formatMoney(bonusTotal, tp[0]?.currency)}</span>}
                              {dedTotal < 0 && <span className="ml-2 text-rose-500 normal-case">· Khấu trừ {formatMoney(dedTotal, tp[0]?.currency)}</span>}
                            </td>
                          </tr>
                          {adjustments.map((p) => {
                            const isBonus = p.amount >= 0
                            return (
                              <tr key={p.id} className={`border-b border-slate-200/30 ${isBonus ? 'bg-emerald-50/40' : 'bg-rose-50/40'}`}>
                                <td colSpan={5} className="px-5 py-2.5">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md mr-2 ${isBonus ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                                    {isBonus ? <Gift className="w-3 h-3" /> : <MinusCircle className="w-3 h-3" />}
                                    {isBonus ? 'Thưởng' : 'Khấu trừ'}
                                  </span>
                                  <span className="text-slate-600 font-medium">{p.adjustmentNote || '—'}</span>
                                  {!p.paid && (
                                    <button
                                      type="button"
                                      onClick={() => voidAdjustment(p)}
                                      className="ml-2 text-slate-300 hover:text-rose-500 transition-colors align-middle"
                                      title="Xóa khoản này"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 inline" />
                                    </button>
                                  )}
                                </td>
                                <td className={`px-5 py-2.5 text-right font-bold ${isBonus ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {isBonus ? '+' : ''}{formatMoney(p.amount, p.currency)}
                                </td>
                              </tr>
                            )
                          })}
                        </>
                      )
                    })()}

                    {(() => {
                      const teacherCurrency = tp[0]?.currency || 'VND'
                      const isVND = teacherCurrency === 'VND'
                      if (isVND && total > 2000000) {
                        return (
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
                        )
                      }
                      return (
                        <tr className="bg-emerald-50/10 text-emerald-600 border-t border-slate-200">
                          <td colSpan={5} className="px-5 py-2.5 text-right font-semibold">Tổng cộng thực nhận:</td>
                          <td className="px-5 py-2.5 text-right font-bold text-emerald-600 text-sm">{formatMoney(total, teacherCurrency)}</td>
                        </tr>
                      )
                    })()}
                  </tbody>
                </table>
                <AdjustmentBar
                  teacherId={teacher.id}
                  teacherName={teacher.name}
                  teacherLevel={teacher.level}
                  month={month}
                  currency={tp[0]?.currency || 'VND'}
                  adminUid={user?.uid || ''}
                />
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

// Thanh thêm Thưởng / Khấu trừ cho một giáo viên trong tháng đang xem.
// Tạo doc payroll type='adjustment' (lessonId rỗng, minutes 0) — tự cộng vào tổng lương,
// đi theo luồng "Đánh dấu đã trả" và xuất CSV sẵn có.
function AdjustmentBar({ teacherId, teacherName, teacherLevel, month, currency, adminUid }: {
  teacherId: string
  teacherName: string
  teacherLevel: number
  month: string
  currency: string
  adminUid: string
}) {
  const [mode, setMode] = useState<null | 'bonus' | 'deduction'>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => { setMode(null); setAmount(''); setNote('') }

  const save = async () => {
    const value = Math.abs(Number(String(amount).replace(/[^\d]/g, '')))
    if (!value) { toast.warning('Vui lòng nhập số tiền hợp lệ'); return }
    if (!note.trim()) { toast.warning('Vui lòng nhập lý do (VD: Thưởng chuyên cần tháng 7)'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'payroll'), {
        teacherId,
        teacherName,
        lessonId: '',
        type: 'adjustment',
        adjustmentNote: note.trim(),
        amount: mode === 'bonus' ? value : -value,
        minutes: 0,
        pricePerMinute: 0,
        level: teacherLevel,
        month,
        currency,
        paid: false,
        createdBy: adminUid,
        createdAt: serverTimestamp(),
      })
      toast.success(mode === 'bonus' ? `Đã thêm thưởng ${formatMoney(value, currency)}` : `Đã thêm khấu trừ ${formatMoney(value, currency)}`)
      reset()
    } catch (err) {
      console.error(err)
      toast.error('Không thể lưu, vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  if (!mode) {
    return (
      <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/50">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Điều chỉnh lương:</span>
        <button
          type="button"
          onClick={() => setMode('bonus')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/70 text-emerald-700 text-xs font-bold transition-all active:scale-95"
        >
          <Gift className="w-3.5 h-3.5" />
          Thêm thưởng
        </button>
        <button
          type="button"
          onClick={() => setMode('deduction')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200/70 text-rose-600 text-xs font-bold transition-all active:scale-95"
        >
          <MinusCircle className="w-3.5 h-3.5" />
          Thêm khấu trừ
        </button>
      </div>
    )
  }

  return (
    <div className={`px-5 py-3.5 border-t space-y-2.5 ${mode === 'bonus' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/50 border-rose-100'}`}>
      <p className={`text-xs font-bold flex items-center gap-1.5 ${mode === 'bonus' ? 'text-emerald-700' : 'text-rose-600'}`}>
        {mode === 'bonus' ? <Gift className="w-4 h-4" /> : <MinusCircle className="w-4 h-4" />}
        {mode === 'bonus' ? 'Thêm thưởng cho giáo viên' : 'Thêm khấu trừ lương'}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={amount ? Number(String(amount).replace(/[^\d]/g, '')).toLocaleString('vi-VN') : ''}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
          placeholder={`Số tiền (${currency})`}
          className="h-9 w-full sm:w-44 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-indigo-500 tabular-nums"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={120}
          placeholder="Lý do (VD: Thưởng chuyên cần / Trừ đi trễ...)"
          className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className={`h-9 px-4 rounded-lg text-white text-xs font-bold transition disabled:opacity-50 ${mode === 'bonus' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={reset}
            className="h-9 px-3 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  )
}
