import React from 'react'

export function DiamondPointsIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2L2 12l10 10 10-10L12 2z" />
    </svg>
  )
}
