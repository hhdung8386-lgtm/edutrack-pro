// Phần thuần (không Firebase) của form khách để lại thông tin trên trang public.
// Giới hạn độ dài ở đây phải khớp rule `customerLeads` trong firestore.rules.

export type CustomerLeadStatus = 'new' | 'contacted' | 'converted' | 'spam'

export const CUSTOMER_LEAD_STATUSES: CustomerLeadStatus[] = ['new', 'contacted', 'converted', 'spam']

/** Mỗi trang có form trên web public; admin lọc theo đúng trang khách đã điền. */
export const CUSTOMER_LEAD_SOURCES = {
  'hoc-thu-mien-phi': { label: 'Học thử miễn phí', path: '/hoc-thu-mien-phi' },
  'lien-he': { label: 'Liên hệ', path: '/lien-he' },
} as const

export type CustomerLeadSource = keyof typeof CUSTOMER_LEAD_SOURCES

export const CUSTOMER_LEAD_LIMITS = {
  name: 120,
  ageGroup: 60,
  subject: 120,
  message: 2000,
  sourcePath: 200,
  pageUrl: 500,
  referrer: 500,
  note: 2000,
} as const

const PHONE_PATTERN = /^(?:0|\+?84)?([35789]\d{8})$/

/** Chuẩn hoá SĐT Việt Nam về dạng 0xxxxxxxxx; trả null nếu không hợp lệ. */
export function normalizeVietnamPhone(raw: string) {
  const match = raw.replace(/[\s.()-]/g, '').match(PHONE_PATTERN)
  return match ? `0${match[1]}` : null
}

export interface CustomerLeadInput {
  source: CustomerLeadSource
  name: string
  phone: string
  ageGroup?: string
  subject?: string
  message?: string
  sourcePath?: string
  pageUrl?: string
  referrer?: string
}

function clip(value: string | undefined, max: number) {
  return (value ?? '').trim().slice(0, max)
}

/** Dựng payload đúng shape rule cho phép; trường rỗng bị bỏ đi. Trả null nếu thiếu tên/SĐT hợp lệ. */
export function buildCustomerLeadPayload(input: CustomerLeadInput) {
  const name = clip(input.name, CUSTOMER_LEAD_LIMITS.name)
  const phone = normalizeVietnamPhone(input.phone)
  if (!name || !phone || !(input.source in CUSTOMER_LEAD_SOURCES)) return null

  const payload: Record<string, string> = {
    source: input.source,
    sourceLabel: CUSTOMER_LEAD_SOURCES[input.source].label,
    sourcePath: clip(input.sourcePath, CUSTOMER_LEAD_LIMITS.sourcePath) || CUSTOMER_LEAD_SOURCES[input.source].path,
    name,
    phone,
    status: 'new',
  }
  const optional: [string, string | undefined, number][] = [
    ['ageGroup', input.ageGroup, CUSTOMER_LEAD_LIMITS.ageGroup],
    ['subject', input.subject, CUSTOMER_LEAD_LIMITS.subject],
    ['message', input.message, CUSTOMER_LEAD_LIMITS.message],
    ['pageUrl', input.pageUrl, CUSTOMER_LEAD_LIMITS.pageUrl],
    ['referrer', input.referrer, CUSTOMER_LEAD_LIMITS.referrer],
  ]
  for (const [key, value, max] of optional) {
    const clipped = clip(value, max)
    if (clipped) payload[key] = clipped
  }
  return payload
}
