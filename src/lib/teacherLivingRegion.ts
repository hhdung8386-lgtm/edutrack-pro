import type { Teacher } from '@/types'

export type TeacherLivingRegion = 'north' | 'central' | 'south'

export const TEACHER_LIVING_REGIONS: { value: TeacherLivingRegion; label: string; labelEn: string }[] = [
  { value: 'north', label: 'Miền Bắc', labelEn: 'Northern Vietnam' },
  { value: 'central', label: 'Miền Trung', labelEn: 'Central Vietnam' },
  { value: 'south', label: 'Miền Nam', labelEn: 'Southern Vietnam' },
]

export function normalizeTeacherLivingRegion(value: unknown): TeacherLivingRegion | '' {
  return value === 'north' || value === 'central' || value === 'south' ? value : ''
}

export function teacherLivingRegionLabel(value: unknown, lang: 'vi' | 'en' = 'vi'): string {
  const region = TEACHER_LIVING_REGIONS.find((item) => item.value === normalizeTeacherLivingRegion(value))
  if (!region) return ''
  return lang === 'en' ? region.labelEn : region.label
}

export function teacherLivingRegionOf(teacher: Partial<Teacher> | null | undefined): TeacherLivingRegion | '' {
  return normalizeTeacherLivingRegion(teacher?.livingRegion)
}
