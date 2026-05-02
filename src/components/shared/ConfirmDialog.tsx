import { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  consequence?: string
  confirmLabel?: string
  confirmVariant?: 'primary' | 'danger'
  loading?: boolean
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  consequence,
  confirmLabel = 'Xác nhận',
  confirmVariant = 'primary',
  loading = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          {confirmVariant === 'danger' && (
            <div className="flex-shrink-0 w-10 h-10 bg-rose-500/20 rounded-full flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-rose-400" />
            </div>
          )}
          <div>
            <h3 className="text-base font-semibold text-slate-100">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            )}
          </div>
        </div>

        {children}

        {consequence && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
            <p className="text-sm text-rose-300">{consequence}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
