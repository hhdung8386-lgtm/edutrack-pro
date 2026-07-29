import vietnam from '@svg-maps/vietnam'
import world from '@svg-maps/world'
import {
  ArrowUpRight,
  Award,
  BookOpenCheck,
  Globe2,
  Headphones,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { Logo } from '@/components/shared/Logo'

const ECOSYSTEM_ITEMS = [
  {
    Icon: Headphones,
    title: 'Lớp học trực tuyến 1 kèm 1',
    copy: 'Mỗi buổi học tập trung vào đúng năng lực và mục tiêu cần cải thiện.',
    tone: 'blue',
  },
  {
    Icon: BookOpenCheck,
    title: 'Giáo trình theo từng chặng',
    copy: 'Lộ trình rõ ràng từ nền tảng, thực chiến đến chuyên sâu.',
    tone: 'yellow',
  },
  {
    Icon: MessageCircleMore,
    title: 'Nhận xét sau từng buổi',
    copy: 'Phụ huynh theo dõi được nội dung học, phản hồi và tiến bộ của học viên.',
    tone: 'mint',
  },
  {
    Icon: UsersRound,
    title: 'Đồng hành cùng gia đình',
    copy: 'Học vụ, giáo viên và phụ huynh cùng kết nối trong một hành trình thống nhất.',
    tone: 'rose',
  },
] as const

const DESTINATIONS = [
  { name: 'Canada', city: 'Vancouver', x: 95, y: 100, bend: -72 },
  { name: 'United States', city: 'New York', x: 75, y: 228, bend: -20 },
  { name: 'Mexico', city: 'Mexico City', x: 85, y: 350, bend: 35 },
  { name: 'Brazil', city: 'São Paulo', x: 150, y: 495, bend: 78 },
  { name: 'Argentina', city: 'Buenos Aires', x: 160, y: 606, bend: 120 },
  { name: 'United Kingdom', city: 'London', x: 525, y: 58, bend: -160 },
  { name: 'France', city: 'Paris', x: 575, y: 130, bend: -116 },
  { name: 'Germany', city: 'Frankfurt', x: 700, y: 78, bend: -154 },
  { name: 'Russia', city: 'Moscow', x: 902, y: 136, bend: -98 },
  { name: 'Japan', city: 'Tokyo', x: 850, y: 260, bend: -54 },
  { name: 'South Korea', city: 'Seoul', x: 850, y: 336, bend: -16 },
  { name: 'China', city: 'Shanghai', x: 820, y: 414, bend: 26 },
  { name: 'Singapore', city: 'Singapore', x: 785, y: 506, bend: 64 },
  { name: 'Australia', city: 'Sydney', x: 735, y: 594, bend: 105 },
  { name: 'New Zealand', city: 'Auckland', x: 890, y: 638, bend: 130 },
] as const

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
  { year: '2011', copy: 'Khởi đầu định hướng học tiếng Anh trực tuyến theo mô hình 1 kèm 1.' },
  { year: '2013', copy: 'Hoàn thiện mô hình kết nối giáo viên và học viên từ xa.' },
  { year: '2015', copy: 'Mở rộng giáo trình theo độ tuổi và năng lực đầu vào.' },
  { year: '2016', copy: 'Chuẩn hóa quy trình theo dõi tiến độ sau từng buổi học.' },
  { year: '2017', copy: 'Phát triển đội ngũ học vụ đồng hành cùng học viên và gia đình.' },
  { year: '2018', copy: 'Mở rộng mạng lưới giáo viên Việt Nam và quốc tế.' },
  { year: '2019', copy: 'Hoàn thiện hệ thống nhận xét và đánh giá năng lực.' },
  { year: '2020', copy: 'Đẩy mạnh lớp học trực tuyến và giáo trình số.' },
  { year: '2021', copy: 'Cá nhân hóa lộ trình theo mục tiêu của từng học viên.' },
  { year: '2022', copy: 'Kết nối lịch học, giáo viên và dữ liệu tiến độ trong một hệ thống.' },
  { year: '2023', copy: 'Mở rộng chương trình học thuật và luyện thi quốc tế.' },
  { year: '2026', copy: 'Tiếp tục nâng chuẩn trải nghiệm học tập cùng thương hiệu 123English.' },
] as const

const HOANG_SA_DOTS = [
  [556, 321, 2.8],
  [566, 317, 2.2],
  [577, 324, 3.1],
  [588, 320, 2.1],
  [562, 331, 2.3],
  [573, 336, 2.7],
  [585, 333, 2.4],
  [594, 340, 2.9],
  [565, 345, 2.1],
  [579, 348, 2.5],
] as const

const TRUONG_SA_DOTS = [
  [552, 447, 2.5],
  [562, 454, 2.1],
  [575, 449, 2.9],
  [588, 456, 2.2],
  [598, 464, 2.7],
  [558, 466, 2.2],
  [570, 472, 2.8],
  [583, 477, 2.1],
  [594, 482, 3],
  [606, 476, 2.3],
  [564, 484, 2.4],
  [578, 491, 2.8],
  [592, 496, 2.1],
  [604, 491, 2.5],
] as const

function routePath(x: number, y: number, bend: number) {
  const startX = 508
  const startY = 374
  const controlX = (startX + x) / 2
  const controlY = (startY + y) / 2 + bend
  return `M ${startX} ${startY} Q ${controlX} ${controlY} ${x} ${y}`
}

