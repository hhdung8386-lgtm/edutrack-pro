// Dải lượn sóng ngăn cách giữa khối header vàng và phần nội dung bên dưới.
//
// Phối màu: Chỉ sử dụng màu vàng đáy header (mặc định #FFC61A).
// Bằng cách vẽ một đường sóng phủ phần trên (từ y=0 đến đường lượn sóng) và phần dưới
// để trống (trong suốt), sóng vàng sẽ chảy mượt mà từ header xuống và ranh giới với nền
// trang (kem/trắng) sẽ hiện ra tự nhiên mà không cần lớp sóng màu trắng chồng chéo gây phân mảnh.

const WAVE_PATH_TOP =
  'M0,0 L1440,0 L1440,44 C1350,84 1170,84 1080,44 C990,4 810,4 720,44 ' +
  'C630,84 450,84 360,44 C270,4 90,4 0,44 Z'

export function WaveDivider({
  className = '',
  /** Màu vàng đậm nối liền mép dưới header, mặc định là màu đáy header */
  topColor = '#FFC61A',
  height = 30,
  animated = true,
}: {
  className?: string
  topColor?: string
  height?: number
  animated?: boolean
}) {
  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 90"
        preserveAspectRatio="none"
        className={`absolute inset-y-0 left-0 h-full ${animated ? 'animate-wave' : ''}`}
        style={{ width: '200%' }}
        focusable="false"
      >
        <path fill={topColor} d={WAVE_PATH_TOP} />
      </svg>
    </div>
  )
}
