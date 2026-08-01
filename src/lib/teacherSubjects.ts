const INTERNAL_SUBJECT_LABELS = new Set([
  'hoc vien bao luu',
  'hoc vien tam dung',
  'chua xep',
])

function normalizeLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Chỉ lọc nhãn vận hành khỏi màn công khai; không thay đổi dữ liệu gốc. */
export function visibleTeacherSubjectNames(subjectNames?: string[]) {
  return (subjectNames || []).filter((name) => {
    const normalized = normalizeLabel(name || '')
    return normalized.length > 0 && !INTERNAL_SUBJECT_LABELS.has(normalized)
  })
}
