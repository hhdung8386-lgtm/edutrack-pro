import type { Timestamp } from 'firebase/firestore'
import {
  buildCustomerLeadPayload,
  type CustomerLeadInput,
  type CustomerLeadSource,
  type CustomerLeadStatus,
} from './customerLeadForm'

export * from './customerLeadForm'

export const CUSTOMER_LEADS_COLLECTION = 'customerLeads'

export interface CustomerLead {
  id: string
  source: CustomerLeadSource
  sourceLabel: string
  sourcePath: string
  name: string
  phone: string
  ageGroup?: string
  subject?: string
  message?: string
  pageUrl?: string
  referrer?: string
  status: CustomerLeadStatus
  note?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  handledBy?: string
  handledByName?: string
}

/**
 * Lưu form khách vào Firestore để admin xem ở /admin/customer-leads.
 * Firebase được import động để trang landing không phải tải SDK trước khi khách bấm gửi.
 * Không bao giờ throw: form vẫn chuyển khách sang Zalo dù lưu thất bại.
 */
export async function submitCustomerLead(input: Omit<CustomerLeadInput, 'sourcePath' | 'pageUrl' | 'referrer'>) {
  const payload = buildCustomerLeadPayload({
    ...input,
    sourcePath: window.location.pathname,
    pageUrl: window.location.href,
    referrer: document.referrer,
  })
  if (!payload) return false
  try {
    const [{ db }, { addDoc, collection, serverTimestamp }] = await Promise.all([
      import('./firebase'),
      import('firebase/firestore'),
    ])
    await addDoc(collection(db, CUSTOMER_LEADS_COLLECTION), { ...payload, createdAt: serverTimestamp() })
    return true
  } catch (error) {
    console.error('Không lưu được form khách hàng', error)
    return false
  }
}
