const subjectNameCollator = new Intl.Collator('vi', {
  sensitivity: 'base',
  numeric: true,
})

export type SubjectSortDirection = 'asc' | 'desc'

export function sortSubjectsByName<T extends { name?: string; id?: string }>(
  subjects: T[],
  direction: SubjectSortDirection = 'asc',
): T[] {
  return [...subjects].sort((left, right) => {
    const byName = subjectNameCollator.compare(left.name?.trim() || '', right.name?.trim() || '')
    if (byName !== 0) return direction === 'asc' ? byName : -byName
    return String(left.id || '').localeCompare(String(right.id || ''))
  })
}
