const RETRYABLE_FIRESTORE_CODES = new Set([
  'aborted',
  'failed-precondition',
  'deadline-exceeded',
  'unavailable',
])

function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''
}

/**
 * Firestore transactions can fail transiently while the browser is changing
 * network or another schedule transaction is committing. Retrying only these
 * server-labelled failures is safe because the callers re-read their booking
 * guards inside the transaction before creating/linking a lesson.
 */
export async function withTransactionRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts || 3))
  const delayMs = Math.max(0, Math.floor(options.delayMs ?? 350))

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (attempt === attempts - 1 || !RETRYABLE_FIRESTORE_CODES.has(errorCode(error))) throw error
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs * (attempt + 1)))
    }
  }

  throw new Error('TRANSACTION_RETRY_EXHAUSTED')
}
