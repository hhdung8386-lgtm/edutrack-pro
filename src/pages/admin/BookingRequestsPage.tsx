import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDocs,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
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
import { getBookingPoints } from '@/lib/points'
import { getStudentPackageMinuteSummary } from '@/lib/studentMinutes'
import {
  bookingConflictMessage,
  checkBookingCandidates,
  findExistingBookingConflictPairs,
  formatBookingDate,
} from '@/lib/bookingConflicts'

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
  completed: 'Đã học',
  rejected: 'Từ chối',
  released: 'Đã nhả chỗ',
}

const STATUS_STYLES: Record<BookingRequest['status'], string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  completed: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  released: 'bg-slate-100 text-slate-600 ring-slate-200',
}

const REQUEST_PAGE_SIZE = 200
const REQUEST_STATUSES: BookingRequest['status'][] = ['pending', 'confirmed', 'completed', 'rejected', 'released']

function getStudentMinuteFund(student: Student) {
  const summary = getStudentPackageMinuteSummary(student)
  const total = summary.totalMinutes
  const used = summary.usedMinutes
  const remaining = summary.remainingMinutes
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : ''
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
  const [counts, setCounts] = useState<Record<BookingRequest['status'], number>>({
    pending: 0,
    confirmed: 0,
    completed: 0,
    rejected: 0,
    released: 0,
  })
  const [lastRequestDoc, setLastRequestDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [todayISO] = useState(() => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split('T')[0])

  useEffect(() => {
    let active = true

    const constraints: QueryConstraint[] = statusFilter === 'all'
      ? [orderBy('createdAt', 'desc'), firestoreLimit(REQUEST_PAGE_SIZE)]
      : [where('status', '==', statusFilter), firestoreLimit(REQUEST_PAGE_SIZE)]

    const unsubscribe = onSnapshot(
      query(collection(db, 'bookingRequests'), ...constraints),
      (snapshot) => {
        if (!active) return
        const items = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() } as BookingRequest))
          .sort((left, right) => (right.createdAt?.seconds || 0) - (left.createdAt?.seconds || 0))
        setRequests(items)
        setLastRequestDoc(snapshot.docs[snapshot.docs.length - 1] || null)
        setHasMore(snapshot.docs.length === REQUEST_PAGE_SIZE)
        setLoading(false)
      },
      (error) => {
        console.error('Error loading booking requests:', error)
        toast.error('Không thể tải yêu cầu chọn gia sư')
        if (active) setLoading(false)
      },
    )

    return () => {
      active = false
      unsubscribe()
    }
  }, [statusFilter, reloadVersion])

  useEffect(() => {
    let active = true
    Promise.all(REQUEST_STATUSES.map(async (status) => {
      const snapshot = await getCountFromServer(query(
        collection(db, 'bookingRequests'),
        where('status', '==', status),
      ))
      return [status, snapshot.data().count] as const
    })).then((entries) => {
      if (active) setCounts(Object.fromEntries(entries) as Record<BookingRequest['status'], number>)
    }).catch((error) => {
      console.error('Error loading booking request counts:', error)
    })
    return () => {
      active = false
    }
  }, [reloadVersion])

  useEffect(() => {
    const ids = Array.from(new Set(requests.map((item) => item.studentId).filter(Boolean)))
      .filter((id) => !students[id])

    if (ids.length === 0) return

    let active = true
    const chunks: string[][] = []
    for (let index = 0; index < ids.length; index += 30) chunks.push(ids.slice(index, index + 30))

    Promise.all(chunks.map((chunk) => getDocs(query(
      collection(db, 'students'),
      where(documentId(), 'in', chunk),
    )))).then((snapshots) => {
      if (!active) return
      const loadedStudents: Record<string, Student> = {}
      snapshots.forEach((snapshot) => {
        snapshot.docs.forEach((studentDocument) => {
          loadedStudents[studentDocument.id] = {
            id: studentDocument.id,
            ...studentDocument.data(),
          } as Student
        })
      })
      setStudents((previous) => ({ ...previous, ...loadedStudents }))
    }).catch((error) => {
      console.error('Error loading students for booking requests:', error)
    })

    return () => {
      active = false
    }
  }, [requests, students])

  const loadMoreRequests = async () => {
    if (!lastRequestDoc || loadingMore) return
    setLoadingMore(true)
    try {
      const constraints: QueryConstraint[] = statusFilter === 'all'
        ? [orderBy('createdAt', 'desc'), startAfter(lastRequestDoc), firestoreLimit(REQUEST_PAGE_SIZE)]
        : [where('status', '==', statusFilter), startAfter(lastRequestDoc), firestoreLimit(REQUEST_PAGE_SIZE)]
      const snapshot = await getDocs(query(collection(db, 'bookingRequests'), ...constraints))
      const nextItems = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as BookingRequest))
      setRequests((previous) => {
        const byId = new Map([...previous, ...nextItems].map((item) => [item.id, item]))
        return Array.from(byId.values()).sort(
          (left, right) => (right.createdAt?.seconds || 0) - (left.createdAt?.seconds || 0),
        )
      })
      setLastRequestDoc(snapshot.docs[snapshot.docs.length - 1] || null)
      setHasMore(snapshot.docs.length === REQUEST_PAGE_SIZE)
    } catch (error) {
      console.error('Error loading more booking requests:', error)
      toast.error('Không thể tải thêm yêu cầu')
    } finally {
      setLoadingMore(false)
    }
  }

  const upcomingConflicts = useMemo(() => {
    return findExistingBookingConflictPairs(
      requests.filter((item) => Boolean(item.requestedDate) && item.requestedDate! >= todayISO),
    )
  }, [requests, todayISO])

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
      const conflicts = await checkBookingCandidates([{
        id: confirming.id,
        teacherId: confirming.teacherId,
        teacherName: confirming.teacherName,
        studentId: confirming.studentId,
        studentName: confirming.studentName,
        requestedDate: confirming.requestedDate,
        requestedStart: confirming.requestedStart,
        requestedEnd: confirming.requestedEnd,
        requestedMinutes: confirming.requestedMinutes,
      }], {
        ignoreBookingIds: [confirming.id],
        includePending: false,
      })

      if (conflicts.length > 0) {
        toast.error(bookingConflictMessage(conflicts[0], 'vi'))
        return
      }

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

        const todayISO = new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0]
        if (requestNow.requestedDate && requestNow.requestedDate < todayISO) {
          throw new Error('PAST_DATE_NOT_ALLOWED')
        }

        const teacherSnap = requestNow.teacherId
          ? await tx.get(doc(db, 'teachers', requestNow.teacherId))
          : null
        const teacherData = teacherSnap?.exists() ? teacherSnap.data() : null
        const student = { id: studentSnap.id, ...studentSnap.data() } as Student
        const fund = getStudentMinuteFund(student)
        const heldAmount = getBookingPoints(requestNow, teacherData)
        const holdAlreadyApplied = requestNow.heldImmediately === true

        if (holdAlreadyApplied ? fund.held < heldAmount : fund.available < heldAmount) throw new Error('NOT_ENOUGH_MINUTES')

        const nextHeld = holdAlreadyApplied ? fund.held : fund.held + heldAmount

        if (!holdAlreadyApplied) {
          tx.update(studentRef, {
            reservedMinutes: nextHeld,
            heldMinutes: nextHeld,
            updatedAt: serverTimestamp(),
          })
        }

        tx.update(requestRef, {
          status: 'confirmed',
          adminNote: adminNote.trim(),
          confirmedAt: serverTimestamp(),
          confirmedBy: user?.uid ?? '',
          heldMinutesAfterConfirm: nextHeld,
          requestedPoints: heldAmount,
          pointsPer25Minutes: Number(requestNow.pointsPer25Minutes ?? teacherData?.pointsPer25Minutes) || 25,
        })

        tx.set(doc(collection(db, 'adminLogs')), {
          adminId: user?.uid ?? '',
          action: 'CONFIRM_BOOKING_REQUEST',
          targetType: 'bookingRequest',
          targetId: confirming.id,
          changes: {
            studentId: confirming.studentId,
            teacherId: confirming.teacherId,
            heldMinutesAdded: holdAlreadyApplied ? 0 : heldAmount,
            heldMinutesAfter: nextHeld,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success('Đã xác nhận và giữ đúng số kim cương theo giá gia sư')
      setConfirming(null)
      setReloadVersion((version) => version + 1)
      setAdminNote('')
    } catch (error: unknown) {
      console.error('Confirm booking request failed:', error)
      const message = getErrorMessage(error)
      if (message === 'NOT_ENOUGH_MINUTES') toast.error('Quỹ kim cương khả dụng không đủ để giữ chỗ')
      else if (message === 'REQUEST_ALREADY_PROCESSED') toast.warning('Yêu cầu này đã được xử lý trước đó')
      else if (message === 'PAST_DATE_NOT_ALLOWED') toast.error('Không thể xác nhận yêu cầu xếp lớp cho ngày đã qua!')
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
      setReloadVersion((version) => version + 1)
      setAdminNote('')
    } catch (error: unknown) {
      console.error('Reject booking request failed:', error)
      if (getErrorMessage(error) === 'REQUEST_ALREADY_PROCESSED') toast.warning('Yêu cầu này đã được xử lý trước đó')
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

        const teacherSnap = requestNow.teacherId
          ? await tx.get(doc(db, 'teachers', requestNow.teacherId))
          : null
        const teacherData = teacherSnap?.exists() ? teacherSnap.data() : null
        const student = { id: studentSnap.id, ...studentSnap.data() } as Student
        const fund = getStudentMinuteFund(student)
        const heldAmount = getBookingPoints(requestNow, teacherData)
        const nextHeld = Math.max(0, fund.held - heldAmount)

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
            releasedPoints: heldAmount,
            heldMinutesAfter: nextHeld,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success('Đã nhả giữ chỗ')
      setReleasing(null)
      setReloadVersion((version) => version + 1)
      setAdminNote('')
    } catch (error: unknown) {
      console.error('Release booking request failed:', error)
      if (getErrorMessage(error) === 'REQUEST_NOT_CONFIRMED') toast.warning('Chỉ yêu cầu đã giữ chỗ mới cần nhả')
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

  const changeStatusFilter = (status: BookingRequest['status'] | 'all') => {
    if (status === statusFilter) return
    setLoading(true)
    setRequests([])
    setLastRequestDoc(null)
    setHasMore(false)
    setStatusFilter(status)
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">Học vụ</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Yêu cầu chọn gia sư</h1>
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

      {upcomingConflicts.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900 shadow-sm" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div className="min-w-0">
              <p className="font-black">Có {upcomingConflicts.length} cặp yêu cầu đang trùng lịch</p>
              <p className="mt-1 text-sm text-rose-700">
                Hệ thống sẽ chặn xác nhận ca bị trùng. Vui lòng kiểm tra lại gia sư và học viên trước khi duyệt.
              </p>
              <div className="mt-3 grid gap-2 text-sm lg:grid-cols-2">
                {upcomingConflicts.slice(0, 4).map((conflict) => (
                  <div key={`${conflict.first.id}-${conflict.second.id}`} className="rounded-xl bg-white/80 px-3 py-2">
                    <span className="font-bold">{formatBookingDate(conflict.first.requestedDate)}, {conflict.first.requestedStart}-{conflict.first.requestedEnd}:</span>{' '}
                    {conflict.first.teacherName || conflict.first.teacherCode} · {conflict.first.studentName || conflict.first.studentCode} / {conflict.second.studentName || conflict.second.studentCode}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <Card className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm học viên, mã học viên, gia sư..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto">
            {(['pending', 'confirmed', 'completed', 'rejected', 'released', 'all'] as const).map((status) => (
              <button
                key={status}
                onClick={() => changeStatusFilter(status)}
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
          description="Các yêu cầu chọn gia sư phù hợp với bộ lọc sẽ hiển thị tại đây."
        />
      ) : (
        <div className="grid gap-4">
          {filtered.map((request) => {
            const student = students[request.studentId]
            const fund = student ? getStudentMinuteFund(student) : null
            const teacherReady = request.teacherResponse === undefined || request.teacherResponse === 'accepted'
            const requestedHold = getBookingPoints(request)
            const hasEnoughMinutes = !!fund && (request.heldImmediately ? fund.held >= requestedHold : fund.available >= requestedHold)
            const canConfirm = request.status === 'pending' && teacherReady && hasEnoughMinutes

            return (
              <article key={request.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="grid gap-4 p-4 lg:grid-cols-[1fr_260px] lg:p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={request.status} />
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${request.teacherResponse === 'accepted' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : request.teacherResponse === 'declined' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                        {request.teacherResponse === 'accepted' ? 'Gia sư đã xác nhận' : request.teacherResponse === 'declined' ? 'Gia sư đã từ chối' : 'Chờ gia sư phản hồi'}
                      </span>
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
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-600">Gia sư yêu cầu</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{request.teacherName}</p>
                        <p className="mt-1 font-mono text-xs font-semibold text-amber-700">{request.teacherCode}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">
                          {DAY_LABELS[request.requestedDay]}{request.requestedDate ? ` ${request.requestedDate}` : ''}, {request.requestedStart}-{request.requestedEnd}
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

                    {request.status === 'pending' && !teacherReady && (
                      <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${request.teacherResponse === 'declined' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                        {request.teacherResponse === 'declined' ? 'Gia sư đã từ chối yêu cầu này.' : 'Đang chờ gia sư xác nhận nhận lớp.'}
                      </p>
                    )}
                    {request.status === 'pending' && fund && teacherReady && !hasEnoughMinutes && (
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
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" loading={loadingMore} onClick={loadMoreRequests}>
                Tải thêm {REQUEST_PAGE_SIZE} yêu cầu
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={handleConfirm}
        title="Xác nhận giữ chỗ"
        description={confirming ? `Giữ ${confirming.requestedMinutes} phút cho ${confirming.studentName} với gia sư ${confirming.teacherName}.` : ''}
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
        description={rejecting ? `Từ chối yêu cầu chọn gia sư của ${rejecting.studentName}.` : ''}
        confirmLabel="Từ chối"
        confirmVariant="danger"
        loading={actioning}
      >
        <textarea
          value={adminNote}
          onChange={(event) => setAdminNote(event.target.value)}
          placeholder="Lý do từ chối hoặc gia sư/lịch thay thế..."
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
