import type { PaymentSettings } from '@/types'

export const DEFAULT_PAYROLL_TAX_THRESHOLD = 5_000_000
export const DEFAULT_PAYROLL_TAX_RATE_PERCENT = 10

export interface PayrollTaxPolicy {
  enabled: boolean
  thresholdAmount: number
  ratePercent: number
  currency: string
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

export function normalizePayrollTaxPolicy(settings?: Partial<PaymentSettings> | null): PayrollTaxPolicy {
  const threshold = Number(settings?.payrollTaxThresholdAmount)
  const rate = Number(settings?.payrollTaxRatePercent)
  return {
    enabled: settings?.payrollTaxEnabled === true,
    thresholdAmount: Number.isFinite(threshold) && threshold >= 0
      ? Math.round(threshold)
      : DEFAULT_PAYROLL_TAX_THRESHOLD,
    ratePercent: Number.isFinite(rate) && rate >= 0 && rate <= 100
      ? rate
      : DEFAULT_PAYROLL_TAX_RATE_PERCENT,
    currency: String(settings?.payrollTaxCurrency || 'VND').toUpperCase(),
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
    && policy.ratePercent > 0
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
    ? Math.round(gross * policy.ratePercent / 100)
    : 0
  return {
    gross,
    tax,
    net: Math.max(0, gross - tax),
    applies,
    policy,
  }
}
