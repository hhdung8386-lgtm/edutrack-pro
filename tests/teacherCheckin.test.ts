import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TEACHER_CHECKIN_TRACKING_SINCE_MS,
  formatVietnamTime,
  getTeacherCheckin,
  summarizeTeacherCheckins,
  teacherCheckinLabel,
  teacherCheckinTone,
  teacherCheckinWindowMs,
} from '../src/lib/teacherCheckin.ts'

const MINUTE = 60_000
// 2026-09-30 20:00 giờ VN = 13:00 UTC (sau mốc bắt đầu ghi nhận).
const START = Date.UTC(2026, 8, 30, 13, 0)

function booking(overrides: Record<string, unknown> = {}) {
  return {
    requestedDate: '2026-09-30',
    requestedStart: '20:00',
    requestedEnd: '20:25',
    requestedMinutes: 25,
    ...overrides,
  }
}

function entry(ms: number, lateMinutes?: number, count = 1) {
  return {
    teacherClassroomEntryFirstAt: { toMillis: () => ms },
    ...(lateMinutes === undefined ? {} : { teacherClassroomEntryLateMinutes: lateMinutes }),
    teacherClassroomEntryCount: count,
  }
}

test('khung giờ ca theo giờ Việt Nam', () => {
  assert.deepEqual(teacherCheckinWindowMs(booking()), { startMs: START, endMs: START + 25 * MINUTE })
  assert.equal(teacherCheckinWindowMs(booking({ requestedStart: '' })), null)
})

test('đã bấm: đúng giờ / sớm / trễ theo số phút máy chủ lưu', () => {
  const onTime = getTeacherCheckin(booking(entry(START + 30_000, 0)), START + 40 * MINUTE)
  assert.equal(onTime.status, 'on_time')
  assert.equal(teacherCheckinLabel(onTime), 'Đúng giờ')
  assert.equal(teacherCheckinTone(onTime), 'good')

  const early = getTeacherCheckin(booking(entry(START - 3 * MINUTE, -3)), START)
  assert.equal(early.status, 'early')
  assert.equal(teacherCheckinLabel(early), 'Sớm 3 phút')

  const late = getTeacherCheckin(booking(entry(START + 7 * MINUTE, 7, 2)), START)
  assert.equal(late.status, 'late')
  assert.equal(late.clickCount, 2)
  assert.equal(teacherCheckinLabel(late), 'Trễ 7 phút')
  assert.equal(teacherCheckinTone(late), 'bad')
  assert.equal(teacherCheckinTone({ status: 'late', lateMinutes: 2 }), 'warn')
})

test('thiếu số phút lưu sẵn thì tự tính từ giờ bấm', () => {
  const info = getTeacherCheckin(booking(entry(START + 4 * MINUTE + 10_000)), START)
  assert.equal(info.status, 'late')
  assert.equal(info.lateMinutes, 4)
})

test('chưa bấm: chưa tới giờ → đang diễn ra → hết ca', () => {
  assert.equal(getTeacherCheckin(booking(), START - MINUTE).status, 'waiting')
  assert.equal(getTeacherCheckin(booking(), START + MINUTE).status, 'missing_live')
  assert.equal(getTeacherCheckin(booking(), START + 25 * MINUTE).status, 'missing_live')
  assert.equal(getTeacherCheckin(booking(), START + 26 * MINUTE).status, 'missing')
})

test('ca trước khi bật tính năng không bị tính là bỏ lớp', () => {
  const old = booking({ requestedDate: '2026-09-20' })
  assert.ok(teacherCheckinWindowMs(old)!.startMs < TEACHER_CHECKIN_TRACKING_SINCE_MS)
  assert.equal(getTeacherCheckin(old, START).status, 'no_data')
  // Nhưng nếu có giờ bấm thì vẫn hiển thị.
  assert.equal(getTeacherCheckin({ ...old, ...entry(Date.UTC(2026, 8, 20, 12, 0), 0) }, START).status, 'on_time')
})

test('giờ hiển thị luôn theo giờ Việt Nam', () => {
  assert.equal(formatVietnamTime(START + 7_000), '20:00:07')
  assert.equal(formatVietnamTime(START, false), '20:00')
})

test('tổng hợp: tỉ lệ đúng giờ chỉ tính ca đã tới giờ có dữ liệu', () => {
  const now = START + 60 * MINUTE
  const summary = summarizeTeacherCheckins([
    getTeacherCheckin(booking(entry(START, 0)), now),
    getTeacherCheckin(booking(entry(START - MINUTE, -1)), now),
    getTeacherCheckin(booking(entry(START + 6 * MINUTE, 6)), now),
    getTeacherCheckin(booking(entry(START + 2 * MINUTE, 2)), now),
    getTeacherCheckin(booking(), now),
    getTeacherCheckin(booking({ requestedDate: '2026-10-01' }), now),
    getTeacherCheckin(booking({ requestedDate: '2026-09-20' }), now),
  ])
  assert.equal(summary.total, 7)
  assert.equal(summary.onTime, 2)
  assert.equal(summary.late, 2)
  assert.equal(summary.missing, 1)
  assert.equal(summary.waiting, 1)
  assert.equal(summary.noData, 1)
  assert.equal(summary.lateMinutesTotal, 8)
  assert.equal(summary.maxLateMinutes, 6)
  assert.equal(summary.onTimeRate, 40)
  assert.equal(summarizeTeacherCheckins([]).onTimeRate, null)
})
