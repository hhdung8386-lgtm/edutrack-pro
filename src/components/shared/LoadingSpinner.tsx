import { Loader2 } from 'lucide-react'

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className={`${sizes[size]} text-indigo-400 animate-spin`} />
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => {
        const opacityLevels = [
          'opacity-100', 'opacity-90', 'opacity-80', 'opacity-70', 'opacity-60',
          'opacity-50', 'opacity-40', 'opacity-30', 'opacity-20', 'opacity-10'
        ];
        return (
          <div key={i} className="flex gap-4 px-4 py-3 animate-pulse">
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className={`h-4 bg-slate-100 rounded flex-1 ${opacityLevels[Math.min(i, 9)]}`}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
      <div className="h-3 bg-slate-100 rounded w-1/3 mb-4" />
      <div className="h-8 bg-slate-100 rounded w-1/2 mb-2" />
      <div className="h-3 bg-slate-100 rounded w-2/3" />
    </div>
  )
}
