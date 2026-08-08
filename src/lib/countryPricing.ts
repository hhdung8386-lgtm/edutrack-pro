import { CountryPriceInfo } from '@/types'

export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  VN: 'VND',
  PH: 'PHP',
  NATIVE: 'USD',
  US: 'USD',
  GB: 'USD',
  CA: 'USD',
  AU: 'USD',
}

export function formatVietnameseNumberInput(val: string): string {
  const clean = val.replace(/\D/g, '')
  if (!clean) return ''
  return Number(clean).toLocaleString('vi-VN')
}

export function getCountryRate(
  subject: {
    pricePerMinute: number
    pricePerMinuteVN?: number
    pricePerMinutePH?: number
    pricePerMinuteNative?: number
    otherCountriesPrices?: Record<string, number>
    countryPrices?: Record<string, CountryPriceInfo>
    currency?: string
  },
  country: string = 'VN'
): { price: number; currency: string } {
  const code = (country || 'VN').toUpperCase()
  const isNativeRate = code !== 'VN' && code !== 'PH'
  
  // 1. Check countryPrices map first
  if (subject.countryPrices?.[code]) {
    return {
      price: subject.countryPrices[code].price,
      currency: subject.countryPrices[code].currency,
    }
  }
  if (subject.otherCountriesPrices?.[code] !== undefined) {
    return {
      price: subject.otherCountriesPrices[code],
      currency: isNativeRate ? 'USD' : code === 'PH' ? 'PHP' : 'VND',
    }
  }
  // A teacher country such as ZA (South Africa) is stored by its ISO code,
  // while legacy pricing keeps the native/foreign bucket under NATIVE.
  // Never fall back to the VN rate merely because the exact country key is
  // absent; that silently under/overpays foreign teachers.
  if (isNativeRate && subject.countryPrices?.NATIVE) {
    return {
      price: subject.countryPrices.NATIVE.price,
      currency: subject.countryPrices.NATIVE.currency,
    }
  }

  // 2. Check legacy rates
  if (code === 'VN' && subject.pricePerMinuteVN !== undefined && subject.pricePerMinuteVN > 0) {
    return { price: subject.pricePerMinuteVN, currency: 'VND' }
  }
  if (code === 'PH' && subject.pricePerMinutePH !== undefined && subject.pricePerMinutePH > 0) {
    return { price: subject.pricePerMinutePH, currency: 'PHP' }
  }
  if (isNativeRate && subject.pricePerMinuteNative !== undefined && subject.pricePerMinuteNative > 0) {
    return { price: subject.pricePerMinuteNative, currency: 'USD' }
  }

  // 3. Fallback to default price and currency
  return {
    price: subject.pricePerMinute || 0,
    currency: subject.currency || (isNativeRate ? 'USD' : 'VND'),
  }
}
