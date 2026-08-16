import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  collection, query, where, onSnapshot, getDocs, runTransaction, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { BookingRequest, Lesson, Student, Teacher } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  ArrowLeft, AlertCircle, Search, Download, ExternalLink, Link2, RotateCcw,
  Hourglass, CheckCircle2, XCircle, HelpCircle, ShieldAlert, UserRoundX,
} from 'lucide-react'
import { getBookingPoints } from '@/lib/points'
import { bookingHoldPoints } from '@/lib/lessonBooking'
import {
  diagnoseOverdueBookings,
  type DiagnosedOverdueBooking,
  type OverdueDiagnosis,
} from '@/lib/overdueBookingDiagnosis'

/**
 * Chẩn đoán vì sao một ca đã đặt bị quá hạn mà chưa được điểm danh.
 * Chỉ ghép tự động khi đúng học viên, ngày, giáo viên và có bằng chứng liên kết an toàn.
 */
const DIAGNOSIS_META: Record<OverdueDiagnosis, {
  label: string
  short: string
  desc: string
  advice: string
  badge: string
  chip: string
  icon: React.ElementType
}> = {
  pending_lesson: {
    label: 'Gia sư đã điểm danh, chờ duyệt',
    short: 'Chờ duyệt',
    desc: 'Gia sư đã nộp báo cáo buổi dạy cho ngày này nhưng admin chưa duyệt.',
    advice: 'Không hoàn kim cương. Hãy vào trang Duyệt buổi dạy để duyệt; hệ thống sẽ tự trừ kim cương và nhả giữ chỗ đúng quy trình.',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    chip: 'bg-amber-500',
    icon: Hourglass,
  },
  approved_lesson: {
    label: 'Đã dạy và đã duyệt, thiếu liên kết',
    short: 'Đã dạy (đứt liên kết)',
    desc: 'Đã có buổi dạy được duyệt cho ngày này, nhưng ca đặt lịch không được gắn vào buổi dạy đó nên vẫn giữ chỗ.',
    advice: 'Bấm "Gắn buổi dạy" để nối lại. Phút học đã bị trừ khi duyệt, nên thao tác này chỉ nhả phần giữ chỗ đang treo oan.',
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    chip: 'bg-sky-500',
    icon: CheckCircle2,
  },
  rejected_lesson: {
    label: 'Buổi dạy bị TỪ CHỐI',
    short: 'Bị từ chối',
    desc: 'Gia sư có nộp báo cáo cho ngày này nhưng đã bị admin từ chối.',
    advice: 'Buổi học không được tính. Nên hoàn kim cương giữ chỗ về cho học viên.',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    chip: 'bg-rose-500',
    icon: XCircle,
  },
  no_lesson: {
    label: 'Không có báo cáo của đúng gia sư',
    short: 'Chưa điểm danh',
    desc: 'Không tìm thấy buổi dạy nào của đúng gia sư đã được xếp cho ca này.',
    advice: 'Xác minh với gia sư. Nếu lớp không diễn ra thì hoàn kim cương cho học viên.',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    chip: 'bg-slate-400',
    icon: HelpCircle,
  },
  other_teacher_lesson: {
    label: 'Có buổi của giáo viên khác cùng ngày',
    short: 'Khác giáo viên',
    desc: 'Học viên có buổi học cùng ngày nhưng do giáo viên khác dạy. Hệ thống không tự ghép để tránh nối sai dữ liệu.',
    advice: 'Xác minh với đúng gia sư trong ca đặt. Không dùng buổi của giáo viên khác để gắn thay.',
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
    chip: 'bg-violet-500',
    icon: UserRoundX,
  },
  ambiguous_lesson: {
    label: 'Có nhiều khả năng khớp',
    short: 'Cần xác minh',
    desc: 'Cùng giáo viên nhưng số ca, thời lượng hoặc liên kết chưa đủ rõ để hệ thống tự chọn.',
    advice: 'Đối chiếu giờ học và báo cáo trước khi xử lý. Nút gắn tự động đã được khóa.',
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
    chip: 'bg-orange-500',
    icon: ShieldAlert,
  },
  conflicting_link: {
    label: 'Liên kết dữ liệu đang mâu thuẫn',
    short: 'Xung đột liên kết',
    desc: 'Một hoặc nhiều buổi đang trỏ tới ca này nhưng thông tin giáo viên hoặc liên kết không thống nhất.',
    advice: 'Không gắn hoặc hoàn tự động. Cần kiểm tra bản ghi trước để tránh làm sai lịch sử.',
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    chip: 'bg-rose-600',
    icon: ShieldAlert,
  },
}

