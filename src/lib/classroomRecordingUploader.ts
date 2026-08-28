export const GCS_RESUMABLE_CHUNK_GRANULARITY = 256 * 1024
export const DEFAULT_GCS_RESUMABLE_CHUNK_SIZE = 8 * 1024 * 1024
export const DEFAULT_GCS_RESUMABLE_MAX_BUFFERED_BYTES = 32 * 1024 * 1024
export const DEFAULT_GCS_RESUMABLE_MAX_RETRIES = 4
export const DEFAULT_GCS_RESUMABLE_RETRY_BASE_DELAY_MS = 500
export const DEFAULT_GCS_RESUMABLE_RETRY_MAX_DELAY_MS = 8_000

export type GcsResumableUploadState = 'open' | 'finishing' | 'finished' | 'aborted' | 'failed'
export type GcsResumableUploadPart = Blob | ArrayBuffer | ArrayBufferView

export type GcsResumableUploadProgress = {
  acceptedBytes: number
  uploadedBytes: number
  bufferedBytes: number
}

export type GcsResumableUploadResult = {
  totalBytes: number
  metadata: unknown
  etag: string | null
}

export type GcsResumableUploaderOptions = {
  sessionUrl: string
  contentType?: string
  chunkSize?: number
  maxBufferedBytes?: number
  fetchImpl?: typeof fetch
  maxRetries?: number
  retryBaseDelayMs?: number
  retryMaxDelayMs?: number
  sleepImpl?: (delayMs: number, signal: AbortSignal) => Promise<void>
  signal?: AbortSignal
  onProgress?: (progress: GcsResumableUploadProgress) => void
}

export type ClassroomRecordingUploadErrorCode =
  | 'ABORTED'
  | 'ALREADY_FINISHED'
  | 'BUFFER_LIMIT_EXCEEDED'
  | 'INVALID_CONFIG'
  | 'NETWORK_ERROR'
  | 'PROTOCOL_ERROR'
  | 'UPLOAD_REJECTED'

export class ClassroomRecordingUploadError extends Error {
  readonly code: ClassroomRecordingUploadErrorCode
  readonly httpStatus: number | null
  readonly retryable: boolean
  readonly cause?: unknown

  constructor(
    code: ClassroomRecordingUploadErrorCode,
    message: string,
    options: { cause?: unknown; httpStatus?: number | null; retryable?: boolean } = {},
  ) {
    super(message)
    this.name = 'ClassroomRecordingUploadError'
    this.code = code
    this.httpStatus = options.httpStatus ?? null
    this.retryable = options.retryable ?? false
    this.cause = options.cause
  }
}

type AppendJob = {
  type: 'append'
  blob: Blob
  resolve: () => void
  reject: (reason: unknown) => void
}

type FinishJob = {
  type: 'finish'
  resolve: (result: GcsResumableUploadResult) => void
  reject: (reason: unknown) => void
}

type UploadJob = AppendJob | FinishJob

function assertSafeSessionUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch (cause) {
    throw new ClassroomRecordingUploadError('INVALID_CONFIG', 'URL phiên tải bản ghi không hợp lệ.', { cause })
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new ClassroomRecordingUploadError(
      'INVALID_CONFIG',
      'Phiên tải bản ghi phải dùng HTTPS và không chứa thông tin đăng nhập hoặc fragment.',
    )
  }
  return url.toString()
}

function assertPositiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ClassroomRecordingUploadError('INVALID_CONFIG', `${label} phải là số nguyên dương an toàn.`)
  }
  return value
}

function assertNonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ClassroomRecordingUploadError('INVALID_CONFIG', `${label} phải là số nguyên không âm an toàn.`)
  }
  return value
}

function partToBlob(part: GcsResumableUploadPart, contentType: string): Blob {
  if (part instanceof Blob) return part.type === contentType ? part : part.slice(0, part.size, contentType)
  if (part instanceof ArrayBuffer) return new Blob([part], { type: contentType })

  // Copy only the visible portion. ArrayBufferView.buffer can be larger than the
  // view and can also be a SharedArrayBuffer, which is not a valid BlobPart in
  // every browser/type-library combination.
  const bytes = new Uint8Array(part.byteLength)
  bytes.set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength))
  return new Blob([bytes], { type: contentType })
}

function responseIsRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const raw = (await response.text()).trim()
    if (!raw) return ''
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: unknown }; message?: unknown }
      const message = parsed?.error?.message ?? parsed?.message
      return typeof message === 'string' ? message.slice(0, 500) : raw.slice(0, 500)
    } catch {
      return raw.slice(0, 500)
    }
  } catch {
    return ''
  }
}

function parseCommittedOffset(response: Response): number | null {
  const value = response.headers.get('range')?.trim()
  if (!value) return null
  const match = /^bytes=0-(\d+)$/i.exec(value)
  if (!match) return Number.NaN
  const lastByte = Number(match[1])
  return Number.isSafeInteger(lastByte) ? lastByte + 1 : Number.NaN
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortedError(signal.reason))
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    const onAbort = () => {
      globalThis.clearTimeout(timer)
      reject(abortedError(signal.reason))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function retryAfterDelayMs(response: Response | null, nowMs: number): number | null {
  const value = response?.headers.get('retry-after')?.trim()
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000)
  const retryAt = Date.parse(value)
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - nowMs) : null
}

function abortedError(reason?: unknown): ClassroomRecordingUploadError {
  return new ClassroomRecordingUploadError('ABORTED', 'Đã dừng tải bản ghi lên hệ thống.', {
    cause: reason,
  })
}

/**
 * Streams MediaRecorder blobs to a backend-issued Google Cloud Storage
 * resumable-session URL without retaining the whole recording in memory.
 *
 * Non-final PUT bodies are exactly `chunkSize` bytes (a multiple of 256 KiB).
 * One tail chunk is deliberately retained until finish(), because GCS needs
 * the final total byte count and the final body may be smaller than a chunk.
 */
export class GcsResumableUploader {
  private readonly sessionUrl: string
  private readonly contentType: string
  private readonly chunkSize: number
  private readonly maxBufferedBytes: number
  private readonly fetchImpl: typeof fetch
  private readonly maxRetries: number
  private readonly retryBaseDelayMs: number
  private readonly retryMaxDelayMs: number
  private readonly sleepImpl: (delayMs: number, signal: AbortSignal) => Promise<void>
  private readonly onProgress?: (progress: GcsResumableUploadProgress) => void
  private readonly abortController = new AbortController()
  private readonly jobs: UploadJob[] = []
  private readonly externalSignal?: AbortSignal
  private readonly externalAbortListener?: () => void

  private uploadState: GcsResumableUploadState = 'open'
  private queuedBytes = 0
  private acceptedByteCount = 0
  private uploadedByteCount = 0
  private tail = new Blob()
  private pumping = false
  private terminalError: ClassroomRecordingUploadError | null = null
  private finishPromise: Promise<GcsResumableUploadResult> | null = null
  private finishedResult: GcsResumableUploadResult | null = null

