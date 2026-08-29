import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const overviewSource = readFileSync(
  path.resolve(testDirectory, '../src/components/students/StudentCourseOverview.tsx'),
  'utf8',
)

test('completed courses keep a payment top-up action on desktop and mobile layouts', () => {
  const completedSectionStart = overviewSource.indexOf('>Đã hoàn thành</h3>')
  const completedSectionEnd = overviewSource.indexOf('</section>', completedSectionStart)

  assert.notEqual(completedSectionStart, -1)
  assert.notEqual(completedSectionEnd, -1)

  const completedSection = overviewSource.slice(completedSectionStart, completedSectionEnd)
  assert.match(completedSection, /onClick=\{\(\) => onAddRights\(row\.subject\.subjectId\)\}/)
  assert.match(completedSection, /aria-label=\{`Cộng thêm quyền học cho \$\{row\.subject\.subjectName\}`\}/)
  assert.match(completedSection, /grid-cols-2[^"\n]*sm:flex/)
})
