type MascotPose = 'wave' | 'cheer' | 'peek'

interface Mascot123Props {
  pose?: MascotPose
  className?: string
  title?: string
}

const MASCOT_SRC = '/hoc-thu/mascot.webp'
const MASCOT_HEAD_SRC = '/hoc-thu/mascot-head.webp'

/**
 * Mascot chuột 123English (ảnh 2D nền trong suốt).
 * - wave: nguyên con, vẫy tay
 * - cheer: nguyên con, lật ngang để đổi hướng cho sinh động
 * - peek: chỉ phần đầu, dùng cho thanh CTA dính đáy
 */
export function Mascot123({ pose = 'wave', className = '', title = 'Mascot 123English' }: Mascot123Props) {
  const isPeek = pose === 'peek'
  return (
    <img
      src={isPeek ? MASCOT_HEAD_SRC : MASCOT_SRC}
      alt={title}
      decoding="async"
      draggable={false}
      className={`mascot-123-bob select-none object-contain ${isPeek ? 'object-bottom' : ''} ${className}`}
      style={pose === 'cheer' ? { scale: '-1 1' } : undefined}
    />
  )
}
