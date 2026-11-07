/**
 * Ảnh PNG/JPG gốc trong /public rất nặng (1,5–2,5 MB/ảnh). Mỗi ảnh dưới đây đã có
 * bản WebP thu nhỏ đúng cỡ hiển thị (25–110 KB) nằm cạnh file gốc.
 *
 * File gốc được GIỮ NGUYÊN vì đường dẫn cũ có thể đang lưu trong Firestore
 * (nội dung trang do admin cấu hình). Hàm này đổi đường dẫn lúc hiển thị nên cả
 * ảnh trong mã nguồn lẫn ảnh do CMS lưu đều tải bản nhẹ.
 */
const OPTIMIZED_IMAGES: Record<string, string> = {
  '/home-hero-banner-123english.png': '/home-hero-banner-123english.webp',
  '/home-hero-vietnam-2026-v2.png': '/home-hero-vietnam-2026-v2.webp',
  '/lienhe.png': '/lienhe.webp',
  '/home-teacher-student-2026.png': '/home-teacher-student-2026.webp',
  '/home-learning-companion-2026.png': '/home-learning-companion-2026.webp',
  '/adult_meeting.png': '/adult_meeting.webp',
  '/home-international-team-2026.png': '/home-international-team-2026.webp',
  '/home-quality-review-2026.png': '/home-quality-review-2026.webp',
  '/brand-award-recipient-2026.jpg': '/brand-award-recipient-2026.webp',
  '/brand-logo.png': '/brand-logo.webp',
  '/student-stories/minh-anh.png': '/student-stories/minh-anh.webp',
  '/student-stories/gia-bao.png': '/student-stories/gia-bao.webp',
  '/student-stories/khanh-linh.png': '/student-stories/khanh-linh.webp',
  '/student-stories/duc-minh.png': '/student-stories/duc-minh.webp',
  '/student-stories/ngoc-ha.png': '/student-stories/ngoc-ha.webp',
  '/student-stories/hoang-nam.png': '/student-stories/hoang-nam.webp',
}

/** Đường dẫn ảnh nhẹ tương ứng; ảnh không có trong danh sách được trả về nguyên vẹn. */
export function optimizedImage(src: string): string
export function optimizedImage(src: string | undefined): string | undefined
export function optimizedImage(src: string | undefined): string | undefined {
  if (!src) return src
  return OPTIMIZED_IMAGES[src] || src
}
