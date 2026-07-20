import { useEffect, useState } from 'react'

// Dải lượn sóng ngăn cách giữa khối header vàng và phần nội dung bên dưới.
//
// Phối màu: Chỉ sử dụng màu vàng đáy header (mặc định #FFC61A).
// Khi cuộn trang xuống, dải sóng sẽ tự động thu gọn và mờ dần (tàng hình)
// giúp thanh header trở nên gọn gàng, không che khuất nội dung đang cuộn.

const WAVE_PATH_TOP =
  'M0,0 L1440,0 L1440,44 C1350,84 1170,84 1080,44 C990,4 810,4 720,44 ' +
  'C630,84 450,84 360,44 C270,4 90,4 0,44 Z'

export function WaveDivider({
  className = '',
  /** Màu vàng đậm nối liền mép dưới header, mặc định là màu đáy header */
  topColor = '#FFC61A',
  height = 30,
  animated = true,
  /** Tự động mờ dần & thu gọn sóng khi cuộn trang xuống */
  fadeOnScroll = true,
}: {
  className?: string
  topColor?: string
  height?: number
  animated?: boolean
  fadeOnScroll?: boolean
}) {
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    if (!fadeOnScroll) return
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [fadeOnScroll])

  const currentHeight = isScrolled ? 0 : height

  return (
    <div
      className={`relative w-full overflow-hidden transition-all duration-300 ease-out ${
        isScrolled ? 'opacity-0 pointer-events-none' : 'opacity-100'
      } ${className}`}
      style={{ height: currentHeight }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 90"
        preserveAspectRatio="none"
        className={`absolute inset-y-0 left-0 h-full ${animated && !isScrolled ? 'animate-wave' : ''}`}
        style={{ width: '200%' }}
        focusable="false"
      >
        <path fill={topColor} d={WAVE_PATH_TOP} />
      </svg>
    </div>
  )
}
