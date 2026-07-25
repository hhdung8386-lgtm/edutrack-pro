// Avatar giáo viên kèm huy hiệu quốc kỳ tròn (giống app học tiếng Anh 1-1).
// GV chưa có ảnh sẽ fallback chữ cái đầu trên nền gradient.

import auFlagUrl from 'flag-icons/flags/4x3/au.svg'
import caFlagUrl from 'flag-icons/flags/4x3/ca.svg'
import gbFlagUrl from 'flag-icons/flags/4x3/gb.svg'
import inFlagUrl from 'flag-icons/flags/4x3/in.svg'
import phFlagUrl from 'flag-icons/flags/4x3/ph.svg'
import usFlagUrl from 'flag-icons/flags/4x3/us.svg'
import vnFlagUrl from 'flag-icons/flags/4x3/vn.svg'
import zaFlagUrl from 'flag-icons/flags/4x3/za.svg'

const FLAG_IMAGE_MAP: Record<string, string> = {
  VN: vnFlagUrl,
  PH: phFlagUrl,
  US: usFlagUrl,
  GB: gbFlagUrl,
  UK: gbFlagUrl,
  AU: auFlagUrl,
  CA: caFlagUrl,
  ZA: zaFlagUrl,
  IN: inFlagUrl,
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
  const flagImageUrl = code ? FLAG_IMAGE_MAP[code] : undefined
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
      {flagImageUrl && (
        <span
          className="absolute overflow-hidden rounded-full bg-white shadow-[0_2px_7px_rgba(15,23,42,0.22)] ring-2 ring-white select-none"
          style={{ width: flagSize, height: flagSize, bottom: -2, right: -2 }}
          aria-label={country}
        >
          <img
            src={flagImageUrl}
            alt=""
            aria-hidden="true"
            className="h-full w-full scale-[1.08] object-cover"
          />
        </span>
      )}
    </div>
  )
}
