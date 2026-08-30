export const TRIAL_BOARD_IMAGE_NAMESPACE = '123english-trial-board-image'
export const TRIAL_BOARD_IMAGE_SCHEMA_VERSION = 1 as const
export const TRIAL_BOARD_IMAGE_CHUNK_SIZE = 12_000
export const TRIAL_BOARD_IMAGE_MAX_DATA_URL_LENGTH = 520_000
export const TRIAL_BOARD_IMAGE_MAX_CHUNKS = Math.ceil(
  TRIAL_BOARD_IMAGE_MAX_DATA_URL_LENGTH / TRIAL_BOARD_IMAGE_CHUNK_SIZE,
)
export const TRIAL_BOARD_IMAGE_MESSAGE_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1_000

export type TrialBoardImageChunkMessage = {
  namespace: typeof TRIAL_BOARD_IMAGE_NAMESPACE
  schemaVersion: typeof TRIAL_BOARD_IMAGE_SCHEMA_VERSION
  type: 'image-chunk'
  trialClassId: string
  imageId: string
  chunkIndex: number
  totalChunks: number
  data: string
  sentAt: number
}

export type TrialBoardImageClearMessage = {
  namespace: typeof TRIAL_BOARD_IMAGE_NAMESPACE
  schemaVersion: typeof TRIAL_BOARD_IMAGE_SCHEMA_VERSION
  type: 'image-clear'
  trialClassId: string
  imageId: string
  sentAt: number
}

export type TrialBoardImageMessage = TrialBoardImageChunkMessage | TrialBoardImageClearMessage
export type TrialBoardImageOrder = { sentAt: number; imageId: string }

export function compareTrialBoardImageOrder(
  left: TrialBoardImageOrder,
  right: TrialBoardImageOrder,
): number {
  if (left.sentAt !== right.sentAt) return left.sentAt - right.sentAt
  return left.imageId.localeCompare(right.imageId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeId(value: unknown, maxLength = 180): value is string {
  return typeof value === 'string'
    && value.length >= 8
    && value.length <= maxLength
    && /^[A-Za-z0-9_-]+$/.test(value)
}

export function chunkTrialBoardImage(input: {
  trialClassId: string
  imageId: string
  dataUrl: string
  sentAt?: number
}): TrialBoardImageChunkMessage[] {
  if (!safeId(input.trialClassId)
    || !safeId(input.imageId, 120)
    || !/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(input.dataUrl)
    || input.dataUrl.length > TRIAL_BOARD_IMAGE_MAX_DATA_URL_LENGTH) return []

  const totalChunks = Math.ceil(input.dataUrl.length / TRIAL_BOARD_IMAGE_CHUNK_SIZE)
  if (totalChunks <= 0 || totalChunks > TRIAL_BOARD_IMAGE_MAX_CHUNKS) return []
  const sentAt = Number.isSafeInteger(input.sentAt) && Number(input.sentAt) > 0
    ? Number(input.sentAt)
    : Date.now()

  return Array.from({ length: totalChunks }, (_, chunkIndex) => ({
    namespace: TRIAL_BOARD_IMAGE_NAMESPACE,
    schemaVersion: TRIAL_BOARD_IMAGE_SCHEMA_VERSION,
    type: 'image-chunk' as const,
    trialClassId: input.trialClassId,
    imageId: input.imageId,
    chunkIndex,
    totalChunks,
    data: input.dataUrl.slice(
      chunkIndex * TRIAL_BOARD_IMAGE_CHUNK_SIZE,
      (chunkIndex + 1) * TRIAL_BOARD_IMAGE_CHUNK_SIZE,
    ),
    sentAt,
  }))
}

export function makeTrialBoardImageClearMessage(input: {
  trialClassId: string
  imageId: string
  sentAt?: number
}): TrialBoardImageClearMessage | null {
  if (!safeId(input.trialClassId) || !safeId(input.imageId, 120)) return null
  return {
    namespace: TRIAL_BOARD_IMAGE_NAMESPACE,
    schemaVersion: TRIAL_BOARD_IMAGE_SCHEMA_VERSION,
    type: 'image-clear',
    trialClassId: input.trialClassId,
    imageId: input.imageId,
    sentAt: Number.isSafeInteger(input.sentAt) && Number(input.sentAt) > 0
      ? Number(input.sentAt)
      : Date.now(),
  }
}

export function serializeTrialBoardImageMessage(message: TrialBoardImageMessage): string {
  return JSON.stringify(message)
}

export function parseTrialBoardImageMessage(
  raw: unknown,
  expectedTrialClassId: string,
  nowMs = Date.now(),
): TrialBoardImageMessage | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > TRIAL_BOARD_IMAGE_CHUNK_SIZE + 2_000) return null
  try {
    const value = JSON.parse(raw) as unknown
    if (!isRecord(value)
      || value.namespace !== TRIAL_BOARD_IMAGE_NAMESPACE
      || value.schemaVersion !== TRIAL_BOARD_IMAGE_SCHEMA_VERSION
      || value.trialClassId !== expectedTrialClassId
      || !safeId(value.trialClassId)
      || !safeId(value.imageId, 120)
      || !Number.isSafeInteger(value.sentAt)
      || Math.abs(nowMs - Number(value.sentAt)) > TRIAL_BOARD_IMAGE_MESSAGE_MAX_AGE_MS) return null

    if (value.type === 'image-clear') {
      return value as TrialBoardImageClearMessage
    }
    if (value.type !== 'image-chunk'
      || !Number.isSafeInteger(value.chunkIndex)
      || !Number.isSafeInteger(value.totalChunks)
      || Number(value.totalChunks) <= 0
      || Number(value.totalChunks) > TRIAL_BOARD_IMAGE_MAX_CHUNKS
      || Number(value.chunkIndex) < 0
      || Number(value.chunkIndex) >= Number(value.totalChunks)
      || typeof value.data !== 'string'
      || value.data.length === 0
      || value.data.length > TRIAL_BOARD_IMAGE_CHUNK_SIZE) return null
    return value as TrialBoardImageChunkMessage
  } catch {
    return null
  }
}

export function assembleTrialBoardImageChunks(
  chunks: readonly (string | undefined)[],
): string | null {
  if (chunks.length === 0 || chunks.length > TRIAL_BOARD_IMAGE_MAX_CHUNKS || chunks.some((chunk) => !chunk)) return null
  const dataUrl = chunks.join('')
  if (dataUrl.length > TRIAL_BOARD_IMAGE_MAX_DATA_URL_LENGTH
    || !/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(dataUrl)) return null
  return dataUrl
}
