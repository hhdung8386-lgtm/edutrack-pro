import { ReactNode, useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
}

const FOCUSABLE_SELECTOR = [
  '[data-modal-initial-focus]:not([disabled]):not([aria-disabled="true"])',
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
].join(',')

const openModalStack: object[] = []
let bodyOverflowBeforeFirstModal: string | null = null

function registerOpenModal(token: object) {
  openModalStack.push(token)
  if (openModalStack.length === 1) {
    bodyOverflowBeforeFirstModal = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
}

function unregisterOpenModal(token: object) {
  const index = openModalStack.lastIndexOf(token)
  if (index === -1) return
  openModalStack.splice(index, 1)
  if (openModalStack.length === 0) {
    document.body.style.overflow = bodyOverflowBeforeFirstModal || ''
    bodyOverflowBeforeFirstModal = null
  }
}

function isTopModal(token: object) {
  return openModalStack[openModalStack.length - 1] === token
}

function getFocusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => (
      !element.hasAttribute('disabled')
      && element.getAttribute('aria-disabled') !== 'true'
      && element.tabIndex >= 0
      && element.getAttribute('aria-hidden') !== 'true'
      && element.getClientRects().length > 0
    ))
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const modalTokenRef = useRef({})
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const generatedTitleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const modalToken = modalTokenRef.current
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    registerOpenModal(modalToken)
    const focusFrame = window.requestAnimationFrame(() => {
      if (!isTopModal(modalToken)) return
      const dialog = dialogRef.current
      const focusable = dialog ? getFocusableElements(dialog) : []
      const initialFocus = focusable.find((element) => element.hasAttribute('data-modal-initial-focus'))
        || focusable[0]
      ;(initialFocus || dialog)?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog || !isTopModal(modalToken) || event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = getFocusableElements(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown, true)
      const shouldRestoreFocus = isTopModal(modalToken)
      unregisterOpenModal(modalToken)
      const previousFocus = previousFocusRef.current
      if (shouldRestoreFocus && previousFocus?.isConnected) {
        window.requestAnimationFrame(() => previousFocus.focus())
      }
    }
  }, [open])

  if (!open) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  const requestCloseIfTop = () => {
    if (isTopModal(modalTokenRef.current)) onCloseRef.current()
  }

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] items-end justify-center pb-[env(safe-area-inset-bottom)] sm:inset-0 sm:h-auto sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={requestCloseIfTop}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy || (title ? generatedTitleId : undefined)}
        aria-describedby={ariaDescribedBy}
        aria-label={!ariaLabelledBy && !title ? (ariaLabel || 'Hộp thoại') : undefined}
        tabIndex={-1}
        className={`
          relative w-full ${sizes[size]} bg-slate-50 border border-slate-200
          rounded-t-2xl sm:rounded-xl shadow-modal z-10 animate-slide-up
          max-h-[calc(100dvh-env(safe-area-inset-bottom))] sm:max-h-[90vh] flex flex-col overflow-hidden
        `}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
            <h2 id={generatedTitleId} className="text-lg font-semibold text-slate-900">{title}</h2>
            <button
              type="button"
              onClick={requestCloseIfTop}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
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
          <div className="flex-shrink-0 border-t border-slate-200 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
