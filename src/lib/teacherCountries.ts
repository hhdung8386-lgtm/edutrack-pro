export type TeacherCountryGroup = 'native' | 'non_native' | 'legacy'

export interface TeacherCountryOption {
  code: string
  nameVi: string
  nameEn: string
  group: TeacherCountryGroup
  flagCode: string
  timezoneId: string
  timezoneLabel: string
}

export const TEACHER_COUNTRY_OPTIONS: TeacherCountryOption[] = [
  { code: 'GB', nameVi: 'Vương quốc Anh', nameEn: 'United Kingdom', group: 'native', flagCode: 'gb', timezoneId: 'Europe/London', timezoneLabel: 'GMT+0' },
  { code: 'US', nameVi: 'Hoa Kỳ', nameEn: 'United States', group: 'native', flagCode: 'us', timezoneId: 'America/New_York', timezoneLabel: 'EST' },
  { code: 'CA', nameVi: 'Canada', nameEn: 'Canada', group: 'native', flagCode: 'ca', timezoneId: 'America/Toronto', timezoneLabel: 'GMT-5' },
  { code: 'AU', nameVi: 'Úc', nameEn: 'Australia', group: 'native', flagCode: 'au', timezoneId: 'Australia/Sydney', timezoneLabel: 'GMT+10' },
  { code: 'NZ', nameVi: 'New Zealand', nameEn: 'New Zealand', group: 'native', flagCode: 'nz', timezoneId: 'Pacific/Auckland', timezoneLabel: 'GMT+12' },
  { code: 'IE', nameVi: 'Ireland', nameEn: 'Ireland', group: 'native', flagCode: 'ie', timezoneId: 'Europe/Dublin', timezoneLabel: 'GMT+0' },
  { code: 'ZA', nameVi: 'Nam Phi', nameEn: 'South Africa', group: 'native', flagCode: 'za', timezoneId: 'Africa/Johannesburg', timezoneLabel: 'GMT+2' },
  { code: 'VN', nameVi: 'Việt Nam', nameEn: 'Vietnam', group: 'non_native', flagCode: 'vn', timezoneId: 'Asia/Ho_Chi_Minh', timezoneLabel: 'GMT+7' },
  { code: 'PH', nameVi: 'Philippines', nameEn: 'Philippines', group: 'non_native', flagCode: 'ph', timezoneId: 'Asia/Manila', timezoneLabel: 'GMT+8' },
  { code: 'KE', nameVi: 'Kenya', nameEn: 'Kenya', group: 'non_native', flagCode: 'ke', timezoneId: 'Africa/Nairobi', timezoneLabel: 'GMT+3' },
  { code: 'NG', nameVi: 'Nigeria', nameEn: 'Nigeria', group: 'non_native', flagCode: 'ng', timezoneId: 'Africa/Lagos', timezoneLabel: 'GMT+1' },
  { code: 'GH', nameVi: 'Ghana', nameEn: 'Ghana', group: 'non_native', flagCode: 'gh', timezoneId: 'Africa/Accra', timezoneLabel: 'GMT+0' },
  { code: 'UG', nameVi: 'Uganda', nameEn: 'Uganda', group: 'non_native', flagCode: 'ug', timezoneId: 'Africa/Kampala', timezoneLabel: 'GMT+3' },
  { code: 'IN', nameVi: 'Ấn Độ', nameEn: 'India', group: 'non_native', flagCode: 'in', timezoneId: 'Asia/Kolkata', timezoneLabel: 'GMT+5:30' },
  { code: 'PK', nameVi: 'Pakistan', nameEn: 'Pakistan', group: 'non_native', flagCode: 'pk', timezoneId: 'Asia/Karachi', timezoneLabel: 'GMT+5' },
  { code: 'BD', nameVi: 'Bangladesh', nameEn: 'Bangladesh', group: 'non_native', flagCode: 'bd', timezoneId: 'Asia/Dhaka', timezoneLabel: 'GMT+6' },
  { code: 'LK', nameVi: 'Sri Lanka', nameEn: 'Sri Lanka', group: 'non_native', flagCode: 'lk', timezoneId: 'Asia/Colombo', timezoneLabel: 'GMT+5:30' },
  { code: 'MM', nameVi: 'Myanmar', nameEn: 'Myanmar', group: 'non_native', flagCode: 'mm', timezoneId: 'Asia/Yangon', timezoneLabel: 'GMT+6:30' },
  { code: 'MY', nameVi: 'Malaysia', nameEn: 'Malaysia', group: 'non_native', flagCode: 'my', timezoneId: 'Asia/Kuala_Lumpur', timezoneLabel: 'GMT+8' },
  { code: 'ID', nameVi: 'Indonesia', nameEn: 'Indonesia', group: 'non_native', flagCode: 'id', timezoneId: 'Asia/Jakarta', timezoneLabel: 'GMT+7' },
]

const LEGACY_COUNTRY_OPTIONS: TeacherCountryOption[] = [
  { code: 'JP', nameVi: 'Nhật Bản', nameEn: 'Japan', group: 'legacy', flagCode: 'jp', timezoneId: 'Asia/Tokyo', timezoneLabel: 'GMT+9' },
  { code: 'KR', nameVi: 'Hàn Quốc', nameEn: 'Korea', group: 'legacy', flagCode: 'kr', timezoneId: 'Asia/Seoul', timezoneLabel: 'GMT+9' },
  { code: 'SG', nameVi: 'Singapore', nameEn: 'Singapore', group: 'legacy', flagCode: 'sg', timezoneId: 'Asia/Singapore', timezoneLabel: 'GMT+8' },
  { code: 'TH', nameVi: 'Thái Lan', nameEn: 'Thailand', group: 'legacy', flagCode: 'th', timezoneId: 'Asia/Bangkok', timezoneLabel: 'GMT+7' },
]

export const ALL_TEACHER_COUNTRIES = [...TEACHER_COUNTRY_OPTIONS, ...LEGACY_COUNTRY_OPTIONS]

export const TEACHER_COUNTRY_SELECT_OPTIONS: TeacherCountryOption[] = [
  ...TEACHER_COUNTRY_OPTIONS,
  ...LEGACY_COUNTRY_OPTIONS,
  { code: 'US_EST', nameVi: 'Hoa Kỳ (EST)', nameEn: 'United States (EST)', group: 'legacy', flagCode: 'us', timezoneId: 'America/New_York', timezoneLabel: 'EST' },
  { code: 'US_PST', nameVi: 'Hoa Kỳ (PST)', nameEn: 'United States (PST)', group: 'legacy', flagCode: 'us', timezoneId: 'America/Los_Angeles', timezoneLabel: 'PST' },
  { code: 'UK', nameVi: 'Vương quốc Anh (mã cũ)', nameEn: 'United Kingdom (legacy)', group: 'legacy', flagCode: 'gb', timezoneId: 'Europe/London', timezoneLabel: 'GMT+0' },
]

export function normalizeTeacherCountryCode(country?: string): string {
  const code = String(country || 'VN').trim().toUpperCase()
  if (code === 'UK') return 'GB'
  if (code === 'US_EST' || code === 'US_PST') return 'US'
  return code
}

export function getTeacherCountryOption(country?: string): TeacherCountryOption | undefined {
  const code = normalizeTeacherCountryCode(country)
  return ALL_TEACHER_COUNTRIES.find((item) => item.code === code)
}

export function teacherCountryLabel(country?: string): string {
  const option = getTeacherCountryOption(country)
  return option?.nameVi || String(country || '').trim().toUpperCase() || 'Chưa cập nhật quốc gia'
}
