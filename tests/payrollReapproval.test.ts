import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPayrollApprovalFields } from '../src/lib/payrollReapproval.ts'

test('normal approval creates an unpaid payroll row', () => {
  assert.deepEqual(buildPayrollApprovalFields({}, 100, 'VND'), {
    amount: 100,
    currency: 'VND',
    paid: false,
  })
})

test('re-approval preserves an amount that was already paid', () => {
  const paidAt = { seconds: 123 }
  assert.deepEqual(buildPayrollApprovalFields({
    payrollPaidBeforeReopen: true,
    payrollPaidAmount: 80,
    payrollPaidCurrency: 'USD',
    payrollPaidAt: paidAt,
  }, 100, 'VND'), {
    amount: 80,
    currency: 'USD',
    paid: true,
    paidAt,
    paymentPreservedAfterReview: true,
  })
})
