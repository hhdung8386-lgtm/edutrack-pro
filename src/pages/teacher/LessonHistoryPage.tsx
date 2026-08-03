import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Lesson } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { toast } from '@/stores/toastStore'
import { StatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatVND, formatVietnameseDate, getCurrentMonth } from '@/lib/constants'
import { ChevronLeft, ChevronRight, History, ChevronDown, X, Info, Trash2 } from 'lucide-react'
import { format, subMonths, addMonths } from 'date-fns'

function groupByDate(lessons: Lesson[]): [string, Lesson[]][] {
  const map = new Map<string, Lesson[]>()
  for (const lesson of lessons) {
    const arr = map.get(lesson.date) || []
    arr.push(lesson)
    map.set(lesson.date, arr)
  }
  return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
}

function monthOf(lesson: Lesson): string {
  return (lesson.date || '').slice(0, 7)
}

export function LessonHistoryPage() {
  const { teacherId } = useAuthStore()
  const { t, lang } = useLanguageStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const studentIdFilter = searchParams.get('studentId') || ''
  const studentNameFilter = searchParams.get('studentName') || ''
  const [month, setMonth] = useState(getCurrentMonth())
  // Giữ TOÀN BỘ buổi dạy của gia sư: truy vấn vốn đã lấy hết theo teacherId,
  // nên lọc theo tháng ở phía client và không cần đăng ký lại mỗi lần đổi tháng.
  const [allLessons, setAllLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retryVersion, setRetryVersion] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  // Tháng hiện tại trống nhưng vẫn còn lịch sử -> tự nhảy về tháng gần nhất có dữ liệu
  const [autoJumpedFrom, setAutoJumpedFrom] = useState<string | null>(null)
  const autoJumpDone = useRef(false)
  const [cancelTarget, setCancelTarget] = useState<Lesson | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const prevMonth = () => {
    const d = new Date(month + '-01')
    setMonth(format(subMonths(d, 1), 'yyyy-MM'))
  }
  const nextMonth = () => {
    const d = new Date(month + '-01')
    const next = addMonths(d, 1)
    if (next <= new Date()) setMonth(format(next, 'yyyy-MM'))
  }

  const [year, mon] = month.split('-')
  const monthLabel = lang === 'vi'
    ? `Tháng ${parseInt(mon)} năm ${year}`
    : `${new Date(Number(year), Number(mon) - 1).toLocaleString('en', { month: 'long' })} ${year}`

  const labelOfMonth = (value: string) => {
    const [y, m] = value.split('-')
    return lang === 'vi'
      ? `Tháng ${parseInt(m)}/${y}`
      : `${new Date(Number(y), Number(m) - 1).toLocaleString('en', { month: 'short' })} ${y}`
  }

  useEffect(() => {
    if (!teacherId) return
    setLoading(true)
    const q = query(
      collection(db, 'lessons'),
      where('teacherId', '==', teacherId)
    )
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
      docs.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
      setAllLessons(docs)
      setLoadError(false)
      setLoading(false)
    }, (err) => {
      // Lỗi mạng/quyền phải hiện rõ, tuyệt đối không im lặng như "không có buổi nào"
      console.error('[lesson-history]', err)
      setLoadError(true)
      setLoading(false)
    })
  }, [teacherId, retryVersion])

  const scopedLessons = useMemo(
    () => (studentIdFilter ? allLessons.filter((l) => l.studentId === studentIdFilter) : allLessons),
    [allLessons, studentIdFilter],
  )

  // Danh sách tháng CÓ dữ liệu, mới nhất trước — dùng cho ô chọn nhanh
  const monthOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const lesson of scopedLessons) {
      const m = monthOf(lesson)
      if (!m) continue
      counts.set(m, (counts.get(m) || 0) + 1)
    }
    return Array.from(counts.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [scopedLessons])

  // Đổi bộ lọc học viên = tập dữ liệu khác -> cho phép tự chọn lại tháng một lần nữa
  useEffect(() => {
    autoJumpDone.current = false
    setAutoJumpedFrom(null)
  }, [studentIdFilter])

  // Gia sư từng tưởng "mất lịch sử" chỉ vì tháng đang xem chưa có buổi nào.
  // Lần tải đầu: nếu tháng hiện tại trống mà vẫn còn lịch sử -> nhảy tới tháng gần nhất có dữ liệu.
  useEffect(() => {
    if (loading || autoJumpDone.current || monthOptions.length === 0) return
    autoJumpDone.current = true
    const hasCurrent = monthOptions.some(([m]) => m === month)
    if (!hasCurrent) {
      setAutoJumpedFrom(month)
      setMonth(monthOptions[0][0])
    }
  }, [loading, monthOptions, month])

  const lessons = useMemo(
    () => scopedLessons.filter((l) => l.date >= `${month}-01` && l.date <= `${month}-31`),
    [scopedLessons, month],
  )

  const approved = lessons.filter((l) => l.status === 'approved')
  const totalSalary = approved.reduce((sum, l) => sum + (l.salary || 0), 0)
  const totalMinutes = approved.reduce((sum, l) => sum + l.minutes, 0)
  const groups = groupByDate(lessons)
  const latestLessonDate = scopedLessons[0]?.date || ''

  const handleCancelLesson = async () => {
    if (!cancelTarget || !teacherId) return
    if (cancelTarget.status !== 'pending') {
      toast.warning(lang === 'vi' ? 'Buổi này đã được xử lý, không thể huỷ' : 'This lesson was already processed')
      setCancelTarget(null)
      return
    }
    setCancelling(true)
    try {
      await updateDoc(doc(db, 'lessons', cancelTarget.id), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: `teacher:${teacherId}`,
        cancelledReason: cancelReason.trim(),
        updatedAt: serverTimestamp(),
      })
      toast.success(lang === 'vi' ? 'Đã huỷ buổi điểm danh' : 'Attendance cancelled')
      setCancelTarget(null)
      setCancelReason('')
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || ''
      console.error('[cancel-lesson]', err)
      if (code === 'permission-denied') {
        toast.error(lang === 'vi'
          ? 'Chưa được phép huỷ trên máy chủ. Vui lòng báo giáo vụ cập nhật quyền (firestore.rules).'
          : 'The server has not enabled this yet. Please ask the academic team to publish the updated rules.')
      } else {
        toast.error(lang === 'vi' ? 'Huỷ không thành công, vui lòng thử lại' : 'Could not cancel, please try again')
      }
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="space-y-5 pt-2 lg:pt-6 max-w-2xl mx-auto animate-fade-in">
      <div className="bg-gradient-to-r from-[#3BB8EB] to-[#2196F3] rounded-2xl p-6 text-white shadow-lg shadow-sky-200/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <h1 className="text-2xl font-bold relative z-10">{studentIdFilter ? (lang === 'vi' ? 'Lịch sử học của học viên' : 'Student learning history') : t('history.title')}</h1>
        {studentIdFilter && <p className="relative z-10 mt-1 text-sm font-semibold text-white/90">{studentNameFilter || studentIdFilter}</p>}
        {!loading && scopedLessons.length > 0 && (
          <p className="relative z-10 mt-2 text-xs font-semibold text-white/90">
            {lang === 'vi'
              ? `Tổng ${scopedLessons.length} buổi trong lịch sử · gần nhất ${latestLessonDate}`
              : `${scopedLessons.length} lessons in total · latest ${latestLessonDate}`}
          </p>
        )}
      </div>

      {studentIdFilter && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-sky-800">{lang === 'vi' ? `Đang lọc lịch sử của ${studentNameFilter || 'học viên đã chọn'}` : `Showing history for ${studentNameFilter || 'the selected student'}`}</p>
          <button type="button" onClick={() => setSearchParams({})} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sky-700 hover:bg-sky-100" aria-label={lang === 'vi' ? 'Bỏ lọc học viên' : 'Clear student filter'}><X className="h-4 w-4" /></button>
        </div>
      )}

      {autoJumpedFrom && autoJumpedFrom !== month && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="text-xs font-semibold text-amber-800">
            {lang === 'vi'
              ? `${labelOfMonth(autoJumpedFrom)} chưa có buổi dạy nào nên hệ thống đang hiển thị ${labelOfMonth(month)} — lịch sử cũ vẫn còn đủ, chọn tháng khác ở ô bên dưới.`
              : `${labelOfMonth(autoJumpedFrom)} has no lessons yet, so ${labelOfMonth(month)} is shown instead — your history is intact, pick another month below.`}
          </p>
        </div>
      )}

      {/* Month selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={prevMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Previous month">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-base font-semibold text-slate-700 min-w-[150px] text-center">{monthLabel}</span>
        <button onClick={nextMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Next month">
          <ChevronRight className="w-5 h-5" />
        </button>
        {monthOptions.length > 0 && (
          <select
            value={monthOptions.some(([m]) => m === month) ? month : ''}
            onChange={(e) => { if (e.target.value) setMonth(e.target.value) }}
            aria-label={lang === 'vi' ? 'Chọn tháng có buổi dạy' : 'Pick a month with lessons'}
            className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-[#3BB8EB]"
          >
            <option value="">{lang === 'vi' ? 'Tháng có buổi dạy…' : 'Months with lessons…'}</option>
            {monthOptions.map(([value, count]) => (
              <option key={value} value={value}>
                {labelOfMonth(value)} ({count})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <p className="text-2xl font-bold text-slate-900">{approved.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t('history.lessons_taught')}</p>
        </Card>
        <Card className="text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <p className="text-2xl font-bold text-slate-900">{totalMinutes}'</p>
          <p className="text-xs text-slate-500 mt-0.5">{t('history.total_minutes')}</p>
        </Card>
        <Card className="text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1 bg-gradient-to-br from-white to-emerald-50/50">
          <p className="text-xl font-bold text-emerald-500">{formatVND(totalSalary)}</p>
          <p className="text-xs text-emerald-600/70 mt-0.5">{t('history.monthly_salary')}</p>
        </Card>
      </div>

      {loadError ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-center">
          <p className="text-sm font-bold text-rose-800">
            {lang === 'vi'
              ? 'Không tải được lịch sử buổi dạy (lỗi kết nối). Dữ liệu của bạn vẫn còn nguyên, vui lòng thử lại.'
              : 'Could not load your lesson history (connection error). Your data is intact, please try again.'}
          </p>
          <button
            type="button"
            onClick={() => { setLoadError(false); setLoading(true); setRetryVersion((v) => v + 1) }}
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-bold text-white transition-colors hover:bg-rose-700"
          >
            {lang === 'vi' ? 'Thử tải lại' : 'Try again'}
          </button>
        </div>
      ) : loading ? (
        <LoadingSpinner />
      ) : lessons.length === 0 ? (
        <EmptyState
          icon={<History className="w-8 h-8" />}
          title={t('history.no_lessons')}
          description={`${monthLabel} ${t('history.month_no_lessons')}`}
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([date, dateLessons]) => (
            <div key={date}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {lang === 'vi' ? formatVietnameseDate(date) : new Date(date).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <div className="space-y-2">
                {dateLessons.map((lesson) => (
                  <Card key={lesson.id} padding="sm" className="cursor-pointer hover:shadow-md transition-all duration-300 hover:border-sky-100" onClick={() => setExpanded(expanded === lesson.id ? null : lesson.id)}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={lesson.status} />
                          <span className="text-sm font-medium text-slate-700">{lesson.studentName}</span>
                          <span className="text-xs text-slate-500">{lesson.studentCode}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{lesson.subjectName} · {lesson.minutes} {t('attendance.minutes')}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {lesson.status === 'approved' ? (
                          <p className="text-sm font-semibold text-emerald-500">{formatVND(lesson.salary || 0)}</p>
                        ) : lesson.status === 'cancelled' ? (
                          <p className="text-xs text-slate-400">{lang === 'vi' ? 'Đã huỷ' : 'Cancelled'}</p>
                        ) : (
                          <p className="text-xs text-slate-500">{t('history.pending')}</p>
                        )}
                        <ChevronDown className={`w-4 h-4 text-slate-400 mt-0.5 ml-auto transition-transform ${expanded === lesson.id ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    {lesson.status === 'pending' && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            setCancelReason('')
                            setCancelTarget(lesson)
                          }}
                          className="border-rose-200 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {lang === 'vi' ? 'Huỷ điểm danh' : 'Cancel attendance'}
                        </Button>
                      </div>
                    )}

                    {expanded === lesson.id && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-sm">
                        {lesson.status === 'cancelled' && (
                          <p className="text-xs font-semibold text-slate-500">
                            {lang === 'vi' ? 'Bạn đã tự huỷ buổi điểm danh này.' : 'You cancelled this attendance yourself.'}
                            {lesson.cancelledReason ? ` (${lesson.cancelledReason})` : ''}
                          </p>
                        )}
                        {lesson.comment && (
                          <div>
                            <p className="text-xs text-slate-500 mb-0.5">{t('history.comment')}</p>
                            <p className="text-slate-600">{lesson.comment}</p>
                          </div>
                        )}
                        {(lesson.book || lesson.pages) && (
                          <div>
                            <p className="text-xs text-slate-500 mb-0.5">{lang === 'vi' ? 'Nội dung đã dạy' : 'Lesson coverage'}</p>
                            <p className="text-slate-600">
                              {lesson.book || (lang === 'vi' ? 'Chưa ghi giáo trình' : 'Book not recorded')}
                              {lesson.pages ? ` - ${lang === 'vi' ? 'trang' : 'pages'} ${lesson.pages}` : ''}
                            </p>
                          </div>
                        )}
                        {lesson.homework && (
                          <div>
                            <p className="text-xs text-slate-500 mb-0.5">{t('history.homework')}</p>
                            <p className="text-slate-600">{lesson.homework}</p>
                          </div>
                        )}
                        {lesson.imageURLs?.length > 0 && (
                          <div className="flex gap-2">
                            {lesson.imageURLs.map((url, i) => (
                              <img key={i} src={url} alt="" className="w-16 h-16 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => {
                                import('@/lib/constants').then(m => m.openBase64InNewTab(url))
                              }} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {cancelTarget && (
        <ConfirmDialog
          open
          onClose={() => { setCancelTarget(null); setCancelReason('') }}
          onConfirm={handleCancelLesson}
          title={lang === 'vi' ? 'Huỷ buổi điểm danh này?' : 'Cancel this attendance?'}
          confirmLabel={lang === 'vi' ? 'Huỷ điểm danh' : 'Cancel attendance'}
          confirmVariant="danger"
          loading={cancelling}
        >
          <div className="space-y-3">
            <div className="rounded-xl bg-white p-3 text-sm">
              <p className="font-semibold text-slate-800">{cancelTarget.studentName} · {cancelTarget.studentCode}</p>
              <p className="mt-0.5 text-slate-500">{cancelTarget.date} · {cancelTarget.subjectName} · {cancelTarget.minutes} {t('attendance.minutes')}</p>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              {lang === 'vi'
                ? 'Chỉ huỷ được khi buổi CHƯA được duyệt. Buổi đã huỷ vẫn được lưu để giáo vụ đối soát, bạn có thể điểm danh lại đúng ngày.'
                : 'Only attendances that are still pending can be cancelled. The record is kept for the academic team, and you can re-submit the correct one.'}
            </p>
            <Textarea
              label={lang === 'vi' ? 'Lý do huỷ (không bắt buộc)' : 'Reason (optional)'}
              placeholder={lang === 'vi' ? 'VD: điểm danh nhầm ngày' : 'E.g. wrong date'}
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
        </ConfirmDialog>
      )}
    </div>
  )
}
