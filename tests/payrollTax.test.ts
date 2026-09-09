import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculatePayrollTax,
  normalizePayrollTaxPolicy,
  planPayrollTaxSettlement,
  storedPayrollSettlementAmounts,
  summarizePayrollTaxCurrency,
  type PayrollTaxPolicy,
} from '../src/lib/payrollTax.ts'

const enabledVndPolicy: PayrollTaxPolicy = {
  enabled: true,
  thresholdAmount: 5_000_000,
  ratePercent: 10,
  currency: 'VND',
}

test('legacy payment settings remain disabled until an admin explicitly enables withholding', () => {
  assert.deepEqual(normalizePayrollTaxPolicy(null), {
    enabled: false,
    thresholdAmount: 5_000_000,
    ratePercent: 10,
    currency: 'VND',
    effectiveFromMonth: undefined,
    updatedAt: undefined,
    updatedBy: undefined,
  })
})

test('tax uses the configured full monthly gross only when it strictly exceeds the threshold', () => {
  assert.equal(calculatePayrollTax(5_000_000, 'VND', enabledVndPolicy, '2026-09').tax, 0)
  assert.deepEqual(calculatePayrollTax(5_000_001, 'VND', enabledVndPolicy, '2026-09'), {
    gross: 5_000_001,
    tax: 500_000,
    net: 4_500_001,
    applies: true,
    policy: enabledVndPolicy,
  })
})

test('a later payment settles only the tax not already snapshotted on a paid line', () => {
  const plan = planPayrollTaxSettlement([
    { id: 'paid', amount: 4_000_000, currency: 'VND', paid: true, taxWithheldAmount: 400_000, netPaidAmount: 3_600_000 },
    { id: 'unpaid', amount: 2_000_000, currency: 'VND', paid: false },
  ], 'VND', enabledVndPolicy, '2026-09')

  assert.equal(plan.taxableMonthGrossAmount, 6_000_000)
  assert.equal(plan.taxableMonthTaxAmount, 600_000)
  assert.equal(plan.previouslyWithheldAmount, 400_000)
  assert.equal(plan.taxAmount, 200_000)
  assert.deepEqual(plan.lineSettlements, [{ payrollId: 'unpaid', taxWithheldAmount: 200_000, netPaidAmount: 1_800_000 }])
})

test('a paid row moved after settlement does not become prior withholding for another month', () => {
  const plan = planPayrollTaxSettlement([
    {
      id: 'moved-paid',
      amount: 4_000_000,
      currency: 'VND',
      paid: true,
      taxWithheldAmount: 400_000,
      netPaidAmount: 3_600_000,
      taxSettlement: { month: '2026-08' },
    },
    { id: 'unpaid', amount: 2_000_000, currency: 'VND', paid: false },
  ], 'VND', enabledVndPolicy, '2026-09')

  assert.equal(plan.taxableMonthGrossAmount, 2_000_000)
  assert.equal(plan.previouslyWithheldAmount, 0)
  assert.deepEqual(plan.lineSettlements, [{ payrollId: 'unpaid', taxWithheldAmount: 0, netPaidAmount: 2_000_000 }])
  assert.equal(summarizePayrollTaxCurrency([
    {
      id: 'moved-paid', amount: 4_000_000, currency: 'VND', paid: true,
      taxWithheldAmount: 400_000, netPaidAmount: 3_600_000, taxSettlement: { month: '2026-08' },
    },
  ], 'VND', enabledVndPolicy, '2026-09').hasPaidSettlementMonthMismatch, true)
})

test('legacy paid rows are never guessed or retroactively rewritten', () => {
  const plan = planPayrollTaxSettlement([
    { id: 'legacy-paid', amount: 4_000_000, currency: 'VND', paid: true },
    { id: 'unpaid', amount: 2_000_000, currency: 'VND', paid: false },
  ], 'VND', enabledVndPolicy, '2026-09')

  assert.equal(plan.previouslyWithheldAmount, 0)
  assert.equal(plan.taxAmount, 600_000)
  assert.deepEqual(storedPayrollSettlementAmounts({ amount: 4_000_000 }), {
    gross: 4_000_000,
    tax: 0,
    net: 4_000_000,
  })
})

