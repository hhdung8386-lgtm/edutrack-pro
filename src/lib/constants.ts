export const MINUTE_PRESETS = [25, 50, 75, 100] as const

export const LESSON_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
}

export const STUDENT_STATUS_LABELS: Record<string, string> = {
  active: 'Đang học',
  inactive: 'Tạm dừng',
  expired: 'Hết buổi',
}

export const TEACHER_STATUS_LABELS: Record<string, string> = {
  active: 'Đang dạy',
  inactive: 'Ngừng dạy',
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatMoney(amount: number, currency: string = 'VND'): string {
  const curr = (currency || 'VND').toUpperCase()
  if (curr === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  }
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatPricePerMinute(price: number, currency: string = 'VND'): string {
  const curr = (currency || 'VND').toUpperCase()
  if (curr === 'USD') {
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price)
    return `$${formatted}/phút`
  }
  return `${price.toLocaleString('vi-VN')}đ/phút`
}


export function formatVNDCompact(amount: number): string {
  if (amount >= 1_000_000) {
    return (amount / 1_000_000).toFixed(1) + 'M'
  }
  if (amount >= 1_000) {
    return (amount / 1_000).toFixed(0) + 'K'
  }
  return amount.toString()
}

export const VIETNAMESE_MONTHS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
  'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
  'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]

export const VIETNAMESE_DAYS = [
  'Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư',
  'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy',
]

export function formatVietnameseDate(dateStr: string): string {
  const date = new Date(dateStr)
  const day = VIETNAMESE_DAYS[date.getDay()]
  return `${day}, ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`
}

export function getCurrentMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function getToday(): string {
  const now = new Date()
  return now.toISOString().split('T')[0]
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone
  return phone.slice(0, 2) + 'xx' + phone.slice(-4)
}

export function openBase64InNewTab(dataUrl: string) {
  try {
    if (!dataUrl.startsWith('data:')) {
      window.open(dataUrl, '_blank');
      return;
    }
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) return;
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (e) {
    console.error('Lỗi khi mở file', e);
  }
}
