import { useState } from 'react'
import { BookMarked, BookOpen, ChevronDown, ChevronUp, Headphones, NotebookPen, PenLine, Star, Video } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLanguageStore } from '@/stores/languageStore'
import {
  HOMEWORK_TYPES, HomeworkItem, HomeworkType, LessonReportDraft, MAX_HOMEWORK_CONTENT_CHARS,
  MAX_HOMEWORK_TYPES, lessonReportCharCount, MIN_REPORT_CHARS,
} from './lessonReport'

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
  const { lang } = useLanguageStore()
  // Đếm theo đúng cách tính của lessonReportCharCount (bỏ khoảng trắng thừa) để
  // con số dưới từng ô khớp với bộ đếm tổng, gia sư không bị "cộng lại thấy đủ mà vẫn báo thiếu".
  const sectionChars = (comment || '').trim().replace(/\s+/g, ' ').length
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
        {/* Đếm ký tự ngay dưới từng ô — gia sư biết mình đã viết bao nhiêu khi đang gõ */}
        <p className={`text-right text-[11px] font-bold ${sectionChars > 0 ? 'text-slate-400' : 'text-amber-600'}`}>
          {sectionChars} {lang === 'en' ? 'characters' : 'ký tự'}
        </p>
      </div>
    </div>
  )
}

const HOMEWORK_ICONS: Record<HomeworkType, LucideIcon> = {
  video: Video,
  writing: PenLine,
  reading: BookOpen,
  listening: Headphones,
  vocabulary: BookMarked,
}

interface HomeworkPickerProps {
  items: HomeworkItem[]
  onChange: (items: HomeworkItem[]) => void
  /** Cho phép đổi nhãn khi dùng lại ở buổi vắng không phép (bài tập giao bù). */
  label?: string
  hint?: string
}

/**
 * Bài tập về nhà: gia sư chọn TỐI ĐA 2 loại và điền nội dung cho từng loại.
 * Dữ liệu lưu có cấu trúc (homeworkItems) và vẫn ghép thành chuỗi `homework` cũ ở lớp lưu.
 * Dùng chung cho buổi có mặt (LessonReportForm) và buổi vắng không phép (AbsenceReportForm).
 */
