import type { PaymentSettings } from '@/types'

export const DEFAULT_PAYROLL_TAX_THRESHOLD = 5_000_000
export const DEFAULT_PAYROLL_TAX_RATE_PERCENT = 10
export const DEFAULT_PAYROLL_TAX_FIXED_AMOUNT = 0

export type PayrollTaxMode = 'percent' | 'fixed'

export interface PayrollTaxPolicy {
  enabled: boolean
  thresholdAmount: number
  ratePercent: number
  currency: string
  mode?: PayrollTaxMode
  fixedAmount?: number
  effectiveFromMonth?: string
  updatedAt?: unknown
  updatedBy?: string
}

export interface PayrollTaxSummary {
  gross: number
  tax: number
  net: number
  applies: boolean
  policy: PayrollTaxPolicy
}

/**
 * The small common shape used by payroll screens and the settlement writer.
 * `amount` is always the gross line amount; a negative amount is a manual
 * deduction/adjustment and deliberately never receives a tax allocation.
 */
export interface PayrollTaxLedgerLine {
  id: string
  amount: number
  currency?: string
  paid?: boolean
  taxWithheldAmount?: number
  netPaidAmount?: number
  taxSettlement?: { month?: string }
}

export interface PayrollTaxLineSettlement {
  payrollId: string
  taxWithheldAmount: number
  netPaidAmount: number
}

export interface PayrollTaxSettlementPlan {
  currency: string
  grossAmount: number
  taxAmount: number
  netAmount: number
  taxableMonthGrossAmount: number
  taxableMonthTaxAmount: number
  previouslyWithheldAmount: number
  /**
   * Amount that cannot safely be settled automatically. This is non-zero only
   * when there is no safely payable positive unpaid line (including a legacy
   * payment that did not record prior withholding).
   */
  unallocatedTaxAmount: number
  /** Tax already withheld above the current month policy. Never auto-refunded. */
  overwithheldTaxAmount: number
  applies: boolean
  policy: PayrollTaxPolicy
  lineSettlements: PayrollTaxLineSettlement[]
}

export interface PayrollTaxCurrencySummary {
  currency: string
  grossAmount: number
  taxAmount: number
  netAmount: number
  paidGrossAmount: number
  paidTaxAmount: number
  paidNetAmount: number
  unpaidGrossAmount: number
  unpaidTaxAmount: number
  unpaidNetAmount: number
  hasPaidLines: boolean
  hasUnpaidLines: boolean
  hasLegacyPaidLines: boolean
  /** A paid row was moved to a different payroll month after it was settled. */
  hasPaidSettlementMonthMismatch: boolean
  source: 'stored' | 'live' | 'mixed'
  unallocatedTaxAmount: number
  overwithheldTaxAmount: number
  policy: PayrollTaxPolicy
}

export function normalizePayrollTaxPolicy(settings?: Partial<PaymentSettings> | null): PayrollTaxPolicy {
  const threshold = Number(settings?.payrollTaxThresholdAmount)
  const rate = Number(settings?.payrollTaxRatePercent)
  const fixedAmount = Number(settings?.payrollTaxFixedAmount)
  return {
    enabled: settings?.payrollTaxEnabled === true,
    thresholdAmount: Number.isFinite(threshold) && threshold >= 0
      ? Math.round(threshold)
      : DEFAULT_PAYROLL_TAX_THRESHOLD,
    ratePercent: Number.isFinite(rate) && rate >= 0 && rate <= 100
      ? rate
      : DEFAULT_PAYROLL_TAX_RATE_PERCENT,
    currency: String(settings?.payrollTaxCurrency || 'VND').toUpperCase(),
    mode: settings?.payrollTaxMode === 'fixed' ? 'fixed' : 'percent',
    fixedAmount: Number.isFinite(fixedAmount) && fixedAmount >= 0
      ? Math.round(fixedAmount)
      : DEFAULT_PAYROLL_TAX_FIXED_AMOUNT,
    effectiveFromMonth: settings?.payrollTaxEffectiveFromMonth || undefined,
    updatedAt: settings?.payrollTaxUpdatedAt,
    updatedBy: settings?.payrollTaxUpdatedBy,
  }
}

export function payrollTaxApplies(gross: number, currency: string, policy: PayrollTaxPolicy, month?: string): boolean {
  const isEffective = !policy.effectiveFromMonth || !month || month >= policy.effectiveFromMonth
  return policy.enabled
    && isEffective
    && String(currency || '').toUpperCase() === policy.currency
    && gross > policy.thresholdAmount
    && (policy.mode === 'fixed' ? (policy.fixedAmount || 0) > 0 : policy.ratePercent > 0)
}

