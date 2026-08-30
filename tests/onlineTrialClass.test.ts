import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterOnlineTrialClasses,
  normalizeOnlineTrialClass,
  normalizeOnlineTrialClassCreateResult,
  normalizeOnlineTrialClassListResult,
  normalizeOnlineTrialClassStatus,
  type OnlineTrialClassSummary,
} from '../src/lib/onlineTrialClassModel.ts'

test('chuẩn hóa trạng thái phòng và không biến phòng lỗi thành sẵn sàng', () => {
  assert.equal(normalizeOnlineTrialClassStatus('scheduled'), 'ready')
  assert.equal(normalizeOnlineTrialClassStatus('in_progress'), 'live')
  assert.equal(normalizeOnlineTrialClassStatus('expired'), 'ended')
  assert.equal(normalizeOnlineTrialClassStatus('setup_failed'), 'error')
})

test('nhận kết quả tạo phòng với đúng một route server cho khách và Admin', () => {
  const result = normalizeOnlineTrialClassCreateResult({
    room: {
      trialClassId: 'trial-class-123456',
      title: 'Trial Class sáng Chủ nhật',
      status: 'ready',
      createdAt: '2026-08-30T02:00:00.000Z',
      accountingImpact: 'none',
    },
    guestUrl: '/lop-hoc-thu/trial-class-123456',
    adminUrl: '/lop-hoc-thu/trial-class-123456',
  })

  assert.equal(result.room.roomId, 'trial-class-123456')
  assert.equal(result.guestUrl, '/lop-hoc-thu/trial-class-123456')
  assert.equal(result.adminUrl, result.guestUrl)
  assert.equal(result.room.accountingImpact, 'none')
})

test('từ chối kết quả tạo phòng thiếu route do server cấp', () => {
  assert.throws(() => normalizeOnlineTrialClassCreateResult({
    roomId: 'trial-class-123456',
    guestUrl: '/lop-hoc-thu/trial-class-123456',
  }), /chưa trả đủ link/i)
})

test('danh sách nhận alias backend, giữ hasMore và gom expired vào lịch sử', () => {
  const result = normalizeOnlineTrialClassListResult({
    items: [
      {
        trialClassId: 'trial-expired-123456',
        title: 'Phòng đã hết hạn',
        state: 'expired',
        participantCount: 2,
        joinUrl: '/lop-hoc-thu/trial-expired-123456',
        accountingImpact: 'none',
      },
    ],
    hasMore: true,
    serverNow: '2026-08-30T03:00:00.000Z',
  })

  assert.equal(result.rooms.length, 1)
  assert.equal(result.rooms[0]?.status, 'ended')
  assert.equal(result.rooms[0]?.guestUrl, '/lop-hoc-thu/trial-expired-123456')
  assert.equal(result.hasMore, true)
  assert.equal(result.serverNow, '2026-08-30T03:00:00.000Z')
})

test('không hiển thị phòng có tác động hạch toán ngoài hợp đồng Trial Class', () => {
  assert.equal(normalizeOnlineTrialClass({
    roomId: 'unsafe-trial-123456',
    status: 'ready',
    accountingImpact: 'salary',
  }), null)
})

test('lọc không dấu và đưa setup_failed vào tab lịch sử', () => {
  const base = {
    title: 'Phòng học thử Nguyễn An',
    createdAt: '2026-08-30T01:00:00.000Z',
    startedAt: null,
    endedAt: null,
    accessExpiresAt: null,
    participantCount: 0,
    guestUrl: '/lop-hoc-thu/room',
    adminUrl: '/lop-hoc-thu/room',
    createdByName: 'Admin',
    accountingImpact: 'none' as const,
  }
  const rooms: OnlineTrialClassSummary[] = [
    { ...base, roomId: 'ready-room-123456', status: 'ready', state: 'ready' },
    { ...base, roomId: 'failed-room-123456', status: 'error', state: 'setup_failed' },
  ]

  assert.deepEqual(filterOnlineTrialClasses(rooms, 'ready', 'nguyen an').map((room) => room.roomId), [
    'ready-room-123456',
  ])
  assert.deepEqual(filterOnlineTrialClasses(rooms, 'ended', '').map((room) => room.roomId), [
    'failed-room-123456',
  ])
})
