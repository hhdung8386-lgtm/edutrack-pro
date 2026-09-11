import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Eye,
  RefreshCw,
  Search,
  Send,
  Target,
  UserRound,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import {
  cancelClassHunt,
  classHuntAffordableSessions,
  classHuntErrorReason,
  listAdminClassHunts,
  previewClassHunt,
  publishClassHunt,
  type ClassHunt,
  type ClassHuntDraftInput,
  type ClassHuntMinutes,
  type ClassHuntPreview,
  type ClassHuntStatus,
  type ClassHuntSubject,
  type ClassHuntSubjectRate,
} from '@/lib/classHunting'
import { calculateSalary } from '@/lib/firebase'
import type { DayOfWeek } from '@/types'

const WEEKDAYS: Array<{ value: DayOfWeek; label: string }> = [
  { value: 'mon', label: 'Thứ 2' },
  { value: 'tue', label: 'Thứ 3' },
  { value: 'wed', label: 'Thứ 4' },
  { value: 'thu', label: 'Thứ 5' },
  { value: 'fri', label: 'Thứ 6' },
  { value: 'sat', label: 'Thứ 7' },
  { value: 'sun', label: 'Chủ nhật' },
]

const DURATIONS: ClassHuntMinutes[] = [25, 50, 75, 100]
const CLASS_HUNT_MAX_SESSIONS = 52

type StatusFilter = 'all' | ClassHuntStatus

function todayInVietnam() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function formatDate(date?: string) {
  if (!date) return 'Chưa xác định ngày'
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}/${month}/${year}` : date
}

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency.toUpperCase() === 'VND' ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString('vi-VN')} ${currency}`
  }
}

/** Level 1 reference only: approval multiplies by the claiming tutor's level. */
function subjectRateSummary(rate: ClassHuntSubjectRate, minutes: number, sessionCount: number) {
  const perLesson = calculateSalary(minutes, rate.pricePerMinute, 1, rate.currency)
  return `${formatMoney(rate.pricePerMinute, rate.currency)}/phút · ${formatMoney(perLesson, rate.currency)}/buổi (level 1) · ${sessionCount} buổi`
}

function weekdayLabel(day: DayOfWeek) {
  return WEEKDAYS.find((item) => item.value === day)?.label || day
}

function formatSlots(hunt: Pick<ClassHunt, 'slots'>, compact = false) {
  const visible = compact ? hunt.slots.slice(0, 3) : hunt.slots
  const labels = visible.map((slot) => `${weekdayLabel(slot.weekday)} ${formatDate(slot.date)} ${slot.start}-${slot.end}`)
  if (compact && hunt.slots.length > visible.length) labels.push(`+${hunt.slots.length - visible.length} buổi`)
  return labels.join(', ')
}

