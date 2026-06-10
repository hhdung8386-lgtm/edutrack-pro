import { useEffect, useState } from 'react'
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, updateDoc, serverTimestamp, addDoc, runTransaction, getDocs } from 'firebase/firestore'
import { db, calculateSalary } from '@/lib/firebase'
import { Student, Lesson } from '@/types'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { StudentFormModal } from '@/components/students/StudentFormModal'
import { AddSessionsModal } from '@/components/students/AddSessionsModal'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ArrowLeft, BookOpen, Copy, ExternalLink, AlertTriangle, RefreshCw, Undo2, RotateCcw, Calculator } from 'lucide-react'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'

export function StudentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [student, setStudent] = useState<Student | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showAddSessions, setShowAddSessions] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [reversingLesson, setReversingLesson] = useState<Lesson | null>(null)
  const [reApprovingLesson, setReApprovingLesson] = useState<Lesson | null>(null)
  const [actioning, setActioning] = useState(false)
  // Live rates per (subjectId, teacherId) for drift detection / recalc
  const [liveRates, setLiveRates] = useState<{
    subjectPrice: Record<string, number>
    teacherLevel: Record<string, number>
    teacherUid: Record<string, string>
  }>({ subjectPrice: {}, teacherLevel: {}, teacherUid: {} })
  const [recalcLesson, setRecalcLesson] = useState<{
    lesson: Lesson
    newPrice: number
    newLevel: number
    newSalary: number
    payrollPaid: boolean
    payrollIds: string[]
  } | null>(null)
  const [recalcOpening, setRecalcOpening] = useState(false)

  useEffect(() => {
    if (!id) return
    // Subscribe to student doc so it updates after reconcile / approval
    const unsubStudent = onSnapshot(doc(db, 'students', id), (snap) => {
      if (snap.exists()) setStudent({ id: snap.id, ...snap.data() } as Student)
      setLoading(false)
    })

    const q = query(
      collection(db, 'lessons'),
      where('studentId', '==', id)
    )
    const unsubLessons = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
      docs.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
      setLessons(docs)
    })
    return () => { unsubStudent(); unsubLessons() }
  }, [id])

  // Load live subject prices & teacher levels referenced by approved lessons
  useEffect(() => {
    if (lessons.length === 0) return
    const subjectIds = Array.from(new Set(lessons.map(l => l.subjectId).filter(Boolean)))
    const teacherIds = Array.from(new Set(lessons.map(l => l.teacherId).filter(Boolean)))
    let cancelled = false
    Promise.all([
      Promise.all(subjectIds.map(sid => getDoc(doc(db, 'subjects', sid)).then(s => [sid, s.data()?.pricePerMinute ?? 0] as const))),
      Promise.all(teacherIds.map(tid => getDoc(doc(db, 'teachers', tid)).then(t => {
        const data = t.data()
        return [tid, data?.level ?? 1, data?.uid ?? ''] as const
      }))),
    ]).then(([subjs, tchrs]) => {
      if (cancelled) return
      const subjectPrice: Record<string, number> = {}
      subjs.forEach(([k, v]) => { subjectPrice[k] = v as number })
      const teacherLevel: Record<string, number> = {}
      const teacherUid: Record<string, string> = {}
      tchrs.forEach(([k, lv, uid]) => { teacherLevel[k] = lv as number; teacherUid[k] = uid as string })
      setLiveRates({ subjectPrice, teacherLevel, teacherUid })
    })
    return () => { cancelled = true }
  }, [lessons.length])

  // Helper: compute current expected salary from live rates
  const expectedSalary = (lesson: Lesson) => {
    const price = liveRates.subjectPrice[lesson.subjectId] ?? lesson.pricePerMinute ?? 0
    const level = liveRates.teacherLevel[lesson.teacherId] ?? lesson.teacherLevel ?? 1
    return { price, level, salary: calculateSalary(lesson.minutes, price, level) }
  }

  // Open recalc dialog after checking payroll paid status
  const openRecalc = async (lesson: Lesson) => {
    setRecalcOpening(true)
    try {
      const { price, level, salary } = expectedSalary(lesson)
      const payrollSnap = await getDocs(
        query(collection(db, 'payroll'), where('lessonId', '==', lesson.id)),
      )
      const docs = payrollSnap.docs.filter(d => !d.data().voided)
      const payrollIds = docs.map(d => d.id)
      const payrollPaid = docs.some(d => d.data().paid === true)
      setRecalcLesson({ lesson, newPrice: price, newLevel: level, newSalary: salary, payrollPaid, payrollIds })
    } catch (err) {
      console.error(err)
      toast.error('Không thể kiểm tra payroll')
    } finally {
      setRecalcOpening(false)
    }
  }

  const handleRecalcSalary = async () => {
    if (!recalcLesson) return
    if (recalcLesson.payrollPaid) {
      toast.warning('Lương buổi này đã thanh toán, không thể tính lại')
      return
    }
    setActioning(true)
    try {
      await runTransaction(db, async (tx) => {
        const lessonRef = doc(db, 'lessons', recalcLesson.lesson.id)
        tx.update(lessonRef, {
          salary: recalcLesson.newSalary,
          pricePerMinute: recalcLesson.newPrice,
          teacherLevel: recalcLesson.newLevel,
          updatedAt: serverTimestamp(),
        })
        for (const pid of recalcLesson.payrollIds) {
          tx.update(doc(db, 'payroll', pid), {
            amount: recalcLesson.newSalary,
            pricePerMinute: recalcLesson.newPrice,
            level: recalcLesson.newLevel,
            recalculatedAt: serverTimestamp(),
            recalculatedBy: user?.uid || '',
          })
        }
      })
      await addDoc(collection(db, 'adminLogs'), {
        adminId: user?.uid || '',
        action: 'RECALC_SALARY',
        targetType: 'lesson',
        targetId: recalcLesson.lesson.id,
        changes: {
          oldSalary: recalcLesson.lesson.salary,
          newSalary: recalcLesson.newSalary,
          oldPrice: recalcLesson.lesson.pricePerMinute,
          newPrice: recalcLesson.newPrice,
          oldLevel: recalcLesson.lesson.teacherLevel,
          newLevel: recalcLesson.newLevel,
          payrollsUpdated: recalcLesson.payrollIds.length,
        },
        createdAt: serverTimestamp(),
      })
      toast.success(`Đã tính lại: ${recalcLesson.lesson.salary?.toLocaleString('vi-VN')}đ → ${recalcLesson.newSalary.toLocaleString('vi-VN')}đ`)
      setRecalcLesson(null)
    } catch (err) {
      console.error(err)
      toast.error('Tính lại lương thất bại')
    } finally {
      setActioning(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (!student) return <p className="text-slate-500 text-center py-20">Không tìm thấy học viên</p>

  const approvedLessons = lessons.filter((l) => l.status === 'approved')
  const pendingLessons = lessons.filter((l) => l.status === 'pending')
  const rejectedLessons = lessons.filter((l) => l.status === 'rejected')

  const sumMinutes = (ls: Lesson[]) => ls.reduce((acc, l) => acc + (l.minutes || 0), 0)
  const approvedMinutes = sumMinutes(approvedLessons)
  const pendingMinutes = sumMinutes(pendingLessons)
  const rejectedMinutes = sumMinutes(rejectedLessons)

  const mps = student.minutesPerSession || 50

  // ─── ACTUAL values (derived from lessons collection — source of truth) ──
  const actualUsedMinutes = approvedMinutes
  const totalMinutesFund = student.totalMinutes ?? student.totalSessions * mps
  const actualRemainingMinutes = totalMinutesFund - actualUsedMinutes
  const actualUsedSessionsRaw = mps > 0 ? actualUsedMinutes / mps : 0
  const actualUsedSessions =
    Math.abs(actualUsedSessionsRaw - Math.round(actualUsedSessionsRaw)) < 0.001
      ? Math.round(actualUsedSessionsRaw)
      : Math.round(actualUsedSessionsRaw * 100) / 100
  const actualRemainingSessions = Math.floor(actualRemainingMinutes / mps)

  // ─── Stored values (from student doc) ──
  const storedUsedMinutes = student.usedMinutes ?? student.usedSessions * mps
  const storedUsedSessions = student.usedSessions

  // ─── Mismatch detection ──
  const isMismatch =
    storedUsedSessions !== actualUsedSessions ||
    storedUsedMinutes !== actualUsedMinutes

  const handleReconcile = async () => {
    if (!student) return
    setReconciling(true)
    try {
      const newStatus = actualRemainingMinutes <= 0 ? 'expired' : 'active'
      await updateDoc(doc(db, 'students', student.id), {
        usedMinutes: actualUsedMinutes,
        remainingMinutes: actualRemainingMinutes,
        totalMinutes: totalMinutesFund,
        minutesPerSession: mps,
        usedSessions: actualUsedSessions,
        remainingSessions: actualRemainingSessions,
        status: newStatus,
        updatedAt: serverTimestamp(),
      })
      await addDoc(collection(db, 'adminLogs'), {
        adminId: user?.uid || '',
        action: 'RECONCILE_STUDENT',
        targetType: 'student',
        targetId: student.id,
        changes: {
          usedSessions: { from: storedUsedSessions, to: actualUsedSessions },
          usedMinutes: { from: storedUsedMinutes, to: actualUsedMinutes },
          remainingMinutes: { from: student.remainingMinutes, to: actualRemainingMinutes },
          basedOnApprovedLessons: approvedLessons.length,
        },
        createdAt: serverTimestamp(),
      })
      toast.success('Đã đồng bộ lại theo dữ liệu buổi học thực tế')
    } catch (err) {
      console.error(err)
      toast.error('Đồng bộ thất bại')
    } finally {
      setReconciling(false)
    }
  }

  // ─── Reverse approval: approved → rejected, restore minutes, void payroll ──
  const handleReverseApproval = async () => {
    if (!reversingLesson || !student) return
    setActioning(true)
    try {
      const payrollSnap = await getDocs(
        query(collection(db, 'payroll'), where('lessonId', '==', reversingLesson.id)),
      )
      const payrollIds = payrollSnap.docs.map((d) => d.id)

      await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', student.id)
        const lessonRef = doc(db, 'lessons', reversingLesson.id)
        const studentSnap = await tx.get(studentRef)
        const s = studentSnap.data()!

        const sMps = s.minutesPerSession || 50
        const sTotal = s.totalMinutes ?? s.totalSessions * sMps
        const sPrevUsed = s.usedMinutes ?? (s.usedSessions || 0) * sMps
        const newUsed = Math.max(0, sPrevUsed - reversingLesson.minutes)
        const newRemaining = sTotal - newUsed
        const newRemainingSessions = Math.floor(newRemaining / sMps)
        const rawSessions = newUsed / sMps
        const newUsedSessions =
          Math.abs(rawSessions - Math.round(rawSessions)) < 0.001
            ? Math.round(rawSessions)
            : Math.round(rawSessions * 100) / 100

        tx.update(lessonRef, {
          status: 'rejected',
          rejectedReason: 'Admin huỷ duyệt sau khi đã duyệt',
          // Clear approval fields so it's clean
          sessionsBeforeApproval: 0,
          sessionsAfterApproval: 0,
          minutesBeforeApproval: 0,
          minutesAfterApproval: 0,
          salary: 0,
          updatedAt: serverTimestamp(),
        })

        tx.update(studentRef, {
          usedMinutes: newUsed,
          remainingMinutes: newRemaining,
          totalMinutes: sTotal,
          minutesPerSession: sMps,
          usedSessions: newUsedSessions,
          remainingSessions: newRemainingSessions,
          status: newRemaining <= 0 ? 'expired' : 'active',
          updatedAt: serverTimestamp(),
        })

        const publicLessonRef = doc(db, 'publicLessons', reversingLesson.id)
        tx.delete(publicLessonRef)

        // Void all payroll entries for this lesson (set amount=0, voided=true)
        for (const pid of payrollIds) {
          tx.update(doc(db, 'payroll', pid), {
            voided: true,
            amount: 0,
            voidedAt: serverTimestamp(),
            voidedBy: user?.uid || '',
          })
        }
      })

      await addDoc(collection(db, 'adminLogs'), {
        adminId: user?.uid || '',
        action: 'REVERSE_APPROVAL',
        targetType: 'lesson',
        targetId: reversingLesson.id,
        changes: {
          lessonDate: reversingLesson.date,
          restoredMinutes: reversingLesson.minutes,
          voidedPayrolls: payrollIds.length,
          voidedSalary: reversingLesson.salary || 0,
        },
        createdAt: serverTimestamp(),
      })

      toast.success(`Đã huỷ duyệt, trả lại ${reversingLesson.minutes} phút cho học viên`)
      setReversingLesson(null)
    } catch (err) {
      console.error(err)
      toast.error('Huỷ duyệt thất bại')
    } finally {
      setActioning(false)
    }
  }

  // ─── Re-approve a rejected lesson: rejected → approved, deduct minutes again ──
  const handleReApprove = async () => {
    if (!reApprovingLesson || !student) return
    setActioning(true)
    try {
      await runTransaction(
        db,
        async (tx) => {
          const studentRef = doc(db, 'students', student.id)
          const lessonRef = doc(db, 'lessons', reApprovingLesson.id)
          const studentSnap = await tx.get(studentRef)
          const s = studentSnap.data()!

          let teacherLevel = reApprovingLesson.teacherLevel
          let pricePerMinute = reApprovingLesson.pricePerMinute
          if (teacherLevel == null || pricePerMinute == null) {
            const [tSnap, subjSnap] = await Promise.all([
              tx.get(doc(db, 'teachers', reApprovingLesson.teacherId)),
              tx.get(doc(db, 'subjects', reApprovingLesson.subjectId)),
            ])
            teacherLevel = teacherLevel ?? tSnap.data()?.level ?? 1
            pricePerMinute = pricePerMinute ?? subjSnap.data()?.pricePerMinute ?? 0
          }

          const salary = calculateSalary(reApprovingLesson.minutes, pricePerMinute as number, teacherLevel as number)
          const month = reApprovingLesson.date.slice(0, 7)

          const sMps = s.minutesPerSession || 50
          const sTotal = s.totalMinutes ?? s.totalSessions * sMps
          const sPrevUsed = s.usedMinutes ?? (s.usedSessions || 0) * sMps
          const sPrevRemaining = s.remainingMinutes ?? (sTotal - sPrevUsed)

          const newUsed = sPrevUsed + reApprovingLesson.minutes
          const newRemaining = sTotal - newUsed
          const newRemainingSessions = Math.floor(newRemaining / sMps)
          const rawSessions = newUsed / sMps
          const newUsedSessions =
            Math.abs(rawSessions - Math.round(rawSessions)) < 0.001
              ? Math.round(rawSessions)
              : Math.round(rawSessions * 100) / 100

          tx.update(lessonRef, {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: user?.uid,
            rejectedReason: '',
            salary,
            teacherLevel,
            pricePerMinute,
            sessionsBeforeApproval: s.remainingSessions,
            sessionsAfterApproval: newRemainingSessions,
            minutesBeforeApproval: sPrevRemaining,
            minutesAfterApproval: newRemaining,
            updatedAt: serverTimestamp(),
          })

          tx.update(studentRef, {
            usedMinutes: newUsed,
            remainingMinutes: newRemaining,
            totalMinutes: sTotal,
            minutesPerSession: sMps,
            usedSessions: newUsedSessions,
            remainingSessions: newRemainingSessions,
            status: newRemaining <= 0 ? 'expired' : 'active',
            updatedAt: serverTimestamp(),
          })

          const publicLessonRef = doc(db, 'publicLessons', reApprovingLesson.id)
          tx.set(publicLessonRef, {
            id: reApprovingLesson.id,
            studentId: reApprovingLesson.studentId,
            studentCode: reApprovingLesson.studentCode,
            studentName: reApprovingLesson.studentName,
            teacherId: reApprovingLesson.teacherId,
            teacherCode: reApprovingLesson.teacherCode ?? '',
            teacherName: reApprovingLesson.teacherName ?? '',
            subjectId: reApprovingLesson.subjectId,
            subjectName: reApprovingLesson.subjectName ?? '',
            date: reApprovingLesson.date,
            minutes: reApprovingLesson.minutes,
            comment: reApprovingLesson.comment || '',
            homework: reApprovingLesson.homework || '',
            book: reApprovingLesson.book || '',
            imageURLs: reApprovingLesson.imageURLs || [],
            status: 'approved',
            createdAt: reApprovingLesson.createdAt || serverTimestamp(),
            approvedAt: serverTimestamp(),
          })

          const payrollRef = doc(collection(db, 'payroll'))
          tx.set(payrollRef, {
            teacherId: reApprovingLesson.teacherId,
            teacherName: reApprovingLesson.teacherName,
            lessonId: reApprovingLesson.id,
            amount: salary,
            minutes: reApprovingLesson.minutes,
            pricePerMinute,
            level: teacherLevel,
            month,
            paid: false,
            createdAt: serverTimestamp(),
          })
        },
        { maxAttempts: 3 },
      )

      await addDoc(collection(db, 'adminLogs'), {
        adminId: user?.uid || '',
        action: 'RE_APPROVE_LESSON',
        targetType: 'lesson',
        targetId: reApprovingLesson.id,
        changes: {
          lessonDate: reApprovingLesson.date,
          deductedMinutes: reApprovingLesson.minutes,
        },
        createdAt: serverTimestamp(),
      })

      toast.success(`Đã duyệt lại, trừ ${reApprovingLesson.minutes} phút`)
      setReApprovingLesson(null)
    } catch (err) {
      console.error(err)
      toast.error('Duyệt lại thất bại')
    } finally {
      setActioning(false)
    }
  }

  // ─── Values used for display (always actual, not stored) ──
  const usedMinutesFund = actualUsedMinutes
  const remainingMinutes = actualRemainingMinutes
  const displayUsedSessions = actualUsedSessions
  const displayRemainingSessions = actualRemainingSessions

  const usedPct = totalMinutesFund > 0
    ? Math.min(100, Math.round((usedMinutesFund / totalMinutesFund) * 100))
    : 0

  const trackingUrl = `${window.location.origin}/tracking?student=${student.code}`

  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg transition-colors" aria-label="Quay lại">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{student.name}</h1>
          <p className="text-sm text-slate-500">Chi tiết học viên</p>
        </div>
      </div>

      {/* Profile card */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-lg font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-lg">
                {student.code}
              </span>
              <StatusBadge status={student.status} />
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm mt-2">
              <div>
                <span className="text-slate-500">Họ tên: </span>
                <span className="text-slate-700 font-medium">{student.name}</span>
              </div>
              <div>
                <span className="text-slate-500">SĐT PH: </span>
                <span className="text-slate-700">{student.parentPhone}</span>
              </div>
              <div>
                <span className="text-slate-500">Môn học: </span>
                <span className="text-slate-700">{student.subjectName || '—'}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>Sửa</Button>
            <Button size="sm" variant="primary" onClick={() => setShowAddSessions(true)}>+ Thêm buổi</Button>
          </div>
        </div>
      </Card>

      {/* Data mismatch warning */}
      {isMismatch && (
        <Card className="border-amber-300 bg-amber-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-amber-800">Dữ liệu học viên đang lệch với lịch sử buổi học</p>
              <p className="text-amber-700 mt-1 leading-relaxed">
                Hệ thống lưu: <strong>{storedUsedSessions} buổi ({storedUsedMinutes} phút)</strong> đã học.
                {' '}Nhưng thực tế trong lịch sử chỉ có <strong>{actualUsedSessions} buổi đã duyệt ({actualUsedMinutes} phút)</strong>.
              </p>
              <p className="text-amber-600/80 text-xs mt-1.5">
                Có thể do buổi đã duyệt bị xoá trực tiếp ở Firestore, hoặc dữ liệu cũ chưa được đồng bộ.
              </p>
              <Button size="sm" variant="primary" onClick={handleReconcile} loading={reconciling} className="mt-3">
                <RefreshCw className="w-4 h-4" />
                Đồng bộ lại theo lịch sử thực tế
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Session stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center">
          <p className="text-3xl font-bold text-slate-700">{student.totalSessions}</p>
          <p className="text-xs text-slate-500 mt-1">Tổng buổi</p>
          <p className="text-xs text-slate-400 mt-0.5">{totalMinutesFund} phút</p>
        </Card>
        <Card className="text-center">
          <p className="text-3xl font-bold text-indigo-400">{displayUsedSessions}</p>
          <p className="text-xs text-slate-500 mt-1">Đã học</p>
          <p className="text-xs text-indigo-300 mt-0.5">{usedMinutesFund} phút</p>
        </Card>
        <Card className="text-center">
          <p className={`text-3xl font-bold ${displayRemainingSessions <= 0 ? 'text-rose-400' : displayRemainingSessions <= 3 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {displayRemainingSessions}
          </p>
          <p className="text-xs text-slate-500 mt-1">Còn lại</p>
          <p className={`text-xs mt-0.5 ${remainingMinutes <= 0 ? 'text-rose-400' : 'text-emerald-300'}`}>
            {remainingMinutes} phút
          </p>
        </Card>
      </div>

      {/* Progress bar */}
      <style>{`.progress-bar-used { width: ${usedPct}%; }`}</style>
      <Card>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-500">Tiến độ học</span>
          <span className="text-slate-600 font-medium">{usedPct}%</span>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-500 progress-bar-used"
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {displayUsedSessions} / {student.totalSessions} buổi đã học
          <span className="ml-2 text-slate-400">({usedMinutesFund} / {totalMinutesFund} phút)</span>
        </p>
      </Card>

      {/* Session breakdown by status */}
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Phân loại buổi học</h3>
        <div className="divide-y divide-slate-100">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span className="text-sm text-slate-600">Đã duyệt</span>
            </div>
            <div className="text-sm text-right">
              <span className="font-medium text-slate-700">{approvedLessons.length} buổi</span>
              {approvedMinutes > 0 && (
                <span className="text-slate-400 ml-2">/ {approvedMinutes} phút</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              <span className="text-sm text-slate-600">Chờ duyệt</span>
            </div>
            <div className="text-sm text-right">
              <span className="font-medium text-slate-700">{pendingLessons.length} buổi</span>
              {pendingMinutes > 0 && (
                <span className="text-slate-400 ml-2">/ {pendingMinutes} phút</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
              <span className="text-sm text-slate-600">Từ chối</span>
            </div>
            <div className="text-sm text-right">
              <span className="font-medium text-slate-700">{rejectedLessons.length} buổi</span>
              {rejectedMinutes > 0 && (
                <span className="text-slate-400 ml-2">/ {rejectedMinutes} phút</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Lesson history */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">Lịch sử buổi học</h3>
        </div>
        {lessons.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-8">Chưa có buổi học nào</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  {['Ngày', 'Giáo viên', 'Sách học', 'Phút', 'Nhận xét', 'Lương buổi', 'Trạng thái', 'Hành động'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {lessons.map((lesson) => (
                  <tr key={lesson.id} className="hover:bg-slate-100/20 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{lesson.date}</td>
                    <td className="px-4 py-3 text-slate-600">{lesson.teacherName}</td>
                    <td className="px-4 py-3 text-slate-600 italic max-w-[150px] truncate" title={lesson.book || ''}>{lesson.book || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{lesson.minutes}'</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{lesson.comment || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {lesson.status === 'approved' && lesson.salary != null ? (
                        (() => {
                          const exp = expectedSalary(lesson)
                          const drift = exp.salary !== lesson.salary && exp.salary > 0
                          return (
                            <div>
                              <span className={drift ? 'text-amber-600 font-medium' : ''}>
                                {lesson.salary.toLocaleString('vi-VN')}đ
                              </span>
                              {drift && (
                                <div className="text-[11px] text-amber-600 mt-0.5 font-normal">
                                  Giá hiện tại: {exp.salary.toLocaleString('vi-VN')}đ
                                </div>
                              )}
                            </div>
                          )
                        })()
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={lesson.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {lesson.status === 'approved' && (() => {
                        const exp = expectedSalary(lesson)
                        const drift = exp.salary !== lesson.salary && exp.salary > 0
                        return (
                          <div className="flex items-center gap-1">
                            {drift && (
                              <button
                                onClick={() => openRecalc(lesson)}
                                disabled={recalcOpening}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-md border border-amber-200 transition-colors disabled:opacity-50"
                                title="Tính lại lương theo giá môn / level GV hiện tại"
                              >
                                <Calculator className="w-3.5 h-3.5" />
                                Tính lại lương
                              </button>
                            )}
                            <button
                              onClick={() => setReversingLesson(lesson)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-md border border-rose-200 transition-colors"
                              title="Huỷ duyệt: trả phút lại, void lương"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              Huỷ duyệt
                            </button>
                          </div>
                        )
                      })()}
                      {lesson.status === 'rejected' && (
                        <button
                          onClick={() => setReApprovingLesson(lesson)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md border border-indigo-200 transition-colors"
                          title="Duyệt lại: trừ phút và tính lương"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Duyệt lại
                        </button>
                      )}
                      {lesson.status === 'pending' && (
                        <span className="text-xs text-slate-400">— Xử lý ở trang Duyệt —</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showEdit && <StudentFormModal student={student} onClose={() => setShowEdit(false)} />}
      {showAddSessions && <AddSessionsModal student={student} onClose={() => setShowAddSessions(false)} />}

      {/* Reverse approval confirm */}
      {reversingLesson && (
        <ConfirmDialog
          open
          onClose={() => setReversingLesson(null)}
          onConfirm={handleReverseApproval}
          title="Huỷ duyệt buổi học?"
          description={`Buổi ngày ${reversingLesson.date} với ${reversingLesson.teacherName}`}
          confirmLabel="Huỷ duyệt"
          confirmVariant="danger"
          loading={actioning}
        >
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-600">Trả lại quỹ phút</span>
              <span className="text-emerald-600 font-semibold">+ {reversingLesson.minutes} phút</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Void lương giáo viên</span>
              <span className="text-rose-600 font-semibold">
                − {(reversingLesson.salary || 0).toLocaleString('vi-VN')}đ
              </span>
            </div>
            <div className="flex justify-between border-t border-rose-200 pt-1.5 mt-1.5">
              <span className="text-slate-600">Trạng thái mới</span>
              <span className="text-slate-700 font-medium">Từ chối</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Lưu ý: hành động này được ghi log. Nếu cần dùng lại buổi này, bấm "Duyệt lại" trên dòng "Từ chối".
          </p>
        </ConfirmDialog>
      )}

      {/* Recalc salary confirm */}
      {recalcLesson && (
        <ConfirmDialog
          open
          onClose={() => setRecalcLesson(null)}
          onConfirm={handleRecalcSalary}
          title="Tính lại lương theo giá hiện tại?"
          description={`Buổi ngày ${recalcLesson.lesson.date} · ${recalcLesson.lesson.teacherName}`}
          confirmLabel={recalcLesson.payrollPaid ? 'Đã thanh toán - không thể' : 'Tính lại'}
          confirmVariant="primary"
          loading={actioning}
        >
          {recalcLesson.payrollPaid ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
              ⚠ Lương của buổi này đã được đánh dấu thanh toán. Không thể tính lại để giữ tính nguyên vẹn dữ liệu lương.
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">Giá/phút khi duyệt</span>
                <span className="text-slate-700 font-medium tabular-nums">
                  {(recalcLesson.lesson.pricePerMinute ?? 0).toLocaleString('vi-VN')}đ
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Giá/phút hiện tại</span>
                <span className="text-amber-700 font-semibold tabular-nums">
                  {recalcLesson.newPrice.toLocaleString('vi-VN')}đ
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Level GV khi duyệt</span>
                <span className="text-slate-700 font-medium">×{recalcLesson.lesson.teacherLevel ?? 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Level GV hiện tại</span>
                <span className="text-amber-700 font-semibold">×{recalcLesson.newLevel}</span>
              </div>
              <div className="flex justify-between border-t border-amber-200 pt-1.5 mt-1.5">
                <span className="text-slate-700 font-medium">Lương cũ → mới</span>
                <span className="text-emerald-600 font-bold tabular-nums">
                  {(recalcLesson.lesson.salary ?? 0).toLocaleString('vi-VN')}đ → {recalcLesson.newSalary.toLocaleString('vi-VN')}đ
                </span>
              </div>
              <p className="text-[11px] text-slate-500 pt-1">
                Cập nhật cả bản ghi lương ({recalcLesson.payrollIds.length} payroll docs chưa thanh toán).
              </p>
            </div>
          )}
        </ConfirmDialog>
      )}

      {/* Re-approve confirm */}
      {reApprovingLesson && (
        <ConfirmDialog
          open
          onClose={() => setReApprovingLesson(null)}
          onConfirm={handleReApprove}
          title="Duyệt lại buổi học?"
          description={`Buổi ngày ${reApprovingLesson.date} với ${reApprovingLesson.teacherName}`}
          confirmLabel="Duyệt lại"
          loading={actioning}
        >
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-600">Trừ quỹ phút</span>
              <span className="text-rose-600 font-semibold">− {reApprovingLesson.minutes} phút</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Tạo bản ghi lương mới</span>
              <span className="text-emerald-600 font-semibold">
                {reApprovingLesson.pricePerMinute != null
                  ? '+ ' + calculateSalary(reApprovingLesson.minutes, reApprovingLesson.pricePerMinute, reApprovingLesson.teacherLevel ?? 1).toLocaleString('vi-VN') + 'đ'
                  : 'Tính khi duyệt'}
              </span>
            </div>
            <div className="flex justify-between border-t border-indigo-200 pt-1.5 mt-1.5">
              <span className="text-slate-600">Trạng thái mới</span>
              <span className="text-slate-700 font-medium">Đã duyệt</span>
            </div>
          </div>
        </ConfirmDialog>
      )}
    </div>
  )
}
