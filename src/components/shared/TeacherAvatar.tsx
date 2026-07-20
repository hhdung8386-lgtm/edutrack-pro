// Avatar giáo viên kèm huy hiệu quốc kỳ tròn (giống app học tiếng Anh 1-1).
// GV chưa có ảnh sẽ fallback chữ cái đầu trên nền gradient.

const FLAG_EMOJI_MAP: Record<string, string> = {
  VN: '🇻🇳',
  PH: '🇵🇭',
  US: '🇺🇸',
  GB: '🇬🇧',
  UK: '🇬🇧',
  AU: '🇦🇺',
  CA: '🇨🇦',
  ZA: '🇿🇦',
  IN: '🇮🇳',
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

export function normalizeTeacherCountryCode(country?: string): string {
  const code = (country || 'VN').toUpperCase().trim()
  if (code === 'UK') return 'GB'
  return code
}

export function TeacherAvatar({ name, photoURL, country, size = 48, className = '' }: TeacherAvatarProps) {
  const code = country ? normalizeTeacherCountryCode(country) : undefined
  const flagEmoji = code ? FLAG_EMOJI_MAP[code] : undefined
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
      {flagEmoji && (
        <span
          className="absolute flex items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 select-none overflow-hidden leading-none"
          style={{ width: flagSize, height: flagSize, bottom: -2, right: -2, fontSize: Math.max(10, Math.round(flagSize * 0.75)) }}
          aria-label={country}
        >
          {flagEmoji}
        </span>
      )}
    </div>
  )
}
