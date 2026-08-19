export const PROTECTED_ACCOUNT_EMAILS = new Set([
  'admin@edutrackpro.app',
  'admin@123english.edu.vn',
])

export function normalizedAccountEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function accountDeletionBlockReason(input: {
  actorUid: string
  targetUid: string
  role: unknown
  authEmail: unknown
  profileEmail: unknown
}): 'self' | 'admin_role' | 'system_email' | null {
  if (input.targetUid === input.actorUid) return 'self'
  if (input.role === 'admin') return 'admin_role'
  if (
    PROTECTED_ACCOUNT_EMAILS.has(normalizedAccountEmail(input.authEmail))
    || PROTECTED_ACCOUNT_EMAILS.has(normalizedAccountEmail(input.profileEmail))
  ) return 'system_email'
  return null
}
