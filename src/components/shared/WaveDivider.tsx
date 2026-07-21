// Dải lượn sóng ngăn cách giữa khối header vàng và phần nội dung bên dưới.
//
// Phối màu: CHỈ vàng đậm + vàng nhạt, tuyệt đối không có trắng.
// Để không lộ đường thẳng ngăn cách, khối sóng có sẵn nền chuyển màu từ vàng đậm
// (nối liền header) xuống đúng màu nền nội dung, rồi mới vẽ 2 lớp sóng lên trên.
// Lớp sóng trước mang đúng màu nền trang nên mép dưới tan hẳn vào nội dung.
//
// Sóng chạy liên tục: path lặp ĐÚNG 2 chu kỳ trong viewBox (mỗi chu kỳ rộng 720
// đơn vị), SVG rộng gấp đôi khung rồi trượt ngang -50%. Điểm đầu và cuối mỗi chu kỳ
// trùng nhau nên vòng lặp nối liền, không thấy điểm nhảy.

// Một chu kỳ, biên độ lớn để sóng nhìn rõ trên màn hình điện thoại
const WAVE_PATH =
  'M0,44 C90,4 270,4 360,44 C450,84 630,84 720,44 ' +
  'C810,4 990,4 1080,44 C1170,84 1350,84 1440,44 L1440,90 L0,90 Z'

// Lớp sau lệch pha nửa chu kỳ để hai lớp không trùng nhau
const WAVE_PATH_BACK =
  'M0,26 C90,66 270,66 360,26 C450,-14 630,-14 720,26 ' +
  'C810,66 990,66 1080,26 C1170,-14 1350,-14 1440,26 L1440,90 L0,90 Z'

export function WaveDivider({
  className = '',
  /** Màu nền nội dung phía dưới — lớp sóng chính (mặc định: kem ấm) */
  fill = '#FFFBEB',
  /** Lớp sóng phía sau — vàng nhạt tạo chiều sâu trên nền vàng đậm */
  backFill = '#FFDF6B',
  /** Màu vàng đậm nối liền mép dưới header, tránh lộ đường cắt ngang */
  topColor = '#FFC61A',
  height = 30,
  /** Tắt chuyển động nếu muốn sóng tĩnh */
  animated = true,
}: {
  className?: string
  fill?: string
  backFill?: string
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
      {/* Nền chuyển màu vàng đậm -> màu nội dung: xóa hẳn ranh giới cứng hai đầu */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to bottom, ${topColor}, ${fill})` }}
      />

      {/* Lớp sóng vàng nhạt phía sau: trôi ngược chiều và chậm hơn */}
      <svg
        viewBox="0 0 1440 90"
        preserveAspectRatio="none"
        className={`absolute inset-y-0 left-0 h-full ${animated ? 'animate-wave-slow' : ''}`}
        style={{ width: '200%' }}
        focusable="false"
      >
        <path fill={backFill} d={WAVE_PATH_BACK} />
      </svg>

      {/* Lớp sóng chính mang đúng màu nền nội dung */}
      <svg
        viewBox="0 0 1440 90"
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
