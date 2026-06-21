import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react'
import { db } from '@/lib/firebase'
import { BookingRequest, DayOfWeek, Student } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSpinner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Thứ 2',
  tue: 'Thứ 3',
  wed: 'Thứ 4',
  thu: 'Thứ 5',
  fri: 'Thứ 6',
  sat: 'Thứ 7',
  sun: 'Chủ nhật',
}

const STATUS_LABELS: Record<BookingRequest['status'], string> = {
  pending: 'Chờ xử lý',
  confirmed: 'Đã giữ chỗ',
  rejected: 'Từ chối',
  released: 'Đã nhả chỗ',
}

const STATUS_STYLES: Record<BookingRequest['status'], string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  released: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function getStudentMinuteFund(student: Student) {
  const minutesPerSession = student.minutesPerSession || 50
  const total = student.totalMinutes ?? student.totalSessions * minutesPerSession
  const used = student.usedMinutes ?? student.usedSessions * minutesPerSession
  const remaining = student.remainingMinutes ?? Math.max(0, total - used)
  const held = student.reservedMinutes ?? student.heldMinutes ?? 0
  const available = Math.max(0, remaining - held)

  return { total, used, remaining, held, available }
}

function formatDate(value: BookingRequest['createdAt'] | undefined) {
  if (!value?.toDate) return 'Chưa có thời gian'
  return value.toDate().toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function StatusPill({ status }: { status: BookingRequest['status'] }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function BookingRequestsPage() {
  const { user } = useAuthStore()
  const [requests, setRequests] = useState<BookingRequest[]>([])
  const [students, setStudents] = useState<Record<string, Student>>({})
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<BookingRequest['status'] | 'all'>('pending')
  const [search, setSearch] = useState('')
  const [actioning, setActioning] = useState(false)
  const [confirming, setConfirming] = useState<BookingRequest | null>(null)
  const [rejecting, setRejecting] = useState<BookingRequest | null>(null)
  const [releasing, setReleasing] = useState<BookingRequest | null>(null)
  const [adminNote, setAdminNote] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'bookingRequests'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRequests(snap.docs.map((item) => ({ id: item.id, ...item.data() } as BookingRequest)))
        setLoading(false)
      },
      (error) => {
        console.error('Error loading booking requests:', error)
        toast.error('Không thể tải yêu cầu chọn giáo viên')
        setLoading(false)
      }
    )

    return unsub
  }, [])

  useEffect(() => {
    const ids = Array.from(new Set(requests.map((item) => item.studentId).filter(Boolean)))
      .filter((id) => !students[id])

    if (ids.length === 0) return

    const unsubs = ids.map((id) =>
      onSnapshot(doc(db, 'students', id), (snap) => {
        if (!snap.exists()) return
        setStudents((prev) => ({
          ...prev,
          [id]: { id: snap.id, ...snap.data() } as Student,
        }))
      })
    )

    return () => {
      unsubs.forEach((unsub) => unsub())
    }
  }, [requests, students])

  const counts = useMemo(() => ({
    pending: requests.filter((item) => item.status === 'pending').length,
    confirmed: requests.filter((item) => item.status === 'confirmed').length,
    rejected: requests.filter((item) => item.status === 'rejected').length,
    released: requests.filter((item) => item.status === 'released').length,
  }), [requests])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return requests.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const haystack = [
        item.studentName,
        item.studentCode,
        item.teacherName,
        item.teacherCode,
        item.subjectName,
      ].filter(Boolean).join(' ').toLowerCase()

      return matchesStatus && (!keyword || haystack.includes(keyword))
    })
  }, [requests, search, statusFilter])

  const handleConfirm = async () => {
    if (!confirming) return
    setActioning(true)

    try {
      await runTransaction(db, async (tx) => {
        const requestRef = doc(db, 'bookingRequests', confirming.id)
        const studentRef = doc(db, 'students', confirming.studentId)
        const [requestSnap, studentSnap] = await Promise.all([
          tx.get(requestRef),
          tx.get(studentRef),
        ])

        if (!requestSnap.exists()) throw new Error('REQUEST_NOT_FOUND')
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

        const requestNow = requestSnap.data() as BookingRequest
        if (requestNow.status !== 'pending') throw new Error('REQUEST_ALREADY_PROCESSED')

        const student = { id: studentSnap.id, ...studentSnap.data() } as Student
        const fund = getStudentMinuteFund(student)
        const minutes = Number(requestNow.requestedMinutes) || 0

        if (fund.available < minutes) throw new Error('NOT_ENOUGH_MINUTES')

        const nextHeld = fund.held + minutes

        tx.update(studentRef, {
          reservedMinutes: nextHeld,
          heldMinutes: nextHeld,
          updatedAt: serverTimestamp(),
        })

        tx.update(requestRef, {
          status: 'confirmed',
          adminNote: adminNote.trim(),
          confirmedAt: serverTimestamp(),
          confirmedBy: user?.uid ?? '',
          heldMinutesAfterConfirm: nextHeld,
        })

        tx.set(doc(collection(db, 'adminLogs')), {
          adminId: user?.uid ?? '',
          action: 'CONFIRM_BOOKING_REQUEST',
          targetType: 'bookingRequest',
          targetId: confirming.id,
          changes: {
            studentId: confirming.studentId,
            teacherId: confirming.teacherId,
            heldMinutesAdded: minutes,
            heldMinutesAfter: nextHeld,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success('Đã xác nhận và giữ chỗ trong quỹ phút')
      setConfirming(null)
      setAdminNote('')
    } catch (error: any) {
      console.error('Confirm booking request failed:', error)
      const message = error?.message
      if (message === 'NOT_ENOUGH_MINUTES') toast.error('Quỹ phút khả dụng không đủ để giữ chỗ')
      else if (message === 'REQUEST_ALREADY_PROCESSED') toast.warning('Yêu cầu này đã được xử lý trước đó')
      else toast.error('Xác nhận yêu cầu thất bại')
    } finally {
      setActioning(false)
    }
  }

  const handleReject = async () => {
    if (!rejecting) return
    setActioning(true)

    try {
      await runTransaction(db, async (tx) => {
        const requestRef = doc(db, 'bookingRequests', rejecting.id)
        const requestSnap = await tx.get(requestRef)
        if (!requestSnap.exists()) throw new Error('REQUEST_NOT_FOUND')

        const requestNow = requestSnap.data() as BookingRequest
        if (requestNow.status !== 'pending') throw new Error('REQUEST_ALREADY_PROCESSED')

        tx.update(requestRef, {
          status: 'rejected',
          adminNote: adminNote.trim(),
          rejectedAt: serverTimestamp(),
          rejectedBy: user?.uid ?? '',
        })

        tx.set(doc(collection(db, 'adminLogs')), {
          adminId: user?.uid ?? '',
          action: 'REJECT_BOOKING_REQUEST',
          targetType: 'bookingRequest',
          targetId: rejecting.id,
          changes: {
            studentId: rejecting.studentId,
            teacherId: rejecting.teacherId,
            reason: adminNote.trim(),
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success('Đã từ chối yêu cầu')
      setRejecting(null)
      setAdminNote('')
    } catch (error: any) {
      console.error('Reject booking request failed:', error)
      if (error?.message === 'REQUEST_ALREADY_PROCESSED') toast.warning('Yêu cầu này đã được xử lý trước đó')
      else toast.error('Từ chối yêu cầu thất bại')
    } finally {
      setActioning(false)
    }
  }

  const handleRelease = async () => {
    if (!releasing) return
    setActioning(true)

    try {
      await runTransaction(db, async (tx) => {
        const requestRef = doc(db, 'bookingRequests', releasing.id)
        const studentRef = doc(db, 'students', releasing.studentId)
        const [requestSnap, studentSnap] = await Promise.all([
          tx.get(requestRef),
          tx.get(studentRef),
        ])

        if (!requestSnap.exists()) throw new Error('REQUEST_NOT_FOUND')
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

        const requestNow = requestSnap.data() as BookingRequest
        if (requestNow.status !== 'confirmed') throw new Error('REQUEST_NOT_CONFIRMED')

        const student = { id: studentSnap.id, ...studentSnap.data() } as Student
        const fund = getStudentMinuteFund(student)
        const minutes = Number(requestNow.requestedMinutes) || 0
        const nextHeld = Math.max(0, fund.held - minutes)

        tx.update(studentRef, {
          reservedMinutes: nextHeld,
          heldMinutes: nextHeld,
          updatedAt: serverTimestamp(),
        })

        tx.update(requestRef, {
          status: 'released',
          adminNote: adminNote.trim(),
          releasedAt: serverTimestamp(),
          releasedBy: user?.uid ?? '',
          heldMinutesAfterRelease: nextHeld,
        })

        tx.set(doc(collection(db, 'adminLogs')), {
          adminId: user?.uid ?? '',
          action: 'RELEASE_BOOKING_HOLD',
          targetType: 'bookingRequest',
          targetId: releasing.id,
          changes: {
            studentId: releasing.studentId,
            releasedMinutes: minutes,
            heldMinutesAfter: nextHeld,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success('Đã nhả giữ chỗ')
      setReleasing(null)
      setAdminNote('')
    } catch (error: any) {
      console.error('Release booking request failed:', error)
      if (error?.message === 'REQUEST_NOT_CONFIRMED') toast.warning('Chỉ yêu cầu đã giữ chỗ mới cần nhả')
      else toast.error('Nhả giữ chỗ thất bại')
    } finally {
      setActioning(false)
    }
  }

  const openConfirm = (request: BookingRequest) => {
    setAdminNote('')
    setConfirming(request)
  }

  const openReject = (request: BookingRequest) => {
    setAdminNote('')
    setRejecting(request)
  }

  const openRelease = (request: BookingRequest) => {
    setAdminNote('')
    setReleasing(request)
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">Học vụ</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Yêu cầu chọn giáo viên</h1>
          <p className="mt-1 text-sm text-slate-500">
            Xác nhận yêu cầu để giữ phút, hoặc từ chối/nhả chỗ khi lịch không còn phù hợp.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Chờ xử lý', counts.pending, 'text-amber-600'],
            ['Đã giữ', counts.confirmed, 'text-emerald-600'],
            ['Từ chối', counts.rejected, 'text-rose-600'],
            ['Đã nhả', counts.released, 'text-slate-600'],
          ].map(([label, value, color]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
              <p className="text-xs font-medium text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm học viên, mã học viên, giáo viên..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto">
            {(['pending', 'confirmed', 'rejected', 'released', 'all'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`h-11 shrink-0 rounded-xl px-4 text-sm font-bold transition ${
                  statusFilter === status
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status === 'all' ? 'Tất cả' : STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? (
        <Card padding="none"><TableSkeleton /></Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-8 w-8" />}
          title="Chưa có yêu cầu phù hợp"
          description="Các yêu cầu phụ huynh gửi từ trang giáo viên sẽ hiển thị tại đây."
        />
      ) : (
        <div className="grid gap-4">
          {filtered.map((request) => {
            const student = students[request.studentId]
            const fund = student ? getStudentMinuteFund(student) : null
            const canConfirm = request.status === 'pending' && !!fund && fund.available >= request.requestedMinutes

            return (
              <article key={request.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="grid gap-4 p-4 lg:grid-cols-[1fr_260px] lg:p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={request.status} />
                      <span className="text-xs font-medium text-slate-400">{formatDate(request.createdAt)}</span>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Học viên</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{request.studentName}</p>
                        <p className="mt-1 font-mono text-xs font-semibold text-indigo-500">{request.studentCode}</p>
                        <p className="mt-2 text-sm text-slate-500">{request.subjectName || 'Chưa có môn học'}</p>
                      </div>
                      <div className="rounded-2xl bg-amber-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-600">Giáo viên yêu cầu</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{request.teacherName}</p>
                        <p className="mt-1 font-mono text-xs font-semibold text-amber-700">{request.teacherCode}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">
                          {DAY_LABELS[request.requestedDay]}, {request.requestedStart}-{request.requestedEnd}
                          <span className="ml-2 text-slate-400">({request.requestedMinutes} phút)</span>
                        </p>
                      </div>
                    </div>
                    {request.note && (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                        <span className="font-semibold text-slate-900">Ghi chú phụ huynh: </span>
                        {request.note}
                      </div>
                    )}
                    {request.adminNote && (
                      <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
                        <span className="font-semibold">Ghi chú học vụ: </span>
                        {request.adminNote}
                      </div>
                    )}
                  </div>

                  <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-900">Quỹ phút hiện tại</p>
                    {fund ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {[
                          ['Tổng', fund.total],
                          ['Đã học', fund.used],
                          ['Giữ chỗ', fund.held],
                          ['Khả dụng', fund.available],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl bg-white p-3">
                            <p className="text-lg font-bold tabular-nums text-slate-900">{Number(value).toLocaleString('vi-VN')}</p>
                            <p className="text-[11px] font-medium text-slate-500">{label}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-500">Đang tải quỹ phút...</p>
                    )}

                    {request.status === 'pending' && fund && !canConfirm && (
                      <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                        Khả dụng không đủ {request.requestedMinutes} phút để giữ chỗ.
                      </p>
                    )}

                    <div className="mt-4 grid gap-2">
                      {request.status === 'pending' && (
                        <>
                          <Button size="sm" disabled={!canConfirm} onClick={() => openConfirm(request)}>
                            <CheckCircle2 className="h-4 w-4" />
                            Xác nhận giữ chỗ
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openReject(request)}>
                            <XCircle className="h-4 w-4" />
                            Từ chối
                          </Button>
                        </>
                      )}
                      {request.status === 'confirmed' && (
                        <Button size="sm" variant="outline" onClick={() => openRelease(request)}>
                          <RotateCcw className="h-4 w-4" />
                          Nhả giữ chỗ
                        </Button>
                      )}
                    </div>
                  </aside>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={handleConfirm}
        title="Xác nhận giữ chỗ"
        description={confirming ? `Giữ ${confirming.requestedMinutes} phút cho ${confirming.studentName} với giáo viên ${confirming.teacherName}.` : ''}
        confirmLabel="Xác nhận"
        loading={actioning}
      >
        <textarea
          value={adminNote}
          onChange={(event) => setAdminNote(event.target.value)}
          placeholder="Ghi chú nội bộ hoặc lời nhắn cho phụ huynh..."
          className="mt-3 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          rows={3}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={handleReject}
        title="Từ chối yêu cầu"
        description={rejecting ? `Từ chối yêu cầu chọn giáo viên của ${rejecting.studentName}.` : ''}
        confirmLabel="Từ chối"
        confirmVariant="danger"
        loading={actioning}
      >
        <textarea
          value={adminNote}
          onChange={(event) => setAdminNote(event.target.value)}
          placeholder="Lý do từ chối hoặc giáo viên/lịch thay thế..."
          className="mt-3 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
          rows={3}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!releasing}
        onClose={() => setReleasing(null)}
        onConfirm={handleRelease}
        title="Nhả giữ chỗ"
        description={releasing ? `Nhả ${releasing.requestedMinutes} phút đã giữ cho ${releasing.studentName}.` : ''}
        confirmLabel="Nhả giữ chỗ"
        loading={actioning}
      >
        <textarea
          value={adminNote}
          onChange={(event) => setAdminNote(event.target.value)}
          placeholder="Ghi chú lý do nhả chỗ..."
          className="mt-3 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          rows={3}
        />
      </ConfirmDialog>
    </div>
  )
}
