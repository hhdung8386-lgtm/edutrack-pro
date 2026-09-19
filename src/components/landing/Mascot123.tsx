type MascotPose = 'wave' | 'cheer' | 'peek'

interface Mascot123Props {
  pose?: MascotPose
  className?: string
  title?: string
}

/**
 * Mascot chuột 123English (tai tròn lớn, lông cam, áo xanh in logo, quần cam).
 * Vẽ bằng SVG để nhẹ, sắc nét trên mọi màn hình và đổi dáng theo `pose`.
 */
export function Mascot123({ pose = 'wave', className, title = 'Mascot 123English' }: Mascot123Props) {
  const fur = '#E3913A'
  const furDark = '#C8741F'
  const cream = '#FBE3B9'
  const shirt = '#2E9BE6'

  return (
    <svg viewBox="0 0 220 260" className={className} role="img" aria-label={title}>
      <style>{`
        .m123-wave { transform-origin: 170px 150px; animation: m123-wave 1.6s ease-in-out infinite; }
        .m123-cheer-l { transform-origin: 58px 152px; animation: m123-cheer 1.2s ease-in-out infinite; }
        .m123-cheer-r { transform-origin: 162px 152px; animation: m123-cheer 1.2s ease-in-out infinite reverse; }
        .m123-bob { animation: m123-bob 2.4s ease-in-out infinite; }
        @keyframes m123-wave { 0%,100% { transform: rotate(0deg) } 50% { transform: rotate(-18deg) } }
        @keyframes m123-cheer { 0%,100% { transform: rotate(0deg) } 50% { transform: rotate(10deg) } }
        @keyframes m123-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @media (prefers-reduced-motion: reduce) { .m123-wave, .m123-cheer-l, .m123-cheer-r, .m123-bob { animation: none } }
      `}</style>

      <g className="m123-bob">
        {pose !== 'peek' && (
          <>
            {/* Chân + giày */}
            <rect x="78" y="222" width="22" height="24" rx="10" fill={fur} />
            <rect x="120" y="222" width="22" height="24" rx="10" fill={fur} />
            <ellipse cx="86" cy="248" rx="18" ry="8" fill="#7A4A1D" />
            <ellipse cx="134" cy="248" rx="18" ry="8" fill="#7A4A1D" />
            {/* Quần */}
            <path d="M62 204 h96 v14 a12 12 0 0 1 -12 12 h-72 a12 12 0 0 1 -12 -12z" fill={furDark} />

            {/* Tay trái */}
            {pose === 'cheer' ? (
              <g className="m123-cheer-l">
                <path d="M62 158 C40 146 30 124 34 104" stroke={fur} strokeWidth="18" strokeLinecap="round" fill="none" />
                <circle cx="34" cy="100" r="12" fill={fur} />
              </g>
            ) : (
              <g>
                <path d="M60 162 C44 176 42 194 50 206" stroke={fur} strokeWidth="18" strokeLinecap="round" fill="none" />
                <circle cx="51" cy="208" r="11" fill={fur} />
              </g>
            )}

            {/* Thân áo */}
            <path d="M58 152 Q110 138 162 152 L166 208 Q110 216 54 208z" fill={shirt} />
            <path d="M86 150 Q110 166 134 150" stroke="#FFD02E" strokeWidth="5" fill="none" strokeLinecap="round" />
            {/* Logo 123 English trên áo */}
            <rect x="78" y="172" width="64" height="22" rx="11" fill="#FFD02E" />
            <text x="87" y="188" fontSize="12" fontWeight="900" fill="#0F4C81" fontFamily="Quicksand, sans-serif">123</text>
            <rect x="108" y="176" width="30" height="14" rx="7" fill="#FFFFFF" />
            <text x="110.5" y="186.5" fontSize="7.5" fontWeight="900" fill={shirt} fontFamily="Quicksand, sans-serif">English</text>

            {/* Tay phải */}
            {pose === 'wave' ? (
              <g className="m123-wave">
                <path d="M158 160 C186 154 202 132 202 108" stroke={fur} strokeWidth="18" strokeLinecap="round" fill="none" />
                <circle cx="202" cy="102" r="13" fill={fur} />
                <path d="M195 93 v-8 M202 91 v-9 M209 93 v-8" stroke={fur} strokeWidth="6" strokeLinecap="round" />
              </g>
            ) : (
              <g className="m123-cheer-r">
                <path d="M158 158 C180 146 190 124 186 104" stroke={fur} strokeWidth="18" strokeLinecap="round" fill="none" />
                <circle cx="186" cy="100" r="12" fill={fur} />
              </g>
            )}
          </>
        )}

        {/* Tai */}
        <circle cx="46" cy="52" r="40" fill={fur} />
        <circle cx="174" cy="52" r="40" fill={fur} />
        <circle cx="48" cy="54" r="27" fill={cream} />
        <circle cx="172" cy="54" r="27" fill={cream} />

        {/* Đầu */}
        <ellipse cx="110" cy="100" rx="70" ry="62" fill={fur} />
        <path d="M60 104 C60 76 84 70 110 84 C136 70 160 76 160 104 C160 140 136 156 110 156 C84 156 60 140 60 104z" fill={cream} />

        {/* Mắt */}
        <ellipse cx="88" cy="98" rx="15" ry="19" fill="#FFFFFF" />
        <ellipse cx="132" cy="98" rx="15" ry="19" fill="#FFFFFF" />
        <circle cx="90" cy="101" r="11" fill="#1F7FD1" />
        <circle cx="130" cy="101" r="11" fill="#1F7FD1" />
        <circle cx="90" cy="102" r="7" fill="#1B130D" />
        <circle cx="130" cy="102" r="7" fill="#1B130D" />
        <circle cx="93" cy="97" r="3.4" fill="#FFFFFF" />
        <circle cx="133" cy="97" r="3.4" fill="#FFFFFF" />
        <path d="M74 76 q12 -8 24 -2 M122 74 q12 -6 24 2" stroke={furDark} strokeWidth="4" strokeLinecap="round" fill="none" />

        {/* Má hồng */}
        <ellipse cx="72" cy="124" rx="9" ry="6" fill="#F6A3A0" opacity="0.8" />
        <ellipse cx="148" cy="124" rx="9" ry="6" fill="#F6A3A0" opacity="0.8" />

        {/* Mũi */}
        <ellipse cx="110" cy="120" rx="9" ry="7" fill="#E53935" />
        <ellipse cx="107" cy="117.5" rx="3" ry="2" fill="#FFFFFF" opacity="0.7" />

        {/* Miệng cười */}
        <path d="M94 130 Q110 152 126 130 Q110 136 94 130z" fill="#7A1F1F" />
        <path d="M101 140 Q110 148 119 140 Q110 137 101 140z" fill="#F47A86" />

        {pose === 'peek' && (
          <>
            <circle cx="66" cy="160" r="13" fill={fur} />
            <circle cx="154" cy="160" r="13" fill={fur} />
          </>
        )}
      </g>
    </svg>
  )
}
