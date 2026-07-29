import vietnam from '@svg-maps/vietnam'
import world from '@svg-maps/world'
import {
  ArrowUpRight,
  Award,
  BadgeCheck,
  BookOpenCheck,
  BriefcaseBusiness,
  Cpu,
  Globe2,
  GraduationCap,
  Network,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

const ECOSYSTEM_ITEMS = [
  {
    Icon: BookOpenCheck,
    eyebrow: '123 TEACHING METHOD™',
    title: 'Phương pháp vượt trội',
    copy: 'Phương pháp độc quyền 3 bước: tập trung, tương tác và thực hành ngay trong lớp.',
    tone: 'blue',
  },
  {
    Icon: Network,
    eyebrow: '123 LEARNING PATH',
    title: 'Lộ trình bứt phá',
    copy: '9 cấp độ rõ ràng: Nền tảng, Thực chiến và Bứt phá.',
    tone: 'yellow',
  },
  {
    Icon: GraduationCap,
    eyebrow: '123 TEACHERS',
    title: 'Đội ngũ tinh tuyển',
    copy: 'Giáo viên đạt chuẩn, trải qua 60+ giờ đào tạo nội bộ và có trình độ từ B2+.',
    tone: 'mint',
  },
  {
    Icon: Cpu,
    eyebrow: '123 LEARNING TECHNOLOGY',
    title: 'Ứng dụng công nghệ',
    copy: 'Theo dõi tiến độ và cá nhân hóa trải nghiệm học tập cho từng học viên.',
    tone: 'rose',
  },
  {
    Icon: BadgeCheck,
    eyebrow: '123 QUALITY VERIFICATION',
    title: 'Chuẩn hóa chất lượng',
    copy: 'Theo dõi, phản hồi và cải thiện chất lượng qua từng buổi học.',
    tone: 'blue',
  },
  {
    Icon: BriefcaseBusiness,
    eyebrow: '123 BUSINESS SOLUTIONS',
    title: 'Giải pháp doanh nghiệp',
    copy: 'Chương trình được thiết kế theo nhu cầu thực tế của từng tổ chức.',
    tone: 'yellow',
  },
] as const

/**
 * Chuyển toạ độ địa lý (vĩ độ / kinh độ) sang toạ độ trên bản đồ SVG.
 *
 * Bản đồ nền `@svg-maps/world` vẽ theo phép chiếu MERCATOR, không phải phép
 * chiếu tuyến tính. Trước đây dùng công thức tuyến tính nên mọi điểm đánh dấu
 * đều lệch khỏi vị trí thật.
 *
 * Hệ số dưới đây được hiệu chuẩn bằng cách đối chiếu hộp bao của 9 quốc gia
 * trong chính file bản đồ với toạ độ địa lý thật của các nước đó
 * (độ khớp R² ≈ 0.98).
 */
const PROJECTION = {
  lonScale: 2.78149,
  lonOffset: 477.583,
  latScale: -159.85237,
  latOffset: 464.35,
}

/** Toạ độ Y theo Mercator: ln(tan(45° + vĩ độ / 2)). */
function mercatorY(latitude: number) {
  const clamped = Math.max(-84, Math.min(84, latitude))
  return Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360))
}

function projectCoordinates(latitude: number, longitude: number) {
  return {
    x: PROJECTION.lonScale * longitude + PROJECTION.lonOffset,
    y: PROJECTION.latScale * mercatorY(latitude) + PROJECTION.latOffset,
  }
}

