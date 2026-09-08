import { ReactNode, useId } from 'react'
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
  confirmDisabled?: boolean
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
  confirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const consequenceId = useId()
  const describedBy = [description ? descriptionId : '', consequence ? consequenceId : ''].filter(Boolean).join(' ') || undefined
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      size="sm"
      ariaLabelledBy={titleId}
      ariaDescribedBy={describedBy}
      footer={
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading} data-modal-initial-focus>
            Hủy
          </Button>
          <Button type="button" variant={confirmVariant} onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          {confirmVariant === 'danger' && (
            <div className="flex-shrink-0 w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-rose-600" />
            </div>
          )}
          <div>
            <h3 id={titleId} className="text-base font-semibold text-slate-900">{title}</h3>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-slate-600">{description}</p>
            )}
          </div>
        </div>

        {children}

        {consequence && (
          <div className={`rounded-lg border p-3 ${confirmVariant === 'danger' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
            <p id={consequenceId} className={`text-sm ${confirmVariant === 'danger' ? 'text-rose-800' : 'text-amber-900'}`}>{consequence}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
