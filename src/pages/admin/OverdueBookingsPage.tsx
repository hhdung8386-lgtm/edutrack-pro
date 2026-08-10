import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  Hourglass, CheckCircle2, XCircle, HelpCircle, Users,
} from 'lucide-react'
import { getBookingPoints } from '@/lib/points'

/**
 * Chẩn đoán vì sao một ca đã đặt bị quá hạn mà chưa được điểm danh.
 * Suy ra bằng cách đối chiếu với collection `lessons` của cùng học viên trong cùng ngày.
 */
type Diagnosis = 'approved_lesson' | 'pending_lesson' | 'rejected_lesson' | 'no_lesson'

const DIAGNOSIS_META: Record<Diagnosis, {
  label: string
  short: string
  desc: string
  advice: string
  badge: string
  chip: string
  icon: React.ElementType
}> = {
  pending_lesson: {
    label: 'Gia sư đã điểm danh — CHỜ DUYỆT',
    short: 'Chờ duyệt',
    desc: 'Gia sư đã nộp báo cáo buổi dạy cho ngày này nhưng admin chưa duyệt.',
    advice: 'Không hoàn kim cương. Hãy vào trang Duyệt buổi dạy để duyệt; hệ thống sẽ tự trừ kim cương và nhả giữ chỗ đúng quy trình.',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    chip: 'bg-amber-500',
    icon: Hourglass,
  },
  approved_lesson: {
    label: 'Đã dạy & ĐÃ DUYỆT — ca đặt bị đứt liên kết',
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
    label: 'KHÔNG có báo cáo buổi dạy nào',
    short: 'Chưa điểm danh',
    desc: 'Không tìm thấy buổi dạy nào của học viên này trong ngày đó — nhiều khả năng lớp không diễn ra hoặc gia sư quên điểm danh.',
    advice: 'Xác minh với gia sư. Nếu lớp không diễn ra thì hoàn kim cương cho học viên.',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    chip: 'bg-slate-400',
    icon: HelpCircle,
  },
}

type DiagnosedBooking = {
  booking: BookingRequest
  diagnosis: Diagnosis
  matchedLesson: Lesson | null
  daysOverdue: number
  /** Gia sư có điểm danh học viên KHÁC trong cùng ngày không -> gia sư có đi làm hôm đó */
  teacherWorkedThatDay: boolean
}

