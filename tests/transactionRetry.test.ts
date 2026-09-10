import assert from 'node:assert/strict'
import test from 'node:test'
import { withTransactionRetry } from '../src/lib/transactionRetry.ts'

test('retries transient Firestore failures and returns the successful transaction result', async () => {
  let attempts = 0
  const result = await withTransactionRetry(async () => {
    attempts += 1
    if (attempts < 3) throw Object.assign(new Error('temporary'), { code: 'unavailable' })
    return 'saved'
  }, { delayMs: 0 })

  assert.equal(result, 'saved')
  assert.equal(attempts, 3)
})

test('does not retry permission failures', async () => {
  let attempts = 0
  await assert.rejects(
    () => withTransactionRetry(async () => {
      attempts += 1
      throw Object.assign(new Error('forbidden'), { code: 'permission-denied' })
    }, { delayMs: 0 }),
    /forbidden/,
  )
  assert.equal(attempts, 1)
})
