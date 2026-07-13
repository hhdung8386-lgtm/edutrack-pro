import { useEffect, useState, useMemo } from 'react'
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, updateDoc, serverTimestamp, addDoc, runTransaction, getDocs } from 'firebase/firestore'
import { db, calculateSalary } from '@/lib/firebase'
import { Student, StudentSubject, Lesson, BookingRequest } from '@/types'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { StudentFormModal } from '@/components/students/StudentFormModal'
import { AddSessionsModal } from '@/components/students/AddSessionsModal'
import { SubjectPackageModal } from '@/components/students/SubjectPackageModal'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ArrowLeft, BookOpen, Copy, ExternalLink, AlertTriangle, RefreshCw, Undo2, RotateCcw, Calculator, Edit, Trash2, Plus, ChevronDown, Calendar } from 'lucide-react'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { formatMoney, formatPricePerMinute } from '@/lib/constants'

function withUsedMinutes(pkg: StudentSubject, usedMinutes: number): StudentSubject {
  const safeUsedMinutes = Math.max(0, usedMinutes)
  const remainingMinutes = Math.max(0, pkg.totalMinutes - safeUsedMinutes)
  const minutesPerSession = pkg.minutesPerSession || 50
  const usedSessionsRaw = safeUsedMinutes / minutesPerSession
  const usedSessions = Math.abs(usedSessionsRaw - Math.round(usedSessionsRaw)) < 0.001
    ? Math.round(usedSessionsRaw)
    : Math.round(usedSessionsRaw * 100) / 100

  return {
    ...pkg,
    usedMinutes: safeUsedMinutes,
    remainingMinutes,
    usedSessions,
    remainingSessions: Math.floor(remainingMinutes / minutesPerSession),
  }
}

interface CalculatedBatch {
  id: string
  createdAt: string
  totalSessions: number
  usedSessions: number
  remainingSessions: number
  status: 'active' | 'completed'
}

function calculateBatchesFIFO(
  batches: any[] | undefined,
  totalSessions: number,
  usedSessions: number,
  createdAtFallback: string
): CalculatedBatch[] {
  const rawBatches = batches && batches.length > 0
    ? [...batches]
    : [{ id: '1', createdAt: createdAtFallback, totalSessions }]

  rawBatches.sort((a, b) => Number(a.id) - Number(b.id))

  let remainingUsed = usedSessions
  return rawBatches.map((batch) => {
    let allocatedUsed = 0
    if (remainingUsed > 0) {
      if (remainingUsed >= batch.totalSessions) {
        allocatedUsed = batch.totalSessions
        remainingUsed -= batch.totalSessions
      } else {
        allocatedUsed = remainingUsed
        remainingUsed = 0
      }
    }
    const remaining = batch.totalSessions - allocatedUsed
    return {
      id: batch.id,
      createdAt: batch.createdAt,
      totalSessions: batch.totalSessions,
      usedSessions: allocatedUsed,
      remainingSessions: remaining,
      status: remaining <= 0 ? 'completed' : 'active'
    }
  })
}

