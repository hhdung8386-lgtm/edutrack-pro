import type { Lesson } from '@/types'
import { formatShortDate } from '@/lib/attendanceAudit'

/**
 * Soạn nội dung một buổi học để giáo vụ COPY gửi phụ huynh.
 * Chỉ gồm thông tin phụ huynh được phép thấy — không kèm lương, giá phút hay
 * ghi chú nội bộ.
 */
export function buildLessonParentMessage(lesson: Lesson): string {
  const lines: string[] = []
  lines.push('📘 BÁO CÁO BUỔI HỌC — 123English')
  lines.push('')
  lines.push(`👦 Học viên: ${lesson.studentName}${lesson.studentCode ? ` (${lesson.studentCode})` : ''}`)
  lines.push(`📅 Ngày học: ${formatShortDate(lesson.date)}`)
  if (lesson.teacherName) lines.push(`👩‍🏫 Gia sư: ${lesson.teacherName}`)
  if (lesson.subjectName) lines.push(`📚 Môn học: ${lesson.subjectName}`)

  const attendanceLabel = lesson.attendanceStatus === 'with_permission'
    ? 'Vắng có phép'
    : lesson.attendanceStatus === 'without_permission'
      ? 'Vắng không phép'
      : ''
  if (attendanceLabel) lines.push(`⚠️ Tình trạng: ${attendanceLabel}`)

  if (lesson.book) lines.push(`📖 Sách học: ${lesson.book}`)
  if (lesson.pages) lines.push(`📄 Trang học: ${lesson.pages}`)
  if (lesson.minutes) lines.push(`⏱ Thời lượng: ${lesson.minutes} phút`)

  if (lesson.comment?.trim()) {
    lines.push('')
    lines.push('📝 Nhận xét buổi học:')
    lines.push(lesson.comment.trim())
  }

  if (lesson.homework?.trim()) {
    lines.push('')
    lines.push('🏠 Bài tập về nhà:')
    lines.push(lesson.homework.trim())
  }

  return lines.join('\n')
}

/**
 * Copy an toàn trên cả máy tính và điện thoại: ưu tiên Clipboard API,
 * lùi về textarea + execCommand khi trình duyệt/WebView không cho phép.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (err) {
    console.warn('[copy] clipboard API failed, falling back', err)
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-1000px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch (err) {
    console.error('[copy] fallback failed', err)
    return false
  }
}
