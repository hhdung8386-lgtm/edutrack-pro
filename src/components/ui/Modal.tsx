import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
}

export function Modal({ open, onClose, title, children, size = 'md', footer }: ModalProps) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={`
          relative w-full ${sizes[size]} bg-slate-900 border border-slate-700
          rounded-t-2xl sm:rounded-xl shadow-modal z-10 animate-slide-up
          max-h-[90vh] flex flex-col overflow-hidden
        `}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 flex-shrink-0">
            <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        {/* Drag handle for mobile */}
        <div className="sm:hidden absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1 bg-slate-600 rounded-full" />

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex-shrink-0 border-t border-slate-700 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
