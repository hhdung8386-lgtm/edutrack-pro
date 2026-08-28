import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ClassroomRecordingUploadError,
  GCS_RESUMABLE_CHUNK_GRANULARITY,
  GcsResumableUploader,
  requestClassroomDisplayMedia,
} from '../src/lib/classroomRecordingUploader.ts'

type CapturedRequest = {
  contentRange: string
  size: number
}

function successfulGcsFetch(requests: CapturedRequest[]): typeof fetch {
  return async (_input, init) => {
    const headers = new Headers(init?.headers)
    const body = init?.body
    assert.ok(body instanceof Blob)
    const contentRange = headers.get('content-range') || ''
    requests.push({ contentRange, size: body.size })

    if (contentRange.endsWith('/*')) {
      const match = /^bytes (\d+)-(\d+)\/\*$/.exec(contentRange)
      assert.ok(match)
      return new Response(null, {
        status: 308,
        headers: { Range: `bytes=0-${match[2]}` },
      })
    }
    return new Response(JSON.stringify({ generation: '7' }), {
      status: 200,
      headers: { ETag: 'recording-etag' },
    })
  }
}

test('uploader gửi chunk tuần tự theo bội 256 KiB và giữ phần cuối để chốt tổng byte', async () => {
  const chunkSize = GCS_RESUMABLE_CHUNK_GRANULARITY
  const requests: CapturedRequest[] = []
  const uploader = new GcsResumableUploader({
    sessionUrl: 'https://storage.googleapis.com/upload/storage/v1/test-session',
    chunkSize,
    maxBufferedBytes: chunkSize * 4,
    fetchImpl: successfulGcsFetch(requests),
  })

  const totalBytes = chunkSize * 2 + Math.floor(chunkSize / 2)
  await uploader.append(new Blob([new Uint8Array(totalBytes)]))
  assert.equal(uploader.uploadedBytes, chunkSize * 2)
  assert.equal(uploader.bufferedBytes, Math.floor(chunkSize / 2))

  const result = await uploader.finish()
  assert.equal(result.totalBytes, totalBytes)
  assert.deepEqual(result.metadata, { generation: '7' })
  assert.equal(result.etag, 'recording-etag')
  assert.equal(uploader.state, 'finished')
  assert.deepEqual(requests, [
    { contentRange: `bytes 0-${chunkSize - 1}/*`, size: chunkSize },
    { contentRange: `bytes ${chunkSize}-${chunkSize * 2 - 1}/*`, size: chunkSize },
    {
      contentRange: `bytes ${chunkSize * 2}-${totalBytes - 1}/${totalBytes}`,
      size: Math.floor(chunkSize / 2),
    },
  ])
})

test('uploader không gửi sớm chunk cuối khi file kết thúc đúng ranh giới', async () => {
  const chunkSize = GCS_RESUMABLE_CHUNK_GRANULARITY
  const requests: CapturedRequest[] = []
  const uploader = new GcsResumableUploader({
    sessionUrl: 'https://storage.googleapis.com/upload/exact-boundary',
    chunkSize,
    maxBufferedBytes: chunkSize * 2,
    fetchImpl: successfulGcsFetch(requests),
  })

  await uploader.append(new Uint8Array(chunkSize * 2))
  assert.equal(requests.length, 1)
  await uploader.finish()
  assert.deepEqual(requests.map((request) => request.contentRange), [
    `bytes 0-${chunkSize - 1}/*`,
    `bytes ${chunkSize}-${chunkSize * 2 - 1}/${chunkSize * 2}`,
  ])
})

test('uploader chặn hàng đợi vượt giới hạn trước khi giữ blob trong bộ nhớ', async () => {
  const chunkSize = GCS_RESUMABLE_CHUNK_GRANULARITY
  const uploader = new GcsResumableUploader({
    sessionUrl: 'https://storage.googleapis.com/upload/buffer-limit',
    chunkSize,
    maxBufferedBytes: chunkSize * 2,
    fetchImpl: successfulGcsFetch([]),
  })

  await assert.rejects(
    uploader.append(new Uint8Array(chunkSize * 2 + 1)),
    (error: unknown) => error instanceof ClassroomRecordingUploadError
      && error.code === 'BUFFER_LIMIT_EXCEEDED'
      && error.retryable,
  )
  assert.equal(uploader.acceptedBytes, 0)
  assert.equal(uploader.bufferedBytes, 0)
})

test('abort hủy request đang chạy và trả lỗi có mã rõ ràng', async () => {
  const chunkSize = GCS_RESUMABLE_CHUNK_GRANULARITY
  let markStarted: (() => void) | undefined
  const started = new Promise<void>((resolve) => { markStarted = resolve })
  const blockingFetch: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    markStarted?.()
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
  })
  const uploader = new GcsResumableUploader({
    sessionUrl: 'https://storage.googleapis.com/upload/abort-test',
    chunkSize,
    maxBufferedBytes: chunkSize * 2,
    fetchImpl: blockingFetch,
  })

  const pendingAppend = uploader.append(new Uint8Array(chunkSize * 2))
  await started
  uploader.abort('người dùng dừng ghi')
  await assert.rejects(
    pendingAppend,
    (error: unknown) => error instanceof ClassroomRecordingUploadError && error.code === 'ABORTED',
  )
  assert.equal(uploader.state, 'aborted')
})

