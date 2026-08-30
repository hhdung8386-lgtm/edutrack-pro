import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TRIAL_BOARD_IMAGE_MAX_DATA_URL_LENGTH,
  TRIAL_BOARD_IMAGE_MESSAGE_MAX_AGE_MS,
  assembleTrialBoardImageChunks,
  chunkTrialBoardImage,
  compareTrialBoardImageOrder,
  makeTrialBoardImageClearMessage,
  parseTrialBoardImageMessage,
  serializeTrialBoardImageMessage,
} from '../src/lib/trialBoardImage.ts'

const trialClassId = `tr_${'a'.repeat(32)}`
const imageId = `board-image-${'b'.repeat(24)}`

test('chunks and reconstructs a synchronized pasted whiteboard image', () => {
  const dataUrl = `data:image/webp;base64,${'A'.repeat(40_000)}`
  const messages = chunkTrialBoardImage({ trialClassId, imageId, dataUrl, sentAt: 100_000 })
  assert.ok(messages.length > 1)
  const parsed = messages.map((message) => parseTrialBoardImageMessage(
    serializeTrialBoardImageMessage(message),
    trialClassId,
    100_050,
  ))
  assert.ok(parsed.every((message) => message?.type === 'image-chunk'))
  const chunks: Array<string | undefined> = Array(messages.length)
  for (const message of parsed) {
    if (message?.type === 'image-chunk') chunks[message.chunkIndex] = message.data
  }
  assert.equal(assembleTrialBoardImageChunks(chunks), dataUrl)
})

test('rejects cross-room chunks and incomplete images', () => {
  const [message] = chunkTrialBoardImage({
    trialClassId,
    imageId,
    dataUrl: 'data:image/png;base64,AAAA',
    sentAt: 200_000,
  })
  assert.equal(parseTrialBoardImageMessage(
    serializeTrialBoardImageMessage(message),
    `tr_${'z'.repeat(32)}`,
    200_010,
  ), null)
  assert.equal(assembleTrialBoardImageChunks(['data:image/png;base64,', undefined]), null)
})

test('caps pasted image payload and validates clear messages', () => {
  const tooLarge = `data:image/jpeg;base64,${'A'.repeat(TRIAL_BOARD_IMAGE_MAX_DATA_URL_LENGTH)}`
  assert.deepEqual(chunkTrialBoardImage({ trialClassId, imageId, dataUrl: tooLarge }), [])

  const clear = makeTrialBoardImageClearMessage({ trialClassId, imageId, sentAt: 300_000 })
  assert.ok(clear)
  assert.deepEqual(
    parseTrialBoardImageMessage(serializeTrialBoardImageMessage(clear!), trialClassId, 300_010),
    clear,
  )
})

test('orders pasted images and clear tombstones deterministically', () => {
  assert.ok(compareTrialBoardImageOrder(
    { sentAt: 400_001, imageId: 'board-image-new' },
    { sentAt: 400_000, imageId: 'board-image-old' },
  ) > 0)
  assert.ok(compareTrialBoardImageOrder(
    { sentAt: 400_001, imageId: 'board-image-z' },
    { sentAt: 400_001, imageId: 'board-image-a' },
  ) > 0)

  const [message] = chunkTrialBoardImage({
    trialClassId,
    imageId,
    dataUrl: 'data:image/png;base64,AAAA',
    sentAt: 500_000,
  })
  assert.ok(parseTrialBoardImageMessage(
    serializeTrialBoardImageMessage(message),
    trialClassId,
    500_000 + TRIAL_BOARD_IMAGE_MESSAGE_MAX_AGE_MS,
  ))
  assert.equal(parseTrialBoardImageMessage(
    serializeTrialBoardImageMessage(message),
    trialClassId,
    500_001 + TRIAL_BOARD_IMAGE_MESSAGE_MAX_AGE_MS,
  ), null)
})
