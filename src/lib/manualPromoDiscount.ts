import { getCanonicalSubjectRate } from './countryPricing.ts'
import type { ClassHuntCompensation } from '../types/index.ts'

/**
 * Giảm giá khi giáo vụ "Xếp lớp nhanh" — cùng quy tắc với Lớp ưu đãi của Săn lớp:
 * số phút giữ nguyên, kim cương học viên và lương gia sư cùng giảm %.
 * 0 = không giảm (ca thường, không ghi field ưu đãi nào).
 */
export const MANUAL_PROMO_DISCOUNT_OPTIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50] as const

/** Mã lô dùng làm `classHuntId` để luồng duyệt/lương đọc đúng snapshot đã chốt. */
export const MANUAL_PROMO_BATCH_PREFIX = 'manual-promo-'

export function normalizeManualPromoDiscount(value: unknown): number {
  const percent = Number(value)
  return (MANUAL_PROMO_DISCOUNT_OPTIONS as readonly number[]).includes(percent) ? percent : 0
}

/** Kim cương / 25 phút sau giảm; làm tròn nguyên (min 1) như mọi đường giữ/trừ. */
export function manualPromoPointsPer25Minutes(baseRate: number, discountPercent: number): number {
  const percent = normalizeManualPromoDiscount(discountPercent)
  if (!percent) return baseRate
  return Math.max(1, Math.round(baseRate * (100 - percent) / 100))
}

/** Lương thường mỗi phút = giá gói môn x cấp gia sư (đúng công thức trang duyệt). */
export function manualRegularPayPerMinute(
  subjectPackage: Parameters<typeof getCanonicalSubjectRate>[0] | null | undefined,
  teacherLevel: unknown,
): { price: number; currency: string } | null {
  if (!subjectPackage) return null
  const rate = getCanonicalSubjectRate(subjectPackage)
  const level = Number(teacherLevel) > 0 ? Number(teacherLevel) : 1
  if (!(rate.price > 0)) return null
  return { price: rate.price * level, currency: (rate.currency || 'VND').toUpperCase() }
}

/**
 * Snapshot lương đã giảm, cùng định dạng Lớp ưu đãi. Trả null khi gói không có
 * đơn giá VND — khi đó không được xếp ca giảm giá (không đoán lương).
 */
export function manualPromoCompensation(
  subjectPackage: Parameters<typeof getCanonicalSubjectRate>[0] | null | undefined,
  teacherLevel: unknown,
  discountPercent: number,
): ClassHuntCompensation | null {
  const percent = normalizeManualPromoDiscount(discountPercent)
  const regular = manualRegularPayPerMinute(subjectPackage, teacherLevel)
  if (!percent || !regular || regular.currency !== 'VND') return null
  const ratePerMinute = Math.max(1, Math.round(regular.price * (100 - percent) / 100))
  if (!Number.isSafeInteger(ratePerMinute)) return null
  return { version: 1, ratePerMinute, currency: 'VND', formula: 'flat_per_minute' }
}

/** Đơn giá chuẩn của khóa SALE: 25 KC / 25 phút (1 kim cương giá gốc = 1 phút học). */
export const COURSE_SALE_BASE_POINTS_PER_25_MINUTES = 25

/**
 * Kim cương ghi vào quỹ khóa SALE, quy từ kim cương giá gốc. Dùng đúng mức trừ
 * mỗi ca đã làm tròn (25 → 18 khi giảm 30%) để số phút học giữ nguyên:
 * 300 KC gốc, giảm 30% → 216 KC = vẫn đủ 300 phút (12 ca x 18 KC).
 * Không giảm → giữ nguyên số đã nhập.
 */
export function courseSaleDiamonds(baseDiamonds: unknown, discountPercent: unknown): number {
  const base = Number(baseDiamonds)
  if (!Number.isFinite(base) || base <= 0) return 0
  const percent = normalizeManualPromoDiscount(discountPercent)
  if (!percent) return base
  const rate = manualPromoPointsPer25Minutes(COURSE_SALE_BASE_POINTS_PER_25_MINUTES, percent)
  return Math.max(1, Math.round(base * rate / COURSE_SALE_BASE_POINTS_PER_25_MINUTES))
}

/**
 * Đơn giá/phút (lương gia sư) của khóa SALE: giá gói giảm %, làm tròn đồng.
 * Chỉ áp cho VND (SALE chỉ cho khóa VND); không SALE hoặc tiền tệ khác → giữ nguyên.
 */
export function courseSalePricePerMinute(price: unknown, discountPercent: unknown, currency?: string): number {
  const value = Number(price) || 0
  const percent = normalizeManualPromoDiscount(discountPercent)
  if (!percent || value <= 0 || (currency || 'VND').toUpperCase() !== 'VND') return value
  return Math.max(1, Math.round(value * (100 - percent) / 100))
}
