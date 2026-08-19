export const MIN_REGISTRATION_REWARD_VND = 1_000
export const MAX_REGISTRATION_REWARD_VND = 100_000_000

export function normalizeRegistrationRewardVnd(value: string | number) {
  const digits = typeof value === 'number' ? String(value) : value.replace(/[^0-9]/g, '')
  const amount = Number(digits)
  if (!Number.isSafeInteger(amount)) return 0
  return amount
}

export function isValidRegistrationRewardVnd(amount: number) {
  return Number.isSafeInteger(amount)
    && amount >= MIN_REGISTRATION_REWARD_VND
    && amount <= MAX_REGISTRATION_REWARD_VND
}

export function evaluationBasePayrollId(evaluationId: string) {
  return `evaluation-base-${evaluationId}`
}

export function evaluationRegistrationPayrollId(evaluationId: string) {
  return `evaluation-registration-${evaluationId}`
}
