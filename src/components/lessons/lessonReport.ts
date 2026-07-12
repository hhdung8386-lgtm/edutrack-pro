/**
 * Kiểu dữ liệu + logic thuần cho báo cáo buổi học có cấu trúc (form điểm danh mẫu mới).
 * UI nằm ở LessonReportForm.tsx (tách file để giữ Fast Refresh).
 *
 * Khi lưu, dữ liệu được ghi CÓ CẤU TRÚC (pages/report/rating) đồng thời
 * ghép thành chuỗi `comment` cũ (composeLessonComment) để mọi màn hình
 * hiển thị hiện có (phụ huynh, admin, lịch sử) tiếp tục hoạt động và
 * dữ liệu cũ không bị ảnh hưởng.
 */

export interface LessonReportDraft {
  pages: string
  knowledgeDone: boolean
  knowledgeComment: string
  gamesDone: boolean
  gamesComment: string
  exercisesDone: boolean
  exercisesComment: string
  homework: string
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
  homework: '',
  rating: 5,
})

const hasLink = (val: string) => {
  const lower = val.toLowerCase()
  return lower.includes('http://') || lower.includes('https://')
    || lower.includes('drive.google.com') || lower.includes('docs.google.com')
}

const wordCount = (val: string) => val.trim().split(/\s+/).filter(Boolean).length

/** Trả về key lỗi i18n đầu tiên, hoặc null nếu hợp lệ. Chỉ gọi khi học viên có mặt. */
export function validateLessonReport(d: LessonReportDraft): string | null {
  if (!d.pages.trim()) return 'report.err_pages_required'
  if (wordCount(d.pages) > 20) return 'report.err_pages_words'
  if (hasLink(d.pages)) return 'report.err_pages_link'
  if (!d.knowledgeComment.trim()) return 'report.err_knowledge'
  if (!d.gamesComment.trim()) return 'report.err_games'
  if (!d.exercisesComment.trim()) return 'report.err_exercises'
  if (!d.homework.trim()) return 'report.err_homework'
  if (d.rating !== 4 && d.rating !== 5) return 'report.err_rating'
  return null
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
  }
}