export function StudentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [student, setStudent] = useState<Student | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showAddSessions, setShowAddSessions] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [reversingLesson, setReversingLesson] = useState<Lesson | null>(null)
  const [reApprovingLesson, setReApprovingLesson] = useState<Lesson | null>(null)
  const [actioning, setActioning] = useState(false)
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([])
  const [cancellingSpecific, setCancellingSpecific] = useState(false)

  // State variables for subject package management
  const [editingSubjectId, setEditingSubjectId] = useState<string | undefined>(undefined)
  const [showSubjectPkg, setShowSubjectPkg] = useState(false)
  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null)
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all')
  const [reApproveSubjectId, setReApproveSubjectId] = useState<string>('')
  const [changingSubjectLessonId, setChangingSubjectLessonId] = useState<string | null>(null)
  const [historyFilters, setHistoryFilters] = useState({
    date: '',
    teacher: '',
    subject: 'all',
    book: '',
    minutes: 'all',
    comment: '',
    salary: 'all',
    status: 'all',
    action: 'all',
  })

  // Live rates per (subjectId, teacherId) for drift detection / recalc
  const [liveRates, setLiveRates] = useState<{
    subjectPrice: Record<string, any>
    teacherLevel: Record<string, number>
    teacherUid: Record<string, string>
    teacherCountry: Record<string, string>
  }>({ subjectPrice: {}, teacherLevel: {}, teacherUid: {}, teacherCountry: {} })
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

    const qBookings = query(
      collection(db, 'bookingRequests'),
      where('studentId', '==', id),
      where('status', 'in', ['confirmed', 'pending'])
    )
    const unsubBookings = onSnapshot(qBookings, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookingRequest))
      setBookingRequests(docs)
    })

    return () => { unsubStudent(); unsubLessons(); unsubBookings() }
  }, [id])

  // Load live subject prices & teacher levels referenced by approved lessons or student primary subject
  useEffect(() => {
    if (lessons.length === 0 && !student?.subjectId) return
    const subjectIds = Array.from(new Set([
      ...lessons.map(l => l.subjectId),
      student?.subjectId
    ].filter(Boolean) as string[]))
    const teacherIds = Array.from(new Set(lessons.map(l => l.teacherId).filter(Boolean)))
    let cancelled = false
    Promise.all([
      Promise.all(subjectIds.map(sid => getDoc(doc(db, 'subjects', sid)).then(s => {
        const data = s.data()
        return [sid, {
          pricePerMinute: data?.pricePerMinute ?? 0,
          pricePerMinuteVN: data?.pricePerMinuteVN ?? data?.pricePerMinute ?? 0,
          pricePerMinutePH: data?.pricePerMinutePH ?? data?.pricePerMinute ?? 0,
          pricePerMinuteNative: data?.pricePerMinuteNative ?? data?.pricePerMinute ?? 0,
          otherCountriesPrices: data?.otherCountriesPrices || {},
        }] as const
      }))),
      Promise.all(teacherIds.map(tid => getDoc(doc(db, 'teachers', tid)).then(t => {
        const data = t.data()
        return [tid, data?.level ?? 1, data?.uid ?? '', data?.country ?? 'VN'] as const
      }))),
    ]).then(([subjs, tchrs]) => {
      if (cancelled) return
      const subjectPrice: Record<string, any> = {}
      subjs.forEach(([k, v]) => { subjectPrice[k] = v })
      const teacherLevel: Record<string, number> = {}
      const teacherUid: Record<string, string> = {}
      const teacherCountry: Record<string, string> = {}
      tchrs.forEach(([k, lv, uid, country]) => {
        teacherLevel[k] = lv as number
        teacherUid[k] = uid as string
        teacherCountry[k] = country as string
      })
      setLiveRates({ subjectPrice, teacherLevel, teacherUid, teacherCountry })
    })
    return () => { cancelled = true }
  }, [lessons.length, student?.subjectId])

  // Helper: compute current expected salary from live rates
  const expectedSalary = (lesson: Lesson) => {
    const country = liveRates.teacherCountry[lesson.teacherId] ?? 'VN'
    const rates = liveRates.subjectPrice[lesson.subjectId]
    let price = lesson.pricePerMinute ?? 0
    if (rates) {
      if (rates.countryPrices) {
        const rateObj = rates.countryPrices[country] || rates.countryPrices['VN']
        price = rateObj?.price || rates.pricePerMinute || 0
      } else if (rates.otherCountriesPrices && rates.otherCountriesPrices[country] !== undefined) {
        price = rates.otherCountriesPrices[country]
      } else if (country === 'VN') {
        price = rates.pricePerMinuteVN || rates.pricePerMinute || 0
      } else if (country === 'PH') {
        price = rates.pricePerMinutePH || rates.pricePerMinute || 0
      } else {
        price = rates.pricePerMinuteNative || rates.pricePerMinute || 0
      }
    }
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

  const futureBookings = useMemo(() => {
    const list = bookingRequests.filter((b: BookingRequest) => !b.lessonId)
    return [...list].sort((a: BookingRequest, b: BookingRequest) => {
      const dateA = a.requestedDate || ''
      const dateB = b.requestedDate || ''
      if (dateA !== dateB) return dateA.localeCompare(dateB)
      return (a.requestedStart || '').localeCompare(b.requestedStart || '')
    })
  }, [bookingRequests])

  const handleCancelSpecificBookings = async (targetBookings: BookingRequest[]) => {
    if (targetBookings.length === 0 || !student || !id) return
    
    const confirmMessage = targetBookings.length === 1
      ? `Hủy ca học ngày ${targetBookings[0].requestedDate} lúc ${targetBookings[0].requestedStart}?`
      : `Bạn có chắc chắn muốn hủy ${targetBookings.length} ca học đã chọn và hoàn lại số phút?`
      
    if (!window.confirm(confirmMessage)) return
    
    setCancellingSpecific(true)
    try {
      const totalMinutesToRefund = targetBookings.reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)
      
      await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', id)
        const studentSnap = await tx.get(studentRef)
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

        const studentData = { id: studentSnap.id, ...studentSnap.data() } as Student
        const currentHeld = studentData.reservedMinutes ?? studentData.heldMinutes ?? 0
        const nextHeld = Math.max(0, currentHeld - totalMinutesToRefund)

        // Booking only ever holds minutes (held += m); remainingMinutes is untouched until
        // lesson approval. So cancelling must ONLY release the hold — adding minutes back to
        // subjects[].remainingMinutes here would double-refund the student (matches the fix
        // in FutureBookingsPage and executeBatchCancel in BookingSchedulesPage).
        tx.update(studentRef, {
          reservedMinutes: nextHeld,
          heldMinutes: nextHeld,
          updatedAt: serverTimestamp(),
        })

        for (const booking of targetBookings) {
          const requestRef = doc(db, 'bookingRequests', booking.id)
          tx.update(requestRef, {
            status: 'released',
            releasedAt: serverTimestamp(),
            releasedBy: user?.uid ?? 'admin',
          })
        }

        tx.set(doc(collection(db, 'adminLogs')), {
          adminId: user?.uid ?? 'admin',
          action: 'CANCEL_SPECIFIC_BOOKINGS',
          targetType: 'student',
          targetId: id,
          changes: {
            studentName: studentData.name,
            cancelledCount: targetBookings.length,
            cancelledIds: targetBookings.map(b => b.id),
            refundedMinutes: totalMinutesToRefund,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success(`Hủy thành công ${targetBookings.length} ca học và hoàn trả ${totalMinutesToRefund} phút về quỹ học viên.`)
      setSelectedBookingIds([])
    } catch (err) {
      console.error('Cancel specific bookings failed:', err)
      toast.error('Gặp lỗi khi hủy các ca học đã chọn')
    } finally {
      setCancellingSpecific(false)
    }
  }

  const handleSuspendStudent = async () => {
    if (!id || !student) return
    if (!window.confirm(`Bạn có chắc chắn muốn bảo lưu học viên ${student.name} không? Hệ thống sẽ tự động hủy tất cả lịch học trong tương lai của học viên này và hoàn trả lại số phút về tài khoản.`)) return
    
    setActioning(true)
    try {
      const todayISO = new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0]
      
      // Fetch all confirmed/pending bookings of this student
      const q = query(
        collection(db, 'bookingRequests'),
        where('studentId', '==', id),
        where('status', 'in', ['confirmed', 'pending'])
      )
      const snap = await getDocs(q)
      const bookings = snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingRequest))
      
      // Filter future bookings
      const futureBookings = bookings.filter(b => b.requestedDate && b.requestedDate >= todayISO)
      const totalMinutesToRefund = futureBookings.reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)

      await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', id)
        const studentSnap = await tx.get(studentRef)
        if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

        const studentData = { id: studentSnap.id, ...studentSnap.data() } as Student
        const currentHeld = studentData.reservedMinutes ?? studentData.heldMinutes ?? 0
        const nextHeld = Math.max(0, currentHeld - totalMinutesToRefund)

        // Update student status & refund minutes
        tx.update(studentRef, {
          status: 'reserved',
          reservedMinutes: nextHeld,
          heldMinutes: nextHeld,
          updatedAt: serverTimestamp(),
        })

        // Update future bookings status to released
        for (const booking of futureBookings) {
          const requestRef = doc(db, 'bookingRequests', booking.id)
          tx.update(requestRef, {
            status: 'released',
            releasedAt: serverTimestamp(),
            releasedBy: user?.uid ?? 'admin',
          })
        }

        // Add admin log
        tx.set(doc(collection(db, 'adminLogs')), {
          adminId: user?.uid ?? 'admin',
          action: 'SUSPEND_STUDENT',
          targetType: 'student',
          targetId: id,
          changes: {
            studentName: studentData.name,
            refundedBookingCount: futureBookings.length,
            refundedBookingIds: futureBookings.map(b => b.id),
            refundedMinutes: totalMinutesToRefund,
            heldMinutesAfter: nextHeld,
          },
          createdAt: serverTimestamp(),
        })
      })

      toast.success(`Học viên ${student.name} đã được chuyển sang trạng thái bảo lưu. Đã tự động hủy ${futureBookings.length} ca học trong tương lai và hoàn trả ${totalMinutesToRefund} phút.`)
    } catch (err) {
      console.error('Suspend student failed:', err)
      toast.error('Gặp lỗi khi bảo lưu học viên')
    } finally {
      setActioning(false)
    }
  }

  const handleReactivateStudent = async () => {
    if (!id || !student) return
    if (!window.confirm(`Kích hoạt lại học viên ${student.name}?`)) return
    
    setActioning(true)
    try {
      await updateDoc(doc(db, 'students', id), {
        status: 'active',
        updatedAt: serverTimestamp(),
      })

      // Add admin log
      await addDoc(collection(db, 'adminLogs'), {
        adminId: user?.uid ?? 'admin',
        action: 'REACTIVATE_STUDENT',
        targetType: 'student',
        targetId: id,
        changes: {
          studentName: student.name,
        },
        createdAt: serverTimestamp(),
      })

      toast.success(`Đã kích hoạt lại học viên ${student.name} thành công.`)
    } catch (err) {
      console.error('Reactivate student failed:', err)
      toast.error('Gặp lỗi khi kích hoạt học viên')
    } finally {
      setActioning(false)
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

  const storedSubjects: StudentSubject[] = student.subjects && student.subjects.length > 0
    ? student.subjects
    : student.subjectId
      ? [{
          subjectId: student.subjectId,
          subjectName: student.subjectName || 'Chưa rõ',
          totalSessions: student.totalSessions || 0,
          usedSessions: student.usedSessions || 0,
          remainingSessions: student.remainingSessions || 0,
          minutesPerSession: student.minutesPerSession || 50,
          totalMinutes: student.totalMinutes ?? (student.totalSessions * (student.minutesPerSession || 50)),
          usedMinutes: student.usedMinutes ?? ((student.usedSessions || 0) * (student.minutesPerSession || 50)),
          remainingMinutes: student.remainingMinutes ?? ((student.remainingSessions || 0) * (student.minutesPerSession || 50)),
          pricePerMinute: liveRates.subjectPrice[student.subjectId]?.pricePerMinute || 0,
        }]
      : []

  const sumMinutes = (ls: Lesson[]) => ls.reduce((acc, l) => acc + (l.minutes || 0), 0)
  const sessionCount = (minutes: number, minutesPerSession: number) => {
    const raw = minutesPerSession > 0 ? minutes / minutesPerSession : 0
    return Math.abs(raw - Math.round(raw)) < 0.001
      ? Math.round(raw)
      : Math.round(raw * 100) / 100
  }
  const approvedMinutes = sumMinutes(approvedLessons)
  const pendingMinutes = sumMinutes(pendingLessons)
  const rejectedMinutes = sumMinutes(rejectedLessons)
  const approvedMinutesBySubject = approvedLessons.reduce<Record<string, number>>((acc, lesson) => {
    if (!lesson.subjectId) return acc
    acc[lesson.subjectId] = (acc[lesson.subjectId] || 0) + (lesson.minutes || 0)
    return acc
  }, {})
  // Find all approved minutes of subjects that do not have a package
  const packageSubjectIds = new Set(storedSubjects.map((s) => s.subjectId))
  const orphanMinutes = Object.entries(approvedMinutesBySubject)
    .filter(([subId]) => !packageSubjectIds.has(subId))
    .reduce((sum, [_, mins]) => sum + mins, 0)

  const activeSubjects = storedSubjects.map((pkg) => {
    const subjectUsedMinutes = approvedMinutesBySubject[pkg.subjectId] || 0
    const subjectMps = pkg.minutesPerSession || 50
    const subjectTotalMinutes = pkg.totalMinutes ?? (pkg.totalSessions * subjectMps)
    const subjectRemainingMinutes = Math.max(0, subjectTotalMinutes - subjectUsedMinutes)
    return {
      ...pkg,
      totalMinutes: subjectTotalMinutes,
      usedMinutes: subjectUsedMinutes,
      remainingMinutes: subjectRemainingMinutes,
      usedSessions: sessionCount(subjectUsedMinutes, subjectMps),
      remainingSessions: Math.floor(subjectRemainingMinutes / subjectMps),
    }
  })

  // Deduct orphan minutes from remaining minutes of available packages
  let remainingOrphan = orphanMinutes
  for (let i = 0; i < activeSubjects.length && remainingOrphan > 0; i++) {
    const pkg = activeSubjects[i]
    if (pkg.remainingMinutes > 0) {
      const deduction = Math.min(pkg.remainingMinutes, remainingOrphan)
      pkg.remainingMinutes -= deduction
      pkg.usedMinutes += deduction
      remainingOrphan -= deduction
      
      const subjectMps = pkg.minutesPerSession || 50
      pkg.usedSessions = sessionCount(pkg.usedMinutes, subjectMps)
      pkg.remainingSessions = Math.floor(pkg.remainingMinutes / subjectMps)
    }
  }

  // If there are still orphan minutes left (i.e. student exceeded their total paid minutes),
  // deduct them from the first package (making its remainingMinutes go to 0 or negative/extra used minutes)
  if (remainingOrphan > 0 && activeSubjects.length > 0) {
    const pkg = activeSubjects[0]
    pkg.remainingMinutes = 0
    pkg.usedMinutes += remainingOrphan
    
    const subjectMps = pkg.minutesPerSession || 50
    pkg.usedSessions = sessionCount(pkg.usedMinutes, subjectMps)
    pkg.remainingSessions = 0
  }

  const mps = student.minutesPerSession || 50

  // ─── ACTUAL values (derived from lessons collection — source of truth) ──
  const actualUsedMinutes = approvedMinutes
  const totalMinutesFund = activeSubjects.length > 0
    ? activeSubjects.reduce((sum, subject) => sum + subject.totalMinutes, 0)
    : (student.totalMinutes ?? student.totalSessions * mps)
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
  const isSubjectMismatch = storedSubjects.some((pkg) => {
    const actualPkg = activeSubjects.find((subject) => subject.subjectId === pkg.subjectId)
    return Boolean(actualPkg && (
      pkg.usedMinutes !== actualPkg.usedMinutes ||
      pkg.remainingMinutes !== actualPkg.remainingMinutes ||
      pkg.usedSessions !== actualPkg.usedSessions ||
      pkg.remainingSessions !== actualPkg.remainingSessions
    ))
  })

  // ─── Mismatch detection ──
  const isMismatch =
    storedUsedSessions !== actualUsedSessions ||
    storedUsedMinutes !== actualUsedMinutes ||
    isSubjectMismatch

  const handleReconcile = async () => {
    if (!student) return
    setReconciling(true)
    try {
      const newStatus = actualRemainingMinutes <= 0 ? 'expired' : 'active'
      const primarySubject = activeSubjects.find((subject) => subject.remainingMinutes > 0) || activeSubjects[0] || null
      await updateDoc(doc(db, 'students', student.id), {
        subjects: activeSubjects,
        usedMinutes: actualUsedMinutes,
        remainingMinutes: actualRemainingMinutes,
        totalMinutes: totalMinutesFund,
        minutesPerSession: primarySubject?.minutesPerSession || mps,
        usedSessions: actualUsedSessions,
        remainingSessions: actualRemainingSessions,
        subjectId: primarySubject?.subjectId || '',
        subjectName: primarySubject?.subjectName || '',
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
          subjects: activeSubjects.map((subject) => ({
            subjectId: subject.subjectId,
            subjectName: subject.subjectName,
            usedMinutes: subject.usedMinutes,
            remainingMinutes: subject.remainingMinutes,
          })),
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

  const handleDeleteSubject = async (subjectId: string) => {
    if (!student) return
    const hasHistory = lessons.some((l) => l.subjectId === subjectId)
    if (hasHistory) {
      toast.error('Không thể xóa môn học đã có lịch sử học')
      return
    }

    if (!confirm('Bạn có chắc chắn muốn xóa môn học này?')) return

    setActioning(true)
    try {
      const updatedSubjects = (student.subjects || []).filter(s => s.subjectId !== subjectId)
      
      // Recalculate aggregates
      const aggTotalSessions = updatedSubjects.reduce((sum, s) => sum + s.totalSessions, 0)
      const aggUsedSessions = updatedSubjects.reduce((sum, s) => sum + s.usedSessions, 0)
      const aggRemainingSessions = updatedSubjects.reduce((sum, s) => sum + s.remainingSessions, 0)
      const aggTotalMinutes = updatedSubjects.reduce((sum, s) => sum + s.totalMinutes, 0)
      const aggUsedMinutes = updatedSubjects.reduce((sum, sumS) => sum + sumS.usedMinutes, 0)
      const aggRemainingMinutes = updatedSubjects.reduce((sum, sumS) => sum + sumS.remainingMinutes, 0)

      const primarySubject = updatedSubjects[0] || null

      await updateDoc(doc(db, 'students', student.id), {
        subjects: updatedSubjects,
        totalSessions: aggTotalSessions,
        usedSessions: aggUsedSessions,
        remainingSessions: aggRemainingSessions,
        totalMinutes: aggTotalMinutes,
        usedMinutes: aggUsedMinutes,
        remainingMinutes: aggRemainingMinutes,
        subjectId: primarySubject ? primarySubject.subjectId : '',
        subjectName: primarySubject ? primarySubject.subjectName : '',
        minutesPerSession: primarySubject ? primarySubject.minutesPerSession : 50,
        status: aggRemainingMinutes <= 0 ? 'expired' : 'active',
        updatedAt: serverTimestamp(),
      })
      toast.success('Đã xóa môn học thành công')
    } catch (err) {
      console.error(err)
      toast.error('Xóa môn học thất bại')
    } finally {
      setActioning(false)
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
      
      const payrollPaid = payrollSnap.docs.some((d) => d.data().paid === true)
      if (payrollPaid) {
        toast.warning('Lương buổi này đã thanh toán, không thể huỷ duyệt')
        return
      }

      const payrollIds = payrollSnap.docs.map((d) => d.id)

      await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', student.id)
        const lessonRef = doc(db, 'lessons', reversingLesson.id)
        const studentSnap = await tx.get(studentRef)
        const s = studentSnap.data()!

        // Initialize subjects array for backward compatibility if needed
        let updatedSubjects = s.subjects && s.subjects.length > 0
          ? [...s.subjects]
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
                pricePerMinute: reversingLesson.pricePerMinute || 0,
              }]
            : []

        // Find the matching subject package
        const sIdx = updatedSubjects.findIndex(sub => sub.subjectId === reversingLesson.subjectId)
        if (sIdx !== -1) {
          const subPkg = updatedSubjects[sIdx]
          const subUsedMinutes = Math.max(0, subPkg.usedMinutes - reversingLesson.minutes)
          const subRemainingMinutes = subPkg.totalMinutes - subUsedMinutes
          const subMps = subPkg.minutesPerSession || 50
          const subUsedSessionsRaw = subMps > 0 ? subUsedMinutes / subMps : 0
          const subUsedSessions = Math.abs(subUsedSessionsRaw - Math.round(subUsedSessionsRaw)) < 0.001
            ? Math.round(subUsedSessionsRaw)
            : Math.round(subUsedSessionsRaw * 100) / 100
          const subRemainingSessions = Math.floor(subRemainingMinutes / subMps)

          updatedSubjects[sIdx] = {
            ...subPkg,
            usedMinutes: subUsedMinutes,
            remainingMinutes: subRemainingMinutes,
            usedSessions: subUsedSessions,
            remainingSessions: subRemainingSessions
          }
        }

        // Recalculate aggregates
        const aggTotalSessions = updatedSubjects.reduce((sum, sub) => sum + sub.totalSessions, 0)
        const aggUsedSessions = updatedSubjects.reduce((sum, sub) => sum + sub.usedSessions, 0)
        const aggRemainingSessions = updatedSubjects.reduce((sum, sub) => sum + sub.remainingSessions, 0)
        const aggTotalMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.totalMinutes, 0)
        const aggUsedMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.usedMinutes, 0)
        const aggRemainingMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.remainingMinutes, 0)

        const primarySubject = updatedSubjects[0] || null

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
          subjects: updatedSubjects,
          totalSessions: aggTotalSessions,
          usedSessions: aggUsedSessions,
          remainingSessions: aggRemainingSessions,
          totalMinutes: aggTotalMinutes,
          usedMinutes: aggUsedMinutes,
          remainingMinutes: aggRemainingMinutes,
          // Legacy fields mapping to primary subject
          subjectId: primarySubject ? primarySubject.subjectId : '',
          subjectName: primarySubject ? primarySubject.subjectName : '',
          minutesPerSession: primarySubject ? primarySubject.minutesPerSession : 50,
          status: aggRemainingMinutes <= 0 ? 'expired' : 'active',
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
          subjectId: reversingLesson.subjectId,
          subjectName: reversingLesson.subjectName,
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
    if (!reApprovingLesson || !student || !reApproveSubjectId) return
    setActioning(true)
    try {
      const chosenSubjectPkg = activeSubjects.find(s => s.subjectId === reApproveSubjectId)
      if (!chosenSubjectPkg) {
        toast.error('Môn học được chọn không hợp lệ')
        return
      }

      await runTransaction(
        db,
        async (tx) => {
          const studentRef = doc(db, 'students', student.id)
          const lessonRef = doc(db, 'lessons', reApprovingLesson.id)
          const studentSnap = await tx.get(studentRef)
          const s = studentSnap.data()!

          const tSnap = await tx.get(doc(db, 'teachers', reApprovingLesson.teacherId))
          const tData = tSnap.data()
          const teacherLevel = (reApprovingLesson.teacherLevel ?? tData?.level ?? 1) || 1
          const teacherCountry = tData?.country || 'VN'

          let pricePerMinute = chosenSubjectPkg.pricePerMinute || 0
          if (chosenSubjectPkg.countryPrices) {
            const rateObj = chosenSubjectPkg.countryPrices[teacherCountry] || chosenSubjectPkg.countryPrices['VN']
            pricePerMinute = rateObj?.price || chosenSubjectPkg.pricePerMinute || 0
          } else if (chosenSubjectPkg.otherCountriesPrices && chosenSubjectPkg.otherCountriesPrices[teacherCountry] !== undefined) {
            pricePerMinute = chosenSubjectPkg.otherCountriesPrices[teacherCountry]
          } else if (teacherCountry === 'VN') {
            pricePerMinute = chosenSubjectPkg.pricePerMinuteVN || chosenSubjectPkg.pricePerMinute || 0
          } else if (teacherCountry === 'PH') {
            pricePerMinute = chosenSubjectPkg.pricePerMinutePH || chosenSubjectPkg.pricePerMinute || 0
          } else {
            pricePerMinute = chosenSubjectPkg.pricePerMinuteNative || chosenSubjectPkg.pricePerMinute || 0
          }

          const currency = chosenSubjectPkg.currency || 'VND'
          const salary = calculateSalary(reApprovingLesson.minutes, pricePerMinute, teacherLevel, currency)
          const month = reApprovingLesson.date.slice(0, 7)

          // Initialize subjects array for backward compatibility if needed
          let updatedSubjects = s.subjects && s.subjects.length > 0
            ? [...s.subjects]
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
                  pricePerMinute: pricePerMinute,
                  pricePerMinuteVN: chosenSubjectPkg.pricePerMinuteVN || pricePerMinute,
                  pricePerMinutePH: chosenSubjectPkg.pricePerMinutePH || pricePerMinute,
                  pricePerMinuteNative: chosenSubjectPkg.pricePerMinuteNative || pricePerMinute,
                  currency: chosenSubjectPkg.currency || 'VND',
                }]
              : []

          // Deduct from the selected subject package
          const sIdx = updatedSubjects.findIndex(sub => sub.subjectId === reApproveSubjectId)
          if (sIdx === -1) {
            throw new Error(`Không tìm thấy gói môn học ${chosenSubjectPkg.subjectName}`)
          }

          const subPkg = updatedSubjects[sIdx]
          const newSubUsedMinutes = subPkg.usedMinutes + reApprovingLesson.minutes
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

          // Recalculate student aggregates
          const aggTotalSessions = updatedSubjects.reduce((sum, sub) => sum + sub.totalSessions, 0)
          const aggUsedSessions = updatedSubjects.reduce((sum, sub) => sum + sub.usedSessions, 0)
          const aggRemainingSessions = updatedSubjects.reduce((sum, sub) => sum + sub.remainingSessions, 0)
          const aggTotalMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.totalMinutes, 0)
          const aggUsedMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.usedMinutes, 0)
          const aggRemainingMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.remainingMinutes, 0)

          const primarySubject = updatedSubjects[0] || null

          tx.update(lessonRef, {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: user?.uid,
            rejectedReason: '',
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
            updatedAt: serverTimestamp(),
          })

          tx.update(studentRef, {
            subjects: updatedSubjects,
            totalSessions: aggTotalSessions,
            usedSessions: aggUsedSessions,
            remainingSessions: aggRemainingSessions,
            totalMinutes: aggTotalMinutes,
            usedMinutes: aggUsedMinutes,
            remainingMinutes: aggRemainingMinutes,
            // Legacy fields mapping to primary subject
            subjectId: primarySubject ? primarySubject.subjectId : '',
            subjectName: primarySubject ? primarySubject.subjectName : '',
            minutesPerSession: primarySubject ? primarySubject.minutesPerSession : 50,
            status: aggRemainingMinutes <= 0 ? 'expired' : 'active',
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
            subjectId: chosenSubjectPkg.subjectId,
            subjectName: chosenSubjectPkg.subjectName,
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
          subjectId: chosenSubjectPkg.subjectId,
          subjectName: chosenSubjectPkg.subjectName,
        },
        createdAt: serverTimestamp(),
      })

      toast.success(`Đã duyệt lại môn ${chosenSubjectPkg.subjectName}, trừ ${reApprovingLesson.minutes} phút`)
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
  const displayPrimarySubject = activeSubjects.find((subject) => subject.remainingMinutes > 0) || activeSubjects[0] || null
  const reconciledStudent = {
    ...student,
    subjects: activeSubjects,
    totalSessions: activeSubjects.reduce((sum, subject) => sum + subject.totalSessions, 0),
    usedSessions: displayUsedSessions,
    remainingSessions: displayRemainingSessions,
    totalMinutes: totalMinutesFund,
    usedMinutes: usedMinutesFund,
    remainingMinutes,
    subjectId: displayPrimarySubject?.subjectId || '',
    subjectName: displayPrimarySubject?.subjectName || '',
    minutesPerSession: displayPrimarySubject?.minutesPerSession || mps,
    status: actualRemainingMinutes <= 0 ? 'expired' : student.status,
  }

  const handleChangeLessonSubject = async (lesson: Lesson, nextSubjectId: string) => {
    if (!student || !nextSubjectId || nextSubjectId === lesson.subjectId) return
    const nextSubject = activeSubjects.find((subject) => subject.subjectId === nextSubjectId)
    if (!nextSubject) {
      toast.error('Môn học được chọn không hợp lệ')
      return
    }

    setChangingSubjectLessonId(lesson.id)
    try {
      const payrollSnap = await getDocs(query(collection(db, 'payroll'), where('lessonId', '==', lesson.id)))
      const activePayrolls = payrollSnap.docs.filter((payrollDoc) => !payrollDoc.data().voided)
      if (activePayrolls.some((payrollDoc) => payrollDoc.data().paid === true)) {
        toast.warning('Lương buổi này đã thanh toán, không thể đổi môn học')
        return
      }

      const teacherLevel = liveRates.teacherLevel[lesson.teacherId] ?? lesson.teacherLevel ?? 1
      const pricePerMinute = nextSubject.pricePerMinute || liveRates.subjectPrice[nextSubjectId] || 0
      const salary = lesson.status === 'approved'
        ? calculateSalary(lesson.minutes, pricePerMinute, teacherLevel)
        : 0

      await runTransaction(db, async (tx) => {
        const lessonRef = doc(db, 'lessons', lesson.id)
        const studentRef = doc(db, 'students', student.id)
        const studentSnap = await tx.get(studentRef)
        const studentData = studentSnap.data()
        if (!studentData) throw new Error('Không tìm thấy học viên')

        let updatedSubjects: StudentSubject[] = studentData.subjects?.length
          ? studentData.subjects.map((subject: StudentSubject) => ({ ...subject }))
          : activeSubjects.map((subject) => ({ ...subject }))
        let sessionsBeforeApproval = lesson.sessionsBeforeApproval
        let sessionsAfterApproval = lesson.sessionsAfterApproval
        let minutesBeforeApproval = lesson.minutesBeforeApproval
        let minutesAfterApproval = lesson.minutesAfterApproval

        if (lesson.status === 'approved') {
          const oldIndex = updatedSubjects.findIndex((subject) => subject.subjectId === lesson.subjectId)
          const newIndex = updatedSubjects.findIndex((subject) => subject.subjectId === nextSubjectId)
          if (oldIndex === -1) {
            throw new Error(`Không tìm thấy gói môn cũ ${lesson.subjectName || lesson.subjectId}`)
          }
          if (newIndex === -1) throw new Error(`Không tìm thấy gói môn ${nextSubject.subjectName}`)

          const availableForNewSubject = updatedSubjects[newIndex].remainingMinutes || 0
          if (availableForNewSubject < lesson.minutes) {
            throw new Error(`Môn ${nextSubject.subjectName} không đủ ${lesson.minutes} phút khả dụng`)
          }

          updatedSubjects[oldIndex] = withUsedMinutes(
            updatedSubjects[oldIndex],
            updatedSubjects[oldIndex].usedMinutes - lesson.minutes,
          )
          sessionsBeforeApproval = updatedSubjects[newIndex].remainingSessions
          minutesBeforeApproval = updatedSubjects[newIndex].remainingMinutes
          updatedSubjects[newIndex] = withUsedMinutes(
            updatedSubjects[newIndex],
            updatedSubjects[newIndex].usedMinutes + lesson.minutes,
          )
          sessionsAfterApproval = updatedSubjects[newIndex].remainingSessions
          minutesAfterApproval = updatedSubjects[newIndex].remainingMinutes

          const totalSessions = updatedSubjects.reduce((sum, subject) => sum + subject.totalSessions, 0)
          const usedSessions = updatedSubjects.reduce((sum, subject) => sum + subject.usedSessions, 0)
          const remainingSessions = updatedSubjects.reduce((sum, subject) => sum + subject.remainingSessions, 0)
          const totalMinutes = updatedSubjects.reduce((sum, subject) => sum + subject.totalMinutes, 0)
          const usedMinutes = updatedSubjects.reduce((sum, subject) => sum + subject.usedMinutes, 0)
          const remainingMinutes = updatedSubjects.reduce((sum, subject) => sum + subject.remainingMinutes, 0)
          const primarySubject = updatedSubjects[0]

          tx.update(studentRef, {
            subjects: updatedSubjects,
            totalSessions,
            usedSessions,
            remainingSessions,
            totalMinutes,
            usedMinutes,
            remainingMinutes,
            subjectId: primarySubject?.subjectId || '',
            subjectName: primarySubject?.subjectName || '',
            minutesPerSession: primarySubject?.minutesPerSession || 50,
            status: remainingMinutes <= 0 ? 'expired' : 'active',
            updatedAt: serverTimestamp(),
          })
        }

        tx.update(lessonRef, {
          subjectId: nextSubject.subjectId,
          subjectName: nextSubject.subjectName,
          pricePerMinute,
          teacherLevel,
          salary,
          sessionsBeforeApproval,
          sessionsAfterApproval,
          minutesBeforeApproval,
          minutesAfterApproval,
          updatedAt: serverTimestamp(),
        })

        if (lesson.status === 'approved') {
          tx.set(doc(db, 'publicLessons', lesson.id), {
            subjectId: nextSubject.subjectId,
            subjectName: nextSubject.subjectName,
          }, { merge: true })
        }

        activePayrolls.forEach((payrollDoc) => {
          tx.update(payrollDoc.ref, {
            amount: salary,
            pricePerMinute,
            level: teacherLevel,
            subjectId: nextSubject.subjectId,
            subjectName: nextSubject.subjectName,
            recalculatedAt: serverTimestamp(),
            recalculatedBy: user?.uid || '',
          })
        })
      })

      await addDoc(collection(db, 'adminLogs'), {
        adminId: user?.uid || '',
        action: 'CHANGE_LESSON_SUBJECT',
        targetType: 'lesson',
        targetId: lesson.id,
        changes: {
          oldSubjectId: lesson.subjectId,
          oldSubjectName: lesson.subjectName,
          newSubjectId: nextSubject.subjectId,
          newSubjectName: nextSubject.subjectName,
          oldSalary: lesson.salary || 0,
          newSalary: salary,
          pricePerMinute,
        },
        createdAt: serverTimestamp(),
      })

      toast.success(`Đã đổi sang ${nextSubject.subjectName} và cập nhật lương ${salary.toLocaleString('vi-VN')}đ`)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Không thể đổi môn học')
    } finally {
      setChangingSubjectLessonId(null)
    }
  }

  const filteredHistoryLessons = lessons.filter((lesson) => {
    const actionType = lesson.status === 'approved' ? 'approved' : lesson.status === 'rejected' ? 'rejected' : 'pending'
    const salary = lesson.salary || 0
    const salaryMatches = historyFilters.salary === 'all'
      || (historyFilters.salary === 'positive' && salary > 0)
      || (historyFilters.salary === 'zero' && salary <= 0)

    return (selectedSubjectFilter === 'all' || lesson.subjectId === selectedSubjectFilter)
      && (!historyFilters.date || lesson.date.includes(historyFilters.date))
      && (!historyFilters.teacher || lesson.teacherName.toLowerCase().includes(historyFilters.teacher.toLowerCase()))
      && (historyFilters.subject === 'all' || lesson.subjectId === historyFilters.subject)
      && (!historyFilters.book || (lesson.book || '').toLowerCase().includes(historyFilters.book.toLowerCase()))
      && (historyFilters.minutes === 'all' || String(lesson.minutes) === historyFilters.minutes)
      && (!historyFilters.comment || (lesson.comment || '').toLowerCase().includes(historyFilters.comment.toLowerCase()))
      && salaryMatches
      && (historyFilters.status === 'all' || lesson.status === historyFilters.status)
      && (historyFilters.action === 'all' || actionType === historyFilters.action)
  })

  const trackingUrl = `${window.location.origin}/tracking?student=${student.code}`

  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-none">
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
              {student.classroomURL && (
                <div className="col-span-2 mt-1 flex items-center gap-1">
                  <span className="text-slate-500">Link phòng học: </span>
                  <a
                    href={student.classroomURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 underline font-medium inline-flex items-center gap-1"
                  >
                    Vào phòng học
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
              {student.textbookURL && (
                <div className="col-span-2 mt-1 flex items-center gap-1">
                  <span className="text-slate-500">Link sách học viên: </span>
                  <a
                    href={student.textbookURL.startsWith('http') ? student.textbookURL : `https://${student.textbookURL}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#3BB8EB] hover:text-[#2da8db] underline font-medium inline-flex items-center gap-1"
                  >
                    Xem sách học viên
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>Sửa</Button>
            <Button size="sm" variant="primary" onClick={() => setShowAddSessions(true)}>+ Thêm buổi</Button>
            {student.status === 'reserved' ? (
              <Button
                size="sm"
                loading={actioning}
                onClick={handleReactivateStudent}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                Kích hoạt lại
              </Button>
            ) : (
              <Button
                size="sm"
                loading={actioning}
                onClick={handleSuspendStudent}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold"
              >
                Bảo lưu
              </Button>
            )}
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
              {orphanMinutes > 0 && (
                <p className="text-amber-700 bg-amber-100/60 rounded-lg p-2.5 mt-2 font-medium leading-relaxed border border-amber-200/50">
                  ⚠️ Phát hiện <strong>{orphanMinutes} phút</strong> học ở môn không thuộc gói đăng ký của học viên (môn khác).
                  Hệ thống đã tự động khấu trừ số phút này vào các gói hiện có. Bấm nút dưới để đồng bộ vĩnh viễn vào cơ sở dữ liệu.
                </p>
              )}
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

      {/* Môn học đang học */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-900">Môn học đang học</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeSubjects.map((pkg) => {
            const pkgPct = pkg.totalMinutes > 0
              ? Math.min(100, Math.round((pkg.usedMinutes / pkg.totalMinutes) * 100))
              : 0;
            const hasHistory = lessons.some(l => l.subjectId === pkg.subjectId);
            const isExpanded = expandedSubjectId === pkg.subjectId;
            const studentCreatedAtFallback = student?.createdAt
              ? new Date((student.createdAt as any).seconds * 1000).toLocaleDateString('vi-VN')
              : new Date().toLocaleDateString('vi-VN');

            return (
              <Card key={pkg.subjectId} className="relative overflow-visible">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-indigo-500" />
                    <span className="font-bold text-slate-900 text-base">{pkg.subjectName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setEditingSubjectId(pkg.subjectId)
                        setShowSubjectPkg(true)
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
                      title="Chỉnh sửa"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteSubject(pkg.subjectId)}
                      disabled={hasHistory}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                      title={hasHistory ? "Không thể xóa môn học đã có lịch sử học" : "Xóa môn học"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {(() => {
                  const totalSessions25 = Math.floor(pkg.totalMinutes / 25)
                  const usedSessions25 = Math.floor(pkg.usedMinutes / 25)
                  const bookedMinutes = bookingRequests
                    .filter((b) => b.subjectId === pkg.subjectId && !b.lessonId)
                    .reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)
                  const bookedSessions25 = Math.floor(bookedMinutes / 25)
                  const availableMinutes = Math.max(0, pkg.remainingMinutes - bookedMinutes)
                  const availableSessions25 = Math.floor(availableMinutes / 25)

                  return (
                    <div className="grid grid-cols-4 gap-1.5 text-center bg-slate-50 rounded-xl p-3 mb-4 text-xs">
                      <div>
                        <p className="font-bold text-slate-700 text-[13px]">{totalSessions25}</p>
                        <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-none">Tổng buổi</p>
                        <p className="text-[9px] text-slate-400 mt-1 leading-none">{pkg.totalMinutes}p</p>
                      </div>
                      <div>
                        <p className="font-bold text-indigo-500 text-[13px]">{usedSessions25}</p>
                        <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-none">Đã học</p>
                        <p className="text-[9px] text-indigo-400 mt-1 leading-none">{pkg.usedMinutes}p</p>
                      </div>
                      <div>
                        <p className="font-bold text-amber-600 text-[13px]">{bookedSessions25}</p>
                        <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-none">Đã đặt</p>
                        <p className="text-[9px] text-amber-500 mt-1 leading-none">{bookedMinutes}p</p>
                      </div>
                      <div>
                        <p className={`font-bold text-[13px] ${availableSessions25 <= 0 ? 'text-rose-500' : availableSessions25 <= 3 ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {availableSessions25}
                        </p>
                        <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-none">Khả dụng</p>
                        <p className={`text-[9px] mt-1 leading-none ${availableMinutes <= 0 ? 'text-rose-400' : 'text-emerald-500'}`}>
                          {availableMinutes}p
                        </p>
                      </div>
                    </div>
                  )
                })()}

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span>Tiến độ học</span>
                    <span>{pkgPct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-300"
                      style={{ width: `${pkgPct}%` }}
                    />
                  </div>
                  <div className="flex flex-col gap-1 mt-1 text-[11px]">
                    <p className="text-slate-400">
                      Đơn giá gói: {formatPricePerMinute(pkg.pricePerMinute ?? 0, pkg.currency)}
                    </p>
                    {pkg.curriculumLink && (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">Giáo trình:</span>
                        <a
                          href={pkg.curriculumLink.startsWith('http') ? pkg.curriculumLink : `https://${pkg.curriculumLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-0.5"
                        >
                          Link giáo trình
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {pkg.supplementaryCurriculumLink && (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">Giáo trình bổ trợ:</span>
                        <a
                          href={pkg.supplementaryCurriculumLink.startsWith('http') ? pkg.supplementaryCurriculumLink : `https://${pkg.supplementaryCurriculumLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:text-emerald-800 font-semibold inline-flex items-center gap-0.5"
                        >
                          Link giáo trình bổ trợ
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {pkg.focusSkills && pkg.focusSkills.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className="text-slate-400 block w-full">Kỹ năng trọng tâm:</span>
                        {pkg.focusSkills.map((skill, idx) => (
                          <span key={idx} className="bg-indigo-50 border border-indigo-150 text-indigo-650 text-[10px] px-2 py-0.5 rounded-md font-bold">
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                    {pkg.studentRequests && pkg.studentRequests.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="text-slate-400 block w-full">Yêu cầu từ học viên:</span>
                        {pkg.studentRequests.map((req, idx) => (
                          <span key={idx} className="bg-rose-50 border border-rose-100 text-rose-600 text-[10px] px-2 py-0.5 rounded-md font-bold">
                            {req}
                          </span>
                        ))}
                      </div>
                    )}
                    {pkg.timetableNote && (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">Note timetable:</span>
                        <span className="text-slate-600 font-medium truncate max-w-[250px]" title={pkg.timetableNote}>{pkg.timetableNote}</span>
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2.5">
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">Các đợt nạp</p>
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                            <th className="p-2.5">Đợt</th>
                            <th className="p-2.5">Ngày nạp</th>
                            <th className="p-2.5">Gói buổi</th>
                            <th className="p-2.5">Đã học</th>
                            <th className="p-2.5">Còn lại</th>
                            <th className="p-2.5">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                          {(() => {
                            const totalSessions25 = Math.floor(pkg.totalMinutes / 25)
                            const usedSessions25 = Math.floor(pkg.usedMinutes / 25)
                            const rawBatches25 = pkg.batches && pkg.batches.length > 0
                              ? pkg.batches.map(b => ({
                                  id: b.id,
                                  createdAt: b.createdAt,
                                  totalSessions: Math.floor((b.totalSessions * pkg.minutesPerSession) / 25)
                                }))
                              : [{
                                  id: '1',
                                  createdAt: studentCreatedAtFallback,
                                  totalSessions: totalSessions25
                                }]

                            const computedBatches = calculateBatchesFIFO(
                              rawBatches25,
                              totalSessions25,
                              usedSessions25,
                              studentCreatedAtFallback
                            )

                            return computedBatches.map((batch) => (
                              <tr key={batch.id} className="hover:bg-slate-50/50">
                                <td className="p-2.5 text-slate-700 flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${batch.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                  #{batch.id}
                                </td>
                                <td className="p-2.5 text-slate-600">{batch.createdAt}</td>
                                <td className="p-2.5 text-slate-700">{batch.totalSessions} buổi</td>
                                <td className="p-2.5 text-indigo-600 font-semibold">{batch.usedSessions} buổi</td>
                                <td className={`p-2.5 font-semibold ${batch.remainingSessions > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                  {batch.remainingSessions} buổi
                                </td>
                                <td className="p-2.5">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    batch.status === 'active'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {batch.status === 'active' ? 'Đang học' : 'Hoàn tất'}
                                  </span>
                                </td>
                              </tr>
                            ))
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setExpandedSubjectId(isExpanded ? null : pkg.subjectId)}
                  className="w-full flex items-center justify-center gap-1 mt-4 pt-2.5 border-t border-slate-100 text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-slate-50/50 rounded-lg transition-colors"
                >
                  <span>{isExpanded ? 'Thu gọn lịch sử nạp' : 'Xem lịch sử các đợt nạp'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
              </Card>
            )
          })}

          <button
            onClick={() => {
              setEditingSubjectId(undefined)
              setShowSubjectPkg(true)
            }}
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-2xl hover:border-indigo-500 hover:text-indigo-600 text-slate-400 transition-all duration-200 min-h-[180px] bg-white hover:bg-slate-50/50"
          >
            <Plus className="w-6 h-6 mb-2" />
            <span className="font-semibold text-sm">Thêm môn học</span>
          </button>
        </div>
      </div>

      {/* Lịch học đã đặt Link Card */}
      <Card className="bg-slate-50 border border-slate-200/60 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
            <Calendar className="w-5 h-5 text-indigo-500" />
            Lịch học đã đặt
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Học viên này hiện có <strong>{futureBookings.length} ca học</strong> đã được giữ chỗ (gồm lịch sắp học và lịch chưa điểm danh).
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(`/admin/future-bookings?studentId=${id}`)}
          className="text-xs font-bold border-indigo-200 hover:border-indigo-500 text-indigo-600 hover:text-indigo-700 bg-white shadow-sm flex items-center gap-1 flex-shrink-0"
        >
          Xem & Quản lý lịch đặt ➔
        </Button>
      </Card>

      {/* Lesson history */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="text-base font-semibold text-slate-900">Lịch sử buổi học</h3>
          <div className="flex bg-slate-100/80 p-1 rounded-xl overflow-x-auto hide-scrollbar text-xs">
            <button
              onClick={() => setSelectedSubjectFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                selectedSubjectFilter === 'all'
                  ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              Tất cả môn
            </button>
            {activeSubjects.map((s) => (
              <button
                key={s.subjectId}
                onClick={() => setSelectedSubjectFilter(s.subjectId)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                  selectedSubjectFilter === s.subjectId
                    ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {s.subjectName}
              </button>
            ))}
          </div>
        </div>
        {lessons.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-8">Chưa có buổi học nào</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px] table-fixed text-sm">
              <colgroup>
                <col className="w-[120px]" />
                <col className="w-[150px]" />
                <col className="w-[230px]" />
                <col className="w-[180px]" />
                <col className="w-[85px]" />
                <col className="w-[320px]" />
                <col className="w-[140px]" />
                <col className="w-[130px]" />
                <col className="w-[260px]" />
              </colgroup>
              <thead className="border-b border-slate-200">
                <tr>
                  {['Ngày', 'Giáo viên', 'Môn học', 'Sách học', 'Phút', 'Nhận xét', 'Lương buổi', 'Trạng thái', 'Hành động'].map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
                <tr className="bg-slate-50/80 align-top">
                  <th className="px-2 pb-3">
                    <input type="date" value={historyFilters.date} onChange={(event) => setHistoryFilters((current) => ({ ...current, date: event.target.value }))} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium outline-none focus:border-indigo-400" />
                  </th>
                  <th className="px-2 pb-3">
                    <input value={historyFilters.teacher} onChange={(event) => setHistoryFilters((current) => ({ ...current, teacher: event.target.value }))} placeholder="Tên giáo viên" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-indigo-400" />
                  </th>
                  <th className="px-2 pb-3">
                    <select value={historyFilters.subject} onChange={(event) => setHistoryFilters((current) => ({ ...current, subject: event.target.value }))} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-indigo-400">
                      <option value="all">Tất cả môn</option>
                      {activeSubjects.map((subject) => <option key={subject.subjectId} value={subject.subjectId}>{subject.subjectName}</option>)}
                    </select>
                  </th>
                  <th className="px-2 pb-3">
                    <input value={historyFilters.book} onChange={(event) => setHistoryFilters((current) => ({ ...current, book: event.target.value }))} placeholder="Tên sách" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-indigo-400" />
                  </th>
                  <th className="px-2 pb-3">
                    <select value={historyFilters.minutes} onChange={(event) => setHistoryFilters((current) => ({ ...current, minutes: event.target.value }))} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-1 text-xs outline-none focus:border-indigo-400">
                      <option value="all">Tất cả</option>
                      {[0, 25, 50, 75, 100].map((minutes) => <option key={minutes} value={minutes}>{minutes}'</option>)}
                    </select>
                  </th>
                  <th className="px-2 pb-3">
                    <input value={historyFilters.comment} onChange={(event) => setHistoryFilters((current) => ({ ...current, comment: event.target.value }))} placeholder="Tìm trong nhận xét" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-indigo-400" />
                  </th>
                  <th className="px-2 pb-3">
                    <select value={historyFilters.salary} onChange={(event) => setHistoryFilters((current) => ({ ...current, salary: event.target.value }))} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-indigo-400">
                      <option value="all">Tất cả</option>
                      <option value="positive">Có lương</option>
                      <option value="zero">0đ / chưa tính</option>
                    </select>
                  </th>
                  <th className="px-2 pb-3">
                    <select value={historyFilters.status} onChange={(event) => setHistoryFilters((current) => ({ ...current, status: event.target.value }))} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-indigo-400">
                      <option value="all">Tất cả</option>
                      <option value="pending">Chờ duyệt</option>
                      <option value="approved">Đã duyệt</option>
                      <option value="rejected">Từ chối</option>
                    </select>
                  </th>
                  <th className="px-2 pb-3">
                    <div className="flex gap-2">
                      <select value={historyFilters.action} onChange={(event) => setHistoryFilters((current) => ({ ...current, action: event.target.value }))} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-indigo-400">
                        <option value="all">Tất cả thao tác</option>
                        <option value="approved">Có thể huỷ duyệt</option>
                        <option value="rejected">Có thể duyệt lại</option>
                        <option value="pending">Chờ xử lý</option>
                      </select>
                      <button type="button" onClick={() => setHistoryFilters({ date: '', teacher: '', subject: 'all', book: '', minutes: 'all', comment: '', salary: 'all', status: 'all', action: 'all' })} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-100">Xóa lọc</button>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredHistoryLessons.map((lesson) => (
                    <tr key={lesson.id} className="hover:bg-slate-100/20 transition-colors">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{lesson.date}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {lesson.teacherId ? (
                          <Link
                            to={`/admin/booking-schedules?teacherId=${lesson.teacherId}`}
                            className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                            title="Mở lịch xếp lớp của giáo viên này"
                          >
                            {lesson.teacherName}
                          </Link>
                        ) : (
                          lesson.teacherName
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <select
                          value={lesson.subjectId || ''}
                          onChange={(event) => handleChangeLessonSubject(lesson, event.target.value)}
                          disabled={changingSubjectLessonId === lesson.id || activeSubjects.length === 0}
                          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-wait disabled:opacity-60"
                          title="Đổi môn học và tính lại lương theo đơn giá gói môn"
                        >
                          {!activeSubjects.some((subject) => subject.subjectId === lesson.subjectId) && lesson.subjectId && (
                            <option value={lesson.subjectId}>{lesson.subjectName || 'Môn cũ'}</option>
                          )}
                          {activeSubjects.map((subject) => (
                            <option key={subject.subjectId} value={subject.subjectId}>
                              {subject.subjectName} · {formatPricePerMinute(subject.pricePerMinute, subject.currency)}
                            </option>
                          ))}
                        </select>
                      </td>
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
                                  {formatMoney(lesson.salary, lesson.currency)}
                                </span>
                                {drift && (
                                  <div className="text-[11px] text-amber-600 mt-0.5 font-normal">
                                    Giá hiện tại: {formatMoney(exp.salary, lesson.currency)}
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
                {filteredHistoryLessons.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                      Không có buổi học phù hợp với bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showEdit && <StudentFormModal student={reconciledStudent} onClose={() => setShowEdit(false)} />}
      {showAddSessions && <AddSessionsModal student={reconciledStudent} onClose={() => setShowAddSessions(false)} />}
      {showSubjectPkg && (
        <SubjectPackageModal
          student={reconciledStudent}
          editingSubjectId={editingSubjectId}
          onClose={() => {
            setShowSubjectPkg(false)
            setEditingSubjectId(undefined)
          }}
        />
      )}

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
                − {formatMoney(reversingLesson.salary || 0, reversingLesson.currency)}
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
                  {formatMoney(recalcLesson.lesson.pricePerMinute ?? 0, recalcLesson.lesson.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Giá/phút hiện tại</span>
                <span className="text-amber-700 font-semibold tabular-nums">
                  {formatMoney(recalcLesson.newPrice, recalcLesson.lesson.currency)}
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
                  {formatMoney(recalcLesson.lesson.salary ?? 0, recalcLesson.lesson.currency)} → {formatMoney(recalcLesson.newSalary, recalcLesson.lesson.currency)}
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
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 text-sm space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Chọn môn học áp dụng *</label>
              <select
                value={reApproveSubjectId}
                onChange={(e) => setReApproveSubjectId(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {activeSubjects.map((sub) => {
                  const isOutOfSessions = sub.remainingMinutes <= 0 || sub.remainingSessions <= 0
                  return (
                    <option key={sub.subjectId} value={sub.subjectId}>
                      {sub.subjectName} {isOutOfSessions ? '(Hết buổi)' : `(Còn ${sub.remainingSessions}b / ${sub.remainingMinutes}m)`} - {formatPricePerMinute(sub.pricePerMinute ?? 0, sub.currency)}
                    </option>
                  )
                })}
              </select>
            </div>
            
            <div className="space-y-1.5 border-t border-indigo-200/50 pt-2.5">
              <div className="flex justify-between">
                <span className="text-slate-600">Trừ quỹ phút</span>
                <span className="text-rose-600 font-semibold">− {reApprovingLesson.minutes} phút</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Lương giáo viên (tính theo môn đã chọn)</span>
                <span className="text-emerald-600 font-semibold">
                  {(() => {
                    const chosen = activeSubjects.find(s => s.subjectId === reApproveSubjectId)
                    const price = chosen?.pricePerMinute ?? 0
                    const teacherLevel = reApprovingLesson.teacherLevel ?? 1
                    return '+ ' + formatMoney(calculateSalary(reApprovingLesson.minutes, price, teacherLevel, chosen?.currency || 'VND'), chosen?.currency || 'VND')
                  })()}
                </span>
              </div>
              <div className="flex justify-between border-t border-indigo-200/30 pt-1.5 mt-1.5">
                <span className="text-slate-600">Trạng thái mới</span>
                <span className="text-slate-700 font-medium">Đã duyệt</span>
              </div>
            </div>
          </div>
        </ConfirmDialog>
      )}
    </div>
  )
}
