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
import { Logo } from '@/components/shared/Logo'

const ECOSYSTEM_ITEMS = [
  {
    Icon: BookOpenCheck,
    eyebrow: '123 TEACHING METHOD™',
    title: 'Phương pháp giảng dạy độc quyền 3 bước.',
    copy: 'Tập trung một trọng tâm, tương tác qua hoạt động và thực hành ngay trong lớp.',
    tone: 'blue',
  },
  {
    Icon: Network,
    eyebrow: '123 LEARNING PATH',
    title: 'Lộ trình học tập 9 cấp độ',
    copy: 'Nền tảng • Thực chiến • Bứt phá',
    tone: 'yellow',
  },
  {
    Icon: GraduationCap,
    eyebrow: '123 TEACHERS',
    title: 'Đội ngũ giáo viên đạt chuẩn',
    copy: '60+ giờ đào tạo nội bộ • Trình độ từ B2+',
    tone: 'mint',
  },
  {
    Icon: Cpu,
    eyebrow: '123 LEARNING TECHNOLOGY',
    title: 'Công nghệ hỗ trợ học tập',
    copy: 'Theo dõi tiến độ • Cá nhân hóa trải nghiệm',
    tone: 'rose',
  },
  {
    Icon: BadgeCheck,
    eyebrow: '123 QUALITY VERIFICATION',
    title: 'Kiểm định chất lượng học tập',
    copy: 'Theo dõi, phản hồi và cải thiện chất lượng qua từng buổi học.',
    tone: 'blue',
  },
  {
    Icon: BriefcaseBusiness,
    eyebrow: '123 BUSINESS SOLUTIONS',
    title: 'Đào tạo cho doanh nghiệp',
    copy: 'Chương trình được thiết kế theo nhu cầu thực tế của từng tổ chức.',
    tone: 'yellow',
  },
] as const

const MAP_WIDTH = 1010
const MAP_HEIGHT = 666

function projectCoordinates(latitude: number, longitude: number) {
  return {
    x: ((longitude + 180) / 360) * MAP_WIDTH,
    y: ((90 - latitude) / 180) * MAP_HEIGHT,
  }
}

const DESTINATIONS = [
  { name: 'Nhật Bản', city: 'Tokyo', latitude: 35.6762, longitude: 139.6503, labelDx: -18, labelDy: -10, anchor: 'end' },
  { name: 'Hàn Quốc', city: 'Seoul', latitude: 37.5665, longitude: 126.978, labelDx: -18, labelDy: 12, anchor: 'end' },
  { name: 'Trung Quốc', city: 'Bắc Kinh', latitude: 39.9042, longitude: 116.4074, labelDx: -18, labelDy: -12, anchor: 'end' },
  { name: 'Đài Loan', city: 'Đài Bắc', latitude: 25.033, longitude: 121.5654, labelDx: 18, labelDy: -8, anchor: 'start' },
  { name: 'Hồng Kông', city: 'Hồng Kông', latitude: 22.3193, longitude: 114.1694, labelDx: -18, labelDy: 18, anchor: 'end' },
  { name: 'Thái Lan', city: 'Bangkok', latitude: 13.7563, longitude: 100.5018, labelDx: 18, labelDy: 20, anchor: 'start' },
  { name: 'Lào', city: 'Viêng Chăn', latitude: 17.9757, longitude: 102.6331, labelDx: -18, labelDy: -15, anchor: 'end' },
  { name: 'Campuchia', city: 'Phnom Penh', latitude: 11.5564, longitude: 104.9282, labelDx: -18, labelDy: 26, anchor: 'end' },
  { name: 'Malaysia', city: 'Kuala Lumpur', latitude: 3.139, longitude: 101.6869, labelDx: 18, labelDy: 12, anchor: 'start' },
  { name: 'Indonesia', city: 'Jakarta', latitude: -6.2088, longitude: 106.8456, labelDx: 18, labelDy: 20, anchor: 'start' },
  { name: 'Nga', city: 'Moscow', latitude: 55.7558, longitude: 37.6173, labelDx: 18, labelDy: -6, anchor: 'start' },
  { name: 'Pháp', city: 'Paris', latitude: 48.8566, longitude: 2.3522, labelDx: -18, labelDy: -8, anchor: 'end' },
  { name: 'Tây Ban Nha', city: 'Madrid', latitude: 40.4168, longitude: -3.7038, labelDx: -18, labelDy: 22, anchor: 'end' },
  { name: 'Cộng hòa Séc', city: 'Prague', latitude: 50.0755, longitude: 14.4378, labelDx: 18, labelDy: -9, anchor: 'start' },
].map((destination) => ({ ...destination, ...projectCoordinates(destination.latitude, destination.longitude) }))

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
          const textX = destination.x + destination.labelDx
          const textY = destination.y + destination.labelDy
          return (
            <g key={destination.name} className="national-map-destination" style={{ animationDelay: `${index * 0.12}s` }}>
              <circle cx={destination.x} cy={destination.y} r="6" />
              <circle className="national-map-pulse" cx={destination.x} cy={destination.y} r="12" />
              <text x={textX} y={textY} textAnchor={destination.anchor as 'start' | 'end'}>
                {destination.name}
              </text>
              <text className="national-map-city" x={textX} y={textY + 15} textAnchor={destination.anchor as 'start' | 'end'}>
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
              123 ENGLISH ECOSYSTEM
            </span>
            <h2>Một hệ sinh thái.<br />Nhiều hành trình học tập.</h2>
            <p>
              Phương pháp, lộ trình, giáo viên và công nghệ được kết nối trong một trải nghiệm thống nhất.
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
          <div className="national-milestones-intro">
            <div className="national-milestones-title">
              <span className="national-kicker">
                <Award className="h-4 w-4" />
                Dấu ấn được ghi nhận
              </span>
              <h2>
                NHỮNG CỘT MỐC
                <br />
                ĐÁNG NHỚ.
              </h2>
            </div>

            <div className="national-milestones-copy">
              <p>
                Mỗi giải thưởng, chứng nhận hay cột mốc đều là sự ghi nhận cho một chặng đường đã đi qua.
              </p>
              <p>
                Nhưng với 123English, thành tựu lớn nhất không chỉ nằm ở những con số.
              </p>
              <p className="national-milestones-lead">Đó là khi một học viên:</p>
              <ul>
                <li>Dám nói câu tiếng Anh đầu tiên.</li>
                <li>Có thể giao tiếp tự tin hơn.</li>
                <li>Vượt qua nỗi sợ mắc lỗi.</li>
                <li>Đạt được mục tiêu học tập.</li>
                <li>Mở ra một cơ hội mới cho bản thân.</li>
              </ul>
              <strong>
                EVERY MILESTONE
                <br />
                MOVES US FORWARD.
              </strong>
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