  constructor(options: GcsResumableUploaderOptions) {
    this.sessionUrl = assertSafeSessionUrl(options.sessionUrl)
    this.contentType = options.contentType?.trim() || 'video/webm'
    this.chunkSize = assertPositiveSafeInteger(
      options.chunkSize ?? DEFAULT_GCS_RESUMABLE_CHUNK_SIZE,
      'Kích thước chunk',
    )
    this.maxBufferedBytes = assertPositiveSafeInteger(
      options.maxBufferedBytes ?? DEFAULT_GCS_RESUMABLE_MAX_BUFFERED_BYTES,
      'Giới hạn bộ đệm',
    )
    if (this.chunkSize % GCS_RESUMABLE_CHUNK_GRANULARITY !== 0) {
      throw new ClassroomRecordingUploadError(
        'INVALID_CONFIG',
        `Kích thước chunk phải là bội số của ${GCS_RESUMABLE_CHUNK_GRANULARITY} byte.`,
      )
    }
    if (this.maxBufferedBytes < this.chunkSize * 2) {
      throw new ClassroomRecordingUploadError(
        'INVALID_CONFIG',
        'Giới hạn bộ đệm phải chứa được ít nhất hai chunk để duy trì backpressure an toàn.',
      )
    }
    this.maxRetries = assertNonNegativeSafeInteger(
      options.maxRetries ?? DEFAULT_GCS_RESUMABLE_MAX_RETRIES,
      'Số lần thử lại',
    )
    this.retryBaseDelayMs = assertPositiveSafeInteger(
      options.retryBaseDelayMs ?? DEFAULT_GCS_RESUMABLE_RETRY_BASE_DELAY_MS,
      'Thời gian chờ thử lại ban đầu',
    )
    this.retryMaxDelayMs = assertPositiveSafeInteger(
      options.retryMaxDelayMs ?? DEFAULT_GCS_RESUMABLE_RETRY_MAX_DELAY_MS,
      'Thời gian chờ thử lại tối đa',
    )
    if (this.retryMaxDelayMs < this.retryBaseDelayMs) {
      throw new ClassroomRecordingUploadError(
        'INVALID_CONFIG',
        'Thời gian chờ thử lại tối đa không được nhỏ hơn thời gian chờ ban đầu.',
      )
    }
    this.sleepImpl = options.sleepImpl ?? abortableDelay

    const availableFetch = options.fetchImpl ?? globalThis.fetch
    if (typeof availableFetch !== 'function') {
      throw new ClassroomRecordingUploadError('INVALID_CONFIG', 'Trình duyệt không hỗ trợ fetch để tải bản ghi.')
    }
    this.fetchImpl = availableFetch.bind(globalThis)
    this.onProgress = options.onProgress
    this.externalSignal = options.signal
    if (this.externalSignal) {
      this.externalAbortListener = () => this.abort(this.externalSignal?.reason)
      if (this.externalSignal.aborted) this.abort(this.externalSignal.reason)
      else this.externalSignal.addEventListener('abort', this.externalAbortListener, { once: true })
    }
  }

  get state(): GcsResumableUploadState {
    return this.uploadState
  }

  get acceptedBytes(): number {
    return this.acceptedByteCount
  }

  get uploadedBytes(): number {
    return this.uploadedByteCount
  }

  get bufferedBytes(): number {
    return this.tail.size + this.queuedBytes
  }

  append(part: GcsResumableUploadPart): Promise<void> {
    if (this.uploadState !== 'open') return Promise.reject(this.stateError())

    const blob = partToBlob(part, this.contentType)
    if (blob.size === 0) return Promise.resolve()
    if (!Number.isSafeInteger(this.acceptedByteCount + blob.size)) {
      return Promise.reject(new ClassroomRecordingUploadError(
        'BUFFER_LIMIT_EXCEEDED',
        'Bản ghi vượt giới hạn byte an toàn của trình duyệt.',
      ))
    }
    if (this.bufferedBytes + blob.size > this.maxBufferedBytes) {
      return Promise.reject(new ClassroomRecordingUploadError(
        'BUFFER_LIMIT_EXCEEDED',
        `Bộ đệm bản ghi vượt ${this.maxBufferedBytes} byte. Hãy chờ append trước hoàn tất trước khi gửi thêm dữ liệu.`,
        { retryable: true },
      ))
    }

    this.acceptedByteCount += blob.size
    this.queuedBytes += blob.size
    const promise = new Promise<void>((resolve, reject) => {
      this.jobs.push({ type: 'append', blob, resolve, reject })
    })
    this.startPump()
    this.emitProgress()
    return promise
  }

  finish(): Promise<GcsResumableUploadResult> {
    if (this.finishedResult) return Promise.resolve(this.finishedResult)
    if (this.finishPromise) return this.finishPromise
    if (this.uploadState !== 'open') return Promise.reject(this.stateError())

    this.uploadState = 'finishing'
    this.finishPromise = new Promise<GcsResumableUploadResult>((resolve, reject) => {
      this.jobs.push({ type: 'finish', resolve, reject })
    })
    this.startPump()
    return this.finishPromise
  }

  abort(reason?: unknown): void {
    if (this.uploadState === 'finished' || this.uploadState === 'aborted' || this.uploadState === 'failed') return
    const error = abortedError(reason)
    this.uploadState = 'aborted'
    this.terminalError = error
    this.abortController.abort(error)
    this.rejectQueuedJobs(error)
    this.detachExternalSignal()
  }

