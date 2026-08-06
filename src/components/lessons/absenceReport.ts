/**
 * Kiểu dữ liệu + logic thuần cho phần BẮT BUỘC khi học viên VẮNG KHÔNG PHÉP.
 *
 * Quy định: buổi vắng không phép vẫn được tính 25 phút cho gia sư, nên gia sư
 * phải để lại DẶN DÒ cho học viên và GIAO BÀI TẬP kèm HÌNH ẢNH minh chứng thì
 * mới gửi được điểm danh. Không áp dụng cho vắng có phép (0 phút) và buổi có mặt
 * (đã có form báo cáo riêng ở lessonReport.ts).
 *
 * UI nằm ở AbsenceReportForm.tsx (tách file để giữ Fast Refresh).
 * Khi lưu, dữ liệu ghi CÓ CẤU TRÚC (absenceReport/homeworkItems) đồng thời ghép
 * thành chuỗi `comment`/`homework` cũ để mọi màn hình hiện có (phụ huynh, giáo vụ,
 * lịch sử, nút copy) hiển thị được như buổi thường.
 */

import { HomeworkItem, composeHomeworkText, normalizeHomeworkItems, MAX_HOMEWORK_CONTENT_CHARS, MAX_HOMEWORK_TYPES } from './lessonReport'

/** Số ký tự tối thiểu của phần dặn dò — chống ghi hời hợt kiểu "nghỉ". */
export const MIN_ABSENCE_ADVICE_CHARS = 50
/** Độ dài tối đa của phần dặn dò. */
export const MAX_ABSENCE_ADVICE_CHARS = 1000
/** Số ảnh minh chứng tối thiểu (bài tập đã giao / màn hình chờ học viên). */
export const MIN_ABSENCE_IMAGES = 1

export interface AbsenceReportDraft {
  /** Lời dặn dò gia sư gửi học viên & phụ huynh sau buổi vắng. */
  advice: string
  /** Bài tập giao bù cho buổi vắng (dùng chung 5 loại với buổi học bình thường). */
  homeworkItems: HomeworkItem[]
}

export const emptyAbsenceReport = (): AbsenceReportDraft => ({
  advice: '',
  homeworkItems: [],
})

/** Số ký tự thực của phần dặn dò (đã gộp khoảng trắng thừa). */
export function absenceAdviceCharCount(advice: string): number {
  return (advice || '').trim().replace(/\s+/g, ' ').length
}

/**
 * Trả về key lỗi i18n đầu tiên, hoặc null nếu hợp lệ.
 * CHỈ gọi khi attendanceStatus === 'without_permission'.
 *
 * @param imageCount số ảnh ĐÃ tải lên xong (không tính ảnh đang tải dở)
 */
export function validateAbsenceReport(d: AbsenceReportDraft, imageCount: number): string | null {
  if (!d.advice.trim()) return 'absence.err_advice_required'
  if (absenceAdviceCharCount(d.advice) < MIN_ABSENCE_ADVICE_CHARS) return 'absence.err_advice_short'
  if (d.advice.length > MAX_ABSENCE_ADVICE_CHARS) return 'absence.err_advice_long'
  const homework = normalizeHomeworkItems(d.homeworkItems)
  if (homework.length === 0) return 'absence.err_homework'
  if (homework.length > MAX_HOMEWORK_TYPES) return 'report.err_homework_max'
  if (homework.some((item) => item.content.length > MAX_HOMEWORK_CONTENT_CHARS)) return 'report.err_homework_long'
  if (imageCount < MIN_ABSENCE_IMAGES) return 'absence.err_image'
  return null
}

/** Đủ điều kiện gửi chưa — dùng để bật/tắt nút gửi, không thay cho validate. */
export function isAbsenceReportComplete(d: AbsenceReportDraft, imageCount: number): boolean {
  return validateAbsenceReport(d, imageCount) === null
}

/**
 * Ghép phần dặn dò thành chuỗi `comment` (tiếng Việt cho phụ huynh).
 * Giữ đúng dạng chuỗi như buổi thường để mọi màn hình cũ hiển thị được ngay.
 */
export function composeAbsenceComment(d: AbsenceReportDraft): string {
  const advice = d.advice.trim()
  const parts = ['⚠️ Học viên vắng không phép — gia sư đã chờ nhưng buổi học không diễn ra.']
  if (advice) parts.push(`📌 Dặn dò của gia sư: ${advice}`)
  return parts.join('\n')
}

/** Chuỗi `homework` cũ cho buổi vắng — dùng chung bộ ghép với buổi thường. */
export function composeAbsenceHomeworkText(d: AbsenceReportDraft): string {
  return composeHomeworkText(d.homeworkItems)
}

/** Các field có cấu trúc để lưu kèm lesson (không chứa undefined — an toàn cho Firestore). */
export function absenceReportFields(d: AbsenceReportDraft) {
  return {
    absenceReport: {
      advice: d.advice.trim(),
    },
    homeworkItems: normalizeHomeworkItems(d.homeworkItems),
  }
}