export function HomeworkPicker({ items, onChange, label, hint }: HomeworkPickerProps) {
  const { t } = useLanguageStore()
  const [collapsed, setCollapsed] = useState<HomeworkType[]>([])

  const selectedCount = items.length
  const contentOf = (type: HomeworkType) => items.find((item) => item.type === type)?.content ?? ''
  const isSelected = (type: HomeworkType) => items.some((item) => item.type === type)

  const toggleType = (type: HomeworkType) => {
    if (isSelected(type)) {
      onChange(items.filter((item) => item.type !== type))
      return
    }
    if (selectedCount >= MAX_HOMEWORK_TYPES) return
    setCollapsed((current) => current.filter((key) => key !== type))
    onChange([...items, { type, content: '' }])
  }

  const setContent = (type: HomeworkType, content: string) => {
    onChange(items.map((item) => (item.type === type ? { ...item, content } : item)))
  }

  return (
    <div className="space-y-2.5">
      <div className="space-y-0.5">
        <span className="block text-sm font-bold text-slate-700">{label || t('report.homework_label')}</span>
        <p className="text-[11px] leading-relaxed text-slate-500">{hint || t('report.homework_hint')}</p>
      </div>

      <div className="space-y-2">
        {HOMEWORK_TYPES.map((type, index) => {
          const Icon = HOMEWORK_ICONS[type]
          const selected = isSelected(type)
          const open = selected && !collapsed.includes(type)
          const atLimit = !selected && selectedCount >= MAX_HOMEWORK_TYPES
          const content = contentOf(type)

          return (
            <div
              key={type}
              className={`rounded-xl border transition ${
                selected ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-white'
              } ${atLimit ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <input
                  type="checkbox"
                  id={`homework-${type}`}
                  checked={selected}
                  disabled={atLimit}
                  onChange={() => toggleType(type)}
                  className="w-4 h-4 accent-indigo-500 flex-shrink-0 disabled:cursor-not-allowed"
                />
                <label
                  htmlFor={`homework-${type}`}
                  className={`flex flex-1 min-w-0 items-center gap-2 ${atLimit ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${selected ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className={`truncate text-sm font-bold ${selected ? 'text-indigo-900' : 'text-slate-600'}`}>
                    {index + 1}. {t(`report.hw_${type}`)}
                  </span>
                </label>
                {selected && (
                  <button
                    type="button"
                    onClick={() => setCollapsed((current) => (
                      current.includes(type) ? current.filter((key) => key !== type) : [...current, type]
                    ))}
                    aria-label={t(`report.hw_${type}`)}
                    aria-expanded={open}
                    className="p-1 text-slate-400 hover:text-indigo-600"
                  >
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {open && (
                <div className="space-y-1 border-t border-indigo-200/60 px-3 py-2.5">
                  <span className="block text-xs font-semibold text-slate-600">
                    {t('report.homework_content')} <span className="text-rose-500">*</span>
                  </span>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(type, e.target.value.slice(0, MAX_HOMEWORK_CONTENT_CHARS))}
                    rows={3}
                    maxLength={MAX_HOMEWORK_CONTENT_CHARS}
                    placeholder={t(`report.hw_${type}_placeholder`)}
                    className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <p className={`text-right text-[11px] font-semibold ${content.trim() ? 'text-slate-400' : 'text-amber-600'}`}>
                    {content.length}/{MAX_HOMEWORK_CONTENT_CHARS}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-400">{t('report.homework_limit')}</p>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
          selectedCount === 0 ? 'bg-amber-50 text-amber-700' : 'bg-indigo-50 text-indigo-700'
        }`}>
          {t('report.homework_selected')}: {selectedCount}/{MAX_HOMEWORK_TYPES}
        </span>
      </div>
    </div>
  )
}

interface LessonReportFormProps {
  value: LessonReportDraft
  onChange: (value: LessonReportDraft) => void
}

export function LessonReportForm({ value, onChange }: LessonReportFormProps) {
  const { t, lang } = useLanguageStore()
  const set = (patch: Partial<LessonReportDraft>) => onChange({ ...value, ...patch })
  const totalChars = lessonReportCharCount(value)
  const enoughChars = totalChars >= MIN_REPORT_CHARS

  return (
    <div className="space-y-5">
      {/* Báo TRƯỚC yêu cầu số ký tự để gia sư biết ngay từ đầu, không phải gõ xong mới bị chặn */}
      <div className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5">
        <NotebookPen className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600" strokeWidth={2} />
        <p className="text-[11px] font-semibold leading-relaxed text-indigo-900">
          {lang === 'en'
            ? `Feedback across the 3 sections below must total at least ${MIN_REPORT_CHARS} characters. The counter under each box and the bar at the bottom show your progress.`
            : `Nhận xét của 3 mục bên dưới cộng lại phải đạt tối thiểu ${MIN_REPORT_CHARS} ký tự. Có bộ đếm dưới từng ô và thanh tổng ở cuối để bạn theo dõi.`}
          {' '}
          <span className={`font-black ${enoughChars ? 'text-emerald-700' : 'text-amber-700'}`}>
            {totalChars}/{MIN_REPORT_CHARS}
          </span>
        </p>
      </div>

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

      {/* Bộ đếm ký tự tổng. KHÔNG dùng sticky: nút "Gửi điểm danh" ở trang cha đã sticky
          bottom, hai khối dính cùng lúc sẽ chồng lên nhau trên điện thoại. Thay vào đó
          gia sư thấy số ký tự ở 3 chỗ: banner đầu form, dưới từng ô, và khối tổng này. */}
      <div className={`rounded-xl border-2 px-3.5 py-3 ${
        enoughChars ? 'border-emerald-300 bg-emerald-50' : 'border-amber-400 bg-amber-50'
      }`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className={`text-sm font-black ${enoughChars ? 'text-emerald-800' : 'text-amber-900'}`}>
            {enoughChars
              ? (lang === 'en' ? 'Feedback is detailed enough' : 'Nhận xét đã đủ chi tiết')
              : (lang === 'en'
                ? `${MIN_REPORT_CHARS - totalChars} more characters needed`
                : `Còn thiếu ${MIN_REPORT_CHARS - totalChars} ký tự`)}
          </p>
          <span className={`text-lg font-black tabular-nums ${enoughChars ? 'text-emerald-700' : 'text-amber-700'}`}>
            {totalChars}<span className="text-xs font-bold text-slate-400">/{MIN_REPORT_CHARS}</span>
          </span>
        </div>
        {!enoughChars && (
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-800">
            {lang === 'en'
              ? 'Describe what the student learned, which games were played and which exercises were done — parents read this to follow their child.'
              : 'Hãy mô tả cụ thể con học được gì, chơi trò gì, làm bài tập nào — phụ huynh đọc nhận xét này để theo dõi con.'}
          </p>
        )}
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white">
          <div
            className={`h-full transition-all ${enoughChars ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min(100, Math.round((totalChars / MIN_REPORT_CHARS) * 100))}%` }}
          />
        </div>
      </div>

      {/* Bài tập về nhà — chọn tối đa 2 loại */}
      <HomeworkPicker
        items={value.homeworkItems || []}
        onChange={(homeworkItems) => onChange({ ...value, homeworkItems })}
      />

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
