import test from 'node:test'
import assert from 'node:assert/strict'
import {
  makeBoardMessage,
  parseBoardMessage,
  sanitizeBoardSnapshot,
  serializeBoardMessage,
  type BoardOperation,
} from '../src/lib/classroomBoard.ts'
import {
  broadcastJitsiTextMessage,
  type JitsiExternalApi,
} from '../src/lib/jitsiExternalApi.ts'

const rectangle: BoardOperation = {
  id: 'shape-rectangle-1',
  kind: 'shape',
  shape: 'rectangle',
  color: '#2563eb',
  width: 4,
  opacity: 1,
  start: { x: 0.1, y: 0.2 },
  end: { x: 0.6, y: 0.7 },
  authorRole: 'teacher',
  createdAt: 1_725_000_000_000,
}

test('lọc operation sai schema nhưng giữ hình và chữ hợp lệ', () => {
  const snapshot = sanitizeBoardSnapshot({
    version: 4,
    studentCanWrite: false,
    operations: [
      rectangle,
      {
        id: 'text-operation-1',
        kind: 'text',
        color: '#10213a',
        fontSize: 20,
        point: { x: 0.2, y: 0.3 },
        text: 'Câu trả lời của học viên',
        authorRole: 'student',
        createdAt: 1_725_000_000_001,
      },
      { ...rectangle, id: 'bad-shape-1', start: { x: -1, y: 0 } },
    ],
  })

  assert.equal(snapshot.version, 4)
  assert.equal(snapshot.studentCanWrite, false)
  assert.equal(snapshot.operations.length, 2)
  assert.deepEqual(snapshot.operations[0], rectangle)
})

test('message bảng chỉ được nhận đúng booking và đúng namespace', () => {
  const message = makeBoardMessage('booking-a', 'teacher', {
    type: 'operation',
    boardVersion: 5,
    operation: rectangle,
  })
  const serialized = serializeBoardMessage(message)

  assert.ok(serialized)
  assert.equal(parseBoardMessage(serialized, 'booking-a')?.type, 'operation')
  assert.equal(parseBoardMessage(serialized, 'booking-b'), null)
  assert.equal(parseBoardMessage(JSON.stringify({ ...message, namespace: 'unknown' }), 'booking-a'), null)
})

test('không phát snapshot realtime vượt giới hạn payload', () => {
  const snapshot = {
    version: 1_500,
    studentCanWrite: true,
    operations: Array.from({ length: 1_500 }, (_, index) => ({
      ...rectangle,
      id: `shape-${String(index).padStart(8, '0')}`,
    })),
  }
  const message = makeBoardMessage('booking-a', 'admin', { type: 'snapshot', snapshot })
  assert.equal(serializeBoardMessage(message), null)
})

test('gửi data-channel đúng một lần cho mỗi người tham gia từ xa', async () => {
  const sent: Array<[string, unknown[]]> = []
  const api = {
    getRoomsInfo: async () => ({
      rooms: [
        { participants: [{ id: 'local-a' }, { id: 'remote-a' }, { id: 'remote-a' }] },
        { participants: [{ id: 'remote-b' }] },
      ],
    }),
    executeCommand: (commandName: string, ...args: unknown[]) => sent.push([commandName, args]),
  } as Pick<JitsiExternalApi, 'getRoomsInfo' | 'executeCommand'> as JitsiExternalApi

  const count = await broadcastJitsiTextMessage(api, 'payload', 'local-a')
  assert.equal(count, 2)
  assert.deepEqual(sent, [
    ['sendEndpointTextMessage', ['remote-a', 'payload']],
    ['sendEndpointTextMessage', ['remote-b', 'payload']],
  ])
})
