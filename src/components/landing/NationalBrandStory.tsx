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
  { name: 'Nhật Bản', city: 'Tokyo', x: 898, y: 222 },
  { name: 'Hàn Quốc', city: 'Seoul', x: 850, y: 278 },
  { name: 'Trung Quốc', city: 'Bắc Kinh', x: 794, y: 334 },
  { name: 'Đài Loan', city: 'Đài Bắc', x: 866, y: 378 },
  { name: 'Hồng Kông', city: 'Hồng Kông', x: 804, y: 420 },
  { name: 'Thái Lan', city: 'Bangkok', x: 738, y: 466 },
  { name: 'Lào', city: 'Viêng Chăn', x: 670, y: 425 },
  { name: 'Campuchia', city: 'Phnom Penh', x: 684, y: 488 },
  { name: 'Malaysia', city: 'Kuala Lumpur', x: 770, y: 532 },
  { name: 'Indonesia', city: 'Jakarta', x: 842, y: 580 },
  { name: 'Nga', city: 'Moscow', x: 918, y: 105 },
  { name: 'Pháp', city: 'Paris', x: 615, y: 94 },
  { name: 'Tây Ban Nha', city: 'Madrid', x: 535, y: 142 },
  { name: 'Cộng hòa Séc', city: 'Prague', x: 700, y: 78 },
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
  {
    year: '2021',
    era: 'THE BEGINNING',
    title: 'KHỞI NGUỒN',
    paragraphs: [
      '123English chính thức được hình thành với một định hướng rõ ràng:',
      'Xây dựng một hệ thống giáo dục tiếng Anh thực tế, dễ tiếp cận và lấy người học làm trung tâm.',
      'Từ những bước đầu tiên, 123English bắt đầu đặt nền móng cho một hành trình dài hơn — nơi tiếng Anh không chỉ được học trong sách vở mà được sử dụng như một công cụ để kết nối với thế giới.',
    ],
  },
  {
    year: '2022',
    era: 'THE METHOD',
    title: 'ĐỊNH HÌNH PHƯƠNG PHÁP',
    paragraphs: [
      'Sau quá trình nghiên cứu và phát triển, 123 Teaching Method™ được hình thành.',
      'Một phương pháp học tập được xây dựng trên ba nguyên tắc:',
    ],
    points: [
      'Tập trung vào một trọng tâm.',
      'Tương tác thông qua trò chơi.',
      'Thực hành ngay trong lớp học.',
    ],
    closing: 'Đây trở thành nền tảng trong cách 123English thiết kế bài học và xây dựng trải nghiệm học tập.',
  },
  {
    year: '2023',
    era: 'THE ECOSYSTEM',
    title: 'KIẾN TẠO HỆ SINH THÁI',
    paragraphs: [
      'Từ một phương pháp giảng dạy, 123English bắt đầu phát triển thành một hệ thống giáo dục toàn diện hơn.',
      'Chương trình học, đội ngũ giáo viên, quy trình đào tạo và công nghệ được từng bước kết nối để tạo nên một hệ sinh thái học tập thống nhất.',
      'Đây là giai đoạn 123English chuyển mình:',
    ],
    points: [
      'Từ một chương trình học',
      'Trở thành một hệ thống giáo dục.',
    ],
  },
  {
    year: '2024',
    era: 'THE MILESTONE',
    title: 'CỘT MỐC 1.000 HỌC VIÊN',
    paragraphs: [
      '123English chạm mốc 1.000 học viên.',
      'Đằng sau con số đó là 1.000 hành trình học tập khác nhau.',
    ],
    points: [
      '1.000 điểm bắt đầu.',
      '1.000 mục tiêu.',
      'Và hàng nghìn giờ học, thực hành và tiến bộ.',
    ],
    closing: 'Cột mốc này đánh dấu sự tin tưởng của cộng đồng người học dành cho 123English — đồng thời trở thành động lực để chúng tôi tiếp tục phát triển.',
  },
  {
    year: '2025',
    era: 'THE EXPANSION',
    title: 'MỞ RỘNG HỆ THỐNG',
    paragraphs: [
      '123English tiếp tục mở rộng quy mô hoạt động và hoàn thiện hệ thống đào tạo.',
      'Các chương trình học được phát triển theo nhiều nhu cầu khác nhau, từ xây dựng nền tảng đến giao tiếp thực tế và phát triển năng lực tiếng Anh chuyên sâu.',
      'Đồng thời, hệ thống công nghệ, đội ngũ và quy trình vận hành tiếp tục được đầu tư để tạo ra một trải nghiệm học tập nhất quán và có khả năng mở rộng.',
    ],
    points: [
      'Build better.',
      'Learn further.',
      'Grow together.',
    ],
  },
  {
    year: '2026',
    era: 'THE WORLD',
    title: 'KẾT NỐI VỚI THỊ TRƯỜNG QUỐC TẾ',
    paragraphs: [
      '123English bắt đầu bước vào giai đoạn phát triển mới.',
      'Không chỉ xây dựng một hệ thống dành cho người học trong nước, 123English hướng tới việc kết nối với thị trường quốc tế.',
    ],
    points: [
      'Kết nối người học với giáo viên.',
      'Kết nối kiến thức với cơ hội.',
      'Kết nối những con người khác nhau bằng một ngôn ngữ chung.',
    ],
    closing: 'Bởi vì hành trình học tiếng Anh không kết thúc khi người học hoàn thành một khóa học. Nó bắt đầu khi người học có thể sử dụng tiếng Anh để đi xa hơn.',
  },
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
          <text x="508" y="414" textAnchor="middle">Việt Nam</text>
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
          <text x="643" y="304">QUẦN ĐẢO</text>
          <text x="643" y="321">HOÀNG SA</text>
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

      <section className="national-section national-section-timeline">
        <div className="national-container">
          <div className="national-heading national-heading-centered">
            <span className="national-kicker">
              <Sparkles className="h-4 w-4" />
              Hành trình phát triển
            </span>
            <h2>MỘT HÀNH TRÌNH.<br />NHIỀU CỘT MỐC.</h2>
            <p>
              Từ một ý tưởng ban đầu đến một hệ thống giáo dục hướng tới thị trường quốc tế.
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
                    <strong>{leftMilestone.year} — {leftMilestone.era}</strong>
                    <h3>{leftMilestone.title}</h3>
                    {leftMilestone.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    {'points' in leftMilestone && leftMilestone.points && (
                      <ul>
                        {leftMilestone.points.map((point) => <li key={point}>{point}</li>)}
                      </ul>
                    )}
                    {'closing' in leftMilestone && leftMilestone.closing && <p>{leftMilestone.closing}</p>}
                  </article>
                  <span className="national-timeline-dot" aria-hidden="true" />
                  {rightMilestone && (
                    <article className="national-timeline-item">
                      <strong>{rightMilestone.year} — {rightMilestone.era}</strong>
                      <h3>{rightMilestone.title}</h3>
                      {rightMilestone.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                      {'points' in rightMilestone && rightMilestone.points && (
                        <ul>
                          {rightMilestone.points.map((point) => <li key={point}>{point}</li>)}
                        </ul>
                      )}
                      {'closing' in rightMilestone && rightMilestone.closing && <p>{rightMilestone.closing}</p>}
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
