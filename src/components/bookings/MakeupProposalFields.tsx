import { CalendarClock, X } from 'lucide-react'
import {
  TEACHER_CANCELLATION_MAKEUP_WINDOW_DAYS,
  type MakeupProposalDraft,
  type MakeupProposalIssue,
} from '@/lib/teacherClassCancellationPolicy'
import { formatUtcOffset } from '@/lib/timezoneUtils'

/**
 * Mục "Đề xuất lịch học bù" trong form Yêu cầu huỷ lớp của gia sư.
 * Chỉ là ghi chú gửi giáo vụ (không tạo ca, không giữ kim cương). Giá trị nhập
 * theo múi giờ của gia sư; trang cha đổi sang giờ VN khi gửi.
 */
interface MakeupProposalFieldsProps {
  rows: MakeupProposalDraft[]
  issues: (MakeupProposalIssue | null)[]
  onChange: (rows: MakeupProposalDraft[]) => void
  minDate: string
  maxDate: string
  teacherOffset: number
  lang: 'vi' | 'en'
  disabled?: boolean
}

const ISSUE_TEXT: Record<MakeupProposalIssue, { vi: string; en: string }> = {
  incomplete: { vi: 'Vui lòng nhập đủ cả ngày và giờ.', en: 'Please enter both a date and a time.' },
  invalid: { vi: 'Ngày hoặc giờ không hợp lệ.', en: 'Invalid date or time.' },
  past: { vi: 'Lịch này đã qua, vui lòng chọn thời điểm sau hiện tại.', en: 'This time has passed. Please pick a later time.' },
  out_of_window: {
    vi: `Chỉ đề xuất trong ${TEACHER_CANCELLATION_MAKEUP_WINDOW_DAYS} ngày tới.`,
    en: `Please pick a time within the next ${TEACHER_CANCELLATION_MAKEUP_WINDOW_DAYS} days.`,
  },
  duplicate: { vi: 'Lịch này trùng với một lịch đã nhập.', en: 'This slot repeats another one.' },
}

const inputClass = 'block min-h-[44px] w-full min-w-0 rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50'

export function MakeupProposalFields({
  rows, issues, onChange, minDate, maxDate, teacherOffset, lang, disabled = false,
}: MakeupProposalFieldsProps) {
  const vi = lang === 'vi'
  const update = (index: number, patch: Partial<MakeupProposalDraft>) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }
  const differentTimezone = Math.abs(teacherOffset - 7) > 0.001

  return (
    <fieldset className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4" disabled={disabled}>
      <legend className="sr-only">{vi ? 'Đề xuất lịch học bù' : 'Proposed make-up slots'}</legend>
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <CalendarClock className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">
            {vi ? 'Đề xuất lịch học bù' : 'Proposed make-up slots'} <span className="text-rose-600">*</span>
          </p>
          <p className="mt-0.5 text-[11px] leading-5 text-slate-600">
            {vi
              ? `Bắt buộc ít nhất 1 lịch, tối đa 3 lịch trong ${TEACHER_CANCELLATION_MAKEUP_WINDOW_DAYS} ngày tới. Đây là ghi chú gửi giáo vụ để sắp xếp, hệ thống không tự đặt lịch.`
              : `At least 1 and up to 3 slots within the next ${TEACHER_CANCELLATION_MAKEUP_WINDOW_DAYS} days. This is a note for the academic team; nothing is booked automatically.`}
          </p>
          {differentTimezone && (
            <p className="mt-1 text-[11px] font-semibold leading-5 text-indigo-700">
              {vi
                ? `Nhập theo giờ của bạn (${formatUtcOffset(teacherOffset)}). Giáo vụ sẽ thấy giờ Việt Nam tương ứng.`
                : `Enter times in your timezone (${formatUtcOffset(teacherOffset)}). The academic team sees the matching Vietnam time.`}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {rows.map((row, index) => {
          const issue = issues[index]
          const hasValue = Boolean(row.date || row.time)
          const borderClass = issue
            ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
            : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'
          const dateId = `makeup-date-${index}`
          const timeId = `makeup-time-${index}`
          return (
            <div key={index} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wide text-indigo-700">
                  {vi ? `Lịch ${index + 1}` : `Slot ${index + 1}`}
                  {index === 0 && <span className="ml-1 text-rose-600">*</span>}
                  {index > 0 && <span className="ml-1 font-semibold normal-case tracking-normal text-slate-400">{vi ? '(không bắt buộc)' : '(optional)'}</span>}
                </span>
                {hasValue && (
                  <button
                    type="button"
                    onClick={() => update(index, { date: '', time: '' })}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label={vi ? `Xoá lịch ${index + 1}` : `Clear slot ${index + 1}`}
                  >
                    <X className="h-3.5 w-3.5" />
                    {vi ? 'Xoá' : 'Clear'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                <label htmlFor={dateId} className="block min-w-0">
                  <span className="mb-1 block text-[11px] font-bold text-slate-500">{vi ? 'Ngày' : 'Date'}</span>
                  <input
                    id={dateId}
                    type="date"
                    value={row.date}
                    min={minDate}
                    max={maxDate}
                    onChange={(event) => update(index, { date: event.target.value })}
                    className={`${inputClass} ${borderClass}`}
                  />
                </label>
                <label htmlFor={timeId} className="block min-w-0">
                  <span className="mb-1 block text-[11px] font-bold text-slate-500">{vi ? 'Giờ' : 'Time'}</span>
                  <input
                    id={timeId}
                    type="time"
                    step={300}
                    value={row.time}
                    onChange={(event) => update(index, { time: event.target.value })}
                    className={`${inputClass} ${borderClass}`}
                  />
                </label>
              </div>
              {issue && (
                <p role="alert" className="mt-1.5 text-[11px] font-semibold text-rose-600">
                  {vi ? ISSUE_TEXT[issue].vi : ISSUE_TEXT[issue].en}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
