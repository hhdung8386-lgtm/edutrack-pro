type CurrencyLesson = {
  status: string
  currency?: string
  pricePerMinute?: number
  minutes: number
  teacherLevel?: number
  payrollPaidBeforeReopen?: boolean
  classHuntCompensation?: unknown
  bookingSubjectReconciliation?: unknown
}

export function planLessonCurrencyCorrection(
  lesson: CurrencyLesson,
  rate: { price: number; currency: string },
  payrolls: { paid?: boolean; voided?: boolean }[],
) {
  if (lesson.status !== 'approved') throw new Error('Chỉ đối soát buổi đã duyệt')
  if (lesson.payrollPaidBeforeReopen || payrolls.some((row) => !row.voided && row.paid)) {
    throw new Error('Khoản lương đã thanh toán; không thể sửa tiền tệ')
  }
  if (lesson.classHuntCompensation !== undefined || lesson.bookingSubjectReconciliation) {
    throw new Error('Buổi có đối soát đặc biệt; cần kiểm tra rate đã chốt')
  }
  const price = Number(lesson.pricePerMinute)
  const level = Number(lesson.teacherLevel)
  if (!Number.isFinite(price) || price <= 0 || price !== rate.price
    || !Number.isFinite(level) || level <= 0
    || !Number.isFinite(lesson.minutes) || lesson.minutes <= 0) {
    throw new Error('Đơn giá hoặc dữ liệu lịch sử chưa khớp; cần kiểm tra trước khi sửa')
  }
  const currency = rate.currency.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Tiền tệ gói học không hợp lệ')
  const amount = lesson.minutes * price * level
  return {
    currency,
    salary: currency === 'USD' ? Math.round(amount * 100) / 100 : Math.round(amount),
  }
}