test('tax allocation never makes a newly paid line negative when legacy withholding is missing', () => {
  const plan = planPayrollTaxSettlement([
    { id: 'legacy-paid', amount: 4_000_000, currency: 'VND', paid: true },
    { id: 'unpaid', amount: 2_000_000, currency: 'VND', paid: false },
  ], 'VND', {
    enabled: true,
    thresholdAmount: 5_000_000,
    ratePercent: 100,
    currency: 'VND',
  }, '2026-09')

  assert.deepEqual(plan.lineSettlements, [{
    payrollId: 'unpaid',
    taxWithheldAmount: 2_000_000,
    netPaidAmount: 0,
  }])
  assert.equal(plan.unallocatedTaxAmount, 4_000_000)
})

test('negative adjustments reduce monthly gross but receive no per-line tax withholding', () => {
  const plan = planPayrollTaxSettlement([
    { id: 'lesson', amount: 7_000_000, currency: 'VND', paid: false },
    { id: 'deduction', amount: -1_000_000, currency: 'VND', paid: false },
  ], 'VND', enabledVndPolicy, '2026-09')

  assert.equal(plan.taxableMonthGrossAmount, 6_000_000)
  assert.equal(plan.taxAmount, 600_000)
  assert.deepEqual(plan.lineSettlements, [
    { payrollId: 'deduction', taxWithheldAmount: 0, netPaidAmount: -1_000_000 },
    { payrollId: 'lesson', taxWithheldAmount: 600_000, netPaidAmount: 6_400_000 },
  ])
})

test('rounding allocation is deterministic by payroll id and preserves the settlement invariant', () => {
  const policy: PayrollTaxPolicy = { enabled: true, thresholdAmount: 1, ratePercent: 10, currency: 'VND' }
  const plan = planPayrollTaxSettlement([
    { id: 'b', amount: 3, currency: 'VND', paid: false },
    { id: 'a', amount: 3, currency: 'VND', paid: false },
  ], 'VND', policy, '2026-09')

  assert.equal(plan.taxAmount, 1)
  assert.deepEqual(plan.lineSettlements, [
    { payrollId: 'a', taxWithheldAmount: 1, netPaidAmount: 2 },
    { payrollId: 'b', taxWithheldAmount: 0, netPaidAmount: 3 },
  ])
  assert.equal(plan.lineSettlements.reduce((sum, line) => sum + line.taxWithheldAmount, 0), plan.taxAmount)
})

test('mixed settled and pending rows use snapshots for paid history and the live policy only for unpaid rows', () => {
  const summary = summarizePayrollTaxCurrency([
    { id: 'paid', amount: 4_000_000, currency: 'VND', paid: true, taxWithheldAmount: 400_000, netPaidAmount: 3_600_000 },
    { id: 'unpaid', amount: 2_000_000, currency: 'VND', paid: false },
  ], 'VND', enabledVndPolicy, '2026-09')

  assert.equal(summary.source, 'mixed')
  assert.equal(summary.grossAmount, 6_000_000)
  assert.equal(summary.taxAmount, 600_000)
  assert.equal(summary.netAmount, 5_400_000)
})

test('over-withheld tax is surfaced for manual accounting rather than auto-refunded', () => {
  const plan = planPayrollTaxSettlement([
    { id: 'paid', amount: 4_000_000, currency: 'VND', paid: true, taxWithheldAmount: 400_000, netPaidAmount: 3_600_000 },
    { id: 'deduction', amount: -1_000_000, currency: 'VND', paid: false },
  ], 'VND', enabledVndPolicy, '2026-09')

  assert.equal(plan.taxableMonthTaxAmount, 0)
  assert.equal(plan.taxAmount, 0)
  assert.equal(plan.overwithheldTaxAmount, 400_000)
})