function VietnamGlobalMap() {
  return (
    <div className="national-map-stage" aria-label="Bản đồ Việt Nam kết nối với các điểm đến quốc tế">
      <svg viewBox="0 0 1010 666" role="img" className="h-auto w-full">
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

        {DESTINATIONS.map((destination, index) => (
          <path
            key={`route-${destination.name}`}
            className="national-map-route"
            style={{ animationDelay: `${index * 0.18}s` }}
            d={routePath(destination.x, destination.y, destination.bend)}
            fill="none"
            pathLength="1"
          />
        ))}

        <svg x="344" y="54" width="315" height="510" viewBox={vietnam.viewBox} preserveAspectRatio="xMidYMid meet">
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
          {HOANG_SA_DOTS.map(([cx, cy, r], index) => (
            <circle key={`hoang-sa-${index}`} cx={cx} cy={cy} r={r} style={{ animationDelay: `${index * 0.12}s` }} />
          ))}
          {TRUONG_SA_DOTS.map(([cx, cy, r], index) => (
            <circle key={`truong-sa-${index}`} cx={cx} cy={cy} r={r} style={{ animationDelay: `${0.45 + index * 0.1}s` }} />
          ))}
        </g>

        <g className="national-map-hub" filter="url(#hub-glow)">
          <circle cx="508" cy="374" r="20" />
          <circle cx="508" cy="374" r="9" />
          <circle className="national-map-pulse" cx="508" cy="374" r="29" />
        </g>

        {DESTINATIONS.map((destination, index) => {
          const alignRight = destination.x < 500
          const textX = destination.x + (alignRight ? 12 : -12)
          return (
            <g key={destination.name} className="national-map-destination" style={{ animationDelay: `${index * 0.12}s` }}>
              <circle cx={destination.x} cy={destination.y} r="6" />
              <circle className="national-map-pulse" cx={destination.x} cy={destination.y} r="12" />
              <text x={textX} y={destination.y - 5} textAnchor={alignRight ? 'start' : 'end'}>
                {destination.name}
              </text>
              <text className="national-map-city" x={textX} y={destination.y + 12} textAnchor={alignRight ? 'start' : 'end'}>
                {destination.city}
              </text>
            </g>
          )
        })}

        <g className="national-island-label">
          <line x1="592" y1="329" x2="635" y2="306" />
          <text x="643" y="304">QUẦN ĐẢO</text>
          <text x="643" y="321">HOÀNG SA</text>
          <line x1="598" y1="480" x2="636" y2="510" />
          <text x="644" y="511">QUẦN ĐẢO</text>
          <text x="644" y="528">TRƯỜNG SA</text>
        </g>
      </svg>
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
              Hệ sinh thái học tập 123English
            </span>
            <h2>Học đúng lộ trình, tiến bộ rõ ràng qua từng buổi.</h2>
            <p>
              Giáo viên, giáo trình và phản hồi được kết nối để mỗi học viên luôn biết bước tiếp theo của mình.
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
              {ECOSYSTEM_ITEMS.map(({ Icon, title, copy, tone }) => (
                <article key={title} className={`national-ecosystem-item is-${tone}`}>
                  <span><Icon className="h-5 w-5" /></span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
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
              Từ Việt Nam vươn ra thế giới
            </span>
            <h2>Một hành trình học tập mở ra nhiều điểm đến.</h2>
            <p>
              Năng lực ngôn ngữ giúp học viên tự tin kết nối, học tập và làm việc trong môi trường quốc tế.
            </p>
          </div>
          <VietnamGlobalMap />
        </div>
      </section>

      <section className="national-section national-section-timeline">
        <div className="national-container">
          <div className="national-heading national-heading-centered">
            <span className="national-kicker">
              <Sparkles className="h-4 w-4" />
              Hành trình phát triển
            </span>
            <h2>Những cột mốc của 123English.</h2>
            <p>
              Từng bước hoàn thiện hệ thống học tập, đội ngũ đồng hành và trải nghiệm dành cho mỗi gia đình.
            </p>
          </div>

          <div className="national-timeline">
            <div className="national-timeline-logo">
              <Logo className="h-9 w-auto" clickable={false} />
            </div>
            {Array.from({ length: Math.ceil(BRAND_TIMELINE.length / 2) }, (_, rowIndex) => {
              const leftMilestone = BRAND_TIMELINE[rowIndex * 2]
              const rightMilestone = BRAND_TIMELINE[rowIndex * 2 + 1]
              return (
                <div className="national-timeline-row" key={`${leftMilestone.year}-${rightMilestone?.year || ''}`}>
                  <article className="national-timeline-item">
                    <strong>{leftMilestone.year}</strong>
                    <p>{leftMilestone.copy}</p>
                  </article>
                  <span className="national-timeline-dot" aria-hidden="true" />
                  {rightMilestone && (
                    <article className="national-timeline-item">
                      <strong>{rightMilestone.year}</strong>
                      <p>{rightMilestone.copy}</p>
                    </article>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="national-section national-section-awards">
        <div className="national-container">
          <div className="national-heading national-heading-centered">
            <span className="national-kicker">
              <Award className="h-4 w-4" />
              Dấu ấn được ghi nhận
            </span>
            <h2>Niềm tin được bồi đắp qua từng cột mốc.</h2>
            <p>
              Hình ảnh thật từ hành trình phát triển thương hiệu, kết nối cộng đồng và nâng cao chất lượng giáo dục.
            </p>
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
