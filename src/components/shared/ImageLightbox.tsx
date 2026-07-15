import { X } from 'lucide-react'

// Xem ảnh phóng to trong app. Dùng thay cho <a target="_blank"> vì trình duyệt
// CHẶN mở tab mới với ảnh dạng base64 (data: URI) — nguyên nhân "không xem được ảnh".
// Hoạt động với cả ảnh base64 cũ lẫn ảnh https (Firebase Storage) mới.
export function ImageLightbox({ src, onClose, alt = '' }: { src: string; onClose: () => void; alt?: string }) {
  if (!src) return null
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 rounded-xl bg-white/15 p-2.5 text-white backdrop-blur-md transition-colors hover:bg-white/25"
        aria-label="Đóng"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
