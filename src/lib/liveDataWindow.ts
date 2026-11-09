/**
 * Cửa sổ dữ liệu "đang sống" cho các màn hình lịch.
 *
 * Mỗi lần mở trang, Firestore tính tiền theo SỐ TÀI LIỆU trả về. Trước đây các trang
 * của gia sư nghe toàn bộ lịch sử (có gia sư > 2.000 ca), nên chi phí tăng theo thời
 * gian dù gần như không ai xem lại ca cũ. Các trang chỉ nghe từ mốc này trở đi; tuần
 * cũ hơn chỉ được tải khi người dùng thật sự lùi về tuần đó.
 */

export const LIVE_HISTORY_DAYS = 14

/** Cộng/trừ ngày trên chuỗi YYYY-MM-DD (lịch Gregorian, không phụ thuộc múi giờ máy). */
export function shiftDateISO(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split('-').map(Number)
  const value = new Date(Date.UTC(year, (month || 1) - 1, day || 1))
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function firstDayOfMonthISO(dateISO: string): string {
  return `${dateISO.slice(0, 7)}-01`
}

/**
 * Mốc đầu của cửa sổ: sớm hơn giữa (hôm nay − historyDays) và tuần đang xem.
 * Lùi về tuần cũ thì mốc được làm tròn về đầu tháng (trừ thêm 2 ngày cho chênh múi
 * giờ gia sư), nên lùi từng tuần trong cùng tháng không phải tải lại.
 */
export function liveWindowStartISO(
  todayISO: string,
  viewedFromISO?: string,
  historyDays = LIVE_HISTORY_DAYS,
): string {
  const recent = shiftDateISO(todayISO, -historyDays)
  if (!viewedFromISO) return recent
  const viewed = shiftDateISO(viewedFromISO, -2)
  if (viewed >= recent) return recent
  return firstDayOfMonthISO(viewed)
}

/** Gộp nhiều danh sách theo id; danh sách đứng sau ghi đè danh sách đứng trước. */
export function mergeById<T extends { id: string }>(...lists: T[][]): T[] {
  const byId = new Map<string, T>()
  lists.forEach((list) => list.forEach((item) => byId.set(item.id, item)))
  return Array.from(byId.values())
}