const DESTINATIONS = [
  { name: 'Nhật Bản', city: 'Tokyo', latitude: 35.6762, longitude: 139.6503, labelDx: -18, labelDy: -10, anchor: 'end' },
  { name: 'Hàn Quốc', city: 'Seoul', latitude: 37.5665, longitude: 126.978, labelDx: -18, labelDy: 12, anchor: 'end' },
  { name: 'Trung Quốc', city: 'Bắc Kinh', latitude: 39.9042, longitude: 116.4074, labelDx: -18, labelDy: -12, anchor: 'end' },
  { name: 'Đài Loan', city: 'Đài Bắc', latitude: 25.033, longitude: 121.5654, labelDx: 18, labelDy: -8, anchor: 'start' },
  { name: 'Hồng Kông', city: 'Hồng Kông', latitude: 22.3193, longitude: 114.1694, labelDx: -16, labelDy: -26, anchor: 'end' },
  { name: 'Thái Lan', city: 'Bangkok', latitude: 13.7563, longitude: 100.5018, labelDx: 18, labelDy: 20, anchor: 'start' },
  { name: 'Lào', city: 'Viêng Chăn', latitude: 17.9757, longitude: 102.6331, labelDx: -18, labelDy: -15, anchor: 'end' },
  { name: 'Campuchia', city: 'Phnom Penh', latitude: 11.5564, longitude: 104.9282, labelDx: -20, labelDy: 40, anchor: 'end' },
  { name: 'Malaysia', city: 'Kuala Lumpur', latitude: 3.139, longitude: 101.6869, labelDx: 18, labelDy: 12, anchor: 'start' },
  { name: 'Indonesia', city: 'Jakarta', latitude: -6.2088, longitude: 106.8456, labelDx: 18, labelDy: 20, anchor: 'start' },
  { name: 'Nga', city: 'Moscow', latitude: 55.7558, longitude: 37.6173, labelDx: 18, labelDy: -6, anchor: 'start' },
  { name: 'Pháp', city: 'Paris', latitude: 48.8566, longitude: 2.3522, labelDx: -18, labelDy: -8, anchor: 'end' },
  { name: 'Tây Ban Nha', city: 'Madrid', latitude: 40.4168, longitude: -3.7038, labelDx: -18, labelDy: 22, anchor: 'end' },
  { name: 'Cộng hòa Séc', city: 'Prague', latitude: 50.0755, longitude: 14.4378, labelDx: 18, labelDy: -9, anchor: 'start' },
].map((destination) => ({ ...destination, ...projectCoordinates(destination.latitude, destination.longitude) }))

/**
 * Khung nhìn của bản đồ: thu gọn về khu vực châu Á để Việt Nam hiện đủ lớn,
 * thay vì trải cả thế giới khiến hình chữ S nhỏ tới mức không nhìn ra.
 * Toạ độ dưới đây bao trọn mọi điểm đến châu Á, hai quần đảo và toàn bộ nhãn.
 */
const MAP_VIEWBOX = { x: 655, y: 306, width: 270, height: 216 }

/**
 * Hệ số thu nhỏ cho chữ, chấm tròn và khoảng cách nhãn.
 * Khung nhìn hẹp lại nghĩa là mọi thứ được phóng to theo, nên các kích thước
 * hiển thị phải nhân với hệ số này để giữ nguyên độ lớn như thiết kế cũ.
 */
const MAP_SCALE = MAP_VIEWBOX.width / 1010

/** Điểm đến nằm trong khung nhìn châu Á -> vẽ trực tiếp trên bản đồ. */
const ASIA_DESTINATIONS = DESTINATIONS.filter(
  (d) => d.x >= MAP_VIEWBOX.x && d.x <= MAP_VIEWBOX.x + MAP_VIEWBOX.width
)

/** Điểm đến ngoài khung nhìn (châu Âu) -> liệt kê thành hàng riêng bên dưới. */
const OTHER_DESTINATIONS = DESTINATIONS.filter(
  (d) => d.x < MAP_VIEWBOX.x || d.x > MAP_VIEWBOX.x + MAP_VIEWBOX.width
)

const AWARDS = [
  {
    image: '/brand-national-award-2026.jpg',
    title: 'Dấu ấn thương hiệu giáo dục',
    copy: '123English tại chương trình vinh danh Thương hiệu mạnh quốc gia 2026.',
  },
  {
    image: '/brand-award-recipient-2026.jpg',
    title: 'Ghi nhận cho hành trình bền bỉ',
    copy: 'Những cột mốc được xây dựng từ chất lượng lớp học và niềm tin của gia đình.',
  },
  {
    image: '/brand-award-stage-2026.jpg',
    title: 'Kết nối trong cộng đồng doanh nghiệp',
    copy: 'Mở rộng hợp tác để đưa trải nghiệm học tập Việt Nam đến gần hơn với thế giới.',
  },
] as const

