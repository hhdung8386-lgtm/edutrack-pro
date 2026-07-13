// Avatar giáo viên kèm huy hiệu quốc kỳ tròn (giống app học tiếng Anh 1-1).
// Cờ lấy từ thư viện flag-icons (lipis/flag-icons) — chỉ import đúng các nước đang dùng
// để bundle nhẹ. GV chưa có ảnh sẽ fallback chữ cái đầu trên nền gradient.
// ?no-inline: giữ SVG là file riêng — inline data-URI làm hỏng cờ có ký tự đặc biệt (vd: VN)
import vnFlag from 'flag-icons/flags/1x1/vn.svg?no-inline'
import phFlag from 'flag-icons/flags/1x1/ph.svg?no-inline'
import usFlag from 'flag-icons/flags/1x1/us.svg?no-inline'
import gbFlag from 'flag-icons/flags/1x1/gb.svg?no-inline'
import auFlag from 'flag-icons/flags/1x1/au.svg?no-inline'
import caFlag from 'flag-icons/flags/1x1/ca.svg?no-inline'
import zaFlag from 'flag-icons/flags/1x1/za.svg?no-inline'
import inFlag from 'flag-icons/flags/1x1/in.svg?no-inline'

const FLAG_MAP: Record<string, string> = {
  VN: vnFlag,
  PH: phFlag,
  US: usFlag,
  GB: gbFlag,
  UK: gbFlag,
  AU: auFlag,
  CA: caFlag,
  ZA: zaFlag,
  IN: inFlag,
}

const AVATAR_GRADIENTS = [
  'from-sky-400 to-blue-500',
  'from-violet-400 to-purple-500',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-rose-400 to-pink-500',
]

function gradientFor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

interface TeacherAvatarProps {
  name: string
  photoURL?: string
  country?: string
  /** Kích thước avatar (px). Mặc định 48. */
  size?: number
  className?: string
}

export function TeacherAvatar({ name, photoURL, country, size = 48, className = '' }: TeacherAvatarProps) {
  const flag = country ? FLAG_MAP[country.toUpperCase()] : undefined
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  const flagSize = Math.max(14, Math.round(size * 0.38))

  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      {photoURL ? (
        <img
          src={photoURL}
          alt={name}
          className="w-full h-full rounded-full object-cover ring-2 ring-white shadow-sm"
        />
      ) : (
        <div
          className={`w-full h-full rounded-full bg-gradient-to-br ${gradientFor(name)} ring-2 ring-white shadow-sm flex items-center justify-center text-white font-bold select-none`}
          style={{ fontSize: size * 0.42 }}
          aria-label={name}
        >
          {initial}
        </div>
      )}
      {flag && (
        <img
          src={flag}
          alt={country}
          className="absolute rounded-full ring-2 ring-white object-cover"
          style={{ width: flagSize, height: flagSize, bottom: -2, right: -2 }}
        />
      )}
    </div>
  )
}
