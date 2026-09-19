import { useId } from 'react'

type MascotPose = 'wave' | 'cheer' | 'peek'

interface Mascot123Props {
  pose?: MascotPose
  className?: string
  title?: string
}

/**
 * Mascot chuột 123English: tai tròn lớn, lông cam, mắt to nâu đỏ, răng thỏ,
 * áo xanh ngọc in logo. Vẽ bằng SVG (gradient tạo khối 3D) nên nhẹ và sắc nét.
 */
export function Mascot123({ pose = 'wave', className, title = 'Mascot 123English' }: Mascot123Props) {
  const uid = useId().replace(/:/g, '')
  const id = (name: string) => `m123-${name}-${uid}`
  const url = (name: string) => `url(#${id(name)})`

  const furStroke = '#D9761C'
  const arm = (d: string) => (
    <>
      <path d={d} stroke={furStroke} strokeWidth="21" strokeLinecap="round" fill="none" />
      <path d={d} stroke={url('limb')} strokeWidth="17" strokeLinecap="round" fill="none" />
    </>
  )
  const hand = (cx: number, cy: number) => (
    <circle cx={cx} cy={cy} r="12" fill={url('hand')} stroke={furStroke} strokeWidth="2" />
  )

  return (
    <svg viewBox="0 0 220 260" className={className} role="img" aria-label={title}>
      <defs>
        <radialGradient id={id('fur')} cx="42%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#FFC85C" />
          <stop offset="55%" stopColor="#F9A93A" />
          <stop offset="100%" stopColor="#E3801F" />
        </radialGradient>
        <radialGradient id={id('ear')} cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#FFE0C4" />
          <stop offset="70%" stopColor="#FBC39E" />
          <stop offset="100%" stopColor="#F2A77E" />
        </radialGradient>
        <radialGradient id={id('cream')} cx="50%" cy="25%" r="80%">
          <stop offset="0%" stopColor="#FFF8E8" />
          <stop offset="100%" stopColor="#F6D9A6" />
        </radialGradient>
        <radialGradient id={id('iris')} cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor="#E0463A" />
          <stop offset="60%" stopColor="#A3201E" />
          <stop offset="100%" stopColor="#5A0E0E" />
        </radialGradient>
        <radialGradient id={id('nose')} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#FF7A66" />
          <stop offset="100%" stopColor="#D8322A" />
        </radialGradient>
        <linearGradient id={id('shirt')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8FE0F2" />
          <stop offset="100%" stopColor="#3FB3DC" />
        </linearGradient>
        <linearGradient id={id('limb')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFC150" />
          <stop offset="100%" stopColor="#EE9230" />
        </linearGradient>
        <radialGradient id={id('hand')} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#FFF1D6" />
          <stop offset="100%" stopColor="#F4C98C" />
        </radialGradient>
      </defs>

      <style>{`
        .m123-wave { transform-origin: 160px 160px; animation: m123-wave 1.6s ease-in-out infinite; }
        .m123-cheer-l { transform-origin: 60px 160px; animation: m123-cheer 1.2s ease-in-out infinite; }
        .m123-cheer-r { transform-origin: 160px 160px; animation: m123-cheer 1.2s ease-in-out infinite reverse; }
        .m123-bob { animation: m123-bob 2.4s ease-in-out infinite; }
        .m123-blink { transform-box: fill-box; transform-origin: center; animation: m123-blink 4.5s infinite; }
        @keyframes m123-wave { 0%,100% { transform: rotate(0deg) } 50% { transform: rotate(-16deg) } }
        @keyframes m123-cheer { 0%,100% { transform: rotate(0deg) } 50% { transform: rotate(10deg) } }
        @keyframes m123-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes m123-blink { 0%,94%,100% { transform: scaleY(1) } 97% { transform: scaleY(0.1) } }
        @media (prefers-reduced-motion: reduce) { .m123-wave, .m123-cheer-l, .m123-cheer-r, .m123-bob, .m123-blink { animation: none } }
      `}</style>

      <g className="m123-bob">
        {pose !== 'peek' && (
          <>
            {/* Chân + giày */}
            <rect x="80" y="224" width="20" height="22" rx="9" fill={url('limb')} stroke={furStroke} strokeWidth="2" />
            <rect x="120" y="224" width="20" height="22" rx="9" fill={url('limb')} stroke={furStroke} strokeWidth="2" />
            <ellipse cx="88" cy="249" rx="17" ry="7.5" fill="#8A5327" />
            <ellipse cx="132" cy="249" rx="17" ry="7.5" fill="#8A5327" />
            <ellipse cx="84" cy="246.5" rx="7" ry="2.5" fill="#B7794A" />
            <ellipse cx="128" cy="246.5" rx="7" ry="2.5" fill="#B7794A" />

            {/* Quần */}
            <path d="M64 206 h92 v12 a13 13 0 0 1 -13 13 h-66 a13 13 0 0 1 -13 -13z" fill={url('limb')} stroke={furStroke} strokeWidth="2" />

            {/* Tay trái */}
            {pose === 'cheer' ? (
              <g className="m123-cheer-l">
                {arm('M64 166 C40 158 22 140 18 122')}
                {hand(18, 116)}
              </g>
            ) : (
              <g>
                {arm('M62 168 C46 180 42 196 48 208')}
                {hand(49, 210)}
              </g>
            )}

            {/* Áo */}
            <path d="M60 158 Q110 146 160 158 L166 210 Q110 220 54 210z" fill={url('shirt')} stroke="#2A9CC8" strokeWidth="2" />
            <path d="M88 156 Q110 170 132 156" stroke="#2A9CC8" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M68 166 Q72 190 66 206" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="5" fill="none" strokeLinecap="round" />
            {/* Logo 123 English */}
            <text x="72" y="199" fontSize="13" fontWeight="900" fill="#FFD23A" stroke="#1D6FA3" strokeWidth="0.8" fontFamily="Quicksand, sans-serif">123</text>
            <rect x="100" y="187" width="42" height="15" rx="7.5" fill="#FFD23A" stroke="#E0A800" strokeWidth="1" />
            <text x="105" y="198" fontSize="9" fontWeight="900" fill="#1D6FA3" fontFamily="Quicksand, sans-serif">English</text>

            {/* Tay phải */}
            {pose === 'wave' ? (
              <g className="m123-wave">
                {arm('M158 166 C186 158 200 136 200 112')}
                {hand(200, 104)}
              </g>
            ) : (
              <g className="m123-cheer-r">
                {arm('M156 166 C180 158 198 140 202 122')}
                {hand(202, 116)}
              </g>
            )}
          </>
        )}

        {/* Tai */}
        <circle cx="44" cy="58" r="44" fill={url('fur')} stroke={furStroke} strokeWidth="2.5" />
        <circle cx="176" cy="58" r="44" fill={url('fur')} stroke={furStroke} strokeWidth="2.5" />
        <circle cx="46" cy="60" r="31" fill={url('ear')} />
        <circle cx="174" cy="60" r="31" fill={url('ear')} />

        {/* Đầu */}
        <ellipse cx="110" cy="110" rx="72" ry="64" fill={url('fur')} stroke={furStroke} strokeWidth="2.5" />
        <ellipse cx="92" cy="70" rx="26" ry="12" fill="#FFFFFF" opacity="0.22" transform="rotate(-12 92 70)" />
        {/* Mặt kem */}
        <path
          d="M52 124 C52 96 76 88 94 98 C102 102 118 102 126 98 C144 88 168 96 168 124 C168 156 142 172 110 172 C78 172 52 156 52 124z"
          fill={url('cream')}
        />

        {/* Lông mày */}
        <path d="M70 80 q12 -7 24 -1 M126 79 q12 -6 24 1" stroke="#B85F12" strokeWidth="3.5" strokeLinecap="round" fill="none" />

        {/* Mắt */}
        <g className="m123-blink">
          <ellipse cx="84" cy="106" rx="18" ry="21" fill="#FFFFFF" stroke="#3A1B0C" strokeWidth="3" />
          <ellipse cx="86" cy="110" rx="13" ry="15" fill={url('iris')} />
          <ellipse cx="86" cy="112" rx="6.5" ry="7.5" fill="#1E0808" />
          <ellipse cx="80" cy="102" rx="5.5" ry="6.5" fill="#FFFFFF" />
          <circle cx="92" cy="117" r="2.4" fill="#FFFFFF" />
        </g>
        <g className="m123-blink">
          <ellipse cx="136" cy="106" rx="18" ry="21" fill="#FFFFFF" stroke="#3A1B0C" strokeWidth="3" />
          <ellipse cx="134" cy="110" rx="13" ry="15" fill={url('iris')} />
          <ellipse cx="134" cy="112" rx="6.5" ry="7.5" fill="#1E0808" />
          <ellipse cx="128" cy="102" rx="5.5" ry="6.5" fill="#FFFFFF" />
          <circle cx="140" cy="117" r="2.4" fill="#FFFFFF" />
        </g>

        {/* Má hồng */}
        <ellipse cx="64" cy="134" rx="10" ry="6" fill="#FF9C8F" opacity="0.55" />
        <ellipse cx="156" cy="134" rx="10" ry="6" fill="#FF9C8F" opacity="0.55" />

        {/* Mũi */}
        <ellipse cx="110" cy="132" rx="8" ry="6" fill={url('nose')} />
        <ellipse cx="107.5" cy="130" rx="2.8" ry="1.8" fill="#FFFFFF" opacity="0.8" />

        {/* Miệng mở + răng thỏ */}
        <path d="M94 142 Q110 139 126 142 Q124 164 110 166 Q96 164 94 142z" fill="#8E1F2B" stroke="#5E1219" strokeWidth="1.5" />
        <path d="M100 158 Q110 150 120 158 Q116 165 110 165.5 Q104 165 100 158z" fill="#FF7F86" />
        <path d="M103.5 141.5 h13 v8 a2.5 2.5 0 0 1 -2.5 2.5 h-8 a2.5 2.5 0 0 1 -2.5 -2.5z" fill="#FFFFFF" stroke="#D7C6B8" strokeWidth="1" />
        <path d="M110 141.5 v10.5" stroke="#D7C6B8" strokeWidth="1" />

        {pose === 'peek' && (
          <>
            {hand(66, 168)}
            {hand(154, 168)}
          </>
        )}
      </g>
    </svg>
  )
}