function huntStatusMeta(status: ClassHuntStatus) {
  if (status === 'claimed') return { label: 'Đã có gia sư nhận', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
  if (status === 'cancelled') return { label: 'Đã hủy', className: 'border-slate-200 bg-slate-100 text-slate-600' }
  if (status === 'expired') return { label: 'Đã hết hạn', className: 'border-amber-200 bg-amber-50 text-amber-800' }
  return { label: 'Đang mở', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' }
}

function draftKey(draft: ClassHuntDraftInput) {
  return JSON.stringify({
    ...draft,
    weekdays: [...draft.weekdays].sort(),
  })
}

function formFieldClass() {
  return 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'
}

function createPublishRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `class_hunt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`
}

export function ClassHuntingPage() {
  const role = useAuthStore((state) => state.role)
  // Pay figures are admin-only; any operator may publish (no class rate).
  const isAdmin = role === 'admin'
  const [studentCode, setStudentCode] = useState('')
  const [lookup, setLookup] = useState<ClassHuntPreview | null>(null)
  const [preview, setPreview] = useState<ClassHuntPreview | null>(null)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [huntsLoading, setHuntsLoading] = useState(true)
  const [huntsError, setHuntsError] = useState('')
  const [hunts, setHunts] = useState<ClassHunt[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [cancelTarget, setCancelTarget] = useState<ClassHunt | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)
  const [form, setForm] = useState<Omit<ClassHuntDraftInput, 'studentCode' | 'studentId'>>({
    subjectId: '',
    startDate: todayInVietnam(),
    weekdays: [],
    startTime: '19:00',
    minutes: 50,
    sessionCount: 1,
    sessionSelectionMode: 'specific',
  })
  const publishRequestIdsRef = useRef<Record<string, string>>({})
  const lookupRequestRef = useRef(0)
  const previewRequestRef = useRef(0)

  const draft = useMemo<ClassHuntDraftInput>(() => ({
    studentCode: studentCode.trim().toUpperCase(),
    studentId: lookup?.student?.id || '',
    ...form,
    weekdays: [...form.weekdays],
  }), [form, lookup?.student?.id, studentCode])

  const selectedSubject = useMemo<ClassHuntSubject | undefined>(
    () => lookup?.subjects.find((subject) => subject.id === form.subjectId),
    [form.subjectId, lookup],
  )
  const selectedSubjectHasNoAvailablePoints = selectedSubject?.availablePoints !== undefined
    && selectedSubject.availablePoints <= 0
  // null = the lookup could not total the holds (very large calendar); the
  // server still resolves the exact count before publishing.
  const affordableSessions = selectedSubject?.availablePoints !== undefined
    ? classHuntAffordableSessions(selectedSubject.availablePoints, form.minutes)
    : null

  const loadHunts = useCallback(async () => {
    setHuntsError('')
    setHuntsLoading(true)
    try {
      setHunts(await listAdminClassHunts())
    } catch (error) {
      console.error('Load class hunts failed:', error)
      setHuntsError('Chưa tải được danh sách CLASS HUNTING. Vui lòng thử lại.')
    } finally {
      setHuntsLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadHunts()
    }, 0)
    return () => window.clearTimeout(initialLoad)
  }, [loadHunts])

  const clearSchedulePreview = () => {
    previewRequestRef.current += 1
    setPreview(null)
    setPreviewKey(null)
    setPreviewing(false)
  }

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    clearSchedulePreview()
  }

  const handleLookup = async () => {
    const code = studentCode.trim().toUpperCase()
    if (!code) {
      toast.error('Nhập đúng mã học viên trước khi kiểm tra.')
      return
    }
    const requestId = lookupRequestRef.current + 1
    lookupRequestRef.current = requestId
    setLookingUp(true)
    clearSchedulePreview()
    try {
      const nextLookup = await previewClassHunt({ studentCode: code })
      if (requestId !== lookupRequestRef.current) return
      if (!nextLookup.student) {
        throw new Error('STUDENT_NOT_FOUND')
      }
      setLookup(nextLookup)
      setForm((current) => ({
        ...current,
        subjectId: nextLookup.subjects.some((subject) => subject.id === current.subjectId)
          ? current.subjectId
          : '',
      }))
      if (nextLookup.student.eligibleForHunt === false) {
        toast.warning('Học viên này chưa đủ điều kiện mở CLASS HUNTING. Hãy xem thông báo của hệ thống.')
      } else {
        toast.success(`Đã tìm thấy ${nextLookup.student.name}. Chọn gói học để tiếp tục.`)
      }
    } catch (error) {
      if (requestId !== lookupRequestRef.current) return
      console.error('Class hunt lookup failed:', error)
      setLookup(null)
      setForm((current) => ({ ...current, subjectId: '' }))
      const reason = classHuntErrorReason(error) || (error instanceof Error ? error.message : '')
      toast.error(reason === 'STUDENT_NOT_FOUND' || reason === 'CLASS_HUNT_STUDENT_NOT_FOUND'
        ? 'Không tìm thấy học viên với mã này.'
        : reason === 'CLASS_HUNT_STUDENT_CODE_AMBIGUOUS'
          ? 'Mã học viên đang bị trùng dữ liệu. Hãy xử lý hồ sơ trước khi đăng lớp.'
          : 'Chưa kiểm tra được mã học viên. Vui lòng thử lại.')
    } finally {
      if (requestId === lookupRequestRef.current) setLookingUp(false)
    }
  }

  const toggleWeekday = (day: DayOfWeek) => {
    const next = form.weekdays.includes(day)
      ? form.weekdays.filter((item) => item !== day)
      : [...form.weekdays, day]
    updateForm('weekdays', next)
  }

  const validateDraft = () => {
    if (!lookup?.student) {
      toast.error('Hãy kiểm tra đúng mã học viên trước.')
      return false
    }
    if (lookup.student.eligibleForHunt === false) {
      toast.error('Học viên này không đủ điều kiện mở CLASS HUNTING.')
      return false
    }
    if (!draft.subjectId || !selectedSubject) {
      toast.error('Chọn đúng gói học của học viên.')
      return false
    }
    if (selectedSubject.eligibleForHunt === false) {
      toast.error('Gói học này không đủ điều kiện để mở CLASS HUNTING.')
      return false
    }
    if (selectedSubjectHasNoAvailablePoints) {
      const heldBookingLabel = selectedSubject.heldBookingCount
        ? `${selectedSubject.heldBookingCount} ca đang giữ`
        : 'quỹ đang giữ'
      toast.error(`Gói này không còn kim cương khả dụng vì ${heldBookingLabel}. Hãy điều chỉnh lịch đã đặt hoặc cộng thêm quyền học trước.`)
      return false
    }
    if (!draft.startDate || draft.startDate < todayInVietnam()) {
      toast.error('Ngày bắt đầu phải từ hôm nay trở đi.')
      return false
    }
    if (draft.weekdays.length === 0) {
      toast.error('Chọn ít nhất một thứ học.')
      return false
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.startTime)) {
      toast.error('Giờ bắt đầu chưa hợp lệ.')
      return false
    }
    if (!DURATIONS.includes(draft.minutes)) {
      toast.error('Thời lượng chưa hợp lệ.')
      return false
    }
    if (draft.sessionSelectionMode === 'all_remaining') {
      if (affordableSessions !== null && affordableSessions < 1) {
        toast.error(`Gói còn ${selectedSubject.availablePoints} kim cương khả dụng, chưa đủ cho 1 buổi ${draft.minutes} phút.`)
        return false
      }
      if (affordableSessions !== null && affordableSessions > CLASS_HUNT_MAX_SESSIONS) {
        toast.error(`Kim cương khả dụng đủ cho ${affordableSessions} buổi. Một CLASS HUNTING chỉ có thể tạo an toàn tối đa ${CLASS_HUNT_MAX_SESSIONS} buổi; hãy chọn số buổi nhất định.`)
        return false
      }
    } else if (!Number.isInteger(draft.sessionCount) || draft.sessionCount < 1 || draft.sessionCount > CLASS_HUNT_MAX_SESSIONS) {
      toast.error(`Số buổi phải từ 1 đến ${CLASS_HUNT_MAX_SESSIONS}.`)
      return false
    } else if (affordableSessions !== null && draft.sessionCount > affordableSessions) {
      toast.error(`Kim cương khả dụng chỉ đủ cho ${affordableSessions} buổi ${draft.minutes} phút. Hãy chọn số buổi phù hợp.`)
      return false
    }
    return true
  }

  const handlePreview = async () => {
    if (!validateDraft()) return
    const requestId = previewRequestRef.current + 1
    previewRequestRef.current = requestId
    setPreviewing(true)
    try {
      const nextPreview = await previewClassHunt(draft)
      if (requestId !== previewRequestRef.current) return
      setPreview(nextPreview)
      setPreviewKey(draftKey(draft))
    } catch (error) {
      if (requestId !== previewRequestRef.current) return
      console.error('Class hunt preview failed:', error)
      clearSchedulePreview()
      const reason = classHuntErrorReason(error)
      const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : ''
      toast.error(reason === 'CLASS_HUNT_ALL_DURATION_MISMATCH'
        ? 'Để xếp toàn bộ buổi còn lại, thời lượng mỗi buổi phải khớp thời lượng của gói học.'
        : reason === 'CLASS_HUNT_ALL_SESSION_LEDGER_UNAVAILABLE'
          ? 'Gói học chưa có số buổi còn lại chính xác. Hãy cập nhật gói hoặc chọn số buổi nhất định.'
          : reason === 'CLASS_HUNT_SESSION_COUNT_EXCEEDS_REMAINING' || reason === 'CLASS_HUNT_NO_REMAINING_SESSIONS'
            ? 'Số buổi đã chọn không còn phù hợp với gói học hiện tại. Hãy kiểm tra lại gói và lịch.'
            : reason === 'CLASS_HUNT_NO_MATCHING_TEACHER'
              ? 'Chưa có gia sư online nào đang hoạt động và đủ hồ sơ để nhận lớp.'
              : reason.startsWith('CLASS_HUNT_') && message
                ? message
                : 'Chưa kiểm tra được lịch lớp. Dữ liệu chưa được tạo.')
    } finally {
      if (requestId === previewRequestRef.current) setPreviewing(false)
    }
  }

  const canPublish = Boolean(
    preview
    && previewKey === draftKey(draft)
    && (preview.matchingTeacherCount || 0) > 0,
  )

  const handlePublish = async () => {
    if (!canPublish || !validateDraft()) {
      toast.error('Hãy kiểm tra lại lịch hợp lệ trước khi đăng CLASS HUNTING.')
      return
    }
    const publishKey = previewKey || draftKey(draft)
    const clientRequestId = publishRequestIdsRef.current[publishKey] || createPublishRequestId()
    publishRequestIdsRef.current[publishKey] = clientRequestId
    setPublishing(true)
    try {
      await publishClassHunt(draft, clientRequestId)
      setPublishConfirmOpen(false)
      clearSchedulePreview()
      delete publishRequestIdsRef.current[publishKey]
      toast.success('Đã mở CLASS HUNTING. Mọi gia sư đủ điều kiện đều thấy lớp và có thể nhận ngay.')
      await loadHunts()
    } catch (error) {
      console.error('Publish class hunt failed:', error)
      const reason = classHuntErrorReason(error)
      const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : ''
      toast.error(reason === 'CLASS_HUNT_NO_MATCHING_TEACHER'
        ? 'Chưa có gia sư online nào đang hoạt động và đủ hồ sơ để nhận lớp.'
        : reason === 'CLASS_HUNT_ALL_DURATION_MISMATCH'
          ? 'Để xếp toàn bộ buổi còn lại, thời lượng mỗi buổi phải khớp thời lượng của gói học.'
          : reason.startsWith('CLASS_HUNT_') && message
            ? message
            : 'Chưa đăng được CLASS HUNTING. Dữ liệu chưa bị trừ.')
    } finally {
      setPublishing(false)
    }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelClassHunt(cancelTarget.id)
      toast.success('Đã hủy CLASS HUNTING đang mở.')
      setCancelTarget(null)
      await loadHunts()
    } catch (error) {
      console.error('Cancel class hunt failed:', error)
      toast.error('Không thể hủy yêu cầu này vì trạng thái vừa thay đổi. Danh sách đã được giữ nguyên.')
      await loadHunts()
    } finally {
      setCancelling(false)
    }
  }

  const filteredHunts = useMemo(
    () => statusFilter === 'all' ? hunts : hunts.filter((hunt) => hunt.status === statusFilter),
    [hunts, statusFilter],
  )
  const counts = useMemo(() => ({
    all: hunts.length,
    open: hunts.filter((hunt) => hunt.status === 'open').length,
    claimed: hunts.filter((hunt) => hunt.status === 'claimed').length,
    cancelled: hunts.filter((hunt) => hunt.status === 'cancelled').length,
    expired: hunts.filter((hunt) => hunt.status === 'expired').length,
  }), [hunts])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-white to-indigo-50/70 p-5 shadow-[0_16px_40px_-32px_rgba(79,70,229,0.5)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-indigo-700">
              <Target className="h-5 w-5" strokeWidth={2} />
              <span className="text-xs font-extrabold tracking-[0.16em]">LỊCH HỌC LINH HOẠT</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">CLASS HUNTING</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Tạo một yêu cầu lớp cho đúng học viên, đúng gói và đúng lịch. Lớp được đăng cho mọi gia sư đủ điều kiện, không lọc theo môn; gia sư tự nhận lớp đúng môn của mình. Hệ thống chỉ chặn ca dạy thực tế bị trùng.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            <CheckCircle2 className="h-4 w-4 text-indigo-600" />
            Lịch chỉ được tạo khi gia sư nhận lớp thành công
          </div>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <Card className="overflow-hidden" padding="none">
          <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <CardHeader
              title="Tạo yêu cầu mới"
              subtitle="Không lọc môn, không cần tìm trước gia sư mở lịch rảnh; hệ thống kiểm tra trùng ca khi nhận lớp."
              className="mb-0"
            />
          </div>
          <div className="space-y-6 p-5 sm:p-6">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-xs font-black text-indigo-700">1</span>
                <h2 className="text-sm font-extrabold text-slate-900">Xác định học viên và gói học</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Mã học viên chính xác</span>
                  <input
                    value={studentCode}
                    onChange={(event) => {
                      lookupRequestRef.current += 1
                      setLookingUp(false)
                      setStudentCode(event.target.value.toUpperCase())
                      setLookup(null)
                      setForm((current) => ({ ...current, subjectId: '' }))
                      clearSchedulePreview()
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void handleLookup()
                      }
                    }}
                    className={`${formFieldClass()} font-mono font-bold uppercase`}
                    placeholder="VD: HS12AB34"
                    autoComplete="off"
                    aria-describedby="class-hunt-code-hint"
                  />
                  <span id="class-hunt-code-hint" className="mt-1.5 block text-xs text-slate-500">Không tìm kiếm gần đúng để tránh mở nhầm hồ sơ.</span>
                </label>
                <Button type="button" variant="outline" onClick={() => void handleLookup()} loading={lookingUp} className="self-end whitespace-nowrap">
                  <Search className="h-4 w-4" />
                  Kiểm tra mã
                </Button>
              </div>

              {lookup?.student && (
                <div className={`rounded-xl border p-3 ${lookup.student.eligibleForHunt === false ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50/70'}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><UserRound className="h-4 w-4 text-indigo-600" />{lookup.student.name}</p>
                      <p className="mt-1 font-mono text-xs font-bold text-slate-500">{lookup.student.code}</p>
                    </div>
                    <span className="inline-flex self-start rounded-lg border border-white bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-600">
                      {lookup.student.deliveryMode || lookup.student.learningScheduleType || 'Học online'}
                    </span>
                  </div>
                  {lookup.student.eligibleForHunt === false && (
                    <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Hồ sơ này không được mở yêu cầu lớp. Vui lòng kiểm tra trạng thái học viên hoặc loại lớp.</p>
                  )}
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Gói học cần xếp</span>
                <select
                  value={form.subjectId}
                  disabled={!lookup?.student || lookup.student.eligibleForHunt === false}
                  onChange={(event) => updateForm('subjectId', event.target.value)}
                  className={formFieldClass()}
                >
                  <option value="">Chọn gói học</option>
                  {(lookup?.subjects || []).map((subject) => (
                    <option key={subject.id} value={subject.id} disabled={subject.eligibleForHunt === false}>
                      {subject.name}{subject.availablePoints !== undefined
                        ? ` - khả dụng ${subject.availablePoints} kim cương`
                        : subject.remainingPoints !== undefined ? ` - còn ${subject.remainingPoints} kim cương` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="space-y-3 border-t border-slate-100 pt-5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-xs font-black text-indigo-700">2</span>
                <h2 className="text-sm font-extrabold text-slate-900">Thiết lập lịch cần tìm</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Ngày bắt đầu</span>
                  <input
                    type="date"
                    min={todayInVietnam()}
                    value={form.startDate}
                    onChange={(event) => updateForm('startDate', event.target.value)}
                    className={formFieldClass()}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Giờ bắt đầu</span>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(event) => updateForm('startTime', event.target.value)}
                    className={formFieldClass()}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Thời lượng mỗi buổi</span>
                  <select value={form.minutes} onChange={(event) => updateForm('minutes', Number(event.target.value) as ClassHuntMinutes)} className={formFieldClass()}>
                    {DURATIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes} phút</option>)}
                  </select>
                </label>
              </div>
              <fieldset>
                <legend className="mb-2 text-xs font-bold text-slate-700">Số buổi cần xếp</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${form.sessionSelectionMode === 'all_remaining' ? 'border-indigo-500 bg-indigo-50/70' : 'border-slate-200 bg-white hover:border-indigo-200'}`}>
                    <input
                      type="radio"
                      name="class-hunt-session-selection"
                      value="all_remaining"
                      checked={form.sessionSelectionMode === 'all_remaining'}
                      onChange={() => updateForm('sessionSelectionMode', 'all_remaining')}
                      className="mt-0.5 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      <span className="block text-sm font-extrabold text-slate-900">Xếp toàn bộ buổi còn lại</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        Hệ thống chốt số buổi theo kim cương khả dụng tại thời điểm đăng; không lấy số nhập tay.
                        {affordableSessions !== null && ` Hiện đủ cho ${affordableSessions} buổi ${form.minutes} phút.`}
                      </span>
                    </span>
                  </label>
                  <label className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${form.sessionSelectionMode === 'specific' ? 'border-indigo-500 bg-indigo-50/70' : 'border-slate-200 bg-white hover:border-indigo-200'}`}>
                    <input
                      type="radio"
                      name="class-hunt-session-selection"
                      value="specific"
                      checked={form.sessionSelectionMode === 'specific'}
                      onChange={() => updateForm('sessionSelectionMode', 'specific')}
                      className="mt-0.5 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      <span className="block text-sm font-extrabold text-slate-900">Xếp số buổi nhất định</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">Chọn một phần số buổi còn lại của gói học.</span>
                    </span>
                  </label>
                </div>
                {form.sessionSelectionMode === 'specific' && (
                  <label className="mt-3 block max-w-sm">
                    <span className="mb-1.5 block text-xs font-bold text-slate-700">Số buổi muốn xếp</span>
                    <input
                      type="number"
                      min={1}
                      max={CLASS_HUNT_MAX_SESSIONS}
                      value={form.sessionCount}
                      onChange={(event) => updateForm('sessionCount', Math.min(CLASS_HUNT_MAX_SESSIONS, Math.max(1, Number(event.target.value) || 1)))}
                      className={formFieldClass()}
                    />
                  </label>
                )}
                {selectedSubject && (
                  <p className={`mt-2 text-xs leading-5 ${selectedSubjectHasNoAvailablePoints ? 'font-semibold text-amber-800' : 'text-slate-500'}`}>
                    {selectedSubject.availablePoints !== undefined
                      ? <>
                          Gói còn {selectedSubject.remainingPoints ?? 0} kim cương;
                          {' '}đang giữ {selectedSubject.heldBookingCount ?? 0} ca / {selectedSubject.heldPoints ?? 0} kim cương;
                          {' '}khả dụng {selectedSubject.availablePoints} kim cương, đủ cho <strong>{affordableSessions ?? 0} buổi {form.minutes} phút</strong> theo giá chuẩn 25 kim cương/25 phút.
                          {selectedSubjectHasNoAvailablePoints && ' Cần giải phóng lịch đã đặt hoặc cộng thêm quyền học trước khi mở CLASS HUNTING.'}
                        </>
                      : 'Lịch học viên quá lớn để tính nhanh kim cương đang giữ; hệ thống sẽ đối soát chính xác khi kiểm tra lịch.'}
                    {' '}Gia sư có đơn giá kim cương cao hơn chỉ thấy lớp khi quỹ đủ cho đơn giá của họ.
                    {' '}Một yêu cầu CLASS HUNTING tạo tối đa {CLASS_HUNT_MAX_SESSIONS} buổi để việc nhận lớp luôn nguyên tử và an toàn.
                  </p>
                )}
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-xs font-bold text-slate-700">Các thứ học</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {WEEKDAYS.map((day) => {
                    const selected = form.weekdays.includes(day.value)
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleWeekday(day.value)}
                        aria-pressed={selected}
                        className={`min-h-10 rounded-xl border px-3 text-xs font-bold transition active:scale-[0.98] ${selected ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50'}`}
                      >
                        {day.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            </section>

            <section className="space-y-3 border-t border-slate-100 pt-5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-xs font-black text-indigo-700">3</span>
                <h2 className="text-sm font-extrabold text-slate-900">Đơn giá theo môn</h2>
              </div>
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Không cần nhập đơn giá riêng. Lương gia sư nhận lớp tính theo đơn giá của môn/gói học và level của gia sư, giống lớp thường, và được chốt khi buổi học được duyệt.
              </p>
            </section>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-slate-500">Bản xem trước không tạo lịch và không giữ quỹ buổi.</p>
              <Button type="button" onClick={() => void handlePreview()} loading={previewing} className="whitespace-nowrap">
                <Eye className="h-4 w-4" />
                Kiểm tra lớp
              </Button>
            </div>
          </div>
        </Card>

        <aside className="space-y-4 xl:sticky xl:top-20">
          <Card className="min-h-[320px]" padding="none">
            <div className="border-b border-slate-100 px-5 py-4">
              <CardHeader title="Kết quả kiểm tra" subtitle="Xác nhận học viên, gói và lịch hợp lệ trước khi đăng." className="mb-0" />
            </div>
            {!preview && !previewing && (
              <EmptyState
                icon={<CheckCircle2 className="h-8 w-8" />}
                title="Chưa có bản xem trước"
                description="Kiểm tra mã học viên, gói và lịch trước khi đăng CLASS HUNTING."
              />
            )}
            {previewing && (
              <div className="space-y-3 p-5" role="status" aria-live="polite" aria-busy="true" aria-label="Đang kiểm tra lịch">
                {[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
              </div>
            )}
            {preview && !previewing && (
              <div className="space-y-4 p-5">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
                  <p className="text-xs font-bold text-indigo-700">Lịch dự kiến</p>
                  <p className="mt-1 text-sm font-extrabold text-slate-900">{preview.subject?.name || selectedSubject?.name || 'Gói học đã chọn'}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{preview.slots.length > 0 ? formatSlots({ slots: preview.slots }, true) : `${draft.sessionCount} buổi, ${draft.minutes} phút/buổi`}</p>
                </div>
                {isAdmin && (
                  <div className="rounded-xl border border-indigo-200 bg-white p-3 text-sm leading-6 text-slate-900">
                    <p className="text-xs font-bold text-indigo-700">Đơn giá theo môn</p>
                    {preview.subjectRate ? (
                      <p className="mt-1 font-extrabold">{subjectRateSummary(preview.subjectRate, draft.minutes, preview.slots.length || draft.sessionCount)}</p>
                    ) : (
                      <p className="mt-1 font-semibold text-amber-800">Gói học chưa ghi đơn giá; lương sẽ theo đơn giá môn khi duyệt buổi.</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">Nhân level của gia sư nhận lớp, giống lớp thường.</p>
                  </div>
                )}
                {preview.warnings?.map((warning) => (
                  <p key={warning} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning}</p>
                ))}
                {preview.matchingTeacherCount === 0 ? (
                  <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900" role="alert">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>Chưa có gia sư online nào đang hoạt động và đủ hồ sơ để nhận lớp. Chưa thể đăng lớp.</p>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{preview.matchingTeacherCount ? `Lớp sẽ hiển thị cho ${preview.matchingTeacherCount >= 100 ? 'hơn 100' : preview.matchingTeacherCount} gia sư đủ điều kiện, không lọc theo môn. ` : ''}Gia sư tự nhận lớp đúng môn của mình; khi nhận, hệ thống kiểm tra trùng ca dạy thực tế.</p>
                  </div>
                )}
                <Button fullWidth type="button" onClick={() => setPublishConfirmOpen(true)} disabled={!canPublish} className="whitespace-nowrap">
                  <Send className="h-4 w-4" />
                  Đăng CLASS HUNTING
                </Button>
              </div>
            )}
          </Card>
        </aside>
      </div>

      <Card padding="none">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-950">Danh sách yêu cầu</h2>
            <p className="mt-1 text-sm text-slate-500">Theo dõi yêu cầu đang mở, đã có gia sư nhận, đã hết hạn hoặc đã hủy.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadHunts()} loading={huntsLoading} className="self-start whitespace-nowrap lg:self-auto">
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </Button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-5 py-3 sm:px-6">
          {([
            ['all', 'Tất cả', counts.all],
            ['open', 'Đang mở', counts.open],
            ['claimed', 'Đã nhận', counts.claimed],
            ['expired', 'Hết hạn', counts.expired],
            ['cancelled', 'Đã hủy', counts.cancelled],
          ] as Array<[StatusFilter, string, number]>).map(([status, label, count]) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold transition active:scale-[0.98] ${statusFilter === status ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        {huntsError && (
          <div className="mx-5 mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 sm:mx-6" role="alert">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p>{huntsError}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3 border-rose-200 bg-white text-rose-700 hover:bg-rose-100" onClick={() => void loadHunts()}>
                Thử lại
              </Button>
            </div>
          </div>
        )}
        {huntsLoading ? (
          <div className="space-y-3 p-5 sm:p-6" role="status" aria-live="polite" aria-busy="true" aria-label="Đang tải danh sách CLASS HUNTING">
            {[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : filteredHunts.length === 0 ? (
          <EmptyState icon={<Target className="h-8 w-8" />} title="Chưa có yêu cầu phù hợp" description="Khi giáo vụ đăng một lịch mới, yêu cầu sẽ xuất hiện tại đây." />
        ) : (
          <div className="grid gap-3 p-5 sm:p-6">
            {filteredHunts.map((hunt) => {
              const status = huntStatusMeta(hunt.status)
              return (
                <article key={hunt.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-[0_12px_28px_-24px_rgba(79,70,229,0.55)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>
                        <span className="text-xs font-semibold text-slate-500">{hunt.sessionCount} buổi, {hunt.minutes} phút/buổi</span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Học viên</p>
                          <p className="mt-1 break-words text-sm font-extrabold text-slate-900">{hunt.student?.name || 'Học viên đã ẩn'}</p>
                          <p className="mt-0.5 break-all font-mono text-xs font-semibold text-slate-500">{hunt.student?.code || ''}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Gói học</p>
                          <p className="mt-1 break-words text-sm font-extrabold text-slate-900">{hunt.subject.name}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Gia sư</p>
                          <p className="mt-1 break-words text-sm font-extrabold text-slate-900">{hunt.claimedTeacher?.name || 'Đang chờ nhận'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Đơn giá lớp</p>
                          {!isAdmin ? (
                            <p className="mt-1 text-sm font-semibold text-slate-500">Chỉ Admin xem đơn giá</p>
                          ) : hunt.classHuntCompensation ? (
                            <>
                              <p className="mt-1 break-words text-sm font-extrabold text-slate-900">{formatVND(hunt.classHuntCompensation.ratePerMinute)}/phút</p>
                              <p className="mt-0.5 text-xs text-slate-500">Đơn giá riêng đã chốt, không nhân level</p>
                            </>
                          ) : (
                            <p className="mt-1 text-sm font-semibold text-slate-500">Theo đơn giá môn x level</p>
                          )}
                        </div>
                      </div>
                      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-600"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />{formatSlots(hunt, true)}</p>
                    </div>
                    {hunt.status === 'open' && (
                      <Button type="button" variant="danger" size="sm" onClick={() => setCancelTarget(hunt)} className="self-start whitespace-nowrap">
                        <XCircle className="h-4 w-4" />
                        Hủy yêu cầu
                      </Button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={publishConfirmOpen}
        onClose={() => setPublishConfirmOpen(false)}
        onConfirm={() => void handlePublish()}
        title="Đăng CLASS HUNTING?"
        description={selectedSubject ? `Yêu cầu môn ${selectedSubject.name} sẽ mở cho mọi gia sư đủ điều kiện, không lọc theo môn; gia sư tự nhận lớp đúng môn của mình.` : undefined}
        consequence="Lịch và quỹ buổi chỉ được tạo khi một gia sư nhận lớp thành công và không có ca dạy trùng. Lương tính theo đơn giá môn x level gia sư, giống lớp thường."
        confirmLabel="Đăng yêu cầu"
        loading={publishing}
        confirmDisabled={!canPublish}
      />
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => void handleCancel()}
        title="Hủy CLASS HUNTING đang mở?"
        description="Gia sư sẽ không còn thấy yêu cầu này để nhận lớp."
        consequence="Yêu cầu đã có gia sư nhận không thể hủy từ màn hình này."
        confirmLabel="Hủy yêu cầu"
        confirmVariant="danger"
        loading={cancelling}
      />
    </div>
  )
}
