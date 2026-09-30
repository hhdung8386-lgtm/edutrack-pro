/** Keep the DOM bounded while filters, totals and bulk actions use the full list. */
export const BOOKING_PAGE_SIZE = 50

export function bookingPage<T>(items: readonly T[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / BOOKING_PAGE_SIZE))
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1))
  const offset = (page - 1) * BOOKING_PAGE_SIZE
  return {
    page,
    pageCount,
    start: items.length ? offset + 1 : 0,
    end: Math.min(offset + BOOKING_PAGE_SIZE, items.length),
    items: items.slice(offset, offset + BOOKING_PAGE_SIZE),
  }
}