  private startPump(): void {
    if (this.pumping) return
    this.pumping = true
    void this.pump()
  }

  private async pump(): Promise<void> {
    try {
      while (this.jobs.length > 0) {
        if (this.uploadState === 'aborted' || this.uploadState === 'failed') break
        const job = this.jobs.shift()
        if (!job) break

        try {
          if (job.type === 'append') {
            this.tail = new Blob([this.tail, job.blob], { type: this.contentType })
            this.queuedBytes -= job.blob.size
            await this.flushNonFinalChunks()
            job.resolve()
          } else {
            const result = await this.finalizeUpload()
            this.finishedResult = result
            this.uploadState = 'finished'
            this.detachExternalSignal()
            job.resolve(result)
          }
        } catch (cause) {
          const error = this.normalizeError(cause)
          this.uploadState = this.abortController.signal.aborted ? 'aborted' : 'failed'
          this.terminalError = error
          job.reject(error)
          this.rejectQueuedJobs(error)
          this.detachExternalSignal()
          break
        }
      }
    } finally {
      this.pumping = false
      if (this.jobs.length > 0 && this.uploadState !== 'aborted' && this.uploadState !== 'failed') this.startPump()
    }
  }

  private async flushNonFinalChunks(): Promise<void> {
    // Strictly greater-than is intentional: if the recording ends on an exact
    // chunk boundary, that complete last chunk is still sent by finish() with
    // a known total rather than prematurely sent with an unknown total.
    while (this.tail.size > this.chunkSize) {
      const chunk = this.tail.slice(0, this.chunkSize, this.contentType)
      await this.putChunk(chunk, null, false)
      this.tail = this.tail.slice(this.chunkSize, this.tail.size, this.contentType)
    }
  }

  private async finalizeUpload(): Promise<GcsResumableUploadResult> {
    if (this.queuedBytes !== 0 || this.jobs.some((job) => job.type === 'append')) {
      throw new ClassroomRecordingUploadError('PROTOCOL_ERROR', 'Không thể chốt bản ghi khi vẫn còn dữ liệu chờ tải.')
    }
    const totalBytes = this.uploadedByteCount + this.tail.size
    if (totalBytes !== this.acceptedByteCount) {
      throw new ClassroomRecordingUploadError('PROTOCOL_ERROR', 'Tổng byte bản ghi không khớp dữ liệu đã nhận.')
    }

    const finalChunk = this.tail
    const response = await this.putChunk(finalChunk, totalBytes, true)
    this.tail = new Blob()

    let metadata: unknown = null
    try {
      const raw = await response.text()
      metadata = raw ? JSON.parse(raw) : null
    } catch {
      // Object metadata is useful but not required for upload integrity. The
      // backend finalize callable remains the source of truth.
    }
    return {
      totalBytes,
      metadata,
      etag: response.headers.get('etag'),
    }
  }

