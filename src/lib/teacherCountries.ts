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
  { code: 'GB', nameVi: 'Vương quốc Anh', nameEn: 'United Kingdom', group: 'native', flagCode: 'gb', timezoneId: 'Europe/London', timezoneLabel: 'UTC+0 / +1 summer' },
  { code: 'US', nameVi: 'Hoa Kỳ', nameEn: 'United States', group: 'native', flagCode: 'us', timezoneId: 'America/New_York', timezoneLabel: 'New York, UTC-5 / -4 summer' },
  { code: 'CA', nameVi: 'Canada', nameEn: 'Canada', group: 'native', flagCode: 'ca', timezoneId: 'America/Toronto', timezoneLabel: 'Toronto, UTC-5 / -4 summer' },
  { code: 'AU', nameVi: 'Úc', nameEn: 'Australia', group: 'native', flagCode: 'au', timezoneId: 'Australia/Sydney', timezoneLabel: 'Sydney, UTC+10 / +11 summer' },
  { code: 'NZ', nameVi: 'New Zealand', nameEn: 'New Zealand', group: 'native', flagCode: 'nz', timezoneId: 'Pacific/Auckland', timezoneLabel: 'UTC+12 / +13 summer' },
  { code: 'IE', nameVi: 'Ireland', nameEn: 'Ireland', group: 'native', flagCode: 'ie', timezoneId: 'Europe/Dublin', timezoneLabel: 'UTC+0 / +1 summer' },
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

// These are the only values exposed to create/edit forms. The legacy aliases
// below remain readable for old teacher documents, but must never be offered
// as a second choice in the UI.
export const TEACHER_COUNTRY_SELECT_OPTIONS: TeacherCountryOption[] = [
  ...TEACHER_COUNTRY_OPTIONS,
  ...LEGACY_COUNTRY_OPTIONS,
]

const TEACHER_TIMEZONE_OFFSETS: Record<string, number> = {
  VN: 7, PH: 8, GB: 0, US: -5, CA: -5, ZA: 2, AU: 10, NZ: 12, IE: 0,
  KE: 3, NG: 1, GH: 0, UG: 3, IN: 5.5, PK: 5, BD: 6, LK: 5.5,
  MM: 6.5, MY: 8, ID: 7, JP: 9, KR: 9, SG: 8, TH: 7,
  // Read-only compatibility values from the old country selector.
  UK: 0, US_EST: -5, US_PST: -8,
}

export function normalizeTeacherCountryCode(country?: string): string {
  const code = String(country || 'VN').trim().toUpperCase()
  if (code === 'UK') return 'GB'
  if (code === 'US_EST' || code === 'US_PST') return 'US'
  return code
}

export function getTeacherTimezoneOffset(country?: string): number {
  const rawCode = String(country || 'VN').trim().toUpperCase()
  return TEACHER_TIMEZONE_OFFSETS[rawCode] ?? TEACHER_TIMEZONE_OFFSETS[normalizeTeacherCountryCode(rawCode)] ?? 7
}

const LEGACY_TIMEZONE_IDS: Record<string, string> = {
  UK: 'Europe/London',
  US_EST: 'America/New_York',
  US_PST: 'America/Los_Angeles',
}

/** IANA timezone of a teacher country code (legacy aliases included). */
export function getTeacherTimezoneId(country?: string): string | undefined {
  const rawCode = String(country || '').trim().toUpperCase()
  if (!rawCode) return undefined
  return LEGACY_TIMEZONE_IDS[rawCode] || getTeacherCountryOption(rawCode)?.timezoneId
}

/**
 * Real UTC offset (hours) of an IANA timezone at a given moment, so daylight saving
 * time is applied. Returns null when the browser cannot resolve the zone.
 */
export function getZoneUtcOffsetHours(timeZone: string, at: Date = new Date()): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at)
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value)
    const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour') % 24, value('minute'), value('second'))
    const instant = Math.floor(at.getTime() / 1000) * 1000
    const offset = Math.round(((asUtc - instant) / 3_600_000) * 4) / 4
    return Number.isFinite(offset) ? offset : null
  } catch {
    return null
  }
}

/**
 * Teacher UTC offset to use for displaying/entering times at moment `at`.
 *
 * Teacher documents store one fixed `timezoneOffset` (standard time of the country),
 * which is 1 hour wrong during daylight saving time (UK/IE/US/CA in summer, AU/NZ
 * from October to April). When the stored value is just the country default we use
 * the live, DST-aware offset of the country's timezone. A value an admin set by hand
 * (different from the country default) is always respected.
 *
 * Only affects conversion between teacher-local time and Vietnam time on screen:
 * schedules are stored in Vietnam time, so no saved data changes meaning.
 */
export function resolveTeacherTimezoneOffset(
  teacher: { country?: string | null; timezoneOffset?: number | null } | null | undefined,
  at: Date = new Date(),
): number {
  const stored = typeof teacher?.timezoneOffset === 'number' && Number.isFinite(teacher.timezoneOffset)
    ? teacher.timezoneOffset
    : undefined
  const rawCode = String(teacher?.country || '').trim().toUpperCase()
  const countryDefault = rawCode ? getTeacherTimezoneOffset(rawCode) : undefined
  if (stored !== undefined && (!rawCode || stored !== countryDefault)) return stored
  const zone = getTeacherTimezoneId(rawCode || 'VN')
  const live = zone ? getZoneUtcOffsetHours(zone, at) : null
  return live ?? stored ?? countryDefault ?? 7
}

export function getTeacherCountryOption(country?: string): TeacherCountryOption | undefined {
  const code = normalizeTeacherCountryCode(country)
  return ALL_TEACHER_COUNTRIES.find((item) => item.code === code)
}

export function teacherCountryLabel(country?: string, lang: 'vi' | 'en' = 'vi'): string {
  const option = getTeacherCountryOption(country)
  if (lang === 'en') return option?.nameEn || String(country || '').trim().toUpperCase() || 'Country not set'
  return option?.nameVi || String(country || '').trim().toUpperCase() || 'Chưa cập nhật quốc gia'
}
