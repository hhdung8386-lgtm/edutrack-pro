type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function buildStudentSubjectNamePatch(
  data: UnknownRecord,
  subjectId: string,
  subjectName: string,
): UnknownRecord | null {
  const patch: UnknownRecord = {}

  if (String(data.subjectId || '') === subjectId && data.subjectName !== subjectName) {
    patch.subjectName = subjectName
  }

  if (Array.isArray(data.subjects)) {
    let changed = false
    const subjects = data.subjects.map((item) => {
      if (!isRecord(item) || String(item.subjectId || '') !== subjectId || item.subjectName === subjectName) return item
      changed = true
      return { ...item, subjectName }
    })
    if (changed) patch.subjects = subjects
  }

  return Object.keys(patch).length > 0 ? patch : null
}

export function buildTeacherSubjectNamesPatch(
  data: UnknownRecord,
  subjectId: string,
  subjectName: string,
): UnknownRecord | null {
  if (!Array.isArray(data.subjectIds) || !data.subjectIds.some((id) => String(id || '') === subjectId)) return null

  const currentNames = Array.isArray(data.subjectNames) ? [...data.subjectNames] : []
  let changed = false
  data.subjectIds.forEach((id, index) => {
    if (String(id || '') !== subjectId || currentNames[index] === subjectName) return
    while (currentNames.length <= index) currentNames.push('')
    currentNames[index] = subjectName
    changed = true
  })

  return changed ? { subjectNames: currentNames } : null
}