const BRAND_TIMELINE = [
  {
    year: '2021',
    title: 'Khởi nguồn',
    copy: 'Hình thành định hướng giáo dục tiếng Anh thực tế, dễ tiếp cận và lấy người học làm trung tâm.',
  },
  {
    year: '2022',
    title: 'Định hình phương pháp',
    copy: '123 Teaching Method™ được xây dựng trên ba nguyên tắc: tập trung, tương tác và thực hành.',
  },
  {
    year: '2023',
    title: 'Kiến tạo hệ sinh thái',
    copy: 'Chương trình, giáo viên, quy trình đào tạo và công nghệ được kết nối trong một hệ thống thống nhất.',
  },
  {
    year: '2024',
    title: '1.000 học viên',
    copy: 'Một nghìn điểm bắt đầu, mục tiêu riêng và hành trình tiến bộ được cộng đồng gia đình tin tưởng.',
  },
  {
    year: '2025',
    title: 'Mở rộng hệ thống',
    copy: 'Đa dạng chương trình học, hoàn thiện vận hành và đầu tư công nghệ cho trải nghiệm nhất quán.',
  },
  {
    year: '2026',
    title: 'Kết nối quốc tế',
    copy: 'Cộng đồng học viên được kết nối với giáo viên, kiến thức và cơ hội tại hơn 10 quốc gia.',
  },
] as const

const TRUST_SIGNALS = [
  {
    Icon: ShieldCheck,
    value: 'Từ 2021',
    label: 'Phát triển hệ thống học tập',
    tone: 'blue',
  },
  {
    Icon: GraduationCap,
    value: '1.000+',
    label: 'Học viên đã đồng hành',
    tone: 'yellow',
  },
  {
    Icon: Globe2,
    value: '10+ quốc gia',
    label: 'Cộng đồng học viên kết nối',
    tone: 'mint',
  },
  {
    Icon: Award,
    value: '60+ giờ',
    label: 'Đào tạo nội bộ cho giáo viên',
    tone: 'rose',
  },
] as const

const STUDENT_MILESTONES = [
  'Dám nói câu tiếng Anh đầu tiên.',
  'Giao tiếp tự tin hơn mỗi ngày.',
  'Vượt qua nỗi sợ mắc lỗi.',
  'Đạt được mục tiêu học tập.',
  'Mở ra một cơ hội mới cho bản thân.',
] as const

/**
 * Quần đảo Hoàng Sa và Trường Sa — khai báo bằng toạ độ địa lý THẬT của các
 * đảo/đá tiêu biểu rồi chiếu lên bản đồ, thay vì gán cứng toạ độ pixel.
 * Nhờ vậy các cụm đảo luôn nằm đúng vị trí trên Biển Đông.
 */
/**
 * Vị trí đặt bản đồ Việt Nam chi tiết lên bản đồ thế giới.
 *
 * Khung bao được tính từ chính toạ độ địa lý của đất liền Việt Nam
 * (cực Bắc Lũng Cú 23.39°N, cực Nam mũi Cà Mau 8.56°N,
 *  cực Tây A Pa Chải 102.14°E, cực Đông mũi Đôi 109.47°E)
 * nên hình chữ S nằm khít đúng chỗ trên bản đồ nền.
 *
 * `viewBox` là hộp bao phần ĐẤT LIỀN trong bộ bản đồ Việt Nam (đã loại hai
 * quần đảo, vì hai quần đảo được vẽ riêng bằng toạ độ thật ở trên).
 */
const VIETNAM_BOUNDS = { north: 23.393, south: 8.559, west: 102.144, east: 109.469 }

const VIETNAM_PLACEMENT = (() => {
  const topLeft = projectCoordinates(VIETNAM_BOUNDS.north, VIETNAM_BOUNDS.west)
  const bottomRight = projectCoordinates(VIETNAM_BOUNDS.south, VIETNAM_BOUNDS.east)
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
    // Hộp bao phần đất liền trong @svg-maps/vietnam (đo từ dữ liệu path)
    viewBox: '0 0 380.51 800',
  }
})()

/**
 * Điểm nhấn "Việt Nam": đặt ngoài khơi miền Trung (không phủ lên đất liền) và
 * nối bằng nét chỉ dẫn về đúng vùng Tây Nguyên trên lãnh thổ.
 */
const VIETNAM_HUB = projectCoordinates(12.6, 112.6)
const VIETNAM_ANCHOR = projectCoordinates(13.9, 108.4)

