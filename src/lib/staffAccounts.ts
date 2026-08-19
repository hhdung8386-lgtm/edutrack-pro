import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'

export type StaffAccount = {
  uid: string
  email: string
  username: string
  role: string
  accessScope: string | null
  disabled: boolean
  protected: boolean
  profileExists: boolean
  duplicateProfileCount: number
  createdAt: string | null
  lastSignInAt: string | null
}

type StaffAccountsResponse = {
  accounts: StaffAccount[]
}

export type DeleteStaffAccountsResult = {
  deletedUids: string[]
  failures: Array<{ uid: string; message: string }>
}

const functions = getFunctions(app, 'asia-southeast1')
const listStaffAccountsCallable = httpsCallable<Record<string, never>, StaffAccountsResponse>(
  functions,
  'listStaffAccounts',
)
const deleteStaffAccountsCallable = httpsCallable<{ uids: string[] }, DeleteStaffAccountsResult>(
  functions,
  'deleteStaffAccounts',
)

export async function loadStaffAccounts(): Promise<StaffAccount[]> {
  const response = await listStaffAccountsCallable({})
  return Array.isArray(response.data.accounts) ? response.data.accounts : []
}

export async function deleteStaffAccounts(uids: string[]): Promise<DeleteStaffAccountsResult> {
  const response = await deleteStaffAccountsCallable({ uids })
  return {
    deletedUids: Array.isArray(response.data.deletedUids) ? response.data.deletedUids : [],
    failures: Array.isArray(response.data.failures) ? response.data.failures : [],
  }
}