  private async putChunk(chunk: Blob, totalBytes: number | null, final: boolean): Promise<Response> {
    if (this.abortController.signal.aborted) throw abortedError(this.abortController.signal.reason)
    const originalStart = this.uploadedByteCount
    const targetOffset = originalStart + chunk.size
    let nextOffset = originalStart
    let recoveryAttempts = 0
    let lastTransientError: ClassroomRecordingUploadError | null = null

    const commit = (response: Response): Response => {
      this.uploadedByteCount = targetOffset
      this.emitProgress()
      return response
    }

    const validateOffset = (response: Response, minimumOffset: number): number => {
      const parsedOffset = parseCommittedOffset(response)
      // Official GCS semantics: a 308 without Range means zero bytes have
      // been persisted. This is safe only for the very first chunk; after a
      // confirmed prefix it would mean the server has regressed/lost state.
      const committedOffset = parsedOffset ?? 0
      if (!Number.isSafeInteger(committedOffset)
        || committedOffset < originalStart
        || committedOffset < minimumOffset
        || committedOffset > targetOffset) {
        throw new ClassroomRecordingUploadError(
          'PROTOCOL_ERROR',
          `Offset máy chủ (${String(committedOffset)}) nằm ngoài phạm vi an toàn ${minimumOffset}-${targetOffset}.`,
          { httpStatus: response.status },
        )
      }
      if (!final
        && committedOffset < targetOffset
        && (committedOffset - originalStart) % GCS_RESUMABLE_CHUNK_GRANULARITY !== 0) {
        throw new ClassroomRecordingUploadError(
          'PROTOCOL_ERROR',
          `Offset máy chủ (${committedOffset}) không nằm trên ranh giới 256 KiB.`,
          { httpStatus: response.status },
        )
      }
      return committedOffset
    }

    const retryDelay = async (response: Response | null): Promise<void> => {
      if (recoveryAttempts >= this.maxRetries) {
        throw lastTransientError ?? new ClassroomRecordingUploadError(
          'NETWORK_ERROR',
          `Không thể tiếp tục tải bản ghi sau ${this.maxRetries} lần thử lại.`,
          { retryable: true },
        )
      }
      const exponentialDelay = Math.min(
        this.retryMaxDelayMs,
        this.retryBaseDelayMs * (2 ** recoveryAttempts),
      )
      const requestedDelay = retryAfterDelayMs(response, Date.now()) ?? 0
      const delayMs = Math.min(this.retryMaxDelayMs, Math.max(exponentialDelay, requestedDelay))
      recoveryAttempts += 1
      await this.sleepImpl(delayMs, this.abortController.signal)
      if (this.abortController.signal.aborted) throw abortedError(this.abortController.signal.reason)
    }

    const queryCommittedOffset = async (responseBeforeRetry: Response | null): Promise<{
      offset: number | null
      completedResponse: Response | null
      statusResponse: Response
    }> => {
      let retryResponse = responseBeforeRetry
      while (true) {
        await retryDelay(retryResponse)
        retryResponse = null
        let statusResponse: Response
        try {
          statusResponse = await this.fetchImpl(this.sessionUrl, {
            method: 'PUT',
            headers: { 'Content-Range': `bytes */${totalBytes ?? '*'}` },
            body: null,
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            signal: this.abortController.signal,
          })
        } catch (cause) {
          if (this.abortController.signal.aborted) throw abortedError(this.abortController.signal.reason)
          lastTransientError = new ClassroomRecordingUploadError(
            'NETWORK_ERROR',
            `Mất kết nối khi kiểm tra offset bản ghi tại byte ${nextOffset}.`,
            { cause, retryable: true },
          )
          continue
        }

        if (statusResponse.status === 200 || statusResponse.status === 201) {
          if (!final) {
            throw new ClassroomRecordingUploadError(
              'PROTOCOL_ERROR',
              'Máy chủ báo hoàn tất đối tượng khi chunk chưa phải là phần cuối.',
              { httpStatus: statusResponse.status },
            )
          }
          return { offset: null, completedResponse: statusResponse, statusResponse }
        }
        if (statusResponse.status === 308) {
          return {
            offset: validateOffset(statusResponse, nextOffset),
            completedResponse: null,
            statusResponse,
          }
        }
        const detail = await responseMessage(statusResponse)
        const statusError = new ClassroomRecordingUploadError(
          'UPLOAD_REJECTED',
          `Không thể kiểm tra offset bản ghi (HTTP ${statusResponse.status})${detail ? `: ${detail}` : '.'}`,
          { httpStatus: statusResponse.status, retryable: responseIsRetryable(statusResponse.status) },
        )
        if (!statusError.retryable) throw statusError
        lastTransientError = statusError
        retryResponse = statusResponse
      }
    }

    while (true) {
      if (this.abortController.signal.aborted) throw abortedError(this.abortController.signal.reason)
      if (nextOffset === targetOffset) {
        if (!final) {
          throw new ClassroomRecordingUploadError('PROTOCOL_ERROR', 'Thiếu phản hồi 308 xác nhận chunk bản ghi.')
        }
        // A status query with a known total must return 200/201 once every
        // byte is committed. A 308 at targetOffset is inconsistent and must
        // not be guessed as success.
        throw new ClassroomRecordingUploadError(
          'PROTOCOL_ERROR',
          'Máy chủ đã nhận đủ byte nhưng chưa xác nhận hoàn tất bản ghi.',
          { retryable: true },
        )
      }

      const relativeStart = nextOffset - originalStart
      const remaining = chunk.slice(relativeStart, chunk.size, this.contentType)
      if (!final && remaining.size % GCS_RESUMABLE_CHUNK_GRANULARITY !== 0) {
        throw new ClassroomRecordingUploadError(
          'PROTOCOL_ERROR',
          'Phần chunk cần gửi lại không còn là bội số 256 KiB.',
        )
      }
      const end = targetOffset - 1
      const contentRange = remaining.size === 0
        ? `bytes */${totalBytes ?? '*'}`
        : `bytes ${nextOffset}-${end}/${totalBytes ?? '*'}`

      let response: Response | null = null
      try {
        response = await this.fetchImpl(this.sessionUrl, {
          method: 'PUT',
          headers: {
            'Content-Range': contentRange,
            'Content-Type': this.contentType,
          },
          body: remaining,
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: this.abortController.signal,
        })
      } catch (cause) {
        if (this.abortController.signal.aborted) throw abortedError(this.abortController.signal.reason)
        lastTransientError = new ClassroomRecordingUploadError(
          'NETWORK_ERROR',
          `Mất kết nối khi tải bản ghi tại byte ${nextOffset}.`,
          { cause, retryable: true },
        )
      }

      if (response && (response.status === 200 || response.status === 201)) {
        if (!final) {
          throw new ClassroomRecordingUploadError(
            'PROTOCOL_ERROR',
            'Máy chủ chốt đối tượng trước chunk cuối của bản ghi.',
            { httpStatus: response.status },
          )
        }
        return commit(response)
      }

      if (response?.status === 308) {
        const committedOffset = validateOffset(response, nextOffset)
        if (committedOffset === targetOffset) {
          if (!final) return commit(response)
          // Confirm finalization through a status query with the known total;
          // never treat a 308 response itself as a completed object.
          lastTransientError = new ClassroomRecordingUploadError(
            'PROTOCOL_ERROR',
            'Máy chủ chưa xác nhận chốt bản ghi sau khi nhận đủ byte.',
            { httpStatus: 308, retryable: true },
          )
          const recovered = await queryCommittedOffset(response)
          if (recovered.completedResponse) return commit(recovered.completedResponse)
          nextOffset = recovered.offset ?? nextOffset
          continue
        }
        if (committedOffset > nextOffset) {
          nextOffset = committedOffset
          continue
        }
        lastTransientError = new ClassroomRecordingUploadError(
          'PROTOCOL_ERROR',
          `Máy chủ chưa nhận thêm dữ liệu tại byte ${nextOffset}.`,
          { httpStatus: 308, retryable: true },
        )
      } else if (response) {
        const detail = await responseMessage(response)
        const responseError = new ClassroomRecordingUploadError(
          'UPLOAD_REJECTED',
          `Máy chủ từ chối dữ liệu bản ghi (HTTP ${response.status})${detail ? `: ${detail}` : '.'}`,
          { httpStatus: response.status, retryable: responseIsRetryable(response.status) },
        )
        if (!responseError.retryable) throw responseError
        lastTransientError = responseError
      }

      const recovered = await queryCommittedOffset(response)
      if (recovered.completedResponse) return commit(recovered.completedResponse)
      const recoveredOffset = recovered.offset ?? nextOffset
      if (recoveredOffset === targetOffset) {
        if (!final) return commit(recovered.statusResponse)
        throw new ClassroomRecordingUploadError(
          'PROTOCOL_ERROR',
          'GCS nhận đủ byte cuối nhưng không trả xác nhận hoàn tất 200/201.',
          { retryable: true },
        )
      }
      nextOffset = recoveredOffset
    }
  }