/** Nhãn quần đảo — đặt lệch sang phải cụm đảo để không che các chấm. */
const HOANG_SA_LABEL = (() => {
  const p = projectCoordinates(16.4, 113.4)
  return { x: p.x + 8, y: p.y }
})()
const TRUONG_SA_LABEL = (() => {
  const p = projectCoordinates(8.9, 114.8)
  return { x: p.x + 5, y: p.y }
})()

const HOANG_SA_ISLANDS: [number, number, number][] = [
  // [vĩ độ, kinh độ, bán kính chấm]
  [16.83, 112.34, 2.9], // Phú Lâm
  [16.53, 111.61, 2.4], // Hoàng Sa (Pattle)
  [16.45, 111.70, 2.1], // Hữu Nhật
  [16.97, 112.26, 2.2], // Đảo Cây
  [16.72, 112.74, 2.5], // Linh Côn
  [16.34, 111.68, 2.0], // Quang Ảnh
  [16.03, 112.55, 2.3], // Bãi Bông Bay
  [15.78, 111.19, 2.1], // Tri Tôn
]

const TRUONG_SA_ISLANDS: [number, number, number][] = [
  [11.05, 114.28, 2.6], // Thị Tứ
  [10.72, 115.82, 2.3], // Vành Khăn
  [10.37, 114.36, 2.8], // Sinh Tồn
  [10.18, 114.22, 2.2], // Gạc Ma
  [9.88, 114.34, 2.4],  // Châu Viên
  [8.64, 111.92, 2.7],  // Trường Sa Lớn
  [8.85, 112.90, 2.1],  // Đá Tây
  [9.60, 112.90, 2.5],  // Nam Yết
  [10.83, 114.37, 2.2], // Song Tử Tây
  [7.38, 113.80, 2.3],  // An Bang
  [8.10, 113.30, 2.0],  // Thuyền Chài
  [9.20, 113.60, 2.4],  // Phan Vinh
]

