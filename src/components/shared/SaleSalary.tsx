import { formatMoney } from '@/lib/constants'

/**
 * Lương buổi của lớp ưu đãi/khóa SALE: giá gốc gạch ngang, lương đã giảm và nhãn
 * SALE -X% để giáo vụ thấy hệ thống đã giảm. Không phải buổi SALE → chỉ hiện số tiền.
 */
export function SaleSalaryAmount({
  salary,
  regularSalary,
  percent,
  currency,
  className = '',
}: {
  salary: number
  regularSalary?: number | null
  percent?: number | null
  currency?: string
  className?: string
}) {
  const isSale = Boolean(percent && percent > 0 && regularSalary && regularSalary > salary)
  if (!isSale) return <span className={className}>{formatMoney(salary, currency)}</span>
  return (
    <span className={`inline-flex flex-col items-start gap-0.5 ${className}`}>
      <span className="text-[11px] font-medium text-slate-400 line-through" title="Lương giá gốc">{formatMoney(regularSalary || 0, currency)}</span>
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="font-bold text-rose-700">{formatMoney(salary, currency)}</span>
        <span className="rounded bg-rose-600 px-1 text-[10px] font-black leading-4 text-white">SALE -{percent}%</span>
      </span>
    </span>
  )
}
