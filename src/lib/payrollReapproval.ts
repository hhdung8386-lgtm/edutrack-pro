export type ReopenedPaidLesson = {
  payrollPaidBeforeReopen?: boolean
  payrollPaidAmount?: number
  payrollPaidCurrency?: string
  payrollPaidAt?: unknown
}

/**
 * Nếu một buổi đã trả lương được mở lại để kiểm tra, lần duyệt lại phải giữ
 * nguyên khoản đã chi thay vì tạo lại một khoản "chưa thanh toán" và trả trùng.
 */
export function buildPayrollApprovalFields(
  lesson: ReopenedPaidLesson,
  calculatedAmount: number,
  calculatedCurrency: string,
) {
  if (lesson.payrollPaidBeforeReopen !== true) {
    return { amount: calculatedAmount, currency: calculatedCurrency, paid: false }
  }

  const storedAmount = Number(lesson.payrollPaidAmount)
  const fields: Record<string, unknown> = {
    amount: Number.isFinite(storedAmount) ? storedAmount : calculatedAmount,
    currency: lesson.payrollPaidCurrency || calculatedCurrency,
    paid: true,
    paymentPreservedAfterReview: true,
  }
  if (lesson.payrollPaidAt !== undefined && lesson.payrollPaidAt !== null) {
    fields.paidAt = lesson.payrollPaidAt
  }
  return fields
}
