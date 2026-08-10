import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where, runTransaction, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { BookingRequest, Student } from '@/types'
import { getStudentPackageMinuteSummary } from '@/lib/studentMinutes'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ArrowLeft, AlertCircle, Search, Download, Calculator, CalendarX2, CheckCircle2, Wrench } from 'lucide-react'
import { getBookingPoints } from '@/lib/points'

/**
 * ĐỐI SOÁT QUỸ BUỔI
 *
 * Vấn đề: "Đã học + Đã đặt" vượt quá "Tổng buổi" -> học viên bị giữ chỗ nhiều hơn
 * số phút thực còn, khiến "Khả dụng" = 0 và không đặt lịch mới được.
 *
 * Có ĐÚNG HAI nguyên nhân, phải xử lý khác nhau:
 *  1) SỐ LIỆU SAI  — `reservedMinutes` lưu trên hồ sơ không khớp tổng số phút của
 *     các ca đang thực sự giữ chỗ (do buổi dạy được duyệt mà không tìm thấy ca đặt
 *     tương ứng nên quên nhả giữ chỗ, hoặc dữ liệu cũ). -> TÍNH LẠI, không huỷ lớp nào.
 *  2) ĐẶT QUÁ NHIỀU — số liệu đúng nhưng học viên đã đặt vượt quỹ. -> HUỶ BỚT lịch
 *     TƯƠNG LAI (huỷ ca xa nhất trước để ít ảnh hưởng lịch đã hẹn với gia sư).
 */

type Row = {
  student: Student
  remainingMinutes: number
  storedHeld: number
  actualHeld: number
  pastHeld: number
  futureHeld: number
  futureBookings: BookingRequest[]
  /** Chênh lệch số liệu (stored - actual). Khác 0 nghĩa là dữ liệu sai. */
  drift: number
  /** Vượt quỹ theo số liệu thực tế của lịch */
  overByActual: number
}

