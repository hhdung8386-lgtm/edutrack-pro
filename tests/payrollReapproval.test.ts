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

test('re-approval preserves the immutable tax snapshot of an already paid lesson', () => {
  const taxSettlement = { id: 'settlement-1', version: 'monthly-gross-v1' }
  assert.deepEqual(buildPayrollApprovalFields({
    payrollPaidBeforeReopen: true,
    payrollPaidAmount: 80,
    payrollPaidCurrency: 'VND',
    payrollPaidTaxWithheldAmount: 0,
    payrollPaidNetAmount: 80,
    payrollPaidTaxSettlement: taxSettlement,
  }, 100, 'VND'), {
    amount: 80,
    currency: 'VND',
    paid: true,
    paymentPreservedAfterReview: true,
    taxWithheldAmount: 0,
    netPaidAmount: 80,
    taxSettlement,
  })
})
