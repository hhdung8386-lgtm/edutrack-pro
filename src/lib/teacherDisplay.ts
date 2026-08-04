/**
 * Quy ước hiển thị TÊN GIA SƯ trong hệ thống.
 *
 * Gia sư được cấp một "nickname" đăng nhập (kiểu "Mirabelle"). Mã tự sinh dạng
 * GVxxxx KHÔNG phải nickname — gặp mã này thì lùi về tên thật để giáo vụ vẫn
 * nhận ra người dạy.
 *
 * Logic này trước đây bị chép lại ở nhiều màn hình (FutureBookingsPage,
 * BookingExperienceTab); gom về đây để mọi trang dùng chung một định nghĩa.
 */

const AUTO_TEACHER_CODE = /^GV[A-Z0-9]{4,}$/i

/** Mã có phải nickname thật (không phải mã tự sinh GVxxxx) hay không. */
export function isReleasedNickname(code?: string | null): boolean {
  const value = (code || '').trim()
  return !!value && !AUTO_TEACHER_CODE.test(value)
}

/**
 * Tên gia sư để hiển thị: ưu tiên nickname, thiếu nickname thì dùng tên thật.
 * Dùng cho màn hình NỘI BỘ (giáo vụ/admin) — nơi được phép thấy tên thật.
 */
export function teacherDisplayName(code?: string | null, fullName?: string | null): string {
  if (isReleasedNickname(code)) return (code || '').trim()
  return (fullName || '').trim() || (code || '').trim()
}
