import { Fragment, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, query, where, onSnapshot, getDocs, doc, serverTimestamp, addDoc, updateDoc, runTransaction, getDoc, deleteField } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { BookingRequest, Payroll, Teacher, Lesson, Student, StudentSubject, PaymentSettings } from '@/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { getCurrentMonth, formatMoney } from '@/lib/constants'
import {
  normalizePayrollTaxPolicy,
  planPayrollTaxSettlement,
  storedPayrollSettlementAmounts,
  summarizePayrollTaxCurrency,
  type PayrollTaxCurrencySummary,
  type PayrollTaxPolicy,
} from '@/lib/payrollTax'
import { ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp, CheckSquare, Search, Gift, MinusCircle, Trash2, Undo2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { subMonths, format } from 'date-fns'
import { toast } from '@/stores/toastStore'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { setTeacherAttendanceAccess } from '@/hooks/useTeacherAttendanceFeature'
import { resolveLessonBookings } from '@/lib/lessonBooking'
import { getBookingPoints, getLessonPoints } from '@/lib/points'
import {
  assertAutomaticReconciliationRollbackAllowed,
  requiresIndividualSubjectReconciliation,
} from '@/lib/bookingLogic'
import { isZeroMinuteExcusedAbsence } from '@/lib/lessonAttendance'

function payrollCurrency(value?: string): string {
  return String(value || 'VND').toUpperCase()
}

function payrollCurrencySummaries(payrolls: Payroll[], policy: PayrollTaxPolicy, month: string): PayrollTaxCurrencySummary[] {
  return Array.from(new Set(payrolls.map((payroll) => payrollCurrency(payroll.currency))))
    .sort()
    .map((currency) => summarizePayrollTaxCurrency(payrolls, currency, policy, month))
}

function formatPayrollCurrencySummaries(
  summaries: PayrollTaxCurrencySummary[],
  amount: 'grossAmount' | 'netAmount',
): string {
  if (summaries.length === 0) return formatMoney(0, 'VND')
  return summaries.map((summary) => formatMoney(summary[amount], summary.currency)).join(' + ')
}

function createTaxSettlementId(teacherId: string, month: string, currency: string): string {
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `tax-${month}-${teacherId}-${currency}-${randomPart}`
}

export function PayrollPage() {
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()
  // Cho phép mở thẳng đúng tháng từ nơi khác (vd thẻ phiếu đánh giá đã cộng thưởng)
  const monthParam = searchParams.get('month') || ''
  const [month, setMonth] = useState(/^\d{4}-\d{2}$/.test(monthParam) ? monthParam : getCurrentMonth())
  const [payrolls, setPayrolls] = useState<Payroll[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [paying, setPaying] = useState(false)
  const [search, setSearch] = useState('')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [selectedLessonPayrollIds, setSelectedLessonPayrollIds] = useState<Set<string>>(new Set())
  const [returningToPending, setReturningToPending] = useState(false)
  const [savingAttendanceTeacherId, setSavingAttendanceTeacherId] = useState<string | null>(null)
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null)
  const [paymentSettingsLoaded, setPaymentSettingsLoaded] = useState(false)
  const taxPolicy = normalizePayrollTaxPolicy(paymentSettings)

  const prevMonth = () => {
    const d = new Date(month + '-01')
    setMonth(format(subMonths(d, 1), 'yyyy-MM'))
  }
  const nextMonth = () => {
    const d = new Date(month + '-01')
    const next = subMonths(d, -1)
    if (next <= new Date()) setMonth(format(next, 'yyyy-MM'))
  }

  const toggleTeacherAttendanceAccess = async (teacher: Teacher) => {
    if (savingAttendanceTeacherId) return
    const currentEnabled = teacher.attendancePageEnabled === true
    const nextEnabled = !currentEnabled
    const actionLabel = nextEnabled ? 'mở' : 'khóa'
    if (!window.confirm(
      `Xác nhận ${actionLabel} Điểm danh bù cho ${teacher.name}?\n\n`
      + (nextEnabled
        ? 'Gia sư này sẽ được phép điểm danh bù bằng mã học viên.'
        : 'Gia sư này sẽ không thể tạo buổi điểm danh bù mới; điểm danh từ Lịch dạy vẫn hoạt động bình thường.'),
    )) return

    setSavingAttendanceTeacherId(teacher.id)
    try {
      const updatedBy = user?.email || user?.uid || ''
      await setTeacherAttendanceAccess(teacher.id, nextEnabled, updatedBy)
      setTeachers((current) => current.map((item) => (
        item.id === teacher.id ? { ...item, attendancePageEnabled: nextEnabled } : item
      )))
      try {
        await addDoc(collection(db, 'adminLogs'), {
          adminId: user?.uid || '',
          action: 'TEACHER_ATTENDANCE_ACCESS_UPDATE',
          targetType: 'teacher',
          targetId: teacher.id,
          changes: { attendancePageEnabled: { before: currentEnabled, after: nextEnabled } },
          createdAt: serverTimestamp(),
        })
      } catch (logError) {
        console.error('Unable to write teacher attendance access log:', logError)
      }
      toast.success(nextEnabled ? `Đã mở Điểm danh bù cho ${teacher.name}` : `Đã khóa Điểm danh bù của ${teacher.name}`)
    } catch (error) {
      console.error('Unable to update teacher attendance access:', error)
      toast.error('Không thể cập nhật quyền Điểm danh bù')
    } finally {
      setSavingAttendanceTeacherId(null)
    }
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

  useEffect(() => onSnapshot(
    doc(db, 'paymentSettings', 'main'),
    (snap) => {
      setPaymentSettings(snap.exists() ? snap.data() as PaymentSettings : null)
      setPaymentSettingsLoaded(true)
    },
    (error) => {
      console.error('Unable to load payroll tax settings:', error)
      setPaymentSettingsLoaded(false)
    },
  ), [])

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
  
  const allCurrencySummaries = payrollCurrencySummaries(payrolls, taxPolicy, month)
  const grossTotalsLabel = formatPayrollCurrencySummaries(allCurrencySummaries, 'grossAmount')
  const netTotalsLabel = formatPayrollCurrencySummaries(allCurrencySummaries, 'netAmount')

  // Group payroll by teacher
  const teacherPayrolls = teachers.map((t) => {
    const tPayrolls = payrolls.filter((p) => p.teacherId === t.id)
    if (tPayrolls.length === 0) return null
    const currencySummaries = payrollCurrencySummaries(tPayrolls, taxPolicy, month)
    return {
      teacher: t,
      payrolls: tPayrolls,
      minutes: tPayrolls.reduce((s, p) => s + p.minutes, 0),
      paid: tPayrolls.every((p) => p.paid),
      isMixedCurrency: currencySummaries.length > 1,
      currencySummaries,
      grossLabel: formatPayrollCurrencySummaries(currencySummaries, 'grossAmount'),
      netLabel: formatPayrollCurrencySummaries(currencySummaries, 'netAmount'),
    }
  }).filter(Boolean) as {
    teacher: Teacher
    payrolls: Payroll[]
    minutes: number
    paid: boolean
    isMixedCurrency: boolean
    currencySummaries: PayrollTaxCurrencySummary[]
    grossLabel: string
    netLabel: string
  }[]

  const filteredTeacherPayrolls = teacherPayrolls.filter(tp => 
    tp.teacher.name.toLowerCase().includes(search.toLowerCase())
  )

  const selectableApprovedPayrolls = payrolls.filter((payroll) => {
    if (payroll.type === 'adjustment' || payroll.paid || !payroll.lessonId) return false
    return lessons.find((lesson) => lesson.id === payroll.lessonId)?.status === 'approved'
  })
  const allApprovedLessonsSelected = selectableApprovedPayrolls.length > 0
    && selectableApprovedPayrolls.every((payroll) => selectedLessonPayrollIds.has(payroll.id))

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

  const settleTeacherPayroll = async (teacherId: string) => {
    // Keep each teacher settlement within one Firestore transaction. A partial
    // batch would let a concurrent click write different tax snapshots.
    const candidatePayrolls = payrolls.filter((payroll) => payroll.teacherId === teacherId && !payroll.voided)
    if (candidatePayrolls.length === 0) return { settledPayrollCount: 0, manualReviewCount: 0 }
    if (candidatePayrolls.length > 449) {
      throw new Error('PAYROLL_SETTLEMENT_TOO_LARGE')
    }

    const payrollRefs = candidatePayrolls.map((payroll) => doc(db, 'payroll', payroll.id))
    const settingsRef = doc(db, 'paymentSettings', 'main')
    const logRef = doc(collection(db, 'adminLogs'))
    const settlementIds = new Map(
      Array.from(new Set(candidatePayrolls.map((payroll) => payrollCurrency(payroll.currency))))
        .map((currency) => [currency, createTaxSettlementId(teacherId, month, currency)]),
    )

    return runTransaction(db, async (transaction) => {
      const [settingsSnapshot, ...payrollSnapshots] = await Promise.all([
        transaction.get(settingsRef),
        ...payrollRefs.map((payrollRef) => transaction.get(payrollRef)),
      ])
      const currentPolicy = normalizePayrollTaxPolicy(
        settingsSnapshot.exists() ? settingsSnapshot.data() as PaymentSettings : null,
      )
      const currentPayrolls = payrollSnapshots.flatMap((snapshot) => {
        if (!snapshot.exists()) return []
        return [{ id: snapshot.id, ...snapshot.data() } as Payroll]
      }).filter((payroll) => payroll.teacherId === teacherId && !payroll.voided)
      const currentUnpaidPayrolls = currentPayrolls.filter((payroll) => payroll.paid !== true)
      if (currentUnpaidPayrolls.length === 0) return { settledPayrollCount: 0, manualReviewCount: 0 }

      const settlementAudit: Array<{
        currency: string
        grossAmount: number
        taxAmount: number
        netAmount: number
        taxableMonthGrossAmount: number
        taxableMonthTaxAmount: number
        previouslyWithheldAmount: number
        unallocatedTaxAmount: number
        overwithheldTaxAmount: number
      }> = []
      let manualReviewCount = 0

      for (const currency of Array.from(new Set(currentUnpaidPayrolls.map((payroll) => payrollCurrency(payroll.currency)))).sort()) {
        const currencyPayrolls = currentPayrolls.filter((payroll) => payrollCurrency(payroll.currency) === currency)
        const plan = planPayrollTaxSettlement(currencyPayrolls, currency, currentPolicy, month)
        const settlementId = settlementIds.get(currency) || createTaxSettlementId(teacherId, month, currency)
        const lineSettlements = new Map(plan.lineSettlements.map((line) => [line.payrollId, line]))
        const taxSettlement = {
          id: settlementId,
          version: 'monthly-gross-v1' as const,
          month,
          currency,
          grossAmount: plan.grossAmount,
          taxAmount: plan.taxAmount,
          netAmount: plan.netAmount,
          taxableMonthGrossAmount: plan.taxableMonthGrossAmount,
          taxableMonthTaxAmount: plan.taxableMonthTaxAmount,
          previouslyWithheldAmount: plan.previouslyWithheldAmount,
          policy: {
            version: 'monthly-gross-v1' as const,
            enabled: plan.policy.enabled,
            thresholdAmount: plan.policy.thresholdAmount,
            ratePercent: plan.policy.ratePercent,
            mode: plan.policy.mode || 'percent',
            fixedAmount: plan.policy.fixedAmount || 0,
            currency: plan.policy.currency,
            ...(plan.policy.effectiveFromMonth ? { effectiveFromMonth: plan.policy.effectiveFromMonth } : {}),
          },
          settledAt: serverTimestamp(),
          settledBy: user?.uid || user?.email || '',
        }

        for (const payroll of currencyPayrolls.filter((item) => item.paid !== true)) {
          const lineSettlement = lineSettlements.get(payroll.id)
          if (!lineSettlement) throw new Error('PAYROLL_TAX_SETTLEMENT_MISSING_LINE')
          transaction.update(doc(db, 'payroll', payroll.id), {
            paid: true,
            paidAt: serverTimestamp(),
            taxWithheldAmount: lineSettlement.taxWithheldAmount,
            netPaidAmount: lineSettlement.netPaidAmount,
            taxSettlement,
          })
        }

        settlementAudit.push({
          currency,
          grossAmount: plan.grossAmount,
          taxAmount: plan.taxAmount,
          netAmount: plan.netAmount,
          taxableMonthGrossAmount: plan.taxableMonthGrossAmount,
          taxableMonthTaxAmount: plan.taxableMonthTaxAmount,
          previouslyWithheldAmount: plan.previouslyWithheldAmount,
          unallocatedTaxAmount: plan.unallocatedTaxAmount,
          overwithheldTaxAmount: plan.overwithheldTaxAmount,
        })
        if (plan.unallocatedTaxAmount > 0 || plan.overwithheldTaxAmount > 0) manualReviewCount += 1
      }

      transaction.set(logRef, {
        adminId: user?.uid || '',
        action: 'MARK_PAID',
        targetType: 'payroll',
        targetId: teacherId,
        changes: {
          month,
          teacherId,
          settledPayrollCount: currentUnpaidPayrolls.length,
          taxSettlementVersion: 'monthly-gross-v1',
          taxSettlements: settlementAudit,
        },
        createdAt: serverTimestamp(),
      })

      return { settledPayrollCount: currentUnpaidPayrolls.length, manualReviewCount }
    })
  }

  const handleMarkPaid = async () => {
    if (selected.size === 0) return
    if (!paymentSettingsLoaded) {
      toast.warning('Đang tải cấu hình thuế TNCN. Vui lòng chờ trước khi thanh toán.')
      return
    }

    setPaying(true)
    try {
      const results = await Promise.allSettled(
        Array.from(selected).map((teacherId) => settleTeacherPayroll(teacherId)),
      )
      const successful = results.filter((result): result is PromiseFulfilledResult<{ settledPayrollCount: number; manualReviewCount: number }> => result.status === 'fulfilled')
      const settledTeachers = successful.filter((result) => result.value.settledPayrollCount > 0)
      const manualReviewCount = successful.reduce((sum, result) => sum + result.value.manualReviewCount, 0)
      const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      failed.forEach((result) => console.error('Unable to settle payroll:', result.reason))

      if (settledTeachers.length > 0) {
        toast.success(`Đã đánh dấu thanh toán và lưu snapshot thuế cho ${settledTeachers.length} gia sư`)
      }
      if (manualReviewCount > 0) {
        toast.warning(`${manualReviewCount} khoản cần kế toán kiểm tra thuế thủ công; hệ thống không tự hoàn/trừ bù.`)
      }
      if (failed.length > 0) {
        const oversizedSettlements = failed.filter((result) => (
          result.reason instanceof Error && result.reason.message === 'PAYROLL_SETTLEMENT_TOO_LARGE'
        )).length
        if (oversizedSettlements > 0) {
          toast.error(`${oversizedSettlements} gia sư có hơn 449 dòng lương trong tháng nên chưa được chốt; cần tách/đối soát thủ công để giữ giao dịch nguyên tử.`)
        }
        if (failed.length > oversizedSettlements) {
          toast.error(`${failed.length - oversizedSettlements} gia sư chưa được thanh toán. Mỗi gia sư lỗi không có khoản nào bị ghi dở dang; các gia sư báo thành công đã được chốt.`)
        }
      }
      setSelected(new Set())
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

  const moveApprovedLessonToPending = async (lessonId: string): Promise<boolean> => {
    try {
      const lessonRef = doc(db, 'lessons', lessonId)
      const lessonSnap = await getDoc(lessonRef)
      if (!lessonSnap.exists()) return false
      const lesson = { id: lessonSnap.id, ...lessonSnap.data() } as Lesson
      if (lesson.status !== 'approved') return false
      if (requiresIndividualSubjectReconciliation(lesson)) {
        toast.warning('Buổi đối soát cần quản trị dữ liệu thủ công, chưa thay đổi gì.')
        return false
      }

      const payrollSnap = await getDocs(query(collection(db, 'payroll'), where('lessonId', '==', lessonId)))
      const activePayrollRefs = payrollSnap.docs.filter((item) => !item.data().voided).map((item) => item.ref)
      if (activePayrollRefs.length === 0) return false
      const bookingsToReopen = await resolveLessonBookings({
        id: lesson.id,
        bookingRequestId: lesson.bookingRequestId,
        bookingRequestIds: lesson.bookingRequestIds,
        scheduleCheck: lesson.scheduleCheck,
        studentId: lesson.studentId,
        teacherId: lesson.teacherId,
        date: lesson.date,
        minutes: lesson.minutes,
        subjectId: lesson.subjectId,
        subjectName: lesson.subjectName,
        groupClassId: lesson.groupClassId,
        bookingSubjectReconciliation: lesson.bookingSubjectReconciliation,
        isZeroMinuteExcusedAbsence: isZeroMinuteExcusedAbsence(lesson),
      }, { purpose: 'rollback' })
      const bookingRefsToReopen = bookingsToReopen.map((booking) => doc(db, 'bookingRequests', booking.id))

      await runTransaction(db, async (tx) => {
        const studentRef = doc(db, 'students', lesson.studentId)
        const teacherRef = doc(db, 'teachers', lesson.teacherId)
        const reads = await Promise.all([
          tx.get(lessonRef),
          tx.get(studentRef),
          tx.get(teacherRef),
          ...activePayrollRefs.map((ref) => tx.get(ref)),
          ...bookingRefsToReopen.map((ref) => tx.get(ref)),
        ])
        const [currentLessonSnap, studentSnap, teacherSnap] = reads
        const currentPayrollSnaps = reads.slice(3, 3 + activePayrollRefs.length)
        const bookingSnapsToReopen = reads.slice(3 + activePayrollRefs.length)
        if (!currentLessonSnap.exists() || !studentSnap.exists()) throw new Error('Dữ liệu buổi học hoặc học viên không còn tồn tại')
        const currentLesson = currentLessonSnap.data() as Lesson
        if (currentLesson.status !== 'approved') throw new Error('Buổi học đã được xử lý trước đó')
        if (
          currentLesson.studentId !== lesson.studentId
          || currentLesson.teacherId !== lesson.teacherId
          || currentLesson.date !== lesson.date
          || Number(currentLesson.minutes) !== Number(lesson.minutes)
          || currentLesson.subjectId !== lesson.subjectId
          || (currentLesson.groupClassId || '') !== (lesson.groupClassId || '')
        ) throw new Error('BOOKING_STATE_CHANGED')
        assertAutomaticReconciliationRollbackAllowed(currentLesson)
        const teacherCurrent = teacherSnap.exists() ? teacherSnap.data() as Teacher : null
        const paidPayroll = currentPayrollSnaps.find(
          (payroll) => payroll.exists() && payroll.data()?.paid === true && !payroll.data()?.voided,
        )
        const paidPayrollData = paidPayroll?.data()
        const bookingsEligibleToReopen = bookingSnapsToReopen.flatMap((bookingSnap) => {
          if (!bookingSnap.exists()) return []
          const booking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
          return booking.status === 'completed' && booking.lessonId === lessonId ? [booking] : []
        })
        const lessonPoints = getLessonPoints(currentLesson, teacherCurrent)
        const heldPointsToRestore = currentLesson.bookingHoldConsumed === true
          ? bookingsEligibleToReopen.reduce((sum, booking) => sum + getBookingPoints(booking, teacherCurrent), 0)
          : 0

        const studentData = studentSnap.data() as Student
        const updatedSubjects: StudentSubject[] = studentData.subjects && studentData.subjects.length > 0
          ? studentData.subjects.map((subject) => ({ ...subject }))
          : studentData.subjectId
            ? [{
                subjectId: studentData.subjectId,
                subjectName: studentData.subjectName || 'Chưa rõ',
                totalSessions: studentData.totalSessions || 0,
                usedSessions: studentData.usedSessions || 0,
                remainingSessions: studentData.remainingSessions || 0,
                minutesPerSession: studentData.minutesPerSession || 50,
                totalMinutes: studentData.totalMinutes ?? ((studentData.totalSessions || 0) * (studentData.minutesPerSession || 50)),
                usedMinutes: studentData.usedMinutes ?? ((studentData.usedSessions || 0) * (studentData.minutesPerSession || 50)),
                remainingMinutes: studentData.remainingMinutes ?? ((studentData.remainingSessions || 0) * (studentData.minutesPerSession || 50)),
                pricePerMinute: currentLesson.pricePerMinute || 0,
              }]
            : []

        const subjectIndex = updatedSubjects.findIndex((subject) => subject.subjectId === currentLesson.subjectId)
        if (subjectIndex === -1) throw new Error('Không tìm thấy gói giáo trình của buổi học')
        const subject = updatedSubjects[subjectIndex]
        const usedMinutes = Math.max(0, subject.usedMinutes - lessonPoints)
        const minutesPerSession = subject.minutesPerSession || 50
        const usedSessionsRaw = usedMinutes / minutesPerSession
        updatedSubjects[subjectIndex] = {
          ...subject,
          usedMinutes,
          remainingMinutes: Math.max(0, subject.totalMinutes - usedMinutes),
          usedSessions: Math.abs(usedSessionsRaw - Math.round(usedSessionsRaw)) < 0.001 ? Math.round(usedSessionsRaw) : Math.round(usedSessionsRaw * 100) / 100,
          remainingSessions: Math.floor(Math.max(0, subject.totalMinutes - usedMinutes) / minutesPerSession),
        }

        const totalSessions = updatedSubjects.reduce((sum, subjectItem) => sum + subjectItem.totalSessions, 0)
        const usedSessions = updatedSubjects.reduce((sum, subjectItem) => sum + subjectItem.usedSessions, 0)
        const remainingSessions = updatedSubjects.reduce((sum, subjectItem) => sum + subjectItem.remainingSessions, 0)
        const totalMinutes = updatedSubjects.reduce((sum, subjectItem) => sum + subjectItem.totalMinutes, 0)
        const usedMinutesTotal = updatedSubjects.reduce((sum, subjectItem) => sum + subjectItem.usedMinutes, 0)
        const remainingMinutes = updatedSubjects.reduce((sum, subjectItem) => sum + subjectItem.remainingMinutes, 0)
        const primarySubject = updatedSubjects[0]
        const currentHeldMinutes = Number(studentData.reservedMinutes ?? studentData.heldMinutes ?? 0) || 0
        const nextHeldMinutes = currentHeldMinutes + heldPointsToRestore
        if (nextHeldMinutes > remainingMinutes) throw new Error('Phần kim cương cần giữ vượt quỹ còn lại; hãy đối soát học viên trước')

        tx.update(lessonRef, {
          status: 'pending',
          salary: 0,
          approvedAt: null,
          approvedBy: null,
          rejectedReason: null,
          sessionsBeforeApproval: 0,
          sessionsAfterApproval: 0,
          minutesBeforeApproval: 0,
          minutesAfterApproval: 0,
          bookingHoldConsumed: false,
          ...(paidPayrollData ? {
            payrollPaidBeforeReopen: true,
            payrollPaidAmount: Number(paidPayrollData.amount || 0),
            payrollPaidCurrency: String(paidPayrollData.currency || currentLesson.currency || 'VND'),
            ...(paidPayrollData.paidAt ? { payrollPaidAt: paidPayrollData.paidAt } : {}),
            ...(Number.isFinite(Number(paidPayrollData.taxWithheldAmount)) ? {
              payrollPaidTaxWithheldAmount: Number(paidPayrollData.taxWithheldAmount),
            } : {}),
            ...(Number.isFinite(Number(paidPayrollData.netPaidAmount)) ? {
              payrollPaidNetAmount: Number(paidPayrollData.netPaidAmount),
            } : {}),
            ...(paidPayrollData.taxSettlement ? { payrollPaidTaxSettlement: paidPayrollData.taxSettlement } : {}),
          } : {}),
          updatedAt: serverTimestamp(),
        })
        tx.update(studentRef, {
          subjects: updatedSubjects,
          totalSessions,
          usedSessions,
          remainingSessions,
          totalMinutes,
          usedMinutes: usedMinutesTotal,
          remainingMinutes,
          reservedMinutes: nextHeldMinutes,
          heldMinutes: nextHeldMinutes,
          subjectId: primarySubject?.subjectId || '',
          subjectName: primarySubject?.subjectName || '',
          minutesPerSession: primarySubject?.minutesPerSession || 50,
          status: remainingMinutes <= 0 ? 'expired' : 'active',
          updatedAt: serverTimestamp(),
        })
        bookingSnapsToReopen.forEach((bookingSnap) => {
          if (!bookingSnap.exists()) return
          const booking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
          if (booking.status !== 'completed' || booking.lessonId !== lessonId) return
          tx.update(bookingSnap.ref, {
            status: 'confirmed',
            lessonId: deleteField(),
            completedAt: deleteField(),
            updatedAt: serverTimestamp(),
          })
        })
        tx.delete(doc(db, 'publicLessons', lessonId))
        currentPayrollSnaps.forEach((payroll) => {
          if (payroll.exists() && !payroll.data()?.voided) {
            if (payroll.data()?.paid === true) {
              tx.update(payroll.ref, {
                lessonReviewReopened: true,
                lessonReviewReopenedAt: serverTimestamp(),
                lessonReviewReopenedBy: user?.uid || '',
              })
            } else {
              tx.update(payroll.ref, {
                voided: true,
                amount: 0,
                voidedAt: serverTimestamp(),
                voidedBy: user?.uid || '',
              })
            }
          }
        })
      })
      return true
    } catch (error) {
      console.error('Error returning lesson to pending:', error)
      if (error instanceof Error && error.message === 'RECONCILIATION_MANUAL_ROLLBACK_REQUIRED') {
        toast.warning('Buổi đối soát cần quản trị dữ liệu thủ công, chưa thay đổi gì.')
      }
      return false
    }
  }

  const togglePayrollLesson = (payrollId: string) => {
    setSelectedLessonPayrollIds((current) => {
      const next = new Set(current)
      if (next.has(payrollId)) next.delete(payrollId)
      else next.add(payrollId)
      return next
    })
  }

  const toggleAllApprovedLessons = () => {
    setSelectedLessonPayrollIds((current) => {
      const next = new Set(current)
      if (allApprovedLessonsSelected) selectableApprovedPayrolls.forEach((payroll) => next.delete(payroll.id))
      else selectableApprovedPayrolls.forEach((payroll) => next.add(payroll.id))
      return next
    })
  }

  const handleBulkReturnToPending = async () => {
    const selectedPayrolls = payrolls.filter((payroll) => selectedLessonPayrollIds.has(payroll.id))
    const lessonIds = Array.from(new Set(selectedPayrolls.map((payroll) => payroll.lessonId).filter(Boolean)))
    if (lessonIds.length === 0) return
    const protectedLessonIds = new Set(
      lessons
        .filter((lesson) => requiresIndividualSubjectReconciliation(lesson))
        .map((lesson) => lesson.id),
    )
    const safeLessonIds = lessonIds.filter((lessonId) => !protectedLessonIds.has(lessonId))
    const protectedCount = lessonIds.length - safeLessonIds.length
    if (safeLessonIds.length === 0) {
      toast.warning('Các buổi đã chọn có đối soát môn lịch cũ cần quản trị dữ liệu thủ công, chưa thay đổi gì.')
      return
    }
    if (!window.confirm(`Chuyển ${safeLessonIds.length} buổi đã duyệt về chờ duyệt? Hệ thống sẽ hoàn lại phút cho học viên và bỏ các dòng lương chưa thanh toán.`)) return

    setReturningToPending(true)
    let changed = 0
    let skipped = 0
    try {
      for (const lessonId of safeLessonIds) {
        if (await moveApprovedLessonToPending(lessonId)) changed += 1
        else skipped += 1
      }
      if (changed > 0) {
        await addDoc(collection(db, 'adminLogs'), {
          adminId: user?.uid || '',
          action: 'BULK_RETURN_LESSONS_TO_PENDING',
          targetType: 'payroll',
          targetId: month,
          changes: { month, lessonIds: safeLessonIds.slice(0, 100), count: changed, protectedReconciliationCount: protectedCount },
          createdAt: serverTimestamp(),
        })
        toast.success(`Đã chuyển ${changed} buổi về chờ duyệt`)
      }
      if (skipped > 0) toast.warning(`${skipped} buổi không thể chuyển vì dữ liệu đã thay đổi hoặc không còn hợp lệ`)
      if (protectedCount > 0) toast.warning(`Đã bỏ qua ${protectedCount} buổi có đối soát; cần quản trị dữ liệu thủ công.`)
      setSelectedLessonPayrollIds(new Set())
    } catch (error) {
      console.error('Error bulk returning lessons to pending:', error)
      toast.error('Không thể chuyển hàng loạt. Vui lòng thử lại.')
    } finally {
      setReturningToPending(false)
    }
  }

  const exportCSV = () => {
    const rows = [
      ['Teacher', 'Level', 'Minutes', 'Settlement status', 'Gross', 'Tax', 'Net', 'Currency', 'Tax source'],
      ...teacherPayrolls.flatMap((teacherPayroll) => {
        return teacherPayroll.currencySummaries.map((summary) => {
          const minutes = teacherPayroll.payrolls
            .filter((payroll) => payrollCurrency(payroll.currency) === summary.currency)
            .reduce((sum, payroll) => sum + payroll.minutes, 0)
          const settlementStatus = summary.source === 'stored'
            ? 'Đã thanh toán (snapshot)'
            : summary.source === 'live'
              ? 'Chưa thanh toán (ước tính)'
              : 'Đã thanh toán + chưa thanh toán'
          const sourceParts = [
            summary.hasPaidLines ? 'đã trả: snapshot đã lưu' : '',
            summary.hasUnpaidLines ? 'chưa trả: policy hiện tại' : '',
            summary.hasLegacyPaidLines ? 'có dòng cũ: gross=net' : '',
            summary.unallocatedTaxAmount > 0 || summary.overwithheldTaxAmount > 0 ? 'cần kế toán kiểm tra' : '',
          ].filter(Boolean)
          return [
            teacherPayroll.teacher.name,
            teacherPayroll.teacher.level,
            minutes,
            settlementStatus,
            summary.grossAmount,
            summary.taxAmount,
            summary.netAmount,
            summary.currency,
            sourceParts.join('; '),
          ]
        })
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
          <h1 className="text-2xl font-bold text-slate-900">Lương gia sư</h1>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="primary" onClick={handleMarkPaid} loading={paying} disabled={!paymentSettingsLoaded} title={paymentSettingsLoaded ? undefined : 'Đang tải cấu hình thuế TNCN'}>
              <CheckSquare className="w-4 h-4" />
              Đánh dấu đã trả ({selected.size})
            </Button>
          )}
          {selectedLessonPayrollIds.size > 0 && (
            <Button variant="outline" onClick={handleBulkReturnToPending} loading={returningToPending} className="border-amber-300 text-amber-700 hover:bg-amber-50">
              <Undo2 className="w-4 h-4" />
              Chuyển chờ duyệt ({selectedLessonPayrollIds.size})
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
            placeholder="Tìm gia sư..."
            leftIcon={<Search className="w-4 h-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
        </div>
      </div>

      {/* Total */}
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <p className="text-sm text-slate-500">Tổng lương thực nhận {monthLabel}</p>
        <p className="text-4xl font-bold text-emerald-400 mt-1">{netTotalsLabel}</p>
        <p className="text-xs text-slate-500 mt-1">Gross: {grossTotalsLabel}</p>
        <p className="text-xs text-slate-500 mt-1">{teacherPayrolls.length} gia sư · {payrolls.length} buổi dạy</p>
        <p className="text-[11px] text-slate-400 italic mt-2">
          {!paymentSettingsLoaded
            ? 'Đang tải cấu hình thuế TNCN; chưa thể chốt thanh toán.'
            : taxPolicy.enabled
            ? `* Thuế ${taxPolicy.ratePercent}% chỉ áp dụng cho ${taxPolicy.currency} vượt ${formatMoney(taxPolicy.thresholdAmount, taxPolicy.currency)} theo cấu hình.`
            : '* Khấu trừ thuế TNCN hiện đang tắt trong Cài đặt.'}
        </p>
        {allCurrencySummaries.some((summary) => summary.source === 'mixed') && (
          <p className="text-[11px] text-slate-500 mt-1">Dòng đã trả dùng snapshot đã lưu; phần chưa trả là ước tính theo cấu hình hiện tại.</p>
        )}
        {allCurrencySummaries.some((summary) => summary.hasLegacyPaidLines) && (
          <p className="text-[11px] text-amber-700 mt-1">Dòng đã trả từ trước khi có snapshot được giữ nguyên Gross = Net; hệ thống không suy đoán lại khoản đã chuyển.</p>
        )}
        {allCurrencySummaries.some((summary) => summary.hasPaidSettlementMonthMismatch) && (
          <p className="text-[11px] text-amber-700 mt-1">Có khoản đã chốt được chuyển sang tháng báo cáo khác; khoản đó không được dùng để bù thuế của tháng này và cần kế toán đối soát.</p>
        )}
      </Card>

      {selectableApprovedPayrolls.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-amber-950">
            <input
              type="checkbox"
              checked={allApprovedLessonsSelected}
              ref={(element) => { if (element) element.indeterminate = !allApprovedLessonsSelected && selectedLessonPayrollIds.size > 0 }}
              onChange={toggleAllApprovedLessons}
              className="h-4 w-4 accent-amber-600"
            />
            Chọn các buổi đã duyệt, chưa thanh toán ({selectableApprovedPayrolls.length})
          </label>
          {selectedLessonPayrollIds.size > 0 && (
            <span className="text-xs font-bold text-amber-800">
              Đã chọn {selectedLessonPayrollIds.size} buổi — sẽ hoàn phút và chuyển về chờ duyệt
            </span>
          )}
        </div>
      )}

      {/* Select all */}
      {filteredTeacherPayrolls.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-5 py-3">
          <label className={`flex items-center gap-2.5 text-sm font-medium select-none ${unpaidTeacherIds.length === 0 ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 cursor-pointer'}`}>
            <input
              type="checkbox"
              aria-label="Chọn tất cả gia sư chưa trả lương"
              checked={allUnpaidSelected}
              disabled={unpaidTeacherIds.length === 0}
              ref={(el) => { if (el) el.indeterminate = !allUnpaidSelected && selected.size > 0 }}
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-indigo-500"
            />
            Chọn tất cả chưa trả ({unpaidTeacherIds.length} gia sư)
          </label>
          {selected.size > 0 && (
            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1">
              Đã chọn {selected.size} gia sư — bấm "Đánh dấu đã trả" để thanh toán 1 lần
            </span>
          )}
        </div>
      )}

      {/* Per teacher */}
      <div className="space-y-3">
        {filteredTeacherPayrolls.map(({ teacher, payrolls: tp, minutes, paid, isMixedCurrency, currencySummaries, grossLabel, netLabel }) => (
          <Card key={teacher.id} padding="none">
            <div
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-100/20 transition-colors"
              onClick={() => setExpanded(expanded === teacher.id ? null : teacher.id)}
            >
              <input
                type="checkbox"
                aria-label={`Chọn gia sư ${teacher.name}`}
                checked={selected.has(teacher.id)}
                disabled={paid}
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
                <button
                  type="button"
                  role="switch"
                  aria-checked={teacher.attendancePageEnabled === true}
                  aria-label={`${teacher.attendancePageEnabled === true ? 'Khóa' : 'Mở'} Điểm danh bù cho ${teacher.name}`}
                  title={`${teacher.attendancePageEnabled === true ? 'Đang mở' : 'Đang khóa'} Điểm danh bù`}
                  disabled={savingAttendanceTeacherId === teacher.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    void toggleTeacherAttendanceAccess(teacher)
                  }}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black transition focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-wait disabled:opacity-60 ${
                    teacher.attendancePageEnabled === true
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {teacher.attendancePageEnabled === true ? <ShieldCheck className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                  <span className="hidden xl:inline">Điểm danh bù</span>
                  <span>{savingAttendanceTeacherId === teacher.id ? 'Đang lưu' : teacher.attendancePageEnabled === true ? 'Mở' : 'Khóa'}</span>
                </button>
                <Badge variant={paid ? 'success' : 'warning'}>
                  {paid ? 'Đã trả' : 'Chưa trả'}
                </Badge>
                {(() => {
                  if (isMixedCurrency) {
                    return (
                      <div className="text-right">
                        <p className="text-emerald-500 font-bold text-sm">{netLabel}</p>
                        <p className="text-[10px] text-slate-400">Gross: {grossLabel}</p>
                      </div>
                    )
                  }
                  const summary = currencySummaries[0]
                  if (!summary) return null
                  return (
                    <div className="text-right flex flex-col justify-end items-end">
                      <p className="text-[10px] text-slate-400 leading-none">Gross: {formatMoney(summary.grossAmount, summary.currency)}</p>
                      <p className="text-emerald-500 font-bold text-sm leading-tight mt-0.5">Net: {formatMoney(summary.netAmount, summary.currency)}</p>
                      {summary.taxAmount !== 0 && <p className="text-[9px] text-rose-500 italic font-medium leading-none mt-0.5">-{formatMoney(summary.taxAmount, summary.currency)} thuế</p>}
                      {summary.source === 'mixed' && <p className="text-[9px] text-slate-400 mt-0.5">Đã chốt + ước tính</p>}
                      {summary.hasLegacyPaidLines && <p className="text-[9px] text-amber-600 mt-0.5">Có dòng cũ chưa snapshot</p>}
                      {summary.hasPaidSettlementMonthMismatch && <p className="text-[9px] text-amber-600 mt-0.5">Có dòng đã chốt lệch tháng báo cáo</p>}
                    </div>
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
                      <th className="w-10 px-3 py-2.5" />
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Học sinh</th>
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Ngày</th>
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Phút</th>
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Giá/phút</th>
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Level</th>
                      <th className="text-right px-5 py-2.5 text-slate-500 font-medium">Lương (Gross / Net)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Nhóm 1: các buổi học (điểm danh) */}
                    {tp.filter((p) => p.type !== 'adjustment').map((p) => {
                      const lesson = lessons.find(l => l.id === p.lessonId)
                      const isSelectable = !!lesson && lesson.status === 'approved' && !p.paid
                      const settledAmounts = p.paid ? storedPayrollSettlementAmounts(p) : null
                      return (
                        <tr key={p.id} className="border-b border-slate-200/30 hover:bg-slate-100/10">
                          <td className="px-3 py-2.5">
                            {isSelectable && (
                              <input
                                type="checkbox"
                                checked={selectedLessonPayrollIds.has(p.id)}
                                onChange={() => togglePayrollLesson(p.id)}
                                aria-label={`Chọn buổi học của ${lesson.studentName}`}
                                className="h-4 w-4 accent-amber-600"
                              />
                            )}
                          </td>
                          <td className="px-5 py-2.5 text-slate-700 font-medium">{lesson?.studentName || '—'}</td>
                          <td className="px-5 py-2.5 text-slate-600">{lesson?.date || '—'}</td>
                          <td className="px-5 py-2.5 text-slate-600">{p.minutes}'</td>
                          <td className="px-5 py-2.5 text-slate-600">{formatMoney(p.pricePerMinute, p.currency)}</td>
                          <td className="px-5 py-2.5 text-slate-600">×{p.level}</td>
                          <td className="px-5 py-2.5 text-right font-medium">
                            <p className="text-emerald-500">{formatMoney(p.amount, p.currency)}</p>
                            {settledAmounts ? (
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                Net: {formatMoney(settledAmounts.net, p.currency)}
                                {settledAmounts.tax !== 0 && <span className="ml-1 text-rose-500">· Thuế {formatMoney(settledAmounts.tax, p.currency)}</span>}
                              </p>
                            ) : <p className="mt-0.5 text-[10px] text-slate-400">Chưa chốt thanh toán</p>}
                          </td>
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
                            <td colSpan={7} className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              Điều chỉnh lương
                              {bonusTotal > 0 && <span className="ml-2 text-emerald-600 normal-case">· Thưởng +{formatMoney(bonusTotal, tp[0]?.currency)}</span>}
                              {dedTotal < 0 && <span className="ml-2 text-rose-500 normal-case">· Khấu trừ {formatMoney(dedTotal, tp[0]?.currency)}</span>}
                            </td>
                          </tr>
                          {adjustments.map((p) => {
                            const isBonus = p.amount >= 0
                            const settledAmounts = p.paid ? storedPayrollSettlementAmounts(p) : null
                            return (
                              <tr key={p.id} className={`border-b border-slate-200/30 ${isBonus ? 'bg-emerald-50/40' : 'bg-rose-50/40'}`}>
                                <td colSpan={6} className="px-5 py-2.5">
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
                                  <p>{isBonus ? '+' : ''}{formatMoney(p.amount, p.currency)}</p>
                                  {settledAmounts && <p className="mt-0.5 text-[10px] font-medium text-slate-500">Net: {formatMoney(settledAmounts.net, p.currency)}</p>}
                                </td>
                              </tr>
                            )
                          })}
                        </>
                      )
                    })()}

                    {currencySummaries.map((summary) => (
                      <Fragment key={summary.currency}>
                        <tr className="bg-slate-50/50">
                          <td colSpan={6} className="px-5 py-2 text-right text-slate-500 font-medium">
                            {currencySummaries.length > 1 ? `${summary.currency} · ` : ''}Tổng cộng trước thuế (Gross):
                          </td>
                          <td className="px-5 py-2 text-right text-slate-700 font-bold">{formatMoney(summary.grossAmount, summary.currency)}</td>
                        </tr>
                        {summary.taxAmount !== 0 && (
                          <tr className="bg-rose-50/20 text-rose-500">
                            <td colSpan={6} className="px-5 py-2 text-right font-medium">
                              {summary.source === 'stored'
                                ? 'Thuế TNCN đã chốt:'
                                : summary.source === 'live'
                                  ? 'Thuế TNCN ước tính:'
                                  : 'Thuế TNCN (đã chốt + ước tính):'}
                            </td>
                            <td className="px-5 py-2 text-right font-bold">-{formatMoney(summary.taxAmount, summary.currency)}</td>
                          </tr>
                        )}
                        <tr className="bg-emerald-50/20 text-emerald-600 border-t border-slate-200">
                          <td colSpan={6} className="px-5 py-2.5 text-right font-semibold">Lương thực nhận (Net):</td>
                          <td className="px-5 py-2.5 text-right font-bold text-emerald-600 text-sm">{formatMoney(summary.netAmount, summary.currency)}</td>
                        </tr>
                        {summary.source === 'mixed' && (
                          <tr>
                            <td colSpan={7} className="px-5 py-2 text-right text-[10px] text-slate-500 italic">
                              * Phần đã thanh toán dùng snapshot đã lưu; phần chưa thanh toán là ước tính theo cấu hình hiện tại.
                            </td>
                          </tr>
                        )}
                        {summary.hasLegacyPaidLines && (
                          <tr>
                            <td colSpan={7} className="px-5 py-2 text-right text-[10px] text-amber-700 italic">
                              * Có dòng đã trả từ trước khi có snapshot: hệ thống giữ nguyên Gross = Net, không suy đoán lại khoản đã chuyển.
                            </td>
                          </tr>
                        )}
                        {(summary.unallocatedTaxAmount > 0 || summary.overwithheldTaxAmount > 0) && (
                          <tr>
                            <td colSpan={7} className="px-5 py-2 text-right text-[10px] text-amber-700 font-medium">
                              * Cần kế toán kiểm tra thuế thủ công: {summary.unallocatedTaxAmount > 0 ? `còn cần phân bổ ${formatMoney(summary.unallocatedTaxAmount, summary.currency)}` : `đã khấu trừ vượt ${formatMoney(summary.overwithheldTaxAmount, summary.currency)}`}.
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
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

// Thanh thêm Thưởng / Khấu trừ cho một gia sư trong tháng đang xem.
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
        {mode === 'bonus' ? 'Thêm thưởng cho gia sư' : 'Thêm khấu trừ lương'}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={amount ? Number(String(amount).replace(/[^\d]/g, '')).toLocaleString('en-US').replace(/,/g, ' ') : ''}
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
