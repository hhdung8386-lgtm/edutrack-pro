import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'

export type BookingLedgerRepairInput = {
  studentId: string
  studentCode: string
}

export type BookingLedgerRepairResult = {
  repairedCount: number
  bookingIds: string[]
  heldPointsBefore: number
  heldPointsAfter: number
}

const functions = getFunctions(app, 'asia-southeast1')
const reconcileCallable = httpsCallable<BookingLedgerRepairInput, BookingLedgerRepairResult>(
  functions,
  'reconcileApprovedBookingStatuses',
)

export async function reconcileApprovedBookingStatuses(
  input: BookingLedgerRepairInput,
): Promise<BookingLedgerRepairResult> {
  const response = await reconcileCallable(input)
  return {
    repairedCount: Number(response.data.repairedCount) || 0,
    bookingIds: Array.isArray(response.data.bookingIds)
      ? response.data.bookingIds.filter((id): id is string => typeof id === 'string')
      : [],
    heldPointsBefore: Number(response.data.heldPointsBefore) || 0,
    heldPointsAfter: Number(response.data.heldPointsAfter) || 0,
  }
}
