import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export function Logo({ className = '', clickable = true }: { className?: string; clickable?: boolean }) {
  const hasSizeClass = /\b(?:h-|w-|max-h-|max-w-)/.test(className)
  const defaultClasses = hasSizeClass ? '' : 'h-10 w-auto max-w-[170px]'
  const { user, role } = useAuthStore()

  const getHomePath = () => {
    if (!user) return '/'
    if (role === 'admin') return '/admin/dashboard'
    if (role === 'teacher') return '/teacher/attendance'
    if (role === 'guest') return '/waiting'
    return '/parent'
  }

  const imgEl = (
    <img
      src="/brand-logo.png"
      alt="123English"
      width={720}
      height={182}
      className={`block shrink-0 object-contain ${defaultClasses} ${className}`}
      decoding="async"
    />
  )

  if (clickable) {
    return <Link to={getHomePath()}>{imgEl}</Link>
  }

  return imgEl
}