  private normalizeError(cause: unknown): ClassroomRecordingUploadError {
    if (cause instanceof ClassroomRecordingUploadError) return cause
    if (this.abortController.signal.aborted) return abortedError(this.abortController.signal.reason)
    return new ClassroomRecordingUploadError('PROTOCOL_ERROR', 'Không thể xử lý dữ liệu bản ghi.', { cause })
  }

  private stateError(): ClassroomRecordingUploadError {
    if (this.terminalError) return this.terminalError
    return new ClassroomRecordingUploadError(
      'ALREADY_FINISHED',
      this.uploadState === 'finished'
        ? 'Bản ghi đã được chốt; không thể gửi thêm dữ liệu.'
        : 'Bản ghi đang được chốt; không thể gửi thêm dữ liệu.',
    )
  }

  private rejectQueuedJobs(error: ClassroomRecordingUploadError): void {
    const queued = this.jobs.splice(0)
    for (const job of queued) {
      if (job.type === 'append') this.queuedBytes -= job.blob.size
      job.reject(error)
    }
    if (this.queuedBytes < 0) this.queuedBytes = 0
  }

  private emitProgress(): void {
    if (!this.onProgress) return
    try {
      this.onProgress({
        acceptedBytes: this.acceptedByteCount,
        uploadedBytes: this.uploadedByteCount,
        bufferedBytes: this.bufferedBytes,
      })
    } catch {
      // UI progress callbacks must never corrupt the upload state machine.
    }
  }

