// Biểu tượng kim cương XANH dùng cho quỹ "Kim cương" của học viên.
// Màu xanh cố định (không theo currentColor) để luôn hiển thị đúng như bản giao diện được duyệt,
// không bị đen khi đặt trên nền/chữ tối.
export function DiamondPointsIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <defs>
        <linearGradient id="diamond-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7DD3FC" />
          <stop offset="0.55" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#0284C7" />
        </linearGradient>
      </defs>
      <path d="M6 3h12l4 6-10 12L2 9l4-6z" fill="url(#diamond-grad)" />
      <path d="M6 3h12l-2.5 6h-7L6 3z" fill="#BAE6FD" opacity="0.85" />
      <path d="M8.5 9h7L12 21 8.5 9z" fill="#0EA5E9" opacity="0.55" />
      <path d="M2 9h6.5l-1.6 4L2 9zm20 0h-6.5l1.6 4L22 9z" fill="#0284C7" opacity="0.45" />
      <path d="M6 3l2.5 6L2 9l4-6zm12 0l-2.5 6L22 9l-4-6z" fill="#E0F2FE" opacity="0.6" />
    </svg>
  )
}
