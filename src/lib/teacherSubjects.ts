const INTERNAL_SUBJECT_LABELS = new Set([
  'hoc vien bao luu',
  'hoc vien tam dung',
  'chua xep',
])

export function normalizeTeacherSubjectLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Chỉ lọc nhãn vận hành khỏi màn công khai; không thay đổi dữ liệu gốc. */
export function visibleTeacherSubjectNames(subjectNames?: string[]) {
  return (subjectNames || []).filter((name) => {
    const normalized = normalizeTeacherSubjectLabel(name || '')
    return normalized.length > 0 && !INTERNAL_SUBJECT_LABELS.has(normalized)
  })
}

export interface TeacherSubjectFilterSource {
  subjectIds?: string[]
  subjectNames?: string[]
  languagesTaught?: string[]
  academicSubjectsTaught?: string[]
}

export interface SubjectFilterCatalogItem {
  id: string
  name: string
  status?: string
}

export type TeacherSubjectGroup = 'language' | 'academic' | 'legacy'

export interface TeacherSubjectFilterOption {
  key: string
  label: string
  normalizedName: string
  subjectIds: string[]
  teacherCount: number
  group: TeacherSubjectGroup
}

const SUBJECT_GROUP_ORDER: Record<TeacherSubjectGroup, number> = {
  language: 0,
  academic: 1,
  legacy: 2,
}

function uniqueVisibleNames(...subjectNameLists: Array<string[] | undefined>) {
  const result = new Map<string, string>()
  subjectNameLists.forEach((subjectNames) => {
    visibleTeacherSubjectNames(subjectNames).forEach((name) => {
      const trimmed = name.trim()
      const normalized = normalizeTeacherSubjectLabel(trimmed)
      if (normalized && !result.has(normalized)) result.set(normalized, trimmed)
    })
  })
  return result
}

function teacherSubjectNameMap(teacher: TeacherSubjectFilterSource) {
  return uniqueVisibleNames(
    teacher.languagesTaught,
    teacher.academicSubjectsTaught,
    teacher.subjectNames,
  )
}

export function teacherMatchesSubjectFilter(
  teacher: TeacherSubjectFilterSource,
  option: TeacherSubjectFilterOption,
) {
  const teacherIds = new Set(Array.isArray(teacher.subjectIds) ? teacher.subjectIds : [])
  if (option.subjectIds.some((subjectId) => teacherIds.has(subjectId))) return true

  return teacherSubjectNameMap(teacher).has(option.normalizedName)
}

export function teacherMatchesSubjectFilters(
  teacher: TeacherSubjectFilterSource,
  options: TeacherSubjectFilterOption[],
  mode: 'any' | 'all' = 'any',
) {
  if (options.length === 0) return true
  const matches = (option: TeacherSubjectFilterOption) => teacherMatchesSubjectFilter(teacher, option)
  return mode === 'all' ? options.every(matches) : options.some(matches)
}

export function teacherSubjectLabels(
  teacher: TeacherSubjectFilterSource,
  catalog: SubjectFilterCatalogItem[],
) {
  const labels = teacherSubjectNameMap(teacher)
  const teacherIds = new Set(Array.isArray(teacher.subjectIds) ? teacher.subjectIds : [])

  catalog.forEach((subject) => {
    if (!teacherIds.has(subject.id)) return
    const label = (subject.name || '').trim()
    const normalized = normalizeTeacherSubjectLabel(label)
    if (normalized && !INTERNAL_SUBJECT_LABELS.has(normalized) && !labels.has(normalized)) {
      labels.set(normalized, label)
    }
  })

  return Array.from(labels.values())
}

export function buildTeacherSubjectFilterOptions(
  teachers: TeacherSubjectFilterSource[],
  catalog: SubjectFilterCatalogItem[],
): TeacherSubjectFilterOption[] {
  const candidates = new Map<string, Omit<TeacherSubjectFilterOption, 'teacherCount'>>()

  const addCandidate = (
    rawLabel: string,
    group: TeacherSubjectGroup,
    subjectId?: string,
  ) => {
    const label = rawLabel.trim()
    const normalizedName = normalizeTeacherSubjectLabel(label)
    if (!normalizedName || INTERNAL_SUBJECT_LABELS.has(normalizedName)) return

    const existing = candidates.get(normalizedName)
    const resolvedGroup = existing && SUBJECT_GROUP_ORDER[existing.group] <= SUBJECT_GROUP_ORDER[group]
      ? existing.group
      : group

    candidates.set(normalizedName, {
      key: `subject:${normalizedName}`,
      label: existing?.label || label,
      normalizedName,
      subjectIds: Array.from(new Set([
        ...(existing?.subjectIds || []),
        ...(subjectId ? [subjectId] : []),
      ])),
      group: resolvedGroup,
    })
  }

  catalog.forEach((subject) => {
    if (subject.status === 'inactive') return
    addCandidate(subject.name || '', 'legacy', subject.id)
  })

  teachers.forEach((teacher) => {
    uniqueVisibleNames(teacher.languagesTaught).forEach((label) => addCandidate(label, 'language'))
    uniqueVisibleNames(teacher.academicSubjectsTaught).forEach((label) => addCandidate(label, 'academic'))
    uniqueVisibleNames(teacher.subjectNames).forEach((label) => addCandidate(label, 'legacy'))
  })

  return Array.from(candidates.values())
    .map((option) => ({
      ...option,
      teacherCount: teachers.filter((teacher) => teacherMatchesSubjectFilter(
        teacher,
        { ...option, teacherCount: 0 },
      )).length,
    }))
    .filter((option) => option.teacherCount > 0)
    .sort((left, right) => {
      const groupDifference = SUBJECT_GROUP_ORDER[left.group] - SUBJECT_GROUP_ORDER[right.group]
      return groupDifference || left.label.localeCompare(right.label, 'vi')
    })
}
