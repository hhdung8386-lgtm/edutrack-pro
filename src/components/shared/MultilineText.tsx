/**
 * Hiển thị đoạn văn dài thành từng dòng cho dễ đọc.
 * - Nếu người nhập đã xuống dòng (Enter) → giữ đúng các dòng đó.
 * - Nếu là một đoạn liền (dữ liệu cũ) → tự tách theo từng câu.
 * Không đổi dữ liệu đã lưu, chỉ đổi cách hiển thị.
 */
export function splitIntoLines(text: string): string[] {
  const raw = String(text || '').replace(/\r\n?/g, '\n').trim()
  if (!raw) return []
  if (raw.includes('\n')) {
    return raw.split('\n').map(line => line.trim()).filter(Boolean)
  }
  // Tách sau dấu . ! ? khi câu tiếp theo bắt đầu bằng chữ hoa (không tách "7.78" hay "TP.HCM").
  return raw
    .split(/(?<=[.!?…])\s+(?=["“(]?\p{Lu})/u)
    .map(line => line.trim())
    .filter(Boolean)
}

export function MultilineText({ text, className = '', lineClassName = '' }: { text?: string | null; className?: string; lineClassName?: string }) {
  const lines = splitIntoLines(text || '')
  if (lines.length === 0) return null
  return (
    <span className={`mt-1 block space-y-1.5 ${className}`}>
      {lines.map((line, index) => (
        <span key={index} className={`block ${lineClassName}`}>{line}</span>
      ))}
    </span>
  )
}
