import { AlertTriangle, Check, ImageUp, MessageSquareWarning } from 'lucide-react'
import { useLanguageStore } from '@/stores/languageStore'
import { HomeworkPicker } from './LessonReportForm'
import {
  AbsenceReportDraft, MAX_ABSENCE_ADVICE_CHARS, MIN_ABSENCE_ADVICE_CHARS, MIN_ABSENCE_IMAGES,
  absenceAdviceCharCount,
} from './absenceReport'
import { normalizeHomeworkItems } from './lessonReport'

/**
 * UI phần BẮT BUỘC khi học viên VẮNG KHÔNG PHÉP: dặn dò + bài tập giao bù + ảnh minh chứng.
 * Dùng chung cho AttendancePage và BookingSchedulesPage.
 * Logic thuần (validate/compose/fields) nằm ở absenceReport.ts.
 *
 * `imageCount` là số ảnh ĐÃ tải lên xong ở form cha — form này chỉ hiển thị tiến độ,
 * phần tải ảnh vẫn nằm ở trang cha để không đổi luồng upload hiện có.
 */
interface AbsenceReportFormProps {
  value: AbsenceReportDraft
  onChange: (value: AbsenceReportDraft) => void
  imageCount: number
}

export function AbsenceReportForm({ value, onChange, imageCount }: AbsenceReportFormProps) {
  const { t } = useLanguageStore()

  const adviceCount = absenceAdviceCharCount(value.advice)
  const adviceOk = adviceCount >= MIN_ABSENCE_ADVICE_CHARS
  const homeworkOk = normalizeHomeworkItems(value.homeworkItems).length > 0
  const imagesOk = imageCount >= MIN_ABSENCE_IMAGES

  const steps = [
    { done: adviceOk, label: t('absence.step_advice') },
    { done: homeworkOk, label: t('absence.step_homework') },
    { done: imagesOk, label: t('absence.step_image') },
  ]

  return (
    <div className="space-y-4 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
      <div className="flex items-start gap-2.5">
        <MessageSquareWarning className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-500" strokeWidth={2} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-rose-900">{t('absence.title')}</p>
          <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-rose-700">{t('absence.subtitle')}</p>
        </div>
      </div>

      {/* Tiến độ 3 điều kiện — gia sư thấy ngay còn thiếu gì trước khi bấm gửi */}
      <ul className="grid gap-1.5 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li
            key={i}
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold ${
              step.done
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-white text-amber-700'
            }`}
          >
            {step.done
              ? <Check className="h-3.5 w-3.5 flex-shrink-0" />
              : <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />}
            <span className="truncate">{step.label}</span>
          </li>
        ))}
      </ul>

      {/* 1. Dặn dò */}
      <div className="space-y-1.5">
        <label className="block text-sm font-bold text-slate-700" htmlFor="absence-advice">
          {t('absence.advice_label')} <span className="text-rose-500">*</span>
        </label>
        <textarea
          id="absence-advice"
          value={value.advice}
          onChange={(e) => onChange({ ...value, advice: e.target.value.slice(0, MAX_ABSENCE_ADVICE_CHARS) })}
          rows={4}
          maxLength={MAX_ABSENCE_ADVICE_CHARS}
          placeholder={t('absence.advice_placeholder')}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20"
        />
        <div className={`rounded-xl border px-3 py-2 ${adviceOk ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
          <p className={`text-[11px] font-bold ${adviceOk ? 'text-emerald-700' : 'text-amber-800'}`}>
            {adviceOk
              ? t('absence.advice_ok').replace('{n}', String(adviceCount))
              : t('absence.advice_need')
                  .replace('{n}', String(adviceCount))
                  .replace('{min}', String(MIN_ABSENCE_ADVICE_CHARS))}
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white">
            <div
              className={`h-full transition-all ${adviceOk ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.min(100, Math.round((adviceCount / MIN_ABSENCE_ADVICE_CHARS) * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. Bài tập giao bù — dùng chung bộ chọn với buổi học bình thường */}
      <HomeworkPicker
        items={value.homeworkItems || []}
        onChange={(homeworkItems) => onChange({ ...value, homeworkItems })}
        label={t('absence.homework_label')}
        hint={t('absence.homework_hint')}
      />

      {/* 3. Ảnh minh chứng — nút tải ảnh nằm ở phần "Hình ảnh" của trang cha */}
      <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${
        imagesOk ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'
      }`}>
        <ImageUp className={`mt-0.5 h-4 w-4 flex-shrink-0 ${imagesOk ? 'text-emerald-600' : 'text-amber-600'}`} />
        <p className={`text-[11px] font-bold leading-relaxed ${imagesOk ? 'text-emerald-700' : 'text-amber-800'}`}>
          {imagesOk
            ? t('absence.image_ok').replace('{n}', String(imageCount))
            : t('absence.image_need')}
        </p>
      </div>
    </div>
  )
}