test('lỗi mạng được backoff, hỏi offset GCS rồi chỉ gửi lại phần chưa được xác nhận', async () => {
  const chunkSize = GCS_RESUMABLE_CHUNK_GRANULARITY
  const contentRanges: string[] = []
  const delays: number[] = []
  let requestCount = 0
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestCount += 1
    const contentRange = new Headers(init?.headers).get('content-range') || ''
    contentRanges.push(contentRange)
    if (requestCount === 1) throw new TypeError('connection reset')
    if (requestCount === 2) return new Response(null, { status: 308 })
    if (contentRange.endsWith('/*')) {
      return new Response(null, {
        status: 308,
        headers: { Range: `bytes=0-${chunkSize - 1}` },
      })
    }
    return new Response('{}', { status: 200 })
  }
  const uploader = new GcsResumableUploader({
    sessionUrl: 'https://storage.googleapis.com/upload/network-recovery',
    chunkSize,
    maxBufferedBytes: chunkSize * 2,
    fetchImpl,
    retryBaseDelayMs: 10,
    retryMaxDelayMs: 40,
    sleepImpl: async (delayMs) => { delays.push(delayMs) },
  })

  await uploader.append(new Uint8Array(chunkSize * 2))
  await uploader.finish()
  assert.deepEqual(delays, [10])
  assert.deepEqual(contentRanges, [
    `bytes 0-${chunkSize - 1}/*`,
    'bytes */*',
    `bytes 0-${chunkSize - 1}/*`,
    `bytes ${chunkSize}-${chunkSize * 2 - 1}/${chunkSize * 2}`,
  ])
})

test('không gửi trùng chunk khi status query xác nhận server đã commit sau HTTP 503', async () => {
  const chunkSize = GCS_RESUMABLE_CHUNK_GRANULARITY
  const contentRanges: string[] = []
  let requestCount = 0
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestCount += 1
    const contentRange = new Headers(init?.headers).get('content-range') || ''
    contentRanges.push(contentRange)
    if (requestCount === 1) return new Response('temporary', { status: 503 })
    if (requestCount === 2) {
      return new Response(null, {
        status: 308,
        headers: { Range: `bytes=0-${chunkSize - 1}` },
      })
    }
    return new Response('{}', { status: 200 })
  }
  const uploader = new GcsResumableUploader({
    sessionUrl: 'https://storage.googleapis.com/upload/committed-after-503',
    chunkSize,
    maxBufferedBytes: chunkSize * 2,
    fetchImpl,
    sleepImpl: async () => undefined,
  })

  await uploader.append(new Uint8Array(chunkSize * 2))
  await uploader.finish()
  assert.deepEqual(contentRanges, [
    `bytes 0-${chunkSize - 1}/*`,
    'bytes */*',
    `bytes ${chunkSize}-${chunkSize * 2 - 1}/${chunkSize * 2}`,
  ])
})

test('mất phản hồi của chunk cuối vẫn hoàn tất khi status query trả 200', async () => {
  const chunkSize = GCS_RESUMABLE_CHUNK_GRANULARITY
  const finalSize = 91
  const contentRanges: string[] = []
  let requestCount = 0
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestCount += 1
    const contentRange = new Headers(init?.headers).get('content-range') || ''
    contentRanges.push(contentRange)
    if (requestCount === 1) throw new TypeError('response lost after commit')
    return new Response(JSON.stringify({ generation: 'finalized-remotely' }), {
      status: 200,
      headers: { ETag: 'remote-etag' },
    })
  }
  const uploader = new GcsResumableUploader({
    sessionUrl: 'https://storage.googleapis.com/upload/final-response-lost',
    chunkSize,
    maxBufferedBytes: chunkSize * 2,
    fetchImpl,
    sleepImpl: async () => undefined,
  })

  await uploader.append(new Uint8Array(finalSize))
  const result = await uploader.finish()
  assert.equal(result.totalBytes, finalSize)
  assert.deepEqual(result.metadata, { generation: 'finalized-remotely' })
  assert.equal(result.etag, 'remote-etag')
  assert.deepEqual(contentRanges, [
    `bytes 0-${finalSize - 1}/${finalSize}`,
    `bytes */${finalSize}`,
  ])
})

