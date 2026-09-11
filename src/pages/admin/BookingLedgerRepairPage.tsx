import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ListChecks,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { getBookingPoints } from '@/lib/points'
import {
  ORPHAN_BLOCKER_LABELS,
  classifyOrphanSubjectBooking,
  groupByStudent,
  isApprovedUnsettledBooking,
  type OrphanSubjectBookingRow,
  type RepairStudentGroup,
} from '@/lib/bookingLedgerRepair'
import {
  REPAIR_DATA_CHANGED,
  closeApprovedBookingsForStudent,
  loadRepairDataset,
  repointOrphanSubjectBookingsForStudent,
  type RepairDataset,
} from '@/lib/bookingLedgerRepairActions'
import type { BookingRequest } from '@/types'

type RepairTab = 'approved' | 'subject'
type ApprovedRow = { booking: BookingRequest }
type AnyGroup = RepairStudentGroup<ApprovedRow> | RepairStudentGroup<OrphanSubjectBookingRow>

const DAY_LABELS: Record<string, string> = {
  mon: 'Thứ 2', tue: 'Thứ 3', wed: 'Thứ 4', thu: 'Thứ 5', fri: 'Thứ 6', sat: 'Thứ 7', sun: 'Chủ nhật',
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()
}

function number(value: number) {
  return Math.round(value).toLocaleString('vi-VN')
}

function formatDate(date?: string) {
  const [year, month, day] = (date || '').split('-')
  return year && month && day ? `${day}/${month}/${year}` : 'Chưa có ngày'
}

function isOrphanGroup(group: AnyGroup): group is RepairStudentGroup<OrphanSubjectBookingRow> {
  return group.rows.length > 0 && 'blocker' in group.rows[0]
}

/** Rows that the bulk action is allowed to change for this student. */
function actionableIds(group: AnyGroup): string[] {
  if (!isOrphanGroup(group)) return group.rows.map((row) => row.booking.id)
  return group.rows.filter((row) => !row.blocker && row.target).map((row) => row.booking.id)
}