export function calculatePayrollTax(
  grossAmount: number,
  currency: string,
  policy: PayrollTaxPolicy,
  month?: string,
): PayrollTaxSummary {
  const gross = Number.isFinite(Number(grossAmount)) ? Math.max(0, Number(grossAmount)) : 0
  const applies = payrollTaxApplies(gross, currency, policy, month)
  const tax = applies
    ? policy.mode === 'fixed'
      ? Math.min(gross, Math.max(0, Math.round(policy.fixedAmount || 0)))
      : Math.round(gross * policy.ratePercent / 100)
    : 0
  return {
    gross,
    tax,
    net: Math.max(0, gross - tax),
    applies,
    policy,
  }
}

function finiteMoney(value: unknown): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function settlementMonthOf(line: PayrollTaxLedgerLine): string | undefined {
  const month = line.taxSettlement?.month
  return typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) ? month : undefined
}

/**
 * Paid rows must not be recalculated from today's policy. Old records without
 * a settlement snapshot intentionally remain gross=net and tax=0: we cannot
 * infer a bank transfer that was never recorded.
 */
export function storedPayrollSettlementAmounts(line: Pick<PayrollTaxLedgerLine, 'amount' | 'taxWithheldAmount' | 'netPaidAmount'>) {
  const gross = finiteMoney(line.amount)
  const tax = Number.isFinite(Number(line.taxWithheldAmount))
    ? finiteMoney(line.taxWithheldAmount)
    : 0
  const net = Number.isFinite(Number(line.netPaidAmount))
    ? finiteMoney(line.netPaidAmount)
    : gross - tax
  return { gross, tax, net }
}

/**
 * Build the tax settlement for all currently-unpaid rows of one
 * teacher/month/currency. The tax threshold is evaluated against the complete
 * monthly gross, while rows already paid contribute only their persisted
 * withholding. This prevents a later policy edit from rewriting paid history.
 */
export function planPayrollTaxSettlement(
  lines: PayrollTaxLedgerLine[],
  currency: string,
  policy: PayrollTaxPolicy,
  month?: string,
): PayrollTaxSettlementPlan {
  const normalizedCurrency = String(currency || 'VND').toUpperCase()
  const scopedLines = lines.filter((line) => String(line.currency || 'VND').toUpperCase() === normalizedCurrency)
  // A settled row can later be moved to another reporting month by a legacy
  // correction flow. Its historic tax must remain attached to its snapshot
  // month, never become prior withholding for a new month.
  const paidLines = scopedLines.filter((line) => (
    line.paid === true && (!month || !settlementMonthOf(line) || settlementMonthOf(line) === month)
  ))
  const unpaidLines = scopedLines.filter((line) => line.paid !== true)
  const grossAmount = unpaidLines.reduce((sum, line) => sum + finiteMoney(line.amount), 0)
  const taxableMonthGrossAmount = [...paidLines, ...unpaidLines]
    .reduce((sum, line) => sum + finiteMoney(line.amount), 0)
  const policySummary = calculatePayrollTax(taxableMonthGrossAmount, normalizedCurrency, policy, month)
  const previouslyWithheldAmount = paidLines.reduce(
    (sum, line) => sum + storedPayrollSettlementAmounts(line).tax,
    0,
  )
  const remainingTaxBeforeAllocation = policySummary.tax - previouslyWithheldAmount
  // Tax is stored in whole currency units. Use an integer per-line capacity
  // during allocation so rounding can never withhold more than a line's gross
  // amount (and therefore can never create a negative Net payment).
  const positiveUnpaidLines = unpaidLines
    .map((line) => ({
      line,
      taxCapacity: Math.max(0, Math.floor(finiteMoney(line.amount))),
    }))
    .filter((entry) => entry.taxCapacity > 0)
    .sort((left, right) => left.line.id.localeCompare(right.line.id))
  const positiveUnpaidCapacity = positiveUnpaidLines.reduce((sum, entry) => sum + entry.taxCapacity, 0)

  // Do not silently issue a tax refund after a payroll was settled. A negative
  // remaining amount needs an explicit accounting adjustment, not an automatic
  // write to an unrelated line. Likewise, a negative adjustment receives zero
  // withholding by design.
  const taxAvailableForAllocation = Math.max(0, Math.round(remainingTaxBeforeAllocation))
  const taxToAllocate = Math.min(taxAvailableForAllocation, positiveUnpaidCapacity)
  const allocations = new Map<string, number>()

  if (taxToAllocate > 0 && positiveUnpaidCapacity > 0) {
    const shares = positiveUnpaidLines.map((line) => {
      const raw = taxToAllocate * line.taxCapacity / positiveUnpaidCapacity
      const floor = Math.floor(raw)
      return {
        id: line.line.id,
        floor,
        fraction: raw - floor,
      }
    })
    let allocated = shares.reduce((sum, share) => sum + share.floor, 0)
    shares.forEach((share) => allocations.set(share.id, share.floor))
    const remainderOrder = [...shares].sort((left, right) => (
      right.fraction - left.fraction || left.id.localeCompare(right.id)
    ))
    for (let index = 0; allocated < taxToAllocate; index += 1, allocated += 1) {
      const target = remainderOrder[index % remainderOrder.length]
      allocations.set(target.id, (allocations.get(target.id) || 0) + 1)
    }
  }

  const lineSettlements = unpaidLines
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((line) => {
      const taxWithheldAmount = allocations.get(line.id) || 0
      const gross = finiteMoney(line.amount)
      return {
        payrollId: line.id,
        taxWithheldAmount,
        netPaidAmount: gross - taxWithheldAmount,
      }
    })
  const taxAmount = lineSettlements.reduce((sum, line) => sum + line.taxWithheldAmount, 0)

  return {
    currency: normalizedCurrency,
    grossAmount,
    taxAmount,
    netAmount: grossAmount - taxAmount,
    taxableMonthGrossAmount: policySummary.gross,
    taxableMonthTaxAmount: policySummary.tax,
    previouslyWithheldAmount,
    unallocatedTaxAmount: Math.max(0, taxAvailableForAllocation - taxAmount),
    overwithheldTaxAmount: Math.max(0, Math.round(previouslyWithheldAmount - policySummary.tax)),
    applies: policySummary.applies,
    policy,
    lineSettlements,
  }
}