export function OverdueBookingsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()

  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [studentMap, setStudentMap] = useState<Record<string, Student>>({})
  const [teacherNicks, setTeacherNicks] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [lessonsLoading, setLessonsLoading] = useState(true)

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [confirmRelease, setConfirmRelease] = useState<DiagnosedOverdueBooking[] | null>(null)

  // Filters
  const [diagnosisFilter, setDiagnosisFilter] = useState<OverdueDiagnosis | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const studentFilter = searchParams.get('studentId') || 'all'
  const [teacherFilter, setTeacherFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const todayISO = useMemo(
    () => new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0],
    []
  )

  // ── Load dữ liệu ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'bookingRequests'), where('status', 'in', ['confirmed', 'pending'])),
      (snap) => {
        setBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookingRequest)))
        setLoading(false)
      },
      (err) => { console.error(err); toast.error('Không tải được danh sách ca đặt lịch'); setLoading(false) }
    )
    return unsub
  }, [])

  useEffect(() => {
    let active = true
    getDocs(collection(db, 'students')).then((snap) => {
      if (!active) return
      const map: Record<string, Student> = {}
      snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } as Student })
      setStudentMap(map)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    getDocs(collection(db, 'teachers')).then((snap) => {
      if (!active) return
      const map: Record<string, string> = {}
      snap.docs.forEach((d) => {
        const t = { id: d.id, ...d.data() } as Teacher
        const code = (t.code || '').trim()
        map[d.id] = code && !/^GV[A-Z0-9]{4,}$/i.test(code) ? code : t.name
      })
      setTeacherNicks(map)
    })
    return () => { active = false }
  }, [])

  // Ca quá hạn = đã qua ngày, chưa gắn buổi dạy, vẫn đang giữ chỗ
  const overdue = useMemo(
    () => bookings.filter((b) => b.requestedDate && !b.lessonId && b.requestedDate < todayISO),
    [bookings, todayISO]
  )

  const overdueDateRange = useMemo(() => {
    const dates = overdue.map((booking) => booking.requestedDate).filter(Boolean).sort() as string[]
    return dates.length > 0 ? { min: dates[0], max: dates[dates.length - 1] } : null
  }, [overdue])

  // Nạp các buổi dạy trong đúng khoảng ngày của các ca quá hạn để đối chiếu
  useEffect(() => {
    let active = true
    const loadLessons = async () => {
      await Promise.resolve()
      if (!active || loading) return
      if (!overdueDateRange) {
        setLessons([])
        setLessonsLoading(false)
        return
      }

      setLessonsLoading(true)
      try {
        const snap = await getDocs(query(
          collection(db, 'lessons'),
          where('date', '>=', overdueDateRange.min),
          where('date', '<=', overdueDateRange.max),
        ))
        if (active) setLessons(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson)))
      } catch (err: unknown) {
        console.error(err)
        if (active) toast.error('Không tải được dữ liệu buổi dạy để đối chiếu')
      } finally {
        if (active) setLessonsLoading(false)
      }
    }
    void loadLessons()
    return () => { active = false }
  }, [loading, overdueDateRange])

  // ── Chẩn đoán ───────────────────────────────────────────────────
  const diagnosed = useMemo(
    () => diagnoseOverdueBookings(overdue, lessons, todayISO),
    [overdue, lessons, todayISO],
  )

  const counts = useMemo(() => {
    const c: Record<OverdueDiagnosis, number> = {
      pending_lesson: 0,
      approved_lesson: 0,
      rejected_lesson: 0,
      no_lesson: 0,
      other_teacher_lesson: 0,
      ambiguous_lesson: 0,
      conflicting_link: 0,
    }
    diagnosed.forEach((d) => { c[d.diagnosis]++ })
    return c
  }, [diagnosed])

  const teacherOptions = useMemo(() => {
    const ids = new Set(diagnosed.map((d) => d.booking.teacherId).filter(Boolean))
    return Array.from(ids)
      .map((id) => ({ id, name: teacherNicks[id] || id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [diagnosed, teacherNicks])

  const studentOptions = useMemo(() => {
    const ids = new Set(diagnosed.map((d) => d.booking.studentId).filter(Boolean))
    return Array.from(ids)
      .map((id) => ({ id, code: studentMap[id]?.code || '', name: studentMap[id]?.name || id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [diagnosed, studentMap])

  const handleStudentFilter = (studentId: string) => {
    const next = new URLSearchParams(searchParams)
    if (studentId === 'all') next.delete('studentId')
    else next.set('studentId', studentId)
    setSearchParams(next, { replace: true })
    setSelectedIds([])
  }

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return diagnosed
      .filter((d) => {
        if (diagnosisFilter !== 'all' && d.diagnosis !== diagnosisFilter) return false
        if (studentFilter !== 'all' && d.booking.studentId !== studentFilter) return false
        if (teacherFilter !== 'all' && d.booking.teacherId !== teacherFilter) return false
        if (fromDate && (d.booking.requestedDate || '') < fromDate) return false
        if (toDate && (d.booking.requestedDate || '') > toDate) return false
        if (!q) return true
        const nick = teacherNicks[d.booking.teacherId] || ''
        return (
          (d.booking.studentName || '').toLowerCase().includes(q) ||
          (d.booking.studentCode || '').toLowerCase().includes(q) ||
          (d.booking.teacherName || '').toLowerCase().includes(q) ||
          nick.toLowerCase().includes(q) ||
          (d.booking.subjectName || '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => {
        const dateCmp = (a.booking.requestedDate || '').localeCompare(b.booking.requestedDate || '')
        if (dateCmp !== 0) return dateCmp
        return (a.booking.studentName || '').localeCompare(b.booking.studentName || '', 'vi')
      })
  }, [diagnosed, diagnosisFilter, studentFilter, teacherFilter, fromDate, toDate, searchQuery, teacherNicks])

  const filteredPoints = filtered.reduce((s, d) => s + getBookingPoints(d.booking), 0)
  const selectedItems = filtered.filter((d) => selectedIds.includes(d.booking.id))
  const allFilteredSelected = filtered.length > 0 && filtered.every((d) => selectedIds.includes(d.booking.id))

  // ── Hành động: hoàn phút (nhả giữ chỗ) ──────────────────────────
  const releaseHolds = async (items: DiagnosedOverdueBooking[]) => {
    if (items.length === 0) return
    setProcessing(true)
    try {
      const byStudent: Record<string, DiagnosedOverdueBooking[]> = {}
      items.forEach((it) => {
        const sid = it.booking.studentId
        if (!sid) return
        if (!byStudent[sid]) byStudent[sid] = []
        byStudent[sid].push(it)
      })
      const entries = Object.entries(byStudent)
      setProgress({ done: 0, total: entries.length })
      let done = 0
      let releasedCount = 0

      for (const [studentId, list] of entries) {
        const CHUNK = 300
        for (let i = 0; i < list.length; i += CHUNK) {
          const chunk = list.slice(i, i + CHUNK)
          releasedCount += await runTransaction(db, async (tx) => {
            const sRef = doc(db, 'students', studentId)
            const bookingRefs = chunk.map((item) => doc(db, 'bookingRequests', item.booking.id))
            const [sSnap, ...bookingSnaps] = await Promise.all([
              tx.get(sRef),
              ...bookingRefs.map((bookingRef) => tx.get(bookingRef)),
            ])
            const activeItems = bookingSnaps.flatMap((bookingSnap, index) => {
              if (!bookingSnap.exists()) return []
              const booking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
              return (
                (booking.status === 'confirmed' || booking.status === 'pending')
                && !booking.lessonId
              ) ? [{ ...chunk[index], booking }] : []
            })
            if (activeItems.length === 0) return 0

            const points = activeItems.reduce((sum, item) => sum + bookingHoldPoints(item.booking), 0)
            let releasedPoints = 0
            if (sSnap.exists()) {
              const sd = sSnap.data() as Student
              const cur = sd.reservedMinutes ?? sd.heldMinutes ?? 0
              releasedPoints = Math.min(cur, points)
              const next = cur - releasedPoints
              // Chỉ nhả phần GIỮ CHỖ. Không cộng vào remainingMinutes vì lúc đặt
              // lịch hệ thống chỉ giữ chứ chưa trừ quỹ -> cộng thêm sẽ hoàn khống.
              tx.update(sRef, { reservedMinutes: next, heldMinutes: next, updatedAt: serverTimestamp() })
            }
            activeItems.forEach((it) => {
              tx.update(doc(db, 'bookingRequests', it.booking.id), {
                status: 'released',
                releasedAt: serverTimestamp(),
                releasedBy: user?.uid ?? 'admin',
                overdueResolution: it.diagnosis,
              })
            })
            tx.set(doc(collection(db, 'adminLogs')), {
              adminId: user?.uid ?? 'admin',
              action: 'RESOLVE_OVERDUE_BOOKINGS_RELEASE',
              targetType: 'student',
              targetId: studentId,
              changes: {
                studentName: activeItems[0]?.booking.studentName || '',
                count: activeItems.length,
                bookingIds: activeItems.map((c) => c.booking.id),
                releasedPoints,
                requestedReleasePoints: points,
                diagnoses: activeItems.map((c) => c.diagnosis),
              },
              createdAt: serverTimestamp(),
            })
            return activeItems.length
          })
        }
        done++
        setProgress({ done, total: entries.length })
      }

      if (releasedCount > 0) {
        toast.success(`Đã hoàn kim cương giữ chỗ cho ${releasedCount} ca học.`)
      } else {
        toast.warning('Các ca đã được xử lý trước đó, hệ thống không hoàn trùng kim cương.')
      }
      setSelectedIds([])
      setConfirmRelease(null)
    } catch (err: unknown) {
      console.error('release overdue failed', err)
      const message = err instanceof Error ? err.message : ''
      toast.error(`Lỗi khi hoàn kim cương${message ? `: ${message}` : ''}. Phần đã xử lý vẫn được lưu, bấm lại để tiếp tục.`)
    } finally {
      setProcessing(false)
      setProgress(null)
    }
  }

  // ── Hành động: gắn ca đặt vào buổi dạy đã duyệt ─────────────────
  const linkToLesson = async (items: DiagnosedOverdueBooking[]) => {
    const targets = items.filter((it) => it.canLink && it.diagnosis === 'approved_lesson' && it.matchedLesson)
    if (targets.length === 0) {
      toast.warning('Không có ca nào đủ bằng chứng an toàn để gắn tự động')
      return
    }
    setProcessing(true)
    setProgress({ done: 0, total: targets.length })
    let ok = 0
    let failed = 0
    try {
      for (const it of targets) {
        const lesson = it.matchedLesson!
        try {
          await runTransaction(db, async (tx) => {
            const bRef = doc(db, 'bookingRequests', it.booking.id)
            const lRef = doc(db, 'lessons', lesson.id)
            const sRef = doc(db, 'students', it.booking.studentId)
            const [bSnap, lSnap, sSnap] = await Promise.all([tx.get(bRef), tx.get(lRef), tx.get(sRef)])
            if (!bSnap.exists() || !lSnap.exists()) throw new Error('NOT_FOUND')
            const bookingData = { id: bSnap.id, ...bSnap.data() } as BookingRequest
            if (bookingData.lessonId) return // đã xử lý ở lần khác
            if (bookingData.status !== 'confirmed' && bookingData.status !== 'pending') throw new Error('BOOKING_NOT_HOLDING')

            const lessonData = lSnap.data() as Lesson
            if (
              lessonData.status !== 'approved'
              || lessonData.studentId !== bookingData.studentId
              || lessonData.teacherId !== bookingData.teacherId
              || lessonData.date !== bookingData.requestedDate
            ) {
              throw new Error('LESSON_MISMATCH')
            }

            const storedLessonBookingIds = Array.from(new Set([
              lessonData.bookingRequestId,
              ...(lessonData.bookingRequestIds || []),
            ].filter((id): id is string => Boolean(id))))
            const hasExplicitReference = storedLessonBookingIds.includes(bookingData.id)
              || lessonData.scheduleCheck?.bookingId === bookingData.id

            if (it.matchKind === 'explicit' && !hasExplicitReference) throw new Error('LINK_CHANGED')
            if (it.matchKind === 'unique') {
              if (
                storedLessonBookingIds.length > 0
                || lessonData.scheduleCheck?.bookingId
                || lessonData.bookingHoldConsumed === true
                || Number(lessonData.minutes) !== Number(bookingData.requestedMinutes)
              ) {
                throw new Error('LINK_NO_LONGER_UNIQUE')
              }
            }

            // Nếu buổi đã ghi nhận chính ca này và hold đã được nhả thì không nhả lần hai.
            const holdAlreadyConsumedForThisBooking = hasExplicitReference && lessonData.bookingHoldConsumed === true
            const holdToRelease = holdAlreadyConsumedForThisBooking ? 0 : bookingHoldPoints(bookingData)
            if (holdToRelease > 0 && sSnap.exists()) {
              const sd = sSnap.data() as Student
              const cur = sd.reservedMinutes ?? sd.heldMinutes ?? 0
              const next = Math.max(0, cur - holdToRelease)
              tx.update(sRef, { reservedMinutes: next, heldMinutes: next, updatedAt: serverTimestamp() })
            }
            const mergedBookingIds = Array.from(new Set([...storedLessonBookingIds, bookingData.id]))
            tx.update(bRef, {
              lessonId: lesson.id,
              status: 'completed',
              completedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
            tx.update(lRef, {
              bookingRequestId: lessonData.bookingRequestId || bookingData.id,
              bookingRequestIds: mergedBookingIds,
              bookingHoldConsumed: true,
              updatedAt: serverTimestamp(),
            })
            tx.set(doc(collection(db, 'adminLogs')), {
              adminId: user?.uid ?? 'admin',
              action: 'RESOLVE_OVERDUE_BOOKINGS_LINK',
              targetType: 'booking',
              targetId: it.booking.id,
              changes: {
                studentName: it.booking.studentName || '',
                lessonId: lesson.id,
                lessonDate: lesson.date,
                matchKind: it.matchKind,
                releasedHoldPoints: holdToRelease,
              },
              createdAt: serverTimestamp(),
            })
          })
          ok++
        } catch (e) {
          console.error('link lesson failed', it.booking.id, e)
          failed++
        }
        setProgress({ done: ok + failed, total: targets.length })
      }
      if (failed === 0) toast.success(`Đã gắn ${ok} ca vào buổi dạy tương ứng.`)
      else toast.warning(`Đã gắn ${ok} ca; ${failed} ca đã dừng vì dữ liệu thay đổi hoặc không còn khớp.`)
      setSelectedIds([])
    } finally {
      setProcessing(false)
      setProgress(null)
    }
  }

  const exportCSV = () => {
    const rows = [
      ['Ngày học', 'Giờ', 'Số ngày quá hạn', 'Mã HV', 'Học viên', 'Gia sư', 'Môn', 'Phút', 'Chẩn đoán', 'Gia sư có dạy hôm đó', 'Mã buổi dạy khớp'],
      ...filtered.map((d) => [
        d.booking.requestedDate || '',
        `${d.booking.requestedStart || ''}-${d.booking.requestedEnd || ''}`,
        String(d.daysOverdue),
        d.booking.studentCode || '',
        d.booking.studentName || '',
        teacherNicks[d.booking.teacherId] || d.booking.teacherName || '',
        d.booking.subjectName || '',
        String(d.booking.requestedMinutes || 0),
        DIAGNOSIS_META[d.diagnosis].short,
        d.teacherWorkedThatDay ? 'Có' : 'Không',
        d.matchedLesson?.id || '',
      ]),
    ]
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `ca-hoc-qua-han-${todayISO}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <LoadingSpinner />

  const selectedReleasable = selectedItems.filter((d) =>
    d.diagnosis === 'no_lesson' || d.diagnosis === 'rejected_lesson',
  )
  const selectedLinkable = selectedItems.filter((d) => d.canLink)

  return (
    <div className="space-y-5 pt-2 lg:pt-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg" aria-label="Quay lại">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Rà soát ca học quá hạn</h1>
          <p className="text-sm text-slate-500">Đối chiếu đúng giáo viên và buổi dạy trước khi nhả phần giữ chỗ</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><p className="text-xs font-semibold text-slate-500 uppercase">Ca quá hạn</p><p className="text-2xl font-bold text-slate-900 mt-1">{diagnosed.length}</p></Card>
        <Card><p className="text-xs font-semibold text-slate-500 uppercase">Kim cương đang treo</p><p className="text-2xl font-bold text-amber-600 mt-1">{diagnosed.reduce((s, d) => s + getBookingPoints(d.booking), 0).toLocaleString('vi-VN')}</p></Card>
        <Card><p className="text-xs font-semibold text-slate-500 uppercase">Học viên</p><p className="text-2xl font-bold text-sky-600 mt-1">{new Set(diagnosed.map((d) => d.booking.studentId)).size}</p></Card>
        <Card><p className="text-xs font-semibold text-slate-500 uppercase">Gia sư</p><p className="text-2xl font-bold text-violet-600 mt-1">{new Set(diagnosed.map((d) => d.booking.teacherId)).size}</p></Card>
      </div>

      {lessonsLoading && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
          Đang đối chiếu với dữ liệu buổi dạy để chẩn đoán nguyên nhân...
        </div>
      )}

      {/* Phân loại nguyên nhân */}
      <Card>
        <p className="text-sm font-bold text-slate-800 mb-3">Phân loại theo nguyên nhân, bấm để lọc</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {(Object.keys(DIAGNOSIS_META) as OverdueDiagnosis[]).map((key) => {
            const meta = DIAGNOSIS_META[key]
            const Icon = meta.icon
            const active = diagnosisFilter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDiagnosisFilter(active ? 'all' : key)}
                className={`text-left rounded-xl border-2 p-3.5 transition-all ${active ? 'border-indigo-500 bg-indigo-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.badge} border`}>
                    <Icon className="w-4.5 h-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-slate-900">{counts[key]}</span>
                      <span className="text-sm font-bold text-slate-700">{meta.label}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{meta.desc}</p>
                    <p className="text-xs text-slate-700 mt-1.5 font-semibold leading-relaxed">Cách xử lý: {meta.advice}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        {diagnosisFilter !== 'all' && (
          <button type="button" onClick={() => setDiagnosisFilter('all')} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">
            Bỏ lọc nguyên nhân
          </button>
        )}
      </Card>

      {/* Bộ lọc */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <div className="md:col-span-2 xl:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tìm kiếm</label>
            <div className="relative">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tên/mã học viên, gia sư, môn học..."
                className="h-10 w-full pl-9 pr-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Học viên</label>
            <select value={studentFilter} onChange={(e) => handleStudentFilter(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-indigo-500">
              <option value="all">Tất cả học viên</option>
              {studentOptions.map((student) => <option key={student.id} value={student.id}>[{student.code}] {student.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Gia sư</label>
            <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-indigo-500">
              <option value="all">Tất cả gia sư</option>
              {teacherOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:col-span-2">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Từ ngày</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-2 text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Đến ngày</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-2 text-sm outline-none focus:border-indigo-500" />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-sm text-slate-600">
            Đang hiện <span className="font-bold text-slate-900">{filtered.length}</span> ca ·{' '}
            <span className="font-bold text-amber-600">{filteredPoints.toLocaleString('vi-VN')} kim cương</span>
          </p>
          <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="w-4 h-4 mr-2" />Xuất CSV
          </Button>
        </div>
      </Card>

      {/* Thanh hành động hàng loạt */}
      {selectedIds.length > 0 && (
        <div className="sticky top-16 z-20 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-bold text-indigo-900">
              Đã chọn {selectedIds.length} ca
              {selectedItems.length > selectedReleasable.length + selectedLinkable.length && (
                <span className="ml-2 font-semibold text-amber-700">
                  ({selectedItems.length - selectedReleasable.length - selectedLinkable.length} ca cần kiểm tra riêng, không xử lý hàng loạt)
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedLinkable.length > 0 && (
                <Button onClick={() => linkToLesson(selectedItems)} loading={processing} className="bg-sky-600 hover:bg-sky-700 text-white">
                  <Link2 className="w-4 h-4 mr-2" />Gắn buổi dạy ({selectedLinkable.length})
                </Button>
              )}
              <Button
                onClick={() => setConfirmRelease(selectedReleasable)}
                loading={processing}
                disabled={selectedReleasable.length === 0}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                <RotateCcw className="w-4 h-4 mr-2" />Hoàn kim cương ({selectedReleasable.length})
              </Button>
              <button type="button" onClick={() => setSelectedIds([])} className="px-3 text-sm font-semibold text-slate-600 hover:text-slate-900">
                Bỏ chọn
              </button>
            </div>
          </div>
          {progress && (
            <div className="mt-3">
              <p className="text-xs font-bold text-indigo-900">Đang xử lý {progress.done}/{progress.total}, vui lòng không đóng trang...</p>
              <div className="mt-1.5 h-2 w-full max-w-md overflow-hidden rounded-full bg-indigo-200">
                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bảng */}
      <Card padding="none">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="mt-3 font-semibold text-slate-700">Không có ca học quá hạn nào khớp bộ lọc</p>
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
                      onChange={() => setSelectedIds(allFilteredSelected ? [] : filtered.map((d) => d.booking.id))}
                      className="h-4 w-4 accent-indigo-600"
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  {['Ngày học', 'Học viên', 'Gia sư', 'Môn', 'Chẩn đoán', 'Hành động'].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((d) => {
                  const meta = DIAGNOSIS_META[d.diagnosis]
                  const student = studentMap[d.booking.studentId]
                  const held = student ? (student.reservedMinutes ?? student.heldMinutes ?? 0) : 0
                  const remaining = student?.remainingMinutes ?? 0
                  return (
                    <tr key={d.booking.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(d.booking.id)}
                          onChange={() => setSelectedIds((prev) => prev.includes(d.booking.id) ? prev.filter((x) => x !== d.booking.id) : [...prev, d.booking.id])}
                          className="h-4 w-4 accent-indigo-600"
                          aria-label={`Chọn ca ${d.booking.requestedDate}`}
                        />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className="font-semibold text-slate-800">{d.booking.requestedDate}</p>
                        <p className="text-xs text-slate-500">{d.booking.requestedStart}-{d.booking.requestedEnd} · {d.booking.requestedMinutes}p</p>
                        <p className="text-[11px] font-bold text-rose-500 mt-0.5">Quá {d.daysOverdue} ngày</p>
                      </td>
                      <td className="px-3 py-3">
                        <Link to={`/admin/students/${d.booking.studentId}`} className="font-semibold text-indigo-600 hover:underline">
                          {d.booking.studentName}
                        </Link>
                        <p className="text-xs font-mono text-slate-500">{d.booking.studentCode}</p>
                        {student && (
                          <p className="text-[11px] text-slate-500 mt-0.5">Quỹ: {remaining}p · đang giữ {held}p</p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Link to={`/admin/teachers/${d.booking.teacherId}`} className="font-medium text-slate-700 hover:text-indigo-600 hover:underline">
                          {teacherNicks[d.booking.teacherId] || d.booking.teacherName || 'Chưa rõ'}
                        </Link>
                        <p className={`text-[11px] mt-0.5 font-semibold ${d.teacherWorkedThatDay ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {d.teacherWorkedThatDay ? 'Có dạy HV khác hôm đó' : 'Không dạy ai hôm đó'}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{d.booking.subjectName || 'Chưa rõ'}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-bold ${meta.badge}`}>
                          <meta.icon className="w-3.5 h-3.5" />{meta.short}
                        </span>
                        {d.matchedLesson && (
                          <p className="text-[11px] text-slate-500 mt-1">
                            Buổi dạy: {d.matchedLesson.minutes}p · {d.matchedLesson.attendanceStatus === 'present' ? 'Có mặt' : d.matchedLesson.attendanceStatus === 'with_permission' ? 'Vắng có phép' : d.matchedLesson.attendanceStatus === 'without_permission' ? 'Vắng KP' : 'Chưa rõ'}
                          </p>
                        )}
                        {d.diagnosis === 'other_teacher_lesson' && d.relatedLessons.length > 0 && (
                          <p className="text-[11px] text-violet-700 mt-1 font-semibold">
                            Buổi cùng ngày: {Array.from(new Set(d.relatedLessons.map((lesson) => lesson.teacherName || lesson.teacherCode || 'Giáo viên khác'))).join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {d.diagnosis === 'pending_lesson' ? (
                            <Link to="/admin/approvals" className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100">
                              <ExternalLink className="w-3 h-3" />Đi duyệt
                            </Link>
                          ) : d.canLink ? (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() => linkToLesson([d])}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                            >
                              <Link2 className="w-3 h-3" />Gắn buổi dạy
                            </button>
                          ) : null}
                          {d.diagnosis !== 'pending_lesson' && d.diagnosis !== 'conflicting_link' && (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() => setConfirmRelease([d])}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                            >
                              <RotateCcw className="w-3 h-3" />Hoàn kim cương
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600">
        <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <p>
          <span className="font-bold text-slate-800">Lưu ý về tiền/quỹ:</span> khi đặt lịch hệ thống chỉ <span className="font-semibold">GIỮ CHỖ</span> chứ chưa trừ quỹ.
          Vì vậy "Hoàn kim cương" chỉ nhả phần giữ chỗ đang treo, <span className="font-semibold">không cộng khống</span> buổi cho học viên.
          Buổi học chỉ thực sự bị trừ khi admin duyệt báo cáo của gia sư. Mọi thao tác đều được ghi vào Nhật ký admin.
        </p>
      </div>

      <ConfirmDialog
        open={!!confirmRelease}
        onClose={() => { if (!processing) setConfirmRelease(null) }}
        onConfirm={() => { if (confirmRelease) releaseHolds(confirmRelease) }}
        title={`Hoàn kim cương giữ chỗ cho ${confirmRelease?.length ?? 0} ca học?`}
        description={
          confirmRelease && confirmRelease.length === 1
            ? `Ca ngày ${confirmRelease[0].booking.requestedDate} của học viên ${confirmRelease[0].booking.studentName}. Chẩn đoán: ${DIAGNOSIS_META[confirmRelease[0].diagnosis].short}.`
            : `${confirmRelease?.length ?? 0} ca sẽ được huỷ giữ chỗ và hoàn ${(confirmRelease ?? []).reduce((s, d) => s + getBookingPoints(d.booking), 0).toLocaleString('vi-VN')} kim cương về quỹ khả dụng của các học viên tương ứng.`
        }
        consequence="Chỉ nhả phần giữ chỗ, không cộng khống buổi. Ca học sẽ được giải phóng khỏi lịch gia sư và ghi vào nhật ký admin."
        confirmLabel="Xác nhận hoàn kim cương"
        confirmVariant="danger"
        loading={processing}
      />
    </div>
  )
}
