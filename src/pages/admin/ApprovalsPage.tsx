import { useCallback, useEffect, useState } from 'react'
import {
  collection, query, where, onSnapshot, orderBy,
  runTransaction, doc, serverTimestamp, addDoc, collection as col,
  getCountFromServer, limit, getDoc,
} from 'firebase/firestore'
import { db, calculateSalary } from '@/lib/firebase'
import { Lesson, Student, StudentSubject } from '@/types'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { formatVND, formatMoney, formatPricePerMinute } from '@/lib/constants'
import { ClipboardCheck, Image as ImageIcon, X, Search, AlertTriangle } from 'lucide-react'

const TABS = [
  { key: 'pending', label: 'Chờ duyệt', color: 'text-amber-400' },
  { key: 'approved', label: 'Đã duyệt', color: 'text-emerald-400' },
  { key: 'rejected', label: 'Từ chối', color: 'text-rose-400' },
  { key: 'all', label: 'Tất cả', color: 'text-slate-600' },
]

export function ApprovalsPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<string>('pending')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [approvingLesson, setApprovingLesson] = useState<Lesson | null>(null)
  const [rejectingLesson, setRejectingLesson] = useState<Lesson | null>(null)
  const [search, setSearch] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [viewImages, setViewImages] = useState<string[] | null>(null)
  // Independent counters so badges reflect real DB state, not just current tab's loaded set
  const [totalCounts, setTotalCounts] = useState({ pending: 0, approved: 0, rejected: 0 })
  const [limitVal, setLimitVal] = useState(30)
  const [studentBalances, setStudentBalances] = useState<Record<string, { available: number; remaining: number }>>({})

  const [approveSubjectId, setApproveSubjectId] = useState<string>('')
  const [approveStudentSubjects, setApproveStudentSubjects] = useState<StudentSubject[]>([])

  const openApproveModal = async (lesson: Lesson) => {
    setApprovingLesson(lesson)
    setApproveSubjectId(lesson.subjectId || '')
    setApproveStudentSubjects([])
    try {
      const studentSnap = await getDoc(doc(db, 'students', lesson.studentId))
      if (studentSnap.exists()) {
        const s = studentSnap.data() as Student
        const subjects = s.subjects && s.subjects.length > 0
          ? s.subjects
          : s.subjectId
            ? [{
                subjectId: s.subjectId,
                subjectName: s.subjectName || 'Chưa rõ',
                totalSessions: s.totalSessions || 0,
                usedSessions: s.usedSessions || 0,
                remainingSessions: s.remainingSessions || 0,
                minutesPerSession: s.minutesPerSession || 50,
                totalMinutes: s.totalMinutes ?? (s.totalSessions * (s.minutesPerSession || 50)),
                usedMinutes: s.usedMinutes ?? ((s.usedSessions || 0) * (s.minutesPerSession || 50)),
                remainingMinutes: s.remainingMinutes ?? ((s.remainingSessions || 0) * (s.minutesPerSession || 50)),
                pricePerMinute: 0,
              }]
            : []

        const resolvedSubjects = await Promise.all(subjects.map(async (sub) => {
          const subjSnap = await getDoc(doc(db, 'subjects', sub.subjectId))
          const data = subjSnap.exists() ? subjSnap.data() : null
          return {
            ...sub,
            pricePerMinute: data?.pricePerMinute ?? sub.pricePerMinute ?? 0,
            pricePerMinuteVN: data?.pricePerMinuteVN ?? sub.pricePerMinuteVN ?? data?.pricePerMinute ?? sub.pricePerMinute ?? 0,
            pricePerMinutePH: data?.pricePerMinutePH ?? sub.pricePerMinutePH ?? data?.pricePerMinute ?? sub.pricePerMinute ?? 0,
            pricePerMinuteNative: data?.pricePerMinuteNative ?? sub.pricePerMinuteNative ?? data?.pricePerMinute ?? sub.pricePerMinute ?? 0,
          }
        }))

        setApproveStudentSubjects(resolvedSubjects)
        
        const hasLessonSub = resolvedSubjects.some(sub => sub.subjectId === lesson.subjectId)
        if (hasLessonSub) {
          setApproveSubjectId(lesson.subjectId)
        } else {
          const firstWithBalance = resolvedSubjects.find(sub => sub.remainingMinutes > 0)
          setApproveSubjectId(firstWithBalance?.subjectId || resolvedSubjects[0]?.subjectId || '')
        }
      }
    } catch (err) {
      console.error('Error fetching student packages:', err)
    }
  }

  useEffect(() => {
    setLimitVal(30)
  }, [tab])

  const fetchCounts = async () => {
    try {
      const [approvedSnap, rejectedSnap] = await Promise.all([
        getCountFromServer(query(collection(db, 'lessons'), where('status', '==', 'approved'))),
        getCountFromServer(query(collection(db, 'lessons'), where('status', '==', 'rejected'))),
      ])
      setTotalCounts((prev) => ({
        ...prev,
        approved: approvedSnap.data().count,
        rejected: rejectedSnap.data().count,
      }))
    } catch (err) {
      console.error('[fetch-historical-counts]', err)
    }
  }

  useEffect(() => {
    setLoading(true)
    const constraints =
      tab === 'all'
        ? [orderBy('date', 'desc'), limit(limitVal)]
        : tab === 'pending'
        ? [where('status', '==', 'pending')]
        : [where('status', '==', tab), orderBy('date', 'desc'), limit(limitVal)]

    const q = query(collection(db, 'lessons'), ...constraints)
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
      docs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
      setLessons(docs)
      setLoading(false)
    })
  }, [tab, limitVal])
  // Fetch counters on-demand (1 read per query) instead of subscribing to full docs.
  // Refresh after approve/reject so badges stay accurate without hammering Firestore.
  const refreshCounts = useCallback(async () => {
    try {
      const [pSnap, aSnap, rSnap] = await Promise.all([
        getCountFromServer(query(collection(db, 'lessons'), where('status', '==', 'pending'))),
        getCountFromServer(query(collection(db, 'lessons'), where('status', '==', 'approved'))),
        getCountFromServer(query(collection(db, 'lessons'), where('status', '==', 'rejected'))),
      ])
      setTotalCounts({
        pending: pSnap.data().count,
        approved: aSnap.data().count,
        rejected: rSnap.data().count,
      })
    } catch (err) {
      console.error('[approvals-counts]', err)
    }
  }, [])

  useEffect(() => {
    refreshCounts()
  }, [refreshCounts])

  useEffect(() => {
    const pendingStudentIds = Array.from(new Set(lessons.filter(l => l.status === 'pending').map(l => l.studentId)))
    if (pendingStudentIds.length === 0) return

    Promise.all(pendingStudentIds.map(sid => getDoc(doc(db, 'students', sid)))).then(snaps => {
      const nextBalances: Record<string, { available: number; remaining: number }> = {}
      snaps.forEach(snap => {
        if (snap.exists()) {
          const s = snap.data() as Student
          const mps = s.minutesPerSession || 50
          const total = s.totalMinutes ?? s.totalSessions * mps
          const used = s.usedMinutes ?? s.usedSessions * mps
          const remaining = s.remainingMinutes ?? Math.max(0, total - used)
          const held = s.reservedMinutes ?? s.heldMinutes ?? 0
          const available = Math.max(0, remaining - held)
          nextBalances[snap.id] = { available, remaining }
        }
      })
      setStudentBalances(prev => ({ ...prev, ...nextBalances }))
    }).catch(err => {
      console.error('Error loading student balances for approvals:', err)
    })
  }, [lessons])

  const filteredLessons = lessons.filter(l =>
    l.studentName.toLowerCase().includes(search.toLowerCase()) ||
    l.teacherName.toLowerCase().includes(search.toLowerCase())
  )

  const pendingCount = totalCounts.pending

  const handleApprove = async () => {
    if (!approvingLesson || !approveSubjectId) return
    setApproving(true)
    try {
      const chosenSubjectPkg = approveStudentSubjects.find(s => s.subjectId === approveSubjectId)
      if (!chosenSubjectPkg) {
        toast.error('Môn học được chọn không hợp lệ')
        return
      }

      await runTransaction(
        db,
        async (tx) => {
          const lessonRef = doc(db, 'lessons', approvingLesson.id)
          const studentRef = doc(db, 'students', approvingLesson.studentId)

          const [lessonSnap, studentSnap] = await Promise.all([
            tx.get(lessonRef),
            tx.get(studentRef),
          ])

          if (!lessonSnap.exists()) throw new Error('LESSON_NOT_FOUND')
          if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

          const lessonNow = lessonSnap.data() as any
          if (lessonNow.status !== 'pending') throw new Error('LESSON_ALREADY_PROCESSED')

          const studentData = studentSnap.data() as Student

          const teacherSnap = await tx.get(doc(db, 'teachers', approvingLesson.teacherId))
          const teacherData = teacherSnap.data()
          const teacherLevel = (approvingLesson.teacherLevel ?? teacherData?.level ?? 1) || 1

          const teacherCountry = teacherData?.country || 'VN'
          let pricePerMinute = chosenSubjectPkg.pricePerMinute || 0
          if (chosenSubjectPkg.otherCountriesPrices && chosenSubjectPkg.otherCountriesPrices[teacherCountry] !== undefined) {
            pricePerMinute = chosenSubjectPkg.otherCountriesPrices[teacherCountry]
          } else if (teacherCountry === 'VN') {
            pricePerMinute = chosenSubjectPkg.pricePerMinuteVN || chosenSubjectPkg.pricePerMinute || 0
          } else if (teacherCountry === 'PH') {
            pricePerMinute = chosenSubjectPkg.pricePerMinutePH || chosenSubjectPkg.pricePerMinute || 0
          } else {
            pricePerMinute = chosenSubjectPkg.pricePerMinuteNative || chosenSubjectPkg.pricePerMinute || 0
          }

          const currency = chosenSubjectPkg.currency || 'VND'
          const lessonMinutes = Number(approvingLesson.minutes) || 0
          const salary = calculateSalary(lessonMinutes, pricePerMinute, teacherLevel, currency)
          const month = (approvingLesson.date || '').slice(0, 7)

          // Initialize subjects array for backward compatibility if needed
          let updatedSubjects = studentData.subjects && studentData.subjects.length > 0
            ? [...studentData.subjects]
            : studentData.subjectId
              ? [{
                  subjectId: studentData.subjectId,
                  subjectName: studentData.subjectName || 'Chưa rõ',
                  totalSessions: studentData.totalSessions || 0,
                  usedSessions: studentData.usedSessions || 0,
                  remainingSessions: studentData.remainingSessions || 0,
                  minutesPerSession: studentData.minutesPerSession || 50,
                  totalMinutes: studentData.totalMinutes ?? (studentData.totalSessions * (studentData.minutesPerSession || 50)),
                  usedMinutes: studentData.usedMinutes ?? ((studentData.usedSessions || 0) * (studentData.minutesPerSession || 50)),
                  remainingMinutes: studentData.remainingMinutes ?? ((studentData.remainingSessions || 0) * (studentData.minutesPerSession || 50)),
                  pricePerMinute: pricePerMinute,
                  pricePerMinuteVN: chosenSubjectPkg.pricePerMinuteVN || pricePerMinute,
                  pricePerMinutePH: chosenSubjectPkg.pricePerMinutePH || pricePerMinute,
                  pricePerMinuteNative: chosenSubjectPkg.pricePerMinuteNative || pricePerMinute,
                  currency: chosenSubjectPkg.currency || 'VND',
                }]
              : []

          // Deduct from the selected subject package
          const sIdx = updatedSubjects.findIndex(sub => sub.subjectId === approveSubjectId)
          if (sIdx === -1) {
            throw new Error(`Không tìm thấy gói môn học ${chosenSubjectPkg.subjectName}`)
          }

          const subPkg = updatedSubjects[sIdx]
          const newSubUsedMinutes = subPkg.usedMinutes + lessonMinutes
          const newSubRemainingMinutes = subPkg.totalMinutes - newSubUsedMinutes
          const subMps = subPkg.minutesPerSession || 50
          const subUsedSessionsRaw = subMps > 0 ? newSubUsedMinutes / subMps : 0
          const newSubUsedSessions = Math.abs(subUsedSessionsRaw - Math.round(subUsedSessionsRaw)) < 0.001
            ? Math.round(subUsedSessionsRaw)
            : Math.round(subUsedSessionsRaw * 100) / 100
          const newSubRemainingSessions = Math.floor(newSubRemainingMinutes / subMps)

          updatedSubjects[sIdx] = {
            ...subPkg,
            usedMinutes: newSubUsedMinutes,
            remainingMinutes: newSubRemainingMinutes,
            usedSessions: newSubUsedSessions,
            remainingSessions: newSubRemainingSessions
          }

          // Recalculate aggregates
          const aggTotalSessions = updatedSubjects.reduce((sum, sub) => sum + sub.totalSessions, 0)
          const aggUsedSessions = updatedSubjects.reduce((sum, sub) => sum + sub.usedSessions, 0)
          const aggRemainingSessions = updatedSubjects.reduce((sum, sub) => sum + sub.remainingSessions, 0)
          const aggTotalMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.totalMinutes, 0)
          const aggUsedMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.usedMinutes, 0)
          const aggRemainingMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.remainingMinutes, 0)

          const primarySubject = updatedSubjects[0] || null

          // Deduct heldMinutes (previously reservedMinutes or heldMinutes)
          const prevHeldMinutes = Number(studentData.reservedMinutes ?? studentData.heldMinutes ?? 0) || 0
          const newHeldMinutes = Math.max(0, prevHeldMinutes - lessonMinutes)

          tx.update(lessonRef, {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: user?.uid ?? '',
            salary,
            teacherLevel,
            pricePerMinute,
            currency,
            subjectId: chosenSubjectPkg.subjectId,
            subjectName: chosenSubjectPkg.subjectName,
            sessionsBeforeApproval: subPkg.remainingSessions,
            sessionsAfterApproval: newSubRemainingSessions,
            minutesBeforeApproval: subPkg.remainingMinutes,
            minutesAfterApproval: newSubRemainingMinutes,
          })

          tx.update(studentRef, {
            subjects: updatedSubjects,
            totalSessions: aggTotalSessions,
            usedSessions: aggUsedSessions,
            remainingSessions: aggRemainingSessions,
            totalMinutes: aggTotalMinutes,
            usedMinutes: aggUsedMinutes,
            remainingMinutes: aggRemainingMinutes,
            reservedMinutes: newHeldMinutes,
            heldMinutes: newHeldMinutes,
            // Legacy compatibility
            subjectId: primarySubject ? primarySubject.subjectId : '',
            subjectName: primarySubject ? primarySubject.subjectName : '',
            minutesPerSession: primarySubject ? primarySubject.minutesPerSession : 50,
            status: aggRemainingMinutes <= 0 ? 'expired' : 'active',
            updatedAt: serverTimestamp(),
          })

          const currentMins = Number(teacherData?.totalApprovedMinutes) || 0
          tx.update(doc(db, 'teachers', approvingLesson.teacherId), {
            totalApprovedMinutes: currentMins + lessonMinutes
          })

          const publicLessonRef = doc(db, 'publicLessons', approvingLesson.id)
          tx.set(publicLessonRef, {
            id: approvingLesson.id,
            studentId: approvingLesson.studentId,
            studentCode: approvingLesson.studentCode,
            studentName: approvingLesson.studentName,
            teacherId: approvingLesson.teacherId,
            teacherCode: approvingLesson.teacherCode ?? '',
            teacherName: approvingLesson.teacherName ?? '',
            subjectId: chosenSubjectPkg.subjectId,
            subjectName: chosenSubjectPkg.subjectName,
            date: approvingLesson.date,
            minutes: lessonMinutes,
            comment: approvingLesson.comment || '',
            homework: approvingLesson.homework || '',
            book: approvingLesson.book || '',
            imageURLs: approvingLesson.imageURLs || [],
            status: 'approved',
            createdAt: approvingLesson.createdAt || serverTimestamp(),
            approvedAt: serverTimestamp(),
          })

          const payrollRef = doc(col(db, 'payroll'))
          tx.set(payrollRef, {
            teacherId: approvingLesson.teacherId,
            teacherName: approvingLesson.teacherName ?? '',
            lessonId: approvingLesson.id,
            amount: salary,
            minutes: lessonMinutes,
            pricePerMinute,
            level: teacherLevel,
            month,
            paid: false,
            createdAt: serverTimestamp(),
          })

          const logRef = doc(col(db, 'adminLogs'))
          tx.set(logRef, {
            adminId: user?.uid ?? '',
            action: 'APPROVE_LESSON',
            targetType: 'lesson',
            targetId: approvingLesson.id,
            changes: {
              studentId: approvingLesson.studentId,
              studentName: approvingLesson.studentName,
              teacherId: approvingLesson.teacherId,
              teacherName: approvingLesson.teacherName,
              subjectId: chosenSubjectPkg.subjectId,
              subjectName: chosenSubjectPkg.subjectName,
              lessonDate: approvingLesson.date,
              lessonMinutes,
              salary,
              pricePerMinute,
              teacherLevel,
            },
            createdAt: serverTimestamp(),
          })
        },
        { maxAttempts: 3 },
      )

      toast.success(`Đã duyệt buổi học môn ${chosenSubjectPkg.subjectName} thành công`)
      setApprovingLesson(null)
      refreshCounts()
    } catch (err: any) {
      console.error('[approve-lesson]', err)
      const code = err?.code || ''
      const message = err?.message || ''
      if (message === 'LESSON_NOT_FOUND') {
        toast.error('Buổi dạy không tồn tại, có thể đã bị xóa')
      } else if (message === 'STUDENT_NOT_FOUND') {
        toast.error('Học viên không tồn tại')
      } else if (message === 'LESSON_ALREADY_PROCESSED') {
        toast.warning('Buổi dạy đã được xử lý trước đó')
        setApprovingLesson(null)
      } else if (code === 'permission-denied') {
        toast.error('Bạn không có quyền duyệt buổi dạy này')
      } else if (code === 'resource-exhausted' || code === 'unavailable') {
        toast.error('Hệ thống đang bận, vui lòng thử lại sau ít giây')
      } else {
        toast.error(`Duyệt thất bại: ${code || message || 'lỗi không xác định'}`)
      }
    } finally {
      setApproving(false)
      fetchCounts()
    }
  }

  const handleReject = async () => {
    if (!rejectingLesson || !rejectReason.trim()) {
      toast.warning('Vui lòng nhập lý do từ chối')
      return
    }
    setRejecting(true)
    try {
      const lessonRef = doc(db, 'lessons', rejectingLesson.id)
      const { updateDoc } = await import('firebase/firestore')
      await updateDoc(lessonRef, {
        status: 'rejected',
        rejectedReason: rejectReason,
        updatedAt: serverTimestamp(),
      })
      toast.success('Đã từ chối buổi dạy')
      setRejectingLesson(null)
      setRejectReason('')
      refreshCounts()
    } catch {
      toast.error('Có lỗi xảy ra')
    } finally {
      setRejecting(false)
      fetchCounts()
    }
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      {/* Gradient header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <h1 className="text-2xl font-bold relative z-10">Duyệt buổi dạy</h1>
        <p className="text-sm text-indigo-100 mt-1 relative z-10">
          {tab === 'pending' && pendingCount > 0 ? `${pendingCount} buổi đang chờ duyệt` : 'Quản lý và duyệt buổi dạy'}
        </p>
        {/* Quick stats */}
        <div className="flex gap-3 mt-4 relative z-10 flex-wrap">
          <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs font-semibold">
            ⏳ Chờ duyệt: <span className="text-amber-200">{totalCounts.pending}</span>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs font-semibold">
            ✅ Đã duyệt: <span className="text-emerald-200">{totalCounts.approved}</span>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs font-semibold">
            ❌ Từ chối: <span className="text-rose-200">{totalCounts.rejected}</span>
          </div>
        </div>
      </div>

      {/* Tabs and Search */}
      <Card className="border-slate-200/80 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  tab === t.key
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {t.label}
                {t.key === 'pending' && pendingCount > 0 && (
                  <span className="ml-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm học viên / giáo viên..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingSpinner />
      ) : lessons.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="w-8 h-8" />}
          title="Không có buổi dạy nào"
          description={tab === 'pending' ? 'Tất cả buổi dạy đã được duyệt' : 'Chưa có dữ liệu'}
        />
      ) : (
        <div className="space-y-4">
          {filteredLessons.map((lesson) => {
            const balance = studentBalances[lesson.studentId]
            const isOutOfMinutes = balance && balance.remaining <= 0
            return (
              <Card key={lesson.id} className="relative">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-700">{lesson.date}</span>
                      <StatusBadge status={lesson.status} />
                    </div>

                    {isOutOfMinutes && lesson.status === 'pending' && (
                      <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 animate-pulse mb-2">
                        <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                        <span>CẢNH BÁO: Học viên này đã HẾT QUỸ PHÚT HỌC! (Quỹ còn lại: 0 phút)</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                      <div>
                      <p className="text-xs text-slate-500 mb-0.5">Học viên</p>
                      <p className="text-slate-700 font-medium">{lesson.studentName}</p>
                      <p className="text-xs text-indigo-400 font-mono">{lesson.studentCode}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Giáo viên</p>
                      <p className="text-slate-700">{lesson.teacherName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Môn học</p>
                      <p className="text-slate-700">{lesson.subjectName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Sách học</p>
                      <p className="text-[#3BB8EB] font-bold truncate max-w-[150px]" title={lesson.book || ''}>{lesson.book || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Thời lượng</p>
                      <p className="text-slate-700 font-semibold">{lesson.minutes} phút</p>
                    </div>
                  </div>

                  {lesson.comment && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Nhận xét</p>
                      <p className="text-sm text-slate-600 line-clamp-2">{lesson.comment}</p>
                    </div>
                  )}

                  {lesson.homework && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Bài tập</p>
                      <p className="text-sm text-slate-600 line-clamp-1">{lesson.homework}</p>
                    </div>
                  )}

                  {lesson.imageURLs?.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {lesson.imageURLs.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`Ảnh ${i + 1}`}
                          className="w-14 h-14 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity border border-slate-300"
                          onClick={() => setViewImages(lesson.imageURLs)}
                        />
                      ))}
                    </div>
                  )}

                  {lesson.status === 'approved' && (
                    <div className="flex gap-4 text-sm pt-1 border-t border-slate-200 flex-wrap">
                      <span className="text-slate-500">
                        Buổi: {lesson.sessionsBeforeApproval} → {lesson.sessionsAfterApproval}
                      </span>
                      {lesson.minutesBeforeApproval != null && lesson.minutesAfterApproval != null && (
                        <span className="text-slate-500">
                          Phút: {lesson.minutesBeforeApproval} → {lesson.minutesAfterApproval}
                          <span className="text-rose-400 ml-1">(-{lesson.minutes})</span>
                        </span>
                      )}
                      <span className="text-emerald-400 font-semibold">
                        Lương: +{formatVND(lesson.salary || 0)}
                      </span>
                    </div>
                  )}

                  {lesson.status === 'rejected' && lesson.rejectedReason && (
                    <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                      Lý do từ chối: {lesson.rejectedReason}
                    </p>
                  )}
                </div>

                {lesson.status === 'pending' && (
                  <div className="flex gap-2 sm:flex-col sm:items-end flex-shrink-0">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setRejectingLesson(lesson)}
                    >
                      Từ chối
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => openApproveModal(lesson)}
                    >
                      Duyệt buổi dạy
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )})}
          {tab !== 'pending' && lessons.length >= limitVal && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => setLimitVal((prev) => prev + 30)}
                className="w-full bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 py-2.5 rounded-xl font-semibold shadow-sm"
              >
                Xem thêm (+30 buổi)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Approve confirm */}
      {approvingLesson && (
        <ConfirmDialog
          open
          onClose={() => setApprovingLesson(null)}
          onConfirm={handleApprove}
          title="Xác nhận duyệt buổi dạy?"
          confirmLabel="Duyệt buổi dạy"
          loading={approving}
        >
          <div className="bg-white rounded-xl p-4 text-sm space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Học viên</span>
              <span className="text-slate-700 font-semibold">{approvingLesson.studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Thời lượng buổi này</span>
              <span className="text-slate-700 font-medium">{approvingLesson.minutes} phút</span>
            </div>
            
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Chọn môn học áp dụng *</label>
              <select
                value={approveSubjectId}
                onChange={(e) => setApproveSubjectId(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {approveStudentSubjects.length === 0 ? (
                  <option value="">Đang tải các gói môn học...</option>
                ) : (
                  approveStudentSubjects.map((sub) => {
                    const isOutOfSessions = sub.remainingMinutes <= 0 || sub.remainingSessions <= 0
                    return (
                      <option key={sub.subjectId} value={sub.subjectId}>
                        {sub.subjectName} {isOutOfSessions ? '(Hết buổi)' : `(Còn ${sub.remainingSessions}b / ${sub.remainingMinutes}m)`} - {formatPricePerMinute(sub.pricePerMinute ?? 0, sub.currency)}
                      </option>
                    )
                  })
                )}
              </select>
            </div>

            {(() => {
              const chosen = approveStudentSubjects.find(s => s.subjectId === approveSubjectId)
              if (!chosen) return null
              const isOutOfSessions = chosen.remainingMinutes <= 0 || chosen.remainingSessions <= 0
              return (
                <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Số phút môn này còn lại</span>
                    <span className={`font-semibold ${isOutOfSessions ? 'text-rose-500 font-bold' : 'text-slate-700'}`}>
                      {chosen.remainingMinutes} → {chosen.remainingMinutes - approvingLesson.minutes} phút
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Lương giáo viên (tính theo môn chọn)</span>
                    <span className="text-emerald-500 font-semibold">
                      +{formatMoney(
                        calculateSalary(approvingLesson.minutes, chosen.pricePerMinute || 0, approvingLesson.teacherLevel ?? 1, chosen.currency || 'VND'),
                        chosen.currency || 'VND'
                      )}
                    </span>
                  </div>
                </div>
              )
            })()}
          </div>
        </ConfirmDialog>
      )}

      {/* Reject modal */}
      {rejectingLesson && (
        <Modal
          open
          onClose={() => setRejectingLesson(null)}
          title="Từ chối buổi dạy"
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setRejectingLesson(null)}>Hủy</Button>
              <Button variant="danger" onClick={handleReject} loading={rejecting}>Xác nhận từ chối</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Từ chối buổi của <span className="text-slate-700 font-medium">{rejectingLesson.studentName}</span> với{' '}
              <span className="text-slate-700">{rejectingLesson.teacherName}</span>
            </p>
            <Textarea
              label="Lý do từ chối *"
              placeholder="Nhập lý do từ chối..."
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {/* Image viewer */}
      {viewImages && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setViewImages(null)}>
          <button className="absolute top-4 right-4 p-2 text-slate-900 bg-white rounded-xl" onClick={() => setViewImages(null)} aria-label="Đóng">
            <X className="w-6 h-6" />
          </button>
          <div className="flex gap-4 overflow-x-auto max-w-full">
            {viewImages.map((url, i) => (
              <img key={i} src={url} alt="" className="max-h-[80vh] rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
