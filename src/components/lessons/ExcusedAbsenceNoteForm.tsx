import { NotebookPen } from 'lucide-react'
import { useLanguageStore } from '@/stores/languageStore'
import { HomeworkPicker } from './LessonReportForm'
import { AbsenceReportDraft, MAX_ABSENCE_ADVICE_CHARS } from './absenceReport'

/**
 * Vắng CÓ PHÉP: gia sư có thể (không bắt buộc) để lại dặn dò và bài tập về nhà.
 * Dữ liệu dùng chung kiểu AbsenceReportDraft; logic kiểm tra/ghép nằm ở absenceReport.ts.
 * Dùng chung cho AttendancePage và BookingSchedulesPage.
 */
interface ExcusedAbsenceNoteFormProps {
  value: AbsenceReportDraft
  onChange: (value: AbsenceReportDraft) => void
}

export function ExcusedAbsenceNoteForm({ value, onChange }: ExcusedAbsenceNoteFormProps) {
  const { t } = useLanguageStore()

  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start gap-2.5">
        <NotebookPen className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" strokeWidth={2} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-amber-950">{t('excused.title')}</p>
          <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-amber-800">{t('excused.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="flex items-center justify-between gap-2 text-sm font-bold text-slate-700" htmlFor="excused-absence-advice">
          <span>{t('excused.advice_label')}</span>
          <span className="text-[11px] font-semibold tabular-nums text-slate-400">{value.advice.length}/{MAX_ABSENCE_ADVICE_CHARS}</span>
        </label>
        <textarea
          id="excused-absence-advice"
          value={value.advice}
          onChange={(e) => onChange({ ...value, advice: e.target.value.slice(0, MAX_ABSENCE_ADVICE_CHARS) })}
          rows={3}
          maxLength={MAX_ABSENCE_ADVICE_CHARS}
          placeholder={t('excused.advice_placeholder')}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
        />
      </div>

      <HomeworkPicker
        items={value.homeworkItems || []}
        onChange={(homeworkItems) => onChange({ ...value, homeworkItems })}
        label={t('excused.homework_label')}
        hint={t('excused.homework_hint')}
      />
    </div>
  )
}