export function QuotaReconcilePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [students, setStudents] = useState<Student[]>([])
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [loadingS, setLoadingS] = useState(true)
  const [loadingB, setLoadingB] = useState(true)
  const [search, setSearch] = useState('')
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<Row | null>(null)
  const [confirmRecalcAll, setConfirmRecalcAll] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmBulkRecalc, setConfirmBulkRecalc] = useState<Row[] | null>(null)
  const [confirmBulkCancel, setConfirmBulkCancel] = useState<Row[] | null>(null)

  const todayISO = useMemo(
    () => new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0],
    []
  )

  useEffect(() => {
    let active = true
    getDocs(collection(db, 'students')).then((snap) => {
      if (!active) return
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student)))
      setLoadingS(false)
    }).catch((e) => { console.error(e); toast.error('Không tải được danh sách học viên'); setLoadingS(false) })
    return () => { active = false }
  }, [])

  // Chỉ cần các ca ĐANG giữ chỗ: pending + confirmed, chưa gắn buổi dạy
  useEffect(() => {
    let active = true
    Promise.all((['pending', 'confirmed'] as const).map((st) =>
      getDocs(query(collection(db, 'bookingRequests'), where('status', '==', st)))
    )).then((snapshots) => {
      if (!active) return
      setBookings(snapshots.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookingRequest))))
      setLoadingB(false)
    }).catch((e) => { console.error(e); setLoadingB(false) })
    return () => { active = false }
  }, [])

  const rows = useMemo<Row[]>(() => {
    const holding = bookings.filter((b) => !b.lessonId && (b.status === 'pending' || b.status === 'confirmed'))
    const byStudent = new Map<string, BookingRequest[]>()
    holding.forEach((b) => {
      if (!b.studentId) return
      if (!byStudent.has(b.studentId)) byStudent.set(b.studentId, [])
      byStudent.get(b.studentId)!.push(b)
    })

    const out: Row[] = []
    students.forEach((s) => {
      const list = byStudent.get(s.id) || []
      const actualHeld = list.reduce((sum, b) => sum + getBookingPoints(b), 0)
      const storedHeld = s.reservedMinutes ?? s.heldMinutes ?? 0
      // Quỹ còn lại tính từ các gói môn (chuẩn nhất), không phụ thuộc field có thể thiếu
      const remainingMinutes = getStudentPackageMinuteSummary(s).remainingMinutes
      const pastHeld = list.filter((b) => (b.requestedDate || '') < todayISO).reduce((sum, b) => sum + getBookingPoints(b), 0)
      const futureList = list
        .filter((b) => (b.requestedDate || '') >= todayISO)
        .sort((a, b) => (b.requestedDate || '').localeCompare(a.requestedDate || '')) // xa nhất trước
      const futureHeld = futureList.reduce((sum, b) => sum + getBookingPoints(b), 0)
      const drift = storedHeld - actualHeld
      const overByActual = actualHeld - remainingMinutes

      // Chỉ đưa vào danh sách khi ĐANG có vấn đề: vượt quỹ (theo số lưu hoặc số thực) hoặc lệch số liệu
      const hasProblem = storedHeld > remainingMinutes || overByActual > 0 || drift !== 0
      if (!hasProblem) return
      // Bỏ qua nhiễu nhỏ: không có gì giữ và không lệch
      if (storedHeld === 0 && actualHeld === 0 && drift === 0) return

      out.push({
        student: s, remainingMinutes, storedHeld, actualHeld,
        pastHeld, futureHeld, futureBookings: futureList, drift, overByActual,
      })
    })

    return out.sort((a, b) => (b.overByActual - a.overByActual) || (Math.abs(b.drift) - Math.abs(a.drift)))
  }, [students, bookings, todayISO])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows
    return rows.filter((r) =>
      (r.student.name || '').toLowerCase().includes(q) || (r.student.code || '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const stats = useMemo(() => ({
    total: rows.length,
    driftOnly: rows.filter((r) => r.drift !== 0 && r.overByActual <= 0).length,
    overBooked: rows.filter((r) => r.overByActual > 0).length,
    overMinutes: rows.reduce((s, r) => s + Math.max(0, r.overByActual), 0),
  }), [rows])

  // ── Chọn hàng loạt ──────────────────────────────────────────────
  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.includes(r.student.id))
  const selectedRows = filtered.filter((r) => selectedIds.includes(r.student.id))
  const selectedDriftRows = selectedRows.filter((r) => r.drift !== 0)
  const selectedOverRows = selectedRows.filter((r) => r.overByActual > 0)

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleSelectAll = () =>
    setSelectedIds(allFilteredSelected ? [] : filtered.map((r) => r.student.id))

  /** Đặt lại reservedMinutes = tổng phút của các ca đang thực sự giữ chỗ. */
  const recalcOne = async (row: Row) => {
    await runTransaction(db, async (tx) => {
      const sRef = doc(db, 'students', row.student.id)
      const sSnap = await tx.get(sRef)
      if (!sSnap.exists()) throw new Error('STUDENT_NOT_FOUND')
      const fresh = { id: sSnap.id, ...sSnap.data() } as Student
      const freshRemaining = getStudentPackageMinuteSummary(fresh).remainingMinutes
      tx.update(sRef, {
        reservedMinutes: row.actualHeld,
        heldMinutes: row.actualHeld,
        // Bổ sung/đồng bộ luôn remainingMinutes để chốt chặn phía server hoạt động
        // (nhiều hồ sơ cũ thiếu field này nên rule không chặn được giữ vượt quỹ).
        remainingMinutes: freshRemaining,
        updatedAt: serverTimestamp(),
      })
      tx.set(doc(collection(db, 'adminLogs')), {
        adminId: user?.uid ?? 'admin',
        action: 'RECONCILE_STUDENT_HELD_MINUTES',
        targetType: 'student',
        targetId: row.student.id,
        changes: {
          studentName: row.student.name,
          heldBefore: row.storedHeld,
          heldAfter: row.actualHeld,
          remainingMinutes: freshRemaining,
        },
        createdAt: serverTimestamp(),
      })
    })
  }

  const handleRecalc = async (targets: Row[]) => {
    if (targets.length === 0) return
    setProcessing(true)
    setProgress({ done: 0, total: targets.length })
    let ok = 0, failed = 0
    try {
      for (const row of targets) {
        try { await recalcOne(row); ok++ } catch (e) { console.error(e); failed++ }
        setProgress({ done: ok + failed, total: targets.length })
      }
      if (failed === 0) toast.success(`Đã tính lại số kim cương đang giữ cho ${ok} học viên`)
      else toast.warning(`Đã tính lại ${ok} học viên; ${failed} lỗi — vui lòng thử lại`)
      setSelectedIds([])
    } finally {
      setProcessing(false); setProgress(null); setConfirmRecalcAll(false); setConfirmBulkRecalc(null)
    }
  }

  /** Huỷ dần ca TƯƠNG LAI (xa nhất trước) cho tới khi số giữ chỗ <= quỹ còn lại. */
  const cancelFutureOne = async (row: Row): Promise<number> => {
    const need = row.actualHeld - row.remainingMinutes
    if (need <= 0) return 0

    const toCancel: BookingRequest[] = []
    let freed = 0
    for (const b of row.futureBookings) {
      if (freed >= need) break
      toCancel.push(b)
      freed += getBookingPoints(b)
    }
    if (toCancel.length === 0) return 0

    await runTransaction(db, async (tx) => {
      const sRef = doc(db, 'students', row.student.id)
      const sSnap = await tx.get(sRef)
      if (!sSnap.exists()) throw new Error('STUDENT_NOT_FOUND')
      const fresh = sSnap.data() as Student
      const curHeld = fresh.reservedMinutes ?? fresh.heldMinutes ?? 0
      const nextHeld = Math.max(0, curHeld - freed)
      tx.update(sRef, { reservedMinutes: nextHeld, heldMinutes: nextHeld, updatedAt: serverTimestamp() })
      toCancel.forEach((b) => {
        tx.update(doc(db, 'bookingRequests', b.id), {
          status: 'released',
          releasedAt: serverTimestamp(),
          releasedBy: user?.uid ?? 'admin',
          releaseReason: 'quota_reconcile',
        })
      })
      tx.set(doc(collection(db, 'adminLogs')), {
        adminId: user?.uid ?? 'admin',
        action: 'RECONCILE_CANCEL_FUTURE_BOOKINGS',
        targetType: 'student',
        targetId: row.student.id,
        changes: {
          studentName: row.student.name,
          cancelledCount: toCancel.length,
          cancelledIds: toCancel.map((b) => b.id),
          freedMinutes: freed,
          heldBefore: curHeld,
          heldAfter: nextHeld,
        },
        createdAt: serverTimestamp(),
      })
    })
    return toCancel.length
  }

  const handleCancelFuture = async (row: Row) => {
    if (row.actualHeld - row.remainingMinutes <= 0) { toast.info('Học viên này không còn vượt quỹ'); setConfirmCancel(null); return }
    setProcessing(true)
    try {
      const cancelled = await cancelFutureOne(row)
      if (cancelled === 0) toast.warning('Học viên không còn lịch tương lai để huỷ. Vui lòng dọn ca quá hạn hoặc nạp thêm buổi.')
      else toast.success(`Đã huỷ ${cancelled} ca tương lai cho ${row.student.name}`)
      setConfirmCancel(null)
    } catch (err: any) {
      console.error(err)
      toast.error(`Không thể huỷ lịch${err?.message ? `: ${err.message}` : ''}`)
    } finally {
      setProcessing(false)
    }
  }

  const handleBulkCancelFuture = async (targets: Row[]) => {
    if (targets.length === 0) return
    setProcessing(true)
    setProgress({ done: 0, total: targets.length })
    let done = 0, cancelledTotal = 0, failed = 0
    try {
      for (const row of targets) {
        try { cancelledTotal += await cancelFutureOne(row) } catch (e) { console.error(e); failed++ }
        done++; setProgress({ done, total: targets.length })
      }
      if (failed === 0) toast.success(`Đã huỷ tổng ${cancelledTotal} ca tương lai cho ${targets.length} học viên`)
      else toast.warning(`Đã xử lý ${targets.length - failed}/${targets.length} học viên; ${failed} lỗi`)
      setSelectedIds([])
    } finally {
      setProcessing(false); setProgress(null); setConfirmBulkCancel(null)
    }
  }

  const exportCSV = () => {
    const rowsCsv = [
      ['Mã HV', 'Học viên', 'Quỹ còn lại (kim cương)', 'Đang giữ (hồ sơ)', 'Đang giữ (lịch thực tế)', 'Lệch số liệu', 'Vượt quỹ', 'Giữ bởi ca quá hạn', 'Giữ bởi lịch tương lai', 'Xử lý đề xuất'],
      ...filtered.map((r) => [
        r.student.code, r.student.name, r.remainingMinutes, r.storedHeld, r.actualHeld, r.drift,
        Math.max(0, r.overByActual), r.pastHeld, r.futureHeld,
        r.drift !== 0 ? 'Tính lại số liệu' : r.overByActual > 0 ? 'Huỷ bớt lịch tương lai' : 'Theo dõi',
      ]),
    ]
    const csv = '﻿' + rowsCsv.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `doi-soat-quy-buoi-${todayISO}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loadingS || loadingB) return <LoadingSpinner />

  const driftRows = rows.filter((r) => r.drift !== 0)

  return (
    <div className="space-y-5 pt-2 lg:pt-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg" aria-label="Quay lại">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Đối soát quỹ buổi</h1>
          <p className="text-sm text-slate-500">Xử lý trường hợp "Đã học + Đã đặt" vượt quá Tổng buổi</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><p className="text-xs font-semibold uppercase text-slate-500">Hồ sơ cần xử lý</p><p className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-500">Sai số liệu</p><p className="mt-1 text-2xl font-bold text-sky-600">{driftRows.length}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-500">Đặt vượt quỹ thật</p><p className="mt-1 text-2xl font-bold text-rose-600">{stats.overBooked}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-500">Kim cương vượt quỹ</p><p className="mt-1 text-2xl font-bold text-amber-600">{stats.overMinutes.toLocaleString('vi-VN')}</p></Card>
      </div>

      {/* Hướng dẫn xử lý */}
      <Card>
        <p className="text-sm font-bold text-slate-800">Hai nguyên nhân — hai cách xử lý khác nhau</p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border-2 border-sky-200 bg-sky-50/60 p-3.5">
            <p className="flex items-center gap-2 text-sm font-bold text-sky-800"><Calculator className="w-4 h-4" />1. Sai số liệu → Tính lại</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Số "đang giữ" trên hồ sơ không khớp với lịch thực tế (thường do buổi dạy được duyệt nhưng
              quên nhả giữ chỗ). Chỉ cần tính lại theo lịch thật — <span className="font-bold">không huỷ lớp nào</span>.
            </p>
            {driftRows.length > 0 && (
              <Button onClick={() => setConfirmRecalcAll(true)} loading={processing} className="mt-3 bg-sky-600 hover:bg-sky-700 text-white">
                <Wrench className="w-4 h-4 mr-2" />Tính lại tất cả ({driftRows.length})
              </Button>
            )}
          </div>
          <div className="rounded-xl border-2 border-rose-200 bg-rose-50/60 p-3.5">
            <p className="flex items-center gap-2 text-sm font-bold text-rose-800"><CalendarX2 className="w-4 h-4" />2. Đặt quá nhiều → Huỷ bớt lịch tương lai</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Số liệu đúng nhưng học viên đã đặt vượt quỹ. Hệ thống huỷ <span className="font-bold">ca xa nhất trước</span> cho
              vừa đủ khớp, giữ lại các buổi gần để không xáo trộn lịch đã hẹn với gia sư. Làm riêng từng em ở bảng dưới.
            </p>
          </div>
        </div>
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <span className="font-bold">Nên làm theo thứ tự:</span> dọn <Link to="/admin/overdue-bookings" className="font-bold text-indigo-600 hover:underline">Ca học quá hạn</Link> trước →
          bấm <span className="font-bold">Tính lại</span> → còn em nào vượt thì mới <span className="font-bold">huỷ bớt lịch tương lai</span>.
        </p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc mã học viên…"
              className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-500" />
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
          <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="w-4 h-4 mr-2" />Xuất CSV
          </Button>
        </div>
        {progress && (
          <div className="mt-3">
            <p className="text-xs font-bold text-slate-700">Đang xử lý {progress.done}/{progress.total} — vui lòng không đóng trang…</p>
            <div className="mt-1.5 h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
            </div>
          </div>
        )}
      </Card>

      {/* Thanh chọn hàng loạt */}
      {selectedIds.length > 0 && (
        <div className="sticky top-16 z-20 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-bold text-indigo-900">
              Đã chọn {selectedRows.length} học viên
              <span className="ml-2 font-semibold text-slate-600">
                ({selectedDriftRows.length} sai số liệu · {selectedOverRows.length} vượt quỹ)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setConfirmBulkRecalc(selectedDriftRows)}
                loading={processing}
                disabled={selectedDriftRows.length === 0}
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                <Calculator className="w-4 h-4 mr-2" />Tính lại ({selectedDriftRows.length})
              </Button>
              <Button
                onClick={() => setConfirmBulkCancel(selectedOverRows)}
                loading={processing}
                disabled={selectedOverRows.length === 0}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                <CalendarX2 className="w-4 h-4 mr-2" />Huỷ bớt lịch ({selectedOverRows.length})
              </Button>
              <button type="button" onClick={() => setSelectedIds([])} className="px-3 text-sm font-semibold text-slate-600 hover:text-slate-900">
                Bỏ chọn
              </button>
            </div>
          </div>
          {progress && (
            <div className="mt-3">
              <p className="text-xs font-bold text-indigo-900">Đang xử lý {progress.done}/{progress.total} — vui lòng không đóng trang…</p>
              <div className="mt-1.5 h-2 w-full max-w-md overflow-hidden rounded-full bg-indigo-200">
                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      <Card padding="none">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="mt-3 font-semibold text-slate-700">Không có hồ sơ nào lệch quỹ</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className="w-11 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={(el) => { if (el) el.indeterminate = !allFilteredSelected && selectedIds.length > 0 }}
                      onChange={toggleSelectAll}
                      aria-label="Chọn tất cả"
                      className="h-4 w-4 accent-indigo-600"
                    />
                  </th>
                  {['Học viên', 'Quỹ còn lại', 'Đang giữ (hồ sơ)', 'Theo lịch thật', 'Vượt quỹ', 'Chi tiết giữ chỗ', 'Xử lý'].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.student.id} className={`hover:bg-slate-50/70 ${selectedIds.includes(r.student.id) ? 'bg-indigo-50/40' : ''}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(r.student.id)}
                        onChange={() => toggleSelect(r.student.id)}
                        aria-label={`Chọn ${r.student.name}`}
                        className="h-4 w-4 accent-indigo-600"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Link to={`/admin/students/${r.student.id}`} className="font-semibold text-indigo-600 hover:underline">{r.student.name}</Link>
                      <p className="font-mono text-xs text-slate-500">{r.student.code}</p>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-700">{r.remainingMinutes}</td>
                    <td className="px-3 py-3">
                      <span className={r.drift !== 0 ? 'font-bold text-sky-600' : 'text-slate-700'}>{r.storedHeld}</span>
                      {r.drift !== 0 && <p className="text-[11px] font-bold text-sky-600">lệch {r.drift > 0 ? '+' : ''}{r.drift}</p>}
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-700">{r.actualHeld}</td>
                    <td className="px-3 py-3">
                      {r.overByActual > 0
                        ? <span className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 border border-rose-200">+{r.overByActual}</span>
                        : <span className="text-xs font-semibold text-emerald-600">Đủ</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      <p>Quá hạn: <span className="font-bold text-amber-600">{r.pastHeld} kim cương</span></p>
                      <p>Tương lai: <span className="font-bold text-slate-800">{r.futureHeld} kim cương</span> ({r.futureBookings.length} ca)</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {r.drift !== 0 && (
                          <button type="button" disabled={processing} onClick={() => handleRecalc([r])}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                            <Calculator className="w-3 h-3" />Tính lại
                          </button>
                        )}
                        {r.overByActual > 0 && (
                          <button type="button" disabled={processing} onClick={() => setConfirmCancel(r)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                            <CalendarX2 className="w-3 h-3" />Huỷ bớt lịch
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
        <p>
          <span className="font-bold text-slate-800">An toàn dữ liệu:</span> "Tính lại" chỉ sửa con số <span className="font-semibold">đang giữ chỗ</span> cho khớp
          lịch thật, <span className="font-semibold">không đụng tới tổng buổi hay số buổi đã học</span>. "Huỷ bớt lịch" chỉ huỷ ca ở tương lai và nhả đúng số kim cương
          giữ chỗ tương ứng. Mọi thao tác đều ghi vào Nhật ký admin.
        </p>
      </div>

      <ConfirmDialog
        open={confirmRecalcAll}
        onClose={() => { if (!processing) setConfirmRecalcAll(false) }}
        onConfirm={() => handleRecalc(driftRows)}
        title={`Tính lại số kim cương đang giữ cho ${driftRows.length} học viên?`}
        description="Hệ thống đặt lại số kim cương đang giữ đúng bằng tổng chi phí các ca đang thực sự giữ (pending + đã xác nhận, chưa điểm danh)."
        consequence="Không huỷ lớp nào, không thay đổi tổng buổi hay số buổi đã học."
        confirmLabel="Tính lại"
        loading={processing}
      />

      <ConfirmDialog
        open={!!confirmCancel}
        onClose={() => { if (!processing) setConfirmCancel(null) }}
        onConfirm={() => { if (confirmCancel) handleCancelFuture(confirmCancel) }}
        title="Huỷ bớt lịch tương lai cho khớp quỹ?"
        description={confirmCancel
          ? `${confirmCancel.student.name} đang giữ ${confirmCancel.actualHeld} kim cương nhưng chỉ còn ${confirmCancel.remainingMinutes} kim cương. Hệ thống sẽ huỷ các ca xa nhất trước cho tới khi vừa đủ khớp (cần giải phóng ${confirmCancel.overByActual} kim cương).`
          : ''}
        consequence="Chỉ huỷ ca ở tương lai và nhả số kim cương giữ chỗ tương ứng. Ca đã học và tổng buổi giữ nguyên."
        confirmLabel="Huỷ bớt lịch"
        confirmVariant="danger"
        loading={processing}
      />

      {/* Bulk: tính lại */}
      <ConfirmDialog
        open={!!confirmBulkRecalc}
        onClose={() => { if (!processing) setConfirmBulkRecalc(null) }}
        onConfirm={() => { if (confirmBulkRecalc) handleRecalc(confirmBulkRecalc) }}
        title={`Tính lại số liệu cho ${confirmBulkRecalc?.length ?? 0} học viên đã chọn?`}
        description="Chỉ áp dụng cho các học viên bị sai số liệu trong lựa chọn. Hệ thống đặt lại số kim cương đang giữ đúng bằng chi phí lịch thực tế."
        consequence="Không huỷ lớp nào, không thay đổi tổng buổi hay số buổi đã học."
        confirmLabel="Tính lại"
        loading={processing}
      />

      {/* Bulk: huỷ bớt lịch */}
      <ConfirmDialog
        open={!!confirmBulkCancel}
        onClose={() => { if (!processing) setConfirmBulkCancel(null) }}
        onConfirm={() => { if (confirmBulkCancel) handleBulkCancelFuture(confirmBulkCancel) }}
        title={`Huỷ bớt lịch tương lai cho ${confirmBulkCancel?.length ?? 0} học viên đã chọn?`}
        description={`Chỉ áp dụng cho các học viên đặt vượt quỹ trong lựa chọn. Mỗi em sẽ bị huỷ các ca xa nhất trước cho vừa đủ khớp quỹ (tổng cần giải phóng khoảng ${(confirmBulkCancel ?? []).reduce((s, r) => s + Math.max(0, r.overByActual), 0).toLocaleString('vi-VN')} kim cương).`}
        consequence="Chỉ huỷ ca ở tương lai và nhả số kim cương giữ chỗ tương ứng. Ca đã học và tổng buổi giữ nguyên. Ghi vào Nhật ký admin."
        confirmLabel="Huỷ bớt lịch hàng loạt"
        confirmVariant="danger"
        loading={processing}
      />
    </div>
  )
}
