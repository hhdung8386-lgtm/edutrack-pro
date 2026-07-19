// Dải lượn sóng ngăn cách giữa khối header màu vàng và phần nội dung bên dưới.
// Dùng SVG co giãn theo chiều ngang nên nét sóng luôn mượt trên mọi khổ màn hình.
export function WaveDivider({
  className = '',
  fill = '#F8FAFC',
  height = 20,
}: {
  className?: string
  /** Màu của phần nội dung phía dưới (sóng chính là "mặt nước" của nền dưới) */
  fill?: string
  height?: number
}) {
  return (
    <svg
      viewBox="0 0 1440 80"
      preserveAspectRatio="none"
      className={`block w-full ${className}`}
      style={{ height }}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill={fill}
        d="M0,34 C150,76 330,76 500,50 C660,26 820,0 980,10 C1140,20 1300,58 1440,30 L1440,80 L0,80 Z"
      />
    </svg>
  )
}
