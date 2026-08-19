// Giữ bảng này cho nhãn/khả năng đọc dữ liệu cũ. Nó không còn quyết định đơn giá.
export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  VN: 'VND',
  PH: 'PHP',
  NATIVE: 'USD',
  US: 'USD',
  GB: 'USD',
  CA: 'CAD',
  AU: 'AUD',
}

export function formatVietnameseNumberInput(val: string): string {
  const clean = val.replace(/\D/g, '')
  if (!clean) return ''
  return Number(clean).toLocaleString('vi-VN')
}

export function getCountryRate(
  subject: {
    pricePerMinute: number
    pricePerMinuteVN?: number
    pricePerMinutePH?: number
    pricePerMinuteNative?: number
    otherCountriesPrices?: Record<string, number>
    countryPrices?: Record<string, { price: number; currency: string; isDefault?: boolean }>
    currency?: string
  },
  _country: string = 'VN'
): { price: number; currency: string } {
  void _country
  return getCanonicalSubjectRate(subject)
}

export function getCanonicalSubjectRate(subject: {
  pricePerMinute?: number
  pricePerMinuteVN?: number
  countryPrices?: Record<string, { price: number; currency: string; isDefault?: boolean }>
  currency?: string
}): { price: number; currency: string } {
  const legacyDefault = Object.values(subject.countryPrices || {}).find((rate) => rate.isDefault)
    || subject.countryPrices?.VN
  const price = Number(subject.pricePerMinute) > 0
    ? Number(subject.pricePerMinute)
    : Number(subject.pricePerMinuteVN) > 0
      ? Number(subject.pricePerMinuteVN)
      : Number(legacyDefault?.price) || 0

  // Quy tắc hiện hành: một môn/gói học chỉ có một giá và một tiền tệ mặc định.
  // Các field theo quốc gia vẫn nằm trong type để đọc dữ liệu cũ nhưng không còn
  // tham gia chọn giá theo quốc gia. Hồ sơ cũ thiếu field chính dùng đúng một
  // mức đã đánh dấu mặc định/VN; lịch sử đã duyệt dùng snapshot trên lesson.
  return {
    price,
    currency: subject.currency || legacyDefault?.currency || 'VND',
  }
}