/**
 * Read view for a complete teacher/month/currency ledger. Settled rows use
 * their immutable values; only un-settled rows receive the live policy plan.
 */
export function summarizePayrollTaxCurrency(
  lines: PayrollTaxLedgerLine[],
  currency: string,
  policy: PayrollTaxPolicy,
  month?: string,
): PayrollTaxCurrencySummary {
  const normalizedCurrency = String(currency || 'VND').toUpperCase()
  const scopedLines = lines.filter((line) => String(line.currency || 'VND').toUpperCase() === normalizedCurrency)
  const paidLines = scopedLines.filter((line) => line.paid === true)
  const unpaidLines = scopedLines.filter((line) => line.paid !== true)
  const hasPaidSettlementMonthMismatch = paidLines.some((line) => (
    Boolean(month) && Boolean(settlementMonthOf(line)) && settlementMonthOf(line) !== month
  ))
  const paidAmounts = paidLines.map(storedPayrollSettlementAmounts)
  const settlement = planPayrollTaxSettlement(scopedLines, normalizedCurrency, policy, month)
  const paidGrossAmount = paidAmounts.reduce((sum, amount) => sum + amount.gross, 0)
  const paidTaxAmount = paidAmounts.reduce((sum, amount) => sum + amount.tax, 0)
  const paidNetAmount = paidAmounts.reduce((sum, amount) => sum + amount.net, 0)
  const source: PayrollTaxCurrencySummary['source'] = paidLines.length > 0 && unpaidLines.length > 0
    ? 'mixed'
    : paidLines.length > 0
      ? 'stored'
      : 'live'

  return {
    currency: normalizedCurrency,
    grossAmount: paidGrossAmount + settlement.grossAmount,
    taxAmount: paidTaxAmount + settlement.taxAmount,
    netAmount: paidNetAmount + settlement.netAmount,
    paidGrossAmount,
    paidTaxAmount,
    paidNetAmount,
    unpaidGrossAmount: settlement.grossAmount,
    unpaidTaxAmount: settlement.taxAmount,
    unpaidNetAmount: settlement.netAmount,
    hasPaidLines: paidLines.length > 0,
    hasUnpaidLines: unpaidLines.length > 0,
    hasLegacyPaidLines: paidLines.some((line) => !Number.isFinite(Number(line.netPaidAmount))),
    hasPaidSettlementMonthMismatch,
    source,
    unallocatedTaxAmount: settlement.unallocatedTaxAmount,
    overwithheldTaxAmount: settlement.overwithheldTaxAmount,
    policy,
  }
}