  private detachExternalSignal(): void {
    if (this.externalSignal && this.externalAbortListener) {
      this.externalSignal.removeEventListener('abort', this.externalAbortListener)
    }
  }
}

/** Chrome currently supports preferCurrentTab even when the active DOM lib
 * has not added it yet. Keeping the extension local avoids unsafe global
 * declaration merging and remains harmless in browsers that ignore it. */
export type ClassroomDisplayMediaOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean
}

export type ClassroomRecordingCaptureOptions = {
  displayConstraints?: ClassroomDisplayMediaOptions
  microphoneConstraints?: boolean | MediaTrackConstraints
  mediaDevices?: MediaDevices
  stopSourceTracksOnCleanup?: boolean
  displayGain?: number
  microphoneGain?: number
}

export type ClassroomRecordingCapture = {
  stream: MediaStream
  displayStream: MediaStream
  microphoneStream: MediaStream | null
  hasDisplayAudio: boolean
  hasMicrophoneAudio: boolean
  cleanup: () => Promise<void>
}

type AudioContextConstructor = new (contextOptions?: AudioContextOptions) => AudioContext
type AudioContextGlobals = typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor
}

function defaultMediaDevices(): MediaDevices | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
}

function captureError(message: string, cause?: unknown): Error {
  return new ClassroomRecordingUploadError('INVALID_CONFIG', message, { cause })
}

export async function requestClassroomDisplayMedia(
  constraints: ClassroomDisplayMediaOptions = { video: true, audio: true, preferCurrentTab: true },
  mediaDevices: MediaDevices | undefined = defaultMediaDevices(),
): Promise<MediaStream> {
  const getDisplayMedia = mediaDevices?.getDisplayMedia
  if (typeof getDisplayMedia !== 'function') {
    throw captureError('Trình duyệt không hỗ trợ chia sẻ tab/màn hình để ghi buổi học.')
  }
  try {
    return await getDisplayMedia.call(mediaDevices, constraints)
  } catch (cause) {
    throw captureError('Không thể mở quyền chia sẻ tab/màn hình. Vui lòng chọn đúng tab lớp học và thử lại.', cause)
  }
}

