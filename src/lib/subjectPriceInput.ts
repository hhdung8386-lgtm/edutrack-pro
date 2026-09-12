/**
 * Đọc/ghi ô "Giá mỗi phút" của danh mục môn học.
 *
 * VND: số nguyên (2 500) hoặc tối đa 2 chữ số thập phân sau dấu chấm (833.33 =
 * 20 833 đ / 25 phút). Kiểu nhập cũ 2.500 / 2,500 (đúng 3 chữ số sau dấu) vẫn là
 * hàng nghìn nên 833.33 không bao giờ bị hiểu thành 83 333.
 * Ngoại tệ: khoảng trắng nhóm hàng nghìn, dấu chấm là phần thập phân.
 */
export function parseSubjectPriceInput(input: string, currency: string): number {
  if (!input.trim()) return 0
  const curr = (currency || 'VND').toUpperCase()
  let clean = input.trim().replace(/\s+/g, '')

  if (curr === 'VND') {
    if (/^\d+$/.test(clean)) return Number(clean)
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(clean)) return Number(clean.replace(/[.,]/g, ''))
    if (/^\d+\.\d{1,2}$/.test(clean)) return Number(clean)
    return Number.NaN
  }

  // Chấp nhận dấu phẩy cũ chỉ khi rõ ràng là nhóm hàng nghìn.
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(clean)) clean = clean.replace(/,/g, '')
  else if (clean.includes(',')) return Number.NaN
  if (!/^\d+(?:\.\d+)?$/.test(clean)) return Number.NaN
  return Number(clean)
}

export function formatSubjectPriceInput(value: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return ''
  const parts = value.toString().split('.')
  const integerPart = Number(parts[0]).toLocaleString('en-US').replace(/,/g, ' ')
  return parts.length > 1 ? `${integerPart}.${parts[1]}` : integerPart
}
