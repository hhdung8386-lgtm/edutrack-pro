export function Logo({ className = '' }: { className?: string }) {
  const hasSizeClass = /\b(?:h-|w-|max-h-|max-w-)/.test(className)
  const defaultClasses = hasSizeClass ? '' : 'h-10 w-auto max-w-[170px]'

  return (
    <img
      src="/brand-logo.png"
      alt="123English"
      width={720}
      height={182}
      className={`block shrink-0 object-contain ${defaultClasses} ${className}`}
      decoding="async"
    />
  )
}
