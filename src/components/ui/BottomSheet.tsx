import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  mobileHeight?: 'default' | 'compact'
  footer?: ReactNode
}

export function BottomSheet({ open, onClose, title, children, size = 'md', mobileHeight = 'default', footer }: BottomSheetProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  const mobileMaxHeight = mobileHeight === 'compact' ? 'max-h-[72dvh]' : 'max-h-[85dvh]'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Sheet panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`
          relative w-full ${sizes[size]} bg-white border border-slate-200
          rounded-t-2xl sm:rounded-2xl shadow-2xl z-10 
          transform transition-transform duration-300 ease-out
          ${mobileMaxHeight} sm:max-h-[90vh] flex flex-col overflow-hidden
          animate-slide-up motion-reduce:animate-none
        `}
      >
        {/* Mobile handle indicator */}
        <div className="flex justify-center py-2.5 sm:hidden flex-shrink-0">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
        </div>

        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex-shrink-0 border-t border-slate-100 px-6 py-4 bg-slate-50">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
