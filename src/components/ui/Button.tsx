import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    // Chỉ thêm hiệu ứng (nhấn xuống, viền focus bàn phím) — không đụng tới màu nền/chữ
    // để các nơi đang ghi đè màu bằng className (bg-[#…], from-brand-…) vẫn giữ nguyên.
    const base =
      'inline-flex select-none items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 [-webkit-tap-highlight-color:transparent] [touch-action:manipulation] active:scale-[0.98] active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:active:brightness-100'

    const variants = {
      primary:
        'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-600 shadow-sm shadow-indigo-900/15',
      secondary:
        'bg-slate-100 hover:bg-slate-200 text-slate-900 focus:ring-slate-500 shadow-sm shadow-slate-900/5',
      danger:
        'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-600 shadow-sm shadow-rose-900/15',
      ghost:
        'text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:ring-slate-500',
      outline:
        'border border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400 focus:ring-slate-500',
    }

    // Màn cảm ứng: nút nhỏ được nới lên 40px để dễ chạm; máy tính giữ nguyên 36px.
    const sizes = {
      sm: 'px-3 py-1.5 text-sm min-h-[36px] pointer-coarse:min-h-[40px]',
      md: 'px-4 py-2.5 text-sm min-h-[44px]',
      lg: 'px-6 py-3 text-base min-h-[52px]',
    }

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
