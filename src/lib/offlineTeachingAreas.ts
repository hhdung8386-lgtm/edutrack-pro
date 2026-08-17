export type OfflineTeachingAreaOption = {
  value: string
  label: string
  labelEn: string
}

/**
 * Danh sách vùng nhận lớp offline dùng chung cho form và màn hình chi tiết.
 * Lưu mã ổn định thay vì nguyên nhãn để có thể đổi cách trình bày mà không
 * phải cập nhật hàng loạt hồ sơ cũ.
 */
export const OFFLINE_TEACHING_AREA_OPTIONS: OfflineTeachingAreaOption[] = [
  { value: 'central', label: 'Trung tâm (Q1, Q3, Phú Nhuận)', labelEn: 'Central (Districts 1, 3, Phu Nhuan)' },
  { value: 'central_west', label: 'Trung tâm Tây (Q5, Q10, Q11)', labelEn: 'Central West (Districts 5, 10, 11)' },
  { value: 'west', label: 'Tây (Q6, Bình Tân, Tân Phú)', labelEn: 'West (District 6, Binh Tan, Tan Phu)' },
  { value: 'northwest', label: 'Tây Bắc (Tân Bình, Gò Vấp, Q12)', labelEn: 'Northwest (Tan Binh, Go Vap, District 12)' },
  { value: 'northeast', label: 'Đông Bắc (Bình Thạnh, Thủ Đức cũ)', labelEn: 'Northeast (Binh Thanh, former Thu Duc)' },
  { value: 'east', label: 'Đông (Q2 cũ, Q9 cũ)', labelEn: 'East (former Districts 2 and 9)' },
  { value: 'south', label: 'Nam (Q4, Q7, Nhà Bè)', labelEn: 'South (Districts 4, 7, Nha Be)' },
  { value: 'southwest', label: 'Tây Nam (Q8, Bình Chánh)', labelEn: 'Southwest (District 8, Binh Chanh)' },
  { value: 'hoc_mon', label: 'Hóc Môn', labelEn: 'Hoc Mon' },
  { value: 'cu_chi', label: 'Củ Chi', labelEn: 'Cu Chi' },
  { value: 'can_gio', label: 'Cần Giờ', labelEn: 'Can Gio' },
]

const AREA_LABELS = new Map(
  OFFLINE_TEACHING_AREA_OPTIONS.map((option) => [option.value, option.label]),
)

export function offlineTeachingAreaLabels(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return []

  return [...new Set(values)]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => AREA_LABELS.get(value) || value)
}