export async function mixDisplayAndMicrophoneAudio(
  displayStream: MediaStream,
  microphoneStream: MediaStream | null = null,
  options: Pick<
    ClassroomRecordingCaptureOptions,
    'stopSourceTracksOnCleanup' | 'displayGain' | 'microphoneGain'
  > = {},
): Promise<ClassroomRecordingCapture> {
  if (typeof MediaStream !== 'function') throw captureError('Trình duyệt không hỗ trợ MediaStream để ghi buổi học.')

  const displayAudioTracks = displayStream.getAudioTracks().filter((track) => track.readyState === 'live')
  const microphoneAudioTracks = (microphoneStream?.getAudioTracks() ?? []).filter((track) => track.readyState === 'live')
  const seenTrackIds = new Set<string>()
  const sources = [
    ...displayAudioTracks.map((track) => ({ track, gain: options.displayGain ?? 1 })),
    ...microphoneAudioTracks.map((track) => ({ track, gain: options.microphoneGain ?? 1 })),
  ].filter(({ track }) => {
    if (seenTrackIds.has(track.id)) return false
    seenTrackIds.add(track.id)
    return true
  })

  const videoTracks = displayStream.getVideoTracks().filter((track) => track.readyState === 'live')
  let audioContext: AudioContext | null = null
  let outputStream: MediaStream
  const audioNodes: AudioNode[] = []

  if (sources.length <= 1) {
    outputStream = new MediaStream([...videoTracks, ...sources.map(({ track }) => track)])
  } else {
    const globals = globalThis as AudioContextGlobals
    const AudioContextClass = globals.AudioContext ?? globals.webkitAudioContext
    if (!AudioContextClass) {
      throw captureError('Trình duyệt không hỗ trợ trộn âm thanh tab và micro bằng Web Audio.')
    }

    try {
      audioContext = new AudioContextClass()
      const destination = audioContext.createMediaStreamDestination()
      audioNodes.push(destination)
      for (const { track, gain } of sources) {
        const source = audioContext.createMediaStreamSource(new MediaStream([track]))
        const gainNode = audioContext.createGain()
        gainNode.gain.value = Number.isFinite(gain) ? Math.max(0, Math.min(2, gain)) : 1
        source.connect(gainNode)
        gainNode.connect(destination)
        audioNodes.push(source, gainNode)
      }
      if (audioContext.state === 'suspended') await audioContext.resume()
      if (audioContext.state !== 'running') throw new Error(`AudioContext state: ${audioContext.state}`)
      outputStream = new MediaStream([...videoTracks, ...destination.stream.getAudioTracks()])
    } catch (cause) {
      for (const node of audioNodes) {
        try { node.disconnect() } catch { /* already disconnected */ }
      }
      if (audioContext && audioContext.state !== 'closed') {
        try { await audioContext.close() } catch { /* best-effort cleanup */ }
      }
      throw captureError('Không thể trộn âm thanh tab và micro cho bản ghi.', cause)
    }
  }

  let cleaned = false
  const cleanup = async () => {
    if (cleaned) return
    cleaned = true
    for (const node of audioNodes) {
      try { node.disconnect() } catch { /* already disconnected */ }
    }
    if (audioContext && audioContext.state !== 'closed') {
      try { await audioContext.close() } catch { /* best-effort cleanup */ }
    }

    const tracks = new Set<MediaStreamTrack>(outputStream.getTracks())
    if (options.stopSourceTracksOnCleanup ?? true) {
      for (const track of displayStream.getTracks()) tracks.add(track)
      for (const track of microphoneStream?.getTracks() ?? []) tracks.add(track)
    }
    for (const track of tracks) track.stop()
  }

  return {
    stream: outputStream,
    displayStream,
    microphoneStream,
    hasDisplayAudio: displayAudioTracks.length > 0,
    hasMicrophoneAudio: microphoneAudioTracks.length > 0,
    cleanup,
  }
}

export async function createClassroomRecordingCapture(
  options: ClassroomRecordingCaptureOptions = {},
): Promise<ClassroomRecordingCapture> {
  const mediaDevices = options.mediaDevices ?? defaultMediaDevices()
  const displayStream = await requestClassroomDisplayMedia(
    options.displayConstraints ?? { video: true, audio: true, preferCurrentTab: true },
    mediaDevices,
  )

  let microphoneStream: MediaStream | null = null
  try {
    const microphoneConstraints = options.microphoneConstraints ?? {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
    if (microphoneConstraints !== false) {
      if (typeof mediaDevices?.getUserMedia !== 'function') {
        throw captureError('Trình duyệt không hỗ trợ mở micro cho bản ghi.')
      }
      microphoneStream = await mediaDevices.getUserMedia({ audio: microphoneConstraints, video: false })
    }
    return await mixDisplayAndMicrophoneAudio(displayStream, microphoneStream, options)
  } catch (cause) {
    for (const track of displayStream.getTracks()) track.stop()
    for (const track of microphoneStream?.getTracks() ?? []) track.stop()
    if (cause instanceof ClassroomRecordingUploadError) throw cause
    throw captureError('Không thể chuẩn bị hình ảnh và âm thanh cho bản ghi.', cause)
  }
}
