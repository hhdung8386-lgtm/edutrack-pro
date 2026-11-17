/**
 * subjectId is the existing end-to-end wallet/lesson key. Keep legacy keys
 * untouched; a second enrollment gets its own key carrying the catalog ID.
 * This keeps holds, approvals, refunds and history on one concrete wallet.
 * Only catalog reads and tutor subject qualification unwrap this key.
 */
const COURSE_KEY = /^course__([a-f0-9]{32})__(.+)$/

export function getCatalogSubjectId(courseId: string): string {
  return COURSE_KEY.exec(courseId)?.[2] || courseId
}

export function createCourseSubjectId(catalogId: string, token: string): string {
  if (!catalogId || getCatalogSubjectId(catalogId) !== catalogId || !/^[a-f0-9]{32}$/.test(token)) {
    throw new Error('Mã khóa học không hợp lệ')
  }
  const id = `course__${token}__${catalogId}`
  if (id.length > 160) throw new Error('Mã môn quá dài để tạo khóa học riêng')
  return id
}

export function courseSubjectName(catalogName: string, courseId: string, previousName: string): string {
  if (getCatalogSubjectId(courseId) === courseId) return catalogName
  const suffix = / · Khóa \d+$/.exec(previousName)?.[0] || ''
  return `${catalogName}${suffix}`
}
