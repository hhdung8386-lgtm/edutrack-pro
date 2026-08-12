export interface TeacherLoginIdentity {
  id: string
  email?: unknown
  username?: unknown
}

export type TeacherLoginIdentityFailure =
  | 'canonical_missing'
  | 'duplicate_current_identity'
  | 'ambiguous_identity'

export type TeacherLoginIdentitySelection =
  | { identity: TeacherLoginIdentity | null; error: null }
  | { identity: null; error: TeacherLoginIdentityFailure }

function normalizeIdentityValue(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/**
 * Chọn tài khoản đăng nhập mà không tự suy đoán UID trong dữ liệu cũ.
 * UID chuẩn trên hồ sơ luôn được ưu tiên. Khi chưa backfill UID chuẩn, chỉ
 * chấp nhận một danh tính khớp duy nhất với nickname/email hiện tại.
 */
export function selectTeacherLoginIdentity(
  identities: TeacherLoginIdentity[],
  canonicalLoginUid: string,
  teacherCode: string,
  fallbackEmail: string,
): TeacherLoginIdentitySelection {
  if (canonicalLoginUid) {
    const canonicalIdentity = identities.find(identity => identity.id === canonicalLoginUid)
    return canonicalIdentity
      ? { identity: canonicalIdentity, error: null }
      : { identity: null, error: 'canonical_missing' }
  }

  const normalizedCode = normalizeIdentityValue(teacherCode)
  const normalizedEmail = normalizeIdentityValue(fallbackEmail)
  const matchingIdentities = identities.filter(identity =>
    normalizeIdentityValue(identity.email) === normalizedEmail
    || normalizeIdentityValue(identity.username) === normalizedCode,
  )
  const exactEmailIdentities = matchingIdentities.filter(identity =>
    normalizeIdentityValue(identity.email) === normalizedEmail,
  )

  if (exactEmailIdentities.length === 1) {
    return { identity: exactEmailIdentities[0], error: null }
  }
  if (exactEmailIdentities.length > 1 || matchingIdentities.length > 1) {
    return { identity: null, error: 'duplicate_current_identity' }
  }
  if (matchingIdentities.length === 1) {
    return { identity: matchingIdentities[0], error: null }
  }
  if (identities.length === 1) {
    return { identity: identities[0], error: null }
  }
  if (identities.length > 1) {
    return { identity: null, error: 'ambiguous_identity' }
  }
  return { identity: null, error: null }
}
