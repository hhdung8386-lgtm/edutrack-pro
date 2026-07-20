// Dải lượn sóng ngăn cách giữa khối header vàng và phần nội dung bên dưới.
//
// Phối màu theo yêu cầu: chỉ dùng VÀNG ĐẬM + VÀNG NHẠT, không còn dải trắng.
// Lớp sau là vàng nhạt (tạo chiều sâu trên nền vàng đậm của header), lớp trước
// mang đúng màu nền nội dung (kem ấm) nên chuyển tiếp liền mạch, không thấy vệt cắt.
//
// Sóng chạy liên tục: path lặp ĐÚNG 2 chu kỳ trong viewBox (mỗi chu kỳ rộng 720
// đơn vị), SVG rộng gấp đôi khung rồi trượt ngang -50%. Điểm đầu và cuối mỗi chu kỳ
// trùng nhau nên vòng lặp nối liền, không thấy điểm nhảy.

// Một chu kỳ: y bắt đầu 40 → nhô lên 10 → về 40 → hạ xuống 70 → về 40
const WAVE_PATH =
  'M0,40 C90,10 270,10 360,40 C450,70 630,70 720,40 ' +
  'C810,10 990,10 1080,40 C1170,70 1350,70 1440,40 L1440,80 L0,80 Z'

// Lớp sau lệch pha (bắt đầu ở đỉnh) để hai lớp không trùng nhau
const WAVE_PATH_BACK =
  'M0,22 C90,52 270,52 360,22 C450,-8 630,-8 720,22 ' +
  'C810,52 990,52 1080,22 C1170,-8 1350,-8 1440,22 L1440,80 L0,80 Z'

export function WaveDivider({
  className = '',
  /** Màu nền nội dung phía dưới — lớp sóng chính (mặc định: kem ấm) */
  fill = '#FFFBEB',
  /** Lớp sóng phía sau — vàng nhạt tạo chiều sâu trên nền vàng đậm */
  backFill = '#FFE98F',
  height = 26,
  /** Tắt chuyển động nếu muốn sóng tĩnh */
  animated = true,
}: {
  className?: string
  fill?: string
  backFill?: string
  height?: number
  animated?: boolean
}) {
  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      {/* Lớp sóng vàng nhạt phía sau: trôi ngược chiều và chậm hơn */}
      <svg
        viewBox="0 0 1440 80"
        preserveAspectRatio="none"
        className={`absolute inset-y-0 left-0 h-full ${animated ? 'animate-wave-slow' : ''}`}
        style={{ width: '200%' }}
        focusable="false"
      >
        <path fill={backFill} d={WAVE_PATH_BACK} />
      </svg>

      {/* Lớp sóng chính mang màu nền nội dung */}
      <svg
        viewBox="0 0 1440 80"
        preserveAspectRatio="none"
        className={`absolute inset-y-0 left-0 h-full ${animated ? 'animate-wave' : ''}`}
        style={{ width: '200%' }}
        focusable="false"
      >
        <path fill={fill} d={WAVE_PATH} />
      </svg>
    </div>
  )
}
