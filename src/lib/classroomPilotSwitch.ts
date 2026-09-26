// Công tắc chung cho phòng học trực tuyến 123English (pilot, /lop-hoc/<bookingId>).
// 26/09/2026 trung tâm quyết định bỏ pilot: mọi nút "Vào lớp" và tin nhắc lịch chỉ dùng
// link lớp trong hồ sơ học viên (Google Meet...). Cờ onlineClassroomPilotEnabled trong
// dữ liệu được giữ nguyên, không xoá; muốn mở lại pilot chỉ cần đổi hằng số này thành true.
export const ONLINE_CLASSROOM_PILOT_ACTIVE: boolean = false

/** Học viên có thật sự đang dùng phòng pilot không (luôn false khi pilot đã tắt). */
export function classroomPilotEnabledFor(flag: boolean | undefined): boolean {
  return ONLINE_CLASSROOM_PILOT_ACTIVE && Boolean(flag)
}
