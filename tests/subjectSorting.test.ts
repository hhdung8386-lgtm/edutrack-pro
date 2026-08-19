import assert from 'node:assert/strict'
import test from 'node:test'
import { sortSubjectsByName } from '../src/lib/subjectSorting.ts'

test('sắp tên môn A-Z không phân biệt hoa thường và giữ mảng nguồn', () => {
  const source = [
    { id: '3', name: 'Toán 10' },
    { id: '1', name: 'anh văn' },
    { id: '2', name: 'IELTS' },
    { id: '4', name: 'Toán 2' },
  ]

  assert.deepEqual(sortSubjectsByName(source).map((subject) => subject.name), [
    'anh văn',
    'IELTS',
    'Toán 2',
    'Toán 10',
  ])
  assert.equal(source[0].name, 'Toán 10')
})

test('nút sắp xếp có thể đổi từ A-Z sang Z-A', () => {
  const source = [
    { id: '1', name: 'A1' },
    { id: '2', name: 'C1' },
    { id: '3', name: 'B1' },
  ]

  assert.deepEqual(sortSubjectsByName(source, 'desc').map((subject) => subject.name), [
    'C1',
    'B1',
    'A1',
  ])
})
