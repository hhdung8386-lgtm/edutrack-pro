import assert from 'node:assert/strict'
import test from 'node:test'
import { additionalCurriculumLinksOf, curriculumLinksOf, normalizeCurriculumUrl, parseAdditionalCurriculumRows } from '../src/lib/curriculumLinks.ts'

test('normalizeCurriculumUrl keeps only openable links', () => {
  assert.equal(normalizeCurriculumUrl(' https://drive.google.com/x '), 'https://drive.google.com/x')
  assert.equal(normalizeCurriculumUrl('drive.google.com/file/d/x'), 'https://drive.google.com/file/d/x')
  assert.equal(normalizeCurriculumUrl('Sách: https://drive.google.com/x (bản mới)'), 'https://drive.google.com/x')
  assert.equal(normalizeCurriculumUrl('javascript:alert(1)'), '')
  assert.equal(normalizeCurriculumUrl('chưa có'), '')
  assert.equal(normalizeCurriculumUrl(undefined), '')
})

test('old packages without the new field still list their two links', () => {
  assert.deepEqual(curriculumLinksOf({ curriculumLink: 'https://a.com/1', supplementaryCurriculumLink: 'https://a.com/2' }).map((link) => link.label), ['Giáo trình chính', 'Giáo trình bổ trợ'])
  assert.deepEqual(curriculumLinksOf({}), [])
  assert.deepEqual(curriculumLinksOf(null), [])
  assert.deepEqual(additionalCurriculumLinksOf({ curriculumLink: 'https://a.com/1' }), [])
})

test('additional links follow the two fixed ones, numbered without repeats or bad values', () => {
  const links = curriculumLinksOf({
    curriculumLink: 'https://a.com/1',
    supplementaryCurriculumLink: '',
    additionalCurriculumLinks: ['https://a.com/1', 'https://a.com/3', 'chưa có', 'a.com/4', 'https://a.com/3'],
  })
  assert.deepEqual(links.map((link) => [link.label, link.url]), [
    ['Giáo trình chính', 'https://a.com/1'],
    ['Giáo trình thêm 1', 'https://a.com/3'],
    ['Giáo trình thêm 2', 'https://a.com/4'],
  ])
})

test('form rows drop blanks and repeats, and report what is not a link', () => {
  assert.deepEqual(parseAdditionalCurriculumRows(['', ' https://a.com/1 ', 'https://a.com/1', '   ', 'a.com/2']), { links: ['https://a.com/1', 'https://a.com/2'], invalidRows: [] })
  assert.deepEqual(parseAdditionalCurriculumRows(['abc', 'https://a.com/1']), { links: ['https://a.com/1'], invalidRows: [0] })
  assert.deepEqual(parseAdditionalCurriculumRows([]), { links: [], invalidRows: [] })
})
