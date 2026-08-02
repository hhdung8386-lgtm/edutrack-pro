import assert from 'node:assert/strict'

import {
  buildTeacherSubjectFilterOptions,
  normalizeTeacherSubjectLabel,
  teacherMatchesSubjectFilter,
  teacherMatchesSubjectFilters,
  teacherSubjectLabels,
  visibleTeacherSubjectNames,
} from '../src/lib/teacherSubjects.ts'

const catalog = [
  { id: 'english', name: 'Tiếng Anh', status: 'active' },
  { id: 'math', name: 'Toán', status: 'active' },
  { id: 'archived', name: 'Môn cũ', status: 'inactive' },
]

const teachers = [
  {
    subjectIds: [],
    subjectNames: [],
    languagesTaught: ['Tiếng Anh', 'Tiếng Hàn'],
    academicSubjectsTaught: ['Toán'],
  },
  {
    subjectIds: ['english'],
    subjectNames: [],
    languagesTaught: [],
    academicSubjectsTaught: [],
  },
  {
    subjectIds: [],
    subjectNames: ['TỔNG HỢP IELTS'],
    languagesTaught: [],
    academicSubjectsTaught: [],
  },
  {
    subjectIds: [],
    subjectNames: ['Học viên bảo lưu'],
    languagesTaught: [],
    academicSubjectsTaught: [],
  },
  {},
]

assert.equal(normalizeTeacherSubjectLabel('  Tiếng Anh  '), 'tieng anh')
assert.equal(normalizeTeacherSubjectLabel('Địa Lý'), 'dia ly')
assert.deepEqual(visibleTeacherSubjectNames(['Toán', 'Học viên bảo lưu', '']), ['Toán'])

const options = buildTeacherSubjectFilterOptions(teachers, catalog)
assert.deepEqual(
  options.map(({ label, teacherCount, group }) => ({ label, teacherCount, group })),
  [
    { label: 'Tiếng Anh', teacherCount: 2, group: 'language' },
    { label: 'Tiếng Hàn', teacherCount: 1, group: 'language' },
    { label: 'Toán', teacherCount: 1, group: 'academic' },
    { label: 'TỔNG HỢP IELTS', teacherCount: 1, group: 'legacy' },
  ],
)

const englishOption = options.find((option) => option.label === 'Tiếng Anh')
const koreanOption = options.find((option) => option.label === 'Tiếng Hàn')
const mathOption = options.find((option) => option.label === 'Toán')
assert.ok(englishOption && koreanOption && mathOption)
assert.equal(teacherMatchesSubjectFilter(teachers[1], englishOption), true, 'subjectIds match catalog subjects')
assert.equal(teacherMatchesSubjectFilter(teachers[2], englishOption), false, 'unrelated teachers are excluded')
assert.equal(
  teacherMatchesSubjectFilters(teachers[0], [englishOption, mathOption], 'all'),
  true,
  'all mode requires every selected capability',
)
assert.equal(
  teacherMatchesSubjectFilters(teachers[1], [koreanOption, mathOption], 'any'),
  false,
  'any mode still rejects teachers without any selected capability',
)
assert.equal(
  teacherMatchesSubjectFilters(teachers[0], [koreanOption, mathOption], 'any'),
  true,
  'any mode includes a teacher that has at least one selected capability',
)
assert.equal(
  teacherMatchesSubjectFilters(teachers[1], [englishOption, mathOption], 'all'),
  false,
  'all mode rejects a teacher missing one selected capability',
)
assert.deepEqual(
  teacherSubjectLabels(teachers[1], catalog),
  ['Tiếng Anh'],
  'catalog name fills a legacy profile that only has subjectIds',
)
assert.deepEqual(teacherSubjectLabels(teachers[4], catalog), [], 'missing legacy and modern fields is safe')

console.log('teacher subject filter regression checks passed')
