import type { StudentSubject } from '@/types'

export const MAX_ADDITIONAL_CURRICULUM_LINKS = 20
const CURRICULUM_LINK_MAX_LENGTH = 2048

type CurriculumFields = Pick<StudentSubject, 'curriculumLink' | 'supplementaryCurriculumLink' | 'additionalCurriculumLinks'>

export interface CurriculumLinkEntry {
  kind: 'main' | 'supplementary' | 'additional'
  label: string
  url: string
}

/** Only an http(s) link may be opened; a bare domain gets https:// (same rule as functions/src/classHunting.ts). */
export function normalizeCurriculumUrl(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed || trimmed.length > CURRICULUM_LINK_MAX_LENGTH) return ''
  const rawCandidate = trimmed.match(/https?:\/\/[^\s<>"']+/i)?.[0] || trimmed
  const candidate = /^https?:\/\//i.test(rawCandidate)
    ? rawCandidate
    : /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(rawCandidate)
      ? `https://${rawCandidate}`
      : ''
  if (!candidate) return ''
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : ''
  } catch {
    return ''
  }
}

/** Every openable textbook link of a package, in display order and without repeats. */
export function curriculumLinksOf(pkg: CurriculumFields | null | undefined): CurriculumLinkEntry[] {
  if (!pkg) return []
  const seen = new Set<string>()
  const entries: CurriculumLinkEntry[] = []
  const push = (kind: CurriculumLinkEntry['kind'], label: string, value: unknown) => {
    const url = normalizeCurriculumUrl(value)
    if (!url || seen.has(url)) return false
    seen.add(url)
    entries.push({ kind, label, url })
    return true
  }
  push('main', 'Giáo trình chính', pkg.curriculumLink)
  push('supplementary', 'Giáo trình bổ trợ', pkg.supplementaryCurriculumLink)
  const additional = Array.isArray(pkg.additionalCurriculumLinks) ? pkg.additionalCurriculumLinks : []
  let order = 0
  additional.forEach((value) => {
    if (push('additional', `Giáo trình thêm ${order + 1}`, value)) order += 1
  })
  return entries
}

export function additionalCurriculumLinksOf(pkg: CurriculumFields | null | undefined): CurriculumLinkEntry[] {
  return curriculumLinksOf(pkg).filter((entry) => entry.kind === 'additional')
}

/**
 * Turns the form rows into the stored list: blank rows disappear, repeats collapse,
 * and rows that are not a link are reported so nothing is dropped silently.
 */
export function parseAdditionalCurriculumRows(rows: string[]): { links: string[]; invalidRows: number[] } {
  const links: string[] = []
  const invalidRows: number[] = []
  rows.forEach((row, index) => {
    if (!row.trim()) return
    const url = normalizeCurriculumUrl(row)
    if (!url) invalidRows.push(index)
    else if (!links.includes(url)) links.push(url)
  })
  return { links, invalidRows }
}
