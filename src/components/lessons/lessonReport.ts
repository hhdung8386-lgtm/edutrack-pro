/**
 * Kiểu dữ liệu + logic thuần cho báo cáo buổi học có cấu trúc (form điểm danh mẫu mới).
 * UI nằm ở LessonReportForm.tsx (tách file để giữ Fast Refresh).
 *
 * Khi lưu, dữ liệu được ghi CÓ CẤU TRÚC (pages/report/rating) đồng thời
 * ghép thành chuỗi `comment` cũ (composeLessonComment) để mọi màn hình
 * hiển thị hiện có (phụ huynh, admin, lịch sử) tiếp tục hoạt động và
 * dữ liệu cũ không bị ảnh hưởng.
 */

/** 5 loại bài tập về nhà gia sư được chọn (tối đa 2 loại mỗi buổi). */
export const HOMEWORK_TYPES = ['video', 'writing', 'reading', 'listening', 'vocabulary'] as const
export type HomeworkType = (typeof HOMEWORK_TYPES)[number]

/** Số loại bài tập tối đa cho một buổi. */
export const MAX_HOMEWORK_TYPES = 2
/** Độ dài tối đa cho nội dung giao của MỖI loại bài tập. */
export const MAX_HOMEWORK_CONTENT_CHARS = 500

export interface HomeworkItem {
  type: HomeworkType
  content: string
}

/**
 * Nhãn tiếng Việt DÙNG ĐỂ LƯU (ghép vào chuỗi `homework` cũ cho phụ huynh đọc).
 * Cố định theo tiếng Việt, không phụ thuộc ngôn ngữ giao diện của gia sư.
 */
export const HOMEWORK_TYPE_LABELS_VI: Record<HomeworkType, string> = {
  video: 'Quay video',
  writing: 'Bài viết',
  reading: 'Đọc bài',
  listening: 'Nghe & luyện phát âm',
  vocabulary: 'Ôn tập từ vựng / Workbook',
}

export const HOMEWORK_TYPE_LABELS_EN: Record<HomeworkType, string> = {
  video: 'Record a video',
  writing: 'Writing',
  reading: 'Reading',
  listening: 'Listening & pronunciation',
  vocabulary: 'Vocabulary / Workbook review',
}

export interface LessonReportDraft {
  pages: string
  knowledgeDone: boolean
  knowledgeComment: string
  gamesDone: boolean
  gamesComment: string
  exercisesDone: boolean
  exercisesComment: string
  homeworkItems: HomeworkItem[]
  rating: number
}

export const emptyLessonReport = (): LessonReportDraft => ({
  pages: '',
  knowledgeDone: false,
  knowledgeComment: '',
  gamesDone: false,
  gamesComment: '',
  exercisesDone: false,
  exercisesComment: '',
  homeworkItems: [],
  rating: 5,
})

const hasLink = (val: string) => {
  const lower = val.toLowerCase()
  return lower.includes('http://') || lower.includes('https://')
    || lower.includes('drive.google.com') || lower.includes('docs.google.com')
}

const wordCount = (val: string) => val.trim().split(/\s+/).filter(Boolean).length

/** Trả về key lỗi i18n đầu tiên, hoặc null nếu hợp lệ. Chỉ gọi khi học viên có mặt. */
/** Số ký tự tối thiểu cho phần nhận xét (gộp 3 mục) — chống nhận xét hời hợt. */
export const MIN_REPORT_CHARS = 360

/** Gia sư chỉ đánh giá buổi học trong khoảng 3–5 sao theo chính sách hiện hành. */
export const MIN_LESSON_RATING = 3