function VietnamGlobalMap() {
  return (
    <div className="national-map-stage" aria-label="Bản đồ Việt Nam kết nối với các điểm đến quốc tế">
      <svg
        viewBox={`${MAP_VIEWBOX.x} ${MAP_VIEWBOX.y} ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
        role="img"
        className="h-auto w-full"
      >
        <defs>
          <filter id="vn-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="hub-glow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="national-world-map" aria-hidden="true">
          {world.locations.map((location: { id: string; name: string; path: string }) => (
            <path key={location.id} d={location.path} />
          ))}
        </g>

        {/*
          Bản đồ Việt Nam chi tiết được đặt CHỒNG KHÍT lên đúng vị trí Việt Nam
          của bản đồ thế giới (Đông Nam Á), theo đúng tỷ lệ địa lý thật —
          xem VIETNAM_PLACEMENT để biết cách tính.
        */}
        <svg
          x={VIETNAM_PLACEMENT.x}
          y={VIETNAM_PLACEMENT.y}
          width={VIETNAM_PLACEMENT.width}
          height={VIETNAM_PLACEMENT.height}
          viewBox={VIETNAM_PLACEMENT.viewBox}
          preserveAspectRatio="none"
          overflow="visible"
        >
          {vietnam.locations.map((location: { id: string; name: string; path: string }) => {
            const isIsland = location.id === 'hoangsa' || location.id === 'truongsa'
            if (isIsland) return null
            return (
              <path
                key={location.id}
                d={location.path}
                className="national-map-province"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>

        <g className="national-island-cluster" aria-hidden="true">
          {HOANG_SA_ISLANDS.map(([lat, lon, r], index) => {
            const { x, y } = projectCoordinates(lat, lon)
            return <circle key={`hoang-sa-${index}`} cx={x} cy={y} r={r * MAP_SCALE} style={{ animationDelay: `${index * 0.12}s` }} />
          })}
          {TRUONG_SA_ISLANDS.map(([lat, lon, r], index) => {
            const { x, y } = projectCoordinates(lat, lon)
            return <circle key={`truong-sa-${index}`} cx={x} cy={y} r={r * MAP_SCALE} style={{ animationDelay: `${0.45 + index * 0.1}s` }} />
          })}
        </g>

        {/*
          Điểm nhấn Việt Nam. Bán kính được thu nhỏ cho cân xứng với kích thước
          thật của lãnh thổ trên bản đồ (rộng ~20px), tránh che mất hình chữ S.
          Điểm được đặt ngoài khơi miền Trung và nối vào đất liền bằng một nét
          chỉ dẫn, nhờ vậy vẫn nổi bật mà không phủ lên bản đồ.
        */}
        <g className="national-map-hub" filter="url(#hub-glow)">
          <line
            className="national-map-hub-leader"
            x1={VIETNAM_HUB.x}
            y1={VIETNAM_HUB.y}
            x2={VIETNAM_ANCHOR.x}
            y2={VIETNAM_ANCHOR.y}
          />
          <circle cx={VIETNAM_HUB.x} cy={VIETNAM_HUB.y} r={9 * MAP_SCALE} />
          <circle cx={VIETNAM_HUB.x} cy={VIETNAM_HUB.y} r={4 * MAP_SCALE} />
          <circle className="national-map-pulse" cx={VIETNAM_HUB.x} cy={VIETNAM_HUB.y} r={14 * MAP_SCALE} />
          <text
            x={VIETNAM_HUB.x}
            y={VIETNAM_HUB.y + 22 * MAP_SCALE}
            textAnchor="middle"
          >
            Việt Nam
          </text>
        </g>

        {ASIA_DESTINATIONS.map((destination, index) => {
          const textX = destination.x + destination.labelDx * MAP_SCALE
          const textY = destination.y + destination.labelDy * MAP_SCALE
          return (
            <g key={destination.name} className="national-map-destination" style={{ animationDelay: `${index * 0.12}s` }}>
              <circle cx={destination.x} cy={destination.y} r={3.4 * MAP_SCALE} />
              <circle className="national-map-pulse" cx={destination.x} cy={destination.y} r={6.4 * MAP_SCALE} />
              <text x={textX} y={textY} textAnchor={destination.anchor as 'start' | 'end'}>
                {destination.name}
              </text>
              <text
                className="national-map-city"
                x={textX}
                y={textY + 17 * MAP_SCALE}
                textAnchor={destination.anchor as 'start' | 'end'}
              >
                {destination.city}
              </text>
            </g>
          )
        })}

        {/* Nhãn hai quần đảo — neo theo đúng cụm đảo đã chiếu ở trên */}
        <g className="national-island-label">
          <text x={HOANG_SA_LABEL.x} y={HOANG_SA_LABEL.y}>QUẦN ĐẢO</text>
          <text x={HOANG_SA_LABEL.x} y={HOANG_SA_LABEL.y + 19 * MAP_SCALE}>HOÀNG SA</text>
          <text x={TRUONG_SA_LABEL.x} y={TRUONG_SA_LABEL.y}>QUẦN ĐẢO</text>
          <text x={TRUONG_SA_LABEL.x} y={TRUONG_SA_LABEL.y + 19 * MAP_SCALE}>TRƯỜNG SA</text>
        </g>
      </svg>

      {/*
        Danh sách điểm đến dạng thẻ.
        - Máy tính: chỉ liệt kê các nước NGOÀI khung nhìn châu Á (châu Âu),
          vì các nước châu Á đã có nhãn ngay trên bản đồ.
        - Điện thoại: bản đồ quá hẹp nên nhãn bị chồng nhau — khi đó nhãn trên
          bản đồ được ẩn và toàn bộ điểm đến hiện ở danh sách này.
      */}
      <div className="national-map-outside">
        <span className="national-map-outside-label">Cộng đồng học viên tại</span>
        <ul>
          {ASIA_DESTINATIONS.map((destination) => (
            <li key={destination.name} className="national-map-outside-asia">
              <span className="national-map-outside-dot" aria-hidden="true" />
              <span>
                <strong>{destination.name}</strong>
                <em>{destination.city}</em>
              </span>
            </li>
          ))}
          {OTHER_DESTINATIONS.map((destination) => (
            <li key={destination.name}>
              <span className="national-map-outside-dot" aria-hidden="true" />
              <span>
                <strong>{destination.name}</strong>
                <em>{destination.city}</em>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function NationalBrandStory() {
  return (
    <div className="national-home">
      <section className="national-section national-section-ecosystem">
        <div className="national-container">
          <div className="national-heading">
            <span className="national-kicker">
              <Sparkles className="h-4 w-4" />
              123 ENGLISH ECOSYSTEM
            </span>
            <h2>Một hệ sinh thái học tập.</h2>
            <p>
              Kết nối phương pháp, lộ trình, giáo viên và công nghệ trong một trải nghiệm thống nhất.
            </p>
          </div>

          <div className="national-ecosystem-grid">
            <article className="national-ecosystem-feature">
              <img
                src="/home-hero-vietnam-2026-v2.png"
                alt="Gia đình đồng hành cùng học viên trong lớp học trực tuyến"
                loading="lazy"
              />
              <div>
                <span className="national-feature-mark">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <h3>Học trực tuyến gần gũi, rõ ràng và có người theo sát.</h3>
                <p>
                  Nội dung học, nhận xét và bước tiếp theo được lưu lại để gia đình dễ dàng theo dõi hành trình.
                </p>
              </div>
            </article>

            <div className="national-ecosystem-list">
              {ECOSYSTEM_ITEMS.map(({ Icon, eyebrow, title, copy, tone }) => (
                <article key={title} className={`national-ecosystem-item is-${tone}`}>
                  <span><Icon className="h-5 w-5" /></span>
                  <div>
                    <small>{eyebrow}</small>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="national-section national-section-trust">
        <div className="national-container">
          <div className="national-trust-signals" aria-label="Những dấu mốc phát triển của 123English">
            {TRUST_SIGNALS.map(({ Icon, value, label, tone }) => (
              <article key={value} className={`national-trust-signal is-${tone}`}>
                <span><Icon className="h-5 w-5" /></span>
                <strong>{value}</strong>
                <p>{label}</p>
              </article>
            ))}
          </div>

          <div className="national-growth-story">
            <div className="national-growth-heading">
              <h2>Hành trình phát triển</h2>
              <p>Từng cột mốc góp phần hoàn thiện một hệ sinh thái học tập rõ ràng và bền vững.</p>
            </div>
            <div className="national-growth-track">
              {BRAND_TIMELINE.map((milestone) => (
                <article key={milestone.year} className="national-growth-item">
                  <strong>{milestone.year}</strong>
                  <span aria-hidden="true" />
                  <h3>{milestone.title}</h3>
                  <p>{milestone.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="national-section national-section-map">
        <div className="national-container">
          <div className="national-heading national-heading-centered">
            <span className="national-kicker">
              <Globe2 className="h-4 w-4" />
              Kết nối từ Việt Nam
            </span>
            <h2>Cộng đồng học viên tại 10+ quốc gia</h2>
            <p>
              Lan tỏa giá trị giáo dục Việt đến cộng đồng học viên trên khắp thế giới.
            </p>
          </div>
          <VietnamGlobalMap />
        </div>
      </section>

      <section className="national-section national-section-awards">
        <div className="national-container">
          <div className="national-milestones-intro">
            <div className="national-milestones-title">
              <span className="national-kicker">
                <Award className="h-4 w-4" />
                Dấu ấn được ghi nhận
              </span>
              <h2>Những cột mốc đáng nhớ.</h2>
            </div>

            <div className="national-milestones-copy">
              <div className="national-milestones-opening">
                Mỗi giải thưởng, chứng nhận hay cột mốc đều là sự ghi nhận cho một chặng đường đã đi qua.
                Nhưng với 123English, thành tựu lớn nhất không chỉ nằm ở những con số.
              </div>
              <p className="national-milestones-lead">Thành tựu thật bắt đầu khi một học viên:</p>
              <div className="national-milestones-grid">
                {STUDENT_MILESTONES.map((milestone) => (
                  <div key={milestone}>
                    <BadgeCheck className="h-5 w-5" />
                    <span>{milestone}</span>
                  </div>
                ))}
              </div>
              <strong>EVERY MILESTONE MOVES US FORWARD.</strong>
            </div>
          </div>

          <div className="national-award-gallery">
            {AWARDS.map((award, index) => (
              <article key={award.title} className={index === 0 ? 'is-featured' : ''}>
                <img src={award.image} alt={award.title} loading="lazy" />
                <div>
                  <h3>{award.title}</h3>
                  <p>{award.copy}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="national-trust-cta">
            <span className="national-feature-mark">
              <Globe2 className="h-5 w-5" />
            </span>
            <div>
              <h3>Bắt đầu từ một lộ trình phù hợp với chính bạn.</h3>
              <p>Tra cứu tiến độ đang có hoặc trao đổi trực tiếp với đội ngũ 123English.</p>
            </div>
            <a href="#tra-cuu">
              Tra cứu tiến độ
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
