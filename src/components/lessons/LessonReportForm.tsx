import { Star } from 'lucide-react'
import { useLanguageStore } from '@/stores/languageStore'
import { LessonReportDraft } from './lessonReport'

/**
 * UI form báo cáo buổi học có cấu trúc (mẫu mới):
 * Trang học + 3 mục (Điểm kiến thức / Trò chơi / Bài tập trên lớp) + Bài tập về nhà + Chấm sao.
 * Dùng chung cho AttendancePage và BookingSchedulesPage.
 * Logic thuần (validate/compose/fields) nằm ở lessonReport.ts.
 */

interface SectionProps {
  index: number
  label: string
  checkLabel: string
  checked: boolean
  onCheck: (v: boolean) => void
  comment: string
  onComment: (v: string) => void
  placeholder: string
  commentLabel: string
}

function ReportSection({ index, label, checkLabel, checked, onCheck, comment, onComment, placeholder, commentLabel }: SectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
          {index}
        </span>
        <span className="text-sm font-bold text-slate-700">{label}</span>
      </div>
      <label className="flex items-center gap-2.5 cursor-pointer select-none pl-8">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          className="w-4 h-4 accent-indigo-500 flex-shrink-0"
        />
        <span className="text-sm font-semibold text-slate-600">{checkLabel}</span>
      </label>
      <div className="pl-8 space-y-1">
        <span className="block text-xs font-semibold text-slate-500">{commentLabel}</span>
        <textarea
          value={comment}
          onChange={(e) => onComment(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>
    </div>
  )
}

interface LessonReportFormProps {
  value: LessonReportDraft
  onChange: (value: LessonReportDraft) => void
}

export function LessonReportForm({ value, onChange }: LessonReportFormProps) {
  const { t } = useLanguageStore()
  const set = (patch: Partial<LessonReportDraft>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-5">
      {/* Trang học */}
      <div className="space-y-1">
        <label className="block text-sm font-bold text-slate-700">{t('report.pages_label')}</label>
        <input
          type="text"
          value={value.pages}
          onChange={(e) => set({ pages: e.target.value })}
          placeholder={t('report.pages_placeholder')}
          className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
        <p className="text-[11px] text-slate-400">{t('report.pages_hint')}</p>
      </div>

      <ReportSection
        index={1}
        label={t('report.knowledge_label')}
        checkLabel={t('report.knowledge_check')}
        checked={value.knowledgeDone}
        onCheck={(v) => set({ knowledgeDone: v })}
        comment={value.knowledgeComment}
        onComment={(v) => set({ knowledgeComment: v })}
        placeholder={t('report.knowledge_placeholder')}
        commentLabel={t('report.section_comment')}
      />

      <ReportSection
        index={2}
        label={t('report.games_label')}
        checkLabel={t('report.games_check')}
        checked={value.gamesDone}
        onCheck={(v) => set({ gamesDone: v })}
        comment={value.gamesComment}
        onComment={(v) => set({ gamesComment: v })}
        placeholder={t('report.games_placeholder')}
        commentLabel={t('report.section_comment')}
      />

      <ReportSection
        index={3}
        label={t('report.exercises_label')}
        checkLabel={t('report.exercises_check')}
        checked={value.exercisesDone}
        onCheck={(v) => set({ exercisesDone: v })}
        comment={value.exercisesComment}
        onComment={(v) => set({ exercisesComment: v })}
        placeholder={t('report.exercises_placeholder')}
        commentLabel={t('report.section_comment')}
      />

      {/* Bài tập về nhà */}
      <div className="space-y-2">
        <span className="block text-sm font-bold text-slate-700">{t('report.homework_label')}</span>
        <div className="space-y-1">
          <span className="block text-xs font-semibold text-slate-500">{t('report.homework_content')}</span>
          <textarea
            value={value.homework}
            onChange={(e) => set({ homework: e.target.value })}
            rows={3}
            placeholder={t('report.homework_placeholder')}
            className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {/* Chấm điểm buổi học */}
      <div className="space-y-1.5">
        <span className="block text-sm font-bold text-slate-700">{t('report.rating_label')}</span>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((star) => {
            const selectable = star >= 4
            const active = star <= value.rating
            return (
              <button
                key={star}
                type="button"
                disabled={!selectable}
                onClick={() => selectable && set({ rating: star })}
                aria-label={`${star} sao`}
                className={`p-0.5 transition-transform ${selectable ? 'cursor-pointer hover:scale-110' : 'cursor-not-allowed opacity-40'}`}
              >
                <Star
                  className={`w-8 h-8 ${active ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`}
                />
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-slate-400">{t('report.rating_hint')}</p>
      </div>
    </div>
  )
}
