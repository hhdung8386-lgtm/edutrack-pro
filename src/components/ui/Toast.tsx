import { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useToastStore } from '@/stores/toastStore'

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed top-4 right-4 sm:right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

function ToastItem({
  toast,
  onClose,
}: {
  toast: { id: string; type: string; message: string }
  onClose: () => void
}) {
  const configs = {
    success: {
      icon: CheckCircle,
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      iconColor: 'text-emerald-400',
      textColor: 'text-emerald-100',
    },
    error: {
      icon: AlertCircle,
      bg: 'bg-rose-500/10 border-rose-500/30',
      iconColor: 'text-rose-400',
      textColor: 'text-rose-100',
    },
    warning: {
      icon: AlertTriangle,
      bg: 'bg-amber-500/10 border-amber-500/30',
      iconColor: 'text-amber-400',
      textColor: 'text-amber-100',
    },
    info: {
      icon: Info,
      bg: 'bg-indigo-500/10 border-indigo-500/30',
      iconColor: 'text-indigo-400',
      textColor: 'text-indigo-100',
    },
  }

  const config = configs[toast.type as keyof typeof configs] || configs.info
  const Icon = config.icon

  return (
    <div
      className={`
        pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border
        backdrop-blur-md shadow-lg animate-slide-up max-w-sm w-full ml-auto
        ${config.bg}
      `}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
      <p className={`text-sm flex-1 ${config.textColor}`}>{toast.message}</p>
      <button
        onClick={onClose}
        className="text-slate-500 hover:text-slate-900 flex-shrink-0 ml-1"
        aria-label="Đóng"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
