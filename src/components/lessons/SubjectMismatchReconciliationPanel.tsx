import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'
import type { Lesson, StudentSubject } from '@/types'
import type {
  BookingSubjectReconciliationDraft,
  PrelinkedSubjectMismatchCandidate,
} from '@/lib/bookingLogic'
import { resolvePrelinkedSubjectMismatchCandidate } from '@/lib/lessonBooking'

export type SubjectMismatchReconciliationState = {
  candidateAvailable: boolean
  required: boolean
  draft: BookingSubjectReconciliationDraft | null
}

type CandidateLoadState = {
  lessonId: string
  candidate: PrelinkedSubjectMismatchCandidate | null
  failed: boolean
}

type Props = {
  lesson: Lesson
  selectedSubject: StudentSubject | null
  forceRequired?: boolean
  onStateChange: (state: SubjectMismatchReconciliationState) => void
}

const MIN_REASON_LENGTH = 12

export function SubjectMismatchReconciliationPanel({
  lesson,
  selectedSubject,
  forceRequired = false,
  onStateChange,
}: Props) {
  const [candidateLoad, setCandidateLoad] = useState<CandidateLoadState>({
    lessonId: '',
    candidate: null,
    failed: false,
  })
  const [reason, setReason] = useState('')
  const [confirmedSettlementSubjectId, setConfirmedSettlementSubjectId] = useState('')
  const confirmed = Boolean(
    selectedSubject
    && confirmedSettlementSubjectId === selectedSubject.subjectId,
  )
  const loading = candidateLoad.lessonId !== lesson.id
  const candidate = loading ? null : candidateLoad.candidate
  const loadFailed = !loading && candidateLoad.failed

  useEffect(() => {
    let active = true

    void resolvePrelinkedSubjectMismatchCandidate({
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
      isZeroMinuteExcusedAbsence: false,
    }).then((result) => {
      if (!active) return
      setCandidateLoad({ lessonId: lesson.id, candidate: result, failed: false })
      setReason('')
      setConfirmedSettlementSubjectId('')
    }).catch((error) => {
      console.error('Unable to load prelinked booking reconciliation candidate:', error)
      if (!active) return
      setCandidateLoad({ lessonId: lesson.id, candidate: null, failed: true })
      setReason('')
      setConfirmedSettlementSubjectId('')
    })

    return () => { active = false }
  }, [lesson])

  const required = Boolean(
    forceRequired
    || (candidate && candidate.bookingSubjectId !== lesson.subjectId)
    || (selectedSubject && selectedSubject.subjectId !== lesson.subjectId),
  )

  const draft = useMemo<BookingSubjectReconciliationDraft | null>(() => {
    if (!required || !candidate || !selectedSubject) return null
    const trimmedReason = reason.trim()
    if (!confirmed || trimmedReason.length < MIN_REASON_LENGTH || trimmedReason.length > 500) return null
    return {
      kind: 'prelinked_subject_mismatch',
      bookingIds: candidate.bookingIds,
      bookingSubjectId: candidate.bookingSubjectId,
      bookingSubjectName: candidate.bookingSubjectName,
      reportedSubjectId: lesson.subjectId || '',
      reportedSubjectName: lesson.subjectName,
      settlementSubjectId: selectedSubject.subjectId,
      settlementSubjectName: selectedSubject.subjectName,
      reason: trimmedReason,
      confirmed: true,
    }
  }, [candidate, confirmed, lesson.subjectId, lesson.subjectName, reason, required, selectedSubject])

  useEffect(() => {
    onStateChange({
      candidateAvailable: Boolean(candidate),
      required,
      draft,
    })
  }, [candidate, draft, onStateChange, required])

  if (!required && !forceRequired) return null

  if (loading) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900" role="status">
        <p className="font-bold">Đang kiểm tra các ca lịch đã gắn với buổi này...</p>
      </div>
    )
  }

  if (!candidate || loadFailed) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-800" role="alert">
        <p className="flex items-start gap-2 font-bold">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Không thể đối soát tự động một cách an toàn
        </p>
        <p className="mt-1 pl-6 leading-5">
          Các ID ca lịch đã lưu trong chính buổi học không tạo thành một cụm khớp hoàn toàn. Hệ thống vẫn chặn duyệt để tránh đoán lịch, trừ nhầm buổi hoặc tính sai lương; vui lòng chuyển ca này cho quản trị viên đối soát dữ liệu.
        </p>
      </div>
    )
  }

  return (
    <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3" aria-labelledby={`subject-reconciliation-${lesson.id}`}>
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <h3 id={`subject-reconciliation-${lesson.id}`} className="text-sm font-extrabold text-amber-950">
            Xác nhận đối soát môn lịch cũ
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-amber-900">
            Chỉ áp dụng cho đúng {candidate.bookingIds.length} ca đã gắn với buổi này, từ {candidate.bookingStart} đến {candidate.bookingEnd}, tổng {candidate.totalMinutes} phút.
          </p>
        </div>
      </div>

      <dl className="grid gap-2 rounded-xl bg-white p-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-semibold text-slate-500">Môn trên lịch cũ</dt>
          <dd className="mt-0.5 font-bold text-slate-900">{candidate.bookingSubjectName || candidate.bookingSubjectId}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Môn giáo viên báo</dt>
          <dd className="mt-0.5 font-bold text-slate-900">{lesson.subjectName || lesson.subjectId || 'Chưa rõ'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Gói sẽ hạch toán</dt>
          <dd className="mt-0.5 font-bold text-indigo-700">{selectedSubject?.subjectName || 'Chưa chọn gói'}</dd>
        </div>
      </dl>

      <label className="block text-xs font-bold text-slate-700">
        Lý do đối soát *
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value.slice(0, 500))}
          rows={3}
          placeholder="Ví dụ: Giáo vụ xác nhận lịch cũ L3 phải hạch toán vào gói hiện tại VN-1S-L2."
          className="mt-1.5 w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        />
        <span className={`mt-1 block text-[11px] font-semibold ${reason.trim().length >= MIN_REASON_LENGTH ? 'text-emerald-700' : 'text-slate-500'}`}>
          {reason.trim().length}/500 ký tự, tối thiểu {MIN_REASON_LENGTH}
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-white p-3 text-xs leading-5 text-slate-700">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmedSettlementSubjectId(
            event.target.checked ? selectedSubject?.subjectId || '' : '',
          )}
          disabled={!selectedSubject}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span>
          Tôi đã đối chiếu đúng học viên, gia sư, ngày, cụm giờ và xác nhận hạch toán {candidate.totalMinutes} phút vào <strong>{selectedSubject?.subjectName || 'gói được chọn'}</strong>. Lương sẽ tính theo gói này.
        </span>
      </label>

      {draft && (
        <p className="flex items-center gap-2 text-xs font-bold text-emerald-700" role="status">
          <CheckCircle2 className="h-4 w-4" />
          Đủ điều kiện đối soát; hệ thống sẽ kiểm tra lại trong transaction trước khi ghi.
        </p>
      )}
    </section>
  )
}
