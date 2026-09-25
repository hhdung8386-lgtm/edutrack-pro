// Chọn phòng học cho nút "Vào lớp" ở trang admin "Lịch học đã đặt".
// Cùng quy tắc với trang Lịch dạy của gia sư: học viên bật phòng 123English (pilot)
// thì vào /lop-hoc/<bookingId> trong khung giờ mở phòng, còn lại dùng link lớp riêng.

export interface AdminClassroomBooking {
  id: string
  status?: string
  lessonId?: string
  groupClassId?: string
  classroomURL?: string
}

export interface AdminClassroomStudent {
  classroomURL?: string
  onlineClassroomPilotEnabled?: boolean
}

export type AdminClassroomLink =
  | { kind: 'loading' }
  | { kind: 'pilot'; href: string }
  | { kind: 'pilot-closed' }
  | { kind: 'external'; href: string }
  | { kind: 'none' }

/**
 * Chỉ nhận link http(s); link thiếu giao thức (vd "zoom.us/j/1") được thêm https://.
 * Hồ sơ cũ đôi khi ghi kèm chữ ("Link học cố định: https://meet...") thì lấy link đầu tiên.
 */
export function normalizeClassroomUrl(raw: string | undefined): string {
  let value = (raw || '').trim()
  if (/\s/.test(value) || !/^[a-z0-9]/i.test(value)) {
    value = /https?:\/\/[^\s<>"']+/i.exec(value)?.[0] || ''
  }
  if (!value) return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value.replace(/^\/+/, '')}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    if (!url.hostname.includes('.')) return ''
    return url.toString()
  } catch {
    return ''
  }
}

export function isPilotClassroomBooking(
  booking: AdminClassroomBooking,
  student: AdminClassroomStudent | undefined,
): boolean {
  return Boolean(
    student?.onlineClassroomPilotEnabled
    && booking.status === 'confirmed'
    && !booking.lessonId
    && !booking.groupClassId,
  )
}

export function resolveAdminClassroomLink(input: {
  booking: AdminClassroomBooking
  student: AdminClassroomStudent | undefined
  studentsLoaded: boolean
  pilotWindowOpen: boolean
  pilotRoute: string
}): AdminClassroomLink {
  const { booking, student, studentsLoaded } = input
  // Hồ sơ học viên chưa tải xong: chưa biết có phải phòng 123English hay không,
  // không đưa tạm link cũ để tránh vào nhầm phòng.
  if (!studentsLoaded) return { kind: 'loading' }
  if (isPilotClassroomBooking(booking, student)) {
    return input.pilotWindowOpen ? { kind: 'pilot', href: input.pilotRoute } : { kind: 'pilot-closed' }
  }
  const href = normalizeClassroomUrl(student?.classroomURL) || normalizeClassroomUrl(booking.classroomURL)
  return href ? { kind: 'external', href } : { kind: 'none' }
}