/** Tổng số ký tự thực (đã bỏ khoảng trắng thừa) của 3 mục nhận xét. */
export function lessonReportCharCount(d: Pick<LessonReportDraft, 'knowledgeComment' | 'gamesComment' | 'exercisesComment'>): number {
  return [d.knowledgeComment, d.gamesComment, d.exercisesComment]
    .map((v) => (v || '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' ')
    .length
}

export function validateLessonReport(d: LessonReportDraft): string | null {
  if (!d.pages.trim()) return 'report.err_pages_required'
  if (wordCount(d.pages) > 20) return 'report.err_pages_words'
  if (hasLink(d.pages)) return 'report.err_pages_link'
  if (!d.knowledgeComment.trim()) return 'report.err_knowledge'
  if (!d.gamesComment.trim()) return 'report.err_games'
  if (!d.exercisesComment.trim()) return 'report.err_exercises'
  // Bắt buộc nhận xét đủ chi tiết: tổng 3 mục tối thiểu MIN_REPORT_CHARS ký tự,
  // tránh tình trạng gia sư ghi hời hợt kiểu "good", "none".
  if (lessonReportCharCount(d) < MIN_REPORT_CHARS) return 'report.err_too_short'
  const homework = normalizeHomeworkItems(d.homeworkItems)
  if (homework.length === 0) return 'report.err_homework'
  if (homework.length > MAX_HOMEWORK_TYPES) return 'report.err_homework_max'
  if (homework.some((item) => item.content.length > MAX_HOMEWORK_CONTENT_CHARS)) return 'report.err_homework_long'
  if (!Number.isInteger(d.rating) || d.rating < MIN_LESSON_RATING || d.rating > 5) return 'report.err_rating'
  return null
}

/** Bỏ loại trống/trùng và cắt khoảng trắng thừa — dùng chung cho validate, compose và lưu. */
export function normalizeHomeworkItems(items: HomeworkItem[] | undefined | null): HomeworkItem[] {
  const seen = new Set<HomeworkType>()
  const result: HomeworkItem[] = []
  for (const item of items || []) {
    if (!item || !HOMEWORK_TYPES.includes(item.type) || seen.has(item.type)) continue
    const content = (item.content || '').trim()
    if (!content) continue
    seen.add(item.type)
    result.push({ type: item.type, content })
  }
  return result
}

/**
 * Ghép các loại bài tập thành chuỗi `homework` cũ.
 * Mọi màn hình cũ (cổng phụ huynh, tracking, lịch sử, nút copy) đọc chuỗi này nên
 * KHÔNG được bỏ, dữ liệu buổi cũ cũng vẫn hiển thị y như trước.
 */
export function composeHomeworkText(items: HomeworkItem[] | undefined | null): string {
  const normalized = normalizeHomeworkItems(items)
  if (normalized.length === 0) return ''
  return normalized
    .map((item, index) => `${index + 1}. ${HOMEWORK_TYPE_LABELS_VI[item.type]}: ${item.content}`)
    .join('\n')
}

/** Ghép báo cáo thành chuỗi `comment` (tiếng Việt cho phụ huynh) — tương thích mọi màn hình cũ. */
export function composeLessonComment(d: LessonReportDraft): string {
  const parts: string[] = []
  if (d.pages.trim()) parts.push(`📖 Trang học: ${d.pages.trim()}`)
  parts.push(`1️⃣ Điểm kiến thức${d.knowledgeDone ? ' (✓ đã hoàn thành 1 điểm kiến thức)' : ''}: ${d.knowledgeComment.trim()}`)
  parts.push(`2️⃣ Trò chơi${d.gamesDone ? ' (✓ đã tổ chức 2 trò chơi)' : ''}: ${d.gamesComment.trim()}`)
  parts.push(`3️⃣ Bài tập trên lớp${d.exercisesDone ? ' (✓ đã hoàn thành 3 bài tập)' : ''}: ${d.exercisesComment.trim()}`)
  parts.push(`⭐ Chấm điểm buổi học: ${d.rating}/5`)
  return parts.join('\n')
}

/** Các field có cấu trúc để lưu kèm lesson (không chứa undefined — an toàn cho Firestore). */
export function lessonReportFields(d: LessonReportDraft) {
  return {
    pages: d.pages.trim(),
    rating: d.rating,
    report: {
      knowledgeDone: d.knowledgeDone,
      knowledgeComment: d.knowledgeComment.trim(),
      gamesDone: d.gamesDone,
      gamesComment: d.gamesComment.trim(),
      exercisesDone: d.exercisesDone,
      exercisesComment: d.exercisesComment.trim(),
    },
    // Bản có cấu trúc của bài tập về nhà; chuỗi `homework` vẫn được ghi song song
    // để mọi màn hình/dữ liệu cũ không bị ảnh hưởng.
    homeworkItems: normalizeHomeworkItems(d.homeworkItems),
  }
}

/**
 * Đọc NGƯỢC phần nhận xét dạng chữ (do composeLessonComment sinh ra ở các buổi cũ,
 * hoặc gia sư gõ theo mẫu tương tự) thành cấu trúc 3 mục.
 *
 * Mục đích: các buổi CŨ chưa có field `report` vẫn hiển thị đẹp và thống nhất với
 * buổi mới ở cổng phụ huynh, thay vì đổ ra một khối chữ thô.
 * CHỈ dùng cho hiển thị — không ghi đè dữ liệu gốc.
 */
export function parseLegacyLessonReport(comment: string): {
  pages: string
  knowledgeDone: boolean
  knowledgeComment: string
  gamesDone: boolean
  gamesComment: string
  exercisesDone: boolean
  exercisesComment: string
} | null {
  if (!comment || !comment.trim()) return null

  // 1️⃣ -> "1." để bắt được cả hai kiểu ghi
  const text = comment.replace(/([123])️?⃣/gu, '$1.')

  const pick = (patterns: RegExp[]): { value: string; done: boolean } | null => {
    for (const re of patterns) {
      const m = text.match(re)
      if (m) {
        const value = (m[2] || '').trim()
        if (value) return { value, done: /[✓✔]/.test(m[1] || '') }
      }
    }
    return null
  }

  const knowledge = pick([
    /(?:^|\n)\s*1\.\s*(?:Điểm\s+)?ki[eế]n\s*th[uứ]c([^:\n]*):\s*([^\n]*)/iu,
    /(?:^|\n)\s*ki[eế]n\s*th[uứ]c\s*b[aà]i\s*h[oọ]c([^:\n]*):\s*([^\n]*)/iu,
  ])
  const games = pick([
    /(?:^|\n)\s*2\.\s*tr[oò]\s*ch[oơ]i([^:\n]*):\s*([^\n]*)/iu,
    /(?:^|\n)\s*(?:tr[oò]\s*ch[oơ]i\s*t[uư][oơ]ng\s*t[aá]c|ho[aạ]t\s*đ[oộ]ng\s*tr[eê]n\s*l[oớ]p)([^:\n]*):\s*([^\n]*)/iu,
  ])
  const exercises = pick([
    /(?:^|\n)\s*3\.\s*b[aà]i\s*t[aậ]p([^:\n]*):\s*([^\n]*)/iu,
    /(?:^|\n)\s*b[aà]i\s*t[aậ]p\s*(?:luy[eệ]n\s*t[aậ]p|tr[eê]n\s*l[oớ]p)([^:\n]*):\s*([^\n]*)/iu,
  ])

  // Không nhận dạng được mục nào -> trả null để giữ nguyên cách hiển thị cũ
  if (!knowledge && !games && !exercises) return null

  // Cho phép ký tự trang trí (emoji 📖) đứng trước nhãn
  const pagesMatch = text.match(/(?:^|\n)[^\n:]{0,4}?(?:Trang\s*h[oọ]c|N[oộ]i\s*dung\s*h[oọ]c)\s*:\s*([^\n]*)/iu)

  return {
    pages: (pagesMatch?.[1] || '').trim(),
    knowledgeDone: knowledge?.done ?? false,
    knowledgeComment: knowledge?.value || '',
    gamesDone: games?.done ?? false,
    gamesComment: games?.value || '',
    exercisesDone: exercises?.done ?? false,
    exercisesComment: exercises?.value || '',
  }
}
