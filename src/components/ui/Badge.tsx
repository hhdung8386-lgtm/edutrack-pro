import { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'slate'
  size?: 'sm' | 'md'
  dot?: boolean
  pulse?: boolean
}

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  dot = false,
  pulse = false,
}: BadgeProps) {
  const variants = {
    default: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    danger: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    info: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
    slate: 'bg-slate-600 text-slate-600',
  }

  const dotColors = {
    default: 'bg-slate-400',
    success: 'bg-emerald-400',
    warning: 'bg-amber-400',
    danger: 'bg-rose-400',
    info: 'bg-indigo-400',
    slate: 'bg-slate-400',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full ${variants[variant]} ${sizes[size]}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} ${pulse ? 'animate-pulse' : ''}`}
        />
      )}
      {children}
    </span>
  )
}

export function StatusBadge({ status, type = 'student' }: { status: string; type?: 'student' | 'teacher' }) {
  const map: Record<string, { variant: BadgeProps['variant']; label: string; pulse?: boolean }> = {
    pending: { variant: 'warning', label: 'Chờ duyệt', pulse: true },
    approved: { variant: 'success', label: 'Đã duyệt' },
    rejected: { variant: 'danger', label: 'Từ chối' },
    active: { variant: 'success', label: type === 'teacher' ? 'Đang dạy' : 'Đang học' },
    inactive: { variant: 'slate', label: 'Tạm dừng' },
    expired: { variant: 'danger', label: 'Hết buổi' },
    reserved: { variant: 'warning', label: 'Bảo lưu' },
  }

  const config = map[status] || { variant: 'default', label: status }

  return (
    <Badge variant={config.variant} dot pulse={config.pulse}>
      {config.label}
    </Badge>
  )
}