export function BookingLedgerRepairPage() {
  const { user } = useAuthStore()
  const [params, setParams] = useSearchParams()
  const studentIdFilter = params.get('studentId') || ''
  const tab: RepairTab = params.get('tab') === 'subject' ? 'subject' : 'approved'

  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${studentIdFilter}|${reloadToken}`
  const [loaded, setLoaded] = useState<{ key: string; dataset: RepairDataset | null; error: string }>({ key: '', dataset: null, error: '' })
  const [progressLabel, setProgressLabel] = useState('')
  // Loading is derived from which request the stored result belongs to (no synchronous setState in the effect).
  const loading = loaded.key !== requestKey
  const dataset = loaded.dataset
  const loadError = loading ? '' : loaded.error
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
  const [confirmGroups, setConfirmGroups] = useState<AnyGroup[] | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    let active = true
    loadRepairDataset({
      studentId: studentIdFilter || undefined,
      onProgress: (label) => { if (active) setProgressLabel(label) },
    })
      .then((result) => { if (active) setLoaded({ key: requestKey, dataset: result, error: '' }) })
      .catch((error) => {
        console.error('Load booking ledger repair data failed:', error)
        if (active) setLoaded((current) => ({ key: requestKey, dataset: current.dataset, error: 'Chưa tải được dữ liệu ca học. Vui lòng thử lại.' }))
      })
    return () => { active = false }
  }, [requestKey, studentIdFilter])

  const approvedGroups = useMemo(() => {
    if (!dataset) return []
    const rows = dataset.bookings
      .filter((booking) => isApprovedUnsettledBooking(booking, booking.lessonId ? dataset.lessons.get(booking.lessonId) : null))
      .map((booking) => ({ booking }))
    return groupByStudent(rows, dataset.students, dataset.bookingsByStudent, dataset.lessons)
  }, [dataset])

  const subjectGroups = useMemo(() => {
    if (!dataset) return []
    const rows = dataset.bookings.flatMap((booking) => {
      const student = dataset.students.get(booking.studentId)
      if (!student) return []
      const row = classifyOrphanSubjectBooking(booking, student, booking.lessonId ? dataset.lessons.get(booking.lessonId) : null)
      return row ? [row] : []
    })
    return groupByStudent(rows, dataset.students, dataset.bookingsByStudent, dataset.lessons)
  }, [dataset])

  const groups: AnyGroup[] = tab === 'approved' ? approvedGroups : subjectGroups
  const filteredGroups = useMemo(() => {
    const keyword = normalize(search)
    if (!keyword) return groups
    return groups.filter((group) => normalize(`${group.studentName} ${group.studentCode}`).includes(keyword))
  }, [groups, search])
  const actionableGroups = filteredGroups.filter((group) => actionableIds(group).length > 0)
  const selectedGroups = actionableGroups.filter((group) => selected.includes(group.studentId))

  const stats = useMemo(() => ({
    approved: {
      students: approvedGroups.length,
      rows: approvedGroups.reduce((sum, group) => sum + group.rows.length, 0),
      points: approvedGroups.reduce((sum, group) => sum + group.points, 0),
      drift: approvedGroups.filter((group) => group.storedHeld !== group.ledgerHeldAfter).length,
    },
    subject: {
      students: subjectGroups.length,
      rows: subjectGroups.reduce((sum, group) => sum + group.rows.length, 0),
      fixable: subjectGroups.reduce((sum, group) => sum + actionableIds(group).length, 0),
      manual: subjectGroups.reduce((sum, group) => sum + group.rows.filter((row) => row.blocker).length, 0),
    },
  }), [approvedGroups, subjectGroups])

  const setTab = (next: RepairTab) => {
    const nextParams = new URLSearchParams(params)
    if (next === 'subject') nextParams.set('tab', 'subject')
    else nextParams.delete('tab')
    setParams(nextParams, { replace: true })
    setSelected([])
  }

  const clearStudentFilter = () => {
    const nextParams = new URLSearchParams(params)
    nextParams.delete('studentId')
    setParams(nextParams, { replace: true })
  }

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id])

  const runBulk = async (targets: AnyGroup[]) => {
    if (targets.length === 0 || !dataset) return
    const actorUid = user?.uid ?? 'admin'
    setProcessing(true)
    setProgress({ done: 0, total: targets.length })
    let changedRows = 0
    let changedStudents = 0
    let staleStudents = 0
    let failedStudents = 0
    for (const group of targets) {
      const bookingIds = actionableIds(group)
      try {
        const result = tab === 'approved'
          ? await closeApprovedBookingsForStudent({
            studentId: group.studentId,
            bookingIds,
            studentHoldingBookingIds: (dataset.bookingsByStudent.get(group.studentId) || []).map((booking) => booking.id),
            expectedStoredHeld: group.storedHeld,
            actorUid,
          })
          : await repointOrphanSubjectBookingsForStudent({ studentId: group.studentId, bookingIds, actorUid })
        changedRows += result.changed
        if (result.changed > 0) changedStudents += 1
        if (result.skipped > 0) staleStudents += 1
      } catch (error) {
        if (error instanceof Error && error.message === REPAIR_DATA_CHANGED) staleStudents += 1
        else {
          console.error('Booking ledger repair failed:', group.studentId, error)
          failedStudents += 1
        }
      }
      setProgress((current) => current ? { ...current, done: current.done + 1 } : current)
    }
    setProcessing(false)
    setProgress(null)
    setConfirmGroups(null)
    setSelected([])
    if (changedRows > 0) {
      toast.success(tab === 'approved'
        ? `Đã đóng ${changedRows} ca của ${changedStudents} học viên và tính lại số kim cương đang giữ.`
        : `Đã chuyển ${changedRows} ca của ${changedStudents} học viên về đúng gói.`)
    }
    if (staleStudents > 0) toast.warning(`${staleStudents} học viên có dữ liệu vừa thay đổi nên hệ thống bỏ qua, không ghi đè. Danh sách đã được tải lại.`)
    if (failedStudents > 0) toast.error(`${failedStudents} học viên chưa xử lý được do lỗi kết nối hoặc quyền. Vui lòng thử lại.`)
    if (changedRows === 0 && staleStudents === 0 && failedStudents === 0) toast.info('Không có ca nào cần xử lý.')
    setReloadToken((value) => value + 1)
  }

  const confirmRows = (confirmGroups || []).reduce((sum, group) => sum + actionableIds(group).length, 0)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-950">
              <ListChecks className="h-6 w-6 text-indigo-600" />Đồng bộ ca đã duyệt
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Liệt kê toàn bộ học viên có ca cũ đang làm lệch số kim cương hoặc chặn điểm danh/duyệt buổi, và xử lý hàng loạt.
              Không trừ thêm quỹ, không đổi buổi dạy hay lương; mỗi học viên được ghi trong một giao dịch và kiểm tra lại dữ liệu ngay lúc ghi.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setReloadToken((value) => value + 1)} loading={loading} className="self-start whitespace-nowrap">
            <RefreshCw className="h-4 w-4" />Tải lại
          </Button>
        </div>
        {studentIdFilter && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
            Đang xem một học viên.
            <button type="button" onClick={clearStudentFilter} className="min-h-9 font-bold underline">Xem tất cả học viên</button>
            <Link to={`/admin/students/${studentIdFilter}`} className="min-h-9 font-bold underline">Mở hồ sơ học viên</Link>
          </div>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ['approved', 'Ca đã duyệt nhưng chưa đóng', `${number(stats.approved.rows)} ca · ${number(stats.approved.students)} học viên`, `${number(stats.approved.points)} kim cương đang bị tính giữ thêm`],
          ['subject', 'Ca đang trỏ môn cũ', `${number(stats.subject.rows)} ca · ${number(stats.subject.students)} học viên`, `${number(stats.subject.fixable)} ca tự chuyển được · ${number(stats.subject.manual)} ca cần xử lý tay`],
        ] as Array<[RepairTab, string, string, string]>).map(([key, title, main, sub]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`rounded-2xl border p-4 text-left transition ${tab === key ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:border-indigo-200'}`}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
            <p className="mt-1 text-lg font-black text-slate-950">{loading && !dataset ? '...' : main}</p>
            <p className="mt-0.5 text-xs text-slate-600">{loading && !dataset ? '' : sub}</p>
          </button>
        ))}
      </div>

      <Card padding="none">
        <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
          <p className="text-sm leading-6 text-slate-600">
            {tab === 'approved'
              ? 'Buổi đã được duyệt (đã trừ quỹ, đã tính lương) nhưng ca đặt lịch vẫn ở trạng thái đã xác nhận nên bị hiểu là còn giữ kim cương. "Đóng ca" chuyển ca sang đã hoàn thành và đặt lại số kim cương đang giữ trên hồ sơ bằng tổng các ca thật sự còn giữ.'
              : 'Ca đang giữ kim cương nhưng ghi môn không còn trong gói của học viên (thường do đổi gói sau khi xếp lịch). Gia sư không điểm danh được, giáo vụ không duyệt được. Chỉ tự chuyển khi học viên có đúng một gói; kim cương, giờ học và gia sư giữ nguyên.'}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block sm:w-72">
              <span className="sr-only">Tìm học viên</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm tên hoặc mã học viên"
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={processing || selectedGroups.length === 0}
                onClick={() => setConfirmGroups(selectedGroups)}
                className="min-h-11 whitespace-nowrap"
              >
                {tab === 'approved' ? 'Đóng mục đã chọn' : 'Chuyển mục đã chọn'} ({selectedGroups.length})
              </Button>
              <Button
                type="button"
                disabled={processing || actionableGroups.length === 0}
                onClick={() => setConfirmGroups(actionableGroups)}
                className="min-h-11 whitespace-nowrap"
              >
                {tab === 'approved' ? <CheckCheck className="h-4 w-4" /> : <ArrowRightLeft className="h-4 w-4" />}
                {tab === 'approved' ? 'Đóng tất cả' : 'Chuyển tất cả về đúng gói'} ({actionableGroups.length} học viên)
              </Button>
            </div>
          </div>
          {actionableGroups.length > 0 && (
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={selectedGroups.length === actionableGroups.length}
                onChange={() => setSelected(selectedGroups.length === actionableGroups.length ? [] : actionableGroups.map((group) => group.studentId))}
              />
              Chọn tất cả học viên đang hiển thị
            </label>
          )}
          {progress && (
            <div className="space-y-1" role="status" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-indigo-600 transition-all" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
              </div>
              <p className="text-xs text-slate-500">Đang xử lý {progress.done}/{progress.total} học viên...</p>
            </div>
          )}
        </div>

        {loadError ? (
          <div className="m-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>{loadError}</p>
              <button type="button" onClick={() => setReloadToken((value) => value + 1)} className="mt-2 min-h-9 font-bold underline">Thử lại</button>
            </div>
          </div>
        ) : loading ? (
          <div className="space-y-3 p-4 sm:p-5" role="status" aria-live="polite" aria-busy="true">
            <p className="text-xs text-slate-500">{progressLabel || 'Đang tải dữ liệu...'}</p>
            {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : filteredGroups.length === 0 ? (
          <EmptyState
            icon={<CheckCheck className="h-8 w-8" />}
            title={search ? 'Không có học viên khớp tìm kiếm' : 'Không còn ca nào cần xử lý'}
            description={tab === 'approved' ? 'Mọi ca đã có buổi được duyệt đều đã đóng.' : 'Mọi ca đang giữ đều trỏ đúng gói của học viên.'}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredGroups.map((group) => {
              const ids = actionableIds(group)
              const isExpanded = expanded.includes(group.studentId)
              const orphan = isOrphanGroup(group)
              const targetName = orphan ? group.rows.find((row) => row.target)?.target?.subjectName : ''
              const blockers = orphan ? Array.from(new Set(group.rows.flatMap((row) => (row.blocker ? [row.blocker] : [])))) : []
              return (
                <li key={group.studentId} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Chọn ${group.studentName}`}
                        className="mt-1 h-5 w-5 shrink-0 accent-indigo-600 disabled:opacity-40"
                        disabled={ids.length === 0 || processing}
                        checked={selected.includes(group.studentId)}
                        onChange={() => setSelected((current) => toggle(current, group.studentId))}
                      />
                      <div className="min-w-0">
                        <Link to={`/admin/students/${group.studentId}`} className="font-extrabold text-slate-950 hover:text-indigo-700 hover:underline">
                          {group.studentName}
                        </Link>
                        <span className="ml-2 font-mono text-xs font-semibold text-slate-500">{group.studentCode}</span>
                        <p className="mt-1 text-xs text-slate-600">
                          {group.rows.length} ca · {number(group.points)} kim cương
                          {!orphan && (
                            <> · Số giữ trên hồ sơ <strong>{number(group.storedHeld)}</strong> → sau khi đóng <strong className="text-emerald-700">{number(group.ledgerHeldAfter)}</strong> kim cương</>
                          )}
                          {orphan && targetName && ids.length > 0 && <> · Chuyển về gói <strong className="text-emerald-700">{targetName}</strong></>}
                        </p>
                        {blockers.map((blocker) => (
                          <p key={blocker} className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-amber-800">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{ORPHAN_BLOCKER_LABELS[blocker]}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0">
                      <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((current) => toggle(current, group.studentId))} className="min-h-10">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{isExpanded ? 'Thu gọn' : 'Xem ca'}
                      </Button>
                      <Button type="button" size="sm" disabled={ids.length === 0 || processing} onClick={() => setConfirmGroups([group])} className="min-h-10">
                        {tab === 'approved' ? `Đóng ${ids.length} ca` : `Chuyển ${ids.length} ca`}
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/60">
                      {group.rows.map((row) => {
                        const booking = row.booking
                        const blocker = 'blocker' in row ? row.blocker : null
                        return (
                          <li key={booking.id} className="flex flex-col gap-1 px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                            <span className="font-semibold text-slate-800">
                              {DAY_LABELS[booking.requestedDay || ''] || ''} {formatDate(booking.requestedDate)} · {booking.requestedStart || '--:--'} - {booking.requestedEnd || '--:--'} · {booking.teacherName || 'Gia sư'}
                            </span>
                            <span className="text-slate-500">
                              {number(getBookingPoints(booking))} kim cương
                              {'blocker' in row && <> · Môn đang ghi: {booking.subjectName || 'không có'}</>}
                              {booking.lessonId && <> · {tab === 'approved' ? 'buổi đã duyệt' : 'đã gắn buổi điểm danh'}</>}
                              {blocker && <span className="font-semibold text-amber-800"> · cần xử lý tay</span>}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(confirmGroups)}
        onClose={() => { if (!processing) setConfirmGroups(null) }}
        onConfirm={() => { if (confirmGroups) void runBulk(confirmGroups) }}
        title={tab === 'approved'
          ? `Đóng ${confirmRows} ca đã duyệt của ${confirmGroups?.length || 0} học viên?`
          : `Chuyển ${confirmRows} ca của ${confirmGroups?.length || 0} học viên về đúng gói?`}
        description={tab === 'approved'
          ? 'Ca chuyển sang đã hoàn thành. Số kim cương đang giữ trên hồ sơ được đặt bằng tổng các ca thật sự còn giữ.'
          : 'Ca giữ nguyên ngày giờ, gia sư và số kim cương; chỉ đổi môn về gói hiện tại của học viên để điểm danh và duyệt được.'}
        consequence="Không trừ hay cộng quỹ học, không đổi buổi dạy và lương. Học viên có dữ liệu vừa thay đổi sẽ được bỏ qua để không ghi đè."
        confirmLabel={tab === 'approved' ? 'Đóng ca' : 'Chuyển ca'}
        loading={processing}
      />
    </div>
  )
}