export function OverdueBookingsPage() {
  const navigate = useNavigate()
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
  const [confirmRelease, setConfirmRelease] = useState<DiagnosedBooking[] | null>(null)

  // Filters
  const [diagnosisFilter, setDiagnosisFilter] = useState<Diagnosis | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
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
      query(collection(db, 'bookingRequests'), where('status', '==', 'confirmed')),
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

  // Nạp các buổi dạy trong đúng khoảng ngày của các ca quá hạn để đối chiếu
  useEffect(() => {
    if (loading) return
    if (overdue.length === 0) { setLessons([]); setLessonsLoading(false); return }
    const dates = overdue.map((b) => b.requestedDate!).sort()
    const minDate = dates[0]
    const maxDate = dates[dates.length - 1]
    setLessonsLoading(true)
    getDocs(query(collection(db, 'lessons'), where('date', '>=', minDate), where('date', '<=', maxDate)))
      .then((snap) => setLessons(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))))
      .catch((err) => { console.error(err); toast.error('Không tải được dữ liệu buổi dạy để đối chiếu') })
      .finally(() => setLessonsLoading(false))
    // Chỉ chạy lại khi khoảng ngày đổi, tránh nạp lại liên tục
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, overdue.length, overdue[0]?.requestedDate])

  // ── Chẩn đoán ───────────────────────────────────────────────────
  const diagnosed = useMemo<DiagnosedBooking[]>(() => {
    const byStudentDate = new Map<string, Lesson[]>()
    const teacherDate = new Set<string>()
    lessons.forEach((l) => {
      const k = `${l.studentId}|${l.date}`
      if (!byStudentDate.has(k)) byStudentDate.set(k, [])
      byStudentDate.get(k)!.push(l)
      // Buổi bị từ chối hoặc gia sư tự huỷ coi như chưa từng điểm danh
      if (l.status !== 'rejected' && l.status !== 'cancelled') teacherDate.add(`${l.teacherId}|${l.date}`)
    })

    return overdue.map((booking) => {
      const candidates = byStudentDate.get(`${booking.studentId}|${booking.requestedDate}`) || []
      // Ưu tiên buổi dạy của đúng gia sư đã đặt
      const sameTeacher = candidates.filter((l) => l.teacherId === booking.teacherId)
      const pool = sameTeacher.length > 0 ? sameTeacher : candidates
      const matchedLesson =
        pool.find((l) => l.status === 'approved') ||
        pool.find((l) => l.status === 'pending') ||
        pool.find((l) => l.status === 'rejected') ||
        null

      const diagnosis: Diagnosis = !matchedLesson
        ? 'no_lesson'
        : matchedLesson.status === 'approved'
          ? 'approved_lesson'
          : matchedLesson.status === 'pending'
            ? 'pending_lesson'
            : 'rejected_lesson'

      const days = Math.max(
        0,
        Math.round((new Date(todayISO).getTime() - new Date(booking.requestedDate!).getTime()) / 86400000)
      )

      return {
        booking,
        diagnosis,
        matchedLesson,
        daysOverdue: days,
        teacherWorkedThatDay: teacherDate.has(`${booking.teacherId}|${booking.requestedDate}`),
      }
    })
  }, [overdue, lessons, todayISO])

  const counts = useMemo(() => {
    const c: Record<Diagnosis, number> = { pending_lesson: 0, approved_lesson: 0, rejected_lesson: 0, no_lesson: 0 }
    diagnosed.forEach((d) => { c[d.diagnosis]++ })
    return c
  }, [diagnosed])

  const teacherOptions = useMemo(() => {
    const ids = new Set(diagnosed.map((d) => d.booking.teacherId).filter(Boolean))
    return Array.from(ids)
      .map((id) => ({ id, name: teacherNicks[id] || id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [diagnosed, teacherNicks])

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return diagnosed
      .filter((d) => {
        if (diagnosisFilter !== 'all' && d.diagnosis !== diagnosisFilter) return false
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
  }, [diagnosed, diagnosisFilter, teacherFilter, fromDate, toDate, searchQuery, teacherNicks])

  const filteredPoints = filtered.reduce((s, d) => s + getBookingPoints(d.booking), 0)
  const selectedItems = filtered.filter((d) => selectedIds.includes(d.booking.id))
  const allFilteredSelected = filtered.length > 0 && filtered.every((d) => selectedIds.includes(d.booking.id))

  // ── Hành động: hoàn phút (nhả giữ chỗ) ──────────────────────────
  const releaseHolds = async (items: DiagnosedBooking[]) => {
    if (items.length === 0) return
    setProcessing(true)
    try {
      const byStudent: Record<string, DiagnosedBooking[]> = {}
      items.forEach((it) => {
        const sid = it.booking.studentId
        if (!sid) return
        if (!byStudent[sid]) byStudent[sid] = []
        byStudent[sid].push(it)
      })
      const entries = Object.entries(byStudent)
      setProgress({ done: 0, total: entries.length })
      let done = 0

      for (const [studentId, list] of entries) {
        const CHUNK = 300
        for (let i = 0; i < list.length; i += CHUNK) {
          const chunk = list.slice(i, i + CHUNK)
          const points = chunk.reduce((s, it) => s + getBookingPoints(it.booking), 0)
          await runTransaction(db, async (tx) => {
            const sRef = doc(db, 'students', studentId)
            const sSnap = await tx.get(sRef)
            if (sSnap.exists()) {
              const sd = sSnap.data() as Student
              const cur = sd.reservedMinutes ?? sd.heldMinutes ?? 0
              const next = Math.max(0, cur - points)
              // Chỉ nhả phần GIỮ CHỖ. Không cộng vào remainingMinutes vì lúc đặt
              // lịch hệ thống chỉ giữ chứ chưa trừ quỹ -> cộng thêm sẽ hoàn khống.
              tx.update(sRef, { reservedMinutes: next, heldMinutes: next, updatedAt: serverTimestamp() })
            }
            chunk.forEach((it) => {
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
                studentName: chunk[0]?.booking.studentName || '',
                count: chunk.length,
                bookingIds: chunk.map((c) => c.booking.id),
                releasedPoints: points,
                diagnoses: chunk.map((c) => c.diagnosis),
              },
              createdAt: serverTimestamp(),
            })
          })
        }
        done++
        setProgress({ done, total: entries.length })
      }

      toast.success(`Đã hoàn kim cương giữ chỗ cho ${items.length} ca học.`)
      setSelectedIds([])
      setConfirmRelease(null)
    } catch (err: any) {
      console.error('release overdue failed', err)
      toast.error(`Lỗi khi hoàn kim cương${err?.message ? `: ${err.message}` : ''}. Phần đã xử lý vẫn được lưu, bấm lại để tiếp tục.`)
    } finally {
      setProcessing(false)
      setProgress(null)
    }
  }

  // ── Hành động: gắn ca đặt vào buổi dạy đã duyệt ─────────────────
  const linkToLesson = async (items: DiagnosedBooking[]) => {
    const targets = items.filter((it) => it.diagnosis === 'approved_lesson' && it.matchedLesson)
    if (targets.length === 0) {
      toast.warning('Không có ca nào thuộc nhóm "Đã dạy (đứt liên kết)" trong lựa chọn')
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
            if ((bSnap.data() as BookingRequest).lessonId) return // đã xử lý ở lần khác

            const lessonData = lSnap.data() as Lesson
            // Nếu lúc duyệt đã nhả giữ chỗ rồi thì không nhả lần nữa.
            const holdToRelease = lessonData.bookingHoldConsumed === true ? 0 : getBookingPoints(it.booking)
            if (holdToRelease > 0 && sSnap.exists()) {
              const sd = sSnap.data() as Student
              const cur = sd.reservedMinutes ?? sd.heldMinutes ?? 0
              const next = Math.max(0, cur - holdToRelease)
              tx.update(sRef, { reservedMinutes: next, heldMinutes: next, updatedAt: serverTimestamp() })
            }
            tx.update(bRef, { lessonId: lesson.id, updatedAt: serverTimestamp() })
            tx.update(lRef, { bookingRequestId: it.booking.id, bookingHoldConsumed: true, updatedAt: serverTimestamp() })
            tx.set(doc(collection(db, 'adminLogs')), {
              adminId: user?.uid ?? 'admin',
              action: 'RESOLVE_OVERDUE_BOOKINGS_LINK',
              targetType: 'booking',
              targetId: it.booking.id,
              changes: {
                studentName: it.booking.studentName || '',
                lessonId: lesson.id,
                lessonDate: lesson.date,
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
      else toast.warning(`Đã gắn ${ok} ca; ${failed} ca lỗi — vui lòng thử lại.`)
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

  const selectedReleasable = selectedItems.filter((d) => d.diagnosis !== 'pending_lesson')
  const selectedLinkable = selectedItems.filter((d) => d.diagnosis === 'approved_lesson')

  return (
    <div className="space-y-5 pt-2 lg:pt-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg" aria-label="Quay lại">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Rà soát ca học quá hạn</h1>
          <p className="text-sm text-slate-500">Xem rõ từng ca đang vướng gì trước khi quyết định hoàn kim cương</p>
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
          Đang đối chiếu với dữ liệu buổi dạy để chẩn đoán nguyên nhân…
        </div>
      )}

      {/* Phân loại nguyên nhân */}
      <Card>
        <p className="text-sm font-bold text-slate-800 mb-3">Phân loại theo nguyên nhân — bấm để lọc</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.keys(DIAGNOSIS_META) as Diagnosis[]).map((key) => {
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
                    <p className="text-xs text-slate-700 mt-1.5 font-semibold leading-relaxed">→ {meta.advice}</p>
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tìm kiếm</label>
            <div className="relative">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tên/mã học viên, gia sư, môn học…"
                className="h-10 w-full pl-9 pr-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Gia sư</label>
            <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-indigo-500">
              <option value="all">Tất cả gia sư</option>
              {teacherOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
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
              {selectedItems.some((d) => d.diagnosis === 'pending_lesson') && (
                <span className="ml-2 font-semibold text-amber-700">
                  ({selectedItems.filter((d) => d.diagnosis === 'pending_lesson').length} ca đang chờ duyệt sẽ được bỏ qua khi hoàn kim cương)
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
              <p className="text-xs font-bold text-indigo-900">Đang xử lý {progress.done}/{progress.total} — vui lòng không đóng trang…</p>
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
                        <p className="text-xs text-slate-500">{d.booking.requestedStart}–{d.booking.requestedEnd} · {d.booking.requestedMinutes}p</p>
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
                          {teacherNicks[d.booking.teacherId] || d.booking.teacherName || '—'}
                        </Link>
                        <p className={`text-[11px] mt-0.5 font-semibold ${d.teacherWorkedThatDay ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {d.teacherWorkedThatDay ? 'Có dạy HV khác hôm đó' : 'Không dạy ai hôm đó'}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{d.booking.subjectName || '—'}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-bold ${meta.badge}`}>
                          <meta.icon className="w-3.5 h-3.5" />{meta.short}
                        </span>
                        {d.matchedLesson && (
                          <p className="text-[11px] text-slate-500 mt-1">
                            Buổi dạy: {d.matchedLesson.minutes}p · {d.matchedLesson.attendanceStatus === 'present' ? 'Có mặt' : d.matchedLesson.attendanceStatus === 'with_permission' ? 'Vắng có phép' : d.matchedLesson.attendanceStatus === 'without_permission' ? 'Vắng KP' : '—'}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {d.diagnosis === 'pending_lesson' ? (
                            <Link to="/admin/approvals" className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100">
                              <ExternalLink className="w-3 h-3" />Đi duyệt
                            </Link>
                          ) : d.diagnosis === 'approved_lesson' ? (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() => linkToLesson([d])}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                            >
                              <Link2 className="w-3 h-3" />Gắn buổi dạy
                            </button>
                          ) : null}
                          {d.diagnosis !== 'pending_lesson' && (
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
            ? `Ca ngày ${confirmRelease[0].booking.requestedDate} của học viên ${confirmRelease[0].booking.studentName} — chẩn đoán: ${DIAGNOSIS_META[confirmRelease[0].diagnosis].short}.`
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
