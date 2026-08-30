const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ONLINE_CLASSROOM_OPERATION_BOOKING_STATUSES,
  ONLINE_CLASSROOM_OPERATION_MAX_ROWS,
  ONLINE_CLASSROOM_OPERATION_QUERY_LIMIT,
  onlineClassroomOperationPage,
} = require('../lib/onlineClassroomOperations.js')

test('operations query lọc đúng hai trạng thái trước khi áp giới hạn', () => {
  assert.deepEqual(ONLINE_CLASSROOM_OPERATION_BOOKING_STATUSES, ['confirmed', 'completed'])
  assert.equal(ONLINE_CLASSROOM_OPERATION_MAX_ROWS, 150)
  assert.equal(ONLINE_CLASSROOM_OPERATION_QUERY_LIMIT, 151)
})

test('đúng 150 booking không báo truncated, hàng sentinel thứ 151 mới báo', () => {
  const exactly150 = Array.from({ length: 150 }, (_, index) => `booking-${index}`)
  assert.deepEqual(onlineClassroomOperationPage(exactly150), {
    rows: exactly150,
    truncated: false,
  })

  const withSentinel = [...exactly150, 'booking-150']
  assert.deepEqual(onlineClassroomOperationPage(withSentinel), {
    rows: exactly150,
    truncated: true,
  })
})