test('308 partial chỉ tiếp tục từ offset đã commit trên ranh giới 256 KiB', async () => {
  const granularity = GCS_RESUMABLE_CHUNK_GRANULARITY
  const chunkSize = granularity * 2
  const finalSize = 37
  const contentRanges: string[] = []
  let requestCount = 0
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestCount += 1
    const contentRange = new Headers(init?.headers).get('content-range') || ''
    contentRanges.push(contentRange)
    if (requestCount === 1) {
      return new Response(null, {
        status: 308,
        headers: { Range: `bytes=0-${granularity - 1}` },
      })
    }
    if (requestCount === 2) {
      return new Response(null, {
        status: 308,
        headers: { Range: `bytes=0-${chunkSize - 1}` },
      })
    }
    return new Response('{}', { status: 200 })
  }
  const uploader = new GcsResumableUploader({
    sessionUrl: 'https://storage.googleapis.com/upload/partial-308',
    chunkSize,
    maxBufferedBytes: chunkSize * 2,
    fetchImpl,
  })

  const totalBytes = chunkSize + finalSize
  await uploader.append(new Uint8Array(totalBytes))
  await uploader.finish()
  assert.deepEqual(contentRanges, [
    `bytes 0-${chunkSize - 1}/*`,
    `bytes ${granularity}-${chunkSize - 1}/*`,
    `bytes ${chunkSize}-${totalBytes - 1}/${totalBytes}`,
  ])
})

test('offset partial lệch ranh giới bị từ chối thay vì đoán hoặc ghi đè byte', async () => {
  const chunkSize = GCS_RESUMABLE_CHUNK_GRANULARITY * 2
  const fetchImpl: typeof fetch = async () => new Response(null, {
    status: 308,
    headers: { Range: 'bytes=0-12344' },
  })
  const uploader = new GcsResumableUploader({
    sessionUrl: 'https://storage.googleapis.com/upload/misaligned-offset',
    chunkSize,
    maxBufferedBytes: chunkSize * 2,
    fetchImpl,
    sleepImpl: async () => undefined,
  })

  await assert.rejects(
    uploader.append(new Uint8Array(chunkSize + 1)),
    (error: unknown) => error instanceof ClassroomRecordingUploadError
      && error.code === 'PROTOCOL_ERROR'
      && !error.retryable,
  )
  assert.equal(uploader.state, 'failed')
})

test('abort trong backoff dừng trước status query và giữ mã lỗi ABORTED', async () => {
  const chunkSize = GCS_RESUMABLE_CHUNK_GRANULARITY
  let fetchCount = 0
  let markSleeping: (() => void) | undefined
  const sleeping = new Promise<void>((resolve) => { markSleeping = resolve })
  const fetchImpl: typeof fetch = async () => {
    fetchCount += 1
    throw new TypeError('offline')
  }
  const uploader = new GcsResumableUploader({
    sessionUrl: 'https://storage.googleapis.com/upload/abort-backoff',
    chunkSize,
    maxBufferedBytes: chunkSize * 2,
    fetchImpl,
    sleepImpl: async (_delayMs, signal) => new Promise<void>((_resolve, reject) => {
      markSleeping?.()
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }),
  })

  const pendingAppend = uploader.append(new Uint8Array(chunkSize * 2))
  await sleeping
  uploader.abort('rời lớp')
  await assert.rejects(
    pendingAppend,
    (error: unknown) => error instanceof ClassroomRecordingUploadError && error.code === 'ABORTED',
  )
  assert.equal(fetchCount, 1)
  assert.equal(uploader.state, 'aborted')
})

test('retry/status query bị chặn đúng giới hạn và không lặp vô hạn', async () => {
  const chunkSize = GCS_RESUMABLE_CHUNK_GRANULARITY
  let fetchCount = 0
  let sleepCount = 0
  const fetchImpl: typeof fetch = async (_input, init) => {
    fetchCount += 1
    const contentRange = new Headers(init?.headers).get('content-range') || ''
    if (contentRange === 'bytes */*') return new Response('busy', { status: 503 })
    throw new TypeError('offline')
  }
  const uploader = new GcsResumableUploader({
    sessionUrl: 'https://storage.googleapis.com/upload/retry-limit',
    chunkSize,
    maxBufferedBytes: chunkSize * 2,
    fetchImpl,
    maxRetries: 2,
    retryBaseDelayMs: 10,
    retryMaxDelayMs: 20,
    sleepImpl: async () => { sleepCount += 1 },
  })

  await assert.rejects(
    uploader.append(new Uint8Array(chunkSize * 2)),
    (error: unknown) => error instanceof ClassroomRecordingUploadError
      && error.retryable
      && error.httpStatus === 503,
  )
  assert.equal(fetchCount, 3) // one data PUT + exactly two status queries
  assert.equal(sleepCount, 2)
  assert.equal(uploader.state, 'failed')
})

test('preferCurrentTab được truyền cục bộ mà không cần mở rộng type DOM toàn cục', async () => {
  let received: unknown
  const fakeStream = { id: 'display-stream' } as MediaStream
  const mediaDevices = {
    getDisplayMedia: async (constraints: DisplayMediaStreamOptions) => {
      received = constraints
      return fakeStream
    },
  } as MediaDevices

  const result = await requestClassroomDisplayMedia(
    { video: true, audio: true, preferCurrentTab: true },
    mediaDevices,
  )
  assert.equal(result, fakeStream)
  assert.deepEqual(received, { video: true, audio: true, preferCurrentTab: true })
})
